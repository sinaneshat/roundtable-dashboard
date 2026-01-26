/**
 * Background Stream Execution Service
 *
 * Core execution logic for robust streaming resumption system.
 * All AI streaming runs via queue, decoupled from client request.
 *
 * **ARCHITECTURE**:
 * - Database as source of truth: All state persisted to round_execution table
 * - KV is resumption hint only: Used for chunk buffering and fast lookups
 * - Idempotent operations: Re-triggering same round/participant is safe
 * - Self-healing: Scheduled recovery detects and retries stalled rounds
 *
 * Status Flow:
 * pending → pre_search → participants → moderator → completed
 *     ↓         ↓            ↓            ↓
 *   failed    failed       failed       failed
 *
 * @module api/services/streaming/background-stream-execution
 */

import {
  RoundExecutionTableStatuses,
  RoundOrchestrationMessageTypes,
} from '@roundtable/shared/enums';
import { and, eq } from 'drizzle-orm';
import * as z from 'zod';

import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ApiEnv } from '@/types';
import type { TypedLogger } from '@/types/logger';
import { LogHelpers } from '@/types/logger';
import type { FinalizeRoundQueueMessage, RecoverRoundQueueMessage } from '@/types/queues';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Maximum retry attempts before marking execution as failed */
const MAX_RETRY_ATTEMPTS = 3;

/** Stale timeout in milliseconds (30 seconds - Cloudflare worker limit) */
const STALE_TIMEOUT_MS = 30_000;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type DbClient = Awaited<ReturnType<typeof getDbAsync>>;

/** Round execution record from database */
export const RoundExecutionRecordSchema = z.object({
  attempts: z.number(),
  createdAt: z.date(),
  errorMessage: z.string().nullable(),
  id: z.string(),
  lastAttemptAt: z.date().nullable(),
  moderatorCompletedAt: z.date().nullable(),
  participantsCompleted: z.number(),
  participantsTotal: z.number(),
  preSearchCompletedAt: z.date().nullable(),
  roundNumber: z.number(),
  status: z.enum([
    RoundExecutionTableStatuses.PENDING,
    RoundExecutionTableStatuses.PRE_SEARCH,
    RoundExecutionTableStatuses.PARTICIPANTS,
    RoundExecutionTableStatuses.MODERATOR,
    RoundExecutionTableStatuses.COMPLETED,
    RoundExecutionTableStatuses.FAILED,
  ]),
  threadId: z.string(),
  updatedAt: z.date(),
  userId: z.string(),
});

export type RoundExecutionRecord = z.infer<typeof RoundExecutionRecordSchema>;

/** Parameters for executing a round */
export const ExecuteRoundParamsSchema = z.object({
  attachmentIds: z.array(z.string()).optional(),
  db: z.custom<DbClient>(),
  env: z.custom<ApiEnv['Bindings']>(),
  logger: z.custom<TypedLogger>().optional(),
  queue: z.custom<Queue<unknown>>(),
  roundNumber: z.number(),
  sessionToken: z.string(),
  threadId: z.string(),
  userId: z.string(),
  userQuery: z.string().optional(),
});

export type ExecuteRoundParams = z.infer<typeof ExecuteRoundParamsSchema>;

// ============================================================================
// EXECUTION RECORD MANAGEMENT
// ============================================================================

/**
 * Get or create an execution record for a round
 * Idempotent: returns existing record if already exists
 */
export async function getOrCreateExecution(
  db: DbClient,
  threadId: string,
  roundNumber: number,
  userId: string,
  participantsTotal: number,
  logger?: TypedLogger,
): Promise<RoundExecutionRecord> {
  // Try to find existing execution
  const existing = await db.query.roundExecution.findFirst({
    where: and(
      eq(tables.roundExecution.threadId, threadId),
      eq(tables.roundExecution.roundNumber, roundNumber),
    ),
  });

  if (existing) {
    logger?.info('Found existing round execution', LogHelpers.operation({
      executionId: existing.id,
      operationName: 'getOrCreateExecution',
      roundNumber,
      status: existing.status,
      threadId,
    }));
    return existing as RoundExecutionRecord;
  }

  // Create new execution record
  const executionId = `exec_${threadId}_r${roundNumber}_${Date.now()}`;

  const [created] = await db.insert(tables.roundExecution).values({
    id: executionId,
    participantsTotal,
    roundNumber,
    threadId,
    userId,
  }).returning();

  logger?.info('Created new round execution', LogHelpers.operation({
    executionId,
    operationName: 'getOrCreateExecution',
    roundNumber,
    threadId,
    totalParticipants: participantsTotal,
  }));

  return created as RoundExecutionRecord;
}

/**
 * Update an execution record
 */
export async function updateExecution(
  db: DbClient,
  executionId: string,
  updates: Partial<{
    attempts: number;
    errorMessage: string | null;
    lastAttemptAt: Date;
    moderatorCompletedAt: Date;
    participantsCompleted: number;
    preSearchCompletedAt: Date;
    status: RoundExecutionRecord['status'];
  }>,
  logger?: TypedLogger,
): Promise<void> {
  await db.update(tables.roundExecution)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(tables.roundExecution.id, executionId));

  logger?.debug('Updated round execution', LogHelpers.operation({
    executionId,
    operationName: 'updateExecution',
    updated: Object.keys(updates).length,
  }));
}

/**
 * Mark execution as failed with error message
 */
export async function markExecutionFailed(
  db: DbClient,
  executionId: string,
  errorMessage: string,
  logger?: TypedLogger,
): Promise<void> {
  await updateExecution(db, executionId, {
    errorMessage,
    status: RoundExecutionTableStatuses.FAILED,
  }, logger);

  logger?.error('Marked execution as failed', LogHelpers.operation({
    errorMessage,
    executionId,
    operationName: 'markExecutionFailed',
  }));
}

// ============================================================================
// QUEUE HELPERS
// ============================================================================

/**
 * Queue a RECOVER_ROUND message for retry
 */
export async function queueRecoverRound(
  queue: Queue<unknown>,
  execution: RoundExecutionRecord,
  sessionToken: string,
  logger?: TypedLogger,
): Promise<void> {
  const message: RecoverRoundQueueMessage = {
    executionId: execution.id,
    messageId: `recover-${execution.id}-${Date.now()}`,
    queuedAt: new Date().toISOString(),
    roundNumber: execution.roundNumber,
    sessionToken,
    threadId: execution.threadId,
    type: RoundOrchestrationMessageTypes.RECOVER_ROUND,
    userId: execution.userId,
  };

  await queue.send(message);

  logger?.info('Queued RECOVER_ROUND message', LogHelpers.operation({
    executionId: execution.id,
    operationName: 'queueRecoverRound',
    roundNumber: execution.roundNumber,
    threadId: execution.threadId,
  }));
}

/**
 * Queue a FINALIZE_ROUND message for cleanup
 */
export async function queueFinalizeRound(
  queue: Queue<unknown>,
  execution: RoundExecutionRecord,
  logger?: TypedLogger,
): Promise<void> {
  const message: FinalizeRoundQueueMessage = {
    executionId: execution.id,
    messageId: `finalize-${execution.id}-${Date.now()}`,
    queuedAt: new Date().toISOString(),
    roundNumber: execution.roundNumber,
    threadId: execution.threadId,
    type: RoundOrchestrationMessageTypes.FINALIZE_ROUND,
  };

  await queue.send(message);

  logger?.info('Queued FINALIZE_ROUND message', LogHelpers.operation({
    executionId: execution.id,
    operationName: 'queueFinalizeRound',
    roundNumber: execution.roundNumber,
    threadId: execution.threadId,
  }));
}

/**
 * Queue a TRIGGER_PARTICIPANT message
 */
export async function queueTriggerParticipant(
  queue: Queue<unknown>,
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  userId: string,
  sessionToken: string,
  attachmentIds?: string[],
  logger?: TypedLogger,
): Promise<void> {
  await queue.send({
    attachmentIds,
    messageId: `trigger-${threadId}-r${roundNumber}-p${participantIndex}-${Date.now()}`,
    participantIndex,
    queuedAt: new Date().toISOString(),
    roundNumber,
    sessionToken,
    threadId,
    type: RoundOrchestrationMessageTypes.TRIGGER_PARTICIPANT,
    userId,
  });

  logger?.info('Queued TRIGGER_PARTICIPANT message', LogHelpers.operation({
    operationName: 'queueTriggerParticipant',
    participantIndex,
    roundNumber,
    threadId,
  }));
}

/**
 * Queue a TRIGGER_MODERATOR message
 */
export async function queueTriggerModerator(
  queue: Queue<unknown>,
  threadId: string,
  roundNumber: number,
  userId: string,
  sessionToken: string,
  logger?: TypedLogger,
): Promise<void> {
  await queue.send({
    messageId: `trigger-${threadId}-r${roundNumber}-moderator-${Date.now()}`,
    queuedAt: new Date().toISOString(),
    roundNumber,
    sessionToken,
    threadId,
    type: RoundOrchestrationMessageTypes.TRIGGER_MODERATOR,
    userId,
  });

  logger?.info('Queued TRIGGER_MODERATOR message', LogHelpers.operation({
    operationName: 'queueTriggerModerator',
    roundNumber,
    threadId,
  }));
}

/**
 * Queue a TRIGGER_PRE_SEARCH message
 */
export async function queueTriggerPreSearch(
  queue: Queue<unknown>,
  threadId: string,
  roundNumber: number,
  userId: string,
  sessionToken: string,
  userQuery: string,
  attachmentIds?: string[],
  logger?: TypedLogger,
): Promise<void> {
  await queue.send({
    attachmentIds,
    messageId: `trigger-${threadId}-r${roundNumber}-presearch-${Date.now()}`,
    queuedAt: new Date().toISOString(),
    roundNumber,
    sessionToken,
    threadId,
    type: RoundOrchestrationMessageTypes.TRIGGER_PRE_SEARCH,
    userId,
    userQuery,
  });

  logger?.info('Queued TRIGGER_PRE_SEARCH message', LogHelpers.operation({
    operationName: 'queueTriggerPreSearch',
    roundNumber,
    threadId,
  }));
}

// ============================================================================
// MAIN EXECUTION LOGIC
// ============================================================================

/**
 * Execute a round based on current execution state
 *
 * This is the main entry point called by queue consumers.
 * Handles state machine transitions: pending → pre_search → participants → moderator → completed
 */
export async function executeRound(params: ExecuteRoundParams): Promise<void> {
  const {
    db,
    logger,
    roundNumber,
    threadId,
    userId,
  } = params;

  // 1. Get thread and participants
  const thread = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.id, threadId),
  });

  if (!thread) {
    logger?.error('Thread not found', LogHelpers.operation({
      operationName: 'executeRound',
      roundNumber,
      threadId,
    }));
    return;
  }

  const participants = await db.query.chatParticipant.findMany({
    orderBy: (p, { asc }) => [asc(p.priority)],
    where: and(
      eq(tables.chatParticipant.threadId, threadId),
      eq(tables.chatParticipant.isEnabled, true),
    ),
  });

  const participantsTotal = participants.length;

  // 2. Get or create execution record
  const execution = await getOrCreateExecution(
    db,
    threadId,
    roundNumber,
    userId,
    participantsTotal,
    logger,
  );

  // 3. Execute based on current status
  switch (execution.status) {
    case RoundExecutionTableStatuses.PENDING:
      await executePendingPhase(execution, thread, params, logger);
      break;

    case RoundExecutionTableStatuses.PRE_SEARCH:
      // Pre-search in progress, will be handled by pre-search handler
      logger?.info('Pre-search in progress', LogHelpers.operation({
        executionId: execution.id,
        operationName: 'executeRound',
      }));
      break;

    case RoundExecutionTableStatuses.PARTICIPANTS:
      await executeParticipantsPhase(execution, participants.length, params, logger);
      break;

    case RoundExecutionTableStatuses.MODERATOR:
      await executeModeratorPhase(execution, participantsTotal, params, logger);
      break;

    case RoundExecutionTableStatuses.COMPLETED:
      logger?.info('Round already completed', LogHelpers.operation({
        executionId: execution.id,
        operationName: 'executeRound',
      }));
      break;

    case RoundExecutionTableStatuses.FAILED:
      logger?.warn('Round already failed', LogHelpers.operation({
        errorMessage: execution.errorMessage ?? undefined,
        executionId: execution.id,
        operationName: 'executeRound',
      }));
      break;
  }
}

/**
 * Handle pending phase: decide whether to start pre-search or go directly to participants
 */
async function executePendingPhase(
  execution: RoundExecutionRecord,
  thread: { enableWebSearch: boolean },
  params: ExecuteRoundParams,
  logger?: TypedLogger,
): Promise<void> {
  const { attachmentIds, db, queue, roundNumber, sessionToken, threadId, userId, userQuery } = params;

  // Update attempt tracking
  await updateExecution(db, execution.id, {
    attempts: execution.attempts + 1,
    lastAttemptAt: new Date(),
  }, logger);

  if (thread.enableWebSearch && userQuery) {
    // Transition to pre_search phase
    await updateExecution(db, execution.id, {
      status: RoundExecutionTableStatuses.PRE_SEARCH,
    }, logger);

    // Queue pre-search
    await queueTriggerPreSearch(queue, threadId, roundNumber, userId, sessionToken, userQuery, attachmentIds, logger);

    logger?.info('Transitioning to pre-search phase', LogHelpers.operation({
      executionId: execution.id,
      operationName: 'executePendingPhase',
    }));
  } else {
    // Skip pre-search, go directly to participants
    await updateExecution(db, execution.id, {
      status: RoundExecutionTableStatuses.PARTICIPANTS,
    }, logger);

    // Queue first participant
    await queueTriggerParticipant(queue, threadId, roundNumber, 0, userId, sessionToken, attachmentIds, logger);

    logger?.info('Skipping pre-search, starting participants', LogHelpers.operation({
      executionId: execution.id,
      operationName: 'executePendingPhase',
    }));
  }
}

/**
 * Handle participants phase: execute remaining participants
 */
async function executeParticipantsPhase(
  execution: RoundExecutionRecord,
  totalParticipants: number,
  params: ExecuteRoundParams,
  logger?: TypedLogger,
): Promise<void> {
  const { attachmentIds, db, queue, roundNumber, sessionToken, threadId, userId } = params;

  // Check if all participants completed
  if (execution.participantsCompleted >= totalParticipants) {
    // All participants done, transition to moderator
    await updateExecution(db, execution.id, {
      status: RoundExecutionTableStatuses.MODERATOR,
    }, logger);

    // Only trigger moderator if multiple participants
    if (totalParticipants >= 2) {
      await queueTriggerModerator(queue, threadId, roundNumber, userId, sessionToken, logger);
    } else {
      // Single participant, skip moderator and complete
      await updateExecution(db, execution.id, {
        status: RoundExecutionTableStatuses.COMPLETED,
      }, logger);
    }

    logger?.info('All participants completed', LogHelpers.operation({
      executionId: execution.id,
      operationName: 'executeParticipantsPhase',
      totalParticipants,
    }));
    return;
  }

  // Queue next participant
  const nextParticipantIndex = execution.participantsCompleted;
  await queueTriggerParticipant(queue, threadId, roundNumber, nextParticipantIndex, userId, sessionToken, attachmentIds, logger);

  logger?.info('Queued next participant', LogHelpers.operation({
    completedParticipants: execution.participantsCompleted,
    executionId: execution.id,
    operationName: 'executeParticipantsPhase',
    participantIndex: nextParticipantIndex,
    totalParticipants,
  }));
}

/**
 * Handle moderator phase: trigger moderator if not completed
 */
async function executeModeratorPhase(
  execution: RoundExecutionRecord,
  totalParticipants: number,
  params: ExecuteRoundParams,
  logger?: TypedLogger,
): Promise<void> {
  const { db, queue, roundNumber, sessionToken, threadId, userId } = params;

  if (execution.moderatorCompletedAt) {
    // Moderator already completed, finalize
    await updateExecution(db, execution.id, {
      status: RoundExecutionTableStatuses.COMPLETED,
    }, logger);

    await queueFinalizeRound(queue, execution, logger);

    logger?.info('Moderator already completed, finalizing', LogHelpers.operation({
      executionId: execution.id,
      operationName: 'executeModeratorPhase',
    }));
    return;
  }

  // Skip moderator if single participant
  if (totalParticipants < 2) {
    await updateExecution(db, execution.id, {
      status: RoundExecutionTableStatuses.COMPLETED,
    }, logger);

    await queueFinalizeRound(queue, execution, logger);

    logger?.info('Single participant, skipping moderator', LogHelpers.operation({
      executionId: execution.id,
      operationName: 'executeModeratorPhase',
    }));
    return;
  }

  // Trigger moderator
  await queueTriggerModerator(queue, threadId, roundNumber, userId, sessionToken, logger);

  logger?.info('Triggered moderator', LogHelpers.operation({
    executionId: execution.id,
    operationName: 'executeModeratorPhase',
  }));
}

// ============================================================================
// RECOVERY LOGIC
// ============================================================================

/**
 * Recover a stalled round execution
 * Called by RECOVER_ROUND queue message or scheduled cron
 */
export async function recoverRound(
  db: DbClient,
  executionId: string,
  queue: Queue<unknown>,
  sessionToken: string,
  logger?: TypedLogger,
): Promise<void> {
  // Get execution record
  const execution = await db.query.roundExecution.findFirst({
    where: eq(tables.roundExecution.id, executionId),
  }) as RoundExecutionRecord | undefined;

  if (!execution) {
    logger?.error('Execution not found for recovery', LogHelpers.operation({
      executionId,
      operationName: 'recoverRound',
    }));
    return;
  }

  // Check if already completed or failed
  if (
    execution.status === RoundExecutionTableStatuses.COMPLETED
    || execution.status === RoundExecutionTableStatuses.FAILED
  ) {
    logger?.info('Execution already terminal, skipping recovery', LogHelpers.operation({
      executionId,
      operationName: 'recoverRound',
      status: execution.status,
    }));
    return;
  }

  // Check retry limit
  if (execution.attempts >= MAX_RETRY_ATTEMPTS) {
    await markExecutionFailed(db, executionId, 'Max retry attempts exceeded', logger);
    return;
  }

  // Get thread for context
  const thread = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.id, execution.threadId),
  });

  if (!thread) {
    await markExecutionFailed(db, executionId, 'Thread not found', logger);
    return;
  }

  // Update attempt counter
  await updateExecution(db, executionId, {
    attempts: execution.attempts + 1,
    lastAttemptAt: new Date(),
  }, logger);

  // Re-execute based on current state
  await executeRound({
    db,
    env: {} as ApiEnv['Bindings'], // Will be passed by caller
    logger,
    queue,
    roundNumber: execution.roundNumber,
    sessionToken,
    threadId: execution.threadId,
    userId: execution.userId,
  });

  logger?.info('Initiated recovery for round execution', LogHelpers.operation({
    executionId,
    operationName: 'recoverRound',
    retriesAttempted: execution.attempts + 1,
    status: execution.status,
  }));
}

// ============================================================================
// FINALIZATION LOGIC
// ============================================================================

/**
 * Finalize a completed round
 * Cleans up KV state, updates cache invalidation, etc.
 */
export async function finalizeRound(
  db: DbClient,
  executionId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  const execution = await db.query.roundExecution.findFirst({
    where: eq(tables.roundExecution.id, executionId),
  }) as RoundExecutionRecord | undefined;

  if (!execution) {
    logger?.error('Execution not found for finalization', LogHelpers.operation({
      executionId,
      operationName: 'finalizeRound',
    }));
    return;
  }

  // Mark as completed if not already
  if (execution.status !== RoundExecutionTableStatuses.COMPLETED) {
    await updateExecution(db, executionId, {
      status: RoundExecutionTableStatuses.COMPLETED,
    }, logger);
  }

  // Clean up KV state (optional - KV has TTL anyway)
  if (env?.KV) {
    const kvKey = `round:execution:${execution.threadId}:r${execution.roundNumber}`;
    try {
      await env.KV.delete(kvKey);
      logger?.debug('Cleaned up KV state', LogHelpers.operation({
        executionId,
        operationName: 'finalizeRound',
        threadId: execution.threadId,
      }));
    } catch {
      // Non-critical, KV will expire anyway
    }
  }

  logger?.info('Finalized round execution', LogHelpers.operation({
    executionId,
    operationName: 'finalizeRound',
    roundNumber: execution.roundNumber,
    threadId: execution.threadId,
  }));
}

// ============================================================================
// PARTICIPANT COMPLETION TRACKING
// ============================================================================

/**
 * Mark a participant as completed in the execution record
 * Called by streaming handler when participant stream completes
 */
export async function markParticipantCompletedInExecution(
  db: DbClient,
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  queue: Queue<unknown>,
  sessionToken: string,
  logger?: TypedLogger,
): Promise<void> {
  // Find execution record
  const execution = await db.query.roundExecution.findFirst({
    where: and(
      eq(tables.roundExecution.threadId, threadId),
      eq(tables.roundExecution.roundNumber, roundNumber),
    ),
  }) as RoundExecutionRecord | undefined;

  if (!execution) {
    logger?.warn('No execution record found for participant completion', LogHelpers.operation({
      operationName: 'markParticipantCompletedInExecution',
      participantIndex,
      roundNumber,
      threadId,
    }));
    return;
  }

  // Update participants completed count
  const newCompletedCount = execution.participantsCompleted + 1;

  await updateExecution(db, execution.id, {
    lastAttemptAt: new Date(),
    participantsCompleted: newCompletedCount,
  }, logger);

  logger?.info('Marked participant completed in execution', LogHelpers.operation({
    completedParticipants: newCompletedCount,
    executionId: execution.id,
    operationName: 'markParticipantCompletedInExecution',
    participantIndex,
    totalParticipants: execution.participantsTotal,
  }));

  // Check if all participants completed
  if (newCompletedCount >= execution.participantsTotal) {
    // Transition to moderator phase
    await updateExecution(db, execution.id, {
      status: RoundExecutionTableStatuses.MODERATOR,
    }, logger);

    // Queue moderator if multiple participants
    if (execution.participantsTotal >= 2) {
      await queueTriggerModerator(queue, threadId, roundNumber, execution.userId, sessionToken, logger);
    } else {
      // Single participant, complete round
      await updateExecution(db, execution.id, {
        status: RoundExecutionTableStatuses.COMPLETED,
      }, logger);
      await queueFinalizeRound(queue, execution, logger);
    }
  } else {
    // Queue next participant
    const nextIndex = newCompletedCount;
    await queueTriggerParticipant(queue, threadId, roundNumber, nextIndex, execution.userId, sessionToken, undefined, logger);
  }
}

/**
 * Mark pre-search as completed in the execution record
 */
export async function markPreSearchCompletedInExecution(
  db: DbClient,
  threadId: string,
  roundNumber: number,
  queue: Queue<unknown>,
  sessionToken: string,
  attachmentIds?: string[],
  logger?: TypedLogger,
): Promise<void> {
  // Find execution record
  const execution = await db.query.roundExecution.findFirst({
    where: and(
      eq(tables.roundExecution.threadId, threadId),
      eq(tables.roundExecution.roundNumber, roundNumber),
    ),
  }) as RoundExecutionRecord | undefined;

  if (!execution) {
    logger?.warn('No execution record found for pre-search completion', LogHelpers.operation({
      operationName: 'markPreSearchCompletedInExecution',
      roundNumber,
      threadId,
    }));
    return;
  }

  // Update status
  await updateExecution(db, execution.id, {
    preSearchCompletedAt: new Date(),
    status: RoundExecutionTableStatuses.PARTICIPANTS,
  }, logger);

  // Queue first participant
  await queueTriggerParticipant(queue, threadId, roundNumber, 0, execution.userId, sessionToken, attachmentIds, logger);

  logger?.info('Pre-search completed, starting participants', LogHelpers.operation({
    executionId: execution.id,
    operationName: 'markPreSearchCompletedInExecution',
  }));
}

/**
 * Mark moderator as completed in the execution record
 */
export async function markModeratorCompletedInExecution(
  db: DbClient,
  threadId: string,
  roundNumber: number,
  queue: Queue<unknown>,
  logger?: TypedLogger,
): Promise<void> {
  // Find execution record
  const execution = await db.query.roundExecution.findFirst({
    where: and(
      eq(tables.roundExecution.threadId, threadId),
      eq(tables.roundExecution.roundNumber, roundNumber),
    ),
  }) as RoundExecutionRecord | undefined;

  if (!execution) {
    logger?.warn('No execution record found for moderator completion', LogHelpers.operation({
      operationName: 'markModeratorCompletedInExecution',
      roundNumber,
      threadId,
    }));
    return;
  }

  // Update status
  await updateExecution(db, execution.id, {
    moderatorCompletedAt: new Date(),
    status: RoundExecutionTableStatuses.COMPLETED,
  }, logger);

  // Queue finalization
  await queueFinalizeRound(queue, execution, logger);

  logger?.info('Moderator completed, round finalized', LogHelpers.operation({
    executionId: execution.id,
    operationName: 'markModeratorCompletedInExecution',
  }));
}

// ============================================================================
// STALENESS DETECTION
// ============================================================================

/**
 * Check if an execution record is stale
 */
export function isExecutionStale(execution: RoundExecutionRecord): boolean {
  if (!execution.lastAttemptAt) {
    // No last attempt, check created time
    const createdTime = execution.createdAt.getTime();
    return Date.now() - createdTime > STALE_TIMEOUT_MS;
  }

  const lastAttemptTime = execution.lastAttemptAt.getTime();
  return Date.now() - lastAttemptTime > STALE_TIMEOUT_MS;
}

/**
 * Find all stale executions that need recovery
 */
export async function findStaleExecutions(
  db: DbClient,
  limit = 10,
  logger?: TypedLogger,
): Promise<RoundExecutionRecord[]> {
  // Query for executions that are:
  // 1. Not completed or failed
  // 2. Last attempt was before stale threshold
  // 3. Under max retry attempts
  const staleExecutions = await db.query.roundExecution.findMany({
    limit,
    where: and(
      // Not in terminal states - use SQL comparison
      eq(tables.roundExecution.status, RoundExecutionTableStatuses.PENDING),
    ),
  });

  // Also check other non-terminal states
  const preSearchExecutions = await db.query.roundExecution.findMany({
    limit,
    where: eq(tables.roundExecution.status, RoundExecutionTableStatuses.PRE_SEARCH),
  });

  const participantsExecutions = await db.query.roundExecution.findMany({
    limit,
    where: eq(tables.roundExecution.status, RoundExecutionTableStatuses.PARTICIPANTS),
  });

  const moderatorExecutions = await db.query.roundExecution.findMany({
    limit,
    where: eq(tables.roundExecution.status, RoundExecutionTableStatuses.MODERATOR),
  });

  // Combine and filter for stale ones
  const allNonTerminal = [
    ...staleExecutions,
    ...preSearchExecutions,
    ...participantsExecutions,
    ...moderatorExecutions,
  ];

  const stale = allNonTerminal.filter((exec) => {
    const record = exec as RoundExecutionRecord;
    return isExecutionStale(record) && record.attempts < MAX_RETRY_ATTEMPTS;
  }).slice(0, limit);

  logger?.info(`Found ${stale.length} stale executions`, LogHelpers.operation({
    count: stale.length,
    operationName: 'findStaleExecutions',
  }));

  return stale as RoundExecutionRecord[];
}

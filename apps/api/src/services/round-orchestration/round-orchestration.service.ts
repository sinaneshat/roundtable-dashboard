/**
 * Round Orchestration Service
 *
 * Server-side orchestration of multi-participant chat rounds.
 * Executes all participants and moderator in the background, independent of client connection.
 *
 * **ARCHITECTURE**: Solves the "user navigates away" problem
 * - Frontend calls POST /execute to start round
 * - Backend orchestrates ALL participants + moderator via waitUntil()
 * - Client can disconnect - round continues in background
 * - Client polls GET /status for progress
 * - Client reconnects to streams for real-time UI updates
 *
 * @module api/services/round-orchestration
 */

import { MessageRoles, ParticipantStreamStatuses, RoundExecutionPhases, RoundExecutionStatuses } from '@roundtable/shared/enums';
import { and, eq } from 'drizzle-orm';
import * as z from 'zod';

import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ChatMessage, ChatParticipant, ChatThread } from '@/db/validation';
import { rlog } from '@/lib/utils/dev-logger';
import type { ApiEnv } from '@/types';
import type { TypedLogger } from '@/types/logger';
import { LogHelpers } from '@/types/logger';

import { getThreadActiveStream } from '../streaming';

// ============================================================================
// ZOD SCHEMAS - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * Pre-search status values (extends ParticipantStreamStatuses with SKIPPED)
 * Reuses core enum to avoid duplication: pending, active, completed, failed from ParticipantStreamStatuses
 * RUNNING maps to ACTIVE from core enum for semantic consistency
 */
export const RoundPreSearchStatuses = {
  COMPLETED: ParticipantStreamStatuses.COMPLETED,
  FAILED: ParticipantStreamStatuses.FAILED,
  PENDING: ParticipantStreamStatuses.PENDING,
  RUNNING: ParticipantStreamStatuses.ACTIVE,
  SKIPPED: 'skipped' as const,
} as const;

export type RoundPreSearchStatus = typeof RoundPreSearchStatuses[keyof typeof RoundPreSearchStatuses];

/** Default max recovery attempts to prevent infinite loops */
const DEFAULT_MAX_RECOVERY_ATTEMPTS = 3;

export const RoundExecutionStateSchema = z.object({
  // Attachment IDs shared across all participants
  attachmentIds: z.array(z.string()).optional(),
  completedAt: z.string().nullable(),
  completedParticipants: z.number().int().nonnegative(),
  error: z.string().nullable(),
  failedParticipants: z.number().int().nonnegative(),
  // =========================================================================
  // NEW: Activity tracking for staleness detection
  // =========================================================================
  /** ISO timestamp of last meaningful activity (chunk received, status update, etc.) */
  lastActivityAt: z.string().optional(),
  /** Maximum recovery attempts allowed (default: 3) */
  maxRecoveryAttempts: z.number().int().positive().default(DEFAULT_MAX_RECOVERY_ATTEMPTS),
  moderatorStatus: z.nativeEnum(ParticipantStreamStatuses).nullable(),
  participantStatuses: z.record(z.string(), z.nativeEnum(ParticipantStreamStatuses)),
  phase: z.nativeEnum(RoundExecutionPhases),
  /** Pre-search database record ID (if created) */
  preSearchId: z.string().nullable().optional(),
  // =========================================================================
  // NEW: Pre-search tracking for web search enabled threads
  // =========================================================================
  /** Pre-search status: pending, running, completed, failed, skipped, or null if not applicable */
  preSearchStatus: z.enum([
    RoundPreSearchStatuses.PENDING,
    RoundPreSearchStatuses.RUNNING,
    RoundPreSearchStatuses.COMPLETED,
    RoundPreSearchStatuses.FAILED,
    RoundPreSearchStatuses.SKIPPED,
  ]).nullable().optional(),
  // =========================================================================
  // NEW: Recovery tracking to prevent infinite loops
  // =========================================================================
  /** Number of recovery attempts made for this round */
  recoveryAttempts: z.number().int().nonnegative().default(0),
  roundNumber: z.number().int().nonnegative(),

  startedAt: z.string(),
  status: z.nativeEnum(RoundExecutionStatuses),

  threadId: z.string().min(1),

  totalParticipants: z.number().int().nonnegative(),
  // Track which participants have been triggered (for resumption)
  triggeredParticipants: z.array(z.number()),
}).strict();

export type RoundExecutionState = z.infer<typeof RoundExecutionStateSchema>;

export const StartRoundExecutionParamsSchema = z.object({
  attachmentIds: z.array(z.string()).optional(),
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(),
  env: z.custom<ApiEnv['Bindings']>(),
  executionCtx: z.custom<ExecutionContext>().optional(),
  logger: z.custom<TypedLogger>().optional(),
  participants: z.array(z.custom<ChatParticipant>()),
  roundNumber: z.number().int().nonnegative(),
  thread: z.custom<ChatThread>(),
  threadId: z.string().min(1),
  userId: z.string().min(1),
  userMessage: z.custom<ChatMessage>(),
});

export type StartRoundExecutionParams = z.infer<typeof StartRoundExecutionParamsSchema>;

export const GetRoundStatusParamsSchema = z.object({
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(),
  env: z.custom<ApiEnv['Bindings']>(),
  logger: z.custom<TypedLogger>().optional(),
  roundNumber: z.number().int().nonnegative(),
  threadId: z.string().min(1),
});

export type GetRoundStatusParams = z.infer<typeof GetRoundStatusParamsSchema>;

// ============================================================================
// KV KEY HELPERS
// ============================================================================

const ROUND_STATE_TTL = 60 * 60; // 1 hour

function getRoundExecutionKey(threadId: string, roundNumber: number): string {
  return `round:execution:${threadId}:r${roundNumber}`;
}

// ============================================================================
// ROUND STATE MANAGEMENT
// ============================================================================

/**
 * Initialize round execution state in KV
 */
export async function initializeRoundExecution(
  threadId: string,
  roundNumber: number,
  totalParticipants: number,
  attachmentIds: string[] | undefined,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
  options?: {
    /** Whether web search is enabled for this thread */
    enableWebSearch?: boolean;
    /** Pre-search ID if already created */
    preSearchId?: string;
  },
): Promise<RoundExecutionState> {
  const now = new Date().toISOString();
  const state: RoundExecutionState = {
    attachmentIds,
    completedAt: null,
    completedParticipants: 0,
    error: null,
    failedParticipants: 0,
    // NEW: Activity tracking
    lastActivityAt: now,
    maxRecoveryAttempts: DEFAULT_MAX_RECOVERY_ATTEMPTS,
    moderatorStatus: null,
    participantStatuses: {},
    phase: RoundExecutionPhases.PARTICIPANTS,
    preSearchId: options?.preSearchId ?? null,
    // NEW: Pre-search tracking
    preSearchStatus: options?.enableWebSearch ? RoundPreSearchStatuses.PENDING : null,
    // NEW: Recovery tracking
    recoveryAttempts: 0,
    roundNumber,
    startedAt: now,
    status: RoundExecutionStatuses.RUNNING,
    threadId,
    totalParticipants,
    triggeredParticipants: [],
  };

  if (env?.KV) {
    await env.KV.put(
      getRoundExecutionKey(threadId, roundNumber),
      JSON.stringify(state),
      { expirationTtl: ROUND_STATE_TTL },
    );

    // ✅ FRAME 2/8: Round initialized - all placeholders appear
    const isRound1 = roundNumber === 0;
    if (isRound1) {
      rlog.frame(2, 'round-init', `r${roundNumber} pCount=${totalParticipants} tid=${threadId.slice(-8)}`);
    } else {
      rlog.frame(8, 'round-init', `r${roundNumber} pCount=${totalParticipants} hasPreSearch=${!!options?.enableWebSearch}`);
    }

    logger?.info('Initialized round execution state', LogHelpers.operation({
      operationName: 'initializeRoundExecution',
      roundNumber,
      threadId,
      totalParticipants,
    }));
  }

  return state;
}

/**
 * Get current round execution state from KV
 */
export async function getRoundExecutionState(
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<RoundExecutionState | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const raw = await env.KV.get(getRoundExecutionKey(threadId, roundNumber), 'json');
    if (!raw) {
      return null;
    }

    const parsed = RoundExecutionStateSchema.safeParse(raw);
    if (!parsed.success) {
      logger?.warn('Invalid round execution state in KV', LogHelpers.operation({
        error: parsed.error.message,
        operationName: 'getRoundExecutionState',
        roundNumber,
        threadId,
      }));
      return null;
    }

    return parsed.data;
  } catch (error) {
    logger?.error('Failed to get round execution state', LogHelpers.operation({
      error: error instanceof Error ? error.message : 'Unknown error',
      operationName: 'getRoundExecutionState',
      roundNumber,
      threadId,
    }));
    return null;
  }
}

/**
 * Update round execution state in KV
 */
export async function updateRoundExecutionState(
  threadId: string,
  roundNumber: number,
  updates: Partial<RoundExecutionState>,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<RoundExecutionState | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const existing = await getRoundExecutionState(threadId, roundNumber, env);
    if (!existing) {
      logger?.warn('No existing round execution state to update', LogHelpers.operation({
        operationName: 'updateRoundExecutionState',
        roundNumber,
        threadId,
      }));
      return null;
    }

    // ✅ FIX: Merge participantStatuses instead of replacing to prevent race conditions
    // When multiple participants complete simultaneously, each reads the old state and
    // updates their own status. Without merging, the last writer wins and loses other
    // participants' statuses. By merging, all statuses are preserved.
    const mergedParticipantStatuses = {
      ...existing.participantStatuses,
      ...(updates.participantStatuses || {}),
    };

    // ✅ FIX: Recompute counts from merged statuses to ensure accuracy
    // This prevents race conditions where two participants both compute count=1
    // and both write count=1, when the actual count should be 2.
    const completedParticipants = Object.values(mergedParticipantStatuses).filter(
      s => s === ParticipantStreamStatuses.COMPLETED,
    ).length;

    const failedParticipants = Object.values(mergedParticipantStatuses).filter(
      s => s === ParticipantStreamStatuses.FAILED,
    ).length;

    // ✅ FIX: Recompute phase based on actual merged state
    const allParticipantsComplete = (completedParticipants + failedParticipants) >= existing.totalParticipants;
    const computedPhase = allParticipantsComplete
      ? RoundExecutionPhases.MODERATOR
      : RoundExecutionPhases.PARTICIPANTS;

    // Build updated state with merged and recomputed values
    const updated: RoundExecutionState = {
      ...existing,
      ...updates,
      completedParticipants,
      failedParticipants,
      participantStatuses: mergedParticipantStatuses,
      // Use computed phase if we're in PARTICIPANTS phase and updating participant statuses
      // Otherwise respect the explicit phase update (e.g., COMPLETE from moderator)
      phase: updates.phase === RoundExecutionPhases.COMPLETE
        ? updates.phase
        : (updates.participantStatuses ? computedPhase : (updates.phase ?? existing.phase)),
    };

    await env.KV.put(
      getRoundExecutionKey(threadId, roundNumber),
      JSON.stringify(updated),
      { expirationTtl: ROUND_STATE_TTL },
    );

    return updated;
  } catch (error) {
    logger?.error('Failed to update round execution state', LogHelpers.operation({
      error: error instanceof Error ? error.message : 'Unknown error',
      operationName: 'updateRoundExecutionState',
      roundNumber,
      threadId,
    }));
    return null;
  }
}

/**
 * Mark a participant as started in round execution
 */
export async function markParticipantStarted(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  const state = await getRoundExecutionState(threadId, roundNumber, env);
  if (!state) {
    return;
  }

  const participantStatuses = { ...state.participantStatuses };
  participantStatuses[participantIndex] = ParticipantStreamStatuses.ACTIVE;

  const triggeredParticipants = [...state.triggeredParticipants];
  if (!triggeredParticipants.includes(participantIndex)) {
    triggeredParticipants.push(participantIndex);
  }

  // ✅ FRAME 3: First participant starts streaming
  const isRound1 = roundNumber === 0;
  if (participantIndex === 0) {
    if (isRound1) {
      rlog.frame(3, 'P0-start', `r${roundNumber} P0 streaming begins, others waiting`);
    } else {
      // Frame 11 for round 2+ (after web research)
      rlog.frame(11, 'P0-start', `r${roundNumber} P0 streaming begins after pre-search`);
    }
  } else {
    rlog.handoff('participant-start', `r${roundNumber} P${participantIndex} streaming begins`);
  }

  await updateRoundExecutionState(threadId, roundNumber, {
    participantStatuses,
    triggeredParticipants,
  }, env, logger);
}

/**
 * Mark a participant as completed in round execution
 */
export async function markParticipantCompleted(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<{ allParticipantsComplete: boolean }> {
  const state = await getRoundExecutionState(threadId, roundNumber, env);
  if (!state) {
    return { allParticipantsComplete: false };
  }

  const participantStatuses = { ...state.participantStatuses };
  participantStatuses[participantIndex] = ParticipantStreamStatuses.COMPLETED;

  const completedParticipants = Object.values(participantStatuses).filter(
    s => s === ParticipantStreamStatuses.COMPLETED,
  ).length;

  const failedParticipants = Object.values(participantStatuses).filter(
    s => s === ParticipantStreamStatuses.FAILED,
  ).length;

  const allParticipantsComplete = (completedParticipants + failedParticipants) >= state.totalParticipants;

  await updateRoundExecutionState(threadId, roundNumber, {
    completedParticipants,
    failedParticipants,
    participantStatuses,
    phase: allParticipantsComplete ? RoundExecutionPhases.MODERATOR : RoundExecutionPhases.PARTICIPANTS,
  }, env, logger);

  // ✅ FRAME 4/5: Participant completion and handoff
  const isRound1 = roundNumber === 0;
  const isLastParticipant = allParticipantsComplete;
  const nextIndex = participantIndex + 1;

  if (isLastParticipant) {
    // Frame 5: All participants complete → moderator starts
    rlog.frame(5, 'all-participants-complete', `r${roundNumber} P${participantIndex} was LAST → phase→MODERATOR`);
  } else {
    // Frame 4: Participant handoff (baton pass)
    if (isRound1) {
      rlog.frame(4, 'participant-handoff', `r${roundNumber} P${participantIndex}→P${nextIndex} (baton passed)`);
    } else {
      rlog.handoff('participant-handoff', `r${roundNumber} P${participantIndex}→P${nextIndex}`);
    }
  }

  logger?.info('Marked participant completed', LogHelpers.operation({
    allParticipantsComplete,
    completedParticipants,
    operationName: 'markParticipantCompleted',
    participantIndex,
    roundNumber,
    threadId,
    totalParticipants: state.totalParticipants,
  }));

  return { allParticipantsComplete };
}

/**
 * Mark a participant as failed in round execution
 */
export async function markParticipantFailed(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  error: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<{ allParticipantsComplete: boolean }> {
  const state = await getRoundExecutionState(threadId, roundNumber, env);
  if (!state) {
    return { allParticipantsComplete: false };
  }

  const participantStatuses = { ...state.participantStatuses };
  participantStatuses[participantIndex] = ParticipantStreamStatuses.FAILED;

  const completedParticipants = Object.values(participantStatuses).filter(
    s => s === ParticipantStreamStatuses.COMPLETED,
  ).length;

  const failedParticipants = Object.values(participantStatuses).filter(
    s => s === ParticipantStreamStatuses.FAILED,
  ).length;

  const allParticipantsComplete = (completedParticipants + failedParticipants) >= state.totalParticipants;

  await updateRoundExecutionState(threadId, roundNumber, {
    completedParticipants,
    // Only set error if all failed or this is a critical error
    error: failedParticipants >= state.totalParticipants ? error : state.error,
    failedParticipants,
    participantStatuses,
    phase: allParticipantsComplete ? RoundExecutionPhases.MODERATOR : RoundExecutionPhases.PARTICIPANTS,
  }, env, logger);

  logger?.warn('Marked participant failed', LogHelpers.operation({
    error,
    failedParticipants,
    operationName: 'markParticipantFailed',
    participantIndex,
    roundNumber,
    threadId,
    totalParticipants: state.totalParticipants,
  }));

  return { allParticipantsComplete };
}

/**
 * Mark moderator as completed
 */
export async function markModeratorCompleted(
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  await updateRoundExecutionState(threadId, roundNumber, {
    completedAt: new Date().toISOString(),
    moderatorStatus: ParticipantStreamStatuses.COMPLETED,
    phase: RoundExecutionPhases.COMPLETE,
    status: RoundExecutionStatuses.COMPLETED,
  }, env, logger);

  // ✅ FRAME 6/12: Round complete
  const isRound1 = roundNumber === 0;
  if (isRound1) {
    rlog.frame(6, 'round-complete', `r${roundNumber} Moderator done → input re-enabled, ready for Round 2`);
  } else {
    rlog.frame(12, 'round-complete', `r${roundNumber} Moderator done → input re-enabled, ready for next round`);
  }

  logger?.info('Marked moderator completed - round execution complete', LogHelpers.operation({
    operationName: 'markModeratorCompleted',
    roundNumber,
    threadId,
  }));
}

/**
 * Mark moderator as failed
 */
export async function markModeratorFailed(
  threadId: string,
  roundNumber: number,
  error: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  await updateRoundExecutionState(threadId, roundNumber, {
    completedAt: new Date().toISOString(),
    error,
    moderatorStatus: ParticipantStreamStatuses.FAILED,
    phase: RoundExecutionPhases.COMPLETE,
    status: RoundExecutionStatuses.COMPLETED, // Still complete, just with moderator failure
  }, env, logger);

  logger?.warn('Marked moderator failed', LogHelpers.operation({
    error,
    operationName: 'markModeratorFailed',
    roundNumber,
    threadId,
  }));
}

/**
 * Mark round execution as failed
 */
export async function markRoundFailed(
  threadId: string,
  roundNumber: number,
  error: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  await updateRoundExecutionState(threadId, roundNumber, {
    completedAt: new Date().toISOString(),
    error,
    status: RoundExecutionStatuses.FAILED,
  }, env, logger);

  logger?.error('Marked round execution as failed', LogHelpers.operation({
    error,
    operationName: 'markRoundFailed',
    roundNumber,
    threadId,
  }));
}

// ============================================================================
// ROUND STATUS COMPUTATION
// ============================================================================

/**
 * Compute round status from database + KV state
 * Used by GET /status endpoint
 */
export async function computeRoundStatus(
  params: GetRoundStatusParams,
): Promise<{
  status: typeof RoundExecutionStatuses[keyof typeof RoundExecutionStatuses];
  phase: typeof RoundExecutionPhases[keyof typeof RoundExecutionPhases];
  totalParticipants: number;
  completedParticipants: number;
  failedParticipants: number;
  participantStatuses: Record<number, typeof ParticipantStreamStatuses[keyof typeof ParticipantStreamStatuses]>;
  moderatorStatus: typeof ParticipantStreamStatuses[keyof typeof ParticipantStreamStatuses] | null;
  hasModeratorMessage: boolean;
  isComplete: boolean;
  error: string | null;
}> {
  const { db, env, logger, roundNumber, threadId } = params;

  // Check KV state first
  const kvState = await getRoundExecutionState(threadId, roundNumber, env, logger);

  // Get participant count from DB
  const participants = await db.query.chatParticipant.findMany({
    columns: { id: true },
    where: and(
      eq(tables.chatParticipant.threadId, threadId),
      eq(tables.chatParticipant.isEnabled, true),
    ),
  });

  const totalParticipants = participants.length;

  // Get messages for this round from DB
  const roundMessages = await db.query.chatMessage.findMany({
    columns: {
      id: true,
      metadata: true,
      participantId: true,
    },
    where: and(
      eq(tables.chatMessage.threadId, threadId),
      eq(tables.chatMessage.roundNumber, roundNumber),
      eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
    ),
  });

  // Count completed participants (messages with participantId)
  const participantMessages = roundMessages.filter(m => m.participantId !== null);
  const completedParticipants = participantMessages.length;

  // Check for moderator message (participantId is null, metadata.isModerator is true)
  const moderatorMessage = roundMessages.find(m =>
    m.participantId === null
    && m.metadata
    && typeof m.metadata === 'object'
    && 'isModerator' in m.metadata
    && m.metadata.isModerator === true,
  );
  const hasModeratorMessage = !!moderatorMessage;

  // Build participant statuses from KV and DB
  const participantStatuses: Record<number, typeof ParticipantStreamStatuses[keyof typeof ParticipantStreamStatuses]> = {};

  if (kvState?.participantStatuses) {
    // Use KV state for in-progress statuses
    for (const [idx, status] of Object.entries(kvState.participantStatuses)) {
      participantStatuses[Number(idx)] = status;
    }
  }

  // Override with DB state (persisted messages = completed)
  for (const msg of participantMessages) {
    // Extract participant index from message ID (format: {threadId}_r{round}_p{index})
    const match = msg.id.match(/_p(\d+)$/);
    if (match?.[1]) {
      const idx = Number.parseInt(match[1], 10);
      participantStatuses[idx] = ParticipantStreamStatuses.COMPLETED;
    }
  }

  // Determine overall status and phase
  // ✅ FIX: Count failed participants as "done" for round completion
  // A participant is "done" if it completed OR failed - both mean it's finished
  const failedCount = Object.values(participantStatuses).filter(
    s => s === ParticipantStreamStatuses.FAILED,
  ).length;
  const allParticipantsComplete = (completedParticipants + failedCount) >= totalParticipants;
  const needsModerator = totalParticipants >= 2 && allParticipantsComplete && !hasModeratorMessage;
  const isComplete = allParticipantsComplete && (totalParticipants < 2 || hasModeratorMessage);

  let status: typeof RoundExecutionStatuses[keyof typeof RoundExecutionStatuses];
  let phase: typeof RoundExecutionPhases[keyof typeof RoundExecutionPhases];
  let moderatorStatus: typeof ParticipantStreamStatuses[keyof typeof ParticipantStreamStatuses] | null = null;

  if (isComplete) {
    status = RoundExecutionStatuses.COMPLETED;
    phase = RoundExecutionPhases.COMPLETE;
    if (hasModeratorMessage) {
      moderatorStatus = ParticipantStreamStatuses.COMPLETED;
    }
  } else if (needsModerator) {
    status = RoundExecutionStatuses.RUNNING;
    phase = RoundExecutionPhases.MODERATOR;
    moderatorStatus = kvState?.moderatorStatus || ParticipantStreamStatuses.PENDING;
  } else if (kvState?.status === RoundExecutionStatuses.RUNNING && kvState) {
    status = RoundExecutionStatuses.RUNNING;
    phase = kvState.phase;
    moderatorStatus = kvState.moderatorStatus;
  } else if (completedParticipants > 0) {
    // Some participants completed but no KV state - round is incomplete
    status = RoundExecutionStatuses.INCOMPLETE;
    phase = RoundExecutionPhases.PARTICIPANTS;
  } else {
    // No participants completed, no KV state - not started
    status = RoundExecutionStatuses.NOT_STARTED;
    phase = RoundExecutionPhases.PARTICIPANTS;
  }

  // Calculate failed participants
  const failedParticipants = Object.values(participantStatuses).filter(
    s => s === ParticipantStreamStatuses.FAILED,
  ).length;

  return {
    completedParticipants,
    error: kvState?.error || null,
    failedParticipants,
    hasModeratorMessage,
    isComplete,
    moderatorStatus,
    participantStatuses,
    phase,
    status,
    totalParticipants,
  };
}

// ============================================================================
// ROUND EXECUTION DETECTION
// ============================================================================

/**
 * Check if a round execution is already in progress
 * Returns the existing state if found, or null if not running
 */
export async function getExistingRoundExecution(
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<RoundExecutionState | null> {
  const state = await getRoundExecutionState(threadId, roundNumber, env, logger);

  if (!state) {
    return null;
  }

  // Only return if still running
  if (state.status === RoundExecutionStatuses.RUNNING) {
    return state;
  }

  return null;
}

/**
 * Get incomplete participants that need to be triggered
 * Used for resuming incomplete rounds
 */
export async function getIncompleteParticipants(
  threadId: string,
  roundNumber: number,
  totalParticipants: number,
  env: ApiEnv['Bindings'],
  db: Awaited<ReturnType<typeof getDbAsync>>,
  logger?: TypedLogger,
): Promise<number[]> {
  // Get completed participant indices from DB
  const roundMessages = await db.query.chatMessage.findMany({
    columns: {
      id: true,
      participantId: true,
    },
    where: and(
      eq(tables.chatMessage.threadId, threadId),
      eq(tables.chatMessage.roundNumber, roundNumber),
      eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
    ),
  });

  const completedIndices = new Set<number>();

  for (const msg of roundMessages) {
    if (msg.participantId) {
      // Extract participant index from message ID (format: {threadId}_r{round}_p{index})
      const match = msg.id.match(/_p(\d+)$/);
      if (match?.[1]) {
        completedIndices.add(Number.parseInt(match[1], 10));
      }
    }
  }

  // Get actively streaming participants from KV
  const activeStream = await getThreadActiveStream(threadId, env, logger);
  const activeIndices = new Set<number>();

  if (activeStream?.participantStatuses) {
    for (const [idx, status] of Object.entries(activeStream.participantStatuses)) {
      if (status === ParticipantStreamStatuses.ACTIVE) {
        activeIndices.add(Number.parseInt(idx, 10));
      }
    }
  }

  // Return indices that are neither completed nor actively streaming
  const incomplete: number[] = [];
  for (let i = 0; i < totalParticipants; i++) {
    if (!completedIndices.has(i) && !activeIndices.has(i)) {
      incomplete.push(i);
    }
  }

  logger?.info('Found incomplete participants', LogHelpers.operation({
    activeIndices: Array.from(activeIndices),
    completedIndices: Array.from(completedIndices),
    incompleteIndices: incomplete,
    operationName: 'getIncompleteParticipants',
    roundNumber,
    threadId,
    totalParticipants,
  }));

  return incomplete;
}

// ============================================================================
// RECOVERY HELPERS
// ============================================================================

/**
 * Update last activity timestamp for a round
 * Called when meaningful activity occurs (chunk received, status change)
 */
export async function updateRoundActivity(
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  await updateRoundExecutionState(threadId, roundNumber, {
    lastActivityAt: new Date().toISOString(),
  }, env, logger);
}

/**
 * Increment recovery attempts counter and check if more attempts allowed
 * Returns true if recovery should proceed, false if max attempts exceeded
 */
export async function incrementRecoveryAttempts(
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<{ canRecover: boolean; attempts: number; maxAttempts: number }> {
  const state = await getRoundExecutionState(threadId, roundNumber, env, logger);

  if (!state) {
    return { attempts: 0, canRecover: false, maxAttempts: DEFAULT_MAX_RECOVERY_ATTEMPTS };
  }

  const newAttempts = (state.recoveryAttempts ?? 0) + 1;
  const maxAttempts = state.maxRecoveryAttempts ?? DEFAULT_MAX_RECOVERY_ATTEMPTS;
  const canRecover = newAttempts <= maxAttempts;

  if (canRecover) {
    await updateRoundExecutionState(threadId, roundNumber, {
      lastActivityAt: new Date().toISOString(),
      recoveryAttempts: newAttempts,
    }, env, logger);
  }

  logger?.info(`Recovery attempts: ${newAttempts}/${maxAttempts}, canRecover: ${canRecover}`, LogHelpers.operation({
    operationName: 'incrementRecoveryAttempts',
    roundNumber,
    threadId,
  }));

  return { attempts: newAttempts, canRecover, maxAttempts };
}

/**
 * Update pre-search status in round execution state
 */
export async function updatePreSearchStatus(
  threadId: string,
  roundNumber: number,
  status: RoundPreSearchStatus,
  preSearchId: string | null,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  await updateRoundExecutionState(threadId, roundNumber, {
    lastActivityAt: new Date().toISOString(),
    preSearchId,
    preSearchStatus: status,
  }, env, logger);

  // ✅ FRAME 10/11: Pre-search (web research) tracking
  if (status === RoundPreSearchStatuses.RUNNING) {
    rlog.frame(10, 'presearch-start', `r${roundNumber} Web research streaming (blocks participants)`);
  } else if (status === RoundPreSearchStatuses.COMPLETED) {
    rlog.frame(11, 'presearch-complete', `r${roundNumber} Web research done → participants can start`);
  } else if (status === RoundPreSearchStatuses.FAILED) {
    rlog.stuck('presearch-failed', `r${roundNumber} Web research failed`);
  }

  logger?.info(`Pre-search status: ${status}${preSearchId ? `, id: ${preSearchId}` : ''}`, LogHelpers.operation({
    operationName: 'updatePreSearchStatus',
    roundNumber,
    threadId,
  }));
}

/**
 * Check if a round is stale (no activity for specified duration)
 */
export function isRoundStale(
  state: RoundExecutionState,
  staleThresholdMs = 30_000,
): boolean {
  if (!state.lastActivityAt) {
    // No activity timestamp - check startedAt
    const startTime = new Date(state.startedAt).getTime();
    return Date.now() - startTime > staleThresholdMs;
  }

  const lastActivity = new Date(state.lastActivityAt).getTime();
  return Date.now() - lastActivity > staleThresholdMs;
}

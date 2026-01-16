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

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { MessageRoles, ParticipantStreamStatuses, RoundExecutionPhases, RoundExecutionStatuses } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';
import type { TypedLogger } from '@/api/types/logger';
import { LogHelpers } from '@/api/types/logger';
import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ChatMessage, ChatParticipant, ChatThread } from '@/db/validation';

import { getThreadActiveStream } from '../streaming';

// ============================================================================
// ZOD SCHEMAS - SINGLE SOURCE OF TRUTH
// ============================================================================

export const RoundExecutionStateSchema = z.object({
  threadId: z.string().min(1),
  roundNumber: z.number().int().nonnegative(),
  status: z.nativeEnum(RoundExecutionStatuses),
  phase: z.nativeEnum(RoundExecutionPhases),
  totalParticipants: z.number().int().nonnegative(),
  completedParticipants: z.number().int().nonnegative(),
  failedParticipants: z.number().int().nonnegative(),
  participantStatuses: z.record(z.string(), z.nativeEnum(ParticipantStreamStatuses)),
  moderatorStatus: z.nativeEnum(ParticipantStreamStatuses).nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
  // Track which participants have been triggered (for resumption)
  triggeredParticipants: z.array(z.number()),
  // Attachment IDs shared across all participants
  attachmentIds: z.array(z.string()).optional(),
});

export type RoundExecutionState = z.infer<typeof RoundExecutionStateSchema>;

export const StartRoundExecutionParamsSchema = z.object({
  threadId: z.string().min(1),
  roundNumber: z.number().int().nonnegative(),
  userId: z.string().min(1),
  participants: z.array(z.custom<ChatParticipant>()),
  thread: z.custom<ChatThread>(),
  userMessage: z.custom<ChatMessage>(),
  attachmentIds: z.array(z.string()).optional(),
  env: z.custom<ApiEnv['Bindings']>(),
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(),
  logger: z.custom<TypedLogger>().optional(),
  executionCtx: z.custom<ExecutionContext>().optional(),
});

export type StartRoundExecutionParams = z.infer<typeof StartRoundExecutionParamsSchema>;

export const GetRoundStatusParamsSchema = z.object({
  threadId: z.string().min(1),
  roundNumber: z.number().int().nonnegative(),
  env: z.custom<ApiEnv['Bindings']>(),
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(),
  logger: z.custom<TypedLogger>().optional(),
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
): Promise<RoundExecutionState> {
  const state: RoundExecutionState = {
    threadId,
    roundNumber,
    status: RoundExecutionStatuses.RUNNING,
    phase: RoundExecutionPhases.PARTICIPANTS,
    totalParticipants,
    completedParticipants: 0,
    failedParticipants: 0,
    participantStatuses: {},
    moderatorStatus: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    triggeredParticipants: [],
    attachmentIds,
  };

  if (env?.KV) {
    await env.KV.put(
      getRoundExecutionKey(threadId, roundNumber),
      JSON.stringify(state),
      { expirationTtl: ROUND_STATE_TTL },
    );

    logger?.info('Initialized round execution state', LogHelpers.operation({
      operationName: 'initializeRoundExecution',
      threadId,
      roundNumber,
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
        operationName: 'getRoundExecutionState',
        threadId,
        roundNumber,
        error: parsed.error.message,
      }));
      return null;
    }

    return parsed.data;
  } catch (error) {
    logger?.error('Failed to get round execution state', LogHelpers.operation({
      operationName: 'getRoundExecutionState',
      threadId,
      roundNumber,
      error: error instanceof Error ? error.message : 'Unknown error',
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
        threadId,
        roundNumber,
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
      participantStatuses: mergedParticipantStatuses,
      completedParticipants,
      failedParticipants,
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
      operationName: 'updateRoundExecutionState',
      threadId,
      roundNumber,
      error: error instanceof Error ? error.message : 'Unknown error',
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
  if (!state)
    return;

  const participantStatuses = { ...state.participantStatuses };
  participantStatuses[participantIndex] = ParticipantStreamStatuses.ACTIVE;

  const triggeredParticipants = [...state.triggeredParticipants];
  if (!triggeredParticipants.includes(participantIndex)) {
    triggeredParticipants.push(participantIndex);
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
  if (!state)
    return { allParticipantsComplete: false };

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
    participantStatuses,
    completedParticipants,
    failedParticipants,
    phase: allParticipantsComplete ? RoundExecutionPhases.MODERATOR : RoundExecutionPhases.PARTICIPANTS,
  }, env, logger);

  logger?.info('Marked participant completed', LogHelpers.operation({
    operationName: 'markParticipantCompleted',
    threadId,
    roundNumber,
    participantIndex,
    completedParticipants,
    totalParticipants: state.totalParticipants,
    allParticipantsComplete,
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
  if (!state)
    return { allParticipantsComplete: false };

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
    participantStatuses,
    completedParticipants,
    failedParticipants,
    phase: allParticipantsComplete ? RoundExecutionPhases.MODERATOR : RoundExecutionPhases.PARTICIPANTS,
    // Only set error if all failed or this is a critical error
    error: failedParticipants >= state.totalParticipants ? error : state.error,
  }, env, logger);

  logger?.warn('Marked participant failed', LogHelpers.operation({
    operationName: 'markParticipantFailed',
    threadId,
    roundNumber,
    participantIndex,
    error,
    failedParticipants,
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
    moderatorStatus: ParticipantStreamStatuses.COMPLETED,
    phase: RoundExecutionPhases.COMPLETE,
    status: RoundExecutionStatuses.COMPLETED,
    completedAt: new Date().toISOString(),
  }, env, logger);

  logger?.info('Marked moderator completed - round execution complete', LogHelpers.operation({
    operationName: 'markModeratorCompleted',
    threadId,
    roundNumber,
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
    moderatorStatus: ParticipantStreamStatuses.FAILED,
    phase: RoundExecutionPhases.COMPLETE,
    status: RoundExecutionStatuses.COMPLETED, // Still complete, just with moderator failure
    completedAt: new Date().toISOString(),
    error,
  }, env, logger);

  logger?.warn('Marked moderator failed', LogHelpers.operation({
    operationName: 'markModeratorFailed',
    threadId,
    roundNumber,
    error,
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
    status: RoundExecutionStatuses.FAILED,
    completedAt: new Date().toISOString(),
    error,
  }, env, logger);

  logger?.error('Marked round execution as failed', LogHelpers.operation({
    operationName: 'markRoundFailed',
    threadId,
    roundNumber,
    error,
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
  const { threadId, roundNumber, env, db, logger } = params;

  // Check KV state first
  const kvState = await getRoundExecutionState(threadId, roundNumber, env, logger);

  // Get participant count from DB
  const participants = await db.query.chatParticipant.findMany({
    where: and(
      eq(tables.chatParticipant.threadId, threadId),
      eq(tables.chatParticipant.isEnabled, true),
    ),
    columns: { id: true },
  });

  const totalParticipants = participants.length;

  // Get messages for this round from DB
  const roundMessages = await db.query.chatMessage.findMany({
    where: and(
      eq(tables.chatMessage.threadId, threadId),
      eq(tables.chatMessage.roundNumber, roundNumber),
      eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
    ),
    columns: {
      id: true,
      participantId: true,
      metadata: true,
    },
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
    if (match) {
      const idx = Number.parseInt(match[1]!, 10);
      participantStatuses[idx] = ParticipantStreamStatuses.COMPLETED;
    }
  }

  // Determine overall status and phase
  const allParticipantsComplete = completedParticipants >= totalParticipants;
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
  } else if (kvState?.status === RoundExecutionStatuses.RUNNING) {
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
    status,
    phase,
    totalParticipants,
    completedParticipants,
    failedParticipants,
    participantStatuses,
    moderatorStatus,
    hasModeratorMessage,
    isComplete,
    error: kvState?.error || null,
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
    where: and(
      eq(tables.chatMessage.threadId, threadId),
      eq(tables.chatMessage.roundNumber, roundNumber),
      eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
    ),
    columns: {
      id: true,
      participantId: true,
    },
  });

  const completedIndices = new Set<number>();

  for (const msg of roundMessages) {
    if (msg.participantId) {
      // Extract participant index from message ID (format: {threadId}_r{round}_p{index})
      const match = msg.id.match(/_p(\d+)$/);
      if (match) {
        completedIndices.add(Number.parseInt(match[1]!, 10));
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
    operationName: 'getIncompleteParticipants',
    threadId,
    roundNumber,
    totalParticipants,
    completedIndices: Array.from(completedIndices),
    activeIndices: Array.from(activeIndices),
    incompleteIndices: incomplete,
  }));

  return incomplete;
}

import type { RouteHandler } from '@hono/zod-openapi';
import type { MessageStatus, RoundPhase } from '@roundtable/shared/enums';
import { CheckRoundCompletionReasons, MessageRoles, MessageStatuses, ParticipantStreamStatuses, RoundOrchestrationMessageTypes, RoundPhases, StreamPhases, StreamStatuses } from '@roundtable/shared/enums';
import { and, desc, eq } from 'drizzle-orm';

import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import { createHandler, Responses, STREAMING_CONFIG, ThreadIdParamSchema } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import { extractSessionToken } from '@/lib/auth';
import { NO_PARTICIPANT_SENTINEL } from '@/lib/schemas';
import { rlog } from '@/lib/utils/dev-logger';
import { clearThreadActiveStream, createLiveParticipantResumeStream, createWaitingParticipantStream, getActiveParticipantStreamId, getActivePreSearchStreamId, getNextParticipantToStream, getParticipantStreamChunks, getParticipantStreamMetadata, getPreSearchStreamChunks, getPreSearchStreamMetadata, getThreadActiveStream, updateParticipantStatus } from '@/services/streaming';
import type { ApiEnv } from '@/types';
import type { CheckRoundCompletionQueueMessage } from '@/types/queues';
import { parseStreamId } from '@/types/streaming';

import type { getThreadStreamResumptionStateRoute, resumeThreadStreamRoute } from '../route';
import type {
  ModeratorPhaseStatus,
  ParticipantPhaseStatus,
  PreSearchPhaseStatus,
  ThreadStreamResumptionState,
} from '../schema';

/**
 * Queue a check-round-completion message when a stuck round is detected
 * This enables auto-recovery when user refreshes and round is incomplete
 */
async function queueRoundCompletionCheck(
  threadId: string,
  roundNumber: number,
  userId: string,
  sessionToken: string,
  env: ApiEnv['Bindings'],
): Promise<boolean> {
  if (!env?.ROUND_ORCHESTRATION_QUEUE || !sessionToken) {
    return false;
  }

  try {
    const message: CheckRoundCompletionQueueMessage = {
      messageId: `check-${threadId}-r${roundNumber}-${Date.now()}`,
      queuedAt: new Date().toISOString(),
      reason: CheckRoundCompletionReasons.RESUME_TRIGGER,
      roundNumber,
      sessionToken,
      threadId,
      type: RoundOrchestrationMessageTypes.CHECK_ROUND_COMPLETION,
      userId,
    };

    await env.ROUND_ORCHESTRATION_QUEUE.send(message);
    return true;
  } catch {
    // Queue send failed - non-critical, continue without auto-trigger
    return false;
  }
}

/**
 * Validate KV participant status against actual DB messages.
 * KV can have stale data (e.g., participant marked FAILED but message was never saved).
 * Cross-validates to find the REAL next participant.
 *
 * @param threadId - Thread to check
 * @param roundNumber - Current round number
 * @param totalParticipants - Total participant count in round
 * @param currentStreamingIndex - Index currently streaming (avoids returning earlier index due to DB race)
 */
async function getDbValidatedNextParticipant(
  threadId: string,
  roundNumber: number,
  totalParticipants: number,
  currentStreamingIndex?: number,
): Promise<{ participantIndex: number } | null> {
  const db = await getDbAsync();

  // Query DB for actual participant messages in current round
  const assistantMessages = await db.query.chatMessage.findMany({
    columns: { id: true, metadata: true },
    where: and(
      eq(tables.chatMessage.threadId, threadId),
      eq(tables.chatMessage.roundNumber, roundNumber),
      eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
    ),
  });

  // Get participant indices that have actual DB messages (excluding moderator)
  const participantIndicesWithMessages = new Set<number>();
  for (const msg of assistantMessages) {
    const metadata = msg.metadata;
    if (metadata && typeof metadata === 'object') {
      if ('isModerator' in metadata && metadata.isModerator === true) {
        continue;
      }
      if ('participantIndex' in metadata && typeof metadata.participantIndex === 'number') {
        participantIndicesWithMessages.add(metadata.participantIndex);
      }
    }
  }

  // Find first participant without a DB message
  // ✅ FIX: But never go backwards from current streaming index
  for (let i = 0; i < totalParticipants; i++) {
    if (!participantIndicesWithMessages.has(i)) {
      // ✅ CRITICAL FIX: If we're past this participant (streaming a later one),
      // skip - their message will appear in DB soon (race condition)
      if (currentStreamingIndex !== undefined && i < currentStreamingIndex) {
        continue;
      }
      return { participantIndex: i };
    }
  }

  // All participants have messages
  return null;
}

export const resumeThreadStreamHandler: RouteHandler<typeof resumeThreadStreamRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'resumeThreadStream',
    validateParams: ThreadIdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId } = c.validated.params;

    rlog.resume('enter', `tid=${threadId.slice(-8)} user=${user.id.slice(0, 8)}`);

    // ✅ SESSION TOKEN: Extract for queue-based round orchestration
    const sessionToken = extractSessionToken(c.req.header('cookie'));

    // Get lastSeq from query params to avoid re-sending chunks client already has
    // ✅ FIX #5: Standardized from lastChunkIndex to lastSeq for consistency with entity endpoints
    const lastSeqParam = c.req.query('lastSeq');
    const lastSeq = lastSeqParam ? Number.parseInt(lastSeqParam, 10) : 0;
    const startFromChunkIndex = Number.isNaN(lastSeq) ? 0 : lastSeq;

    if (!c.env?.KV) {
      return Responses.noContentWithHeaders();
    }

    const db = await getDbAsync();
    const thread = await db.query.chatThread.findFirst({
      columns: { id: true, userId: true },
      where: eq(tables.chatThread.id, threadId),
    });

    if (!thread) {
      throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', threadId, user.id));
    }

    if (thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to access this thread', ErrorContextBuilders.authorization('thread', threadId, user.id));
    }

    const latestMessage = await db.query.chatMessage.findFirst({
      columns: { roundNumber: true },
      orderBy: desc(tables.chatMessage.createdAt),
      where: eq(tables.chatMessage.threadId, threadId),
    });
    const currentRound = latestMessage?.roundNumber ?? 0;

    rlog.resume('check', `tid=${threadId.slice(-8)} r=${currentRound} latestMsg=${latestMessage ? 'found' : 'none'}`);

    const preSearchStreamId = await getActivePreSearchStreamId(threadId, currentRound, c.env);
    if (preSearchStreamId) {
      const preSearchMetadata = await getPreSearchStreamMetadata(preSearchStreamId, c.env);
      const preSearchChunks = await getPreSearchStreamChunks(preSearchStreamId, c.env);

      if (preSearchMetadata && (preSearchMetadata.status === StreamStatuses.ACTIVE || preSearchMetadata.status === StreamStatuses.STREAMING)) {
        const lastChunkTime = preSearchChunks && preSearchChunks.length > 0
          ? Math.max(...preSearchChunks.map(chunk => chunk.timestamp))
          : 0;
        const isStale = lastChunkTime > 0 && Date.now() - lastChunkTime > STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS;

        if (!isStale) {
          return Responses.noContentWithHeaders({
            phase: StreamPhases.PRESEARCH,
            roundNumber: currentRound,
            streamId: preSearchStreamId,
          });
        }
      }
    }

    const activeStream = await getThreadActiveStream(threadId, c.env);

    rlog.resume('check', `tid=${threadId.slice(-8)} activeStream=${activeStream ? `P${activeStream.participantIndex} r${activeStream.roundNumber}` : 'none'}`);

    if (activeStream?.roundNumber === currentRound) {
      const nextParticipant = await getNextParticipantToStream(threadId, c.env);
      const roundComplete = !nextParticipant;
      const streamIdToResume = activeStream.streamId;

      const parsed = parseStreamId(streamIdToResume);
      if (parsed && parsed.roundNumber !== activeStream.roundNumber) {
        return Responses.noContentWithHeaders();
      }

      const metadata = await getParticipantStreamMetadata(streamIdToResume, c.env);

      if (!metadata) {
        // ✅ FIX: Validate KV result against actual DB messages
        // Pass currentStreamingIndex to avoid going backwards due to DB race conditions
        const dbValidatedNext = await getDbValidatedNextParticipant(
          threadId,
          activeStream.roundNumber,
          activeStream.totalParticipants,
          activeStream.participantIndex,
        );
        const validatedRoundComplete = !dbValidatedNext;

        if (dbValidatedNext && !validatedRoundComplete) {
          // ✅ AUTO-TRIGGER: Queue check-round-completion for auto-recovery
          // When there's no active stream but incomplete round detected, trigger recovery
          const triggered = await queueRoundCompletionCheck(
            threadId,
            activeStream.roundNumber,
            user.id,
            sessionToken,
            c.env,
          );

          return Responses.noContentWithHeaders({
            // Signal to client that auto-trigger was queued
            autoTriggerQueued: triggered,
            nextParticipantIndex: dbValidatedNext.participantIndex,
            participantStatuses: activeStream.participantStatuses,
            roundComplete: false,
            roundNumber: activeStream.roundNumber,
            totalParticipants: activeStream.totalParticipants,
          });
        }
        return Responses.noContentWithHeaders();
      }

      const chunks = await getParticipantStreamChunks(streamIdToResume, c.env);
      const lastChunkTime = chunks && chunks.length > 0
        ? Math.max(...chunks.map(chunk => chunk.timestamp))
        : 0;

      const streamCreatedTime = activeStream.createdAt
        ? new Date(activeStream.createdAt).getTime()
        : 0;
      const hasNoChunks = !chunks || chunks.length === 0;
      const streamIsOldWithNoChunks = hasNoChunks
        && streamCreatedTime > 0
        && Date.now() - streamCreatedTime > STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS;

      const isStaleStream = (lastChunkTime > 0 && Date.now() - lastChunkTime > STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS)
        || streamIsOldWithNoChunks;

      if (isStaleStream) {
        await updateParticipantStatus(
          threadId,
          activeStream.roundNumber,
          activeStream.participantIndex,
          ParticipantStreamStatuses.FAILED,
          c.env,
        );

        await getNextParticipantToStream(threadId, c.env);

        // ✅ FIX: Validate KV result against actual DB messages
        // KV might have marked participant as FAILED but message was never saved
        // Pass currentStreamingIndex to avoid going backwards due to DB race conditions
        const dbValidatedNextParticipant = await getDbValidatedNextParticipant(
          threadId,
          activeStream.roundNumber,
          activeStream.totalParticipants,
          activeStream.participantIndex,
        );
        const updatedRoundComplete = !dbValidatedNextParticipant;

        if (updatedRoundComplete) {
          await clearThreadActiveStream(threadId, c.env);
        }

        if (dbValidatedNextParticipant && !updatedRoundComplete) {
          // ✅ AUTO-TRIGGER: Queue check-round-completion for auto-recovery
          // Stale stream detected with incomplete round - trigger recovery
          const triggered = await queueRoundCompletionCheck(
            threadId,
            activeStream.roundNumber,
            user.id,
            sessionToken,
            c.env,
          );

          return Responses.noContentWithHeaders({
            // Signal to client that auto-trigger was queued
            autoTriggerQueued: triggered,
            nextParticipantIndex: dbValidatedNextParticipant.participantIndex,
            participantStatuses: activeStream.participantStatuses,
            roundComplete: false,
            roundNumber: activeStream.roundNumber,
            totalParticipants: activeStream.totalParticipants,
          });
        }
        return Responses.noContentWithHeaders();
      }

      const isStreamActive = metadata.status === StreamStatuses.ACTIVE;
      // ✅ FIX: Add filterReasoningOnReplay to prevent duplicate thinking tags during resume
      // ✅ FIX: Pass startFromChunkIndex to avoid re-sending chunks client already received
      const liveStream = createLiveParticipantResumeStream(streamIdToResume, c.env, {
        filterReasoningOnReplay: true,
        startFromChunkIndex,
      });

      return Responses.sse(liveStream, {
        isActive: isStreamActive,
        participantIndex: activeStream.participantIndex,
        participantStatuses: activeStream.participantStatuses,
        phase: StreamPhases.PARTICIPANT,
        resumedFromBuffer: true,
        roundComplete,
        roundNumber: activeStream.roundNumber,
        streamId: streamIdToResume,
        totalParticipants: activeStream.totalParticipants,
        ...(nextParticipant ? { nextParticipantIndex: nextParticipant.participantIndex } : {}),
      });
    }

    // ✅ FIX: Return resumable stream for moderator phase (was returning just headers)
    // This enables true stream resumption for moderator like participants
    const moderatorStreamId = await getActiveParticipantStreamId(threadId, currentRound, NO_PARTICIPANT_SENTINEL, c.env);
    if (moderatorStreamId) {
      const moderatorMetadata = await getParticipantStreamMetadata(moderatorStreamId, c.env);
      const moderatorChunks = await getParticipantStreamChunks(moderatorStreamId, c.env);

      if (moderatorMetadata && (moderatorMetadata.status === StreamStatuses.ACTIVE || moderatorMetadata.status === StreamStatuses.STREAMING)) {
        const lastChunkTime = moderatorChunks && moderatorChunks.length > 0
          ? Math.max(...moderatorChunks.map(chunk => chunk.timestamp))
          : 0;
        const isStale = lastChunkTime > 0 && Date.now() - lastChunkTime > STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS;

        if (!isStale) {
          // ✅ FIX: Create resumable stream for moderator instead of just returning headers
          const isStreamActive = moderatorMetadata.status === StreamStatuses.ACTIVE;
          const liveStream = createLiveParticipantResumeStream(moderatorStreamId, c.env, {
            // Filter reasoning chunks to prevent duplicate thinking tags during resume
            filterReasoningOnReplay: true,
            // ✅ FIX: Pass startFromChunkIndex to avoid re-sending chunks client already received
            startFromChunkIndex,
          });

          return Responses.sse(liveStream, {
            isActive: isStreamActive,
            phase: StreamPhases.MODERATOR,
            resumedFromBuffer: true,
            roundNumber: currentRound,
            streamId: moderatorStreamId,
          });
        }
      }
    }

    // ✅ AI SDK PATTERN: Server-side waiting stream instead of 204 + client retry
    // Check if a round is in progress and we should wait for a stream
    rlog.resume('check', `tid=${threadId.slice(-8)} checking dbValidatedNextParticipant...`);
    const dbValidatedNextParticipant = await getDbValidatedNextParticipant(
      threadId,
      currentRound,
      2, // Assume at least 2 participants for waiting stream
      0, // Start from P0
    );

    rlog.resume('check', `tid=${threadId.slice(-8)} dbValidatedNext=${dbValidatedNextParticipant ? `P${dbValidatedNextParticipant.participantIndex}` : 'null (all complete)'}`);

    if (dbValidatedNextParticipant) {
      // ✅ FIX: P0 should be triggered by frontend, not waited for
      // Only create waiting streams for P1+ (backend-triggered participants)
      if (dbValidatedNextParticipant.participantIndex === 0) {
        rlog.resume('check', `tid=${threadId.slice(-8)} P0 hasn't started - returning 204 (frontend triggers P0)`);
        return Responses.noContentWithHeaders();
      }

      // P1+ - create a waiting stream (backend will trigger these via queue)
      rlog.resume('check', `tid=${threadId.slice(-8)} P${dbValidatedNextParticipant.participantIndex} incomplete - creating waiting stream`);

      const waitingStream = createWaitingParticipantStream(
        threadId,
        currentRound,
        dbValidatedNextParticipant.participantIndex,
        c.env,
        {
          filterReasoningOnReplay: true,
          startFromChunkIndex,
          waitForStreamTimeoutMs: 30 * 1000, // 30 seconds to wait for stream to start
        },
      );

      return Responses.sse(waitingStream, {
        isActive: true,
        participantIndex: dbValidatedNextParticipant.participantIndex,
        phase: StreamPhases.PARTICIPANT,
        roundNumber: currentRound,
      });
    }

    rlog.resume('check', `tid=${threadId.slice(-8)} all complete or no participants - returning 204`);
    return Responses.noContentWithHeaders();
  },
);

function determineCurrentPhase(
  preSearchStatus: PreSearchPhaseStatus | null,
  participantStatus: ParticipantPhaseStatus,
  moderatorStatus: ModeratorPhaseStatus | null,
): RoundPhase {
  rlog.resume('phase-logic', `preSearch=${preSearchStatus?.enabled ? `enabled:${preSearchStatus.status}` : 'disabled'} pAllComplete=${participantStatus.allComplete} pTotal=${participantStatus.totalParticipants} mod=${moderatorStatus?.status ?? 'null'}`);

  // Phase 1: Pre-search (if enabled and still in progress)
  if (preSearchStatus?.enabled) {
    const status = preSearchStatus.status;
    if (status === MessageStatuses.PENDING || status === MessageStatuses.STREAMING) {
      rlog.resume('phase-logic', `→ PRE_SEARCH (status=${status})`);
      return RoundPhases.PRE_SEARCH;
    }
  }

  // Phase 2: Participants (if not all complete)
  if (!participantStatus.allComplete) {
    rlog.resume('phase-logic', `→ PARTICIPANTS (allComplete=false)`);
    return RoundPhases.PARTICIPANTS;
  }

  // Phase 3: Moderator (if all participants done)
  if (moderatorStatus) {
    const status = moderatorStatus.status;
    if (status === MessageStatuses.PENDING || status === MessageStatuses.STREAMING) {
      rlog.resume('phase-logic', `→ MODERATOR (status=${status})`);
      return RoundPhases.MODERATOR;
    }
    if (status === MessageStatuses.COMPLETE) {
      rlog.resume('phase-logic', `→ COMPLETE (mod complete)`);
      return RoundPhases.COMPLETE;
    }
    // ✅ FIX: If moderator status exists but is FAILED, still need moderator
    if (status === MessageStatuses.FAILED) {
      rlog.resume('phase-logic', `→ MODERATOR (mod failed, needs retry)`);
      return RoundPhases.MODERATOR;
    }
  }

  // ✅ FIX: If all participants complete but no moderator exists/started, need moderator
  // Only return MODERATOR phase if we've confirmed participants are actually complete
  if (participantStatus.allComplete && participantStatus.totalParticipants !== null && participantStatus.totalParticipants > 0) {
    rlog.resume('phase-logic', `→ MODERATOR (all ${participantStatus.totalParticipants} participants complete, no mod yet)`);
    return RoundPhases.MODERATOR;
  }

  // ✅ FIX: Default to IDLE instead of MODERATOR
  // This prevents stuck state when phase can't be determined
  rlog.resume('phase-logic', `→ IDLE (default - total=${participantStatus.totalParticipants})`);
  return RoundPhases.IDLE;
}

function isStreamStale(lastChunkTime: number, createdTime: number, hasChunks: boolean, staleTimeoutMs = 30000): boolean {
  if (hasChunks && lastChunkTime > 0) {
    return Date.now() - lastChunkTime > staleTimeoutMs;
  }
  if (!hasChunks && createdTime > 0) {
    return Date.now() - createdTime > staleTimeoutMs;
  }
  return false;
}

export const getThreadStreamResumptionStateHandler: RouteHandler<typeof getThreadStreamResumptionStateRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getThreadStreamResumptionState',
    validateParams: ThreadIdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId } = c.validated.params;

    rlog.resume('state-handler', `tid=${threadId.slice(-8)} START`);

    const db = await getDbAsync();
    const thread = await db.query.chatThread.findFirst({
      columns: { enableWebSearch: true, id: true, userId: true },
      where: eq(tables.chatThread.id, threadId),
    });

    if (!thread) {
      throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', threadId, user.id));
    }

    if (thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to access this thread', ErrorContextBuilders.authorization('thread', threadId, user.id));
    }

    const createIdleResponse = (): ThreadStreamResumptionState => ({
      currentPhase: RoundPhases.IDLE,
      // Top-level duplicates (required by schema)
      hasActiveStream: false,
      moderator: null,
      nextParticipantToTrigger: null,
      participants: {
        allComplete: true,
        currentParticipantIndex: null,
        hasActiveStream: false,
        lastSeqs: null,
        nextParticipantToTrigger: null,
        participantStatuses: null,
        streamId: null,
        totalParticipants: null,
      },
      participantStatuses: null,
      preSearch: null,
      roundComplete: true,
      roundNumber: null,
      streamId: null,
      totalParticipants: null,
    });

    const hasKV = !!c.env?.KV;

    const latestMessage = await db.query.chatMessage.findFirst({
      columns: { roundNumber: true },
      orderBy: desc(tables.chatMessage.createdAt),
      where: eq(tables.chatMessage.threadId, threadId),
    });

    const currentRoundNumber = latestMessage?.roundNumber ?? 0;

    rlog.resume('state-handler', `tid=${threadId.slice(-8)} round=${currentRoundNumber} hasKV=${hasKV} webSearch=${thread.enableWebSearch}`);

    let preSearchStatus: PreSearchPhaseStatus | null = null;

    if (thread.enableWebSearch) {
      const preSearchRecord = await db.query.chatPreSearch.findFirst({
        columns: { id: true, status: true },
        where: and(
          eq(tables.chatPreSearch.threadId, threadId),
          eq(tables.chatPreSearch.roundNumber, currentRoundNumber),
        ),
      });

      let preSearchStreamId: string | null = null;
      let preSearchKVStatus: MessageStatus | null = null;
      // ✅ RESUMPTION: Track lastSeq (chunk count) for stream resumption
      let preSearchChunkCount: number | null = null;

      if (hasKV) {
        preSearchStreamId = await getActivePreSearchStreamId(threadId, currentRoundNumber, c.env);

        if (preSearchStreamId) {
          const metadata = await getPreSearchStreamMetadata(preSearchStreamId, c.env);
          const chunks = await getPreSearchStreamChunks(preSearchStreamId, c.env);
          // ✅ RESUMPTION: Store chunk count for frontend resumption
          preSearchChunkCount = chunks?.length ?? 0;
          const lastChunkTime = chunks && chunks.length > 0
            ? Math.max(...chunks.map(chunk => chunk.timestamp))
            : 0;

          const stale = isStreamStale(
            lastChunkTime,
            metadata?.createdAt ?? 0,
            (chunks?.length ?? 0) > 0,
            STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS,
          );

          if (stale) {
            preSearchStreamId = null;
            preSearchKVStatus = MessageStatuses.FAILED;
            preSearchChunkCount = null; // Reset on stale
          } else if (metadata?.status === StreamStatuses.ACTIVE || metadata?.status === StreamStatuses.STREAMING) {
            preSearchKVStatus = MessageStatuses.STREAMING;
          } else if (metadata?.status === StreamStatuses.COMPLETED) {
            preSearchKVStatus = MessageStatuses.COMPLETE;
          }
        }
      }

      const dbStatus = preSearchRecord?.status ?? null;
      const effectiveStatus = preSearchKVStatus ?? dbStatus;

      preSearchStatus = {
        enabled: true,
        lastSeq: preSearchChunkCount,
        preSearchId: preSearchRecord?.id ?? null,
        status: effectiveStatus,
        streamId: preSearchStreamId,
      };
    }

    let participantStatus: ParticipantPhaseStatus = {
      allComplete: true,
      currentParticipantIndex: null,
      hasActiveStream: false,
      lastSeqs: null,
      nextParticipantToTrigger: null,
      participantStatuses: null,
      streamId: null,
      totalParticipants: null,
    };

    if (hasKV) {
      const activeStream = await getThreadActiveStream(threadId, c.env);
      rlog.resume('state-handler', `tid=${threadId.slice(-8)} KV activeStream=${activeStream ? `P${activeStream.participantIndex} r${activeStream.roundNumber} total=${activeStream.totalParticipants}` : 'null'}`);

      if (activeStream?.roundNumber === currentRoundNumber) {
        const chunks = await getParticipantStreamChunks(activeStream.streamId, c.env);
        const lastChunkTime = chunks && chunks.length > 0
          ? Math.max(...chunks.map(chunk => chunk.timestamp))
          : 0;

        const streamCreatedTime = activeStream.createdAt
          ? new Date(activeStream.createdAt).getTime()
          : 0;

        const stale = isStreamStale(
          lastChunkTime,
          streamCreatedTime,
          (chunks?.length ?? 0) > 0,
          STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS,
        );

        if (stale) {
          await updateParticipantStatus(
            threadId,
            activeStream.roundNumber,
            activeStream.participantIndex,
            ParticipantStreamStatuses.FAILED,
            c.env,
          );
        }

        const kvNextParticipant = await getNextParticipantToStream(threadId, c.env);

        // ✅ FIX: Cross-validate KV statuses against actual DB messages
        // KV can have stale data (e.g., participant marked completed but message never saved)
        // Query DB to find which participants actually have messages
        const participantMessagesForValidation = await db.query.chatMessage.findMany({
          columns: { id: true, metadata: true },
          where: and(
            eq(tables.chatMessage.threadId, threadId),
            eq(tables.chatMessage.roundNumber, currentRoundNumber),
            eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
          ),
        });

        // Get participant indices that have actual DB messages (excluding moderator)
        const participantIndicesWithMessages = new Set<number>();
        for (const msg of participantMessagesForValidation) {
          const metadata = msg.metadata;
          if (metadata && typeof metadata === 'object') {
            // Skip moderator messages
            if ('isModerator' in metadata && metadata.isModerator === true) {
              continue;
            }
            // Get participant index from metadata
            if ('participantIndex' in metadata && typeof metadata.participantIndex === 'number') {
              participantIndicesWithMessages.add(metadata.participantIndex);
            }
          }
        }

        // Find the REAL next participant: first one without a DB message
        // This overrides KV if KV has stale/incorrect status
        // ✅ FIX: But NEVER go backwards - if P1 is streaming, P0 must be complete
        // even if P0's message hasn't been persisted to DB yet (race condition)
        let nextParticipant = kvNextParticipant;
        for (let i = 0; i < activeStream.totalParticipants; i++) {
          if (!participantIndicesWithMessages.has(i)) {
            // This participant has no DB message - they MIGHT need to respond
            // ✅ CRITICAL FIX: But if we're PAST this participant (streaming a later one),
            // don't go backwards. The earlier participant is complete but DB hasn't synced yet.
            // Example: P0 complete, P1 streaming, DB doesn't have P0's message yet.
            // Without this check, we'd return nextP=0 causing P0 to show "Thinking..."
            if (i < activeStream.participantIndex) {
              // Skip - this participant is before the currently streaming one
              // Their message will appear in DB soon (race condition)
              continue;
            }
            // Override KV result if different
            if (kvNextParticipant?.participantIndex !== i) {
              nextParticipant = {
                participantIndex: i,
                roundNumber: activeStream.roundNumber,
                totalParticipants: activeStream.totalParticipants,
              };
            }
            break;
          }
        }

        const allComplete = !nextParticipant;

        if (allComplete && stale) {
          await clearThreadActiveStream(threadId, c.env);
        } else {
          const participantStatusesStringKeyed = activeStream.participantStatuses
            ? Object.fromEntries(
                Object.entries(activeStream.participantStatuses).map(([k, v]) => [String(k), v]),
              )
            : null;

          // ✅ RESUMPTION: Build lastSeqs for each participant's chunk count
          // Frontend uses this to resume from correct position after reconnect
          const lastSeqs: Record<string, number> = {};
          // Current streaming participant - use chunks already fetched above
          if (!stale && chunks) {
            lastSeqs[String(activeStream.participantIndex)] = chunks.length;
          }

          participantStatus = {
            allComplete,
            currentParticipantIndex: activeStream.participantIndex,
            hasActiveStream: !stale,
            lastSeqs: Object.keys(lastSeqs).length > 0 ? lastSeqs : null,
            nextParticipantToTrigger: nextParticipant?.participantIndex ?? null,
            participantStatuses: participantStatusesStringKeyed,
            streamId: stale ? null : activeStream.streamId,
            totalParticipants: activeStream.totalParticipants,
          };

          rlog.resume('state-handler', `tid=${threadId.slice(-8)} KV: activeP=${activeStream.participantIndex} total=${activeStream.totalParticipants} stale=${stale} allComplete=${allComplete} nextP=${nextParticipant?.participantIndex ?? 'null'} lastSeqs=${JSON.stringify(lastSeqs)}`);
        }
      }
    }

    if (!hasKV || !participantStatus.hasActiveStream) {
      const participants = await db.query.chatParticipant.findMany({
        columns: { id: true },
        where: and(
          eq(tables.chatParticipant.threadId, threadId),
          eq(tables.chatParticipant.isEnabled, true),
        ),
      });

      const totalParticipants = participants.length;

      // ✅ FIX: Query all assistant messages then filter out moderators
      // Previously counted moderators as participants, causing premature allComplete=true
      const assistantMessages = await db.query.chatMessage.findMany({
        columns: { id: true, metadata: true },
        where: and(
          eq(tables.chatMessage.threadId, threadId),
          eq(tables.chatMessage.roundNumber, currentRoundNumber),
          eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
        ),
      });

      // Filter out moderator messages (they have isModerator: true in metadata)
      const participantMessages = assistantMessages.filter((msg) => {
        const metadata = msg.metadata;
        if (!metadata || typeof metadata !== 'object') {
          return true; // No metadata = not a moderator
        }
        return !('isModerator' in metadata && metadata.isModerator === true);
      });

      // ✅ FIX: Also calculate nextParticipantToTrigger when no KV
      // Get participant indices that have actual DB messages
      const dbParticipantIndices = new Set<number>();
      for (const msg of participantMessages) {
        const metadata = msg.metadata;
        if (metadata && typeof metadata === 'object' && 'participantIndex' in metadata && typeof metadata.participantIndex === 'number') {
          dbParticipantIndices.add(metadata.participantIndex);
        }
      }

      // Find first participant without a message
      let dbNextParticipant: number | null = null;
      for (let i = 0; i < totalParticipants; i++) {
        if (!dbParticipantIndices.has(i)) {
          dbNextParticipant = i;
          break;
        }
      }

      participantStatus.totalParticipants = totalParticipants;
      participantStatus.nextParticipantToTrigger = dbNextParticipant;
      // ✅ FIX: Use filtered participant messages count, not all assistant messages
      participantStatus.allComplete = participantMessages.length >= totalParticipants;

      rlog.resume('state-handler', `tid=${threadId.slice(-8)} DB-only: total=${totalParticipants} pMsgs=${participantMessages.length} allComplete=${participantStatus.allComplete} nextP=${dbNextParticipant}`);
    }

    let moderatorStatus: ModeratorPhaseStatus | null = null;

    const moderatorMessages = await db.query.chatMessage.findMany({
      columns: { id: true, metadata: true },
      where: and(
        eq(tables.chatMessage.threadId, threadId),
        eq(tables.chatMessage.roundNumber, currentRoundNumber),
        eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
      ),
    });

    const moderatorRecord = moderatorMessages.find((msg) => {
      const metadata = msg.metadata;
      return metadata && typeof metadata === 'object' && 'isModerator' in metadata && metadata.isModerator === true;
    });

    const moderatorRecordData = moderatorRecord
      ? { id: moderatorRecord.id, status: MessageStatuses.COMPLETE }
      : null;

    let moderatorStreamId: string | null = null;
    let moderatorKVStatus: MessageStatus | null = null;
    // ✅ RESUMPTION: Track lastSeq (chunk count) for stream resumption
    let moderatorChunkCount: number | null = null;

    if (hasKV) {
      moderatorStreamId = await getActiveParticipantStreamId(threadId, currentRoundNumber, NO_PARTICIPANT_SENTINEL, c.env);

      if (moderatorStreamId) {
        const metadata = await getParticipantStreamMetadata(moderatorStreamId, c.env);
        const chunks = await getParticipantStreamChunks(moderatorStreamId, c.env);
        // ✅ RESUMPTION: Store chunk count for frontend resumption
        moderatorChunkCount = chunks?.length ?? 0;
        const lastChunkTime = chunks && chunks.length > 0
          ? Math.max(...chunks.map((chunk: { timestamp: number }) => chunk.timestamp))
          : 0;

        const stale = isStreamStale(
          lastChunkTime,
          metadata?.createdAt ?? 0,
          (chunks?.length ?? 0) > 0,
          STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS,
        );

        if (stale) {
          moderatorStreamId = null;
          moderatorKVStatus = MessageStatuses.FAILED;
          moderatorChunkCount = null; // Reset on stale
        } else if (metadata?.status === StreamStatuses.ACTIVE || metadata?.status === StreamStatuses.STREAMING) {
          moderatorKVStatus = MessageStatuses.STREAMING;
        } else if (metadata?.status === StreamStatuses.COMPLETED) {
          moderatorKVStatus = MessageStatuses.COMPLETE;
        }
      }
    }

    const dbMessageStatus = moderatorRecordData?.status ?? null;
    const effectiveMessageStatus = moderatorKVStatus ?? dbMessageStatus;

    if (moderatorRecordData || moderatorStreamId) {
      moderatorStatus = {
        lastSeq: moderatorChunkCount,
        moderatorMessageId: moderatorRecordData?.id ?? null,
        status: effectiveMessageStatus,
        streamId: moderatorStreamId,
      };
    }

    const currentPhase = determineCurrentPhase(preSearchStatus, participantStatus, moderatorStatus);
    const roundComplete = currentPhase === RoundPhases.COMPLETE;

    rlog.resume('state-handler', `tid=${threadId.slice(-8)} RESULT: phase=${currentPhase} roundComplete=${roundComplete} hasActiveStream=${participantStatus.hasActiveStream} nextP=${participantStatus.nextParticipantToTrigger} modStatus=${moderatorStatus?.status ?? 'null'}`);

    if (currentPhase === RoundPhases.IDLE) {
      rlog.resume('state-handler', `tid=${threadId.slice(-8)} returning IDLE response`);
      return Responses.ok(c, createIdleResponse());
    }

    return Responses.ok(c, {
      currentPhase,
      hasActiveStream: participantStatus.hasActiveStream,
      moderator: moderatorStatus,
      nextParticipantToTrigger: participantStatus.nextParticipantToTrigger,
      participants: participantStatus,
      participantStatuses: participantStatus.participantStatuses,
      preSearch: preSearchStatus,
      roundComplete,
      roundNumber: currentRoundNumber,
      streamId: participantStatus.streamId,
      totalParticipants: participantStatus.totalParticipants,
    });
  },
);

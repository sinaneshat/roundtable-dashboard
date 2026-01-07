import type { RouteHandler } from '@hono/zod-openapi';
import { and, desc, eq } from 'drizzle-orm';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import { createHandler, Responses, STREAMING_CONFIG, ThreadIdParamSchema } from '@/api/core';
import type { MessageStatus, RoundPhase } from '@/api/core/enums';
import { MessageRoles, MessageStatuses, ParticipantStreamStatuses, RoundPhases, StreamStatuses } from '@/api/core/enums';
import { clearThreadActiveStream, createLiveParticipantResumeStream, getActiveParticipantStreamId, getActivePreSearchStreamId, getNextParticipantToStream, getParticipantStreamChunks, getParticipantStreamMetadata, getPreSearchStreamChunks, getPreSearchStreamMetadata, getThreadActiveStream, updateParticipantStatus } from '@/api/services/streaming';
import type { ApiEnv } from '@/api/types';
import { parseStreamId } from '@/api/types/streaming';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import { NO_PARTICIPANT_SENTINEL } from '@/lib/schemas/participant-schemas';

import type { getThreadStreamResumptionStateRoute, resumeThreadStreamRoute } from '../route';
import type {
  ModeratorPhaseStatus,
  ParticipantPhaseStatus,
  PreSearchPhaseStatus,
  ThreadStreamResumptionState,
} from '../schema';

export const resumeThreadStreamHandler: RouteHandler<typeof resumeThreadStreamRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'resumeThreadStream',
    validateParams: ThreadIdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId } = c.validated.params;

    if (!c.env?.KV) {
      return Responses.noContentWithHeaders();
    }

    const db = await getDbAsync();
    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, threadId),
      columns: { id: true, userId: true },
    });

    if (!thread) {
      throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', threadId, user.id));
    }

    if (thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to access this thread', ErrorContextBuilders.authorization('thread', threadId, user.id));
    }

    const latestMessage = await db.query.chatMessage.findFirst({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: desc(tables.chatMessage.createdAt),
      columns: { roundNumber: true },
    });
    const currentRound = latestMessage?.roundNumber ?? 0;

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
            phase: 'presearch',
            roundNumber: currentRound,
            streamId: preSearchStreamId,
          });
        }
      }
    }

    const activeStream = await getThreadActiveStream(threadId, c.env);

    if (activeStream && activeStream.roundNumber === currentRound) {
      const nextParticipant = await getNextParticipantToStream(threadId, c.env);
      const roundComplete = !nextParticipant;
      const streamIdToResume = activeStream.streamId;

      const parsed = parseStreamId(streamIdToResume);
      if (parsed && parsed.roundNumber !== activeStream.roundNumber) {
        return Responses.noContentWithHeaders();
      }

      const metadata = await getParticipantStreamMetadata(streamIdToResume, c.env);

      if (!metadata) {
        if (nextParticipant && !roundComplete) {
          return Responses.noContentWithHeaders({
            roundNumber: activeStream.roundNumber,
            totalParticipants: activeStream.totalParticipants,
            nextParticipantIndex: nextParticipant.participantIndex,
            participantStatuses: activeStream.participantStatuses,
            roundComplete: false,
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

        const updatedNextParticipant = await getNextParticipantToStream(threadId, c.env);
        const updatedRoundComplete = !updatedNextParticipant;

        if (updatedRoundComplete) {
          await clearThreadActiveStream(threadId, c.env);
        }

        if (updatedNextParticipant && !updatedRoundComplete) {
          return Responses.noContentWithHeaders({
            roundNumber: activeStream.roundNumber,
            totalParticipants: activeStream.totalParticipants,
            nextParticipantIndex: updatedNextParticipant.participantIndex,
            participantStatuses: activeStream.participantStatuses,
            roundComplete: false,
          });
        }
        return Responses.noContentWithHeaders();
      }

      const isStreamActive = metadata.status === StreamStatuses.ACTIVE;
      // ✅ FIX: Add filterReasoningOnReplay to prevent duplicate thinking tags during resume
      const liveStream = createLiveParticipantResumeStream(streamIdToResume, c.env, {
        filterReasoningOnReplay: true,
      });

      return Responses.sse(liveStream, {
        streamId: streamIdToResume,
        phase: 'participant',
        roundNumber: activeStream.roundNumber,
        participantIndex: activeStream.participantIndex,
        totalParticipants: activeStream.totalParticipants,
        participantStatuses: activeStream.participantStatuses,
        isActive: isStreamActive,
        roundComplete,
        resumedFromBuffer: true,
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
          });

          return Responses.sse(liveStream, {
            streamId: moderatorStreamId,
            phase: 'moderator',
            roundNumber: currentRound,
            isActive: isStreamActive,
            resumedFromBuffer: true,
          });
        }
      }
    }

    return Responses.noContentWithHeaders();
  },
);

function determineCurrentPhase(
  preSearchStatus: PreSearchPhaseStatus | null,
  participantStatus: ParticipantPhaseStatus,
  moderatorStatus: ModeratorPhaseStatus | null,
): RoundPhase {
  // Phase 1: Pre-search (if enabled and still in progress)
  if (preSearchStatus?.enabled) {
    const status = preSearchStatus.status;
    if (status === MessageStatuses.PENDING || status === MessageStatuses.STREAMING) {
      return RoundPhases.PRE_SEARCH;
    }
  }

  // Phase 2: Participants (if not all complete)
  // ✅ FIX: This MUST return PARTICIPANTS if participants aren't done
  // The old code would fall through to MODERATOR as default
  if (!participantStatus.allComplete) {
    return RoundPhases.PARTICIPANTS;
  }

  // Phase 3: Moderator (if all participants done)
  if (moderatorStatus) {
    const status = moderatorStatus.status;
    if (status === MessageStatuses.PENDING || status === MessageStatuses.STREAMING) {
      return RoundPhases.MODERATOR;
    }
    if (status === MessageStatuses.COMPLETE) {
      return RoundPhases.COMPLETE;
    }
    // ✅ FIX: If moderator status exists but is FAILED, still need moderator
    if (status === MessageStatuses.FAILED) {
      return RoundPhases.MODERATOR;
    }
  }

  // ✅ FIX: If all participants complete but no moderator exists/started, need moderator
  // Only return MODERATOR phase if we've confirmed participants are actually complete
  if (participantStatus.allComplete && participantStatus.totalParticipants !== null && participantStatus.totalParticipants > 0) {
    return RoundPhases.MODERATOR;
  }

  // ✅ FIX: Default to IDLE instead of MODERATOR
  // This prevents stuck state when phase can't be determined
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

    const db = await getDbAsync();
    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, threadId),
      columns: { id: true, userId: true, enableWebSearch: true },
    });

    if (!thread) {
      throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', threadId, user.id));
    }

    if (thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to access this thread', ErrorContextBuilders.authorization('thread', threadId, user.id));
    }

    const createIdleResponse = (): ThreadStreamResumptionState => ({
      roundNumber: null,
      currentPhase: RoundPhases.IDLE,
      preSearch: null,
      participants: {
        hasActiveStream: false,
        streamId: null,
        totalParticipants: null,
        currentParticipantIndex: null,
        participantStatuses: null,
        nextParticipantToTrigger: null,
        allComplete: true,
      },
      moderator: null,
      roundComplete: true,
      // Top-level duplicates (required by schema)
      hasActiveStream: false,
      streamId: null,
      totalParticipants: null,
      participantStatuses: null,
      nextParticipantToTrigger: null,
    });

    const hasKV = !!c.env?.KV;

    const latestMessage = await db.query.chatMessage.findFirst({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: desc(tables.chatMessage.createdAt),
      columns: { roundNumber: true },
    });

    const currentRoundNumber = latestMessage?.roundNumber ?? 0;

    let preSearchStatus: PreSearchPhaseStatus | null = null;

    if (thread.enableWebSearch) {
      const preSearchRecord = await db.query.chatPreSearch.findFirst({
        where: and(
          eq(tables.chatPreSearch.threadId, threadId),
          eq(tables.chatPreSearch.roundNumber, currentRoundNumber),
        ),
        columns: { id: true, status: true },
      });

      let preSearchStreamId: string | null = null;
      let preSearchKVStatus: MessageStatus | null = null;

      if (hasKV) {
        preSearchStreamId = await getActivePreSearchStreamId(threadId, currentRoundNumber, c.env);

        if (preSearchStreamId) {
          const metadata = await getPreSearchStreamMetadata(preSearchStreamId, c.env);
          const chunks = await getPreSearchStreamChunks(preSearchStreamId, c.env);
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
        status: effectiveStatus,
        streamId: preSearchStreamId,
        preSearchId: preSearchRecord?.id ?? null,
      };
    }

    let participantStatus: ParticipantPhaseStatus = {
      hasActiveStream: false,
      streamId: null,
      totalParticipants: null,
      currentParticipantIndex: null,
      participantStatuses: null,
      nextParticipantToTrigger: null,
      allComplete: true,
    };

    if (hasKV) {
      const activeStream = await getThreadActiveStream(threadId, c.env);

      if (activeStream && activeStream.roundNumber === currentRoundNumber) {
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

        const nextParticipant = await getNextParticipantToStream(threadId, c.env);
        const allComplete = !nextParticipant;

        if (allComplete && stale) {
          await clearThreadActiveStream(threadId, c.env);
        } else {
          const participantStatusesStringKeyed = activeStream.participantStatuses
            ? Object.fromEntries(
                Object.entries(activeStream.participantStatuses).map(([k, v]) => [String(k), v]),
              )
            : null;

          participantStatus = {
            hasActiveStream: !stale,
            streamId: stale ? null : activeStream.streamId,
            totalParticipants: activeStream.totalParticipants,
            currentParticipantIndex: activeStream.participantIndex,
            participantStatuses: participantStatusesStringKeyed,
            nextParticipantToTrigger: nextParticipant?.participantIndex ?? null,
            allComplete,
          };
        }
      }
    }

    if (!hasKV || !participantStatus.hasActiveStream) {
      const participants = await db.query.chatParticipant.findMany({
        where: and(
          eq(tables.chatParticipant.threadId, threadId),
          eq(tables.chatParticipant.isEnabled, true),
        ),
        columns: { id: true },
      });

      const totalParticipants = participants.length;

      // ✅ FIX: Query all assistant messages then filter out moderators
      // Previously counted moderators as participants, causing premature allComplete=true
      const assistantMessages = await db.query.chatMessage.findMany({
        where: and(
          eq(tables.chatMessage.threadId, threadId),
          eq(tables.chatMessage.roundNumber, currentRoundNumber),
          eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
        ),
        columns: { id: true, metadata: true },
      });

      // Filter out moderator messages (they have isModerator: true in metadata)
      const participantMessages = assistantMessages.filter((msg) => {
        const metadata = msg.metadata;
        if (!metadata || typeof metadata !== 'object') {
          return true; // No metadata = not a moderator
        }
        return !('isModerator' in metadata && metadata.isModerator === true);
      });

      participantStatus.totalParticipants = totalParticipants;
      // ✅ FIX: Use filtered participant messages count, not all assistant messages
      participantStatus.allComplete = participantMessages.length >= totalParticipants;
    }

    let moderatorStatus: ModeratorPhaseStatus | null = null;

    const moderatorMessages = await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, threadId),
        eq(tables.chatMessage.roundNumber, currentRoundNumber),
        eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
      ),
      columns: { id: true, metadata: true },
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

    if (hasKV) {
      moderatorStreamId = await getActiveParticipantStreamId(threadId, currentRoundNumber, NO_PARTICIPANT_SENTINEL, c.env);

      if (moderatorStreamId) {
        const metadata = await getParticipantStreamMetadata(moderatorStreamId, c.env);
        const chunks = await getParticipantStreamChunks(moderatorStreamId, c.env);
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
        status: effectiveMessageStatus,
        streamId: moderatorStreamId,
        moderatorMessageId: moderatorRecordData?.id ?? null,
      };
    }

    const currentPhase = determineCurrentPhase(preSearchStatus, participantStatus, moderatorStatus);
    const roundComplete = currentPhase === RoundPhases.COMPLETE;

    if (currentPhase === RoundPhases.IDLE) {
      return Responses.ok(c, createIdleResponse());
    }

    return Responses.ok(c, {
      roundNumber: currentRoundNumber,
      currentPhase,
      preSearch: preSearchStatus,
      participants: participantStatus,
      moderator: moderatorStatus,
      roundComplete,
      hasActiveStream: participantStatus.hasActiveStream,
      streamId: participantStatus.streamId,
      totalParticipants: participantStatus.totalParticipants,
      participantStatuses: participantStatus.participantStatuses,
      nextParticipantToTrigger: participantStatus.nextParticipantToTrigger,
    });
  },
);

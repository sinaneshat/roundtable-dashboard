import type { RouteHandler } from '@hono/zod-openapi';
import { and, desc, eq } from 'drizzle-orm';

import { createError } from '@/api/common/error-handling';
import { createHandler, Responses } from '@/api/core';
import type { MessageStatus, RoundPhase } from '@/api/core/enums';
import { MessageStatuses, ParticipantStreamStatuses, RoundPhases, StreamStatuses } from '@/api/core/enums';
import { getActivePreSearchStreamId, getPreSearchStreamChunks, getPreSearchStreamMetadata } from '@/api/services/pre-search-stream-buffer.service';
import { clearThreadActiveStream, getNextParticipantToStream, getThreadActiveStream, updateParticipantStatus } from '@/api/services/resumable-stream-kv.service';
import { createLiveParticipantResumeStream, getActiveStreamId, getStreamChunks, getStreamMetadata } from '@/api/services/stream-buffer.service';
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
import { ThreadIdParamSchema } from '../schema';

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
      throw createError.notFound('Thread not found');
    }

    if (thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to access this thread');
    }

    const latestMessage = await db.query.chatMessage.findFirst({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: desc(tables.chatMessage.createdAt),
      columns: { roundNumber: true },
    });
    const currentRound = latestMessage?.roundNumber ?? 0;

    const STALE_CHUNK_TIMEOUT_MS = 30 * 1000;

    const preSearchStreamId = await getActivePreSearchStreamId(threadId, currentRound, c.env);
    if (preSearchStreamId) {
      const preSearchMetadata = await getPreSearchStreamMetadata(preSearchStreamId, c.env);
      const preSearchChunks = await getPreSearchStreamChunks(preSearchStreamId, c.env);

      if (preSearchMetadata && (preSearchMetadata.status === StreamStatuses.ACTIVE || preSearchMetadata.status === StreamStatuses.STREAMING)) {
        const lastChunkTime = preSearchChunks && preSearchChunks.length > 0
          ? Math.max(...preSearchChunks.map(chunk => chunk.timestamp))
          : 0;
        const isStale = lastChunkTime > 0 && Date.now() - lastChunkTime > STALE_CHUNK_TIMEOUT_MS;

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

      const metadata = await getStreamMetadata(streamIdToResume, c.env);

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

      const chunks = await getStreamChunks(streamIdToResume, c.env);
      const lastChunkTime = chunks && chunks.length > 0
        ? Math.max(...chunks.map(chunk => chunk.timestamp))
        : 0;

      const streamCreatedTime = activeStream.createdAt
        ? new Date(activeStream.createdAt).getTime()
        : 0;
      const hasNoChunks = !chunks || chunks.length === 0;
      const streamIsOldWithNoChunks = hasNoChunks
        && streamCreatedTime > 0
        && Date.now() - streamCreatedTime > STALE_CHUNK_TIMEOUT_MS;

      const isStaleStream = (lastChunkTime > 0 && Date.now() - lastChunkTime > STALE_CHUNK_TIMEOUT_MS)
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
      const liveStream = createLiveParticipantResumeStream(streamIdToResume, c.env);

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

    const moderatorStreamId = await getActiveStreamId(threadId, currentRound, NO_PARTICIPANT_SENTINEL, c.env);
    if (moderatorStreamId) {
      const moderatorMetadata = await getStreamMetadata(moderatorStreamId, c.env);
      const moderatorChunks = await getStreamChunks(moderatorStreamId, c.env);

      if (moderatorMetadata && (moderatorMetadata.status === StreamStatuses.ACTIVE || moderatorMetadata.status === StreamStatuses.STREAMING)) {
        const lastChunkTime = moderatorChunks && moderatorChunks.length > 0
          ? Math.max(...moderatorChunks.map(chunk => chunk.timestamp))
          : 0;
        const isStale = lastChunkTime > 0 && Date.now() - lastChunkTime > STALE_CHUNK_TIMEOUT_MS;

        if (!isStale) {
          return Responses.noContentWithHeaders({
            phase: 'moderator',
            roundNumber: currentRound,
            streamId: moderatorStreamId,
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
  if (preSearchStatus?.enabled) {
    const status = preSearchStatus.status;
    if (status === MessageStatuses.PENDING || status === MessageStatuses.STREAMING) {
      return RoundPhases.PRE_SEARCH;
    }
  }

  if (!participantStatus.allComplete) {
    return RoundPhases.PARTICIPANTS;
  }

  if (moderatorStatus) {
    const status = moderatorStatus.status;
    if (status === MessageStatuses.PENDING || status === MessageStatuses.STREAMING) {
      return RoundPhases.MODERATOR;
    }
    if (status === MessageStatuses.COMPLETE) {
      return RoundPhases.COMPLETE;
    }
  }

  return RoundPhases.MODERATOR;
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
    const STALE_CHUNK_TIMEOUT_MS = 30 * 1000;

    const db = await getDbAsync();
    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, threadId),
      columns: { id: true, userId: true, enableWebSearch: true },
    });

    if (!thread) {
      throw createError.notFound('Thread not found');
    }

    if (thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to access this thread');
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
            STALE_CHUNK_TIMEOUT_MS,
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
        const chunks = await getStreamChunks(activeStream.streamId, c.env);
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
          STALE_CHUNK_TIMEOUT_MS,
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

      const assistantMessages = await db.query.chatMessage.findMany({
        where: and(
          eq(tables.chatMessage.threadId, threadId),
          eq(tables.chatMessage.roundNumber, currentRoundNumber),
          eq(tables.chatMessage.role, 'assistant'),
        ),
        columns: { id: true },
      });

      participantStatus.totalParticipants = totalParticipants;
      participantStatus.allComplete = assistantMessages.length >= totalParticipants;
    }

    let moderatorStatus: ModeratorPhaseStatus | null = null;

    const moderatorMessages = await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, threadId),
        eq(tables.chatMessage.roundNumber, currentRoundNumber),
        eq(tables.chatMessage.role, 'assistant'),
      ),
      columns: { id: true, metadata: true },
    });

    const moderatorRecord = moderatorMessages.find((msg) => {
      const metadata = msg.metadata;
      return metadata && typeof metadata === 'object' && 'isModerator' in metadata && metadata.isModerator === true;
    });

    const moderatorRecordData = moderatorRecord
      ? { id: moderatorRecord.id, status: 'complete' as const }
      : null;

    let moderatorStreamId: string | null = null;
    let moderatorKVStatus: MessageStatus | null = null;

    if (hasKV) {
      moderatorStreamId = await getActiveStreamId(threadId, currentRoundNumber, NO_PARTICIPANT_SENTINEL, c.env);

      if (moderatorStreamId) {
        const metadata = await getStreamMetadata(moderatorStreamId, c.env);
        const chunks = await getStreamChunks(moderatorStreamId, c.env);
        const lastChunkTime = chunks && chunks.length > 0
          ? Math.max(...chunks.map((chunk: { timestamp: number }) => chunk.timestamp))
          : 0;

        const stale = isStreamStale(
          lastChunkTime,
          metadata?.createdAt ?? 0,
          (chunks?.length ?? 0) > 0,
          STALE_CHUNK_TIMEOUT_MS,
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

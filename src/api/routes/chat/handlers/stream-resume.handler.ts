/**
 * Stream Resume Handler - Resume buffered streams across ALL phases
 *
 * Following AI SDK Chatbot Resume Streams documentation:
 * https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-resume-streams
 *
 * This handler enables stream resumption by returning buffered SSE chunks from KV.
 * Called automatically by AI SDK when `resume: true` is set in useChat.
 *
 * KEY PATTERN (from AI SDK docs):
 * 1. POST handler uses consumeSseStream to buffer chunks
 * 2. GET handler returns 204 if no active stream, or resumes the stream
 * 3. Frontend uses resume: true which triggers GET on mount
 *
 * ✅ UNIFIED RESUMPTION: Supports pre-search, participants, and summarizer phases
 * ✅ PATTERN: Uses Responses.sse() and Responses.noContentWithHeaders() from core
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { and, desc, eq } from 'drizzle-orm';

import { createError } from '@/api/common/error-handling';
import { createHandler, Responses } from '@/api/core';
import type { MessageStatus, RoundPhase } from '@/api/core/enums';
import { MessageStatuses, ParticipantStreamStatuses, RoundPhases, StreamStatuses } from '@/api/core/enums';
import { getActivePreSearchStreamId, getPreSearchStreamChunks, getPreSearchStreamMetadata } from '@/api/services/pre-search-stream-buffer.service';
import { clearThreadActiveStream, getNextParticipantToStream, getThreadActiveStream, updateParticipantStatus } from '@/api/services/resumable-stream-kv.service';
import { createLiveParticipantResumeStream, getStreamChunks, getStreamMetadata } from '@/api/services/stream-buffer.service';
import { getActiveSummaryStreamId, getSummaryStreamChunks, getSummaryStreamMetadata } from '@/api/services/summary-stream-buffer.service';
import type { ApiEnv } from '@/api/types';
import { parseStreamId } from '@/api/types/streaming';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type { getThreadStreamResumptionStateRoute, resumeThreadStreamRoute } from '../route';
import type { ParticipantPhaseStatus, PreSearchPhaseStatus, SummarizerPhaseStatus } from '../schema';
import { ThreadIdParamSchema } from '../schema';

// ============================================================================
// Thread Stream Resume Handler (AI SDK v5 Official Pattern)
// ============================================================================

/**
 * GET /chat/threads/:threadId/stream
 *
 * Resume active stream for a thread - follows AI SDK documentation pattern
 * Automatically looks up the active stream and returns buffered chunks
 *
 * This is the preferred endpoint for stream resumption. The frontend doesn't
 * need to construct the stream ID - the backend determines which stream to resume.
 *
 * Returns:
 * - 204 No Content: No active stream for this thread
 * - 200 OK: SSE stream with buffered chunks
 *
 * @pattern Following AI SDK Chatbot Resume Streams documentation
 */
export const resumeThreadStreamHandler: RouteHandler<typeof resumeThreadStreamRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'resumeThreadStream',
    validateParams: ThreadIdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId } = c.validated.params;

    // ✅ LOCAL DEV FIX: If KV is not available, return 204 immediately
    // Without KV, stream resumption cannot work properly.
    // Returning 204 prevents the AI SDK from receiving stale/corrupted data
    // that causes message ID mismatches and broken streaming state.
    if (!c.env?.KV) {
      return Responses.noContentWithHeaders();
    }

    // Verify thread ownership
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

    // ============================================================================
    // PHASE-AWARE STREAM DETECTION
    // Determine current round and check all phases for active streams
    // ============================================================================

    // Get current round from latest message
    const latestMessage = await db.query.chatMessage.findFirst({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: desc(tables.chatMessage.createdAt),
      columns: { roundNumber: true },
    });
    const currentRound = latestMessage?.roundNumber ?? 0;

    const STALE_CHUNK_TIMEOUT_MS = 15 * 1000;

    // ============================================================================
    // PHASE 1: Check for active PRE-SEARCH stream
    // ============================================================================
    // ✅ AI SDK RESUME FIX: Return 204 with phase metadata for pre-search phase
    // AI SDK's resume: true expects UIMessage format, but pre-search uses custom SSE format.
    // Instead of returning the stream (which AI SDK can't parse), return 204 with metadata.
    // The frontend PreSearchStream component has its own resumption logic that handles this.
    const preSearchStreamId = await getActivePreSearchStreamId(threadId, currentRound, c.env);
    if (preSearchStreamId) {
      const preSearchMetadata = await getPreSearchStreamMetadata(preSearchStreamId, c.env);
      const preSearchChunks = await getPreSearchStreamChunks(preSearchStreamId, c.env);

      // Check if pre-search is still active (not completed/failed)
      if (preSearchMetadata && (preSearchMetadata.status === StreamStatuses.ACTIVE || preSearchMetadata.status === StreamStatuses.STREAMING)) {
        // Check for staleness
        const lastChunkTime = preSearchChunks && preSearchChunks.length > 0
          ? Math.max(...preSearchChunks.map(chunk => chunk.timestamp))
          : 0;
        const isStale = lastChunkTime > 0 && Date.now() - lastChunkTime > STALE_CHUNK_TIMEOUT_MS;

        if (!isStale) {
          // ✅ AI SDK RESUME FIX: Return 204 with phase metadata instead of SSE stream
          // This tells the frontend that pre-search is active but should be handled
          // by PreSearchStream component, not AI SDK resume.
          // NOTE: Use 'presearch' (no underscore) to match SSEStreamMetadataSchema
          return Responses.noContentWithHeaders({
            phase: 'presearch',
            roundNumber: currentRound,
            streamId: preSearchStreamId,
          });
        }
      }
    }

    // ============================================================================
    // PHASE 2: Check for active PARTICIPANT stream
    // ============================================================================
    const activeStream = await getThreadActiveStream(threadId, c.env);

    if (activeStream && activeStream.roundNumber === currentRound) {
      // ✅ FIX: Get the next participant that needs to stream
      const nextParticipant = await getNextParticipantToStream(threadId, c.env);
      const roundComplete = !nextParticipant;
      const streamIdToResume = activeStream.streamId;

      // Parse and validate stream ID
      const parsed = parseStreamId(streamIdToResume);
      if (parsed && parsed.roundNumber !== activeStream.roundNumber) {
        // Stream ID is from different round - stale data
        return Responses.noContentWithHeaders();
      }

      // Get stream buffer metadata
      const metadata = await getStreamMetadata(streamIdToResume, c.env);

      if (!metadata) {
        // No buffer - return round info for frontend to trigger remaining participants
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

      // Check for stale stream
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
        // Mark stale participant as failed
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

      // Return live participant resume stream
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

    // ============================================================================
    // PHASE 3: Check for active SUMMARIZER stream
    // ============================================================================
    // ✅ AI SDK RESUME FIX: Return 204 with phase metadata for summarizer phase
    // AI SDK's resume: true expects UIMessage format, but summarizer uses useObject with custom schema.
    // Instead of returning the stream (which AI SDK can't parse), return 204 with metadata.
    // The frontend RoundSummaryStream component has its own resumption logic (attemptSummaryResume).
    const summarizerStreamId = await getActiveSummaryStreamId(threadId, currentRound, c.env);
    if (summarizerStreamId) {
      const summarizerMetadata = await getSummaryStreamMetadata(summarizerStreamId, c.env);
      const summarizerChunks = await getSummaryStreamChunks(summarizerStreamId, c.env);

      // Check if summarizer is still active (check both ACTIVE and STREAMING for consistency with pre-search)
      if (summarizerMetadata && (summarizerMetadata.status === StreamStatuses.ACTIVE || summarizerMetadata.status === StreamStatuses.STREAMING)) {
        // Check for staleness
        const lastChunkTime = summarizerChunks && summarizerChunks.length > 0
          ? Math.max(...summarizerChunks.map(chunk => chunk.timestamp))
          : 0;
        const isStale = lastChunkTime > 0 && Date.now() - lastChunkTime > STALE_CHUNK_TIMEOUT_MS;

        if (!isStale) {
          // ✅ AI SDK RESUME FIX: Return 204 with phase metadata instead of SSE stream
          // This tells the frontend that summarizer is active but should be handled
          // by RoundSummaryStream component (via attemptSummaryResume), not AI SDK resume.
          // NOTE: Use 'summarizer' to match SSEStreamMetadataSchema
          return Responses.noContentWithHeaders({
            phase: 'summarizer',
            roundNumber: currentRound,
            streamId: summarizerStreamId,
            summaryId: summarizerMetadata.summaryId,
          });
        }
      }
    }

    // No active stream found in any phase
    return Responses.noContentWithHeaders();
  },
);

// ============================================================================
// Thread Stream Resumption State Handler (Unified Metadata)
// ============================================================================

/**
 * Determine current round phase based on status of each phase
 */
function determineCurrentPhase(
  preSearchStatus: PreSearchPhaseStatus | null,
  participantStatus: ParticipantPhaseStatus,
  summarizerStatus: SummarizerPhaseStatus | null,
): RoundPhase {
  // Check pre-search phase first (if enabled)
  if (preSearchStatus?.enabled) {
    const status = preSearchStatus.status;
    if (status === MessageStatuses.PENDING || status === MessageStatuses.STREAMING) {
      return RoundPhases.PRE_SEARCH;
    }
  }

  // Check participants phase
  if (!participantStatus.allComplete) {
    return RoundPhases.PARTICIPANTS;
  }

  // Check summarizer phase
  if (summarizerStatus) {
    const status = summarizerStatus.status;
    if (status === MessageStatuses.PENDING || status === MessageStatuses.STREAMING) {
      return RoundPhases.SUMMARIZER;
    }
    if (status === MessageStatuses.COMPLETE) {
      return RoundPhases.COMPLETE;
    }
  }

  // All participants done but no summarizer started/needed
  return RoundPhases.COMPLETE;
}

/**
 * Check if a KV-tracked stream is stale based on last chunk time
 */
function isStreamStale(lastChunkTime: number, createdTime: number, hasChunks: boolean, staleTimeoutMs = 15000): boolean {
  if (hasChunks && lastChunkTime > 0) {
    return Date.now() - lastChunkTime > staleTimeoutMs;
  }
  // No chunks but stream exists - check creation time
  if (!hasChunks && createdTime > 0) {
    return Date.now() - createdTime > staleTimeoutMs;
  }
  return false;
}

/**
 * GET /chat/threads/:threadId/stream-status
 *
 * Get UNIFIED stream resumption state metadata for server-side prefetching.
 * Returns JSON metadata for ALL phases (pre-search, participants, summarizer).
 *
 * This enables:
 * 1. Server component to check for active streams during page load
 * 2. Zustand pre-fill with resumption state before React renders
 * 3. Proper coordination between AI SDK resume and incomplete-round-resumption
 * 4. Detection of current phase for seamless resumption
 *
 * Phase detection logic:
 * 1. If preSearch.status is 'pending' or 'streaming' → currentPhase = 'pre_search'
 * 2. If participants.allComplete is false → currentPhase = 'participants'
 * 3. If summarizer.status is 'pending' or 'streaming' → currentPhase = 'summarizer'
 * 4. Otherwise → currentPhase = 'complete' (or 'idle' if no round started)
 *
 * @pattern Following AI SDK Chatbot Resume Streams documentation
 */
export const getThreadStreamResumptionStateHandler: RouteHandler<typeof getThreadStreamResumptionStateRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getThreadStreamResumptionState',
    validateParams: ThreadIdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId } = c.validated.params;
    const STALE_CHUNK_TIMEOUT_MS = 15 * 1000;

    // Verify thread ownership and get thread config
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

    // Default response when no active stream in any phase
    const createIdleResponse = () => ({
      roundNumber: null,
      currentPhase: RoundPhases.IDLE as RoundPhase,
      preSearch: null,
      participants: {
        hasActiveStream: false,
        streamId: null,
        totalParticipants: null,
        currentParticipantIndex: null,
        participantStatuses: null,
        nextParticipantToTrigger: null,
        allComplete: true,
      } as ParticipantPhaseStatus,
      summarizer: null,
      roundComplete: true,
      // Legacy fields for backwards compatibility
      hasActiveStream: false,
      streamId: null,
      totalParticipants: null,
      participantStatuses: null,
      nextParticipantToTrigger: null,
    });

    // ✅ LOCAL DEV FIX: If KV is not available, check database only
    const hasKV = !!c.env?.KV;

    // ============================================================================
    // STEP 1: Determine current round number from latest message
    // ============================================================================
    const latestMessage = await db.query.chatMessage.findFirst({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: desc(tables.chatMessage.createdAt),
      columns: { roundNumber: true },
    });

    const currentRoundNumber = latestMessage?.roundNumber ?? 0;

    // ============================================================================
    // STEP 2: Get pre-search phase status (if web search enabled)
    // ============================================================================
    let preSearchStatus: PreSearchPhaseStatus | null = null;

    if (thread.enableWebSearch) {
      // Check database for pre-search record
      const preSearchRecord = await db.query.chatPreSearch.findFirst({
        where: and(
          eq(tables.chatPreSearch.threadId, threadId),
          eq(tables.chatPreSearch.roundNumber, currentRoundNumber),
        ),
        columns: { id: true, status: true },
      });

      // Check KV for active stream
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

          // Check if stream is stale
          const stale = isStreamStale(
            lastChunkTime,
            metadata?.createdAt ?? 0,
            (chunks?.length ?? 0) > 0,
            STALE_CHUNK_TIMEOUT_MS,
          );

          if (stale) {
            preSearchStreamId = null; // Mark as not resumable
            preSearchKVStatus = MessageStatuses.FAILED;
          } else if (metadata?.status === StreamStatuses.ACTIVE || metadata?.status === StreamStatuses.STREAMING) {
            preSearchKVStatus = MessageStatuses.STREAMING;
          } else if (metadata?.status === StreamStatuses.COMPLETED) {
            preSearchKVStatus = MessageStatuses.COMPLETE;
          }
        }
      }

      // Determine status from KV or DB
      const dbStatus = preSearchRecord?.status as MessageStatus | undefined;
      const effectiveStatus = preSearchKVStatus ?? dbStatus ?? null;

      preSearchStatus = {
        enabled: true,
        status: effectiveStatus,
        streamId: preSearchStreamId,
        preSearchId: preSearchRecord?.id ?? null,
      };
    }

    // ============================================================================
    // STEP 3: Get participant phase status
    // ============================================================================
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
        // Check for stale participant stream
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
          // Mark the stale participant as failed
          await updateParticipantStatus(
            threadId,
            activeStream.roundNumber,
            activeStream.participantIndex,
            ParticipantStreamStatuses.FAILED,
            c.env,
          );
        }

        // Get next participant that needs triggering (recalculate after potential status update)
        const nextParticipant = await getNextParticipantToStream(threadId, c.env);
        const allComplete = !nextParticipant;

        // If round is complete after marking stale participant as failed, clean up
        if (allComplete && stale) {
          await clearThreadActiveStream(threadId, c.env);
        } else {
          // Convert participantStatuses Record<number, string> to Record<string, string>
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

    // If no KV participant data, check if all participants have messages for this round
    if (!hasKV || !participantStatus.hasActiveStream) {
      const participants = await db.query.chatParticipant.findMany({
        where: and(
          eq(tables.chatParticipant.threadId, threadId),
          eq(tables.chatParticipant.isEnabled, true),
        ),
        columns: { id: true },
      });

      const totalParticipants = participants.length;

      // Count assistant messages for this round
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

    // ============================================================================
    // STEP 4: Get summarizer phase status
    // ============================================================================
    let summarizerStatus: SummarizerPhaseStatus | null = null;

    // Check database for summary record
    const summaryRecord = await db.query.chatModeratorAnalysis.findFirst({
      where: and(
        eq(tables.chatModeratorAnalysis.threadId, threadId),
        eq(tables.chatModeratorAnalysis.roundNumber, currentRoundNumber),
      ),
      columns: { id: true, status: true },
    });

    // Check KV for active stream
    let summaryStreamId: string | null = null;
    let summaryKVStatus: MessageStatus | null = null;

    if (hasKV) {
      summaryStreamId = await getActiveSummaryStreamId(threadId, currentRoundNumber, c.env);

      if (summaryStreamId) {
        const metadata = await getSummaryStreamMetadata(summaryStreamId, c.env);
        const chunks = await getSummaryStreamChunks(summaryStreamId, c.env);
        const lastChunkTime = chunks && chunks.length > 0
          ? Math.max(...chunks.map(chunk => chunk.timestamp))
          : 0;

        // Check if stream is stale
        const stale = isStreamStale(
          lastChunkTime,
          metadata?.createdAt ?? 0,
          (chunks?.length ?? 0) > 0,
          STALE_CHUNK_TIMEOUT_MS,
        );

        if (stale) {
          summaryStreamId = null; // Mark as not resumable
          summaryKVStatus = MessageStatuses.FAILED;
        } else if (metadata?.status === StreamStatuses.ACTIVE || metadata?.status === StreamStatuses.STREAMING) {
          summaryKVStatus = MessageStatuses.STREAMING;
        } else if (metadata?.status === StreamStatuses.COMPLETED) {
          summaryKVStatus = MessageStatuses.COMPLETE;
        }
      }
    }

    // Determine status from KV or DB
    const dbMessageStatus = summaryRecord?.status as MessageStatus | undefined;
    const effectiveMessageStatus = summaryKVStatus ?? dbMessageStatus ?? null;

    if (summaryRecord || summaryStreamId) {
      summarizerStatus = {
        status: effectiveMessageStatus,
        streamId: summaryStreamId,
        summaryId: summaryRecord?.id ?? null,
      };
    }

    // ============================================================================
    // STEP 5: Determine current phase and build response
    // ============================================================================
    const currentPhase = determineCurrentPhase(preSearchStatus, participantStatus, summarizerStatus);
    const roundComplete = currentPhase === RoundPhases.COMPLETE;

    // Check if there's any active stream
    const hasActiveStream = currentPhase !== RoundPhases.IDLE && currentPhase !== RoundPhases.COMPLETE;

    // If no activity at all, return idle response
    if (currentPhase === RoundPhases.IDLE) {
      return Responses.ok(c, createIdleResponse());
    }

    return Responses.ok(c, {
      roundNumber: currentRoundNumber,
      currentPhase,
      preSearch: preSearchStatus,
      participants: participantStatus,
      summarizer: summarizerStatus,
      roundComplete,
      // Legacy fields for backwards compatibility
      hasActiveStream,
      streamId: participantStatus.streamId,
      totalParticipants: participantStatus.totalParticipants,
      participantStatuses: participantStatus.participantStatuses,
      nextParticipantToTrigger: participantStatus.nextParticipantToTrigger,
    });
  },
);

/**
 * Stream Resume Handler - Resume buffered participant stream
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
 * ✅ PATTERN: Uses Responses.sse() and Responses.noContentWithHeaders() from core
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { createError } from '@/api/common/error-handling';
import { createHandler, Responses } from '@/api/core';
import { StreamStatuses } from '@/api/core/enums';
import { clearThreadActiveStream, getNextParticipantToStream, getThreadActiveStream } from '@/api/services/resumable-stream-kv.service';
import { createLiveParticipantResumeStream, getStreamChunks, getStreamMetadata } from '@/api/services/stream-buffer.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type { getThreadStreamResumptionStateRoute, resumeStreamRoute, resumeThreadStreamRoute } from '../route';
import { StreamIdParamSchema, ThreadIdParamSchema } from '../schema';

// ============================================================================
// Stream Resume Handler
// ============================================================================

/**
 * GET /chat/threads/:threadId/streams/:streamId/resume
 *
 * Resume participant stream from buffered SSE chunks
 * Returns 204 No Content if no buffer exists or stream has no chunks
 * Returns SSE stream if buffer has chunks
 *
 * @pattern Following stream-status.handler.ts pattern
 */
export const resumeStreamHandler: RouteHandler<typeof resumeStreamRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'resumeStream',
    validateParams: StreamIdParamSchema,
  },
  async (c) => {
    // ✅ LOCAL DEV FIX: If KV is not available, return 204 immediately
    // Without KV, stream resumption cannot work properly.
    if (!c.env?.KV) {
      return Responses.noContentWithHeaders();
    }

    const { user } = c.auth();
    const { streamId } = c.validated.params;

    // Parse stream ID to extract thread, round, and participant
    // Format: {threadId}_r{roundNumber}_p{participantIndex}
    const streamIdMatch = streamId.match(/^(.+)_r(\d+)_p(\d+)$/);

    if (!streamIdMatch) {
      throw createError.badRequest('Invalid stream ID format', { errorType: 'validation' });
    }

    // Extract capture groups - guaranteed to exist after successful match
    const threadId = streamIdMatch[1];
    const roundNumberStr = streamIdMatch[2];
    const participantIndexStr = streamIdMatch[3];

    // Type guard: Verify all capture groups exist
    if (!threadId || !roundNumberStr || !participantIndexStr) {
      throw createError.badRequest('Invalid stream ID format', { errorType: 'validation' });
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

    // Get stream buffer metadata
    const metadata = await getStreamMetadata(streamId, c.env);

    // No buffer exists - return 204 No Content
    if (!metadata) {
      return Responses.noContentWithHeaders();
    }

    // ✅ AI SDK RESUME PATTERN: Return live stream with standard headers
    // The stream polls KV for new chunks as they arrive from the original stream
    const isStreamActive = metadata.status === StreamStatuses.ACTIVE;
    const liveStream = createLiveParticipantResumeStream(streamId, c.env);

    // Return SSE stream using Responses.sse() builder
    return Responses.sse(liveStream, {
      isActive: isStreamActive,
      resumedFromBuffer: true,
    });
  },
);

// ============================================================================
// Thread Stream Resume Handler (AI SDK Documentation Pattern)
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

    // Get thread-level active stream
    const activeStream = await getThreadActiveStream(threadId, c.env);

    // No active stream - return 204 No Content
    if (!activeStream) {
      return Responses.noContentWithHeaders();
    }

    // ✅ FIX: Get the next participant that needs to stream (may be different from activeStream.participantIndex)
    // This handles the case where one participant finished but another still needs to stream
    const nextParticipant = await getNextParticipantToStream(threadId, c.env);

    // If no next participant and all are done, the round is complete
    const roundComplete = !nextParticipant;

    // Determine which stream to return:
    // - If there's an actively streaming participant, return their stream
    // - Otherwise, return the last active stream's buffered data
    const streamIdToResume = activeStream.streamId;

    // ✅ CRITICAL FIX: Validate stream ID matches active stream metadata
    // The stream ID format is: {threadId}_r{roundNumber}_p{participantIndex}
    // If the stream ID's round/participant doesn't match activeStream metadata,
    // the KV data is stale and we should return 204 instead of corrupted data.
    const streamIdMatch = streamIdToResume.match(/^(.+)_r(\d+)_p(\d+)$/);
    if (streamIdMatch) {
      const streamIdRound = Number.parseInt(streamIdMatch[2]!, 10);
      const streamIdParticipant = Number.parseInt(streamIdMatch[3]!, 10);

      // Check if stream ID round/participant matches activeStream metadata
      if (streamIdRound !== activeStream.roundNumber) {
        // Stream ID is from a different round - KV data is stale
        // Return 204 so frontend triggers fresh streaming instead of using corrupted data
        return Responses.noContentWithHeaders();
      }

      // Also validate participant index matches for extra safety
      if (streamIdParticipant !== activeStream.participantIndex) {
        // Participant mismatch - this could be a race condition or stale data
        // Return 204 to be safe
        return Responses.noContentWithHeaders();
      }
    }

    // Get stream buffer metadata
    const metadata = await getStreamMetadata(streamIdToResume, c.env);

    // No buffer exists - return 204 with round info so frontend can trigger remaining participants
    if (!metadata) {
      // ✅ FIX: Even without buffer, return round info so frontend knows what to do
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

    // ✅ STALE CHUNK DETECTION: Check if stream has received data recently
    // When user refreshes mid-stream, the original worker dies but KV still has chunks.
    // Without this check, the live resume stream polls forever waiting for more chunks.
    // If the last chunk is older than threshold, the stream is stale and we should
    // return 204 so frontend can trigger incomplete round resumption (fresh stream).
    const STALE_CHUNK_TIMEOUT_MS = 15 * 1000;
    const chunks = await getStreamChunks(streamIdToResume, c.env);
    const lastChunkTime = chunks && chunks.length > 0
      ? Math.max(...chunks.map(chunk => chunk.timestamp))
      : 0;
    const isStaleStream = lastChunkTime > 0 && Date.now() - lastChunkTime > STALE_CHUNK_TIMEOUT_MS;

    if (isStaleStream) {
      // Stream is stale - clear KV state and return 204
      // Frontend's incomplete round resumption will trigger fresh participant stream
      await clearThreadActiveStream(threadId, c.env);

      // Return 204 with round info so frontend knows what participant to trigger
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

    // ✅ AI SDK RESUME PATTERN: Return live stream with standard headers
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-resume-streams
    // The stream polls KV for new chunks as they arrive from the original stream
    const isStreamActive = metadata.status === StreamStatuses.ACTIVE;
    const liveStream = createLiveParticipantResumeStream(streamIdToResume, c.env);

    // Return SSE stream using Responses.sse() builder with multi-participant metadata
    return Responses.sse(liveStream, {
      streamId: streamIdToResume,
      roundNumber: activeStream.roundNumber,
      participantIndex: activeStream.participantIndex,
      totalParticipants: activeStream.totalParticipants,
      participantStatuses: activeStream.participantStatuses,
      isActive: isStreamActive,
      roundComplete,
      resumedFromBuffer: true,
      ...(nextParticipant ? { nextParticipantIndex: nextParticipant.participantIndex } : {}),
    });
  },
);

// ============================================================================
// Thread Stream Resumption State Handler (Metadata Only)
// ============================================================================

/**
 * GET /chat/threads/:threadId/stream-status
 *
 * Get stream resumption state metadata for server-side prefetching.
 * Returns JSON metadata only (not the SSE stream itself).
 *
 * This enables:
 * 1. Server component to check for active streams during page load
 * 2. Zustand pre-fill with resumption state before React renders
 * 3. Proper coordination between AI SDK resume and incomplete-round-resumption
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

    // Default response when no KV or no active stream
    const noActiveStreamResponse = {
      hasActiveStream: false,
      streamId: null,
      roundNumber: null,
      totalParticipants: null,
      participantStatuses: null,
      nextParticipantToTrigger: null,
      roundComplete: true,
    };

    // ✅ LOCAL DEV FIX: If KV is not available, return no active stream
    if (!c.env?.KV) {
      return Responses.ok(c, noActiveStreamResponse);
    }

    // Get thread-level active stream state from KV
    const activeStream = await getThreadActiveStream(threadId, c.env);

    // No active stream - return clean state
    if (!activeStream) {
      return Responses.ok(c, noActiveStreamResponse);
    }

    // Get next participant that needs triggering
    const nextParticipant = await getNextParticipantToStream(threadId, c.env);
    const roundComplete = !nextParticipant;

    // Convert participantStatuses Record<number, string> to Record<string, string> for JSON
    const participantStatusesStringKeyed = activeStream.participantStatuses
      ? Object.fromEntries(
          Object.entries(activeStream.participantStatuses).map(([k, v]) => [String(k), v]),
        )
      : null;

    return Responses.ok(c, {
      hasActiveStream: true,
      streamId: activeStream.streamId,
      roundNumber: activeStream.roundNumber,
      totalParticipants: activeStream.totalParticipants,
      participantStatuses: participantStatusesStringKeyed,
      nextParticipantToTrigger: nextParticipant?.participantIndex ?? null,
      roundComplete,
    });
  },
);

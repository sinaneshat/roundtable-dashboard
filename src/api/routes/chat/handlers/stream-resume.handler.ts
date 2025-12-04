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
import { getNextParticipantToStream, getThreadActiveStream } from '@/api/services/resumable-stream-kv.service';
import { createLiveParticipantResumeStream, getStreamMetadata } from '@/api/services/stream-buffer.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type { resumeStreamRoute, resumeThreadStreamRoute } from '../route';
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

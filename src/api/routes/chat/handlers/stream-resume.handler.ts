/**
 * Stream Resume Handler - Resume buffered participant stream
 *
 * Following backend-patterns.md: Domain-specific handler module
 *
 * This handler enables stream resumption by returning buffered SSE chunks from KV.
 * Used when frontend detects page reload during active streaming.
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createError } from '@/api/common/error-handling';
import { createHandler } from '@/api/core';
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
      return c.body(null, HttpStatusCodes.NO_CONTENT);
    }

    // ✅ LIVE STREAM RESUMPTION: Return a live stream that polls for new chunks
    // This enables true stream resumption - the stream continues where it left off
    // and polls for new chunks as they arrive from the original stream
    const isStreamActive = metadata.status === StreamStatuses.ACTIVE;
    const liveStream = createLiveParticipantResumeStream(streamId, c.env);

    // Return live SSE stream
    return new Response(liveStream, {
      status: HttpStatusCodes.OK,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        'X-Resumed-From-Buffer': 'true',
        'X-Stream-Active': String(isStreamActive),
      },
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
      return c.body(null, HttpStatusCodes.NO_CONTENT);
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
        return new Response(null, {
          status: HttpStatusCodes.NO_CONTENT,
          headers: {
            // Include round info even on 204 so frontend can trigger next participant
            'X-Round-Number': String(activeStream.roundNumber),
            'X-Total-Participants': String(activeStream.totalParticipants),
            'X-Next-Participant-Index': String(nextParticipant.participantIndex),
            'X-Participant-Statuses': JSON.stringify(activeStream.participantStatuses),
            'X-Round-Complete': 'false',
          },
        });
      }
      return c.body(null, HttpStatusCodes.NO_CONTENT);
    }

    // ✅ LIVE STREAM RESUMPTION: Return a live stream that polls for new chunks
    // This enables true stream resumption - the stream continues where it left off
    // and polls for new chunks as they arrive from the original stream
    const isStreamActive = metadata.status === StreamStatuses.ACTIVE;
    const liveStream = createLiveParticipantResumeStream(streamIdToResume, c.env);

    // Return live SSE stream with metadata headers
    // ✅ FIX: Include round completion info so frontend can trigger remaining participants
    return new Response(liveStream, {
      status: HttpStatusCodes.OK,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        'X-Resumed-From-Buffer': 'true',
        'X-Stream-Active': String(isStreamActive),
        // Include stream metadata in headers for frontend to update state
        'X-Stream-Id': streamIdToResume,
        'X-Round-Number': String(activeStream.roundNumber),
        'X-Participant-Index': String(activeStream.participantIndex),
        // ✅ FIX: Include round completion info for proper multi-participant resumption
        'X-Total-Participants': String(activeStream.totalParticipants),
        'X-Participant-Statuses': JSON.stringify(activeStream.participantStatuses),
        'X-Round-Complete': String(roundComplete),
        ...(nextParticipant ? { 'X-Next-Participant-Index': String(nextParticipant.participantIndex) } : {}),
      },
    });
  },
);

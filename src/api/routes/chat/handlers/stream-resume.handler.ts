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
import { chunksToSSEStream, getStreamChunks, getStreamMetadata } from '@/api/services/stream-buffer.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type { resumeStreamRoute } from '../route';

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
  },
  async (c) => {
    const { user } = c.auth();
    const { streamId } = c.req.param();

    // Type guard: Verify streamId exists
    if (!streamId) {
      throw createError.badRequest('Stream ID is required', { errorType: 'validation' });
    }

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

    // Get buffered chunks
    const chunks = await getStreamChunks(streamId, c.env);

    // No chunks available - return 204 No Content
    if (!chunks || chunks.length === 0) {
      return c.body(null, HttpStatusCodes.NO_CONTENT);
    }

    // Convert chunks to SSE stream
    const sseStream = chunksToSSEStream(chunks);

    // Return SSE stream
    return new Response(sseStream, {
      status: HttpStatusCodes.OK,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      },
    });
  },
);

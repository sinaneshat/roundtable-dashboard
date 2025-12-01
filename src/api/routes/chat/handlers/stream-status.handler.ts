/**
 * Stream Status Handler - Check participant stream status for resumption
 *
 * Following backend-patterns.md: Domain-specific handler module
 *
 * This handler enables resumable streams by checking if a participant stream
 * is active or completed in Cloudflare KV.
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createError } from '@/api/common/error-handling';
import { createHandler } from '@/api/core';
import { OperationStatuses } from '@/api/core/enums';
import { getStreamState } from '@/api/services/resumable-stream-kv.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type { getStreamStatusRoute } from '../route';
import { StreamIdParamSchema } from '../schema';

// ============================================================================
// Stream Status Handler
// ============================================================================

/**
 * GET /chat/threads/:threadId/streams/:streamId
 *
 * Check participant stream status for resumption
 * Returns 204 No Content if no stream exists or stream is still active
 * Returns stream metadata if stream is completed or failed
 *
 * @pattern Following pre-search.handler.ts and analysis.handler.ts patterns
 */
export const getStreamStatusHandler: RouteHandler<typeof getStreamStatusRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getStreamStatus',
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

    const roundNumber = Number.parseInt(roundNumberStr, 10);
    const participantIndex = Number.parseInt(participantIndexStr, 10);

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

    // Get stream state from KV
    const streamState = await getStreamState(
      threadId,
      roundNumber,
      participantIndex,
      c.env,
    );

    // No stream state = no active or completed stream
    if (!streamState) {
      return c.body(null, HttpStatusCodes.NO_CONTENT);
    }

    // Stream is still active - return 204 No Content
    // Frontend should continue polling or wait
    if (streamState.status === OperationStatuses.ACTIVE) {
      return c.body(null, HttpStatusCodes.NO_CONTENT);
    }

    // Stream is completed or failed - return state
    return c.json(
      {
        ok: true,
        data: streamState,
      },
      HttpStatusCodes.OK,
    );
  },
);

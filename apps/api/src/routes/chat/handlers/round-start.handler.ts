/**
 * Round Start Handler - Queue-based round orchestration
 *
 * Starts a round with full queue orchestration for backend-first streaming.
 * When web search is enabled:
 * START_ROUND → presearch → P0 → P1 → ... → moderator
 *
 * Frontend calls this instead of POST /chat when enableWebSearch is true.
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { MessagePartTypes, MessageRoles, RoundOrchestrationMessageTypes } from '@roundtable/shared/enums';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import { createHandler, Responses, ThreadRoundParamSchema } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { DbMessageParts } from '@/db/schemas/chat-metadata';
import { extractSessionToken } from '@/lib/auth';
import { rlog } from '@/lib/utils/dev-logger';
import type { ApiEnv } from '@/types';
import type { StartRoundQueueMessage } from '@/types/queues';

import type { startRoundRoute } from '../route';
import { StartRoundRequestSchema } from '../schema';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extract text content from message parts array
 */
function extractTextFromParts(parts: DbMessageParts | null): string {
  if (!parts || !Array.isArray(parts)) {
    return '';
  }
  return parts
    .filter(p => p.type === 'text' && 'text' in p)
    .map(p => ('text' in p ? p.text : ''))
    .join('');
}

// ============================================================================
// START ROUND HANDLER
// ============================================================================

/**
 * Start a round with queue-based orchestration.
 *
 * This handler:
 * 1. Validates thread ownership
 * 2. Saves user message to database (if not already saved)
 * 3. Queues START_ROUND message for orchestration
 * 4. Returns 202 Accepted
 *
 * The queue worker will then:
 * - Check if web search is enabled → trigger presearch
 * - After presearch (or if disabled) → trigger P0
 * - After each participant → trigger next
 * - After all participants → trigger moderator
 */
export const startRoundHandler: RouteHandler<typeof startRoundRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'startRound',
    validateBody: StartRoundRequestSchema,
    validateParams: ThreadRoundParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const db = await getDbAsync();
    const { roundNumber: roundNumberStr, threadId } = c.validated.params;
    const { attachmentIds, enableWebSearch, message } = c.validated.body;
    const roundNumber = Number.parseInt(roundNumberStr, 10);

    // Extract session token from cookie for queue authentication
    const sessionToken = extractSessionToken(c.req.header('cookie'));

    if (Number.isNaN(roundNumber) || roundNumber < 0) {
      throw createError.badRequest('Invalid round number');
    }

    // 1. Verify thread ownership
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

    // 2. Update enableWebSearch if provided and different from current value
    if (enableWebSearch !== undefined && enableWebSearch !== thread.enableWebSearch) {
      await db.update(tables.chatThread)
        .set({
          enableWebSearch,
          updatedAt: new Date(),
        })
        .where(eq(tables.chatThread.id, threadId));
      thread.enableWebSearch = enableWebSearch;
      rlog.phase('start-round', `Updated enableWebSearch=${enableWebSearch} for thread ${threadId}`);
    }

    // 3. Check if round is already active
    const existingExecution = await db.query.roundExecution.findFirst({
      where: and(
        eq(tables.roundExecution.threadId, threadId),
        eq(tables.roundExecution.roundNumber, roundNumber),
      ),
    });

    if (existingExecution && existingExecution.status !== 'completed' && existingExecution.status !== 'failed') {
      return Responses.accepted(c, {
        roundNumber,
        status: 'already_active' as const,
        threadId,
      });
    }

    // 4. Extract user query from message
    const messageParts = message.parts ?? [];
    const userQuery = extractTextFromParts(messageParts as DbMessageParts);

    if (!userQuery.trim()) {
      throw createError.badRequest('Message content is required');
    }

    // 5. Save user message to database (if not already saved)
    const existingMessage = await db.query.chatMessage.findFirst({
      where: eq(tables.chatMessage.id, message.id),
    });

    if (!existingMessage) {
      const messageId = message.id || ulid();
      const partsToSave = messageParts.length > 0
        ? messageParts
        : [{ text: userQuery, type: MessagePartTypes.TEXT }];

      // ✅ IDEMPOTENT: Use onConflictDoNothing to handle race conditions
      // Thread PATCH may have inserted the message between our check and insert
      await db.insert(tables.chatMessage).values({
        id: messageId,
        metadata: {
          createdAt: new Date().toISOString(),
          role: MessageRoles.USER,
          roundNumber,
        },
        participantId: null,
        parts: partsToSave as DbMessageParts,
        role: MessageRoles.USER,
        roundNumber,
        threadId,
      }).onConflictDoNothing({ target: tables.chatMessage.id });

      rlog.phase('start-round', `Saved user message ${messageId} for r${roundNumber}`);
    }

    // 6. Queue START_ROUND message
    const queueMessage: StartRoundQueueMessage = {
      attachmentIds,
      messageId: `start-${threadId}-r${roundNumber}-${Date.now()}`,
      queuedAt: new Date().toISOString(),
      roundNumber,
      sessionToken,
      threadId,
      type: RoundOrchestrationMessageTypes.START_ROUND,
      userId: user.id,
      userQuery,
    };

    await c.env.ROUND_ORCHESTRATION_QUEUE.send(queueMessage);

    rlog.frame(1, 'start-round', `r${roundNumber} queued START_ROUND for ${threadId}`);

    // 7. Return 202 Accepted
    return Responses.accepted(c, {
      roundNumber,
      status: 'queued' as const,
      threadId,
    });
  },
);

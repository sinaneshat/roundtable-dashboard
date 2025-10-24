/**
 * Feedback Handlers - User feedback on analysis rounds
 *
 * Following backend-patterns.md: Domain-specific handler module
 * Extracted from monolithic handler.ts for better maintainability
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import { createHandler, Responses } from '@/api/core';
import { IdParamSchema } from '@/api/core/schemas';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type {
  getThreadFeedbackRoute,
  setRoundFeedbackRoute,
} from '../route';
import {
  RoundFeedbackParamSchema,
  RoundFeedbackRequestSchema,
} from '../schema';

// ============================================================================
// Feedback Handlers
// ============================================================================

export const setRoundFeedbackHandler: RouteHandler<typeof setRoundFeedbackRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: RoundFeedbackParamSchema,
    validateBody: RoundFeedbackRequestSchema,
    operationName: 'setRoundFeedback',
  },
  async (c) => {
    const { threadId, roundNumber: roundNumberStr } = c.validated.params;
    const { feedbackType } = c.validated.body;
    const roundNumber = Number.parseInt(roundNumberStr, 10);

    const db = await getDbAsync();
    const user = c.get('user');

    if (!user) {
      throw createError.unauthenticated(
        'Authentication required',
        ErrorContextBuilders.auth(),
      );
    }

    // ✅ Verify thread exists and belongs to user
    const thread = await db.query.chatThread.findFirst({
      where: and(
        eq(tables.chatThread.id, threadId),
        eq(tables.chatThread.userId, user.id),
      ),
    });

    if (!thread) {
      throw createError.notFound(
        'Thread not found',
        ErrorContextBuilders.resourceNotFound('thread', threadId),
      );
    }

    // ✅ Check if feedback already exists
    const existingFeedback = await db.query.chatRoundFeedback.findFirst({
      where: and(
        eq(tables.chatRoundFeedback.threadId, threadId),
        eq(tables.chatRoundFeedback.userId, user.id),
        eq(tables.chatRoundFeedback.roundNumber, roundNumber),
      ),
    });

    let result;

    if (feedbackType === null) {
      // ✅ DELETE: Remove feedback if exists
      if (existingFeedback) {
        await db
          .delete(tables.chatRoundFeedback)
          .where(eq(tables.chatRoundFeedback.id, existingFeedback.id));
      }

      // Return null feedback (removed)
      result = {
        id: existingFeedback?.id || ulid(),
        threadId,
        userId: user.id,
        roundNumber,
        feedbackType: null,
        createdAt: existingFeedback?.createdAt || /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date(),
      };
    } else if (existingFeedback) {
      // ✅ UPDATE: Update existing feedback
      const [updated] = await db
        .update(tables.chatRoundFeedback)
        .set({
          feedbackType,
          updatedAt: /* @__PURE__ */ new Date(),
        })
        .where(eq(tables.chatRoundFeedback.id, existingFeedback.id))
        .returning();

      if (!updated) {
        throw createError.internal(
          'Failed to update feedback',
          ErrorContextBuilders.database('update', 'chat_round_feedback'),
        );
      }

      result = updated;
    } else {
    // Intentionally empty
      // ✅ CREATE: Insert new feedback
      const [created] = await db
        .insert(tables.chatRoundFeedback)
        .values({
          id: ulid(),
          threadId,
          userId: user.id,
          roundNumber,
          feedbackType,
          createdAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date(),
        })
        .returning();

      if (!created) {
        throw createError.internal(
          'Failed to create feedback',
          ErrorContextBuilders.database('insert', 'chat_round_feedback'),
        );
      }

      result = created;
    }

    // ✅ Serialize dates to ISO strings for API response
    return Responses.ok(c, {
      ...result,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    });
  },
);

export const getThreadFeedbackHandler: RouteHandler<typeof getThreadFeedbackRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getThreadFeedback',
  },
  async (c) => {
    const { id: threadId } = c.validated.params;
    const db = await getDbAsync();
    const user = c.get('user');

    if (!user) {
      throw createError.unauthenticated(
        'Authentication required',
        ErrorContextBuilders.auth(),
      );
    }

    // ✅ Verify thread exists and belongs to user
    const thread = await db.query.chatThread.findFirst({
      where: and(
        eq(tables.chatThread.id, threadId),
        eq(tables.chatThread.userId, user.id),
      ),
    });

    if (!thread) {
      throw createError.notFound(
        'Thread not found',
        ErrorContextBuilders.resourceNotFound('thread', threadId),
      );
    }

    // ✅ Get all feedback for this thread and user
    const feedbackList = await db.query.chatRoundFeedback.findMany({
      where: and(
        eq(tables.chatRoundFeedback.threadId, threadId),
        eq(tables.chatRoundFeedback.userId, user.id),
      ),
      orderBy: (table, { asc }) => [asc(table.roundNumber)],
    });

    // ✅ Serialize dates to ISO strings for API response
    return Responses.ok(
      c,
      feedbackList.map(feedback => ({
        ...feedback,
        createdAt: feedback.createdAt.toISOString(),
        updatedAt: feedback.updatedAt.toISOString(),
      })),
    );
  },
);

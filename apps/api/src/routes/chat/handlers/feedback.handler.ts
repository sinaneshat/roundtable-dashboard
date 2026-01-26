import type { RouteHandler } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import { verifyThreadOwnership } from '@/common/permissions';
import { createHandler, IdParamSchema, Responses } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ApiEnv } from '@/types';

import type {
  getThreadFeedbackRoute,
  setRoundFeedbackRoute,
} from '../route';
import {
  RoundFeedbackParamSchema,
  RoundFeedbackRequestSchema,
} from '../schema';

export const setRoundFeedbackHandler: RouteHandler<typeof setRoundFeedbackRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'setRoundFeedback',
    validateBody: RoundFeedbackRequestSchema,
    validateParams: RoundFeedbackParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { roundNumber: roundNumberStr, threadId } = c.validated.params;
    const { feedbackType } = c.validated.body;
    const roundNumber = Number.parseInt(roundNumberStr, 10);
    const db = await getDbAsync();
    await verifyThreadOwnership(threadId, user.id, db);
    const existingFeedback = await db.query.chatRoundFeedback.findFirst({
      where: and(
        eq(tables.chatRoundFeedback.threadId, threadId),
        eq(tables.chatRoundFeedback.userId, user.id),
        eq(tables.chatRoundFeedback.roundNumber, roundNumber),
      ),
    });
    let result;
    if (feedbackType === null) {
      if (existingFeedback) {
        await db
          .delete(tables.chatRoundFeedback)
          .where(eq(tables.chatRoundFeedback.id, existingFeedback.id));
      }
      result = {
        createdAt: existingFeedback?.createdAt || new Date(),
        feedbackType: null,
        id: existingFeedback?.id || ulid(),
        roundNumber,
        threadId,
        updatedAt: new Date(),
        userId: user.id,
      };
    } else if (existingFeedback) {
      const [updated] = await db
        .update(tables.chatRoundFeedback)
        .set({
          feedbackType,
          updatedAt: new Date(),
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
      const [created] = await db
        .insert(tables.chatRoundFeedback)
        .values({
          createdAt: new Date(),
          feedbackType,
          id: ulid(),
          roundNumber,
          threadId,
          updatedAt: new Date(),
          userId: user.id,
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
    operationName: 'getThreadFeedback',
    validateParams: IdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { id: threadId } = c.validated.params;
    const db = await getDbAsync();
    await verifyThreadOwnership(threadId, user.id, db);
    const feedbackList = await db.query.chatRoundFeedback.findMany({
      orderBy: (table, { asc }) => [asc(table.roundNumber)],
      where: and(
        eq(tables.chatRoundFeedback.threadId, threadId),
        eq(tables.chatRoundFeedback.userId, user.id),
      ),
    });
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

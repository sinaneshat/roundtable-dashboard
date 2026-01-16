import type { RouteHandler } from '@hono/zod-openapi';
import { and, desc, eq } from 'drizzle-orm';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import { createHandler, Responses, ThreadRoundParamSchema } from '@/api/core';
import { MessageRoles, MessageStatuses, RoundExecutionStatuses } from '@/api/core/enums';
import {
  computeRoundStatus,
  getIncompleteParticipants,
  getRoundExecutionState,
  incrementRecoveryAttempts,
  RoundPreSearchStatuses,
} from '@/api/services/round-orchestration/round-orchestration.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { DbMessageParts } from '@/db/schemas/chat-metadata';

import type { getRoundStatusRoute } from '../route';
import type { RoundStatus } from '../schema';

/**
 * Extract text content from message parts array
 */
function extractTextFromParts(parts: DbMessageParts | null): string | undefined {
  if (!parts || !Array.isArray(parts)) {
    return undefined;
  }
  // Find first text part
  const textPart = parts.find(p => p.type === 'text');
  return textPart && 'text' in textPart ? textPart.text : undefined;
}

/**
 * GET /chat/threads/:threadId/rounds/:roundNumber/status
 *
 * Internal endpoint for queue workers to determine next action in round orchestration.
 * Returns current round status, participant completion, and what needs to be triggered next.
 *
 * Used by ROUND_ORCHESTRATION_QUEUE worker at:
 * src/workers/round-orchestration-queue.ts:232-263
 */
export const getRoundStatusHandler: RouteHandler<typeof getRoundStatusRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getRoundStatus',
    validateParams: ThreadRoundParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId, roundNumber: roundNumberStr } = c.validated.params;
    const roundNumber = Number.parseInt(roundNumberStr, 10);

    if (Number.isNaN(roundNumber) || roundNumber < 0) {
      throw createError.badRequest('Invalid round number');
    }

    const db = await getDbAsync();

    // Validate thread ownership
    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, threadId),
      columns: { id: true, userId: true, enableWebSearch: true },
    });

    if (!thread) {
      throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', threadId, user.id));
    }

    if (thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to access this thread', ErrorContextBuilders.authorization('thread', threadId, user.id));
    }

    // Get participants
    const participants = await db.query.chatParticipant.findMany({
      where: and(
        eq(tables.chatParticipant.threadId, threadId),
        eq(tables.chatParticipant.isEnabled, true),
      ),
      columns: { id: true },
    });

    const totalParticipants = participants.length;

    // Compute round status using service function
    const roundStatusResult = await computeRoundStatus({
      threadId,
      roundNumber,
      env: c.env,
      db,
    });

    // Get KV state for additional info (attachmentIds, recovery attempts)
    const kvState = await getRoundExecutionState(threadId, roundNumber, c.env);

    // Increment recovery attempts and check if can recover
    const { canRecover, attempts, maxAttempts } = await incrementRecoveryAttempts(
      threadId,
      roundNumber,
      c.env,
    );

    // Determine needsPreSearch
    let needsPreSearch = false;
    let userQuery: string | undefined;

    if (thread.enableWebSearch) {
      // Check pre-search record status in chatPreSearch table
      const preSearchRecord = await db.query.chatPreSearch.findFirst({
        where: and(
          eq(tables.chatPreSearch.threadId, threadId),
          eq(tables.chatPreSearch.roundNumber, roundNumber),
        ),
        columns: { id: true, status: true },
      });

      // Also check KV state for pre-search status
      const kvPreSearchStatus = kvState?.preSearchStatus;

      // needsPreSearch = enableWebSearch && (no record OR status !== 'complete')
      // DB uses MessageStatuses.COMPLETE ('complete'), KV uses RoundPreSearchStatuses.COMPLETED ('completed')
      const preSearchComplete = preSearchRecord?.status === MessageStatuses.COMPLETE
        || kvPreSearchStatus === RoundPreSearchStatuses.COMPLETED;
      needsPreSearch = !preSearchComplete;

      // Get user query from user message if pre-search is needed
      if (needsPreSearch) {
        const userMessage = await db.query.chatMessage.findFirst({
          where: and(
            eq(tables.chatMessage.threadId, threadId),
            eq(tables.chatMessage.roundNumber, roundNumber),
            eq(tables.chatMessage.role, MessageRoles.USER),
          ),
          orderBy: desc(tables.chatMessage.createdAt),
          columns: { parts: true },
        });
        userQuery = extractTextFromParts(userMessage?.parts ?? null);
      }
    }

    // Determine nextParticipantIndex
    const incompleteParticipants = await getIncompleteParticipants(
      threadId,
      roundNumber,
      totalParticipants,
      c.env,
      db,
    );
    const nextParticipantIndex = incompleteParticipants.length > 0 ? incompleteParticipants[0]! : null;

    // Determine needsModerator
    // totalParticipants >= 2 && completedParticipants >= total && !hasModeratorMessage
    const needsModerator = totalParticipants >= 2
      && roundStatusResult.completedParticipants >= totalParticipants
      && !roundStatusResult.hasModeratorMessage;

    // Determine overall status
    let status = roundStatusResult.status;
    if (!canRecover && status === RoundExecutionStatuses.RUNNING) {
      // Max recovery attempts reached - mark as failed
      status = RoundExecutionStatuses.FAILED;
    }

    const response: RoundStatus = {
      status,
      phase: roundStatusResult.phase,
      totalParticipants,
      completedParticipants: roundStatusResult.completedParticipants,
      failedParticipants: roundStatusResult.failedParticipants,
      nextParticipantIndex,
      needsModerator,
      needsPreSearch,
      userQuery,
      attachmentIds: kvState?.attachmentIds,
      canRecover,
      recoveryAttempts: attempts,
      maxRecoveryAttempts: maxAttempts,
    };

    return Responses.ok(c, response);
  },
);

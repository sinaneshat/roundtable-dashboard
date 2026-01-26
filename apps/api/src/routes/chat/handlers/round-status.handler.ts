import type { RouteHandler } from '@hono/zod-openapi';
import { MessageRoles, MessageStatuses, RoundExecutionStatuses } from '@roundtable/shared/enums';
import { and, desc, eq } from 'drizzle-orm';

import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import { createHandler, Responses, ThreadRoundParamSchema } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { DbMessageParts } from '@/db/schemas/chat-metadata';
import {
  computeRoundStatus,
  getIncompleteParticipants,
  getRoundExecutionState,
  incrementRecoveryAttempts,
  RoundPreSearchStatuses,
} from '@/services/round-orchestration/round-orchestration.service';
import type { ApiEnv } from '@/types';

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
    const { roundNumber: roundNumberStr, threadId } = c.validated.params;
    const roundNumber = Number.parseInt(roundNumberStr, 10);

    if (Number.isNaN(roundNumber) || roundNumber < 0) {
      throw createError.badRequest('Invalid round number');
    }

    const db = await getDbAsync();

    // Validate thread ownership
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

    // Get participants
    const participants = await db.query.chatParticipant.findMany({
      columns: { id: true },
      where: and(
        eq(tables.chatParticipant.threadId, threadId),
        eq(tables.chatParticipant.isEnabled, true),
      ),
    });

    const totalParticipants = participants.length;

    // Compute round status using service function
    const roundStatusResult = await computeRoundStatus({
      db,
      env: c.env,
      roundNumber,
      threadId,
    });

    // Get KV state for additional info (attachmentIds, recovery attempts)
    const kvState = await getRoundExecutionState(threadId, roundNumber, c.env);

    // Increment recovery attempts and check if can recover
    const { attempts, canRecover, maxAttempts } = await incrementRecoveryAttempts(
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
        columns: { id: true, status: true },
        where: and(
          eq(tables.chatPreSearch.threadId, threadId),
          eq(tables.chatPreSearch.roundNumber, roundNumber),
        ),
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
          columns: { parts: true },
          orderBy: desc(tables.chatMessage.createdAt),
          where: and(
            eq(tables.chatMessage.threadId, threadId),
            eq(tables.chatMessage.roundNumber, roundNumber),
            eq(tables.chatMessage.role, MessageRoles.USER),
          ),
        });
        userQuery = extractTextFromParts(userMessage?.parts ?? null);
      }
    }

    // Determine nextParticipantIndex - only compute if presearch is complete or not needed
    let nextParticipantIndex: number | null = null;

    if (!needsPreSearch) {
      const incompleteParticipants = await getIncompleteParticipants(
        threadId,
        roundNumber,
        totalParticipants,
        c.env,
        db,
      );
      const firstIncomplete = incompleteParticipants[0];
      nextParticipantIndex = firstIncomplete !== undefined ? firstIncomplete : null;
    }

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
      attachmentIds: kvState?.attachmentIds,
      canRecover,
      completedParticipants: roundStatusResult.completedParticipants,
      failedParticipants: roundStatusResult.failedParticipants,
      maxRecoveryAttempts: maxAttempts,
      needsModerator,
      needsPreSearch,
      nextParticipantIndex,
      phase: roundStatusResult.phase,
      recoveryAttempts: attempts,
      status,
      totalParticipants,
      userQuery,
    };

    return Responses.ok(c, response);
  },
);

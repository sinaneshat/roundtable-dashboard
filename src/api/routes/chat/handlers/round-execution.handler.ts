/**
 * Round Execution Handler - Server-Side Round Status
 *
 * Provides status endpoints for tracking round execution.
 * The actual streaming still uses the existing infrastructure,
 * but this provides a way to check round progress and resume.
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';

import { createError } from '@/api/common/error-handling';
import { verifyThreadOwnership } from '@/api/common/permissions';
import { createHandler, Responses, ThreadRoundParamSchema } from '@/api/core';
import { RoundExecutionPhases, RoundExecutionStatuses } from '@/api/core/enums';
import {
  computeRoundStatus,
  getExistingRoundExecution,
  initializeRoundExecution,
} from '@/api/services/round-orchestration';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db';

import type { executeRoundRoute, getRoundStatusRoute } from '../route';
import { ExecuteRoundRequestSchema } from '../schema';

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /chat/threads/:threadId/rounds/:roundNumber/execute
 *
 * Initialize round execution state for tracking.
 * This endpoint sets up KV tracking for the round.
 * The actual streaming is handled by the existing /chat endpoint
 * with waitUntil() ensuring completion.
 */
export const executeRoundHandler: RouteHandler<typeof executeRoundRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'executeRound',
    validateParams: ThreadRoundParamSchema,
    validateBody: ExecuteRoundRequestSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId, roundNumber: roundNumberStr } = c.validated.params;

    const roundNumber = Number.parseInt(roundNumberStr, 10);

    if (Number.isNaN(roundNumber) || roundNumber < 0) {
      throw createError.badRequest('Invalid round number');
    }

    const db = await getDbAsync();

    // Verify thread ownership
    await verifyThreadOwnership(threadId, user.id, db);

    // Check for existing execution
    const existingExecution = await getExistingRoundExecution(threadId, roundNumber, c.env);

    if (existingExecution) {
      // Round already running - return current status
      return Responses.ok(c, {
        status: existingExecution.status,
        phase: existingExecution.phase,
        message: 'Round execution already in progress',
        roundNumber,
        threadId,
      });
    }

    // Get participants for this thread
    const participants = await db.query.chatParticipant.findMany({
      where: and(
        eq(tables.chatParticipant.threadId, threadId),
        eq(tables.chatParticipant.isEnabled, true),
      ),
      columns: { id: true },
    });

    // Initialize round execution state
    await initializeRoundExecution(
      threadId,
      roundNumber,
      participants.length,
      undefined,
      c.env,
    );

    return Responses.accepted(c, {
      status: RoundExecutionStatuses.RUNNING,
      phase: RoundExecutionPhases.PARTICIPANTS,
      message: 'Round execution initialized',
      roundNumber,
      threadId,
    });
  },
);

/**
 * GET /chat/threads/:threadId/rounds/:roundNumber/status
 *
 * Get current round execution status.
 * Client polls this to track progress.
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

    // Verify thread ownership
    await verifyThreadOwnership(threadId, user.id, db);

    // Compute round status from DB + KV
    const status = await computeRoundStatus({
      threadId,
      roundNumber,
      env: c.env,
      db,
    });

    return Responses.ok(c, {
      threadId,
      roundNumber,
      ...status,
    });
  },
);

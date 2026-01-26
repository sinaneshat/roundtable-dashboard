/**
 * Stream Subscribe Handler
 *
 * Pub/sub delivery pattern for robust streaming resumption.
 * Clients subscribe to existing streams, don't control them.
 *
 * **ARCHITECTURE**:
 * - Background worker produces chunks to KV buffer
 * - Clients subscribe via SSE and receive chunks
 * - Supports mid-stream join (replay existing chunks, then live)
 * - Handles stream not yet started (returns retry-after)
 *
 * Flow:
 * 1. Client requests subscription to thread/round
 * 2. Check for active execution in round_execution table
 * 3. If active: Subscribe to KV buffer stream
 * 4. If none: Return 202 with retry-after (client should poll)
 *
 * @module api/routes/chat/handlers/stream-subscribe
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { RoundExecutionTableStatuses, RoundOrchestrationMessageTypes, StreamStatuses } from '@roundtable/shared/enums';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import { createHandler, Responses, STREAMING_CONFIG } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import { extractSessionToken } from '@/lib/auth';
import {
  createLiveParticipantResumeStream,
  getActiveParticipantStreamId,
  getActivePreSearchStreamId,
  getParticipantStreamChunks,
  getParticipantStreamMetadata,
  getPreSearchStreamChunks,
  getPreSearchStreamMetadata,
} from '@/services/streaming';
import type { ApiEnv } from '@/types';
import type { StartRoundQueueMessage } from '@/types/queues';

import type { subscribeToStreamRoute } from '../route';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Retry-after interval in milliseconds when no active stream */
const RETRY_AFTER_MS = 1000;

// ============================================================================
// RESPONSE SCHEMAS
// ============================================================================

const _SubscribeQueuedResponseSchema = z.object({
  /** Client should retry after this many milliseconds */
  retryAfter: z.number(),
  /** Status indicating the round is queued */
  status: z.literal('queued'),
});

const _SubscribeActiveResponseSchema = z.object({
  /** Whether the stream is currently active */
  isActive: z.boolean(),
  /** Phase of the stream */
  phase: z.enum(['presearch', 'participant', 'moderator']),
  /** Round number */
  roundNumber: z.number(),
  /** Status indicating an active stream */
  status: z.literal('active'),
  /** Stream ID for the active stream */
  streamId: z.string(),
});

const _SubscribeCompletedResponseSchema = z.object({
  /** Round number */
  roundNumber: z.number(),
  /** Status indicating the round is completed */
  status: z.literal('completed'),
});

export type SubscribeQueuedResponse = z.infer<typeof _SubscribeQueuedResponseSchema>;
export type SubscribeActiveResponse = z.infer<typeof _SubscribeActiveResponseSchema>;
export type SubscribeCompletedResponse = z.infer<typeof _SubscribeCompletedResponseSchema>;

// ============================================================================
// HANDLER
// ============================================================================

/**
 * Subscribe to a stream for a specific thread and round
 *
 * This handler implements the pub/sub delivery pattern:
 * 1. Check if there's an active execution
 * 2. If pending, queue a START_ROUND message and return retry-after
 * 3. If active, return SSE stream from KV buffer
 * 4. If completed, return completed status
 */
export const subscribeToStreamHandler: RouteHandler<typeof subscribeToStreamRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'subscribeToStream',
    validateParams: z.object({
      roundNumber: z.string().transform(v => Number.parseInt(v, 10)),
      threadId: z.string(),
    }),
  },
  async (c) => {
    const { user } = c.auth();
    const threadId = c.req.param('threadId');
    const roundNumberParam = c.req.param('roundNumber');
    const roundNumber = Number.parseInt(roundNumberParam, 10);

    // Extract session token for queue messages
    const sessionToken = extractSessionToken(c.req.header('cookie'));

    // Get lastChunkIndex from query params to avoid re-sending chunks
    const lastChunkIndexParam = c.req.query('lastChunkIndex');
    const lastChunkIndex = lastChunkIndexParam ? Number.parseInt(lastChunkIndexParam, 10) : 0;
    const startFromChunkIndex = Number.isNaN(lastChunkIndex) ? 0 : lastChunkIndex;

    const db = await getDbAsync();

    // 1. Verify thread access
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

    // 2. Check for active execution in database
    const execution = await db.query.roundExecution.findFirst({
      where: and(
        eq(tables.roundExecution.threadId, threadId),
        eq(tables.roundExecution.roundNumber, roundNumber),
      ),
    });

    // 3. Handle based on execution status
    if (!execution) {
      // No execution record - need to start one
      // Queue START_ROUND message
      if (c.env?.ROUND_ORCHESTRATION_QUEUE && sessionToken) {
        const message: StartRoundQueueMessage = {
          messageId: `start-${threadId}-r${roundNumber}-${Date.now()}`,
          queuedAt: new Date().toISOString(),
          roundNumber,
          sessionToken,
          threadId,
          type: RoundOrchestrationMessageTypes.START_ROUND,
          userId: user.id,
        };

        await c.env.ROUND_ORCHESTRATION_QUEUE.send(message);
      }

      // Return queued status with retry-after
      return Responses.ok(c, {
        retryAfter: RETRY_AFTER_MS,
        status: 'queued' as const,
      } satisfies SubscribeQueuedResponse);
    }

    // Check execution status
    switch (execution.status) {
      case RoundExecutionTableStatuses.COMPLETED:
        return Responses.ok(c, {
          roundNumber,
          status: 'completed' as const,
        } satisfies SubscribeCompletedResponse);

      case RoundExecutionTableStatuses.FAILED:
        throw createError.internal('Round execution failed', {
          errorMessage: execution.errorMessage ?? undefined,
          errorType: 'queue',
        });

      case RoundExecutionTableStatuses.PENDING:
        // Execution exists but not started yet - return retry-after
        return Responses.ok(c, {
          retryAfter: RETRY_AFTER_MS,
          status: 'queued' as const,
        } satisfies SubscribeQueuedResponse);

      case RoundExecutionTableStatuses.PRE_SEARCH:
      case RoundExecutionTableStatuses.PARTICIPANTS:
      case RoundExecutionTableStatuses.MODERATOR:
        // Active execution - try to subscribe to stream
        break;
    }

    // 4. Try to find and subscribe to active stream in KV
    if (!c.env?.KV) {
      // No KV available - return retry-after
      return Responses.ok(c, {
        retryAfter: RETRY_AFTER_MS,
        status: 'queued' as const,
      } satisfies SubscribeQueuedResponse);
    }

    // Check for pre-search stream first
    if (execution.status === RoundExecutionTableStatuses.PRE_SEARCH) {
      const preSearchStreamId = await getActivePreSearchStreamId(threadId, roundNumber, c.env);

      if (preSearchStreamId) {
        const metadata = await getPreSearchStreamMetadata(preSearchStreamId, c.env);
        const chunks = await getPreSearchStreamChunks(preSearchStreamId, c.env);

        if (metadata && (metadata.status === StreamStatuses.ACTIVE || metadata.status === StreamStatuses.STREAMING)) {
          const lastChunkTime = chunks && chunks.length > 0
            ? Math.max(...chunks.map(chunk => chunk.timestamp))
            : 0;
          const isStale = lastChunkTime > 0 && Date.now() - lastChunkTime > STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS;

          if (!isStale) {
            // Return pre-search stream info
            return Responses.ok(c, {
              isActive: metadata.status === StreamStatuses.ACTIVE,
              phase: 'presearch' as const,
              roundNumber,
              status: 'active' as const,
              streamId: preSearchStreamId,
            } satisfies SubscribeActiveResponse);
          }
        }
      }
    }

    // Check for participant stream
    if (execution.status === RoundExecutionTableStatuses.PARTICIPANTS) {
      // Find the currently active participant stream
      for (let i = 0; i < execution.participantsTotal; i++) {
        const participantStreamId = await getActiveParticipantStreamId(threadId, roundNumber, i, c.env);

        if (participantStreamId) {
          const metadata = await getParticipantStreamMetadata(participantStreamId, c.env);
          const chunks = await getParticipantStreamChunks(participantStreamId, c.env);

          if (metadata && (metadata.status === StreamStatuses.ACTIVE || metadata.status === StreamStatuses.STREAMING)) {
            const lastChunkTime = chunks && chunks.length > 0
              ? Math.max(...chunks.map(chunk => chunk.timestamp))
              : 0;
            const isStale = lastChunkTime > 0 && Date.now() - lastChunkTime > STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS;

            if (!isStale) {
              // Create resumable stream
              const liveStream = createLiveParticipantResumeStream(participantStreamId, c.env, {
                filterReasoningOnReplay: true,
                startFromChunkIndex,
              });

              return Responses.sse(liveStream, {
                isActive: metadata.status === StreamStatuses.ACTIVE,
                participantIndex: i,
                phase: 'participant',
                resumedFromBuffer: true,
                roundNumber,
                streamId: participantStreamId,
              });
            }
          }
        }
      }
    }

    // Check for moderator stream
    if (execution.status === RoundExecutionTableStatuses.MODERATOR) {
      // Moderator uses sentinel value -99 for participant index
      const NO_PARTICIPANT_SENTINEL = -99;
      const moderatorStreamId = await getActiveParticipantStreamId(threadId, roundNumber, NO_PARTICIPANT_SENTINEL, c.env);

      if (moderatorStreamId) {
        const metadata = await getParticipantStreamMetadata(moderatorStreamId, c.env);
        const chunks = await getParticipantStreamChunks(moderatorStreamId, c.env);

        if (metadata && (metadata.status === StreamStatuses.ACTIVE || metadata.status === StreamStatuses.STREAMING)) {
          const lastChunkTime = chunks && chunks.length > 0
            ? Math.max(...chunks.map(chunk => chunk.timestamp))
            : 0;
          const isStale = lastChunkTime > 0 && Date.now() - lastChunkTime > STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS;

          if (!isStale) {
            // Create resumable stream
            const liveStream = createLiveParticipantResumeStream(moderatorStreamId, c.env, {
              filterReasoningOnReplay: true,
              startFromChunkIndex,
            });

            return Responses.sse(liveStream, {
              isActive: metadata.status === StreamStatuses.ACTIVE,
              phase: 'moderator',
              resumedFromBuffer: true,
              roundNumber,
              streamId: moderatorStreamId,
            });
          }
        }
      }
    }

    // No active stream found - return retry-after
    return Responses.ok(c, {
      retryAfter: RETRY_AFTER_MS,
      status: 'queued' as const,
    } satisfies SubscribeQueuedResponse);
  },
);

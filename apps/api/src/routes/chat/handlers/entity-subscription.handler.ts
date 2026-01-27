/**
 * Entity Subscription Handlers - Backend-First Streaming Architecture
 *
 * **ARCHITECTURE**: Backend is the orchestrator/publisher, frontend is pure subscriber.
 * Per FLOW_DOCUMENTATION.md: Each entity (presearch, participant, moderator) has its own
 * stream subscription endpoint that supports resumption via lastSeq parameter.
 *
 * **KV STREAM KEYS**: stream:{threadId}:r{round}:{entity}
 * - stream:{threadId}:r0:presearch
 * - stream:{threadId}:r0:p0
 * - stream:{threadId}:r0:moderator
 *
 * **SUBSCRIPTION PATTERN**:
 * 1. Client subscribes via GET /threads/{id}/rounds/{round}/stream/{entity}?lastSeq=N
 * 2. Server sends chunks from seq N+1 onwards
 * 3. If stream not started yet, returns 202 with retry-after
 * 4. If stream complete, returns all chunks and status=complete
 *
 * @module api/routes/chat/handlers/entity-subscription
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { StreamStatuses } from '@roundtable/shared/enums';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import { createHandler, Responses, STREAMING_CONFIG } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import { NO_PARTICIPANT_SENTINEL } from '@/lib/schemas/participant-schemas';
import {
  createLiveParticipantResumeStream,
  createLivePreSearchResumeStream,
  createWaitingParticipantStream,
  getActiveParticipantStreamId,
  getActivePreSearchStreamId,
  getParticipantStreamChunks,
  getParticipantStreamMetadata,
  getPreSearchStreamChunks,
  getPreSearchStreamMetadata,
} from '@/services/streaming';
import type { ApiEnv } from '@/types';

import type {
  subscribeToModeratorStreamRoute,
  subscribeToParticipantStreamRoute,
  subscribeToPreSearchStreamRoute,
} from '../route';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Retry-after interval in milliseconds when stream not yet started */
const RETRY_AFTER_MS = 500;

// ============================================================================
// PRE-SEARCH SUBSCRIPTION HANDLER
// ============================================================================

/**
 * Subscribe to pre-search stream for a specific round
 *
 * Returns:
 * - 200 SSE stream if active
 * - 200 JSON with status=complete if finished
 * - 202 with retryAfter if not started yet
 */
export const subscribeToPreSearchStreamHandler: RouteHandler<
  typeof subscribeToPreSearchStreamRoute,
  ApiEnv
> = createHandler(
  {
    auth: 'session',
    operationName: 'subscribeToPreSearchStream',
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

    // Get lastSeq from query params for resumption
    const lastSeqParam = c.req.query('lastSeq');
    const lastSeq = lastSeqParam ? Number.parseInt(lastSeqParam, 10) : 0;
    const startFromChunkIndex = Number.isNaN(lastSeq) ? 0 : lastSeq;

    if (!c.env?.KV) {
      return Responses.accepted(c, { retryAfter: RETRY_AFTER_MS, status: 'waiting' });
    }

    const db = await getDbAsync();

    // Verify thread access
    const thread = await db.query.chatThread.findFirst({
      columns: { enableWebSearch: true, id: true, userId: true },
      where: eq(tables.chatThread.id, threadId),
    });

    if (!thread) {
      throw createError.notFound(
        'Thread not found',
        ErrorContextBuilders.resourceNotFound('thread', threadId, user.id),
      );
    }

    if (thread.userId !== user.id) {
      throw createError.unauthorized(
        'Not authorized to access this thread',
        ErrorContextBuilders.authorization('thread', threadId, user.id),
      );
    }

    // Check if web search is enabled
    if (!thread.enableWebSearch) {
      return Responses.ok(c, {
        message: 'Web search not enabled for this thread',
        status: 'disabled' as const,
      });
    }

    // Look for active pre-search stream
    const preSearchStreamId = await getActivePreSearchStreamId(threadId, roundNumber, c.env);

    if (!preSearchStreamId) {
      // Stream not started yet - return retry-after
      return Responses.accepted(c, { retryAfter: RETRY_AFTER_MS, status: 'waiting' });
    }

    const metadata = await getPreSearchStreamMetadata(preSearchStreamId, c.env);
    const chunks = await getPreSearchStreamChunks(preSearchStreamId, c.env);

    if (!metadata) {
      return Responses.accepted(c, { retryAfter: RETRY_AFTER_MS, status: 'waiting' });
    }

    // Check if stream is stale
    const lastChunkTime = chunks && chunks.length > 0
      ? Math.max(...chunks.map(chunk => chunk.timestamp))
      : 0;
    const isStale = lastChunkTime > 0 && Date.now() - lastChunkTime > STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS;

    if (isStale) {
      return Responses.ok(c, {
        lastSeq: chunks?.length ?? 0,
        status: 'error' as const,
      });
    }

    // If completed, return status
    if (metadata.status === StreamStatuses.COMPLETED || metadata.status === StreamStatuses.FAILED) {
      return Responses.ok(c, {
        lastSeq: chunks?.length ?? 0,
        status: metadata.status === StreamStatuses.COMPLETED ? 'complete' as const : 'error' as const,
      });
    }

    // Stream is active - create resumable stream
    const liveStream = createLivePreSearchResumeStream(
      preSearchStreamId,
      c.env,
      100, // pollIntervalMs
      10 * 60 * 1000, // maxPollDurationMs
      90 * 1000, // noNewDataTimeoutMs
    );

    return Responses.sse(liveStream, {
      isActive: true,
      phase: 'presearch',
      resumedFromBuffer: startFromChunkIndex > 0,
      roundNumber,
      streamId: preSearchStreamId,
    });
  },
);

// ============================================================================
// PARTICIPANT SUBSCRIPTION HANDLER
// ============================================================================

/**
 * Subscribe to participant stream for a specific round and participant index
 *
 * Returns:
 * - 200 SSE stream if active
 * - 200 JSON with status=complete if finished
 * - 202 with retryAfter if not started yet
 */
export const subscribeToParticipantStreamHandler: RouteHandler<
  typeof subscribeToParticipantStreamRoute,
  ApiEnv
> = createHandler(
  {
    auth: 'session',
    operationName: 'subscribeToParticipantStream',
    validateParams: z.object({
      participantIndex: z.string().transform(v => Number.parseInt(v, 10)),
      roundNumber: z.string().transform(v => Number.parseInt(v, 10)),
      threadId: z.string(),
    }),
  },
  async (c) => {
    const { user } = c.auth();
    const threadId = c.req.param('threadId');
    const roundNumberParam = c.req.param('roundNumber');
    const participantIndexParam = c.req.param('participantIndex');
    const roundNumber = Number.parseInt(roundNumberParam, 10);
    const participantIndex = Number.parseInt(participantIndexParam, 10);

    // Get lastSeq from query params for resumption
    const lastSeqParam = c.req.query('lastSeq');
    const lastSeq = lastSeqParam ? Number.parseInt(lastSeqParam, 10) : 0;
    const startFromChunkIndex = Number.isNaN(lastSeq) ? 0 : lastSeq;

    if (!c.env?.KV) {
      return Responses.accepted(c, { retryAfter: RETRY_AFTER_MS, status: 'waiting' });
    }

    const db = await getDbAsync();

    // Verify thread access
    const thread = await db.query.chatThread.findFirst({
      columns: { id: true, userId: true },
      where: eq(tables.chatThread.id, threadId),
    });

    if (!thread) {
      throw createError.notFound(
        'Thread not found',
        ErrorContextBuilders.resourceNotFound('thread', threadId, user.id),
      );
    }

    if (thread.userId !== user.id) {
      throw createError.unauthorized(
        'Not authorized to access this thread',
        ErrorContextBuilders.authorization('thread', threadId, user.id),
      );
    }

    // Look for active participant stream
    const participantStreamId = await getActiveParticipantStreamId(
      threadId,
      roundNumber,
      participantIndex,
      c.env,
    );

    if (!participantStreamId) {
      // Stream not started yet - create waiting stream that polls for it
      const pLabel = participantIndex < 0 ? 'Moderator' : `P${participantIndex}`;
      console.log(`[ENTITY-SUB] ${pLabel} r${roundNumber} - no active stream, creating waiting stream`);

      const waitingStream = createWaitingParticipantStream(
        threadId,
        roundNumber,
        participantIndex,
        c.env,
        {
          filterReasoningOnReplay: true,
          startFromChunkIndex,
          waitForStreamTimeoutMs: 60 * 1000, // 60 seconds to wait
        },
      );

      return Responses.sse(waitingStream, {
        isActive: false,
        participantIndex,
        phase: 'participant',
        resumedFromBuffer: startFromChunkIndex > 0,
        roundNumber,
      });
    }

    const metadata = await getParticipantStreamMetadata(participantStreamId, c.env);
    const chunks = await getParticipantStreamChunks(participantStreamId, c.env);

    if (!metadata) {
      return Responses.accepted(c, { retryAfter: RETRY_AFTER_MS, status: 'waiting' });
    }

    // Check if stream is stale
    const lastChunkTime = chunks && chunks.length > 0
      ? Math.max(...chunks.map(chunk => chunk.timestamp))
      : 0;
    const isStale = lastChunkTime > 0 && Date.now() - lastChunkTime > STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS;

    if (isStale) {
      return Responses.ok(c, {
        lastSeq: chunks?.length ?? 0,
        participantIndex,
        status: 'error' as const,
      });
    }

    // If completed, return status
    if (metadata.status === StreamStatuses.COMPLETED || metadata.status === StreamStatuses.FAILED) {
      return Responses.ok(c, {
        lastSeq: chunks?.length ?? 0,
        participantIndex,
        status: metadata.status === StreamStatuses.COMPLETED ? 'complete' as const : 'error' as const,
      });
    }

    // Stream is active - create resumable stream
    const liveStream = createLiveParticipantResumeStream(participantStreamId, c.env, {
      filterReasoningOnReplay: true,
      startFromChunkIndex,
    });

    return Responses.sse(liveStream, {
      isActive: true,
      participantIndex,
      phase: 'participant',
      resumedFromBuffer: startFromChunkIndex > 0,
      roundNumber,
      streamId: participantStreamId,
    });
  },
);

// ============================================================================
// MODERATOR SUBSCRIPTION HANDLER
// ============================================================================

/**
 * Subscribe to moderator stream for a specific round
 *
 * Returns:
 * - 200 SSE stream if active
 * - 200 JSON with status=complete if finished
 * - 202 with retryAfter if not started yet
 */
export const subscribeToModeratorStreamHandler: RouteHandler<
  typeof subscribeToModeratorStreamRoute,
  ApiEnv
> = createHandler(
  {
    auth: 'session',
    operationName: 'subscribeToModeratorStream',
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

    // Get lastSeq from query params for resumption
    const lastSeqParam = c.req.query('lastSeq');
    const lastSeq = lastSeqParam ? Number.parseInt(lastSeqParam, 10) : 0;
    const startFromChunkIndex = Number.isNaN(lastSeq) ? 0 : lastSeq;

    if (!c.env?.KV) {
      return Responses.accepted(c, { retryAfter: RETRY_AFTER_MS, status: 'waiting' });
    }

    const db = await getDbAsync();

    // Verify thread access
    const thread = await db.query.chatThread.findFirst({
      columns: { id: true, userId: true },
      where: eq(tables.chatThread.id, threadId),
    });

    if (!thread) {
      throw createError.notFound(
        'Thread not found',
        ErrorContextBuilders.resourceNotFound('thread', threadId, user.id),
      );
    }

    if (thread.userId !== user.id) {
      throw createError.unauthorized(
        'Not authorized to access this thread',
        ErrorContextBuilders.authorization('thread', threadId, user.id),
      );
    }

    // Moderator uses sentinel value for participant index
    const moderatorStreamId = await getActiveParticipantStreamId(
      threadId,
      roundNumber,
      NO_PARTICIPANT_SENTINEL,
      c.env,
    );

    if (!moderatorStreamId) {
      // Stream not started yet - create waiting stream
      console.log(`[ENTITY-SUB] Moderator r${roundNumber} - no active stream, creating waiting stream`);

      const waitingStream = createWaitingParticipantStream(
        threadId,
        roundNumber,
        NO_PARTICIPANT_SENTINEL,
        c.env,
        {
          filterReasoningOnReplay: true,
          startFromChunkIndex,
          waitForStreamTimeoutMs: 60 * 1000, // 60 seconds to wait
        },
      );

      return Responses.sse(waitingStream, {
        isActive: false,
        phase: 'moderator',
        resumedFromBuffer: startFromChunkIndex > 0,
        roundNumber,
      });
    }

    const metadata = await getParticipantStreamMetadata(moderatorStreamId, c.env);
    const chunks = await getParticipantStreamChunks(moderatorStreamId, c.env);

    if (!metadata) {
      return Responses.accepted(c, { retryAfter: RETRY_AFTER_MS, status: 'waiting' });
    }

    // Check if stream is stale
    const lastChunkTime = chunks && chunks.length > 0
      ? Math.max(...chunks.map(chunk => chunk.timestamp))
      : 0;
    const isStale = lastChunkTime > 0 && Date.now() - lastChunkTime > STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS;

    if (isStale) {
      return Responses.ok(c, {
        lastSeq: chunks?.length ?? 0,
        status: 'error' as const,
      });
    }

    // If completed, return status
    if (metadata.status === StreamStatuses.COMPLETED || metadata.status === StreamStatuses.FAILED) {
      return Responses.ok(c, {
        lastSeq: chunks?.length ?? 0,
        status: metadata.status === StreamStatuses.COMPLETED ? 'complete' as const : 'error' as const,
      });
    }

    // Stream is active - create resumable stream
    const liveStream = createLiveParticipantResumeStream(moderatorStreamId, c.env, {
      filterReasoningOnReplay: true,
      startFromChunkIndex,
    });

    return Responses.sse(liveStream, {
      isActive: true,
      phase: 'moderator',
      resumedFromBuffer: startFromChunkIndex > 0,
      roundNumber,
      streamId: moderatorStreamId,
    });
  },
);

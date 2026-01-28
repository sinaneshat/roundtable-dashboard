/**
 * Unified Stream Buffer Service - Cloudflare KV-based SSE stream buffering
 *
 * **BACKEND SERVICE**: Enables stream resumption after page reload for all stream types
 * Following backend-patterns.md: Service layer for streaming infrastructure
 *
 * **PURPOSE**:
 * - Buffer SSE chunks from AI SDK streams (participant, moderator) into Cloudflare KV
 * - Buffer SSE events from pre-search streams into Cloudflare KV
 * - Enable resumption after page reload/connection loss
 * - Compatible with AI SDK v6 `consumeSseStream` callback
 *
 * **ARCHITECTURE**:
 * - Discriminated by stream phase (participant, moderator, pre-search)
 * - Chunks stored as individual KV keys (O(1) memory, no array accumulation)
 * - Metadata tracks chunk count and stream status
 * - Automatic cleanup on stream completion with 1-hour TTL
 *
 * **INTEGRATION**:
 * - Called from streaming handlers via callbacks
 * - Frontend resumes via GET endpoints checking KV for active streams
 *
 * @module api/services/unified-stream-buffer
 * @see /src/api/types/streaming.ts for type definitions
 */

import { FinishReasons, parseSSEEventType, StreamPhases, StreamStatuses } from '@roundtable/shared/enums';

import { log } from '@/lib/logger';
import type { ApiEnv } from '@/types';
import type { TypedLogger } from '@/types/logger';
import { LogHelpers } from '@/types/logger';
import type {
  ModeratorStreamBufferMetadata,
  ModeratorStreamChunk,
  PreSearchStreamChunk,
  PreSearchStreamMetadata,
  StreamBufferMetadata,
  StreamChunk,
} from '@/types/streaming';
import {
  ModeratorStreamBufferMetadataSchema,
  parseStreamBufferMetadata,
  PreSearchStreamChunkSchema,
  PreSearchStreamMetadataSchema,
  STREAM_BUFFER_TTL_SECONDS,
  StreamChunkSchema,
} from '@/types/streaming';

import { getRoundExecutionState, RoundPreSearchStatuses } from '../round-orchestration/round-orchestration.service';
import { getThreadActiveStream } from './resumable-stream-kv.service';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format participant label for logging - converts sentinel values to readable names
 * -1 (NO_PARTICIPANT_SENTINEL = MODERATOR_PARTICIPANT_INDEX) → "Moderator"
 */
function formatParticipantLabel(participantIndex: number) {
  if (participantIndex < 0) {
    return 'Moderator';
  }
  return `P${participantIndex}`;
}

// ============================================================================
// KV KEY GENERATION - DISCRIMINATED BY STREAM PHASE
// ============================================================================

function getMetadataKey(streamId: string) {
  return `stream:buffer:${streamId}:meta`;
}

function getChunkKey(streamId: string, index: number) {
  return `stream:buffer:${streamId}:c:${index}`;
}

function getActiveKey(
  threadId: string,
  roundNumber: number,
  discriminator: string,
) {
  return `stream:active:${threadId}:r${roundNumber}:${discriminator}`;
}

// ✅ FIX #6: Pending queue keys for chunk retry fallback
function getPendingChunkKey(streamId: string, seq: number): string {
  return `stream:pending:${streamId}:c:${seq}`;
}

function getPendingIndexKey(streamId: string): string {
  return `stream:pending:${streamId}:index`;
}

// ============================================================================
// PARTICIPANT STREAM BUFFER OPERATIONS
// ============================================================================

export async function initializeParticipantStreamBuffer(
  streamId: string,
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    logger?.warn('KV not available - skipping stream buffer initialization', LogHelpers.operation({
      edgeCase: 'kv_not_available',
      operationName: 'initializeParticipantStreamBuffer',
      streamId,
    }));
    return;
  }

  try {
    const metadata: StreamBufferMetadata = {
      chunkCount: 0,
      completedAt: null,
      createdAt: Date.now(),
      errorMessage: null,
      participantIndex,
      roundNumber,
      status: StreamStatuses.ACTIVE,
      streamId,
      threadId,
    };

    await env.KV.put(getMetadataKey(streamId), JSON.stringify(metadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    await env.KV.put(
      getActiveKey(threadId, roundNumber, `p${participantIndex}`),
      streamId,
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    logger?.info('Initialized participant stream buffer', LogHelpers.operation({
      operationName: 'initializeParticipantStreamBuffer',
      participantIndex,
      roundNumber,
      streamId,
      threadId,
    }));
  } catch (error) {
    logger?.error('Failed to initialize participant stream buffer', LogHelpers.operation({
      error: error instanceof Error ? error.message : 'Unknown error',
      operationName: 'initializeParticipantStreamBuffer',
      streamId,
    }));
    throw error;
  }
}

/**
 * ✅ FIX #6: Store chunk in pending queue when metadata not available
 * This prevents data loss when chunks arrive before metadata initialization
 */
async function storePendingChunk(
  streamId: string,
  data: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  try {
    // Get or create pending index
    const indexKey = getPendingIndexKey(streamId);
    const pendingIndex = await env.KV.get<number>(indexKey, 'json') ?? 0;

    // Store pending chunk with timestamp for ordering
    const pendingChunk = {
      data,
      event: parseSSEEventType(data),
      pendingSeq: pendingIndex,
      timestamp: Date.now(),
    };

    await env.KV.put(
      getPendingChunkKey(streamId, pendingIndex),
      JSON.stringify(pendingChunk),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    // Update pending index
    await env.KV.put(indexKey, JSON.stringify(pendingIndex + 1), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    logger?.info(`Stored chunk in pending queue (seq=${pendingIndex})`, LogHelpers.operation({
      operationName: 'storePendingChunk',
      streamId,
    }));
  } catch (error) {
    logger?.error('Failed to store pending chunk', LogHelpers.operation({
      error: error instanceof Error ? error.message : 'Unknown error',
      operationName: 'storePendingChunk',
      streamId,
    }));
  }
}

/**
 * ✅ FIX #6: Process pending chunks when metadata becomes available
 * Flushes pending queue and stores chunks in correct order
 */
async function processPendingChunks(
  streamId: string,
  metadata: StreamBufferMetadata,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<StreamBufferMetadata> {
  const indexKey = getPendingIndexKey(streamId);
  const pendingCount = await env.KV.get<number>(indexKey, 'json') ?? 0;

  if (pendingCount === 0) {
    return metadata;
  }

  logger?.info(`Processing ${pendingCount} pending chunks`, LogHelpers.operation({
    operationName: 'processPendingChunks',
    streamId,
  }));

  // Fetch all pending chunks
  type PendingChunk = { data: string; event: string; pendingSeq: number; timestamp: number };
  const pendingChunks: PendingChunk[] = [];

  for (let i = 0; i < pendingCount; i++) {
    const raw = await env.KV.get(getPendingChunkKey(streamId, i), 'text');
    if (raw) {
      try {
        pendingChunks.push(JSON.parse(raw) as PendingChunk);
      } catch {
        // Skip invalid chunks
      }
    }
  }

  // Sort by timestamp (original order)
  pendingChunks.sort((a, b) => a.timestamp - b.timestamp);

  // Store pending chunks as regular chunks
  let currentIndex = metadata.chunkCount;
  for (const pending of pendingChunks) {
    const chunk: StreamChunk = {
      data: pending.data,
      event: parseSSEEventType(pending.data),
      seq: currentIndex,
      timestamp: pending.timestamp,
    };

    await env.KV.put(
      getChunkKey(streamId, currentIndex),
      JSON.stringify(chunk),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    currentIndex++;
  }

  // Update metadata with new chunk count
  const updatedMetadata = { ...metadata, chunkCount: currentIndex };

  // Clean up pending queue
  const cleanupPromises: Promise<void>[] = [];
  for (let i = 0; i < pendingCount; i++) {
    cleanupPromises.push(env.KV.delete(getPendingChunkKey(streamId, i)));
  }
  cleanupPromises.push(env.KV.delete(indexKey));
  await Promise.all(cleanupPromises);

  logger?.info(`Processed ${pendingChunks.length} pending chunks (final count: ${currentIndex})`, LogHelpers.operation({
    chunkCount: currentIndex,
    operationName: 'processPendingChunks',
    streamId,
  }));

  return updatedMetadata;
}

/**
 * ✅ FIX #6: Clean up any remaining pending chunks
 * Called during stream completion to ensure no orphaned data
 */
async function cleanupPendingQueue(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  const indexKey = getPendingIndexKey(streamId);
  const pendingCount = await env.KV.get<number>(indexKey, 'json') ?? 0;

  if (pendingCount === 0) {
    return;
  }

  const cleanupPromises: Promise<void>[] = [];
  for (let i = 0; i < pendingCount; i++) {
    cleanupPromises.push(env.KV.delete(getPendingChunkKey(streamId, i)));
  }
  cleanupPromises.push(env.KV.delete(indexKey));
  await Promise.all(cleanupPromises);

  logger?.debug(`Cleaned up ${pendingCount} pending queue items`, LogHelpers.operation({
    operationName: 'cleanupPendingQueue',
    streamId,
  }));
}

export async function appendParticipantStreamChunk(
  streamId: string,
  data: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  // ✅ FIX #6: Extended retry with exponential backoff
  // Phase 1: Try to get metadata with exponential backoff
  // Total wait time: ~3.5s (50+100+200+400+800+1000+1000)
  const MAX_RETRIES = 8;
  const BASE_DELAY_MS = 50;
  const MAX_DELAY_MS = 1000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const metadataKey = getMetadataKey(streamId);
      const metadata = parseStreamBufferMetadata(await env.KV.get(metadataKey, 'json'));

      if (!metadata) {
        if (attempt < MAX_RETRIES - 1) {
          // Exponential backoff: 50ms, 100ms, 200ms, 400ms, 800ms, 1000ms, 1000ms
          const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
          await new Promise((resolve) => {
            setTimeout(resolve, delay);
          });
          continue;
        }

        // ✅ FIX #6: Phase 2 - Store in pending queue as last resort
        logger?.warn('Stream metadata not found after extended retries, using pending queue', LogHelpers.operation({
          edgeCase: 'metadata_not_found_using_pending_queue',
          operationName: 'appendParticipantStreamChunk',
          retryCount: MAX_RETRIES,
          streamId,
        }));
        await storePendingChunk(streamId, data, env, logger);
        return;
      }

      // ✅ FIX #6: Phase 3 - Process any pending chunks before storing current
      const updatedMetadata = await processPendingChunks(streamId, metadata, env, logger);

      // Store current chunk
      const chunkIndex = updatedMetadata.chunkCount;

      const chunk: StreamChunk = {
        data,
        event: parseSSEEventType(data),
        seq: chunkIndex,
        timestamp: Date.now(),
      };

      await env.KV.put(
        getChunkKey(streamId, chunkIndex),
        JSON.stringify(chunk),
        { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
      );

      updatedMetadata.chunkCount = chunkIndex + 1;
      await env.KV.put(metadataKey, JSON.stringify(updatedMetadata), {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      });

      return; // Success - exit retry loop
    } catch (error) {
      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
        continue;
      }

      logger?.error('Failed to append participant stream chunk', LogHelpers.operation({
        chunkDataLength: data.length,
        error: error instanceof Error ? error.message : 'Unknown error',
        operationName: 'appendParticipantStreamChunk',
        retryCount: MAX_RETRIES,
        streamId,
      }));

      // ✅ FIX #6: Final fallback - store in pending queue even on error
      await storePendingChunk(streamId, data, env, logger);
    }
  }
}

export async function completeParticipantStreamBuffer(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getMetadataKey(streamId);
    let metadata = parseStreamBufferMetadata(await env.KV.get(metadataKey, 'json'));

    if (!metadata) {
      logger?.warn('Stream metadata not found during completion', LogHelpers.operation({
        edgeCase: 'metadata_not_found',
        operationName: 'completeParticipantStreamBuffer',
        streamId,
      }));
      return;
    }

    // ✅ FIX #6: Process any remaining pending chunks before completing
    metadata = await processPendingChunks(streamId, metadata, env, logger);

    const updatedMetadata: StreamBufferMetadata = {
      ...metadata,
      completedAt: Date.now(),
      status: StreamStatuses.COMPLETED,
    };

    await env.KV.put(metadataKey, JSON.stringify(updatedMetadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    // ✅ FIX #6: Clean up any remaining pending queue items
    await cleanupPendingQueue(streamId, env, logger);

    logger?.info('Completed participant stream buffer', LogHelpers.operation({
      chunkCount: updatedMetadata.chunkCount,
      operationName: 'completeParticipantStreamBuffer',
      streamId,
    }));
  } catch (error) {
    logger?.error('Failed to complete participant stream buffer', LogHelpers.operation({
      error: error instanceof Error ? error.message : 'Unknown error',
      operationName: 'completeParticipantStreamBuffer',
      streamId,
    }));
  }
}

export async function failParticipantStreamBuffer(
  streamId: string,
  errorMessage: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getMetadataKey(streamId);
    let metadata = parseStreamBufferMetadata(await env.KV.get(metadataKey, 'json'));

    if (!metadata) {
      logger?.warn('Stream metadata not found during failure', LogHelpers.operation({
        edgeCase: 'metadata_not_found',
        operationName: 'failParticipantStreamBuffer',
        streamId,
      }));
      return;
    }

    // ✅ FIX #6: Process any remaining pending chunks before failing
    metadata = await processPendingChunks(streamId, metadata, env, logger);

    const errorChunk: StreamChunk = {
      data: `3:${JSON.stringify({ error: errorMessage })}`,
      event: 'error',
      timestamp: Date.now(),
    };

    const errorChunkIndex = metadata.chunkCount;
    await env.KV.put(
      getChunkKey(streamId, errorChunkIndex),
      JSON.stringify(errorChunk),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    const updatedMetadata: StreamBufferMetadata = {
      ...metadata,
      chunkCount: errorChunkIndex + 1,
      completedAt: Date.now(),
      errorMessage,
      status: StreamStatuses.FAILED,
    };

    await env.KV.put(metadataKey, JSON.stringify(updatedMetadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    // ✅ FIX #6: Clean up any remaining pending queue items
    await cleanupPendingQueue(streamId, env, logger);

    logger?.info('Marked participant stream buffer as failed', LogHelpers.operation({
      errorMessage,
      operationName: 'failParticipantStreamBuffer',
      streamId,
    }));
  } catch (error) {
    logger?.error('Failed to mark participant stream as failed', LogHelpers.operation({
      error: error instanceof Error ? error.message : 'Unknown error',
      operationName: 'failParticipantStreamBuffer',
      streamId,
    }));
  }
}

export async function getActiveParticipantStreamId(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<string | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const streamId = await env.KV.get(
      getActiveKey(threadId, roundNumber, `p${participantIndex}`),
      'text',
    );

    if (streamId) {
      logger?.info('Found active participant stream', LogHelpers.operation({
        operationName: 'getActiveParticipantStreamId',
        participantIndex,
        roundNumber,
        streamId,
        threadId,
      }));
    }

    return streamId;
  } catch (error) {
    logger?.error('Failed to get active participant stream ID', LogHelpers.operation({
      error: error instanceof Error ? error.message : 'Unknown error',
      operationName: 'getActiveParticipantStreamId',
      participantIndex,
      roundNumber,
      threadId,
    }));
    return null;
  }
}

export async function getParticipantStreamMetadata(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<StreamBufferMetadata | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const metadata = parseStreamBufferMetadata(await env.KV.get(getMetadataKey(streamId), 'json'));

    if (metadata) {
      logger?.info('Retrieved participant stream metadata', LogHelpers.operation({
        chunkCount: metadata.chunkCount,
        operationName: 'getParticipantStreamMetadata',
        status: metadata.status,
        streamId,
      }));
    }

    return metadata;
  } catch (error) {
    logger?.error('Failed to get participant stream metadata', LogHelpers.operation({
      error: error instanceof Error ? error.message : 'Unknown error',
      operationName: 'getParticipantStreamMetadata',
      streamId,
    }));
    return null;
  }
}

export async function getParticipantStreamChunks(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<StreamChunk[] | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const metadata = parseStreamBufferMetadata(await env.KV.get(getMetadataKey(streamId), 'json'));

    if (!metadata) {
      return null;
    }

    if (metadata.chunkCount === 0) {
      return [];
    }

    const BATCH_SIZE = 100;
    const chunks: StreamChunk[] = [];

    for (let batchStart = 0; batchStart < metadata.chunkCount; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, metadata.chunkCount);
      const batchPromises: Promise<string | null>[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        batchPromises.push(env.KV.get(getChunkKey(streamId, i), 'text'));
      }

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        if (result) {
          const parseResult = StreamChunkSchema.safeParse(JSON.parse(result));
          if (parseResult.success) {
            chunks.push(parseResult.data);
          }
        }
      }
    }

    if (chunks.length > 0) {
      logger?.info('Retrieved participant stream chunks', LogHelpers.operation({
        chunkCount: chunks.length,
        operationName: 'getParticipantStreamChunks',
        streamId,
      }));
    }

    return chunks;
  } catch (error) {
    logger?.error('Failed to get participant stream chunks', LogHelpers.operation({
      error: error instanceof Error ? error.message : 'Unknown error',
      operationName: 'getParticipantStreamChunks',
      streamId,
    }));
    return null;
  }
}

export async function clearActiveParticipantStream(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    await env.KV.delete(getActiveKey(threadId, roundNumber, `p${participantIndex}`));

    logger?.info('Cleared active participant stream tracking', LogHelpers.operation({
      operationName: 'clearActiveParticipantStream',
      participantIndex,
      roundNumber,
      threadId,
    }));
  } catch (error) {
    logger?.warn('Failed to clear active participant stream', LogHelpers.operation({
      edgeCase: 'clear_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      operationName: 'clearActiveParticipantStream',
      participantIndex,
      roundNumber,
      threadId,
    }));
  }
}

export async function deleteParticipantStreamBuffer(
  streamId: string,
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadata = parseStreamBufferMetadata(await env.KV.get(getMetadataKey(streamId), 'json'));
    const chunkCount = metadata?.chunkCount || 0;

    const BATCH_SIZE = 50;
    for (let batchStart = 0; batchStart < chunkCount; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, chunkCount);
      const deletePromises: Promise<void>[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        deletePromises.push(env.KV.delete(getChunkKey(streamId, i)));
      }

      await Promise.all(deletePromises);
    }

    await Promise.all([
      env.KV.delete(getMetadataKey(streamId)),
      env.KV.delete(getActiveKey(threadId, roundNumber, `p${participantIndex}`)),
    ]);

    logger?.info(`Deleted participant stream buffer with ${chunkCount} chunks`, LogHelpers.operation({
      operationName: 'deleteParticipantStreamBuffer',
      streamId,
    }));
  } catch (error) {
    logger?.warn('Failed to delete participant stream buffer', LogHelpers.operation({
      edgeCase: 'delete_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      operationName: 'deleteParticipantStreamBuffer',
      streamId,
    }));
  }
}

/**
 * Options for resuming participant streams from KV buffer
 *
 * ✅ CLOUDFLARE LIMITS:
 * - Wall-clock: UNLIMITED (as long as client connected)
 * - IDLE timeout: 100s (must send data or HTTP 524)
 * - CPU time: 5 min max
 */
export type ResumeStreamOptions = {
  /** Poll interval for checking new chunks (default: 100ms) */
  pollIntervalMs?: number;
  /** Max duration for polling loop (default: 10 min) */
  maxPollDurationMs?: number;
  /** Timeout if no new data received (default: 90s - just under Cloudflare's 100s idle timeout) */
  noNewDataTimeoutMs?: number;
  /** Filter out reasoning-delta events on replay (default: false) */
  filterReasoningOnReplay?: boolean;
  /** Start streaming from specific chunk index (default: 0) */
  startFromChunkIndex?: number;
};

/**
 * Check if a chunk contains an AI SDK finish event
 * AI SDK finish events are in format:
 * - e:{"finishReason":"stop",...} (step-finish)
 * - d:{"finishReason":"stop",...} (finish data)
 */
function chunkContainsFinishEvent(chunkData: string): boolean {
  // Check for e: or d: prefix with finishReason
  // Note: The data might contain multiple lines or partial data
  const lines = chunkData.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if ((trimmed.startsWith('e:') || trimmed.startsWith('d:')) && trimmed.includes('finishReason')) {
      try {
        const json = JSON.parse(trimmed.slice(2));
        if (json.finishReason) {
          return true;
        }
      } catch {
        // Not valid JSON, check raw string
        if (trimmed.includes('"finishReason"')) {
          return true;
        }
      }
    }
  }
  return false;
}

export function createLiveParticipantResumeStream(
  streamId: string,
  env: ApiEnv['Bindings'],
  options: ResumeStreamOptions = {},
): ReadableStream<Uint8Array> {
  const {
    filterReasoningOnReplay = false,
    maxPollDurationMs = 10 * 60 * 1000, // 10 minutes - generous for long AI streams
    noNewDataTimeoutMs = 90 * 1000, // 90 seconds - just under Cloudflare's 100s idle timeout
    pollIntervalMs = 30, // 30ms for smoother streaming UX (was 100ms)
    startFromChunkIndex = 0,
  } = options;
  const encoder = new TextEncoder();
  let isClosed = false;

  const safeClose = (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    if (isClosed) {
      return;
    }
    try {
      isClosed = true;
      controller.close();
    } catch {
      // Controller already closed
    }
  };

  const safeEnqueue = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    data: Uint8Array,
  ) => {
    if (isClosed) {
      return false;
    }
    try {
      controller.enqueue(data);
      return true;
    } catch {
      isClosed = true;
      return false;
    }
  };

  return new ReadableStream({
    cancel() {
      isClosed = true;
    },

    async start(controller) {
      let lastChunkIndex = startFromChunkIndex;
      const startTime = Date.now();
      let lastNewDataTime = Date.now();

      const shouldSendChunk = (chunk: { data: string; event?: string | undefined }): boolean => {
        if (!filterReasoningOnReplay) {
          return true;
        }
        return chunk.event !== 'reasoning-delta';
      };

      // ✅ FIX: Send initial SSE comment to establish HTTP response immediately
      // This prevents "Provisional headers" in browser DevTools during initial fetch
      const initialComment = `:stream ${streamId.slice(-8)}\n\n`;
      if (!safeEnqueue(controller, encoder.encode(initialComment))) {
        return;
      }

      try {
        // Track if initial chunks contain finish event
        let initialFinishEventFound = false;

        const initialChunks = await getParticipantStreamChunks(streamId, env);
        if (initialChunks && initialChunks.length > startFromChunkIndex) {
          for (let i = startFromChunkIndex; i < initialChunks.length; i++) {
            const chunk = initialChunks[i];
            if (chunk && shouldSendChunk(chunk)) {
              if (!safeEnqueue(controller, encoder.encode(chunk.data))) {
                return;
              }
              // Natural pacing: KV polling latency provides gradual delivery
              // No artificial delays - chunks stream as fast as network allows

              // ✅ FIX: Check if initial chunks contain finish events
              if (chunkContainsFinishEvent(chunk.data)) {
                initialFinishEventFound = true;
              }
            }
          }
          lastChunkIndex = initialChunks.length;
          lastNewDataTime = Date.now();
        }

        const initialMetadata = await getParticipantStreamMetadata(streamId, env);

        // ✅ FIX: Close immediately if finish event was found in initial chunks
        // This handles resumption where all chunks (including finish) are already buffered
        if (
          initialFinishEventFound
          || initialMetadata?.status === StreamStatuses.COMPLETED
          || initialMetadata?.status === StreamStatuses.FAILED
        ) {
          safeClose(controller);
          return;
        }

        // eslint-disable-next-line no-unmodified-loop-condition -- isClosed is modified in cancel() callback and safeClose()/safeEnqueue() error handlers
        while (!isClosed) {
          if (Date.now() - startTime > maxPollDurationMs) {
            safeClose(controller);
            return;
          }

          const chunks = await getParticipantStreamChunks(streamId, env);
          const metadata = await getParticipantStreamMetadata(streamId, env);

          // Track if we found a finish event in buffered chunks
          let foundFinishEventInChunks = false;

          if (chunks && chunks.length > lastChunkIndex) {
            for (let i = lastChunkIndex; i < chunks.length; i++) {
              const chunk = chunks[i];
              if (chunk && shouldSendChunk(chunk)) {
                if (!safeEnqueue(controller, encoder.encode(chunk.data))) {
                  return;
                }
                // Natural pacing: KV polling latency provides gradual delivery
                // No artificial delays - chunks stream as fast as network allows

                // ✅ FIX: Check if this chunk contains a finish event
                // This handles the race condition where AI SDK finish events are buffered
                // but KV metadata status hasn't been updated to COMPLETED yet
                if (chunkContainsFinishEvent(chunk.data)) {
                  foundFinishEventInChunks = true;
                }
              }
            }
            lastChunkIndex = chunks.length;
            lastNewDataTime = Date.now();
          }

          // ✅ FIX: Close stream if we found finish events in chunks OR metadata says complete
          // This handles the KV eventual consistency race condition where:
          // 1. AI SDK sends finish event → buffered to KV as chunk
          // 2. completeParticipantStreamBuffer updates metadata status
          // 3. But due to eventual consistency, metadata might not show COMPLETED yet
          // 4. Previously: we'd wait 90s for timeout → STREAM_TIMEOUT error
          // 5. Now: detect finish event in chunk content → close immediately
          if (
            foundFinishEventInChunks
            || metadata?.status === StreamStatuses.COMPLETED
            || metadata?.status === StreamStatuses.FAILED
          ) {
            // Only send synthetic finish events if we didn't already send them from buffered chunks
            // The AI SDK finish events from buffered chunks are more accurate (contain real usage data)
            if (!foundFinishEventInChunks) {
              // AI SDK PATTERN: Send explicit finish events before closing
              // This ensures frontend detects completion immediately without relying on reader.done
              const finishReason = metadata?.status === StreamStatuses.COMPLETED ? 'stop' : 'error';
              const finishEvent = `e:{"finishReason":"${finishReason}"}\n`;
              const finishData = `d:{"finishReason":"${finishReason}","usage":{"promptTokens":0,"completionTokens":0}}\n`;
              safeEnqueue(controller, encoder.encode(finishEvent));
              safeEnqueue(controller, encoder.encode(finishData));
            }

            safeClose(controller);
            return;
          }

          const timeSinceLastNewData = Date.now() - lastNewDataTime;
          if (timeSinceLastNewData > noNewDataTimeoutMs) {
            // ✅ AI SDK PATTERN: Send explicit error event before synthetic finish
            // This allows frontend to distinguish timeout from normal completion
            const timeoutSeconds = Math.round(noNewDataTimeoutMs / 1000);
            const errorEvent = `data: {"type":"error","error":"STREAM_TIMEOUT","message":"Stream timed out after ${timeoutSeconds}s of no activity"}\n\n`;
            safeEnqueue(controller, encoder.encode(errorEvent));

            const syntheticFinish = `data: {"type":"finish","finishReason":"${FinishReasons.ERROR}","error":"STREAM_TIMEOUT","usage":{"promptTokens":0,"completionTokens":0}}\n\n`;
            safeEnqueue(controller, encoder.encode(syntheticFinish));
            safeClose(controller);
            return;
          }

          await new Promise((resolve) => {
            setTimeout(resolve, pollIntervalMs);
          });
        }
      } catch {
        safeClose(controller);
      }
    },
  });
}

/**
 * ✅ AI SDK RESUMABLE STREAMS PATTERN: Server-side waiting stream
 *
 * Creates an SSE stream that WAITS for a participant stream to appear before streaming.
 * This follows the proper pub/sub pattern where:
 * - Server keeps connection open
 * - Server polls for stream to become available
 * - Server pushes data as it arrives
 * - Client does NOT retry - single connection
 *
 * @param threadId - Thread ID to monitor
 * @param roundNumber - Round number to stream
 * @param participantIndex - Participant index to wait for
 * @param env - Cloudflare environment bindings
 * @param options - Stream options
 */
export function createWaitingParticipantStream(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  options: ResumeStreamOptions & { waitForStreamTimeoutMs?: number } = {},
): ReadableStream<Uint8Array> {
  const {
    filterReasoningOnReplay = false,
    maxPollDurationMs = 10 * 60 * 1000, // 10 minutes
    noNewDataTimeoutMs = 90 * 1000, // 90 seconds
    pollIntervalMs = 30, // 30ms for smoother streaming UX (was 100ms)
    startFromChunkIndex = 0,
    waitForStreamTimeoutMs = 30 * 1000, // 30 seconds to wait for stream to appear
  } = options;

  const encoder = new TextEncoder();
  let isClosed = false;

  const safeClose = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (isClosed) {
      return;
    }
    try {
      isClosed = true;
      controller.close();
    } catch {
      // Controller already closed
    }
  };

  const safeEnqueue = (controller: ReadableStreamDefaultController<Uint8Array>, data: Uint8Array) => {
    if (isClosed) {
      return false;
    }
    try {
      controller.enqueue(data);
      return true;
    } catch {
      isClosed = true;
      return false;
    }
  };

  const shouldSendChunk = (chunk: { data: string; event?: string | undefined }): boolean => {
    if (!filterReasoningOnReplay) {
      return true;
    }
    return chunk.event !== 'reasoning-delta';
  };

  return new ReadableStream({
    cancel() {
      isClosed = true;
    },

    async start(controller) {
      const startTime = Date.now();
      let streamId: string | null = null;
      let lastKeepaliveTime = Date.now();
      const KEEPALIVE_INTERVAL_MS = 15_000; // Send keepalive every 15s to prevent idle timeout

      // Phase 1: Wait for stream to appear (server-side waiting, not client retry)
      const pLabel = formatParticipantLabel(participantIndex);
      log.ai('stream', `[WAITING-STREAM] ${pLabel} r${roundNumber} - waiting for stream to appear`);

      // ✅ FIX: Send initial SSE comment immediately to establish HTTP response
      // Without this, browser shows "Provisional headers are shown" until actual data arrives
      // SSE comments (lines starting with :) are valid SSE but ignored by parsers
      const initialComment = `:waiting for ${pLabel} stream\n\n`;
      if (!safeEnqueue(controller, encoder.encode(initialComment))) {
        return;
      }

      while (!isClosed && !streamId) {
        if (Date.now() - startTime > waitForStreamTimeoutMs) {
          log.ai('stream', `[WAITING-STREAM] ${pLabel} r${roundNumber} - timeout waiting for stream`);
          const errorEvent = `data: {"type":"error","error":"Stream not available after ${waitForStreamTimeoutMs}ms"}\n\n`;
          safeEnqueue(controller, encoder.encode(errorEvent));
          safeClose(controller);
          return;
        }

        // ✅ SEQUENTIAL GUARD: Enforce proper ordering
        // - For P1+, verify previous participants have completed
        // - For moderator (negative index), verify ALL participants have completed
        // This prevents race conditions where P1 starts before P0 finishes
        const activeStream = await getThreadActiveStream(threadId, env);

        // ✅ DIAGNOSTIC: Log activeStream state for debugging P1 delays
        if (!activeStream) {
          log.ai('stream', `[WAITING-STREAM] ${pLabel} r${roundNumber} - no activeStream in KV yet`);
        } else if (activeStream.roundNumber !== roundNumber) {
          log.ai('stream', `[WAITING-STREAM] ${pLabel} r${roundNumber} - activeStream is for r${activeStream.roundNumber}`);
        } else if (!activeStream.participantStatuses) {
          log.ai('stream', `[WAITING-STREAM] ${pLabel} r${roundNumber} - activeStream has no participantStatuses`);
        }

        if (activeStream?.roundNumber === roundNumber && activeStream.participantStatuses) {
          const statuses = activeStream.participantStatuses;
          const participantIndices = Object.keys(statuses).map(Number).filter(i => i >= 0);

          if (participantIndex < 0) {
            // Moderator: ALL participants must be complete AND presearch must be complete (if enabled)
            const allStatuses = participantIndices.map(i => statuses[i]);
            const allParticipantsComplete = participantIndices.length > 0 && allStatuses.every((status) => {
              return status === 'completed' || status === 'failed';
            });

            // Check presearch status from round execution state
            const roundState = await getRoundExecutionState(threadId, roundNumber, env);
            const preSearchStatus = roundState?.preSearchStatus;
            const preSearchComplete = !preSearchStatus // null means presearch not enabled
              || preSearchStatus === RoundPreSearchStatuses.COMPLETED
              || preSearchStatus === RoundPreSearchStatuses.FAILED
              || preSearchStatus === RoundPreSearchStatuses.SKIPPED;

            if (!allParticipantsComplete || !preSearchComplete) {
              // Participants or presearch not done yet - keep waiting for moderator
              log.ai('stream', `[WAITING-STREAM] Moderator r${roundNumber} - waiting: participants=[${allStatuses.join(',')}] presearch=${preSearchStatus ?? 'null'}`);
              await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
              continue;
            } else {
              log.ai('stream', `[WAITING-STREAM] Moderator r${roundNumber} - all complete: participants=[${allStatuses.join(',')}] presearch=${preSearchStatus ?? 'null'}`);
            }
          } else {
            // Participants (P0, P1, P2, ...): Check presearch completion first (blocks ALL participants)
            // Then P1+ must also wait for previous participants to complete

            // Check presearch status from round execution state
            const roundState = await getRoundExecutionState(threadId, roundNumber, env);
            const preSearchStatus = roundState?.preSearchStatus;
            const preSearchComplete = !preSearchStatus // null means presearch not enabled
              || preSearchStatus === RoundPreSearchStatuses.COMPLETED
              || preSearchStatus === RoundPreSearchStatuses.FAILED
              || preSearchStatus === RoundPreSearchStatuses.SKIPPED;

            if (!preSearchComplete) {
              // Presearch not done yet - block ALL participants per FLOW_DOCUMENTATION.md
              log.ai('stream', `[WAITING-STREAM] ${pLabel} r${roundNumber} - blocked by presearch: status=${preSearchStatus}`);
              await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
              continue;
            }

            // P1+: Previous participants must also be complete
            if (participantIndex > 0) {
              const prevStatuses = Array.from({ length: participantIndex }).map((_, i) => statuses[i]);
              const allPreviousComplete = prevStatuses.every((status) => {
                return status === 'completed' || status === 'failed';
              });

              if (!allPreviousComplete) {
                // Previous participants not done yet - keep waiting
                log.ai('stream', `[WAITING-STREAM] ${pLabel} r${roundNumber} - waiting for previous: statuses=[${prevStatuses.join(',')}]`);
                await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
                continue;
              } else {
                log.ai('stream', `[WAITING-STREAM] ${pLabel} r${roundNumber} - previous complete: statuses=[${prevStatuses.join(',')}]`);
              }
            } else {
              log.ai('stream', `[WAITING-STREAM] ${pLabel} r${roundNumber} - presearch complete, P0 can start`);
            }
          }
        }

        // Check if stream has started
        streamId = await getActiveParticipantStreamId(threadId, roundNumber, participantIndex, env);

        if (!streamId) {
          // Also check thread active stream
          const activeStream = await getThreadActiveStream(threadId, env);
          if (activeStream?.participantIndex === participantIndex && activeStream.roundNumber === roundNumber) {
            streamId = activeStream.streamId;
          }
        }

        if (!streamId) {
          // ✅ FIX: Send periodic keepalives to prevent Cloudflare idle timeout (100s)
          // and to show the browser the connection is still active
          if (Date.now() - lastKeepaliveTime > KEEPALIVE_INTERVAL_MS) {
            const keepalive = `:keepalive ${pLabel} waiting\n\n`;
            if (!safeEnqueue(controller, encoder.encode(keepalive))) {
              return;
            }
            lastKeepaliveTime = Date.now();
          }
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
      }

      if (isClosed || !streamId) {
        safeClose(controller);
        return;
      }

      log.ai('stream', `[WAITING-STREAM] ${pLabel} r${roundNumber} - stream found: ${streamId.slice(-8)}`);

      // Phase 2: Stream data (same as createLiveParticipantResumeStream)
      let lastChunkIndex = startFromChunkIndex;
      let lastNewDataTime = Date.now();

      try {
        // Track if initial chunks contain finish event
        let initialFinishEventFound = false;

        // Send initial chunks
        const initialChunks = await getParticipantStreamChunks(streamId, env);
        if (initialChunks && initialChunks.length > startFromChunkIndex) {
          for (let i = startFromChunkIndex; i < initialChunks.length; i++) {
            const chunk = initialChunks[i];
            if (chunk && shouldSendChunk(chunk)) {
              if (!safeEnqueue(controller, encoder.encode(chunk.data))) {
                return;
              }
              // Natural pacing: KV polling latency provides gradual delivery
              // No artificial delays - chunks stream as fast as network allows

              // ✅ FIX: Check if initial chunks contain finish events
              if (chunkContainsFinishEvent(chunk.data)) {
                initialFinishEventFound = true;
              }
            }
          }
          lastChunkIndex = initialChunks.length;
          lastNewDataTime = Date.now();
        }

        // Check if already completed
        const initialMetadata = await getParticipantStreamMetadata(streamId, env);

        // ✅ FIX: Close immediately if finish event was found in initial chunks
        // This handles the KV eventual consistency race condition
        if (
          initialFinishEventFound
          || initialMetadata?.status === StreamStatuses.COMPLETED
          || initialMetadata?.status === StreamStatuses.FAILED
        ) {
          log.ai('stream', `[WAITING-STREAM] ${pLabel} r${roundNumber} - already complete (finishEvent=${initialFinishEventFound}, status=${initialMetadata?.status ?? 'unknown'})`);
          safeClose(controller);
          return;
        }

        // Continue polling for new chunks
        while (!isClosed) {
          if (Date.now() - startTime > maxPollDurationMs) {
            safeClose(controller);
            return;
          }

          const chunks = await getParticipantStreamChunks(streamId, env);
          const metadata = await getParticipantStreamMetadata(streamId, env);

          // Track if we found a finish event in buffered chunks
          let foundFinishEventInChunks = false;

          if (chunks && chunks.length > lastChunkIndex) {
            for (let i = lastChunkIndex; i < chunks.length; i++) {
              const chunk = chunks[i];
              if (chunk && shouldSendChunk(chunk)) {
                if (!safeEnqueue(controller, encoder.encode(chunk.data))) {
                  return;
                }
                // Natural pacing: KV polling latency provides gradual delivery
                // No artificial delays - chunks stream as fast as network allows

                // ✅ FIX: Check if this chunk contains a finish event
                if (chunkContainsFinishEvent(chunk.data)) {
                  foundFinishEventInChunks = true;
                }
              }
            }
            lastChunkIndex = chunks.length;
            lastNewDataTime = Date.now();
          }

          // ✅ FIX: Close stream if we found finish events in chunks OR metadata says complete
          if (
            foundFinishEventInChunks
            || metadata?.status === StreamStatuses.COMPLETED
            || metadata?.status === StreamStatuses.FAILED
          ) {
            log.ai('stream', `[WAITING-STREAM] ${pLabel} r${roundNumber} - stream complete (finishEvent=${foundFinishEventInChunks}, status=${metadata?.status ?? 'unknown'}), sent ${lastChunkIndex} total chunks`);

            // Only send synthetic finish events if we didn't already send them from buffered chunks
            if (!foundFinishEventInChunks) {
              const finishReason = metadata?.status === StreamStatuses.COMPLETED ? 'stop' : 'error';
              const finishEvent = `e:{"finishReason":"${finishReason}"}\n`;
              const finishData = `d:{"finishReason":"${finishReason}","usage":{"promptTokens":0,"completionTokens":0}}\n`;
              safeEnqueue(controller, encoder.encode(finishEvent));
              safeEnqueue(controller, encoder.encode(finishData));
            }

            safeClose(controller);
            return;
          }

          const timeSinceLastNewData = Date.now() - lastNewDataTime;
          if (timeSinceLastNewData > noNewDataTimeoutMs) {
            // ✅ AI SDK PATTERN: Send explicit error event before synthetic finish
            // This allows frontend to distinguish timeout from normal completion
            const timeoutSeconds = Math.round(noNewDataTimeoutMs / 1000);
            log.ai('stream', `[WAITING-STREAM] ${pLabel} r${roundNumber} - timeout after ${timeoutSeconds}s, sent ${lastChunkIndex} chunks`);
            const errorEvent = `data: {"type":"error","error":"STREAM_TIMEOUT","message":"Stream timed out after ${timeoutSeconds}s of no activity"}\n\n`;
            safeEnqueue(controller, encoder.encode(errorEvent));

            const syntheticFinish = `data: {"type":"finish","finishReason":"${FinishReasons.ERROR}","error":"STREAM_TIMEOUT","usage":{"promptTokens":0,"completionTokens":0}}\n\n`;
            safeEnqueue(controller, encoder.encode(syntheticFinish));
            safeClose(controller);
            return;
          }

          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
      } catch {
        safeClose(controller);
      }
    },
  });
}

// ============================================================================
// PRE-SEARCH STREAM BUFFER OPERATIONS
// ============================================================================

export async function initializePreSearchStreamBuffer(
  streamId: string,
  threadId: string,
  roundNumber: number,
  preSearchId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    logger?.debug('KV not available, skipping pre-search stream buffer init');
    return;
  }

  try {
    const metadata: PreSearchStreamMetadata = {
      chunkCount: 0,
      createdAt: Date.now(),
      preSearchId,
      roundNumber,
      status: StreamStatuses.ACTIVE,
      streamId,
      threadId,
    };

    await Promise.all([
      env.KV.put(getMetadataKey(streamId), JSON.stringify(metadata), {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      }),
      env.KV.put(getActiveKey(threadId, roundNumber, StreamPhases.PRESEARCH), streamId, {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      }),
    ]);

    logger?.debug('Initialized pre-search stream buffer', LogHelpers.operation({
      operationName: 'initializePreSearchStreamBuffer',
      roundNumber,
      streamId,
      threadId,
    }));
  } catch (error) {
    logger?.warn('Failed to initialize pre-search stream buffer', LogHelpers.edgeCase({
      error: error instanceof Error ? error.message : 'Unknown error',
      scenario: 'pre_search_buffer_init_failed',
      streamId,
    }));
  }
}

export async function appendPreSearchStreamChunk(
  streamId: string,
  event: string,
  data: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getMetadataKey(streamId);
    const rawMetadata = await env.KV.get(metadataKey, 'json');
    const metadataResult = PreSearchStreamMetadataSchema.safeParse(rawMetadata);

    if (!metadataResult.success) {
      logger?.warn('Stream metadata not found during chunk append', LogHelpers.edgeCase({
        scenario: 'pre_search_metadata_not_found',
        streamId,
      }));
      return;
    }

    const metadata = metadataResult.data;
    const chunkIndex = metadata.chunkCount;

    const newChunk: PreSearchStreamChunk = {
      data,
      event,
      index: chunkIndex,
      timestamp: Date.now(),
    };

    await env.KV.put(
      getChunkKey(streamId, chunkIndex),
      JSON.stringify(newChunk),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    const updatedMetadata = { ...metadata, chunkCount: chunkIndex + 1 };
    await env.KV.put(metadataKey, JSON.stringify(updatedMetadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });
  } catch (error) {
    logger?.warn('Failed to append pre-search stream chunk', LogHelpers.edgeCase({
      error: error instanceof Error ? error.message : 'Unknown error',
      scenario: 'pre_search_chunk_append_failed',
      streamId,
    }));
  }
}

export async function completePreSearchStreamBuffer(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getMetadataKey(streamId);
    const raw = await env.KV.get(metadataKey, 'json');
    const result = PreSearchStreamMetadataSchema.safeParse(raw);

    if (!result.success) {
      return;
    }

    const metadata = {
      ...result.data,
      completedAt: Date.now(),
      status: StreamStatuses.COMPLETED,
    };

    await env.KV.put(metadataKey, JSON.stringify(metadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    logger?.debug('Completed pre-search stream buffer', LogHelpers.operation({
      operationName: 'completePreSearchStreamBuffer',
      streamId,
    }));
  } catch (error) {
    logger?.warn('Failed to complete pre-search stream buffer', LogHelpers.edgeCase({
      error: error instanceof Error ? error.message : 'Unknown error',
      scenario: 'pre_search_buffer_complete_failed',
      streamId,
    }));
  }
}

export async function failPreSearchStreamBuffer(
  streamId: string,
  errorMessage: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getMetadataKey(streamId);
    const raw = await env.KV.get(metadataKey, 'json');
    const result = PreSearchStreamMetadataSchema.safeParse(raw);

    if (!result.success) {
      return;
    }

    const metadata = {
      ...result.data,
      completedAt: Date.now(),
      errorMessage,
      status: StreamStatuses.FAILED,
    };

    await env.KV.put(metadataKey, JSON.stringify(metadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    logger?.debug('Failed pre-search stream buffer', LogHelpers.operation({
      errorMessage,
      operationName: 'failPreSearchStreamBuffer',
      streamId,
    }));
  } catch (error) {
    logger?.warn('Failed to fail pre-search stream buffer', LogHelpers.edgeCase({
      error: error instanceof Error ? error.message : 'Unknown error',
      scenario: 'pre_search_buffer_fail_failed',
      streamId,
    }));
  }
}

export async function clearActivePreSearchStream(
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    await env.KV.delete(getActiveKey(threadId, roundNumber, StreamPhases.PRESEARCH));
    logger?.debug('Cleared active pre-search stream', LogHelpers.operation({
      operationName: 'clearActivePreSearchStream',
      roundNumber,
      threadId,
    }));
  } catch (error) {
    logger?.warn('Failed to clear active pre-search stream', LogHelpers.edgeCase({
      error: error instanceof Error ? error.message : 'Unknown error',
      roundNumber,
      scenario: 'pre_search_clear_failed',
      threadId,
    }));
  }
}

export async function getActivePreSearchStreamId(
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
): Promise<string | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    return await env.KV.get(getActiveKey(threadId, roundNumber, StreamPhases.PRESEARCH));
  } catch {
    return null;
  }
}

export async function getPreSearchStreamMetadata(
  streamId: string,
  env: ApiEnv['Bindings'],
): Promise<PreSearchStreamMetadata | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const raw = await env.KV.get(getMetadataKey(streamId), 'json');
    const result = PreSearchStreamMetadataSchema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function getPreSearchStreamChunks(
  streamId: string,
  env: ApiEnv['Bindings'],
): Promise<PreSearchStreamChunk[] | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const metadata = await getPreSearchStreamMetadata(streamId, env);

    if (!metadata) {
      return null;
    }

    if (metadata.chunkCount === 0) {
      return [];
    }

    const BATCH_SIZE = 50;
    const chunks: PreSearchStreamChunk[] = [];

    for (let batchStart = 0; batchStart < metadata.chunkCount; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, metadata.chunkCount);
      const batchPromises: Promise<string | null>[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        batchPromises.push(env.KV.get(getChunkKey(streamId, i), 'text'));
      }

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        if (result) {
          const parseResult = PreSearchStreamChunkSchema.safeParse(JSON.parse(result));
          if (parseResult.success) {
            chunks.push(parseResult.data);
          }
        }
      }
    }

    return chunks;
  } catch {
    return null;
  }
}

export async function isPreSearchBufferStale(
  streamId: string,
  env: ApiEnv['Bindings'],
  maxStaleMs = 5_000,
): Promise<boolean> {
  if (!env?.KV) {
    return true;
  }

  try {
    const chunks = await getPreSearchStreamChunks(streamId, env);

    if (!chunks || chunks.length === 0) {
      return true;
    }

    const lastChunk = chunks[chunks.length - 1];
    if (!lastChunk?.timestamp) {
      return true;
    }

    const timeSinceLastChunk = Date.now() - lastChunk.timestamp;
    return timeSinceLastChunk > maxStaleMs;
  } catch {
    return true;
  }
}

/**
 * ✅ FIX #2: Pre-search Waiting Stream Pattern
 *
 * Creates an SSE stream that WAITS for a pre-search stream to appear before streaming.
 * This follows the same pattern as createWaitingParticipantStream:
 * - Server keeps connection open
 * - Server polls for stream to become available
 * - Server pushes data as it arrives
 * - Client does NOT retry - single connection
 *
 * This replaces the 202 Accepted response pattern that forced client-side polling.
 *
 * @param threadId - Thread ID to monitor
 * @param roundNumber - Round number to stream
 * @param env - Cloudflare environment bindings
 * @param options - Stream options
 */
export function createWaitingPreSearchStream(
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
  options: {
    pollIntervalMs?: number;
    maxPollDurationMs?: number;
    noNewDataTimeoutMs?: number;
    waitForStreamTimeoutMs?: number;
  } = {},
): ReadableStream<Uint8Array> {
  const {
    maxPollDurationMs = 10 * 60 * 1000, // 10 minutes
    noNewDataTimeoutMs = 90 * 1000, // 90 seconds - just under Cloudflare's 100s idle timeout
    pollIntervalMs = 100,
    waitForStreamTimeoutMs = 60 * 1000, // 60 seconds to wait for stream to appear
  } = options;

  const encoder = new TextEncoder();
  let isClosed = false;

  const safeClose = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (isClosed) {
      return;
    }
    try {
      isClosed = true;
      controller.close();
    } catch {
      // Controller already closed
    }
  };

  const safeEnqueue = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    data: Uint8Array,
  ) => {
    if (isClosed) {
      return false;
    }
    try {
      controller.enqueue(data);
      return true;
    } catch {
      isClosed = true;
      return false;
    }
  };

  return new ReadableStream({
    cancel() {
      isClosed = true;
    },

    async start(controller) {
      const startTime = Date.now();
      let streamId: string | null = null;
      let lastKeepaliveTime = Date.now();
      const KEEPALIVE_INTERVAL_MS = 15_000; // Send keepalive every 15s to prevent idle timeout

      // Phase 1: Send initial comment to establish HTTP response
      log.ai('stream', `[WAITING-PRESEARCH] r${roundNumber} - waiting for stream to appear`);
      const initialComment = `:waiting for presearch stream r${roundNumber}\n\n`;
      if (!safeEnqueue(controller, encoder.encode(initialComment))) {
        return;
      }

      // Phase 2: Poll for stream to appear (server-side waiting, not client retry)
      while (!isClosed && !streamId) {
        if (Date.now() - startTime > waitForStreamTimeoutMs) {
          log.ai('stream', `[WAITING-PRESEARCH] r${roundNumber} - timeout waiting for stream`);
          const errorEvent = `event: error\ndata: {"error":"Pre-search stream not available after ${waitForStreamTimeoutMs}ms"}\n\n`;
          safeEnqueue(controller, encoder.encode(errorEvent));
          safeClose(controller);
          return;
        }

        // Check if stream has started
        streamId = await getActivePreSearchStreamId(threadId, roundNumber, env);

        if (!streamId) {
          // Send periodic keepalives to prevent Cloudflare idle timeout (100s)
          if (Date.now() - lastKeepaliveTime > KEEPALIVE_INTERVAL_MS) {
            const keepalive = `:keepalive presearch r${roundNumber} waiting\n\n`;
            if (!safeEnqueue(controller, encoder.encode(keepalive))) {
              return;
            }
            lastKeepaliveTime = Date.now();
          }
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
      }

      if (isClosed || !streamId) {
        safeClose(controller);
        return;
      }

      log.ai('stream', `[WAITING-PRESEARCH] r${roundNumber} - stream found: ${streamId.slice(-8)}`);

      // Phase 3: Stream data (same as createLivePreSearchResumeStream)
      let lastChunkIndex = 0;
      let lastNewDataTime = Date.now();

      try {
        // Send initial chunks with staggered delay for gradual UI rendering
        const initialChunks = await getPreSearchStreamChunks(streamId, env);
        if (initialChunks && initialChunks.length > 0) {
          for (let i = 0; i < initialChunks.length; i++) {
            const chunk = initialChunks[i];
            if (chunk) {
              const sseData = `event: ${chunk.event}\ndata: ${chunk.data}\n\n`;
              if (!safeEnqueue(controller, encoder.encode(sseData))) {
                return;
              }
              // Add delay between chunks (except after last) for gradual replay
              if (i < initialChunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 30));
              }
            }
          }
          lastChunkIndex = initialChunks.length;
          lastNewDataTime = Date.now();
        }

        // Check if already completed
        const initialMetadata = await getPreSearchStreamMetadata(streamId, env);
        if (
          initialMetadata?.status === StreamStatuses.COMPLETED
          || initialMetadata?.status === StreamStatuses.FAILED
        ) {
          log.ai('stream', `[WAITING-PRESEARCH] r${roundNumber} - already complete`);
          safeClose(controller);
          return;
        }

        // Continue polling for new chunks
        while (!isClosed) {
          if (Date.now() - startTime > maxPollDurationMs) {
            safeClose(controller);
            return;
          }

          const chunks = await getPreSearchStreamChunks(streamId, env);
          const metadata = await getPreSearchStreamMetadata(streamId, env);

          if (chunks && chunks.length > lastChunkIndex) {
            for (let i = lastChunkIndex; i < chunks.length; i++) {
              const chunk = chunks[i];
              if (chunk) {
                const sseData = `event: ${chunk.event}\ndata: ${chunk.data}\n\n`;
                if (!safeEnqueue(controller, encoder.encode(sseData))) {
                  return;
                }
              }
            }
            lastChunkIndex = chunks.length;
            lastNewDataTime = Date.now();
          }

          if (
            metadata?.status === StreamStatuses.COMPLETED
            || metadata?.status === StreamStatuses.FAILED
          ) {
            log.ai('stream', `[WAITING-PRESEARCH] r${roundNumber} - stream complete, sent ${lastChunkIndex} chunks`);
            safeClose(controller);
            return;
          }

          const timeSinceLastNewData = Date.now() - lastNewDataTime;
          if (timeSinceLastNewData > noNewDataTimeoutMs) {
            const syntheticDone = `event: done\ndata: {"interrupted":true,"reason":"stream_timeout"}\n\n`;
            safeEnqueue(controller, encoder.encode(syntheticDone));
            safeClose(controller);
            return;
          }

          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
      } catch {
        safeClose(controller);
      }
    },
  });
}

/**
 * ✅ FIX #4: Unified Response Contract - Immediate Completion Stream
 *
 * Creates an SSE stream that immediately emits a completion/status event and closes.
 * Used for unified response contract when stream is already complete.
 *
 * This ensures subscription endpoints ALWAYS return SSE, even for "already complete" cases.
 * Frontend no longer needs to handle both JSON and SSE response types.
 *
 * @param data - Completion data to send
 */
export function createCompletionStream(data: {
  lastSeq: number;
  participantIndex?: number;
  phase: 'presearch' | 'participant' | 'moderator';
  status: 'complete' | 'error';
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      // Emit stream-status event (matches existing event schema)
      const statusEvent = `event: stream-status\ndata: ${JSON.stringify({
        chunkCount: data.lastSeq,
        participantIndex: data.participantIndex,
        phase: data.phase,
        status: data.status === 'complete' ? StreamStatuses.COMPLETED : StreamStatuses.FAILED,
      })}\n\n`;
      controller.enqueue(encoder.encode(statusEvent));

      // Emit done event to signal stream end
      const doneEvent = `event: done\ndata: ${JSON.stringify({ lastSeq: data.lastSeq })}\n\n`;
      controller.enqueue(encoder.encode(doneEvent));

      // Close stream
      controller.close();
    },
  });
}

/**
 * Create live resume stream for pre-search operations
 *
 * Pre-search is typically faster than participant/moderator streams,
 * but still needs generous timeouts for complex web searches.
 *
 * @param streamId - Pre-search stream ID
 * @param env - Cloudflare bindings
 * @param pollIntervalMs - Poll interval (default: 100ms)
 * @param maxPollDurationMs - Max poll duration (default: 10 min)
 * @param noNewDataTimeoutMs - No new data timeout (default: 90s - just under Cloudflare's 100s idle timeout)
 */
export function createLivePreSearchResumeStream(
  streamId: string,
  env: ApiEnv['Bindings'],
  pollIntervalMs = 100,
  maxPollDurationMs = 10 * 60 * 1000, // 10 minutes - generous for complex searches
  noNewDataTimeoutMs = 90 * 1000, // 90 seconds - just under Cloudflare's 100s idle timeout
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let isClosed = false;

  const safeClose = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (isClosed) {
      return;
    }
    try {
      isClosed = true;
      controller.close();
    } catch {
      // Controller already closed
    }
  };

  const safeEnqueue = (controller: ReadableStreamDefaultController<Uint8Array>, data: Uint8Array) => {
    if (isClosed) {
      return false;
    }
    try {
      controller.enqueue(data);
      return true;
    } catch {
      isClosed = true;
      return false;
    }
  };

  return new ReadableStream({
    cancel() {
      isClosed = true;
    },

    async start(controller) {
      let lastChunkIndex = 0;
      const startTime = Date.now();
      let lastNewDataTime = Date.now();

      // ✅ FIX: Send initial SSE comment to establish HTTP response immediately
      const initialComment = `:presearch ${streamId.slice(-8)}\n\n`;
      if (!safeEnqueue(controller, encoder.encode(initialComment))) {
        return;
      }

      try {
        const initialChunks = await getPreSearchStreamChunks(streamId, env);
        if (initialChunks && initialChunks.length > 0) {
          // BUG FIX: Add staggered delay between buffered chunks for gradual UI rendering
          // Without delay, all chunks are sent instantly causing all-at-once display
          // 30ms matches the visual pace users expect for gradual skeleton replacement
          for (let i = 0; i < initialChunks.length; i++) {
            const chunk = initialChunks[i];
            if (chunk) {
              const sseData = `event: ${chunk.event}\ndata: ${chunk.data}\n\n`;
              if (!safeEnqueue(controller, encoder.encode(sseData))) {
                return;
              }
              // Add delay between chunks (except after last) for gradual replay
              if (i < initialChunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 30));
              }
            }
          }
          lastChunkIndex = initialChunks.length;
          lastNewDataTime = Date.now();
        }

        const initialMetadata = await getPreSearchStreamMetadata(streamId, env);
        if (initialMetadata?.status === StreamStatuses.COMPLETED || initialMetadata?.status === StreamStatuses.FAILED) {
          safeClose(controller);
          return;
        }

        // eslint-disable-next-line no-unmodified-loop-condition -- isClosed is modified in cancel() callback and safeClose()/safeEnqueue() error handlers
        while (!isClosed) {
          if (Date.now() - startTime > maxPollDurationMs) {
            safeClose(controller);
            return;
          }

          const chunks = await getPreSearchStreamChunks(streamId, env);
          const metadata = await getPreSearchStreamMetadata(streamId, env);

          if (chunks && chunks.length > lastChunkIndex) {
            for (let i = lastChunkIndex; i < chunks.length; i++) {
              const chunk = chunks[i];
              if (chunk) {
                const sseData = `event: ${chunk.event}\ndata: ${chunk.data}\n\n`;
                if (!safeEnqueue(controller, encoder.encode(sseData))) {
                  return;
                }
              }
            }
            lastChunkIndex = chunks.length;
            lastNewDataTime = Date.now();
          }

          if (metadata?.status === StreamStatuses.COMPLETED || metadata?.status === StreamStatuses.FAILED) {
            safeClose(controller);
            return;
          }

          const timeSinceLastNewData = Date.now() - lastNewDataTime;
          if (timeSinceLastNewData > noNewDataTimeoutMs) {
            const syntheticDone = `event: done\ndata: {"interrupted":true,"reason":"stream_timeout"}\n\n`;
            safeEnqueue(controller, encoder.encode(syntheticDone));
            safeClose(controller);
            return;
          }

          await new Promise((resolve) => {
            setTimeout(resolve, pollIntervalMs);
          });
        }
      } catch {
        safeClose(controller);
      }
    },
  });
}

// ============================================================================
// MODERATOR STREAM BUFFER OPERATIONS (STUB - FOR FUTURE IMPLEMENTATION)
// ============================================================================

export async function initializeModeratorStreamBuffer(
  streamId: string,
  threadId: string,
  roundNumber: number,
  moderatorId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadata: ModeratorStreamBufferMetadata = {
      chunkCount: 0,
      completedAt: null,
      createdAt: Date.now(),
      errorMessage: null,
      moderatorId,
      roundNumber,
      status: StreamStatuses.ACTIVE,
      streamId,
      threadId,
    };

    await Promise.all([
      env.KV.put(getMetadataKey(streamId), JSON.stringify(metadata), {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      }),
      env.KV.put(getActiveKey(threadId, roundNumber, StreamPhases.MODERATOR), streamId, {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      }),
    ]);

    logger?.info('Initialized moderator stream buffer', LogHelpers.operation({
      operationName: 'initializeModeratorStreamBuffer',
      roundNumber,
      streamId,
      threadId,
    }));
  } catch (error) {
    logger?.error('Failed to initialize moderator stream buffer', LogHelpers.operation({
      error: error instanceof Error ? error.message : 'Unknown error',
      operationName: 'initializeModeratorStreamBuffer',
      streamId,
    }));
  }
}

export async function appendModeratorStreamChunk(
  streamId: string,
  data: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getMetadataKey(streamId);
    const rawMetadata = await env.KV.get(metadataKey, 'json');
    const metadataResult = ModeratorStreamBufferMetadataSchema.safeParse(rawMetadata);

    if (!metadataResult.success) {
      logger?.warn('Stream metadata not found during chunk append', LogHelpers.edgeCase({
        scenario: 'moderator_metadata_not_found',
        streamId,
      }));
      return;
    }

    const metadata = metadataResult.data;
    const chunkIndex = metadata.chunkCount;

    const newChunk: ModeratorStreamChunk = {
      data,
      seq: chunkIndex,
      timestamp: Date.now(),
    };

    await env.KV.put(
      getChunkKey(streamId, chunkIndex),
      JSON.stringify(newChunk),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    const updatedMetadata = { ...metadata, chunkCount: chunkIndex + 1 };
    await env.KV.put(metadataKey, JSON.stringify(updatedMetadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });
  } catch (error) {
    logger?.warn('Failed to append moderator stream chunk', LogHelpers.edgeCase({
      error: error instanceof Error ? error.message : 'Unknown error',
      scenario: 'moderator_chunk_append_failed',
      streamId,
    }));
  }
}

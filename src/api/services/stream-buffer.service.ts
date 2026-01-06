/**
 * Stream Buffer Service - Cloudflare KV-based SSE stream buffering
 *
 * **BACKEND SERVICE**: Enables stream resumption after page reload
 * Following backend-patterns.md: Service layer for streaming infrastructure
 *
 * **PURPOSE**:
 * - Buffer SSE chunks from AI SDK streams into Cloudflare KV
 * - Enable resumption after page reload/connection loss
 * - Compatible with AI SDK v6 `consumeSseStream` callback
 *
 * **ARCHITECTURE**:
 * - Stream ID matches message ID: `{threadId}_r{roundNumber}_p{participantIndex}`
 * - Chunks stored as array in KV with 1-hour TTL
 * - Automatic cleanup on stream completion
 *
 * **INTEGRATION**:
 * - Called from streaming.handler.ts via `consumeSseStream` callback
 * - Frontend resumes via GET endpoint checking KV for active streams
 *
 * @module api/services/stream-buffer
 * @see /src/api/types/streaming.ts for type definitions
 */

import { FinishReasons, StreamStatuses } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';
import type { TypedLogger } from '@/api/types/logger';
import { LogHelpers } from '@/api/types/logger';
import type { StreamBufferMetadata, StreamChunk } from '@/api/types/streaming';
import {
  isStreamChunk,
  parseSSEEventType,
  parseStreamBufferMetadata,
  STREAM_BUFFER_TTL_SECONDS,
} from '@/api/types/streaming';

/**
 * Generate KV key for stream buffer metadata
 */
function getMetadataKey(streamId: string): string {
  return `stream:buffer:${streamId}:meta`;
}

/**
 * Generate KV key for individual chunk storage
 * ✅ FIX: Store chunks individually to avoid O(n) memory accumulation
 */
function getChunkKey(streamId: string, index: number): string {
  return `stream:buffer:${streamId}:c:${index}`;
}

/**
 * Generate KV key for active stream tracking
 */
function getActiveKey(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
): string {
  return `stream:active:${threadId}:r${roundNumber}:p${participantIndex}`;
}

/**
 * Initialize stream buffer in KV
 * Called before streaming starts
 */
export async function initializeStreamBuffer(
  streamId: string,
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  // ✅ LOCAL DEV: Skip buffering if KV not available
  if (!env?.KV) {
    logger?.warn('KV not available - skipping stream buffer initialization', LogHelpers.operation({
      operationName: 'initializeStreamBuffer',
      streamId,
      edgeCase: 'kv_not_available',
    }));
    return;
  }

  try {
    const metadata: StreamBufferMetadata = {
      streamId,
      threadId,
      roundNumber,
      participantIndex,
      status: StreamStatuses.ACTIVE,
      chunkCount: 0,
      createdAt: Date.now(),
      completedAt: null,
      errorMessage: null,
    };

    // Store metadata only - chunks stored individually via appendStreamChunk
    // ✅ FIX: No longer initialize empty chunks array to avoid O(n) memory pattern
    await env.KV.put(getMetadataKey(streamId), JSON.stringify(metadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    // Track as active stream
    await env.KV.put(
      getActiveKey(threadId, roundNumber, participantIndex),
      streamId,
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    logger?.info('Initialized stream buffer', LogHelpers.operation({
      operationName: 'initializeStreamBuffer',
      streamId,
      threadId,
      roundNumber,
      participantIndex,
    }));
  } catch (error) {
    logger?.error('Failed to initialize stream buffer', LogHelpers.operation({
      operationName: 'initializeStreamBuffer',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
    throw error;
  }
}

/**
 * Append chunk to stream buffer
 * Called as SSE data arrives from AI SDK stream
 *
 * ✅ FIX: O(1) memory - stores each chunk as individual KV key instead of
 * accumulating in array. Previous O(n) pattern caused "Worker exceeded memory limit"
 * for long streams (reading/copying entire array per chunk append).
 */
export async function appendStreamChunk(
  streamId: string,
  data: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  // ✅ LOCAL DEV: Skip buffering if KV not available
  if (!env?.KV) {
    return;
  }

  try {
    // ✅ FIX: Parse SSE event type for deduplication during resumption
    const chunk: StreamChunk = {
      data,
      timestamp: Date.now(),
      event: parseSSEEventType(data),
    };

    // ✅ FIX: Get current chunk count from metadata (O(1) read)
    const metadataKey = getMetadataKey(streamId);
    const metadata = parseStreamBufferMetadata(await env.KV.get(metadataKey, 'json'));

    // If metadata doesn't exist, stream wasn't initialized - skip buffering
    // This is a race condition that shouldn't happen normally
    if (!metadata) {
      logger?.warn('Stream metadata not found during chunk append', LogHelpers.operation({
        operationName: 'appendStreamChunk',
        streamId,
        edgeCase: 'metadata_not_found',
      }));
      return;
    }

    const chunkIndex = metadata.chunkCount;

    // ✅ FIX: Store chunk at individual key (O(1) write, no array accumulation)
    // Key format: stream:buffer:{streamId}:c:{index}
    await env.KV.put(
      getChunkKey(streamId, chunkIndex),
      JSON.stringify(chunk),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    // ✅ FIX: Increment chunk count in metadata (O(1) update)
    metadata.chunkCount = chunkIndex + 1;
    await env.KV.put(metadataKey, JSON.stringify(metadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });
  } catch (error) {
    // Log error but don't fail - buffering is best-effort
    logger?.error('Failed to append stream chunk', LogHelpers.operation({
      operationName: 'appendStreamChunk',
      streamId,
      chunkDataLength: data.length,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

/**
 * Complete stream buffer
 * Called when stream finishes successfully
 */
export async function completeStreamBuffer(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  // ✅ LOCAL DEV: Skip buffering if KV not available
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getMetadataKey(streamId);
    // ✅ TYPE-SAFE: Use safe parser instead of force casting
    const metadata = parseStreamBufferMetadata(await env.KV.get(metadataKey, 'json'));

    if (!metadata) {
      logger?.warn('Stream metadata not found during completion', LogHelpers.operation({
        operationName: 'completeStreamBuffer',
        streamId,
        edgeCase: 'metadata_not_found',
      }));
      return;
    }

    // ✅ TYPE-SAFE: Create updated metadata object
    const updatedMetadata: StreamBufferMetadata = {
      ...metadata,
      status: StreamStatuses.COMPLETED,
      completedAt: Date.now(),
    };

    await env.KV.put(metadataKey, JSON.stringify(updatedMetadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    logger?.info('Completed stream buffer', LogHelpers.operation({
      operationName: 'completeStreamBuffer',
      streamId,
      chunkCount: updatedMetadata.chunkCount,
    }));
  } catch (error) {
    logger?.error('Failed to complete stream buffer', LogHelpers.operation({
      operationName: 'completeStreamBuffer',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

/**
 * Fail stream buffer
 * Called when stream encounters an error
 *
 * ✅ FIX: Uses individual chunk keys instead of array accumulation
 */
export async function failStreamBuffer(
  streamId: string,
  errorMessage: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  // ✅ LOCAL DEV: Skip buffering if KV not available
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getMetadataKey(streamId);
    const metadata = parseStreamBufferMetadata(await env.KV.get(metadataKey, 'json'));

    if (!metadata) {
      logger?.warn('Stream metadata not found during failure', LogHelpers.operation({
        operationName: 'failStreamBuffer',
        streamId,
        edgeCase: 'metadata_not_found',
      }));
      return;
    }

    // ✅ FIX: Append error chunk as individual key (O(1) operation)
    const errorChunk: StreamChunk = {
      data: `3:${JSON.stringify({ error: errorMessage })}`,
      timestamp: Date.now(),
      event: 'error',
    };

    const errorChunkIndex = metadata.chunkCount;
    await env.KV.put(
      getChunkKey(streamId, errorChunkIndex),
      JSON.stringify(errorChunk),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    // Update metadata with failure status and new chunk count
    const updatedMetadata: StreamBufferMetadata = {
      ...metadata,
      status: StreamStatuses.FAILED,
      completedAt: Date.now(),
      errorMessage,
      chunkCount: errorChunkIndex + 1,
    };

    await env.KV.put(metadataKey, JSON.stringify(updatedMetadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    logger?.info('Marked stream buffer as failed', LogHelpers.operation({
      operationName: 'failStreamBuffer',
      streamId,
      errorMessage,
    }));
  } catch (error) {
    logger?.error('Failed to mark stream as failed', LogHelpers.operation({
      operationName: 'failStreamBuffer',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

/**
 * Get active stream ID for thread/round/participant
 * Returns null if no active stream exists
 */
export async function getActiveStreamId(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<string | null> {
  // ✅ LOCAL DEV: Return null if KV not available
  if (!env?.KV) {
    return null;
  }

  try {
    const streamId = await env.KV.get(
      getActiveKey(threadId, roundNumber, participantIndex),
      'text',
    );

    if (streamId) {
      logger?.info('Found active stream', LogHelpers.operation({
        operationName: 'getActiveStreamId',
        threadId,
        roundNumber,
        participantIndex,
        streamId,
      }));
    }

    return streamId;
  } catch (error) {
    logger?.error('Failed to get active stream ID', LogHelpers.operation({
      operationName: 'getActiveStreamId',
      threadId,
      roundNumber,
      participantIndex,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
    return null;
  }
}

/**
 * Get stream buffer metadata
 */
export async function getStreamMetadata(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<StreamBufferMetadata | null> {
  // ✅ LOCAL DEV: Return null if KV not available
  if (!env?.KV) {
    return null;
  }

  try {
    // ✅ TYPE-SAFE: Use safe parser instead of force casting
    const metadata = parseStreamBufferMetadata(await env.KV.get(getMetadataKey(streamId), 'json'));

    if (metadata) {
      logger?.info('Retrieved stream metadata', LogHelpers.operation({
        operationName: 'getStreamMetadata',
        streamId,
        status: metadata.status,
        chunkCount: metadata.chunkCount,
      }));
    }

    return metadata;
  } catch (error) {
    logger?.error('Failed to get stream metadata', LogHelpers.operation({
      operationName: 'getStreamMetadata',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
    return null;
  }
}

/**
 * Get all buffered chunks for a stream
 * Returns chunks in order they were received
 *
 * ✅ FIX: Reads individual chunk keys instead of single array
 * Uses parallel batch reads for efficiency
 */
export async function getStreamChunks(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<StreamChunk[] | null> {
  // ✅ LOCAL DEV: Return null if KV not available
  if (!env?.KV) {
    return null;
  }

  try {
    // Get chunk count from metadata
    const metadata = parseStreamBufferMetadata(await env.KV.get(getMetadataKey(streamId), 'json'));

    if (!metadata) {
      return null;
    }

    if (metadata.chunkCount === 0) {
      return [];
    }

    // ✅ FIX: Read chunks in parallel batches for efficiency
    // KV doesn't have native batch get, so we use Promise.all
    // For very large streams (1000+ chunks), consider pagination
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
          try {
            const parsed = JSON.parse(result);
            if (isStreamChunk(parsed)) {
              chunks.push(parsed);
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    }

    if (chunks.length > 0) {
      logger?.info('Retrieved stream chunks', LogHelpers.operation({
        operationName: 'getStreamChunks',
        streamId,
        chunkCount: chunks.length,
      }));
    }

    return chunks;
  } catch (error) {
    logger?.error('Failed to get stream chunks', LogHelpers.operation({
      operationName: 'getStreamChunks',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
    return null;
  }
}

/**
 * Clear active stream tracking
 * Called when stream completes or fails
 */
export async function clearActiveStream(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  // ✅ LOCAL DEV: Skip if KV not available
  if (!env?.KV) {
    return;
  }

  try {
    await env.KV.delete(getActiveKey(threadId, roundNumber, participantIndex));

    logger?.info('Cleared active stream tracking', LogHelpers.operation({
      operationName: 'clearActiveStream',
      threadId,
      roundNumber,
      participantIndex,
    }));
  } catch (error) {
    logger?.warn('Failed to clear active stream', LogHelpers.operation({
      operationName: 'clearActiveStream',
      threadId,
      roundNumber,
      participantIndex,
      edgeCase: 'clear_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

/**
 * Delete entire stream buffer
 * Called to clean up after stream completes
 *
 * ✅ FIX: Deletes individual chunk keys and metadata
 */
export async function deleteStreamBuffer(
  streamId: string,
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  // ✅ LOCAL DEV: Skip if KV not available
  if (!env?.KV) {
    return;
  }

  try {
    // Get chunk count to know how many chunk keys to delete
    const metadata = parseStreamBufferMetadata(await env.KV.get(getMetadataKey(streamId), 'json'));
    const chunkCount = metadata?.chunkCount || 0;

    // ✅ FIX: Delete all individual chunk keys in batches
    const BATCH_SIZE = 50;
    for (let batchStart = 0; batchStart < chunkCount; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, chunkCount);
      const deletePromises: Promise<void>[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        deletePromises.push(env.KV.delete(getChunkKey(streamId, i)));
      }

      await Promise.all(deletePromises);
    }

    // Delete metadata and active stream tracking
    await Promise.all([
      env.KV.delete(getMetadataKey(streamId)),
      env.KV.delete(getActiveKey(threadId, roundNumber, participantIndex)),
    ]);

    logger?.info(`Deleted stream buffer with ${chunkCount} chunks`, LogHelpers.operation({
      operationName: 'deleteStreamBuffer',
      streamId,
    }));
  } catch (error) {
    logger?.warn('Failed to delete stream buffer', LogHelpers.operation({
      operationName: 'deleteStreamBuffer',
      streamId,
      edgeCase: 'delete_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

// ============================================================================
// Live Stream Resumption
// ============================================================================

/**
 * Resume stream options for configuring chunk replay behavior
 */
export type ResumeStreamOptions = {
  /** How often to check for new chunks (default 100ms) */
  pollIntervalMs?: number;
  /** Maximum time to poll before giving up (default 5 minutes) */
  maxPollDurationMs?: number;
  /** Time to wait without new data before marking stream as stale (default 30 seconds) */
  noNewDataTimeoutMs?: number;
  /** Skip reasoning chunks during replay to prevent duplicate thinking tags */
  filterReasoningOnReplay?: boolean;
  /** Start from this chunk index (skip chunks already received by client) */
  startFromChunkIndex?: number;
};

/**
 * Create a LIVE SSE streaming response that polls KV for new chunks
 *
 * This enables true stream resumption for participant streams:
 * 1. Return all buffered SSE chunks immediately
 * 2. Keep polling KV for new chunks as they arrive
 * 3. Stream new chunks to client in real-time
 * 4. Complete when stream is marked as COMPLETED or FAILED
 *
 * ✅ FIX: Uses push-based polling in start() instead of pull()
 * ReadableStream's pull() is only called when consumer needs data, which
 * doesn't work for continuous polling. The start() method now runs the
 * polling loop directly.
 *
 * ✅ FIX: Added filterReasoningOnReplay to prevent duplicate thinking tags
 * When resuming a stream, reasoning chunks that were already displayed can be
 * filtered out to prevent duplicate `<thinking>` tags in the UI.
 *
 * @param streamId - Stream identifier (format: {threadId}_r{roundNumber}_p{participantIndex})
 * @param env - Cloudflare environment bindings
 * @param options - Resume stream configuration options
 */
export function createLiveParticipantResumeStream(
  streamId: string,
  env: ApiEnv['Bindings'],
  options: ResumeStreamOptions = {},
): ReadableStream<Uint8Array> {
  const {
    pollIntervalMs = 100,
    maxPollDurationMs = 5 * 60 * 1000,
    noNewDataTimeoutMs = 30 * 1000,
    filterReasoningOnReplay = false,
    startFromChunkIndex = 0,
  } = options;
  const encoder = new TextEncoder();
  let isClosed = false;

  // Helper to safely close controller (handles already-closed state)
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
      // Controller already closed - ignore
    }
  };

  // Helper to safely enqueue data (handles already-closed state)
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
      // Controller already closed - mark as closed and return false
      isClosed = true;
      return false;
    }
  };

  return new ReadableStream({
    async start(controller) {
      // ✅ FIX: Start from specified index to skip already-received chunks
      let lastChunkIndex = startFromChunkIndex;
      const startTime = Date.now();
      let lastNewDataTime = Date.now();

      // Helper to filter reasoning chunks if needed
      const shouldSendChunk = (chunk: { data: string; event?: string }): boolean => {
        if (!filterReasoningOnReplay)
          return true;
        // Skip reasoning-delta chunks to prevent duplicate thinking tags
        return chunk.event !== 'reasoning-delta';
      };

      try {
        // Send initial buffered chunks (starting from startFromChunkIndex)
        const initialChunks = await getStreamChunks(streamId, env);
        if (initialChunks && initialChunks.length > startFromChunkIndex) {
          for (let i = startFromChunkIndex; i < initialChunks.length; i++) {
            const chunk = initialChunks[i];
            if (chunk && shouldSendChunk(chunk)) {
              // Chunks are already in SSE format from AI SDK
              if (!safeEnqueue(controller, encoder.encode(chunk.data))) {
                return; // Client disconnected
              }
            }
          }
          lastChunkIndex = initialChunks.length;
          // ✅ FIX: Update lastNewDataTime after sending initial chunks
          lastNewDataTime = Date.now();
        }

        // Check if already complete
        const initialMetadata = await getStreamMetadata(streamId, env);
        if (
          initialMetadata?.status === StreamStatuses.COMPLETED
          || initialMetadata?.status === StreamStatuses.FAILED
        ) {
          safeClose(controller);
          return;
        }

        // ✅ PUSH-BASED POLLING: Run polling loop directly in start()
        // This ensures continuous polling regardless of consumer pull behavior
        // eslint-disable-next-line no-unmodified-loop-condition -- isClosed is modified by safeClose/safeEnqueue closures
        while (!isClosed) {
          // Check max duration timeout
          if (Date.now() - startTime > maxPollDurationMs) {
            safeClose(controller);
            return;
          }

          // Poll for new chunks
          const chunks = await getStreamChunks(streamId, env);
          const metadata = await getStreamMetadata(streamId, env);

          // Send any new chunks
          if (chunks && chunks.length > lastChunkIndex) {
            for (let i = lastChunkIndex; i < chunks.length; i++) {
              const chunk = chunks[i];
              // ✅ FIX: Apply reasoning filter to new chunks during polling
              if (chunk && shouldSendChunk(chunk)) {
                if (!safeEnqueue(controller, encoder.encode(chunk.data))) {
                  return; // Client disconnected
                }
              }
            }
            lastChunkIndex = chunks.length;
            // Reset the "no new data" timer when we receive new chunks
            lastNewDataTime = Date.now();
          }

          // Check if stream is complete
          if (
            metadata?.status === StreamStatuses.COMPLETED
            || metadata?.status === StreamStatuses.FAILED
          ) {
            safeClose(controller);
            return;
          }

          // Check if original stream appears to be dead (no new data for a while)
          const timeSinceLastNewData = Date.now() - lastNewDataTime;
          if (timeSinceLastNewData > noNewDataTimeoutMs) {
            // ✅ AI SDK v6 FORMAT: Send synthetic finish event
            // Format matches the SSE format used by other chunks (data: + JSON)
            // The 'unknown' finishReason signals the stream was interrupted
            // This allows AI SDK to call onFinish so frontend can handle recovery
            const syntheticFinish = `data: {"type":"finish","finishReason":"${FinishReasons.UNKNOWN}","usage":{"promptTokens":0,"completionTokens":0}}\n\n`;
            safeEnqueue(controller, encoder.encode(syntheticFinish));

            // Close the stream after sending finish event
            safeClose(controller);
            return;
          }

          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
      } catch {
        safeClose(controller);
      }
    },

    cancel() {
      // Client disconnected - mark as closed to prevent further operations
      isClosed = true;
    },
  });
}

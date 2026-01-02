/**
 * Pre-Search Stream Buffer Service
 *
 * KV-based buffering for pre-search SSE streams to enable resumption.
 * Follows the same pattern as analysis-stream-buffer.service.ts
 *
 * Pre-search streams use SSE format (event: data\n\n) unlike analysis
 * which uses plain text JSON streaming.
 */

import { z } from 'zod';

import { StreamStatuses } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';
import type { TypedLogger } from '@/api/types/logger';
import type { PreSearchStreamChunk, PreSearchStreamMetadata } from '@/api/types/streaming';
import {
  PreSearchStreamChunkSchema,
  PreSearchStreamMetadataSchema,
  STREAM_BUFFER_TTL_SECONDS,
} from '@/api/types/streaming';

// KV key patterns for pre-search streams
const PRESEARCH_STREAM_PREFIX = 'presearch_stream';
const PRESEARCH_ACTIVE_PREFIX = 'presearch_active';

// ============================================================================
// Key Generation
// ============================================================================

function getMetadataKey(streamId: string): string {
  return `${PRESEARCH_STREAM_PREFIX}:${streamId}:metadata`;
}

/**
 * Generate KV key for individual chunk storage
 * ✅ FIX: Store chunks individually to avoid O(n) memory accumulation
 */
function getChunkKey(streamId: string, index: number): string {
  return `${PRESEARCH_STREAM_PREFIX}:${streamId}:c:${index}`;
}

function getActiveKey(threadId: string, roundNumber: number): string {
  return `${PRESEARCH_ACTIVE_PREFIX}:${threadId}:${roundNumber}`;
}

// ============================================================================
// Buffer Operations
// ============================================================================

/**
 * Initialize pre-search stream buffer
 * Called when stream starts to set up KV structure
 */
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
      streamId,
      threadId,
      roundNumber,
      preSearchId,
      status: StreamStatuses.ACTIVE,
      chunkCount: 0,
      createdAt: Date.now(),
    };

    // ✅ FIX: Store metadata only - chunks stored individually via appendPreSearchStreamChunk
    // No longer initialize empty chunks array to avoid O(n) memory pattern
    await Promise.all([
      env.KV.put(getMetadataKey(streamId), JSON.stringify(metadata), {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      }),
      env.KV.put(getActiveKey(threadId, roundNumber), streamId, {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      }),
    ]);

    logger?.debug('Initialized pre-search stream buffer', {
      logType: 'operation',
      operationName: 'initializePreSearchStreamBuffer',
      streamId,
      threadId,
      roundNumber,
    });
  } catch (error) {
    logger?.warn('Failed to initialize pre-search stream buffer', {
      logType: 'edge_case',
      scenario: 'pre_search_buffer_init_failed',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Append SSE chunk to pre-search stream buffer
 * Called for each SSE event sent to client
 *
 * ✅ FIX: O(1) memory - stores each chunk as individual KV key instead of
 * accumulating in array. Previous O(n) pattern caused memory issues for long streams.
 */
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
    // ✅ FIX: Get current chunk count from metadata (O(1) read)
    const metadataKey = getMetadataKey(streamId);
    const rawMetadata = await env.KV.get(metadataKey, 'json');
    const metadataResult = PreSearchStreamMetadataSchema.safeParse(rawMetadata);

    if (!metadataResult.success) {
      logger?.warn('Stream metadata not found during chunk append', {
        logType: 'edge_case',
        scenario: 'pre_search_metadata_not_found',
        streamId,
      });
      return;
    }

    const metadata = metadataResult.data;
    const chunkIndex = metadata.chunkCount;

    const newChunk: PreSearchStreamChunk = {
      index: chunkIndex,
      event,
      data,
      timestamp: Date.now(),
    };

    // ✅ FIX: Store chunk at individual key (O(1) write, no array accumulation)
    await env.KV.put(
      getChunkKey(streamId, chunkIndex),
      JSON.stringify(newChunk),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    // ✅ FIX: Increment chunk count in metadata (O(1) update)
    const updatedMetadata = { ...metadata, chunkCount: chunkIndex + 1 };
    await env.KV.put(metadataKey, JSON.stringify(updatedMetadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });
  } catch (error) {
    logger?.warn('Failed to append pre-search stream chunk', {
      logType: 'edge_case',
      scenario: 'pre_search_chunk_append_failed',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Complete pre-search stream buffer
 */
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
      status: StreamStatuses.COMPLETED,
      completedAt: Date.now(),
    };

    await env.KV.put(metadataKey, JSON.stringify(metadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    logger?.debug('Completed pre-search stream buffer', {
      logType: 'operation',
      operationName: 'completePreSearchStreamBuffer',
      streamId,
    });
  } catch (error) {
    logger?.warn('Failed to complete pre-search stream buffer', {
      logType: 'edge_case',
      scenario: 'pre_search_buffer_complete_failed',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Fail pre-search stream buffer
 */
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
      status: StreamStatuses.FAILED,
      completedAt: Date.now(),
      errorMessage,
    };

    await env.KV.put(metadataKey, JSON.stringify(metadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    logger?.debug('Failed pre-search stream buffer', {
      logType: 'operation',
      operationName: 'failPreSearchStreamBuffer',
      streamId,
      errorMessage,
    });
  } catch (error) {
    logger?.warn('Failed to fail pre-search stream buffer', {
      logType: 'edge_case',
      scenario: 'pre_search_buffer_fail_failed',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Clear active pre-search stream
 */
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
    await env.KV.delete(getActiveKey(threadId, roundNumber));
    logger?.debug('Cleared active pre-search stream', {
      logType: 'operation',
      operationName: 'clearActivePreSearchStream',
      threadId,
      roundNumber,
    });
  } catch (error) {
    logger?.warn('Failed to clear active pre-search stream', {
      logType: 'edge_case',
      scenario: 'pre_search_clear_failed',
      threadId,
      roundNumber,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================================================
// Buffer Retrieval
// ============================================================================

/**
 * Get active pre-search stream ID for thread/round
 */
export async function getActivePreSearchStreamId(
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
): Promise<string | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    return await env.KV.get(getActiveKey(threadId, roundNumber));
  } catch {
    return null;
  }
}

/**
 * Get pre-search stream metadata
 */
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

/**
 * Get pre-search stream chunks
 *
 * ✅ FIX: Reads individual chunk keys instead of single array
 * Uses parallel batch reads for efficiency
 */
export async function getPreSearchStreamChunks(
  streamId: string,
  env: ApiEnv['Bindings'],
): Promise<PreSearchStreamChunk[] | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    // Get chunk count from metadata
    const metadata = await getPreSearchStreamMetadata(streamId, env);

    if (!metadata) {
      return null;
    }

    if (metadata.chunkCount === 0) {
      return [];
    }

    // ✅ FIX: Read chunks in parallel batches for efficiency
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

/**
 * Check if pre-search stream buffer is stale (no recent activity)
 *
 * A stream is considered stale if:
 * - No chunks exist, OR
 * - Last chunk timestamp > maxStaleMs ago
 *
 * @param streamId - Stream identifier
 * @param env - Cloudflare environment bindings
 * @param maxStaleMs - Maximum time since last chunk (default 5 seconds - fast detection)
 * @returns true if stale (should restart), false if active
 */
export async function isPreSearchBufferStale(
  streamId: string,
  env: ApiEnv['Bindings'],
  maxStaleMs = 5_000,
): Promise<boolean> {
  if (!env?.KV) {
    return true; // No KV = treat as stale
  }

  try {
    const chunks = await getPreSearchStreamChunks(streamId, env);

    if (!chunks || chunks.length === 0) {
      return true; // No chunks = stale
    }

    // Get last chunk timestamp
    const lastChunk = chunks[chunks.length - 1];
    if (!lastChunk?.timestamp) {
      return true;
    }

    const timeSinceLastChunk = Date.now() - lastChunk.timestamp;
    return timeSinceLastChunk > maxStaleMs;
  } catch {
    return true; // Error = treat as stale
  }
}

// ============================================================================
// Live Stream Resumption
// ============================================================================

/**
 * Create a LIVE SSE streaming response that polls KV for new chunks
 *
 * This enables true stream resumption for pre-search:
 * 1. Return all buffered SSE events immediately
 * 2. Keep polling KV for new events as they arrive
 * 3. Stream new events to client in real-time
 * 4. Complete when stream is marked as COMPLETED or FAILED
 */
/**
 * Create a LIVE SSE streaming response that polls KV for new chunks
 *
 * ✅ FIX: Uses push-based polling in start() instead of pull()
 * ReadableStream's pull() is only called when consumer needs data, which
 * doesn't work for continuous polling. The start() method now runs the
 * polling loop directly.
 *
 * @param streamId - Pre-search stream identifier
 * @param env - Cloudflare environment bindings
 * @param pollIntervalMs - How often to check for new chunks (default 100ms)
 * @param maxPollDurationMs - Maximum time to poll before giving up (default 5 minutes)
 * @param noNewDataTimeoutMs - Time to wait without new data before marking stream as stale (default 5 seconds - fast detection for better UX)
 */
export function createLivePreSearchResumeStream(
  streamId: string,
  env: ApiEnv['Bindings'],
  pollIntervalMs = 100,
  maxPollDurationMs = 5 * 60 * 1000,
  noNewDataTimeoutMs = 5 * 1000,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let isClosed = false;

  // Helper to safely close controller (handles already-closed state)
  const safeClose = (controller: ReadableStreamDefaultController<Uint8Array>) => {
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
  const safeEnqueue = (controller: ReadableStreamDefaultController<Uint8Array>, data: Uint8Array) => {
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
      let lastChunkIndex = 0;
      const startTime = Date.now();
      let lastNewDataTime = Date.now();

      try {
        // Send initial buffered chunks
        const initialChunks = await getPreSearchStreamChunks(streamId, env);
        if (initialChunks && initialChunks.length > 0) {
          for (const chunk of initialChunks) {
            // Format as SSE: event: {event}\ndata: {data}\n\n
            const sseData = `event: ${chunk.event}\ndata: ${chunk.data}\n\n`;
            if (!safeEnqueue(controller, encoder.encode(sseData))) {
              return; // Client disconnected
            }
          }
          lastChunkIndex = initialChunks.length;
          // ✅ FIX: Update lastNewDataTime after sending initial chunks
          lastNewDataTime = Date.now();
        }

        // Check if already complete
        const initialMetadata = await getPreSearchStreamMetadata(streamId, env);
        if (initialMetadata?.status === StreamStatuses.COMPLETED || initialMetadata?.status === StreamStatuses.FAILED) {
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
          const chunks = await getPreSearchStreamChunks(streamId, env);
          const metadata = await getPreSearchStreamMetadata(streamId, env);

          // Send any new chunks
          if (chunks && chunks.length > lastChunkIndex) {
            for (let i = lastChunkIndex; i < chunks.length; i++) {
              const chunk = chunks[i];
              if (chunk) {
                const sseData = `event: ${chunk.event}\ndata: ${chunk.data}\n\n`;
                if (!safeEnqueue(controller, encoder.encode(sseData))) {
                  return; // Client disconnected
                }
              }
            }
            lastChunkIndex = chunks.length;
            // Reset the "no new data" timer when we receive new chunks
            lastNewDataTime = Date.now();
          }

          // Check if stream is complete
          if (metadata?.status === StreamStatuses.COMPLETED || metadata?.status === StreamStatuses.FAILED) {
            safeClose(controller);
            return;
          }

          // Check if original stream appears to be dead (no new data for a while)
          const timeSinceLastNewData = Date.now() - lastNewDataTime;
          if (timeSinceLastNewData > noNewDataTimeoutMs) {
            // ✅ PRE-SEARCH SSE FORMAT: Send synthetic done event
            // This signals to the frontend that the stream ended (interrupted)
            const syntheticDone = `event: done\ndata: {"interrupted":true,"reason":"stream_timeout"}\n\n`;
            safeEnqueue(controller, encoder.encode(syntheticDone));

            // Close the stream after sending done event
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

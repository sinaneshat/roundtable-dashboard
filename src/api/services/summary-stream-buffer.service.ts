/**
 * Summary Stream Buffer Service - KV-based object stream buffering
 *
 * **BACKEND SERVICE**: Enables stream resumption for `streamObject` after page reload
 * Following backend-patterns.md: Service layer for streaming infrastructure
 *
 * **PURPOSE**:
 * - Buffer object stream chunks into Cloudflare KV
 * - Enable resumption after page reload/connection loss for summary streams
 * - Works with AI SDK v5 `streamObject` (which lacks `consumeSseStream` callback)
 *
 * **ARCHITECTURE**:
 * - Stream ID format: `summary:{threadId}:r{roundNumber}`
 * - Chunks stored as array in KV with 1-hour TTL
 * - Uses TransformStream to intercept chunks before sending to client
 *
 * **KEY DIFFERENCE FROM CHAT STREAMS**:
 * - Chat streams use `consumeSseStream` callback in `toUIMessageStreamResponse`
 * - Object streams use `toTextStreamResponse` which lacks this callback
 * - Solution: Wrap response with TransformStream to intercept chunks
 *
 * @module api/services/summary-stream-buffer
 */

import { z } from 'zod';

import { StreamStatuses } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';
import type { TypedLogger } from '@/api/types/logger';
import type { SummaryStreamBufferMetadata, SummaryStreamChunk } from '@/api/types/streaming';
import {
  STREAM_BUFFER_TTL_SECONDS,
  SummaryStreamBufferMetadataSchema,
  SummaryStreamChunkSchema,
} from '@/api/types/streaming';

/**
 * Generate unified stream ID for summary
 * Format: {threadId}_r{roundNumber}_summarizer
 *
 * ✅ UNIFIED STREAM ID: Follows pattern from @/api/types/streaming.ts
 * This enables the unified resume handler to detect and route summarizer streams.
 */
export function generateSummaryStreamId(threadId: string, roundNumber: number): string {
  return `${threadId}_r${roundNumber}_summarizer`;
}

/**
 * Generate KV key for summary stream buffer metadata
 */
function getSummaryMetadataKey(streamId: string): string {
  return `stream:summary:${streamId}:meta`;
}

/**
 * Generate KV key for summary stream chunks
 */
function getSummaryChunksKey(streamId: string): string {
  return `stream:summary:${streamId}:chunks`;
}

/**
 * Generate KV key for active summary stream tracking
 */
function getActiveSummaryKey(threadId: string, roundNumber: number): string {
  return `stream:summary:active:${threadId}:r${roundNumber}`;
}

/**
 * Initialize summary stream buffer in KV
 * Called before streaming starts
 */
export async function initializeSummaryStreamBuffer(
  streamId: string,
  threadId: string,
  roundNumber: number,
  summaryId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    logger?.warn('KV not available - skipping summary stream buffer initialization', {
      logType: 'edge_case',
      streamId,
    });
    return;
  }

  try {
    const metadata: SummaryStreamBufferMetadata = {
      streamId,
      threadId,
      roundNumber,
      summaryId,
      status: StreamStatuses.ACTIVE,
      chunkCount: 0,
      createdAt: Date.now(),
      completedAt: null,
      errorMessage: null,
    };

    // Store metadata
    await env.KV.put(
      getSummaryMetadataKey(streamId),
      JSON.stringify(metadata),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    // Initialize empty chunks array
    await env.KV.put(
      getSummaryChunksKey(streamId),
      JSON.stringify([]),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    // Track as active summary stream
    await env.KV.put(
      getActiveSummaryKey(threadId, roundNumber),
      streamId,
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    logger?.info('Initialized summary stream buffer', {
      logType: 'operation',
      streamId,
      threadId,
      roundNumber,
      summaryId,
    });
  } catch (error) {
    logger?.error('Failed to initialize summary stream buffer', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Append chunk to summary stream buffer
 * Called as data arrives from object stream
 */
export async function appendSummaryStreamChunk(
  streamId: string,
  data: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const chunk: SummaryStreamChunk = {
      data,
      timestamp: Date.now(),
    };

    const chunksKey = getSummaryChunksKey(streamId);
    const rawChunks = await env.KV.get(chunksKey, 'json');
    const chunksResult = z.array(SummaryStreamChunkSchema).safeParse(rawChunks);

    if (!chunksResult.success) {
      logger?.warn('Summary stream chunks not found during append', {
        logType: 'edge_case',
        streamId,
      });
      return;
    }

    const updatedChunks = [...chunksResult.data, chunk];

    await env.KV.put(
      chunksKey,
      JSON.stringify(updatedChunks),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    // Update metadata chunk count
    const metadataKey = getSummaryMetadataKey(streamId);
    const rawMetadata = await env.KV.get(metadataKey, 'json');
    const metadataResult = SummaryStreamBufferMetadataSchema.safeParse(rawMetadata);

    if (metadataResult.success) {
      const metadata = { ...metadataResult.data, chunkCount: updatedChunks.length };
      await env.KV.put(
        metadataKey,
        JSON.stringify(metadata),
        { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
      );
    }
  } catch (error) {
    // Don't throw - chunk append failures shouldn't break streaming
    logger?.warn('Failed to append summary stream chunk', {
      logType: 'edge_case',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Complete summary stream buffer
 * Called when stream finishes successfully
 */
export async function completeSummaryStreamBuffer(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getSummaryMetadataKey(streamId);
    const raw = await env.KV.get(metadataKey, 'json');
    const result = SummaryStreamBufferMetadataSchema.safeParse(raw);

    if (!result.success) {
      logger?.warn('Summary stream metadata not found during completion', {
        logType: 'edge_case',
        streamId,
      });
      return;
    }

    const metadata = {
      ...result.data,
      status: StreamStatuses.COMPLETED,
      completedAt: Date.now(),
    };

    await env.KV.put(
      metadataKey,
      JSON.stringify(metadata),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    logger?.info('Completed summary stream buffer', {
      logType: 'operation',
      streamId,
      chunkCount: metadata.chunkCount,
    });
  } catch (error) {
    logger?.error('Failed to complete summary stream buffer', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Fail summary stream buffer
 * Called when stream encounters an error
 */
export async function failSummaryStreamBuffer(
  streamId: string,
  errorMessage: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getSummaryMetadataKey(streamId);
    const raw = await env.KV.get(metadataKey, 'json');
    const result = SummaryStreamBufferMetadataSchema.safeParse(raw);

    if (!result.success) {
      logger?.warn('Summary stream metadata not found during failure', {
        logType: 'edge_case',
        streamId,
      });
      return;
    }

    const metadata = {
      ...result.data,
      status: StreamStatuses.FAILED,
      completedAt: Date.now(),
      errorMessage,
    };

    await env.KV.put(
      metadataKey,
      JSON.stringify(metadata),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    logger?.info('Marked summary stream buffer as failed', {
      logType: 'operation',
      streamId,
      errorMessage,
    });
  } catch (error) {
    logger?.error('Failed to mark summary stream as failed', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get active summary stream ID for thread/round
 * Returns null if no active stream exists
 */
export async function getActiveSummaryStreamId(
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<string | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const streamId = await env.KV.get(
      getActiveSummaryKey(threadId, roundNumber),
      'text',
    );

    if (streamId) {
      logger?.info('Found active summary stream', {
        logType: 'operation',
        threadId,
        roundNumber,
        streamId,
      });
    }

    return streamId;
  } catch (error) {
    logger?.error('Failed to get active summary stream ID', {
      logType: 'error',
      threadId,
      roundNumber,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Get summary stream buffer metadata
 */
export async function getSummaryStreamMetadata(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<SummaryStreamBufferMetadata | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const raw = await env.KV.get(getSummaryMetadataKey(streamId), 'json');
    const result = SummaryStreamBufferMetadataSchema.safeParse(raw);

    if (!result.success) {
      return null;
    }

    const metadata = result.data;
    logger?.info('Retrieved summary stream metadata', {
      logType: 'operation',
      streamId,
      status: metadata.status,
      chunkCount: metadata.chunkCount,
    });

    return metadata;
  } catch (error) {
    logger?.error('Failed to get summary stream metadata', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Get all buffered chunks for a summary stream
 * Returns chunks in order they were received
 */
export async function getSummaryStreamChunks(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<SummaryStreamChunk[] | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const raw = await env.KV.get(getSummaryChunksKey(streamId), 'json');
    const result = z.array(SummaryStreamChunkSchema).safeParse(raw);

    if (!result.success) {
      return null;
    }

    const chunks = result.data;
    logger?.info('Retrieved summary stream chunks', {
      logType: 'operation',
      streamId,
      chunkCount: chunks.length,
    });

    return chunks;
  } catch (error) {
    logger?.error('Failed to get summary stream chunks', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Clear active summary stream tracking
 * Called when stream completes or fails
 */
export async function clearActiveSummaryStream(
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    await env.KV.delete(getActiveSummaryKey(threadId, roundNumber));

    logger?.info('Cleared active summary stream tracking', {
      logType: 'operation',
      threadId,
      roundNumber,
    });
  } catch (error) {
    logger?.warn('Failed to clear active summary stream', {
      logType: 'edge_case',
      threadId,
      roundNumber,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Delete entire summary stream buffer
 * Called to clean up after stream completes
 */
export async function deleteSummaryStreamBuffer(
  streamId: string,
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    await Promise.all([
      env.KV.delete(getSummaryMetadataKey(streamId)),
      env.KV.delete(getSummaryChunksKey(streamId)),
      env.KV.delete(getActiveSummaryKey(threadId, roundNumber)),
    ]);

    logger?.info('Deleted summary stream buffer', {
      logType: 'operation',
      streamId,
    });
  } catch (error) {
    logger?.warn('Failed to delete summary stream buffer', {
      logType: 'edge_case',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Convert buffered chunks to text stream for transmission
 * Returns ReadableStream of text data
 *
 * Object streams send plain text (JSON being built incrementally)
 * Unlike chat streams which use SSE format with prefixes
 */
export function summaryChunksToTextStream(chunks: SummaryStreamChunk[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk.data));
      }
      controller.close();
    },
  });
}

/**
 * Create a LIVE streaming response that polls KV for new chunks
 *
 * This is the key to proper stream resumption:
 * 1. Return all buffered chunks immediately
 * 2. Keep polling KV for new chunks as they arrive
 * 3. Stream new chunks to client in real-time
 * 4. Complete when stream is marked as COMPLETED or FAILED
 *
 * @param streamId - Stream identifier
 * @param env - Cloudflare environment bindings
 * @param pollIntervalMs - How often to check for new chunks (default 100ms)
 * @param maxPollDurationMs - Maximum time to poll before giving up (default 5 minutes)
 */
/**
 * Create a LIVE streaming response that polls KV for new chunks
 *
 * ✅ FIX: Added "no new data" timeout to detect dead streams
 * If no new chunks arrive within noNewDataTimeoutMs, assume original stream
 * is dead and send a synthetic complete event so frontend can handle recovery.
 *
 * @param streamId - Summary stream identifier
 * @param env - Cloudflare environment bindings
 * @param pollIntervalMs - How often to check for new chunks (default 100ms)
 * @param maxPollDurationMs - Maximum time to poll before giving up (default 5 minutes)
 */
export function createLiveSummaryResumeStream(
  streamId: string,
  env: ApiEnv['Bindings'],
  pollIntervalMs = 100,
  maxPollDurationMs = 5 * 60 * 1000,
  noNewDataTimeoutMs = 10 * 1000, // ✅ NEW: Timeout if no new chunks arrive
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let lastChunkIndex = 0;
  const startTime = Date.now();
  let lastNewDataTime = Date.now(); // ✅ Track when we last received new data
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
      try {
        // Send initial buffered chunks
        const initialChunks = await getSummaryStreamChunks(streamId, env);
        if (initialChunks && initialChunks.length > 0) {
          for (const chunk of initialChunks) {
            if (!safeEnqueue(controller, encoder.encode(chunk.data))) {
              return; // Client disconnected
            }
          }
          lastChunkIndex = initialChunks.length;
          lastNewDataTime = Date.now(); // ✅ Reset timer when we get initial data
        }

        // Check if already complete
        const metadata = await getSummaryStreamMetadata(streamId, env);
        if (metadata?.status === StreamStatuses.COMPLETED || metadata?.status === StreamStatuses.FAILED) {
          safeClose(controller);
        }
      } catch {
        safeClose(controller);
      }
    },

    async pull(controller) {
      if (isClosed) {
        return;
      }

      try {
        // Check max duration timeout
        if (Date.now() - startTime > maxPollDurationMs) {
          safeClose(controller);
          return;
        }

        // ✅ NEW: Check no-new-data timeout
        // If no new chunks arrive within noNewDataTimeoutMs, assume original stream is dead
        // This prevents infinite polling when page was refreshed mid-stream
        if (Date.now() - lastNewDataTime > noNewDataTimeoutMs) {
          // Stream appears dead - close with whatever data we have
          // Frontend will detect incomplete data and can trigger a new stream
          safeClose(controller);
          return;
        }

        // Poll for new chunks
        const chunks = await getSummaryStreamChunks(streamId, env);
        const metadata = await getSummaryStreamMetadata(streamId, env);

        // Send any new chunks
        if (chunks && chunks.length > lastChunkIndex) {
          for (let i = lastChunkIndex; i < chunks.length; i++) {
            const chunk = chunks[i];
            if (chunk) {
              if (!safeEnqueue(controller, encoder.encode(chunk.data))) {
                return; // Client disconnected
              }
            }
          }
          lastChunkIndex = chunks.length;
          lastNewDataTime = Date.now(); // ✅ Reset timer when we receive new data
        }

        // Check if stream is complete
        if (metadata?.status === StreamStatuses.COMPLETED || metadata?.status === StreamStatuses.FAILED) {
          safeClose(controller);
          return;
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
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

/**
 * Create a buffered response wrapper for object streams
 *
 * This wraps the original Response with a TransformStream that:
 * 1. Passes chunks through to the client unchanged
 * 2. Buffers each chunk to KV for resumption
 *
 * @param originalResponse - The Response from streamObject.toTextStreamResponse()
 * @param streamId - Unique stream identifier
 * @param env - Cloudflare environment bindings
 * @param executionCtx - ExecutionContext for waitUntil
 * @param logger - Optional logger
 */
export function createBufferedSummaryResponse(
  originalResponse: Response,
  streamId: string,
  env: ApiEnv['Bindings'],
  executionCtx?: ExecutionContext,
  logger?: TypedLogger,
): Response {
  const originalBody = originalResponse.body;

  if (!originalBody) {
    return originalResponse;
  }

  // ✅ STREAMING FIX: Use SYNCHRONOUS transform to prevent backpressure
  // Async transform functions create backpressure - TransformStream waits for
  // promise resolution before pulling more chunks, causing buffering behavior.
  // By making transform sync and using fire-and-forget for KV writes, chunks
  // flow immediately to the client.
  const decoder = new TextDecoder();

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // Pass chunk through to client IMMEDIATELY (sync, no await)
      try {
        controller.enqueue(chunk);
      } catch {
        // Client disconnected - ignore enqueue error
        return;
      }

      // Fire-and-forget: Buffer chunk to KV in background (don't block streaming)
      const chunkString = decoder.decode(chunk);
      const bufferChunk = appendSummaryStreamChunk(streamId, chunkString, env, logger)
        .catch(() => {}); // Silently fail - buffering shouldn't break streaming

      if (executionCtx) {
        executionCtx.waitUntil(bufferChunk);
      }
    },

    flush() {
      // Stream completed - mark buffer as complete (fire-and-forget)
      const complete = completeSummaryStreamBuffer(streamId, env, logger)
        .catch(() => {}); // Silently fail

      if (executionCtx) {
        executionCtx.waitUntil(complete);
      }
    },
  });

  // Pipe original body through transform
  const bufferedBody = originalBody.pipeThrough(transformStream);

  // ✅ STREAMING FIX: Configure headers for proper streaming behavior
  // AI SDK's toTextStreamResponse() may include Content-Length which causes browsers
  // to buffer entire response before processing. Remove it for streaming.
  const streamingHeaders = new Headers(originalResponse.headers);

  // ✅ CRITICAL: Remove Content-Length to enable chunked transfer encoding
  // With Content-Length, browsers wait for all bytes before firing events
  streamingHeaders.delete('Content-Length');

  // Disable caching and buffering at all layers
  streamingHeaders.set('Cache-Control', 'no-cache, no-transform');
  streamingHeaders.set('X-Accel-Buffering', 'no'); // Disable nginx/proxy buffering
  streamingHeaders.set('X-Content-Type-Options', 'nosniff'); // Prevent content sniffing

  // Create new response with buffered body and streaming headers
  return new Response(bufferedBody, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers: streamingHeaders,
  });
}

/**
 * Analysis Stream Buffer Service - KV-based object stream buffering
 *
 * **BACKEND SERVICE**: Enables stream resumption for `streamObject` after page reload
 * Following backend-patterns.md: Service layer for streaming infrastructure
 *
 * **PURPOSE**:
 * - Buffer object stream chunks into Cloudflare KV
 * - Enable resumption after page reload/connection loss for analysis streams
 * - Works with AI SDK v5 `streamObject` (which lacks `consumeSseStream` callback)
 *
 * **ARCHITECTURE**:
 * - Stream ID format: `analysis:{threadId}:r{roundNumber}`
 * - Chunks stored as array in KV with 1-hour TTL
 * - Uses TransformStream to intercept chunks before sending to client
 *
 * **KEY DIFFERENCE FROM CHAT STREAMS**:
 * - Chat streams use `consumeSseStream` callback in `toUIMessageStreamResponse`
 * - Object streams use `toTextStreamResponse` which lacks this callback
 * - Solution: Wrap response with TransformStream to intercept chunks
 *
 * @module api/services/analysis-stream-buffer
 */

import type { StreamStatus } from '@/api/core/enums';
import { StreamStatuses } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';
import type { TypedLogger } from '@/api/types/logger';

/**
 * Stream buffer TTL - 1 hour
 * Streams exceeding this are considered stale and auto-expire
 */
const STREAM_BUFFER_TTL_SECONDS = 60 * 60;

/**
 * Stream chunk format for object streams
 */
export type AnalysisStreamChunk = {
  data: string;
  timestamp: number;
};

/**
 * Analysis stream buffer metadata
 */
export type AnalysisStreamBufferMetadata = {
  streamId: string;
  threadId: string;
  roundNumber: number;
  analysisId: string;
  status: StreamStatus;
  chunkCount: number;
  createdAt: number;
  completedAt: number | null;
  errorMessage: string | null;
};

/**
 * Generate stream ID for analysis
 */
export function generateAnalysisStreamId(threadId: string, roundNumber: number): string {
  return `analysis:${threadId}:r${roundNumber}`;
}

/**
 * Generate KV key for analysis stream buffer metadata
 */
function getAnalysisMetadataKey(streamId: string): string {
  return `stream:analysis:${streamId}:meta`;
}

/**
 * Generate KV key for analysis stream chunks
 */
function getAnalysisChunksKey(streamId: string): string {
  return `stream:analysis:${streamId}:chunks`;
}

/**
 * Generate KV key for active analysis stream tracking
 */
function getActiveAnalysisKey(threadId: string, roundNumber: number): string {
  return `stream:analysis:active:${threadId}:r${roundNumber}`;
}

/**
 * Initialize analysis stream buffer in KV
 * Called before streaming starts
 */
export async function initializeAnalysisStreamBuffer(
  streamId: string,
  threadId: string,
  roundNumber: number,
  analysisId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    logger?.warn('KV not available - skipping analysis stream buffer initialization', {
      logType: 'edge_case',
      streamId,
    });
    return;
  }

  try {
    const metadata: AnalysisStreamBufferMetadata = {
      streamId,
      threadId,
      roundNumber,
      analysisId,
      status: StreamStatuses.ACTIVE,
      chunkCount: 0,
      createdAt: Date.now(),
      completedAt: null,
      errorMessage: null,
    };

    // Store metadata
    await env.KV.put(
      getAnalysisMetadataKey(streamId),
      JSON.stringify(metadata),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    // Initialize empty chunks array
    await env.KV.put(
      getAnalysisChunksKey(streamId),
      JSON.stringify([]),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    // Track as active analysis stream
    await env.KV.put(
      getActiveAnalysisKey(threadId, roundNumber),
      streamId,
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    logger?.info('Initialized analysis stream buffer', {
      logType: 'operation',
      streamId,
      threadId,
      roundNumber,
      analysisId,
    });
  } catch (error) {
    logger?.error('Failed to initialize analysis stream buffer', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Append chunk to analysis stream buffer
 * Called as data arrives from object stream
 */
export async function appendAnalysisStreamChunk(
  streamId: string,
  data: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const chunk: AnalysisStreamChunk = {
      data,
      timestamp: Date.now(),
    };

    const chunksKey = getAnalysisChunksKey(streamId);
    const existingChunks = await env.KV.get(chunksKey, 'json') as AnalysisStreamChunk[] | null;

    if (!existingChunks) {
      logger?.warn('Analysis stream chunks not found during append', {
        logType: 'edge_case',
        streamId,
      });
      return;
    }

    const updatedChunks = [...existingChunks, chunk];

    await env.KV.put(
      chunksKey,
      JSON.stringify(updatedChunks),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    // Update metadata chunk count
    const metadataKey = getAnalysisMetadataKey(streamId);
    const metadata = await env.KV.get(metadataKey, 'json') as AnalysisStreamBufferMetadata | null;

    if (metadata) {
      metadata.chunkCount = updatedChunks.length;
      await env.KV.put(
        metadataKey,
        JSON.stringify(metadata),
        { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
      );
    }
  } catch (error) {
    // Don't throw - chunk append failures shouldn't break streaming
    logger?.warn('Failed to append analysis stream chunk', {
      logType: 'edge_case',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Complete analysis stream buffer
 * Called when stream finishes successfully
 */
export async function completeAnalysisStreamBuffer(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getAnalysisMetadataKey(streamId);
    const metadata = await env.KV.get(metadataKey, 'json') as AnalysisStreamBufferMetadata | null;

    if (!metadata) {
      logger?.warn('Analysis stream metadata not found during completion', {
        logType: 'edge_case',
        streamId,
      });
      return;
    }

    metadata.status = StreamStatuses.COMPLETED;
    metadata.completedAt = Date.now();

    await env.KV.put(
      metadataKey,
      JSON.stringify(metadata),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    logger?.info('Completed analysis stream buffer', {
      logType: 'operation',
      streamId,
      chunkCount: metadata.chunkCount,
    });
  } catch (error) {
    logger?.error('Failed to complete analysis stream buffer', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Fail analysis stream buffer
 * Called when stream encounters an error
 */
export async function failAnalysisStreamBuffer(
  streamId: string,
  errorMessage: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getAnalysisMetadataKey(streamId);
    const metadata = await env.KV.get(metadataKey, 'json') as AnalysisStreamBufferMetadata | null;

    if (!metadata) {
      logger?.warn('Analysis stream metadata not found during failure', {
        logType: 'edge_case',
        streamId,
      });
      return;
    }

    metadata.status = StreamStatuses.FAILED;
    metadata.completedAt = Date.now();
    metadata.errorMessage = errorMessage;

    await env.KV.put(
      metadataKey,
      JSON.stringify(metadata),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    logger?.info('Marked analysis stream buffer as failed', {
      logType: 'operation',
      streamId,
      errorMessage,
    });
  } catch (error) {
    logger?.error('Failed to mark analysis stream as failed', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get active analysis stream ID for thread/round
 * Returns null if no active stream exists
 */
export async function getActiveAnalysisStreamId(
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
      getActiveAnalysisKey(threadId, roundNumber),
      'text',
    );

    if (streamId) {
      logger?.info('Found active analysis stream', {
        logType: 'operation',
        threadId,
        roundNumber,
        streamId,
      });
    }

    return streamId;
  } catch (error) {
    logger?.error('Failed to get active analysis stream ID', {
      logType: 'error',
      threadId,
      roundNumber,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Get analysis stream buffer metadata
 */
export async function getAnalysisStreamMetadata(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<AnalysisStreamBufferMetadata | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const metadata = await env.KV.get(getAnalysisMetadataKey(streamId), 'json') as AnalysisStreamBufferMetadata | null;

    if (metadata) {
      logger?.info('Retrieved analysis stream metadata', {
        logType: 'operation',
        streamId,
        status: metadata.status,
        chunkCount: metadata.chunkCount,
      });
    }

    return metadata;
  } catch (error) {
    logger?.error('Failed to get analysis stream metadata', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Get all buffered chunks for an analysis stream
 * Returns chunks in order they were received
 */
export async function getAnalysisStreamChunks(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<AnalysisStreamChunk[] | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const chunks = await env.KV.get(getAnalysisChunksKey(streamId), 'json') as AnalysisStreamChunk[] | null;

    if (chunks) {
      logger?.info('Retrieved analysis stream chunks', {
        logType: 'operation',
        streamId,
        chunkCount: chunks.length,
      });
    }

    return chunks;
  } catch (error) {
    logger?.error('Failed to get analysis stream chunks', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Clear active analysis stream tracking
 * Called when stream completes or fails
 */
export async function clearActiveAnalysisStream(
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    await env.KV.delete(getActiveAnalysisKey(threadId, roundNumber));

    logger?.info('Cleared active analysis stream tracking', {
      logType: 'operation',
      threadId,
      roundNumber,
    });
  } catch (error) {
    logger?.warn('Failed to clear active analysis stream', {
      logType: 'edge_case',
      threadId,
      roundNumber,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Delete entire analysis stream buffer
 * Called to clean up after stream completes
 */
export async function deleteAnalysisStreamBuffer(
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
      env.KV.delete(getAnalysisMetadataKey(streamId)),
      env.KV.delete(getAnalysisChunksKey(streamId)),
      env.KV.delete(getActiveAnalysisKey(threadId, roundNumber)),
    ]);

    logger?.info('Deleted analysis stream buffer', {
      logType: 'operation',
      streamId,
    });
  } catch (error) {
    logger?.warn('Failed to delete analysis stream buffer', {
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
export function analysisChunksToTextStream(chunks: AnalysisStreamChunk[]): ReadableStream<Uint8Array> {
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
export function createLiveAnalysisResumeStream(
  streamId: string,
  env: ApiEnv['Bindings'],
  pollIntervalMs = 100,
  maxPollDurationMs = 5 * 60 * 1000,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let lastChunkIndex = 0;
  const startTime = Date.now();
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
        const initialChunks = await getAnalysisStreamChunks(streamId, env);
        if (initialChunks && initialChunks.length > 0) {
          for (const chunk of initialChunks) {
            if (!safeEnqueue(controller, encoder.encode(chunk.data))) {
              return; // Client disconnected
            }
          }
          lastChunkIndex = initialChunks.length;
        }

        // Check if already complete
        const metadata = await getAnalysisStreamMetadata(streamId, env);
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
        // Check timeout
        if (Date.now() - startTime > maxPollDurationMs) {
          safeClose(controller);
          return;
        }

        // Poll for new chunks
        const chunks = await getAnalysisStreamChunks(streamId, env);
        const metadata = await getAnalysisStreamMetadata(streamId, env);

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
export function createBufferedAnalysisResponse(
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

  // Create a transform stream that buffers chunks
  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      // Pass chunk through to client (wrapped in try-catch for client disconnect)
      try {
        controller.enqueue(chunk);
      } catch {
        // Client disconnected - ignore enqueue error
        return;
      }

      // Buffer chunk to KV asynchronously (don't block)
      const decoder = new TextDecoder();
      const chunkString = decoder.decode(chunk);

      const bufferChunk = async () => {
        try {
          await appendAnalysisStreamChunk(streamId, chunkString, env, logger);
        } catch {
          // Silently fail - buffering shouldn't break streaming
        }
      };

      if (executionCtx) {
        executionCtx.waitUntil(bufferChunk());
      } else {
        bufferChunk().catch(() => {});
      }
    },

    async flush() {
      // Stream completed - mark buffer as complete
      const complete = async () => {
        try {
          await completeAnalysisStreamBuffer(streamId, env, logger);
        } catch {
          // Silently fail
        }
      };

      if (executionCtx) {
        executionCtx.waitUntil(complete());
      } else {
        complete().catch(() => {});
      }
    },
  });

  // Pipe original body through transform
  const bufferedBody = originalBody.pipeThrough(transformStream);

  // Create new response with buffered body and same headers
  return new Response(bufferedBody, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers: originalResponse.headers,
  });
}

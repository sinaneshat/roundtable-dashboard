/**
 * Stream Buffer Service - Cloudflare KV-based SSE stream buffering
 *
 * **BACKEND SERVICE**: Enables stream resumption after page reload
 * Following backend-patterns.md: Service layer for streaming infrastructure
 *
 * **PURPOSE**:
 * - Buffer SSE chunks from AI SDK streams into Cloudflare KV
 * - Enable resumption after page reload/connection loss
 * - Compatible with AI SDK v5 `consumeSseStream` callback
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
 * Stream chunk format for SSE protocol
 * ✅ SINGLE SOURCE OF TRUTH: Reusable type for stream chunks
 */
export type StreamChunk = {
  data: string;
  timestamp: number;
};

/**
 * Stream buffer metadata
 * ✅ ENUM PATTERN: Uses StreamStatus from core enums
 */
export type StreamBufferMetadata = {
  streamId: string;
  threadId: string;
  roundNumber: number;
  participantIndex: number;
  status: StreamStatus;
  chunkCount: number;
  createdAt: number;
  completedAt: number | null;
  errorMessage: string | null;
};

/**
 * Generate KV key for stream buffer metadata
 */
function getMetadataKey(streamId: string): string {
  return `stream:buffer:${streamId}:meta`;
}

/**
 * Generate KV key for stream chunks
 */
function getChunksKey(streamId: string): string {
  return `stream:buffer:${streamId}:chunks`;
}

/**
 * Generate KV key for active stream tracking
 */
function getActiveKey(threadId: string, roundNumber: number, participantIndex: number): string {
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
    logger?.warn('KV not available - skipping stream buffer initialization', {
      logType: 'edge_case',
      streamId,
    });
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

    // Store metadata
    await env.KV.put(
      getMetadataKey(streamId),
      JSON.stringify(metadata),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    // Initialize empty chunks array
    await env.KV.put(
      getChunksKey(streamId),
      JSON.stringify([]),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    // Track as active stream
    await env.KV.put(
      getActiveKey(threadId, roundNumber, participantIndex),
      streamId,
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    logger?.info('Initialized stream buffer', {
      logType: 'operation',
      streamId,
      threadId,
      roundNumber,
      participantIndex,
    });
  } catch (error) {
    logger?.error('Failed to initialize stream buffer', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Append chunk to stream buffer
 * Called as SSE data arrives from AI SDK stream
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
    const chunk: StreamChunk = {
      data,
      timestamp: Date.now(),
    };

    // Get existing chunks
    const chunksKey = getChunksKey(streamId);
    const existingChunks = await env.KV.get(chunksKey, 'json') as StreamChunk[] | null;

    if (!existingChunks) {
      logger?.warn('Stream chunks not found during append', {
        logType: 'edge_case',
        streamId,
      });
      return;
    }

    // Append new chunk
    const updatedChunks = [...existingChunks, chunk];

    // Store updated chunks
    await env.KV.put(
      chunksKey,
      JSON.stringify(updatedChunks),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    // Update metadata chunk count
    const metadataKey = getMetadataKey(streamId);
    const metadata = await env.KV.get(metadataKey, 'json') as StreamBufferMetadata | null;

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
    logger?.warn('Failed to append stream chunk', {
      logType: 'edge_case',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
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
    const metadata = await env.KV.get(metadataKey, 'json') as StreamBufferMetadata | null;

    if (!metadata) {
      logger?.warn('Stream metadata not found during completion', {
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

    logger?.info('Completed stream buffer', {
      logType: 'operation',
      streamId,
      chunkCount: metadata.chunkCount,
    });
  } catch (error) {
    logger?.error('Failed to complete stream buffer', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Fail stream buffer
 * Called when stream encounters an error
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
    const metadata = await env.KV.get(metadataKey, 'json') as StreamBufferMetadata | null;

    if (!metadata) {
      logger?.warn('Stream metadata not found during failure', {
        logType: 'edge_case',
        streamId,
      });
      return;
    }

    metadata.status = StreamStatuses.FAILED;
    metadata.completedAt = Date.now();
    metadata.errorMessage = errorMessage;

    // ✅ FIX: Append error chunk so frontend receives error event on resume
    // AI SDK v5 error format: 3:{"error":"..."}
    try {
      const chunksKey = getChunksKey(streamId);
      const existingChunks = await env.KV.get(chunksKey, 'json') as StreamChunk[] | null;

      if (existingChunks) {
        const errorChunk: StreamChunk = {
          data: `3:${JSON.stringify({ error: errorMessage })}`,
          timestamp: Date.now(),
        };

        const updatedChunks = [...existingChunks, errorChunk];

        await env.KV.put(
          chunksKey,
          JSON.stringify(updatedChunks),
          { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
        );

        metadata.chunkCount = updatedChunks.length;
      }
    } catch (chunkError) {
      logger?.warn('Failed to append error chunk', {
        logType: 'edge_case',
        streamId,
        error: chunkError instanceof Error ? chunkError.message : 'Unknown error',
      });
    }

    await env.KV.put(
      metadataKey,
      JSON.stringify(metadata),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    logger?.info('Marked stream buffer as failed', {
      logType: 'operation',
      streamId,
      errorMessage,
    });
  } catch (error) {
    logger?.error('Failed to mark stream as failed', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
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
  try {
    const streamId = await env.KV.get(
      getActiveKey(threadId, roundNumber, participantIndex),
      'text',
    );

    if (streamId) {
      logger?.info('Found active stream', {
        logType: 'operation',
        threadId,
        roundNumber,
        participantIndex,
        streamId,
      });
    }

    return streamId;
  } catch (error) {
    logger?.error('Failed to get active stream ID', {
      logType: 'error',
      threadId,
      roundNumber,
      participantIndex,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
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
  try {
    const metadata = await env.KV.get(getMetadataKey(streamId), 'json') as StreamBufferMetadata | null;

    if (metadata) {
      logger?.info('Retrieved stream metadata', {
        logType: 'operation',
        streamId,
        status: metadata.status,
        chunkCount: metadata.chunkCount,
      });
    }

    return metadata;
  } catch (error) {
    logger?.error('Failed to get stream metadata', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Get all buffered chunks for a stream
 * Returns chunks in order they were received
 */
export async function getStreamChunks(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<StreamChunk[] | null> {
  try {
    const chunks = await env.KV.get(getChunksKey(streamId), 'json') as StreamChunk[] | null;

    if (chunks) {
      logger?.info('Retrieved stream chunks', {
        logType: 'operation',
        streamId,
        chunkCount: chunks.length,
      });
    }

    return chunks;
  } catch (error) {
    logger?.error('Failed to get stream chunks', {
      logType: 'error',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
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
  try {
    await env.KV.delete(getActiveKey(threadId, roundNumber, participantIndex));

    logger?.info('Cleared active stream tracking', {
      logType: 'operation',
      threadId,
      roundNumber,
      participantIndex,
    });
  } catch (error) {
    logger?.warn('Failed to clear active stream', {
      logType: 'edge_case',
      threadId,
      roundNumber,
      participantIndex,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Delete entire stream buffer
 * Called to clean up after stream completes
 */
export async function deleteStreamBuffer(
  streamId: string,
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  try {
    await Promise.all([
      env.KV.delete(getMetadataKey(streamId)),
      env.KV.delete(getChunksKey(streamId)),
      env.KV.delete(getActiveKey(threadId, roundNumber, participantIndex)),
    ]);

    logger?.info('Deleted stream buffer', {
      logType: 'operation',
      streamId,
    });
  } catch (error) {
    logger?.warn('Failed to delete stream buffer', {
      logType: 'edge_case',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Convert buffered chunks to SSE format for transmission
 * Returns ReadableStream of SSE-formatted data
 *
 * ✅ IMPORTANT: Chunks are stored as raw SSE data strings (e.g., "0:\"text\"\n\n")
 * from the AI SDK stream. We pass them through as-is without wrapping.
 * The chunks already contain the complete SSE protocol format.
 */
export function chunksToSSEStream(chunks: StreamChunk[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      try {
        for (const chunk of chunks) {
          // ✅ FIX: Pass chunk data through as-is
          // Chunks are already in SSE format from AI SDK stream
          // Previously was double-wrapping: `data: ${chunk.data}\n\n`
          // which produced malformed SSE like `data: 0:"text"\n\n\n\n`
          controller.enqueue(encoder.encode(chunk.data));
        }
        controller.close();
      } catch {
        // Controller already closed (client disconnected) - ignore
      }
    },
  });
}

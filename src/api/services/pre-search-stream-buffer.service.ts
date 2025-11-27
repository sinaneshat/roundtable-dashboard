/**
 * Pre-Search Stream Buffer Service
 *
 * KV-based buffering for pre-search SSE streams to enable resumption.
 * Follows the same pattern as analysis-stream-buffer.service.ts
 *
 * Pre-search streams use SSE format (event: data\n\n) unlike analysis
 * which uses plain text JSON streaming.
 */

import { StreamStatuses } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';
import type { TypedLogger } from '@/api/types/logger';

// KV key patterns for pre-search streams
const PRESEARCH_STREAM_PREFIX = 'presearch_stream';
const PRESEARCH_CHUNKS_PREFIX = 'presearch_chunks';
const PRESEARCH_ACTIVE_PREFIX = 'presearch_active';

// TTL for stream buffers (1 hour)
const STREAM_BUFFER_TTL_SECONDS = 60 * 60;

// ============================================================================
// Types
// ============================================================================

export type PreSearchStreamChunk = {
  index: number;
  event: string;
  data: string;
  timestamp: number;
};

export type PreSearchStreamMetadata = {
  streamId: string;
  threadId: string;
  roundNumber: number;
  preSearchId: string;
  status: typeof StreamStatuses.ACTIVE | typeof StreamStatuses.COMPLETED | typeof StreamStatuses.FAILED;
  chunkCount: number;
  createdAt: number;
  completedAt?: number;
  errorMessage?: string;
};

// ============================================================================
// Key Generation
// ============================================================================

function getMetadataKey(streamId: string): string {
  return `${PRESEARCH_STREAM_PREFIX}:${streamId}:metadata`;
}

function getChunksKey(streamId: string): string {
  return `${PRESEARCH_CHUNKS_PREFIX}:${streamId}`;
}

function getActiveKey(threadId: string, roundNumber: number): string {
  return `${PRESEARCH_ACTIVE_PREFIX}:${threadId}:${roundNumber}`;
}

/**
 * Generate unique stream ID for pre-search
 * Format: presearch_{threadId}_{roundNumber}_{timestamp}
 */
export function generatePreSearchStreamId(threadId: string, roundNumber: number): string {
  return `presearch_${threadId}_${roundNumber}_${Date.now()}`;
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

    await Promise.all([
      env.KV.put(getMetadataKey(streamId), JSON.stringify(metadata), {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      }),
      env.KV.put(getChunksKey(streamId), JSON.stringify([]), {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      }),
      env.KV.put(getActiveKey(threadId, roundNumber), streamId, {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      }),
    ]);

    logger?.debug('Initialized pre-search stream buffer', { streamId, threadId, roundNumber });
  } catch (error) {
    logger?.warn('Failed to initialize pre-search stream buffer', {
      logType: 'edge_case',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Append SSE chunk to pre-search stream buffer
 * Called for each SSE event sent to client
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
    const chunksKey = getChunksKey(streamId);
    const metadataKey = getMetadataKey(streamId);

    const [chunksJson, metadataJson] = await Promise.all([
      env.KV.get(chunksKey),
      env.KV.get(metadataKey),
    ]);

    const chunks: PreSearchStreamChunk[] = chunksJson ? JSON.parse(chunksJson) : [];
    const metadata: PreSearchStreamMetadata | null = metadataJson ? JSON.parse(metadataJson) : null;

    const newChunk: PreSearchStreamChunk = {
      index: chunks.length,
      event,
      data,
      timestamp: Date.now(),
    };

    chunks.push(newChunk);

    await env.KV.put(chunksKey, JSON.stringify(chunks), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    if (metadata) {
      metadata.chunkCount = chunks.length;
      await env.KV.put(metadataKey, JSON.stringify(metadata), {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      });
    }
  } catch (error) {
    logger?.warn('Failed to append pre-search stream chunk', {
      logType: 'edge_case',
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
    const metadataJson = await env.KV.get(metadataKey);

    if (!metadataJson) {
      return;
    }

    const metadata: PreSearchStreamMetadata = JSON.parse(metadataJson);
    metadata.status = StreamStatuses.COMPLETED;
    metadata.completedAt = Date.now();

    await env.KV.put(metadataKey, JSON.stringify(metadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    logger?.debug('Completed pre-search stream buffer', { streamId });
  } catch (error) {
    logger?.warn('Failed to complete pre-search stream buffer', {
      logType: 'edge_case',
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
    const metadataJson = await env.KV.get(metadataKey);

    if (!metadataJson) {
      return;
    }

    const metadata: PreSearchStreamMetadata = JSON.parse(metadataJson);
    metadata.status = StreamStatuses.FAILED;
    metadata.completedAt = Date.now();
    metadata.errorMessage = errorMessage;

    await env.KV.put(metadataKey, JSON.stringify(metadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    logger?.debug('Failed pre-search stream buffer', { streamId, errorMessage });
  } catch (error) {
    logger?.warn('Failed to fail pre-search stream buffer', {
      logType: 'edge_case',
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
    logger?.debug('Cleared active pre-search stream', { threadId, roundNumber });
  } catch (error) {
    logger?.warn('Failed to clear active pre-search stream', {
      logType: 'edge_case',
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
    const metadataJson = await env.KV.get(getMetadataKey(streamId));
    return metadataJson ? JSON.parse(metadataJson) : null;
  } catch {
    return null;
  }
}

/**
 * Get pre-search stream chunks
 */
export async function getPreSearchStreamChunks(
  streamId: string,
  env: ApiEnv['Bindings'],
): Promise<PreSearchStreamChunk[] | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const chunksJson = await env.KV.get(getChunksKey(streamId));
    return chunksJson ? JSON.parse(chunksJson) : null;
  } catch {
    return null;
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
export function createLivePreSearchResumeStream(
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
        }

        // Check if already complete
        const metadata = await getPreSearchStreamMetadata(streamId, env);
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

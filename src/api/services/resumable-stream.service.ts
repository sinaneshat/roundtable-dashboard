/**
 * Resumable Stream Service - Cloudflare KV-based stream persistence
 *
 * **BACKEND SERVICE**: KV storage for resumable AI SDK streams
 * Following backend-patterns.md: Service layer for streaming infrastructure
 *
 * **PURPOSE**:
 * - Enable stream resumption after page reload/connection loss
 * - Store SSE chunks in Cloudflare KV as they arrive
 * - Resume streams from last checkpoint
 * - Auto-cleanup completed/expired streams
 *
 * **ARCHITECTURE**:
 * - Stream ID: Same as message ID (`{threadId}_r{roundNumber}_p{participantIndex}`)
 * - Storage: KV with 1-hour TTL (streams shouldn't exceed this)
 * - Format: AI SDK v5 SSE protocol chunks
 *
 * @module api/services/resumable-stream
 */

import type { ApiEnv } from '@/api/types';
import type { TypedLogger } from '@/api/types/logger';

// ============================================================================
// Stream TTL Configuration
// ============================================================================

/**
 * Stream storage TTL - 1 hour
 * Streams that take longer than 1 hour are considered stale
 */
export const STREAM_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Stream status enum
 */
export type StreamStatus = 'active' | 'completed' | 'failed' | 'expired';

/**
 * Stream metadata stored in KV
 */
export type StreamMetadata = {
  streamId: string;
  threadId: string;
  roundNumber: number;
  participantIndex: number;
  status: StreamStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
  chunkCount: number;
};

/**
 * SSE chunk format (AI SDK v5 protocol)
 */
export type SSEChunk = {
  event?: string;
  data: string;
  timestamp: string;
};

// ============================================================================
// KV Key Generation
// ============================================================================

/**
 * Generate KV key for stream metadata
 */
function getStreamMetadataKey(streamId: string): string {
  return `stream:${streamId}:meta`;
}

/**
 * Generate KV key for stream chunks
 */
function getStreamChunksKey(streamId: string): string {
  return `stream:${streamId}:chunks`;
}

/**
 * Generate KV key for active stream tracking
 */
function getActiveStreamKey(threadId: string, roundNumber: number, participantIndex: number): string {
  return `stream:active:${threadId}:r${roundNumber}:p${participantIndex}`;
}

// ============================================================================
// Stream Creation
// ============================================================================

/**
 * Create new resumable stream in KV
 * Initializes metadata and chunk storage
 *
 * @param streamId - Deterministic stream ID (same as message ID)
 * @param threadId - Thread ID
 * @param roundNumber - Round number
 * @param participantIndex - Participant index
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
export async function createResumableStream(
  streamId: string,
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  try {
    const now = new Date().toISOString();

    const metadata: StreamMetadata = {
      streamId,
      threadId,
      roundNumber,
      participantIndex,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      chunkCount: 0,
    };

    // Store metadata
    await env.KV.put(
      getStreamMetadataKey(streamId),
      JSON.stringify(metadata),
      { expirationTtl: STREAM_TTL_SECONDS },
    );

    // Initialize empty chunks array
    await env.KV.put(
      getStreamChunksKey(streamId),
      JSON.stringify([]),
      { expirationTtl: STREAM_TTL_SECONDS },
    );

    // Track as active stream
    await env.KV.put(
      getActiveStreamKey(threadId, roundNumber, participantIndex),
      streamId,
      { expirationTtl: STREAM_TTL_SECONDS },
    );

    if (logger) {
      logger.info('Created resumable stream', {
        logType: 'operation',
        streamId,
        threadId,
        roundNumber,
        participantIndex,
      });
    }
  } catch (error) {
    if (logger) {
      logger.error('Failed to create resumable stream', {
        logType: 'error',
        streamId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    throw error;
  }
}

// ============================================================================
// Stream Chunk Operations
// ============================================================================

/**
 * Append SSE chunk to stream in KV
 * Updates metadata and appends chunk to array
 *
 * @param streamId - Stream ID
 * @param chunk - SSE chunk to append
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
export async function appendStreamChunk(
  streamId: string,
  chunk: SSEChunk,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  try {
    // Get existing chunks
    const chunksKey = getStreamChunksKey(streamId);
    const existingChunks = await env.KV.get(chunksKey, 'json') as SSEChunk[] | null;

    if (!existingChunks) {
      if (logger) {
        logger.warn('Stream chunks not found, skipping append', {
          logType: 'edge_case',
          streamId,
        });
      }
      return;
    }

    // Append new chunk
    const updatedChunks = [...existingChunks, chunk];

    // Store updated chunks
    await env.KV.put(
      chunksKey,
      JSON.stringify(updatedChunks),
      { expirationTtl: STREAM_TTL_SECONDS },
    );

    // Update metadata
    const metadataKey = getStreamMetadataKey(streamId);
    const metadata = await env.KV.get(metadataKey, 'json') as StreamMetadata | null;

    if (metadata) {
      metadata.updatedAt = new Date().toISOString();
      metadata.chunkCount = updatedChunks.length;

      await env.KV.put(
        metadataKey,
        JSON.stringify(metadata),
        { expirationTtl: STREAM_TTL_SECONDS },
      );
    }
  } catch (error) {
    if (logger) {
      logger.warn('Failed to append stream chunk', {
        logType: 'edge_case',
        streamId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    // Don't throw - chunk append failures shouldn't break streaming
  }
}

/**
 * Get all chunks for a stream
 *
 * @param streamId - Stream ID
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 * @returns Array of SSE chunks or null if not found
 */
export async function getStreamChunks(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<SSEChunk[] | null> {
  try {
    const chunks = await env.KV.get(getStreamChunksKey(streamId), 'json') as SSEChunk[] | null;

    if (chunks && logger) {
      logger.info('Retrieved stream chunks', {
        logType: 'operation',
        streamId,
        chunkCount: chunks.length,
      });
    }

    return chunks;
  } catch (error) {
    if (logger) {
      logger.error('Failed to get stream chunks', {
        logType: 'error',
        streamId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    return null;
  }
}

// ============================================================================
// Stream Metadata Operations
// ============================================================================

/**
 * Get stream metadata
 *
 * @param streamId - Stream ID
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 * @returns Stream metadata or null if not found
 */
export async function getStreamMetadata(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<StreamMetadata | null> {
  try {
    const metadata = await env.KV.get(getStreamMetadataKey(streamId), 'json') as StreamMetadata | null;

    if (metadata && logger) {
      logger.info('Retrieved stream metadata', {
        logType: 'operation',
        streamId,
        status: metadata.status,
        chunkCount: metadata.chunkCount,
      });
    }

    return metadata;
  } catch (error) {
    if (logger) {
      logger.error('Failed to get stream metadata', {
        logType: 'error',
        streamId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    return null;
  }
}

/**
 * Update stream status
 *
 * @param streamId - Stream ID
 * @param status - New status
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 * @param errorMessage - Optional error message for failed status
 */
export async function updateStreamStatus(
  streamId: string,
  status: StreamStatus,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
  errorMessage?: string,
): Promise<void> {
  try {
    const metadata = await getStreamMetadata(streamId, env);

    if (!metadata) {
      if (logger) {
        logger.warn('Stream metadata not found, cannot update status', {
          logType: 'edge_case',
          streamId,
          status,
        });
      }
      return;
    }

    metadata.status = status;
    metadata.updatedAt = new Date().toISOString();

    if (status === 'completed' || status === 'failed') {
      metadata.completedAt = new Date().toISOString();
    }

    if (errorMessage) {
      metadata.errorMessage = errorMessage;
    }

    await env.KV.put(
      getStreamMetadataKey(streamId),
      JSON.stringify(metadata),
      { expirationTtl: STREAM_TTL_SECONDS },
    );

    if (logger) {
      logger.info('Updated stream status', {
        logType: 'operation',
        streamId,
        status,
        errorMessage,
      });
    }
  } catch (error) {
    if (logger) {
      logger.error('Failed to update stream status', {
        logType: 'error',
        streamId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

// ============================================================================
// Active Stream Tracking
// ============================================================================

/**
 * Get active stream ID for thread/round/participant
 * Returns null if no active stream exists
 *
 * @param threadId - Thread ID
 * @param roundNumber - Round number
 * @param participantIndex - Participant index
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 * @returns Active stream ID or null
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
      getActiveStreamKey(threadId, roundNumber, participantIndex),
      'text',
    );

    if (streamId && logger) {
      logger.info('Found active stream', {
        logType: 'operation',
        threadId,
        roundNumber,
        participantIndex,
        streamId,
      });
    }

    return streamId;
  } catch (error) {
    if (logger) {
      logger.error('Failed to get active stream ID', {
        logType: 'error',
        threadId,
        roundNumber,
        participantIndex,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    return null;
  }
}

/**
 * Clear active stream tracking
 * Called when stream completes or fails
 *
 * @param threadId - Thread ID
 * @param roundNumber - Round number
 * @param participantIndex - Participant index
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
export async function clearActiveStream(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  try {
    await env.KV.delete(getActiveStreamKey(threadId, roundNumber, participantIndex));

    if (logger) {
      logger.info('Cleared active stream', {
        logType: 'operation',
        threadId,
        roundNumber,
        participantIndex,
      });
    }
  } catch (error) {
    if (logger) {
      logger.warn('Failed to clear active stream', {
        logType: 'edge_case',
        threadId,
        roundNumber,
        participantIndex,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

// ============================================================================
// Stream Cleanup
// ============================================================================

/**
 * Delete stream data from KV
 * Removes metadata, chunks, and active tracking
 *
 * @param streamId - Stream ID
 * @param threadId - Thread ID
 * @param roundNumber - Round number
 * @param participantIndex - Participant index
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
export async function deleteStream(
  streamId: string,
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  try {
    await Promise.all([
      env.KV.delete(getStreamMetadataKey(streamId)),
      env.KV.delete(getStreamChunksKey(streamId)),
      env.KV.delete(getActiveStreamKey(threadId, roundNumber, participantIndex)),
    ]);

    if (logger) {
      logger.info('Deleted stream', {
        logType: 'operation',
        streamId,
      });
    }
  } catch (error) {
    if (logger) {
      logger.warn('Failed to delete stream', {
        logType: 'edge_case',
        streamId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

// ============================================================================
// SSE Chunk Formatting
// ============================================================================

/**
 * Format SSE chunk for transmission
 * Converts chunk object to SSE protocol format
 *
 * @param chunk - SSE chunk
 * @returns Formatted SSE string
 */
export function formatSSEChunk(chunk: SSEChunk): string {
  let formatted = '';

  if (chunk.event) {
    formatted += `event: ${chunk.event}\n`;
  }

  formatted += `data: ${chunk.data}\n\n`;

  return formatted;
}

/**
 * Parse SSE line into chunk object
 * Extracts event and data from SSE format
 *
 * @param line - Raw SSE line
 * @returns Parsed SSE chunk or null
 */
export function parseSSELine(line: string): SSEChunk | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith(':')) {
    return null; // Comment or empty line
  }

  if (trimmed.startsWith('data:')) {
    const data = trimmed.slice(5).trim();
    return {
      data,
      timestamp: new Date().toISOString(),
    };
  }

  if (trimmed.startsWith('event:')) {
    const event = trimmed.slice(6).trim();
    return {
      event,
      data: '',
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Resumable Stream KV Service - Simplified for Cloudflare KV
 *
 * **BACKEND SERVICE**: Lightweight stream persistence for resume functionality
 * Following backend-patterns.md: Service layer for streaming infrastructure
 *
 * **PURPOSE**:
 * - Track active participant streams in KV
 * - Store stream status for resume detection
 * - Enable frontend to detect and reconnect to ongoing streams
 *
 * **SIMPLIFIED APPROACH** (adapted for KV vs Redis):
 * Unlike Redis with pub/sub, Cloudflare KV is eventually consistent.
 * This service focuses on tracking stream lifecycle rather than chunk buffering:
 * 1. Mark stream as "active" when it starts
 * 2. Mark stream as "completed" when it finishes
 * 3. Frontend polls GET endpoint to check status
 * 4. Once completed, frontend fetches message from database
 *
 * **TRADE-OFFS**:
 * - Doesn't support mid-stream resumption (KV limitation)
 * - Provides completion detection for page reload scenarios
 * - Simpler and more reliable than trying to buffer chunks in KV
 *
 * @module api/services/resumable-stream-kv
 */

import type { StreamStatus } from '@/api/core/enums';
import { StreamStatuses } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';
import type { TypedLogger } from '@/api/types/logger';

// ============================================================================
// Stream Lifecycle Tracking
// ============================================================================

/**
 * Stream state stored in KV
 * ✅ ENUM PATTERN: Uses StreamStatus from core enums
 */
export type StreamState = {
  threadId: string;
  roundNumber: number;
  participantIndex: number;
  status: StreamStatus;
  messageId: string | null;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
};

/**
 * TTL for stream state tracking (1 hour)
 */
const STREAM_STATE_TTL = 60 * 60;

/**
 * Generate KV key for stream state
 */
function getStreamStateKey(threadId: string, roundNumber: number, participantIndex: number): string {
  return `stream:state:${threadId}:r${roundNumber}:p${participantIndex}`;
}

/**
 * Generate KV key for thread-level active stream tracking
 * ✅ RESUMABLE STREAMS: Track ONE active stream per thread for AI SDK resume pattern
 */
function getThreadActiveStreamKey(threadId: string): string {
  return `stream:thread:${threadId}:active`;
}

/**
 * Active stream info stored at thread level
 * ✅ RESUMABLE STREAMS: Following AI SDK documentation pattern
 */
export type ThreadActiveStream = {
  streamId: string;
  roundNumber: number;
  participantIndex: number;
  createdAt: string;
};

/**
 * Set thread-level active stream
 * Called when participant stream starts to enable resume detection
 *
 * ✅ RESUMABLE STREAMS: AI SDK pattern - one active stream per thread
 *
 * @param threadId - Thread ID
 * @param streamId - Stream ID (format: {threadId}_r{roundNumber}_p{participantIndex})
 * @param roundNumber - Round number
 * @param participantIndex - Participant index
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
export async function setThreadActiveStream(
  threadId: string,
  streamId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  // ✅ LOCAL DEV: Skip tracking if KV not available
  if (!env?.KV) {
    return;
  }

  try {
    const activeStream: ThreadActiveStream = {
      streamId,
      roundNumber,
      participantIndex,
      createdAt: new Date().toISOString(),
    };

    await env.KV.put(
      getThreadActiveStreamKey(threadId),
      JSON.stringify(activeStream),
      { expirationTtl: STREAM_STATE_TTL },
    );

    if (logger) {
      logger.info('Set thread active stream', {
        logType: 'operation',
        threadId,
        streamId,
        roundNumber,
        participantIndex,
      });
    }
  } catch (error) {
    if (logger) {
      logger.warn('Failed to set thread active stream', {
        logType: 'edge_case',
        threadId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    // Don't throw - tracking failures shouldn't break streaming
  }
}

/**
 * Get thread-level active stream
 * Returns null if no active stream exists for the thread
 *
 * ✅ RESUMABLE STREAMS: AI SDK pattern - check for active stream on mount
 *
 * @param threadId - Thread ID
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 * @returns Active stream info or null
 */
export async function getThreadActiveStream(
  threadId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<ThreadActiveStream | null> {
  // ✅ LOCAL DEV: Return null if KV not available
  if (!env?.KV) {
    return null;
  }

  try {
    const activeStream = await env.KV.get(
      getThreadActiveStreamKey(threadId),
      'json',
    ) as ThreadActiveStream | null;

    if (activeStream && logger) {
      logger.info('Retrieved thread active stream', {
        logType: 'operation',
        threadId,
        streamId: activeStream.streamId,
        roundNumber: activeStream.roundNumber,
        participantIndex: activeStream.participantIndex,
      });
    }

    return activeStream;
  } catch (error) {
    if (logger) {
      logger.error('Failed to get thread active stream', {
        logType: 'error',
        threadId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    return null;
  }
}

/**
 * Clear thread-level active stream
 * Called when stream completes, fails, or is no longer needed
 *
 * ✅ RESUMABLE STREAMS: AI SDK pattern - clear when stream finishes
 *
 * @param threadId - Thread ID
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
export async function clearThreadActiveStream(
  threadId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  // ✅ LOCAL DEV: Skip if KV not available
  if (!env?.KV) {
    return;
  }

  try {
    await env.KV.delete(getThreadActiveStreamKey(threadId));

    if (logger) {
      logger.info('Cleared thread active stream', {
        logType: 'operation',
        threadId,
      });
    }
  } catch (error) {
    if (logger) {
      logger.warn('Failed to clear thread active stream', {
        logType: 'edge_case',
        threadId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Mark stream as active
 * Called when participant stream starts
 *
 * @param threadId - Thread ID
 * @param roundNumber - Round number
 * @param participantIndex - Participant index
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
export async function markStreamActive(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  // ✅ LOCAL DEV: Skip tracking if KV not available
  if (!env?.KV) {
    return;
  }

  try {
    const state: StreamState = {
      threadId,
      roundNumber,
      participantIndex,
      status: StreamStatuses.ACTIVE,
      messageId: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      errorMessage: null,
    };

    await env.KV.put(
      getStreamStateKey(threadId, roundNumber, participantIndex),
      JSON.stringify(state),
      { expirationTtl: STREAM_STATE_TTL },
    );

    if (logger) {
      logger.info('Marked stream as active', {
        logType: 'operation',
        threadId,
        roundNumber,
        participantIndex,
      });
    }
  } catch (error) {
    if (logger) {
      logger.warn('Failed to mark stream as active', {
        logType: 'edge_case',
        threadId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    // Don't throw - tracking failures shouldn't break streaming
  }
}

/**
 * Mark stream as completed
 * Called when participant stream finishes successfully
 *
 * @param threadId - Thread ID
 * @param roundNumber - Round number
 * @param participantIndex - Participant index
 * @param messageId - Completed message ID
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
export async function markStreamCompleted(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  messageId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  // ✅ LOCAL DEV: Skip tracking if KV not available
  if (!env?.KV) {
    return;
  }

  try {
    const state: StreamState = {
      threadId,
      roundNumber,
      participantIndex,
      status: StreamStatuses.COMPLETED,
      messageId,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      errorMessage: null,
    };

    await env.KV.put(
      getStreamStateKey(threadId, roundNumber, participantIndex),
      JSON.stringify(state),
      { expirationTtl: STREAM_STATE_TTL },
    );

    if (logger) {
      logger.info('Marked stream as completed', {
        logType: 'operation',
        threadId,
        roundNumber,
        participantIndex,
        messageId,
      });
    }
  } catch (error) {
    if (logger) {
      logger.warn('Failed to mark stream as completed', {
        logType: 'edge_case',
        threadId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Mark stream as failed
 * Called when participant stream encounters an error
 *
 * @param threadId - Thread ID
 * @param roundNumber - Round number
 * @param participantIndex - Participant index
 * @param errorMessage - Error message
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
export async function markStreamFailed(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  errorMessage: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  // ✅ LOCAL DEV: Skip tracking if KV not available
  if (!env?.KV) {
    return;
  }

  try {
    const state: StreamState = {
      threadId,
      roundNumber,
      participantIndex,
      status: StreamStatuses.FAILED,
      messageId: null,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      errorMessage,
    };

    await env.KV.put(
      getStreamStateKey(threadId, roundNumber, participantIndex),
      JSON.stringify(state),
      { expirationTtl: STREAM_STATE_TTL },
    );

    if (logger) {
      logger.info('Marked stream as failed', {
        logType: 'operation',
        threadId,
        roundNumber,
        participantIndex,
        errorMessage,
      });
    }
  } catch (error) {
    if (logger) {
      logger.warn('Failed to mark stream as failed', {
        logType: 'edge_case',
        threadId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Get stream state
 * Returns null if no active or completed stream exists
 *
 * @param threadId - Thread ID
 * @param roundNumber - Round number
 * @param participantIndex - Participant index
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 * @returns Stream state or null
 */
export async function getStreamState(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<StreamState | null> {
  // ✅ LOCAL DEV: Return null if KV not available
  if (!env?.KV) {
    return null;
  }

  try {
    const state = await env.KV.get(
      getStreamStateKey(threadId, roundNumber, participantIndex),
      'json',
    ) as StreamState | null;

    if (state && logger) {
      logger.info('Retrieved stream state', {
        logType: 'operation',
        threadId,
        roundNumber,
        participantIndex,
        status: state.status,
      });
    }

    return state;
  } catch (error) {
    if (logger) {
      logger.error('Failed to get stream state', {
        logType: 'error',
        threadId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    return null;
  }
}

/**
 * Clear stream state
 * Called when stream is no longer needed
 *
 * @param threadId - Thread ID
 * @param roundNumber - Round number
 * @param participantIndex - Participant index
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
export async function clearStreamState(
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
    await env.KV.delete(getStreamStateKey(threadId, roundNumber, participantIndex));

    if (logger) {
      logger.info('Cleared stream state', {
        logType: 'operation',
        threadId,
        roundNumber,
        participantIndex,
      });
    }
  } catch (error) {
    if (logger) {
      logger.warn('Failed to clear stream state', {
        logType: 'edge_case',
        threadId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

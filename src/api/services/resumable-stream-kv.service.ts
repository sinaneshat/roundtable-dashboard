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

import { ParticipantStreamStatuses, StreamStatuses } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';
import type { TypedLogger } from '@/api/types/logger';
import type { StreamState, ThreadActiveStream } from '@/api/types/streaming';
import { parseStreamState, parseThreadActiveStream } from '@/api/types/streaming';

// ============================================================================
// Stream Lifecycle Tracking
// ============================================================================

// ✅ SINGLE SOURCE OF TRUTH: Types imported from @/api/types/streaming
// StreamState and ThreadActiveStream are defined with Zod schemas there

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
 * Set thread-level active stream
 * Called when participant stream starts to enable resume detection
 *
 * ✅ RESUMABLE STREAMS: AI SDK pattern - track active round with all participants
 * ✅ FIX: Now tracks round-level state for proper multi-participant resumption
 *
 * @param threadId - Thread ID
 * @param streamId - Stream ID (format: {threadId}_r{roundNumber}_p{participantIndex})
 * @param roundNumber - Round number
 * @param participantIndex - Participant index
 * @param totalParticipants - Total number of participants in this round
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
export async function setThreadActiveStream(
  threadId: string,
  streamId: string,
  roundNumber: number,
  participantIndex: number,
  totalParticipants: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  // ✅ LOCAL DEV: Skip tracking if KV not available
  if (!env?.KV) {
    return;
  }

  try {
    // ✅ FIX: Check if there's an existing active round
    // If same round, update participant status; if different round, create new
    const existing = await getThreadActiveStream(threadId, env);

    let participantStatuses: Record<number, 'active' | 'completed' | 'failed'> = {};

    if (existing && existing.roundNumber === roundNumber) {
      // Same round - preserve existing participant statuses
      participantStatuses = { ...existing.participantStatuses };
    }

    // Mark this participant as active
    participantStatuses[participantIndex] = ParticipantStreamStatuses.ACTIVE;

    const activeStream: ThreadActiveStream = {
      streamId,
      roundNumber,
      participantIndex,
      createdAt: existing?.roundNumber === roundNumber ? existing.createdAt : new Date().toISOString(),
      totalParticipants,
      participantStatuses,
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
        totalParticipants,
        participantStatuses,
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
    // ✅ TYPE-SAFE: Use safe parser instead of force casting
    const activeStream = parseThreadActiveStream(
      await env.KV.get(getThreadActiveStreamKey(threadId), 'json'),
    );

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
 * Update participant status in thread-level active stream
 * ✅ FIX: Called when individual participant completes/fails
 * Only clears the active stream when ALL participants have finished
 * ✅ ENUM PATTERN: Uses ParticipantStreamStatus from core enums
 *
 * @param threadId - Thread ID
 * @param roundNumber - Round number
 * @param participantIndex - Participant index
 * @param status - New status (ParticipantStreamStatuses.COMPLETED | ParticipantStreamStatuses.FAILED)
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 * @returns true if round is complete (all participants finished), false otherwise
 */
export async function updateParticipantStatus(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  status: typeof ParticipantStreamStatuses.COMPLETED | typeof ParticipantStreamStatuses.FAILED,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<boolean> {
  // ✅ LOCAL DEV: Skip if KV not available
  if (!env?.KV) {
    return false;
  }

  try {
    const existing = await getThreadActiveStream(threadId, env);

    if (!existing) {
      logger?.warn('No active stream to update participant status', {
        logType: 'edge_case',
        threadId,
        roundNumber,
        participantIndex,
      });
      return false;
    }

    // Update participant status
    const participantStatuses = { ...existing.participantStatuses };
    participantStatuses[participantIndex] = status;

    // Check if ALL participants have finished (completed or failed)
    const finishedCount = Object.values(participantStatuses).filter(
      s => s === ParticipantStreamStatuses.COMPLETED || s === ParticipantStreamStatuses.FAILED,
    ).length;

    const allFinished = finishedCount >= existing.totalParticipants;

    if (allFinished) {
      // All participants done - clear the active stream
      await env.KV.delete(getThreadActiveStreamKey(threadId));
      logger?.info('All participants finished - cleared thread active stream', {
        logType: 'operation',
        threadId,
        roundNumber,
        totalParticipants: existing.totalParticipants,
        participantStatuses,
      });
      return true;
    }

    // Not all finished yet - update the statuses
    const updated: ThreadActiveStream = {
      ...existing,
      participantStatuses,
    };

    await env.KV.put(
      getThreadActiveStreamKey(threadId),
      JSON.stringify(updated),
      { expirationTtl: STREAM_STATE_TTL },
    );

    logger?.info('Updated participant status', {
      logType: 'operation',
      threadId,
      roundNumber,
      participantIndex,
      status,
      finishedCount,
      totalParticipants: existing.totalParticipants,
    });

    return false;
  } catch (error) {
    logger?.warn('Failed to update participant status', {
      logType: 'edge_case',
      threadId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Get next participant to stream for an incomplete round
 * ✅ FIX: Used by resume endpoint to determine which participant to resume
 *
 * @param threadId - Thread ID
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 * @returns Next participant index to stream, or null if round is complete
 */
export async function getNextParticipantToStream(
  threadId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<{ roundNumber: number; participantIndex: number; totalParticipants: number } | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const existing = await getThreadActiveStream(threadId, env);

    if (!existing) {
      return null;
    }

    // Find first participant that is NOT completed or failed
    for (let i = 0; i < existing.totalParticipants; i++) {
      const status = existing.participantStatuses[i];
      if (status === ParticipantStreamStatuses.ACTIVE || status === undefined) {
        return {
          roundNumber: existing.roundNumber,
          participantIndex: i,
          totalParticipants: existing.totalParticipants,
        };
      }
    }

    // All participants finished
    return null;
  } catch (error) {
    logger?.error('Failed to get next participant to stream', {
      logType: 'error',
      threadId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Clear thread-level active stream
 * Called when stream completes, fails, or is no longer needed
 *
 * ✅ RESUMABLE STREAMS: AI SDK pattern - clear when stream finishes
 * ✅ FIX: Prefer using updateParticipantStatus() which handles multi-participant rounds
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
    const now = new Date().toISOString();
    const state: StreamState = {
      threadId,
      roundNumber,
      participantIndex,
      status: StreamStatuses.ACTIVE,
      messageId: null,
      createdAt: now,
      completedAt: null,
      errorMessage: null,
      // ✅ HEARTBEAT: Initialize liveness tracking (Phase 1.3)
      lastHeartbeatAt: now,
      chunkCount: 0,
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
    const now = new Date().toISOString();
    // ✅ PRESERVE ORIGINAL STATE: Get existing state to preserve createdAt and chunkCount
    const existingState = await getStreamState(threadId, roundNumber, participantIndex, env);

    const state: StreamState = {
      threadId,
      roundNumber,
      participantIndex,
      status: StreamStatuses.COMPLETED,
      messageId,
      createdAt: existingState?.createdAt || now,
      completedAt: now,
      errorMessage: null,
      lastHeartbeatAt: now,
      chunkCount: existingState?.chunkCount || 0,
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
    const now = new Date().toISOString();
    // ✅ PRESERVE ORIGINAL STATE: Get existing state to preserve createdAt and chunkCount
    const existingState = await getStreamState(threadId, roundNumber, participantIndex, env);

    const state: StreamState = {
      threadId,
      roundNumber,
      participantIndex,
      status: StreamStatuses.FAILED,
      messageId: null,
      createdAt: existingState?.createdAt || now,
      completedAt: now,
      errorMessage,
      lastHeartbeatAt: now,
      chunkCount: existingState?.chunkCount || 0,
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
    // ✅ TYPE-SAFE: Use safe parser instead of force casting
    const state = parseStreamState(
      await env.KV.get(getStreamStateKey(threadId, roundNumber, participantIndex), 'json'),
    );

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

// ============================================================================
// Heartbeat & Liveness Tracking (Phase 1.3)
// ============================================================================

/**
 * Update stream heartbeat
 * Called periodically during streaming to indicate liveness
 *
 * ✅ BACKGROUND STREAMING: Heartbeat allows detection of dead streams
 * Streams without heartbeat for 30+ seconds are considered dead
 *
 * @param threadId - Thread ID
 * @param roundNumber - Round number
 * @param participantIndex - Participant index
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
export async function updateStreamHeartbeat(
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
    const existingState = await getStreamState(threadId, roundNumber, participantIndex, env);

    if (!existingState) {
      return; // No stream to update
    }

    // Only update heartbeat for active streams
    if (existingState.status !== StreamStatuses.ACTIVE && existingState.status !== StreamStatuses.STREAMING) {
      return;
    }

    const state: StreamState = {
      ...existingState,
      lastHeartbeatAt: new Date().toISOString(),
    };

    await env.KV.put(
      getStreamStateKey(threadId, roundNumber, participantIndex),
      JSON.stringify(state),
      { expirationTtl: STREAM_STATE_TTL },
    );
  } catch (error) {
    if (logger) {
      logger.warn('Failed to update stream heartbeat', {
        logType: 'edge_case',
        threadId,
        roundNumber,
        participantIndex,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Increment stream chunk count
 * Called when a new chunk is buffered
 *
 * @param threadId - Thread ID
 * @param roundNumber - Round number
 * @param participantIndex - Participant index
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
export async function incrementStreamChunkCount(
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
    const existingState = await getStreamState(threadId, roundNumber, participantIndex, env);

    if (!existingState) {
      return;
    }

    const state: StreamState = {
      ...existingState,
      chunkCount: (existingState.chunkCount || 0) + 1,
      lastHeartbeatAt: new Date().toISOString(), // Also update heartbeat on chunk
    };

    await env.KV.put(
      getStreamStateKey(threadId, roundNumber, participantIndex),
      JSON.stringify(state),
      { expirationTtl: STREAM_STATE_TTL },
    );
  } catch (error) {
    if (logger) {
      logger.warn('Failed to increment stream chunk count', {
        logType: 'edge_case',
        threadId,
        roundNumber,
        participantIndex,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Check if stream is stale (no heartbeat for specified duration)
 *
 * @param state - Stream state to check
 * @param maxStaleMs - Maximum time without heartbeat (default 30 seconds, suitable for reasoning models)
 * @returns true if stream is stale
 */
export function isStreamStale(state: StreamState, maxStaleMs = 30000): boolean {
  if (!state.lastHeartbeatAt) {
    return true;
  }

  const lastHeartbeat = new Date(state.lastHeartbeatAt).getTime();
  const now = Date.now();

  return now - lastHeartbeat > maxStaleMs;
}

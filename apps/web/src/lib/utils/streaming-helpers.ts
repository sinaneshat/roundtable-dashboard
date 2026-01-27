/**
 * Streaming Utilities - Single Source of Truth
 *
 * Consolidates streaming-related patterns that were duplicated across:
 * - store.ts (10+ locations)
 * - provider.tsx (8+ locations)
 * - use-round-subscription.ts (3+ locations)
 *
 * This module provides:
 * - Streaming ID generation (participant and moderator)
 * - Streaming metadata checks
 * - Participant index parsing from entity strings
 * - Terminal status checks
 * - Participant count utilities
 */

import type { UIMessage } from 'ai';

import type { EntityStatus } from '@/stores/chat/store-schemas';

// ============================================================================
// STREAMING ID GENERATION
// ============================================================================

/**
 * Generate streaming message ID for a participant
 *
 * Format: `streaming_p{index}_r{roundNumber}`
 *
 * REPLACES: Inline template literals in:
 * - store.ts line 181: `streaming_p${participantIndex}_r${roundNumber}`
 * - store.ts line 420: `streaming_p${i}_r${roundNumber}`
 *
 * @param participantIndex - 0-based participant index
 * @param roundNumber - Round number (0-based)
 */
export function getParticipantStreamingId(participantIndex: number, roundNumber: number): string {
  return `streaming_p${participantIndex}_r${roundNumber}`;
}

/**
 * Generate streaming message ID for the moderator
 *
 * Format: `{threadId}_r{roundNumber}_moderator` (preferred)
 * Fallback: `streaming_moderator_r{roundNumber}` (when threadId is null)
 *
 * REPLACES: Inline logic in:
 * - store.ts lines 243-244
 * - store.ts lines 457-459
 *
 * @param threadId - Thread ID (null for new threads before ID is assigned)
 * @param roundNumber - Round number (0-based)
 */
export function getModeratorStreamingId(threadId: string | null, roundNumber: number): string {
  return threadId
    ? `${threadId}_r${roundNumber}_moderator`
    : `streaming_moderator_r${roundNumber}`;
}

// ============================================================================
// STREAMING METADATA CHECKS
// ============================================================================

/**
 * Check if metadata indicates a streaming message
 *
 * Fast O(1) check without Zod validation.
 *
 * REPLACES: Inline checks in:
 * - provider.tsx line 161: `'isStreaming' in meta && ...`
 * - store.ts lines 256-258
 *
 * @param metadata - Message metadata (unknown type for safety)
 */
export function isStreamingMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }
  return 'isStreaming' in metadata && (metadata as { isStreaming: unknown }).isStreaming === true;
}

/**
 * Check if a UIMessage is a streaming placeholder
 *
 * Streaming placeholders have:
 * - metadata.isStreaming === true
 * - ID starting with 'streaming_p' or ending with '_moderator'
 *
 * @param message - UIMessage to check
 */
export function isStreamingPlaceholder(message: UIMessage): boolean {
  // Fast path: check ID pattern first (avoids metadata access)
  if (message.id.startsWith('streaming_p') || message.id.includes('_moderator')) {
    // Verify with metadata
    return isStreamingMetadata(message.metadata);
  }
  return false;
}

/**
 * Check if messages array has any streaming placeholders
 *
 * REPLACES: Inline checks in:
 * - provider.tsx lines 159-162, 201-204
 * - store.ts lines 778-785
 *
 * @param messages - Array of UIMessages
 */
export function hasStreamingPlaceholders(messages: UIMessage[]): boolean {
  return messages.some(m => isStreamingMetadata(m.metadata));
}

// ============================================================================
// PARTICIPANT INDEX PARSING
// ============================================================================

/**
 * Parse participant index from entity string
 *
 * Handles format: `participant_{index}` -> index
 *
 * REPLACES: Inline parsing in:
 * - provider.tsx lines 126, 171, 222: `Number.parseInt(entity.replace(...), 10)`
 * - use-round-subscription.ts line 316
 *
 * @param entity - Entity string (e.g., 'participant_0', 'participant_2')
 * @returns Participant index (0-based) or null if not a participant entity
 */
export function parseParticipantEntityIndex(entity: string): number | null {
  if (!entity.startsWith('participant_')) {
    return null;
  }
  const indexStr = entity.replace('participant_', '');
  const index = Number.parseInt(indexStr, 10);
  if (Number.isNaN(index) || index < 0) {
    return null;
  }
  return index;
}

// ============================================================================
// STATUS CHECKS
// ============================================================================

/**
 * Terminal statuses that indicate an entity has finished processing
 */
const TERMINAL_STATUSES: readonly EntityStatus[] = ['complete', 'error'] as const;

/**
 * Check if a status is terminal (complete or error)
 *
 * Terminal statuses indicate the entity has finished and won't change.
 *
 * REPLACES: Inline checks in:
 * - store.ts updateEntitySubscriptionStatus
 *
 * @param status - Entity status to check
 */
export function isTerminalStatus(status: EntityStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Check if all participants have completed (complete or error status)
 *
 * REPLACES: Inline checks in:
 * - store.ts line 627: `.every(p => p.status === 'complete' || ...)`
 * - provider.tsx lines 182-183
 * - use-round-subscription.ts lines 259-260
 *
 * @param participants - Array of objects with status field
 */
export function areAllParticipantsComplete<T extends { status: EntityStatus }>(
  participants: T[],
): boolean {
  // Guard: empty array returns false (prevents premature completion)
  if (participants.length === 0) {
    return false;
  }
  return participants.every(p => isTerminalStatus(p.status));
}

// ============================================================================
// PARTICIPANT COUNT UTILITIES
// ============================================================================

/**
 * Count enabled participants
 *
 * REPLACES: Inline filter/length in:
 * - provider.tsx line 83: `.filter(p => p.isEnabled).length`
 * - store.ts line 619
 *
 * @param participants - Array of objects with isEnabled field
 */
export function countEnabledParticipants<T extends { isEnabled: boolean }>(
  participants: T[],
): number {
  return participants.filter(p => p.isEnabled).length;
}

/**
 * Store Constants - Shared Values Across Store and Orchestrators
 *
 * Centralized constants to ensure consistency between different parts of the store.
 * Extracted from inline definitions in moderator-orchestrator.ts and pre-search-orchestrator.ts
 *
 * PATTERN: Single source of truth for magic values
 * TYPE-SAFE: const assertions for literal types
 * REUSABLE: Shared by orchestrators and store logic
 */

import type { MessageStatus } from '@roundtable/shared';

import type { StoredPreSearch } from '@/types/api';

/**
 * Priority order for moderator/pre-search status resolution
 *
 * When deduplicating or merging server/client state, higher priority wins.
 * Failed status has HIGHEST priority - server-side errors are authoritative.
 * Complete status takes precedence over in-progress, which beats pending.
 *
 * CRITICAL: failed=4 ensures server validation errors (schema mismatch)
 * always override client-side optimistic "complete" status.
 */
export const MESSAGE_STATUS_PRIORITY = {
  failed: 4,
  complete: 3,
  streaming: 2,
  pending: 1,
} as const satisfies Record<MessageStatus, number>;

/**
 * Type guard to ensure status has a priority value
 */
export function getStatusPriority(status: MessageStatus): number {
  return MESSAGE_STATUS_PRIORITY[status] ?? 0;
}

// ============================================================================
// ORCHESTRATOR COMPARE KEYS - Type-safe field lists for state change detection
// ============================================================================

/**
 * Compare keys for PreSearch - Must match PreSearchStream effect dependencies
 * CRITICAL: Missing keys cause unnecessary re-renders → aborted streams
 */
export const PRE_SEARCH_COMPARE_KEYS = [
  'roundNumber',
  'status',
  'id',
  'searchData',
  'userQuery',
  'errorMessage',
  'completedAt',
] as const satisfies ReadonlyArray<keyof StoredPreSearch>;

// ============================================================================
// ANIMATION INDICES - Type-safe animation tracking indices
// ============================================================================

/**
 * Animation indices enum for animation coordination
 *
 * Participant animations use indices 0, 1, 2, etc. (based on participant index)
 * Non-participant animations use negative indices to avoid collisions
 *
 * PATTERN: Enum-based approach for type safety and consistency
 * SINGLE SOURCE OF TRUTH: All animation indices defined here
 */
export const AnimationIndices = {
  /** Pre-search animation index (-1) */
  PRE_SEARCH: -1,
} as const;

// ============================================================================
// MODERATOR TIMEOUT CONFIGURATION
// ============================================================================

/**
 * Moderator timeout constants for stuck moderator detection and cleanup
 *
 * PATTERN: Centralized timeout configuration
 * SINGLE SOURCE OF TRUTH: Used by ChatView stuck moderator cleanup
 */
export const ModeratorTimeouts = {
  /**
   * Maximum time (ms) a moderator can be in streaming state before considered stuck
   * Default: 45 seconds (reduced from 90s for faster recovery from truncated streams)
   */
  STUCK_THRESHOLD_MS: 45_000,

  /**
   * Interval (ms) between stuck moderator checks
   * Default: 10 seconds
   */
  CHECK_INTERVAL_MS: 10_000,
} as const;

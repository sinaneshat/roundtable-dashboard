/**
 * Store Constants - Shared Values Across Store and Orchestrators
 *
 * Centralized constants to ensure consistency between different parts of the store.
 * Extracted from inline definitions in analysis-orchestrator.ts and pre-search-orchestrator.ts
 *
 * ✅ PATTERN: Single source of truth for magic values
 * ✅ TYPE-SAFE: const assertions for literal types
 * ✅ REUSABLE: Shared by orchestrators and store logic
 *
 * Location: /src/stores/chat/store-constants.ts
 * Used by: analysis-orchestrator.ts, pre-search-orchestrator.ts
 */

import type { AnalysisStatus } from '@/api/core/enums';
import type { StoredModeratorAnalysis, StoredPreSearch } from '@/api/routes/chat/schema';

/**
 * Priority order for analysis/pre-search status resolution
 *
 * When deduplicating or merging server/client state, higher priority wins.
 * Failed status has HIGHEST priority - server-side errors are authoritative.
 * Complete status takes precedence over in-progress, which beats pending.
 *
 * CRITICAL: failed=4 ensures server validation errors (schema mismatch)
 * always override client-side optimistic "complete" status.
 *
 * Usage:
 * - analysis-orchestrator.ts: Server vs client analysis merging
 * - pre-search-orchestrator.ts: Server vs client pre-search merging
 */
export const ANALYSIS_STATUS_PRIORITY = {
  failed: 4,
  complete: 3,
  streaming: 2,
  pending: 1,
} as const satisfies Record<AnalysisStatus, number>;

/**
 * Type guard to ensure status has a priority value
 */
export function getStatusPriority(status: AnalysisStatus): number {
  return ANALYSIS_STATUS_PRIORITY[status] ?? 0;
}

/**
 * Compare two statuses and return the one with higher priority
 */
export function getHigherPriorityStatus(
  status1: AnalysisStatus,
  status2: AnalysisStatus,
): AnalysisStatus {
  return getStatusPriority(status1) >= getStatusPriority(status2) ? status1 : status2;
}

// ============================================================================
// ORCHESTRATOR COMPARE KEYS - Type-safe field lists for state change detection
// ============================================================================

/**
 * Compare keys for ModeratorAnalysis - Must match component dependencies
 */
export const MODERATOR_ANALYSIS_COMPARE_KEYS = [
  'roundNumber',
  'status',
  'id',
  'analysisData',
  'errorMessage',
] as const satisfies ReadonlyArray<keyof StoredModeratorAnalysis>;

/**
 * Compare keys for PreSearch - Must match PreSearchStream effect dependencies
 * ✅ CRITICAL: Missing keys cause unnecessary re-renders → aborted streams
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
 * ✅ PATTERN: Enum-based approach for type safety and consistency
 * ✅ SINGLE SOURCE OF TRUTH: All animation indices defined here
 *
 * Usage:
 * - PreSearchCard: Uses PRE_SEARCH for pre-search animation tracking
 * - ModelMessageCard: Uses participant indices directly (0, 1, 2, ...)
 * - Provider: Checks animation completion before proceeding to next step
 */
export const AnimationIndices = {
  /**
   * Pre-search animation index (-1)
   * Used by PreSearchCard to register/complete animations
   */
  PRE_SEARCH: -1,

  /**
   * Analysis animation index (-2)
   * Reserved for future analysis animation tracking
   */
  ANALYSIS: -2,
} as const;

/**
 * Type guard to check if an index is a participant animation
 */
export function isParticipantAnimation(index: number): boolean {
  return index >= 0;
}

/**
 * Type guard to check if an index is a pre-search animation
 */
export function isPreSearchAnimation(index: number): boolean {
  return index === AnimationIndices.PRE_SEARCH;
}

/**
 * Type guard to check if an index is an analysis animation
 */
export function isAnalysisAnimation(index: number): boolean {
  return index === AnimationIndices.ANALYSIS;
}

// ============================================================================
// ANALYSIS TIMEOUT CONFIGURATION
// ============================================================================

/**
 * Analysis timeout constants for stuck analysis detection and cleanup
 *
 * ✅ PATTERN: Centralized timeout configuration
 * ✅ SINGLE SOURCE OF TRUTH: Used by ChatView stuck analysis cleanup
 *
 * Usage:
 * - ChatView.tsx: Periodic check for stuck streaming analyses
 */
export const AnalysisTimeouts = {
  /**
   * Maximum time (ms) an analysis can be in streaming state before considered stuck
   * Default: 90 seconds
   */
  STUCK_THRESHOLD_MS: 90_000,

  /**
   * Interval (ms) between stuck analysis checks
   * Default: 10 seconds
   */
  CHECK_INTERVAL_MS: 10_000,
} as const;

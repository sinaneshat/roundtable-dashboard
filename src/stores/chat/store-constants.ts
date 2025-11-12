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

/**
 * Priority order for analysis/pre-search status resolution
 *
 * When deduplicating or merging server/client state, higher priority wins.
 * Complete status takes precedence over in-progress, which beats pending.
 *
 * Usage:
 * - analysis-orchestrator.ts: Server vs client analysis merging
 * - pre-search-orchestrator.ts: Server vs client pre-search merging
 */
export const ANALYSIS_STATUS_PRIORITY = {
  complete: 3,
  streaming: 2,
  pending: 1,
  failed: 0,
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

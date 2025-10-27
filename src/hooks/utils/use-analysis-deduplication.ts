/**
 * useAnalysisDeduplication Hook
 *
 * React hook for deduplicating moderator analyses with optional regeneration filtering.
 * Memoizes deduplication logic to prevent unnecessary recalculations.
 *
 * Used by:
 * - ChatOverviewScreen: Basic deduplication without regeneration
 * - ChatThreadScreen: Advanced deduplication with regeneration filtering
 *
 * @module hooks/utils/use-analysis-deduplication
 */

import { useMemo } from 'react';

import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { deduplicateAnalyses } from '@/lib/utils/analysis-utils';

/**
 * Hook to deduplicate analyses with memoization
 *
 * Wraps the deduplicateAnalyses utility with React's useMemo for performance.
 * Only recalculates when raw analyses or regenerating round changes.
 *
 * Deduplication Steps:
 * 1. Remove duplicate IDs (keeps first occurrence)
 * 2. Filter out failed analyses
 * 3. Filter out analyses for regenerating round (if provided)
 * 4. Deduplicate by round number (keeps highest priority status)
 * 5. Sort by round number ascending
 *
 * @param rawAnalyses - Unfiltered analyses array (may contain duplicates)
 * @param options - Optional configuration
 * @param options.regeneratingRoundNumber - Round being regenerated (analysis filtered out)
 * @param options.excludeFailed - Whether to exclude failed analyses (default: true)
 * @returns Deduplicated and sorted analyses
 *
 * @example
 * ```typescript
 * // ChatOverviewScreen: Basic usage
 * const analyses = useAnalysisDeduplication(rawAnalyses);
 *
 * // ChatThreadScreen: With regeneration filtering
 * const analyses = useAnalysisDeduplication(rawAnalyses, {
 *   regeneratingRoundNumber: state.data.regeneratingRoundNumber
 * });
 * ```
 */
export function useAnalysisDeduplication(
  rawAnalyses: StoredModeratorAnalysis[],
  options?: {
    regeneratingRoundNumber?: number | null;
    excludeFailed?: boolean;
  },
): StoredModeratorAnalysis[] {
  const { regeneratingRoundNumber, excludeFailed } = options || {};

  return useMemo(
    () =>
      deduplicateAnalyses(rawAnalyses, {
        regeneratingRoundNumber,
        excludeFailed,
      }),
    [rawAnalyses, regeneratingRoundNumber, excludeFailed],
  );
}

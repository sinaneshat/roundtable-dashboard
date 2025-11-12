/**
 * React Query Cache Manipulation Helpers
 *
 * Consolidates repetitive cache update patterns for analyses.
 * Single source of truth for cache operations.
 *
 * ✅ PATTERN: Reduces 200+ lines of duplicated cache manipulation code
 * ✅ TYPE-SAFE: Uses Zod validation for cache data
 * ✅ REUSABLE: Standardized cache operations across all actions
 *
 * Location: /src/lib/utils/cache-helpers.ts
 * Used by: chat-analysis.ts, analysis-orchestrator.ts
 */

import type { QueryClient } from '@tanstack/react-query';

import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { queryKeys } from '@/lib/data/query-keys';
import { validateAnalysesCache } from '@/stores/chat/actions/types';

/**
 * Creates an empty analyses cache structure
 */
export function createEmptyAnalysesCache() {
  return {
    success: true,
    data: { items: [] as StoredModeratorAnalysis[] },
  };
}

/**
 * Updates analyses cache with a transform function
 * Handles validation, error recovery, and cache structure creation
 *
 * @param queryClient - React Query client instance
 * @param threadId - Thread ID for cache key
 * @param updater - Transform function that receives current items and returns updated items
 * @param options - Optional configuration
 * @param options.createIfMissing - Whether to create cache if it doesn't exist (default: true)
 * @param options.onVersionChange - Callback when cache version should be incremented
 * @returns The updated cache data or null if update failed
 *
 * @example
 * updateAnalysesCache(queryClient, threadId, items =>
 *   items.map(a => a.roundNumber === 1 ? { ...a, status: 'complete' } : a)
 * );
 */
export function updateAnalysesCache(
  queryClient: QueryClient,
  threadId: string,
  updater: (items: StoredModeratorAnalysis[]) => StoredModeratorAnalysis[],
  options?: {
    /** Whether to create cache if it doesn't exist (default: true) */
    createIfMissing?: boolean;
    /** Callback when cache version should be incremented */
    onVersionChange?: (incrementer: (v: number) => number) => void;
  },
) {
  const { createIfMissing = true, onVersionChange } = options || {};

  const updatedData = queryClient.setQueryData(
    queryKeys.threads.analyses(threadId),
    (oldData: unknown) => {
      const cacheData = validateAnalysesCache(oldData);

      // Handle missing cache
      if (!cacheData) {
        if (!createIfMissing) {
          return oldData;
        }

        const emptyCache = createEmptyAnalysesCache();
        const updatedItems = updater(emptyCache.data.items);
        return {
          ...emptyCache,
          data: { items: updatedItems },
        };
      }

      // Update existing cache
      // ✅ TYPE-SAFE: Cast validated cache items to StoredModeratorAnalysis
      const updatedItems = updater(cacheData.data.items as StoredModeratorAnalysis[]);

      return {
        ...cacheData,
        data: {
          ...cacheData.data,
          items: updatedItems,
        },
      };
    },
  );

  // Trigger version change for re-renders
  onVersionChange?.(v => v + 1);

  return updatedData;
}

/**
 * Adds an analysis to the cache
 * Handles duplicate detection and creates cache if missing
 *
 * @example
 * addAnalysisToCache(queryClient, threadId, pendingAnalysis, {
 *   replaceDuplicates: true,
 *   onVersionChange: setCacheVersion
 * });
 */
export function addAnalysisToCache(
  queryClient: QueryClient,
  threadId: string,
  analysis: StoredModeratorAnalysis,
  options?: {
    /** Whether to replace existing analysis with same round number (default: false) */
    replaceDuplicates?: boolean;
    /** Callback when cache version should be incremented */
    onVersionChange?: (incrementer: (v: number) => number) => void;
  },
) {
  const { replaceDuplicates = false, onVersionChange } = options || {};

  return updateAnalysesCache(
    queryClient,
    threadId,
    (items) => {
      // Check for existing analysis with same round number
      const hasExisting = items.some(a => a.roundNumber === analysis.roundNumber);

      if (hasExisting) {
        if (replaceDuplicates) {
          // Replace existing analysis
          return items.map(a =>
            a.roundNumber === analysis.roundNumber ? analysis : a,
          );
        }
        // Don't add duplicate
        return items;
      }

      // Add new analysis
      return [...items, analysis];
    },
    { onVersionChange },
  );
}

/**
 * Removes an analysis from cache by round number
 *
 * @example
 * removeAnalysisFromCache(queryClient, threadId, roundNumber, {
 *   onVersionChange: setCacheVersion
 * });
 */
export function removeAnalysisFromCache(
  queryClient: QueryClient,
  threadId: string,
  roundNumber: number,
  options?: {
    /** Callback when cache version should be incremented */
    onVersionChange?: (incrementer: (v: number) => number) => void;
  },
) {
  return updateAnalysesCache(
    queryClient,
    threadId,
    items => items.filter(a => a.roundNumber !== roundNumber),
    { onVersionChange: options?.onVersionChange },
  );
}

/**
 * Updates a specific analysis by round number
 *
 * @example
 * updateAnalysisInCache(queryClient, threadId, roundNumber, {
 *   status: AnalysisStatuses.COMPLETE,
 *   analysisData: payload
 * }, { onVersionChange: setCacheVersion });
 */
export function updateAnalysisInCache(
  queryClient: QueryClient,
  threadId: string,
  roundNumber: number,
  updates: Partial<StoredModeratorAnalysis>,
  options?: {
    /** Callback when cache version should be incremented */
    onVersionChange?: (incrementer: (v: number) => number) => void;
  },
) {
  return updateAnalysesCache(
    queryClient,
    threadId,
    items => items.map(a =>
      a.roundNumber === roundNumber
        ? { ...a, ...updates }
        : a,
    ),
    { onVersionChange: options?.onVersionChange },
  );
}

/**
 * Filters analyses in cache based on a predicate
 *
 * @example
 * // Remove failed analyses
 * filterAnalysesInCache(queryClient, threadId,
 *   (a) => a.status !== AnalysisStatuses.FAILED,
 *   { onVersionChange: setCacheVersion }
 * );
 */
export function filterAnalysesInCache(
  queryClient: QueryClient,
  threadId: string,
  predicate: (analysis: StoredModeratorAnalysis) => boolean,
  options?: {
    /** Callback when cache version should be incremented */
    onVersionChange?: (incrementer: (v: number) => number) => void;
  },
) {
  return updateAnalysesCache(
    queryClient,
    threadId,
    items => items.filter(predicate),
    { onVersionChange: options?.onVersionChange },
  );
}

/**
 * Gets current analyses from cache without updating
 * Returns empty array if cache doesn't exist or is invalid
 *
 * @example
 * const analyses = getAnalysesFromCache(queryClient, threadId);
 */
export function getAnalysesFromCache(
  queryClient: QueryClient,
  threadId: string,
): StoredModeratorAnalysis[] {
  const cacheData = queryClient.getQueryData(queryKeys.threads.analyses(threadId));
  const validated = validateAnalysesCache(cacheData);
  // ✅ TYPE-SAFE: Cast validated cache items to StoredModeratorAnalysis
  return (validated?.data.items as StoredModeratorAnalysis[]) || [];
}

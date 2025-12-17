/**
 * React Query Cache Manipulation Helpers
 *
 * Consolidates repetitive cache update patterns for round summaries.
 * Single source of truth for cache operations.
 *
 * ✅ PATTERN: Reduces 200+ lines of duplicated cache manipulation code
 * ✅ TYPE-SAFE: Uses Zod validation for cache data
 * ✅ REUSABLE: Standardized cache operations across all actions
 *
 * Location: /src/lib/utils/cache-helpers.ts
 * Used by: summary orchestrator and related actions
 */

import type { QueryClient } from '@tanstack/react-query';

import type { StoredRoundSummary } from '@/api/routes/chat/schema';
import { queryKeys } from '@/lib/data/query-keys';
import { validateSummariesCache } from '@/stores/chat';

/**
 * Creates an empty summaries cache structure
 */
export function createEmptySummariesCache() {
  return {
    success: true,
    // ✅ TYPE-SAFE: Use satisfies instead of force cast
    data: { items: [] satisfies StoredRoundSummary[] },
  };
}

/**
 * @deprecated Use createEmptySummariesCache instead
 */
export const createEmptyAnalysesCache = createEmptySummariesCache;

/**
 * Updates summaries cache with a transform function
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
 * updateSummariesCache(queryClient, threadId, items =>
 *   items.map(s => s.roundNumber === 1 ? { ...s, status: 'complete' } : s)
 * );
 */
export function updateSummariesCache(
  queryClient: QueryClient,
  threadId: string,
  updater: (items: StoredRoundSummary[]) => StoredRoundSummary[],
  options?: {
    /** Whether to create cache if it doesn't exist (default: true) */
    createIfMissing?: boolean;
    /** Callback when cache version should be incremented */
    onVersionChange?: (incrementer: (v: number) => number) => void;
  },
) {
  const { createIfMissing = true, onVersionChange } = options || {};

  const updatedData = queryClient.setQueryData(
    queryKeys.threads.summaries(threadId),
    (oldData: unknown) => {
      const cacheData = validateSummariesCache(oldData);

      // Handle missing cache
      if (!cacheData) {
        if (!createIfMissing) {
          return oldData;
        }

        const emptyCache = createEmptySummariesCache();
        const updatedItems = updater(emptyCache.data.items);
        return {
          ...emptyCache,
          data: { items: updatedItems },
        };
      }

      // Update existing cache
      // ✅ TYPE-SAFE: Cast validated cache items to match StoredRoundSummary type
      // The cache schema has `summaryData: z.unknown()` while StoredRoundSummary
      // has a more specific type. This cast is safe because both represent the same data.
      const updatedItems = updater(cacheData.data.items as unknown as StoredRoundSummary[]);

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
 * @deprecated Use updateSummariesCache instead
 */
export const updateAnalysesCache = updateSummariesCache;

/**
 * Adds a summary to the cache
 * Handles duplicate detection and creates cache if missing
 *
 * @example
 * addSummaryToCache(queryClient, threadId, pendingSummary, {
 *   replaceDuplicates: true,
 *   onVersionChange: setCacheVersion
 * });
 */
export function addSummaryToCache(
  queryClient: QueryClient,
  threadId: string,
  summary: StoredRoundSummary,
  options?: {
    /** Whether to replace existing summary with same round number (default: false) */
    replaceDuplicates?: boolean;
    /** Callback when cache version should be incremented */
    onVersionChange?: (incrementer: (v: number) => number) => void;
  },
) {
  const { replaceDuplicates = false, onVersionChange } = options || {};

  return updateSummariesCache(
    queryClient,
    threadId,
    (items) => {
      // Check for existing summary with same round number
      const hasExisting = items.some(s => s.roundNumber === summary.roundNumber);

      if (hasExisting) {
        if (replaceDuplicates) {
          // Replace existing summary
          return items.map(s =>
            s.roundNumber === summary.roundNumber ? summary : s,
          );
        }
        // Don't add duplicate
        return items;
      }

      // Add new summary
      return [...items, summary];
    },
    { onVersionChange },
  );
}

/**
 * Removes a summary from cache by round number
 *
 * @example
 * removeSummaryFromCache(queryClient, threadId, roundNumber, {
 *   onVersionChange: setCacheVersion
 * });
 */
export function removeSummaryFromCache(
  queryClient: QueryClient,
  threadId: string,
  roundNumber: number,
  options?: {
    /** Callback when cache version should be incremented */
    onVersionChange?: (incrementer: (v: number) => number) => void;
  },
) {
  return updateSummariesCache(
    queryClient,
    threadId,
    items => items.filter(s => s.roundNumber !== roundNumber),
    { onVersionChange: options?.onVersionChange },
  );
}

/**
 * Updates a specific summary by round number
 *
 * @example
 * updateSummaryInCache(queryClient, threadId, roundNumber, {
 *   status: MessageStatuses.COMPLETE,
 *   summaryData: payload
 * }, { onVersionChange: setCacheVersion });
 */
export function updateSummaryInCache(
  queryClient: QueryClient,
  threadId: string,
  roundNumber: number,
  updates: Partial<StoredRoundSummary>,
  options?: {
    /** Callback when cache version should be incremented */
    onVersionChange?: (incrementer: (v: number) => number) => void;
  },
) {
  return updateSummariesCache(
    queryClient,
    threadId,
    items => items.map(s =>
      s.roundNumber === roundNumber
        ? { ...s, ...updates }
        : s,
    ),
    { onVersionChange: options?.onVersionChange },
  );
}

/**
 * Filters summaries in cache based on a predicate
 *
 * @example
 * // Remove failed summaries
 * filterSummariesInCache(queryClient, threadId,
 *   (s) => s.status !== MessageStatuses.FAILED,
 *   { onVersionChange: setCacheVersion }
 * );
 */
export function filterSummariesInCache(
  queryClient: QueryClient,
  threadId: string,
  predicate: (summary: StoredRoundSummary) => boolean,
  options?: {
    /** Callback when cache version should be incremented */
    onVersionChange?: (incrementer: (v: number) => number) => void;
  },
) {
  return updateSummariesCache(
    queryClient,
    threadId,
    items => items.filter(predicate),
    { onVersionChange: options?.onVersionChange },
  );
}

/**
 * @deprecated Use filterSummariesInCache instead
 */
export const filterAnalysesInCache = filterSummariesInCache;

/**
 * Gets current summaries from cache without updating
 * Returns empty array if cache doesn't exist or is invalid
 *
 * @example
 * const summaries = getSummariesFromCache(queryClient, threadId);
 */
export function getSummariesFromCache(
  queryClient: QueryClient,
  threadId: string,
): StoredRoundSummary[] {
  const cacheData = queryClient.getQueryData(queryKeys.threads.summaries(threadId));
  const validated = validateSummariesCache(cacheData);
  // ✅ TYPE-SAFE: Cast validated cache items to match StoredRoundSummary type
  // The cache schema has `summaryData: z.unknown()` while StoredRoundSummary
  // has a more specific type. This cast is safe because both represent the same data.
  return (validated?.data.items as unknown as StoredRoundSummary[]) || [];
}

/**
 * @deprecated Use getSummariesFromCache instead
 */
export const getAnalysesFromCache = getSummariesFromCache;

// ============================================================================
// CACHE PREFETCH UTILITIES
// ============================================================================

/**
 * Standard cache metadata for prefetch operations
 *
 * **SINGLE SOURCE OF TRUTH**: Use this for all cache prefetch meta objects.
 * Eliminates repeated inline object creation across flow-controller and other files.
 *
 * @param requestId - Optional request ID (default: 'prefetch')
 * @returns Cache meta object with timestamp and version
 *
 * @example
 * ```typescript
 * queryClient.setQueryData(queryKey, {
 *   success: true,
 *   data: { items: [] },
 *   meta: createPrefetchMeta(),
 * });
 * ```
 */
export function createPrefetchMeta(requestId: string = 'prefetch') {
  return {
    requestId,
    timestamp: new Date().toISOString(),
    version: 'v1',
  } as const;
}

/**
 * Creates empty cache response with meta for prefetch operations
 *
 * **SINGLE SOURCE OF TRUTH**: Use for pre-populating empty list caches.
 *
 * @example
 * ```typescript
 * queryClient.setQueryData(
 *   queryKeys.threads.changelog(threadId),
 *   createEmptyListCache(),
 * );
 * ```
 */
export function createEmptyListCache() {
  return {
    success: true,
    data: { items: [] },
    meta: createPrefetchMeta(),
  } as const;
}

/**
 * React Query Cache Manipulation Helpers
 *
 * Consolidates repetitive cache update patterns.
 * Single source of truth for cache operations.
 *
 * ✅ PATTERN: Reduces duplicated cache manipulation code
 * ✅ REUSABLE: Standardized cache operations across all actions
 *
 * Location: /src/lib/utils/cache-helpers.ts
 */

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
export function createPrefetchMeta(requestId = 'prefetch') {
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
    data: { items: [] },
    meta: createPrefetchMeta(),
    success: true,
  } as const;
}

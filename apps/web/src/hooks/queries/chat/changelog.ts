/**
 * Thread Configuration Changelog Query Hooks
 *
 * TanStack Query hooks for thread configuration changelog operations
 * Following patterns from TanStack Query v5 documentation
 *
 * IMPORTANT: Uses shared queryOptions from query-options.ts to ensure
 * SSR prefetch and client useQuery use the SAME configuration.
 * This prevents hydration mismatches and redundant client fetches.
 */

import { useQuery } from '@tanstack/react-query';

import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { threadChangelogQueryOptions } from '@/lib/data/query-options';
import { GC_TIMES, STALE_TIMES } from '@/lib/data/stale-times';
import { getThreadRoundChangelogService } from '@/services/api';

/**
 * Hook to fetch thread configuration changelog
 * Returns configuration changes ordered by creation time (newest first)
 * Protected endpoint - requires authentication
 *
 * ✅ SSR: Uses shared queryOptions for consistent SSR hydration
 * ✅ OPTIMIZED: No automatic refetching - changelog updates are triggered by mutations
 * Changelog only changes when user modifies participants, so we don't need polling
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: based on threadId and auth)
 */
export function useThreadChangelogQuery(threadId: string, enabled?: boolean) {
  const { isAuthenticated } = useAuthCheck();

  // ✅ SSR: Use shared queryOptions - MUST match loader prefetch
  const options = threadChangelogQueryOptions(threadId);

  return useQuery({
    ...options,
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    gcTime: GC_TIMES.INFINITE, // Match staleTime: Infinity pattern
    // Preserve previous data during refetches to prevent flickering
    placeholderData: previousData => previousData,
    throwOnError: false,
  });
}

/**
 * Hook to fetch changelog for a specific round
 *
 * ✅ PERF OPTIMIZATION: Returns only changelog entries for a specific round
 * Used for incremental changelog updates after config changes mid-conversation
 * Much more efficient than fetching all changelogs
 *
 * ⚠️ NO placeholderData: This query is used for background cache merges.
 * placeholderData would return stale data from previous rounds during fetch,
 * causing race conditions where old round data is merged instead of new round data.
 *
 * @param threadId - Thread ID
 * @param roundNumber - Round number (0-BASED)
 * @param enabled - Optional control over whether to fetch
 */
export function useThreadRoundChangelogQuery(
  threadId: string,
  roundNumber: number,
  enabled?: boolean,
) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    // ⚠️ NO placeholderData - prevents stale data from previous rounds causing race conditions
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    gcTime: GC_TIMES.INFINITE, // Match staleTime: Infinity pattern
    queryFn: () => getThreadRoundChangelogService({
      param: { roundNumber: String(roundNumber), threadId },
    }),
    queryKey: queryKeys.threads.roundChangelog(threadId, roundNumber),
    retry: false,
    staleTime: STALE_TIMES.threadChangelog, // Infinity - never stale
    throwOnError: false,
  });
}

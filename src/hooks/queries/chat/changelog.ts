/**
 * Thread Configuration Changelog Query Hooks
 *
 * TanStack Query hooks for thread configuration changelog operations
 * Following patterns from TanStack Query v5 documentation
 *
 * IMPORTANT: staleTime values MUST match server-side prefetch values
 * See: docs/react-query-ssr-patterns.md
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getThreadChangelogService, getThreadRoundChangelogService } from '@/services/api';

/**
 * Hook to fetch thread configuration changelog
 * Returns configuration changes ordered by creation time (newest first)
 * Protected endpoint - requires authentication
 *
 * ✅ OPTIMIZED: No automatic refetching - changelog updates are triggered by mutations
 * Changelog only changes when user modifies participants, so we don't need polling
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: based on threadId and auth)
 */
export function useThreadChangelogQuery(threadId: string, enabled?: boolean) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    queryKey: queryKeys.threads.changelog(threadId),
    queryFn: () => getThreadChangelogService({ param: { id: threadId } }),
    staleTime: STALE_TIMES.threadChangelog, // Infinity - ONE-WAY DATA FLOW
    // ✅ STREAMING PROTECTION: All refetch settings now handled globally
    // See query-client.ts for global defaults (all disabled)
    // Preserve previous data during refetches to prevent flickering
    placeholderData: previousData => previousData,
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    retry: false,
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
    queryKey: queryKeys.threads.roundChangelog(threadId, roundNumber),
    queryFn: () => getThreadRoundChangelogService({
      param: { threadId, roundNumber: String(roundNumber) },
    }),
    staleTime: STALE_TIMES.threadChangelog, // Infinity - never stale
    // ⚠️ NO placeholderData - prevents stale data from previous rounds causing race conditions
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    retry: false,
    throwOnError: false,
  });
}

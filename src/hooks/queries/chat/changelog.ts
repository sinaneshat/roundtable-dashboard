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

import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getThreadChangelogService } from '@/services/api';

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
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.threads.changelog(threadId),
    queryFn: () => getThreadChangelogService({ param: { id: threadId } }),
    staleTime: STALE_TIMES.threadChangelog, // 30 seconds
    // ✅ STREAMING PROTECTION: All refetch settings now handled globally
    // See query-client.ts for global defaults (all disabled)
    // ✅ CRITICAL FIX: Preserve previous data during refetches
    // This prevents changelog from disappearing when query is invalidated
    // Without this, changelog temporarily becomes empty array during refetch,
    // causing items to be removed from DOM and re-added at the bottom
    placeholderData: previousData => previousData,
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    retry: false,
  });
}

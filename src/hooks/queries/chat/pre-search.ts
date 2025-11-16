/**
 * Thread Pre-Search Query Hooks
 *
 * TanStack Query hooks for thread pre-search operations
 * Following EXACT pattern from analysis.ts
 *
 * IMPORTANT: staleTime values MUST match server-side prefetch values
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getThreadPreSearchesService } from '@/services/api/chat-pre-search';

/**
 * Hook to fetch all pre-search results for a thread
 * ✅ FOLLOWS: useThreadAnalysesQuery pattern exactly
 * ✅ USED BY: usePreSearchOrchestrator to sync to store
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch
 */
export function useThreadPreSearchesQuery(
  threadId: string,
  enabled?: boolean,
) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  const query = useQuery({
    queryKey: queryKeys.threads.preSearches(threadId),
    queryFn: async () => {
      const response = await getThreadPreSearchesService({ param: { id: threadId } });
      return response;
    },
    staleTime: STALE_TIMES.preSearch,
    placeholderData: previousData => previousData,
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    // ✅ CRITICAL FIX: Poll for pre-search status updates in preview environments
    // In Cloudflare Workers edge environments, query invalidation may not propagate immediately
    // Poll every 500ms when pre-search is pending/streaming to catch status updates quickly
    // Stop polling once all pre-searches are complete/failed
    //
    // ✅ PERFORMANCE FIX: Reduced from 2000ms to 500ms for better UX
    // - Reduces race condition window from 0-2s to 0-500ms
    // - Faster UI updates when backend creates/updates pre-search records
    // - Minimal API cost increase (pre-search requests are lightweight)
    refetchInterval: (query) => {
      // Check if any pre-search is pending or streaming
      const hasActivePreSearch = query.state.data?.data?.items?.some(
        ps => ps.status === 'pending' || ps.status === 'streaming',
      );

      // Poll every 500ms if there are active pre-searches, otherwise don't poll
      // This provides responsive UX while minimizing unnecessary API calls
      return hasActivePreSearch ? 500 : false;
    },
    refetchIntervalInBackground: false, // Only poll when tab is active
  });

  return query;
}

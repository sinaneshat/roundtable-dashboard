/**
 * Thread Pre-Search Query Hooks
 *
 * TanStack Query hooks for thread pre-search operations
 * Following EXACT pattern from summary.ts
 *
 * IMPORTANT: staleTime values MUST match server-side prefetch values
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { MessageStatuses } from '@/api/core/enums';
import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getThreadPreSearchesService } from '@/services/api/chat-pre-search';

/**
 * Hook to fetch all pre-search results for a thread
 * ✅ FOLLOWS: useThreadSummariesQuery pattern exactly
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

    // ✅ REFETCH CONTROL: Prevent unnecessary refetches that cause infinite polling
    // Only refetch via polling interval or explicit invalidation
    refetchOnMount: false, // Don't refetch when component mounts (use cached data)
    refetchOnWindowFocus: false, // Don't refetch when user switches back to tab
    refetchOnReconnect: false, // Don't refetch when network reconnects

    // ✅ OPTIMIZED: Only poll when pre-search is PENDING (waiting to start)
    // When status is STREAMING, SSE streaming handles real-time updates - polling is redundant
    // This prevents duplicate network calls (SSE stream + polling) during active streaming
    //
    // Poll PENDING: Catch the transition when execution starts (PENDING → STREAMING)
    // Don't poll STREAMING: SSE stream provides updates via chat-store-provider.tsx
    // Don't poll COMPLETE/FAILED: Final states, no updates needed
    refetchInterval: (query) => {
      // Only poll when pre-search is PENDING (waiting for execution to start)
      // Don't poll during STREAMING - SSE handles updates
      const hasPendingPreSearch = query.state.data?.data?.items?.some(
        ps => ps.status === MessageStatuses.PENDING,
      );

      // Poll every 500ms only for PENDING status to catch execution start
      return hasPendingPreSearch ? 500 : false;
    },
    refetchIntervalInBackground: false, // Only poll when tab is active
  });

  return query;
}

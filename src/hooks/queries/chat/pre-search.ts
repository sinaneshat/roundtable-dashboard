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
    refetchInterval: false,
  });

  return query;
}

/**
 * Thread Messages Query Hooks
 *
 * TanStack Query hooks for chat message operations
 * Following patterns from TanStack Query v5 documentation
 *
 * IMPORTANT: staleTime values MUST match server-side prefetch values
 * See: docs/react-query-ssr-patterns.md
 */

import { useQuery } from '@tanstack/react-query';

import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { GC_TIMES, STALE_TIMES } from '@/lib/data/stale-times';
import { getThreadMessagesService } from '@/services/api';

/**
 * Hook to fetch thread messages
 * Returns all messages for a thread ordered by creation time
 * Protected endpoint - requires authentication
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: based on threadId and auth)
 */
export function useThreadMessagesQuery(threadId: string, enabled?: boolean) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    gcTime: GC_TIMES.STANDARD, // 5 minutes
    queryFn: () => getThreadMessagesService({ param: { id: threadId } }),
    queryKey: queryKeys.threads.messages(threadId),
    retry: false,
    staleTime: STALE_TIMES.threadMessages,
    throwOnError: false,
  });
}

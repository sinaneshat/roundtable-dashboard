/**
 * Sidebar Thread Query Hook
 *
 * Lightweight endpoint for sidebar - only essential fields
 * Shorter TTL (30s) for fresher titles after updates
 */

import { useInfiniteQuery } from '@tanstack/react-query';

import { LIMITS } from '@/constants';
import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { listSidebarThreadsService } from '@/services/api';

/**
 * Hook to fetch sidebar threads with lightweight payload
 * Returns only essential fields: id, title, slug, previousSlug, isFavorite, isPublic, timestamps
 *
 * @param search - Optional search query to filter threads by title
 */
export function useSidebarThreadsQuery(search?: string): ReturnType<typeof useInfiniteQuery<{ success: boolean; data?: { items: unknown[]; pagination?: { nextCursor?: string } } }>> {
  const { isAuthenticated } = useAuthCheck();

  return useInfiniteQuery({
    queryKey: [...queryKeys.threads.sidebar(search)],
    queryFn: async ({ pageParam }) => {
      const limit = search
        ? LIMITS.SEARCH_RESULTS
        : pageParam
          ? LIMITS.STANDARD_PAGE
          : LIMITS.INITIAL_PAGE;

      const params: { cursor?: string; search?: string; limit: number } = { limit };
      if (pageParam)
        params.cursor = pageParam;
      if (search)
        params.search = search;

      return listSidebarThreadsService({ query: params });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => (lastPage as any)?.success ? (lastPage as any).data?.pagination?.nextCursor : undefined,
    enabled: isAuthenticated,
    staleTime: STALE_TIMES.threadsSidebar,
    retry: false,
    throwOnError: false,
  });
}

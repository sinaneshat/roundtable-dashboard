/**
 * Sidebar Thread Query Hook
 *
 * Lightweight endpoint for sidebar - only essential fields
 * Shorter TTL (30s) for fresher titles after updates
 *
 * CRITICAL: Uses shared queryOptions from query-options.ts
 * This ensures SSR hydration works correctly - same config in loader and hook
 */

import { useInfiniteQuery } from '@tanstack/react-query';

import { LIMITS } from '@/constants';
import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { sidebarThreadsQueryOptions } from '@/lib/data/query-options';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { listSidebarThreadsService } from '@/services/api';

/**
 * Hook to fetch sidebar threads with lightweight payload
 * Returns only essential fields: id, title, slug, previousSlug, isFavorite, isPublic, timestamps
 *
 * ✅ SSR HYDRATION: Uses shared queryOptions for non-search queries (SSR prefetched)
 * Search queries use client-only fetching (not SSR prefetched)
 *
 * @param search - Optional search query to filter threads by title
 */
export function useSidebarThreadsQuery(search?: string) {
  const { isAuthenticated } = useAuthCheck();

  // Determine query options based on search parameter
  // IMPORTANT: We must call useInfiniteQuery unconditionally to satisfy React hooks rules
  const isSearchQuery = Boolean(search);

  return useInfiniteQuery({
    // Use shared SSR options for non-search, custom options for search
    ...(isSearchQuery
      ? {
          queryKey: queryKeys.threads.sidebar(search),
          queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
            const params: { cursor?: string; search: string; limit: number } = {
              limit: LIMITS.SEARCH_RESULTS,
              search: search ?? '',
            };
            if (pageParam)
              params.cursor = pageParam;
            return listSidebarThreadsService({ query: params });
          },
          initialPageParam: undefined as string | undefined,
          getNextPageParam: (lastPage: Awaited<ReturnType<typeof listSidebarThreadsService>> | undefined) => {
            if (!lastPage?.success)
              return undefined;
            return lastPage.data?.pagination?.nextCursor;
          },
          staleTime: STALE_TIMES.threadsSidebar,
        }
      : sidebarThreadsQueryOptions),
    enabled: isAuthenticated,
    retry: false,
    throwOnError: false,
  });
}

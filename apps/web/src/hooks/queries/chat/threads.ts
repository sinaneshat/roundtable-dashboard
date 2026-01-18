/**
 * Thread CRUD Query Hooks
 *
 * TanStack Query hooks for chat thread CRUD operations (Create, Read, Update, Delete)
 * Following patterns from TanStack Query v5 infinite query documentation
 *
 * IMPORTANT: staleTime values MUST match server-side prefetch values
 * See: docs/react-query-ssr-patterns.md
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { LIMITS } from '@/constants';
import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import {
  getPublicThreadService,
  getThreadBySlugService,
  getThreadService,
  getThreadSlugStatusService,
  listPublicThreadSlugsService,
  listThreadsService,
} from '@/services/api';

/**
 * Hook to fetch chat threads with cursor-based infinite scrolling
 * Following TanStack Query v5 official patterns
 *
 * Initial page loads 50 items, subsequent pages load 20 items
 * Search queries load 10 items per page
 *
 * @param search - Optional search query to filter threads by title
 */
export function useThreadsQuery(search?: string) {
  const { isAuthenticated } = useAuthCheck();

  return useInfiniteQuery({
    queryKey: [...queryKeys.threads.lists(search)],
    queryFn: async ({ pageParam }) => {
      // ✅ Use centralized limits - clean semantic names
      const limit = search
        ? LIMITS.SEARCH_RESULTS // 10 for search results
        : pageParam
          ? LIMITS.STANDARD_PAGE // 20 for subsequent pages
          : LIMITS.INITIAL_PAGE; // 50 for initial sidebar load

      const params: { cursor?: string; search?: string; limit: number } = { limit };
      if (pageParam)
        params.cursor = pageParam;
      if (search)
        params.search = search;

      return listThreadsService({ query: params });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.success)
        return undefined;
      return lastPage.data.pagination.nextCursor;
    },
    enabled: isAuthenticated,
    staleTime: STALE_TIMES.threads, // 30 seconds - match server-side prefetch
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch a specific thread by ID with participants and messages
 * Returns thread details including all participants and messages
 * Protected endpoint - requires authentication
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: based on threadId and auth)
 */
export function useThreadQuery(threadId: string, enabled?: boolean) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    queryKey: queryKeys.threads.detail(threadId),
    queryFn: () => getThreadService({ param: { id: threadId } }),
    staleTime: STALE_TIMES.threadDetail, // 10 seconds - match server-side prefetch
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch a public thread by slug (no authentication required)
 * Returns thread details for publicly shared threads
 * Public endpoint - no authentication required
 *
 * @param slug - Thread slug
 * @param enabled - Optional control over whether to fetch (default: based on slug)
 */
export function usePublicThreadQuery(slug: string, enabled?: boolean) {
  return useQuery({
    queryKey: queryKeys.threads.public(slug),
    queryFn: () => getPublicThreadService({ param: { slug } }),
    staleTime: STALE_TIMES.publicThreadDetail, // 1 minute - match server-side prefetch
    enabled: enabled !== undefined ? enabled : !!slug,
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch all public thread slugs (for SSG/ISR page generation)
 * Public endpoint - no authentication required
 *
 * Note: This hook is primarily used for server-side prefetching.
 * Client-side use is rare but supported for consistency.
 *
 * @param enabled - Optional control over whether to fetch (default: true)
 */
export function usePublicThreadSlugsQuery(enabled?: boolean) {
  return useQuery({
    queryKey: queryKeys.threads.publicSlugs(),
    queryFn: () => listPublicThreadSlugsService(),
    staleTime: STALE_TIMES.publicThreadSlugs, // 24 hours - matches ISR cache
    enabled: enabled !== undefined ? enabled : true,
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch a thread by slug for authenticated user
 * Protected endpoint - requires authentication
 *
 * @param slug - Thread slug
 * @param enabled - Optional control over whether to fetch (default: based on slug and auth)
 */
export function useThreadBySlugQuery(slug: string, enabled?: boolean) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    queryKey: queryKeys.threads.bySlug(slug),
    queryFn: () => getThreadBySlugService({ param: { slug } }),
    staleTime: STALE_TIMES.threadDetail, // 10 seconds
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!slug),
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to poll thread slug status during AI title generation
 * Protected endpoint - requires authentication
 *
 * Polls every 3 seconds to check if isAiGeneratedTitle flag is set.
 * Used during first round streaming on overview screen to enable URL replacement without page reload.
 *
 * @param threadId - Thread ID
 * @param enabled - Control whether polling should be active (default: true if threadId exists)
 */
export function useThreadSlugStatusQuery(
  threadId: string | null,
  enabled: boolean = true,
) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    queryKey: queryKeys.threads.slugStatus(threadId || 'null'),
    queryFn: () => {
      if (!threadId) {
        throw new Error('Thread ID is required');
      }
      return getThreadSlugStatusService({ param: { id: threadId } });
    },
    staleTime: 0, // Always fresh - we're polling for updates
    refetchInterval: isAuthenticated && enabled && threadId
      ? () => {
          if (typeof document !== 'undefined' && document.hidden) {
            return false;
          }
          return 10 * 1000;
        }
      : false,
    enabled: isAuthenticated && enabled && !!threadId,
    retry: false,
    throwOnError: false,
  });
}

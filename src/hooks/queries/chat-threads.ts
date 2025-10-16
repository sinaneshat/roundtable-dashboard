/**
 * Chat Threads Query Hooks
 *
 * TanStack Query hooks for chat thread operations
 * Following patterns from TanStack Query v5 infinite query documentation
 *
 * IMPORTANT: staleTime values MUST match server-side prefetch values
 * See: docs/react-query-ssr-patterns.md
 */

'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import {
  getPublicThreadService,
  getThreadAnalysesService,
  getThreadBySlugService,
  getThreadChangelogService,
  getThreadMessagesService,
  getThreadService,
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
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useInfiniteQuery({
    queryKey: [...queryKeys.threads.lists(search)],
    queryFn: async ({ pageParam }) => {
      // First page: 50 items for sidebar, 10 for search
      // Subsequent pages: 20 items for sidebar, 10 for search
      const limit = search ? 10 : (pageParam ? 20 : 50);

      const params: { cursor?: string; search?: string; limit: number } = { limit };
      if (pageParam)
        params.cursor = pageParam;
      if (search)
        params.search = search;

      return listThreadsService({ query: params });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.success ? lastPage.data?.pagination?.nextCursor : undefined,
    enabled: isAuthenticated,
    staleTime: STALE_TIMES.threads, // 30 seconds - match server-side prefetch
    retry: false,
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
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

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
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.threads.bySlug(slug),
    queryFn: () => getThreadBySlugService({ param: { slug } }),
    staleTime: STALE_TIMES.threadDetail, // 10 seconds
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!slug),
    retry: false,
  });
}

/**
 * Hook to fetch thread messages
 * Returns all messages for a thread ordered by creation time
 * Protected endpoint - requires authentication
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: based on threadId and auth)
 */
export function useThreadMessagesQuery(threadId: string, enabled?: boolean) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.threads.messages(threadId),
    queryFn: () => getThreadMessagesService({ param: { id: threadId } }),
    staleTime: STALE_TIMES.threadMessages, // 5 seconds
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    retry: false,
  });
}

/**
 * Hook to fetch thread configuration changelog
 * Returns configuration changes ordered by creation time (newest first)
 * Protected endpoint - requires authentication
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
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    retry: false,
  });
}

/**
 * Hook to fetch thread moderator analyses
 * Returns all moderator analyses ordered by round number
 * Protected endpoint - requires authentication
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: based on threadId and auth)
 */
export function useThreadAnalysesQuery(threadId: string, enabled?: boolean) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.threads.analyses(threadId),
    queryFn: () => getThreadAnalysesService({ param: { id: threadId } }),
    staleTime: STALE_TIMES.threadAnalyses, // 1 minute
    // ✅ Poll for analysis updates every 10 seconds
    // Stops polling automatically when analysis completes or query is disabled
    refetchInterval: 10000, // Poll every 10 seconds for pending/streaming analyses
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    retry: false,
  });
}

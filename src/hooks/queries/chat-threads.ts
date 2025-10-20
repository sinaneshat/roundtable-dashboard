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
    // ✅ FIX: Disable automatic refetching - changelog is invalidated by mutations
    // This prevents unnecessary API calls when changelog hasn't changed
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // ✅ CRITICAL FIX: Preserve previous data during refetches
    // This prevents changelog from disappearing when query is invalidated
    // Without this, changelog temporarily becomes empty array during refetch,
    // causing items to be removed from DOM and re-added at the bottom
    placeholderData: previousData => previousData,
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    retry: false,
  });
}

/**
 * Hook to fetch thread moderator analyses
 * Returns all moderator analyses ordered by round number
 * Protected endpoint - requires authentication
 *
 * ✅ OPTIMIZED POLLING: Minimal polling strategy for streaming analyses
 * - Primary mechanism: Real-time streaming via experimental_useObject hook
 * - Polling role: Only detect server-side completion of stuck/failed streams
 * - Pending analyses: No polling (useObject hook handles streaming)
 * - Streaming analyses: Slow polling (30s) only to detect abnormal completion
 * - Completed/failed analyses: No polling
 * - Stuck analyses (> 3 minutes): No polling (considered failed)
 *
 * This eliminates overlap between streaming and polling, allowing useObject
 * to properly render partial objects in real-time.
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
    staleTime: 5000, // 5 seconds - moderate staleness during streaming
    // ✅ MINIMAL POLLING: Only for detecting abnormal stream completion
    // useObject hook handles real-time streaming, so aggressive polling is unnecessary
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.success)
        return false;

      const THREE_MINUTES_MS = 3 * 60 * 1000;
      const now = Date.now();

      // Check if any analyses are streaming (not pending - those are handled by useObject)
      const hasActiveStreamingAnalysis = data.data.items.some((item) => {
        // Only poll for "streaming" status (server-side streaming)
        // Don't poll for "pending" - useObject hook will handle it
        if (item.status !== 'streaming')
          return false;

        // Check age - if older than 3 minutes, consider it stuck (don't poll for stuck analyses)
        const createdAt = new Date(item.createdAt).getTime();
        const ageMs = now - createdAt;

        return ageMs <= THREE_MINUTES_MS;
      });

      // ✅ SLOW POLLING: Only poll every 30 seconds for streaming analyses
      // This is only a safety net for detecting server-side completion
      // Real-time updates come from useObject hook's partialObjectStream
      return hasActiveStreamingAnalysis ? 30000 : false; // 30 seconds, or no polling
    },
    // ✅ CRITICAL FIX: Preserve previous data during refetches and polling
    // This prevents analyses from disappearing when query refetches
    // Without this, analyses temporarily become empty array during refetch,
    // causing items to be removed from DOM and re-added at the bottom
    placeholderData: previousData => previousData,
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    retry: false,
  });
}

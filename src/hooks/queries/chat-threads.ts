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
 * @param enabled - Optional control over whether to fetch (default: true when threadId exists)
 *
 * Stale time: 10 seconds (thread details should be fresh for active conversations)
 */
export function useThreadQuery(threadId: string | null | undefined, enabled = true) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.threads.detail(threadId || ''),
    queryFn: () => getThreadService(threadId!),
    staleTime: STALE_TIMES.threadDetail, // 10 seconds - match server-side prefetch
    enabled: isAuthenticated && !!threadId && enabled, // Only fetch when authenticated and threadId exists
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
 * @param enabled - Optional control over whether to fetch (default: true when slug exists)
 *
 * Stale time: 1 minute (public threads change less frequently)
 */
export function usePublicThreadQuery(slug: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.threads.public(slug || ''),
    queryFn: () => getPublicThreadService(slug!),
    staleTime: STALE_TIMES.publicThread, // 5 minutes - MUST match server-side prefetch!
    enabled: !!slug && enabled, // Only fetch when slug exists
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch a thread by slug for authenticated user
 * Returns thread details including all participants and messages
 * Protected endpoint - requires authentication and ownership
 *
 * @param slug - Thread slug
 * @param enabled - Optional control over whether to fetch (default: true when slug exists)
 *
 * Cache strategy:
 * - staleTime: 10 seconds (fresh enough for active conversations, prevents excessive refetching)
 * - gcTime: 5 minutes (keep for back/forward navigation)
 * - refetchOnWindowFocus: false (prevent flashing during navigation)
 * - refetchOnMount: false (rely on staleTime for refetch logic)
 */
export function useThreadBySlugQuery(slug: string | null | undefined, enabled = true) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.threads.bySlug(slug || ''),
    queryFn: () => getThreadBySlugService(slug!),
    staleTime: STALE_TIMES.threadDetail, // 10 seconds - prevents excessive refetching while staying fresh
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes for back/forward navigation
    refetchOnWindowFocus: false, // Don't refetch on window focus - prevents flashing during navigation
    refetchOnMount: false, // Don't refetch on component mount - rely on staleTime
    enabled: isAuthenticated && !!slug && enabled, // Only fetch when authenticated and slug exists
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch messages for a thread
 * Returns all messages ordered by creation time
 * Protected endpoint - requires authentication and ownership
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: true when threadId exists)
 *
 * Stale time: 10 seconds (messages should be fresh for active conversations)
 */
export function useThreadMessagesQuery(threadId: string | null | undefined, enabled = true) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.threads.messages(threadId || ''),
    queryFn: () => getThreadMessagesService(threadId!),
    staleTime: STALE_TIMES.messages, // 10 seconds - match server-side prefetch
    enabled: isAuthenticated && !!threadId && enabled, // Only fetch when authenticated and threadId exists
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch configuration changelog for a thread
 * Protected endpoint - requires authentication and ownership
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: true when threadId exists)
 *
 * Cache strategy:
 * - staleTime: 30 seconds (changelog updates less frequently than messages)
 * - refetchOnWindowFocus: false (prevent unnecessary refetches)
 * - refetchOnMount: false (rely on staleTime for refetch logic)
 */
export function useThreadChangelogQuery(threadId: string | null | undefined, enabled = true) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.threads.changelog(threadId || ''),
    queryFn: () => getThreadChangelogService(threadId!),
    staleTime: STALE_TIMES.changelog, // 30 seconds - match server-side prefetch
    refetchOnWindowFocus: false, // Don't refetch on window focus - prevents excessive network calls
    refetchOnMount: false, // Don't refetch on component mount - rely on staleTime
    enabled: isAuthenticated && !!threadId && enabled, // Only fetch when authenticated and threadId exists
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch moderator analyses for a thread
 * Protected endpoint - requires authentication and ownership
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: true when threadId exists)
 *
 * Cache strategy:
 * - Polls only when analyses are pending/streaming
 * - Stops polling when all analyses are completed or failed
 * - Refetches on window focus to pick up new analyses
 */
export function useThreadAnalysesQuery(
  threadId: string | null | undefined,
  enabled = true,
) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.threads.analyses(threadId || ''),
    queryFn: () => getThreadAnalysesService(threadId!),
    staleTime: STALE_TIMES.changelog, // 30 seconds - match changelog pattern
    // ✅ SMART POLLING: Only poll when analyses are in progress
    // Stops automatically when all analyses reach terminal state (completed/failed)
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || !('success' in data) || !data.success) {
        return false; // Stop polling on error
      }

      const analyses = data.data?.analyses || [];
      if (analyses.length === 0) {
        return 10000; // Keep polling if no analyses yet (backend might create one)
      }

      // Check if any analysis is still pending or streaming
      const hasInProgress = analyses.some(
        a => a.status === 'pending' || a.status === 'streaming',
      );

      return hasInProgress ? 10000 : false; // Poll every 10s if in progress, stop if all complete
    },
    refetchOnWindowFocus: true, // Refetch when user returns to check for new analyses
    refetchOnMount: true, // Fetch fresh data on mount
    enabled: isAuthenticated && !!threadId && enabled,
    retry: false,
    throwOnError: false,
  });
}

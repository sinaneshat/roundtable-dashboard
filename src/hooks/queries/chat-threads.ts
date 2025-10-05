/**
 * Chat Threads Query Hooks
 *
 * TanStack Query hooks for chat thread operations
 * Following patterns from TanStack Query v5 infinite query documentation
 */

'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import {
  getPublicThreadService,
  getThreadBySlugService,
  getThreadService,
  listThreadsService,
} from '@/services/api';

/**
 * Hook to fetch chat threads with cursor-based infinite scrolling
 * Uses TanStack Query useInfiniteQuery for seamless pagination
 * Protected endpoint - requires authentication
 *
 * Following AI SDK v5 and TanStack Query v5 official patterns:
 * - Cursor-based pagination for infinite scroll
 * - Automatic page management via data.pages
 * - Built-in hasNextPage and fetchNextPage
 *
 * @example
 * ```tsx
 * const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useThreadsQuery();
 *
 * // Render pages
 * data?.pages.map((page) =>
 *   page.data.items.map((thread) => <ThreadCard key={thread.id} thread={thread} />)
 * )
 *
 * // Load more button
 * <button onClick={() => fetchNextPage()} disabled={!hasNextPage}>
 *   {isFetchingNextPage ? 'Loading...' : 'Load More'}
 * </button>
 * ```
 *
 * Stale time: 30 seconds (thread list should be relatively fresh)
 */
export function useThreadsQuery() {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useInfiniteQuery({
    queryKey: queryKeys.threads.lists(),
    queryFn: ({ pageParam }) =>
      listThreadsService(
        pageParam ? { query: { cursor: pageParam } } : undefined,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      // Return nextCursor from pagination metadata, or undefined if no more pages
      if (lastPage.success && lastPage.data?.pagination?.nextCursor) {
        return lastPage.data.pagination.nextCursor;
      }
      return undefined;
    },
    staleTime: 30 * 1000, // 30 seconds
    retry: (failureCount, error) => {
      // Don't retry on authentication errors
      if (error instanceof Error && error.message.includes('Authentication')) {
        return false;
      }
      // Don't retry on client errors (4xx)
      const errorStatus = (error as { status?: number })?.status;
      if (errorStatus && errorStatus >= 400 && errorStatus < 500) {
        return false;
      }
      return failureCount < 2;
    },
    enabled: isAuthenticated, // Only fetch when authenticated
    throwOnError: false,
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
    staleTime: 10 * 1000, // 10 seconds
    enabled: isAuthenticated && !!threadId && enabled, // Only fetch when authenticated and threadId exists
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('Authentication')) {
        return false;
      }
      const errorStatus = (error as { status?: number })?.status;
      if (errorStatus && errorStatus >= 400 && errorStatus < 500) {
        return false;
      }
      return failureCount < 2;
    },
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
    staleTime: 1 * 60 * 1000, // 1 minute
    enabled: !!slug && enabled, // Only fetch when slug exists
    retry: (failureCount, error) => {
      const errorStatus = (error as { status?: number })?.status;
      if (errorStatus && errorStatus >= 400 && errorStatus < 500) {
        return false;
      }
      return failureCount < 2;
    },
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
 * Stale time: 10 seconds (thread details should be fresh for active conversations)
 */
export function useThreadBySlugQuery(slug: string | null | undefined, enabled = true) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.threads.bySlug(slug || ''),
    queryFn: () => getThreadBySlugService(slug!),
    staleTime: 10 * 1000, // 10 seconds
    enabled: isAuthenticated && !!slug && enabled, // Only fetch when authenticated and slug exists
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('Authentication')) {
        return false;
      }
      const errorStatus = (error as { status?: number })?.status;
      if (errorStatus && errorStatus >= 400 && errorStatus < 500) {
        return false;
      }
      return failureCount < 2;
    },
    throwOnError: false,
  });
}

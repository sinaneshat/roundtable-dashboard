/**
 * Thread CRUD Query Hooks
 *
 * TanStack Query hooks for chat thread CRUD operations (Create, Read, Update, Delete)
 * Following patterns from TanStack Query v5 infinite query documentation
 *
 * IMPORTANT: staleTime values MUST match server-side prefetch values
 * See: docs/react-query-ssr-patterns.md
 */

import type { InfiniteData } from '@tanstack/react-query';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { LIMITS } from '@/constants';
import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { threadBySlugQueryOptions } from '@/lib/data/query-options';
import { POLLING_INTERVALS, STALE_TIMES } from '@/lib/data/stale-times';
import type { ListThreadsResponse } from '@/services/api';
import {
  getPublicThreadService,
  getThreadService,
  getThreadSlugStatusService,
  listPublicThreadSlugsService,
  listThreadsService,
} from '@/services/api';

/**
 * Options for useThreadsQuery hook
 */
type UseThreadsQueryOptions = {
  /** Optional search query to filter threads by title */
  search?: string;
  /** Optional project ID to filter threads by project (excludes isFavorite from response) */
  projectId?: string;
  /** Optional control over whether to fetch */
  enabled?: boolean;
  /** Optional initial data for SSR hydration */
  initialData?: InfiniteData<ListThreadsResponse, string | undefined>;
};

/**
 * Hook to fetch chat threads with cursor-based infinite scrolling
 * Following TanStack Query v5 official patterns
 *
 * Initial page loads 50 items, subsequent pages load 20 items
 * Search queries load 10 items per page
 *
 * When projectId is provided, threads are filtered by project and isFavorite is excluded.
 *
 * @param options - Query options (search, projectId, enabled)
 */
export function useThreadsQuery(options?: UseThreadsQueryOptions) {
  const { isAuthenticated } = useAuthCheck();
  const { enabled: explicitEnabled, initialData, projectId, search } = options ?? {};

  return useInfiniteQuery({
    enabled: explicitEnabled !== undefined ? explicitEnabled : isAuthenticated,
    queryFn: async ({ pageParam }) => {
      // ✅ Use centralized limits - clean semantic names
      const limit = search
        ? LIMITS.SEARCH_RESULTS // 10 for search results
        : pageParam
          ? LIMITS.STANDARD_PAGE // 20 for subsequent pages
          : LIMITS.INITIAL_PAGE; // 50 for initial sidebar load

      return listThreadsService({
        query: {
          limit,
          ...(pageParam && { cursor: pageParam }),
          ...(search && { search }),
          ...(projectId && { projectId }),
        },
      });
    },
    initialData,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.success) {
        return undefined;
      }
      return lastPage.data.pagination.nextCursor;
    },
    // ✅ QUERY KEY: Include all dependencies for proper cache separation
    // Format: ['threads', 'list', search?, { projectId }?]
    queryKey: ['threads', 'list', { projectId, search }] as const,
    retry: false,
    staleTime: initialData ? 10_000 : STALE_TIMES.threads, // 30 seconds - match server-side prefetch
    throwOnError: false,
  });
}

/**
 * Hook to fetch a specific thread by ID with participants and messages
 * Returns thread details including all participants and messages
 * Protected endpoint - requires authentication
 *
 * CACHING STRATEGY:
 * - staleTime: 5 minutes for thread metadata (stable after creation)
 * - gcTime: 10 minutes to keep data for back navigation
 * - Streaming updates are handled by Zustand store (ONE-WAY DATA FLOW)
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: based on threadId and auth)
 */
export function useThreadQuery(threadId: string, enabled?: boolean) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    gcTime: 10 * 60 * 1000, // 10 minutes - keep for back navigation
    queryFn: () => getThreadService({ param: { id: threadId } }),
    queryKey: queryKeys.threads.detail(threadId),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: STALE_TIMES.threadMetadata, // 5 minutes - thread metadata is stable
    throwOnError: false,
  });
}

/**
 * Hook to fetch a public thread by slug (no authentication required)
 * Returns thread details for publicly shared threads
 * Public endpoint - no authentication required
 *
 * @param slug - Thread slug
 * @param options - Query options
 * @param options.initialData - Initial data from SSR loader
 * @param options.staleTime - Override stale time in ms
 * @param options.enabled - Enable/disable the query
 */
export function usePublicThreadQuery(
  slug: string,
  options?: {
    initialData?: Awaited<ReturnType<typeof getPublicThreadService>>;
    staleTime?: number;
    enabled?: boolean;
  },
) {
  return useQuery({
    enabled: options?.enabled !== undefined ? options.enabled : !!slug,
    initialData: options?.initialData,
    queryFn: () => getPublicThreadService({ param: { slug } }),
    queryKey: queryKeys.threads.public(slug),
    retry: false,
    staleTime: options?.staleTime ?? STALE_TIMES.publicThreadDetail, // 1 minute - match server-side prefetch
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
    enabled: enabled !== undefined ? enabled : true,
    queryFn: () => listPublicThreadSlugsService(),
    queryKey: queryKeys.threads.publicSlugs(),
    retry: false,
    staleTime: STALE_TIMES.publicThreadSlugs, // 24 hours - matches ISR cache
    throwOnError: false,
  });
}

/**
 * Hook to fetch a thread by slug for authenticated user
 * Protected endpoint - requires authentication
 *
 * IMPORTANT: Uses shared threadBySlugQueryOptions for SSR/client cache consistency.
 * This ensures the same queryFn (server function) is used for both prefetch and client query,
 * preventing hydration mismatches and duplicate fetches.
 *
 * @param slug - Thread slug
 * @param enabled - Optional control over whether to fetch (default: based on slug and auth)
 */
export function useThreadBySlugQuery(slug: string, enabled?: boolean) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    ...threadBySlugQueryOptions(slug),
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!slug),
    throwOnError: false,
  });
}

/**
 * Hook to poll thread slug status during AI title generation
 * Protected endpoint - requires authentication
 *
 * Polls every 2 seconds to check if isAiGeneratedTitle flag is set.
 * Used during first round streaming on overview screen to enable URL replacement without page reload.
 *
 * @param threadId - Thread ID
 * @param shouldPoll - Control whether polling should be active (passed to refetchInterval)
 */
export function useThreadSlugStatusQuery(
  threadId: string | null,
  shouldPoll = true,
) {
  const { isAuthenticated } = useAuthCheck();
  // Keep query enabled as long as we have a valid threadId - polling controlled by refetchInterval
  const queryEnabled = isAuthenticated && !!threadId;

  return useQuery({
    enabled: queryEnabled,
    queryFn: async () => {
      if (!threadId) {
        throw new Error('Thread ID is required');
      }
      return getThreadSlugStatusService({ param: { id: threadId } });
    },
    queryKey: queryKeys.threads.slugStatus(threadId || 'null'),
    // Polling control via refetchInterval (not enabled) to prevent interruption
    // The shouldPoll param checked here instead of enabled prop ensures continuous polling
    refetchInterval: (query) => {
      // Stop polling if shouldPoll is false (external control)
      if (!shouldPoll) {
        return false;
      }
      // Stop polling once AI title is generated
      const data = query.state.data;
      if (data?.success && data.data?.isAiGeneratedTitle) {
        return false;
      }
      return POLLING_INTERVALS.slugStatus;
    },
    // Let TanStack Query handle background tab pausing natively
    refetchIntervalInBackground: false,
    retry: false,
    // ✅ FIX: Add staleTime to prevent immediate duplicate requests during polling
    // When polling is active, use polling interval as staleTime to dedupe requests
    staleTime: shouldPoll ? POLLING_INTERVALS.slugStatus : 0,
    throwOnError: false,
  });
}

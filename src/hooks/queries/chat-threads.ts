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
 * ✅ AI SDK v5 PATTERN: Fetch completed analyses from database
 * - Used on page refresh to load persisted analyses
 * - Real-time streaming handled by experimental_useObject in ModeratorAnalysisStream component
 * - SMART POLLING: Only polls for truly orphaned analyses (prevents overlap with active streaming)
 * - Query invalidated when analysis completes (via onFinish callback)
 * - Query invalidated when round completes to fetch newly created pending analyses
 *
 * ⚠️ CRITICAL POLLING STRATEGY (Prevents Overlap):
 * - status='pending' → ModeratorAnalysisStream handles via experimental_useObject (NO POLLING)
 * - status='streaming' + age < 2min → Active streaming in progress (NO POLLING - prevents overlap!)
 * - status='streaming' + age > 2min → Orphaned from page refresh (POLL every 10s to check completion)
 * - status='completed'/'failed' → No polling needed
 *
 * This ensures the query polling NEVER interferes with active experimental_useObject streaming,
 * while still detecting and completing orphaned analyses after page refresh.
 *
 * Pattern: Fetch persisted data, stream new data via experimental_useObject, poll for orphaned analyses
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-core/stream-object
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: based on threadId and auth)
 */
export function useThreadAnalysesQuery(threadId: string, enabled?: boolean) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  // ✅ SMART POLLING STRATEGY: Detect orphaned and stuck analyses quickly
  // Orphaned = analyses that got stuck due to page refresh or connection issues
  // This handles the case where user refreshes page while analysis is being generated
  const query = useQuery({
    queryKey: queryKeys.threads.analyses(threadId),
    queryFn: () => getThreadAnalysesService({ param: { id: threadId } }),
    staleTime: STALE_TIMES.threadAnalyses, // 30 seconds - match server-side prefetch
    // ✅ SMART POLLING: Check for orphaned/stuck analyses frequently
    // CRITICAL: Poll for BOTH 'pending' and 'streaming' analyses that are old
    // - 'pending' + fresh → ModeratorAnalysisStream will trigger (DON'T poll yet)
    // - 'pending' + old (> 30s) → Likely stuck, need to check (DO poll)
    // - 'streaming' + recent (< 30s) → Likely active streaming (poll to detect completion)
    // - 'streaming' + old (> 30s) → Orphaned from page refresh (DO poll to check completion)
    refetchInterval: (query) => {
      const data = query.state.data as Awaited<ReturnType<typeof getThreadAnalysesService>> | undefined;

      if (!data?.success)
        return false;

      const now = Date.now();
      const THIRTY_SECONDS = 30 * 1000;

      // ✅ FIX: Check for ANY incomplete analyses (pending or streaming)
      // This catches both orphaned analyses AND recently completed ones
      const hasIncompleteAnalyses = data.data.items?.some((analysis) => {
        // Check both pending and streaming status
        if (analysis.status !== 'pending' && analysis.status !== 'streaming')
          return false;

        const createdAt = new Date(analysis.createdAt).getTime();
        const ageMs = now - createdAt;

        // ✅ AGGRESSIVE POLLING: Poll for any incomplete analysis older than 30 seconds
        // This quickly detects stuck analyses from page refreshes
        // For fresh analyses (< 30s), ModeratorAnalysisStream handles via experimental_useObject
        const isStuckOrOrphaned = ageMs > THIRTY_SECONDS;

        if (isStuckOrOrphaned) {
          console.warn('[useThreadAnalysesQuery] 🔍 Detected stuck/orphaned analysis', {
            analysisId: analysis.id,
            status: analysis.status,
            ageMs,
            roundNumber: analysis.roundNumber,
          });
        }

        return isStuckOrOrphaned;
      });

      // Poll every 5 seconds for stuck/orphaned analyses
      // Faster polling ensures quicker detection and recovery
      return hasIncompleteAnalyses ? 5000 : false;
    },
    // ✅ CRITICAL FIX: Fetch on mount to check for orphaned analyses after page refresh
    // This ensures we detect analyses that were in progress before refresh
    refetchOnMount: true,
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: false, // Don't refetch on reconnect
    // ✅ CRITICAL FIX: Preserve previous data during refetches
    // This prevents analyses from disappearing when query refetches
    placeholderData: previousData => previousData,
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    retry: false,
  });

  return query;
}

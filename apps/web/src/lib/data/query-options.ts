/**
 * Shared Query Options
 *
 * CRITICAL: These options ensure SSR hydration works correctly.
 * Using the SAME queryOptions for both server prefetch and client useQuery
 * prevents the "content flash" where SSR content disappears into loading state.
 *
 * Pattern from TanStack Start docs:
 * - Server functions work on both server (runs directly) and client (makes RPC call)
 * - Use ensureQueryData/ensureInfiniteQueryData in route loaders
 * - Use the same queryOptions in hooks with useQuery/useInfiniteQuery
 *
 * @see https://tanstack.com/start/latest/docs/framework/react/comparison
 */

import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';

import { getModels } from '@/server/models';
import { getProducts } from '@/server/products';
import { getSidebarThreads } from '@/server/sidebar-threads';
import { getSubscriptions } from '@/server/subscriptions';
import { getThreadBySlug, getThreadChangelog, getThreadFeedback } from '@/server/thread';
import { getUsageStats } from '@/server/usage-stats';

import { queryKeys } from './query-keys';
import { GC_TIMES, STALE_TIMES } from './stale-times';

/**
 * Models query options
 *
 * Used by:
 * - _protected.tsx loader (ensureQueryData)
 * - useModelsQuery hook (useQuery)
 *
 * Server function getModels() works both server-side and client-side:
 * - Server: Runs directly, forwards cookies
 * - Client: Makes RPC call to server function
 */
export const modelsQueryOptions = queryOptions({
  queryKey: queryKeys.models.list(),
  queryFn: () => getModels(),
  staleTime: STALE_TIMES.models, // Infinity - never auto-refetch
  gcTime: GC_TIMES.INFINITE, // Infinity - keep in cache forever (matches staleTime)
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  retry: 2,
});

/**
 * Products query options
 *
 * Used by:
 * - pricing.tsx loader (prefetchQuery)
 * - useProductsQuery hook (useQuery)
 *
 * Server function getProducts() works both server-side and client-side:
 * - Server: Runs directly
 * - Client: Makes RPC call to server function
 */
export const productsQueryOptions = queryOptions({
  queryKey: queryKeys.products.list(),
  queryFn: () => getProducts(),
  staleTime: STALE_TIMES.products,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  retry: 1,
});

/**
 * Subscriptions query options
 *
 * Used by:
 * - _protected.tsx loader (ensureQueryData)
 * - pricing.tsx loader (prefetchQuery)
 * - useSubscriptionQuery hook (useQuery)
 *
 * IMPORTANT: Uses STALE_TIMES.subscriptions for SSR/client consistency.
 * Manual invalidation handles subscription state changes after plan updates.
 */
export const subscriptionsQueryOptions = queryOptions({
  queryKey: queryKeys.subscriptions.current(),
  queryFn: () => getSubscriptions(),
  staleTime: STALE_TIMES.subscriptions, // Use centralized stale time for consistency
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  retry: 1,
});

/**
 * Usage stats query options
 *
 * Used by:
 * - _protected.tsx loader (ensureQueryData)
 * - useUsageStatsQuery hook (useQuery)
 *
 * IMPORTANT: staleTime is set to 30s for hydration to work.
 * Usage is invalidated after chat operations, so stale data is acceptable.
 */
export const usageQueryOptions = queryOptions({
  queryKey: queryKeys.usage.stats(),
  queryFn: () => getUsageStats(),
  staleTime: STALE_TIMES.threadsSidebar, // 30s - prevent immediate refetch on hydration
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  retry: 1,
});

/**
 * Sidebar threads infinite query options
 *
 * Used by:
 * - _protected.tsx loader (ensureInfiniteQueryData)
 * - useSidebarThreadsQuery hook (useInfiniteQuery)
 *
 * Returns first page of threads for SSR, client can fetch more pages.
 * Throws on error to satisfy TanStack Query's type requirements.
 */
export const sidebarThreadsQueryOptions = infiniteQueryOptions({
  queryKey: queryKeys.threads.sidebar(),
  queryFn: async () => {
    const result = await getSidebarThreads();
    if (!result.success) {
      throw new Error('Failed to fetch sidebar threads');
    }
    return result;
  },
  initialPageParam: undefined as string | undefined,
  getNextPageParam: lastPage => lastPage.data?.pagination?.nextCursor,
  staleTime: STALE_TIMES.threadsSidebar,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
});

/**
 * Thread by slug query options factory
 *
 * Used by:
 * - _protected/chat/$slug.tsx loader (ensureQueryData)
 * - useThreadBySlugQuery hook (useQuery)
 *
 * Server function getThreadBySlug() works both server-side and client-side:
 * - Server: Runs directly, forwards cookies
 * - Client: Makes RPC call to server function
 *
 * IMPORTANT: Using server function ensures consistent behavior between
 * SSR prefetch and client-side hydration. Direct API calls can cause
 * hydration mismatches due to different cookie handling.
 */
export function threadBySlugQueryOptions(slug: string) {
  return queryOptions({
    queryKey: queryKeys.threads.bySlug(slug),
    queryFn: () => getThreadBySlug({ data: slug }),
    staleTime: STALE_TIMES.threadDetail,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });
}

/**
 * Thread changelog query options factory
 *
 * Used by:
 * - _protected/chat/$slug.tsx loader (ensureQueryData)
 * - useThreadChangelogQuery hook (useQuery)
 *
 * Server function getThreadChangelog() works both server-side and client-side:
 * - Server: Runs directly, forwards cookies
 * - Client: Makes RPC call to server function
 *
 * IMPORTANT: staleTime is Infinity - changelog uses ONE-WAY DATA FLOW pattern.
 * Updates come from mutations, not polling/refetching.
 */
export function threadChangelogQueryOptions(threadId: string) {
  return queryOptions({
    queryKey: queryKeys.threads.changelog(threadId),
    queryFn: () => getThreadChangelog({ data: threadId }),
    staleTime: STALE_TIMES.threadChangelog, // Infinity
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });
}

/**
 * Thread feedback query options factory
 *
 * Used by:
 * - _protected/chat/$slug.tsx loader (ensureQueryData)
 * - useThreadFeedbackQuery hook (useQuery)
 *
 * Server function getThreadFeedback() works both server-side and client-side:
 * - Server: Runs directly, forwards cookies
 * - Client: Makes RPC call to server function
 *
 * IMPORTANT: staleTime is Infinity - feedback is invalidated only on mutation.
 */
export function threadFeedbackQueryOptions(threadId: string) {
  return queryOptions({
    queryKey: queryKeys.threads.feedback(threadId),
    queryFn: () => getThreadFeedback({ data: threadId }),
    staleTime: STALE_TIMES.threadFeedback, // Infinity
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });
}

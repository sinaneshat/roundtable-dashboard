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
import { getSidebarThreads } from '@/server/sidebar-threads';
import { getSubscriptions } from '@/server/subscriptions';
import { getUsageStats } from '@/server/usage-stats';

import { queryKeys } from './query-keys';
import { STALE_TIMES } from './stale-times';

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
  staleTime: STALE_TIMES.models,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  retry: 2,
});

/**
 * Subscriptions query options
 *
 * Used by:
 * - _protected.tsx loader (ensureQueryData)
 * - useSubscriptionQuery hook (useQuery)
 *
 * IMPORTANT: staleTime is set to 60s for hydration to work.
 * Without this, data is immediately stale and triggers refetch.
 * Manual invalidation handles subscription state changes.
 */
export const subscriptionsQueryOptions = queryOptions({
  queryKey: queryKeys.subscriptions.current(),
  queryFn: () => getSubscriptions(),
  staleTime: 60 * 1000, // 1 minute - prevent immediate refetch on hydration
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
  staleTime: 30 * 1000, // 30 seconds - prevent immediate refetch on hydration
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

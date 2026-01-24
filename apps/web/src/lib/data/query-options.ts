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

import { getAdminJobs } from '@/server/admin-jobs';
import { getModels } from '@/server/models';
import { getProducts } from '@/server/products';
import { getProjectAttachments, getProjectById, getProjectMemories } from '@/server/project';
import { getSidebarProjects } from '@/server/sidebar-projects';
import { getSidebarThreads } from '@/server/sidebar-threads';
import { getSubscriptions } from '@/server/subscriptions';
import { getStreamResumptionState, getThreadBySlug, getThreadChangelog, getThreadFeedback, getThreadPreSearches, getThreadsByProject } from '@/server/thread';
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
 * Sidebar projects infinite query options
 *
 * Used by:
 * - _protected.tsx loader (ensureInfiniteQueryData)
 * - useSidebarProjectsQuery hook (useInfiniteQuery)
 *
 * Returns first page of projects for SSR, client can fetch more pages.
 * Throws on error to satisfy TanStack Query's type requirements.
 */
export const sidebarProjectsQueryOptions = infiniteQueryOptions({
  queryKey: queryKeys.projects.sidebar(),
  queryFn: async () => {
    const result = await getSidebarProjects();
    if (!result.success) {
      throw new Error('Failed to fetch sidebar projects');
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

/**
 * Stream resumption state query options factory
 *
 * Used by:
 * - _protected/chat/$slug.tsx loader (ensureQueryData)
 *
 * Provides SSR hydration for stream resumption state, enabling:
 * - Proper dehydration/hydration of stream state
 * - Prefetching on link hover (defaultPreload: 'intent')
 * - Cache reuse on back navigation
 *
 * staleTime: 0 - Always refetch to get latest stream state
 * gcTime: SHORT - Stream state is ephemeral, cleared after use
 */
export function streamResumptionQueryOptions(threadId: string) {
  return queryOptions({
    queryKey: queryKeys.threads.streamResumption(threadId),
    queryFn: () => getStreamResumptionState({ data: threadId }),
    staleTime: 0, // Always fetch fresh - stream state changes
    gcTime: GC_TIMES.SHORT, // 1 min - ephemeral data
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });
}

/**
 * Thread pre-searches query options factory
 *
 * Used by:
 * - _protected/chat/$slug.tsx loader (ensureQueryData)
 * - useThreadPreSearchesQuery hook (useQuery)
 *
 * Server function getThreadPreSearches() works both server-side and client-side:
 * - Server: Runs directly, forwards cookies
 * - Client: Makes RPC call to server function
 *
 * IMPORTANT: staleTime is Infinity - pre-searches use ONE-WAY DATA FLOW pattern.
 * Updates come from streaming, not polling/refetching.
 */
export function threadPreSearchesQueryOptions(threadId: string) {
  return queryOptions({
    queryKey: queryKeys.threads.preSearches(threadId),
    queryFn: () => getThreadPreSearches({ data: threadId }),
    staleTime: STALE_TIMES.preSearch, // Infinity
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });
}

/**
 * Project query options factory
 *
 * Used by:
 * - _protected/chat/projects/$projectId.tsx loader (ensureQueryData)
 * - useProjectQuery hook (useQuery)
 *
 * Server function getProjectById() works both server-side and client-side:
 * - Server: Runs directly, forwards cookies
 * - Client: Makes RPC call to server function
 */
export function projectQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: () => getProjectById({ data: projectId }),
    staleTime: STALE_TIMES.threadDetail, // 10s
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });
}

/**
 * Project attachments infinite query options factory
 *
 * Used by:
 * - _protected/chat/projects/$projectId.tsx loader (ensureInfiniteQueryData)
 * - useProjectAttachmentsQuery hook (useInfiniteQuery)
 *
 * Server function getProjectAttachments() works both server-side and client-side:
 * - Server: Runs directly, forwards cookies
 * - Client: Makes RPC call to server function
 */
export function projectAttachmentsQueryOptions(projectId: string) {
  return infiniteQueryOptions({
    queryKey: queryKeys.projects.attachments(projectId),
    queryFn: async () => {
      const result = await getProjectAttachments({ data: projectId });
      if (!result.success) {
        throw new Error('Failed to fetch project attachments');
      }
      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.data?.pagination?.nextCursor,
    staleTime: STALE_TIMES.threadDetail,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/**
 * Project memories infinite query options factory
 *
 * Used by:
 * - _protected/chat/projects/$projectId.tsx loader (ensureInfiniteQueryData)
 * - useProjectMemoriesQuery hook (useInfiniteQuery)
 *
 * Server function getProjectMemories() works both server-side and client-side:
 * - Server: Runs directly, forwards cookies
 * - Client: Makes RPC call to server function
 */
export function projectMemoriesQueryOptions(projectId: string) {
  return infiniteQueryOptions({
    queryKey: queryKeys.projects.memories(projectId),
    queryFn: async () => {
      const result = await getProjectMemories({ data: projectId });
      if (!result.success) {
        throw new Error('Failed to fetch project memories');
      }
      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.data?.pagination?.nextCursor,
    staleTime: STALE_TIMES.threadDetail,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/**
 * Project threads infinite query options factory
 *
 * Uses unified /chat/threads?projectId=X endpoint for consistent thread behavior.
 *
 * Used by:
 * - _protected/chat/projects/$projectId.tsx loader (ensureInfiniteQueryData)
 * - useProjectThreadsQuery hook (via useThreadsQuery)
 *
 * Server function getThreadsByProject() works both server-side and client-side:
 * - Server: Runs directly, forwards cookies
 * - Client: Makes RPC call to server function
 */
export function projectThreadsQueryOptions(projectId: string) {
  return infiniteQueryOptions({
    // Use unified query key pattern: ['threads', 'list', 'project', projectId]
    queryKey: [...queryKeys.threads.lists(), 'project', projectId] as const,
    queryFn: async () => {
      const result = await getThreadsByProject({ data: projectId });
      if (!result.success) {
        throw new Error('Failed to fetch project threads');
      }
      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.data?.pagination?.nextCursor,
    staleTime: STALE_TIMES.threads, // 1 minute - match useThreadsQuery
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/**
 * Admin jobs query options
 *
 * Used by:
 * - _protected/admin/jobs/index.tsx loader (ensureQueryData)
 * - useAdminJobsQuery hook (useQuery)
 *
 * Server function getAdminJobs() works both server-side and client-side:
 * - Server: Runs directly, forwards cookies
 * - Client: Makes RPC call to server function
 */
export const adminJobsQueryOptions = queryOptions({
  queryKey: queryKeys.adminJobs.list(),
  queryFn: () => getAdminJobs(),
  staleTime: STALE_TIMES.adminJobs, // 5s - poll frequently for running jobs
  gcTime: GC_TIMES.SHORT, // 1 min - admin data doesn't need long cache
  refetchOnWindowFocus: true,
  refetchOnMount: true,
  retry: false,
});

/**
 * Admin jobs infinite query options
 *
 * Used by:
 * - _protected/admin/jobs/index.tsx loader (ensureInfiniteQueryData)
 * - useAdminJobsInfiniteQuery hook (useInfiniteQuery)
 *
 * Note: Backend currently returns all jobs. Pagination structure is ready
 * for when the backend supports cursor-based pagination.
 */
export const adminJobsInfiniteQueryOptions = infiniteQueryOptions({
  queryKey: queryKeys.adminJobs.lists(),
  queryFn: async () => {
    const result = await getAdminJobs();
    if (!result.success) {
      throw new Error('Failed to fetch admin jobs');
    }
    return result;
  },
  initialPageParam: undefined as string | undefined,
  getNextPageParam: lastPage => lastPage.data?.nextCursor ?? undefined,
  staleTime: STALE_TIMES.adminJobs,
  gcTime: GC_TIMES.SHORT,
  refetchOnWindowFocus: true,
  refetchOnMount: true,
});

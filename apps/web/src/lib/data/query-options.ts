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
import { getThreadBySlug, getThreadChangelog, getThreadPreSearches, getThreadsByProject } from '@/server/thread';
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
  gcTime: GC_TIMES.INFINITE, // Infinity - keep in cache forever (matches staleTime)
  queryFn: () => getModels(),
  queryKey: queryKeys.models.list(),
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  retry: 2,
  staleTime: STALE_TIMES.models, // Infinity - never auto-refetch
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
  queryFn: () => getProducts(),
  queryKey: queryKeys.products.list(),
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  retry: 1,
  staleTime: STALE_TIMES.products,
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
  queryFn: () => getSubscriptions(),
  queryKey: queryKeys.subscriptions.current(),
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  retry: 1,
  staleTime: STALE_TIMES.subscriptions, // Use centralized stale time for consistency
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
  queryFn: () => getUsageStats(),
  queryKey: queryKeys.usage.stats(),
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  retry: 1,
  staleTime: STALE_TIMES.threadsSidebar, // 30s - prevent immediate refetch on hydration
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
  queryFn: async () => {
    const result = await getSidebarThreads();
    if (!result.success) {
      throw new Error('Failed to fetch sidebar threads');
    }
    return result;
  },
  initialPageParam: undefined as string | undefined,
  getNextPageParam: lastPage => lastPage.data?.pagination?.nextCursor,
  queryKey: queryKeys.threads.sidebar(),
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  staleTime: STALE_TIMES.threadsSidebar,
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
  queryFn: async () => {
    const result = await getSidebarProjects();
    if (!result.success) {
      throw new Error('Failed to fetch sidebar projects');
    }
    return result;
  },
  initialPageParam: undefined as string | undefined,
  getNextPageParam: lastPage => lastPage.data?.pagination?.nextCursor,
  queryKey: queryKeys.projects.sidebar(),
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  staleTime: STALE_TIMES.threadsSidebar,
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
 *
 * CACHING STRATEGY:
 * - staleTime: 5 minutes for thread metadata (title, slug, participants are stable)
 * - gcTime: 10 minutes to keep data in cache for back navigation
 * - Streaming updates are handled by Zustand store (ONE-WAY DATA FLOW)
 * - Route components may override staleTime based on streaming state
 */
export function threadBySlugQueryOptions(slug: string) {
  return queryOptions({
    gcTime: GC_TIMES.LONG, // 10 minutes - keep data for back navigation
    queryFn: () => getThreadBySlug({ data: slug }),
    queryKey: queryKeys.threads.bySlug(slug),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: STALE_TIMES.threadMetadata, // 5 minutes - thread metadata is stable
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
    queryFn: () => getThreadChangelog({ data: threadId }),
    queryKey: queryKeys.threads.changelog(threadId),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: STALE_TIMES.threadChangelog, // Infinity
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
    queryFn: () => getThreadPreSearches({ data: threadId }),
    queryKey: queryKeys.threads.preSearches(threadId),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: STALE_TIMES.preSearch, // Infinity
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
    queryFn: () => getProjectById({ data: projectId }),
    queryKey: queryKeys.projects.detail(projectId),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: STALE_TIMES.threadDetail, // 10s
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
    queryFn: async () => {
      const result = await getProjectAttachments({ data: projectId });
      if (!result.success) {
        throw new Error('Failed to fetch project attachments');
      }
      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.data?.pagination?.nextCursor,
    queryKey: queryKeys.projects.attachments(projectId),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: STALE_TIMES.threadDetail,
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
    queryFn: async () => {
      const result = await getProjectMemories({ data: projectId });
      if (!result.success) {
        throw new Error('Failed to fetch project memories');
      }
      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.data?.pagination?.nextCursor,
    queryKey: queryKeys.projects.memories(projectId),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: STALE_TIMES.threadDetail,
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
    queryFn: async () => {
      const result = await getThreadsByProject({ data: projectId });
      if (!result.success) {
        throw new Error('Failed to fetch project threads');
      }
      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.data?.pagination?.nextCursor,
    // Use canonical key from queryKeys.projects.threads() for consistent invalidation
    queryKey: queryKeys.projects.threads(projectId),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: STALE_TIMES.threads, // 1 minute - match useThreadsQuery
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
  gcTime: GC_TIMES.SHORT, // 1 min - admin data doesn't need long cache
  queryFn: () => getAdminJobs(),
  queryKey: queryKeys.adminJobs.list(),
  refetchOnMount: true,
  refetchOnWindowFocus: true,
  retry: false,
  staleTime: STALE_TIMES.adminJobs, // 5s - poll frequently for running jobs
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
  gcTime: GC_TIMES.SHORT,
  queryFn: async () => {
    const result = await getAdminJobs();
    if (!result.success) {
      throw new Error('Failed to fetch admin jobs');
    }
    return result;
  },
  initialPageParam: undefined as string | undefined,
  getNextPageParam: lastPage => lastPage.data?.nextCursor ?? undefined,
  queryKey: queryKeys.adminJobs.lists(),
  refetchOnMount: true,
  refetchOnWindowFocus: true,
  staleTime: STALE_TIMES.adminJobs,
});

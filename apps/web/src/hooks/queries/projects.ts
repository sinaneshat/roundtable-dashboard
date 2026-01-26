/**
 * Project Query Hooks
 *
 * TanStack Query hooks for project operations
 * Following patterns from subscriptions.ts and chat/threads.ts
 *
 * Updated to use new attachment-based pattern (S3/R2 best practice)
 */

import type { ProjectIndexStatus, ProjectMemorySource } from '@roundtable/shared';
import type { InfiniteData } from '@tanstack/react-query';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { LIMITS } from '@/constants';
import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { projectQueryOptions, sidebarProjectsQueryOptions } from '@/lib/data/query-options';
import { GC_TIMES, STALE_TIMES } from '@/lib/data/stale-times';
import { getSidebarProjects } from '@/server/sidebar-projects';
import type {
  ListProjectAttachmentsQuery,
  ListProjectAttachmentsResponse,
  ListProjectMemoriesQuery,
  ListProjectMemoriesResponse,
  ListThreadsResponse,
} from '@/services/api';
import {
  getProjectContextService,
  getProjectLimitsService,
  listProjectAttachmentsService,
  listProjectMemoriesService,
  listProjectsService,
} from '@/services/api';

import { useThreadsQuery } from './chat/threads';

/**
 * Hook to fetch projects with cursor-based infinite scrolling
 * Following TanStack Query v5 official patterns
 *
 * Initial page loads 50 items, subsequent pages load 20 items
 * Search queries load 10 items per page
 *
 * @param search - Optional search query to filter projects by name
 */
export function useProjectsQuery(search?: string) {
  const { isAuthenticated } = useAuthCheck();
  const isSearchQuery = Boolean(search);

  return useInfiniteQuery({
    // Only gate search queries - non-search are SSR prefetched
    enabled: isSearchQuery ? isAuthenticated : undefined,
    gcTime: GC_TIMES.STANDARD, // 5 minutes
    queryFn: async ({ pageParam }) => {
      // ✅ Use centralized limits - clean semantic names
      const limit = search
        ? LIMITS.SEARCH_RESULTS // 10 for search results
        : pageParam
          ? LIMITS.STANDARD_PAGE // 20 for subsequent pages
          : LIMITS.INITIAL_PAGE; // 50 for initial sidebar load

      const params: { cursor?: string; search?: string; limit: number } = { limit };
      if (pageParam) {
        params.cursor = pageParam;
      }
      if (search) {
        params.search = search;
      }

      return listProjectsService({ query: params });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.success) {
        return undefined;
      }
      return lastPage.data.pagination.nextCursor;
    },
    queryKey: queryKeys.projects.lists(search),
    retry: false,
    staleTime: STALE_TIMES.threads, // 30 seconds - match threads pattern
    throwOnError: false,
  });
}

/**
 * Hook to fetch sidebar projects with SSR support
 * Uses server function for initial data, API service for pagination
 *
 * This hook matches the pattern of useSidebarThreadsQuery:
 * - Initial page: Uses server function (SSR hydration)
 * - Subsequent pages: Uses API service directly
 */
export function useSidebarProjectsQuery() {
  return useInfiniteQuery({
    ...sidebarProjectsQueryOptions,
    queryFn: async ({ pageParam }) => {
      if (pageParam) {
        // Subsequent pages - use API directly
        const result = await listProjectsService({
          query: { cursor: pageParam, limit: LIMITS.STANDARD_PAGE },
        });
        if (!result.success) {
          throw new Error('Failed to fetch sidebar projects');
        }
        return result;
      }
      // Initial page - use server function (SSR hydration)
      const result = await getSidebarProjects();
      if (!result.success) {
        throw new Error('Failed to fetch sidebar projects');
      }
      return result;
    },
    // NO enabled gate - SSR prefetched on protected route (matches useSidebarThreadsQuery)
    retry: false,
    throwOnError: false,
  });
}

type UseProjectQueryOptions = {
  enabled?: boolean;
  initialData?: { success: true; data: NonNullable<import('@/services/api').GetProjectResponse['data']> };
};

/**
 * Hook to fetch a specific project by ID with attachment and thread counts
 * Returns project details including attachmentCount and threadCount
 * Protected endpoint - requires authentication
 *
 * Uses projectQueryOptions factory for SSR consistency with loader
 *
 * @param projectId - Project ID
 * @param options - Optional query options (enabled, initialData)
 */
export function useProjectQuery(projectId: string, options?: UseProjectQueryOptions | boolean) {
  const { isAuthenticated } = useAuthCheck();

  // Support both old signature (boolean enabled) and new options object
  const opts = typeof options === 'boolean' ? { enabled: options } : (options ?? {});
  const { enabled, initialData } = opts;

  return useQuery({
    ...projectQueryOptions(projectId),
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!projectId),
    initialData,
    staleTime: initialData ? 10_000 : projectQueryOptions(projectId).staleTime,
    throwOnError: false,
  });
}

type UseProjectAttachmentsOptions = {
  indexStatus?: ProjectIndexStatus;
  enabled?: boolean;
  initialData?: InfiniteData<ListProjectAttachmentsResponse, string | undefined>;
};

/**
 * Hook to fetch attachments for a project
 * S3/R2 Best Practice: Attachments are references to centralized uploads
 * Protected endpoint - requires authentication
 *
 * @param projectId - Project ID
 * @param options - Optional query options (indexStatus, enabled, initialData)
 */
export function useProjectAttachmentsQuery(
  projectId: string,
  options?: UseProjectAttachmentsOptions,
) {
  const { isAuthenticated } = useAuthCheck();
  const { enabled, indexStatus, initialData } = options ?? {};

  return useInfiniteQuery({
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!projectId),
    gcTime: GC_TIMES.STANDARD, // 5 minutes
    queryFn: async ({ pageParam }) => {
      const limit = pageParam ? LIMITS.STANDARD_PAGE : LIMITS.INITIAL_PAGE;

      const query: ListProjectAttachmentsQuery = {
        limit,
        ...(pageParam && { cursor: pageParam }),
        ...(indexStatus && { indexStatus }),
      };

      return listProjectAttachmentsService({
        param: { id: projectId },
        query,
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
    queryKey: [...queryKeys.projects.attachments(projectId), indexStatus],
    retry: false,
    staleTime: initialData ? 10_000 : STALE_TIMES.threadDetail, // 10 seconds
    throwOnError: false,
  });
}

type UseProjectMemoriesOptions = {
  source?: ProjectMemorySource;
  isActive?: 'true' | 'false';
  enabled?: boolean;
  initialData?: InfiniteData<ListProjectMemoriesResponse, string | undefined>;
};

/**
 * Hook to fetch memories for a project
 * Protected endpoint - requires authentication
 *
 * @param projectId - Project ID
 * @param options - Optional query options (source, isActive, enabled, initialData)
 */
export function useProjectMemoriesQuery(
  projectId: string,
  options?: UseProjectMemoriesOptions,
) {
  const { isAuthenticated } = useAuthCheck();
  const { enabled, initialData, isActive, source } = options ?? {};

  return useInfiniteQuery({
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!projectId),
    gcTime: GC_TIMES.STANDARD, // 5 minutes
    queryFn: async ({ pageParam }) => {
      const limit = pageParam ? LIMITS.STANDARD_PAGE : LIMITS.INITIAL_PAGE;

      const query: ListProjectMemoriesQuery = {
        limit,
        ...(pageParam && { cursor: pageParam }),
        ...(source && { source }),
        ...(isActive && { isActive }),
      };

      return listProjectMemoriesService({
        param: { id: projectId },
        query,
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
    queryKey: [...queryKeys.projects.memories(projectId), source, isActive],
    retry: false,
    staleTime: initialData ? 10_000 : STALE_TIMES.threadDetail, // 10 seconds
    throwOnError: false,
  });
}

type UseProjectThreadsOptions = {
  enabled?: boolean;
  initialData?: InfiniteData<ListThreadsResponse, string | undefined>;
};

/**
 * Hook to fetch threads for a project
 * Protected endpoint - requires authentication (ownership check)
 *
 * Uses unified /chat/threads?projectId=X endpoint for consistent thread behavior.
 * Note: Project threads exclude isFavorite from response (favoriting not supported).
 *
 * @param projectId - Project ID
 * @param options - Optional query options (enabled, initialData)
 */
export function useProjectThreadsQuery(
  projectId: string,
  options?: UseProjectThreadsOptions,
) {
  const { enabled, initialData } = options ?? {};
  return useThreadsQuery({
    enabled: enabled !== undefined ? enabled : !!projectId,
    initialData,
    projectId,
  });
}

/**
 * Hook to fetch aggregated project context (for RAG)
 * Includes memories, cross-chat history, search results, and moderator
 * Protected endpoint - requires authentication
 *
 * @param projectId - Project ID
 * @param enabled - Optional control over whether to fetch (default: based on projectId and auth)
 */
export function useProjectContextQuery(
  projectId: string,
  enabled?: boolean,
) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!projectId),
    queryFn: () => getProjectContextService({ param: { id: projectId } }),
    queryKey: queryKeys.projects.context(projectId),
    retry: false,
    staleTime: STALE_TIMES.threadDetail, // 10 seconds
    throwOnError: false,
  });
}

/**
 * Hook to fetch project limits based on user subscription tier
 * Returns tier, max projects, current projects, max threads per project, canCreateProject
 * Protected endpoint - requires authentication
 */
export function useProjectLimitsQuery() {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    enabled: isAuthenticated,
    gcTime: GC_TIMES.STANDARD,
    queryFn: () => getProjectLimitsService(),
    queryKey: queryKeys.projects.limits(),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    throwOnError: false,
  });
}

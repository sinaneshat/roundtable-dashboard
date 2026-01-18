/**
 * Project Query Hooks
 *
 * TanStack Query hooks for project operations
 * Following patterns from subscriptions.ts and chat/threads.ts
 *
 * Updated to use new attachment-based pattern (S3/R2 best practice)
 */

import type { ProjectIndexStatus, ProjectMemorySource } from '@roundtable/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { LIMITS } from '@/constants';
import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { GC_TIMES, STALE_TIMES } from '@/lib/data/stale-times';
import type {
  ListProjectAttachmentsQuery,
  ListProjectMemoriesQuery,
} from '@/services/api';
import {
  getProjectContextService,
  getProjectService,
  listProjectAttachmentsService,
  listProjectMemoriesService,
  listProjectsService,
} from '@/services/api';

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

  return useInfiniteQuery({
    queryKey: [...queryKeys.projects.lists(search)],
    queryFn: async ({ pageParam }) => {
      // ✅ Use centralized limits - clean semantic names
      const limit = search
        ? LIMITS.SEARCH_RESULTS // 10 for search results
        : pageParam
          ? LIMITS.STANDARD_PAGE // 20 for subsequent pages
          : LIMITS.INITIAL_PAGE; // 50 for initial sidebar load

      const params: { cursor?: string; search?: string; limit: number } = { limit };
      if (pageParam)
        params.cursor = pageParam;
      if (search)
        params.search = search;

      return listProjectsService({ query: params });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.success)
        return undefined;
      return lastPage.data.pagination.nextCursor;
    },
    enabled: isAuthenticated,
    staleTime: STALE_TIMES.threads, // 30 seconds - match threads pattern
    gcTime: GC_TIMES.STANDARD, // 5 minutes
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch a specific project by ID with attachment and thread counts
 * Returns project details including attachmentCount and threadCount
 * Protected endpoint - requires authentication
 *
 * @param projectId - Project ID
 * @param enabled - Optional control over whether to fetch (default: based on projectId and auth)
 */
export function useProjectQuery(projectId: string, enabled?: boolean) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: () => getProjectService({ param: { id: projectId } }),
    staleTime: STALE_TIMES.threadDetail, // 10 seconds - match threads pattern
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!projectId),
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch attachments for a project
 * S3/R2 Best Practice: Attachments are references to centralized uploads
 * Protected endpoint - requires authentication
 *
 * @param projectId - Project ID
 * @param indexStatus - Optional filter by RAG indexing status
 * @param enabled - Optional control over whether to fetch (default: based on projectId and auth)
 */
export function useProjectAttachmentsQuery(
  projectId: string,
  indexStatus?: ProjectIndexStatus,
  enabled?: boolean,
) {
  const { isAuthenticated } = useAuthCheck();

  return useInfiniteQuery({
    queryKey: [...queryKeys.projects.attachments(projectId), indexStatus],
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
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.success)
        return undefined;
      return lastPage.data.pagination.nextCursor;
    },
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!projectId),
    staleTime: STALE_TIMES.threadDetail, // 10 seconds
    gcTime: GC_TIMES.STANDARD, // 5 minutes
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch memories for a project
 * Protected endpoint - requires authentication
 *
 * @param projectId - Project ID
 * @param source - Optional filter by memory source
 * @param isActive - Optional filter by active status ('true' | 'false' string for query param)
 * @param enabled - Optional control over whether to fetch (default: based on projectId and auth)
 */
export function useProjectMemoriesQuery(
  projectId: string,
  source?: ProjectMemorySource,
  isActive?: 'true' | 'false',
  enabled?: boolean,
) {
  const { isAuthenticated } = useAuthCheck();

  return useInfiniteQuery({
    queryKey: [...queryKeys.projects.memories(projectId), source, isActive],
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
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.success)
        return undefined;
      return lastPage.data.pagination.nextCursor;
    },
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!projectId),
    staleTime: STALE_TIMES.threadDetail, // 10 seconds
    gcTime: GC_TIMES.STANDARD, // 5 minutes
    retry: false,
    throwOnError: false,
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
    queryKey: queryKeys.projects.context(projectId),
    queryFn: () => getProjectContextService({ param: { id: projectId } }),
    staleTime: STALE_TIMES.threadDetail, // 10 seconds
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!projectId),
    retry: false,
    throwOnError: false,
  });
}

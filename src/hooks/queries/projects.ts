/**
 * Project Query Hooks
 *
 * TanStack Query hooks for project operations
 * Following patterns from subscriptions.ts and chat/threads.ts
 */

'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { LIMITS } from '@/constants/limits';
import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import {
  getProjectService,
  listKnowledgeFilesService,
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
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

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
    getNextPageParam: lastPage => lastPage.success ? lastPage.data?.pagination?.nextCursor : undefined,
    enabled: isAuthenticated,
    staleTime: STALE_TIMES.threads, // 30 seconds - match threads pattern
    retry: false,
  });
}

/**
 * Hook to fetch a specific project by ID with file and thread counts
 * Returns project details including fileCount and threadCount
 * Protected endpoint - requires authentication
 *
 * @param projectId - Project ID
 * @param enabled - Optional control over whether to fetch (default: based on projectId and auth)
 */
export function useProjectQuery(projectId: string, enabled?: boolean) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

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
 * Hook to fetch knowledge files for a project
 * Protected endpoint - requires authentication
 *
 * @param projectId - Project ID
 * @param status - Optional filter by file status (uploaded, indexing, indexed, failed)
 * @param enabled - Optional control over whether to fetch (default: based on projectId and auth)
 */
export function useKnowledgeFilesQuery(
  projectId: string,
  status?: 'uploaded' | 'indexing' | 'indexed' | 'failed',
  enabled?: boolean,
) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useInfiniteQuery({
    queryKey: [...queryKeys.projects.knowledgeFiles(projectId), status],
    queryFn: async ({ pageParam }) => {
      const limit = pageParam ? LIMITS.STANDARD_PAGE : LIMITS.INITIAL_PAGE;

      const params: { cursor?: string; status?: string; limit: number } = { limit };
      if (pageParam)
        params.cursor = pageParam;
      if (status)
        params.status = status;

      return listKnowledgeFilesService({
        param: { id: projectId },
        query: params,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.success ? lastPage.data?.pagination?.nextCursor : undefined,
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!projectId),
    staleTime: STALE_TIMES.threadDetail, // 10 seconds
    retry: false,
  });
}

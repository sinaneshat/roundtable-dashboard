/**
 * Admin Jobs Query Hooks
 *
 * TanStack Query hooks for fetching admin automated jobs
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { adminJobsInfiniteQueryOptions } from '@/lib/data/query-options';
import { GC_TIMES, STALE_TIMES } from '@/lib/data/stale-times';
import type { AutomatedJob } from '@/services/api';
import {
  getJobService,
  listJobsService,
} from '@/services/api';

/**
 * Query hook for fetching all admin jobs
 * Polls every 5s when there are running jobs
 */
export function useAdminJobsQuery(options?: {
  status?: 'pending' | 'running' | 'completed' | 'failed';
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  const { isAuthenticated } = useAuthCheck();
  const { enabled = true, refetchInterval = false, status } = options ?? {};

  return useQuery({
    enabled: isAuthenticated && enabled,
    gcTime: GC_TIMES.STANDARD,
    queryFn: () => listJobsService({ query: status ? { status } : undefined }),
    queryKey: queryKeys.adminJobs.list(status),
    refetchInterval,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: STALE_TIMES.adminJobs,
    throwOnError: false,
  });
}

/**
 * Infinite query hook for paginated admin jobs
 * Auto-polls faster when there are active jobs (pending or running)
 */
export function useAdminJobsInfiniteQuery() {
  const { isAuthenticated } = useAuthCheck();

  return useInfiniteQuery({
    ...adminJobsInfiniteQueryOptions,
    enabled: isAuthenticated,
    refetchInterval: (query) => {
      const pages = query.state.data?.pages ?? [];
      const hasActiveJobs = pages.some(page =>
        page.data.jobs.some((job: AutomatedJob) =>
          job.status === 'running' || job.status === 'pending',
        ),
      );
      // Poll every 3s when jobs are active, 30s otherwise
      return hasActiveJobs ? 3000 : 30000;
    },
    refetchOnMount: 'always',
  });
}

/**
 * Query hook for fetching a specific job by ID
 */
export function useAdminJobQuery(jobId: string, enabled = true) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    enabled: isAuthenticated && !!jobId && enabled,
    gcTime: GC_TIMES.STANDARD,
    queryFn: () => getJobService({ param: { id: jobId } }),
    queryKey: queryKeys.adminJobs.detail(jobId),
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: STALE_TIMES.adminJobs,
    throwOnError: false,
  });
}

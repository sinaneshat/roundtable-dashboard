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
  const { status, enabled = true, refetchInterval = false } = options ?? {};

  return useQuery({
    queryKey: queryKeys.adminJobs.list(status),
    queryFn: () => listJobsService({ query: status ? { status } : undefined }),
    staleTime: STALE_TIMES.adminJobs,
    gcTime: GC_TIMES.STANDARD,
    refetchOnWindowFocus: true,
    refetchInterval,
    enabled: isAuthenticated && enabled,
    retry: false,
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
    refetchOnMount: 'always',
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
  });
}

/**
 * Query hook for fetching a specific job by ID
 */
export function useAdminJobQuery(jobId: string, enabled = true) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    queryKey: queryKeys.adminJobs.detail(jobId),
    queryFn: () => getJobService({ param: { id: jobId } }),
    enabled: isAuthenticated && !!jobId && enabled,
    staleTime: STALE_TIMES.adminJobs,
    gcTime: GC_TIMES.STANDARD,
    refetchOnWindowFocus: true,
    retry: false,
    throwOnError: false,
  });
}

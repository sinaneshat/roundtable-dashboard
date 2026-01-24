/**
 * Admin Jobs Mutation Hooks
 *
 * TanStack Query mutation hooks for admin automated job operations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { shouldRetryMutation } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import {
  createJobService,
  deleteJobService,
  discoverTrendsService,
  updateJobService,
} from '@/services/api';

// Derive response types from service functions
type CreateJobResult = Awaited<ReturnType<typeof createJobService>>;
type UpdateJobResult = Awaited<ReturnType<typeof updateJobService>>;
type DeleteJobResult = Awaited<ReturnType<typeof deleteJobService>>;
type DiscoverTrendsResult = Awaited<ReturnType<typeof discoverTrendsService>>;

/**
 * Create automated job mutation
 */
export function useCreateJobMutation() {
  const queryClient = useQueryClient();

  return useMutation<CreateJobResult, Error, Parameters<typeof createJobService>[0]>({
    mutationFn: createJobService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminJobs.all });
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Update automated job mutation (cancel, toggle public)
 */
export function useUpdateJobMutation() {
  const queryClient = useQueryClient();

  return useMutation<UpdateJobResult, Error, Parameters<typeof updateJobService>[0]>({
    mutationFn: updateJobService,
    onSuccess: (_data, variables) => {
      const jobId = variables.param?.id;
      if (jobId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.adminJobs.detail(jobId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.adminJobs.lists() });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

/**
 * Delete automated job mutation
 */
export function useDeleteJobMutation() {
  const queryClient = useQueryClient();

  return useMutation<DeleteJobResult, Error, Parameters<typeof deleteJobService>[0]>({
    mutationFn: deleteJobService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminJobs.all });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

/**
 * Discover trending topics mutation
 * Returns suggestions - no cache invalidation needed
 */
export function useDiscoverTrendsMutation() {
  return useMutation<DiscoverTrendsResult, Error, Parameters<typeof discoverTrendsService>[0]>({
    mutationFn: discoverTrendsService,
    retry: false,
    throwOnError: false,
  });
}

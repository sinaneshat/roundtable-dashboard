/**
 * Project Mutation Hooks
 *
 * TanStack Mutation hooks for project operations
 * Following patterns from checkout.ts, subscription-management.ts, and api-key-mutations.ts
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import type { listProjectsService } from '@/services/api';
import {
  createProjectService,
  deleteKnowledgeFileService,
  deleteProjectService,
  updateProjectService,
  uploadKnowledgeFileService,
} from '@/services/api';

// ============================================================================
// Project Mutations
// ============================================================================

/**
 * Hook to create a new project
 * Protected endpoint - requires authentication
 *
 * After successful creation:
 * - Invalidates project lists to show the new project
 */
export function useCreateProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProjectService,
    onSuccess: () => {
      // Invalidate all project related queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to update a project
 * Protected endpoint - requires authentication
 *
 * After successful update:
 * - Immediately updates the projects list cache with updated data
 * - Invalidates specific project and lists to ensure consistency
 */
export function useUpdateProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProjectService,
    onSuccess: (response, variables) => {
      // Immediately update the projects list cache with the updated project
      if (response.success && response.data) {
        const updatedProject = response.data;

        queryClient.setQueryData<Awaited<ReturnType<typeof listProjectsService>>>(
          queryKeys.projects.list(),
          (oldData: Awaited<ReturnType<typeof listProjectsService>> | undefined) => {
            if (!oldData?.success || !oldData.data?.items) {
              return oldData;
            }

            // Replace the updated project in the list
            const updatedProjects = oldData.data.items.map((project: typeof updatedProject) =>
              project.id === updatedProject.id ? updatedProject : project,
            );

            return {
              ...oldData,
              data: {
                ...oldData.data,
                items: updatedProjects,
              },
            };
          },
        );
      }

      // Invalidate project detail and lists to ensure UI updates
      invalidationPatterns.projectDetail(variables.param.id).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: (failureCount, error: unknown) => {
      // Type-safe status extraction
      const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
        ? error.status
        : null;
      if (status !== null && status >= 400 && status < 500) {
        return false;
      }
      return failureCount < 2;
    },
    throwOnError: false,
  });
}

/**
 * Hook to delete a project
 * Protected endpoint - requires authentication
 *
 * After successful deletion:
 * - Optimistically removes the project from cache
 * - Invalidates project lists to ensure consistency
 */
export function useDeleteProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProjectService,
    onMutate: async (data) => {
      const projectId = data.param?.id;
      if (!projectId)
        return;
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.projects.all });

      // Snapshot the previous value for rollback
      const previousProjects = queryClient.getQueryData(queryKeys.projects.list());

      // Optimistically remove the project from the list
      queryClient.setQueryData<Awaited<ReturnType<typeof listProjectsService>>>(
        queryKeys.projects.list(),
        (oldData: Awaited<ReturnType<typeof listProjectsService>> | undefined) => {
          if (!oldData?.success || !oldData.data?.items) {
            return oldData;
          }

          // Filter out the deleted project
          const filteredProjects = oldData.data.items.filter((project: { id: string }) => project.id !== projectId);

          return {
            ...oldData,
            data: {
              ...oldData.data,
              items: filteredProjects,
            },
          };
        },
      );

      // Return context with previous value for rollback
      return { previousProjects };
    },
    // On error: Rollback to previous state
    onError: (_error, _projectId, context) => {
      // Restore the previous state
      if (context?.previousProjects) {
        queryClient.setQueryData(
          queryKeys.projects.list(),
          context.previousProjects,
        );
      }
    },
    // On success: Just ensure data is in sync (already updated optimistically)
    onSettled: () => {
      // Invalidate to ensure server state is in sync
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projects.all,
        refetchType: 'active',
      });
    },
    retry: (failureCount, error: unknown) => {
      // Type-safe status extraction
      const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
        ? error.status
        : null;
      if (status !== null && status >= 400 && status < 500) {
        return false;
      }
      return failureCount < 2;
    },
    throwOnError: false,
  });
}

// ============================================================================
// Knowledge File Mutations
// ============================================================================

/**
 * Hook to upload a knowledge file to a project
 * Protected endpoint - requires authentication
 *
 * After successful upload:
 * - Invalidates knowledge file list and project detail (to update fileCount)
 */
export function useUploadKnowledgeFileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadKnowledgeFileService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      // Invalidate knowledge files list and project detail (to update fileCount)
      invalidationPatterns.knowledgeFiles(projectId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to delete a knowledge file from a project
 * Protected endpoint - requires authentication
 *
 * After successful deletion:
 * - Invalidates knowledge file list and project detail (to update fileCount)
 */
export function useDeleteKnowledgeFileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteKnowledgeFileService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      // Invalidate knowledge files list and project detail (to update fileCount)
      invalidationPatterns.knowledgeFiles(projectId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: (failureCount, error: unknown) => {
      // Type-safe status extraction
      const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
        ? error.status
        : null;
      if (status !== null && status >= 400 && status < 500) {
        return false;
      }
      return failureCount < 2;
    },
    throwOnError: false,
  });
}

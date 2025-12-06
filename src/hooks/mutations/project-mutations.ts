/**
 * Project Mutation Hooks
 *
 * TanStack Mutation hooks for project operations
 * Following patterns from checkout.ts, subscription-management.ts, and api-key-mutations.ts
 *
 * Updated to use new attachment-based pattern (S3/R2 best practice)
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import type { listProjectsService } from '@/services/api';
import {
  addUploadToProjectService,
  createProjectMemoryService,
  createProjectService,
  deleteProjectMemoryService,
  deleteProjectService,
  removeAttachmentFromProjectService,
  updateProjectAttachmentService,
  updateProjectMemoryService,
  updateProjectService,
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
// Project Attachment Mutations (Reference-based, S3/R2 Best Practice)
// ============================================================================

/**
 * Hook to add an existing attachment to a project
 * S3/R2 Best Practice: Reference existing uploads instead of direct file upload
 * Protected endpoint - requires authentication
 *
 * After successful addition:
 * - Invalidates attachment list and project detail (to update attachmentCount)
 */
export function useAddAttachmentToProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addUploadToProjectService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      // Invalidate attachments list and project detail (to update attachmentCount)
      invalidationPatterns.projectAttachments(projectId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to update project attachment metadata
 * Protected endpoint - requires authentication
 *
 * After successful update:
 * - Invalidates attachment list
 */
export function useUpdateProjectAttachmentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProjectAttachmentService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      // Invalidate attachments list
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.attachments(projectId) });
    },
    retry: (failureCount, error: unknown) => {
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
 * Hook to remove an attachment from a project (reference removal, not file deletion)
 * S3/R2 Best Practice: Only removes the reference, the underlying file remains
 * Protected endpoint - requires authentication
 *
 * After successful removal:
 * - Invalidates attachment list and project detail (to update attachmentCount)
 */
export function useRemoveAttachmentFromProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removeAttachmentFromProjectService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      // Invalidate attachments list and project detail (to update attachmentCount)
      invalidationPatterns.projectAttachments(projectId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: (failureCount, error: unknown) => {
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
// Project Memory Mutations
// ============================================================================

/**
 * Hook to create a project memory
 * Protected endpoint - requires authentication
 *
 * After successful creation:
 * - Invalidates memory list
 */
export function useCreateProjectMemoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProjectMemoryService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      // Invalidate memories list
      invalidationPatterns.projectMemories(projectId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to update a project memory
 * Protected endpoint - requires authentication
 *
 * After successful update:
 * - Invalidates memory list
 */
export function useUpdateProjectMemoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProjectMemoryService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      // Invalidate memories list
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.memories(projectId) });
    },
    retry: (failureCount, error: unknown) => {
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
 * Hook to delete a project memory
 * Protected endpoint - requires authentication
 *
 * After successful deletion:
 * - Invalidates memory list
 */
export function useDeleteProjectMemoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProjectMemoryService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      // Invalidate memories list
      invalidationPatterns.projectMemories(projectId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: (failureCount, error: unknown) => {
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

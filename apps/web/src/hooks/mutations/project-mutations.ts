import { useMutation, useQueryClient } from '@tanstack/react-query';

import { shouldRetryMutation } from '@/hooks/utils';
import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import type { ListProjectsResponse } from '@/services/api';
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

// Derive response types from service functions (avoids InferResponseType resolution issues)
type CreateProjectResult = Awaited<ReturnType<typeof createProjectService>>;
type UpdateProjectResult = Awaited<ReturnType<typeof updateProjectService>>;
type DeleteProjectResult = Awaited<ReturnType<typeof deleteProjectService>>;
type AddUploadToProjectResult = Awaited<ReturnType<typeof addUploadToProjectService>>;
type UpdateProjectAttachmentResult = Awaited<ReturnType<typeof updateProjectAttachmentService>>;
type RemoveAttachmentFromProjectResult = Awaited<ReturnType<typeof removeAttachmentFromProjectService>>;
type CreateProjectMemoryResult = Awaited<ReturnType<typeof createProjectMemoryService>>;
type UpdateProjectMemoryResult = Awaited<ReturnType<typeof updateProjectMemoryService>>;
type DeleteProjectMemoryResult = Awaited<ReturnType<typeof deleteProjectMemoryService>>;

export function useCreateProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation<CreateProjectResult, Error, Parameters<typeof createProjectService>[0]>({
    mutationFn: createProjectService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useUpdateProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation<UpdateProjectResult, Error, Parameters<typeof updateProjectService>[0]>({
    mutationFn: updateProjectService,
    onSuccess: (response, variables) => {
      if (response.success && response.data) {
        const updatedProject = response.data;

        queryClient.setQueryData<ListProjectsResponse>(
          queryKeys.projects.list(),
          (oldData) => {
            if (!oldData?.success || !oldData.data?.items)
              return oldData;

            return {
              ...oldData,
              data: {
                ...oldData.data,
                items: oldData.data.items.map(
                  project => (project.id === updatedProject.id ? updatedProject : project),
                ),
              },
            };
          },
        );
      }

      invalidationPatterns.projectDetail(variables.param.id).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

export function useDeleteProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation<DeleteProjectResult, Error, Parameters<typeof deleteProjectService>[0], { previousProjects?: ListProjectsResponse }>({
    mutationFn: deleteProjectService,
    onMutate: async (data) => {
      const projectId = data.param?.id;
      if (!projectId)
        return { previousProjects: undefined };

      await queryClient.cancelQueries({ queryKey: queryKeys.projects.all });

      const previousProjects = queryClient.getQueryData<ListProjectsResponse>(queryKeys.projects.list());

      queryClient.setQueryData<ListProjectsResponse>(
        queryKeys.projects.list(),
        (oldData) => {
          if (!oldData?.success || !oldData.data?.items)
            return oldData;

          return {
            ...oldData,
            data: {
              ...oldData.data,
              items: oldData.data.items.filter(project => project.id !== projectId),
            },
          };
        },
      );

      return { previousProjects };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousProjects) {
        queryClient.setQueryData(
          queryKeys.projects.list(),
          context.previousProjects,
        );
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projects.all,
        refetchType: 'active',
      });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

export function useAddAttachmentToProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation<AddUploadToProjectResult, Error, Parameters<typeof addUploadToProjectService>[0]>({
    mutationFn: addUploadToProjectService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      invalidationPatterns.projectAttachments(projectId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useUpdateProjectAttachmentMutation() {
  const queryClient = useQueryClient();

  return useMutation<UpdateProjectAttachmentResult, Error, Parameters<typeof updateProjectAttachmentService>[0]>({
    mutationFn: updateProjectAttachmentService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      queryClient.invalidateQueries({ queryKey: queryKeys.projects.attachments(projectId) });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

export function useRemoveAttachmentFromProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation<RemoveAttachmentFromProjectResult, Error, Parameters<typeof removeAttachmentFromProjectService>[0]>({
    mutationFn: removeAttachmentFromProjectService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      invalidationPatterns.projectAttachments(projectId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

export function useCreateProjectMemoryMutation() {
  const queryClient = useQueryClient();

  return useMutation<CreateProjectMemoryResult, Error, Parameters<typeof createProjectMemoryService>[0]>({
    mutationFn: createProjectMemoryService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      invalidationPatterns.projectMemories(projectId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useUpdateProjectMemoryMutation() {
  const queryClient = useQueryClient();

  return useMutation<UpdateProjectMemoryResult, Error, Parameters<typeof updateProjectMemoryService>[0]>({
    mutationFn: updateProjectMemoryService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      queryClient.invalidateQueries({ queryKey: queryKeys.projects.memories(projectId) });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

export function useDeleteProjectMemoryMutation() {
  const queryClient = useQueryClient();

  return useMutation<DeleteProjectMemoryResult, Error, Parameters<typeof deleteProjectMemoryService>[0]>({
    mutationFn: deleteProjectMemoryService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      invalidationPatterns.projectMemories(projectId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

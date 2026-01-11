'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { shouldRetryMutation } from '@/hooks/utils';
import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import type {
  AddUploadToProjectRequest,
  AddUploadToProjectResponse,
  CreateProjectMemoryRequest,
  CreateProjectMemoryResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteProjectMemoryRequest,
  DeleteProjectMemoryResponse,
  DeleteProjectRequest,
  DeleteProjectResponse,
  ListProjectsResponse,
  RemoveAttachmentFromProjectRequest,
  RemoveAttachmentFromProjectResponse,
  UpdateProjectAttachmentRequest,
  UpdateProjectAttachmentResponse,
  UpdateProjectMemoryRequest,
  UpdateProjectMemoryResponse,
  UpdateProjectRequest,
  UpdateProjectResponse,
} from '@/services/api';
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

export function useCreateProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation<CreateProjectResponse, Error, CreateProjectRequest>({
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

  return useMutation<UpdateProjectResponse, Error, UpdateProjectRequest>({
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

  return useMutation<DeleteProjectResponse, Error, DeleteProjectRequest, { previousProjects?: ListProjectsResponse }>({
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

  return useMutation<AddUploadToProjectResponse, Error, AddUploadToProjectRequest>({
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

  return useMutation<UpdateProjectAttachmentResponse, Error, UpdateProjectAttachmentRequest>({
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

  return useMutation<RemoveAttachmentFromProjectResponse, Error, RemoveAttachmentFromProjectRequest>({
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

  return useMutation<CreateProjectMemoryResponse, Error, CreateProjectMemoryRequest>({
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

  return useMutation<UpdateProjectMemoryResponse, Error, UpdateProjectMemoryRequest>({
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

  return useMutation<DeleteProjectMemoryResponse, Error, DeleteProjectMemoryRequest>({
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

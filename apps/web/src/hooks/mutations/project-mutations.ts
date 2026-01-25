import type { InfiniteData } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { shouldRetryMutation } from '@/hooks/utils';
import enCommon from '@/i18n/locales/en/common.json';
import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import { toastManager } from '@/lib/toast';
import type { GetProjectResponse, ListProjectAttachmentsResponse, ListProjectsResponse, ProjectAttachmentItem, ProjectListItem } from '@/services/api';
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
    mutationKey: ['projects', 'create'],
    mutationFn: createProjectService,
    onSuccess: () => {
      invalidationPatterns.projects.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: () => {
      toastManager.error(enCommon.projects.createError);
    },
    retry: false,
    throwOnError: false,
  });
}

export function useUpdateProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation<UpdateProjectResult, Error, Parameters<typeof updateProjectService>[0]>({
    mutationKey: ['projects', 'update'],
    mutationFn: updateProjectService,
    onSuccess: (response, variables) => {
      if (response.success && response.data) {
        const updatedProject = response.data;

        // 1. Update infinite query caches (sidebar and list use useInfiniteQuery with pages structure)
        queryClient.setQueriesData<InfiniteData<ListProjectsResponse>>(
          {
            queryKey: queryKeys.projects.all,
            predicate: (query) => {
              if (!Array.isArray(query.queryKey) || query.queryKey.length < 2)
                return false;
              return query.queryKey[1] === 'list' || query.queryKey[1] === 'sidebar';
            },
          },
          (old) => {
            if (!old?.pages)
              return old;

            return {
              ...old,
              pages: old.pages.map((page) => {
                if (!page.success || !page.data?.items)
                  return page;

                return {
                  ...page,
                  data: {
                    ...page.data,
                    items: page.data.items.map(
                      (project: ProjectListItem) => (project.id === updatedProject.id ? { ...project, ...updatedProject } : project),
                    ),
                  },
                };
              }),
            };
          },
        );

        // 2. Update detail query directly (optimistic)
        queryClient.setQueryData(
          queryKeys.projects.detail(variables.param.id),
          (old: GetProjectResponse | undefined) => {
            if (!old?.success || !old.data)
              return old;
            return { ...old, data: updatedProject };
          },
        );
      }

      // 3. Invalidate and force refetch for active observers
      invalidationPatterns.projectDetail(variables.param.id).forEach((key) => {
        queryClient.invalidateQueries({
          queryKey: key,
          refetchType: 'active',
        });
      });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

export function useDeleteProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation<DeleteProjectResult, Error, Parameters<typeof deleteProjectService>[0], { previousProjects?: ListProjectsResponse }>({
    mutationKey: ['projects', 'delete'],
    mutationFn: deleteProjectService,
    onMutate: async (data) => {
      const projectId = data.param?.id;
      if (!projectId)
        return { previousProjects: undefined };

      await queryClient.cancelQueries({ queryKey: queryKeys.projects.all });

      const previousProjects = queryClient.getQueryData<ListProjectsResponse>(queryKeys.projects.list());

      queryClient.setQueryData<ListProjectsResponse>(
        queryKeys.projects.list(),
        (oldData: ListProjectsResponse | undefined) => {
          if (!oldData?.success || !oldData.data?.items)
            return oldData;

          return {
            ...oldData,
            data: {
              ...oldData.data,
              items: oldData.data.items.filter((project: ProjectListItem) => project.id !== projectId),
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
      // Invalidate all project queries including sidebar
      invalidationPatterns.projects.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });

      // Invalidate thread queries since threads were soft-deleted
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.all });

      // Invalidate usage stats to reflect deleted threads
      queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

export function useAddAttachmentToProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation<AddUploadToProjectResult, Error, Parameters<typeof addUploadToProjectService>[0]>({
    mutationKey: ['projects', 'attachments', 'add'],
    mutationFn: addUploadToProjectService,
    onSuccess: (data, variables) => {
      if (!data.success || !data.data)
        return;

      const projectId = variables.param.id;
      const newAttachment = data.data;

      // Direct cache update - insert at top of infinite query
      // Use setQueriesData with predicate to match all queries starting with attachments key
      // (the actual query key includes indexStatus param which varies)
      queryClient.setQueriesData<InfiniteData<ListProjectAttachmentsResponse>>(
        {
          queryKey: queryKeys.projects.attachments(projectId),
          predicate: (query) => {
            const key = query.queryKey;
            if (!Array.isArray(key) || key.length < 3)
              return false;
            return key[0] === 'projects' && key[1] === 'attachments' && key[2] === projectId;
          },
        },
        (oldData) => {
          if (!oldData?.pages)
            return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page, index) => {
              if (index !== 0 || !page.success || !page.data)
                return page;
              return {
                ...page,
                data: {
                  ...page.data,
                  items: [newAttachment, ...page.data.items],
                },
              };
            }),
          };
        },
      );

      // Only invalidate project detail for attachment count
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.detail(projectId),
        refetchType: 'none',
      });
      queryClient.refetchQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
    onError: (_error, variables) => {
      // On error, invalidate to get fresh state
      const projectId = variables.param.id;
      invalidationPatterns.projectAttachments(projectId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      // Notify user of failure
      toastManager.error('Failed to add file to project');
    },
    retry: false,
    throwOnError: false,
  });
}

export function useUpdateProjectAttachmentMutation() {
  const queryClient = useQueryClient();

  return useMutation<UpdateProjectAttachmentResult, Error, Parameters<typeof updateProjectAttachmentService>[0]>({
    mutationKey: ['projects', 'attachments', 'update'],
    mutationFn: updateProjectAttachmentService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;

      // Use predicate to match all attachment queries (key includes indexStatus param)
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          if (!Array.isArray(key) || key.length < 3)
            return false;
          return key[0] === 'projects' && key[1] === 'attachments' && key[2] === projectId;
        },
      });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

export function useRemoveAttachmentFromProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation<RemoveAttachmentFromProjectResult, Error, Parameters<typeof removeAttachmentFromProjectService>[0]>({
    mutationKey: ['projects', 'attachments', 'remove'],
    mutationFn: removeAttachmentFromProjectService,
    onSuccess: (_data, variables) => {
      const projectId = variables.param.id;
      const attachmentId = variables.param.attachmentId;

      // Optimistically remove attachment from cache using predicate
      // (actual query key includes indexStatus param which varies)
      queryClient.setQueriesData<InfiniteData<ListProjectAttachmentsResponse>>(
        {
          queryKey: queryKeys.projects.attachments(projectId),
          predicate: (query) => {
            const key = query.queryKey;
            if (!Array.isArray(key) || key.length < 3)
              return false;
            return key[0] === 'projects' && key[1] === 'attachments' && key[2] === projectId;
          },
        },
        (oldData) => {
          if (!oldData?.pages)
            return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => {
              if (!page.success || !page.data)
                return page;
              return {
                ...page,
                data: {
                  ...page.data,
                  items: page.data.items.filter((item: ProjectAttachmentItem) => item.id !== attachmentId),
                },
              };
            }),
          };
        },
      );

      // Also invalidate project detail to update attachment count
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.detail(projectId),
      });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

export function useCreateProjectMemoryMutation() {
  const queryClient = useQueryClient();

  return useMutation<CreateProjectMemoryResult, Error, Parameters<typeof createProjectMemoryService>[0]>({
    mutationKey: ['projects', 'memories', 'create'],
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
    mutationKey: ['projects', 'memories', 'update'],
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
    mutationKey: ['projects', 'memories', 'delete'],
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

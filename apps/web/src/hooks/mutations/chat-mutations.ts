import { useMutation, useQueryClient } from '@tanstack/react-query';
import { use } from 'react';

import { ChatStoreContext } from '@/components/providers/chat-store-provider/context';
import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import type { AddParticipantResponse, UpdateThreadResponse } from '@/services/api';
import {
  addParticipantService,
  createCustomRoleService,
  createThreadService,
  createUserPresetService,
  deleteCustomRoleService,
  deleteParticipantService,
  deleteThreadService,
  deleteUserPresetService,
  setRoundFeedbackService,
  updateCustomRoleService,
  updateParticipantService,
  updateThreadService,
  updateUserPresetService,
} from '@/services/api';
import {
  ChatThreadCacheSchema,
  validateInfiniteQueryCache,
  validateThreadDetailCache,
  validateThreadDetailPayloadCache,
  validateThreadDetailResponseCache,
  validateThreadsListPages,
} from '@/stores/chat';

/**
 * Input type for toggle favorite mutation
 * Convenience wrapper around updateThreadService
 */
type ToggleFavoriteInput = {
  threadId: string;
  isFavorite: boolean;
  slug?: string;
};

/**
 * Input type for toggle public mutation
 * Convenience wrapper around updateThreadService
 */
type TogglePublicInput = {
  threadId: string;
  isPublic: boolean;
  slug?: string;
};

/**
 * Input type for update participant mutation
 * Augmented with threadId for cache invalidation
 */
type UpdateParticipantInput = Parameters<typeof updateParticipantService>[0] & {
  threadId?: string;
};

/**
 * Input type for delete participant mutation
 * Augmented with threadId for cache invalidation
 */
type DeleteParticipantInput = Parameters<typeof deleteParticipantService>[0] & {
  threadId?: string;
};

export function useCreateThreadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createThreadService,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.usage.stats() });
      const previousUsage = queryClient.getQueryData(queryKeys.usage.stats());
      return { previousUsage };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousUsage) {
        queryClient.setQueryData(queryKeys.usage.stats(), context.previousUsage);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

export function useUpdateThreadMutation() {
  const queryClient = useQueryClient();
  // Optional store access - may be undefined outside ChatStoreProvider
  const chatStore = use(ChatStoreContext);

  return useMutation({
    mutationFn: updateThreadService,
    onSuccess: (data: UpdateThreadResponse, variables) => {
      const threadId = variables.param.id;
      if (!data.success)
        return;
      const updatedThread = data.data;

      // Sync title to Zustand store so breadcrumb updates immediately
      if (chatStore && 'title' in variables.json) {
        const currentThread = chatStore.getState().thread;
        if (currentThread?.id === threadId) {
          chatStore.setState(
            { thread: { ...currentThread, title: variables.json.title as string } },
            false,
            'thread/updateTitle',
          );
        }
      }

      // Immediately update sidebar/list caches with the new title from the response
      // This prevents waiting for a refetch and shows the update instantly
      queryClient.setQueriesData(
        {
          queryKey: queryKeys.threads.all,
          predicate: (query) => {
            if (!Array.isArray(query.queryKey) || query.queryKey.length < 2)
              return false;
            return query.queryKey[1] === 'list' || query.queryKey[1] === 'sidebar';
          },
        },
        (old) => {
          const parsedQuery = validateInfiniteQueryCache(old);
          if (!parsedQuery)
            return old;

          return {
            ...parsedQuery,
            pages: parsedQuery.pages.map((page) => {
              if (!page.success || !page.data?.items)
                return page;

              return {
                ...page,
                data: {
                  ...page.data,
                  items: page.data.items.map((thread) => {
                    const threadData = ChatThreadCacheSchema.safeParse(thread);
                    if (!threadData.success || threadData.data.id !== threadId)
                      return thread;

                    // Merge the response data with existing thread
                    return {
                      ...thread,
                      ...(updatedThread || {}),
                      // Also apply the request variables as fallback
                      ...('title' in variables.json && { title: variables.json.title }),
                      ...('isFavorite' in variables.json && { isFavorite: variables.json.isFavorite }),
                      ...('isPublic' in variables.json && { isPublic: variables.json.isPublic }),
                      ...('slug' in variables.json && { slug: variables.json.slug }),
                    };
                  }),
                },
              };
            }),
          };
        },
      );

      // Update thread detail cache if present
      queryClient.setQueryData(
        queryKeys.threads.detail(threadId),
        (old) => {
          const parsedData = validateThreadDetailPayloadCache(old);
          if (!parsedData)
            return old;

          return {
            success: true,
            data: {
              ...parsedData,
              thread: {
                ...parsedData.thread,
                ...(updatedThread || {}),
                ...('title' in variables.json && { title: variables.json.title }),
                ...('isFavorite' in variables.json && { isFavorite: variables.json.isFavorite }),
                ...('isPublic' in variables.json && { isPublic: variables.json.isPublic }),
                ...('slug' in variables.json && { slug: variables.json.slug }),
              },
            },
          };
        },
      );

      // Update slug-based cache if slug was provided
      const newSlug = 'slug' in variables.json ? variables.json.slug : null;
      if (typeof newSlug === 'string') {
        queryClient.setQueryData(
          queryKeys.threads.bySlug(newSlug),
          (old) => {
            const parsedData = validateThreadDetailPayloadCache(old);
            if (!parsedData)
              return old;

            return {
              success: true,
              data: {
                ...parsedData,
                thread: {
                  ...parsedData.thread,
                  ...(updatedThread || {}),
                  ...('title' in variables.json && { title: variables.json.title }),
                  ...('isFavorite' in variables.json && { isFavorite: variables.json.isFavorite }),
                  ...('isPublic' in variables.json && { isPublic: variables.json.isPublic }),
                  slug: newSlug,
                },
              },
            };
          },
        );
      }
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Input type for delete thread mutation
 * Extended with optional metadata for cache cleanup
 */
type DeleteThreadInput = Parameters<typeof deleteThreadService>[0] & {
  slug?: string;
  projectId?: string;
};

export function useDeleteThreadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DeleteThreadInput) => deleteThreadService({ param: data.param }),
    onMutate: async (variables) => {
      const threadId = variables.param.id;

      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.usage.stats() });
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.detail(threadId) });
      if (variables.slug) {
        await queryClient.cancelQueries({ queryKey: queryKeys.threads.bySlug(variables.slug) });
      }
      if (variables.projectId) {
        await queryClient.cancelQueries({ queryKey: queryKeys.projects.threads(variables.projectId) });
      }

      const previousThreads = queryClient.getQueryData(queryKeys.threads.all);
      const previousUsage = queryClient.getQueryData(queryKeys.usage.stats());

      // Optimistically remove from list/sidebar
      queryClient.setQueriesData(
        {
          queryKey: queryKeys.threads.all,
          predicate: (query) => {
            if (!Array.isArray(query.queryKey) || query.queryKey.length < 2)
              return false;
            return query.queryKey[1] === 'list' || query.queryKey[1] === 'sidebar';
          },
        },
        (old) => {
          const parsedQuery = validateInfiniteQueryCache(old);
          if (!parsedQuery)
            return old;

          return {
            ...parsedQuery,
            pages: parsedQuery.pages.map((page) => {
              if (!page.success || !page.data?.items)
                return page;

              return {
                ...page,
                data: {
                  ...page.data,
                  items: page.data.items.filter((thread) => {
                    const threadData = ChatThreadCacheSchema.safeParse(thread);
                    return threadData.success && threadData.data.id !== threadId;
                  }),
                },
              };
            }),
          };
        },
      );

      // Optimistically remove from project threads if applicable
      if (variables.projectId) {
        queryClient.setQueriesData(
          { queryKey: queryKeys.projects.threads(variables.projectId) },
          (old) => {
            const parsedQuery = validateInfiniteQueryCache(old);
            if (!parsedQuery)
              return old;

            return {
              ...parsedQuery,
              pages: parsedQuery.pages.map((page) => {
                if (!page.success || !page.data?.items)
                  return page;

                return {
                  ...page,
                  data: {
                    ...page.data,
                    items: page.data.items.filter((thread) => {
                      const threadData = ChatThreadCacheSchema.safeParse(thread);
                      return threadData.success && threadData.data.id !== threadId;
                    }),
                  },
                };
              }),
            };
          },
        );
      }

      return { previousThreads, previousUsage, threadId, slug: variables.slug, projectId: variables.projectId };
    },
    onSuccess: (_data, _variables, context) => {
      if (!context)
        return;
      const { threadId, slug, projectId } = context;

      // Remove all thread-specific caches
      queryClient.removeQueries({ queryKey: queryKeys.threads.detail(threadId) });
      queryClient.removeQueries({ queryKey: queryKeys.threads.messages(threadId) });
      queryClient.removeQueries({ queryKey: queryKeys.threads.feedback(threadId) });
      queryClient.removeQueries({ queryKey: queryKeys.threads.changelog(threadId) });
      queryClient.removeQueries({ queryKey: queryKeys.threads.preSearches(threadId) });
      queryClient.removeQueries({ queryKey: queryKeys.threads.streamResumption(threadId) });
      queryClient.removeQueries({ queryKey: queryKeys.threads.slugStatus(threadId) });

      if (slug) {
        queryClient.removeQueries({ queryKey: queryKeys.threads.bySlug(slug) });
        queryClient.removeQueries({ queryKey: queryKeys.threads.public(slug) });
      }

      // Invalidate project-related caches (thread deletion cascades to attachments/memories)
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.threads(projectId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.attachments(projectId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.memories(projectId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.sidebar() });
      }

      // Invalidate usage stats
      queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });
    },
    onError: (_error, _variables, context) => {
      if (context?.previousThreads) {
        queryClient.setQueryData(queryKeys.threads.all, context.previousThreads);
      }
      if (context?.previousUsage) {
        queryClient.setQueryData(queryKeys.usage.stats(), context.previousUsage);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

export function useToggleFavoriteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, isFavorite }: ToggleFavoriteInput) =>
      updateThreadService({ param: { id: threadId }, json: { isFavorite } }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all });
      if (variables.slug) {
        await queryClient.cancelQueries({ queryKey: queryKeys.threads.bySlug(variables.slug) });
      }

      const previousThreads = queryClient.getQueryData(queryKeys.threads.all);
      const previousBySlug = variables.slug
        ? queryClient.getQueryData(queryKeys.threads.bySlug(variables.slug))
        : null;

      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all },
        (old) => {
          if (!old || typeof old !== 'object')
            return old;
          if (!('pages' in old))
            return old;
          const pages = validateThreadsListPages(old.pages);
          if (!pages)
            return old;

          return {
            ...old,
            pages: pages.map((page) => {
              if (!page.success || !page.data?.items)
                return page;

              return {
                ...page,
                data: {
                  ...page.data,
                  items: page.data.items.map(thread =>
                    thread.id === variables.threadId
                      ? { ...thread, isFavorite: variables.isFavorite }
                      : thread,
                  ),
                },
              };
            }),
          };
        },
      );

      // Update bySlug cache if slug provided
      if (variables.slug) {
        queryClient.setQueryData(
          queryKeys.threads.bySlug(variables.slug),
          (old) => {
            const parsedData = validateThreadDetailPayloadCache(old);
            if (!parsedData)
              return old;

            return {
              success: true,
              data: {
                ...parsedData,
                thread: {
                  ...parsedData.thread,
                  isFavorite: variables.isFavorite,
                },
              },
            };
          },
        );
      }

      // Update detail cache - ensures ChatThreadActions sees updated state
      const previousDetail = queryClient.getQueryData(queryKeys.threads.detail(variables.threadId));
      queryClient.setQueryData(
        queryKeys.threads.detail(variables.threadId),
        (old) => {
          const parsedData = validateThreadDetailPayloadCache(old);
          if (!parsedData)
            return old;

          return {
            success: true,
            data: {
              ...parsedData,
              thread: {
                ...parsedData.thread,
                isFavorite: variables.isFavorite,
              },
            },
          };
        },
      );

      return { previousThreads, previousBySlug, previousDetail, slug: variables.slug, threadId: variables.threadId };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousThreads) {
        queryClient.setQueryData(queryKeys.threads.all, context.previousThreads);
      }
      if (context?.slug && context?.previousBySlug) {
        queryClient.setQueryData(queryKeys.threads.bySlug(context.slug), context.previousBySlug);
      }
      if (context?.threadId && context?.previousDetail) {
        queryClient.setQueryData(queryKeys.threads.detail(context.threadId), context.previousDetail);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

export function useTogglePublicMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, isPublic }: TogglePublicInput) =>
      updateThreadService({ param: { id: threadId }, json: { isPublic } }),
    onMutate: async (variables) => {
      // Only cancel/update detail caches - NOT the threads list
      // Updating threads.all causes sidebar re-render which closes the share dialog
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.detail(variables.threadId) });
      if (variables.slug) {
        await queryClient.cancelQueries({ queryKey: queryKeys.threads.bySlug(variables.slug) });
      }

      const previousDetail = queryClient.getQueryData(queryKeys.threads.detail(variables.threadId));
      const previousBySlug = variables.slug
        ? queryClient.getQueryData(queryKeys.threads.bySlug(variables.slug))
        : null;

      // Update thread detail cache (used by header)
      queryClient.setQueryData(
        queryKeys.threads.detail(variables.threadId),
        (old) => {
          const parsedData = validateThreadDetailPayloadCache(old);
          if (!parsedData)
            return old;

          return {
            success: true,
            data: {
              ...parsedData,
              thread: {
                ...parsedData.thread,
                isPublic: variables.isPublic,
              },
            },
          };
        },
      );

      if (variables.slug) {
        queryClient.setQueryData(
          queryKeys.threads.bySlug(variables.slug),
          (old) => {
            const parsedData = validateThreadDetailPayloadCache(old);
            if (!parsedData)
              return old;

            return {
              success: true,
              data: {
                ...parsedData,
                thread: {
                  ...parsedData.thread,
                  isPublic: variables.isPublic,
                },
              },
            };
          },
        );
      }

      return { previousDetail, previousBySlug, slug: variables.slug, threadId: variables.threadId };
    },
    onSuccess: (_data, variables) => {
      // ✅ CACHE INVALIDATION: Invalidate public thread cache when visibility changes
      // This ensures the public page shows the correct state (no longer public / now public)
      if (variables.slug) {
        // Invalidate the public thread query - forces fresh fetch on next visit
        queryClient.invalidateQueries({ queryKey: queryKeys.threads.public(variables.slug) });
        // Also invalidate the public slugs list
        queryClient.invalidateQueries({ queryKey: queryKeys.threads.publicSlugs() });
      }
    },
    onError: (_error, _variables, context) => {
      if (context?.threadId && context?.previousDetail) {
        queryClient.setQueryData(queryKeys.threads.detail(context.threadId), context.previousDetail);
      }
      if (context?.slug && context?.previousBySlug) {
        queryClient.setQueryData(queryKeys.threads.bySlug(context.slug), context.previousBySlug);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

export function useAddParticipantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addParticipantService,
    onMutate: async (variables) => {
      const threadId = variables.param.id;

      await queryClient.cancelQueries({ queryKey: queryKeys.threads.detail(threadId) });

      const previousThread = queryClient.getQueryData(queryKeys.threads.detail(threadId));

      queryClient.setQueryData(
        queryKeys.threads.detail(threadId),
        (old) => {
          if (!old || typeof old !== 'object')
            return old;
          if (!('success' in old) || !old.success)
            return old;
          if (!('data' in old) || !old.data || typeof old.data !== 'object')
            return old;

          const data = validateThreadDetailCache(old.data);
          if (!data)
            return old;

          const { json: participantData } = variables;
          const optimisticParticipant = {
            id: `temp-${Date.now()}`,
            threadId,
            modelId: participantData.modelId,
            role: participantData.role ?? null,
            customRoleId: null,
            priority: participantData.priority ?? 0,
            isEnabled: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          return {
            ...old,
            data: {
              ...data,
              participants: [...data.participants, optimisticParticipant],
            },
          };
        },
      );

      return { previousThread, threadId };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousThread && context?.threadId) {
        queryClient.setQueryData(queryKeys.threads.detail(context.threadId), context.previousThread);
      }
    },
    onSuccess: (data: AddParticipantResponse, variables) => {
      const threadId = variables.param.id;

      queryClient.setQueryData(
        queryKeys.threads.detail(threadId),
        (old) => {
          const cache = validateThreadDetailResponseCache(old);
          if (!cache || !cache.data.participants)
            return old;

          const newParticipant = data.success ? data.data : null;

          return {
            ...cache,
            data: {
              ...cache.data,
              participants: cache.data.participants.map((p: { id: string }) =>
                p.id.startsWith('temp-') && newParticipant ? newParticipant : p,
              ),
            },
          };
        },
      );
    },
    retry: false,
    throwOnError: false,
  });
}

export function useUpdateParticipantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateParticipantInput) =>
      updateParticipantService(data),
    onMutate: async (variables) => {
      const threadId = variables.threadId;
      if (!threadId)
        return { previousThread: null, threadId: null };

      await queryClient.cancelQueries({ queryKey: queryKeys.threads.detail(threadId) });

      const previousThread = queryClient.getQueryData(queryKeys.threads.detail(threadId));

      queryClient.setQueryData(
        queryKeys.threads.detail(threadId),
        (old) => {
          if (!old || typeof old !== 'object')
            return old;
          if (!('success' in old) || !old.success)
            return old;
          if (!('data' in old) || !old.data || typeof old.data !== 'object')
            return old;

          const data = validateThreadDetailCache(old.data);
          if (!data)
            return old;

          return {
            ...old,
            data: {
              ...data,
              participants: data.participants.map(p =>
                p.id === variables.param.id
                  ? { ...p, ...variables.json, updatedAt: new Date().toISOString() }
                  : p,
              ),
            },
          };
        },
      );

      return { previousThread, threadId };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousThread && context?.threadId) {
        queryClient.setQueryData(queryKeys.threads.detail(context.threadId), context.previousThread);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

export function useDeleteParticipantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DeleteParticipantInput) =>
      deleteParticipantService(data),
    onMutate: async (variables) => {
      const threadId = variables.threadId;
      if (!threadId)
        return { previousThread: null, threadId: null };

      await queryClient.cancelQueries({ queryKey: queryKeys.threads.detail(threadId) });

      const previousThread = queryClient.getQueryData(queryKeys.threads.detail(threadId));

      queryClient.setQueryData(
        queryKeys.threads.detail(threadId),
        (old) => {
          if (!old || typeof old !== 'object')
            return old;
          if (!('success' in old) || !old.success)
            return old;
          if (!('data' in old) || !old.data || typeof old.data !== 'object')
            return old;

          const data = validateThreadDetailCache(old.data);
          if (!data)
            return old;

          return {
            ...old,
            data: {
              ...data,
              participants: data.participants.filter(p =>
                p.id !== variables.param.id,
              ),
            },
          };
        },
      );

      return { previousThread, threadId };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousThread && context?.threadId) {
        queryClient.setQueryData(queryKeys.threads.detail(context.threadId), context.previousThread);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

export function useCreateCustomRoleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCustomRoleService,
    onSuccess: () => {
      invalidationPatterns.customRoles.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useUpdateCustomRoleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCustomRoleService,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customRoles.detail(variables.param.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.customRoles.lists() });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useDeleteCustomRoleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCustomRoleService,
    onSuccess: () => {
      invalidationPatterns.customRoles.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useSetRoundFeedbackMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: setRoundFeedbackService,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.feedback(variables.param.threadId),
      });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useCreateUserPresetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUserPresetService,
    onSuccess: () => {
      invalidationPatterns.userPresets.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useUpdateUserPresetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateUserPresetService,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userPresets.detail(variables.param.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.userPresets.lists() });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useDeleteUserPresetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteUserPresetService,
    onSuccess: () => {
      invalidationPatterns.userPresets.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: false,
    throwOnError: false,
  });
}

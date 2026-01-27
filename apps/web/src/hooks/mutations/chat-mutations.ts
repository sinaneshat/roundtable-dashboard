import { useMutation, useQueryClient } from '@tanstack/react-query';
import { use } from 'react';
import { z } from 'zod';

import { ChatStoreContext } from '@/components/providers/chat-store-provider/context';
import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import type {
  AddParticipantResponse,
  DeleteParticipantRequest,
  UpdateParticipantRequest,
  UpdateThreadResponse,
} from '@/services/api';
import {
  addParticipantService,
  createCustomRoleService,
  createThreadService,
  createUserPresetService,
  deleteCustomRoleService,
  deleteParticipantService,
  deleteThreadService,
  deleteUserPresetService,
  updateCustomRoleService,
  updateParticipantService,
  updateThreadService,
  updateUserPresetService,
} from '@/services/api';
import type {
  PaginatedPageCache,
  ThreadsListCachePage,
} from '@/stores/chat';
import {
  ChatThreadCacheSchema,
  validateInfiniteQueryCache,
  validateThreadDetailCache,
  validateThreadDetailPayloadCache,
  validateThreadDetailResponseCache,
  validateThreadsListPages,
} from '@/stores/chat';

// ============================================================================
// INPUT TYPE SCHEMAS - Zod-based extensions for cache invalidation context
// ============================================================================

/**
 * Toggle favorite input schema
 */
const _ToggleFavoriteInputSchema = z.object({
  isFavorite: z.boolean(),
  slug: z.string().optional(),
  threadId: z.string(),
});
type ToggleFavoriteInput = z.infer<typeof _ToggleFavoriteInputSchema>;

/**
 * Toggle public input schema
 */
const _TogglePublicInputSchema = z.object({
  isPublic: z.boolean(),
  slug: z.string().optional(),
  threadId: z.string(),
});
type TogglePublicInput = z.infer<typeof _TogglePublicInputSchema>;

/**
 * Update participant input schema - extends RPC request type with threadId for cache invalidation
 */
const _UpdateParticipantInputSchema = z.custom<UpdateParticipantRequest>().and(
  z.object({ threadId: z.string().optional() }),
);
type UpdateParticipantInput = z.infer<typeof _UpdateParticipantInputSchema>;

/**
 * Delete participant input schema - extends RPC request type with threadId for cache invalidation
 */
const _DeleteParticipantInputSchema = z.custom<DeleteParticipantRequest>().and(
  z.object({ threadId: z.string().optional() }),
);
type DeleteParticipantInput = z.infer<typeof _DeleteParticipantInputSchema>;

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
    onSuccess: (_data, variables) => {
      // Invalidate project-related caches when thread is created in a project
      const projectId = variables.json.projectId;
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.threads(projectId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.sidebar() });
      }
      // Always invalidate thread lists and sidebar
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.sidebar() });

      // Invalidate usage stats - thread creation affects user quotas
      queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });
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
      if (!data.success) {
        return;
      }
      const updatedThread = data.data;

      // Sync title to Zustand store so breadcrumb updates immediately
      if (chatStore && 'title' in variables.json) {
        const titleResult = z.string().safeParse(variables.json.title);
        if (titleResult.success) {
          const currentThread = chatStore.getState().thread;
          if (currentThread?.id === threadId) {
            chatStore.setState(
              { thread: { ...currentThread, title: titleResult.data } },
              false,
              'thread/updateTitle',
            );
          }
        }
      }

      // Immediately update sidebar/list caches with the new title from the response
      // This prevents waiting for a refetch and shows the update instantly
      queryClient.setQueriesData(
        {
          predicate: (query) => {
            if (!Array.isArray(query.queryKey) || query.queryKey.length < 2) {
              return false;
            }
            return query.queryKey[1] === 'list' || query.queryKey[1] === 'sidebar';
          },
          queryKey: queryKeys.threads.all,
        },
        (old) => {
          const parsedQuery = validateInfiniteQueryCache(old);
          if (!parsedQuery) {
            return old;
          }

          return {
            ...parsedQuery,
            pages: parsedQuery.pages.map((page: PaginatedPageCache) => {
              if (!page.success || !page.data?.items) {
                return page;
              }

              return {
                ...page,
                data: {
                  ...page.data,
                  items: page.data.items.map((thread: z.infer<typeof ChatThreadCacheSchema>) => {
                    const threadData = ChatThreadCacheSchema.safeParse(thread);
                    if (!threadData.success || threadData.data.id !== threadId) {
                      return thread;
                    }

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
          if (!parsedData) {
            return old;
          }

          return {
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
            success: true,
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
            if (!parsedData) {
              return old;
            }

            return {
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
              success: true,
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
 * Delete thread input schema - extends RPC request type with metadata for cache cleanup
 */
const _DeleteThreadInputSchema = z.custom<Parameters<typeof deleteThreadService>[0]>().and(
  z.object({
    projectId: z.string().optional(),
    slug: z.string().optional(),
  }),
);
type DeleteThreadInput = z.infer<typeof _DeleteThreadInputSchema>;

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
            if (!Array.isArray(query.queryKey) || query.queryKey.length < 2) {
              return false;
            }
            return query.queryKey[1] === 'list' || query.queryKey[1] === 'sidebar';
          },
        },
        (old) => {
          const parsedQuery = validateInfiniteQueryCache(old);
          if (!parsedQuery) {
            return old;
          }

          return {
            ...parsedQuery,
            pages: parsedQuery.pages.map((page: PaginatedPageCache) => {
              if (!page.success || !page.data?.items) {
                return page;
              }

              return {
                ...page,
                data: {
                  ...page.data,
                  items: page.data.items.filter((thread: z.infer<typeof ChatThreadCacheSchema>) => {
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
            if (!parsedQuery) {
              return old;
            }

            return {
              ...parsedQuery,
              pages: parsedQuery.pages.map((page: PaginatedPageCache) => {
                if (!page.success || !page.data?.items) {
                  return page;
                }

                return {
                  ...page,
                  data: {
                    ...page.data,
                    items: page.data.items.filter((thread: z.infer<typeof ChatThreadCacheSchema>) => {
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
    onError: (_error, _variables, context) => {
      if (context?.previousThreads) {
        queryClient.setQueryData(queryKeys.threads.all, context.previousThreads);
      }
      if (context?.previousUsage) {
        queryClient.setQueryData(queryKeys.usage.stats(), context.previousUsage);
      }
    },
    onSuccess: (data, _variables, context) => {
      if (!context) {
        return;
      }
      const { slug, threadId } = context;

      // Use projectId from response (fallback to context if not available)
      const projectId = (data.success && data.data?.projectId)
        ? data.data.projectId
        : context.projectId;

      // Remove all thread-specific caches
      queryClient.removeQueries({ queryKey: queryKeys.threads.detail(threadId) });
      queryClient.removeQueries({ queryKey: queryKeys.threads.messages(threadId) });
      queryClient.removeQueries({ queryKey: queryKeys.threads.changelog(threadId) });
      queryClient.removeQueries({ queryKey: queryKeys.threads.preSearches(threadId) });
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
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.context(projectId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.sidebar() });
      }

      // Invalidate usage stats
      queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useToggleFavoriteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ isFavorite, threadId }: ToggleFavoriteInput) =>
      updateThreadService({ json: { isFavorite }, param: { id: threadId } }),
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
          if (!old || typeof old !== 'object') {
            return old;
          }
          if (!('pages' in old)) {
            return old;
          }
          const pages = validateThreadsListPages(old.pages);
          if (!pages) {
            return old;
          }

          return {
            ...old,
            pages: pages.map((page: ThreadsListCachePage) => {
              if (!page.success || !page.data?.items) {
                return page;
              }

              return {
                ...page,
                data: {
                  ...page.data,
                  items: page.data.items.map((thread: z.infer<typeof ChatThreadCacheSchema>) =>
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
            if (!parsedData) {
              return old;
            }

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
          if (!parsedData) {
            return old;
          }

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
    mutationFn: ({ isPublic, threadId }: TogglePublicInput) =>
      updateThreadService({ json: { isPublic }, param: { id: threadId } }),
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
          if (!parsedData) {
            return old;
          }

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
            if (!parsedData) {
              return old;
            }

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
    onError: (_error, _variables, context) => {
      if (context?.threadId && context?.previousDetail) {
        queryClient.setQueryData(queryKeys.threads.detail(context.threadId), context.previousDetail);
      }
      if (context?.slug && context?.previousBySlug) {
        queryClient.setQueryData(queryKeys.threads.bySlug(context.slug), context.previousBySlug);
      }
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
          if (!old || typeof old !== 'object') {
            return old;
          }
          if (!('success' in old) || !old.success) {
            return old;
          }
          if (!('data' in old) || !old.data || typeof old.data !== 'object') {
            return old;
          }

          const data = validateThreadDetailCache(old.data);
          if (!data) {
            return old;
          }

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
          if (!cache || !cache.data.participants) {
            return old;
          }

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
      if (!threadId) {
        return { previousThread: null, threadId: null };
      }

      await queryClient.cancelQueries({ queryKey: queryKeys.threads.detail(threadId) });

      const previousThread = queryClient.getQueryData(queryKeys.threads.detail(threadId));

      queryClient.setQueryData(
        queryKeys.threads.detail(threadId),
        (old) => {
          if (!old || typeof old !== 'object') {
            return old;
          }
          if (!('success' in old) || !old.success) {
            return old;
          }
          if (!('data' in old) || !old.data || typeof old.data !== 'object') {
            return old;
          }

          const data = validateThreadDetailCache(old.data);
          if (!data) {
            return old;
          }

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
      if (!threadId) {
        return { previousThread: null, threadId: null };
      }

      await queryClient.cancelQueries({ queryKey: queryKeys.threads.detail(threadId) });

      const previousThread = queryClient.getQueryData(queryKeys.threads.detail(threadId));

      queryClient.setQueryData(
        queryKeys.threads.detail(threadId),
        (old) => {
          if (!old || typeof old !== 'object') {
            return old;
          }
          if (!('success' in old) || !old.success) {
            return old;
          }
          if (!('data' in old) || !old.data || typeof old.data !== 'object') {
            return old;
          }

          const data = validateThreadDetailCache(old.data);
          if (!data) {
            return old;
          }

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
      // Invalidate userPresets - presets reference roles and become stale when roles change
      queryClient.invalidateQueries({ queryKey: queryKeys.userPresets.all });
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

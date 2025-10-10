/**
 * Chat Mutation Hooks
 *
 * TanStack Mutation hooks for all chat operations
 * Following patterns from checkout.ts and subscription-management.ts
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import {
  addParticipantService,
  createCustomRoleService,
  createMemoryService,
  createThreadService,
  deleteCustomRoleService,
  deleteMemoryService,
  deleteParticipantService,
  deleteThreadService,
  updateCustomRoleService,
  updateMemoryService,
  updateParticipantService,
  updateThreadService,
} from '@/services/api';

// ============================================================================
// Thread Mutations
// ============================================================================

/**
 * Hook to create a new chat thread
 * Protected endpoint - requires authentication
 *
 * After successful creation, invalidates thread lists and usage stats
 */
export function useCreateThreadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createThreadService,
    onSuccess: () => {
      // Invalidate thread lists and usage stats
      invalidationPatterns.threads.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to create thread', error);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to update thread details
 * Protected endpoint - requires authentication
 *
 * After successful update, invalidates specific thread and lists
 */
export function useUpdateThreadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, data }: Parameters<typeof updateThreadService>[0] extends string ? { threadId: string; data: Parameters<typeof updateThreadService>[1] } : never) =>
      updateThreadService(threadId, data),
    onSuccess: (_data, variables) => {
      // Invalidate specific thread and lists
      invalidationPatterns.threadDetail(variables.threadId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to update thread', error);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to delete a thread
 * Protected endpoint - requires authentication
 *
 * After successful deletion, invalidates thread lists and usage stats
 */
export function useDeleteThreadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteThreadService,
    onSuccess: () => {
      // Invalidate thread lists and usage stats
      invalidationPatterns.threads.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to delete thread', error);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to toggle thread favorite status
 * Protected endpoint - requires authentication
 *
 * Uses optimistic updates for instant UI feedback
 * Rolls back on error
 */
export function useToggleFavoriteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, isFavorite }: { threadId: string; isFavorite: boolean; slug?: string }) =>
      updateThreadService(threadId, { json: { isFavorite } }),
    // Optimistic update: Update UI immediately before server response
    onMutate: async (variables) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all });
      if (variables.slug) {
        await queryClient.cancelQueries({ queryKey: queryKeys.threads.bySlug(variables.slug) });
      }

      // Snapshot the previous values for rollback
      const previousThreads = queryClient.getQueryData(queryKeys.threads.all);
      const previousBySlug = variables.slug
        ? queryClient.getQueryData(queryKeys.threads.bySlug(variables.slug))
        : null;

      // Optimistically update all thread list queries
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all },
        (old: unknown) => {
          if (!old || typeof old !== 'object')
            return old;
          if (!('pages' in old))
            return old;
          const pages = old.pages as Array<{ success: boolean; data?: { items?: Array<{ id: string; isFavorite?: boolean }> } }>;

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

      // Optimistically update bySlug query if slug is provided
      if (variables.slug) {
        queryClient.setQueryData(
          queryKeys.threads.bySlug(variables.slug),
          (old: unknown) => {
            if (!old || typeof old !== 'object')
              return old;
            if (!('success' in old) || !old.success)
              return old;
            if (!('data' in old) || !old.data || typeof old.data !== 'object')
              return old;
            if (!('thread' in old.data))
              return old;

            return {
              ...old,
              data: {
                ...(old.data as Record<string, unknown>),
                thread: {
                  ...(old.data as { thread: Record<string, unknown> }).thread,
                  isFavorite: variables.isFavorite,
                },
              },
            };
          },
        );
      }

      // Return context with previous values for rollback
      return { previousThreads, previousBySlug, slug: variables.slug };
    },
    // On error, rollback to previous values
    onError: (error, _variables, context) => {
      if (context?.previousThreads) {
        queryClient.setQueryData(queryKeys.threads.all, context.previousThreads);
      }
      if (context?.slug && context?.previousBySlug) {
        queryClient.setQueryData(queryKeys.threads.bySlug(context.slug), context.previousBySlug);
      }
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to toggle favorite', error);
      }
    },
    // On success, invalidate to ensure data is in sync
    onSettled: (_data, _error, variables) => {
      invalidationPatterns.threadDetail(variables.threadId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      if (variables.slug) {
        queryClient.invalidateQueries({ queryKey: queryKeys.threads.bySlug(variables.slug) });
      }
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to toggle thread public/private status
 * Protected endpoint - requires authentication
 *
 * Uses optimistic updates for instant UI feedback
 * Rolls back on error
 * Triggers ISR revalidation for public pages
 */
export function useTogglePublicMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, isPublic }: { threadId: string; isPublic: boolean; slug?: string }) =>
      updateThreadService(threadId, { json: { isPublic } }),
    // Optimistic update: Update UI immediately before server response
    onMutate: async (variables) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all });
      if (variables.slug) {
        await queryClient.cancelQueries({ queryKey: queryKeys.threads.bySlug(variables.slug) });
      }

      // Snapshot the previous values for rollback
      const previousThreads = queryClient.getQueryData(queryKeys.threads.all);
      const previousBySlug = variables.slug
        ? queryClient.getQueryData(queryKeys.threads.bySlug(variables.slug))
        : null;

      // Optimistically update all thread list queries
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all },
        (old: unknown) => {
          if (!old || typeof old !== 'object')
            return old;
          if (!('pages' in old))
            return old;
          const pages = old.pages as Array<{ success: boolean; data?: { items?: Array<{ id: string; isPublic?: boolean }> } }>;

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
                      ? { ...thread, isPublic: variables.isPublic }
                      : thread,
                  ),
                },
              };
            }),
          };
        },
      );

      // Optimistically update bySlug query if slug is provided
      if (variables.slug) {
        queryClient.setQueryData(
          queryKeys.threads.bySlug(variables.slug),
          (old: unknown) => {
            if (!old || typeof old !== 'object')
              return old;
            if (!('success' in old) || !old.success)
              return old;
            if (!('data' in old) || !old.data || typeof old.data !== 'object')
              return old;
            if (!('thread' in old.data))
              return old;

            return {
              ...old,
              data: {
                ...(old.data as Record<string, unknown>),
                thread: {
                  ...(old.data as { thread: Record<string, unknown> }).thread,
                  isPublic: variables.isPublic,
                },
              },
            };
          },
        );
      }

      // Return context with previous values for rollback
      return { previousThreads, previousBySlug, slug: variables.slug };
    },
    // On error, rollback to previous values
    onError: (error, _variables, context) => {
      if (context?.previousThreads) {
        queryClient.setQueryData(queryKeys.threads.all, context.previousThreads);
      }
      if (context?.slug && context?.previousBySlug) {
        queryClient.setQueryData(queryKeys.threads.bySlug(context.slug), context.previousBySlug);
      }
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to toggle public status', error);
      }
    },
    // On success, trigger ISR revalidation and invalidate queries
    onSuccess: async (_data, variables) => {
      // Trigger ISR revalidation for public page using Server Action
      if (variables.slug) {
        try {
          const action = variables.isPublic ? 'publish' : 'unpublish';
          const { revalidatePublicThread } = await import('@/app/auth/actions');
          const result = await revalidatePublicThread(variables.slug, action);

          if (!result.success) {
            console.warn('ISR revalidation failed (non-critical):', result.error);
          }
        } catch (revalidateError) {
          // Don't fail the mutation if revalidation fails
          // The page will be regenerated on next request
          console.error('ISR revalidation failed (non-critical):', revalidateError);
        }
      }

      // Invalidate to ensure data is in sync
      invalidationPatterns.threadDetail(variables.threadId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      if (variables.slug) {
        queryClient.invalidateQueries({ queryKey: queryKeys.threads.bySlug(variables.slug) });
        // Invalidate public query as well
        queryClient.invalidateQueries({ queryKey: queryKeys.threads.public(variables.slug) });
      }
    },
    retry: false,
    throwOnError: false,
  });
}

// ============================================================================
// Message Mutations
// ============================================================================
// NOTE: useSendMessageMutation removed - use AI SDK v5 useChat hook for all message operations
// All messages are now streamed via streamChatService for better UX
// Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot

// ============================================================================
// Participant Mutations
// ============================================================================

/**
 * Hook to add a participant to a thread
 * Protected endpoint - requires authentication
 *
 * After successful addition, invalidates specific thread
 */
export function useAddParticipantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, data }: Parameters<typeof addParticipantService>[0] extends string ? { threadId: string; data: Parameters<typeof addParticipantService>[1] } : never) =>
      addParticipantService(threadId, data),
    onSuccess: (_data, variables) => {
      // Invalidate specific thread
      invalidationPatterns.threadDetail(variables.threadId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to add participant', error);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to update participant settings
 * Protected endpoint - requires authentication
 *
 * After successful update, invalidates all thread lists (we don't know which thread)
 */
export function useUpdateParticipantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ participantId, data }: Parameters<typeof updateParticipantService>[0] extends string ? { participantId: string; data: Parameters<typeof updateParticipantService>[1]; threadId?: string } : never) =>
      updateParticipantService(participantId, data),
    onSuccess: (_data, variables) => {
      // If threadId is provided, use specific invalidation (includes changelog)
      if (variables.threadId) {
        invalidationPatterns.threadDetail(variables.threadId).forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      } else {
        // Fallback: Invalidate all thread data (we don't know which thread the participant belongs to)
        queryClient.invalidateQueries({ queryKey: queryKeys.threads.all });
      }
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to update participant', error);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to delete a participant from a thread
 * Protected endpoint - requires authentication
 *
 * After successful deletion, invalidates all thread lists
 */
export function useDeleteParticipantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ participantId }: { participantId: string; threadId?: string }) =>
      deleteParticipantService(participantId),
    onSuccess: (_data, variables) => {
      // If threadId is provided, use specific invalidation (includes changelog)
      if (variables.threadId) {
        invalidationPatterns.threadDetail(variables.threadId).forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      } else {
        // Fallback: Invalidate all thread data
        queryClient.invalidateQueries({ queryKey: queryKeys.threads.all });
      }
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to delete participant', error);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

// ============================================================================
// Memory Mutations
// ============================================================================

/**
 * Hook to create a new memory
 * Protected endpoint - requires authentication
 *
 * After successful creation, invalidates memory lists and usage stats
 */
export function useCreateMemoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMemoryService,
    onSuccess: () => {
      // Invalidate memory lists and usage stats
      invalidationPatterns.memories.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to create memory', error);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to update memory details
 * Protected endpoint - requires authentication
 *
 * After successful update, invalidates specific memory and lists
 */
export function useUpdateMemoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ memoryId, data }: Parameters<typeof updateMemoryService>[0] extends string ? { memoryId: string; data: Parameters<typeof updateMemoryService>[1] } : never) =>
      updateMemoryService(memoryId, data),
    onSuccess: (_data, variables) => {
      // Invalidate specific memory and lists
      invalidationPatterns.memoryDetail(variables.memoryId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to update memory', error);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to delete a memory
 * Protected endpoint - requires authentication
 *
 * After successful deletion, invalidates memory lists and usage stats
 */
export function useDeleteMemoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteMemoryService,
    onSuccess: () => {
      // Invalidate memory lists and usage stats
      invalidationPatterns.memories.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to delete memory', error);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

// ============================================================================
// Custom Role Mutations
// ============================================================================

/**
 * Hook to create a new custom role
 * Protected endpoint - requires authentication
 *
 * After successful creation, invalidates custom role lists and usage stats
 */
export function useCreateCustomRoleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCustomRoleService,
    onSuccess: () => {
      // Invalidate custom role lists and usage stats
      invalidationPatterns.customRoles.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to create custom role', error);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to update custom role details
 * Protected endpoint - requires authentication
 *
 * After successful update, invalidates specific role and lists
 */
export function useUpdateCustomRoleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ roleId, data }: Parameters<typeof updateCustomRoleService>[0] extends string ? { roleId: string; data: Parameters<typeof updateCustomRoleService>[1] } : never) =>
      updateCustomRoleService(roleId, data),
    onSuccess: (_data, variables) => {
      // Invalidate specific role and lists
      invalidationPatterns.customRoleDetail(variables.roleId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to update custom role', error);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to delete a custom role
 * Protected endpoint - requires authentication
 *
 * After successful deletion, invalidates custom role lists and usage stats
 */
export function useDeleteCustomRoleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCustomRoleService,
    onSuccess: () => {
      // Invalidate custom role lists and usage stats
      invalidationPatterns.customRoles.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to delete custom role', error);
      }
    },
    retry: false,
    throwOnError: false,
  });
}

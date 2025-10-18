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
  createThreadService,
  deleteCustomRoleService,
  deleteParticipantService,
  deleteThreadService,
  setRoundFeedbackService,
  updateCustomRoleService,
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
    // ✅ OPTIMISTIC UPDATE: Immediately increment thread count for instant UI feedback
    onMutate: async () => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.usage.stats() });

      // Snapshot the previous value for rollback
      const previousUsage = queryClient.getQueryData(queryKeys.usage.stats());

      // Optimistically update thread count
      queryClient.setQueryData(
        queryKeys.usage.stats(),
        (oldData: unknown) => {
          if (!oldData || typeof oldData !== 'object')
            return oldData;
          if (!('success' in oldData) || !oldData.success)
            return oldData;
          if (!('data' in oldData) || !oldData.data || typeof oldData.data !== 'object')
            return oldData;

          const data = oldData.data as {
            messages: { used: number; limit: number; remaining: number; percentage: number };
            threads: { used: number; limit: number; remaining: number; percentage: number };
            subscription: unknown;
            period: unknown;
          };

          // ✅ OPTIMISTIC UPDATE: Only increment 'used' count
          // Backend will recompute remaining, percentage, and status on next fetch
          return {
            ...oldData,
            data: {
              ...data,
              threads: {
                ...data.threads,
                used: data.threads.used + 1,
                // Keep existing values - backend will provide correct values on refetch
                remaining: data.threads.remaining,
                percentage: data.threads.percentage,
                status: 'status' in data.threads ? data.threads.status : 'default',
              },
            },
          };
        },
      );

      // Return context with previous value for rollback
      return { previousUsage };
    },
    // On error, rollback to previous value
    onError: (_unusedError, _unusedVariables, context) => {
      if (context?.previousUsage) {
        queryClient.setQueryData(queryKeys.usage.stats(), context.previousUsage);
      }
    },
    onSuccess: () => {
      // Invalidate thread lists and usage stats (including quotas)
      // Note: Full usage stats are invalidated because thread creation counts toward quota
      invalidationPatterns.threads.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      // Also invalidate full usage stats for real-time sidebar update
      queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });
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
    mutationFn: updateThreadService,
    onSuccess: (_data, data) => {
      // Invalidate specific thread and lists
      invalidationPatterns.threadDetail(data.param.id).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: () => {
      // Error is handled by throwOnError: false
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
      // Invalidate thread lists and usage stats (including quotas)
      invalidationPatterns.threads.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      // Also invalidate full usage stats for real-time sidebar update
      queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });
    },
    onError: () => {
      // Error is handled by throwOnError: false
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
      updateThreadService({ param: { id: threadId }, json: { isFavorite } }),
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
    onError: (_unusedError, _unusedVariables, context) => {
      if (context?.previousThreads) {
        queryClient.setQueryData(queryKeys.threads.all, context.previousThreads);
      }
      if (context?.slug && context?.previousBySlug) {
        queryClient.setQueryData(queryKeys.threads.bySlug(context.slug), context.previousBySlug);
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
      updateThreadService({ param: { id: threadId }, json: { isPublic } }),
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
    onError: (_unusedError, _unusedVariables, context) => {
      if (context?.previousThreads) {
        queryClient.setQueryData(queryKeys.threads.all, context.previousThreads);
      }
      if (context?.slug && context?.previousBySlug) {
        queryClient.setQueryData(queryKeys.threads.bySlug(context.slug), context.previousBySlug);
      }
    },
    // On success, trigger ISR revalidation and invalidate queries
    onSuccess: async (_data, variables) => {
      // Trigger ISR revalidation for public page using Server Action
      if (variables.slug) {
        try {
          const action = variables.isPublic ? 'publish' : 'unpublish';
          const { revalidatePublicThread } = await import('@/app/auth/actions');
          await revalidatePublicThread(variables.slug, action);
        } catch {
          // Don't fail the mutation if revalidation fails
          // The page will be regenerated on next request
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
    mutationFn: addParticipantService,
    onSuccess: (_data, data) => {
      // Invalidate specific thread
      invalidationPatterns.threadDetail(data.param.id).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: () => {
      // Error is handled by throwOnError: false
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
    mutationFn: (data: Parameters<typeof updateParticipantService>[0] & { threadId?: string }) =>
      updateParticipantService(data),
    onSuccess: (_data, data) => {
      // If threadId is provided, use specific invalidation (includes changelog)
      if (data.threadId) {
        invalidationPatterns.threadDetail(data.threadId).forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      } else {
        // Fallback: Invalidate all thread data (we don't know which thread the participant belongs to)
        queryClient.invalidateQueries({ queryKey: queryKeys.threads.all });
      }
    },
    onError: () => {
      // Error is handled by throwOnError: false
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
    mutationFn: (data: Parameters<typeof deleteParticipantService>[0] & { threadId?: string }) =>
      deleteParticipantService(data),
    onSuccess: (_data, data) => {
      // If threadId is provided, use specific invalidation (includes changelog)
      if (data.threadId) {
        invalidationPatterns.threadDetail(data.threadId).forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      } else {
        // Fallback: Invalidate all thread data
        queryClient.invalidateQueries({ queryKey: queryKeys.threads.all });
      }
    },
    onError: () => {
      // Error is handled by throwOnError: false
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
    onError: () => {
      // Error is handled by throwOnError: false
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
    mutationFn: updateCustomRoleService,
    onSuccess: (_data, data) => {
      // Invalidate specific role and lists
      invalidationPatterns.customRoleDetail(data.param.id).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: () => {
      // Error is handled by throwOnError: false
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
    onError: () => {
      // Error is handled by throwOnError: false
    },
    retry: false,
    throwOnError: false,
  });
}

// ============================================================================
// Analysis Mutations
// ============================================================================

/**
 * ❌ REMOVED: useTriggerAnalysisMutation
 *
 * Analysis is now handled via:
 * 1. Auto-detection on backend (streamChatHandler onFinish callback)
 * 2. On-demand streaming via useObject hook from @ai-sdk/react
 *
 * No manual mutation needed - analysis streams automatically when component renders
 * Reference: See src/components/chat/round-analysis-stream.tsx for usage
 */

// ============================================================================
// Round Feedback Mutations
// ============================================================================

/**
 * Hook to set round feedback (like/dislike)
 * Protected endpoint - requires authentication
 *
 * Optimistically updates the feedback list for instant UI feedback
 */
export function useSetRoundFeedbackMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: setRoundFeedbackService,
    // ✅ OPTIMISTIC UPDATE: Immediately update feedback for instant UI
    onMutate: async ({ param }) => {
      const { threadId } = param;

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.feedback(threadId) });

      // Snapshot previous value
      const previousFeedback = queryClient.getQueryData(queryKeys.threads.feedback(threadId));

      return { previousFeedback, threadId };
    },
    // On error, rollback
    onError: (_error, _variables, context) => {
      if (context?.previousFeedback && context?.threadId) {
        queryClient.setQueryData(
          queryKeys.threads.feedback(context.threadId),
          context.previousFeedback,
        );
      }
    },
    // On success or error (settled), invalidate to get fresh data
    onSettled: (_data, _error, { param }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.feedback(param.threadId) });
    },
    retry: false,
    throwOnError: false,
  });
}

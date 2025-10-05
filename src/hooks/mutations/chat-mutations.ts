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
  sendMessageService,
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
    retry: (failureCount, error: unknown) => {
      // Don't retry on client errors (4xx)
      const httpError = error as { status?: number };
      if (httpError?.status && httpError.status >= 400 && httpError.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
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
    retry: (failureCount, error: unknown) => {
      const httpError = error as { status?: number };
      if (httpError?.status && httpError.status >= 400 && httpError.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
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
    retry: (failureCount, error: unknown) => {
      const httpError = error as { status?: number };
      if (httpError?.status && httpError.status >= 400 && httpError.status < 500) {
        return false;
      }
      return failureCount < 1; // Only retry once for delete operations
    },
    throwOnError: false,
  });
}

/**
 * Hook to toggle thread favorite status
 * Protected endpoint - requires authentication
 *
 * After successful toggle, invalidates specific thread and lists
 */
export function useToggleFavoriteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, isFavorite }: { threadId: string; isFavorite: boolean }) =>
      updateThreadService(threadId, { json: { isFavorite } }),
    onSuccess: (_data, variables) => {
      // Invalidate specific thread and lists
      invalidationPatterns.threadDetail(variables.threadId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to toggle favorite', error);
      }
    },
    retry: (failureCount, error: unknown) => {
      const httpError = error as { status?: number };
      if (httpError?.status && httpError.status >= 400 && httpError.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
    throwOnError: false,
  });
}

// ============================================================================
// Message Mutations
// ============================================================================

/**
 * Hook to send a message to a thread
 * Protected endpoint - requires authentication
 *
 * After successful send, invalidates thread details and usage stats
 */
export function useSendMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, data }: Parameters<typeof sendMessageService>[0] extends string ? { threadId: string; data: Parameters<typeof sendMessageService>[1] } : never) =>
      sendMessageService(threadId, data),
    onSuccess: (_data, variables) => {
      // Invalidate thread details and usage stats
      invalidationPatterns.afterThreadMessage(variables.threadId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to send message', error);
      }
    },
    retry: (failureCount, error: unknown) => {
      const httpError = error as { status?: number };
      if (httpError?.status && httpError.status >= 400 && httpError.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
    throwOnError: false,
  });
}

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
    retry: (failureCount, error: unknown) => {
      const httpError = error as { status?: number };
      if (httpError?.status && httpError.status >= 400 && httpError.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
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
    mutationFn: ({ participantId, data }: Parameters<typeof updateParticipantService>[0] extends string ? { participantId: string; data: Parameters<typeof updateParticipantService>[1] } : never) =>
      updateParticipantService(participantId, data),
    onSuccess: () => {
      // Invalidate all thread data (we don't know which thread the participant belongs to)
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.all });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to update participant', error);
      }
    },
    retry: (failureCount, error: unknown) => {
      const httpError = error as { status?: number };
      if (httpError?.status && httpError.status >= 400 && httpError.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
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
    mutationFn: deleteParticipantService,
    onSuccess: () => {
      // Invalidate all thread data
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.all });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to delete participant', error);
      }
    },
    retry: (failureCount, error: unknown) => {
      const httpError = error as { status?: number };
      if (httpError?.status && httpError.status >= 400 && httpError.status < 500) {
        return false;
      }
      return failureCount < 1;
    },
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
    retry: (failureCount, error: unknown) => {
      const httpError = error as { status?: number };
      if (httpError?.status && httpError.status >= 400 && httpError.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
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
    retry: (failureCount, error: unknown) => {
      const httpError = error as { status?: number };
      if (httpError?.status && httpError.status >= 400 && httpError.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
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
    retry: (failureCount, error: unknown) => {
      const httpError = error as { status?: number };
      if (httpError?.status && httpError.status >= 400 && httpError.status < 500) {
        return false;
      }
      return failureCount < 1;
    },
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
    retry: (failureCount, error: unknown) => {
      const httpError = error as { status?: number };
      if (httpError?.status && httpError.status >= 400 && httpError.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
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
    retry: (failureCount, error: unknown) => {
      const httpError = error as { status?: number };
      if (httpError?.status && httpError.status >= 400 && httpError.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
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
    retry: (failureCount, error: unknown) => {
      const httpError = error as { status?: number };
      if (httpError?.status && httpError.status >= 400 && httpError.status < 500) {
        return false;
      }
      return failureCount < 1;
    },
    throwOnError: false,
  });
}

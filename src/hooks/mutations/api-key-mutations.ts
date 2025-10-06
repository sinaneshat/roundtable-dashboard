/**
 * API Key Mutation Hooks
 *
 * TanStack Mutation hooks for all API key operations
 * Following patterns from chat-mutations.ts and subscription-management.ts
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
import type { listApiKeysService } from '@/services/api';
import {
  createApiKeyService,
  deleteApiKeyService,
  updateApiKeyService,
} from '@/services/api';

// ============================================================================
// API Key Mutations
// ============================================================================

/**
 * Hook to create a new API key
 * Protected endpoint - requires authentication
 *
 * After successful creation:
 * - Invalidates API key lists to show the new key
 * - Returns the key value (only shown once)
 */
export function useCreateApiKeyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createApiKeyService,
    onSuccess: () => {
      // Invalidate all API key related queries to ensure UI updates
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys.all,
        refetchType: 'active',
      });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to create API key', error);
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
 * Hook to update an API key
 * Protected endpoint - requires authentication
 *
 * After successful update:
 * - Immediately updates the API keys list cache with updated data
 * - Invalidates specific key and lists to ensure consistency
 */
export function useUpdateApiKeyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ keyId, ...data }: Parameters<typeof updateApiKeyService>[1] & { keyId: string }) =>
      updateApiKeyService(keyId, data),
    onSuccess: (response) => {
      // Immediately update the API keys list cache with the updated key
      if (response.success && response.data?.apiKey) {
        const updatedApiKey = response.data.apiKey;

        queryClient.setQueryData<Awaited<ReturnType<typeof listApiKeysService>>>(
          queryKeys.apiKeys.list(),
          (oldData) => {
            if (!oldData?.success || !oldData.data?.apiKeys) {
              return oldData;
            }

            // Replace the updated API key in the list
            const updatedApiKeys = oldData.data.apiKeys.map(key =>
              key.id === updatedApiKey.id ? updatedApiKey : key,
            );

            return {
              ...oldData,
              data: {
                ...oldData.data,
                apiKeys: updatedApiKeys,
              },
            };
          },
        );
      }

      // Invalidate all API key related queries to ensure UI updates
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys.all,
        refetchType: 'active',
      });
    },
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to update API key', error);
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
 * Hook to delete an API key
 * Protected endpoint - requires authentication
 *
 * After successful deletion:
 * - Optimistically removes the key from cache
 * - Invalidates API key lists to ensure consistency
 */
export function useDeleteApiKeyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteApiKeyService,
    // Optimistic update: Remove key from UI immediately before server response
    onMutate: async (keyId: string) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.apiKeys.all });

      // Snapshot the previous value for rollback
      const previousApiKeys = queryClient.getQueryData(queryKeys.apiKeys.list());

      // Optimistically remove the key from the list
      queryClient.setQueryData<Awaited<ReturnType<typeof listApiKeysService>>>(
        queryKeys.apiKeys.list(),
        (oldData) => {
          if (!oldData?.success || !oldData.data?.apiKeys) {
            return oldData;
          }

          // Filter out the deleted key
          const filteredApiKeys = oldData.data.apiKeys.filter(key => key.id !== keyId);

          return {
            ...oldData,
            data: {
              ...oldData.data,
              apiKeys: filteredApiKeys,
            },
          };
        },
      );

      // Return context with previous value for rollback
      return { previousApiKeys };
    },
    // On error: Rollback to previous state
    onError: (error, keyId, context) => {
      // Restore the previous state
      if (context?.previousApiKeys) {
        queryClient.setQueryData(
          queryKeys.apiKeys.list(),
          context.previousApiKeys,
        );
      }

      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to delete API key', error);
      }
    },
    // On success: Just ensure data is in sync (already updated optimistically)
    onSettled: () => {
      // Invalidate to ensure server state is in sync
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys.all,
        refetchType: 'active',
      });
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

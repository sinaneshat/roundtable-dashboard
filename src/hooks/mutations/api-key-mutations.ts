/**
 * API Key Mutation Hooks
 *
 * TanStack Mutation hooks for all API key operations
 * Following patterns from chat-mutations.ts and subscription-management.ts
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
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
    retry: false,
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
    mutationFn: updateApiKeyService,
    onSuccess: (response) => {
      // Immediately update the API keys list cache with the updated key
      if (response.success && response.data?.apiKey) {
        const updatedApiKey = response.data.apiKey;

        queryClient.setQueryData(
          queryKeys.apiKeys.list(),
          (oldData: unknown) => {
            if (!oldData || typeof oldData !== 'object' || !('success' in oldData) || !oldData.success) {
              return oldData;
            }
            if (!('data' in oldData) || !oldData.data || typeof oldData.data !== 'object') {
              return oldData;
            }
            if (!('items' in oldData.data) || !Array.isArray(oldData.data.items)) {
              return oldData;
            }

            // Replace the updated API key in the list
            const updatedApiKeys = oldData.data.items.map(
              key => (typeof key === 'object' && key && 'id' in key && key.id === updatedApiKey.id) ? updatedApiKey : key,
            );

            return {
              ...oldData,
              data: {
                ...oldData.data,
                items: updatedApiKeys,
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
    onMutate: async (data) => {
      const keyId = data.param?.keyId;
      if (!keyId)
        return;
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.apiKeys.all });

      // Snapshot the previous value for rollback
      const previousApiKeys = queryClient.getQueryData(queryKeys.apiKeys.list());

      // Optimistically remove the key from the list
      queryClient.setQueryData(
        queryKeys.apiKeys.list(),
        (oldData: unknown) => {
          if (!oldData || typeof oldData !== 'object' || !('success' in oldData) || !oldData.success) {
            return oldData;
          }
          if (!('data' in oldData) || !oldData.data || typeof oldData.data !== 'object') {
            return oldData;
          }
          if (!('items' in oldData.data) || !Array.isArray(oldData.data.items)) {
            return oldData;
          }

          // Filter out the deleted key
          const filteredApiKeys = oldData.data.items.filter(
            key => !(typeof key === 'object' && key && 'id' in key && key.id === keyId),
          );

          return {
            ...oldData,
            data: {
              ...oldData.data,
              items: filteredApiKeys,
            },
          };
        },
      );

      // Return context with previous value for rollback
      return { previousApiKeys };
    },
    // On error: Rollback to previous state
    onError: (_error, _keyId, context) => {
      // Restore the previous state
      if (context?.previousApiKeys) {
        queryClient.setQueryData(
          queryKeys.apiKeys.list(),
          context.previousApiKeys,
        );
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

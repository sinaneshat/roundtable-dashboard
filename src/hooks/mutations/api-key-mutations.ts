'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { shouldRetryMutation } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import type {
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  DeleteApiKeyRequest,
  DeleteApiKeyResponse,
  ListApiKeysResponse,
  UpdateApiKeyRequest,
  UpdateApiKeyResponse,
} from '@/services/api';
import {
  createApiKeyService,
  deleteApiKeyService,
  updateApiKeyService,
} from '@/services/api';

export function useCreateApiKeyMutation() {
  const queryClient = useQueryClient();

  return useMutation<CreateApiKeyResponse, Error, CreateApiKeyRequest>({
    mutationFn: createApiKeyService,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys.all,
        refetchType: 'active',
      });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useUpdateApiKeyMutation() {
  const queryClient = useQueryClient();

  return useMutation<UpdateApiKeyResponse, Error, UpdateApiKeyRequest>({
    mutationFn: updateApiKeyService,
    onSuccess: (response) => {
      if (response.success && response.data?.apiKey) {
        const updatedApiKey = response.data.apiKey;

        queryClient.setQueryData<ListApiKeysResponse>(
          queryKeys.apiKeys.list(),
          (oldData) => {
            if (!oldData?.success || !oldData.data?.items)
              return oldData;

            return {
              ...oldData,
              data: {
                ...oldData.data,
                items: oldData.data.items.map(
                  key => (key.id === updatedApiKey.id ? updatedApiKey : key),
                ),
              },
            };
          },
        );
      }

      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys.all,
        refetchType: 'active',
      });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

export function useDeleteApiKeyMutation() {
  const queryClient = useQueryClient();

  return useMutation<DeleteApiKeyResponse, Error, DeleteApiKeyRequest, { previousApiKeys?: ListApiKeysResponse }>({
    mutationFn: deleteApiKeyService,
    onMutate: async (data) => {
      const keyId = data.param?.keyId;
      if (!keyId)
        return { previousApiKeys: undefined };

      await queryClient.cancelQueries({ queryKey: queryKeys.apiKeys.all });

      const previousApiKeys = queryClient.getQueryData<ListApiKeysResponse>(queryKeys.apiKeys.list());

      queryClient.setQueryData<ListApiKeysResponse>(
        queryKeys.apiKeys.list(),
        (oldData) => {
          if (!oldData?.success || !oldData.data?.items)
            return oldData;

          return {
            ...oldData,
            data: {
              ...oldData.data,
              items: oldData.data.items.filter(key => key.id !== keyId),
            },
          };
        },
      );

      return { previousApiKeys };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousApiKeys) {
        queryClient.setQueryData(
          queryKeys.apiKeys.list(),
          context.previousApiKeys,
        );
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys.all,
        refetchType: 'active',
      });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

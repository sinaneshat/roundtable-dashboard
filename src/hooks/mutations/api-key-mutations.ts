'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { shouldRetryMutation } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import type {
  CreateApiKeyResponse,
  DeleteApiKeyResponse,
  ListApiKeysResponse,
} from '@/services/api';
import {
  createApiKeyService,
  deleteApiKeyService,
} from '@/services/api';

export function useCreateApiKeyMutation() {
  const queryClient = useQueryClient();

  return useMutation<CreateApiKeyResponse, Error, Parameters<typeof createApiKeyService>[0]>({
    mutationFn: createApiKeyService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useDeleteApiKeyMutation() {
  const queryClient = useQueryClient();

  type Context = { previousApiKeys?: ListApiKeysResponse };

  return useMutation<DeleteApiKeyResponse, Error, Parameters<typeof deleteApiKeyService>[0], Context>({
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

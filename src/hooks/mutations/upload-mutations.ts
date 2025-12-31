'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { shouldRetryMutation } from '@/hooks/utils';
import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import type {
  AbortMultipartUploadRequest,
  AbortMultipartUploadResponse,
  CompleteMultipartUploadRequest,
  CompleteMultipartUploadResponse,
  CreateMultipartUploadRequest,
  CreateMultipartUploadResponse,
  DeleteAttachmentRequest,
  DeleteAttachmentResponse,
  ListAttachmentsResponse,
  UpdateAttachmentRequest,
  UpdateAttachmentResponse,
  UploadPartRequestWithBody,
  UploadPartResponse,
} from '@/services/api';
import {
  abortMultipartUploadService,
  completeMultipartUploadService,
  createMultipartUploadService,
  deleteAttachmentService,
  secureUploadService,
  updateAttachmentService,
  uploadPartService,
} from '@/services/api';

type SecureUploadResponse = Awaited<ReturnType<typeof secureUploadService>>;

export function useSecureUploadMutation() {
  const queryClient = useQueryClient();

  return useMutation<SecureUploadResponse, Error, File>({
    mutationFn: secureUploadService,
    onSuccess: () => {
      invalidationPatterns.afterUpload().forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useUpdateAttachmentMutation() {
  const queryClient = useQueryClient();

  return useMutation<UpdateAttachmentResponse, Error, UpdateAttachmentRequest>({
    mutationFn: updateAttachmentService,
    onSuccess: (response, variables) => {
      if (response.success && response.data) {
        const updatedAttachment = response.data;

        queryClient.setQueryData<ListAttachmentsResponse>(
          queryKeys.uploads.list(),
          (oldData) => {
            if (!oldData?.success || !oldData.data?.items) {
              return oldData;
            }

            return {
              ...oldData,
              data: {
                ...oldData.data,
                items: oldData.data.items.map(
                  item => (item.id === updatedAttachment.id ? updatedAttachment : item),
                ),
              },
            };
          },
        );
      }

      invalidationPatterns.uploadDetail(variables.param.id).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

export function useDeleteAttachmentMutation() {
  const queryClient = useQueryClient();

  return useMutation<DeleteAttachmentResponse, Error, DeleteAttachmentRequest, { previousAttachments?: ListAttachmentsResponse }>({
    mutationFn: deleteAttachmentService,
    onMutate: async (data) => {
      const attachmentId = data.param?.id;
      if (!attachmentId)
        return { previousAttachments: undefined };

      await queryClient.cancelQueries({ queryKey: queryKeys.uploads.all });

      const previousAttachments = queryClient.getQueryData<ListAttachmentsResponse>(queryKeys.uploads.list());

      queryClient.setQueryData<ListAttachmentsResponse>(
        queryKeys.uploads.list(),
        (oldData) => {
          if (!oldData?.success || !oldData.data?.items) {
            return oldData;
          }

          return {
            ...oldData,
            data: {
              ...oldData.data,
              items: oldData.data.items.filter(item => item.id !== attachmentId),
            },
          };
        },
      );

      return { previousAttachments };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousAttachments) {
        queryClient.setQueryData(
          queryKeys.uploads.list(),
          context.previousAttachments,
        );
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.uploads.all,
        refetchType: 'active',
      });
    },
    retry: shouldRetryMutation,
    throwOnError: false,
  });
}

export function useCreateMultipartUploadMutation() {
  return useMutation<CreateMultipartUploadResponse, Error, CreateMultipartUploadRequest>({
    mutationFn: createMultipartUploadService,
    retry: false,
    throwOnError: false,
  });
}

export function useUploadPartMutation() {
  return useMutation<UploadPartResponse, Error, UploadPartRequestWithBody>({
    mutationFn: uploadPartService,
    retry: 3,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30000),
    throwOnError: false,
  });
}

export function useCompleteMultipartUploadMutation() {
  const queryClient = useQueryClient();

  return useMutation<CompleteMultipartUploadResponse, Error, CompleteMultipartUploadRequest>({
    mutationFn: completeMultipartUploadService,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.uploads.all,
      });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useAbortMultipartUploadMutation() {
  const queryClient = useQueryClient();

  return useMutation<AbortMultipartUploadResponse, Error, AbortMultipartUploadRequest>({
    mutationFn: abortMultipartUploadService,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.uploads.all,
      });
    },
    retry: false,
    throwOnError: false,
  });
}

export function useMultipartUpload() {
  const createMutation = useCreateMultipartUploadMutation();
  const uploadPartMutation = useUploadPartMutation();
  const completeMutation = useCompleteMultipartUploadMutation();
  const abortMutation = useAbortMultipartUploadMutation();

  return {
    // Mutations
    create: createMutation,
    uploadPart: uploadPartMutation,
    complete: completeMutation,
    abort: abortMutation,

    // Combined loading state
    isUploading:
      createMutation.isPending
      || uploadPartMutation.isPending
      || completeMutation.isPending,

    // Combined error state
    error:
      createMutation.error
      || uploadPartMutation.error
      || completeMutation.error
      || abortMutation.error,

    // Reset all mutations
    reset: () => {
      createMutation.reset();
      uploadPartMutation.reset();
      completeMutation.reset();
      abortMutation.reset();
    },
  };
}

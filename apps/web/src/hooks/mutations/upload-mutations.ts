import { useMutation, useQueryClient } from '@tanstack/react-query';

import { shouldRetryMutation } from '@/hooks/utils';
import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import type { ListAttachmentsResponse } from '@/services/api';
import {
  abortMultipartUploadService,
  completeMultipartUploadService,
  createMultipartUploadService,
  deleteAttachmentService,
  secureUploadService,
  updateAttachmentService,
  uploadPartService,
} from '@/services/api';

// Derive response types from service functions (avoids InferResponseType resolution issues)
type SecureUploadResult = Awaited<ReturnType<typeof secureUploadService>>;
type UpdateAttachmentResult = Awaited<ReturnType<typeof updateAttachmentService>>;
type DeleteAttachmentResult = Awaited<ReturnType<typeof deleteAttachmentService>>;
type CreateMultipartUploadResult = Awaited<ReturnType<typeof createMultipartUploadService>>;
type UploadPartResult = Awaited<ReturnType<typeof uploadPartService>>;
type CompleteMultipartUploadResult = Awaited<ReturnType<typeof completeMultipartUploadService>>;
type AbortMultipartUploadResult = Awaited<ReturnType<typeof abortMultipartUploadService>>;

/**
 * Input type for secure upload mutation
 * Matches secureUploadService parameters as object for mutation compatibility
 */
type SecureUploadInput = {
  file: File;
  signal?: AbortSignal;
};

/**
 * Input type for upload part mutation
 * Augmented with signal for abort support
 */
type UploadPartInput = Parameters<typeof uploadPartService>[0] & {
  signal?: AbortSignal;
};

export function useSecureUploadMutation() {
  const queryClient = useQueryClient();

  return useMutation<SecureUploadResult, Error, SecureUploadInput>({
    mutationFn: ({ file, signal }) => secureUploadService(file, signal),
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

  return useMutation<UpdateAttachmentResult, Error, Parameters<typeof updateAttachmentService>[0]>({
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

  return useMutation<DeleteAttachmentResult, Error, Parameters<typeof deleteAttachmentService>[0], { previousAttachments?: ListAttachmentsResponse }>({
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
  return useMutation<CreateMultipartUploadResult, Error, Parameters<typeof createMultipartUploadService>[0]>({
    mutationFn: createMultipartUploadService,
    retry: false,
    throwOnError: false,
  });
}

export function useUploadPartMutation() {
  return useMutation<UploadPartResult, Error, UploadPartInput>({
    mutationFn: ({ signal, ...data }) => uploadPartService(data, signal),
    retry: (failureCount, error) => {
      // Don't retry if aborted
      if (error.name === 'AbortError')
        return false;
      return failureCount < 3;
    },
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30000),
    throwOnError: false,
  });
}

export function useCompleteMultipartUploadMutation() {
  const queryClient = useQueryClient();

  return useMutation<CompleteMultipartUploadResult, Error, Parameters<typeof completeMultipartUploadService>[0]>({
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

  return useMutation<AbortMultipartUploadResult, Error, Parameters<typeof abortMultipartUploadService>[0]>({
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

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

// Direct import avoids circular dependency through @/hooks/utils barrel export
import { shouldRetryMutation } from '@/hooks/utils/mutation-retry';
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

// ============================================================================
// INPUT TYPE SCHEMAS - Zod-based mutation input types
// ============================================================================

/**
 * Secure upload input schema
 */
const _SecureUploadInputSchema = z.object({
  file: z.custom<File>(val => val instanceof File),
  signal: z.custom<AbortSignal>(val => val === undefined || val instanceof AbortSignal).optional(),
});
type SecureUploadInput = z.infer<typeof _SecureUploadInputSchema>;

/**
 * Upload part input schema - extends RPC request type with signal for abort support
 */
const _UploadPartInputSchema = z.custom<Parameters<typeof uploadPartService>[0]>().and(
  z.object({
    signal: z.custom<AbortSignal>(val => val === undefined || val instanceof AbortSignal).optional(),
  }),
);
type UploadPartInput = z.infer<typeof _UploadPartInputSchema>;

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
          (oldData: ListAttachmentsResponse | undefined) => {
            if (!oldData?.success || !oldData.data?.items) {
              return oldData;
            }

            return {
              ...oldData,
              data: {
                ...oldData.data,
                items: oldData.data.items.map(
                  (item: typeof oldData.data.items[number]) => (item.id === updatedAttachment.id ? updatedAttachment : item),
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

// Context type for optimistic updates
type DeleteAttachmentContext = { previousAttachments?: ListAttachmentsResponse };

export function useDeleteAttachmentMutation() {
  const queryClient = useQueryClient();

  return useMutation<DeleteAttachmentResult, Error, Parameters<typeof deleteAttachmentService>[0], DeleteAttachmentContext>({
    mutationFn: deleteAttachmentService,
    onMutate: async (data): Promise<DeleteAttachmentContext> => {
      const attachmentId = data.param?.id;
      if (!attachmentId) {
        // ✅ exactOptionalPropertyTypes: Return typed empty context
        const emptyContext: DeleteAttachmentContext = {};
        return emptyContext;
      }

      await queryClient.cancelQueries({ queryKey: queryKeys.uploads.all });

      const previousAttachments = queryClient.getQueryData<ListAttachmentsResponse>(queryKeys.uploads.list());

      queryClient.setQueryData<ListAttachmentsResponse>(
        queryKeys.uploads.list(),
        (oldData: ListAttachmentsResponse | undefined) => {
          if (!oldData?.success || !oldData.data?.items) {
            return oldData;
          }

          return {
            ...oldData,
            data: {
              ...oldData.data,
              items: oldData.data.items.filter((item: typeof oldData.data.items[number]) => item.id !== attachmentId),
            },
          };
        },
      );

      // ✅ exactOptionalPropertyTypes: Build context conditionally
      const context: DeleteAttachmentContext = {};
      if (previousAttachments !== undefined) {
        context.previousAttachments = previousAttachments;
      }
      return context;
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
      // Use centralized pattern for upload invalidation
      invalidationPatterns.uploads.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key, refetchType: 'active' });
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
      if (error.name === 'AbortError') {
        return false;
      }
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
      // Use centralized pattern for upload invalidation
      invalidationPatterns.uploads.forEach((key) => {
        void queryClient.invalidateQueries({ queryKey: key });
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
      // Use centralized pattern for upload invalidation
      invalidationPatterns.uploads.forEach((key) => {
        void queryClient.invalidateQueries({ queryKey: key });
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
    abort: abortMutation,
    complete: completeMutation,
    // Mutations
    create: createMutation,
    // Combined error state
    error:
      createMutation.error
      || uploadPartMutation.error
      || completeMutation.error
      || abortMutation.error,

    // Combined loading state
    isUploading:
      createMutation.isPending
      || uploadPartMutation.isPending
      || completeMutation.isPending,

    // Reset all mutations
    reset: () => {
      createMutation.reset();
      uploadPartMutation.reset();
      completeMutation.reset();
      abortMutation.reset();
    },

    uploadPart: uploadPartMutation,
  };
}

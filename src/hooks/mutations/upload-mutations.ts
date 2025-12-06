/**
 * Upload Mutation Hooks
 *
 * TanStack Mutation hooks for file upload operations
 * Following patterns from project-mutations.ts and api-key-mutations.ts
 *
 * Uses secure ticket-based upload (S3 presigned URL pattern)
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import type { listAttachmentsService } from '@/services/api';
import {
  abortMultipartUploadService,
  completeMultipartUploadService,
  createMultipartUploadService,
  deleteAttachmentService,
  secureUploadService,
  updateAttachmentService,
  uploadPartService,
} from '@/services/api';

// ============================================================================
// Secure Upload Mutation (Ticket-Based)
// ============================================================================

/**
 * Hook to upload a file using secure ticket-based flow
 * Protected endpoint - requires authentication
 *
 * Uses S3 presigned URL pattern:
 * 1. Requests upload ticket with signed token
 * 2. Uploads file with validated token
 *
 * For files < 100MB. After successful upload:
 * - Invalidates upload lists
 *
 * Note: Thread/message associations are created via junction tables after upload
 */
export function useSecureUploadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => secureUploadService(file),
    onSuccess: () => {
      // Invalidate upload queries
      invalidationPatterns.afterUpload().forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to update attachment metadata or associations
 * Protected endpoint - requires authentication
 *
 * After successful update:
 * - Immediately updates the attachments list cache
 * - Invalidates specific attachment and lists
 */
export function useUpdateAttachmentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateAttachmentService,
    onSuccess: (response, variables) => {
      // Immediately update cache with updated data
      if (response.success && response.data) {
        const updatedAttachment = response.data;

        queryClient.setQueryData<Awaited<ReturnType<typeof listAttachmentsService>>>(
          queryKeys.uploads.list(),
          (oldData: Awaited<ReturnType<typeof listAttachmentsService>> | undefined) => {
            if (!oldData?.success || !oldData.data?.items) {
              return oldData;
            }

            const updatedItems = oldData.data.items.map((item: typeof updatedAttachment) =>
              item.id === updatedAttachment.id ? updatedAttachment : item,
            );

            return {
              ...oldData,
              data: {
                ...oldData.data,
                items: updatedItems,
              },
            };
          },
        );
      }

      // Invalidate to ensure UI consistency
      invalidationPatterns.uploadDetail(variables.param.id).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: (failureCount, error: unknown) => {
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
 * Hook to delete an attachment
 * Protected endpoint - requires authentication
 *
 * After successful deletion:
 * - Optimistically removes the attachment from cache
 * - Invalidates attachment lists
 */
export function useDeleteAttachmentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteAttachmentService,
    onMutate: async (data) => {
      const attachmentId = data.param?.id;
      if (!attachmentId)
        return;

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.uploads.all });

      // Snapshot previous value for rollback
      const previousAttachments = queryClient.getQueryData(queryKeys.uploads.list());

      // Optimistically remove from list
      queryClient.setQueryData<Awaited<ReturnType<typeof listAttachmentsService>>>(
        queryKeys.uploads.list(),
        (oldData: Awaited<ReturnType<typeof listAttachmentsService>> | undefined) => {
          if (!oldData?.success || !oldData.data?.items) {
            return oldData;
          }

          const filteredItems = oldData.data.items.filter(
            (item: { id: string }) => item.id !== attachmentId,
          );

          return {
            ...oldData,
            data: {
              ...oldData.data,
              items: filteredItems,
            },
          };
        },
      );

      return { previousAttachments };
    },
    onError: (_error, _data, context) => {
      // Rollback on error
      if (context?.previousAttachments) {
        queryClient.setQueryData(
          queryKeys.uploads.list(),
          context.previousAttachments,
        );
      }
    },
    onSettled: () => {
      // Ensure server state is in sync
      void queryClient.invalidateQueries({
        queryKey: queryKeys.uploads.all,
        refetchType: 'active',
      });
    },
    retry: (failureCount, error: unknown) => {
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

// ============================================================================
// Multipart Upload Mutations (for large files)
// ============================================================================

/**
 * Hook to create a multipart upload
 * Protected endpoint - requires authentication
 *
 * Returns uploadId and attachmentId needed for subsequent parts
 */
export function useCreateMultipartUploadMutation() {
  return useMutation({
    mutationFn: createMultipartUploadService,
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to upload a part of a multipart upload
 * Protected endpoint - requires authentication
 *
 * Returns etag needed for completing the upload
 */
export function useUploadPartMutation() {
  return useMutation({
    mutationFn: uploadPartService,
    // No cache invalidation - intermediate step
    retry: 3, // Retry parts as they can fail transiently
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30000),
    throwOnError: false,
  });
}

/**
 * Hook to complete a multipart upload
 * Protected endpoint - requires authentication
 *
 * After successful completion:
 * - Invalidates attachment lists
 */
export function useCompleteMultipartUploadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: completeMultipartUploadService,
    onSuccess: () => {
      // Invalidate all attachment queries
      void queryClient.invalidateQueries({
        queryKey: queryKeys.uploads.all,
      });
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to abort a multipart upload
 * Protected endpoint - requires authentication
 *
 * Cleans up any uploaded parts
 */
export function useAbortMultipartUploadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: abortMultipartUploadService,
    onSuccess: () => {
      // Invalidate to remove any partial upload records
      void queryClient.invalidateQueries({
        queryKey: queryKeys.uploads.all,
      });
    },
    retry: false,
    throwOnError: false,
  });
}

// ============================================================================
// Utility Hook: Multipart Upload Orchestrator
// ============================================================================

/**
 * Combined hook for managing the full multipart upload lifecycle
 * Provides state and methods for:
 * - Creating the upload
 * - Uploading parts with progress
 * - Completing or aborting
 */
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

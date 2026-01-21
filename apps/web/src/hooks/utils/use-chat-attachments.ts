/**
 * Chat Attachments Hook
 *
 * Manages file attachments for chat input with REAL uploads:
 * - Validates files before upload
 * - Uploads files to R2 storage via upload API
 * - Tracks upload progress and status
 * - Generates previews for display
 * - Provides completed upload IDs for message association
 *
 * Location: /src/hooks/utils/use-chat-attachments.ts
 */

import { UploadStatuses, UploadStatusSchema } from '@roundtable/shared';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { toastManager } from '@/lib/toast';

import { FilePreviewSchema } from './use-file-preview';
import { UploadItemSchema, useFileUpload } from './use-file-upload';

// ============================================================================
// ZOD SCHEMAS - Type-safe attachment structures
// ============================================================================

/**
 * Pending attachment schema - Zod-first pattern
 * Combines upload status, item, and preview for chat input display
 */
export const PendingAttachmentSchema = z.object({
  /** Unique attachment ID (client-side) */
  id: z.string(),
  /** Original file */
  file: z.custom<File>(val => val instanceof File, { message: 'Must be a File object' }),
  /** Upload status */
  status: UploadStatusSchema,
  /** Upload item with progress */
  uploadItem: UploadItemSchema.optional(),
  /** File preview (thumbnail/icon) */
  preview: FilePreviewSchema.optional(),
  /** Backend upload ID (after successful upload) */
  uploadId: z.string().optional(),
});

// ============================================================================
// INFERRED TYPES
// ============================================================================

/**
 * Pending attachment type - inferred from Zod schema
 */
export type PendingAttachment = z.infer<typeof PendingAttachmentSchema>;

/**
 * Upload state summary schema
 */
const UploadStateSummarySchema = z.object({
  /** Total number of uploads */
  total: z.number().int().nonnegative(),
  /** Number of pending uploads */
  pending: z.number().int().nonnegative(),
  /** Number of currently uploading files */
  uploading: z.number().int().nonnegative(),
  /** Number of completed uploads */
  completed: z.number().int().nonnegative(),
  /** Number of failed uploads */
  failed: z.number().int().nonnegative(),
  /** Overall progress percentage (0-100) */
  overallProgress: z.number().min(0).max(100),
});

/**
 * Return type schema for useChatAttachments hook
 */
const _UseChatAttachmentsReturnSchema = z.object({
  /** Current pending attachments with previews and upload state */
  attachments: z.array(PendingAttachmentSchema),
  /** Whether there are any attachments */
  hasAttachments: z.boolean(),
  /** Whether all attachments are uploaded and ready */
  allUploaded: z.boolean(),
  /** Whether any upload is in progress */
  isUploading: z.boolean(),
  /** Upload state summary */
  uploadState: UploadStateSummarySchema,
});

/**
 * Return type for useChatAttachments hook - inferred from schema
 */
export type UseChatAttachmentsReturn = z.infer<typeof _UseChatAttachmentsReturnSchema> & {
  /** Get completed upload IDs for message association */
  getUploadIds: () => string[];
  /** Add files (validates and starts upload) */
  addFiles: (files: File[]) => void;
  /** Remove a specific attachment */
  removeAttachment: (id: string) => void;
  /** Clear all attachments (call after successful submit) */
  clearAttachments: () => void;
  /** Retry a failed upload */
  retryUpload: (id: string) => void;
};

/**
 * Hook for managing chat input file attachments with real uploads
 *
 * Integrates with the file upload infrastructure to actually upload files
 * to R2 storage, track progress, and provide upload IDs for message association.
 *
 * @example
 * const {
 *   attachments,
 *   addFiles,
 *   removeAttachment,
 *   clearAttachments,
 *   getUploadIds,
 *   allUploaded
 * } = useChatAttachments();
 *
 * // Add files (uploads start automatically)
 * <input type="file" onChange={(e) => addFiles(Array.from(e.target.files))} />
 *
 * // Show attachments with progress
 * {attachments.map(att => (
 *   <AttachmentChip
 *     key={att.id}
 *     attachment={att}
 *     onRemove={() => removeAttachment(att.id)}
 *   />
 * ))}
 *
 * // Send message with attachment IDs
 * const handleSubmit = async () => {
 *   if (!allUploaded) return; // Wait for uploads
 *   const attachmentIds = getUploadIds();
 *   await sendMessage({ content, attachmentIds });
 *   clearAttachments();
 * };
 */
export function useChatAttachments(): UseChatAttachmentsReturn {
  const {
    items,
    previews,
    addFiles: addUploadFiles,
    removeItem,
    clearAll,
    retryUpload: retryUploadItem,
    state,
    validation,
  } = useFileUpload({
    autoUpload: true,
    maxConcurrent: 3,
    maxRetries: 3,
  });

  const attachments = useMemo((): PendingAttachment[] => {
    return items.map((item) => {
      const preview = previews.find(p => p.file === item.file);
      return {
        id: item.id,
        file: item.file,
        status: item.status,
        uploadItem: item,
        preview,
        uploadId: item.uploadId,
      };
    });
  }, [items, previews]);

  const allUploaded = useMemo(() => {
    if (items.length === 0)
      return true;
    return items.every(item => item.status === UploadStatuses.COMPLETED);
  }, [items]);

  const getUploadIds = useCallback((): string[] => {
    return items
      .filter(item => item.status === UploadStatuses.COMPLETED && item.uploadId)
      .map(item => item.uploadId ?? '');
  }, [items]);

  const addFiles = useCallback((files: File[]) => {
    const validFiles: File[] = [];
    const invalidFiles: { file: File; message: string }[] = [];

    for (const file of files) {
      const result = validation.validateFile(file);
      if (result.valid) {
        validFiles.push(file);
      } else {
        invalidFiles.push({
          file,
          message: result.error?.message || 'File validation failed',
        });
      }
    }

    const firstInvalid = invalidFiles[0];
    if (firstInvalid) {
      const fileNames = invalidFiles.map(f => f.file.name);
      const displayNames = fileNames.length <= 2
        ? fileNames.join(' and ')
        : `${fileNames.slice(0, 2).join(', ')} and ${fileNames.length - 2} more`;

      toastManager.error(
        'Unsupported file type',
        `${displayNames}: ${firstInvalid.message}`,
      );
    }

    if (validFiles.length > 0) {
      addUploadFiles(validFiles);
    }
  }, [addUploadFiles, validation]);

  const removeAttachment = useCallback((id: string) => {
    removeItem(id);
  }, [removeItem]);

  const clearAttachments = useCallback(() => {
    clearAll();
  }, [clearAll]);

  const retryUpload = useCallback((id: string) => {
    retryUploadItem(id);
  }, [retryUploadItem]);

  return {
    attachments,
    hasAttachments: items.length > 0,
    allUploaded,
    isUploading: state.isUploading,
    getUploadIds,
    addFiles,
    removeAttachment,
    clearAttachments,
    retryUpload,
    uploadState: {
      total: state.total,
      pending: state.pending,
      uploading: state.uploading,
      completed: state.completed,
      failed: state.failed,
      overallProgress: state.overallProgress,
    },
  };
}

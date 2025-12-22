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
'use client';

import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { UploadStatuses, UploadStatusSchema } from '@/api/core/enums';

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

export type UseChatAttachmentsReturn = {
  /** Current pending attachments with previews and upload state */
  attachments: PendingAttachment[];
  /** Whether there are any attachments */
  hasAttachments: boolean;
  /** Whether all attachments are uploaded and ready */
  allUploaded: boolean;
  /** Whether any upload is in progress */
  isUploading: boolean;
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
  /** Upload state summary */
  uploadState: {
    total: number;
    pending: number;
    uploading: number;
    completed: number;
    failed: number;
    overallProgress: number;
  };
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
  // Use the comprehensive file upload hook with auto-upload enabled
  const {
    items,
    previews,
    addFiles: addUploadFiles,
    removeItem,
    clearAll,
    retryUpload: retryUploadItem,
    state,
  } = useFileUpload({
    autoUpload: true, // Start upload immediately when files are added
    maxConcurrent: 3,
    maxRetries: 3,
  });

  // Transform upload items to pending attachments with previews
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

  // Check if all uploads are complete
  const allUploaded = useMemo(() => {
    if (items.length === 0)
      return true;
    return items.every(item => item.status === UploadStatuses.COMPLETED);
  }, [items]);

  // Get upload IDs for completed uploads (to send with message)
  const getUploadIds = useCallback((): string[] => {
    return items
      .filter(item => item.status === UploadStatuses.COMPLETED && item.uploadId)
      .map(item => item.uploadId!);
  }, [items]);

  // Add files - validates and starts upload automatically
  const addFiles = useCallback((files: File[]) => {
    addUploadFiles(files);
  }, [addUploadFiles]);

  // Remove attachment (cancels upload if in progress)
  const removeAttachment = useCallback((id: string) => {
    removeItem(id);
  }, [removeItem]);

  // Clear all attachments
  const clearAttachments = useCallback(() => {
    clearAll();
  }, [clearAll]);

  // Retry a failed upload
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

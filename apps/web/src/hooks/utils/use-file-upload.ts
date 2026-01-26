/**
 * File Upload Orchestrator Hook
 *
 * Comprehensive file upload management with:
 * - Automatic single vs multipart upload selection
 * - Progress tracking for all upload types
 * - Retry logic with exponential backoff
 * - Queue management for multiple files
 * - Integration with preview and validation hooks
 *
 * Location: /src/hooks/utils/use-file-upload.ts
 */

import type { UploadStatus } from '@roundtable/shared';
import {
  RECOMMENDED_PART_SIZE,
  UploadStatuses,
  UploadStatusSchema,
  UploadStrategies,
  UploadStrategySchema,
} from '@roundtable/shared';
import { useCallback, useRef, useState } from 'react';
import { z } from 'zod';

import {
  useAbortMultipartUploadMutation,
  useCompleteMultipartUploadMutation,
  useCreateMultipartUploadMutation,
  useDeleteAttachmentMutation,
  useSecureUploadMutation,
  useUploadPartMutation,
} from '../mutations/upload-mutations';
import type { FilePreview } from './use-file-preview';
import { FilePreviewSchema, useFilePreview } from './use-file-preview';
import { FileValidationResultSchema, useFileValidation } from './use-file-validation';

// ============================================================================
// ZOD SCHEMAS - Type-safe upload structures
// ============================================================================

/**
 * Upload progress schema
 */
export const UploadProgressSchema = z.object({
  /** Current part number (multipart only) */
  currentPart: z.number().optional(),
  /** Bytes uploaded */
  loaded: z.number(),
  /** Progress percentage (0-100) */
  percent: z.number().min(0).max(100),
  /** Total bytes */
  total: z.number(),
  /** Total parts (multipart only) */
  totalParts: z.number().optional(),
});

/**
 * Upload item schema
 */
export const UploadItemSchema = z.object({
  /** Completed at timestamp */
  completedAt: z.date().optional(),
  /** Created at timestamp */
  createdAt: z.date(),
  /** Error message if failed */
  error: z.string().optional(),
  /** Original file */
  file: z.custom<File>(val => val instanceof File, { message: 'Must be a File object' }),
  /** Unique ID for this upload */
  id: z.string(),
  /** Multipart upload ID (for multipart uploads) */
  multipartUploadId: z.string().optional(),
  /** Preview data */
  preview: FilePreviewSchema.optional(),
  /** Upload progress */
  progress: UploadProgressSchema,
  /** Current status */
  status: UploadStatusSchema,
  /** Upload strategy being used */
  strategy: UploadStrategySchema,
  /** Thread ID to associate with (optional) */
  threadId: z.string().optional(),
  /** Upload ID from backend (after creation) */
  uploadId: z.string().optional(),
  /** Validation result */
  validation: FileValidationResultSchema.optional(),
});

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type UploadProgress = z.infer<typeof UploadProgressSchema>;
export type UploadItem = z.infer<typeof UploadItemSchema>;

export const UseFileUploadOptionsSchema = z.object({
  /** Auto-start upload after file selection */
  autoUpload: z.boolean().optional(),
  /** Max concurrent uploads */
  maxConcurrent: z.number().optional(),
  /** Max retries per upload */
  maxRetries: z.number().optional(),
  /** Thread ID to associate uploads with */
  threadId: z.string().optional(),
});

/**
 * Upload state schema
 */
const _UploadStateSchema = z.object({
  /** Completed items count */
  completed: z.number().int().nonnegative(),
  /** Failed items count */
  failed: z.number().int().nonnegative(),
  /** Whether any upload is in progress */
  isUploading: z.boolean(),
  /** Overall progress (0-100) */
  overallProgress: z.number().min(0).max(100),
  /** Pending items count */
  pending: z.number().int().nonnegative(),
  /** Total items count */
  total: z.number().int().nonnegative(),
  /** Uploading items count */
  uploading: z.number().int().nonnegative(),
});

/**
 * Callback types for upload events
 */
export type UseFileUploadCallbacks = {
  /** Callback when upload completes */
  onComplete?: (item: UploadItem) => void;
  /** Callback when upload fails */
  onError?: (item: UploadItem, error: Error) => void;
  /** Callback when all uploads complete */
  onAllComplete?: (items: UploadItem[]) => void;
};

/**
 * Complete options for useFileUpload hook
 */
export type UseFileUploadOptions = z.infer<typeof UseFileUploadOptionsSchema> & UseFileUploadCallbacks;

/**
 * Return type for useFileUpload hook
 */
export type UseFileUploadReturn = {
  /** Current upload items */
  items: UploadItem[];
  /** File previews */
  previews: FilePreview[];
  /** Add files to upload queue */
  addFiles: (files: File[]) => void;
  /** Start uploading a specific item */
  startUpload: (id: string) => Promise<void>;
  /** Start all pending uploads */
  startAllUploads: () => Promise<void>;
  /** Cancel an upload */
  cancelUpload: (id: string) => Promise<void>;
  /** Remove an item from queue */
  removeItem: (id: string) => void;
  /** Clear all items */
  clearAll: () => void;
  /** Retry a failed upload */
  retryUpload: (id: string) => Promise<void>;
  /** Overall upload state */
  state: z.infer<typeof _UploadStateSchema>;
  /** Validation utilities */
  validation: ReturnType<typeof useFileValidation>;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateUploadId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createInitialProgress(): UploadProgress {
  return { loaded: 0, percent: 0, total: 0 };
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Comprehensive file upload orchestrator
 *
 * Handles the complete upload lifecycle:
 * 1. File validation
 * 2. Preview generation
 * 3. Automatic strategy selection (single vs multipart)
 * 4. Progress tracking
 * 5. Error handling and retries
 * 6. Queue management
 *
 * @example
 * const {
 *   items,
 *   previews,
 *   addFiles,
 *   startAllUploads,
 *   state
 * } = useFileUpload({ threadId: 'thread-123' });
 *
 * // In file input handler
 * const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
 *   if (e.target.files) {
 *     addFiles(Array.from(e.target.files));
 *   }
 * };
 *
 * // Start uploads
 * <Button onClick={startAllUploads} disabled={state.isUploading}>
 *   Upload {state.pending} files
 * </Button>
 */
export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
  const {
    autoUpload = false,
    maxConcurrent = 3,
    maxRetries = 3,
    onAllComplete,
    onComplete,
    onError,
    threadId,
  } = options;

  // State
  const [items, setItems] = useState<UploadItem[]>([]);
  const itemsRef = useRef<UploadItem[]>(items);
  const activeUploadsRef = useRef<Set<string>>(new Set());
  const retryCountRef = useRef<Map<string, number>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  itemsRef.current = items;

  // Hooks
  const validation = useFileValidation();
  const { addFiles: addPreviews, clearPreviews, previews, removePreview } = useFilePreview();

  // Mutations
  const uploadSingle = useSecureUploadMutation();
  const createMultipart = useCreateMultipartUploadMutation();
  const uploadPart = useUploadPartMutation();
  const completeMultipart = useCompleteMultipartUploadMutation();
  const abortMultipart = useAbortMultipartUploadMutation();
  const deleteAttachment = useDeleteAttachmentMutation();

  const updateItem = useCallback((id: string, updates: Partial<UploadItem>) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updates } : item)),
    );
  }, []);

  const performSingleUpload = useCallback(
    async (item: UploadItem): Promise<void> => {
      // Create abort controller for this upload
      const abortController = new AbortController();
      abortControllersRef.current.set(item.id, abortController);

      updateItem(item.id, {
        progress: { loaded: 0, percent: 0, total: item.file.size },
        status: UploadStatuses.UPLOADING,
      });

      try {
        // Pass file and abort signal - secure upload service handles ticket + upload
        const result = await uploadSingle.mutateAsync({
          file: item.file,
          signal: abortController.signal,
        });

        if (result.success && result.data) {
          updateItem(item.id, {
            completedAt: new Date(),
            progress: { loaded: item.file.size, percent: 100, total: item.file.size },
            status: UploadStatuses.COMPLETED,
            uploadId: result.data.id,
          });

          const updatedItem = itemsRef.current.find(i => i.id === item.id);
          if (updatedItem) {
            onComplete?.({ ...updatedItem, status: UploadStatuses.COMPLETED, uploadId: result.data.id });
          }
        } else {
          throw new Error('Upload failed');
        }
      } catch (error) {
        // Handle abort gracefully - user cancelled, not an error
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error('[File Upload] Single upload failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        updateItem(item.id, { error: errorMessage, status: UploadStatuses.FAILED });
        onError?.(item, error instanceof Error ? error : new Error(errorMessage));
        throw error;
      } finally {
        abortControllersRef.current.delete(item.id);
      }
    },
    [onComplete, onError, updateItem, uploadSingle],
  );

  const performMultipartUpload = useCallback(
    async (item: UploadItem): Promise<void> => {
      const { file } = item;
      const partSize = RECOMMENDED_PART_SIZE;
      const totalParts = Math.ceil(file.size / partSize);

      // Create abort controller for this upload
      const abortController = new AbortController();
      abortControllersRef.current.set(item.id, abortController);

      updateItem(item.id, {
        progress: {
          currentPart: 0,
          loaded: 0,
          percent: 0,
          total: file.size,
          totalParts,
        },
        status: UploadStatuses.UPLOADING,
      });

      try {
        // Check if already aborted
        if (abortController.signal.aborted) {
          throw new DOMException('Upload cancelled', 'AbortError');
        }

        const createResult = await createMultipart.mutateAsync({
          json: {
            filename: file.name,
            fileSize: file.size,
            mimeType: file.type,
            threadId: item.threadId,
          },
        });

        if (!createResult.success || !createResult.data) {
          throw new Error('Failed to create multipart upload');
        }

        const { attachmentId: dbUploadId, uploadId: multipartId } = createResult.data;
        updateItem(item.id, { multipartUploadId: multipartId, uploadId: dbUploadId });

        const parts: { partNumber: number; etag: string }[] = [];
        let uploadedBytes = 0;

        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
          // Check if aborted before each part
          if (abortController.signal.aborted) {
            throw new DOMException('Upload cancelled', 'AbortError');
          }

          const currentItem = itemsRef.current.find(i => i.id === item.id);
          if (currentItem?.status === UploadStatuses.CANCELLED) {
            throw new DOMException('Upload cancelled', 'AbortError');
          }

          const start = (partNumber - 1) * partSize;
          const end = Math.min(start + partSize, file.size);
          const partData = file.slice(start, end);

          const partResult = await uploadPart.mutateAsync({
            body: partData,
            param: { id: dbUploadId },
            query: {
              partNumber: partNumber.toString(),
              uploadId: multipartId,
            },
            signal: abortController.signal,
          });

          if (!partResult.success || !partResult.data) {
            throw new Error(`Failed to upload part ${partNumber}`);
          }

          parts.push({
            etag: partResult.data.etag,
            partNumber: partResult.data.partNumber,
          });

          uploadedBytes += end - start;
          updateItem(item.id, {
            progress: {
              currentPart: partNumber,
              loaded: uploadedBytes,
              percent: Math.round((uploadedBytes / file.size) * 100),
              total: file.size,
              totalParts,
            },
          });
        }

        const completeResult = await completeMultipart.mutateAsync({
          json: { parts },
          param: { id: dbUploadId },
        });

        if (!completeResult.success) {
          throw new Error('Failed to complete multipart upload');
        }

        updateItem(item.id, {
          completedAt: new Date(),
          progress: {
            currentPart: totalParts,
            loaded: file.size,
            percent: 100,
            total: file.size,
            totalParts,
          },
          status: UploadStatuses.COMPLETED,
        });

        const updatedItem = itemsRef.current.find(i => i.id === item.id);
        if (updatedItem) {
          onComplete?.({ ...updatedItem, status: UploadStatuses.COMPLETED });
        }
      } catch (error) {
        // Handle abort gracefully - user cancelled, cleanup on server
        if (error instanceof Error && error.name === 'AbortError') {
          const currentItem = itemsRef.current.find(i => i.id === item.id);
          if (currentItem?.multipartUploadId && currentItem?.uploadId) {
            try {
              await abortMultipart.mutateAsync({
                param: { id: currentItem.uploadId },
                query: { uploadId: currentItem.multipartUploadId },
              });
            } catch {
              // Ignore abort cleanup errors
            }
          }
          return;
        }

        console.error('[File Upload] Multipart upload failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Multipart upload failed';

        const currentItem = itemsRef.current.find(i => i.id === item.id);
        if (currentItem?.multipartUploadId && currentItem?.uploadId) {
          try {
            await abortMultipart.mutateAsync({
              param: { id: currentItem.uploadId },
              query: { uploadId: currentItem.multipartUploadId },
            });
          } catch (abortError) {
            console.error('[File Upload] Failed to abort multipart upload:', abortError);
          }
        }

        updateItem(item.id, { error: errorMessage, status: UploadStatuses.FAILED });
        onError?.(item, error instanceof Error ? error : new Error(errorMessage));
        throw error;
      } finally {
        abortControllersRef.current.delete(item.id);
      }
    },
    [abortMultipart, completeMultipart, createMultipart, onComplete, onError, updateItem, uploadPart],
  );

  const startUpload = useCallback(
    async (id: string): Promise<void> => {
      const item = itemsRef.current.find(i => i.id === id);
      if (!item || item.status !== UploadStatuses.PENDING) {
        return;
      }

      if (activeUploadsRef.current.size >= maxConcurrent) {
        return;
      }

      activeUploadsRef.current.add(id);

      try {
        if (item.strategy === UploadStrategies.MULTIPART) {
          await performMultipartUpload(item);
        } else {
          await performSingleUpload(item);
        }
      } finally {
        activeUploadsRef.current.delete(id);

        setItems((currentItems) => {
          const allDone = currentItems.every(i =>
            i.status === UploadStatuses.COMPLETED || i.status === UploadStatuses.FAILED || i.status === UploadStatuses.CANCELLED,
          );
          if (allDone && currentItems.length > 0) {
            onAllComplete?.(currentItems);
          }
          return currentItems;
        });
      }
    },
    [maxConcurrent, onAllComplete, performMultipartUpload, performSingleUpload],
  );

  const startAllUploads = useCallback(async (): Promise<void> => {
    const pendingItems = itemsRef.current.filter(i => i.status === UploadStatuses.PENDING);

    const uploadsToStart = pendingItems.slice(0, maxConcurrent);

    await Promise.all(uploadsToStart.map(item => startUpload(item.id)));

    const remaining = pendingItems.slice(maxConcurrent);
    for (const item of remaining) {
      await startUpload(item.id);
    }
  }, [maxConcurrent, startUpload]);

  const cancelUpload = useCallback(
    async (id: string): Promise<void> => {
      const item = itemsRef.current.find(i => i.id === id);
      if (!item) {
        return;
      }

      // Abort the in-flight HTTP request immediately
      const abortController = abortControllersRef.current.get(id);
      if (abortController) {
        abortController.abort();
        abortControllersRef.current.delete(id);
      }

      updateItem(id, { status: UploadStatuses.CANCELLED });
      activeUploadsRef.current.delete(id);

      if (item.multipartUploadId && item.uploadId) {
        try {
          await abortMultipart.mutateAsync({
            param: { id: item.uploadId },
            query: { uploadId: item.multipartUploadId },
          });
        } catch (abortError) {
          console.error('[File Upload] Failed to abort multipart upload during cancel:', abortError);
        }
      }

      if (item.uploadId && !item.multipartUploadId) {
        try {
          await deleteAttachment.mutateAsync({
            param: { id: item.uploadId },
          });
        } catch (deleteError) {
          console.error('[File Upload] Failed to delete upload record during cancel:', deleteError);
        }
      }
    },
    [abortMultipart, deleteAttachment, updateItem],
  );

  const removeItem = useCallback(
    (id: string) => {
      const item = itemsRef.current.find(i => i.id === id);
      if (item?.status === UploadStatuses.UPLOADING) {
        cancelUpload(id);
      }

      removePreview(id);
      setItems((prev) => {
        const updated = prev.filter(i => i.id !== id);
        itemsRef.current = updated;
        return updated;
      });
      retryCountRef.current.delete(id);
    },
    [cancelUpload, removePreview],
  );

  const clearAll = useCallback(() => {
    itemsRef.current.forEach((item) => {
      if (item.status === UploadStatuses.UPLOADING) {
        cancelUpload(item.id);
      }
    });

    clearPreviews();
    setItems([]);
    itemsRef.current = [];
    retryCountRef.current.clear();
  }, [cancelUpload, clearPreviews]);

  const retryUpload = useCallback(
    async (id: string): Promise<void> => {
      const item = itemsRef.current.find(i => i.id === id);
      if (!item || item.status !== UploadStatuses.FAILED) {
        return;
      }

      const retryCount = retryCountRef.current.get(id) ?? 0;
      if (retryCount >= maxRetries) {
        return;
      }

      retryCountRef.current.set(id, retryCount + 1);
      updateItem(id, {
        error: undefined,
        progress: createInitialProgress(),
        status: UploadStatuses.PENDING,
      });

      await startUpload(id);
    },
    [maxRetries, startUpload, updateItem],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const newItems: UploadItem[] = [];

      for (const file of files) {
        const id = generateUploadId();
        const validationResult = validation.validateFile(file);

        if (!validationResult.valid) {
          newItems.push({
            createdAt: new Date(),
            error: validationResult.error?.message,
            file,
            id,
            progress: createInitialProgress(),
            status: UploadStatuses.FAILED,
            strategy: UploadStrategies.SINGLE,
            threadId,
            validation: validationResult,
          });
          continue;
        }

        newItems.push({
          createdAt: new Date(),
          file,
          id,
          progress: { loaded: 0, percent: 0, total: file.size },
          status: UploadStatuses.PENDING,
          strategy: validationResult.uploadStrategy,
          threadId,
          validation: validationResult,
        });
      }

      addPreviews(files);

      setItems((prev) => {
        const updated = [...prev, ...newItems];
        itemsRef.current = updated;
        return updated;
      });

      if (autoUpload) {
        queueMicrotask(() => {
          newItems
            .filter(i => i.status === UploadStatuses.PENDING)
            .forEach(item => startUpload(item.id));
        });
      }
    },
    [addPreviews, autoUpload, startUpload, threadId, validation],
  );

  const state = {
    completed: items.filter(i => i.status === UploadStatuses.COMPLETED).length,
    failed: items.filter(i => i.status === UploadStatuses.FAILED).length,
    isUploading: items.some(i => i.status === UploadStatuses.UPLOADING || i.status === UploadStatuses.PENDING),
    overallProgress:
      items.length > 0
        ? Math.round(
            items.reduce((sum, item) => sum + item.progress.percent, 0) / items.length,
          )
        : 0,
    pending: items.filter(i => i.status === UploadStatuses.PENDING).length,
    total: items.length,
    uploading: items.filter(i => i.status === UploadStatuses.UPLOADING).length,
  };

  return {
    addFiles,
    cancelUpload,
    clearAll,
    items,
    previews,
    removeItem,
    retryUpload,
    startAllUploads,
    startUpload,
    state,
    validation,
  };
}

// ============================================================================
// SIMPLE SINGLE-FILE UPLOAD HOOK
// ============================================================================

export const UseSingleFileUploadOptionsSchema = z.object({
  /** Thread ID to associate with */
  threadId: z.string().optional(),
});

/**
 * Callback types for single file upload events
 */
export type UseSingleFileUploadCallbacks = {
  /** Callback when upload completes */
  onComplete?: (uploadId: string) => void;
  /** Callback when upload fails */
  onError?: (error: Error) => void;
};

/**
 * Complete options for useSingleFileUpload hook
 */
export type UseSingleFileUploadOptions = z.infer<typeof UseSingleFileUploadOptionsSchema> & UseSingleFileUploadCallbacks;

/**
 * Return type schema for useSingleFileUpload hook
 * Includes both state and function members
 */
const _UseSingleFileUploadReturnSchema = z.object({
  /** Cancel current upload */
  cancel: z.custom<() => void>(),
  /** Error message */
  error: z.string().optional(),
  /** Current upload progress */
  progress: UploadProgressSchema,
  /** Reset state */
  reset: z.custom<() => void>(),
  /** Current status */
  status: UploadStatusSchema,
  /** Upload a single file */
  upload: z.custom<(file: File) => Promise<string | null>>(),
});

/**
 * Return type for useSingleFileUpload hook - inferred from schema
 */
export type UseSingleFileUploadReturn = z.infer<typeof _UseSingleFileUploadReturnSchema>;

/**
 * Simplified hook for single file upload
 *
 * @example
 * const { upload, progress, status } = useSingleFileUpload({
 *   threadId: 'thread-123',
 * });
 *
 * const handleUpload = async (file: File) => {
 *   const uploadId = await upload(file);
 *   if (uploadId) {
 *     // Success
 *   }
 * };
 */
export function useSingleFileUpload(options: UseSingleFileUploadOptions = {}): UseSingleFileUploadReturn {
  const { onComplete, onError, threadId: _threadId } = options;

  const [progress, setProgress] = useState<UploadProgress>(() => createInitialProgress());
  const [status, setStatus] = useState<UploadStatus>(UploadStatuses.PENDING);
  const [error, setError] = useState<string>();
  const abortControllerRef = useRef<AbortController | null>(null);

  const validation = useFileValidation();
  const uploadMutation = useSecureUploadMutation();

  const reset = useCallback(() => {
    setProgress(createInitialProgress());
    setStatus(UploadStatuses.PENDING);
    setError(undefined);
    abortControllerRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus(UploadStatuses.CANCELLED);
  }, []);

  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      const validationResult = validation.validateFile(file);
      if (!validationResult.valid) {
        setError(validationResult.error?.message);
        setStatus(UploadStatuses.FAILED);
        onError?.(new Error(validationResult.error?.message ?? 'Validation failed'));
        return null;
      }

      if (validationResult.uploadStrategy === UploadStrategies.MULTIPART) {
        setError('File too large. Use useFileUpload for large files.');
        setStatus(UploadStatuses.FAILED);
        onError?.(new Error('File too large for single upload'));
        return null;
      }

      setStatus(UploadStatuses.UPLOADING);
      setProgress({ loaded: 0, percent: 0, total: file.size });
      abortControllerRef.current = new AbortController();

      try {
        const result = await uploadMutation.mutateAsync({
          file,
          signal: abortControllerRef.current?.signal,
        });

        if (result.success && result.data) {
          setProgress({ loaded: file.size, percent: 100, total: file.size });
          setStatus(UploadStatuses.COMPLETED);
          onComplete?.(result.data.id);
          return result.data.id;
        }

        throw new Error('Upload failed');
      } catch (err) {
        // Handle abort gracefully
        if (err instanceof Error && err.name === 'AbortError') {
          setStatus(UploadStatuses.CANCELLED);
          return null;
        }

        console.error('[File Upload] Single file upload failed:', err);
        const errorMessage = err instanceof Error ? err.message : 'Upload failed';
        setError(errorMessage);
        setStatus(UploadStatuses.FAILED);
        onError?.(err instanceof Error ? err : new Error(errorMessage));
        return null;
      }
    },
    [onComplete, onError, uploadMutation, validation],
  );

  return {
    cancel,
    error,
    progress,
    reset,
    status,
    upload,
  };
}

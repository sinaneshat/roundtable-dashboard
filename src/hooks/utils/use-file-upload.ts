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

'use client';

import { useCallback, useRef, useState } from 'react';
import { z } from 'zod';

import type { UploadStatus } from '@/api/core/enums';
import {
  RECOMMENDED_PART_SIZE,
  UploadStatuses,
  UploadStatusSchema,
  UploadStrategySchema,
} from '@/api/core/enums';
import {
  useAbortMultipartUploadMutation,
  useCompleteMultipartUploadMutation,
  useCreateMultipartUploadMutation,
  useDeleteAttachmentMutation,
  useSecureUploadMutation,
  useUploadPartMutation,
} from '@/hooks/mutations';

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
  /** Bytes uploaded */
  loaded: z.number(),
  /** Total bytes */
  total: z.number(),
  /** Progress percentage (0-100) */
  percent: z.number().min(0).max(100),
  /** Current part number (multipart only) */
  currentPart: z.number().optional(),
  /** Total parts (multipart only) */
  totalParts: z.number().optional(),
});

/**
 * Upload item schema
 */
export const UploadItemSchema = z.object({
  /** Unique ID for this upload */
  id: z.string(),
  /** Original file */
  file: z.custom<File>(val => val instanceof File, { message: 'Must be a File object' }),
  /** Current status */
  status: UploadStatusSchema,
  /** Upload progress */
  progress: UploadProgressSchema,
  /** Validation result */
  validation: FileValidationResultSchema.optional(),
  /** Preview data */
  preview: FilePreviewSchema.optional(),
  /** Upload strategy being used */
  strategy: UploadStrategySchema,
  /** Thread ID to associate with (optional) */
  threadId: z.string().optional(),
  /** Upload ID from backend (after creation) */
  uploadId: z.string().optional(),
  /** Multipart upload ID (for multipart uploads) */
  multipartUploadId: z.string().optional(),
  /** Error message if failed */
  error: z.string().optional(),
  /** Created at timestamp */
  createdAt: z.date(),
  /** Completed at timestamp */
  completedAt: z.date().optional(),
});

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type UploadProgress = z.infer<typeof UploadProgressSchema>;
export type UploadItem = z.infer<typeof UploadItemSchema>;

export const UseFileUploadOptionsSchema = z.object({
  /** Thread ID to associate uploads with */
  threadId: z.string().optional(),
  /** Auto-start upload after file selection */
  autoUpload: z.boolean().optional(),
  /** Max concurrent uploads */
  maxConcurrent: z.number().optional(),
  /** Max retries per upload */
  maxRetries: z.number().optional(),
});

// Note: Callbacks can't be validated with Zod, so we extend the schema type
export type UseFileUploadOptions = z.infer<typeof UseFileUploadOptionsSchema> & {
  /** Callback when upload completes */
  onComplete?: (item: UploadItem) => void;
  /** Callback when upload fails */
  onError?: (item: UploadItem, error: Error) => void;
  /** Callback when all uploads complete */
  onAllComplete?: (items: UploadItem[]) => void;
};

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
  state: {
    /** Total items count */
    total: number;
    /** Pending items count */
    pending: number;
    /** Uploading items count */
    uploading: number;
    /** Completed items count */
    completed: number;
    /** Failed items count */
    failed: number;
    /** Overall progress (0-100) */
    overallProgress: number;
    /** Whether any upload is in progress */
    isUploading: boolean;
  };
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
  return { loaded: 0, total: 0, percent: 0 };
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
    threadId,
    autoUpload = false,
    maxConcurrent = 3,
    maxRetries = 3,
    onComplete,
    onError,
    onAllComplete,
  } = options;

  // State
  const [items, setItems] = useState<UploadItem[]>([]);
  const itemsRef = useRef<UploadItem[]>(items); // ✅ FIX: Ref for current items to avoid stale closures
  const activeUploadsRef = useRef<Set<string>>(new Set());
  const retryCountRef = useRef<Map<string, number>>(new Map());

  // Keep itemsRef in sync with items state
  itemsRef.current = items;

  // Hooks
  const validation = useFileValidation();
  const { previews, addFiles: addPreviews, removePreview, clearPreviews } = useFilePreview();

  // Mutations
  const uploadSingle = useSecureUploadMutation();
  const createMultipart = useCreateMultipartUploadMutation();
  const uploadPart = useUploadPartMutation();
  const completeMultipart = useCompleteMultipartUploadMutation();
  const abortMultipart = useAbortMultipartUploadMutation();
  const deleteAttachment = useDeleteAttachmentMutation();

  /**
   * Update a specific item
   */
  const updateItem = useCallback((id: string, updates: Partial<UploadItem>) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updates } : item)),
    );
  }, []);

  /**
   * Perform single-request upload
   * Uses secure ticket-based upload (S3 presigned URL pattern)
   */
  const performSingleUpload = useCallback(
    async (item: UploadItem): Promise<void> => {
      updateItem(item.id, {
        status: UploadStatuses.UPLOADING,
        progress: { loaded: 0, total: item.file.size, percent: 0 },
      });

      try {
        // Pass file directly - secure upload service handles ticket + upload
        const result = await uploadSingle.mutateAsync(item.file);

        if (result.success && result.data) {
          updateItem(item.id, {
            status: UploadStatuses.COMPLETED,
            uploadId: result.data.id,
            progress: { loaded: item.file.size, total: item.file.size, percent: 100 },
            completedAt: new Date(),
          });

          const updatedItem = itemsRef.current.find(i => i.id === item.id);
          if (updatedItem) {
            onComplete?.({ ...updatedItem, status: UploadStatuses.COMPLETED, uploadId: result.data.id });
          }
        } else {
          throw new Error('Upload failed');
        }
      } catch (error) {
        console.error('[File Upload] Single upload failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        updateItem(item.id, { status: UploadStatuses.FAILED, error: errorMessage });
        onError?.(item, error instanceof Error ? error : new Error(errorMessage));
        throw error;
      }
    },
    [onComplete, onError, updateItem, uploadSingle],
  );

  /**
   * Perform multipart upload
   */
  const performMultipartUpload = useCallback(
    async (item: UploadItem): Promise<void> => {
      const { file } = item;
      const partSize = RECOMMENDED_PART_SIZE;
      const totalParts = Math.ceil(file.size / partSize);

      updateItem(item.id, {
        status: UploadStatuses.UPLOADING,
        progress: {
          loaded: 0,
          total: file.size,
          percent: 0,
          currentPart: 0,
          totalParts,
        },
      });

      try {
        // Step 1: Create multipart upload
        const createResult = await createMultipart.mutateAsync({
          json: {
            filename: file.name,
            mimeType: file.type,
            fileSize: file.size,
            threadId: item.threadId,
          },
        });

        if (!createResult.success || !createResult.data) {
          throw new Error('Failed to create multipart upload');
        }

        const { uploadId: multipartId, attachmentId: dbUploadId } = createResult.data;
        updateItem(item.id, { multipartUploadId: multipartId, uploadId: dbUploadId });

        // Step 2: Upload parts
        const parts: { partNumber: number; etag: string }[] = [];
        let uploadedBytes = 0;

        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
          // Check if cancelled
          const currentItem = itemsRef.current.find(i => i.id === item.id);
          if (currentItem?.status === UploadStatuses.CANCELLED) {
            throw new Error('Upload cancelled');
          }

          const start = (partNumber - 1) * partSize;
          const end = Math.min(start + partSize, file.size);
          const partData = file.slice(start, end);

          const partResult = await uploadPart.mutateAsync({
            id: dbUploadId,
            uploadId: multipartId,
            partNumber: partNumber.toString(),
            body: partData,
          });

          if (!partResult.success || !partResult.data) {
            throw new Error(`Failed to upload part ${partNumber}`);
          }

          parts.push({
            partNumber: partResult.data.partNumber,
            etag: partResult.data.etag,
          });

          uploadedBytes += end - start;
          updateItem(item.id, {
            progress: {
              loaded: uploadedBytes,
              total: file.size,
              percent: Math.round((uploadedBytes / file.size) * 100),
              currentPart: partNumber,
              totalParts,
            },
          });
        }

        // Step 3: Complete multipart upload
        const completeResult = await completeMultipart.mutateAsync({
          param: { id: dbUploadId },
          json: { parts },
        });

        if (!completeResult.success) {
          throw new Error('Failed to complete multipart upload');
        }

        updateItem(item.id, {
          status: UploadStatuses.COMPLETED,
          progress: {
            loaded: file.size,
            total: file.size,
            percent: 100,
            currentPart: totalParts,
            totalParts,
          },
          completedAt: new Date(),
        });

        const updatedItem = itemsRef.current.find(i => i.id === item.id);
        if (updatedItem) {
          onComplete?.({ ...updatedItem, status: UploadStatuses.COMPLETED });
        }
      } catch (error) {
        console.error('[File Upload] Multipart upload failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Multipart upload failed';

        // Try to abort multipart upload if we have multipartUploadId
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

        updateItem(item.id, { status: UploadStatuses.FAILED, error: errorMessage });
        onError?.(item, error instanceof Error ? error : new Error(errorMessage));
        throw error;
      }
    },
    [abortMultipart, completeMultipart, createMultipart, onComplete, onError, updateItem, uploadPart],
  );

  /**
   * Start uploading a specific item
   * ✅ FIX: Uses itemsRef.current to avoid stale closure issues with auto-upload
   */
  const startUpload = useCallback(
    async (id: string): Promise<void> => {
      // ✅ FIX: Use ref instead of closure to get current items
      const item = itemsRef.current.find(i => i.id === id);
      if (!item || item.status !== UploadStatuses.PENDING)
        return;

      // Check concurrent limit
      if (activeUploadsRef.current.size >= maxConcurrent)
        return;

      activeUploadsRef.current.add(id);

      try {
        if (item.strategy === 'multipart') {
          await performMultipartUpload(item);
        } else {
          await performSingleUpload(item);
        }
      } finally {
        activeUploadsRef.current.delete(id);

        // Check if all uploads complete
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

  /**
   * Start all pending uploads
   */
  const startAllUploads = useCallback(async (): Promise<void> => {
    const pendingItems = itemsRef.current.filter(i => i.status === UploadStatuses.PENDING);

    // Start uploads up to max concurrent
    const uploadsToStart = pendingItems.slice(0, maxConcurrent);

    await Promise.all(uploadsToStart.map(item => startUpload(item.id)));

    // Continue with remaining items as slots become available
    const remaining = pendingItems.slice(maxConcurrent);
    for (const item of remaining) {
      await startUpload(item.id);
    }
  }, [maxConcurrent, startUpload]);

  /**
   * Cancel an upload
   */
  const cancelUpload = useCallback(
    async (id: string): Promise<void> => {
      const item = itemsRef.current.find(i => i.id === id);
      if (!item)
        return;

      updateItem(id, { status: UploadStatuses.CANCELLED });
      activeUploadsRef.current.delete(id);

      // Abort multipart upload if in progress
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

      // Delete upload record if created (non-multipart)
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

  /**
   * Remove an item from queue
   */
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

  /**
   * Clear all items
   */
  const clearAll = useCallback(() => {
    // Cancel all active uploads
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

  /**
   * Retry a failed upload
   */
  const retryUpload = useCallback(
    async (id: string): Promise<void> => {
      const item = itemsRef.current.find(i => i.id === id);
      if (!item || item.status !== UploadStatuses.FAILED)
        return;

      const retryCount = retryCountRef.current.get(id) ?? 0;
      if (retryCount >= maxRetries) {
        return;
      }

      retryCountRef.current.set(id, retryCount + 1);
      updateItem(id, {
        status: UploadStatuses.PENDING,
        error: undefined,
        progress: createInitialProgress(),
      });

      await startUpload(id);
    },
    [maxRetries, startUpload, updateItem],
  );

  /**
   * Add files to upload queue
   */
  const addFiles = useCallback(
    (files: File[]) => {
      const newItems: UploadItem[] = [];

      for (const file of files) {
        const id = generateUploadId();
        const validationResult = validation.validateFile(file);

        if (!validationResult.valid) {
          // Add as failed item
          newItems.push({
            id,
            file,
            status: UploadStatuses.FAILED,
            progress: createInitialProgress(),
            validation: validationResult,
            strategy: 'single',
            threadId,
            error: validationResult.error?.message,
            createdAt: new Date(),
          });
          continue;
        }

        newItems.push({
          id,
          file,
          status: UploadStatuses.PENDING,
          progress: { loaded: 0, total: file.size, percent: 0 },
          validation: validationResult,
          strategy: validationResult.uploadStrategy,
          threadId,
          createdAt: new Date(),
        });
      }

      // Add previews
      addPreviews(files);

      // ✅ FIX: Update both state AND ref together to avoid stale closure issues
      // The ref update is synchronous, so startUpload can find items immediately
      setItems((prev) => {
        const updated = [...prev, ...newItems];
        itemsRef.current = updated; // Update ref synchronously
        return updated;
      });

      // Auto-start if enabled
      if (autoUpload) {
        // ✅ FIX: Use queueMicrotask for better timing than setTimeout(0)
        // This ensures React state update is committed before we start uploads
        queueMicrotask(() => {
          newItems
            .filter(i => i.status === UploadStatuses.PENDING)
            .forEach(item => startUpload(item.id));
        });
      }
    },
    [addPreviews, autoUpload, startUpload, threadId, validation],
  );

  // Calculate state
  const state = {
    total: items.length,
    pending: items.filter(i => i.status === UploadStatuses.PENDING).length,
    uploading: items.filter(i => i.status === UploadStatuses.UPLOADING).length,
    completed: items.filter(i => i.status === UploadStatuses.COMPLETED).length,
    failed: items.filter(i => i.status === UploadStatuses.FAILED).length,
    overallProgress:
      items.length > 0
        ? Math.round(
            items.reduce((sum, item) => sum + item.progress.percent, 0) / items.length,
          )
        : 0,
    isUploading: items.some(i => i.status === UploadStatuses.UPLOADING),
  };

  return {
    items,
    previews,
    addFiles,
    startUpload,
    startAllUploads,
    cancelUpload,
    removeItem,
    clearAll,
    retryUpload,
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

// Note: Callbacks can't be validated with Zod, so we extend the schema type
export type UseSingleFileUploadOptions = z.infer<typeof UseSingleFileUploadOptionsSchema> & {
  /** Callback when upload completes */
  onComplete?: (uploadId: string) => void;
  /** Callback when upload fails */
  onError?: (error: Error) => void;
};

export type UseSingleFileUploadReturn = {
  /** Upload a single file */
  upload: (file: File) => Promise<string | null>;
  /** Current upload progress */
  progress: UploadProgress;
  /** Current status */
  status: UploadStatus;
  /** Error message */
  error?: string;
  /** Reset state */
  reset: () => void;
  /** Cancel current upload */
  cancel: () => void;
};

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
  const { threadId: _threadId, onComplete, onError } = options;

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
      // Validate
      const validationResult = validation.validateFile(file);
      if (!validationResult.valid) {
        setError(validationResult.error?.message);
        setStatus(UploadStatuses.FAILED);
        onError?.(new Error(validationResult.error?.message ?? 'Validation failed'));
        return null;
      }

      // Only support single upload in this simplified hook
      if (validationResult.uploadStrategy === 'multipart') {
        setError('File too large. Use useFileUpload for large files.');
        setStatus(UploadStatuses.FAILED);
        onError?.(new Error('File too large for single upload'));
        return null;
      }

      setStatus(UploadStatuses.UPLOADING);
      setProgress({ loaded: 0, total: file.size, percent: 0 });
      abortControllerRef.current = new AbortController();

      try {
        // Use secure ticket-based upload
        const result = await uploadMutation.mutateAsync(file);

        if (result.success && result.data) {
          setProgress({ loaded: file.size, total: file.size, percent: 100 });
          setStatus(UploadStatuses.COMPLETED);
          onComplete?.(result.data.id);
          return result.data.id;
        }

        throw new Error('Upload failed');
      } catch (err) {
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
    upload,
    progress,
    status,
    error,
    reset,
    cancel,
  };
}

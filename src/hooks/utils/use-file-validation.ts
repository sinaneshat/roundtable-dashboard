/**
 * File Validation Utilities
 *
 * Client-side file validation matching backend rules
 * Provides consistent validation before upload attempts
 *
 * Location: /src/hooks/utils/use-file-validation.ts
 */

'use client';

import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import type { FileCategory } from '@/api/core/enums';
import {
  ALLOWED_MIME_TYPES,
  FileCategorySchema,
  FileValidationErrorCodeSchema,
  MAX_MULTIPART_PARTS,
  MAX_SINGLE_UPLOAD_SIZE,
  MAX_TOTAL_FILE_SIZE,
  MIME_TYPE_CATEGORIES,
  MIN_MULTIPART_PART_SIZE,
  RECOMMENDED_PART_SIZE,
  UploadStrategySchema,
} from '@/api/core/enums';

// ============================================================================
// ZOD SCHEMAS - Type-safe validation structures
// ============================================================================

/**
 * File validation error details schema
 */
const FileValidationErrorDetailsSchema = z.object({
  maxSize: z.number().optional(),
  actualSize: z.number().optional(),
  allowedTypes: z.array(z.string()).readonly().optional(),
  actualType: z.string().optional(),
});

/**
 * File validation error schema
 */
export const FileValidationErrorSchema = z.object({
  code: FileValidationErrorCodeSchema,
  message: z.string(),
  details: FileValidationErrorDetailsSchema.optional(),
});

/**
 * File validation result schema
 */
export const FileValidationResultSchema = z.object({
  valid: z.boolean(),
  error: FileValidationErrorSchema.optional(),
  uploadStrategy: UploadStrategySchema,
  partCount: z.number().optional(),
  partSize: z.number().optional(),
  fileCategory: FileCategorySchema,
});

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type FileValidationError = z.infer<typeof FileValidationErrorSchema>;
export type FileValidationResult = z.infer<typeof FileValidationResultSchema>;

// ============================================================================
// HOOK OPTIONS & RETURN SCHEMAS
// ============================================================================

export const UseFileValidationOptionsSchema = z.object({
  /** Custom max size override (defaults to MAX_SINGLE_UPLOAD_SIZE for single, MAX_TOTAL_FILE_SIZE for multipart) */
  maxSize: z.number().optional(),
  /** Custom allowed MIME types (defaults to ALLOWED_MIME_TYPES) */
  allowedTypes: z.array(z.string()).readonly().optional(),
  /** Whether to allow multipart uploads for large files */
  allowMultipart: z.boolean().optional(),
});

export type UseFileValidationOptions = z.infer<typeof UseFileValidationOptionsSchema>;

export type UseFileValidationReturn = {
  /** Validate a single file */
  validateFile: (file: File) => FileValidationResult;
  /** Validate multiple files */
  validateFiles: (files: File[]) => Map<File, FileValidationResult>;
  /** Check if MIME type is allowed */
  isAllowedType: (mimeType: string) => boolean;
  /** Get file category from MIME type */
  getFileCategory: (mimeType: string) => FileCategory;
  /** Format file size for display */
  formatFileSize: (bytes: number) => string;
  /** Calculate multipart upload parts */
  calculateParts: (fileSize: number) => { partCount: number; partSize: number };
  /** Constants for reference */
  constants: {
    maxSingleUploadSize: number;
    maxTotalFileSize: number;
    minPartSize: number;
    recommendedPartSize: number;
    allowedTypes: readonly string[];
  };
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if MIME type is allowed (matches backend logic)
 */
function checkAllowedMimeType(mimeType: string, allowedTypes: readonly string[]): boolean {
  return allowedTypes.includes(mimeType) || mimeType.startsWith('text/');
}

/**
 * Get file category from MIME type
 */
function getFileCategoryFromMime(mimeType: string): FileCategory {
  for (const [category, types] of Object.entries(MIME_TYPE_CATEGORIES)) {
    if ((types as readonly string[]).includes(mimeType)) {
      return category as FileCategory;
    }
  }
  return 'other';
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Calculate optimal part configuration for multipart upload
 */
function calculateMultipartParts(fileSize: number): { partCount: number; partSize: number } {
  // Use recommended part size, but ensure we don't exceed MAX_MULTIPART_PARTS (R2 limit)
  let partSize = RECOMMENDED_PART_SIZE;
  let partCount = Math.ceil(fileSize / partSize);

  // If we'd have too many parts, increase part size
  if (partCount > MAX_MULTIPART_PARTS) {
    partSize = Math.ceil(fileSize / MAX_MULTIPART_PARTS);
    partCount = Math.ceil(fileSize / partSize);
  }

  return { partCount, partSize };
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * File validation hook for upload pre-checks
 *
 * @example
 * const { validateFile, formatFileSize } = useFileValidation();
 *
 * const handleFileSelect = (file: File) => {
 *   const result = validateFile(file);
 *   if (!result.valid) {
 *     toast.error(result.error.message);
 *     return;
 *   }
 *   // Proceed with upload using result.uploadStrategy
 * };
 */
export function useFileValidation(options: UseFileValidationOptions = {}): UseFileValidationReturn {
  const {
    maxSize,
    allowedTypes = ALLOWED_MIME_TYPES,
    allowMultipart = true,
  } = options;

  const effectiveMaxSize = maxSize ?? (allowMultipart ? MAX_TOTAL_FILE_SIZE : MAX_SINGLE_UPLOAD_SIZE);

  const isAllowedType = useCallback(
    (mimeType: string) => checkAllowedMimeType(mimeType, allowedTypes),
    [allowedTypes],
  );

  const getFileCategory = useCallback(
    (mimeType: string) => getFileCategoryFromMime(mimeType),
    [],
  );

  const formatFileSize = useCallback((bytes: number) => formatBytes(bytes), []);

  const calculateParts = useCallback(
    (fileSize: number) => calculateMultipartParts(fileSize),
    [],
  );

  const validateFile = useCallback(
    (file: File): FileValidationResult => {
      const fileCategory = getFileCategoryFromMime(file.type);

      // Check for empty file
      if (file.size === 0) {
        return {
          valid: false,
          error: {
            code: 'empty_file',
            message: 'File is empty',
          },
          uploadStrategy: 'single',
          fileCategory,
        };
      }

      // Check filename length
      if (file.name.length > 255) {
        return {
          valid: false,
          error: {
            code: 'filename_too_long',
            message: 'Filename must be 255 characters or less',
          },
          uploadStrategy: 'single',
          fileCategory,
        };
      }

      // Check MIME type
      if (!checkAllowedMimeType(file.type, allowedTypes)) {
        return {
          valid: false,
          error: {
            code: 'invalid_type',
            message: `File type "${file.type}" is not allowed`,
            details: {
              allowedTypes,
              actualType: file.type,
            },
          },
          uploadStrategy: 'single',
          fileCategory,
        };
      }

      // Check file size
      if (file.size > effectiveMaxSize) {
        return {
          valid: false,
          error: {
            code: 'file_too_large',
            message: `File is too large (${formatBytes(file.size)}). Maximum size is ${formatBytes(effectiveMaxSize)}`,
            details: {
              maxSize: effectiveMaxSize,
              actualSize: file.size,
            },
          },
          uploadStrategy: 'single',
          fileCategory,
        };
      }

      // Determine upload strategy
      if (file.size <= MAX_SINGLE_UPLOAD_SIZE) {
        return {
          valid: true,
          uploadStrategy: 'single',
          fileCategory,
        };
      }

      // Large file - use multipart if allowed
      if (!allowMultipart) {
        return {
          valid: false,
          error: {
            code: 'file_too_large',
            message: `File is too large for single upload (${formatBytes(file.size)}). Maximum is ${formatBytes(MAX_SINGLE_UPLOAD_SIZE)}`,
            details: {
              maxSize: MAX_SINGLE_UPLOAD_SIZE,
              actualSize: file.size,
            },
          },
          uploadStrategy: 'single',
          fileCategory,
        };
      }

      const { partCount, partSize } = calculateMultipartParts(file.size);
      return {
        valid: true,
        uploadStrategy: 'multipart',
        partCount,
        partSize,
        fileCategory,
      };
    },
    [allowedTypes, allowMultipart, effectiveMaxSize],
  );

  const validateFiles = useCallback(
    (files: File[]): Map<File, FileValidationResult> => {
      const results = new Map<File, FileValidationResult>();
      for (const file of files) {
        results.set(file, validateFile(file));
      }
      return results;
    },
    [validateFile],
  );

  const constants = useMemo(
    () => ({
      maxSingleUploadSize: MAX_SINGLE_UPLOAD_SIZE,
      maxTotalFileSize: MAX_TOTAL_FILE_SIZE,
      minPartSize: MIN_MULTIPART_PART_SIZE,
      recommendedPartSize: RECOMMENDED_PART_SIZE,
      allowedTypes,
    }),
    [allowedTypes],
  );

  return {
    validateFile,
    validateFiles,
    isAllowedType,
    getFileCategory,
    formatFileSize,
    calculateParts,
    constants,
  };
}

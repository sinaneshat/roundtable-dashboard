'use client';

import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import type { FileCategory } from '@/api/core/enums';
import {
  ALLOWED_MIME_TYPES,
  FileCategorySchema,
  FileValidationErrorCodeSchema,
  getFileCategoryFromMime,
  MAX_MULTIPART_PARTS,
  MAX_SINGLE_UPLOAD_SIZE,
  MAX_TOTAL_FILE_SIZE,
  MIN_MULTIPART_PART_SIZE,
  RECOMMENDED_PART_SIZE,
  UploadStrategySchema,
} from '@/api/core/enums';
import { formatFileSize } from '@/lib/format';

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const FileValidationErrorDetailsSchema = z.object({
  maxSize: z.number().optional(),
  actualSize: z.number().optional(),
  allowedTypes: z.array(z.string()).readonly().optional(),
  actualType: z.string().optional(),
});

export const FileValidationErrorSchema = z.object({
  code: FileValidationErrorCodeSchema,
  message: z.string(),
  details: FileValidationErrorDetailsSchema.optional(),
});

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
  maxSize: z.number().optional(),
  allowedTypes: z.array(z.string()).readonly().optional(),
  allowMultipart: z.boolean().optional(),
});

export type UseFileValidationOptions = z.infer<typeof UseFileValidationOptionsSchema>;

export type UseFileValidationReturn = {
  validateFile: (file: File) => FileValidationResult;
  validateFiles: (files: File[]) => Map<File, FileValidationResult>;
  isAllowedType: (mimeType: string) => boolean;
  getFileCategory: (mimeType: string) => FileCategory;
  formatFileSize: (bytes: number) => string;
  calculateParts: (fileSize: number) => { partCount: number; partSize: number };
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

function checkAllowedMimeType(mimeType: string, allowedTypes: readonly string[]): boolean {
  return allowedTypes.includes(mimeType) || mimeType.startsWith('text/');
}

function calculateMultipartParts(fileSize: number): { partCount: number; partSize: number } {
  let partSize = RECOMMENDED_PART_SIZE;
  let partCount = Math.ceil(fileSize / partSize);

  if (partCount > MAX_MULTIPART_PARTS) {
    partSize = Math.ceil(fileSize / MAX_MULTIPART_PARTS);
    partCount = Math.ceil(fileSize / partSize);
  }

  return { partCount, partSize };
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

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

  const validateFile = useCallback(
    (file: File): FileValidationResult => {
      const fileCategory = getFileCategoryFromMime(file.type);

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

      if (file.size > effectiveMaxSize) {
        return {
          valid: false,
          error: {
            code: 'file_too_large',
            message: `File is too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(effectiveMaxSize)}`,
            details: {
              maxSize: effectiveMaxSize,
              actualSize: file.size,
            },
          },
          uploadStrategy: 'single',
          fileCategory,
        };
      }

      if (file.size <= MAX_SINGLE_UPLOAD_SIZE) {
        return {
          valid: true,
          uploadStrategy: 'single',
          fileCategory,
        };
      }

      if (!allowMultipart) {
        return {
          valid: false,
          error: {
            code: 'file_too_large',
            message: `File is too large for single upload (${formatFileSize(file.size)}). Maximum is ${formatFileSize(MAX_SINGLE_UPLOAD_SIZE)}`,
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
    getFileCategory: getFileCategoryFromMime,
    formatFileSize,
    calculateParts: calculateMultipartParts,
    constants,
  };
}

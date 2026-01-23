import type { FileCategory } from '@roundtable/shared';
import {
  ALLOWED_MIME_TYPES,
  FileCategorySchema,
  FileValidationErrorCodeSchema,
  getFileCategoryFromMime,
  getMaxFileSizeForMimeType,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_FILE_SIZE,
  MAX_MULTIPART_PARTS,
  MAX_PDF_FILE_SIZE,
  MAX_SINGLE_UPLOAD_SIZE,
  MAX_SPREADSHEET_FILE_SIZE,
  MAX_TOTAL_FILE_SIZE,
  MIN_MULTIPART_PART_SIZE,
  RECOMMENDED_PART_SIZE,
  SPREADSHEET_MIME_TYPES,
  UploadStrategies,
  UploadStrategySchema,
} from '@roundtable/shared';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { formatFileSize } from '@/lib/format';

const IMAGE_MIME_SET = new Set<string>(IMAGE_MIME_TYPES);
const SPREADSHEET_MIME_SET = new Set<string>(SPREADSHEET_MIME_TYPES);

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

/**
 * File size calculation result schema
 */
const _PartCalculationResultSchema = z.object({
  /** Number of parts needed */
  partCount: z.number().int().positive(),
  /** Size of each part in bytes */
  partSize: z.number().int().positive(),
});

/**
 * Constants schema for validation
 */
const _FileValidationConstantsSchema = z.object({
  /** Maximum single upload size in bytes */
  maxSingleUploadSize: z.number().int().positive(),
  /** Maximum total file size in bytes */
  maxTotalFileSize: z.number().int().positive(),
  /** Maximum image file size in bytes */
  maxImageFileSize: z.number().int().positive(),
  /** Maximum PDF file size in bytes */
  maxPdfFileSize: z.number().int().positive(),
  /** Maximum spreadsheet file size in bytes */
  maxSpreadsheetFileSize: z.number().int().positive(),
  /** Minimum multipart part size in bytes */
  minPartSize: z.number().int().positive(),
  /** Recommended part size in bytes */
  recommendedPartSize: z.number().int().positive(),
  /** Allowed MIME types */
  allowedTypes: z.array(z.string()).readonly(),
});

/**
 * Return type for useFileValidation hook
 */
export type UseFileValidationReturn = {
  /** Validate a single file */
  validateFile: (file: File) => FileValidationResult;
  /** Validate multiple files */
  validateFiles: (files: File[]) => Map<File, FileValidationResult>;
  /** Check if MIME type is allowed */
  isAllowedType: (mimeType: string) => boolean;
  /** Get file category from MIME type */
  getFileCategory: (mimeType: string) => FileCategory;
  /** Format file size to human readable */
  formatFileSize: (bytes: number) => string;
  /** Calculate multipart upload parts */
  calculateParts: (fileSize: number) => z.infer<typeof _PartCalculationResultSchema>;
  /** Validation constants */
  constants: z.infer<typeof _FileValidationConstantsSchema>;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function checkAllowedMimeType(mimeType: string, allowedTypes: readonly string[]): boolean {
  return allowedTypes.includes(mimeType);
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
          uploadStrategy: UploadStrategies.SINGLE,
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
          uploadStrategy: UploadStrategies.SINGLE,
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
          uploadStrategy: UploadStrategies.SINGLE,
          fileCategory,
        };
      }

      // Validate file size limits using centralized type-specific limits
      // Uses enum-based limits matching ChatGPT: 512MB general, 20MB images, 50MB spreadsheets
      const maxSizeForType = getMaxFileSizeForMimeType(file.type);
      const isPdf = file.type === 'application/pdf';
      const isImage = IMAGE_MIME_SET.has(file.type);
      const isSpreadsheet = SPREADSHEET_MIME_SET.has(file.type);

      if (file.size > maxSizeForType) {
        // Determine the appropriate error message based on file type
        let typeLabel = 'This file type';
        if (isPdf)
          typeLabel = 'PDF files';
        else if (isImage)
          typeLabel = 'Image files';
        else if (isSpreadsheet)
          typeLabel = 'Spreadsheet files';

        return {
          valid: false,
          error: {
            code: isImage || isPdf ? 'visual_file_too_large' : 'file_too_large',
            message: `${typeLabel} must be ${formatFileSize(maxSizeForType)} or smaller. Your file is ${formatFileSize(file.size)}.`,
            details: {
              maxSize: maxSizeForType,
              actualSize: file.size,
            },
          },
          uploadStrategy: UploadStrategies.SINGLE,
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
          uploadStrategy: UploadStrategies.SINGLE,
          fileCategory,
        };
      }

      if (file.size <= MAX_SINGLE_UPLOAD_SIZE) {
        return {
          valid: true,
          uploadStrategy: UploadStrategies.SINGLE,
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
          uploadStrategy: UploadStrategies.SINGLE,
          fileCategory,
        };
      }

      const { partCount, partSize } = calculateMultipartParts(file.size);
      return {
        valid: true,
        uploadStrategy: UploadStrategies.MULTIPART,
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
      maxImageFileSize: MAX_IMAGE_FILE_SIZE,
      maxPdfFileSize: MAX_PDF_FILE_SIZE,
      maxSpreadsheetFileSize: MAX_SPREADSHEET_FILE_SIZE,
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

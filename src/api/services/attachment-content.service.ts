/**
 * Attachment Content Service
 *
 * Converts uploaded file attachments to AI-model-ready content.
 * This service handles the backend conversion of files to formats
 * that AI providers can process (base64 data URLs).
 *
 * Key principle: All conversion happens on the backend.
 * The frontend only sends upload IDs, never base64 data.
 *
 * Reference: AI SDK v5 Multi-Modal Messages
 * https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#multi-modal-messages
 */

import { inArray } from 'drizzle-orm';

import { IMAGE_MIME_TYPES } from '@/api/core/enums';
import { getFile } from '@/api/services/storage.service';
import type { TypedLogger } from '@/api/types/logger';
import type { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * File content ready for AI model consumption
 * Follows AI SDK v5 FilePart structure
 */
export type ModelFilePart = {
  type: 'file';
  /** Data URL (base64 encoded) or URL that AI provider can access */
  url: string;
  /** MIME type of the file */
  mediaType: string;
  /** Original filename for reference */
  filename?: string;
};

/**
 * Parameters for loading attachment content
 */
export type LoadAttachmentContentParams = {
  /** Upload IDs to load */
  attachmentIds: string[];
  /** R2 bucket for file retrieval */
  r2Bucket: R2Bucket | undefined;
  /** Database instance */
  db: Awaited<ReturnType<typeof getDbAsync>>;
  /** Optional logger */
  logger?: TypedLogger;
};

/**
 * Result of loading attachment content
 */
export type LoadAttachmentContentResult = {
  /** File parts ready for AI model consumption */
  fileParts: ModelFilePart[];
  /** Any errors that occurred during loading */
  errors: Array<{ uploadId: string; error: string }>;
  /** Statistics about the load operation */
  stats: {
    total: number;
    loaded: number;
    failed: number;
    skipped: number;
  };
};

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum file size to convert to base64 (10MB)
 * Larger files should use URL-based access where supported
 */
const MAX_BASE64_FILE_SIZE = 10 * 1024 * 1024;

/**
 * MIME types that AI models can process visually
 * Only these types will be converted to base64 data URLs
 */
const VISUAL_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  'application/pdf',
]);

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Load and convert attachments to AI-model-ready file parts
 *
 * This function:
 * 1. Loads attachment metadata from the database
 * 2. Fetches file content from R2/local storage
 * 3. Converts visual files (images, PDFs) to base64 data URLs
 * 4. Returns properly formatted file parts for the AI SDK
 *
 * IMPORTANT: Conversion happens entirely on the backend.
 * The frontend never sees base64 data.
 *
 * @param params - Parameters for loading attachments
 * @returns File parts ready for model consumption
 */
export async function loadAttachmentContent(
  params: LoadAttachmentContentParams,
): Promise<LoadAttachmentContentResult> {
  const { attachmentIds, r2Bucket, db, logger } = params;

  const fileParts: ModelFilePart[] = [];
  const errors: Array<{ uploadId: string; error: string }> = [];
  let skipped = 0;

  if (!attachmentIds || attachmentIds.length === 0) {
    return {
      fileParts: [],
      errors: [],
      stats: { total: 0, loaded: 0, failed: 0, skipped: 0 },
    };
  }

  // Load attachment metadata from database
  const uploads = await db
    .select()
    .from(tables.upload)
    .where(inArray(tables.upload.id, attachmentIds));

  logger?.info('Loading attachment content for AI model', {
    logType: 'operation',
    operationName: 'loadAttachmentContent',
    attachmentCount: attachmentIds.length,
    foundUploads: uploads.length,
  });

  for (const upload of uploads) {
    try {
      // Skip files that AI models can't process visually
      if (!VISUAL_MIME_TYPES.has(upload.mimeType)) {
        logger?.debug('Skipping non-visual file', {
          logType: 'operation',
          operationName: 'loadAttachmentContent',
          uploadId: upload.id,
          mimeType: upload.mimeType,
        });
        skipped++;
        continue;
      }

      // Skip files that are too large for base64 conversion
      if (upload.fileSize > MAX_BASE64_FILE_SIZE) {
        logger?.warn('File too large for base64 conversion', {
          logType: 'operation',
          operationName: 'loadAttachmentContent',
          uploadId: upload.id,
          fileSize: upload.fileSize,
          maxSize: MAX_BASE64_FILE_SIZE,
        });
        errors.push({
          uploadId: upload.id,
          error: `File too large (${(upload.fileSize / 1024 / 1024).toFixed(1)}MB > ${MAX_BASE64_FILE_SIZE / 1024 / 1024}MB limit)`,
        });
        continue;
      }

      // Fetch file content from storage
      const { data } = await getFile(r2Bucket, upload.r2Key);

      if (!data) {
        logger?.warn('File not found in storage', {
          logType: 'operation',
          operationName: 'loadAttachmentContent',
          uploadId: upload.id,
          r2Key: upload.r2Key,
        });
        errors.push({
          uploadId: upload.id,
          error: 'File not found in storage',
        });
        continue;
      }

      // Convert to base64 data URL
      const base64 = arrayBufferToBase64(data);
      const dataUrl = `data:${upload.mimeType};base64,${base64}`;

      fileParts.push({
        type: 'file',
        url: dataUrl,
        mediaType: upload.mimeType,
        filename: upload.filename,
      });

      logger?.debug('Loaded attachment content', {
        logType: 'operation',
        operationName: 'loadAttachmentContent',
        uploadId: upload.id,
        filename: upload.filename,
        mimeType: upload.mimeType,
        sizeKB: Math.round(upload.fileSize / 1024),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger?.error('Failed to load attachment content', {
        logType: 'operation',
        operationName: 'loadAttachmentContent',
        uploadId: upload.id,
        error: errorMessage,
      });
      errors.push({
        uploadId: upload.id,
        error: errorMessage,
      });
    }
  }

  const stats = {
    total: attachmentIds.length,
    loaded: fileParts.length,
    failed: errors.length,
    skipped,
  };

  logger?.info('Attachment content loading complete', {
    logType: 'operation',
    operationName: 'loadAttachmentContent',
    stats,
  });

  return { fileParts, errors, stats };
}

/**
 * Convert ArrayBuffer to base64 string
 *
 * This is a backend-only operation. The frontend never sees base64 data.
 *
 * @param buffer - ArrayBuffer to convert
 * @returns Base64 encoded string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  return btoa(binary);
}

/**
 * Check if a MIME type is supported for visual AI processing
 *
 * @param mimeType - MIME type to check
 * @returns True if the file type can be processed by AI models
 */
export function isVisualMimeType(mimeType: string): boolean {
  return VISUAL_MIME_TYPES.has(mimeType);
}

/**
 * Check if a file size is within the conversion limit
 *
 * @param fileSize - File size in bytes
 * @returns True if the file can be converted to base64
 */
export function isWithinSizeLimit(fileSize: number): boolean {
  return fileSize <= MAX_BASE64_FILE_SIZE;
}

/**
 * Attachment Content Service
 *
 * Following backend-patterns.md: Service layer for business logic
 *
 * Converts uploaded files to AI-model-ready content (base64 data URLs).
 * All conversion happens on backend - frontend only sends upload IDs.
 */

import { eq, inArray } from 'drizzle-orm';

import { AI_PROCESSABLE_MIME_SET, MessagePartTypes, TEXT_EXTRACTABLE_MIME_TYPES } from '@/api/core/enums';
import { getFile } from '@/api/services/uploads';
import { extractPdfText, shouldExtractPdfText } from '@/api/services/uploads/pdf-extraction.service';
import { LogHelpers } from '@/api/types/logger';
import type {
  LoadAttachmentContentParams,
  LoadAttachmentContentResult,
  LoadMessageAttachmentsParams,
  LoadMessageAttachmentsResult,
  ModelFilePart,
  ModelFilePartBinary,
  ModelFilePartUrl,
  ModelImagePartUrl,
} from '@/api/types/uploads';
import { MAX_BASE64_FILE_SIZE } from '@/api/types/uploads';
import * as tables from '@/db';
import { getExtractedText } from '@/lib/utils/metadata';

// ============================================================================
// Main Functions
// ============================================================================

export async function loadAttachmentContent(params: LoadAttachmentContentParams): Promise<LoadAttachmentContentResult> {
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

  if (uploads.length === 0 && attachmentIds.length > 0) {
    logger?.error('No uploads found in DB for given IDs - possible race condition or incorrect upload IDs', LogHelpers.operation({
      operationName: 'loadAttachmentContent',
      attachmentCount: attachmentIds.length,
      foundUploads: 0,
    }));
  } else if (uploads.length < attachmentIds.length) {
    logger?.error('Partial uploads found - some IDs not in DB', LogHelpers.operation({
      operationName: 'loadAttachmentContent',
      attachmentCount: attachmentIds.length,
      foundUploads: uploads.length,
    }));
  }

  logger?.info('Loading attachment content for AI model', LogHelpers.operation({
    operationName: 'loadAttachmentContent',
    attachmentCount: attachmentIds.length,
    foundUploads: uploads.length,
  }));

  for (const upload of uploads) {
    try {
      // Skip files that AI models can't process visually
      if (!AI_PROCESSABLE_MIME_SET.has(upload.mimeType)) {
        logger?.debug('Skipping unsupported file type for AI processing', LogHelpers.operation({
          operationName: 'loadAttachmentContent',
          uploadId: upload.id,
          mimeType: upload.mimeType,
        }));
        skipped++;
        continue;
      }

      // Fetch file content from storage
      const { data } = await getFile(r2Bucket, upload.r2Key);

      if (!data) {
        logger?.error('File not found in storage', LogHelpers.operation({
          operationName: 'loadAttachmentContent',
          uploadId: upload.id,
          filename: upload.filename,
          r2Key: upload.r2Key,
        }));
        errors.push({
          uploadId: upload.id,
          error: 'File not found in storage',
        });
        continue;
      }

      const uint8Data = new Uint8Array(data);
      const base64 = arrayBufferToBase64(data);
      const dataUrl = `data:${upload.mimeType};base64,${base64}`;

      fileParts.push({
        type: MessagePartTypes.FILE,
        data: uint8Data,
        mimeType: upload.mimeType,
        filename: upload.filename,
        url: dataUrl,
        mediaType: upload.mimeType,
      });

      logger?.debug('Loaded attachment content', LogHelpers.operation({
        operationName: 'loadAttachmentContent',
        uploadId: upload.id,
        filename: upload.filename,
        mimeType: upload.mimeType,
        sizeKB: Math.round(upload.fileSize / 1024),
      }));
    } catch (error) {
      const errorMessage
        = error instanceof Error ? error.message : 'Unknown error';
      logger?.error('Failed to load attachment content', LogHelpers.operation({
        operationName: 'loadAttachmentContent',
        uploadId: upload.id,
        filename: upload.filename,
        mimeType: upload.mimeType,
        error: errorMessage,
      }));
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

  logger?.info('Attachment content loading complete', LogHelpers.operation({
    operationName: 'loadAttachmentContent',
    stats,
  }));

  return { fileParts, errors, stats };
}

// ============================================================================
// URL-Based Loading (All files use signed URLs for AI provider access)
// ============================================================================

// File part for AI model consumption - includes binary-only parts (no URL field)
// to prevent AI providers from attempting to download from localhost URLs
export type UrlFilePart = ModelFilePartUrl | ModelImagePartUrl | ModelFilePartBinary;

export type LoadAttachmentContentUrlParams = LoadAttachmentContentParams & {
  /** Base URL of the application for generating signed URLs */
  baseUrl: string;
  /** User ID for signing URLs */
  userId: string;
  /** BETTER_AUTH_SECRET for signing */
  secret: string;
  /** Optional thread ID for URL signing */
  threadId?: string;
};

export type LoadAttachmentContentUrlResult = {
  fileParts: UrlFilePart[];
  /** Extracted text from PDFs/documents (not sent as file parts to avoid AI provider timeout) */
  extractedTextContent: string | null;
  errors: Array<{ uploadId: string; error: string }>;
  stats: {
    total: number;
    loaded: number;
    failed: number;
    skipped: number;
  };
};

const TEXT_EXTRACTABLE_MIME_SET = new Set<string>(TEXT_EXTRACTABLE_MIME_TYPES);
const PDF_MIME_TYPE = 'application/pdf';

/**
 * Load attachment content using unified Uint8Array approach.
 *
 * UNIFIED FLOW (same for local/preview/prod):
 * - Always loads files as Uint8Array binary data
 * - AI SDK handles provider-specific delivery (no environment branching)
 * - PDFs: Extract text when possible, else send binary for visual processing
 * - Images: Always binary data (most reliable across providers)
 *
 * This ensures identical behavior across all environments.
 */
export async function loadAttachmentContentUrl(
  params: LoadAttachmentContentUrlParams,
): Promise<LoadAttachmentContentUrlResult> {
  const { attachmentIds, r2Bucket, db, logger } = params;

  const fileParts: UrlFilePart[] = [];
  const extractedTexts: string[] = [];
  const errors: Array<{ uploadId: string; error: string }> = [];
  let skipped = 0;

  if (!attachmentIds || attachmentIds.length === 0) {
    return {
      fileParts: [],
      extractedTextContent: null,
      errors: [],
      stats: { total: 0, loaded: 0, failed: 0, skipped: 0 },
    };
  }

  // Load attachment metadata from database
  const uploads = await db
    .select()
    .from(tables.upload)
    .where(inArray(tables.upload.id, attachmentIds));

  if (uploads.length === 0 && attachmentIds.length > 0) {
    logger?.error('No uploads found in DB - possible race condition', LogHelpers.operation({
      operationName: 'loadAttachmentContentUrl',
      attachmentCount: attachmentIds.length,
      foundUploads: 0,
    }));
  }

  logger?.info('Loading attachment content (unified Uint8Array mode)', LogHelpers.operation({
    operationName: 'loadAttachmentContentUrl',
    attachmentCount: attachmentIds.length,
    foundUploads: uploads.length,
  }));

  for (const upload of uploads) {
    try {
      // Skip files that AI models can't process
      if (!AI_PROCESSABLE_MIME_SET.has(upload.mimeType)) {
        logger?.debug('Skipping unsupported file type', LogHelpers.operation({
          operationName: 'loadAttachmentContentUrl',
          uploadId: upload.id,
          mimeType: upload.mimeType,
        }));
        skipped++;
        continue;
      }

      // Check file size limit
      if (upload.fileSize > MAX_BASE64_FILE_SIZE) {
        logger?.warn('File too large for processing, skipping', LogHelpers.operation({
          operationName: 'loadAttachmentContentUrl',
          uploadId: upload.id,
          fileSize: upload.fileSize,
          maxSize: MAX_BASE64_FILE_SIZE,
        }));
        skipped++;
        continue;
      }

      const isPdf = upload.mimeType === PDF_MIME_TYPE;
      const isTextExtractable = TEXT_EXTRACTABLE_MIME_SET.has(upload.mimeType);

      // PDFs and text-extractable files: try text extraction first
      if (isPdf || isTextExtractable) {
        // Check for pre-extracted text from background processing
        const extractedText = getExtractedText(upload.metadata);

        if (extractedText && extractedText.length > 0) {
          const fileTypeLabel = isPdf ? 'PDF' : 'Document';
          extractedTexts.push(`[${fileTypeLabel}: ${upload.filename}]\n\n${extractedText}`);

          logger?.debug('Using pre-extracted text', LogHelpers.operation({
            operationName: 'loadAttachmentContentUrl',
            uploadId: upload.id,
            filename: upload.filename,
            mimeType: upload.mimeType,
            fileSize: extractedText.length,
          }));
          continue;
        }

        // Check if background processing already determined this is a scanned/image PDF
        const requiresVision = upload.metadata && typeof upload.metadata === 'object' && 'requiresVision' in upload.metadata && (upload.metadata as { requiresVision?: boolean }).requiresVision === true;

        if (requiresVision) {
          logger?.info('PDF marked as requiring vision (scanned/image), loading binary', LogHelpers.operation({
            operationName: 'loadAttachmentContentUrl',
            uploadId: upload.id,
            filename: upload.filename,
          }));

          const { data } = await getFile(r2Bucket, upload.r2Key);
          if (data) {
            const uint8Data = new Uint8Array(data);
            fileParts.push({
              type: MessagePartTypes.FILE,
              data: uint8Data,
              mimeType: upload.mimeType,
              filename: upload.filename,
            } satisfies ModelFilePartBinary);

            // Add text fallback for non-vision models
            extractedTexts.push(`[PDF: ${upload.filename}]\n\n[This PDF appears to be scanned/image-based. Text extraction was unsuccessful. If you have vision capabilities, please examine the attached PDF image. Otherwise, please ask the user to provide a text-based version or describe the contents.]`);
          } else {
            errors.push({ uploadId: upload.id, error: 'File not found in storage' });
          }
          continue;
        }

        // No pre-extracted text - try synchronous extraction (fixes race condition)
        if (shouldExtractPdfText(upload.mimeType, upload.fileSize)) {
          logger?.info('Triggering synchronous PDF extraction', LogHelpers.operation({
            operationName: 'loadAttachmentContentUrl',
            uploadId: upload.id,
            filename: upload.filename,
            sizeKB: Math.round(upload.fileSize / 1024),
          }));

          const { data } = await getFile(r2Bucket, upload.r2Key);
          if (!data) {
            logger?.error('File not found in storage', LogHelpers.operation({
              operationName: 'loadAttachmentContentUrl',
              uploadId: upload.id,
              r2Key: upload.r2Key,
            }));
            errors.push({ uploadId: upload.id, error: 'File not found in storage' });
            continue;
          }

          const extractionResult = await extractPdfText(data);
          if (extractionResult.success && extractionResult.text) {
            const fileTypeLabel = isPdf ? 'PDF' : 'Document';
            extractedTexts.push(`[${fileTypeLabel}: ${upload.filename}]\n\n${extractionResult.text}`);

            logger?.info('Synchronous extraction succeeded', LogHelpers.operation({
              operationName: 'loadAttachmentContentUrl',
              uploadId: upload.id,
              fileSize: extractionResult.text.length,
            }));

            // Update DB for future requests (fire-and-forget)
            db.update(tables.upload)
              .set({
                metadata: {
                  extractedText: extractionResult.text,
                  totalPages: extractionResult.totalPages,
                  extractedAt: new Date().toISOString(),
                },
                updatedAt: new Date(),
              })
              .where(eq(tables.upload.id, upload.id))
              .catch(err => logger?.error('Failed to save extracted text', LogHelpers.operation({
                operationName: 'loadAttachmentContentUrl',
                uploadId: upload.id,
                error: err instanceof Error ? err.message : 'Unknown',
              })));
            continue;
          }

          // Extraction failed - fall back to binary for visual processing
          // Also add a text fallback for models without vision support
          // NOTE: PDF.js may consume/transfer the ArrayBuffer, so we re-fetch for binary
          logger?.warn('Extraction failed, using binary fallback', LogHelpers.operation({
            operationName: 'loadAttachmentContentUrl',
            uploadId: upload.id,
            error: extractionResult.error,
          }));

          // Re-fetch file since PDF.js may have consumed the original ArrayBuffer
          const { data: freshData } = await getFile(r2Bucket, upload.r2Key);
          if (!freshData || freshData.byteLength === 0) {
            logger?.error('File re-fetch failed for binary fallback', LogHelpers.operation({
              operationName: 'loadAttachmentContentUrl',
              uploadId: upload.id,
            }));
            errors.push({ uploadId: upload.id, error: 'File re-fetch failed for binary fallback' });
            // Note: stats counter will be incremented at the end based on errors.length
            continue;
          }

          const uint8Data = new Uint8Array(freshData);
          fileParts.push({
            type: MessagePartTypes.FILE,
            data: uint8Data,
            mimeType: upload.mimeType,
            filename: upload.filename,
          } satisfies ModelFilePartBinary);

          // Add text fallback explaining the PDF situation for non-vision models
          // This ensures the AI knows about the attachment even if file parts are filtered
          extractedTexts.push(`[PDF: ${upload.filename}]\n\n[This PDF appears to be scanned/image-based. Text extraction was unsuccessful. If you have vision capabilities, please examine the attached PDF image. Otherwise, please ask the user to provide a text-based version or describe the contents.]`);
          continue;
        }

        // Non-PDF text file without extraction capability - load as binary
      }

      // UNIFIED: Load all files as Uint8Array binary data
      // AI SDK handles provider-specific delivery
      const { data } = await getFile(r2Bucket, upload.r2Key);

      if (!data) {
        logger?.error('File not found in storage', LogHelpers.operation({
          operationName: 'loadAttachmentContentUrl',
          uploadId: upload.id,
          filename: upload.filename,
          r2Key: upload.r2Key,
        }));
        errors.push({ uploadId: upload.id, error: 'File not found in storage' });
        continue;
      }

      const uint8Data = new Uint8Array(data);

      fileParts.push({
        type: MessagePartTypes.FILE,
        data: uint8Data,
        mimeType: upload.mimeType,
        filename: upload.filename,
      } satisfies ModelFilePartBinary);

      logger?.debug('Loaded file as Uint8Array', LogHelpers.operation({
        operationName: 'loadAttachmentContentUrl',
        uploadId: upload.id,
        filename: upload.filename,
        mimeType: upload.mimeType,
        sizeKB: Math.round(upload.fileSize / 1024),
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger?.error('Failed to load attachment', LogHelpers.operation({
        operationName: 'loadAttachmentContentUrl',
        uploadId: upload.id,
        filename: upload.filename,
        error: errorMessage,
      }));
      errors.push({ uploadId: upload.id, error: errorMessage });
    }
  }

  const stats = {
    total: attachmentIds.length,
    loaded: fileParts.length + extractedTexts.length,
    failed: errors.length,
    skipped,
  };

  const extractedTextContent = extractedTexts.length > 0
    ? extractedTexts.join('\n\n---\n\n')
    : null;

  logger?.info('Attachment loading complete', LogHelpers.operation({
    operationName: 'loadAttachmentContentUrl',
    stats,
  }));

  return { fileParts, extractedTextContent, errors, stats };
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  // O(n) chunked approach - avoids O(n²) string concatenation memory exhaustion
  // Process in 32KB chunks to avoid stack overflow with String.fromCharCode.apply
  const CHUNK_SIZE = 0x8000; // 32KB
  const chunks: string[] = [];

  for (let i = 0; i < bytes.byteLength; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.byteLength));
    chunks.push(String.fromCharCode.apply(null, Array.from(slice)));
  }

  return btoa(chunks.join(''));
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return uint8ArrayToBase64(new Uint8Array(buffer));
}

export function isWithinSizeLimit(fileSize: number): boolean {
  return fileSize <= MAX_BASE64_FILE_SIZE;
}

export async function loadMessageAttachments(params: LoadMessageAttachmentsParams): Promise<LoadMessageAttachmentsResult> {
  const { messageIds, r2Bucket, db, logger } = params;

  const filePartsByMessageId = new Map<string, ModelFilePart[]>();
  const errors: Array<{ messageId: string; uploadId: string; error: string }>
    = [];
  let totalUploads = 0;
  let loaded = 0;
  let failed = 0;
  let skipped = 0;

  if (!messageIds || messageIds.length === 0) {
    return {
      filePartsByMessageId,
      errors: [],
      stats: {
        messagesWithAttachments: 0,
        totalUploads: 0,
        loaded: 0,
        failed: 0,
        skipped: 0,
      },
    };
  }

  const messageUploadsRaw = await db
    .select()
    .from(tables.messageUpload)
    .innerJoin(tables.upload, eq(tables.messageUpload.uploadId, tables.upload.id))
    .where(inArray(tables.messageUpload.messageId, messageIds));

  if (messageUploadsRaw.length === 0) {
    logger?.debug('No attachments found for messages', LogHelpers.operation({
      operationName: 'loadMessageAttachments',
      messageCount: messageIds.length,
    }));
    return {
      filePartsByMessageId,
      errors: [],
      stats: {
        messagesWithAttachments: 0,
        totalUploads: 0,
        loaded: 0,
        failed: 0,
        skipped: 0,
      },
    };
  }

  // Group by message ID for efficient processing
  // Drizzle returns joined results with table names as keys: { message_upload: {...}, upload: {...} }
  const uploadsByMessageId = new Map<
    string,
    Array<{
      uploadId: string;
      displayOrder: number;
      upload: (typeof messageUploadsRaw)[0]['upload'];
    }>
  >();

  for (const row of messageUploadsRaw) {
    const messageUpload = row.message_upload;
    const existing = uploadsByMessageId.get(messageUpload.messageId) || [];
    existing.push({
      uploadId: messageUpload.uploadId,
      displayOrder: messageUpload.displayOrder,
      upload: row.upload,
    });
    uploadsByMessageId.set(messageUpload.messageId, existing);
  }

  totalUploads = messageUploadsRaw.length;

  logger?.info('Loading attachment content for messages', LogHelpers.operation({
    operationName: 'loadMessageAttachments',
    messageCount: messageIds.length,
    messagesWithAttachments: uploadsByMessageId.size,
    totalUploads,
  }));

  // Process each message's attachments
  for (const [messageId, uploads] of uploadsByMessageId) {
    const messageParts: ModelFilePart[] = [];

    // Sort by display order
    uploads.sort((a, b) => a.displayOrder - b.displayOrder);

    for (const { uploadId, upload } of uploads) {
      try {
        // Skip files that AI models can't process visually
        if (!AI_PROCESSABLE_MIME_SET.has(upload.mimeType)) {
          logger?.debug('Skipping unsupported file type for AI processing in message', LogHelpers.operation({
            operationName: 'loadMessageAttachments',
            messageId,
            uploadId,
            mimeType: upload.mimeType,
          }));
          skipped++;
          continue;
        }

        // Fetch file content from storage
        const { data } = await getFile(r2Bucket, upload.r2Key);

        if (!data) {
          logger?.error('File not found in storage for message', LogHelpers.operation({
            operationName: 'loadMessageAttachments',
            messageId,
            uploadId,
            filename: upload.filename,
            r2Key: upload.r2Key,
          }));
          errors.push({
            messageId,
            uploadId,
            error: 'File not found in storage',
          });
          failed++;
          continue;
        }

        // Convert ArrayBuffer to Uint8Array for OpenRouter provider compatibility
        // The OpenRouter provider's getFileUrl() expects part.data as Uint8Array
        const uint8Data = new Uint8Array(data);

        // Also create data URL for UIMessage compatibility
        const base64 = arrayBufferToBase64(data);
        const dataUrl = `data:${upload.mimeType};base64,${base64}`;

        messageParts.push({
          type: MessagePartTypes.FILE,
          // LanguageModelV2 format (what OpenRouter provider expects)
          data: uint8Data,
          mimeType: upload.mimeType,
          filename: upload.filename,
          // UIMessage format (for streaming-orchestration message building)
          url: dataUrl,
          mediaType: upload.mimeType,
        });

        loaded++;

        logger?.debug('Loaded attachment content for message', LogHelpers.operation({
          operationName: 'loadMessageAttachments',
          messageId,
          uploadId,
          filename: upload.filename,
          mimeType: upload.mimeType,
          sizeKB: Math.round(upload.fileSize / 1024),
        }));
      } catch (error) {
        const errorMessage
          = error instanceof Error ? error.message : 'Unknown error';
        logger?.error('Failed to load attachment for message', LogHelpers.operation({
          operationName: 'loadMessageAttachments',
          messageId,
          uploadId,
          filename: upload.filename,
          error: errorMessage,
        }));
        errors.push({
          messageId,
          uploadId,
          error: errorMessage,
        });
        failed++;
      }
    }

    if (messageParts.length > 0) {
      filePartsByMessageId.set(messageId, messageParts);
    }
  }

  const stats = {
    messagesWithAttachments: uploadsByMessageId.size,
    totalUploads,
    loaded,
    failed,
    skipped,
  };

  logger?.info('Message attachment loading complete', LogHelpers.operation({
    operationName: 'loadMessageAttachments',
    stats,
  }));

  return { filePartsByMessageId, errors, stats };
}

// ============================================================================
// URL-Based Message Attachment Loading (Memory-Efficient)
// ============================================================================

export type LoadMessageAttachmentsUrlParams = LoadMessageAttachmentsParams & {
  /** Base URL of the application for generating signed URLs */
  baseUrl: string;
  /** User ID for signing URLs */
  userId: string;
  /** BETTER_AUTH_SECRET for signing */
  secret: string;
  /** Optional thread ID for URL signing */
  threadId?: string;
};

export type LoadMessageAttachmentsUrlResult = {
  filePartsByMessageId: Map<string, UrlFilePart[]>;
  /** Extracted text from PDFs/documents by message ID (not sent as file parts to avoid AI provider timeout) */
  extractedTextByMessageId: Map<string, string>;
  errors: Array<{ messageId: string; uploadId: string; error: string }>;
  stats: {
    messagesWithAttachments: number;
    totalUploads: number;
    loaded: number;
    failed: number;
    skipped: number;
  };
};

/**
 * Load message attachments using unified Uint8Array approach.
 *
 * UNIFIED FLOW (same for local/preview/prod):
 * - Always loads files as Uint8Array binary data
 * - AI SDK handles provider-specific delivery (no environment branching)
 * - PDFs: Extract text when possible, else send binary for visual processing
 * - Images/other files: Always binary data (most reliable across providers)
 *
 * This ensures identical behavior across all environments.
 */
export async function loadMessageAttachmentsUrl(
  params: LoadMessageAttachmentsUrlParams,
): Promise<LoadMessageAttachmentsUrlResult> {
  const { messageIds, r2Bucket, db, logger } = params;

  const filePartsByMessageId = new Map<string, UrlFilePart[]>();
  const extractedTextByMessageId = new Map<string, string>();
  const errors: Array<{ messageId: string; uploadId: string; error: string }> = [];
  let totalUploads = 0;
  let loaded = 0;
  let failed = 0;
  let skipped = 0;

  if (!messageIds || messageIds.length === 0) {
    return {
      filePartsByMessageId,
      extractedTextByMessageId,
      errors: [],
      stats: {
        messagesWithAttachments: 0,
        totalUploads: 0,
        loaded: 0,
        failed: 0,
        skipped: 0,
      },
    };
  }

  const messageUploadsRaw = await db
    .select()
    .from(tables.messageUpload)
    .innerJoin(tables.upload, eq(tables.messageUpload.uploadId, tables.upload.id))
    .where(inArray(tables.messageUpload.messageId, messageIds));

  if (messageUploadsRaw.length === 0) {
    logger?.debug('No attachments found for messages', LogHelpers.operation({
      operationName: 'loadMessageAttachmentsUrl',
      messageCount: messageIds.length,
    }));
    return {
      filePartsByMessageId,
      extractedTextByMessageId,
      errors: [],
      stats: {
        messagesWithAttachments: 0,
        totalUploads: 0,
        loaded: 0,
        failed: 0,
        skipped: 0,
      },
    };
  }

  // Group by message ID
  const uploadsByMessageId = new Map<
    string,
    Array<{
      uploadId: string;
      displayOrder: number;
      upload: (typeof messageUploadsRaw)[0]['upload'];
    }>
  >();

  for (const row of messageUploadsRaw) {
    const messageUpload = row.message_upload;
    const existing = uploadsByMessageId.get(messageUpload.messageId) || [];
    existing.push({
      uploadId: messageUpload.uploadId,
      displayOrder: messageUpload.displayOrder,
      upload: row.upload,
    });
    uploadsByMessageId.set(messageUpload.messageId, existing);
  }

  totalUploads = messageUploadsRaw.length;

  logger?.info('Loading message attachments (unified Uint8Array mode)', LogHelpers.operation({
    operationName: 'loadMessageAttachmentsUrl',
    messageCount: messageIds.length,
    messagesWithAttachments: uploadsByMessageId.size,
    totalUploads,
  }));

  // Process each message's attachments
  for (const [messageId, uploads] of uploadsByMessageId) {
    const messageParts: UrlFilePart[] = [];

    uploads.sort((a, b) => a.displayOrder - b.displayOrder);

    for (const { uploadId, upload } of uploads) {
      try {
        // Skip unsupported file types
        if (!AI_PROCESSABLE_MIME_SET.has(upload.mimeType)) {
          logger?.debug('Skipping unsupported file type', LogHelpers.operation({
            operationName: 'loadMessageAttachmentsUrl',
            messageId,
            uploadId,
            mimeType: upload.mimeType,
          }));
          skipped++;
          continue;
        }

        // Check file size limit
        if (upload.fileSize > MAX_BASE64_FILE_SIZE) {
          logger?.warn('File too large for processing, skipping', LogHelpers.operation({
            operationName: 'loadMessageAttachmentsUrl',
            messageId,
            uploadId,
            fileSize: upload.fileSize,
            maxSize: MAX_BASE64_FILE_SIZE,
          }));
          skipped++;
          continue;
        }

        const isPdf = upload.mimeType === PDF_MIME_TYPE;
        const isTextExtractable = TEXT_EXTRACTABLE_MIME_SET.has(upload.mimeType);

        // PDFs and text files: try text extraction first
        if (isPdf || isTextExtractable) {
          const extractedText = getExtractedText(upload.metadata);

          if (extractedText && extractedText.length > 0) {
            const fileTypeLabel = isPdf ? 'PDF' : 'Document';
            const formattedText = `[${fileTypeLabel}: ${upload.filename}]\n\n${extractedText}`;

            const existing = extractedTextByMessageId.get(messageId) || '';
            extractedTextByMessageId.set(
              messageId,
              existing ? `${existing}\n\n---\n\n${formattedText}` : formattedText,
            );

            loaded++;

            logger?.debug('Using pre-extracted text', LogHelpers.operation({
              operationName: 'loadMessageAttachmentsUrl',
              messageId,
              uploadId,
              filename: upload.filename,
              fileSize: extractedText.length,
            }));
            continue;
          }

          // No pre-extracted text - try synchronous extraction
          if (shouldExtractPdfText(upload.mimeType, upload.fileSize)) {
            logger?.info('Triggering synchronous PDF extraction', LogHelpers.operation({
              operationName: 'loadMessageAttachmentsUrl',
              messageId,
              uploadId,
              filename: upload.filename,
              sizeKB: Math.round(upload.fileSize / 1024),
            }));

            const { data } = await getFile(r2Bucket, upload.r2Key);
            if (!data) {
              logger?.error('File not found in storage', LogHelpers.operation({
                operationName: 'loadMessageAttachmentsUrl',
                messageId,
                uploadId,
                r2Key: upload.r2Key,
              }));
              errors.push({ messageId, uploadId, error: 'File not found' });
              failed++;
              continue;
            }

            const extractionResult = await extractPdfText(data);
            if (extractionResult.success && extractionResult.text) {
              const fileTypeLabel = isPdf ? 'PDF' : 'Document';
              const formattedText = `[${fileTypeLabel}: ${upload.filename}]\n\n${extractionResult.text}`;

              const existing = extractedTextByMessageId.get(messageId) || '';
              extractedTextByMessageId.set(
                messageId,
                existing ? `${existing}\n\n---\n\n${formattedText}` : formattedText,
              );

              loaded++;

              logger?.info('Synchronous extraction succeeded', LogHelpers.operation({
                operationName: 'loadMessageAttachmentsUrl',
                messageId,
                uploadId,
                fileSize: extractionResult.text.length,
              }));

              // Update DB for future requests (fire-and-forget)
              db.update(tables.upload)
                .set({
                  metadata: {
                    extractedText: extractionResult.text,
                    totalPages: extractionResult.totalPages,
                    extractedAt: new Date().toISOString(),
                  },
                  updatedAt: new Date(),
                })
                .where(eq(tables.upload.id, upload.id))
                .catch(err => logger?.error('Failed to save extracted text', LogHelpers.operation({
                  operationName: 'loadMessageAttachmentsUrl',
                  uploadId: upload.id,
                  error: err instanceof Error ? err.message : 'Unknown',
                })));
              continue;
            }

            // Extraction failed - use binary as fallback
            // NOTE: PDF.js may consume/transfer the ArrayBuffer, so we re-fetch for binary
            logger?.warn('Extraction failed, using binary', LogHelpers.operation({
              operationName: 'loadMessageAttachmentsUrl',
              messageId,
              uploadId,
              error: extractionResult.error,
            }));

            // Re-fetch file since PDF.js may have consumed the original ArrayBuffer
            const { data: freshData } = await getFile(r2Bucket, upload.r2Key);
            if (!freshData || freshData.byteLength === 0) {
              logger?.error('File re-fetch failed for binary fallback', LogHelpers.operation({
                operationName: 'loadMessageAttachmentsUrl',
                messageId,
                uploadId,
              }));
              errors.push({ messageId, uploadId, error: 'File re-fetch failed for binary fallback' });
              failed++;
              continue;
            }

            const uint8Data = new Uint8Array(freshData);
            // Include url and mediaType for UIMessage validation compatibility
            // AI SDK uses 'data' when present, so url won't be fetched
            const base64 = arrayBufferToBase64(freshData);
            const dataUrl = `data:${upload.mimeType};base64,${base64}`;
            messageParts.push({
              type: MessagePartTypes.FILE,
              data: uint8Data,
              mimeType: upload.mimeType,
              filename: upload.filename,
              url: dataUrl,
              mediaType: upload.mimeType,
            } satisfies ModelFilePart);

            // Add text fallback for non-vision models (same as loadAttachmentContentUrl)
            const scannedPdfText = `[PDF: ${upload.filename}]\n\n[This PDF appears to be scanned/image-based. Text extraction was unsuccessful. If you have vision capabilities, please examine the attached PDF image. Otherwise, please ask the user to provide a text-based version or describe the contents.]`;
            const existing = extractedTextByMessageId.get(messageId) || '';
            extractedTextByMessageId.set(
              messageId,
              existing ? `${existing}\n\n---\n\n${scannedPdfText}` : scannedPdfText,
            );

            loaded++;
            continue;
          }
        }

        // UNIFIED: Load all files as Uint8Array binary
        const { data } = await getFile(r2Bucket, upload.r2Key);

        if (!data) {
          logger?.error('File not found in storage', LogHelpers.operation({
            operationName: 'loadMessageAttachmentsUrl',
            messageId,
            uploadId,
            filename: upload.filename,
            r2Key: upload.r2Key,
          }));
          errors.push({ messageId, uploadId, error: 'File not found' });
          failed++;
          continue;
        }

        const uint8Data = new Uint8Array(data);
        // Include url and mediaType for UIMessage validation compatibility
        const base64 = arrayBufferToBase64(data);
        const dataUrl = `data:${upload.mimeType};base64,${base64}`;

        messageParts.push({
          type: MessagePartTypes.FILE,
          data: uint8Data,
          mimeType: upload.mimeType,
          filename: upload.filename,
          url: dataUrl,
          mediaType: upload.mimeType,
        } satisfies ModelFilePart);

        loaded++;

        logger?.debug('Loaded file as Uint8Array with data URL', LogHelpers.operation({
          operationName: 'loadMessageAttachmentsUrl',
          messageId,
          uploadId,
          filename: upload.filename,
          mimeType: upload.mimeType,
          sizeKB: Math.round(upload.fileSize / 1024),
        }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger?.error('Failed to process attachment', LogHelpers.operation({
          operationName: 'loadMessageAttachmentsUrl',
          messageId,
          uploadId,
          filename: upload.filename,
          error: errorMessage,
        }));
        errors.push({ messageId, uploadId, error: errorMessage });
        failed++;
      }
    }

    if (messageParts.length > 0) {
      filePartsByMessageId.set(messageId, messageParts);
    }
  }

  const stats = {
    messagesWithAttachments: uploadsByMessageId.size,
    totalUploads,
    loaded,
    failed,
    skipped,
  };

  logger?.info('Message attachment loading complete', LogHelpers.operation({
    operationName: 'loadMessageAttachmentsUrl',
    stats,
    filePartsCount: filePartsByMessageId.size,
    resultCount: extractedTextByMessageId.size,
  }));

  return { filePartsByMessageId, extractedTextByMessageId, errors, stats };
}

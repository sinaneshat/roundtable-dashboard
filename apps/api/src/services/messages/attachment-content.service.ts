/**
 * Attachment Content Service
 *
 * Following backend-patterns.md: Service layer for business logic
 *
 * Converts uploaded files to AI-model-ready content (base64 data URLs).
 * All conversion happens on backend - frontend only sends upload IDs.
 */

import { AI_PROCESSABLE_MIME_SET, MessagePartTypes, TEXT_EXTRACTABLE_MIME_TYPES } from '@roundtable/shared/enums';
import { eq, inArray } from 'drizzle-orm';

import * as tables from '@/db';
import { getExtractedText } from '@/lib/utils/metadata';
import { getFile } from '@/services/uploads';
import { extractPdfText, shouldExtractPdfText } from '@/services/uploads/pdf-extraction.service';
import { LogHelpers } from '@/types/logger';
import type {
  LoadAttachmentContentParams,
  LoadAttachmentContentResult,
  LoadAttachmentContentUrlParams,
  LoadMessageAttachmentsParams,
  LoadMessageAttachmentsResult,
  LoadMessageAttachmentsUrlParams,
  ModelFilePart,
  ModelFilePartBinary,
  ModelFilePartUrl,
  ModelImagePartUrl,
} from '@/types/uploads';
import { MAX_BASE64_FILE_SIZE } from '@/types/uploads';

// ============================================================================
// Main Functions
// ============================================================================

export async function loadAttachmentContent(params: LoadAttachmentContentParams): Promise<LoadAttachmentContentResult> {
  const { attachmentIds, db, logger, r2Bucket } = params;

  const fileParts: ModelFilePart[] = [];
  const errors: { uploadId: string; error: string }[] = [];
  let skipped = 0;

  if (!attachmentIds || attachmentIds.length === 0) {
    return {
      errors: [],
      fileParts: [],
      stats: { failed: 0, loaded: 0, skipped: 0, total: 0 },
    };
  }

  // Load attachment metadata from database
  const uploads = await db
    .select()
    .from(tables.upload)
    .where(inArray(tables.upload.id, attachmentIds));

  if (uploads.length === 0 && attachmentIds.length > 0) {
    logger?.error('No uploads found in DB for given IDs - possible race condition or incorrect upload IDs', LogHelpers.operation({
      attachmentCount: attachmentIds.length,
      foundUploads: 0,
      operationName: 'loadAttachmentContent',
    }));
  } else if (uploads.length < attachmentIds.length) {
    logger?.error('Partial uploads found - some IDs not in DB', LogHelpers.operation({
      attachmentCount: attachmentIds.length,
      foundUploads: uploads.length,
      operationName: 'loadAttachmentContent',
    }));
  }

  logger?.info('Loading attachment content for AI model', LogHelpers.operation({
    attachmentCount: attachmentIds.length,
    foundUploads: uploads.length,
    operationName: 'loadAttachmentContent',
  }));

  for (const upload of uploads) {
    try {
      // Skip files that AI models can't process visually
      if (!AI_PROCESSABLE_MIME_SET.has(upload.mimeType)) {
        logger?.debug('Skipping unsupported file type for AI processing', LogHelpers.operation({
          mimeType: upload.mimeType,
          operationName: 'loadAttachmentContent',
          uploadId: upload.id,
        }));
        skipped++;
        continue;
      }

      // Skip files too large for memory-safe processing (128MB worker limit)
      if (upload.fileSize > MAX_BASE64_FILE_SIZE) {
        logger?.warn('File too large for memory-safe processing, skipping', LogHelpers.operation({
          fileSize: upload.fileSize,
          maxSize: MAX_BASE64_FILE_SIZE,
          operationName: 'loadAttachmentContent',
          uploadId: upload.id,
        }));
        skipped++;
        continue;
      }

      // Fetch file content from storage
      const { data } = await getFile(r2Bucket, upload.r2Key);

      if (!data) {
        logger?.error('File not found in storage', LogHelpers.operation({
          filename: upload.filename,
          operationName: 'loadAttachmentContent',
          r2Key: upload.r2Key,
          uploadId: upload.id,
        }));
        errors.push({
          error: 'File not found in storage',
          uploadId: upload.id,
        });
        continue;
      }

      const uint8Data = new Uint8Array(data);
      const base64 = arrayBufferToBase64(data);
      const dataUrl = `data:${upload.mimeType};base64,${base64}`;

      fileParts.push({
        data: uint8Data,
        filename: upload.filename,
        mediaType: upload.mimeType,
        mimeType: upload.mimeType,
        type: MessagePartTypes.FILE,
        url: dataUrl,
      });

      logger?.debug('Loaded attachment content', LogHelpers.operation({
        filename: upload.filename,
        mimeType: upload.mimeType,
        operationName: 'loadAttachmentContent',
        sizeKB: Math.round(upload.fileSize / 1024),
        uploadId: upload.id,
      }));
    } catch (error) {
      const errorMessage
        = error instanceof Error ? error.message : 'Unknown error';
      logger?.error('Failed to load attachment content', LogHelpers.operation({
        error: errorMessage,
        filename: upload.filename,
        mimeType: upload.mimeType,
        operationName: 'loadAttachmentContent',
        uploadId: upload.id,
      }));
      errors.push({
        error: errorMessage,
        uploadId: upload.id,
      });
    }
  }

  const stats = {
    failed: errors.length,
    loaded: fileParts.length,
    skipped,
    total: attachmentIds.length,
  };

  logger?.info('Attachment content loading complete', LogHelpers.operation({
    operationName: 'loadAttachmentContent',
    stats,
  }));

  return { errors, fileParts, stats };
}

// ============================================================================
// URL-Based Loading (All files use signed URLs for AI provider access)
// ============================================================================

// File part for AI model consumption - includes both URL-based and full model parts
export type UrlFilePart = ModelFilePartUrl | ModelImagePartUrl | ModelFilePartBinary | ModelFilePart;

// LoadAttachmentContentUrlParams is now defined via Zod schema in types/uploads.ts
// Re-export for backwards compatibility
export type { LoadAttachmentContentUrlParams } from '@/types/uploads';

export type LoadAttachmentContentUrlResult = {
  fileParts: UrlFilePart[];
  /** Extracted text from PDFs/documents (not sent as file parts to avoid AI provider timeout) */
  extractedTextContent: string | null;
  errors: { uploadId: string; error: string }[];
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
  const { attachmentIds, db, logger, r2Bucket } = params;

  const fileParts: UrlFilePart[] = [];
  const extractedTexts: string[] = [];
  const errors: { uploadId: string; error: string }[] = [];
  let skipped = 0;

  if (!attachmentIds || attachmentIds.length === 0) {
    return {
      errors: [],
      extractedTextContent: null,
      fileParts: [],
      stats: { failed: 0, loaded: 0, skipped: 0, total: 0 },
    };
  }

  // Load attachment metadata from database
  const uploads = await db
    .select()
    .from(tables.upload)
    .where(inArray(tables.upload.id, attachmentIds));

  if (uploads.length === 0 && attachmentIds.length > 0) {
    logger?.error('No uploads found in DB - possible race condition', LogHelpers.operation({
      attachmentCount: attachmentIds.length,
      foundUploads: 0,
      operationName: 'loadAttachmentContentUrl',
    }));
  }

  logger?.info('Loading attachment content (unified Uint8Array mode)', LogHelpers.operation({
    attachmentCount: attachmentIds.length,
    foundUploads: uploads.length,
    operationName: 'loadAttachmentContentUrl',
  }));

  for (const upload of uploads) {
    try {
      // Skip files that AI models can't process
      if (!AI_PROCESSABLE_MIME_SET.has(upload.mimeType)) {
        logger?.debug('Skipping unsupported file type', LogHelpers.operation({
          mimeType: upload.mimeType,
          operationName: 'loadAttachmentContentUrl',
          uploadId: upload.id,
        }));
        skipped++;
        continue;
      }

      const isPdf = upload.mimeType === PDF_MIME_TYPE;
      const isTextExtractable = TEXT_EXTRACTABLE_MIME_SET.has(upload.mimeType);

      // PDFs and text-extractable files: check for pre-extracted text FIRST
      // This allows large PDFs to work if they have extracted text (no binary loading needed)
      if (isPdf || isTextExtractable) {
        // Check for pre-extracted text from background processing
        const extractedText = getExtractedText(upload.metadata);

        if (extractedText && extractedText.length > 0) {
          const fileTypeLabel = isPdf ? 'PDF' : 'Document';
          extractedTexts.push(`[${fileTypeLabel}: ${upload.filename}]\n\n${extractedText}`);

          logger?.debug('Using pre-extracted text', LogHelpers.operation({
            filename: upload.filename,
            fileSize: extractedText.length,
            mimeType: upload.mimeType,
            operationName: 'loadAttachmentContentUrl',
            uploadId: upload.id,
          }));
          continue;
        }

        // Check if background processing already determined this is a scanned/image PDF
        const requiresVision = upload.metadata && typeof upload.metadata === 'object' && 'requiresVision' in upload.metadata && (upload.metadata as { requiresVision?: boolean }).requiresVision === true;

        if (requiresVision) {
          // For vision PDFs, check size before loading binary
          if (upload.fileSize > MAX_BASE64_FILE_SIZE) {
            logger?.warn('Scanned PDF too large for binary loading, providing text fallback', LogHelpers.operation({
              fileSize: upload.fileSize,
              maxSize: MAX_BASE64_FILE_SIZE,
              operationName: 'loadAttachmentContentUrl',
              uploadId: upload.id,
            }));
            // Provide text fallback for large scanned PDFs
            extractedTexts.push(`[PDF: ${upload.filename}]\n\n[This PDF is a scanned/image-based document (${(upload.fileSize / 1024 / 1024).toFixed(1)}MB). It's too large to process visually. Please upload a text-based PDF or a smaller scanned document (max 10MB for visual processing).]`);
            continue;
          }

          logger?.info('PDF marked as requiring vision (scanned/image), loading binary', LogHelpers.operation({
            filename: upload.filename,
            operationName: 'loadAttachmentContentUrl',
            uploadId: upload.id,
          }));

          const { data } = await getFile(r2Bucket, upload.r2Key);
          if (data) {
            const uint8Data = new Uint8Array(data);
            const base64 = uint8ArrayToBase64(uint8Data);
            const dataUrl = `data:${upload.mimeType};base64,${base64}`;
            fileParts.push({
              data: uint8Data,
              filename: upload.filename,
              mediaType: upload.mimeType,
              mimeType: upload.mimeType,
              type: MessagePartTypes.FILE,
              url: dataUrl,
            } satisfies ModelFilePart);

            // Add text fallback for non-vision models
            extractedTexts.push(`[PDF: ${upload.filename}]\n\n[This PDF appears to be scanned/image-based. Text extraction was unsuccessful. If you have vision capabilities, please examine the attached PDF image. Otherwise, please ask the user to provide a text-based version or describe the contents.]`);
          } else {
            errors.push({ error: 'File not found in storage', uploadId: upload.id });
          }
          continue;
        }

        // No pre-extracted text - try synchronous extraction (fixes race condition)
        if (shouldExtractPdfText(upload.mimeType, upload.fileSize)) {
          logger?.info('Triggering synchronous PDF extraction', LogHelpers.operation({
            filename: upload.filename,
            operationName: 'loadAttachmentContentUrl',
            sizeKB: Math.round(upload.fileSize / 1024),
            uploadId: upload.id,
          }));

          const { data } = await getFile(r2Bucket, upload.r2Key);
          if (!data) {
            logger?.error('File not found in storage', LogHelpers.operation({
              operationName: 'loadAttachmentContentUrl',
              r2Key: upload.r2Key,
              uploadId: upload.id,
            }));
            errors.push({ error: 'File not found in storage', uploadId: upload.id });
            continue;
          }

          const extractionResult = await extractPdfText(data);
          if (extractionResult.success && extractionResult.text) {
            const fileTypeLabel = isPdf ? 'PDF' : 'Document';
            extractedTexts.push(`[${fileTypeLabel}: ${upload.filename}]\n\n${extractionResult.text}`);

            logger?.info('Synchronous extraction succeeded', LogHelpers.operation({
              fileSize: extractionResult.text.length,
              operationName: 'loadAttachmentContentUrl',
              uploadId: upload.id,
            }));

            // Update DB for future requests (fire-and-forget)
            db.update(tables.upload)
              .set({
                metadata: {
                  extractedAt: new Date().toISOString(),
                  extractedText: extractionResult.text,
                  totalPages: extractionResult.totalPages,
                },
                updatedAt: new Date(),
              })
              .where(eq(tables.upload.id, upload.id))
              .catch(err => logger?.error('Failed to save extracted text', LogHelpers.operation({
                error: err instanceof Error ? err.message : 'Unknown',
                operationName: 'loadAttachmentContentUrl',
                uploadId: upload.id,
              })));
            continue;
          }

          // Extraction failed - fall back to binary for visual processing
          // Also add a text fallback for models without vision support
          // NOTE: PDF.js may consume/transfer the ArrayBuffer, so we re-fetch for binary
          logger?.warn('Extraction failed, using binary fallback', LogHelpers.operation({
            error: extractionResult.error,
            operationName: 'loadAttachmentContentUrl',
            uploadId: upload.id,
          }));

          // Re-fetch file since PDF.js may have consumed the original ArrayBuffer
          const { data: freshData } = await getFile(r2Bucket, upload.r2Key);
          if (!freshData || freshData.byteLength === 0) {
            logger?.error('File re-fetch failed for binary fallback', LogHelpers.operation({
              operationName: 'loadAttachmentContentUrl',
              uploadId: upload.id,
            }));
            errors.push({ error: 'File re-fetch failed for binary fallback', uploadId: upload.id });
            // Note: stats counter will be incremented at the end based on errors.length
            continue;
          }

          const uint8Data = new Uint8Array(freshData);
          const base64 = uint8ArrayToBase64(uint8Data);
          const dataUrl = `data:${upload.mimeType};base64,${base64}`;
          fileParts.push({
            data: uint8Data,
            filename: upload.filename,
            mediaType: upload.mimeType,
            mimeType: upload.mimeType,
            type: MessagePartTypes.FILE,
            url: dataUrl,
          } satisfies ModelFilePart);

          // Add text fallback explaining the PDF situation for non-vision models
          // This ensures the AI knows about the attachment even if file parts are filtered
          extractedTexts.push(`[PDF: ${upload.filename}]\n\n[This PDF appears to be scanned/image-based. Text extraction was unsuccessful. If you have vision capabilities, please examine the attached PDF image. Otherwise, please ask the user to provide a text-based version or describe the contents.]`);
          continue;
        }

        // Large PDF without extracted text - provide helpful message instead of failing
        if (isPdf && upload.fileSize > MAX_BASE64_FILE_SIZE) {
          logger?.warn('Large PDF without extracted text, providing fallback message', LogHelpers.operation({
            fileSize: upload.fileSize,
            maxSize: MAX_BASE64_FILE_SIZE,
            operationName: 'loadAttachmentContentUrl',
            uploadId: upload.id,
          }));
          extractedTexts.push(`[PDF: ${upload.filename}]\n\n[This PDF (${(upload.fileSize / 1024 / 1024).toFixed(1)}MB) is too large to process directly. Text extraction was not completed. Please try re-uploading the file, or use a smaller PDF (max 10MB for in-memory processing).]`);
          continue;
        }

        // Non-PDF text file without extraction capability - load as binary
      }

      // Check file size before binary loading (applies to images and other files)
      if (upload.fileSize > MAX_BASE64_FILE_SIZE) {
        logger?.warn('File too large for binary loading, skipping', LogHelpers.operation({
          fileSize: upload.fileSize,
          maxSize: MAX_BASE64_FILE_SIZE,
          operationName: 'loadAttachmentContentUrl',
          uploadId: upload.id,
        }));
        skipped++;
        continue;
      }

      // UNIFIED: Load all files as Uint8Array binary data
      // AI SDK handles provider-specific delivery
      const { data } = await getFile(r2Bucket, upload.r2Key);

      if (!data) {
        logger?.error('File not found in storage', LogHelpers.operation({
          filename: upload.filename,
          operationName: 'loadAttachmentContentUrl',
          r2Key: upload.r2Key,
          uploadId: upload.id,
        }));
        errors.push({ error: 'File not found in storage', uploadId: upload.id });
        continue;
      }

      const uint8Data = new Uint8Array(data);
      const base64 = uint8ArrayToBase64(uint8Data);
      const dataUrl = `data:${upload.mimeType};base64,${base64}`;

      fileParts.push({
        data: uint8Data,
        filename: upload.filename,
        mediaType: upload.mimeType,
        mimeType: upload.mimeType,
        type: MessagePartTypes.FILE,
        url: dataUrl,
      } satisfies ModelFilePart);

      logger?.debug('Loaded file as Uint8Array with data URL', LogHelpers.operation({
        filename: upload.filename,
        mimeType: upload.mimeType,
        operationName: 'loadAttachmentContentUrl',
        sizeKB: Math.round(upload.fileSize / 1024),
        uploadId: upload.id,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger?.error('Failed to load attachment', LogHelpers.operation({
        error: errorMessage,
        filename: upload.filename,
        operationName: 'loadAttachmentContentUrl',
        uploadId: upload.id,
      }));
      errors.push({ error: errorMessage, uploadId: upload.id });
    }
  }

  const stats = {
    failed: errors.length,
    loaded: fileParts.length + extractedTexts.length,
    skipped,
    total: attachmentIds.length,
  };

  const extractedTextContent = extractedTexts.length > 0
    ? extractedTexts.join('\n\n---\n\n')
    : null;

  logger?.info('Attachment loading complete', LogHelpers.operation({
    operationName: 'loadAttachmentContentUrl',
    stats,
  }));

  return { errors, extractedTextContent, fileParts, stats };
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
  const { db, logger, messageIds, r2Bucket } = params;

  const filePartsByMessageId = new Map<string, ModelFilePart[]>();
  const errors: { messageId: string; uploadId: string; error: string }[]
    = [];
  let totalUploads = 0;
  let loaded = 0;
  let failed = 0;
  let skipped = 0;

  if (!messageIds || messageIds.length === 0) {
    return {
      errors: [],
      filePartsByMessageId,
      stats: {
        failed: 0,
        loaded: 0,
        messagesWithAttachments: 0,
        skipped: 0,
        totalUploads: 0,
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
      messageCount: messageIds.length,
      operationName: 'loadMessageAttachments',
    }));
    return {
      errors: [],
      filePartsByMessageId,
      stats: {
        failed: 0,
        loaded: 0,
        messagesWithAttachments: 0,
        skipped: 0,
        totalUploads: 0,
      },
    };
  }

  // Group by message ID for efficient processing
  // Drizzle returns joined results with table names as keys: { message_upload: {...}, upload: {...} }
  const uploadsByMessageId = new Map<
    string,
    {
      uploadId: string;
      displayOrder: number;
      upload: (typeof messageUploadsRaw)[0]['upload'];
    }[]
  >();

  for (const row of messageUploadsRaw) {
    const messageUpload = row.message_upload;
    const existing = uploadsByMessageId.get(messageUpload.messageId) || [];
    existing.push({
      displayOrder: messageUpload.displayOrder,
      upload: row.upload,
      uploadId: messageUpload.uploadId,
    });
    uploadsByMessageId.set(messageUpload.messageId, existing);
  }

  totalUploads = messageUploadsRaw.length;

  logger?.info('Loading attachment content for messages', LogHelpers.operation({
    messageCount: messageIds.length,
    messagesWithAttachments: uploadsByMessageId.size,
    operationName: 'loadMessageAttachments',
    totalUploads,
  }));

  // Process each message's attachments
  for (const [messageId, uploads] of uploadsByMessageId) {
    const messageParts: ModelFilePart[] = [];

    // Sort by display order
    uploads.sort((a, b) => a.displayOrder - b.displayOrder);

    for (const { upload, uploadId } of uploads) {
      try {
        // Skip files that AI models can't process visually
        if (!AI_PROCESSABLE_MIME_SET.has(upload.mimeType)) {
          logger?.debug('Skipping unsupported file type for AI processing in message', LogHelpers.operation({
            messageId,
            mimeType: upload.mimeType,
            operationName: 'loadMessageAttachments',
            uploadId,
          }));
          skipped++;
          continue;
        }

        // Fetch file content from storage
        const { data } = await getFile(r2Bucket, upload.r2Key);

        if (!data) {
          logger?.error('File not found in storage for message', LogHelpers.operation({
            filename: upload.filename,
            messageId,
            operationName: 'loadMessageAttachments',
            r2Key: upload.r2Key,
            uploadId,
          }));
          errors.push({
            error: 'File not found in storage',
            messageId,
            uploadId,
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
          // LanguageModelV2 format (what OpenRouter provider expects)
          data: uint8Data,
          filename: upload.filename,
          mediaType: upload.mimeType,
          mimeType: upload.mimeType,
          type: MessagePartTypes.FILE,
          // UIMessage format (for streaming-orchestration message building)
          url: dataUrl,
        });

        loaded++;

        logger?.debug('Loaded attachment content for message', LogHelpers.operation({
          filename: upload.filename,
          messageId,
          mimeType: upload.mimeType,
          operationName: 'loadMessageAttachments',
          sizeKB: Math.round(upload.fileSize / 1024),
          uploadId,
        }));
      } catch (error) {
        const errorMessage
          = error instanceof Error ? error.message : 'Unknown error';
        logger?.error('Failed to load attachment for message', LogHelpers.operation({
          error: errorMessage,
          filename: upload.filename,
          messageId,
          operationName: 'loadMessageAttachments',
          uploadId,
        }));
        errors.push({
          error: errorMessage,
          messageId,
          uploadId,
        });
        failed++;
      }
    }

    if (messageParts.length > 0) {
      filePartsByMessageId.set(messageId, messageParts);
    }
  }

  const stats = {
    failed,
    loaded,
    messagesWithAttachments: uploadsByMessageId.size,
    skipped,
    totalUploads,
  };

  logger?.info('Message attachment loading complete', LogHelpers.operation({
    operationName: 'loadMessageAttachments',
    stats,
  }));

  return { errors, filePartsByMessageId, stats };
}

// ============================================================================
// URL-Based Message Attachment Loading (Memory-Efficient)
// ============================================================================

// LoadMessageAttachmentsUrlParams is now defined via Zod schema in types/uploads.ts
// Re-export for backwards compatibility
export type { LoadMessageAttachmentsUrlParams } from '@/types/uploads';

export type LoadMessageAttachmentsUrlResult = {
  filePartsByMessageId: Map<string, UrlFilePart[]>;
  /** Extracted text from PDFs/documents by message ID (not sent as file parts to avoid AI provider timeout) */
  extractedTextByMessageId: Map<string, string>;
  errors: { messageId: string; uploadId: string; error: string }[];
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
  const { db, logger, messageIds, r2Bucket } = params;

  const filePartsByMessageId = new Map<string, UrlFilePart[]>();
  const extractedTextByMessageId = new Map<string, string>();
  const errors: { messageId: string; uploadId: string; error: string }[] = [];
  let totalUploads = 0;
  let loaded = 0;
  let failed = 0;
  let skipped = 0;

  if (!messageIds || messageIds.length === 0) {
    return {
      errors: [],
      extractedTextByMessageId,
      filePartsByMessageId,
      stats: {
        failed: 0,
        loaded: 0,
        messagesWithAttachments: 0,
        skipped: 0,
        totalUploads: 0,
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
      messageCount: messageIds.length,
      operationName: 'loadMessageAttachmentsUrl',
    }));
    return {
      errors: [],
      extractedTextByMessageId,
      filePartsByMessageId,
      stats: {
        failed: 0,
        loaded: 0,
        messagesWithAttachments: 0,
        skipped: 0,
        totalUploads: 0,
      },
    };
  }

  // Group by message ID
  const uploadsByMessageId = new Map<
    string,
    {
      uploadId: string;
      displayOrder: number;
      upload: (typeof messageUploadsRaw)[0]['upload'];
    }[]
  >();

  for (const row of messageUploadsRaw) {
    const messageUpload = row.message_upload;
    const existing = uploadsByMessageId.get(messageUpload.messageId) || [];
    existing.push({
      displayOrder: messageUpload.displayOrder,
      upload: row.upload,
      uploadId: messageUpload.uploadId,
    });
    uploadsByMessageId.set(messageUpload.messageId, existing);
  }

  totalUploads = messageUploadsRaw.length;

  logger?.info('Loading message attachments (unified Uint8Array mode)', LogHelpers.operation({
    messageCount: messageIds.length,
    messagesWithAttachments: uploadsByMessageId.size,
    operationName: 'loadMessageAttachmentsUrl',
    totalUploads,
  }));

  // Process each message's attachments
  for (const [messageId, uploads] of uploadsByMessageId) {
    const messageParts: UrlFilePart[] = [];

    uploads.sort((a, b) => a.displayOrder - b.displayOrder);

    for (const { upload, uploadId } of uploads) {
      try {
        // Skip unsupported file types
        if (!AI_PROCESSABLE_MIME_SET.has(upload.mimeType)) {
          logger?.debug('Skipping unsupported file type', LogHelpers.operation({
            messageId,
            mimeType: upload.mimeType,
            operationName: 'loadMessageAttachmentsUrl',
            uploadId,
          }));
          skipped++;
          continue;
        }

        const isPdf = upload.mimeType === PDF_MIME_TYPE;
        const isTextExtractable = TEXT_EXTRACTABLE_MIME_SET.has(upload.mimeType);

        // PDFs and text files: check for pre-extracted text FIRST
        // This allows large PDFs to work if they have extracted text (no binary loading needed)
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
              filename: upload.filename,
              fileSize: extractedText.length,
              messageId,
              operationName: 'loadMessageAttachmentsUrl',
              uploadId,
            }));
            continue;
          }

          // No pre-extracted text - try synchronous extraction
          if (shouldExtractPdfText(upload.mimeType, upload.fileSize)) {
            logger?.info('Triggering synchronous PDF extraction', LogHelpers.operation({
              filename: upload.filename,
              messageId,
              operationName: 'loadMessageAttachmentsUrl',
              sizeKB: Math.round(upload.fileSize / 1024),
              uploadId,
            }));

            const { data } = await getFile(r2Bucket, upload.r2Key);
            if (!data) {
              logger?.error('File not found in storage', LogHelpers.operation({
                messageId,
                operationName: 'loadMessageAttachmentsUrl',
                r2Key: upload.r2Key,
                uploadId,
              }));
              errors.push({ error: 'File not found', messageId, uploadId });
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
                fileSize: extractionResult.text.length,
                messageId,
                operationName: 'loadMessageAttachmentsUrl',
                uploadId,
              }));

              // Update DB for future requests (fire-and-forget)
              db.update(tables.upload)
                .set({
                  metadata: {
                    extractedAt: new Date().toISOString(),
                    extractedText: extractionResult.text,
                    totalPages: extractionResult.totalPages,
                  },
                  updatedAt: new Date(),
                })
                .where(eq(tables.upload.id, upload.id))
                .catch(err => logger?.error('Failed to save extracted text', LogHelpers.operation({
                  error: err instanceof Error ? err.message : 'Unknown',
                  operationName: 'loadMessageAttachmentsUrl',
                  uploadId: upload.id,
                })));
              continue;
            }

            // Extraction failed - use binary as fallback
            // NOTE: PDF.js may consume/transfer the ArrayBuffer, so we re-fetch for binary
            logger?.warn('Extraction failed, using binary', LogHelpers.operation({
              error: extractionResult.error,
              messageId,
              operationName: 'loadMessageAttachmentsUrl',
              uploadId,
            }));

            // Re-fetch file since PDF.js may have consumed the original ArrayBuffer
            const { data: freshData } = await getFile(r2Bucket, upload.r2Key);
            if (!freshData || freshData.byteLength === 0) {
              logger?.error('File re-fetch failed for binary fallback', LogHelpers.operation({
                messageId,
                operationName: 'loadMessageAttachmentsUrl',
                uploadId,
              }));
              errors.push({ error: 'File re-fetch failed for binary fallback', messageId, uploadId });
              failed++;
              continue;
            }

            const uint8Data = new Uint8Array(freshData);
            // Include url and mediaType for UIMessage validation compatibility
            // AI SDK uses 'data' when present, so url won't be fetched
            const base64 = arrayBufferToBase64(freshData);
            const dataUrl = `data:${upload.mimeType};base64,${base64}`;
            messageParts.push({
              data: uint8Data,
              filename: upload.filename,
              mediaType: upload.mimeType,
              mimeType: upload.mimeType,
              type: MessagePartTypes.FILE,
              url: dataUrl,
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

          // Large PDF without extracted text - provide helpful message instead of failing
          if (isPdf && upload.fileSize > MAX_BASE64_FILE_SIZE) {
            logger?.warn('Large PDF without extracted text in message, providing fallback', LogHelpers.operation({
              fileSize: upload.fileSize,
              maxSize: MAX_BASE64_FILE_SIZE,
              messageId,
              operationName: 'loadMessageAttachmentsUrl',
              uploadId,
            }));
            const fallbackText = `[PDF: ${upload.filename}]\n\n[This PDF (${(upload.fileSize / 1024 / 1024).toFixed(1)}MB) is too large to process directly. Text extraction was not completed. Please try re-uploading the file, or use a smaller PDF.]`;
            const existing = extractedTextByMessageId.get(messageId) || '';
            extractedTextByMessageId.set(
              messageId,
              existing ? `${existing}\n\n---\n\n${fallbackText}` : fallbackText,
            );
            loaded++; // Count as loaded since we're providing useful info
            continue;
          }
        }

        // Check file size before binary loading (applies to images and other files)
        if (upload.fileSize > MAX_BASE64_FILE_SIZE) {
          logger?.warn('File too large for binary loading in message, skipping', LogHelpers.operation({
            fileSize: upload.fileSize,
            maxSize: MAX_BASE64_FILE_SIZE,
            messageId,
            operationName: 'loadMessageAttachmentsUrl',
            uploadId,
          }));
          skipped++;
          continue;
        }

        // UNIFIED: Load all files as Uint8Array binary
        const { data } = await getFile(r2Bucket, upload.r2Key);

        if (!data) {
          logger?.error('File not found in storage', LogHelpers.operation({
            filename: upload.filename,
            messageId,
            operationName: 'loadMessageAttachmentsUrl',
            r2Key: upload.r2Key,
            uploadId,
          }));
          errors.push({ error: 'File not found', messageId, uploadId });
          failed++;
          continue;
        }

        const uint8Data = new Uint8Array(data);
        // Include url and mediaType for UIMessage validation compatibility
        const base64 = arrayBufferToBase64(data);
        const dataUrl = `data:${upload.mimeType};base64,${base64}`;

        messageParts.push({
          data: uint8Data,
          filename: upload.filename,
          mediaType: upload.mimeType,
          mimeType: upload.mimeType,
          type: MessagePartTypes.FILE,
          url: dataUrl,
        } satisfies ModelFilePart);

        loaded++;

        logger?.debug('Loaded file as Uint8Array with data URL', LogHelpers.operation({
          filename: upload.filename,
          messageId,
          mimeType: upload.mimeType,
          operationName: 'loadMessageAttachmentsUrl',
          sizeKB: Math.round(upload.fileSize / 1024),
          uploadId,
        }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger?.error('Failed to process attachment', LogHelpers.operation({
          error: errorMessage,
          filename: upload.filename,
          messageId,
          operationName: 'loadMessageAttachmentsUrl',
          uploadId,
        }));
        errors.push({ error: errorMessage, messageId, uploadId });
        failed++;
      }
    }

    if (messageParts.length > 0) {
      filePartsByMessageId.set(messageId, messageParts);
    }
  }

  const stats = {
    failed,
    loaded,
    messagesWithAttachments: uploadsByMessageId.size,
    skipped,
    totalUploads,
  };

  logger?.info('Message attachment loading complete', LogHelpers.operation({
    filePartsCount: filePartsByMessageId.size,
    operationName: 'loadMessageAttachmentsUrl',
    resultCount: extractedTextByMessageId.size,
    stats,
  }));

  return { errors, extractedTextByMessageId, filePartsByMessageId, stats };
}

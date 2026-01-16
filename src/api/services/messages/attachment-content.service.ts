/**
 * Attachment Content Service
 *
 * Following backend-patterns.md: Service layer for business logic
 *
 * Converts uploaded files to AI-model-ready content (base64 data URLs).
 * All conversion happens on backend - frontend only sends upload IDs.
 */

import { eq, inArray } from 'drizzle-orm';

import { AI_PROCESSABLE_MIME_SET, IMAGE_MIME_TYPES, MessagePartTypes, TEXT_EXTRACTABLE_MIME_TYPES } from '@/api/core/enums';
import { generateAiPublicUrl, getFile } from '@/api/services/uploads';
import { LogHelpers } from '@/api/types/logger';
import type {
  LoadAttachmentContentParams,
  LoadAttachmentContentResult,
  LoadMessageAttachmentsParams,
  LoadMessageAttachmentsResult,
  ModelFilePart,
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

export type UrlFilePart = ModelFilePartUrl | ModelImagePartUrl;

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
  errors: Array<{ uploadId: string; error: string }>;
  stats: {
    total: number;
    loaded: number;
    failed: number;
    skipped: number;
  };
};

const IMAGE_MIME_SET = new Set<string>(IMAGE_MIME_TYPES);
const TEXT_EXTRACTABLE_MIME_SET = new Set<string>(TEXT_EXTRACTABLE_MIME_TYPES);
const PDF_MIME_TYPE = 'application/pdf';

/**
 * Load attachment content with environment-aware delivery.
 *
 * - Production/Preview: Uses signed public URLs (AI providers fetch directly)
 * - Local development: Falls back to base64 (AI providers can't access localhost)
 *
 * URL-based delivery is more efficient:
 * - Avoids memory-intensive base64 encoding in Workers
 * - Allows AI providers to fetch files in parallel
 * - Supports much larger files (up to 100MB for PDFs, 20MB for images)
 */
export async function loadAttachmentContentUrl(
  params: LoadAttachmentContentUrlParams,
): Promise<LoadAttachmentContentUrlResult> {
  const { attachmentIds, r2Bucket, db, logger, baseUrl, userId, secret, threadId } = params;

  const fileParts: UrlFilePart[] = [];
  const errors: Array<{ uploadId: string; error: string }> = [];
  let skipped = 0;

  if (!attachmentIds || attachmentIds.length === 0) {
    return {
      fileParts: [],
      errors: [],
      stats: { total: 0, loaded: 0, failed: 0, skipped: 0 },
    };
  }

  // Check if we're in local development (AI providers can't access localhost)
  const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');

  // Load attachment metadata from database
  const uploads = await db
    .select()
    .from(tables.upload)
    .where(inArray(tables.upload.id, attachmentIds));

  if (uploads.length === 0 && attachmentIds.length > 0) {
    logger?.error('No uploads found in DB for given IDs (URL mode) - possible race condition', LogHelpers.operation({
      operationName: 'loadAttachmentContentUrl',
      attachmentCount: attachmentIds.length,
      foundUploads: 0,
    }));
  }

  const deliveryMode = isLocalhost ? 'base64' : 'url';
  logger?.info(`Loading attachment content (${deliveryMode} mode) for AI model`, LogHelpers.operation({
    operationName: 'loadAttachmentContentUrl',
    attachmentCount: attachmentIds.length,
    foundUploads: uploads.length,
  }));

  for (const upload of uploads) {
    try {
      // Skip files that AI models can't process
      if (!AI_PROCESSABLE_MIME_SET.has(upload.mimeType)) {
        logger?.debug('Skipping unsupported file type for AI processing', LogHelpers.operation({
          operationName: 'loadAttachmentContentUrl',
          uploadId: upload.id,
          mimeType: upload.mimeType,
        }));
        skipped++;
        continue;
      }

      const isImage = IMAGE_MIME_SET.has(upload.mimeType);

      if (isLocalhost) {
        // LOCAL DEV: Use base64 encoding (AI providers can't access localhost URLs)
        // Use same format as original loadAttachmentContent for compatibility
        const { data } = await getFile(r2Bucket, upload.r2Key);

        if (!data) {
          logger?.error('File not found in storage (URL mode)', LogHelpers.operation({
            operationName: 'loadAttachmentContentUrl',
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

        // Use type:'file' with both data (Uint8Array) and url (data URL) for all files
        // This matches the format expected by the AI SDK and streaming orchestration
        fileParts.push({
          type: MessagePartTypes.FILE,
          data: uint8Data,
          mimeType: upload.mimeType,
          filename: upload.filename,
          url: dataUrl,
          mediaType: upload.mimeType,
        // TYPE BRIDGE: Local dev creates hybrid with both data (Uint8Array) and url (data URL)
        // to satisfy both AI SDK (needs data) and UI (needs url). Production uses URL-only.
        } as unknown as UrlFilePart);

        logger?.debug('Loaded attachment (base64 for local dev)', LogHelpers.operation({
          operationName: 'loadAttachmentContentUrl',
          uploadId: upload.id,
          filename: upload.filename,
          mimeType: upload.mimeType,
          sizeKB: Math.round(upload.fileSize / 1024),
        }));
      } else {
        // PRODUCTION/PREVIEW: Handle based on file type
        if (isImage) {
          // Image: use type:'image' with URL (images are small, download quickly)
          const urlResult = await generateAiPublicUrl({
            uploadId: upload.id,
            userId,
            baseUrl,
            secret,
            threadId,
          });

          if (!urlResult.success) {
            logger?.error('URL generation failed for image', LogHelpers.operation({
              operationName: 'loadAttachmentContentUrl',
              uploadId: upload.id,
              filename: upload.filename,
              error: urlResult.error,
            }));
            errors.push({ uploadId: upload.id, error: urlResult.error });
            continue;
          }

          fileParts.push({
            type: 'image',
            image: urlResult.url,
            mimeType: upload.mimeType,
          } as ModelImagePartUrl);

          logger?.debug('Generated URL for image attachment', LogHelpers.operation({
            operationName: 'loadAttachmentContentUrl',
            uploadId: upload.id,
            filename: upload.filename,
            mimeType: upload.mimeType,
            sizeKB: Math.round(upload.fileSize / 1024),
          }));
        } else if (upload.mimeType === PDF_MIME_TYPE || TEXT_EXTRACTABLE_MIME_SET.has(upload.mimeType)) {
          // PDF/Text files: Use extracted text instead of URL
          // OpenAI times out downloading files from our signed URL endpoint (2-5s timeout)
          // Solution: Use the pre-extracted text from upload metadata
          const extractedText = getExtractedText(upload.metadata);

          if (extractedText && extractedText.length > 0) {
            const fileTypeLabel = upload.mimeType === PDF_MIME_TYPE ? 'PDF' : 'Document';
            fileParts.push({
              type: 'text',
              text: `[${fileTypeLabel}: ${upload.filename}]\n\n${extractedText}`,
            } as unknown as UrlFilePart);

            logger?.debug('Using extracted text for document', LogHelpers.operation({
              operationName: 'loadAttachmentContentUrl',
              uploadId: upload.id,
              filename: upload.filename,
              mimeType: upload.mimeType,
              fileSize: extractedText.length,
            }));
          } else {
            // No extracted text available - skip with warning
            logger?.warn('No extracted text available for document, skipping', LogHelpers.operation({
              operationName: 'loadAttachmentContentUrl',
              uploadId: upload.id,
              filename: upload.filename,
              mimeType: upload.mimeType,
            }));
            skipped++;
          }
        } else {
          // Other file types: use URL
          const urlResult = await generateAiPublicUrl({
            uploadId: upload.id,
            userId,
            baseUrl,
            secret,
            threadId,
          });

          if (!urlResult.success) {
            logger?.error('URL generation failed', LogHelpers.operation({
              operationName: 'loadAttachmentContentUrl',
              uploadId: upload.id,
              filename: upload.filename,
              error: urlResult.error,
            }));
            errors.push({ uploadId: upload.id, error: urlResult.error });
            continue;
          }

          fileParts.push({
            type: MessagePartTypes.FILE,
            url: urlResult.url,
            mimeType: upload.mimeType,
            filename: upload.filename,
            mediaType: upload.mimeType,
          } as ModelFilePartUrl);

          logger?.debug('Generated URL for file attachment', LogHelpers.operation({
            operationName: 'loadAttachmentContentUrl',
            uploadId: upload.id,
            filename: upload.filename,
            mimeType: upload.mimeType,
            sizeKB: Math.round(upload.fileSize / 1024),
          }));
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger?.error('Failed to load attachment (URL mode)', LogHelpers.operation({
        operationName: 'loadAttachmentContentUrl',
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

  logger?.info('Attachment loading complete', LogHelpers.operation({
    operationName: 'loadAttachmentContentUrl',
    stats,
  }));

  return { fileParts, errors, stats };
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
 * Load message attachments with environment-aware delivery.
 *
 * - Production/Preview: Uses signed public URLs (no memory-intensive base64)
 * - Local development: Falls back to base64 (AI providers can't access localhost)
 *
 * This is the memory-efficient version that avoids loading file data into memory.
 */
export async function loadMessageAttachmentsUrl(
  params: LoadMessageAttachmentsUrlParams,
): Promise<LoadMessageAttachmentsUrlResult> {
  const { messageIds, r2Bucket, db, logger, baseUrl, userId, secret, threadId } = params;

  const filePartsByMessageId = new Map<string, UrlFilePart[]>();
  const errors: Array<{ messageId: string; uploadId: string; error: string }> = [];
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

  // Check if we're in local development (AI providers can't access localhost)
  const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');

  // For localhost, fall back to base64 version
  if (isLocalhost) {
    logger?.info('Using base64 fallback for localhost (AI providers cannot access local URLs)', LogHelpers.operation({
      operationName: 'loadMessageAttachmentsUrl',
      messageCount: messageIds.length,
    }));

    const base64Result = await loadMessageAttachments({ messageIds, r2Bucket, db, logger });
    // Convert Map<string, ModelFilePart[]> to Map<string, UrlFilePart[]> for type compatibility
    const convertedMap = new Map<string, UrlFilePart[]>();
    for (const [msgId, parts] of base64Result.filePartsByMessageId) {
      convertedMap.set(msgId, parts as unknown as UrlFilePart[]);
    }
    return {
      filePartsByMessageId: convertedMap,
      errors: base64Result.errors,
      stats: base64Result.stats,
    };
  }

  const messageUploadsRaw = await db
    .select()
    .from(tables.messageUpload)
    .innerJoin(tables.upload, eq(tables.messageUpload.uploadId, tables.upload.id))
    .where(inArray(tables.messageUpload.messageId, messageIds));

  if (messageUploadsRaw.length === 0) {
    logger?.debug('No attachments found for messages (URL mode)', LogHelpers.operation({
      operationName: 'loadMessageAttachmentsUrl',
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

  logger?.info('Loading message attachments via signed URLs', LogHelpers.operation({
    operationName: 'loadMessageAttachmentsUrl',
    messageCount: messageIds.length,
    messagesWithAttachments: uploadsByMessageId.size,
    totalUploads,
  }));

  // Process each message's attachments
  for (const [messageId, uploads] of uploadsByMessageId) {
    const messageParts: UrlFilePart[] = [];

    // Sort by display order
    uploads.sort((a, b) => a.displayOrder - b.displayOrder);

    for (const { uploadId, upload } of uploads) {
      try {
        // Skip files that AI models can't process
        if (!AI_PROCESSABLE_MIME_SET.has(upload.mimeType)) {
          logger?.debug('Skipping unsupported file type (URL mode)', LogHelpers.operation({
            operationName: 'loadMessageAttachmentsUrl',
            messageId,
            uploadId,
            mimeType: upload.mimeType,
          }));
          skipped++;
          continue;
        }

        const isImage = IMAGE_MIME_SET.has(upload.mimeType);

        if (isImage) {
          // Image: use type:'image' with URL (images are small, download quickly)
          const urlResult = await generateAiPublicUrl({
            uploadId: upload.id,
            userId,
            baseUrl,
            secret,
            threadId,
          });

          if (!urlResult.success) {
            logger?.error('URL generation failed for image', LogHelpers.operation({
              operationName: 'loadMessageAttachmentsUrl',
              messageId,
              uploadId,
              filename: upload.filename,
              error: urlResult.error,
            }));
            errors.push({ messageId, uploadId, error: urlResult.error });
            failed++;
            continue;
          }

          messageParts.push({
            type: 'image',
            image: urlResult.url,
            mimeType: upload.mimeType,
          } as ModelImagePartUrl);

          loaded++;

          logger?.debug('Generated URL for image attachment', LogHelpers.operation({
            operationName: 'loadMessageAttachmentsUrl',
            messageId,
            uploadId,
            filename: upload.filename,
            mimeType: upload.mimeType,
            sizeKB: Math.round(upload.fileSize / 1024),
          }));
        } else if (upload.mimeType === PDF_MIME_TYPE || TEXT_EXTRACTABLE_MIME_SET.has(upload.mimeType)) {
          // PDF/Text files: Use extracted text instead of URL
          // OpenAI times out downloading files from our signed URL endpoint (2-5s timeout)
          const extractedText = getExtractedText(upload.metadata);

          if (extractedText && extractedText.length > 0) {
            const fileTypeLabel = upload.mimeType === PDF_MIME_TYPE ? 'PDF' : 'Document';
            messageParts.push({
              type: 'text',
              text: `[${fileTypeLabel}: ${upload.filename}]\n\n${extractedText}`,
            } as unknown as UrlFilePart);

            loaded++;

            logger?.debug('Using extracted text for document', LogHelpers.operation({
              operationName: 'loadMessageAttachmentsUrl',
              messageId,
              uploadId,
              filename: upload.filename,
              mimeType: upload.mimeType,
              fileSize: extractedText.length,
            }));
          } else {
            // No extracted text available - skip with warning
            logger?.warn('No extracted text available for document, skipping', LogHelpers.operation({
              operationName: 'loadMessageAttachmentsUrl',
              messageId,
              uploadId,
              filename: upload.filename,
              mimeType: upload.mimeType,
            }));
            skipped++;
          }
        } else {
          // Other file types: use URL
          const urlResult = await generateAiPublicUrl({
            uploadId: upload.id,
            userId,
            baseUrl,
            secret,
            threadId,
          });

          if (!urlResult.success) {
            logger?.error('URL generation failed for file', LogHelpers.operation({
              operationName: 'loadMessageAttachmentsUrl',
              messageId,
              uploadId,
              filename: upload.filename,
              error: urlResult.error,
            }));
            errors.push({ messageId, uploadId, error: urlResult.error });
            failed++;
            continue;
          }

          messageParts.push({
            type: MessagePartTypes.FILE,
            url: urlResult.url,
            mimeType: upload.mimeType,
            filename: upload.filename,
            mediaType: upload.mimeType,
          } as ModelFilePartUrl);

          loaded++;

          logger?.debug('Generated URL for file attachment', LogHelpers.operation({
            operationName: 'loadMessageAttachmentsUrl',
            messageId,
            uploadId,
            filename: upload.filename,
            mimeType: upload.mimeType,
            sizeKB: Math.round(upload.fileSize / 1024),
          }));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger?.error('Failed to process message attachment (URL mode)', LogHelpers.operation({
          operationName: 'loadMessageAttachmentsUrl',
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

  logger?.info('Message attachment URL generation complete', LogHelpers.operation({
    operationName: 'loadMessageAttachmentsUrl',
    stats,
  }));

  return { filePartsByMessageId, errors, stats };
}

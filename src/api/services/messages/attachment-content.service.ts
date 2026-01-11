/**
 * Attachment Content Service
 *
 * Following backend-patterns.md: Service layer for business logic
 *
 * Converts uploaded files to AI-model-ready content (base64 data URLs).
 * All conversion happens on backend - frontend only sends upload IDs.
 */

import { eq, inArray } from 'drizzle-orm';

import { IMAGE_MIME_TYPES, MessagePartTypes } from '@/api/core/enums';
import { getFile } from '@/api/services/uploads';
import { LogHelpers } from '@/api/types/logger';
import type {
  LoadAttachmentContentParams,
  LoadAttachmentContentResult,
  LoadMessageAttachmentsParams,
  LoadMessageAttachmentsResult,
  ModelFilePart,
} from '@/api/types/uploads';
import { MAX_BASE64_FILE_SIZE } from '@/api/types/uploads';
import * as tables from '@/db';

// ============================================================================
// Constants
// ============================================================================

const VISUAL_MIME_TYPES = new Set([...IMAGE_MIME_TYPES, 'application/pdf']);

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
    console.error(
      '[Attachment] WARNING: No uploads found in DB for given IDs!',
      {
        attachmentIds,
        attachmentIdsCount: attachmentIds.length,
        foundUploadsCount: uploads.length,
        hint: 'This may indicate a race condition or incorrect upload IDs extracted from URLs',
      },
    );
  } else if (uploads.length < attachmentIds.length) {
    console.error(
      '[Attachment] WARNING: Partial uploads found - some IDs not in DB',
      {
        attachmentIds,
        foundIds: uploads.map(u => u.id),
        missingCount: attachmentIds.length - uploads.length,
      },
    );
  }

  logger?.info('Loading attachment content for AI model', LogHelpers.operation({
    operationName: 'loadAttachmentContent',
    attachmentCount: attachmentIds.length,
    foundUploads: uploads.length,
  }));

  for (const upload of uploads) {
    try {
      // Skip files that AI models can't process visually
      if (!VISUAL_MIME_TYPES.has(upload.mimeType)) {
        logger?.debug('Skipping non-visual file', LogHelpers.operation({
          operationName: 'loadAttachmentContent',
          uploadId: upload.id,
          mimeType: upload.mimeType,
        }));
        skipped++;
        continue;
      }

      // Skip files that are too large for base64 conversion
      if (upload.fileSize > MAX_BASE64_FILE_SIZE) {
        const errorMsg = `File too large (${(upload.fileSize / 1024 / 1024).toFixed(1)}MB > ${MAX_BASE64_FILE_SIZE / 1024 / 1024}MB limit)`;
        console.error('[Attachment] File too large for base64 conversion:', {
          uploadId: upload.id,
          filename: upload.filename,
          fileSize: upload.fileSize,
          maxSize: MAX_BASE64_FILE_SIZE,
          error: errorMsg,
        });
        logger?.warn('File too large for base64 conversion', LogHelpers.operation({
          operationName: 'loadAttachmentContent',
          uploadId: upload.id,
          fileSize: upload.fileSize,
          maxSize: MAX_BASE64_FILE_SIZE,
        }));
        errors.push({
          uploadId: upload.id,
          error: errorMsg,
        });
        continue;
      }

      // Fetch file content from storage
      const { data } = await getFile(r2Bucket, upload.r2Key);

      if (!data) {
        console.error('[Attachment] File not found in storage:', {
          uploadId: upload.id,
          filename: upload.filename,
          r2Key: upload.r2Key,
        });
        logger?.warn('File not found in storage', LogHelpers.operation({
          operationName: 'loadAttachmentContent',
          uploadId: upload.id,
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
      console.error('[Attachment] Failed to load attachment content:', {
        uploadId: upload.id,
        filename: upload.filename,
        mimeType: upload.mimeType,
        error: errorMessage,
      });
      logger?.error('Failed to load attachment content', LogHelpers.operation({
        operationName: 'loadAttachmentContent',
        uploadId: upload.id,
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

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  return btoa(binary);
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
        if (!VISUAL_MIME_TYPES.has(upload.mimeType)) {
          logger?.debug('Skipping non-visual file in message', LogHelpers.operation({
            operationName: 'loadMessageAttachments',
            messageId,
            uploadId,
            mimeType: upload.mimeType,
          }));
          skipped++;
          continue;
        }

        // Skip files that are too large for base64 conversion
        if (upload.fileSize > MAX_BASE64_FILE_SIZE) {
          const errorMsg = `File too large (${(upload.fileSize / 1024 / 1024).toFixed(1)}MB > ${MAX_BASE64_FILE_SIZE / 1024 / 1024}MB limit)`;
          console.error('[Attachment] File too large for message attachment:', {
            messageId,
            uploadId,
            filename: upload.filename,
            fileSize: upload.fileSize,
            maxSize: MAX_BASE64_FILE_SIZE,
            error: errorMsg,
          });
          logger?.warn('File too large for base64 conversion', LogHelpers.operation({
            operationName: 'loadMessageAttachments',
            messageId,
            uploadId,
            fileSize: upload.fileSize,
            maxSize: MAX_BASE64_FILE_SIZE,
          }));
          errors.push({
            messageId,
            uploadId,
            error: errorMsg,
          });
          failed++;
          continue;
        }

        // Fetch file content from storage
        const { data } = await getFile(r2Bucket, upload.r2Key);

        if (!data) {
          console.error('[Attachment] File not found in storage for message:', {
            messageId,
            uploadId,
            filename: upload.filename,
            r2Key: upload.r2Key,
          });
          logger?.warn('File not found in storage', LogHelpers.operation({
            operationName: 'loadMessageAttachments',
            messageId,
            uploadId,
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
        console.error('[Attachment] Failed to load attachment for message:', {
          messageId,
          uploadId,
          filename: upload.filename,
          error: errorMessage,
        });
        logger?.error('Failed to load attachment content for message', LogHelpers.operation({
          operationName: 'loadMessageAttachments',
          messageId,
          uploadId,
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

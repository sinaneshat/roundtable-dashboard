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
 *
 * @see /src/api/types/uploads.ts for type definitions
 */

import { eq, inArray } from 'drizzle-orm';

import { IMAGE_MIME_TYPES, MessagePartTypes } from '@/api/core/enums';
import { getFile } from '@/api/services/storage.service';
import type {
  LoadAttachmentContentParams,
  LoadAttachmentContentResult,
  LoadMessageAttachmentsParams,
  LoadMessageAttachmentsResult,
  ModelFilePart,
} from '@/api/types/uploads';
import { MAX_BASE64_FILE_SIZE } from '@/api/types/uploads';
import * as tables from '@/db/schema';

// ============================================================================
// Constants
// ============================================================================

/**
 * MIME types that AI models can process visually
 * Only these types will be converted to base64 data URLs
 */
const VISUAL_MIME_TYPES = new Set([...IMAGE_MIME_TYPES, 'application/pdf']);

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
        const errorMsg = `File too large (${(upload.fileSize / 1024 / 1024).toFixed(1)}MB > ${MAX_BASE64_FILE_SIZE / 1024 / 1024}MB limit)`;
        console.error('[Attachment] File too large for base64 conversion:', {
          uploadId: upload.id,
          filename: upload.filename,
          fileSize: upload.fileSize,
          maxSize: MAX_BASE64_FILE_SIZE,
          error: errorMsg,
        });
        logger?.warn('File too large for base64 conversion', {
          logType: 'operation',
          operationName: 'loadAttachmentContent',
          uploadId: upload.id,
          fileSize: upload.fileSize,
          maxSize: MAX_BASE64_FILE_SIZE,
        });
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

      // Convert ArrayBuffer to Uint8Array for OpenRouter provider compatibility
      // The OpenRouter provider's getFileUrl() expects part.data as Uint8Array
      const uint8Data = new Uint8Array(data);

      // Also create data URL for UIMessage compatibility
      const base64 = arrayBufferToBase64(data);
      const dataUrl = `data:${upload.mimeType};base64,${base64}`;

      fileParts.push({
        type: MessagePartTypes.FILE,
        // LanguageModelV2 format (what OpenRouter provider expects)
        data: uint8Data,
        mimeType: upload.mimeType,
        filename: upload.filename,
        // UIMessage format (for streaming-orchestration message building)
        url: dataUrl,
        mediaType: upload.mimeType,
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
      const errorMessage
        = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Attachment] Failed to load attachment content:', {
        uploadId: upload.id,
        filename: upload.filename,
        mimeType: upload.mimeType,
        error: errorMessage,
      });
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
 * Convert Uint8Array to base64 string
 *
 * ✅ SINGLE SOURCE OF TRUTH: Core implementation for base64 conversion
 * This is a backend-only operation. The frontend never sees base64 data.
 *
 * @param bytes - Uint8Array to convert
 * @returns Base64 encoded string
 */
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

/**
 * Convert ArrayBuffer to base64 string
 *
 * This is a backend-only operation. The frontend never sees base64 data.
 * ✅ DELEGATES TO: uint8ArrayToBase64 for implementation
 *
 * @param buffer - ArrayBuffer to convert
 * @returns Base64 encoded string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return uint8ArrayToBase64(new Uint8Array(buffer));
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

// ============================================================================
// Multi-Participant Attachment Support
// ============================================================================

/**
 * Load attachment content for multiple messages by looking up the messageUpload junction table
 *
 * This function is critical for multi-participant streaming:
 * - Participant 0 receives attachmentIds and uses loadAttachmentContent()
 * - Participant 1+ loads messages from DB which have HTTP URLs (not base64)
 * - This function converts those HTTP URLs to base64 for AI providers that require it
 *
 * IMPORTANT: Many AI providers (especially OpenAI via OpenRouter) require base64 data URLs,
 * not HTTP URLs. This function ensures all participants get file content in the correct format.
 *
 * @param params - Parameters for loading message attachments
 * @returns Map of message ID → file parts with base64 data URLs
 *
 * @example
 * ```typescript
 * const { filePartsByMessageId } = await loadMessageAttachments({
 *   messageIds: messages.map(m => m.id),
 *   r2Bucket: env.UPLOADS_R2_BUCKET,
 *   db,
 * });
 *
 * // Replace HTTP URLs with base64 in messages
 * const updatedMessages = messages.map(msg => {
 *   const fileParts = filePartsByMessageId.get(msg.id);
 *   if (fileParts) {
 *     // Replace file parts with base64 versions
 *   }
 *   return msg;
 * });
 * ```
 */
export async function loadMessageAttachments(
  params: LoadMessageAttachmentsParams,
): Promise<LoadMessageAttachmentsResult> {
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

  // Load all message-upload links for these messages
  // Join with upload table to get file metadata in one query
  // Following Drizzle ORM pattern from streaming-orchestration.service.ts:256-266
  const messageUploadsRaw = await db
    .select()
    .from(tables.messageUpload)
    .innerJoin(
      tables.upload,
      eq(tables.messageUpload.uploadId, tables.upload.id),
    )
    .where(inArray(tables.messageUpload.messageId, messageIds));

  if (messageUploadsRaw.length === 0) {
    logger?.debug('No attachments found for messages', {
      logType: 'operation',
      operationName: 'loadMessageAttachments',
      messageCount: messageIds.length,
    });
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

  logger?.info('Loading attachment content for messages', {
    logType: 'operation',
    operationName: 'loadMessageAttachments',
    messageCount: messageIds.length,
    messagesWithAttachments: uploadsByMessageId.size,
    totalUploads,
  });

  // Process each message's attachments
  for (const [messageId, uploads] of uploadsByMessageId) {
    const messageParts: ModelFilePart[] = [];

    // Sort by display order
    uploads.sort((a, b) => a.displayOrder - b.displayOrder);

    for (const { uploadId, upload } of uploads) {
      try {
        // Skip files that AI models can't process visually
        if (!VISUAL_MIME_TYPES.has(upload.mimeType)) {
          logger?.debug('Skipping non-visual file in message', {
            logType: 'operation',
            operationName: 'loadMessageAttachments',
            messageId,
            uploadId,
            mimeType: upload.mimeType,
          });
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
          logger?.warn('File too large for base64 conversion', {
            logType: 'operation',
            operationName: 'loadMessageAttachments',
            messageId,
            uploadId,
            fileSize: upload.fileSize,
            maxSize: MAX_BASE64_FILE_SIZE,
          });
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
          logger?.warn('File not found in storage', {
            logType: 'operation',
            operationName: 'loadMessageAttachments',
            messageId,
            uploadId,
            r2Key: upload.r2Key,
          });
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

        logger?.debug('Loaded attachment content for message', {
          logType: 'operation',
          operationName: 'loadMessageAttachments',
          messageId,
          uploadId,
          filename: upload.filename,
          mimeType: upload.mimeType,
          sizeKB: Math.round(upload.fileSize / 1024),
        });
      } catch (error) {
        const errorMessage
          = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Attachment] Failed to load attachment for message:', {
          messageId,
          uploadId,
          filename: upload.filename,
          error: errorMessage,
        });
        logger?.error('Failed to load attachment content for message', {
          logType: 'operation',
          operationName: 'loadMessageAttachments',
          messageId,
          uploadId,
          error: errorMessage,
        });
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

  logger?.info('Message attachment loading complete', {
    logType: 'operation',
    operationName: 'loadMessageAttachments',
    stats,
  });

  return { filePartsByMessageId, errors, stats };
}

/**
 * Upload Handlers
 *
 * Business logic for file upload endpoints
 * Uses R2 for storage following Cloudflare best practices
 *
 * Architecture:
 * - upload: Central file storage (R2 bucket references)
 * - threadUpload: Junction table linking uploads to threads
 * - messageUpload: Junction table linking uploads to messages
 */

import type { RouteHandler } from '@hono/zod-openapi';
import {
  ALLOWED_MIME_TYPES,
  ChatAttachmentStatuses,
  getMaxFileSizeForMimeType,
  MIN_MULTIPART_PART_SIZE,
  MULTIPART_OVERHEAD_TOLERANCE,
} from '@roundtable/shared/enums';
import { and, eq } from 'drizzle-orm';
import * as HttpStatusCodes from 'stoker/http-status-codes';
import { ulid } from 'ulid';

import { createError, runBackgroundTask } from '@/common';
import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createHandler,
  createTimestampCursor,
  getCursorOrderBy,
  IdParamSchema,
  Responses,
} from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import {
  backgroundPdfProcessing,
  createUploadTicket,
  deleteFile,
  deleteMultipartMetadata,
  deleteTicket,
  generateSignedDownloadUrl,
  getFileStream,
  isCleanupSchedulerAvailable,
  isLocalDevelopment,
  putFile,
  scheduleUploadCleanup,
  shouldExtractPdfText,
  shouldExtractPdfTextWithAI,
  storeMultipartMetadata,
  validateMultipartOwnership,
  validateR2UploadId,
  validateUploadTicket,
} from '@/services/uploads';
import type { ApiEnv } from '@/types';

import type {
  abortMultipartUploadRoute,
  completeMultipartUploadRoute,
  createMultipartUploadRoute,
  deleteUploadRoute,
  downloadUploadRoute,
  getDownloadUrlRoute,
  getUploadRoute,
  listUploadsRoute,
  requestUploadTicketRoute,
  updateUploadRoute,
  uploadPartRoute,
  uploadWithTicketRoute,
} from './route';
import {
  CompleteMultipartUploadRequestSchema,
  CreateMultipartUploadRequestSchema,
  ListUploadsQuerySchema,
  RequestUploadTicketSchema,
  UpdateUploadRequestSchema,
  UploadPartParamsSchema,
  UploadWithTicketQuerySchema,
} from './schema';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * ✅ TYPE-SAFE: Validates R2 bucket is available
 * Throws a helpful error if R2 is not configured
 *
 * @param bucket - The R2 bucket binding from environment
 * @returns The validated R2 bucket (non-null)
 */
function getValidatedR2Bucket(bucket: R2Bucket | undefined): R2Bucket {
  if (!bucket) {
    throw createError.badRequest(
      'R2 bucket not available. Multipart uploads require R2 configuration.',
      { errorType: 'configuration' },
    );
  }
  return bucket;
}

/**
 * Generate R2 key for upload
 */
function generateR2Key(userId: string, uploadId: string, filename: string): string {
  // Sanitize filename
  const sanitizedFilename = filename.replace(/[^\w.-]/g, '_');
  return `uploads/${userId}/${uploadId}_${sanitizedFilename}`;
}

/**
 * Validate MIME type against allowed list
 */
function isAllowedMimeType(mimeType: string): mimeType is typeof ALLOWED_MIME_TYPES[number] {
  return ALLOWED_MIME_TYPES.includes(mimeType as typeof ALLOWED_MIME_TYPES[number]);
}

// ============================================================================
// UPLOAD LIST/GET HANDLERS
// ============================================================================

/**
 * List user uploads
 */
export const listUploadsHandler: RouteHandler<typeof listUploadsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateQuery: ListUploadsQuerySchema,
    operationName: 'listUploads',
  },
  async (c) => {
    const { user } = c.auth();
    const query = c.validated.query;
    const db = await getDbAsync();

    // Build filters - query by user and optional status
    const filters = [eq(tables.upload.userId, user.id)];

    if (query.status) {
      filters.push(eq(tables.upload.status, query.status));
    }

    // Fetch uploads with cursor pagination - exclude r2Key from selection
    const uploads = await db.query.upload.findMany({
      where: buildCursorWhereWithFilters(
        tables.upload.createdAt,
        query.cursor,
        'desc',
        filters,
      ),
      orderBy: getCursorOrderBy(tables.upload.createdAt, 'desc'),
      limit: query.limit + 1,
      columns: {
        id: true,
        userId: true,
        filename: true,
        fileSize: true,
        mimeType: true,
        status: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        r2Key: false,
      },
    });

    // Apply pagination
    const { items, pagination } = applyCursorPagination(
      uploads,
      query.limit,
      uploadItem => createTimestampCursor(uploadItem.createdAt),
    );

    return Responses.cursorPaginated(c, items, pagination);
  },
);

/**
 * Get upload by ID
 */
export const getUploadHandler: RouteHandler<typeof getUploadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getUpload',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    const uploadRecord = await db.query.upload.findFirst({
      where: and(
        eq(tables.upload.id, id),
        eq(tables.upload.userId, user.id),
      ),
      columns: {
        id: true,
        userId: true,
        filename: true,
        fileSize: true,
        mimeType: true,
        status: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        r2Key: false,
      },
    });

    if (!uploadRecord) {
      throw createError.notFound(`Upload not found: ${id}`, {
        errorType: 'resource',
        resource: 'upload',
        resourceId: id,
      });
    }

    return Responses.ok(c, uploadRecord);
  },
);

/**
 * Get download URL for an upload
 * Returns a signed URL that can be used to download/preview the file
 */
export const getDownloadUrlHandler: RouteHandler<typeof getDownloadUrlRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getDownloadUrl',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Verify ownership - only need id for existence check
    const uploadRecord = await db.query.upload.findFirst({
      where: and(
        eq(tables.upload.id, id),
        eq(tables.upload.userId, user.id),
      ),
      columns: {
        id: true,
      },
    });

    if (!uploadRecord) {
      throw createError.notFound(`Upload not found: ${id}`, {
        errorType: 'resource',
        resource: 'upload',
        resourceId: id,
      });
    }

    // Generate signed download URL (15-minute default expiration)
    const signedUrl = await generateSignedDownloadUrl(c, {
      uploadId: id,
      userId: user.id,
    });

    return Responses.ok(c, {
      url: signedUrl,
    });
  },
);

// ============================================================================
// SECURE UPLOAD TICKET HANDLERS (S3 Presigned URL Pattern)
// ============================================================================

/**
 * Request upload ticket (Step 1 of secure upload)
 *
 * Returns a time-limited, signed token that must be included in the actual upload.
 * This follows the S3 presigned URL pattern for secure uploads.
 */
export const requestUploadTicketHandler: RouteHandler<typeof requestUploadTicketRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: RequestUploadTicketSchema,
    operationName: 'requestUploadTicket',
  },
  async (c) => {
    const { user } = c.auth();
    const body = c.validated.body;

    // Validate MIME type
    if (!isAllowedMimeType(body.mimeType)) {
      throw createError.badRequest(
        `File type not allowed: ${body.mimeType}`,
        {
          errorType: 'validation',
          field: 'mimeType',
        },
      );
    }

    // Get the max file size limit for this MIME type (enum-based limits)
    const maxFileSizeForType = getMaxFileSizeForMimeType(body.mimeType);

    // Validate file size against type-specific limit
    if (body.fileSize > maxFileSizeForType) {
      throw createError.badRequest(
        `File too large (max ${maxFileSizeForType / 1024 / 1024}MB for this file type). Use multipart upload for larger files.`,
        {
          errorType: 'validation',
          field: 'fileSize',
        },
      );
    }

    // Create upload ticket with the declared file size as the limit
    // The ticket enforces the client's declared size, not the type limit
    const { ticketId, token, expiresAt } = await createUploadTicket(c, {
      userId: user.id,
      filename: body.filename,
      mimeType: body.mimeType,
      maxFileSize: body.fileSize,
    });

    // Build upload URL
    const baseUrl = new URL(c.req.url).origin;
    const uploadUrl = `${baseUrl}/api/v1/uploads/ticket/upload?token=${encodeURIComponent(token)}`;

    return Responses.ok(c, {
      ticketId,
      token,
      expiresAt,
      uploadUrl,
    });
  },
);

/**
 * Upload file with ticket (Step 2 of secure upload)
 *
 * Validates ticket token before accepting file upload.
 * Token can only be used once (one-time use prevents replay attacks).
 */
export const uploadWithTicketHandler: RouteHandler<typeof uploadWithTicketRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateQuery: UploadWithTicketQuerySchema,
    operationName: 'uploadWithTicket',
  },
  async (c) => {
    const { user } = c.auth();
    const { token } = c.validated.query;
    const db = await getDbAsync();

    // Validate ticket (atomically marks as used to prevent race conditions)
    const validation = await validateUploadTicket(c, token, user.id);
    if (!validation.valid) {
      throw createError.unauthorized(validation.error, {
        errorType: 'authorization',
      });
    }

    const { ticket } = validation;

    // Pre-check Content-Length to reject oversized files before downloading
    // DoS mitigation: avoids wasting bandwidth/worker time on files that will fail
    // Note: Content-Length includes multipart boundaries/headers, so add tolerance
    const contentLength = c.req.header('content-length');
    if (contentLength) {
      const size = Number.parseInt(contentLength, 10);
      const effectiveLimit = ticket.maxFileSize + MULTIPART_OVERHEAD_TOLERANCE;
      if (!Number.isNaN(size) && size > effectiveLimit) {
        await deleteTicket(c, ticket.ticketId);
        throw createError.badRequest(
          `Content-Length ${size} exceeds limit ${effectiveLimit}`,
          { errorType: 'validation', field: 'content-length' },
        );
      }
    }

    // Parse multipart form data
    const body = await c.req.parseBody({ all: true });

    // Extract file from parsed body
    let file: File | undefined;
    if (body.file instanceof File) {
      file = body.file;
    } else if (Array.isArray(body.file) && body.file[0] instanceof File) {
      file = body.file[0];
    }

    if (!file) {
      await deleteTicket(c, ticket.ticketId);
      throw createError.badRequest(
        'No file provided. Expected field "file" in multipart form data.',
        {
          errorType: 'validation',
          field: 'file',
        },
      );
    }

    // Validate file matches ticket constraints
    if (file.size > ticket.maxFileSize) {
      await deleteTicket(c, ticket.ticketId);
      throw createError.badRequest(
        `File size ${file.size} exceeds ticket limit ${ticket.maxFileSize}`,
        {
          errorType: 'validation',
          field: 'file',
        },
      );
    }

    if (file.type !== ticket.mimeType) {
      await deleteTicket(c, ticket.ticketId);
      throw createError.badRequest(
        `File type ${file.type} doesn't match ticket type ${ticket.mimeType}`,
        {
          errorType: 'validation',
          field: 'file',
        },
      );
    }

    // NOTE: Ticket already marked as used atomically during validateUploadTicket()
    // No separate markTicketUsed() call needed - prevents race condition window

    // Generate IDs and storage key
    const uploadId = ulid();
    const r2Key = generateR2Key(user.id, uploadId, file.name);

    // Upload to storage - use arrayBuffer for single uploads (< 100MB)
    // R2 streams require known content-length which File.stream() doesn't provide
    const uploadResult = await putFile(
      c.env.UPLOADS_R2_BUCKET,
      r2Key,
      await file.arrayBuffer(),
      {
        contentType: file.type,
        customMetadata: {
          userId: user.id,
          uploadId,
          filename: file.name,
          ticketId: ticket.ticketId,
          uploadedAt: new Date().toISOString(),
        },
      },
    );

    if (!uploadResult.success) {
      throw createError.internal(
        `Failed to upload file: ${uploadResult.error}`,
        { errorType: 'external_service' },
      );
    }

    // Create DB record (ticketId stored in R2 customMetadata for audit purposes)
    const [uploadRecord] = await db
      .insert(tables.upload)
      .values({
        id: uploadId,
        userId: user.id,
        filename: file.name,
        r2Key,
        fileSize: file.size,
        mimeType: file.type,
        status: ChatAttachmentStatuses.READY,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Schedule cleanup for orphaned uploads
    if (isCleanupSchedulerAvailable(c.env)) {
      const scheduleCleanupTask = async () => {
        try {
          await scheduleUploadCleanup(
            c.env.UPLOAD_CLEANUP_SCHEDULER,
            uploadId,
            user.id,
            r2Key,
          );
        } catch (error) {
          console.error(`[Upload] Failed to schedule cleanup for ${uploadId}:`, error);
        }
      };

      if (c.executionCtx) {
        c.executionCtx.waitUntil(scheduleCleanupTask());
      } else {
        scheduleCleanupTask().catch(() => {});
      }
    }

    // Process PDF text extraction SYNCHRONOUSLY to ensure text is ready before AI needs it
    // Previously used waitUntil() which caused race conditions in production
    // Small PDFs (≤10MB) use in-worker PDF.js, larger PDFs (10-100MB) use Cloudflare AI
    const canExtractInWorker = shouldExtractPdfText(file.type, file.size);
    const canExtractWithAI = shouldExtractPdfTextWithAI(file.type, file.size);

    if ((canExtractInWorker || canExtractWithAI) && c.env.UPLOADS_R2_BUCKET) {
      try {
        await backgroundPdfProcessing({
          uploadId,
          r2Key,
          fileSize: file.size,
          mimeType: file.type,
          r2Bucket: c.env.UPLOADS_R2_BUCKET,
          db,
          ai: c.env.AI, // Cloudflare AI binding for large file extraction
        });
      } catch (error) {
        // Log but don't fail upload - extraction is optional
        console.error(`[Upload] PDF extraction failed for ${uploadId}:`, error);
      }
    }

    return Responses.created(c, uploadRecord);
  },
);

/**
 * Update upload metadata
 *
 * Note: Thread/message associations are handled via junction tables.
 * Use dedicated endpoints to manage associations.
 */
export const updateUploadHandler: RouteHandler<typeof updateUploadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: UpdateUploadRequestSchema,
    operationName: 'updateUpload',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    // Verify ownership and get metadata in single query
    const existing = await db.query.upload.findFirst({
      where: and(
        eq(tables.upload.id, id),
        eq(tables.upload.userId, user.id),
      ),
      columns: {
        id: true,
        metadata: true,
      },
    });

    if (!existing) {
      throw createError.notFound(`Upload not found: ${id}`, {
        errorType: 'resource',
        resource: 'upload',
        resourceId: id,
      });
    }

    // Build update object - only metadata updates allowed here
    const updateData: {
      metadata?: typeof existing.metadata;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (body.description !== undefined) {
      updateData.metadata = {
        ...existing.metadata,
        description: body.description ?? undefined,
      };
    }

    const [updated] = await db
      .update(tables.upload)
      .set(updateData)
      .where(eq(tables.upload.id, id))
      .returning();

    return Responses.ok(c, updated);
  },
);

/**
 * Download file
 * Serves file content from R2/local storage with streaming
 *
 * Follows official Cloudflare R2 patterns:
 * - Streams body directly instead of buffering entire file
 * - Uses writeHttpMetadata() for proper Content-Type headers
 * - Includes ETag for caching and conditional requests
 * - Supports If-None-Match conditional requests (304 Not Modified)
 *
 * Security model:
 * 1. ALWAYS require session authentication (no anonymous access)
 * 2. If signed URL params present: Validate signature + session user must match
 * 3. If no signature: Session auth + ownership check
 *
 * NOTE: This breaks AI provider access to large files (>4MB) since they cannot
 * authenticate. Large files will fall back to base64 or text extraction.
 *
 * @see https://developers.cloudflare.com/r2/api/workers/workers-api-usage
 */
export const downloadUploadHandler: RouteHandler<typeof downloadUploadRoute, ApiEnv> = createHandler(
  {
    auth: 'session', // SECURITY: Always require session - no anonymous access
    validateParams: IdParamSchema,
    operationName: 'downloadFile',
  },
  async (c) => {
    const { user } = c.auth(); // Guaranteed by auth: 'session'

    // Dynamic import to avoid linter removing "unused" static import
    const signedUrlService = await import('@/services/uploads');

    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Extract conditional request headers for ETag validation
    const requestHeaders = c.req.raw.headers;
    const ifNoneMatch = requestHeaders.get('if-none-match');

    /**
     * Build streaming response following official Cloudflare R2 pattern:
     * ```ts
     * const headers = new Headers();
     * object.writeHttpMetadata(headers);
     * headers.set("etag", object.httpEtag);
     * return new Response(object.body, { headers });
     * ```
     * @see https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
     */
    const buildStreamingResponse = (
      result: Awaited<ReturnType<typeof getFileStream>>,
      uploadRecord: { filename: string; mimeType: string | null },
      cacheControl: string,
    ) => {
      // Conditional request: 304 Not Modified
      if (ifNoneMatch && result.httpEtag && ifNoneMatch === result.httpEtag) {
        return new Response(null, { status: HttpStatusCodes.NOT_MODIFIED });
      }

      // Build headers following official R2 pattern
      const headers = new Headers();
      result.writeHttpMetadata(headers);
      headers.set('etag', result.httpEtag);
      headers.set('content-length', result.size.toString());

      // Fallback Content-Type if R2 didn't set one
      if (!headers.has('content-type')) {
        headers.set('content-type', uploadRecord.mimeType || 'application/octet-stream');
      }

      // Security and caching headers
      headers.set('content-disposition', `inline; filename="${encodeURIComponent(uploadRecord.filename)}"`);
      headers.set('cache-control', cacheControl);
      headers.set('x-content-type-options', 'nosniff');
      // ✅ CORS FIX: Required for cross-origin embedding (images in <img> tags, etc.)
      // Without this, browser blocks response with ERR_BLOCKED_BY_RESPONSE.NotSameOrigin
      headers.set('cross-origin-resource-policy', 'cross-origin');

      return new Response(result.body, { headers });
    };

    // SECURITY: Validate signed URL if present (for expiration/integrity)
    // But ALWAYS require session user to match - no anonymous access ever
    if (signedUrlService.hasSignatureParams(c)) {
      const validation = await signedUrlService.validateSignedUrl(c, id);

      if (!validation.valid) {
        throw createError.unauthorized(validation.error, {
          errorType: 'authorization',
          resource: 'upload',
          resourceId: id,
        });
      }

      // SECURITY: Session user MUST match signed URL user - no sharing allowed
      if (user.id !== validation.userId) {
        throw createError.unauthorized('Access denied - you can only access your own files', {
          errorType: 'authorization',
          resource: 'upload',
          resourceId: id,
        });
      }
    }

    // SECURITY: Session user must own the file - private access only
    const uploadRecord = await db.query.upload.findFirst({
      where: and(
        eq(tables.upload.id, id),
        eq(tables.upload.userId, user.id),
      ),
      columns: {
        r2Key: true,
        filename: true,
        mimeType: true,
      },
    });

    if (!uploadRecord) {
      throw createError.notFound(`Upload not found: ${id}`, {
        errorType: 'resource',
        resource: 'upload',
        resourceId: id,
      });
    }

    // Use streaming with conditional request support (official R2 pattern)
    const result = await getFileStream(c.env.UPLOADS_R2_BUCKET, uploadRecord.r2Key, {
      onlyIf: requestHeaders,
    });

    if (!result.found) {
      throw createError.notFound('File not found in storage', {
        errorType: 'resource',
        resource: 'file',
        resourceId: id,
      });
    }

    // Security audit: file download
    console.error(JSON.stringify({
      audit: 'file_download',
      uploadId: id,
      userId: user.id,
      ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
      userAgent: c.req.header('user-agent'),
      method: 'session_auth',
      timestamp: Date.now(),
    }));

    return buildStreamingResponse(result, uploadRecord, 'private, no-store');
  },
);

/**
 * Delete upload
 *
 * Note: This will cascade delete all associated thread/message/project attachments
 * due to ON DELETE CASCADE constraints.
 */
export const deleteUploadHandler: RouteHandler<typeof deleteUploadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'deleteUpload',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Get upload with R2 key - only need r2Key for deletion
    const uploadRecord = await db.query.upload.findFirst({
      where: and(
        eq(tables.upload.id, id),
        eq(tables.upload.userId, user.id),
      ),
      columns: {
        id: true,
        r2Key: true,
      },
    });

    if (!uploadRecord) {
      throw createError.notFound(`Upload not found: ${id}`, {
        errorType: 'resource',
        resource: 'upload',
        resourceId: id,
      });
    }

    // Delete from DB first (critical) - cascades to junction tables
    await db
      .delete(tables.upload)
      .where(eq(tables.upload.id, id));

    // Non-blocking storage cleanup via runBackgroundTask
    runBackgroundTask(
      c.executionCtx,
      () => deleteFile(c.env.UPLOADS_R2_BUCKET, uploadRecord.r2Key),
      { operationName: 'upload-storage-cleanup' },
    );

    return Responses.ok(c, {
      id,
      deleted: true,
    });
  },
);

// ============================================================================
// MULTIPART UPLOAD HANDLERS
// ============================================================================

/**
 * Create multipart upload
 *
 * Initiates a multipart upload for large files (> 100MB).
 * Uses KV to persist metadata between part uploads for production reliability.
 *
 * @see https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/
 */
export const createMultipartUploadHandler: RouteHandler<typeof createMultipartUploadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: CreateMultipartUploadRequestSchema,
    operationName: 'createMultipartUpload',
  },
  async (c) => {
    const { user } = c.auth();
    const body = c.validated.body;
    const db = await getDbAsync();

    // Validate MIME type
    if (!isAllowedMimeType(body.mimeType)) {
      throw createError.badRequest(
        `File type not allowed: ${body.mimeType}`,
        {
          errorType: 'validation',
          field: 'mimeType',
        },
      );
    }

    // Check if R2 is available (multipart uploads require R2)
    if (isLocalDevelopment(c.env.UPLOADS_R2_BUCKET)) {
      throw createError.badRequest(
        'Multipart uploads are not available in local development. Use single-file upload (< 100MB) or run with `bun run preview` to test with R2.',
        { errorType: 'configuration' },
      );
    }

    // Generate IDs
    const uploadId = ulid();
    const r2Key = generateR2Key(user.id, uploadId, body.filename);

    // Create multipart upload in R2
    // ✅ TYPE-SAFE: Use validated R2 bucket instead of non-null assertion
    const r2Bucket = getValidatedR2Bucket(c.env.UPLOADS_R2_BUCKET);
    const multipartUpload = await r2Bucket.createMultipartUpload(r2Key, {
      httpMetadata: {
        contentType: body.mimeType,
      },
      customMetadata: {
        userId: user.id,
        uploadId,
        filename: body.filename,
      },
    });

    // Store metadata in KV for persistence across worker restarts
    await storeMultipartMetadata(c.env.KV, {
      userId: user.id,
      uploadId,
      r2Key,
      r2UploadId: multipartUpload.uploadId,
      filename: body.filename,
      mimeType: body.mimeType,
      fileSize: body.fileSize,
      createdAt: Date.now(),
    });

    // Create DB record with 'uploading' status
    await db
      .insert(tables.upload)
      .values({
        id: uploadId,
        userId: user.id,
        filename: body.filename,
        r2Key,
        fileSize: body.fileSize,
        mimeType: body.mimeType,
        status: ChatAttachmentStatuses.UPLOADING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    return Responses.created(c, {
      uploadId: multipartUpload.uploadId,
      key: r2Key,
      attachmentId: uploadId,
    });
  },
);

/**
 * Upload part
 *
 * Uploads a single part of a multipart upload.
 * Each part (except the last) must be at least 5MB.
 *
 * @see https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/
 */
export const uploadPartHandler: RouteHandler<typeof uploadPartRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateQuery: UploadPartParamsSchema,
    operationName: 'uploadPart',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: uploadId } = c.validated.params;
    const { uploadId: r2UploadId, partNumber: partNumberStr } = c.validated.query;

    const partNumber = Number.parseInt(partNumberStr, 10);
    if (Number.isNaN(partNumber) || partNumber < 1) {
      throw createError.badRequest('Invalid part number', {
        errorType: 'validation',
        field: 'partNumber',
      });
    }

    // Get upload metadata from KV (validates ownership)
    const uploadMeta = await validateMultipartOwnership(c.env.KV, uploadId, user.id);
    if (!uploadMeta) {
      throw createError.notFound('Multipart upload not found or expired', {
        errorType: 'resource',
        resource: 'multipartUpload',
        resourceId: uploadId,
      });
    }

    // Validate R2 upload ID matches
    if (!validateR2UploadId(uploadMeta, r2UploadId)) {
      throw createError.badRequest('Upload ID mismatch', {
        errorType: 'validation',
        field: 'uploadId',
      });
    }

    // Get request body as ArrayBuffer
    const partData = await c.req.arrayBuffer();

    // Validate part size (except for last part)
    if (partData.byteLength < MIN_MULTIPART_PART_SIZE && partData.byteLength < uploadMeta.fileSize) {
      throw createError.badRequest(
        `Part size must be at least ${MIN_MULTIPART_PART_SIZE / 1024 / 1024}MB (except for last part)`,
        {
          errorType: 'validation',
          field: 'body',
        },
      );
    }

    // Resume multipart upload and upload part
    // ✅ TYPE-SAFE: Use validated R2 bucket instead of non-null assertion
    const r2Bucket = getValidatedR2Bucket(c.env.UPLOADS_R2_BUCKET);
    const multipartUpload = r2Bucket.resumeMultipartUpload(
      uploadMeta.r2Key,
      r2UploadId,
    );

    const uploadedPart = await multipartUpload.uploadPart(partNumber, partData);

    return Responses.ok(c, {
      partNumber: uploadedPart.partNumber,
      etag: uploadedPart.etag,
    });
  },
);

/**
 * Complete multipart upload
 *
 * Finalizes a multipart upload by combining all uploaded parts.
 * The parts array must include partNumber and etag for each uploaded part.
 *
 * @see https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/
 */
export const completeMultipartUploadHandler: RouteHandler<typeof completeMultipartUploadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: CompleteMultipartUploadRequestSchema,
    operationName: 'completeMultipartUpload',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: uploadId } = c.validated.params;
    const { parts } = c.validated.body;
    const db = await getDbAsync();

    // Get upload metadata from KV (validates ownership)
    const uploadMeta = await validateMultipartOwnership(c.env.KV, uploadId, user.id);
    if (!uploadMeta) {
      throw createError.notFound('Multipart upload not found or expired', {
        errorType: 'resource',
        resource: 'multipartUpload',
        resourceId: uploadId,
      });
    }

    // Resume and complete multipart upload
    // ✅ TYPE-SAFE: Use validated R2 bucket instead of non-null assertion
    const r2Bucket = getValidatedR2Bucket(c.env.UPLOADS_R2_BUCKET);
    const multipartUpload = r2Bucket.resumeMultipartUpload(
      uploadMeta.r2Key,
      uploadMeta.r2UploadId,
    );

    try {
      await multipartUpload.complete(parts);
    } catch (error) {
      // Update DB status to failed
      await db
        .update(tables.upload)
        .set({
          status: ChatAttachmentStatuses.FAILED,
          metadata: { errorMessage: error instanceof Error ? error.message : 'Unknown error' },
          updatedAt: new Date(),
        })
        .where(eq(tables.upload.id, uploadId));

      throw createError.badRequest(
        `Failed to complete multipart upload: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          errorType: 'validation',
        },
      );
    }

    // Update DB status to ready
    const [updated] = await db
      .update(tables.upload)
      .set({
        status: ChatAttachmentStatuses.READY,
        updatedAt: new Date(),
      })
      .where(eq(tables.upload.id, uploadId))
      .returning();

    // Schedule automatic cleanup for orphaned uploads (15 minutes)
    if (isCleanupSchedulerAvailable(c.env)) {
      const scheduleCleanupTask = async () => {
        try {
          await scheduleUploadCleanup(
            c.env.UPLOAD_CLEANUP_SCHEDULER,
            uploadId,
            uploadMeta.userId,
            uploadMeta.r2Key,
          );
        } catch (error) {
          console.error(`[Upload] Failed to schedule cleanup for ${uploadId}:`, error);
        }
      };

      if (c.executionCtx) {
        c.executionCtx.waitUntil(scheduleCleanupTask());
      } else {
        scheduleCleanupTask().catch(() => {});
      }
    }

    // Clean up KV metadata (non-blocking)
    const cleanupMetadata = deleteMultipartMetadata(c.env.KV, uploadId);
    if (c.executionCtx) {
      c.executionCtx.waitUntil(cleanupMetadata);
    }

    // Process PDF text extraction SYNCHRONOUSLY to ensure text is ready before AI needs it
    // Previously used waitUntil() which caused race conditions in production
    // Small PDFs (≤10MB) use in-worker PDF.js, larger PDFs (10-100MB) use Cloudflare AI
    const canExtractInWorkerMultipart = shouldExtractPdfText(uploadMeta.mimeType, uploadMeta.fileSize);
    const canExtractWithAIMultipart = shouldExtractPdfTextWithAI(uploadMeta.mimeType, uploadMeta.fileSize);

    if ((canExtractInWorkerMultipart || canExtractWithAIMultipart) && c.env.UPLOADS_R2_BUCKET) {
      try {
        await backgroundPdfProcessing({
          uploadId,
          r2Key: uploadMeta.r2Key,
          fileSize: uploadMeta.fileSize,
          mimeType: uploadMeta.mimeType,
          r2Bucket: c.env.UPLOADS_R2_BUCKET,
          db,
          ai: c.env.AI, // Cloudflare AI binding for large file extraction
        });
      } catch (error) {
        // Log but don't fail upload - extraction is optional
        console.error(`[Multipart Upload] PDF extraction failed for ${uploadId}:`, error);
      }
    }

    return Responses.ok(c, updated);
  },
);

/**
 * Abort multipart upload
 *
 * Cancels an in-progress multipart upload and cleans up any uploaded parts.
 *
 * @see https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/
 */
export const abortMultipartUploadHandler: RouteHandler<typeof abortMultipartUploadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateQuery: UploadPartParamsSchema.pick({ uploadId: true }),
    operationName: 'abortMultipartUpload',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: uploadId } = c.validated.params;
    const { uploadId: r2UploadId } = c.validated.query;
    const db = await getDbAsync();

    // Get upload metadata from KV (validates ownership)
    const uploadMeta = await validateMultipartOwnership(c.env.KV, uploadId, user.id);
    if (!uploadMeta) {
      throw createError.notFound('Multipart upload not found or expired', {
        errorType: 'resource',
        resource: 'multipartUpload',
        resourceId: uploadId,
      });
    }

    // Validate R2 upload ID matches
    if (!validateR2UploadId(uploadMeta, r2UploadId)) {
      throw createError.badRequest('Upload ID mismatch', {
        errorType: 'validation',
        field: 'uploadId',
      });
    }

    // Abort R2 multipart upload
    // ✅ TYPE-SAFE: Use validated R2 bucket instead of non-null assertion
    const r2Bucket = getValidatedR2Bucket(c.env.UPLOADS_R2_BUCKET);
    const multipartUpload = r2Bucket.resumeMultipartUpload(
      uploadMeta.r2Key,
      r2UploadId,
    );

    try {
      await multipartUpload.abort();
    } catch {
      // Ignore errors - upload might already be aborted
    }

    // Delete DB record
    await db
      .delete(tables.upload)
      .where(eq(tables.upload.id, uploadId));

    // Clean up KV metadata (non-blocking)
    const cleanupMetadata = deleteMultipartMetadata(c.env.KV, uploadId);
    if (c.executionCtx) {
      c.executionCtx.waitUntil(cleanupMetadata);
    }

    return Responses.ok(c, {
      uploadId: r2UploadId,
      aborted: true,
    });
  },
);

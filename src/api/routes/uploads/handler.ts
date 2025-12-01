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
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createHandler,
  createTimestampCursor,
  getCursorOrderBy,
  Responses,
} from '@/api/core';
import {
  ALLOWED_MIME_TYPES,
  MAX_SINGLE_UPLOAD_SIZE,
  MIN_MULTIPART_PART_SIZE,
} from '@/api/core/enums';
import { IdParamSchema } from '@/api/core/schemas';
import { deleteFile, getFile, isLocalDevelopment, putFile } from '@/api/services/storage.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type {
  abortMultipartUploadRoute,
  completeMultipartUploadRoute,
  createMultipartUploadRoute,
  deleteUploadRoute,
  downloadUploadRoute,
  getUploadRoute,
  listUploadsRoute,
  updateUploadRoute,
  uploadFileRoute,
  uploadPartRoute,
} from './route';
// ============================================================================
// MULTIPART UPLOAD HANDLERS
// ============================================================================
import type { MultipartUploadMetadata } from './schema';
import {
  CompleteMultipartUploadRequestSchema,
  CreateMultipartUploadRequestSchema,
  ListUploadsQuerySchema,
  UpdateUploadRequestSchema,
  UploadPartParamsSchema,
} from './schema';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
function isAllowedMimeType(mimeType: string): boolean {
  // Check against explicit list from enums.ts, plus allow any text/ types
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType) || mimeType.startsWith('text/');
}

// ============================================================================
// SINGLE-REQUEST UPLOAD HANDLERS
// ============================================================================

/**
 * Upload file (single request)
 */
export const uploadFileHandler: RouteHandler<typeof uploadFileRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'uploadFile',
  },
  async (c) => {
    const { user } = c.auth();
    const db = await getDbAsync();

    // Parse multipart form data
    // Try parseBody with 'all' option to handle File objects correctly
    // This is critical for Hono in OpenNext/Cloudflare Workers environment
    const body = await c.req.parseBody({ all: true });

    // Handle the file - parseBody may return File or array of Files
    let file: File | undefined;
    if (body.file instanceof File) {
      file = body.file;
    } else if (Array.isArray(body.file) && body.file[0] instanceof File) {
      file = body.file[0];
    }

    if (!file) {
      throw createError.badRequest(
        'No file provided. Expected field "file" in multipart form data.',
        {
          errorType: 'validation',
          field: 'file',
        },
      );
    }

    // Validate file size
    if (file.size > MAX_SINGLE_UPLOAD_SIZE) {
      throw createError.badRequest(
        `File too large (max ${MAX_SINGLE_UPLOAD_SIZE / 1024 / 1024}MB). Use multipart upload for larger files.`,
        {
          errorType: 'validation',
          field: 'file',
        },
      );
    }

    // Validate MIME type
    if (!isAllowedMimeType(file.type)) {
      throw createError.badRequest(
        `File type not allowed: ${file.type}`,
        {
          errorType: 'validation',
          field: 'file',
        },
      );
    }

    // Generate IDs and storage key
    const uploadId = ulid();
    const r2Key = generateR2Key(user.id, uploadId, file.name);

    // Upload to storage (R2 in production, local filesystem in dev)
    const fileBuffer = await file.arrayBuffer();
    const uploadResult = await putFile(
      c.env.UPLOADS_R2_BUCKET,
      r2Key,
      fileBuffer,
      {
        contentType: file.type,
        customMetadata: {
          userId: user.id,
          uploadId,
          filename: file.name,
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

    // Create DB record in upload table (no direct thread/message FKs)
    const [uploadRecord] = await db
      .insert(tables.upload)
      .values({
        id: uploadId,
        userId: user.id,
        filename: file.name,
        r2Key,
        fileSize: file.size,
        mimeType: file.type,
        status: 'ready',
        metadata: {
          description: (body.description as string) || undefined,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    c.status(201);
    return Responses.ok(c, {
      ...uploadRecord,
      r2Key: undefined, // Don't expose R2 key
    });
  },
);

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

    // Fetch uploads with cursor pagination
    const uploads = await db.query.upload.findMany({
      where: buildCursorWhereWithFilters(
        tables.upload.createdAt,
        query.cursor,
        'desc',
        filters,
      ),
      orderBy: getCursorOrderBy(tables.upload.createdAt, 'desc'),
      limit: query.limit + 1,
    });

    // Apply pagination and remove r2Key
    const { items, pagination } = applyCursorPagination(
      uploads.map(u => ({ ...u, r2Key: undefined })),
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
    });

    if (!uploadRecord) {
      throw createError.notFound(`Upload not found: ${id}`, {
        errorType: 'resource',
        resource: 'upload',
        resourceId: id,
      });
    }

    return Responses.ok(c, {
      ...uploadRecord,
      r2Key: undefined,
    });
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

    // Verify ownership
    const existing = await db.query.upload.findFirst({
      where: and(
        eq(tables.upload.id, id),
        eq(tables.upload.userId, user.id),
      ),
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

    return Responses.ok(c, {
      ...updated,
      r2Key: undefined,
    });
  },
);

/**
 * Download file
 * Serves file content from R2/local storage
 *
 * Security model:
 * 1. If signed URL params present: Validate signature (supports shared access)
 * 2. If no signature: Require session auth + ownership check (backward compat)
 */
export const downloadUploadHandler: RouteHandler<typeof downloadUploadRoute, ApiEnv> = createHandler(
  {
    auth: 'session-optional',
    validateParams: IdParamSchema,
    operationName: 'downloadFile',
  },
  async (c) => {
    // Dynamic import to avoid linter removing "unused" static import
    const signedUrlService = await import('@/api/services/signed-url.service');

    const { id } = c.validated.params;
    const db = await getDbAsync();

    // SECURITY CHECK 1: Signed URL validation (preferred method)
    if (signedUrlService.hasSignatureParams(c)) {
      const validation = await signedUrlService.validateSignedUrl(c, id);

      if (!validation.valid) {
        throw createError.unauthorized(validation.error, {
          errorType: 'authorization',
          resource: 'upload',
          resourceId: id,
        });
      }

      const isPublicAccess = validation.isPublic;

      // Get upload record (no ownership check - signature validates access)
      const uploadRecord = await db.query.upload.findFirst({
        where: eq(tables.upload.id, id),
      });

      if (!uploadRecord) {
        throw createError.notFound(`Upload not found: ${id}`, {
          errorType: 'resource',
          resource: 'upload',
          resourceId: id,
        });
      }

      const { data, metadata } = await getFile(c.env.UPLOADS_R2_BUCKET, uploadRecord.r2Key);

      if (!data) {
        throw createError.notFound('File not found in storage', {
          errorType: 'resource',
          resource: 'file',
          resourceId: id,
        });
      }

      // Stricter cache for public access
      const cacheControl = isPublicAccess
        ? 'private, no-store, max-age=0'
        : 'private, max-age=3600';

      return new Response(data, {
        headers: {
          'Content-Type': metadata?.contentType || uploadRecord.mimeType || 'application/octet-stream',
          'Content-Disposition': `inline; filename="${encodeURIComponent(uploadRecord.filename)}"`,
          'Cache-Control': cacheControl,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // SECURITY CHECK 2: Session auth + ownership (backward compatibility)
    const auth = c.auth();
    if (!auth?.user) {
      throw createError.unauthenticated('Authentication required for unsigned download URLs', {
        errorType: 'authorization',
      });
    }

    const { user } = auth;

    // Get upload record WITH ownership check
    const uploadRecord = await db.query.upload.findFirst({
      where: and(
        eq(tables.upload.id, id),
        eq(tables.upload.userId, user.id),
      ),
    });

    if (!uploadRecord) {
      throw createError.notFound(`Upload not found: ${id}`, {
        errorType: 'resource',
        resource: 'upload',
        resourceId: id,
      });
    }

    const { data, metadata } = await getFile(c.env.UPLOADS_R2_BUCKET, uploadRecord.r2Key);

    if (!data) {
      throw createError.notFound('File not found in storage', {
        errorType: 'resource',
        resource: 'file',
        resourceId: id,
      });
    }

    return new Response(data, {
      headers: {
        'Content-Type': metadata?.contentType || uploadRecord.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(uploadRecord.filename)}"`,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
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

    // Get upload with R2 key
    const uploadRecord = await db.query.upload.findFirst({
      where: and(
        eq(tables.upload.id, id),
        eq(tables.upload.userId, user.id),
      ),
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

    // Non-blocking storage cleanup via waitUntil
    const deleteStorageFile = async () => {
      try {
        await deleteFile(c.env.UPLOADS_R2_BUCKET, uploadRecord.r2Key);
      } catch {
        // Silent failure - storage cleanup is best-effort
      }
    };

    if (c.executionCtx) {
      c.executionCtx.waitUntil(deleteStorageFile());
    } else {
      deleteStorageFile().catch(() => {});
    }

    return Responses.ok(c, {
      id,
      deleted: true,
    });
  },
);

/**
 * In-memory storage for multipart upload metadata
 * In production, use KV or D1 for persistence
 */
const multipartUploads = new Map<string, MultipartUploadMetadata>();

/**
 * Create multipart upload
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
        'Multipart uploads are not available in local development. Use single-file upload (< 100MB) or run with `pnpm preview` to test with R2.',
        { errorType: 'configuration' },
      );
    }

    // Generate IDs
    const uploadId = ulid();
    const r2Key = generateR2Key(user.id, uploadId, body.filename);

    // Create multipart upload in R2
    const multipartUpload = await c.env.UPLOADS_R2_BUCKET!.createMultipartUpload(r2Key, {
      httpMetadata: {
        contentType: body.mimeType,
      },
      customMetadata: {
        userId: user.id,
        uploadId,
        filename: body.filename,
      },
    });

    // Store upload metadata for tracking
    multipartUploads.set(uploadId, {
      userId: user.id,
      uploadId,
      r2Key,
      r2UploadId: multipartUpload.uploadId,
      filename: body.filename,
      mimeType: body.mimeType,
      fileSize: body.fileSize,
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
        status: 'uploading',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    c.status(201);
    return Responses.ok(c, {
      uploadId: multipartUpload.uploadId,
      key: r2Key,
      attachmentId: uploadId, // For backwards compatibility
    });
  },
);

/**
 * Upload part
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

    // Get upload metadata
    const uploadMeta = multipartUploads.get(uploadId);
    if (!uploadMeta || uploadMeta.userId !== user.id) {
      throw createError.notFound('Multipart upload not found or expired', {
        errorType: 'resource',
        resource: 'multipartUpload',
        resourceId: uploadId,
      });
    }

    if (uploadMeta.r2UploadId !== r2UploadId) {
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
    // Note: Multipart uploads require R2 (checked in createMultipartUpload)
    const multipartUpload = c.env.UPLOADS_R2_BUCKET!.resumeMultipartUpload(
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

    // Get upload metadata
    const uploadMeta = multipartUploads.get(uploadId);
    if (!uploadMeta || uploadMeta.userId !== user.id) {
      throw createError.notFound('Multipart upload not found or expired', {
        errorType: 'resource',
        resource: 'multipartUpload',
        resourceId: uploadId,
      });
    }

    // Resume and complete multipart upload
    const multipartUpload = c.env.UPLOADS_R2_BUCKET!.resumeMultipartUpload(
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
          status: 'failed',
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
        status: 'ready',
        updatedAt: new Date(),
      })
      .where(eq(tables.upload.id, uploadId))
      .returning();

    // Clean up metadata
    multipartUploads.delete(uploadId);

    return Responses.ok(c, {
      ...updated,
      r2Key: undefined,
    });
  },
);

/**
 * Abort multipart upload
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

    // Get upload metadata
    const uploadMeta = multipartUploads.get(uploadId);
    if (!uploadMeta || uploadMeta.userId !== user.id) {
      throw createError.notFound('Multipart upload not found or expired', {
        errorType: 'resource',
        resource: 'multipartUpload',
        resourceId: uploadId,
      });
    }

    if (uploadMeta.r2UploadId !== r2UploadId) {
      throw createError.badRequest('Upload ID mismatch', {
        errorType: 'validation',
        field: 'uploadId',
      });
    }

    // Abort R2 multipart upload
    const multipartUpload = c.env.UPLOADS_R2_BUCKET!.resumeMultipartUpload(
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

    // Clean up metadata
    multipartUploads.delete(uploadId);

    return Responses.ok(c, {
      uploadId: r2UploadId,
      aborted: true,
    });
  },
);

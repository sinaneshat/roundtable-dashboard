/**
 * Upload Schemas
 *
 * Schema definitions for file upload endpoints
 * Follows established pattern from project/schema.ts
 */

import { z } from '@hono/zod-openapi';

import { CursorPaginationQuerySchema } from '@/api/core';
import { ChatAttachmentStatusSchema } from '@/api/core/enums';
import { CoreSchemas, createApiResponseSchema, createCursorPaginatedResponseSchema } from '@/api/core/schemas';
import { uploadSelectSchema } from '@/db/validation/upload';

// ============================================================================
// REQUEST SCHEMAS
// ============================================================================

/**
 * Upload file request
 * Accepts multipart/form-data with file and optional metadata
 *
 * Note: Thread/message associations are handled via junction tables
 * (threadUpload, messageUpload) after upload completes
 */
export const UploadFileRequestSchema = z.object({
  file: z.instanceof(File).openapi({
    description: 'File to upload (multipart/form-data)',
    type: 'string',
    format: 'binary',
  }),
  description: z.string().max(500).optional().openapi({
    description: 'Optional file description for AI context',
  }),
}).openapi('UploadFileRequest');

/**
 * Update upload metadata request
 *
 * Note: Thread/message associations are handled via junction tables
 * Use dedicated endpoints to add/remove thread or message associations
 */
export const UpdateUploadRequestSchema = z.object({
  description: z.string().max(500).nullable().optional().openapi({
    description: 'File description for AI context',
  }),
}).openapi('UpdateUploadRequest');

// ============================================================================
// RESPONSE SCHEMAS
// ============================================================================

/**
 * Upload response schema
 * Returns upload details without exposing R2 keys
 */
export const UploadResponseSchema = uploadSelectSchema
  .omit({ r2Key: true }) // Don't expose internal R2 keys
  .extend({
    // Add download URL (signed or public depending on implementation)
    downloadUrl: z.string().optional().openapi({
      description: 'Temporary signed URL for downloading the file',
    }),
  })
  .openapi('UploadResponse');

/**
 * List uploads query schema
 */
export const ListUploadsQuerySchema = CursorPaginationQuerySchema.extend({
  status: ChatAttachmentStatusSchema.optional().openapi({
    description: 'Filter by status',
  }),
}).openapi('ListUploadsQuery');

// ============================================================================
// API RESPONSE WRAPPERS
// ============================================================================

/**
 * Single upload response
 */
export const GetUploadResponseSchema = createApiResponseSchema(UploadResponseSchema);

/**
 * Upload response (returned on successful upload)
 */
export const UploadFileResponseSchema = createApiResponseSchema(UploadResponseSchema);

/**
 * List uploads response
 */
export const ListUploadsResponseSchema = createCursorPaginatedResponseSchema(UploadResponseSchema);

/**
 * Delete upload response
 */
export const DeleteUploadResponseSchema = createApiResponseSchema(
  z.object({
    id: CoreSchemas.id(),
    deleted: z.boolean(),
  }),
);

/**
 * Download URL response
 * Returns a signed URL for downloading the file
 */
export const GetDownloadUrlPayloadSchema = z.object({
  url: z.string().openapi({
    description: 'Signed URL for downloading the file',
  }),
});

export const GetDownloadUrlResponseSchema = createApiResponseSchema(
  GetDownloadUrlPayloadSchema,
);

// ============================================================================
// MULTIPART UPLOAD SCHEMAS (for large files)
// ============================================================================

/**
 * Create multipart upload request
 */
export const CreateMultipartUploadRequestSchema = z.object({
  filename: z.string().min(1).max(255).openapi({
    description: 'Original filename',
    example: 'large-document.pdf',
  }),
  mimeType: z.string().min(1).openapi({
    description: 'MIME type of the file',
    example: 'application/pdf',
  }),
  fileSize: z.number().int().positive().openapi({
    description: 'Total file size in bytes',
  }),
  threadId: z.string().optional().openapi({
    description: 'Optional thread ID to associate with',
  }),
}).openapi('CreateMultipartUploadRequest');

/**
 * Create multipart upload response
 */
export const CreateMultipartUploadResponseSchema = createApiResponseSchema(
  z.object({
    uploadId: z.string().openapi({
      description: 'R2 multipart upload ID',
    }),
    key: z.string().openapi({
      description: 'R2 object key for this upload',
    }),
    attachmentId: z.string().openapi({
      description: 'Database attachment ID (for tracking)',
    }),
  }),
);

/**
 * Upload part request (body is raw binary)
 */
export const UploadPartParamsSchema = z.object({
  uploadId: z.string().openapi({
    param: { name: 'uploadId', in: 'query' },
    description: 'Multipart upload ID',
  }),
  partNumber: z.string().openapi({
    param: { name: 'partNumber', in: 'query' },
    description: 'Part number (1-based)',
  }),
}).openapi('UploadPartParams');

/**
 * Upload part response
 */
export const UploadPartResponseSchema = createApiResponseSchema(
  z.object({
    partNumber: z.number().int().positive().openapi({
      description: 'Part number that was uploaded',
    }),
    etag: z.string().openapi({
      description: 'ETag of the uploaded part (required for completion)',
    }),
  }),
);

/**
 * Complete multipart upload request
 */
export const CompleteMultipartUploadRequestSchema = z.object({
  parts: z.array(z.object({
    partNumber: z.number().int().positive(),
    etag: z.string(),
  })).openapi({
    description: 'Array of uploaded parts with their ETags',
  }),
}).openapi('CompleteMultipartUploadRequest');

/**
 * Complete multipart upload response
 */
export const CompleteMultipartUploadResponseSchema = createApiResponseSchema(UploadResponseSchema);

/**
 * Abort multipart upload (no request body needed)
 */
export const AbortMultipartUploadResponseSchema = createApiResponseSchema(
  z.object({
    uploadId: z.string(),
    aborted: z.boolean(),
  }),
);

// ============================================================================
// UPLOAD TICKET SCHEMAS (Presigned URL Pattern)
// ============================================================================

/**
 * Request upload ticket - first step of secure upload flow
 *
 * Client provides file metadata, server returns a time-limited ticket token.
 * This follows the S3 presigned URL pattern but uses HMAC-signed tickets.
 */
export const RequestUploadTicketSchema = z.object({
  filename: z.string().min(1).max(255).openapi({
    description: 'Original filename',
    example: 'document.pdf',
  }),
  mimeType: z.string().min(1).openapi({
    description: 'MIME type of the file',
    example: 'application/pdf',
  }),
  fileSize: z.number().int().positive().openapi({
    description: 'File size in bytes',
    example: 1024000,
  }),
}).openapi('RequestUploadTicketRequest');

/**
 * Upload ticket response - contains the signed token
 */
export const UploadTicketPayloadSchema = z.object({
  ticketId: z.string().openapi({
    description: 'Unique ticket identifier',
  }),
  token: z.string().openapi({
    description: 'Signed upload token - include this in the upload request',
  }),
  expiresAt: z.number().openapi({
    description: 'Token expiration timestamp (Unix ms)',
  }),
  uploadUrl: z.string().openapi({
    description: 'URL to upload the file to',
  }),
}).openapi('UploadTicketPayload');

export const UploadTicketResponseSchema = createApiResponseSchema(
  UploadTicketPayloadSchema,
);

/**
 * Upload with ticket - query params for ticket-based upload
 */
export const UploadWithTicketQuerySchema = z.object({
  token: z.string().min(1).openapi({
    param: { name: 'token', in: 'query' },
    description: 'Upload ticket token from requestUploadTicket',
  }),
}).openapi('UploadWithTicketQuery');

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type UploadResponse = z.infer<typeof UploadResponseSchema>;
export type ListUploadsQuery = z.infer<typeof ListUploadsQuerySchema>;
export type GetDownloadUrlPayload = z.infer<typeof GetDownloadUrlPayloadSchema>;
export type CreateMultipartUploadRequest = z.infer<typeof CreateMultipartUploadRequestSchema>;
export type UploadPartParams = z.infer<typeof UploadPartParamsSchema>;
export type CompleteMultipartUploadRequest = z.infer<typeof CompleteMultipartUploadRequestSchema>;
export type RequestUploadTicket = z.infer<typeof RequestUploadTicketSchema>;
export type UploadTicketPayload = z.infer<typeof UploadTicketPayloadSchema>;
export type UploadWithTicketQuery = z.infer<typeof UploadWithTicketQuerySchema>;

// NOTE: ChatAttachmentStatus type is exported from @/api/core/enums
// Import directly from @/api/core/enums for single source of truth
// Example: import { type ChatAttachmentStatus } from '@/api/core/enums';

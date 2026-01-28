/**
 * Upload Routes
 *
 * File upload endpoints for chat attachments
 * Supports both single-request uploads and multipart uploads for large files
 *
 * Following R2 patterns from Context7 Cloudflare docs
 */

import { createRoute, z } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { IdParamSchema, StandardApiResponses } from '@/core';

import {
  AbortMultipartUploadResponseSchema,
  CompleteMultipartUploadRequestSchema,
  CompleteMultipartUploadResponseSchema,
  CreateMultipartUploadRequestSchema,
  CreateMultipartUploadResponseSchema,
  DeleteUploadResponseSchema,
  GetDownloadUrlResponseSchema,
  GetUploadResponseSchema,
  ListUploadsQuerySchema,
  ListUploadsResponseSchema,
  RequestUploadTicketSchema,
  UpdateUploadRequestSchema,
  UploadFileResponseSchema,
  UploadPartParamsSchema,
  UploadPartResponseSchema,
  UploadTicketResponseSchema,
  UploadWithTicketQuerySchema,
} from './schema';

// ============================================================================
// UPLOAD LIST/GET ROUTES
// ============================================================================

/**
 * List user uploads
 */
export const listUploadsRoute = createRoute({
  description: 'List all uploads for the authenticated user with optional filtering',
  method: 'get',
  path: '/uploads',
  request: {
    query: ListUploadsQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: ListUploadsResponseSchema,
        },
      },
      description: 'Uploads retrieved successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'List uploads',
  tags: ['Uploads'],
});

/**
 * Get upload by ID
 */
export const getUploadRoute = createRoute({
  description: 'Get upload details by ID',
  method: 'get',
  path: '/uploads/{id}',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: GetUploadResponseSchema,
        },
      },
      description: 'Upload retrieved successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Get upload',
  tags: ['Uploads'],
});

/**
 * Get download URL for an upload
 * Returns a signed URL that can be used to download/preview the file
 */
export const getDownloadUrlRoute = createRoute({
  description: 'Get a signed URL for downloading the file. The URL is time-limited and secure.',
  method: 'get',
  path: '/uploads/{id}/download-url',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: GetDownloadUrlResponseSchema,
        },
      },
      description: 'Signed download URL retrieved successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Get download URL',
  tags: ['Uploads'],
});

/**
 * Update upload metadata
 */
export const updateUploadRoute = createRoute({
  description: 'Update upload metadata',
  method: 'patch',
  path: '/uploads/{id}',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateUploadRequestSchema,
        },
      },
    },
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: GetUploadResponseSchema,
        },
      },
      description: 'Upload updated successfully',
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Update upload',
  tags: ['Uploads'],
});

/**
 * Delete upload
 */
export const deleteUploadRoute = createRoute({
  description: 'Delete an upload and its R2 file',
  method: 'delete',
  path: '/uploads/{id}',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: DeleteUploadResponseSchema,
        },
      },
      description: 'Upload deleted successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Delete upload',
  tags: ['Uploads'],
});

// ============================================================================
// SECURE UPLOAD TICKET ROUTES (Presigned URL Pattern)
// ============================================================================

/**
 * Request upload ticket (Step 1 of secure upload)
 *
 * Returns a time-limited, signed token that must be included in the actual upload.
 * This follows the S3 presigned URL pattern for secure uploads:
 * 1. Client requests ticket with file metadata
 * 2. Server returns signed token (valid for 5 minutes)
 * 3. Client uploads file with token to /uploads/ticket endpoint
 * 4. Server validates token before accepting file
 */
export const requestUploadTicketRoute = createRoute({
  description: `
Request a secure upload ticket (similar to S3 presigned URLs).

**Security features:**
- Token expires in 5 minutes
- Token is cryptographically signed
- One-time use only
- User-bound (only requesting user can use it)

**Flow:**
1. Call this endpoint with file metadata
2. Receive signed token and upload URL
3. Upload file to the provided URL with token
`,
  method: 'post',
  path: '/uploads/ticket',
  request: {
    body: {
      content: {
        'application/json': {
          schema: RequestUploadTicketSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: UploadTicketResponseSchema,
        },
      },
      description: 'Upload ticket created successfully',
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Request upload ticket',
  tags: ['Uploads'],
});

/**
 * Upload file with ticket (Step 2 of secure upload)
 *
 * Accepts file upload with valid ticket token.
 * Token is validated before file is accepted.
 */
export const uploadWithTicketRoute = createRoute({
  description: `
Upload a file using a valid upload ticket.

**Required:**
- Valid ticket token in query parameter
- File in multipart/form-data body

**Security:**
- Token is validated before file is accepted
- Token can only be used once
- Token must not be expired
- User must match token owner
`,
  method: 'post',
  path: '/uploads/ticket/upload',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: {
            properties: {
              file: {
                description: 'File to upload',
                format: 'binary',
                type: 'string',
              },
            },
            required: ['file'],
            type: 'object',
          },
        },
      },
      required: true,
    },
    query: UploadWithTicketQuerySchema,
  },
  responses: {
    [HttpStatusCodes.CREATED]: {
      content: {
        'application/json': {
          schema: UploadFileResponseSchema,
        },
      },
      description: 'File uploaded successfully',
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Upload file with ticket',
  tags: ['Uploads'],
});

// ============================================================================
// MULTIPART UPLOAD ROUTES (for large files)
// ============================================================================

/**
 * Create multipart upload
 * Initiates a multipart upload for files > 100MB
 */
export const createMultipartUploadRoute = createRoute({
  description: `
Initiate a multipart upload for large files.

**Use this for files > 100MB**

Flow:
1. POST /uploads/multipart - Get uploadId
2. PUT /uploads/multipart/:id/parts?partNumber=N - Upload each part (min 5MB, except last)
3. POST /uploads/multipart/:id/complete - Complete with part ETags
  `,
  method: 'post',
  path: '/uploads/multipart',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateMultipartUploadRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.CREATED]: {
      content: {
        'application/json': {
          schema: CreateMultipartUploadResponseSchema,
        },
      },
      description: 'Multipart upload initiated',
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Create multipart upload',
  tags: ['Uploads', 'Multipart'],
});

/**
 * Upload part
 * Upload a single part of a multipart upload
 */
export const uploadPartRoute = createRoute({
  description: `
Upload a single part of a multipart upload.

**Requirements:**
- Part size: minimum 5MB (except last part)
- Part number: 1-10000
- Content-Type: application/octet-stream
  `,
  method: 'put',
  path: '/uploads/multipart/{id}/parts',
  request: {
    body: {
      content: {
        'application/octet-stream': {
          schema: {
            format: 'binary',
            type: 'string',
          },
        },
      },
    },
    params: IdParamSchema,
    query: UploadPartParamsSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: UploadPartResponseSchema,
        },
      },
      description: 'Part uploaded successfully',
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Upload part',
  tags: ['Uploads', 'Multipart'],
});

/**
 * Complete multipart upload
 * Finalize the upload with all part ETags
 */
export const completeMultipartUploadRoute = createRoute({
  description: 'Complete a multipart upload by providing all part ETags',
  method: 'post',
  path: '/uploads/multipart/{id}/complete',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CompleteMultipartUploadRequestSchema,
        },
      },
    },
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: CompleteMultipartUploadResponseSchema,
        },
      },
      description: 'Multipart upload completed successfully',
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Complete multipart upload',
  tags: ['Uploads', 'Multipart'],
});

/**
 * Abort multipart upload
 * Cancel an in-progress multipart upload
 */
export const abortMultipartUploadRoute = createRoute({
  description: 'Cancel an in-progress multipart upload and clean up parts',
  method: 'delete',
  path: '/uploads/multipart/{id}',
  request: {
    params: IdParamSchema,
    query: UploadPartParamsSchema.pick({ uploadId: true }),
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: AbortMultipartUploadResponseSchema,
        },
      },
      description: 'Multipart upload aborted',
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Abort multipart upload',
  tags: ['Uploads', 'Multipart'],
});

// ============================================================================
// FILE DOWNLOAD ROUTE
// ============================================================================

/**
 * Download file
 * Serves the file content from R2/local storage
 * SECURITY: Requires session auth - users can only access their own files
 */
export const downloadUploadRoute = createRoute({
  description: 'Download the file content. Requires authentication - users can only access their own uploads.',
  method: 'get',
  path: '/uploads/{id}/download',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/octet-stream': {
          schema: {
            format: 'binary',
            type: 'string',
          },
        },
      },
      description: 'File content',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.FORBIDDEN,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Download file',
  tags: ['Uploads'],
});

// ============================================================================
// PUBLIC THREAD FILE DOWNLOAD ROUTE
// ============================================================================

/**
 * Download file from public thread
 * Authenticated endpoint for downloading files attached to publicly shared threads.
 *
 * Security layers:
 * 1. Session authentication required (no anonymous access)
 * 2. Thread must exist
 * 3. Thread must be public (isPublic=true)
 * 4. Thread must not be archived or deleted
 * 5. File must be attached to the specified thread
 * 6. Upload record must exist and be ready
 */
export const downloadPublicThreadFileRoute = createRoute({
  description: `
Download a file attached to a publicly shared thread.

**Security:**
- Requires session authentication (no anonymous access)
- File must be attached to a thread with isPublic=true
- Thread must not be archived or deleted
- Rate limited to 10 requests per minute per user
- All download attempts are audit logged
`,
  method: 'get',
  path: '/uploads/{id}/public-download',
  request: {
    params: IdParamSchema,
    query: z.object({
      threadId: z.string().min(1).openapi({
        description: 'ID of the public thread this file belongs to',
      }),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/octet-stream': {
          schema: { format: 'binary', type: 'string' },
        },
      },
      description: 'File content stream',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.FORBIDDEN,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.TOO_MANY_REQUESTS,
    ...StandardApiResponses.GONE,
  },
  summary: 'Download file from public thread',
  tags: ['Uploads'],
});

// ============================================================================
// ROUTE TYPE EXPORTS
// ============================================================================

export type ListUploadsRoute = typeof listUploadsRoute;
export type GetUploadRoute = typeof getUploadRoute;
export type GetDownloadUrlRoute = typeof getDownloadUrlRoute;
export type UpdateUploadRoute = typeof updateUploadRoute;
export type DeleteUploadRoute = typeof deleteUploadRoute;
export type DownloadUploadRoute = typeof downloadUploadRoute;
export type DownloadPublicThreadFileRoute = typeof downloadPublicThreadFileRoute;
export type RequestUploadTicketRoute = typeof requestUploadTicketRoute;
export type UploadWithTicketRoute = typeof uploadWithTicketRoute;
export type CreateMultipartUploadRoute = typeof createMultipartUploadRoute;
export type UploadPartRoute = typeof uploadPartRoute;
export type CompleteMultipartUploadRoute = typeof completeMultipartUploadRoute;
export type AbortMultipartUploadRoute = typeof abortMultipartUploadRoute;

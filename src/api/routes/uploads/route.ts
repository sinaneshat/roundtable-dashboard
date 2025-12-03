/**
 * Upload Routes
 *
 * File upload endpoints for chat attachments
 * Supports both single-request uploads and multipart uploads for large files
 *
 * Following R2 patterns from Context7 Cloudflare docs
 */

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { StandardApiResponses } from '@/api/core/response-schemas';
import { IdParamSchema } from '@/api/core/schemas';

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
  method: 'get',
  path: '/uploads',
  tags: ['Uploads'],
  summary: 'List uploads',
  description: 'List all uploads for the authenticated user with optional filtering',
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
});

/**
 * Get upload by ID
 */
export const getUploadRoute = createRoute({
  method: 'get',
  path: '/uploads/:id',
  tags: ['Uploads'],
  summary: 'Get upload',
  description: 'Get upload details by ID',
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
});

/**
 * Get download URL for an upload
 * Returns a signed URL that can be used to download/preview the file
 */
export const getDownloadUrlRoute = createRoute({
  method: 'get',
  path: '/uploads/:id/download-url',
  tags: ['Uploads'],
  summary: 'Get download URL',
  description: 'Get a signed URL for downloading the file. The URL is time-limited and secure.',
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
});

/**
 * Update upload metadata
 */
export const updateUploadRoute = createRoute({
  method: 'patch',
  path: '/uploads/:id',
  tags: ['Uploads'],
  summary: 'Update upload',
  description: 'Update upload metadata',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateUploadRequestSchema,
        },
      },
    },
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
});

/**
 * Delete upload
 */
export const deleteUploadRoute = createRoute({
  method: 'delete',
  path: '/uploads/:id',
  tags: ['Uploads'],
  summary: 'Delete upload',
  description: 'Delete an upload and its R2 file',
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
  method: 'post',
  path: '/uploads/ticket',
  tags: ['Uploads'],
  summary: 'Request upload ticket',
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
});

/**
 * Upload file with ticket (Step 2 of secure upload)
 *
 * Accepts file upload with valid ticket token.
 * Token is validated before file is accepted.
 */
export const uploadWithTicketRoute = createRoute({
  method: 'post',
  path: '/uploads/ticket/upload',
  tags: ['Uploads'],
  summary: 'Upload file with ticket',
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
  request: {
    query: UploadWithTicketQuerySchema,
    body: {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                format: 'binary',
                description: 'File to upload',
              },
            },
            required: ['file'],
          },
        },
      },
      required: true,
    },
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
});

// ============================================================================
// MULTIPART UPLOAD ROUTES (for large files)
// ============================================================================

/**
 * Create multipart upload
 * Initiates a multipart upload for files > 100MB
 */
export const createMultipartUploadRoute = createRoute({
  method: 'post',
  path: '/uploads/multipart',
  tags: ['Uploads', 'Multipart'],
  summary: 'Create multipart upload',
  description: `
Initiate a multipart upload for large files.

**Use this for files > 100MB**

Flow:
1. POST /uploads/multipart - Get uploadId
2. PUT /uploads/multipart/:id/parts?partNumber=N - Upload each part (min 5MB, except last)
3. POST /uploads/multipart/:id/complete - Complete with part ETags
  `,
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
});

/**
 * Upload part
 * Upload a single part of a multipart upload
 */
export const uploadPartRoute = createRoute({
  method: 'put',
  path: '/uploads/multipart/:id/parts',
  tags: ['Uploads', 'Multipart'],
  summary: 'Upload part',
  description: `
Upload a single part of a multipart upload.

**Requirements:**
- Part size: minimum 5MB (except last part)
- Part number: 1-10000
- Content-Type: application/octet-stream
  `,
  request: {
    params: IdParamSchema,
    query: UploadPartParamsSchema,
    body: {
      content: {
        'application/octet-stream': {
          schema: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
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
});

/**
 * Complete multipart upload
 * Finalize the upload with all part ETags
 */
export const completeMultipartUploadRoute = createRoute({
  method: 'post',
  path: '/uploads/multipart/:id/complete',
  tags: ['Uploads', 'Multipart'],
  summary: 'Complete multipart upload',
  description: 'Complete a multipart upload by providing all part ETags',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: CompleteMultipartUploadRequestSchema,
        },
      },
    },
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
});

/**
 * Abort multipart upload
 * Cancel an in-progress multipart upload
 */
export const abortMultipartUploadRoute = createRoute({
  method: 'delete',
  path: '/uploads/multipart/:id',
  tags: ['Uploads', 'Multipart'],
  summary: 'Abort multipart upload',
  description: 'Cancel an in-progress multipart upload and clean up parts',
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
});

// ============================================================================
// FILE DOWNLOAD ROUTE
// ============================================================================

/**
 * Download file
 * Serves the file content from R2/local storage
 */
export const downloadUploadRoute = createRoute({
  method: 'get',
  path: '/uploads/:id/download',
  tags: ['Uploads'],
  summary: 'Download file',
  description: 'Download the file content. Returns the file with proper content-type header.',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/octet-stream': {
          schema: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      description: 'File content',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
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
export type RequestUploadTicketRoute = typeof requestUploadTicketRoute;
export type UploadWithTicketRoute = typeof uploadWithTicketRoute;
export type CreateMultipartUploadRoute = typeof createMultipartUploadRoute;
export type UploadPartRoute = typeof uploadPartRoute;
export type CompleteMultipartUploadRoute = typeof completeMultipartUploadRoute;
export type AbortMultipartUploadRoute = typeof abortMultipartUploadRoute;

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
  GetUploadResponseSchema,
  ListUploadsQuerySchema,
  ListUploadsResponseSchema,
  UpdateUploadRequestSchema,
  UploadFileResponseSchema,
  UploadPartParamsSchema,
  UploadPartResponseSchema,
} from './schema';

// ============================================================================
// SINGLE-REQUEST UPLOAD ROUTES
// ============================================================================

/**
 * Upload file (single request)
 * For files under 100MB - simpler API
 */
export const uploadFileRoute = createRoute({
  method: 'post',
  path: '/uploads',
  tags: ['Uploads'],
  summary: 'Upload file',
  description: `
Upload a file (multipart/form-data).

**Supported file types:**
- Images: PNG, JPEG, GIF, WebP
- Documents: PDF, Word, Excel, PowerPoint
- Text: Plain text, Markdown, CSV, JSON
- Code: JavaScript, TypeScript, Python, etc.

**Size limit:** 100MB per file (use multipart upload for larger files)
  `,
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                format: 'binary',
              },
              description: {
                type: 'string',
                description: 'Optional description for AI context',
              },
            },
            required: ['file'],
          },
        },
      },
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
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

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

export type UploadFileRoute = typeof uploadFileRoute;
export type ListUploadsRoute = typeof listUploadsRoute;
export type GetUploadRoute = typeof getUploadRoute;
export type UpdateUploadRoute = typeof updateUploadRoute;
export type DeleteUploadRoute = typeof deleteUploadRoute;
export type DownloadUploadRoute = typeof downloadUploadRoute;
export type CreateMultipartUploadRoute = typeof createMultipartUploadRoute;
export type UploadPartRoute = typeof uploadPartRoute;
export type CompleteMultipartUploadRoute = typeof completeMultipartUploadRoute;
export type AbortMultipartUploadRoute = typeof abortMultipartUploadRoute;

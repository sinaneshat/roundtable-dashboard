/**
 * Uploads Service - File Attachment API
 *
 * 100% type-safe RPC service for file upload operations
 * All types automatically inferred from backend Hono routes
 *
 * Supports:
 * - Single-request uploads (files < 100MB)
 * - Multipart uploads (large files > 100MB)
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

// Single-request upload types
export type UploadAttachmentRequest = InferRequestType<
  ApiClientType['uploads']['$post']
>;

export type UploadAttachmentResponse = InferResponseType<
  ApiClientType['uploads']['$post']
>;

export type ListAttachmentsRequest = InferRequestType<
  ApiClientType['uploads']['$get']
>;

export type ListAttachmentsResponse = InferResponseType<
  ApiClientType['uploads']['$get']
>;

export type GetAttachmentRequest = InferRequestType<
  ApiClientType['uploads'][':id']['$get']
>;

export type GetAttachmentResponse = InferResponseType<
  ApiClientType['uploads'][':id']['$get']
>;

export type UpdateAttachmentRequest = InferRequestType<
  ApiClientType['uploads'][':id']['$patch']
>;

export type UpdateAttachmentResponse = InferResponseType<
  ApiClientType['uploads'][':id']['$patch']
>;

export type DeleteAttachmentRequest = InferRequestType<
  ApiClientType['uploads'][':id']['$delete']
>;

export type DeleteAttachmentResponse = InferResponseType<
  ApiClientType['uploads'][':id']['$delete']
>;

// Multipart upload types
export type CreateMultipartUploadRequest = InferRequestType<
  ApiClientType['uploads']['multipart']['$post']
>;

export type CreateMultipartUploadResponse = InferResponseType<
  ApiClientType['uploads']['multipart']['$post']
>;

export type UploadPartRequest = InferRequestType<
  ApiClientType['uploads']['multipart'][':id']['parts']['$put']
>;

export type UploadPartResponse = InferResponseType<
  ApiClientType['uploads']['multipart'][':id']['parts']['$put']
>;

export type CompleteMultipartUploadRequest = InferRequestType<
  ApiClientType['uploads']['multipart'][':id']['complete']['$post']
>;

export type CompleteMultipartUploadResponse = InferResponseType<
  ApiClientType['uploads']['multipart'][':id']['complete']['$post']
>;

export type AbortMultipartUploadRequest = InferRequestType<
  ApiClientType['uploads']['multipart'][':id']['$delete']
>;

export type AbortMultipartUploadResponse = InferResponseType<
  ApiClientType['uploads']['multipart'][':id']['$delete']
>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Type guard to check if value is an API error response
 */
function isApiErrorResponse(value: unknown): value is { error: { message: string } } {
  return (
    typeof value === 'object'
    && value !== null
    && 'error' in value
    && typeof (value as { error: unknown }).error === 'object'
    && (value as { error: unknown }).error !== null
    && 'message' in (value as { error: { message: unknown } }).error
    && typeof (value as { error: { message: unknown } }).error.message === 'string'
  );
}

/**
 * Extract error message from API response using type guard
 */
function extractErrorMessage(data: unknown): string {
  if (isApiErrorResponse(data)) {
    return data.error.message;
  }
  return 'Upload part failed';
}

// ============================================================================
// Service Functions - Single-request uploads
// ============================================================================

/**
 * Upload request type for the service
 * Hono RPC client expects `{ form: { file: File, description?: string } }`
 */
export type UploadAttachmentServiceInput = {
  form: {
    file: File;
    description?: string;
  };
};

/**
 * Upload a file attachment (single request)
 * Protected endpoint - requires authentication
 *
 * For files < 100MB. Uses multipart/form-data via Hono RPC client
 *
 * Following Hono RPC best practices from Context7 docs:
 * - Server uses zValidator('form', schema) or parseBody()
 * - Client passes { form: { file: File } }
 */
export async function uploadAttachmentService(data: UploadAttachmentServiceInput) {
  const client = await createApiClient();

  // Hono RPC client properly serializes this to multipart/form-data
  const response = await client.uploads.$post({
    form: data.form,
  });

  const json = await response.json();
  return json as UploadAttachmentResponse;
}

/**
 * List attachments with cursor pagination
 * Protected endpoint - requires authentication
 *
 * Supports filtering by threadId and status
 */
export async function listAttachmentsService(args?: ListAttachmentsRequest) {
  const client = await createApiClient();
  const params: ListAttachmentsRequest = {
    query: args?.query ?? {},
  };
  return parseResponse(client.uploads.$get(params));
}

/**
 * Get a specific attachment by ID
 * Protected endpoint - requires authentication
 */
export async function getAttachmentService(data: GetAttachmentRequest) {
  const client = await createApiClient();
  const params: GetAttachmentRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.uploads[':id'].$get(params));
}

/**
 * Update attachment metadata or associations
 * Protected endpoint - requires authentication
 */
export async function updateAttachmentService(data: UpdateAttachmentRequest) {
  const client = await createApiClient();
  const params: UpdateAttachmentRequest = {
    param: data.param ?? { id: '' },
    json: data.json ?? {},
  };
  return parseResponse(client.uploads[':id'].$patch(params));
}

/**
 * Delete an attachment
 * Protected endpoint - requires authentication
 */
export async function deleteAttachmentService(data: DeleteAttachmentRequest) {
  const client = await createApiClient();
  const params: DeleteAttachmentRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.uploads[':id'].$delete(params));
}

// ============================================================================
// Service Functions - Multipart uploads (for large files)
// ============================================================================

/**
 * Create a multipart upload
 * Protected endpoint - requires authentication
 *
 * Initiates a multipart upload for files > 100MB
 */
export async function createMultipartUploadService(data: CreateMultipartUploadRequest) {
  const client = await createApiClient();
  const params: CreateMultipartUploadRequest = {
    json: data.json ?? {
      filename: '',
      mimeType: '',
      fileSize: 0,
    },
  };
  return parseResponse(client.uploads.multipart.$post(params));
}

/**
 * Extended type for upload part with binary body
 * Hono client doesn't support application/octet-stream content types,
 * so we define a clean type for the native fetch implementation
 */
export type UploadPartRequestWithBody = {
  param: { id: string };
  query: { uploadId: string; partNumber: string };
  body: Blob;
};

/**
 * Get base API URL - mirrors the pattern from @/api/client for consistency
 */
function getApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (baseUrl)
    return baseUrl;

  if (typeof window === 'undefined') {
    if (process.env.NEXT_PUBLIC_APP_URL) {
      return `${process.env.NEXT_PUBLIC_APP_URL}/api/v1`;
    }
    return process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000/api/v1'
      : 'https://app.roundtable.now/api/v1';
  }

  return `${window.location.origin}/api/v1`;
}

/**
 * Upload a part of a multipart upload
 * Protected endpoint - requires authentication
 *
 * Uses native fetch because Hono RPC client doesn't support
 * application/octet-stream content type for binary uploads.
 * This follows Cloudflare R2 best practices for multipart uploads.
 *
 * @param data - Request with attachment ID, uploadId, partNumber, and binary part data
 */
export async function uploadPartService(
  data: UploadPartRequestWithBody,
): Promise<UploadPartResponse> {
  const { param, query, body } = data;

  const url = new URL(`${getApiBaseUrl()}/uploads/multipart/${param.id}/parts`);
  url.searchParams.set('uploadId', query.uploadId);
  url.searchParams.set('partNumber', query.partNumber);

  const response = await fetch(url.toString(), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Accept': 'application/json',
    },
    body,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMessage = extractErrorMessage(errorData);
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Complete a multipart upload
 * Protected endpoint - requires authentication
 *
 * @param data - Request with attachment ID and array of part ETags
 */
export async function completeMultipartUploadService(data: CompleteMultipartUploadRequest) {
  const client = await createApiClient();
  const params: CompleteMultipartUploadRequest = {
    param: data.param ?? { id: '' },
    json: data.json ?? { parts: [] },
  };
  return parseResponse(client.uploads.multipart[':id'].complete.$post(params));
}

/**
 * Abort a multipart upload
 * Protected endpoint - requires authentication
 *
 * Cancels the upload and cleans up uploaded parts
 */
export async function abortMultipartUploadService(data: AbortMultipartUploadRequest) {
  const client = await createApiClient();
  return parseResponse(client.uploads.multipart[':id'].$delete(data));
}

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
import { getApiBaseUrl } from '@/lib/config/base-urls';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

// Upload listing types
export type ListAttachmentsRequest = InferRequestType<
  ApiClientType['uploads']['$get']
>;

export type ListAttachmentsResponse = InferResponseType<
  ApiClientType['uploads']['$get']
>;

// Download URL types
export type GetDownloadUrlRequest = InferRequestType<
  ApiClientType['uploads'][':id']['download-url']['$get']
>;

export type GetDownloadUrlResponse = InferResponseType<
  ApiClientType['uploads'][':id']['download-url']['$get']
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
// Service Functions - Upload Listing
// ============================================================================

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

/**
 * Get a signed download URL for an attachment
 * Protected endpoint - requires authentication
 *
 * Returns a time-limited, signed URL that can be used to download/preview the file
 */
export async function getDownloadUrlService(data: GetDownloadUrlRequest) {
  const client = await createApiClient();
  const params: GetDownloadUrlRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.uploads[':id']['download-url'].$get(params));
}

// ============================================================================
// Ticket-Based Secure Uploads (S3 Presigned URL Pattern)
// ============================================================================

// Ticket-based upload types
export type RequestUploadTicketRequest = InferRequestType<
  ApiClientType['uploads']['ticket']['$post']
>;

export type RequestUploadTicketResponse = InferResponseType<
  ApiClientType['uploads']['ticket']['$post']
>;

export type UploadWithTicketRequest = InferRequestType<
  ApiClientType['uploads']['ticket']['upload']['$post']
>;

export type UploadWithTicketResponse = InferResponseType<
  ApiClientType['uploads']['ticket']['upload']['$post']
>;

/**
 * Request an upload ticket (Step 1 of secure upload)
 * Protected endpoint - requires authentication
 *
 * Returns a time-limited, signed token that must be used to upload the file.
 * This follows the S3 presigned URL pattern for secure uploads:
 * 1. Request ticket with file metadata
 * 2. Receive signed token and upload URL
 * 3. Upload file to the provided URL with token
 *
 * ✅ TYPE-SAFE: Uses parseResponse for proper type inference from Hono client
 */
export async function requestUploadTicketService(data: RequestUploadTicketRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure json property exists
  const params: RequestUploadTicketRequest = {
    json: data.json ?? {},
  };
  return parseResponse(client.uploads.ticket.$post(params));
}

/**
 * Upload request type for ticket-based service
 * Similar to UploadAttachmentServiceInput but includes the token
 */
export type UploadWithTicketServiceInput = {
  token: string;
  form: {
    file: File;
  };
};

/**
 * Upload a file with a valid ticket (Step 2 of secure upload)
 * Protected endpoint - requires authentication
 *
 * The token from requestUploadTicketService must be included.
 * Token is validated before file is accepted.
 *
 * Note: Uses native fetch because Hono RPC client doesn't properly
 * infer types for multipart/form-data with query parameters.
 */
export async function uploadWithTicketService(data: UploadWithTicketServiceInput) {
  const baseUrl = getApiUrl();
  const url = new URL(`${baseUrl}/uploads/ticket/upload`);
  url.searchParams.set('token', data.token);

  const formData = new FormData();
  formData.append('file', data.form.file);

  const response = await fetch(url.toString(), {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  return response.json() as Promise<UploadWithTicketResponse>;
}

/**
 * Secure upload service (combines ticket request + upload)
 * Convenience function that handles the full secure upload flow
 *
 * @param file - File to upload
 */
export async function secureUploadService(file: File) {
  // Step 1: Request upload ticket
  const ticketResponse = await requestUploadTicketService({
    json: {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
    },
  });

  if (!ticketResponse.success || !ticketResponse.data) {
    throw new Error('Failed to request upload ticket');
  }

  // Step 2: Upload file with token
  return uploadWithTicketService({
    token: ticketResponse.data.token,
    form: { file },
  });
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
 * Get API base URL - uses centralized config
 * Client-side: uses same origin for cookie handling
 * Server-side: uses centralized URL config
 */
function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/v1`;
  }
  return getApiBaseUrl();
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
export async function uploadPartService(data: UploadPartRequestWithBody) {
  const { param, query, body } = data;

  const baseUrl = getApiUrl();
  const url = new URL(`${baseUrl}/uploads/multipart/${param.id}/parts`);
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
    throw new Error(`Upload part failed: ${response.statusText}`);
  }

  return response.json() as Promise<UploadPartResponse>;
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

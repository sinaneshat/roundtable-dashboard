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
import { authenticatedFetch, createApiClient } from '@/api/client';

// ============================================================================
// Type-Safe JSON Response Parsing
// ============================================================================

/**
 * Type guard for API success response structure
 */
function isUploadSuccessResponse(
  json: unknown,
): json is Extract<UploadWithTicketResponse, { success: true }> {
  if (
    typeof json !== 'object'
    || json === null
    || !('success' in json)
    || json.success !== true
    || !('data' in json)
  ) {
    return false;
  }

  const { data } = json;
  return (
    typeof data === 'object'
    && data !== null
    && 'id' in data
    && typeof data.id === 'string'
    && 'filename' in data
    && typeof data.filename === 'string'
  );
}

/**
 * Type guard for upload part success response
 */
function isUploadPartSuccessResponse(
  json: unknown,
): json is Extract<UploadPartResponse, { success: true }> {
  if (
    typeof json !== 'object'
    || json === null
    || !('success' in json)
    || json.success !== true
    || !('data' in json)
  ) {
    return false;
  }

  const { data } = json;
  return (
    typeof data === 'object'
    && data !== null
    && 'partNumber' in data
    && typeof data.partNumber === 'number'
    && 'etag' in data
    && typeof data.etag === 'string'
  );
}

// ============================================================================
// Type Inference - Attachment Operations
// ============================================================================

export type ListAttachmentsRequest = InferRequestType<
  ApiClientType['uploads']['$get']
>;

export type ListAttachmentsResponse = InferResponseType<
  ApiClientType['uploads']['$get']
>;

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

// ============================================================================
// Type Inference - Multipart Upload Operations
// ============================================================================

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
// Type Inference - Ticket-Based Upload Operations
// ============================================================================

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
 * Upload part service input type
 */
export type UploadPartServiceInput = {
  param: { id: string };
  query: { uploadId: string; partNumber: string };
  body: Blob;
};

// ============================================================================
// Service Functions - Attachment Operations
// ============================================================================

/**
 * List attachments with cursor pagination
 * Protected endpoint - requires authentication
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
 */
export async function getDownloadUrlService(data: GetDownloadUrlRequest) {
  const client = await createApiClient();
  const params: GetDownloadUrlRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.uploads[':id']['download-url'].$get(params));
}

// ============================================================================
// Service Functions - Ticket-Based Secure Uploads
// ============================================================================

/**
 * Request an upload ticket (Step 1 of secure upload)
 * Protected endpoint - requires authentication
 * @param data - Request payload with filename, mimeType, fileSize
 * @param signal - Optional AbortSignal to cancel the request
 */
export async function requestUploadTicketService(
  data: RequestUploadTicketRequest,
  signal?: AbortSignal,
): Promise<RequestUploadTicketResponse> {
  const response = await authenticatedFetch('/uploads/ticket', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data.json ?? {}),
    signal,
  });

  const json: unknown = await response.json();

  // Type guard for ticket response
  if (
    typeof json === 'object'
    && json !== null
    && 'success' in json
    && json.success === true
    && 'data' in json
    && typeof json.data === 'object'
    && json.data !== null
    && 'token' in json.data
    && typeof json.data.token === 'string'
  ) {
    return json as RequestUploadTicketResponse;
  }

  throw new Error('Invalid upload ticket response structure');
}

/**
 * Upload a file with a valid ticket (Step 2 of secure upload)
 * Protected endpoint - requires authentication
 *
 * NOTE: Uses authenticatedFetch instead of Hono RPC for binary uploads
 */
export async function uploadWithTicketService(
  data: { query: { token: string }; form: { file: File } },
  signal?: AbortSignal,
): Promise<UploadWithTicketResponse> {
  const formData = new FormData();
  formData.append('file', data.form.file);

  const response = await authenticatedFetch('/uploads/ticket/upload', {
    method: 'POST',
    body: formData,
    searchParams: { token: data.query.token },
    signal,
  });

  const json: unknown = await response.json();
  if (!isUploadSuccessResponse(json)) {
    throw new Error('Invalid upload response structure');
  }
  return json;
}

/**
 * Secure upload service (combines ticket request + upload)
 * Convenience function that handles the full secure upload flow
 * @param file - File to upload
 * @param signal - Optional AbortSignal to cancel the upload
 */
export async function secureUploadService(file: File, signal?: AbortSignal) {
  // Check if already aborted before starting
  if (signal?.aborted) {
    throw new DOMException('Upload cancelled', 'AbortError');
  }

  const ticketResponse = await requestUploadTicketService({
    json: {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
    },
  }, signal);

  if (!ticketResponse.success || !ticketResponse.data) {
    throw new Error('Failed to request upload ticket');
  }

  // Check if aborted after ticket request
  if (signal?.aborted) {
    throw new DOMException('Upload cancelled', 'AbortError');
  }

  return uploadWithTicketService({
    query: { token: ticketResponse.data.token },
    form: { file },
  }, signal);
}

// ============================================================================
// Service Functions - Multipart Uploads
// ============================================================================

/**
 * Create a multipart upload
 * Protected endpoint - requires authentication
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
 * Upload a part of a multipart upload
 * Protected endpoint - requires authentication
 *
 * NOTE: Uses authenticatedFetch instead of Hono RPC for binary uploads
 * @param data - Upload part parameters
 * @param signal - Optional AbortSignal to cancel the upload
 */
export async function uploadPartService(
  data: UploadPartServiceInput,
  signal?: AbortSignal,
): Promise<UploadPartResponse> {
  const response = await authenticatedFetch(`/uploads/multipart/${data.param.id}/parts`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Accept': 'application/json',
    },
    body: data.body,
    searchParams: {
      uploadId: data.query.uploadId,
      partNumber: data.query.partNumber,
    },
    signal,
  });

  const json: unknown = await response.json();
  if (!isUploadPartSuccessResponse(json)) {
    throw new Error('Invalid upload part response structure');
  }
  return json;
}

/**
 * Complete a multipart upload
 * Protected endpoint - requires authentication
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
 */
export async function abortMultipartUploadService(data: AbortMultipartUploadRequest) {
  const client = await createApiClient();
  return parseResponse(client.uploads.multipart[':id'].$delete(data));
}

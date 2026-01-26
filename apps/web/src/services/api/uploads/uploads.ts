/**
 * Uploads Service - File Attachment API
 *
 * 100% type-safe RPC service for file upload operations
 * All types automatically inferred from backend Hono routes via InferResponseType
 *
 * Supports:
 * - Single-request uploads (files < 100MB)
 * - Multipart uploads (large files > 100MB)
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { authenticatedFetch, createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference - Attachment Operations
// ============================================================================

type ListAttachmentsEndpoint = ApiClientType['upload']['uploads']['$get'];
export type ListAttachmentsResponse = InferResponseType<ListAttachmentsEndpoint, 200>;
export type ListAttachmentsRequest = InferRequestType<ListAttachmentsEndpoint>;

type GetDownloadUrlEndpoint = ApiClientType['upload']['uploads'][':id']['download-url']['$get'];
export type GetDownloadUrlResponse = InferResponseType<GetDownloadUrlEndpoint, 200>;
export type GetDownloadUrlRequest = InferRequestType<GetDownloadUrlEndpoint>;

type GetAttachmentEndpoint = ApiClientType['upload']['uploads'][':id']['$get'];
export type GetAttachmentResponse = InferResponseType<GetAttachmentEndpoint, 200>;
export type GetAttachmentRequest = InferRequestType<GetAttachmentEndpoint>;

type UpdateAttachmentEndpoint = ApiClientType['upload']['uploads'][':id']['$patch'];
export type UpdateAttachmentResponse = InferResponseType<UpdateAttachmentEndpoint, 200>;
export type UpdateAttachmentRequest = InferRequestType<UpdateAttachmentEndpoint>;

type DeleteAttachmentEndpoint = ApiClientType['upload']['uploads'][':id']['$delete'];
export type DeleteAttachmentResponse = InferResponseType<DeleteAttachmentEndpoint, 200>;
export type DeleteAttachmentRequest = InferRequestType<DeleteAttachmentEndpoint>;

// ============================================================================
// Type Inference - Multipart Upload Operations
// ============================================================================

type CreateMultipartUploadEndpoint = ApiClientType['upload']['uploads']['multipart']['$post'];
export type CreateMultipartUploadResponse = InferResponseType<CreateMultipartUploadEndpoint, 200>;
export type CreateMultipartUploadRequest = InferRequestType<CreateMultipartUploadEndpoint>;

type CompleteMultipartUploadEndpoint = ApiClientType['upload']['uploads']['multipart'][':id']['complete']['$post'];
export type CompleteMultipartUploadResponse = InferResponseType<CompleteMultipartUploadEndpoint, 200>;
export type CompleteMultipartUploadRequest = InferRequestType<CompleteMultipartUploadEndpoint>;

type AbortMultipartUploadEndpoint = ApiClientType['upload']['uploads']['multipart'][':id']['$delete'];
export type AbortMultipartUploadResponse = InferResponseType<AbortMultipartUploadEndpoint, 200>;
export type AbortMultipartUploadRequest = InferRequestType<AbortMultipartUploadEndpoint>;

// ============================================================================
// Type Inference - Ticket-Based Upload Operations
// ============================================================================

/**
 * Request upload ticket types
 *
 * NOTE: Cannot use RPC type inference due to path conflict:
 * - /uploads/ticket (POST) conflicts with /uploads/ticket/upload (POST)
 * - Hono RPC can't handle both an endpoint and a parent path at the same segment
 * - Types manually defined based on API schema (RequestUploadTicketSchema, UploadTicketResponseSchema)
 */
export type RequestUploadTicketRequest = {
  json: {
    filename: string;
    mimeType: string;
    fileSize: number;
  };
};

export type RequestUploadTicketResponse = {
  success: true;
  data: {
    ticketId: string;
    token: string;
    expiresAt: number;
    uploadUrl: string;
  };
} | {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

/**
 * Upload with ticket response
 *
 * NOTE: Cannot use RPC type inference due to path conflict:
 * - /uploads/ticket (POST) conflicts with /uploads/ticket/upload (POST)
 * - Hono RPC can't handle both an endpoint and a parent path at the same segment
 * - Response structure manually defined based on API schema (UploadFileResponseSchema)
 */
export type UploadWithTicketResponse = {
  success: true;
  data: {
    id: string;
    filename: string;
    mimeType: string;
    fileSize: number;
    uploadedAt: string;
  };
} | {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

/**
 * Upload part response
 *
 * NOTE: Cannot use RPC type inference due to path conflict:
 * - /uploads/multipart/:id (DELETE) conflicts with /uploads/multipart/:id/parts (PUT)
 * - Hono RPC can't handle both an endpoint and a parent path at the same segment
 * - Response structure manually defined based on API schema (UploadPartResponseSchema)
 */
export type UploadPartResponse = {
  success: true;
  data: {
    partNumber: number;
    etag: string;
  };
} | {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

// ============================================================================
// Service Function Input Types - For authenticatedFetch helpers
// ============================================================================

/**
 * Input for uploadWithTicketService
 * This is a service-layer API type (not a backend API type)
 * Uses authenticatedFetch instead of RPC client for multipart/form-data
 */
export type UploadWithTicketServiceInput = {
  query: { token: string };
  form: { file: File };
};

/**
 * Input for uploadPartService
 * This is a service-layer API type (not a backend API type)
 * Uses authenticatedFetch instead of RPC client for binary uploads
 */
export type UploadPartServiceInput = {
  param: { id: string };
  query: { uploadId: string; partNumber: string };
  body: Blob;
};

// ============================================================================
// Type Guards - Helper functions for authenticatedFetch responses
// ============================================================================

/**
 * Type guard for API success response structure
 * Used when authenticatedFetch is required instead of RPC client (binary uploads)
 */
function isSuccessResponse<T extends { success: boolean }>(
  json: unknown,
): json is Extract<T, { success: true }> {
  return (
    typeof json === 'object'
    && json !== null
    && 'success' in json
    && json.success === true
    && 'data' in json
  );
}

// ============================================================================
// Service Functions - Attachment Operations
// ============================================================================

/**
 * List attachments with cursor pagination
 * Protected endpoint - requires authentication
 */
export async function listAttachmentsService(data?: ListAttachmentsRequest) {
  const client = createApiClient();
  return parseResponse(client.upload.uploads.$get(data ?? { query: {} }));
}

/**
 * Get a specific attachment by ID
 * Protected endpoint - requires authentication
 */
export async function getAttachmentService(data: GetAttachmentRequest) {
  const client = createApiClient();
  return parseResponse(client.upload.uploads[':id'].$get(data));
}

/**
 * Update attachment metadata or associations
 * Protected endpoint - requires authentication
 */
export async function updateAttachmentService(data: UpdateAttachmentRequest) {
  const client = createApiClient();
  return parseResponse(client.upload.uploads[':id'].$patch(data));
}

/**
 * Delete an attachment
 * Protected endpoint - requires authentication
 */
export async function deleteAttachmentService(data: DeleteAttachmentRequest) {
  const client = createApiClient();
  return parseResponse(client.upload.uploads[':id'].$delete(data));
}

/**
 * Get a signed download URL for an attachment
 * Protected endpoint - requires authentication
 */
export async function getDownloadUrlService(data: GetDownloadUrlRequest) {
  const client = createApiClient();
  return parseResponse(client.upload.uploads[':id']['download-url'].$get(data));
}

// ============================================================================
// Service Functions - Ticket-Based Secure Uploads
// ============================================================================

/**
 * Request an upload ticket (Step 1 of secure upload)
 * Protected endpoint - requires authentication
 *
 * NOTE: Uses authenticatedFetch due to Hono RPC path conflict
 * Response type manually defined to match API schema
 */
export async function requestUploadTicketService(
  data: RequestUploadTicketRequest,
  signal?: AbortSignal,
): Promise<RequestUploadTicketResponse> {
  const fetchOptions: Parameters<typeof authenticatedFetch>[1] = {
    body: JSON.stringify(data.json),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  };
  if (signal !== undefined) {
    fetchOptions.signal = signal;
  }

  const response = await authenticatedFetch('/uploads/ticket', fetchOptions);

  const json: unknown = await response.json();
  if (!isSuccessResponse<RequestUploadTicketResponse>(json)) {
    throw new Error('Invalid upload ticket response structure');
  }
  return json;
}

/**
 * Upload a file with a valid ticket (Step 2 of secure upload)
 * Protected endpoint - requires authentication
 *
 * NOTE: Uses authenticatedFetch instead of Hono RPC for multipart/form-data binary uploads
 * The response type is still inferred from the API route definition
 */
export async function uploadWithTicketService(
  data: UploadWithTicketServiceInput,
  signal?: AbortSignal,
): Promise<UploadWithTicketResponse> {
  const formData = new FormData();
  formData.append('file', data.form.file);

  const fetchOptions: Parameters<typeof authenticatedFetch>[1] = {
    body: formData,
    method: 'POST',
    searchParams: { token: data.query.token },
  };
  if (signal !== undefined) {
    fetchOptions.signal = signal;
  }

  const response = await authenticatedFetch('/uploads/ticket/upload', fetchOptions);

  const json: unknown = await response.json();
  if (!isSuccessResponse<UploadWithTicketResponse>(json)) {
    throw new Error('Invalid upload response structure');
  }
  return json;
}

/**
 * Secure upload service (combines ticket request + upload)
 * Convenience function that handles the full secure upload flow
 */
export async function secureUploadService(file: File, signal?: AbortSignal): Promise<UploadWithTicketResponse> {
  if (signal?.aborted) {
    throw new DOMException('Upload cancelled', 'AbortError');
  }

  const ticketResponse = await requestUploadTicketService({
    json: {
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
    },
  }, signal);

  if (!ticketResponse.success || !ticketResponse.data) {
    throw new Error('Failed to request upload ticket');
  }

  if (signal?.aborted) {
    throw new DOMException('Upload cancelled', 'AbortError');
  }

  return uploadWithTicketService({
    form: { file },
    query: { token: ticketResponse.data.token },
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
  const client = createApiClient();
  return parseResponse(client.upload.uploads.multipart.$post(data));
}

/**
 * Upload a part of a multipart upload
 * Protected endpoint - requires authentication
 *
 * NOTE: Uses authenticatedFetch instead of Hono RPC for application/octet-stream binary uploads
 * The response type is still inferred from the API route definition
 */
export async function uploadPartService(
  data: UploadPartServiceInput,
  signal?: AbortSignal,
): Promise<UploadPartResponse> {
  const fetchOptions: Parameters<typeof authenticatedFetch>[1] = {
    body: data.body,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/octet-stream',
    },
    method: 'PUT',
    searchParams: {
      partNumber: data.query.partNumber,
      uploadId: data.query.uploadId,
    },
  };
  if (signal !== undefined) {
    fetchOptions.signal = signal;
  }

  const response = await authenticatedFetch(`/uploads/multipart/${data.param.id}/parts`, fetchOptions);

  const json: unknown = await response.json();
  if (!isSuccessResponse<UploadPartResponse>(json)) {
    throw new Error('Invalid upload part response structure');
  }
  return json;
}

/**
 * Complete a multipart upload
 * Protected endpoint - requires authentication
 */
export async function completeMultipartUploadService(data: CompleteMultipartUploadRequest) {
  const client = createApiClient();
  return parseResponse(client.upload.uploads.multipart[':id'].complete.$post(data));
}

/**
 * Abort a multipart upload
 * Protected endpoint - requires authentication
 */
export async function abortMultipartUploadService(data: AbortMultipartUploadRequest) {
  const client = createApiClient();
  return parseResponse(client.upload.uploads.multipart[':id'].$delete(data));
}

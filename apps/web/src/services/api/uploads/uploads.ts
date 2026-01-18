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

type ListAttachmentsEndpoint = ApiClientType['uploads']['$get'];
export type ListAttachmentsResponse = InferResponseType<ListAttachmentsEndpoint>;
export type ListAttachmentsRequest = InferRequestType<ListAttachmentsEndpoint>;

type GetDownloadUrlEndpoint = ApiClientType['uploads'][':id']['download-url']['$get'];
export type GetDownloadUrlResponse = InferResponseType<GetDownloadUrlEndpoint>;
export type GetDownloadUrlRequest = InferRequestType<GetDownloadUrlEndpoint>;

type GetAttachmentEndpoint = ApiClientType['uploads'][':id']['$get'];
export type GetAttachmentResponse = InferResponseType<GetAttachmentEndpoint>;
export type GetAttachmentRequest = InferRequestType<GetAttachmentEndpoint>;

type UpdateAttachmentEndpoint = ApiClientType['uploads'][':id']['$patch'];
export type UpdateAttachmentResponse = InferResponseType<UpdateAttachmentEndpoint>;
export type UpdateAttachmentRequest = InferRequestType<UpdateAttachmentEndpoint>;

type DeleteAttachmentEndpoint = ApiClientType['uploads'][':id']['$delete'];
export type DeleteAttachmentResponse = InferResponseType<DeleteAttachmentEndpoint>;
export type DeleteAttachmentRequest = InferRequestType<DeleteAttachmentEndpoint>;

// ============================================================================
// Type Inference - Multipart Upload Operations
// ============================================================================

type CreateMultipartUploadEndpoint = ApiClientType['uploads']['multipart']['$post'];
export type CreateMultipartUploadResponse = InferResponseType<CreateMultipartUploadEndpoint>;
export type CreateMultipartUploadRequest = InferRequestType<CreateMultipartUploadEndpoint>;

type CompleteMultipartUploadEndpoint = ApiClientType['uploads']['multipart'][':id']['complete']['$post'];
export type CompleteMultipartUploadResponse = InferResponseType<CompleteMultipartUploadEndpoint>;
export type CompleteMultipartUploadRequest = InferRequestType<CompleteMultipartUploadEndpoint>;

type AbortMultipartUploadEndpoint = ApiClientType['uploads']['multipart'][':id']['$delete'];
export type AbortMultipartUploadResponse = InferResponseType<AbortMultipartUploadEndpoint>;
export type AbortMultipartUploadRequest = InferRequestType<AbortMultipartUploadEndpoint>;

// ============================================================================
// Type Inference - Ticket-Based Upload Operations
// ============================================================================

type RequestUploadTicketEndpoint = ApiClientType['uploads']['ticket']['$post'];
type RequestUploadTicketRequestInferred = InferRequestType<RequestUploadTicketEndpoint>;

/**
 * Upload ticket response - manual type definition since authenticatedFetch is used
 */
export type RequestUploadTicketResponse = {
  success: true;
  data: {
    token: string;
    expiresAt: string;
  };
} | {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

export type RequestUploadTicketRequest = RequestUploadTicketRequestInferred;

/**
 * Upload with ticket response type (inferred from authenticatedFetch)
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
 * Upload part response type (inferred from authenticatedFetch)
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

/**
 * Upload part service input type
 */
export type UploadPartServiceInput = {
  param: { id: string };
  query: { uploadId: string; partNumber: string };
  body: Blob;
};

// ============================================================================
// Type Guards
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
// Service Functions - Attachment Operations
// ============================================================================

/**
 * List attachments with cursor pagination
 * Protected endpoint - requires authentication
 */
export async function listAttachmentsService(args?: ListAttachmentsRequest) {
  const client = createApiClient();
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
  const client = createApiClient();
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
  const client = createApiClient();
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
  const client = createApiClient();
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
  const client = createApiClient();
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
 */
export async function requestUploadTicketService(
  data: RequestUploadTicketRequest,
  signal?: AbortSignal,
) {
  const response = await authenticatedFetch('/uploads/ticket', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data.json ?? {}),
    signal,
  });

  const json: unknown = await response.json();

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
) {
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
 */
export async function secureUploadService(file: File, signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Upload cancelled', 'AbortError');
  }

  const ticketResponse: RequestUploadTicketResponse = await requestUploadTicketService({
    json: {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
    },
  }, signal);

  if (!ticketResponse.success || !ticketResponse.data) {
    throw new Error('Failed to request upload ticket');
  }

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
  const client = createApiClient();
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
 */
export async function uploadPartService(
  data: UploadPartServiceInput,
  signal?: AbortSignal,
) {
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
  const client = createApiClient();
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
  const client = createApiClient();
  return parseResponse(client.uploads.multipart[':id'].$delete(data));
}

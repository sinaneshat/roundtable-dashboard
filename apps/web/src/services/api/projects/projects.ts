/**
 * Projects Service - Project Management API
 *
 * 100% type-safe RPC service for project operations
 * All types automatically inferred from backend Hono routes via InferResponseType
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';
import type { ServiceOptions } from '@/services/api/types';

// ============================================================================
// Type Inference - Project Operations
// ============================================================================

type ListProjectsEndpoint = ApiClientType['projects']['$get'];
export type ListProjectsResponse = InferResponseType<ListProjectsEndpoint, 200>;
export type ListProjectsRequest = InferRequestType<ListProjectsEndpoint>;

type CreateProjectEndpoint = ApiClientType['projects']['$post'];
export type CreateProjectResponse = InferResponseType<CreateProjectEndpoint, 200>;
export type CreateProjectRequest = InferRequestType<CreateProjectEndpoint>;

type GetProjectEndpoint = ApiClientType['projects'][':id']['$get'];
export type GetProjectResponse = InferResponseType<GetProjectEndpoint, 200>;
export type GetProjectRequest = InferRequestType<GetProjectEndpoint>;

type UpdateProjectEndpoint = ApiClientType['projects'][':id']['$patch'];
export type UpdateProjectResponse = InferResponseType<UpdateProjectEndpoint, 200>;
export type UpdateProjectRequest = InferRequestType<UpdateProjectEndpoint>;

type DeleteProjectEndpoint = ApiClientType['projects'][':id']['$delete'];
export type DeleteProjectResponse = InferResponseType<DeleteProjectEndpoint, 200>;
export type DeleteProjectRequest = InferRequestType<DeleteProjectEndpoint>;

// ============================================================================
// Type Inference - Project Attachments
// ============================================================================

type ListProjectAttachmentsEndpoint = ApiClientType['projects'][':id']['attachments']['$get'];
export type ListProjectAttachmentsResponse = InferResponseType<ListProjectAttachmentsEndpoint, 200>;
export type ListProjectAttachmentsRequest = InferRequestType<ListProjectAttachmentsEndpoint>;

type AddUploadToProjectEndpoint = ApiClientType['projects'][':id']['attachments']['$post'];
export type AddUploadToProjectResponse = InferResponseType<AddUploadToProjectEndpoint, 200>;
export type AddUploadToProjectRequest = InferRequestType<AddUploadToProjectEndpoint>;

type GetProjectAttachmentEndpoint = ApiClientType['projects'][':id']['attachments'][':attachmentId']['$get'];
export type GetProjectAttachmentResponse = InferResponseType<GetProjectAttachmentEndpoint, 200>;
export type GetProjectAttachmentRequest = InferRequestType<GetProjectAttachmentEndpoint>;

type UpdateProjectAttachmentEndpoint = ApiClientType['projects'][':id']['attachments'][':attachmentId']['$patch'];
export type UpdateProjectAttachmentResponse = InferResponseType<UpdateProjectAttachmentEndpoint, 200>;
export type UpdateProjectAttachmentRequest = InferRequestType<UpdateProjectAttachmentEndpoint>;

type RemoveAttachmentFromProjectEndpoint = ApiClientType['projects'][':id']['attachments'][':attachmentId']['$delete'];
export type RemoveAttachmentFromProjectResponse = InferResponseType<RemoveAttachmentFromProjectEndpoint, 200>;
export type RemoveAttachmentFromProjectRequest = InferRequestType<RemoveAttachmentFromProjectEndpoint>;

// ============================================================================
// Type Inference - Project Memories
// ============================================================================

type ListProjectMemoriesEndpoint = ApiClientType['projects'][':id']['memories']['$get'];
export type ListProjectMemoriesResponse = InferResponseType<ListProjectMemoriesEndpoint, 200>;
export type ListProjectMemoriesRequest = InferRequestType<ListProjectMemoriesEndpoint>;

type CreateProjectMemoryEndpoint = ApiClientType['projects'][':id']['memories']['$post'];
export type CreateProjectMemoryResponse = InferResponseType<CreateProjectMemoryEndpoint, 200>;
export type CreateProjectMemoryRequest = InferRequestType<CreateProjectMemoryEndpoint>;

type GetProjectMemoryEndpoint = ApiClientType['projects'][':id']['memories'][':memoryId']['$get'];
export type GetProjectMemoryResponse = InferResponseType<GetProjectMemoryEndpoint, 200>;
export type GetProjectMemoryRequest = InferRequestType<GetProjectMemoryEndpoint>;

type UpdateProjectMemoryEndpoint = ApiClientType['projects'][':id']['memories'][':memoryId']['$patch'];
export type UpdateProjectMemoryResponse = InferResponseType<UpdateProjectMemoryEndpoint, 200>;
export type UpdateProjectMemoryRequest = InferRequestType<UpdateProjectMemoryEndpoint>;

type DeleteProjectMemoryEndpoint = ApiClientType['projects'][':id']['memories'][':memoryId']['$delete'];
export type DeleteProjectMemoryResponse = InferResponseType<DeleteProjectMemoryEndpoint, 200>;
export type DeleteProjectMemoryRequest = InferRequestType<DeleteProjectMemoryEndpoint>;

// ============================================================================
// Type Inference - Project Context
// ============================================================================

type GetProjectContextEndpoint = ApiClientType['projects'][':id']['context']['$get'];
export type GetProjectContextResponse = InferResponseType<GetProjectContextEndpoint, 200>;
export type GetProjectContextRequest = InferRequestType<GetProjectContextEndpoint>;

// ============================================================================
// Type Inference - Project Limits
// ============================================================================

type GetProjectLimitsEndpoint = ApiClientType['projects']['limits']['$get'];
export type GetProjectLimitsResponse = InferResponseType<GetProjectLimitsEndpoint, 200>;
export type ProjectLimits = GetProjectLimitsResponse extends { success: true; data: infer D } ? D : never;

// ============================================================================
// Service Functions - Project CRUD
// ============================================================================

/**
 * List projects with cursor pagination
 * Protected endpoint - requires authentication
 */
export async function listProjectsService(data?: ListProjectsRequest, options?: ServiceOptions) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.projects.$get(data ?? { query: {} }));
}

/**
 * Create a new project
 * Protected endpoint - requires authentication
 */
export async function createProjectService(data: CreateProjectRequest) {
  const client = createApiClient();
  return parseResponse(client.projects.$post(data));
}

/**
 * Get a specific project by ID
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getProjectService(data: GetProjectRequest, options?: ServiceOptions) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.projects[':id'].$get(data));
}

/**
 * Update project details
 * Protected endpoint - requires authentication
 */
export async function updateProjectService(data: UpdateProjectRequest) {
  const client = createApiClient();
  return parseResponse(client.projects[':id'].$patch(data));
}

/**
 * Delete a project (cascades to attachments and memories)
 * Protected endpoint - requires authentication
 */
export async function deleteProjectService(data: DeleteProjectRequest) {
  const client = createApiClient();
  return parseResponse(client.projects[':id'].$delete(data));
}

// ============================================================================
// Service Functions - Project Attachments
// ============================================================================

/**
 * List attachments for a project
 * Protected endpoint - requires authentication
 */
export async function listProjectAttachmentsService(data: ListProjectAttachmentsRequest, options?: ServiceOptions) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.projects[':id'].attachments.$get(data));
}

/**
 * Add an existing upload to a project (reference-based)
 * Protected endpoint - requires authentication
 */
export async function addUploadToProjectService(data: AddUploadToProjectRequest) {
  const client = createApiClient();
  return parseResponse(client.projects[':id'].attachments.$post(data));
}

/**
 * Get a specific project attachment
 * Protected endpoint - requires authentication
 */
export async function getProjectAttachmentService(data: GetProjectAttachmentRequest) {
  const client = createApiClient();
  return parseResponse(client.projects[':id'].attachments[':attachmentId'].$get(data));
}

/**
 * Update project attachment metadata
 * Protected endpoint - requires authentication
 */
export async function updateProjectAttachmentService(data: UpdateProjectAttachmentRequest) {
  const client = createApiClient();
  return parseResponse(client.projects[':id'].attachments[':attachmentId'].$patch(data));
}

/**
 * Remove an attachment from a project (reference removal)
 * Protected endpoint - requires authentication
 */
export async function removeAttachmentFromProjectService(data: RemoveAttachmentFromProjectRequest) {
  const client = createApiClient();
  return parseResponse(client.projects[':id'].attachments[':attachmentId'].$delete(data));
}

// ============================================================================
// Service Functions - Project Memories
// ============================================================================

/**
 * List memories for a project
 * Protected endpoint - requires authentication
 */
export async function listProjectMemoriesService(data: ListProjectMemoriesRequest, options?: ServiceOptions) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.projects[':id'].memories.$get(data));
}

/**
 * Create a memory for a project
 * Protected endpoint - requires authentication
 */
export async function createProjectMemoryService(data: CreateProjectMemoryRequest) {
  const client = createApiClient();
  return parseResponse(client.projects[':id'].memories.$post(data));
}

/**
 * Get a specific project memory
 * Protected endpoint - requires authentication
 */
export async function getProjectMemoryService(data: GetProjectMemoryRequest) {
  const client = createApiClient();
  return parseResponse(client.projects[':id'].memories[':memoryId'].$get(data));
}

/**
 * Update a project memory
 * Protected endpoint - requires authentication
 */
export async function updateProjectMemoryService(data: UpdateProjectMemoryRequest) {
  const client = createApiClient();
  return parseResponse(client.projects[':id'].memories[':memoryId'].$patch(data));
}

/**
 * Delete a project memory
 * Protected endpoint - requires authentication
 */
export async function deleteProjectMemoryService(data: DeleteProjectMemoryRequest) {
  const client = createApiClient();
  return parseResponse(client.projects[':id'].memories[':memoryId'].$delete(data));
}

// ============================================================================
// Service Functions - Project Context
// ============================================================================

/**
 * Get aggregated project context for RAG
 * Protected endpoint - requires authentication
 */
export async function getProjectContextService(data: GetProjectContextRequest) {
  const client = createApiClient();
  return parseResponse(client.projects[':id'].context.$get(data));
}

// ============================================================================
// Service Functions - Project Limits
// ============================================================================

/**
 * Get project limits based on user subscription tier
 * Protected endpoint - requires authentication
 */
export async function getProjectLimitsService(options?: ServiceOptions) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.projects.limits.$get());
}

// ============================================================================
// Derived Query Types
// ============================================================================

/**
 * Query parameters for listing project attachments
 * Derived from ListProjectAttachmentsRequest
 */
export type ListProjectAttachmentsQuery = ListProjectAttachmentsRequest extends { query: infer Q } ? Q : never;

/**
 * Query parameters for listing project memories
 * Derived from ListProjectMemoriesRequest
 */
export type ListProjectMemoriesQuery = ListProjectMemoriesRequest extends { query: infer Q } ? Q : never;

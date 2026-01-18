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

// ============================================================================
// Type Inference - Project Operations
// ============================================================================

type ListProjectsEndpoint = ApiClientType['projects']['$get'];
export type ListProjectsResponse = InferResponseType<ListProjectsEndpoint>;
export type ListProjectsRequest = InferRequestType<ListProjectsEndpoint>;

type CreateProjectEndpoint = ApiClientType['projects']['$post'];
export type CreateProjectResponse = InferResponseType<CreateProjectEndpoint>;
export type CreateProjectRequest = InferRequestType<CreateProjectEndpoint>;

type GetProjectEndpoint = ApiClientType['projects'][':id']['$get'];
export type GetProjectResponse = InferResponseType<GetProjectEndpoint>;
export type GetProjectRequest = InferRequestType<GetProjectEndpoint>;

type UpdateProjectEndpoint = ApiClientType['projects'][':id']['$patch'];
export type UpdateProjectResponse = InferResponseType<UpdateProjectEndpoint>;
export type UpdateProjectRequest = InferRequestType<UpdateProjectEndpoint>;

type DeleteProjectEndpoint = ApiClientType['projects'][':id']['$delete'];
export type DeleteProjectResponse = InferResponseType<DeleteProjectEndpoint>;
export type DeleteProjectRequest = InferRequestType<DeleteProjectEndpoint>;

// ============================================================================
// Type Inference - Project Attachments
// ============================================================================

type ListProjectAttachmentsEndpoint = ApiClientType['projects'][':id']['attachments']['$get'];
export type ListProjectAttachmentsResponse = InferResponseType<ListProjectAttachmentsEndpoint>;
export type ListProjectAttachmentsRequest = InferRequestType<ListProjectAttachmentsEndpoint>;

type AddUploadToProjectEndpoint = ApiClientType['projects'][':id']['attachments']['$post'];
export type AddUploadToProjectResponse = InferResponseType<AddUploadToProjectEndpoint>;
export type AddUploadToProjectRequest = InferRequestType<AddUploadToProjectEndpoint>;

type GetProjectAttachmentEndpoint = ApiClientType['projects'][':id']['attachments'][':attachmentId']['$get'];
export type GetProjectAttachmentResponse = InferResponseType<GetProjectAttachmentEndpoint>;
export type GetProjectAttachmentRequest = InferRequestType<GetProjectAttachmentEndpoint>;

type UpdateProjectAttachmentEndpoint = ApiClientType['projects'][':id']['attachments'][':attachmentId']['$patch'];
export type UpdateProjectAttachmentResponse = InferResponseType<UpdateProjectAttachmentEndpoint>;
export type UpdateProjectAttachmentRequest = InferRequestType<UpdateProjectAttachmentEndpoint>;

type RemoveAttachmentFromProjectEndpoint = ApiClientType['projects'][':id']['attachments'][':attachmentId']['$delete'];
export type RemoveAttachmentFromProjectResponse = InferResponseType<RemoveAttachmentFromProjectEndpoint>;
export type RemoveAttachmentFromProjectRequest = InferRequestType<RemoveAttachmentFromProjectEndpoint>;

// ============================================================================
// Type Inference - Project Memories
// ============================================================================

type ListProjectMemoriesEndpoint = ApiClientType['projects'][':id']['memories']['$get'];
export type ListProjectMemoriesResponse = InferResponseType<ListProjectMemoriesEndpoint>;
export type ListProjectMemoriesRequest = InferRequestType<ListProjectMemoriesEndpoint>;

type CreateProjectMemoryEndpoint = ApiClientType['projects'][':id']['memories']['$post'];
export type CreateProjectMemoryResponse = InferResponseType<CreateProjectMemoryEndpoint>;
export type CreateProjectMemoryRequest = InferRequestType<CreateProjectMemoryEndpoint>;

type GetProjectMemoryEndpoint = ApiClientType['projects'][':id']['memories'][':memoryId']['$get'];
export type GetProjectMemoryResponse = InferResponseType<GetProjectMemoryEndpoint>;
export type GetProjectMemoryRequest = InferRequestType<GetProjectMemoryEndpoint>;

type UpdateProjectMemoryEndpoint = ApiClientType['projects'][':id']['memories'][':memoryId']['$patch'];
export type UpdateProjectMemoryResponse = InferResponseType<UpdateProjectMemoryEndpoint>;
export type UpdateProjectMemoryRequest = InferRequestType<UpdateProjectMemoryEndpoint>;

type DeleteProjectMemoryEndpoint = ApiClientType['projects'][':id']['memories'][':memoryId']['$delete'];
export type DeleteProjectMemoryResponse = InferResponseType<DeleteProjectMemoryEndpoint>;
export type DeleteProjectMemoryRequest = InferRequestType<DeleteProjectMemoryEndpoint>;

// ============================================================================
// Type Inference - Project Context
// ============================================================================

type GetProjectContextEndpoint = ApiClientType['projects'][':id']['context']['$get'];
export type GetProjectContextResponse = InferResponseType<GetProjectContextEndpoint>;
export type GetProjectContextRequest = InferRequestType<GetProjectContextEndpoint>;

// ============================================================================
// Service Functions - Project CRUD
// ============================================================================

/**
 * List projects with cursor pagination
 * Protected endpoint - requires authentication
 */
export async function listProjectsService(args?: ListProjectsRequest) {
  const client = createApiClient();
  const params: ListProjectsRequest = {
    query: args?.query ?? {},
  };
  return parseResponse(client.projects.$get(params));
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
export async function getProjectService(data: GetProjectRequest) {
  const client = createApiClient();
  const params: GetProjectRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.projects[':id'].$get(params));
}

/**
 * Update project details
 * Protected endpoint - requires authentication
 */
export async function updateProjectService(data: UpdateProjectRequest) {
  const client = createApiClient();
  const params: UpdateProjectRequest = {
    param: data.param ?? { id: '' },
    json: data.json ?? {},
  };
  return parseResponse(client.projects[':id'].$patch(params));
}

/**
 * Delete a project (cascades to attachments and memories)
 * Protected endpoint - requires authentication
 */
export async function deleteProjectService(data: DeleteProjectRequest) {
  const client = createApiClient();
  const params: DeleteProjectRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.projects[':id'].$delete(params));
}

// ============================================================================
// Service Functions - Project Attachments
// ============================================================================

/**
 * List attachments for a project
 * Protected endpoint - requires authentication
 */
export async function listProjectAttachmentsService(data: ListProjectAttachmentsRequest) {
  const client = createApiClient();
  const params: ListProjectAttachmentsRequest = {
    param: data.param ?? { id: '' },
    query: data.query ?? {},
  };
  return parseResponse(client.projects[':id'].attachments.$get(params));
}

/**
 * Add an existing upload to a project (reference-based)
 * Protected endpoint - requires authentication
 */
export async function addUploadToProjectService(data: AddUploadToProjectRequest) {
  const client = createApiClient();
  const params: AddUploadToProjectRequest = {
    param: data.param ?? { id: '' },
    json: data.json ?? { uploadId: '' },
  };
  return parseResponse(client.projects[':id'].attachments.$post(params));
}

/**
 * Get a specific project attachment
 * Protected endpoint - requires authentication
 */
export async function getProjectAttachmentService(data: GetProjectAttachmentRequest) {
  const client = createApiClient();
  const params: GetProjectAttachmentRequest = {
    param: data.param ?? { id: '', attachmentId: '' },
  };
  return parseResponse(client.projects[':id'].attachments[':attachmentId'].$get(params));
}

/**
 * Update project attachment metadata
 * Protected endpoint - requires authentication
 */
export async function updateProjectAttachmentService(data: UpdateProjectAttachmentRequest) {
  const client = createApiClient();
  const params: UpdateProjectAttachmentRequest = {
    param: data.param ?? { id: '', attachmentId: '' },
    json: data.json ?? {},
  };
  return parseResponse(client.projects[':id'].attachments[':attachmentId'].$patch(params));
}

/**
 * Remove an attachment from a project (reference removal)
 * Protected endpoint - requires authentication
 */
export async function removeAttachmentFromProjectService(data: RemoveAttachmentFromProjectRequest) {
  const client = createApiClient();
  const params: RemoveAttachmentFromProjectRequest = {
    param: data.param ?? { id: '', attachmentId: '' },
  };
  return parseResponse(client.projects[':id'].attachments[':attachmentId'].$delete(params));
}

// ============================================================================
// Service Functions - Project Memories
// ============================================================================

/**
 * List memories for a project
 * Protected endpoint - requires authentication
 */
export async function listProjectMemoriesService(data: ListProjectMemoriesRequest) {
  const client = createApiClient();
  const params: ListProjectMemoriesRequest = {
    param: data.param ?? { id: '' },
    query: data.query ?? {},
  };
  return parseResponse(client.projects[':id'].memories.$get(params));
}

/**
 * Create a memory for a project
 * Protected endpoint - requires authentication
 */
export async function createProjectMemoryService(data: CreateProjectMemoryRequest) {
  const client = createApiClient();
  const params: CreateProjectMemoryRequest = {
    param: data.param ?? { id: '' },
    json: data.json ?? { content: '' },
  };
  return parseResponse(client.projects[':id'].memories.$post(params));
}

/**
 * Get a specific project memory
 * Protected endpoint - requires authentication
 */
export async function getProjectMemoryService(data: GetProjectMemoryRequest) {
  const client = createApiClient();
  const params: GetProjectMemoryRequest = {
    param: data.param ?? { id: '', memoryId: '' },
  };
  return parseResponse(client.projects[':id'].memories[':memoryId'].$get(params));
}

/**
 * Update a project memory
 * Protected endpoint - requires authentication
 */
export async function updateProjectMemoryService(data: UpdateProjectMemoryRequest) {
  const client = createApiClient();
  const params: UpdateProjectMemoryRequest = {
    param: data.param ?? { id: '', memoryId: '' },
    json: data.json ?? {},
  };
  return parseResponse(client.projects[':id'].memories[':memoryId'].$patch(params));
}

/**
 * Delete a project memory
 * Protected endpoint - requires authentication
 */
export async function deleteProjectMemoryService(data: DeleteProjectMemoryRequest) {
  const client = createApiClient();
  const params: DeleteProjectMemoryRequest = {
    param: data.param ?? { id: '', memoryId: '' },
  };
  return parseResponse(client.projects[':id'].memories[':memoryId'].$delete(params));
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
  const params: GetProjectContextRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.projects[':id'].context.$get(params));
}

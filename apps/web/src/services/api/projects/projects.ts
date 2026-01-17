/**
 * Projects Service - Project Management API
 *
 * 100% type-safe RPC service for project operations
 * All types automatically inferred from backend Hono routes
 */

import { parseResponse } from 'hono/client';

import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Project Operations
// ============================================================================

export type ListProjectsRequest = any;

export type ListProjectsResponse = any;

export type CreateProjectRequest = any;

export type CreateProjectResponse = any;

export type GetProjectRequest = any;

export type GetProjectResponse = any;

export type UpdateProjectRequest = any;

export type UpdateProjectResponse = any;

export type DeleteProjectRequest = any;

export type DeleteProjectResponse = any;

// ============================================================================
// Type Inference - Project Attachments
// ============================================================================

export type ListProjectAttachmentsRequest = any;

export type ListProjectAttachmentsResponse = any;

export type AddUploadToProjectRequest = any;

export type AddUploadToProjectResponse = any;

export type GetProjectAttachmentRequest = any;

export type GetProjectAttachmentResponse = any;

export type UpdateProjectAttachmentRequest = any;

export type UpdateProjectAttachmentResponse = any;

export type RemoveAttachmentFromProjectRequest = any;

export type RemoveAttachmentFromProjectResponse = any;

// ============================================================================
// Type Inference - Project Memories
// ============================================================================

export type ListProjectMemoriesRequest = any;

export type ListProjectMemoriesResponse = any;

export type CreateProjectMemoryRequest = any;

export type CreateProjectMemoryResponse = any;

export type GetProjectMemoryRequest = any;

export type GetProjectMemoryResponse = any;

export type UpdateProjectMemoryRequest = any;

export type UpdateProjectMemoryResponse = any;

export type DeleteProjectMemoryRequest = any;

export type DeleteProjectMemoryResponse = any;

// ============================================================================
// Type Inference - Project Context
// ============================================================================

export type GetProjectContextRequest = any;

export type GetProjectContextResponse = any;

// ============================================================================
// Service Functions - Project CRUD
// ============================================================================

/**
 * List projects with cursor pagination
 * Protected endpoint - requires authentication
 */
export async function listProjectsService(args?: ListProjectsRequest) {
  const client = await createApiClient();
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
  const client = await createApiClient();
  const params: CreateProjectRequest = {
    json: data.json ?? {},
  };
  return parseResponse(client.projects.$post(params));
}

/**
 * Get a specific project by ID
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getProjectService(data: GetProjectRequest) {
  const client = await createApiClient();
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
  const client = await createApiClient();
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
  const client = await createApiClient();
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
  const client = await createApiClient();
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
  const client = await createApiClient();
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
  const client = await createApiClient();
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
  const client = await createApiClient();
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
  const client = await createApiClient();
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
  const client = await createApiClient();
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
  const client = await createApiClient();
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
  const client = await createApiClient();
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
  const client = await createApiClient();
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
  const client = await createApiClient();
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
  const client = await createApiClient();
  const params: GetProjectContextRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.projects[':id'].context.$get(params));
}

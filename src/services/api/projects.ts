/**
 * Projects Service - Project Management API
 *
 * 100% type-safe RPC service for project operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type ListProjectsRequest = InferRequestType<
  ApiClientType['projects']['$get']
>;

export type ListProjectsResponse = InferResponseType<
  ApiClientType['projects']['$get']
>;

export type CreateProjectRequest = InferRequestType<
  ApiClientType['projects']['$post']
>;

export type CreateProjectResponse = InferResponseType<
  ApiClientType['projects']['$post']
>;

export type GetProjectRequest = InferRequestType<
  ApiClientType['projects'][':id']['$get']
>;

export type GetProjectResponse = InferResponseType<
  ApiClientType['projects'][':id']['$get']
>;

export type UpdateProjectRequest = InferRequestType<
  ApiClientType['projects'][':id']['$patch']
>;

export type UpdateProjectResponse = InferResponseType<
  ApiClientType['projects'][':id']['$patch']
>;

export type DeleteProjectRequest = InferRequestType<
  ApiClientType['projects'][':id']['$delete']
>;

export type DeleteProjectResponse = InferRequestType<
  ApiClientType['projects'][':id']['$delete']
>;

export type ListKnowledgeFilesRequest = InferRequestType<
  ApiClientType['projects'][':id']['knowledge']['$get']
>;

export type ListKnowledgeFilesResponse = InferResponseType<
  ApiClientType['projects'][':id']['knowledge']['$get']
>;

export type UploadKnowledgeFileRequest = InferRequestType<
  ApiClientType['projects'][':id']['knowledge']['$post']
>;

export type UploadKnowledgeFileResponse = InferResponseType<
  ApiClientType['projects'][':id']['knowledge']['$post']
>;

export type DeleteKnowledgeFileRequest = InferRequestType<
  ApiClientType['projects'][':id']['knowledge'][':fileId']['$delete']
>;

export type DeleteKnowledgeFileResponse = InferResponseType<
  ApiClientType['projects'][':id']['knowledge'][':fileId']['$delete']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List projects with cursor pagination
 * Protected endpoint - requires authentication
 *
 * CRITICAL: Consistent argument handling for SSR/hydration
 * Only pass args if defined to ensure server/client consistency
 */
export async function listProjectsService(args?: ListProjectsRequest) {
  const client = await createApiClient();
  // Internal fallback: if args not provided, create proper empty query object
  const params: ListProjectsRequest = {
    query: args?.query ?? {},
  };
  return parseResponse(client.projects.$get(params));
}

/**
 * Create a new project
 * Protected endpoint - requires authentication
 *
 * @param data - Project creation data including name, description, settings
 */
export async function createProjectService(data: CreateProjectRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure json property exists
  const params: CreateProjectRequest = {
    json: data.json ?? {},
  };
  return parseResponse(client.projects.$post(params));
}

/**
 * Get a specific project by ID
 * Protected endpoint - requires authentication (ownership check)
 *
 * @param data - Request with param.id for project ID
 */
export async function getProjectService(data: GetProjectRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: GetProjectRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.projects[':id'].$get(params));
}

/**
 * Update project details (name, description, settings, etc.)
 * Protected endpoint - requires authentication
 *
 * @param data - Request with param.id and json body
 */
export async function updateProjectService(data: UpdateProjectRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param and json exist
  const params: UpdateProjectRequest = {
    param: data.param ?? { id: '' },
    json: data.json ?? {},
  };
  return parseResponse(client.projects[':id'].$patch(params));
}

/**
 * Delete a project (cascades to knowledge files)
 * Protected endpoint - requires authentication
 *
 * @param data - Request with param.id for project ID
 */
export async function deleteProjectService(data: DeleteProjectRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: DeleteProjectRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.projects[':id'].$delete(params));
}

/**
 * List knowledge files for a project
 * Protected endpoint - requires authentication
 *
 * @param data - Request with param.id for project ID and optional query params
 */
export async function listKnowledgeFilesService(data: ListKnowledgeFilesRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param and query exist
  const params: ListKnowledgeFilesRequest = {
    param: data.param ?? { id: '' },
    query: data.query ?? {},
  };
  return parseResponse(client.projects[':id'].knowledge.$get(params));
}

/**
 * Upload a knowledge file to a project
 * Protected endpoint - requires authentication
 *
 * @param data - Request with param.id for project ID and multipart form data
 */
export async function uploadKnowledgeFileService(data: UploadKnowledgeFileRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param and form exist
  const params: UploadKnowledgeFileRequest = {
    param: data.param ?? { id: '' },
    form: data.form ?? {},
  };
  return parseResponse(client.projects[':id'].knowledge.$post(params));
}

/**
 * Delete a knowledge file from a project
 * Protected endpoint - requires authentication
 *
 * @param data - Request with param.id for project ID and param.fileId for file ID
 */
export async function deleteKnowledgeFileService(data: DeleteKnowledgeFileRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: DeleteKnowledgeFileRequest = {
    param: data.param ?? { id: '', fileId: '' },
  };
  return parseResponse(client.projects[':id'].knowledge[':fileId'].$delete(params));
}

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { IdParamSchema, StandardApiResponses } from '@/core';

import {
  AddProjectAttachmentResponseSchema,
  AddUploadToProjectRequestSchema,
  CreateProjectMemoryRequestSchema,
  CreateProjectRequestSchema,
  DeleteProjectResponseSchema,
  DeleteResponseSchema,
  GetProjectAttachmentResponseSchema,
  GetProjectMemoryResponseSchema,
  GetProjectResponseSchema,
  ListProjectAttachmentsQuerySchema,
  ListProjectAttachmentsResponseSchema,
  ListProjectMemoriesQuerySchema,
  ListProjectMemoriesResponseSchema,
  ListProjectsQuerySchema,
  ListProjectsResponseSchema,
  ListProjectThreadsQuerySchema,
  ListProjectThreadsResponseSchema,
  ProjectAttachmentParamSchema,
  ProjectContextResponseSchema,
  ProjectLimitsResponseSchema,
  ProjectMemoryParamSchema,
  UpdateProjectAttachmentRequestSchema,
  UpdateProjectMemoryRequestSchema,
  UpdateProjectRequestSchema,
} from './schema';

// ============================================================================
// PROJECT ROUTES
// ============================================================================

export const listProjectsRoute = createRoute({
  description: 'Get all projects for the authenticated user with pagination and search',
  method: 'get',
  path: '/projects',
  request: {
    query: ListProjectsQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ListProjectsResponseSchema },
      },
      description: 'Projects retrieved successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'List user projects',
  tags: ['Projects'],
});

export const getProjectLimitsRoute = createRoute({
  description: 'Get current user project limits based on subscription tier',
  method: 'get',
  path: '/projects/limits',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ProjectLimitsResponseSchema },
      },
      description: 'Project limits retrieved successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Get project limits',
  tags: ['Projects'],
});

export const getProjectRoute = createRoute({
  description: 'Get a single project with attachment and thread counts',
  method: 'get',
  path: '/projects/{id}',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: GetProjectResponseSchema },
      },
      description: 'Project retrieved successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Get project by ID',
  tags: ['Projects'],
});

export const createProjectRoute = createRoute({
  description: 'Create a new project with AutoRAG integration',
  method: 'post',
  path: '/projects',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateProjectRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.CREATED]: {
      content: {
        'application/json': { schema: GetProjectResponseSchema },
      },
      description: 'Project created successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Create project',
  tags: ['Projects'],
});

export const updateProjectRoute = createRoute({
  description: 'Update project name, description, color, or settings',
  method: 'patch',
  path: '/projects/{id}',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateProjectRequestSchema,
        },
      },
    },
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: GetProjectResponseSchema },
      },
      description: 'Project updated successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Update project',
  tags: ['Projects'],
});

export const deleteProjectRoute = createRoute({
  description: 'Delete project and all associated attachments (CASCADE). Also soft-deletes all threads in the project.',
  method: 'delete',
  path: '/projects/{id}',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: DeleteProjectResponseSchema },
      },
      description: 'Project deleted successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Delete project',
  tags: ['Projects'],
});

// ============================================================================
// PROJECT THREADS ROUTES
// ============================================================================

export const listProjectThreadsRoute = createRoute({
  description: 'Get all threads associated with a project',
  method: 'get',
  path: '/projects/{id}/threads',
  request: {
    params: IdParamSchema,
    query: ListProjectThreadsQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ListProjectThreadsResponseSchema },
      },
      description: 'Project threads retrieved successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'List project threads',
  tags: ['Projects'],
});

// ============================================================================
// PROJECT ATTACHMENT ROUTES (Reference-based, S3/R2 Best Practice)
// ============================================================================

export const listProjectAttachmentsRoute = createRoute({
  description: 'Get all attachments for a project with pagination and filtering',
  method: 'get',
  path: '/projects/{id}/attachments',
  request: {
    params: IdParamSchema,
    query: ListProjectAttachmentsQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ListProjectAttachmentsResponseSchema },
      },
      description: 'Attachments retrieved successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'List project attachments',
  tags: ['Project Attachments'],
});

export const addAttachmentToProjectRoute = createRoute({
  description: 'Add an existing attachment (from POST /uploads) to a project for RAG indexing. S3/R2 Best Practice: Reference existing uploads instead of direct file upload.',
  method: 'post',
  path: '/projects/{id}/attachments',
  request: {
    body: {
      content: {
        'application/json': {
          schema: AddUploadToProjectRequestSchema,
        },
      },
    },
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.CREATED]: {
      content: {
        'application/json': { schema: AddProjectAttachmentResponseSchema },
      },
      description: 'Attachment added to project successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.CONFLICT,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Add attachment to project',
  tags: ['Project Attachments'],
});

export const getProjectAttachmentRoute = createRoute({
  description: 'Get a single attachment from a project with details',
  method: 'get',
  path: '/projects/{id}/attachments/{attachmentId}',
  request: {
    params: ProjectAttachmentParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: GetProjectAttachmentResponseSchema },
      },
      description: 'Attachment retrieved successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Get project attachment',
  tags: ['Project Attachments'],
});

export const updateProjectAttachmentRoute = createRoute({
  description: 'Update project-specific metadata (context, description, tags) for an attachment',
  method: 'patch',
  path: '/projects/{id}/attachments/{attachmentId}',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateProjectAttachmentRequestSchema,
        },
      },
    },
    params: ProjectAttachmentParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: GetProjectAttachmentResponseSchema },
      },
      description: 'Attachment metadata updated successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Update project attachment metadata',
  tags: ['Project Attachments'],
});

export const removeAttachmentFromProjectRoute = createRoute({
  description: 'Remove an attachment reference from a project. The underlying file remains in the uploads system.',
  method: 'delete',
  path: '/projects/{id}/attachments/{attachmentId}',
  request: {
    params: ProjectAttachmentParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: DeleteResponseSchema },
      },
      description: 'Attachment removed from project successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Remove attachment from project',
  tags: ['Project Attachments'],
});

// ============================================================================
// PROJECT MEMORY ROUTES
// ============================================================================

export const listProjectMemoriesRoute = createRoute({
  description: 'Get all memories for a project with pagination and filtering',
  method: 'get',
  path: '/projects/{id}/memories',
  request: {
    params: IdParamSchema,
    query: ListProjectMemoriesQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ListProjectMemoriesResponseSchema },
      },
      description: 'Memories retrieved successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'List project memories',
  tags: ['Project Memories'],
});

export const createProjectMemoryRoute = createRoute({
  description: 'Create a new memory entry for a project',
  method: 'post',
  path: '/projects/{id}/memories',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateProjectMemoryRequestSchema,
        },
      },
    },
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.CREATED]: {
      content: {
        'application/json': { schema: GetProjectMemoryResponseSchema },
      },
      description: 'Memory created successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Create project memory',
  tags: ['Project Memories'],
});

export const getProjectMemoryRoute = createRoute({
  description: 'Get a single memory entry from a project',
  method: 'get',
  path: '/projects/{id}/memories/{memoryId}',
  request: {
    params: ProjectMemoryParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: GetProjectMemoryResponseSchema },
      },
      description: 'Memory retrieved successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Get project memory',
  tags: ['Project Memories'],
});

export const updateProjectMemoryRoute = createRoute({
  description: 'Update a memory entry (content, importance, active status)',
  method: 'patch',
  path: '/projects/{id}/memories/{memoryId}',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateProjectMemoryRequestSchema,
        },
      },
    },
    params: ProjectMemoryParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: GetProjectMemoryResponseSchema },
      },
      description: 'Memory updated successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Update project memory',
  tags: ['Project Memories'],
});

export const deleteProjectMemoryRoute = createRoute({
  description: 'Delete a memory entry from a project',
  method: 'delete',
  path: '/projects/{id}/memories/{memoryId}',
  request: {
    params: ProjectMemoryParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: DeleteResponseSchema },
      },
      description: 'Memory deleted successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Delete project memory',
  tags: ['Project Memories'],
});

// ============================================================================
// PROJECT CONTEXT ROUTE
// ============================================================================

export const getProjectContextRoute = createRoute({
  description: 'Get aggregated context from memories, cross-chat history, searches, and analyses for RAG',
  method: 'get',
  path: '/projects/{id}/context',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ProjectContextResponseSchema },
      },
      description: 'Project context retrieved successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
  summary: 'Get aggregated project context',
  tags: ['Project Context'],
});

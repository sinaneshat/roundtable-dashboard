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
  method: 'get',
  path: '/projects',
  tags: ['Projects'],
  summary: 'List user projects',
  description: 'Get all projects for the authenticated user with pagination and search',
  request: {
    query: ListProjectsQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Projects retrieved successfully',
      content: {
        'application/json': { schema: ListProjectsResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const getProjectLimitsRoute = createRoute({
  method: 'get',
  path: '/projects/limits',
  tags: ['Projects'],
  summary: 'Get project limits',
  description: 'Get current user project limits based on subscription tier',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Project limits retrieved successfully',
      content: {
        'application/json': { schema: ProjectLimitsResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const getProjectRoute = createRoute({
  method: 'get',
  path: '/projects/:id',
  tags: ['Projects'],
  summary: 'Get project by ID',
  description: 'Get a single project with attachment and thread counts',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Project retrieved successfully',
      content: {
        'application/json': { schema: GetProjectResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const createProjectRoute = createRoute({
  method: 'post',
  path: '/projects',
  tags: ['Projects'],
  summary: 'Create project',
  description: 'Create a new project with AutoRAG integration',
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
      description: 'Project created successfully',
      content: {
        'application/json': { schema: GetProjectResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const updateProjectRoute = createRoute({
  method: 'patch',
  path: '/projects/:id',
  tags: ['Projects'],
  summary: 'Update project',
  description: 'Update project name, description, color, or settings',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateProjectRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Project updated successfully',
      content: {
        'application/json': { schema: GetProjectResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const deleteProjectRoute = createRoute({
  method: 'delete',
  path: '/projects/:id',
  tags: ['Projects'],
  summary: 'Delete project',
  description: 'Delete project and all associated attachments (CASCADE). Also soft-deletes all threads in the project.',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Project deleted successfully',
      content: {
        'application/json': { schema: DeleteProjectResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

// ============================================================================
// PROJECT THREADS ROUTES
// ============================================================================

// TODO: DEPRECATE - Migrate frontend to /chat/threads?projectId=X then remove
// Action plan:
// 1. Update apps/web/src/hooks/queries/projects.ts to use chatThreadsQueryOptions with projectId filter
// 2. Update apps/web/src/services/api/projects/projects.ts to remove listProjectThreadsService
// 3. Remove this route, handler, and schema after frontend migration
// See: apps/api/src/routes/chat/handlers/thread.handler.ts listThreadsHandler (supports projectId query param)
export const listProjectThreadsRoute = createRoute({
  method: 'get',
  path: '/projects/:id/threads',
  tags: ['Projects'],
  summary: 'List project threads',
  description: 'Get all threads associated with a project',
  request: {
    params: IdParamSchema,
    query: ListProjectThreadsQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Project threads retrieved successfully',
      content: {
        'application/json': { schema: ListProjectThreadsResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

// ============================================================================
// PROJECT ATTACHMENT ROUTES (Reference-based, S3/R2 Best Practice)
// ============================================================================

export const listProjectAttachmentsRoute = createRoute({
  method: 'get',
  path: '/projects/:id/attachments',
  tags: ['Project Attachments'],
  summary: 'List project attachments',
  description: 'Get all attachments for a project with pagination and filtering',
  request: {
    params: IdParamSchema,
    query: ListProjectAttachmentsQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Attachments retrieved successfully',
      content: {
        'application/json': { schema: ListProjectAttachmentsResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const addAttachmentToProjectRoute = createRoute({
  method: 'post',
  path: '/projects/:id/attachments',
  tags: ['Project Attachments'],
  summary: 'Add attachment to project',
  description: 'Add an existing attachment (from POST /uploads) to a project for RAG indexing. S3/R2 Best Practice: Reference existing uploads instead of direct file upload.',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: AddUploadToProjectRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.CREATED]: {
      description: 'Attachment added to project successfully',
      content: {
        'application/json': { schema: AddProjectAttachmentResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.CONFLICT,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const getProjectAttachmentRoute = createRoute({
  method: 'get',
  path: '/projects/:id/attachments/:attachmentId',
  tags: ['Project Attachments'],
  summary: 'Get project attachment',
  description: 'Get a single attachment from a project with details',
  request: {
    params: ProjectAttachmentParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Attachment retrieved successfully',
      content: {
        'application/json': { schema: GetProjectAttachmentResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const updateProjectAttachmentRoute = createRoute({
  method: 'patch',
  path: '/projects/:id/attachments/:attachmentId',
  tags: ['Project Attachments'],
  summary: 'Update project attachment metadata',
  description: 'Update project-specific metadata (context, description, tags) for an attachment',
  request: {
    params: ProjectAttachmentParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateProjectAttachmentRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Attachment metadata updated successfully',
      content: {
        'application/json': { schema: GetProjectAttachmentResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const removeAttachmentFromProjectRoute = createRoute({
  method: 'delete',
  path: '/projects/:id/attachments/:attachmentId',
  tags: ['Project Attachments'],
  summary: 'Remove attachment from project',
  description: 'Remove an attachment reference from a project. The underlying file remains in the uploads system.',
  request: {
    params: ProjectAttachmentParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Attachment removed from project successfully',
      content: {
        'application/json': { schema: DeleteResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

// ============================================================================
// PROJECT MEMORY ROUTES
// ============================================================================

export const listProjectMemoriesRoute = createRoute({
  method: 'get',
  path: '/projects/:id/memories',
  tags: ['Project Memories'],
  summary: 'List project memories',
  description: 'Get all memories for a project with pagination and filtering',
  request: {
    params: IdParamSchema,
    query: ListProjectMemoriesQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Memories retrieved successfully',
      content: {
        'application/json': { schema: ListProjectMemoriesResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const createProjectMemoryRoute = createRoute({
  method: 'post',
  path: '/projects/:id/memories',
  tags: ['Project Memories'],
  summary: 'Create project memory',
  description: 'Create a new memory entry for a project',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: CreateProjectMemoryRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.CREATED]: {
      description: 'Memory created successfully',
      content: {
        'application/json': { schema: GetProjectMemoryResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const getProjectMemoryRoute = createRoute({
  method: 'get',
  path: '/projects/:id/memories/:memoryId',
  tags: ['Project Memories'],
  summary: 'Get project memory',
  description: 'Get a single memory entry from a project',
  request: {
    params: ProjectMemoryParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Memory retrieved successfully',
      content: {
        'application/json': { schema: GetProjectMemoryResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const updateProjectMemoryRoute = createRoute({
  method: 'patch',
  path: '/projects/:id/memories/:memoryId',
  tags: ['Project Memories'],
  summary: 'Update project memory',
  description: 'Update a memory entry (content, importance, active status)',
  request: {
    params: ProjectMemoryParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateProjectMemoryRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Memory updated successfully',
      content: {
        'application/json': { schema: GetProjectMemoryResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const deleteProjectMemoryRoute = createRoute({
  method: 'delete',
  path: '/projects/:id/memories/:memoryId',
  tags: ['Project Memories'],
  summary: 'Delete project memory',
  description: 'Delete a memory entry from a project',
  request: {
    params: ProjectMemoryParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Memory deleted successfully',
      content: {
        'application/json': { schema: DeleteResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

// ============================================================================
// PROJECT CONTEXT ROUTE
// ============================================================================

export const getProjectContextRoute = createRoute({
  method: 'get',
  path: '/projects/:id/context',
  tags: ['Project Context'],
  summary: 'Get aggregated project context',
  description: 'Get aggregated context from memories, cross-chat history, searches, and analyses for RAG',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Project context retrieved successfully',
      content: {
        'application/json': { schema: ProjectContextResponseSchema },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

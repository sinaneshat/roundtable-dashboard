import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { IdParamSchema, StandardApiResponses } from '@/core';

import {
  AddProjectAttachmentResponseSchema,
  AddUploadToProjectRequestSchema,
  CreateProjectMemoryRequestSchema,
  CreateProjectRequestSchema,
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
  ProjectAttachmentParamSchema,
  ProjectContextResponseSchema,
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
      content: {
        'application/json': {
          schema: ListProjectsResponseSchema,
        },
      },
      description: 'Projects retrieved successfully',
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
      content: {
        'application/json': {
          schema: GetProjectResponseSchema,
        },
      },
      description: 'Project retrieved successfully',
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
      content: {
        'application/json': {
          schema: GetProjectResponseSchema,
        },
      },
      description: 'Project created successfully',
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
      content: {
        'application/json': {
          schema: GetProjectResponseSchema,
        },
      },
      description: 'Project updated successfully',
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
  description: 'Delete project and all associated attachments (CASCADE)',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: DeleteResponseSchema,
        },
      },
      description: 'Project deleted successfully',
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
      content: {
        'application/json': {
          schema: ListProjectAttachmentsResponseSchema,
        },
      },
      description: 'Attachments retrieved successfully',
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
      content: {
        'application/json': {
          schema: AddProjectAttachmentResponseSchema,
        },
      },
      description: 'Attachment added to project successfully',
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
      content: {
        'application/json': {
          schema: GetProjectAttachmentResponseSchema,
        },
      },
      description: 'Attachment retrieved successfully',
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
      content: {
        'application/json': {
          schema: GetProjectAttachmentResponseSchema,
        },
      },
      description: 'Attachment metadata updated successfully',
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
      content: {
        'application/json': {
          schema: DeleteResponseSchema,
        },
      },
      description: 'Attachment removed from project successfully',
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
      content: {
        'application/json': {
          schema: ListProjectMemoriesResponseSchema,
        },
      },
      description: 'Memories retrieved successfully',
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
      content: {
        'application/json': {
          schema: GetProjectMemoryResponseSchema,
        },
      },
      description: 'Memory created successfully',
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
      content: {
        'application/json': {
          schema: GetProjectMemoryResponseSchema,
        },
      },
      description: 'Memory retrieved successfully',
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
      content: {
        'application/json': {
          schema: GetProjectMemoryResponseSchema,
        },
      },
      description: 'Memory updated successfully',
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
      content: {
        'application/json': {
          schema: DeleteResponseSchema,
        },
      },
      description: 'Memory deleted successfully',
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
      content: {
        'application/json': {
          schema: ProjectContextResponseSchema,
        },
      },
      description: 'Project context retrieved successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

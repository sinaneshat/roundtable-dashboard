import { createRoute, z } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { StandardApiResponses } from '@/api/core/response-schemas';
import { IdParamSchema } from '@/api/core/schemas';

import {
  CreateProjectRequestSchema,
  DeleteResponseSchema,
  GetProjectResponseSchema,
  ListKnowledgeFilesQuerySchema,
  ListKnowledgeFilesResponseSchema,
  ListProjectsQuerySchema,
  ListProjectsResponseSchema,
  UpdateProjectRequestSchema,
  UploadFileResponseSchema,
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
  description: 'Get a single project with file and thread counts',
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
  description: 'Update project name, description, or settings',
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
  description: 'Delete project and all associated files (CASCADE)',
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
// KNOWLEDGE FILE ROUTES
// ============================================================================

export const listKnowledgeFilesRoute = createRoute({
  method: 'get',
  path: '/projects/:id/knowledge',
  tags: ['Project Knowledge'],
  summary: 'List project files',
  description: 'Get all knowledge files for a project with pagination',
  request: {
    params: IdParamSchema,
    query: ListKnowledgeFilesQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: ListKnowledgeFilesResponseSchema,
        },
      },
      description: 'Files retrieved successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const uploadKnowledgeFileRoute = createRoute({
  method: 'post',
  path: '/projects/:id/knowledge',
  tags: ['Project Knowledge'],
  summary: 'Upload file',
  description: 'Upload a knowledge file to project (multipart/form-data)',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                format: 'binary',
              },
              description: {
                type: 'string',
              },
              context: {
                type: 'string',
              },
              tags: {
                type: 'string',
              },
            },
            required: ['file'],
          },
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.CREATED]: {
      content: {
        'application/json': {
          schema: UploadFileResponseSchema,
        },
      },
      description: 'File uploaded successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const deleteKnowledgeFileRoute = createRoute({
  method: 'delete',
  path: '/projects/:id/knowledge/:fileId',
  tags: ['Project Knowledge'],
  summary: 'Delete file',
  description: 'Delete a knowledge file from project',
  request: {
    params: IdParamSchema.extend({
      fileId: z.string().openapi({
        param: { name: 'fileId', in: 'path' },
        description: 'Knowledge file identifier',
        example: 'file_abc123',
      }),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: DeleteResponseSchema,
        },
      },
      description: 'File deleted successfully',
    },
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

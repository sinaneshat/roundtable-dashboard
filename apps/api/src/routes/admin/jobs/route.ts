import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createApiResponseSchema, createProtectedRouteResponses, IdParamSchema } from '@/core';

import {
  CreateJobRequestSchema,
  DeleteJobQuerySchema,
  DeleteJobResponseSchema,
  JobCreatedResponseSchema,
  JobListQuerySchema,
  JobListResponseSchema,
  JobResponseSchema,
  UpdateJobRequestSchema,
} from './schema';

/**
 * Admin: List automated jobs
 */
export const listJobsRoute = createRoute({
  method: 'get',
  path: '/admin/jobs',
  tags: ['admin-jobs'],
  summary: 'List automated jobs (admin only)',
  description: 'List all automated jobs with optional status filter. Ordered by createdAt desc.',
  request: {
    query: JobListQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Jobs retrieved successfully',
      content: {
        'application/json': {
          schema: createApiResponseSchema(JobListResponseSchema),
        },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * Admin: Create automated job
 */
export const createJobRoute = createRoute({
  method: 'post',
  path: '/admin/jobs',
  tags: ['admin-jobs'],
  summary: 'Create automated job (admin only)',
  description: 'Create a new automated multi-round AI conversation. Job will be queued for background processing.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateJobRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.CREATED]: {
      description: 'Job created and queued',
      content: {
        'application/json': {
          schema: createApiResponseSchema(JobCreatedResponseSchema),
        },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * Admin: Get job by ID
 */
export const getJobRoute = createRoute({
  method: 'get',
  path: '/admin/jobs/:id',
  tags: ['admin-jobs'],
  summary: 'Get automated job details (admin only)',
  description: 'Get details of a specific automated job including thread slug.',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Job details retrieved',
      content: {
        'application/json': {
          schema: createApiResponseSchema(JobResponseSchema),
        },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * Admin: Update job (cancel, toggle public)
 */
export const updateJobRoute = createRoute({
  method: 'patch',
  path: '/admin/jobs/:id',
  tags: ['admin-jobs'],
  summary: 'Update automated job (admin only)',
  description: 'Update job settings - cancel a running job or toggle thread visibility.',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateJobRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Job updated',
      content: {
        'application/json': {
          schema: createApiResponseSchema(JobResponseSchema),
        },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * Admin: Delete job
 */
export const deleteJobRoute = createRoute({
  method: 'delete',
  path: '/admin/jobs/:id',
  tags: ['admin-jobs'],
  summary: 'Delete automated job (admin only)',
  description: 'Delete an automated job. Optionally delete the associated thread with deleteThread=true.',
  request: {
    params: IdParamSchema,
    query: DeleteJobQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Job deleted',
      content: {
        'application/json': {
          schema: createApiResponseSchema(DeleteJobResponseSchema),
        },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

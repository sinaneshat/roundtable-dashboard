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
  description: 'List all automated jobs with optional status filter. Ordered by createdAt desc.',
  method: 'get',
  path: '/admin/jobs',
  request: {
    query: JobListQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: createApiResponseSchema(JobListResponseSchema),
        },
      },
      description: 'Jobs retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'List automated jobs (admin only)',
  tags: ['admin-jobs'],
});

/**
 * Admin: Create automated job
 */
export const createJobRoute = createRoute({
  description: 'Create a new automated multi-round AI conversation. Job will be queued for background processing.',
  method: 'post',
  path: '/admin/jobs',
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
      content: {
        'application/json': {
          schema: createApiResponseSchema(JobCreatedResponseSchema),
        },
      },
      description: 'Job created and queued',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Create automated job (admin only)',
  tags: ['admin-jobs'],
});

/**
 * Admin: Get job by ID
 */
export const getJobRoute = createRoute({
  description: 'Get details of a specific automated job including thread slug.',
  method: 'get',
  path: '/admin/jobs/{id}',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: createApiResponseSchema(JobResponseSchema),
        },
      },
      description: 'Job details retrieved',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get automated job details (admin only)',
  tags: ['admin-jobs'],
});

/**
 * Admin: Update job (cancel, toggle public)
 */
export const updateJobRoute = createRoute({
  description: 'Update job settings - cancel a running job or toggle thread visibility.',
  method: 'patch',
  path: '/admin/jobs/{id}',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateJobRequestSchema,
        },
      },
    },
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: createApiResponseSchema(JobResponseSchema),
        },
      },
      description: 'Job updated',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Update automated job (admin only)',
  tags: ['admin-jobs'],
});

/**
 * Admin: Delete job
 */
export const deleteJobRoute = createRoute({
  description: 'Delete an automated job. Optionally delete the associated thread with deleteThread=true.',
  method: 'delete',
  path: '/admin/jobs/{id}',
  request: {
    params: IdParamSchema,
    query: DeleteJobQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: createApiResponseSchema(DeleteJobResponseSchema),
        },
      },
      description: 'Job deleted',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Delete automated job (admin only)',
  tags: ['admin-jobs'],
});

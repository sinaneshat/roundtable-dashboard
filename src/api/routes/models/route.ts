/**
 * Models API Routes
 *
 * Returns curated top 20 AI models with tier-based access control
 * All model data sourced from models-config.service.ts (single source of truth)
 */

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createPublicRouteResponses } from '@/api/core';

import { ListModelsResponseSchema } from './schema';

/**
 * List all models route
 *
 * GET /api/v1/models
 * Returns curated top 20 AI models with user-specific tier access information
 */
export const listModelsRoute = createRoute({
  method: 'get',
  path: '/models',
  tags: ['models'],
  summary: 'List curated AI models',
  description: 'Returns top 20 AI models from models-config.service.ts with tier-based access control and flagship model recommendations.',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Models retrieved successfully',
      content: {
        'application/json': {
          schema: ListModelsResponseSchema,
        },
      },
    },
    ...createPublicRouteResponses(),
  },
});

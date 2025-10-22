/**
 * Models API Routes
 *
 * Simplified OpenRouter models endpoint - returns all models
 */

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createPublicRouteResponses } from '@/api/core/response-schemas';

import { ListModelsResponseSchema } from './schema';

/**
 * List all models route
 *
 * GET /api/v1/models
 * Returns all available OpenRouter models (no filtering, no parameters)
 */
export const listModelsRoute = createRoute({
  method: 'get',
  path: '/models',
  tags: ['models'],
  summary: 'List all OpenRouter models',
  description: 'Fetch all available models from OpenRouter. Models are cached for 24 hours.',
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

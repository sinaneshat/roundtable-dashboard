/**
 * Models API Routes
 *
 * Dynamic OpenRouter models endpoints with OpenAPI documentation
 */

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import {
  ClearCacheResponseSchema,
  GetModelResponseSchema,
  ListModelsQuerySchema,
  ListModelsResponseSchema,
  ListProvidersResponseSchema,
  ModelIdParamSchema,
} from './schema';

/**
 * List all models route
 *
 * GET /api/v1/models
 */
export const listModelsRoute = createRoute({
  method: 'get',
  path: '/models',
  tags: ['models'],
  summary: 'List all OpenRouter models',
  description: 'Fetch all available models from OpenRouter with optional filtering. Models are cached for 1 hour.',
  request: {
    query: ListModelsQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Models retrieved successfully',
      content: {
        'application/json': {
          schema: ListModelsResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: { description: 'Bad Request' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

/**
 * Get single model by ID route
 *
 * GET /api/v1/models/:modelId
 */
export const getModelRoute = createRoute({
  method: 'get',
  path: '/models/{modelId}',
  tags: ['models'],
  summary: 'Get model by ID',
  description: 'Retrieve a specific model by its OpenRouter ID (URL encoded). Example: anthropic%2Fclaude-4',
  request: {
    params: ModelIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Model retrieved successfully',
      content: {
        'application/json': {
          schema: GetModelResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: 'Model not found',
    },
    [HttpStatusCodes.BAD_REQUEST]: { description: 'Bad Request' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

/**
 * List providers route
 *
 * GET /api/v1/models/providers
 */
export const listProvidersRoute = createRoute({
  method: 'get',
  path: '/models/providers',
  tags: ['models'],
  summary: 'List all model providers',
  description: 'Get a list of all model providers with their model counts',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Providers retrieved successfully',
      content: {
        'application/json': {
          schema: ListProvidersResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: { description: 'Bad Request' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

/**
 * Clear cache route
 *
 * POST /api/v1/models/cache/clear
 */
export const clearCacheRoute = createRoute({
  method: 'post',
  path: '/models/cache/clear',
  tags: ['models'],
  summary: 'Clear models cache',
  description: 'Force refresh of cached OpenRouter models (admin only)',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Cache cleared successfully',
      content: {
        'application/json': {
          schema: ClearCacheResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: { description: 'Bad Request' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

/**
 * API Keys Routes
 *
 * OpenAPI route definitions for API key management
 * Following patterns from billing/route.ts and chat/route.ts
 */

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import {
  createMutationRouteResponses,
  createProtectedRouteResponses,
} from '@/core';

import {
  ApiKeyIdParamSchema,
  CreateApiKeyRequestSchema,
  CreateApiKeyResponseSchema,
  DeleteApiKeyResponseSchema,
  GetApiKeyResponseSchema,
  ListApiKeysResponseSchema,
  UpdateApiKeyRequestSchema,
  UpdateApiKeyResponseSchema,
} from './schema';

// ============================================================================
// API Key Routes
// ============================================================================

/**
 * List all API keys for the current user
 * Protected route - requires authentication
 */
export const listApiKeysRoute = createRoute({
  description: 'Get all API keys for the authenticated user (without key values)',
  method: 'get',
  path: '/auth/api-keys',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ListApiKeysResponseSchema },
      },
      description: 'API keys retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'List API keys',
  tags: ['api-keys'],
});

/**
 * Get a specific API key by ID
 * Protected route - requires authentication
 */
export const getApiKeyRoute = createRoute({
  description: 'Get details of a specific API key (without key value)',
  method: 'get',
  path: '/auth/api-keys/:keyId',
  request: {
    params: ApiKeyIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: GetApiKeyResponseSchema },
      },
      description: 'API key retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get API key details',
  tags: ['api-keys'],
});

/**
 * Create a new API key
 * Protected route - requires authentication
 */
export const createApiKeyRoute = createRoute({
  description: 'Create a new API key (returns the key value once - save it!)',
  method: 'post',
  path: '/auth/api-keys',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateApiKeyRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    [HttpStatusCodes.CREATED]: {
      content: {
        'application/json': { schema: CreateApiKeyResponseSchema },
      },
      description: 'API key created successfully',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Create API key',
  tags: ['api-keys'],
});

/**
 * Update an existing API key
 * Protected route - requires authentication
 */
export const updateApiKeyRoute = createRoute({
  description: 'Update an existing API key settings',
  method: 'patch',
  path: '/auth/api-keys/:keyId',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateApiKeyRequestSchema,
        },
      },
      required: true,
    },
    params: ApiKeyIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: UpdateApiKeyResponseSchema },
      },
      description: 'API key updated successfully',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Update API key',
  tags: ['api-keys'],
});

/**
 * Delete an API key
 * Protected route - requires authentication
 */
export const deleteApiKeyRoute = createRoute({
  description: 'Delete an API key (this action cannot be undone)',
  method: 'delete',
  path: '/auth/api-keys/:keyId',
  request: {
    params: ApiKeyIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: DeleteApiKeyResponseSchema },
      },
      description: 'API key deleted successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Delete API key',
  tags: ['api-keys'],
});

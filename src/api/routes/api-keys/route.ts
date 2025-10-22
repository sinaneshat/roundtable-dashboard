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
} from '@/api/core/response-schemas';

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
  method: 'get',
  path: '/auth/api-keys',
  tags: ['api-keys'],
  summary: 'List API keys',
  description: 'Get all API keys for the authenticated user (without key values)',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'API keys retrieved successfully',
      content: {
        'application/json': { schema: ListApiKeysResponseSchema },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * Get a specific API key by ID
 * Protected route - requires authentication
 */
export const getApiKeyRoute = createRoute({
  method: 'get',
  path: '/auth/api-keys/:keyId',
  tags: ['api-keys'],
  summary: 'Get API key details',
  description: 'Get details of a specific API key (without key value)',
  request: {
    params: ApiKeyIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'API key retrieved successfully',
      content: {
        'application/json': { schema: GetApiKeyResponseSchema },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * Create a new API key
 * Protected route - requires authentication
 */
export const createApiKeyRoute = createRoute({
  method: 'post',
  path: '/auth/api-keys',
  tags: ['api-keys'],
  summary: 'Create API key',
  description: 'Create a new API key (returns the key value once - save it!)',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: CreateApiKeyRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.CREATED]: {
      description: 'API key created successfully',
      content: {
        'application/json': { schema: CreateApiKeyResponseSchema },
      },
    },
    ...createMutationRouteResponses(),
  },
});

/**
 * Update an existing API key
 * Protected route - requires authentication
 */
export const updateApiKeyRoute = createRoute({
  method: 'patch',
  path: '/auth/api-keys/:keyId',
  tags: ['api-keys'],
  summary: 'Update API key',
  description: 'Update an existing API key settings',
  request: {
    params: ApiKeyIdParamSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: UpdateApiKeyRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'API key updated successfully',
      content: {
        'application/json': { schema: UpdateApiKeyResponseSchema },
      },
    },
    ...createMutationRouteResponses(),
  },
});

/**
 * Delete an API key
 * Protected route - requires authentication
 */
export const deleteApiKeyRoute = createRoute({
  method: 'delete',
  path: '/auth/api-keys/:keyId',
  tags: ['api-keys'],
  summary: 'Delete API key',
  description: 'Delete an API key (this action cannot be undone)',
  request: {
    params: ApiKeyIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'API key deleted successfully',
      content: {
        'application/json': { schema: DeleteApiKeyResponseSchema },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

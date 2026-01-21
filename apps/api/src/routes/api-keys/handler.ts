/**
 * API Keys Route Handlers
 *
 * Request handlers for API key management
 * Manual API key generation with proper hashing
 * Following patterns from billing/handler.ts and chat/handler.ts
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import { createHandler, Responses } from '@/core';
import { getDbAsync } from '@/db';
import { apiKey as apiKeyTable } from '@/db/tables/auth';
import { auth } from '@/lib/auth/server';
import type { ApiEnv } from '@/types';

import type {
  createApiKeyRoute,
  deleteApiKeyRoute,
  getApiKeyRoute,
  listApiKeysRoute,
  updateApiKeyRoute,
} from './route';
import { ApiKeyIdParamSchema, CreateApiKeyRequestSchema, UpdateApiKeyRequestSchema } from './schema';

// ============================================================================
// API Key Handlers
// ============================================================================

/**
 * List all API keys for the authenticated user
 * Uses Better Auth's official API for consistency
 */
export const listApiKeysHandler: RouteHandler<typeof listApiKeysRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'listApiKeys',
  },
  async (c) => {
    // Verify authentication (ensures authenticated request)
    c.auth();

    // Use Better Auth's official API to list API keys
    // This ensures consistent response format and excludes sensitive key values
    const apiKeys = await auth.api.listApiKeys({
      headers: c.req.raw.headers, // Include headers for user context
    });

    return Responses.collection(c, apiKeys || []);
  },
);

/**
 * Get a specific API key by ID
 * Uses Better Auth's official API for ownership validation
 */
export const getApiKeyHandler: RouteHandler<typeof getApiKeyRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ApiKeyIdParamSchema,
    operationName: 'getApiKey',
  },
  async (c) => {
    // Verify authentication (ensures authenticated request)
    c.auth();
    const { keyId } = c.validated.params;

    // Use Better Auth's official API to get the API key
    // This ensures ownership validation and excludes sensitive key values
    const apiKey = await auth.api.getApiKey({
      query: { id: keyId },
      headers: c.req.raw.headers, // Include headers for user context
    });

    if (!apiKey) {
      throw createError.notFound('API key not found', ErrorContextBuilders.resourceNotFound('apiKey', keyId));
    }

    return Responses.ok(c, { apiKey });
  },
);

/**
 * Create a new API key
 * Uses Better Auth's server-side API to create keys with proper hashing
 */
export const createApiKeyHandler: RouteHandler<typeof createApiKeyRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: CreateApiKeyRequestSchema,
    operationName: 'createApiKey',
  },
  async (c) => {
    const { user } = c.auth();
    const body = c.validated.body;

    const db = await getDbAsync();

    // Check existing API key count (max 5 keys per user)
    const existingKeys = await db.query.apiKey.findMany({
      where: eq(apiKeyTable.userId, user.id),
    });

    if (existingKeys.length >= 5) {
      throw createError.badRequest('Maximum API key limit reached. You can only have 5 API keys.', ErrorContextBuilders.validation('apiKeys'));
    }

    // Use Better Auth's official API to create the API key
    // This ensures proper hashing and compatibility with Better Auth's validation
    const result = await auth.api.createApiKey({
      body: {
        name: body.name ?? undefined, // Convert null to undefined for Better Auth
        userId: user.id,
        expiresIn: body.expiresIn ? body.expiresIn * 24 * 60 * 60 : undefined, // Convert days to seconds
        remaining: body.remaining ?? undefined, // Convert null to undefined
        prefix: 'rpnd_',
        rateLimitEnabled: true,
        rateLimitTimeWindow: 1000 * 60 * 60 * 24, // 24 hours
        rateLimitMax: 1000, // 1000 requests per day
      },
    });

    if (!result) {
      throw createError.internal('Failed to create API key', ErrorContextBuilders.externalService('betterauth', 'createApiKey'));
    }

    // Better Auth returns the full API key object with the unhashed key value
    // This is the only time the key value is exposed
    return Responses.created(c, {
      apiKey: result,
    });
  },
);

/**
 * Update an existing API key
 * Uses Better Auth's official API for proper validation and consistency
 */
export const updateApiKeyHandler: RouteHandler<typeof updateApiKeyRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ApiKeyIdParamSchema,
    validateBody: UpdateApiKeyRequestSchema,
    operationName: 'updateApiKey',
  },
  async (c) => {
    const { user } = c.auth();
    const { keyId } = c.validated.params;
    const body = c.validated.body;

    // Use Better Auth's official API to update the API key
    // This ensures proper validation and maintains consistency
    const result = await auth.api.updateApiKey({
      body: {
        keyId,
        userId: user.id, // Server-only field for ownership verification
        name: body.name ?? undefined, // Convert null to undefined for Better Auth
        enabled: body.enabled,
        remaining: body.remaining ?? undefined, // Convert null to undefined
        refillAmount: body.refillAmount ?? undefined, // Convert null to undefined
        refillInterval: body.refillInterval ?? undefined, // Convert null to undefined
        rateLimitEnabled: body.rateLimitEnabled,
        rateLimitTimeWindow: body.rateLimitTimeWindow ?? undefined, // Convert null to undefined
        rateLimitMax: body.rateLimitMax ?? undefined, // Convert null to undefined
      },
    });

    if (!result) {
      throw createError.internal('Failed to update API key', ErrorContextBuilders.externalService('betterauth', 'updateApiKey'));
    }

    return Responses.ok(c, { apiKey: result });
  },
);

/**
 * Delete an API key
 * Uses Better Auth's official API for proper ownership validation
 */
export const deleteApiKeyHandler: RouteHandler<typeof deleteApiKeyRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ApiKeyIdParamSchema,
    operationName: 'deleteApiKey',
  },
  async (c) => {
    // Verify authentication (ensures authenticated request)
    c.auth();
    const { keyId } = c.validated.params;

    // Use Better Auth's official API to delete the API key
    // This ensures ownership validation and maintains consistency
    const result = await auth.api.deleteApiKey({
      body: {
        keyId,
      },
      headers: c.req.raw.headers, // Include headers for user context
    });

    if (!result?.success) {
      throw createError.internal('Failed to delete API key', ErrorContextBuilders.externalService('betterauth', 'deleteApiKey'));
    }

    return Responses.ok(c, { deleted: true });
  },
);

/**
 * API Keys Route Handlers
 *
 * Request handlers for API key management
 * Manual API key generation with proper hashing
 * Following patterns from billing/handler.ts and chat/handler.ts
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import { createHandler, Responses } from '@/api/core';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import { apiKey as apiKeyTable } from '@/db/tables/auth';

import type {
  createApiKeyRoute,
  deleteApiKeyRoute,
  getApiKeyRoute,
  listApiKeysRoute,
  updateApiKeyRoute,
} from './route';
import { CreateApiKeyRequestSchema } from './schema';

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Error Context Builders - Following billing/handler.ts pattern
 */
function createAuthErrorContext(operation?: string): ErrorContext {
  return {
    errorType: 'authentication',
    operation: operation || 'session_required',
  };
}

function createResourceNotFoundContext(
  resource: string,
  resourceId?: string,
): ErrorContext {
  return {
    errorType: 'resource',
    resource: resourceId,
    resourceId,
  };
}

function createAuthorizationErrorContext(
  resource: string,
  resourceId?: string,
): ErrorContext {
  return {
    errorType: 'authorization',
    resource: resourceId,
    resourceId,
  };
}

/**
 * Generate a secure random API key
 * Follows Better Auth's API key format: prefix + random string
 */
function generateApiKey(prefix = 'rpnd_', length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  const randomChars = Array.from(randomBytes)
    .map(byte => chars[byte % chars.length])
    .join('');

  return `${prefix}${randomChars}`;
}

/**
 * Hash API key using SHA-256
 * Async function to be compatible with Web Crypto API
 */
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// API Key Handlers
// ============================================================================

/**
 * List all API keys for the authenticated user
 */
export const listApiKeysHandler: RouteHandler<typeof listApiKeysRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'listApiKeys',
  },
  async (c) => {
    const user = c.get('user');

    if (!user) {
      throw createError.unauthenticated('Authentication required', createAuthErrorContext('listApiKeys'));
    }

    c.logger.info('Listing API keys for user', {
      logType: 'operation',
      operationName: 'listApiKeys',
      userId: user.id,
    });

    const db = await getDbAsync();

    // Query API keys for the user (exclude the hashed key field)
    const apiKeys = await db.query.apiKey.findMany({
      where: eq(apiKeyTable.userId, user.id),
      columns: {
        key: false, // Exclude hashed key from response
      },
    });

    c.logger.info('API keys listed successfully', {
      logType: 'operation',
      operationName: 'listApiKeys',
      resource: `${apiKeys.length} keys`,
    });

    return Responses.ok(c, { apiKeys });
  },
);

/**
 * Get a specific API key by ID
 */
export const getApiKeyHandler: RouteHandler<typeof getApiKeyRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getApiKey',
  },
  async (c) => {
    const user = c.get('user');
    const params = c.req.param();
    const keyId = params.keyId as string;

    if (!user) {
      throw createError.unauthenticated('Authentication required', createAuthErrorContext('getApiKey'));
    }

    if (!keyId) {
      throw createError.badRequest('API key ID is required', {
        errorType: 'validation',
        field: 'keyId',
      });
    }

    c.logger.info('Getting API key', {
      logType: 'operation',
      operationName: 'getApiKey',
      userId: user.id,
      resource: keyId,
    });

    const db = await getDbAsync();

    // Query API key (exclude hashed key)
    const apiKey = await db.query.apiKey.findFirst({
      where: eq(apiKeyTable.id, keyId),
      columns: {
        key: false, // Exclude hashed key
      },
    });

    if (!apiKey) {
      throw createError.notFound('API key not found', createResourceNotFoundContext('apiKey', keyId));
    }

    // Verify ownership
    if (apiKey.userId !== user.id) {
      throw createError.unauthenticated('Access denied to this API key', createAuthorizationErrorContext('apiKey', keyId));
    }

    c.logger.info('API key retrieved successfully', {
      logType: 'operation',
      operationName: 'getApiKey',
      resource: keyId,
    });

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

    c.logger.info('Creating API key', {
      logType: 'operation',
      operationName: 'createApiKey',
      userId: user.id,
      resource: body.name,
    });

    const db = await getDbAsync();

    // Check existing API key count (max 5 keys per user)
    const existingKeys = await db.query.apiKey.findMany({
      where: eq(apiKeyTable.userId, user.id),
    });

    if (existingKeys.length >= 5) {
      throw createError.badRequest('Maximum API key limit reached. You can only have 5 API keys.', {
        errorType: 'validation',
        field: 'apiKeys',
      });
    }

    // Generate API key
    const prefix = 'rpnd_';
    const apiKeyValue = generateApiKey(prefix, 64);
    const start = apiKeyValue.substring(0, 10); // First 10 chars for display

    // Hash the API key using SHA-256
    const hashedKey = await hashApiKey(apiKeyValue);

    // Calculate expiration date if provided
    const expiresAt = body.expiresIn
      ? new Date(Date.now() + body.expiresIn * 24 * 60 * 60 * 1000)
      : null;

    // Create API key record
    const [createdApiKey] = await db
      .insert(apiKeyTable)
      .values({
        id: ulid(),
        name: body.name,
        start,
        prefix,
        key: hashedKey,
        userId: user.id,
        enabled: true,
        remaining: body.remaining || null,
        rateLimitEnabled: true,
        rateLimitTimeWindow: 1000 * 60 * 60 * 24, // 24 hours
        rateLimitMax: 1000, // 1000 requests per day
        requestCount: 0,
        expiresAt,
        metadata: body.metadata ? JSON.stringify(body.metadata) : null,
        permissions: null,
        refillInterval: null,
        refillAmount: null,
        lastRefillAt: null,
        lastRequest: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!createdApiKey) {
      throw createError.internal('Failed to create API key', {
        errorType: 'database',
        operation: 'insert',
      });
    }

    c.logger.info('API key created successfully', {
      logType: 'operation',
      operationName: 'createApiKey',
      resource: createdApiKey.id,
    });

    // Return the created key WITH the raw key value (only time we return it)
    // Exclude the hashed key and include the unhashed key
    const apiKeyResponse = {
      ...createdApiKey,
      key: apiKeyValue, // Return unhashed key (only time we do this)
    };

    // Remove the hashed key from response
    delete (apiKeyResponse as { key?: string }).key;

    return Responses.created(c, {
      apiKey: {
        ...apiKeyResponse,
        key: apiKeyValue, // Explicitly set the unhashed key
      },
    });
  },
);

/**
 * Update an existing API key
 */
export const updateApiKeyHandler: RouteHandler<typeof updateApiKeyRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'updateApiKey',
  },
  async (c) => {
    const user = c.get('user');
    const params = c.req.param();
    const keyId = params.keyId as string;
    const body = await c.req.json();

    if (!user) {
      throw createError.unauthenticated('Authentication required', createAuthErrorContext('updateApiKey'));
    }

    if (!keyId) {
      throw createError.badRequest('API key ID is required', {
        errorType: 'validation',
        field: 'keyId',
      });
    }

    c.logger.info('Updating API key', {
      logType: 'operation',
      operationName: 'updateApiKey',
      userId: user.id,
      resource: keyId,
    });

    const db = await getDbAsync();

    // Check if key exists and verify ownership
    const existingKey = await db.query.apiKey.findFirst({
      where: eq(apiKeyTable.id, keyId),
    });

    if (!existingKey) {
      throw createError.notFound('API key not found', createResourceNotFoundContext('apiKey', keyId));
    }

    if (existingKey.userId !== user.id) {
      throw createError.unauthenticated('Access denied to this API key', createAuthorizationErrorContext('apiKey', keyId));
    }

    // Update the key
    const [updatedApiKey] = await db
      .update(apiKeyTable)
      .set({
        ...body,
        metadata: body.metadata ? JSON.stringify(body.metadata) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(apiKeyTable.id, keyId))
      .returning();

    if (!updatedApiKey) {
      throw createError.internal('Failed to update API key', {
        errorType: 'database',
        operation: 'update',
      });
    }

    c.logger.info('API key updated successfully', {
      logType: 'operation',
      operationName: 'updateApiKey',
      resource: keyId,
    });

    // Return updated key without the hashed key field
    const { key: _, ...apiKeyWithoutHash } = updatedApiKey;
    return Responses.ok(c, { apiKey: apiKeyWithoutHash });
  },
);

/**
 * Delete an API key
 */
export const deleteApiKeyHandler: RouteHandler<typeof deleteApiKeyRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'deleteApiKey',
  },
  async (c) => {
    const user = c.get('user');
    const params = c.req.param();
    const keyId = params.keyId as string;

    if (!user) {
      throw createError.unauthenticated('Authentication required', createAuthErrorContext('deleteApiKey'));
    }

    if (!keyId) {
      throw createError.badRequest('API key ID is required', {
        errorType: 'validation',
        field: 'keyId',
      });
    }

    c.logger.info('Deleting API key', {
      logType: 'operation',
      operationName: 'deleteApiKey',
      userId: user.id,
      resource: keyId,
    });

    const db = await getDbAsync();

    // Check if key exists and verify ownership
    const existingKey = await db.query.apiKey.findFirst({
      where: eq(apiKeyTable.id, keyId),
    });

    if (!existingKey) {
      throw createError.notFound('API key not found', createResourceNotFoundContext('apiKey', keyId));
    }

    if (existingKey.userId !== user.id) {
      throw createError.unauthenticated('Access denied to this API key', createAuthorizationErrorContext('apiKey', keyId));
    }

    // Delete the key
    await db
      .delete(apiKeyTable)
      .where(eq(apiKeyTable.id, keyId));

    c.logger.info('API key deleted successfully', {
      logType: 'operation',
      operationName: 'deleteApiKey',
      resource: keyId,
    });

    return Responses.ok(c, { success: true });
  },
);

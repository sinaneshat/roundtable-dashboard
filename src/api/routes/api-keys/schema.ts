/**
 * API Keys Route Schemas
 *
 * Zod schemas for API key management endpoints
 * Following patterns from billing/schema.ts and chat/schema.ts
 */

import { z } from '@hono/zod-openapi';

import { CoreSchemas, createApiResponseSchema } from '@/api/core/schemas';

// ============================================================================
// Path Parameter Schemas
// ============================================================================

export const ApiKeyIdParamSchema = z.object({
  keyId: CoreSchemas.id().openapi({
    description: 'API key ID',
    example: 'key_abc123xyz',
    param: {
      name: 'keyId',
      in: 'path',
    },
  }),
});

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Schema for creating a new API key
 */
export const CreateApiKeyRequestSchema = z.object({
  name: z.string().min(3).max(50).openapi({
    description: 'A descriptive name for the API key',
    example: 'My API Key',
  }),
  expiresIn: z.number().int().positive().min(1).max(365).optional().openapi({
    description: 'Expiration time in days (1-365, optional)',
    example: 30,
  }),
  remaining: z.number().int().positive().nullable().optional().openapi({
    description: 'Maximum number of requests (null for unlimited)',
    example: 1000,
  }),
  metadata: z.record(z.string(), z.unknown()).optional().nullable().openapi({
    description: 'Custom metadata for the API key',
    example: { environment: 'production', project: 'main' },
  }),
});

/**
 * Schema for updating an existing API key
 */
export const UpdateApiKeyRequestSchema = z.object({
  name: z.string().min(3).max(50).optional().openapi({
    description: 'Update the API key name',
    example: 'Updated API Key Name',
  }),
  enabled: z.boolean().optional().openapi({
    description: 'Enable or disable the API key',
    example: true,
  }),
  remaining: z.number().int().positive().nullable().optional().openapi({
    description: 'Update remaining requests (null for unlimited)',
    example: 5000,
  }),
  refillAmount: z.number().int().positive().nullable().optional().openapi({
    description: 'Amount to refill on each refill interval',
    example: 1000,
  }),
  refillInterval: z.number().int().positive().nullable().optional().openapi({
    description: 'Refill interval in milliseconds',
    example: 86400000, // 24 hours
  }),
  metadata: z.record(z.string(), z.unknown()).optional().nullable().openapi({
    description: 'Update custom metadata',
    example: { environment: 'staging' },
  }),
});

// ============================================================================
// Response Schemas
// ============================================================================

/**
 * API Key schema (without the actual key value)
 */
export const ApiKeySchema = z.object({
  id: z.string().openapi({ example: 'key_abc123xyz' }),
  name: z.string().nullable().openapi({ example: 'My API Key' }),
  start: z.string().nullable().openapi({
    description: 'First few characters of the key for identification',
    example: 'rpnd_abc',
  }),
  prefix: z.string().nullable().openapi({ example: 'rpnd_' }),
  userId: z.string().openapi({ example: 'user_123456' }),
  enabled: z.boolean().openapi({ example: true }),
  remaining: z.number().nullable().openapi({
    description: 'Remaining requests (null for unlimited)',
    example: 950,
  }),
  rateLimitEnabled: z.boolean().openapi({ example: true }),
  rateLimitTimeWindow: z.number().nullable().openapi({
    description: 'Rate limit time window in milliseconds',
    example: 86400000,
  }),
  rateLimitMax: z.number().nullable().openapi({
    description: 'Maximum requests in rate limit window',
    example: 1000,
  }),
  requestCount: z.number().openapi({ example: 50 }),
  lastRequest: z.string().nullable().openapi({ example: '2024-01-15T10:30:00Z' }),
  expiresAt: z.string().nullable().openapi({ example: '2024-12-31T23:59:59Z' }),
  createdAt: z.string().openapi({ example: '2024-01-01T00:00:00Z' }),
  updatedAt: z.string().openapi({ example: '2024-01-15T10:30:00Z' }),
  refillInterval: z.number().nullable().openapi({ example: 86400000 }),
  refillAmount: z.number().nullable().openapi({ example: 1000 }),
  lastRefillAt: z.string().nullable().openapi({ example: '2024-01-15T00:00:00Z' }),
  permissions: z.record(z.string(), z.array(z.string())).nullable().openapi({
    example: { chat: ['read', 'write'] },
  }),
  metadata: z.record(z.string(), z.unknown()).nullable().openapi({
    example: { environment: 'production' },
  }),
}).openapi('ApiKey');

/**
 * API Key with the actual key value (only returned on creation)
 */
export const ApiKeyWithKeySchema = ApiKeySchema.extend({
  key: z.string().openapi({
    description: 'The actual API key value (only shown once on creation)',
    example: 'rpnd_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
  }),
}).openapi('ApiKeyWithKey');

// ============================================================================
// API Response Schemas
// ============================================================================

export const ListApiKeysResponseSchema = createApiResponseSchema(
  z.object({
    apiKeys: z.array(ApiKeySchema),
  }).openapi('ListApiKeysPayload'),
).openapi('ListApiKeysResponse');

export const GetApiKeyResponseSchema = createApiResponseSchema(
  z.object({
    apiKey: ApiKeySchema,
  }).openapi('GetApiKeyPayload'),
).openapi('GetApiKeyResponse');

export const CreateApiKeyResponseSchema = createApiResponseSchema(
  z.object({
    apiKey: ApiKeyWithKeySchema,
  }).openapi('CreateApiKeyPayload'),
).openapi('CreateApiKeyResponse');

export const UpdateApiKeyResponseSchema = createApiResponseSchema(
  z.object({
    apiKey: ApiKeySchema,
  }).openapi('UpdateApiKeyPayload'),
).openapi('UpdateApiKeyResponse');

export const DeleteApiKeyResponseSchema = createApiResponseSchema(
  z.object({
    success: z.boolean(),
  }).openapi('DeleteApiKeyPayload'),
).openapi('DeleteApiKeyResponse');

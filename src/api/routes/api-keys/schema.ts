/* eslint-disable simple-import-sort/imports */
/**
 * API Keys Route Schemas
 *
 * ✅ REUSES: Database validation schemas from /src/db/validation/api-keys.ts
 * Following established patterns from chat/schema.ts and billing/schema.ts
 */

import { z } from '@hono/zod-openapi';

import { CoreSchemas, createApiResponseSchema } from '@/api/core/schemas';
import {
  apiKeySelectSchema,
  apiKeyIdParamSchema as dbApiKeyIdParamSchema,
  createApiKeyRequestSchema as dbCreateApiKeyRequestSchema,
  updateApiKeyRequestSchema as dbUpdateApiKeyRequestSchema,
} from '@/db/validation/api-keys';

// ============================================================================
// Path Parameter Schemas (Reusing Database Validation)
// ============================================================================

/**
 * ✅ REUSE: API key ID parameter from database validation
 * Extended with OpenAPI metadata
 */
export const ApiKeyIdParamSchema = dbApiKeyIdParamSchema
  .extend({
    keyId: CoreSchemas.id().openapi({
      description: 'API key ID',
      example: 'key_abc123xyz',
      param: {
        name: 'keyId',
        in: 'path',
      },
    }),
  })
  .openapi('ApiKeyIdParam');

// ============================================================================
// Request Body Schemas (Reusing Database Validation)
// ============================================================================

/**
 * ✅ REUSE: Create API key schema from database validation
 * Adds OpenAPI metadata to existing validation rules
 */
export const CreateApiKeyRequestSchema = z.object({
  name: dbCreateApiKeyRequestSchema.shape.name.openapi({
    description: 'A descriptive name for the API key',
    example: 'My API Key',
  }),
  expiresIn: dbCreateApiKeyRequestSchema.shape.expiresIn.openapi({
    description: 'Expiration time in days (1-365, optional)',
    example: 30,
  }),
  remaining: dbCreateApiKeyRequestSchema.shape.remaining.openapi({
    description: 'Maximum number of requests (null for unlimited)',
    example: 1000,
  }),
  metadata: dbCreateApiKeyRequestSchema.shape.metadata.openapi({
    description: 'Custom metadata for the API key',
    example: { environment: 'production', project: 'main' },
  }),
}).openapi('CreateApiKeyRequest');

/**
 * ✅ REUSE: Update API key schema from database validation
 * Adds OpenAPI metadata to existing validation rules (keyId excluded - comes from path)
 */
export const UpdateApiKeyRequestSchema = z.object({
  name: dbUpdateApiKeyRequestSchema.shape.name.openapi({
    description: 'Update the API key name',
    example: 'Updated API Key Name',
  }),
  enabled: dbUpdateApiKeyRequestSchema.shape.enabled.openapi({
    description: 'Enable or disable the API key',
    example: true,
  }),
  remaining: dbUpdateApiKeyRequestSchema.shape.remaining.openapi({
    description: 'Update remaining requests (null for unlimited)',
    example: 5000,
  }),
  refillAmount: dbUpdateApiKeyRequestSchema.shape.refillAmount.openapi({
    description: 'Amount to refill on each refill interval',
    example: 1000,
  }),
  refillInterval: dbUpdateApiKeyRequestSchema.shape.refillInterval.openapi({
    description: 'Refill interval in milliseconds',
    example: 86400000, // 24 hours
  }),
  metadata: dbUpdateApiKeyRequestSchema.shape.metadata.openapi({
    description: 'Update custom metadata',
    example: { environment: 'staging' },
  }),
  rateLimitEnabled: dbUpdateApiKeyRequestSchema.shape.rateLimitEnabled.openapi({
    description: 'Enable or disable rate limiting for this API key',
    example: true,
  }),
  rateLimitTimeWindow: dbUpdateApiKeyRequestSchema.shape.rateLimitTimeWindow.openapi({
    description: 'Rate limit time window in milliseconds',
    example: 86400000, // 24 hours
  }),
  rateLimitMax: dbUpdateApiKeyRequestSchema.shape.rateLimitMax.openapi({
    description: 'Maximum requests allowed within the time window',
    example: 1000,
  }),
}).openapi('UpdateApiKeyRequest');

// ============================================================================
// Response Schemas (Reusing Database Validation)
// ============================================================================

/**
 * ✅ REUSE: API Key schema from database validation
 * Picked fields for API response (excludes sensitive hashed key)
 */
export const ApiKeySchema = apiKeySelectSchema
  .omit({ key: true }) // Exclude hashed key from responses
  .extend({
    // Transform Date objects to ISO strings for API responses
    createdAt: z.coerce.date().transform(d => d.toISOString()).openapi({ example: '2024-01-01T00:00:00Z' }),
    updatedAt: z.coerce.date().transform(d => d.toISOString()).openapi({ example: '2024-01-15T10:30:00Z' }),
    expiresAt: z.coerce.date().nullable().transform(d => d?.toISOString() ?? null).openapi({ example: '2024-12-31T23:59:59Z' }),
    lastRequest: z.coerce.date().nullable().transform(d => d?.toISOString() ?? null).openapi({ example: '2024-01-15T10:30:00Z' }),
    lastRefillAt: z.coerce.date().nullable().transform(d => d?.toISOString() ?? null).openapi({ example: '2024-01-15T00:00:00Z' }),
  })
  .openapi('ApiKey');

/**
 * ✅ REUSE: API Key with the actual key value (only returned on creation)
 * Extends the base schema with the plaintext key
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

// ============================================================================
// TYPE EXPORTS FOR FRONTEND & BACKEND
// ============================================================================

export type ApiKey = z.infer<typeof ApiKeySchema>;
export type ApiKeyWithKey = z.infer<typeof ApiKeyWithKeySchema>;
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;
export type UpdateApiKeyRequest = z.infer<typeof UpdateApiKeyRequestSchema>;

/**
 * API Keys Route Schemas
 *
 * ✅ REUSES: Database validation schemas from /src/db/validation/api-keys.ts
 * Following established patterns from chat/schema.ts and billing/schema.ts
 */

import { z } from '@hono/zod-openapi';

import { CoreSchemas, createApiResponseSchema } from '@/api/core/schemas';
import {
  apiKeyInsertSchema,
  apiKeySelectSchema,
  apiKeyUpdateSchema,
} from '@/db/validation/api-keys';

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
}).openapi('ApiKeyIdParam');

// ============================================================================
// Request Body Schemas (Derived from Database Validation)
// ============================================================================

/**
 * ✅ REUSE: Create API key schema derived from insert schema
 * Pick only user-provided fields and refine validation
 */
export const CreateApiKeyRequestSchema = apiKeyInsertSchema
  .pick({
    name: true,
    metadata: true,
  })
  .extend({
    // Additional user-facing fields not in table
    name: z.string().min(3, 'Name must be at least 3 characters').max(50, 'Name must be at most 50 characters').openapi({
      description: 'A descriptive name for the API key',
      example: 'My API Key',
    }),
    expiresIn: z.number().int().positive().min(1, 'Expiration must be at least 1 day').max(365, 'Expiration cannot exceed 365 days').optional().openapi({
      description: 'Expiration time in days (1-365, optional)',
      example: 30,
    }),
    remaining: z.number().int().positive().nullable().optional().openapi({
      description: 'Maximum number of requests (null for unlimited)',
      example: 1000,
    }),
    metadata: z.record(z.string(), z.unknown()).nullable().optional().openapi({
      description: 'Custom metadata for the API key',
      example: { environment: 'production', project: 'main' },
    }),
  })
  .openapi('CreateApiKeyRequest');

/**
 * ✅ REUSE: Update API key schema derived from update schema
 * Pick relevant fields for API updates
 */
export const UpdateApiKeyRequestSchema = apiKeyUpdateSchema
  .pick({
    name: true,
    enabled: true,
    remaining: true,
    refillAmount: true,
    refillInterval: true,
    metadata: true,
    rateLimitEnabled: true,
    rateLimitTimeWindow: true,
    rateLimitMax: true,
  })
  .extend({
    name: z.string().min(3, 'Name must be at least 3 characters').max(50, 'Name must be at most 50 characters').optional().openapi({
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
    metadata: z.record(z.string(), z.unknown()).nullable().optional().openapi({
      description: 'Update custom metadata',
      example: { environment: 'staging' },
    }),
    rateLimitEnabled: z.boolean().optional().openapi({
      description: 'Enable or disable rate limiting for this API key',
      example: true,
    }),
    rateLimitTimeWindow: z.number().int().positive().nullable().optional().openapi({
      description: 'Rate limit time window in milliseconds',
      example: 86400000, // 24 hours
    }),
    rateLimitMax: z.number().int().positive().nullable().optional().openapi({
      description: 'Maximum requests allowed within the time window',
      example: 1000,
    }),
  })
  .openapi('UpdateApiKeyRequest');

// ============================================================================
// Response Schemas (Reusing Database Validation)
// ============================================================================

/**
 * ✅ REUSE: API Key schema from database validation
 * Picked fields for API response (excludes sensitive hashed key)
 * NO TRANSFORMS: Handler serializes dates to ISO strings, schema only validates
 */
export const ApiKeySchema = apiKeySelectSchema
  .omit({ key: true }) // Exclude hashed key from responses
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
    items: z.array(ApiKeySchema),
    count: z.number().int().nonnegative(),
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

/**
 * API response types
 * Note: Date objects are automatically serialized to ISO strings by Hono/JSON.stringify
 */
export type ApiKey = z.infer<typeof ApiKeySchema>;
export type ApiKeyWithKey = z.infer<typeof ApiKeyWithKeySchema>;
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;
export type UpdateApiKeyRequest = z.infer<typeof UpdateApiKeyRequestSchema>;

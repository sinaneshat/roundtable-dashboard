/**
 * API Key Validation Schemas
 *
 * Following drizzle-zod patterns from auth.ts, chat.ts, and usage.ts
 * Provides type-safe validation schemas for API key operations
 */

import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import { apiKey } from '../tables/auth';

// ============================================================================
// Base Drizzle-Zod Schemas
// ============================================================================

/**
 * Select schema - For reading API keys from database
 * Automatically infers all fields from the Drizzle table schema
 */
export const apiKeySelectSchema = createSelectSchema(apiKey);

/**
 * Insert schema - For creating new API keys
 * With validation refinements for business rules
 */
export const apiKeyInsertSchema = createInsertSchema(apiKey, {
  name: schema => schema.min(3, 'Name must be at least 3 characters').max(50, 'Name must be at most 50 characters'),
  remaining: schema => schema.positive().nullable(),
  refillAmount: schema => schema.positive().nullable(),
  refillInterval: schema => schema.positive().nullable(),
});

/**
 * Update schema - For modifying existing API keys
 * Makes all fields optional for partial updates with refinements
 */
export const apiKeyUpdateSchema = createUpdateSchema(apiKey, {
  name: schema => schema.min(3, 'Name must be at least 3 characters').max(50, 'Name must be at most 50 characters'),
  remaining: schema => schema.positive().nullable(),
  refillAmount: schema => schema.positive().nullable(),
  refillInterval: schema => schema.positive().nullable(),
});

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Inferred TypeScript types from Drizzle-Zod schemas
 * Use these throughout the application for type safety
 */
export type ApiKeySelect = z.infer<typeof apiKeySelectSchema>;
export type ApiKeyInsert = z.infer<typeof apiKeyInsertSchema>;
export type ApiKeyUpdate = z.infer<typeof apiKeyUpdateSchema>;

// ============================================================================
// Request Schemas (Derived from Drizzle-Zod)
// ============================================================================

/**
 * ✅ REUSE: Create API key schema derived from insert schema
 * Pick only user-provided fields and refine validation
 */
export const createApiKeyRequestSchema = apiKeyInsertSchema
  .pick({
    name: true,
    metadata: true,
  })
  .extend({
    // Additional user-facing fields not in table
    expiresIn: z.number().int().positive().min(1, 'Expiration must be at least 1 day').max(365, 'Expiration cannot exceed 365 days').optional(),
    remaining: z.number().int().positive().nullable().optional(),
  });

/**
 * ✅ REUSE: Update API key schema derived from update schema
 * Pick relevant fields for API updates
 */
export const updateApiKeyRequestSchema = apiKeyUpdateSchema
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
    keyId: z.string().min(1, 'API key ID is required'),
  });

/**
 * ✅ Simple param schema - no table mapping needed
 */
export const apiKeyIdParamSchema = z.object({
  keyId: z.string().min(1, 'API key ID is required'),
});

// ============================================================================
// Type Exports for API Operations
// ============================================================================

export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;
export type UpdateApiKeyRequest = z.infer<typeof updateApiKeyRequestSchema>;
export type ApiKeyIdParam = z.infer<typeof apiKeyIdParamSchema>;

// ============================================================================
// Response Type Helpers
// ============================================================================

/**
 * API Key response type (excludes sensitive hashed key)
 * Used when returning API keys to clients
 */
export type ApiKeyResponse = Omit<ApiKeySelect, 'key'>;

/**
 * API Key with unhashed key (only returned on creation)
 * Used when returning the newly created API key
 */
export type ApiKeyWithKey = ApiKeySelect & {
  key: string; // Unhashed key value
};

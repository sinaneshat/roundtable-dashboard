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
 * Automatically validates required fields and types
 */
export const apiKeyInsertSchema = createInsertSchema(apiKey);

/**
 * Update schema - For modifying existing API keys
 * Makes all fields optional for partial updates
 */
export const apiKeyUpdateSchema = createUpdateSchema(apiKey);

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
// Custom Validation Schemas for API Operations
// ============================================================================

/**
 * Schema for creating an API key via Better Auth
 * Includes only fields that users can provide
 */
export const createApiKeyRequestSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(50, 'Name must be at most 50 characters'),
  expiresIn: z.number().int().positive().min(1, 'Expiration must be at least 1 day').max(365, 'Expiration cannot exceed 365 days').optional(),
  remaining: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

/**
 * Schema for updating an API key via Better Auth
 * All fields are optional for partial updates
 */
export const updateApiKeyRequestSchema = z.object({
  keyId: z.string().min(1, 'API key ID is required'),
  name: z.string().min(3, 'Name must be at least 3 characters').max(50, 'Name must be at most 50 characters').optional(),
  enabled: z.boolean().optional(),
  remaining: z.number().int().positive().nullable().optional(),
  refillAmount: z.number().int().positive().nullable().optional(),
  refillInterval: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

/**
 * Schema for API key ID parameter
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

/**
 * API Key Validation Schemas
 *
 * ✅ DATABASE-ONLY: Pure Drizzle-Zod schemas derived from database tables
 * ❌ NO CUSTOM LOGIC: No API request schemas or response helpers
 *
 * For API-specific schemas (createApiKeyRequestSchema, etc.), see:
 * @/api/routes/api-keys/schema.ts
 */

import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import type { z } from 'zod';

import { apiKey } from '../tables/auth';
import { Refinements } from './refinements';

// ============================================================================
// Base Drizzle-Zod Schemas
// ============================================================================

export const apiKeySelectSchema = createSelectSchema(apiKey);

export const apiKeyInsertSchema = createInsertSchema(apiKey, {
  name: Refinements.shortName(),
  remaining: Refinements.positiveIntNullable(),
  refillAmount: Refinements.positiveIntNullable(),
  refillInterval: Refinements.positiveIntNullable(),
});

export const apiKeyUpdateSchema = createUpdateSchema(apiKey, {
  name: Refinements.shortNameOptional(),
  remaining: Refinements.positiveIntNullableOptional(),
  refillAmount: Refinements.positiveIntNullableOptional(),
  refillInterval: Refinements.positiveIntNullableOptional(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type ApiKeySelect = z.infer<typeof apiKeySelectSchema>;
export type ApiKeyInsert = z.infer<typeof apiKeyInsertSchema>;
export type ApiKeyUpdate = z.infer<typeof apiKeyUpdateSchema>;

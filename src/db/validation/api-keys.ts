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

// ============================================================================
// Base Drizzle-Zod Schemas
// ============================================================================

export const apiKeySelectSchema = createSelectSchema(apiKey);

export const apiKeyInsertSchema = createInsertSchema(apiKey, {
  name: schema => schema.min(3).max(50),
  remaining: schema => schema.positive().nullable(),
  refillAmount: schema => schema.positive().nullable(),
  refillInterval: schema => schema.positive().nullable(),
});

export const apiKeyUpdateSchema = createUpdateSchema(apiKey, {
  name: schema => schema.min(3).max(50).optional(),
  remaining: schema => schema.positive().nullable().optional(),
  refillAmount: schema => schema.positive().nullable().optional(),
  refillInterval: schema => schema.positive().nullable().optional(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type ApiKeySelect = z.infer<typeof apiKeySelectSchema>;
export type ApiKeyInsert = z.infer<typeof apiKeyInsertSchema>;
export type ApiKeyUpdate = z.infer<typeof apiKeyUpdateSchema>;

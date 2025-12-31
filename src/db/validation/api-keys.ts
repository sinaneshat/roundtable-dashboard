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
// Note: Field validation applied at API layer
// ============================================================================

export const apiKeySelectSchema = createSelectSchema(apiKey);
export const apiKeyInsertSchema = createInsertSchema(apiKey);
export const apiKeyUpdateSchema = createUpdateSchema(apiKey);

// ============================================================================
// Type Exports
// ============================================================================

export type ApiKeySelect = z.infer<typeof apiKeySelectSchema>;
export type ApiKeyInsert = z.infer<typeof apiKeyInsertSchema>;
export type ApiKeyUpdate = z.infer<typeof apiKeyUpdateSchema>;

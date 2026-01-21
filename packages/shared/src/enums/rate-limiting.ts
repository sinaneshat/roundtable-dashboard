/**
 * Rate Limiting Enums
 *
 * Enums for rate limiting configurations and presets.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// RATE_LIMIT_PRESET
// ============================================================================

// 1. ARRAY CONSTANT - Source of truth for values
export const RATE_LIMIT_PRESETS = [
  'upload',
  'download',
  'publicDownload',
  'read',
  'delete',
  'api',
  'auth',
  'organization',
  'ip',
] as const;

// 2. DEFAULT VALUE
export const DEFAULT_RATE_LIMIT_PRESET: RateLimitPreset = 'api';

// 3. ZOD SCHEMA - Runtime validation + OpenAPI docs
export const RateLimitPresetSchema = z.enum(RATE_LIMIT_PRESETS).openapi({
  description: 'Rate limit preset configuration identifier',
  example: 'auth',
});

// 4. TYPESCRIPT TYPE - Inferred from Zod schema
export type RateLimitPreset = z.infer<typeof RateLimitPresetSchema>;

// 5. CONSTANT OBJECT - For usage in code (prevents typos)
export const RateLimitPresets = {
  UPLOAD: 'upload' as const,
  DOWNLOAD: 'download' as const,
  PUBLIC_DOWNLOAD: 'publicDownload' as const,
  READ: 'read' as const,
  DELETE: 'delete' as const,
  API: 'api' as const,
  AUTH: 'auth' as const,
  ORGANIZATION: 'organization' as const,
  IP: 'ip' as const,
} as const;

export function isRateLimitPreset(value: unknown): value is RateLimitPreset {
  return RateLimitPresetSchema.safeParse(value).success;
}

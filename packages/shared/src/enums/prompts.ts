/**
 * Prompt Template Enums
 *
 * ✅ 5-PART PATTERN: Array, Default, Schema, Type, Object
 * Used for AI prompt placeholder types that indicate computation mode.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// PLACEHOLDER PREFIX (Prompt Template Computation Modes)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const PLACEHOLDER_PREFIXES = ['FROM_CONTEXT', 'COMPUTE', 'EXTRACT', 'OPTIONAL'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_PLACEHOLDER_PREFIX: PlaceholderPrefix = 'COMPUTE';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const PlaceholderPrefixSchema = z.enum(PLACEHOLDER_PREFIXES).openapi({
  description: 'Type of computation for AI prompt placeholder',
  example: 'COMPUTE',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type PlaceholderPrefix = z.infer<typeof PlaceholderPrefixSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const PlaceholderPrefixes = {
  /** Value should come from conversation/request context */
  FROM_CONTEXT: 'FROM_CONTEXT' as const,
  /** Value should be computed/analyzed from responses */
  COMPUTE: 'COMPUTE' as const,
  /** Value should be extracted from participant responses */
  EXTRACT: 'EXTRACT' as const,
  /** Optional value - may be null/undefined if not applicable */
  OPTIONAL: 'OPTIONAL' as const,
} as const;

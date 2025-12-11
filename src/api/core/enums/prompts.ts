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

export const PLACEHOLDER_PREFIXES = ['FROM_CONTEXT', 'COMPUTE', 'EXTRACT', 'OPTIONAL'] as const;

export const DEFAULT_PLACEHOLDER_PREFIX: PlaceholderPrefix = 'COMPUTE';

export const PlaceholderPrefixSchema = z.enum(PLACEHOLDER_PREFIXES).openapi({
  description: 'Type of computation for AI prompt placeholder',
  example: 'COMPUTE',
});

export type PlaceholderPrefix = z.infer<typeof PlaceholderPrefixSchema>;

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

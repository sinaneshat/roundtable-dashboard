/**
 * Data Part Schema - Type-safe custom data part validation
 *
 * @module lib/schemas/data-part-schema
 */

import { z } from 'zod';

// ============================================================================
// DATA PART SCHEMA - Single Source of Truth
// ============================================================================

/**
 * Zod schema for custom data parts in AI messages
 * Used for type-safe validation of custom data-* message parts
 *
 * NOTE: data field intentionally uses z.unknown() - custom data parts
 * can contain any JSON-serializable structure defined by the application
 */
export const DataPartSchema = z.object({
  data: z.unknown(),
  type: z.string().regex(/^data-/, {
    message: 'Custom data part type must start with "data-"',
  }),
});

/**
 * Type for custom data parts (inferred from schema)
 */
export type DataPart = z.infer<typeof DataPartSchema>;

/**
 * Type guard function using Zod validation
 * Use this instead of inline type guards
 */
export function isDataPart(value: unknown): value is DataPart {
  return DataPartSchema.safeParse(value).success;
}

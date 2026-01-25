/**
 * Type Guards and Runtime Type Checking Utilities
 *
 * SINGLE SOURCE OF TRUTH: Runtime type checking using Zod schemas
 * for TypeScript type narrowing without unsafe type assertions.
 *
 * Pattern: Each type guard has a corresponding Zod schema that is exported
 * alongside the guard function. Use z.safeParse() for validation.
 */

import { MessagePartTypes } from '@roundtable/shared';
import { z } from 'zod';

// ============================================================================
// BASIC SCHEMAS & TYPE GUARDS
// ============================================================================

/**
 * Schema for any plain object (not array, not null)
 * Note: z.record() doesn't distinguish null from objects, so we use a
 * custom refinement to ensure proper object type checking.
 */
export const ObjectSchema = z.custom<Record<string, unknown>>(
  (val): val is Record<string, unknown> =>
    typeof val === 'object' && val !== null && !Array.isArray(val),
);

export function isObject(value: unknown): value is Record<string, unknown> {
  return ObjectSchema.safeParse(value).success;
}

/**
 * Schema for non-empty string
 */
export const NonEmptyStringSchema = z.string().min(1);

export function isNonEmptyString(value: unknown): value is string {
  return NonEmptyStringSchema.safeParse(value).success;
}

/**
 * Check if value is a valid ErrorCode enum value
 */
export function isValidErrorCode(code: string, validCodes: readonly string[]): boolean {
  return validCodes.includes(code);
}

// ============================================================================
// OBJECT PROPERTY EXTRACTION
// ============================================================================

export function hasProperty<K extends string, T>(
  obj: unknown,
  key: K,
  guard: (value: unknown) => value is T,
): obj is Record<string, unknown> & Record<K, T> {
  if (!isObject(obj)) {
    return false;
  }

  return guard(obj[key]);
}

// ============================================================================
// DOMAIN-SPECIFIC SCHEMAS & TYPE GUARDS
// ============================================================================

/**
 * Schema for text part of a message
 */
export const TextPartSchema = z.object({
  type: z.literal(MessagePartTypes.TEXT),
  text: NonEmptyStringSchema,
}).strict();

export type TextPart = z.infer<typeof TextPartSchema>;

export function isTextPart(
  value: unknown,
): value is { type: typeof MessagePartTypes.TEXT; text: string } {
  return TextPartSchema.safeParse(value).success;
}

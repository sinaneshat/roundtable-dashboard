/**
 * Type Guards and Runtime Type Checking Utilities
 *
 * SINGLE SOURCE OF TRUTH: Runtime type checking using Zod schemas
 * for TypeScript type narrowing without unsafe type assertions.
 *
 * Pattern: Each type guard has a corresponding Zod schema that is exported
 * alongside the guard function. Use z.safeParse() for validation.
 */

import { MessagePartTypes } from '@roundtable/shared/enums';
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
 * Schema for Stripe metadata format - flat object with string values only
 */
export const StringRecordSchema = z.record(z.string(), z.string());

export function isStringRecord(value: unknown): value is Record<string, string> {
  return StringRecordSchema.safeParse(value).success;
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

/**
 * Schema for valid number (not NaN)
 */
export const NumberSchema = z.number().refine(n => !Number.isNaN(n));

export function isNumber(value: unknown): value is number {
  return NumberSchema.safeParse(value).success;
}

/**
 * Schema for positive integer (> 0)
 */
export const PositiveIntegerSchema = z.number().int().positive();

export function isPositiveInteger(value: unknown): value is number {
  return PositiveIntegerSchema.safeParse(value).success;
}

/**
 * Schema for non-negative integer (>= 0)
 */
export const NonNegativeIntegerSchema = z.number().int().nonnegative();

export function isNonNegativeInteger(value: unknown): value is number {
  return NonNegativeIntegerSchema.safeParse(value).success;
}

// ============================================================================
// OBJECT PROPERTY EXTRACTION
// ============================================================================

export function extractProperty<T>(
  obj: unknown,
  key: string,
  guard: (value: unknown) => value is T,
): T | undefined {
  if (!isObject(obj)) {
    return undefined;
  }

  const value = obj[key];
  return guard(value) ? value : undefined;
}

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
// ARRAY SCHEMAS & TYPE GUARDS
// ============================================================================

/**
 * Schema for any array
 */
export const ArraySchema = z.array(z.unknown());

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isArrayOf<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): value is T[] {
  if (!isArray(value)) {
    return false;
  }

  return value.every(guard);
}

/**
 * Creates a Zod schema for validating object shape
 * Use this instead of hasShape() when you need a reusable schema
 */
export function createShapeSchema<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape);
}

export function hasShape<T extends Record<string, unknown>>(
  value: unknown,
  shape: { [K in keyof T]: (v: unknown) => v is T[K] },
): value is T {
  if (!isObject(value)) {
    return false;
  }

  for (const key in shape) {
    if (!shape[key](value[key])) {
      return false;
    }
  }

  return true;
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
});

export type TextPart = z.infer<typeof TextPartSchema>;

export function isTextPart(
  value: unknown,
): value is { type: typeof MessagePartTypes.TEXT; text: string } {
  return TextPartSchema.safeParse(value).success;
}

/**
 * Schema for tool call
 */
export const ToolCallSchema = z.object({
  toolName: NonEmptyStringSchema,
  input: z.unknown(),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export function isToolCall(
  value: unknown,
): value is { toolName: string; input: unknown } {
  return ToolCallSchema.safeParse(value).success;
}

/**
 * Schema for Stripe payment method card details
 * ✅ JUSTIFIED .catchall(): Stripe SDK returns objects with additional fields
 * that vary by API version. We validate known fields and allow extras.
 * Using .catchall(z.unknown()) instead of .passthrough() for explicit intent.
 */
export const StripeCardSchema = z.object({
  brand: z.string().optional(),
  last4: z.string().optional(),
}).catchall(z.unknown());

export const StripePaymentMethodSchema = z.object({
  card: StripeCardSchema.optional().nullable(),
}).catchall(z.unknown());

export type StripePaymentMethod = z.infer<typeof StripePaymentMethodSchema>;

export function isStripePaymentMethod(
  value: unknown,
): value is { card?: { brand?: string; last4?: string } } {
  return StripePaymentMethodSchema.safeParse(value).success;
}

/**
 * Schema for subscription period timestamps
 * ✅ JUSTIFIED .catchall(): Stripe subscription objects have many fields.
 * We only validate the fields we need and allow extras.
 */
export const PeriodTimestampsSchema = z.object({
  current_period_start: NumberSchema.optional(),
  current_period_end: NumberSchema.optional(),
}).catchall(z.unknown());

export type PeriodTimestamps = z.infer<typeof PeriodTimestampsSchema>;

export function hasPeriodTimestamps(
  value: unknown,
): value is { current_period_start?: number; current_period_end?: number } {
  return PeriodTimestampsSchema.safeParse(value).success;
}

/**
 * Schema for billing cycle anchor
 * ✅ JUSTIFIED .catchall(): Stripe subscription objects have many fields.
 * We only validate the fields we need and allow extras.
 */
export const BillingCycleAnchorSchema = z.object({
  billing_cycle_anchor: NumberSchema.optional(),
}).catchall(z.unknown());

export type BillingCycleAnchor = z.infer<typeof BillingCycleAnchorSchema>;

export function hasBillingCycleAnchor(
  value: unknown,
): value is { billing_cycle_anchor?: number } {
  return BillingCycleAnchorSchema.safeParse(value).success;
}

// ============================================================================
// ZOD-BASED TYPE GUARD UTILITIES
// ============================================================================

export function createZodGuard<T extends z.ZodType>(
  schema: T,
): (value: unknown) => value is z.infer<T> {
  return (value: unknown): value is z.infer<T> => {
    return schema.safeParse(value).success;
  };
}

export function safeParse<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.infer<T> | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function filterArrayWithSchema<TSchema extends z.ZodType>(
  items: unknown[] | null | undefined,
  schema: TSchema,
): z.infer<TSchema>[] {
  if (!items || !isArray(items)) {
    return [];
  }

  return items
    .map(item => schema.safeParse(item))
    .filter((result): result is { success: true; data: z.infer<TSchema> } => result.success)
    .map(result => result.data);
}

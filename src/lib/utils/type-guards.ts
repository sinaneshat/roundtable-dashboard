/**
 * Type Guards and Runtime Type Checking Utilities
 *
 * SINGLE SOURCE OF TRUTH: Runtime type checking that provides TypeScript type narrowing
 * without unsafe type assertions.
 */

import type { z } from 'zod';

import { MessagePartTypes } from '@/api/core/enums';

// ============================================================================
// BASIC TYPE GUARDS
// ============================================================================

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard: Check if value is a Record<string, string> (Stripe metadata format)
 * Stripe metadata must be a flat object with string values only
 */
export function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isObject(value)) {
    return false;
  }
  // Verify all values are strings
  return Object.values(value).every(v => typeof v === 'string');
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
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
// ARRAY TYPE GUARDS
// ============================================================================

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
// DOMAIN-SPECIFIC TYPE GUARDS
// ============================================================================

export function isTextPart(
  value: unknown,
): value is { type: typeof MessagePartTypes.TEXT; text: string } {
  return hasShape(value, {
    type: (v): v is typeof MessagePartTypes.TEXT => v === MessagePartTypes.TEXT,
    text: isNonEmptyString,
  });
}

export function isToolCall(
  value: unknown,
): value is { toolName: string; input: unknown } {
  return hasShape(value, {
    toolName: isNonEmptyString,
    input: (_v): _v is unknown => true,
  });
}

export function isStripePaymentMethod(
  value: unknown,
): value is { card?: { brand?: string; last4?: string } } {
  if (!isObject(value)) {
    return false;
  }

  if ('card' in value) {
    return isObject(value.card) || value.card === undefined || value.card === null;
  }

  return true;
}

export function hasPeriodTimestamps(
  value: unknown,
): value is { current_period_start?: number; current_period_end?: number } {
  if (!isObject(value)) {
    return false;
  }

  const start = value.current_period_start;
  const end = value.current_period_end;

  if (start !== undefined && !isNumber(start)) {
    return false;
  }

  if (end !== undefined && !isNumber(end)) {
    return false;
  }

  return true;
}

export function hasBillingCycleAnchor(
  value: unknown,
): value is { billing_cycle_anchor?: number } {
  if (!isObject(value)) {
    return false;
  }

  const anchor = value.billing_cycle_anchor;
  return anchor === undefined || isNumber(anchor);
}

// ============================================================================
// ZOD-BASED TYPE GUARDS
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

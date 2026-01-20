/**
 * Type Guards and Runtime Type Checking Utilities
 *
 * SINGLE SOURCE OF TRUTH: Runtime type checking that provides TypeScript type narrowing
 * without unsafe type assertions.
 */

import { MessagePartTypes } from '@roundtable/shared';

// ============================================================================
// BASIC TYPE GUARDS
// ============================================================================

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
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
// DOMAIN-SPECIFIC TYPE GUARDS
// ============================================================================

export function isTextPart(
  value: unknown,
): value is { type: typeof MessagePartTypes.TEXT; text: string } {
  if (!isObject(value)) {
    return false;
  }

  const typed = value as { type?: unknown; text?: unknown };
  return typed.type === MessagePartTypes.TEXT && isNonEmptyString(typed.text);
}

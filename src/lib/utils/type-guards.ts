/**
 * Type Guards and Runtime Type Checking Utilities
 *
 * **SINGLE SOURCE OF TRUTH**: Runtime type checking that provides TypeScript type narrowing
 * without unsafe type assertions.
 *
 * Pattern: Check runtime values → Narrow TypeScript types automatically
 *
 * @module lib/utils/type-guards
 */

import type { z } from 'zod';

/**
 * Check if value is a non-null object
 * Type guard that narrows unknown to Record<string, unknown>
 *
 * @param value - Value to check
 * @returns True if value is an object (not null, not array)
 *
 * @example
 * ```typescript
 * function processData(data: unknown) {
 *   if (isObject(data)) {
 *     // data is now Record<string, unknown>
 *     const name = data.name; // ✅ No type assertion needed
 *   }
 * }
 * ```
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if value is a string
 * Type guard for string validation
 *
 * @param value - Value to check
 * @returns True if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if value is a number
 * Type guard for number validation
 *
 * @param value - Value to check
 * @returns True if value is a number (not NaN)
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Check if value is a positive integer
 * Type guard for integer validation
 *
 * @param value - Value to check
 * @returns True if value is a positive integer
 */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Check if value is a non-negative integer
 * Type guard for index/count validation
 *
 * @param value - Value to check
 * @returns True if value is a non-negative integer
 */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Extract property from object with type guard
 * Safely access object properties with TypeScript narrowing
 *
 * @param obj - Object to extract from
 * @param key - Property key
 * @param guard - Type guard function
 * @returns Property value if it matches the guard, undefined otherwise
 *
 * @example
 * ```typescript
 * const metadata: unknown = { roundNumber: 1 };
 * const round = extractProperty(metadata, 'roundNumber', isPositiveInteger);
 * // round is number | undefined (type-safe!)
 * ```
 */
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

/**
 * Extract string property from object
 * Convenience wrapper for extracting string fields
 *
 * @param obj - Object to extract from
 * @param key - Property key
 * @returns String value if present and valid, undefined otherwise
 */
export function extractStringProperty(obj: unknown, key: string): string | undefined {
  return extractProperty(obj, key, isNonEmptyString);
}

/**
 * Extract number property from object
 * Convenience wrapper for extracting number fields
 *
 * @param obj - Object to extract from
 * @param key - Property key
 * @returns Number value if present and valid, undefined otherwise
 */
export function extractNumberProperty(obj: unknown, key: string): number | undefined {
  return extractProperty(obj, key, isNumber);
}

/**
 * Check if object has property with specific type
 * Type guard that narrows object type to include the property
 *
 * @param obj - Object to check
 * @param key - Property key
 * @param guard - Type guard for property value
 * @returns True if object has property matching the guard
 *
 * @example
 * ```typescript
 * if (hasProperty(metadata, 'roundNumber', isPositiveInteger)) {
 *   // metadata is now Record<string, unknown> & { roundNumber: number }
 *   const round = metadata.roundNumber; // ✅ Type-safe access
 * }
 * ```
 */
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

/**
 * Check if value is an array
 * Type guard for array validation
 *
 * @param value - Value to check
 * @returns True if value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Check if value is an array of specific type
 * Type guard for typed array validation
 *
 * @param value - Value to check
 * @param guard - Type guard for array items
 * @returns True if value is an array with all items matching the guard
 *
 * @example
 * ```typescript
 * if (isArrayOf(data, isNonEmptyString)) {
 *   // data is now string[]
 *   const first = data[0]; // ✅ Type-safe string access
 * }
 * ```
 */
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
 * Check if value has specific properties with types
 * Type guard for object shape validation
 *
 * @param value - Value to check
 * @param shape - Object mapping property names to type guards
 * @returns True if value has all properties matching their guards
 *
 * @example
 * ```typescript
 * const isTextPart = (value: unknown) => {
 *   return hasShape(value, {
 *     type: (v) => v === 'text',
 *     text: isNonEmptyString
 *   });
 * };
 * ```
 */
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

/**
 * Type guard for text parts from AI SDK messages
 * Validates { type: 'text', text: string } structure
 *
 * @param value - Value to check
 * @returns True if value is a text part
 *
 * @example
 * ```typescript
 * const parts = message.parts?.filter(isTextPart);
 * // parts is now Array<{ type: 'text'; text: string }>
 * ```
 */
export function isTextPart(
  value: unknown,
): value is { type: 'text'; text: string } {
  return hasShape(value, {
    type: (v): v is 'text' => v === 'text',
    text: isNonEmptyString,
  });
}

/**
 * Type guard for tool call objects from AI SDK
 * Validates { toolName: string, input: unknown } structure
 *
 * @param value - Value to check
 * @returns True if value is a tool call
 */
export function isToolCall(
  value: unknown,
): value is { toolName: string; input: unknown } {
  return hasShape(value, {
    toolName: isNonEmptyString,
    input: (_v): _v is unknown => true, // input can be any type
  });
}

/**
 * Type guard for Stripe PaymentMethod objects
 * Validates basic PaymentMethod structure with card data
 *
 * @param value - Value to check
 * @returns True if value looks like a Stripe PaymentMethod
 */
export function isStripePaymentMethod(
  value: unknown,
): value is { card?: { brand?: string; last4?: string } } {
  if (!isObject(value)) {
    return false;
  }

  // PaymentMethod is valid if it's an object
  // card is optional, but if present must be an object
  if ('card' in value) {
    return isObject(value.card) || value.card === undefined || value.card === null;
  }

  return true;
}

/**
 * Type guard for objects with period timestamps
 * Validates { current_period_start?: number, current_period_end?: number }
 *
 * @param value - Value to check
 * @returns True if value has period timestamps
 */
export function hasPeriodTimestamps(
  value: unknown,
): value is { current_period_start?: number; current_period_end?: number } {
  if (!isObject(value)) {
    return false;
  }

  const start = value.current_period_start;
  const end = value.current_period_end;

  // Both must be numbers if present
  if (start !== undefined && !isNumber(start)) {
    return false;
  }

  if (end !== undefined && !isNumber(end)) {
    return false;
  }

  return true;
}

/**
 * Type guard for objects with billing_cycle_anchor
 * Validates { billing_cycle_anchor?: number }
 *
 * @param value - Value to check
 * @returns True if value has billing_cycle_anchor
 */
export function hasBillingCycleAnchor(
  value: unknown,
): value is { billing_cycle_anchor?: number } {
  if (!isObject(value)) {
    return false;
  }

  const anchor = value.billing_cycle_anchor;
  return anchor === undefined || isNumber(anchor);
}

/**
 * Create a Zod-based type guard
 * Wraps Zod schema validation in a TypeScript type guard
 *
 * @param schema - Zod schema to validate against
 * @returns Type guard function using the schema
 *
 * @example
 * ```typescript
 * const MessageSchema = z.object({
 *   id: z.string(),
 *   content: z.string()
 * });
 *
 * const isMessage = createZodGuard(MessageSchema);
 *
 * if (isMessage(data)) {
 *   // data is now { id: string, content: string }
 *   console.log(data.id);
 * }
 * ```
 */
export function createZodGuard<T extends z.ZodType>(
  schema: T,
): (value: unknown) => value is z.infer<T> {
  return (value: unknown): value is z.infer<T> => {
    return schema.safeParse(value).success;
  };
}

/**
 * Safely parse with Zod and return typed result or undefined
 * Convenience wrapper for Zod safeParse with undefined fallback
 *
 * @param schema - Zod schema to validate against
 * @param value - Value to parse
 * @returns Parsed value if valid, undefined otherwise
 *
 * @example
 * ```typescript
 * const user = safeParse(UserSchema, data);
 * if (user) {
 *   // user is typed and validated
 *   console.log(user.email);
 * }
 * ```
 */
export function safeParse<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.infer<T> | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

// ============================================================================
// STREAMING DATA TYPE GUARDS - Multi-AI Deliberation Framework
// ============================================================================

/**
 * Type guard for complete ContributorPerspective from streaming data
 * Validates all required fields exist during AI SDK streaming
 *
 * @param value - Value to check (typically from PartialObject during streaming)
 * @returns True if all required fields are present
 */
export function isCompleteContributorPerspective(value: unknown): value is {
  participantIndex: number;
  role: string;
  modelId: string;
  modelName: string;
  scorecard: Record<string, unknown>;
  stance: string;
  evidence: string[];
  vote: string;
} {
  if (!isObject(value))
    return false;

  return (
    isNumber(value.participantIndex)
    && isNonEmptyString(value.role)
    && isNonEmptyString(value.modelId)
    && isNonEmptyString(value.modelName)
    && isObject(value.scorecard)
    && isNonEmptyString(value.stance)
    && isArray(value.evidence)
    && isNonEmptyString(value.vote)
  );
}

/**
 * Type guard for complete AlternativeScenario from streaming data
 * Validates all required fields exist during AI SDK streaming
 *
 * @param value - Value to check
 * @returns True if all required fields are present
 */
export function isCompleteAlternativeScenario(value: unknown): value is {
  scenario: string;
  confidence: number;
} {
  if (!isObject(value))
    return false;

  return (
    isNonEmptyString(value.scenario)
    && isNumber(value.confidence)
  );
}

/**
 * Type guard for complete ConsensusAnalysis from streaming data
 * Validates all required fields exist during AI SDK streaming
 *
 * @param value - Value to check
 * @returns True if all required fields are present
 */
export function isCompleteConsensusAnalysis(value: unknown): value is {
  alignmentSummary: Record<string, unknown>;
  agreementHeatmap: unknown[];
  argumentStrengthProfile: Record<string, unknown>;
} {
  if (!isObject(value))
    return false;

  return (
    isObject(value.alignmentSummary)
    && isArray(value.agreementHeatmap)
    && isObject(value.argumentStrengthProfile)
  );
}

/**
 * Type guard for complete EvidenceAndReasoning from streaming data
 * Validates all required fields exist during AI SDK streaming
 *
 * @param value - Value to check
 * @returns True if all required fields are present
 */
export function isCompleteEvidenceAndReasoning(value: unknown): value is {
  reasoningThreads: unknown[];
  evidenceCoverage: unknown[];
} {
  if (!isObject(value))
    return false;

  return (
    isArray(value.reasoningThreads)
    && isArray(value.evidenceCoverage)
  );
}

/**
 * Type guard for complete RoundSummary from streaming data
 * Validates all required fields exist during AI SDK streaming
 *
 * @param value - Value to check
 * @returns True if all required fields are present
 */
export function isCompleteRoundSummary(value: unknown): value is {
  participation: Record<string, unknown>;
  keyThemes: string;
  unresolvedQuestions: string[];
  generated: string;
} {
  if (!isObject(value))
    return false;

  return (
    isObject(value.participation)
    && isNonEmptyString(value.keyThemes)
    && isArray(value.unresolvedQuestions)
    && isNonEmptyString(value.generated)
  );
}

/**
 * Filter streaming array to only complete ContributorPerspective items
 * Removes incomplete/undefined items during AI SDK streaming
 *
 * @param items - Array from streaming data (may contain undefined/partial items)
 * @returns Filtered array with only complete items
 *
 * @example
 * ```typescript
 * const validPerspectives = filterCompleteContributorPerspectives(contributorPerspectives);
 * // validPerspectives is now properly typed array
 * ```
 */
export function filterCompleteContributorPerspectives<T>(
  items: T,
): Array<{ participantIndex: number; role: string; modelId: string; modelName: string; scorecard: Record<string, unknown>; stance: string; evidence: string[]; vote: string }> {
  if (!isArray(items))
    return [];

  return items.filter(isCompleteContributorPerspective);
}

/**
 * Filter streaming array to only complete AlternativeScenario items
 * Removes incomplete/undefined items during AI SDK streaming
 *
 * @param items - Array from streaming data (may contain undefined/partial items)
 * @returns Filtered array with only complete items
 */
export function filterCompleteAlternatives<T>(
  items: T,
): Array<{ scenario: string; confidence: number }> {
  if (!isArray(items))
    return [];

  return items.filter(isCompleteAlternativeScenario);
}

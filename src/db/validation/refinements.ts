/**
 * Shared Refinement Utilities for Drizzle-Zod
 *
 * ✅ REUSABLE: Common validation patterns for database schemas
 * ✅ DRY: Single source of truth for validation logic with composition
 * ✅ OPTIMIZED: Base validators + composition helpers to eliminate duplication
 *
 * These refinement functions can be used with createInsertSchema and createUpdateSchema
 * to apply consistent validation across all database schemas.
 *
 * Example Usage:
 * ```ts
 * export const userInsertSchema = createInsertSchema(user, {
 *   email: Refinements.email(),
 *   name: Refinements.name(),
 *   image: Refinements.urlOptional(),
 * });
 * ```
 */

import type { z } from 'zod';

// ============================================================================
// Base Validators - Core validation logic without modifiers
// ============================================================================

/**
 * Base string validators
 * These functions define the core validation rules for string fields
 */
const stringValidators = {
  email: (schema: z.ZodString) => schema.email(),
  url: (schema: z.ZodString) => schema.url(),
  name: (schema: z.ZodString) => schema.min(1).max(100),
  shortName: (schema: z.ZodString) => schema.min(3).max(50),
  title: (schema: z.ZodString) => schema.min(1).max(200),
  description: (schema: z.ZodString) => schema.max(500),
  longDescription: (schema: z.ZodString) => schema.max(1000),
  content: (schema: z.ZodString) => schema.min(1),
  systemPrompt: (schema: z.ZodString) => schema.min(1),
  currencyCode: (schema: z.ZodString) => schema.length(3),
} as const;

/**
 * Base number validators
 * These functions define the core validation rules for numeric fields
 */
const numberValidators = {
  nonNegative: (schema: z.ZodNumber) => schema.min(0),
  positive: (schema: z.ZodNumber) => schema.min(1),
  nonNegativeInt: (schema: z.ZodNumber) => schema.int().min(0),
  positiveInt: (schema: z.ZodNumber) => schema.int().min(1),
  percentage: (schema: z.ZodNumber) => schema.min(0).max(100),
  priority: (schema: z.ZodNumber) => schema.min(0).max(100),
  temperature: (schema: z.ZodNumber) => schema.min(0).max(2),
} as const;

// ============================================================================
// Composition Helpers - Apply modifiers to validators
// ============================================================================

/**
 * Makes a validator return an optional result
 * Composes: validator(schema) -> validator(schema).optional()
 */
function withOptional<T extends z.ZodTypeAny>(
  validator: (schema: T) => z.ZodTypeAny,
) {
  return (schema: T) => validator(schema).optional();
}

/**
 * Makes a validator return a nullable result
 * Composes: validator(schema) -> validator(schema).nullable()
 */
function withNullable<T extends z.ZodTypeAny>(
  validator: (schema: T) => z.ZodTypeAny,
) {
  return (schema: T) => validator(schema).nullable();
}

/**
 * Makes a validator return an optional nullable result
 * Composes: validator(schema) -> validator(schema).nullable().optional()
 */
function withOptionalNullable<T extends z.ZodTypeAny>(
  validator: (schema: T) => z.ZodTypeAny,
) {
  return (schema: T) => validator(schema).nullable().optional();
}

/**
 * Wraps a validator in a function for the Refinements API
 * Converts: (schema) => result into () => (schema) => result
 */
function createRefinement<T extends z.ZodTypeAny>(
  validator: (schema: T) => z.ZodTypeAny,
) {
  return () => validator;
}

// ============================================================================
// Exported Refinements - Public API with composed validators
// ============================================================================

/**
 * Common refinement patterns for database validation
 * Each function returns a refinement callback compatible with drizzle-zod
 */
export const Refinements = {
  // ============================================================================
  // Text Refinements
  // ============================================================================

  /** Email validation refinement */
  email: createRefinement(stringValidators.email),
  /** Optional email validation refinement */
  emailOptional: createRefinement(withOptional(stringValidators.email)),

  /** URL validation refinement */
  url: createRefinement(stringValidators.url),
  /** Optional URL validation refinement */
  urlOptional: createRefinement(withOptional(stringValidators.url)),

  /** Name validation refinement (1-100 characters) */
  name: createRefinement(stringValidators.name),
  /** Optional name validation refinement */
  nameOptional: createRefinement(withOptional(stringValidators.name)),

  /** Short name validation refinement (3-50 characters) */
  shortName: createRefinement(stringValidators.shortName),
  /** Optional short name validation refinement */
  shortNameOptional: createRefinement(withOptional(stringValidators.shortName)),

  /** Title validation refinement (1-200 characters) */
  title: createRefinement(stringValidators.title),
  /** Optional title validation refinement */
  titleOptional: createRefinement(withOptional(stringValidators.title)),

  /** Description validation refinement (max 500 characters) */
  description: createRefinement(stringValidators.description),
  /** Optional description validation refinement */
  descriptionOptional: createRefinement(withOptional(stringValidators.description)),

  /** Long description validation refinement (max 1000 characters) */
  longDescription: createRefinement(stringValidators.longDescription),
  /** Optional long description validation refinement */
  longDescriptionOptional: createRefinement(withOptional(stringValidators.longDescription)),

  /** Content validation refinement (1+ characters) */
  content: createRefinement(stringValidators.content),
  /** Optional content validation refinement */
  contentOptional: createRefinement(withOptional(stringValidators.content)),

  /** System prompt validation refinement */
  systemPrompt: createRefinement(stringValidators.systemPrompt),
  /** Optional system prompt validation refinement */
  systemPromptOptional: createRefinement(withOptional(stringValidators.systemPrompt)),

  /** Currency code validation (ISO 4217 - 3 characters) */
  currencyCode: createRefinement(stringValidators.currencyCode),

  // ============================================================================
  // Numeric Refinements
  // ============================================================================

  /** Non-negative number refinement */
  nonNegative: createRefinement(numberValidators.nonNegative),
  /** Optional non-negative number refinement */
  nonNegativeOptional: createRefinement(withOptional(numberValidators.nonNegative)),

  /** Positive number refinement */
  positive: createRefinement(numberValidators.positive),
  /** Optional positive number refinement */
  positiveOptional: createRefinement(withOptional(numberValidators.positive)),

  /** Non-negative integer refinement */
  nonNegativeInt: createRefinement(numberValidators.nonNegativeInt),
  /** Optional non-negative integer refinement */
  nonNegativeIntOptional: createRefinement(withOptional(numberValidators.nonNegativeInt)),

  /** Positive integer refinement */
  positiveInt: createRefinement(numberValidators.positiveInt),
  /** Optional positive integer refinement */
  positiveIntOptional: createRefinement(withOptional(numberValidators.positiveInt)),

  /** Percentage refinement (0-100) */
  percentage: createRefinement(numberValidators.percentage),

  /** Priority refinement (0-100) */
  priority: createRefinement(numberValidators.priority),
  /** Optional priority refinement */
  priorityOptional: createRefinement(withOptional(numberValidators.priority)),

  /** Temperature refinement (0-2) */
  temperature: createRefinement(numberValidators.temperature),
  /** Optional temperature refinement */
  temperatureOptional: createRefinement(withOptional(numberValidators.temperature)),

  // ============================================================================
  // Nullable Variants - For nullable fields
  // ============================================================================

  /** Nullable positive number refinement */
  positiveNullable: createRefinement(withNullable(numberValidators.positive)),

  /** Nullable positive integer refinement */
  positiveIntNullable: createRefinement(withNullable(numberValidators.positiveInt)),

  /** Optional nullable positive number refinement */
  positiveNullableOptional: createRefinement(withOptionalNullable(numberValidators.positive)),

  /** Optional nullable positive integer refinement */
  positiveIntNullableOptional: createRefinement(withOptionalNullable(numberValidators.positiveInt)),
} as const;

/**
 * Export type-safe refinement function type
 * Can be used to type-check custom refinement functions
 */
export type RefinementFn<T extends z.ZodTypeAny = z.ZodTypeAny> = (schema: T) => z.ZodTypeAny;

/**
 * Unified Validation System - Context7 Best Practices
 *
 * Consolidates all validation logic into a single, type-safe system.
 * Replaces multiple validation files with consistent patterns.
 *
 * Features:
 * - Type-safe validation results
 * - Comprehensive error formatting
 * - Schema composition utilities
 * - Request validation helpers
 * - Business rule validators
 * - OpenAPI validation hook
 */

import type { Hook } from '@hono/zod-openapi';
import { z } from 'zod';

import type { ApiEnv } from '@/api/types';

import { validationError } from './responses';
import type { ErrorContext, ValidationError } from './schemas';
import { CoreSchemas, ErrorContextSchema, ValidationErrorSchema } from './schemas';

// ============================================================================
// VALIDATION RESULT TYPES (Context7 Pattern)
// ============================================================================

export function ValidationSuccessSchema<T>(dataSchema: z.ZodSchema<T>) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
  });
}

export type ValidationSuccess<T> = {
  readonly success: true;
  readonly data: T;
};

export const ValidationFailureSchema = z.object({
  success: z.literal(false),
  errors: z.array(ValidationErrorSchema),
});

export type ValidationFailure = z.infer<typeof ValidationFailureSchema>;

// ValidationResult is a discriminated union with generic data type
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Safe validation with detailed error information using native Zod
 */
export function validateWithSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map(issue => ({
      field: issue.path.join('.') || 'root',
      message: issue.message,
      code: issue.code,
    })),
  };
}

/**
 * Create a validator function for a specific schema
 */
export function createValidator<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): ValidationResult<T> => {
    return validateWithSchema(schema, data);
  };
}

/**
 * Format validation errors into ErrorContext for API responses
 * Returns structured error context object for backend error handling
 */
export function formatValidationErrorContext(errors: ValidationError[]): ErrorContext {
  return {
    errorType: 'validation' as const,
    fieldErrors: errors.map(err => ({
      field: err.field,
      message: err.message,
      code: err.code,
    })),
  };
}

// ============================================================================
// SCHEMA COMPOSITION UTILITIES
// ============================================================================

/**
 * Create a partial version of a schema (all fields optional)
 */
export function createPartialSchema<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
) {
  return schema.partial();
}

/**
 * Create an update schema that omits certain fields
 *
 * NOTE: Zod v4 has strict Mask type requirements for omit/pick.
 * The double cast (as unknown as Mask) is required to satisfy TypeScript's structural typing.
 * This is a known Zod pattern for dynamic field selection - the runtime behavior is safe.
 */
export function createUpdateSchema<T extends z.ZodRawShape, K extends keyof T>(
  schema: z.ZodObject<T>,
  omitFields: readonly K[],
) {
  // Build the omit object with Zod v4 Mask type compatibility
  const omitObj = Object.fromEntries(
    omitFields.map(key => [key, true]),
  );
  // Double cast required for Zod v4's strict Mask type - runtime safe
  return schema.omit(omitObj as unknown as Parameters<typeof schema.omit>[0]);
}

/**
 * Create a pick schema with only specific fields
 *
 * NOTE: Zod v4 has strict Mask type requirements for omit/pick.
 * The double cast (as unknown as Mask) is required to satisfy TypeScript's structural typing.
 * This is a known Zod pattern for dynamic field selection - the runtime behavior is safe.
 */
export function createPickSchema<T extends z.ZodRawShape, K extends keyof T>(
  schema: z.ZodObject<T>,
  pickFields: readonly K[],
) {
  // Build the pick object with Zod v4 Mask type compatibility
  const pickObj = Object.fromEntries(
    pickFields.map(key => [key, true]),
  );
  // Double cast required for Zod v4's strict Mask type - runtime safe
  return schema.pick(pickObj as unknown as Parameters<typeof schema.pick>[0]);
}

/**
 * Filter value schema - type-safe union of allowed filter types
 * Used for dynamic query filters in search/list endpoints
 */
export const FilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]).openapi('FilterValue');

export type FilterValue = z.infer<typeof FilterValueSchema>;

/**
 * Create a search/filter schema with common patterns
 */
export function createSearchSchema<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  searchableFields: Array<keyof T>,
) {
  return z.object({
    // Pagination
    page: CoreSchemas.page(),
    limit: CoreSchemas.limit(),

    // Sorting
    sortBy: z.enum(searchableFields as [string, ...string[]]).optional(),
    sortOrder: CoreSchemas.sortOrder(),

    // Search
    search: z.string().min(1).optional(),

    // Dynamic filters based on schema fields using discriminated union
    ...Object.fromEntries(
      searchableFields.map(field => [
        `filter_${String(field)}`,
        FilterValueSchema.optional(),
      ]),
    ),
  });
}

// ============================================================================
// BUSINESS RULE VALIDATORS
// ============================================================================

/**
 * Security validation utilities
 */
export const SecurityValidators = {
  /**
   * Password strength validation
   */
  strongPassword: () =>
    z.string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/\d/, 'Password must contain at least one number')
      .regex(/\W/, 'Password must contain at least one special character'),

  /**
   * Safe string validation (prevents XSS)
   */
  safeString: (maxLength = 1000) =>
    z.string()
      .max(maxLength)
      .refine(str => !/<script/i.test(str), 'Script tags not allowed')
      .refine(str => !/javascript:/i.test(str), 'JavaScript URLs not allowed')
      .refine(str => !/on\w+\s*=/i.test(str), 'Event handlers not allowed')
      .transform(str => str
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>&"']/g, '') // Remove dangerous chars
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim(),
      )
      .refine(str => str.length > 0, 'Content required after sanitization'),

  /**
   * API key format validation
   */
  apiKey: () =>
    z.string()
      .min(32, 'API key must be at least 32 characters')
      .max(128, 'API key must not exceed 128 characters')
      .regex(/^[\w-]+$/, 'API key contains invalid characters'),
} as const;

// ============================================================================
// FILE UPLOAD VALIDATORS
// ============================================================================

/**
 * Create a file upload validator with type and size restrictions
 */
export function createFileUploadValidator(
  allowedTypes: string[],
  maxSizeBytes: number,
) {
  return z.object({
    name: z.string().min(1, 'File name is required'),
    size: z.number()
      .positive('File size must be positive')
      .max(maxSizeBytes, `File size cannot exceed ${Math.round(maxSizeBytes / 1024 / 1024)}MB`),
    type: z.string()
      .refine(
        type => allowedTypes.includes(type),
        `Only these file types are allowed: ${allowedTypes.join(', ')}`,
      ),
    content: z.string().min(1, 'File content is required'),
  });
}

/**
 * Document upload validator
 */
export const documentUploadValidator = createFileUploadValidator(
  [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  10 * 1024 * 1024, // 10MB
);

// ============================================================================
// CONDITIONAL VALIDATORS
// ============================================================================

/**
 * Conditional data schema - ensures object has the condition field
 * Used for field-based conditional validation
 */
export const ConditionalDataSchema = z.record(z.string(), FilterValueSchema).openapi('ConditionalData');

export type ConditionalData = z.infer<typeof ConditionalDataSchema>;

/**
 * Conditional value type - inferred from FilterValueSchema
 * Represents allowed values for conditional validation
 */
export type ConditionalValue = FilterValue;

/**
 * Create a conditional validator based on another field
 *
 * Uses Zod schema validation for maximum type safety
 */
export function createConditionalValidator<T, K extends string>(
  conditionField: K,
  conditionValue: ConditionalValue,
  schema: z.ZodSchema<T>,
  fallbackSchema?: z.ZodSchema<T>,
) {
  return ConditionalDataSchema.refine(
    (data) => {
      if (conditionField in data && data[conditionField] === conditionValue) {
        return schema.safeParse(data).success;
      }
      return fallbackSchema ? fallbackSchema.safeParse(data).success : true;
    },
    {
      message: `Validation failed for ${conditionField} = ${String(conditionValue)}`,
    },
  );
}

/**
 * Create a validator that accepts multiple formats
 */
export function createMultiFormatValidator<T>(
  validators: Array<z.ZodSchema<T>>,
  errorMessage?: string,
) {
  return z.union(
    validators as [z.ZodSchema<T>, z.ZodSchema<T>, ...z.ZodSchema<T>[]],
  ).describe(errorMessage ?? 'Invalid format');
}

// ============================================================================
// REQUEST VALIDATION HELPERS
// ============================================================================

/**
 * Validate request body with proper error formatting
 */
export function validateRequestBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown,
): ValidationResult<T> {
  return validateWithSchema(schema, body);
}

/**
 * Validate query parameters with coercion
 */
export function validateQueryParams<T>(
  schema: z.ZodSchema<T>,
  searchParams: URLSearchParams,
): ValidationResult<T> {
  const query = Object.fromEntries(searchParams.entries());
  return validateWithSchema(schema, query);
}

/**
 * Path parameters schema - string key-value pairs for route params
 */
export const PathParamsSchema = z.record(z.string(), z.string()).openapi('PathParams');

export type PathParams = z.infer<typeof PathParamsSchema>;

/**
 * Validate path parameters
 */
export function validatePathParams<T>(
  schema: z.ZodSchema<T>,
  params: PathParams,
): ValidationResult<T> {
  return validateWithSchema(schema, params);
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

/**
 * Create validation error context for API responses
 */
export function createValidationErrorContext(
  errors: ValidationError[],
  schemaName?: string,
): ErrorContext {
  return {
    errorType: 'validation' as const,
    fieldErrors: errors,
    schemaName,
  };
}

/**
 * Unknown input schema - accepts any value for initial validation
 */
export const UnknownInputSchema = z.unknown().openapi('UnknownInput');

export type UnknownInput = z.infer<typeof UnknownInputSchema>;

/**
 * Validate against ErrorContextSchema to ensure type safety
 */
export function validateErrorContext(context: UnknownInput): ValidationResult<ErrorContext> {
  return validateWithSchema(ErrorContextSchema, context);
}

// ============================================================================
// OPENAPI VALIDATION HOOK
// ============================================================================

export const customValidationHook: Hook<UnknownInput, ApiEnv, string, UnknownInput> = (result, c) => {
  if (!result.success) {
    // 🔍 DEBUG: Log validation failures to identify the issue
    console.error('[VALIDATION-HOOK] Validation failed:', {
      path: c.req.path,
      issues: result.error.issues.slice(0, 5).map(i => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    });

    // Transform Zod issues to ValidationError format
    const errors = result.error.issues.map((err: z.ZodIssue) => ({
      field: err.path.join('.') || 'root',
      message: err.message,
      code: err.code,
    }));

    // Use pre-built response architecture for consistency
    return validationError(c, errors, 'Request validation failed');
  }
  // Validation passed - continue to handler
  return undefined;
};

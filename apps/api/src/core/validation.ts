import type { Hook } from '@hono/zod-openapi';
import * as z from 'zod';

import type { ApiEnv } from '@/types';

import { validationError } from './responses';
import type { ErrorContext, ValidationError } from './schemas';
import { CoreSchemas, ErrorContextSchema, ValidationErrorSchema } from './schemas';

// ============================================================================
// VALIDATION RESULT TYPES (Context7 Pattern)
// ============================================================================

export function ValidationSuccessSchema<T>(dataSchema: z.ZodSchema<T>) {
  return z.object({
    data: dataSchema,
    success: z.literal(true),
  });
}

export type ValidationSuccess<T> = {
  readonly success: true;
  readonly data: T;
};

export const ValidationFailureSchema = z.object({
  errors: z.array(ValidationErrorSchema),
  success: z.literal(false),
});

export type ValidationFailure = z.infer<typeof ValidationFailureSchema>;

// ValidationResult is a discriminated union with generic data type
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

export function validateWithSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { data: result.data, success: true };
  }

  return {
    errors: result.error.issues.map(issue => ({
      code: issue.code,
      field: issue.path.join('.') || 'root',
      message: issue.message,
    })),
    success: false,
  };
}

export function createValidator<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): ValidationResult<T> => {
    return validateWithSchema(schema, data);
  };
}

export function formatValidationErrorContext(errors: ValidationError[]): ErrorContext {
  return {
    errorType: 'validation' as const,
    fieldErrors: errors.map(err => ({
      code: err.code,
      field: err.field,
      message: err.message,
    })),
  };
}

// ============================================================================
// SCHEMA COMPOSITION UTILITIES
// ============================================================================

export function createPartialSchema<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
) {
  return schema.partial();
}

/**
 * Creates a schema with specified fields omitted
 * Use for creating update/partial schemas from base schemas
 * Note: Different from drizzle-zod's createUpdateSchema which derives from table
 *
 * ✅ JUSTIFIED TYPE ASSERTIONS: Zod's .omit() expects a specific type signature
 * {[key: K]: true} but TypeScript cannot infer that reduce() produces this exact
 * shape. The omitRecord is built from K[], so it's guaranteed to have all K keys.
 * The final cast matches Zod's API expectations.
 */
export function createOmitSchema<T extends z.ZodRawShape, K extends keyof T>(
  schema: z.ZodObject<T>,
  omitFields: readonly K[],
) {
  // Build omit record with proper type inference using reduce
  const omitRecord = omitFields.reduce(
    (acc, key) => {
      acc[key] = true;
      return acc;
    },
    // ✅ JUSTIFIED: TypeScript needs explicit type for reduce accumulator;
    // result is always Record<K, true> when iterating over K[]
    {} as Record<K, true>,
  );

  // ✅ JUSTIFIED: Zod's omit signature requires specific type parameter;
  // omitRecord is guaranteed to match since it's built from K[]
  return schema.omit(omitRecord as Parameters<(typeof schema)['omit']>[0]);
}

/**
 * Creates a schema with only specified fields included
 *
 * ✅ JUSTIFIED TYPE ASSERTIONS: Same rationale as createOmitSchema.
 * Zod's .pick() expects {[key: K]: true} but TypeScript cannot infer
 * that reduce() produces this exact shape from K[].
 */
export function createPickSchema<T extends z.ZodRawShape, K extends keyof T>(
  schema: z.ZodObject<T>,
  pickFields: readonly K[],
) {
  // Build pick record with proper type inference using reduce
  const pickRecord = pickFields.reduce(
    (acc, key) => {
      acc[key] = true;
      return acc;
    },
    // ✅ JUSTIFIED: TypeScript needs explicit type for reduce accumulator;
    // result is always Record<K, true> when iterating over K[]
    {} as Record<K, true>,
  );

  // ✅ JUSTIFIED: Zod's pick signature requires specific type parameter;
  // pickRecord is guaranteed to match since it's built from K[]
  return schema.pick(pickRecord as Parameters<(typeof schema)['pick']>[0]);
}

export const FilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]).openapi('FilterValue');

export type FilterValue = z.infer<typeof FilterValueSchema>;

export function createSearchSchema<T extends z.ZodRawShape>(
  searchableFields: (keyof T)[],
) {
  return z.object({
    limit: CoreSchemas.limit(),
    // Pagination
    page: CoreSchemas.page(),

    // Search
    search: z.string().min(1).optional(),
    // Sorting
    sortBy: z.enum(searchableFields as [string, ...string[]]).optional(),

    sortOrder: CoreSchemas.sortOrder(),

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

export const SecurityValidators = {
  apiKey: () =>
    z.string()
      .min(32, 'API key must be at least 32 characters')
      .max(128, 'API key must not exceed 128 characters')
      .regex(/^[\w-]+$/, 'API key contains invalid characters'),

  safeString: (maxLength = 1000) =>
    z.string()
      .max(maxLength)
      .superRefine((str, ctx) => {
        if (/<script/i.test(str)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Script tags not allowed' });
        }
        if (/javascript:/i.test(str)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'JavaScript URLs not allowed' });
        }
        if (/on\w+\s*=/i.test(str)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Event handlers not allowed' });
        }
      })
      .transform(str => str
        .replace(/<[^>]*>/g, '')
        .replace(/[<>&"']/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
      )
      .refine(str => str.length > 0, 'Content required after sanitization'),

  strongPassword: () =>
    z.string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/\d/, 'Password must contain at least one number')
      .regex(/\W/, 'Password must contain at least one special character'),
} as const;

// ============================================================================
// FILE UPLOAD VALIDATORS
// ============================================================================

export function createFileUploadValidator(
  allowedTypes: string[],
  maxSizeBytes: number,
) {
  return z.object({
    content: z.string().min(1, 'File content is required'),
    name: z.string().min(1, 'File name is required'),
    size: z.number()
      .positive('File size must be positive')
      .max(maxSizeBytes, `File size cannot exceed ${Math.round(maxSizeBytes / 1024 / 1024)}MB`),
    type: z.string()
      .refine(
        type => allowedTypes.includes(type),
        `Only these file types are allowed: ${allowedTypes.join(', ')}`,
      ),
  });
}

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

export const ConditionalDataSchema = z.record(z.string(), FilterValueSchema).openapi('ConditionalData');

export type ConditionalData = z.infer<typeof ConditionalDataSchema>;

export type ConditionalValue = FilterValue;

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

export function createMultiFormatValidator<T>(
  validators: z.ZodSchema<T>[],
  errorMessage?: string,
) {
  return z.union(
    validators as [z.ZodSchema<T>, z.ZodSchema<T>, ...z.ZodSchema<T>[]],
  ).describe(errorMessage ?? 'Invalid format');
}

// ============================================================================
// REQUEST VALIDATION HELPERS
// ============================================================================

export function validateRequestBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown,
): ValidationResult<T> {
  return validateWithSchema(schema, body);
}

export function validateQueryParams<T>(
  schema: z.ZodSchema<T>,
  searchParams: URLSearchParams,
): ValidationResult<T> {
  const query = Object.fromEntries(searchParams.entries());
  return validateWithSchema(schema, query);
}

export const PathParamsSchema = z.record(z.string(), z.string()).openapi('PathParams');

export type PathParams = z.infer<typeof PathParamsSchema>;

export function validatePathParams<T>(
  schema: z.ZodSchema<T>,
  params: PathParams,
): ValidationResult<T> {
  return validateWithSchema(schema, params);
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

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

export const UnknownInputSchema = z.unknown().openapi('UnknownInput');

export type UnknownInput = z.infer<typeof UnknownInputSchema>;

export function validateErrorContext(context: UnknownInput): ValidationResult<ErrorContext> {
  return validateWithSchema(ErrorContextSchema, context);
}

// ============================================================================
// OPENAPI VALIDATION HOOK
// ============================================================================

export const customValidationHook: Hook<UnknownInput, ApiEnv, string, UnknownInput> = (result, c) => {
  if (!result.success) {
    console.error('[VALIDATION-HOOK] Validation failed:', {
      issues: result.error.issues.slice(0, 5).map(i => ({
        code: i.code,
        message: i.message,
        path: i.path.join('.'),
      })),
      path: c.req.path,
    });

    const errors = result.error.issues.map((err: z.ZodIssue) => ({
      code: err.code,
      field: err.path.join('.') || 'root',
      message: err.message,
    }));

    return validationError(c, errors, 'Request validation failed');
  }
  return undefined;
};

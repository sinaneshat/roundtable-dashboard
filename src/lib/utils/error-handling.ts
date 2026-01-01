/**
 * Error Handling Utilities - API Error Extraction and Display
 *
 * Provides utilities for extracting and displaying error messages from API responses.
 * All error structures are based on the backend API error format defined in @/api/core/schemas.ts
 *
 * Backend API Error Format:
 * ```typescript
 * {
 *   success: false,
 *   error: {
 *     code: ErrorCode,           // e.g., "VALIDATION_ERROR", "UNAUTHENTICATED"
 *     message: string,           // Human-readable error message
 *     details?: ErrorDetails,    // Optional additional details (typed)
 *     context?: ErrorContext,    // Type-safe error context
 *     validation?: Array<{       // Optional validation errors
 *       field: string,
 *       message: string,
 *       code?: string
 *     }>
 *   },
 *   meta?: {
 *     requestId?: string,
 *     timestamp?: string,
 *     correlationId?: string
 *   }
 * }
 * ```
 */

import { z } from 'zod';

import type { ErrorCode } from '@/api/core/enums';
import { ERROR_CODES } from '@/api/core/enums';
import type { ValidationError } from '@/api/core/schemas';
import { ValidationErrorSchema } from '@/api/core/schemas';

// Re-export for backwards compatibility (consumers should migrate to @/api/core)
export type { ValidationError };
export { ValidationErrorSchema };

// ============================================================================
// ERROR DETAILS SCHEMA (Typed structure instead of unknown)
// ============================================================================

/** Primitive value types allowed in error context */
type ErrorContextValue = string | number | boolean | null;

export const ErrorDetailsSchema = z.object({
  /** Original error name */
  errorName: z.string().optional(),
  /** Stack trace (development only) */
  stack: z.string().optional(),
  /** Error context type (for discriminated union) */
  errorType: z.string().optional(),
  /** Additional context data - typed as record of primitives */
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
}).optional();

export type ErrorDetails = z.infer<typeof ErrorDetailsSchema>;

// ============================================================================
// REQUEST META SCHEMA
// ============================================================================

export const RequestMetaSchema = z.object({
  requestId: z.string().optional(),
  timestamp: z.string().optional(),
  correlationId: z.string().optional(),
});

export type RequestMeta = z.infer<typeof RequestMetaSchema>;

// ============================================================================
// API ERROR DETAILS SCHEMA (Main exported type)
// ============================================================================

export const ApiErrorDetailsSchema = z.object({
  /** Main error message */
  message: z.string(),
  /** Error code (if available) - uses ErrorCode enum when valid */
  code: z.string().optional(),
  /** HTTP status code (if available) */
  status: z.number().int().positive().optional(),
  /** Validation errors (if any) */
  validationErrors: z.array(ValidationErrorSchema).optional(),
  /** Additional error details (typed) */
  details: ErrorDetailsSchema,
  /** Request metadata */
  meta: RequestMetaSchema.optional(),
});

export type ApiErrorDetails = z.infer<typeof ApiErrorDetailsSchema>;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if a string is a valid ErrorCode
 */
export function isValidErrorCode(code: string): code is ErrorCode {
  return ERROR_CODES.includes(code as ErrorCode);
}

/**
 * Type guard to check if an object has a string property
 */
function hasStringProperty(obj: object, key: string): boolean {
  return key in obj && typeof (obj as Record<string, unknown>)[key] === 'string';
}

/**
 * Type guard to check if value is non-null object
 */
function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Safely extract error details from context object
 */
function extractErrorDetails(context: unknown): ErrorDetails | undefined {
  if (!isNonNullObject(context)) {
    return undefined;
  }

  const details: NonNullable<ErrorDetails> = {};

  if (hasStringProperty(context, 'errorType')) {
    details.errorType = context.errorType as string;
  }

  // Extract primitive values into context record
  const contextRecord: Record<string, ErrorContextValue> = {};
  let hasContextValues = false;

  for (const [key, value] of Object.entries(context)) {
    if (key === 'errorType' || key === 'errorName' || key === 'stack') {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      contextRecord[key] = value;
      hasContextValues = true;
    }
  }

  if (hasContextValues) {
    details.context = contextRecord;
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

/**
 * Extract detailed error message from API error responses
 *
 * This function handles the standardized backend API error format.
 * It extracts error messages, codes, validation errors, and metadata
 * from API responses that follow the pattern defined in @/api/core/schemas.ts
 *
 * @param error - Error object from API call (typically from Hono client)
 * @returns Detailed error information
 *
 * @example
 * ```typescript
 * try {
 *   await createApiKey(data);
 * } catch (error) {
 *   const errorDetails = getApiErrorDetails(error);
 *   toast({
 *     variant: 'destructive',
 *     title: 'Failed to create API key',
 *     description: errorDetails.message,
 *   });
 *
 *   // Handle validation errors
 *   if (errorDetails.validationErrors) {
 *     errorDetails.validationErrors.forEach(err => {
 *       form.setError(err.field, { message: err.message });
 *     });
 *   }
 * }
 * ```
 */
export function getApiErrorDetails(error: unknown): ApiErrorDetails {
  // Handle null/undefined
  if (!error) {
    return { message: 'An unknown error occurred' };
  }

  // Handle string errors
  if (typeof error === 'string') {
    return { message: error };
  }

  // Handle non-object errors
  if (typeof error !== 'object' || error === null) {
    return { message: String(error) };
  }

  // ✅ TYPE-SAFE: Use type guard for error object
  const result: ApiErrorDetails = {
    message: 'An unknown error occurred',
  };

  // Try to extract HTTP status code from error object
  if ('status' in error && typeof error.status === 'number') {
    result.status = error.status;
  }

  // Try to extract status from nested response object (Hono client errors)
  if ('response' in error && typeof error.response === 'object' && error.response !== null) {
    if ('status' in error.response && typeof error.response.status === 'number' && !result.status) {
      result.status = error.response.status;
    }
  }

  // PRIMARY: Check for standardized API error response format
  // Format: { success: false, error: { code, message, context, validation }, meta }
  if ('error' in error && typeof error.error === 'object' && error.error !== null) {
    const apiError = error.error;

    // Extract error message (REQUIRED field in API error format)
    if ('message' in apiError && typeof apiError.message === 'string' && apiError.message.length > 0) {
      result.message = apiError.message;
    }

    // Extract error code (e.g., "VALIDATION_ERROR", "UNAUTHENTICATED")
    if ('code' in apiError && typeof apiError.code === 'string' && apiError.code.length > 0) {
      result.code = apiError.code;
    }

    // Extract validation errors array
    if ('validation' in apiError && Array.isArray(apiError.validation)) {
      result.validationErrors = apiError.validation
        .filter((v): v is { field?: unknown; message?: unknown; code?: unknown } => typeof v === 'object' && v !== null)
        .map(v => ({
          field: 'field' in v && typeof v.field === 'string' ? v.field : 'unknown',
          message: 'message' in v && typeof v.message === 'string' ? v.message : 'Validation failed',
          code: 'code' in v && typeof v.code === 'string' ? v.code : undefined,
        }));
    }

    // Extract additional error details using type-safe extraction
    if ('details' in apiError && apiError.details !== undefined) {
      result.details = extractErrorDetails(apiError.details);
    }

    // Extract error context (type-safe discriminated union in backend)
    // This is available for debugging but not typically shown to users
    if ('context' in apiError && isNonNullObject(apiError.context)) {
      // Context is available in result.details for advanced error handling
      result.details = result.details ?? extractErrorDetails(apiError.context);
    }
  }

  // FALLBACK: Check for direct message property (non-API standard errors)
  if (result.message === 'An unknown error occurred' && 'message' in error && typeof error.message === 'string' && error.message.length > 0) {
    // Filter out generic "HTTP error!" messages from Hono client
    if (!error.message.startsWith('HTTP error!')) {
      result.message = error.message;
    }

    // Extract code if available at top level
    if ('code' in error && typeof error.code === 'string' && error.code.length > 0) {
      result.code = error.code;
    }
  }

  // FALLBACK: Check for statusText as last resort
  if (result.message === 'An unknown error occurred' && 'statusText' in error && typeof error.statusText === 'string' && error.statusText.length > 0) {
    result.message = error.statusText;
  }

  // Extract metadata from API error response
  if ('meta' in error && typeof error.meta === 'object' && error.meta !== null) {
    const meta = error.meta;
    result.meta = {
      requestId: 'requestId' in meta && typeof meta.requestId === 'string' ? meta.requestId : undefined,
      timestamp: 'timestamp' in meta && typeof meta.timestamp === 'string' ? meta.timestamp : undefined,
      correlationId: 'correlationId' in meta && typeof meta.correlationId === 'string' ? meta.correlationId : undefined,
    };
  }

  // Add status code to message if available and message is still generic
  if (result.status && result.message === 'An unknown error occurred') {
    result.message = `Request failed with status ${result.status}`;
  }

  return result;
}

/**
 * Get a simple error message string from an error object
 * This is a convenience wrapper around getApiErrorDetails for simple cases
 *
 * @param error - Error object from API call
 * @param fallback - Fallback message if no error message can be extracted
 * @returns Error message string suitable for toast display
 *
 * @example
 * ```typescript
 * try {
 *   await createApiKey(data);
 * } catch (error) {
 *   toast({
 *     variant: 'destructive',
 *     title: 'Failed to create API key',
 *     description: getApiErrorMessage(error),
 *   });
 * }
 * ```
 */
export function getApiErrorMessage(error: unknown, fallback = 'An unknown error occurred'): string {
  const details = getApiErrorDetails(error);
  return details.message || fallback;
}

/**
 * Format validation errors into a readable string for frontend display
 * Useful for displaying multiple validation errors in a single toast
 *
 * @param validationErrors - Array of validation errors
 * @returns Formatted error message string
 *
 * @example
 * ```typescript
 * const errorDetails = getApiErrorDetails(error);
 * if (errorDetails.validationErrors && errorDetails.validationErrors.length > 0) {
 *   const message = formatValidationErrorsAsString(errorDetails.validationErrors);
 *   toast({
 *     variant: 'destructive',
 *     title: 'Validation failed',
 *     description: message,
 *   });
 * }
 * ```
 */
export function formatValidationErrorsAsString(
  validationErrors: ReadonlyArray<ValidationError>,
): string {
  if (!validationErrors || validationErrors.length === 0) {
    return 'Validation failed';
  }

  if (validationErrors.length === 1) {
    const firstError = validationErrors[0];
    return firstError ? firstError.message : 'Validation failed';
  }

  return validationErrors.map(err => `${err.field}: ${err.message}`).join('; ');
}

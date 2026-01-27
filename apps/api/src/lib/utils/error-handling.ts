import type { ErrorCode } from '@roundtable/shared/enums';
import { ERROR_CODES } from '@roundtable/shared/enums';
import * as z from 'zod';

import type { ValidationError } from '@/core/schemas';
import { ValidationErrorSchema } from '@/core/schemas';

import { isValidErrorCode } from './type-guards';

// ============================================================================
// ERROR MESSAGE CONSTANTS
// ============================================================================

const UNKNOWN_ERROR_MESSAGE = 'An unknown error occurred' as const;

// ============================================================================
// CLIENT ERROR DETAILS SCHEMA
// ============================================================================

// ClientErrorDetailsSchema: Used for parsing error responses on the frontend/client-side
// Note: Different from @/api/common/error-handling ErrorDetailsSchema which uses discriminated unions for API error construction
export const ClientErrorDetailsSchema = z.object({
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  errorName: z.string().optional(),
  errorType: z.string().optional(),
  stack: z.string().optional(),
}).optional();

export type ClientErrorDetails = z.infer<typeof ClientErrorDetailsSchema>;

type ErrorContextValue = string | number | boolean | null;

// ============================================================================
// REQUEST META SCHEMA
// ============================================================================

export const RequestMetaSchema = z.object({
  correlationId: z.string().optional(),
  requestId: z.string().optional(),
  timestamp: z.string().optional(),
});

export type RequestMeta = z.infer<typeof RequestMetaSchema>;

// ============================================================================
// API ERROR DETAILS SCHEMA
// ============================================================================

export const ApiErrorDetailsSchema = z.object({
  code: z.string().optional(),
  details: ClientErrorDetailsSchema,
  message: z.string(),
  meta: RequestMetaSchema.optional(),
  status: z.number().int().positive().optional(),
  validationErrors: z.array(ValidationErrorSchema).optional(),
});

export type ApiErrorDetails = z.infer<typeof ApiErrorDetailsSchema>;

// ============================================================================
// ERROR CODE VALIDATION
// ============================================================================

export function isErrorCode(code: string): code is ErrorCode {
  return isValidErrorCode(code, ERROR_CODES);
}

// ============================================================================
// ERROR DETAILS EXTRACTION SCHEMAS
// ============================================================================

/**
 * Schema for extracting errorType from context
 */
const ErrorTypeContextSchema = z.object({
  errorType: z.string().min(1),
}).partial();

/**
 * Schema for parsing context values that can be included in error details
 */
const ErrorContextValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * Schema for raw context object (allows any unknown values for filtering)
 */
const RawContextSchema = z.record(z.string(), z.unknown());

// ============================================================================
// ERROR DETAILS EXTRACTION
// ============================================================================

function extractErrorDetails(context: unknown) {
  const details: NonNullable<ClientErrorDetails> = {};

  // Extract errorType using Zod
  const errorTypeResult = ErrorTypeContextSchema.safeParse(context);
  if (errorTypeResult.success && errorTypeResult.data.errorType) {
    details.errorType = errorTypeResult.data.errorType;
  }

  // Extract and filter context values using Zod
  const rawContextResult = RawContextSchema.safeParse(context);
  if (rawContextResult.success) {
    const contextRecord: Record<string, ErrorContextValue> = {};
    let hasContextValues = false;

    for (const [key, value] of Object.entries(rawContextResult.data)) {
      if (key === 'errorType' || key === 'errorName' || key === 'stack') {
        continue;
      }
      const valueResult = ErrorContextValueSchema.safeParse(value);
      if (valueResult.success) {
        contextRecord[key] = valueResult.data;
        hasContextValues = true;
      }
    }

    if (hasContextValues) {
      details.context = contextRecord;
    }
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

// ============================================================================
// API ERROR PARSING SCHEMAS
// ============================================================================

/**
 * Schema for error objects with direct status field
 */
const ErrorWithStatusSchema = z.object({
  status: z.number().int().positive(),
}).partial();

/**
 * Schema for error objects with nested response.status
 */
const ErrorWithResponseStatusSchema = z.object({
  response: z.object({
    status: z.number().int().positive(),
  }).partial(),
}).partial();

/**
 * Schema for validation error items
 */
const ValidationErrorItemSchema = z.object({
  code: z.string().optional(),
  field: z.string().optional(),
  message: z.string().optional(),
}).partial();

/**
 * Schema for nested API error object
 */
const NestedApiErrorSchema = z.object({
  code: z.string().min(1).optional(),
  context: z.unknown().optional(),
  details: z.unknown().optional(),
  message: z.string().min(1).optional(),
  validation: z.array(z.unknown()).optional(),
}).partial();

/**
 * Schema for error objects with nested error field
 */
const ErrorWithNestedErrorSchema = z.object({
  error: z.unknown(),
}).partial();

/**
 * Schema for error objects with direct message field
 */
const ErrorWithMessageSchema = z.object({
  code: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  statusText: z.string().min(1).optional(),
}).partial();

/**
 * Schema for error meta information
 */
const ErrorMetaSchema = z.object({
  meta: z.object({
    correlationId: z.string().optional(),
    requestId: z.string().optional(),
    timestamp: z.string().optional(),
  }).partial(),
}).partial();

export function getApiErrorDetails(error: unknown): ApiErrorDetails {
  if (!error) {
    return { message: UNKNOWN_ERROR_MESSAGE };
  }

  // Handle string errors (may be stringified JSON)
  const stringResult = z.string().safeParse(error);
  if (stringResult.success) {
    try {
      const parsed: unknown = JSON.parse(stringResult.data);
      const objectCheck = z.object({}).passthrough().safeParse(parsed);
      if (objectCheck.success) {
        return getApiErrorDetails(parsed);
      }
    } catch {
      // Not valid JSON, treat as plain string message
    }
    return { message: stringResult.data };
  }

  // Handle non-objects
  const objectCheck = z.object({}).passthrough().safeParse(error);
  if (!objectCheck.success) {
    return { message: String(error) };
  }

  const result: ApiErrorDetails = {
    message: UNKNOWN_ERROR_MESSAGE,
  };

  // Extract direct status using Zod
  const statusResult = ErrorWithStatusSchema.safeParse(error);
  if (statusResult.success && statusResult.data.status) {
    result.status = statusResult.data.status;
  }

  // Extract response.status using Zod
  if (!result.status) {
    const responseStatusResult = ErrorWithResponseStatusSchema.safeParse(error);
    if (responseStatusResult.success && responseStatusResult.data.response?.status) {
      result.status = responseStatusResult.data.response.status;
    }
  }

  // Extract nested error object using Zod
  const nestedErrorResult = ErrorWithNestedErrorSchema.safeParse(error);
  if (nestedErrorResult.success && nestedErrorResult.data.error) {
    const apiErrorResult = NestedApiErrorSchema.safeParse(nestedErrorResult.data.error);
    if (apiErrorResult.success) {
      const apiError = apiErrorResult.data;

      if (apiError.message) {
        result.message = apiError.message;
      }

      if (apiError.code) {
        result.code = apiError.code;
      }

      // Parse validation errors using Zod
      if (apiError.validation && Array.isArray(apiError.validation)) {
        const validationErrors: ValidationError[] = [];
        for (const v of apiError.validation) {
          const validationResult = ValidationErrorItemSchema.safeParse(v);
          if (validationResult.success) {
            validationErrors.push({
              code: validationResult.data.code,
              field: validationResult.data.field ?? 'unknown',
              message: validationResult.data.message ?? 'Validation failed',
            });
          }
        }
        if (validationErrors.length > 0) {
          result.validationErrors = validationErrors;
        }
      }

      if (apiError.details !== undefined) {
        result.details = extractErrorDetails(apiError.details);
      }

      if (apiError.context !== undefined) {
        result.details = result.details ?? extractErrorDetails(apiError.context);
      }
    }
  }

  // Extract direct message using Zod
  if (result.message === UNKNOWN_ERROR_MESSAGE) {
    const messageResult = ErrorWithMessageSchema.safeParse(error);
    if (messageResult.success) {
      if (messageResult.data.message && !messageResult.data.message.startsWith('HTTP error!')) {
        result.message = messageResult.data.message;
      }

      if (messageResult.data.code) {
        result.code = messageResult.data.code;
      }

      if (result.message === UNKNOWN_ERROR_MESSAGE && messageResult.data.statusText) {
        result.message = messageResult.data.statusText;
      }
    }
  }

  // Extract meta using Zod
  const metaResult = ErrorMetaSchema.safeParse(error);
  if (metaResult.success && metaResult.data.meta) {
    result.meta = {
      correlationId: metaResult.data.meta.correlationId,
      requestId: metaResult.data.meta.requestId,
      timestamp: metaResult.data.meta.timestamp,
    };
  }

  if (result.status && result.message === UNKNOWN_ERROR_MESSAGE) {
    result.message = `Request failed with status ${result.status}`;
  }

  return result;
}

export function getApiErrorMessage(error: unknown, fallback: string = UNKNOWN_ERROR_MESSAGE): string {
  const details = getApiErrorDetails(error);
  return details.message || fallback;
}

export function formatValidationErrorsAsString(
  validationErrors: readonly ValidationError[],
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

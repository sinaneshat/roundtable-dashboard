import type { ErrorCode, ValidationError } from '@roundtable/shared';
import { ERROR_CODES, ValidationErrorSchema } from '@roundtable/shared';
import { z } from 'zod';

import { hasProperty, isNonEmptyString, isObject, isValidErrorCode } from './type-guards';

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
  errorName: z.string().optional(),
  stack: z.string().optional(),
  errorType: z.string().optional(),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
}).optional();

export type ClientErrorDetails = z.infer<typeof ClientErrorDetailsSchema>;

type ErrorContextValue = string | number | boolean | null;

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
// API ERROR DETAILS SCHEMA
// ============================================================================

export const ApiErrorDetailsSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  status: z.number().int().positive().optional(),
  validationErrors: z.array(ValidationErrorSchema).optional(),
  details: ClientErrorDetailsSchema,
  meta: RequestMetaSchema.optional(),
});

export type ApiErrorDetails = z.infer<typeof ApiErrorDetailsSchema>;

// ============================================================================
// ERROR CODE VALIDATION
// ============================================================================

export function isErrorCode(code: string): code is ErrorCode {
  return isValidErrorCode(code, ERROR_CODES);
}

// ============================================================================
// ERROR DETAILS EXTRACTION
// ============================================================================

function extractErrorDetails(context: unknown): ClientErrorDetails | undefined {
  if (!isObject(context)) {
    return undefined;
  }

  const details: NonNullable<ClientErrorDetails> = {};

  if (hasProperty(context, 'errorType', isNonEmptyString)) {
    details.errorType = context.errorType;
  }

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

export function getApiErrorDetails(error: unknown): ApiErrorDetails {
  if (!error) {
    return { message: UNKNOWN_ERROR_MESSAGE };
  }

  if (typeof error === 'string') {
    try {
      const parsed = JSON.parse(error);
      if (typeof parsed === 'object' && parsed !== null) {
        return getApiErrorDetails(parsed);
      }
    } catch {
      // Not valid JSON, treat as plain string message
    }
    return { message: error };
  }

  if (typeof error !== 'object' || error === null) {
    return { message: String(error) };
  }

  // Try to parse as fully-formed API error first
  const apiErrorParse = ApiErrorDetailsSchema.safeParse(error);
  if (apiErrorParse.success) {
    return apiErrorParse.data;
  }

  const result: ApiErrorDetails = {
    message: UNKNOWN_ERROR_MESSAGE,
  };

  // Extract status from top level or response object
  if ('status' in error && typeof error.status === 'number') {
    result.status = error.status;
  } else if ('response' in error && isObject(error.response) && 'status' in error.response && typeof error.response.status === 'number') {
    result.status = error.response.status;
  }

  // Handle nested error object structure
  if ('error' in error && isObject(error.error)) {
    const apiError = error.error;

    if ('message' in apiError && isNonEmptyString(apiError.message)) {
      result.message = apiError.message;
    }

    if ('code' in apiError && isNonEmptyString(apiError.code)) {
      result.code = apiError.code;
    }

    // Validate validation errors array
    if ('validation' in apiError && Array.isArray(apiError.validation)) {
      const validationParse = z.array(ValidationErrorSchema).safeParse(apiError.validation);
      if (validationParse.success) {
        result.validationErrors = validationParse.data;
      }
    }

    // Extract details or context
    if ('details' in apiError) {
      const detailsParse = ClientErrorDetailsSchema.safeParse(apiError.details);
      result.details = detailsParse.success ? detailsParse.data : extractErrorDetails(apiError.details);
    } else if ('context' in apiError && isObject(apiError.context)) {
      result.details = extractErrorDetails(apiError.context);
    }
  }

  // Fallback to top-level message if still unknown
  if (result.message === UNKNOWN_ERROR_MESSAGE && 'message' in error && isNonEmptyString(error.message)) {
    if (!error.message.startsWith('HTTP error!')) {
      result.message = error.message;
    }

    if ('code' in error && isNonEmptyString(error.code)) {
      result.code = error.code;
    }
  }

  // Fallback to statusText
  if (result.message === UNKNOWN_ERROR_MESSAGE && 'statusText' in error && isNonEmptyString(error.statusText)) {
    result.message = error.statusText;
  }

  // Parse request metadata
  if ('meta' in error && isObject(error.meta)) {
    const metaParse = RequestMetaSchema.safeParse(error.meta);
    if (metaParse.success) {
      result.meta = metaParse.data;
    }
  }

  // Final fallback for status-only errors
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

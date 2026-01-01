import { z } from 'zod';

import type { ErrorCode } from '@/api/core/enums';
import { ERROR_CODES } from '@/api/core/enums';
import type { ValidationError } from '@/api/core/schemas';
import { ValidationErrorSchema } from '@/api/core/schemas';

// ============================================================================
// ERROR DETAILS SCHEMA
// ============================================================================

type ErrorContextValue = string | number | boolean | null;

export const ErrorDetailsSchema = z.object({
  errorName: z.string().optional(),
  stack: z.string().optional(),
  errorType: z.string().optional(),
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
// API ERROR DETAILS SCHEMA
// ============================================================================

export const ApiErrorDetailsSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  status: z.number().int().positive().optional(),
  validationErrors: z.array(ValidationErrorSchema).optional(),
  details: ErrorDetailsSchema,
  meta: RequestMetaSchema.optional(),
});

export type ApiErrorDetails = z.infer<typeof ApiErrorDetailsSchema>;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isValidErrorCode(code: string): code is ErrorCode {
  return ERROR_CODES.includes(code as ErrorCode);
}

function hasStringProperty(obj: object, key: string): boolean {
  return key in obj && typeof (obj as Record<string, unknown>)[key] === 'string';
}

function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractErrorDetails(context: unknown): ErrorDetails | undefined {
  if (!isNonNullObject(context)) {
    return undefined;
  }

  const details: NonNullable<ErrorDetails> = {};

  if (hasStringProperty(context, 'errorType')) {
    details.errorType = context.errorType as string;
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
    return { message: 'An unknown error occurred' };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  if (typeof error !== 'object' || error === null) {
    return { message: String(error) };
  }

  const result: ApiErrorDetails = {
    message: 'An unknown error occurred',
  };

  if ('status' in error && typeof error.status === 'number') {
    result.status = error.status;
  }

  if ('response' in error && typeof error.response === 'object' && error.response !== null) {
    if ('status' in error.response && typeof error.response.status === 'number' && !result.status) {
      result.status = error.response.status;
    }
  }

  if ('error' in error && typeof error.error === 'object' && error.error !== null) {
    const apiError = error.error;

    if ('message' in apiError && typeof apiError.message === 'string' && apiError.message.length > 0) {
      result.message = apiError.message;
    }

    if ('code' in apiError && typeof apiError.code === 'string' && apiError.code.length > 0) {
      result.code = apiError.code;
    }

    if ('validation' in apiError && Array.isArray(apiError.validation)) {
      result.validationErrors = apiError.validation
        .filter((v): v is { field?: unknown; message?: unknown; code?: unknown } => typeof v === 'object' && v !== null)
        .map(v => ({
          field: 'field' in v && typeof v.field === 'string' ? v.field : 'unknown',
          message: 'message' in v && typeof v.message === 'string' ? v.message : 'Validation failed',
          code: 'code' in v && typeof v.code === 'string' ? v.code : undefined,
        }));
    }

    if ('details' in apiError && apiError.details !== undefined) {
      result.details = extractErrorDetails(apiError.details);
    }

    if ('context' in apiError && isNonNullObject(apiError.context)) {
      result.details = result.details ?? extractErrorDetails(apiError.context);
    }
  }

  if (result.message === 'An unknown error occurred' && 'message' in error && typeof error.message === 'string' && error.message.length > 0) {
    if (!error.message.startsWith('HTTP error!')) {
      result.message = error.message;
    }

    if ('code' in error && typeof error.code === 'string' && error.code.length > 0) {
      result.code = error.code;
    }
  }

  if (result.message === 'An unknown error occurred' && 'statusText' in error && typeof error.statusText === 'string' && error.statusText.length > 0) {
    result.message = error.statusText;
  }

  if ('meta' in error && typeof error.meta === 'object' && error.meta !== null) {
    const meta = error.meta;
    result.meta = {
      requestId: 'requestId' in meta && typeof meta.requestId === 'string' ? meta.requestId : undefined,
      timestamp: 'timestamp' in meta && typeof meta.timestamp === 'string' ? meta.timestamp : undefined,
      correlationId: 'correlationId' in meta && typeof meta.correlationId === 'string' ? meta.correlationId : undefined,
    };
  }

  if (result.status && result.message === 'An unknown error occurred') {
    result.message = `Request failed with status ${result.status}`;
  }

  return result;
}

export function getApiErrorMessage(error: unknown, fallback = 'An unknown error occurred'): string {
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

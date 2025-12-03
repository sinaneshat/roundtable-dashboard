/**
 * Unified Response System - Context7 Best Practices
 *
 * Consolidates all response builders into a single, type-safe system.
 * Replaces scattered response utilities with consistent patterns.
 *
 * Features:
 * - Type-safe response builders
 * - Consistent error formatting
 * - OpenAPI-compatible schemas
 * - Request/response correlation
 * - Performance metadata
 */

import type { Context } from 'hono';
import * as HttpStatusCodes from 'stoker/http-status-codes';
import type { z } from 'zod';

import type { DatabaseOperation, HealthStatus } from '@/api/core/enums';
import { HealthStatuses } from '@/api/core/enums';

import type { ApiResponse, CursorPaginatedResponse, ErrorContext, PaginatedResponse, ResponseMetadata } from './schemas';
import { ApiErrorResponseSchema, createApiResponseSchema, createPaginatedResponseSchema } from './schemas';
import type { ValidationError } from './validation';

// ============================================================================
// RESPONSE UTILITIES
// ============================================================================

/**
 * Extract correlation and request metadata from context
 */
function extractResponseMetadata(c: Context) {
  return {
    requestId: c.get('requestId'),
    timestamp: new Date().toISOString(),
    version: 'v1',
  };
}

/**
 * Get performance metrics from context if available
 */
function getPerformanceMetadata(c: Context) {
  const startTime = c.get('startTime');
  if (startTime) {
    return {
      duration: Date.now() - startTime,
      memoryUsage: process.memoryUsage().heapUsed,
    };
  }
  return {};
}

// ============================================================================
// SUCCESS RESPONSE BUILDERS
// ============================================================================

/**
 * Create a successful response with typed data
 */
export function ok<T>(
  c: Context,
  data: T,
  additionalMeta?: ResponseMetadata,
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      ...extractResponseMetadata(c),
      ...getPerformanceMetadata(c),
      ...additionalMeta,
    },
  };

  return c.json(response, HttpStatusCodes.OK);
}

/**
 * Create a created (201) response with typed data
 */
export function created<T>(
  c: Context,
  data: T,
  additionalMeta?: ResponseMetadata,
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      ...extractResponseMetadata(c),
      ...getPerformanceMetadata(c),
      ...additionalMeta,
    },
  };

  return c.json(response, HttpStatusCodes.CREATED);
}

/**
 * Create an accepted (202) response with typed data
 */
export function accepted<T>(
  c: Context,
  data: T,
  additionalMeta?: ResponseMetadata,
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      ...extractResponseMetadata(c),
      ...getPerformanceMetadata(c),
      ...additionalMeta,
    },
  };

  return c.json(response, HttpStatusCodes.ACCEPTED);
}

/**
 * Create a no content (204) response
 */
export function noContent(c: Context): Response {
  return new Response(null, {
    status: HttpStatusCodes.NO_CONTENT,
    headers: {
      'x-request-id': c.get('requestId') || '',
      'x-timestamp': new Date().toISOString(),
    },
  });
}

// ============================================================================
// PAGINATED RESPONSE BUILDER
// ============================================================================

/**
 * Create a page-based paginated response with typed items
 */
export function paginated<T>(
  c: Context,
  items: T[],
  pagination: {
    page: number;
    limit: number;
    total: number;
  },
  additionalMeta?: ResponseMetadata,
): Response {
  const paginationMeta = {
    ...pagination,
    pages: Math.ceil(pagination.total / pagination.limit),
    hasNext: pagination.page * pagination.limit < pagination.total,
    hasPrev: pagination.page > 1,
  };

  const response: PaginatedResponse<T> = {
    success: true,
    data: {
      items,
      pagination: paginationMeta,
    },
    meta: {
      ...extractResponseMetadata(c),
      ...(additionalMeta || {}),
    },
  };

  return c.json(response, HttpStatusCodes.OK);
}

/**
 * Create a cursor-based paginated response with typed items
 * Optimized for infinite scroll and React Query
 */
export function cursorPaginated<T>(
  c: Context,
  items: T[],
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    count: number;
  },
  additionalMeta?: ResponseMetadata,
): Response {
  const response: CursorPaginatedResponse<T> = {
    success: true,
    data: {
      items,
      pagination,
    },
    meta: {
      ...extractResponseMetadata(c),
      ...getPerformanceMetadata(c),
      ...additionalMeta,
    },
  };

  return c.json(response, HttpStatusCodes.OK);
}

// ============================================================================
// ERROR RESPONSE BUILDERS
// ============================================================================

/**
 * Create a validation error response
 */
export function validationError(
  c: Context,
  errors: ValidationError[],
  message = 'Validation failed',
  code = 'VALIDATION_ERROR',
): Response {
  const errorContext: ErrorContext = {
    errorType: 'validation',
    fieldErrors: errors,
  };

  const response = {
    success: false as const,
    error: {
      code,
      message,
      context: errorContext,
      validation: errors.map(err => ({
        field: err.field,
        message: err.message,
        code: err.code,
      })),
    },
    meta: {
      ...extractResponseMetadata(c),
      correlationId: c.get('correlationId'),
    },
  };

  // Validate response format
  const validation = ApiErrorResponseSchema.safeParse(response);
  if (!validation.success) {
    // Return internal server error to prevent malformed responses
    return internalServerError(c, 'Error response formatting failed');
  }

  return c.json(response, HttpStatusCodes.UNPROCESSABLE_ENTITY);
}

/**
 * Create an authentication error response
 */
export function authenticationError(
  c: Context,
  message = 'Authentication required',
  failureReason: 'invalid_credentials' | 'account_locked' | 'token_expired' | 'missing_token' = 'missing_token',
): Response {
  const errorContext: ErrorContext = {
    errorType: 'authentication',
    failureReason,
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
    userAgent: c.req.header('user-agent'),
  };

  const response = {
    success: false as const,
    error: {
      code: 'AUTHENTICATION_ERROR',
      message,
      context: errorContext,
    },
    meta: extractResponseMetadata(c),
  };

  return c.json(response, HttpStatusCodes.UNAUTHORIZED);
}

/**
 * Create an authorization error response
 */
export function authorizationError(
  c: Context,
  message = 'Insufficient permissions',
  requiredRole?: string,
): Response {
  const user = c.get('user');
  const errorContext: ErrorContext = {
    errorType: 'authentication', // Using authentication type as per schema
    failureReason: 'invalid_credentials',
    attemptedEmail: user?.email,
  };

  const response = {
    success: false as const,
    error: {
      code: 'AUTHORIZATION_ERROR',
      message,
      context: errorContext,
      details: { requiredRole, userId: user?.id },
    },
    meta: extractResponseMetadata(c),
  };

  return c.json(response, HttpStatusCodes.FORBIDDEN);
}

/**
 * Create a not found error response
 */
export function notFound(
  c: Context,
  resource = 'Resource',
  resourceId?: string,
): Response {
  const response = {
    success: false as const,
    error: {
      code: 'NOT_FOUND',
      message: `${resource} not found`,
      details: resourceId ? { resourceId } : undefined,
    },
    meta: extractResponseMetadata(c),
  };

  return c.json(response, HttpStatusCodes.NOT_FOUND);
}

/**
 * Create a conflict error response
 */
export function conflict(
  c: Context,
  message = 'Resource conflict',
  conflictingField?: string,
): Response {
  const response = {
    success: false as const,
    error: {
      code: 'CONFLICT',
      message,
      details: conflictingField ? { conflictingField } : undefined,
    },
    meta: extractResponseMetadata(c),
  };

  return c.json(response, HttpStatusCodes.CONFLICT);
}

/**
 * Create a rate limit error response
 */
export function rateLimitExceeded(
  c: Context,
  limit: number,
  windowMs: number,
  resetTime?: string,
): Response {
  const response = {
    success: false as const,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      details: { limit, windowMs, resetTime },
    },
    meta: extractResponseMetadata(c),
  };

  return c.json(response, HttpStatusCodes.TOO_MANY_REQUESTS);
}

/**
 * Create an external service error response
 */
export function externalServiceError(
  c: Context,
  serviceName: string,
  message = 'External service error',
  httpStatus?: number,
  responseTime?: number,
): Response {
  const errorContext: ErrorContext = {
    errorType: 'external_service',
    serviceName,
    httpStatus,
    responseTime,
  };

  const response = {
    success: false as const,
    error: {
      code: 'EXTERNAL_SERVICE_ERROR',
      message,
      context: errorContext,
    },
    meta: extractResponseMetadata(c),
  };

  return c.json(response, HttpStatusCodes.BAD_GATEWAY);
}

/**
 * Create a database error response
 */
export function databaseError(
  c: Context,
  operation: DatabaseOperation,
  message = 'Database operation failed',
  table?: string,
): Response {
  const errorContext: ErrorContext = {
    errorType: 'database',
    operation,
    table,
  };

  const response = {
    success: false as const,
    error: {
      code: 'DATABASE_ERROR',
      message,
      context: errorContext,
    },
    meta: extractResponseMetadata(c),
  };

  return c.json(response, HttpStatusCodes.INTERNAL_SERVER_ERROR);
}

/**
 * Create a generic bad request error response
 */
export function badRequest(
  c: Context,
  message = 'Bad request',
  details?: unknown,
): Response {
  const response = {
    success: false as const,
    error: {
      code: 'BAD_REQUEST',
      message,
      details,
    },
    meta: extractResponseMetadata(c),
  };

  return c.json(response, HttpStatusCodes.BAD_REQUEST);
}

/**
 * Create an internal server error response
 */
export function internalServerError(
  c: Context,
  message = 'Internal server error',
  component?: string,
): Response {
  const response = {
    success: false as const,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
      details: component ? { component } : undefined,
    },
    meta: {
      ...extractResponseMetadata(c),
      correlationId: c.get('correlationId'),
    },
  };

  return c.json(response, HttpStatusCodes.INTERNAL_SERVER_ERROR);
}

/**
 * Create a service unavailable error response
 */
export function serviceUnavailable(
  c: Context,
  message = 'Service temporarily unavailable',
  details?: unknown,
): Response {
  const response = {
    success: false as const,
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message,
      details,
    },
    meta: extractResponseMetadata(c),
  };

  return c.json(response, HttpStatusCodes.SERVICE_UNAVAILABLE);
}

// ============================================================================
// RESPONSE SCHEMA VALIDATORS
// ============================================================================

/**
 * Validate a success response against its schema
 */
export function validateSuccessResponse<T>(
  dataSchema: z.ZodSchema<T>,
  response: unknown,
): response is ApiResponse<T> {
  const schema = createApiResponseSchema(dataSchema);
  const result = schema.safeParse(response);
  return result.success;
}

/**
 * Validate a paginated response against its schema
 */
export function validatePaginatedResponse<T>(
  itemSchema: z.ZodSchema<T>,
  response: unknown,
): response is PaginatedResponse<T> {
  const schema = createPaginatedResponseSchema(itemSchema);
  const result = schema.safeParse(response);
  return result.success;
}

/**
 * Validate an error response against its schema
 */
export function validateErrorResponse(
  response: unknown,
): response is z.infer<typeof ApiErrorResponseSchema> {
  const result = ApiErrorResponseSchema.safeParse(response);
  return result.success;
}

// ============================================================================
// RESPONSE UTILITIES
// ============================================================================

/**
 * Create a response with custom status and headers
 */
export function customResponse<T>(
  c: Context,
  data: T,
  status: number,
  headers: Record<string, string> = {},
): Response {
  const response = {
    success: status < 400,
    data: status < 400 ? data : undefined,
    error: status >= 400 ? data : undefined,
    meta: extractResponseMetadata(c),
  };

  return c.json(response, status as 200 | 201 | 400 | 404 | 500, headers);
}

/**
 * Redirect response with proper headers
 */
export function redirect(
  c: Context,
  location: string,
  permanent = false,
): Response {
  const status = permanent
    ? HttpStatusCodes.MOVED_PERMANENTLY
    : HttpStatusCodes.MOVED_TEMPORARILY;

  return new Response(null, {
    status,
    headers: {
      'Location': location,
      'x-request-id': c.get('requestId') || '',
    },
  });
}

// ============================================================================
// COLLECTION RESPONSE BUILDER
// ============================================================================

/**
 * Create a collection response with items and metadata
 * Standardizes list/collection endpoints with consistent format
 *
 * @example
 * // Simple collection with auto-count
 * return Responses.collection(c, products);
 *
 * @example
 * // Collection with custom metadata
 * return Responses.collection(c, models, {
 *   total: 100,
 *   defaultModelId: 'gpt-4',
 *   tierGroups: [...]
 * });
 */
export function collection<T, M extends Record<string, unknown> = Record<string, never>>(
  c: Context,
  items: T[],
  metadata?: M,
  additionalMeta?: ResponseMetadata,
): Response {
  const data = {
    ...(metadata && Object.keys(metadata).length > 0 ? metadata : {}),
    items,
    count: items.length,
  };

  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    meta: {
      ...extractResponseMetadata(c),
      ...getPerformanceMetadata(c),
      ...additionalMeta,
    },
  };

  return c.json(response, HttpStatusCodes.OK);
}

// ============================================================================
// HEALTH CHECK RESPONSE BUILDERS
// ============================================================================

/**
 * Health check dependency status
 * ✅ ENUM PATTERN: Uses HealthStatus type from @/api/core/enums
 */
export type HealthDependency = {
  status: HealthStatus;
  message: string;
  duration?: number;
  details?: Record<string, unknown>;
};

/**
 * Health check summary counts
 */
export type HealthSummary = {
  total: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
};

/**
 * Create a basic health check response
 * For simple health endpoints that return overall status
 * ✅ ENUM PATTERN: Uses HealthStatus type from @/api/core/enums
 *
 * @example
 * return Responses.health(c, HealthStatuses.HEALTHY);
 */
export function health(
  c: Context,
  status: HealthStatus,
): Response {
  const data = {
    ok: status === HealthStatuses.HEALTHY,
    status,
    timestamp: new Date().toISOString(),
  };

  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    meta: extractResponseMetadata(c),
  };

  // Return appropriate HTTP status code
  const httpStatus = status === HealthStatuses.HEALTHY
    ? HttpStatusCodes.OK
    : HttpStatusCodes.SERVICE_UNAVAILABLE;

  return c.json(response, httpStatus);
}

/**
 * Create a detailed health check response
 * For comprehensive health endpoints with dependency checks
 * ✅ ENUM PATTERN: Uses HealthStatus type and HealthStatuses constants
 *
 * @example
 * return Responses.detailedHealth(c, HealthStatuses.HEALTHY, {
 *   database: { status: HealthStatuses.HEALTHY, message: 'Connected', duration: 45 },
 *   cache: { status: HealthStatuses.HEALTHY, message: 'Responsive', duration: 12 }
 * }, 150);
 */
export function detailedHealth(
  c: Context,
  status: HealthStatus,
  dependencies: Record<string, HealthDependency>,
  duration?: number,
): Response {
  // Calculate summary
  const summary = Object.values(dependencies).reduce(
    (acc, dep) => {
      acc.total++;
      if (dep.status === HealthStatuses.HEALTHY)
        acc.healthy++;
      else if (dep.status === HealthStatuses.DEGRADED)
        acc.degraded++;
      else
        acc.unhealthy++;
      return acc;
    },
    { total: 0, healthy: 0, degraded: 0, unhealthy: 0 } as HealthSummary,
  );

  const data = {
    ok: status === HealthStatuses.HEALTHY,
    status,
    timestamp: new Date().toISOString(),
    duration,
    env: {
      runtime: 'cloudflare-workers',
      version: globalThis.navigator?.userAgent || 'unknown',
      nodeEnv: c.env.NODE_ENV || 'unknown',
    },
    dependencies,
    summary,
  };

  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    meta: extractResponseMetadata(c),
  };

  // Return appropriate HTTP status code
  const httpStatus = status === HealthStatuses.HEALTHY
    ? HttpStatusCodes.OK
    : HttpStatusCodes.SERVICE_UNAVAILABLE;

  return c.json(response, httpStatus);
}

// ============================================================================
// SPECIALIZED RESPONSE BUILDERS
// ============================================================================

/**
 * Raw JSON response without ApiResponse wrapper
 * Use for streaming APIs that require raw data (e.g., AI SDK useObject hook)
 *
 * ⚠️ CAUTION: Only use when external libraries require raw JSON format.
 * Prefer wrapped responses (Responses.ok, Responses.accepted) for standard APIs.
 *
 * @example
 * // For AI SDK useObject compatibility
 * return Responses.raw(c, analysisData);
 */
export function raw<T>(
  c: Context,
  data: T,
  status: number = HttpStatusCodes.OK,
): Response {
  return c.json(data, status as 200);
}

/**
 * JSON-RPC 2.0 response for MCP protocol endpoints
 * Follows JSON-RPC 2.0 specification: https://www.jsonrpc.org/specification
 *
 * @example
 * // Success response
 * return Responses.jsonRpc(c, requestId, { tools: [...] });
 *
 * // Error response
 * return Responses.jsonRpc(c, requestId, undefined, { code: -32600, message: 'Invalid Request' });
 */
export function jsonRpc<T>(
  c: Context,
  id: string | number | null,
  result?: T,
  error?: { code: number; message: string; data?: unknown },
): Response {
  const response = {
    jsonrpc: '2.0' as const,
    id,
    ...(error ? { error } : { result }),
  };

  return c.json(response, HttpStatusCodes.OK);
}

/**
 * Polling status response for async operations
 * Returns 202 Accepted with polling metadata
 *
 * @example
 * return Responses.polling(c, {
 *   status: 'streaming',
 *   resourceId: analysisId,
 *   message: 'Analysis in progress',
 *   retryAfterMs: 2000,
 * });
 */
export function polling(
  c: Context,
  data: {
    status: 'pending' | 'streaming' | 'processing';
    resourceId?: string;
    message: string;
    retryAfterMs: number;
  },
): Response {
  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    meta: {
      ...extractResponseMetadata(c),
    },
  };

  return c.json(response, HttpStatusCodes.ACCEPTED);
}

// ============================================================================
// RESPONSE HELPERS OBJECT
// ============================================================================

/**
 * Consolidated response helpers for easy importing
 */
export const Responses = {
  // Success responses
  ok,
  created,
  accepted,
  noContent,
  paginated,
  cursorPaginated,
  collection,

  // Health checks
  health,
  detailedHealth,

  // Error responses
  validationError,
  authenticationError,
  authorizationError,
  notFound,
  conflict,
  rateLimitExceeded,
  externalServiceError,
  databaseError,
  badRequest,
  internalServerError,
  serviceUnavailable,

  // Specialized responses
  raw,
  jsonRpc,
  polling,

  // Utilities
  customResponse,
  redirect,

  // Validators
  validateSuccessResponse,
  validatePaginatedResponse,
  validateErrorResponse,
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ResponseBuilders = typeof Responses;

// Re-export response types
export type { ApiResponse, ErrorContext, PaginatedResponse };

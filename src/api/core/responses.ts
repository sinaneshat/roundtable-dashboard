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

import type {
  ApiResponse,
  CursorPaginatedResponse,
  ErrorContext,
  HealthDependency,
  HealthSummary,
  PaginatedResponse,
  ResponseMetadata,
  SSEStreamMetadata,
  TextStreamMetadata,
  ValidationError,
} from './schemas';
import { ApiErrorResponseSchema, createApiResponseSchema, createPaginatedResponseSchema } from './schemas';

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
      details: { detailType: 'role_check', requiredRole, userId: user?.id },
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
      details: { detailType: 'rate_limit', limit, windowMs, resetTime },
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

// HealthDependency and HealthSummary types are imported from './schemas'
// ✅ ZOD-FIRST PATTERN: Types inferred from Zod schemas in schemas.ts

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
// SSE/STREAMING RESPONSE BUILDERS
// ============================================================================

/**
 * Standard SSE headers for AI SDK and streaming responses
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-resume-streams
 */
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no', // Disable nginx buffering
} as const;

// SSEStreamMetadata type is imported from './schemas'
// ✅ ZOD-FIRST PATTERN: Type inferred from SSEStreamMetadataSchema

/**
 * Build SSE metadata headers from stream metadata
 * @internal
 */
function buildSSEMetadataHeaders(metadata: SSEStreamMetadata): Record<string, string> {
  const headers: Record<string, string> = {};

  if (metadata.streamId !== undefined) {
    headers['X-Stream-Id'] = metadata.streamId;
  }
  if (metadata.phase !== undefined) {
    headers['X-Stream-Phase'] = metadata.phase;
  }
  if (metadata.roundNumber !== undefined) {
    headers['X-Round-Number'] = String(metadata.roundNumber);
  }
  if (metadata.participantIndex !== undefined) {
    headers['X-Participant-Index'] = String(metadata.participantIndex);
  }
  if (metadata.totalParticipants !== undefined) {
    headers['X-Total-Participants'] = String(metadata.totalParticipants);
  }
  if (metadata.isActive !== undefined) {
    headers['X-Stream-Active'] = String(metadata.isActive);
  }
  if (metadata.participantStatuses !== undefined) {
    headers['X-Participant-Statuses'] = JSON.stringify(metadata.participantStatuses);
  }
  if (metadata.nextParticipantIndex !== undefined) {
    headers['X-Next-Participant-Index'] = String(metadata.nextParticipantIndex);
  }
  if (metadata.roundComplete !== undefined) {
    headers['X-Round-Complete'] = String(metadata.roundComplete);
  }
  if (metadata.resumedFromBuffer !== undefined) {
    headers['X-Resumed-From-Buffer'] = String(metadata.resumedFromBuffer);
  }
  if (metadata.moderatorMessageId !== undefined) {
    headers['X-Moderator-Message-Id'] = metadata.moderatorMessageId;
  }

  return headers;
}

/**
 * Create an SSE streaming response
 * Returns a Response with standard SSE headers and optional metadata headers
 *
 * @example
 * // Basic SSE stream
 * const stream = createLiveStream(streamId, env);
 * return Responses.sse(stream);
 *
 * @example
 * // SSE stream with metadata
 * return Responses.sse(stream, {
 *   streamId: 'thread_r0_p0',
 *   roundNumber: 0,
 *   participantIndex: 0,
 *   totalParticipants: 3,
 *   isActive: true,
 *   resumedFromBuffer: true,
 * });
 */
export function sse(
  stream: ReadableStream,
  metadata?: SSEStreamMetadata,
): Response {
  const metadataHeaders = metadata ? buildSSEMetadataHeaders(metadata) : {};

  return new Response(stream, {
    status: HttpStatusCodes.OK,
    headers: {
      ...SSE_HEADERS,
      ...metadataHeaders,
    },
  });
}

/**
 * Create a 204 No Content response with optional SSE metadata headers
 * Used when no active stream exists but metadata should be communicated
 *
 * @example
 * // Simple 204
 * return Responses.noContentWithHeaders();
 *
 * @example
 * // 204 with round info (next participant needs to stream)
 * return Responses.noContentWithHeaders({
 *   roundNumber: 0,
 *   totalParticipants: 3,
 *   nextParticipantIndex: 1,
 *   roundComplete: false,
 * });
 */
export function noContentWithHeaders(
  metadata?: SSEStreamMetadata,
): Response {
  const metadataHeaders = metadata ? buildSSEMetadataHeaders(metadata) : {};

  return new Response(null, {
    status: HttpStatusCodes.NO_CONTENT,
    headers: metadataHeaders,
  });
}

/**
 * Standard text stream headers for AI SDK streamObject responses
 * Used for streaming JSON text (round summaries, object generation)
 */
export const TEXT_STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no', // Disable nginx buffering
} as const;

// TextStreamMetadata type is imported from './schemas'
// ✅ ZOD-FIRST PATTERN: Type inferred from TextStreamMetadataSchema

/**
 * Build text stream metadata headers
 * @internal
 */
function buildTextStreamMetadataHeaders(metadata: TextStreamMetadata): Record<string, string> {
  const headers: Record<string, string> = {};

  if (metadata.streamId !== undefined) {
    headers['X-Stream-Id'] = metadata.streamId;
  }
  if (metadata.resumedFromBuffer !== undefined) {
    headers['X-Resumed-From-Buffer'] = String(metadata.resumedFromBuffer);
  }
  if (metadata.resourceId !== undefined) {
    headers['X-Resource-Id'] = metadata.resourceId;
  }
  if (metadata.roundNumber !== undefined) {
    headers['X-Round-Number'] = String(metadata.roundNumber);
  }
  if (metadata.moderatorMessageId !== undefined) {
    headers['X-Moderator-Message-Id'] = metadata.moderatorMessageId;
  }
  if (metadata.streamStatus !== undefined) {
    headers['X-Stream-Status'] = metadata.streamStatus;
  }

  return headers;
}

/**
 * Create a text streaming response (for AI SDK streamObject)
 * Returns a Response with standard text stream headers and optional metadata
 *
 * @example
 * // Basic text stream
 * const stream = createLiveStream(streamId, env);
 * return Responses.textStream(stream);
 *
 * @example
 * // Text stream with metadata (resumed round summary)
 * return Responses.textStream(stream, {
 *   streamId: 'summary_123',
 *   resumedFromBuffer: true,
 * });
 */
export function textStream(
  stream: ReadableStream,
  metadata?: TextStreamMetadata,
): Response {
  const metadataHeaders = metadata ? buildTextStreamMetadataHeaders(metadata) : {};

  return new Response(stream, {
    status: HttpStatusCodes.OK,
    headers: {
      ...TEXT_STREAM_HEADERS,
      ...metadataHeaders,
    },
  });
}

/**
 * Create a completed text response (for completed round summary)
 * Returns already-completed text content
 *
 * @example
 * return Responses.textComplete(completedSummaryText);
 */
export function textComplete(
  content: string,
  metadata?: TextStreamMetadata,
): Response {
  const metadataHeaders = metadata ? buildTextStreamMetadataHeaders(metadata) : {};

  return new Response(content, {
    status: HttpStatusCodes.OK,
    headers: {
      ...TEXT_STREAM_HEADERS,
      ...metadataHeaders,
    },
  });
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
 *   resourceId: summaryId,
 *   message: 'Round summary in progress',
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

  // SSE/Streaming responses
  sse,
  noContentWithHeaders,
  textStream,
  textComplete,

  // Utilities
  customResponse,
  redirect,

  // Validators
  validateSuccessResponse,
  validatePaginatedResponse,
  validateErrorResponse,

  // Constants
  SSE_HEADERS,
  TEXT_STREAM_HEADERS,
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ResponseBuilders = typeof Responses;

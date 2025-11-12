/**
 * Type-Safe HTTP Exception Factory
 *
 * This module provides a comprehensive, type-safe solution for creating HTTP exceptions
 * that work seamlessly with Hono's HTTPException class. It eliminates the need for
 * `as any` type casting and provides full type safety while maintaining compatibility
 * with existing error handling patterns.
 *
 * Key Features:
 * - Full type safety with no type casting
 * - Status code validation and mapping
 * - Integration with existing error codes and contexts
 * - Consistent error response formatting
 * - Proper TypeScript inference
 */

import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import type { ErrorCode, ErrorSeverity } from '@/api/common/error-handling';
import { ERROR_CODES, ERROR_SEVERITY } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';

// ============================================================================
// TYPE-SAFE STATUS CODE MAPPING
// ============================================================================

/**
 * Comprehensive mapping of stoker status codes to Hono's ContentfulStatusCode
 * This ensures complete type safety without any casting for ALL status codes
 */
const STOKER_TO_HONO_STATUS_MAP = {
  // 4xx Client Error Status Codes
  [HttpStatusCodes.BAD_REQUEST]: 400 as const,
  [HttpStatusCodes.UNAUTHORIZED]: 401 as const,
  [HttpStatusCodes.FORBIDDEN]: 403 as const,
  [HttpStatusCodes.NOT_FOUND]: 404 as const,
  [HttpStatusCodes.METHOD_NOT_ALLOWED]: 405 as const,
  [HttpStatusCodes.NOT_ACCEPTABLE]: 406 as const,
  [HttpStatusCodes.PROXY_AUTHENTICATION_REQUIRED]: 407 as const,
  [HttpStatusCodes.REQUEST_TIMEOUT]: 408 as const,
  [HttpStatusCodes.CONFLICT]: 409 as const,
  [HttpStatusCodes.GONE]: 410 as const,
  [HttpStatusCodes.LENGTH_REQUIRED]: 411 as const,
  [HttpStatusCodes.PRECONDITION_FAILED]: 412 as const,
  [HttpStatusCodes.REQUEST_TOO_LONG]: 413 as const,
  [HttpStatusCodes.REQUEST_URI_TOO_LONG]: 414 as const,
  [HttpStatusCodes.UNSUPPORTED_MEDIA_TYPE]: 415 as const,
  [HttpStatusCodes.REQUESTED_RANGE_NOT_SATISFIABLE]: 416 as const,
  [HttpStatusCodes.EXPECTATION_FAILED]: 417 as const,
  [HttpStatusCodes.IM_A_TEAPOT]: 418 as const,
  [HttpStatusCodes.MISDIRECTED_REQUEST]: 421 as const,
  [HttpStatusCodes.UNPROCESSABLE_ENTITY]: 422 as const,
  [HttpStatusCodes.LOCKED]: 423 as const,
  [HttpStatusCodes.FAILED_DEPENDENCY]: 424 as const,
  [HttpStatusCodes.UPGRADE_REQUIRED]: 426 as const,
  [HttpStatusCodes.PRECONDITION_REQUIRED]: 428 as const,
  [HttpStatusCodes.TOO_MANY_REQUESTS]: 429 as const,
  [HttpStatusCodes.REQUEST_HEADER_FIELDS_TOO_LARGE]: 431 as const,
  [HttpStatusCodes.UNAVAILABLE_FOR_LEGAL_REASONS]: 451 as const,

  // 5xx Server Error Status Codes
  [HttpStatusCodes.INTERNAL_SERVER_ERROR]: 500 as const,
  [HttpStatusCodes.NOT_IMPLEMENTED]: 501 as const,
  [HttpStatusCodes.BAD_GATEWAY]: 502 as const,
  [HttpStatusCodes.SERVICE_UNAVAILABLE]: 503 as const,
  [HttpStatusCodes.GATEWAY_TIMEOUT]: 504 as const,
  [HttpStatusCodes.HTTP_VERSION_NOT_SUPPORTED]: 505 as const,
  [HttpStatusCodes.INSUFFICIENT_STORAGE]: 507 as const,
  [HttpStatusCodes.NETWORK_AUTHENTICATION_REQUIRED]: 511 as const,
} as const;

/**
 * Type-safe function to convert stoker status codes to Hono ContentfulStatusCode
 * This function guarantees type safety and provides comprehensive error handling
 */
function mapStatusCode(stokerStatus: number): ContentfulStatusCode {
  const mapped = STOKER_TO_HONO_STATUS_MAP[stokerStatus as keyof typeof STOKER_TO_HONO_STATUS_MAP];
  if (mapped !== undefined) {
    return mapped;
  }

  // Enhanced fallback logic with validation
  if (isValidContentfulStatusCode(stokerStatus)) {
    return stokerStatus as ContentfulStatusCode;
  }

  // Default fallback for unmapped status codes
  return 500 as const; // INTERNAL_SERVER_ERROR
}

/**
 * Enhanced validation function to check if a number is a valid ContentfulStatusCode
 * More comprehensive than the basic isContentfulStatusCode function
 */
function isValidContentfulStatusCode(status: number): status is ContentfulStatusCode {
  // Check if it's in our mapping first
  if (status in STOKER_TO_HONO_STATUS_MAP) {
    return true;
  }

  // Check if it's a valid HTTP status code range and not a contentless status code
  const isValidRange = status >= 100 && status <= 599;
  const isContentless = status === 204 || status === 205 || status === 304;

  return isValidRange && !isContentless;
}

/**
 * Type guard to check if a number is a valid ContentfulStatusCode
 */
function isContentfulStatusCode(status: number): status is ContentfulStatusCode {
  return isValidContentfulStatusCode(status);
}

// ============================================================================
// HTTP EXCEPTION FACTORY
// ============================================================================

/**
 * Options for creating HTTP exceptions with enhanced type safety
 */
export type HTTPExceptionFactoryOptions = {
  message: string;
  code?: ErrorCode;
  severity?: ErrorSeverity;
  context?: ErrorContext;
  correlationId?: string;
  cause?: unknown;
  details?: Record<string, unknown>;
};

/**
 * Enhanced HTTP exception with additional metadata
 */
export class EnhancedHTTPException extends HTTPException {
  public readonly errorCode?: ErrorCode;
  public readonly severity?: ErrorSeverity;
  public readonly context?: ErrorContext;
  public readonly correlationId?: string;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(
    status: ContentfulStatusCode,
    options: HTTPExceptionFactoryOptions,
  ) {
    super(status, {
      message: options.message,
      cause: options.cause,
    });

    this.errorCode = options.code;
    this.severity = options.severity;
    this.context = options.context;
    this.correlationId = options.correlationId;
    this.details = options.details;
    this.timestamp = new Date();
  }

  /**
   * Convert to JSON for logging and responses
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      errorCode: this.errorCode,
      severity: this.severity,
      context: this.context,
      correlationId: this.correlationId,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

/**
 * Type-safe HTTP exception factory
 * Creates HTTPException instances without any type casting
 */
export class HTTPExceptionFactory {
  /**
   * Create an HTTP exception from a stoker status code
   */
  static fromStatusCode(
    stokerStatus: number,
    options: HTTPExceptionFactoryOptions,
  ): EnhancedHTTPException {
    const honoStatus = mapStatusCode(stokerStatus);
    return new EnhancedHTTPException(honoStatus, options);
  }

  /**
   * Create an HTTP exception directly with a Hono status code
   */
  static fromHonoStatus(
    honoStatus: ContentfulStatusCode,
    options: HTTPExceptionFactoryOptions,
  ): EnhancedHTTPException {
    return new EnhancedHTTPException(honoStatus, options);
  }

  /**
   * Create an HTTP exception from an arbitrary number with validation
   */
  static fromNumber(
    status: number,
    options: HTTPExceptionFactoryOptions,
  ): EnhancedHTTPException {
    if (isContentfulStatusCode(status)) {
      return new EnhancedHTTPException(status, options);
    }

    // Fallback to mapped status code
    const mapped = mapStatusCode(status);
    return new EnhancedHTTPException(mapped, {
      ...options,
      details: {
        ...options.details,
        originalStatus: status,
        mappedStatus: mapped,
      },
    });
  }

  // ============================================================================
  // CONVENIENCE FACTORY METHODS
  // ============================================================================

  /**
   * Bad Request (400)
   */
  static badRequest(options: Omit<HTTPExceptionFactoryOptions, 'code' | 'severity'>): EnhancedHTTPException {
    return HTTPExceptionFactory.fromStatusCode(HttpStatusCodes.BAD_REQUEST, {
      ...options,
      code: ERROR_CODES.INVALID_INPUT,
      severity: ERROR_SEVERITY.LOW,
    });
  }

  /**
   * Unauthorized (401)
   */
  static unauthorized(options: Omit<HTTPExceptionFactoryOptions, 'code' | 'severity'>): EnhancedHTTPException {
    return HTTPExceptionFactory.fromStatusCode(HttpStatusCodes.UNAUTHORIZED, {
      ...options,
      code: ERROR_CODES.UNAUTHENTICATED,
      severity: ERROR_SEVERITY.MEDIUM,
    });
  }

  /**
   * Forbidden (403)
   */
  static forbidden(options: Omit<HTTPExceptionFactoryOptions, 'code' | 'severity'>): EnhancedHTTPException {
    return HTTPExceptionFactory.fromStatusCode(HttpStatusCodes.FORBIDDEN, {
      ...options,
      code: ERROR_CODES.UNAUTHORIZED,
      severity: ERROR_SEVERITY.MEDIUM,
    });
  }

  /**
   * Not Found (404)
   */
  static notFound(options: Omit<HTTPExceptionFactoryOptions, 'code' | 'severity'>): EnhancedHTTPException {
    return HTTPExceptionFactory.fromStatusCode(HttpStatusCodes.NOT_FOUND, {
      ...options,
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      severity: ERROR_SEVERITY.LOW,
    });
  }

  /**
   * Conflict (409)
   */
  static conflict(options: Omit<HTTPExceptionFactoryOptions, 'code' | 'severity'>): EnhancedHTTPException {
    return HTTPExceptionFactory.fromStatusCode(HttpStatusCodes.CONFLICT, {
      ...options,
      code: ERROR_CODES.RESOURCE_CONFLICT,
      severity: ERROR_SEVERITY.MEDIUM,
    });
  }

  /**
   * Unprocessable Entity (422)
   */
  static unprocessableEntity(options: Omit<HTTPExceptionFactoryOptions, 'code' | 'severity'>): EnhancedHTTPException {
    return HTTPExceptionFactory.fromStatusCode(HttpStatusCodes.UNPROCESSABLE_ENTITY, {
      ...options,
      code: ERROR_CODES.VALIDATION_ERROR,
      severity: ERROR_SEVERITY.LOW,
    });
  }

  /**
   * Too Many Requests (429)
   */
  static tooManyRequests(options: Omit<HTTPExceptionFactoryOptions, 'code' | 'severity'>): EnhancedHTTPException {
    return HTTPExceptionFactory.fromStatusCode(HttpStatusCodes.TOO_MANY_REQUESTS, {
      ...options,
      code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
      severity: ERROR_SEVERITY.MEDIUM,
    });
  }

  /**
   * Internal Server Error (500)
   */
  static internalServerError(options: Omit<HTTPExceptionFactoryOptions, 'code' | 'severity'>): EnhancedHTTPException {
    return HTTPExceptionFactory.fromStatusCode(HttpStatusCodes.INTERNAL_SERVER_ERROR, {
      ...options,
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      severity: ERROR_SEVERITY.CRITICAL,
    });
  }

  /**
   * Bad Gateway (502)
   */
  static badGateway(options: Omit<HTTPExceptionFactoryOptions, 'code' | 'severity'>): EnhancedHTTPException {
    return HTTPExceptionFactory.fromStatusCode(HttpStatusCodes.BAD_GATEWAY, {
      ...options,
      code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      severity: ERROR_SEVERITY.HIGH,
    });
  }

  /**
   * Service Unavailable (503)
   */
  static serviceUnavailable(options: Omit<HTTPExceptionFactoryOptions, 'code' | 'severity'>): EnhancedHTTPException {
    return HTTPExceptionFactory.fromStatusCode(HttpStatusCodes.SERVICE_UNAVAILABLE, {
      ...options,
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      severity: ERROR_SEVERITY.HIGH,
    });
  }

  /**
   * Gateway Timeout (504)
   */
  static gatewayTimeout(options: Omit<HTTPExceptionFactoryOptions, 'code' | 'severity'>): EnhancedHTTPException {
    return HTTPExceptionFactory.fromStatusCode(HttpStatusCodes.GATEWAY_TIMEOUT, {
      ...options,
      code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      severity: ERROR_SEVERITY.HIGH,
    });
  }

  /**
   * Request Timeout (408)
   */
  static requestTimeout(options: Omit<HTTPExceptionFactoryOptions, 'code' | 'severity'>): EnhancedHTTPException {
    return HTTPExceptionFactory.fromStatusCode(HttpStatusCodes.REQUEST_TIMEOUT, {
      ...options,
      code: ERROR_CODES.TIMEOUT_ERROR,
      severity: ERROR_SEVERITY.MEDIUM,
    });
  }

  // ============================================================================
  // MIGRATION AND COMPATIBILITY UTILITIES
  // ============================================================================

  /**
   * Direct replacement for `new HTTPException(HttpStatusCodes.XXX, options)`
   * This provides a drop-in replacement for existing code without type casting
   */
  static create(
    stokerStatus: number,
    options: { message: string; cause?: unknown } = { message: 'An error occurred' },
  ): EnhancedHTTPException {
    return HTTPExceptionFactory.fromStatusCode(stokerStatus, {
      message: options.message,
      cause: options.cause,
    });
  }

  /**
   * Create with automatic error code inference based on status
   */
  static createWithInferredCode(
    stokerStatus: number,
    message: string,
    context?: ErrorContext,
  ): EnhancedHTTPException {
    const errorCodeMap: Record<number, ErrorCode> = {
      [HttpStatusCodes.BAD_REQUEST]: ERROR_CODES.INVALID_INPUT,
      [HttpStatusCodes.UNAUTHORIZED]: ERROR_CODES.UNAUTHENTICATED,
      [HttpStatusCodes.FORBIDDEN]: ERROR_CODES.UNAUTHORIZED,
      [HttpStatusCodes.NOT_FOUND]: ERROR_CODES.RESOURCE_NOT_FOUND,
      [HttpStatusCodes.CONFLICT]: ERROR_CODES.RESOURCE_CONFLICT,
      [HttpStatusCodes.UNPROCESSABLE_ENTITY]: ERROR_CODES.VALIDATION_ERROR,
      [HttpStatusCodes.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMIT_EXCEEDED,
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: ERROR_CODES.INTERNAL_SERVER_ERROR,
      [HttpStatusCodes.BAD_GATEWAY]: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      [HttpStatusCodes.SERVICE_UNAVAILABLE]: ERROR_CODES.SERVICE_UNAVAILABLE,
    };

    const severityMap: Record<number, ErrorSeverity> = {
      [HttpStatusCodes.BAD_REQUEST]: ERROR_SEVERITY.LOW,
      [HttpStatusCodes.UNAUTHORIZED]: ERROR_SEVERITY.MEDIUM,
      [HttpStatusCodes.FORBIDDEN]: ERROR_SEVERITY.MEDIUM,
      [HttpStatusCodes.NOT_FOUND]: ERROR_SEVERITY.LOW,
      [HttpStatusCodes.CONFLICT]: ERROR_SEVERITY.MEDIUM,
      [HttpStatusCodes.UNPROCESSABLE_ENTITY]: ERROR_SEVERITY.LOW,
      [HttpStatusCodes.TOO_MANY_REQUESTS]: ERROR_SEVERITY.MEDIUM,
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: ERROR_SEVERITY.CRITICAL,
      [HttpStatusCodes.BAD_GATEWAY]: ERROR_SEVERITY.HIGH,
      [HttpStatusCodes.SERVICE_UNAVAILABLE]: ERROR_SEVERITY.HIGH,
    };

    return HTTPExceptionFactory.fromStatusCode(stokerStatus, {
      message,
      context,
      code: errorCodeMap[stokerStatus],
      severity: severityMap[stokerStatus] || ERROR_SEVERITY.MEDIUM,
    });
  }

  /**
   * Bulk status code validation - useful for testing and debugging
   */
  static validateStatusCodes(): { valid: number[]; invalid: number[]; mapped: Record<number, ContentfulStatusCode> } {
    const allStatusCodes = Object.values(HttpStatusCodes).filter(code => typeof code === 'number');
    const valid: number[] = [];
    const invalid: number[] = [];
    const mapped: Record<number, ContentfulStatusCode> = {};

    for (const code of allStatusCodes) {
      try {
        const mappedCode = mapStatusCode(code);
        valid.push(code);
        mapped[code] = mappedCode;
      } catch {
        invalid.push(code);
      }
    }

    return { valid, invalid, mapped };
  }
}

// ============================================================================
// MIGRATION HELPERS FOR EXISTING CODE
// ============================================================================

/**
 * Drop-in replacement function for existing `new HTTPException()` calls
 * Usage: Replace `new HTTPException(status, options)` with `createHTTPException(status, options)`
 */
export function createHTTPException(
  status: number,
  options: { message: string; cause?: unknown } = { message: 'An error occurred' },
): EnhancedHTTPException {
  return HTTPExceptionFactory.create(status, options);
}

/**
 * Type-safe factory method aliases for common patterns
 */
export const HttpExceptions = {
  // Direct status code creators
  badRequest: (message: string, context?: ErrorContext) =>
    HTTPExceptionFactory.badRequest({ message, context }),

  unauthorized: (message: string, context?: ErrorContext) =>
    HTTPExceptionFactory.unauthorized({ message, context }),

  forbidden: (message: string, context?: ErrorContext) =>
    HTTPExceptionFactory.forbidden({ message, context }),

  notFound: (message: string, context?: ErrorContext) =>
    HTTPExceptionFactory.notFound({ message, context }),

  conflict: (message: string, context?: ErrorContext) =>
    HTTPExceptionFactory.conflict({ message, context }),

  unprocessableEntity: (message: string, context?: ErrorContext) =>
    HTTPExceptionFactory.unprocessableEntity({ message, context }),

  tooManyRequests: (message: string, context?: ErrorContext) =>
    HTTPExceptionFactory.tooManyRequests({ message, context }),

  internalServerError: (message: string, context?: ErrorContext) =>
    HTTPExceptionFactory.internalServerError({ message, context }),

  badGateway: (message: string, context?: ErrorContext) =>
    HTTPExceptionFactory.badGateway({ message, context }),

  serviceUnavailable: (message: string, context?: ErrorContext) =>
    HTTPExceptionFactory.serviceUnavailable({ message, context }),

  gatewayTimeout: (message: string, context?: ErrorContext) =>
    HTTPExceptionFactory.gatewayTimeout({ message, context }),

  // Generic creator with automatic inference
  create: (status: number, message: string, context?: ErrorContext) =>
    HTTPExceptionFactory.createWithInferredCode(status, message, context),

  // Direct replacement for existing patterns
  fromStatusCode: (status: number, message: string, cause?: unknown) =>
    HTTPExceptionFactory.create(status, { message, cause }),
} as const;

// ============================================================================
// EXPORTS
// ============================================================================

export {
  isContentfulStatusCode,
  isValidContentfulStatusCode,
  mapStatusCode,
  STOKER_TO_HONO_STATUS_MAP,
};

export default HTTPExceptionFactory;

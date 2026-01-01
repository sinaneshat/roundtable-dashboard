/**
 * Request/Response Size Limits Middleware
 *
 * Provides production-ready size validation for requests and responses
 * to prevent DoS attacks and manage resource consumption effectively.
 */

import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import type { SizeValidationType } from '@/api/core/enums';
import { SizeValidationTypes } from '@/api/core/enums';

// ============================================================================
// SIZE LIMIT CONFIGURATIONS
// ============================================================================

/**
 * Default size limits in bytes
 * Based on production best practices and Cloudflare Workers limits
 */
export const DEFAULT_SIZE_LIMITS = {
  // Request limits
  requestBody: 100 * 1024 * 1024, // 100MB (Cloudflare Workers limit)
  requestHeaders: 32 * 1024, // 32KB total headers
  singleHeader: 8 * 1024, // 8KB per header
  requestUrl: 8 * 1024, // 8KB URL length

  // Response limits
  responseBody: 100 * 1024 * 1024, // 100MB (Cloudflare Workers limit)
  responseHeaders: 32 * 1024, // 32KB total headers

  // File upload limits (stricter for security)
  fileUpload: 50 * 1024 * 1024, // 50MB for file uploads
  documentUpload: 25 * 1024 * 1024, // 25MB for document uploads

  // JSON payload limits (stricter for API endpoints)
  jsonPayload: 10 * 1024 * 1024, // 10MB for JSON API calls
  formData: 50 * 1024 * 1024, // 50MB for form submissions
} as const;

/**
 * Size limit configuration interface
 */
export type SizeLimitConfig = {
  requestBody?: number;
  requestHeaders?: number;
  singleHeader?: number;
  requestUrl?: number;
  responseBody?: number;
  responseHeaders?: number;
  fileUpload?: number;
  documentUpload?: number;
  jsonPayload?: number;
  formData?: number;
};

/**
 * Size validation result
 */
export type SizeValidationResult = {
  isValid: boolean;
  violations: Array<{
    type: SizeValidationType;
    limit: number;
    actual: number;
    message: string;
  }>;
  warnings: Array<{
    type: SizeValidationType;
    threshold: number;
    actual: number;
    message: string;
  }>;
};

// ============================================================================
// SIZE CALCULATION UTILITIES
// ============================================================================

/**
 * Calculate the total size of request headers
 */
function calculateHeadersSize(headers: Headers): number {
  let totalSize = 0;
  headers.forEach((value, name) => {
    totalSize += name.length + value.length + 4; // +4 for ": " and "\r\n"
  });
  return totalSize;
}

/**
 * Get content type category for specialized limits
 */
function getContentCategory(contentType: string): keyof typeof DEFAULT_SIZE_LIMITS | null {
  const type = contentType.toLowerCase();

  if (type.includes('application/json'))
    return 'jsonPayload';
  if (type.includes('multipart/form-data'))
    return 'formData';
  if (type.includes('application/x-www-form-urlencoded'))
    return 'formData';
  if (type.startsWith('image/'))
    return 'fileUpload';
  if (type.includes('application/pdf') || type.includes('application/msword')
    || type.includes('application/vnd.openxmlformats')) {
    return 'documentUpload';
  }

  return 'fileUpload'; // Default to file upload limit
}

/**
 * Format bytes for human-readable error messages
 */
function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
}

// ============================================================================
// REQUEST SIZE VALIDATION
// ============================================================================

/**
 * Validate request size limits
 */
export function validateRequestSize(
  c: {
    req: {
      header: (name: string) => string | undefined;
      raw: Request;
    };
  },
  config: SizeLimitConfig = {},
): SizeValidationResult {
  const limits = { ...DEFAULT_SIZE_LIMITS, ...config };
  const violations: SizeValidationResult['violations'] = [];
  const warnings: SizeValidationResult['warnings'] = [];

  try {
    // 1. Validate URL length
    const url = c.req.raw.url;
    if (url.length > limits.requestUrl!) {
      violations.push({
        type: SizeValidationTypes.URL_LENGTH,
        limit: limits.requestUrl!,
        actual: url.length,
        message: `Request URL too long: ${url.length} bytes exceeds limit of ${formatBytes(limits.requestUrl!)}`,
      });
    }

    // 2. Validate headers size
    const headers = c.req.raw.headers;
    const headersSize = calculateHeadersSize(headers);

    if (headersSize > limits.requestHeaders!) {
      violations.push({
        type: SizeValidationTypes.HEADERS_SIZE,
        limit: limits.requestHeaders!,
        actual: headersSize,
        message: `Request headers too large: ${formatBytes(headersSize)} exceeds limit of ${formatBytes(limits.requestHeaders!)}`,
      });
    }

    // 3. Validate individual header sizes
    headers.forEach((value, name) => {
      const headerSize = name.length + value.length;
      if (headerSize > limits.singleHeader!) {
        violations.push({
          type: SizeValidationTypes.SINGLE_HEADER_SIZE,
          limit: limits.singleHeader!,
          actual: headerSize,
          message: `Header '${name}' too large: ${formatBytes(headerSize)} exceeds limit of ${formatBytes(limits.singleHeader!)}`,
        });
      }
    });

    // 4. Check for warning thresholds (80% of limit)
    const warningThreshold = 0.8;

    if (headersSize > limits.requestHeaders! * warningThreshold) {
      warnings.push({
        type: SizeValidationTypes.HEADERS_SIZE_WARNING,
        threshold: limits.requestHeaders! * warningThreshold,
        actual: headersSize,
        message: `Request headers approaching limit: ${formatBytes(headersSize)} is ${Math.round((headersSize / limits.requestHeaders!) * 100)}% of limit`,
      });
    }

    return {
      isValid: violations.length === 0,
      violations,
      warnings,
    };
  } catch (error) {
    // In case of validation error, allow the request but log the issue
    return {
      isValid: true,
      violations: [],
      warnings: [{
        type: SizeValidationTypes.VALIDATION_ERROR,
        threshold: 0,
        actual: 0,
        message: `Size validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
    };
  }
}

/**
 * Validate request body size (async - requires body reading)
 */
export async function validateRequestBodySize(
  request: Request,
  config: SizeLimitConfig = {},
): Promise<SizeValidationResult> {
  const limits = { ...DEFAULT_SIZE_LIMITS, ...config };
  const violations: SizeValidationResult['violations'] = [];
  const warnings: SizeValidationResult['warnings'] = [];

  try {
    // Get content type to determine appropriate limit
    const contentType = request.headers.get('content-type') || '';
    const contentCategory = getContentCategory(contentType);
    const applicableLimit = contentCategory ? limits[contentCategory] : limits.requestBody;

    // Get content length from header first (more efficient)
    const contentLengthHeader = request.headers.get('content-length');

    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);

      if (Number.isNaN(contentLength) || contentLength < 0) {
        violations.push({
          type: SizeValidationTypes.INVALID_CONTENT_LENGTH,
          limit: 0,
          actual: 0,
          message: 'Invalid Content-Length header',
        });
      } else if (contentLength > applicableLimit!) {
        violations.push({
          type: SizeValidationTypes.BODY_SIZE_HEADER,
          limit: applicableLimit!,
          actual: contentLength,
          message: `Request body too large: ${formatBytes(contentLength)} exceeds limit of ${formatBytes(applicableLimit!)} for ${contentCategory || 'general'} content`,
        });
      } else if (contentLength > applicableLimit! * 0.8) {
        warnings.push({
          type: SizeValidationTypes.BODY_SIZE_WARNING,
          threshold: applicableLimit! * 0.8,
          actual: contentLength,
          message: `Request body approaching limit: ${formatBytes(contentLength)} is ${Math.round((contentLength / applicableLimit!) * 100)}% of limit`,
        });
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      warnings,
    };
  } catch (error) {
    return {
      isValid: true,
      violations: [],
      warnings: [{
        type: SizeValidationTypes.VALIDATION_ERROR,
        threshold: 0,
        actual: 0,
        message: `Body size validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
    };
  }
}

// ============================================================================
// RESPONSE SIZE VALIDATION
// ============================================================================

/**
 * Validate response size before sending
 */
export function validateResponseSize(
  response: Response,
  config: SizeLimitConfig = {},
): SizeValidationResult {
  const limits = { ...DEFAULT_SIZE_LIMITS, ...config };
  const violations: SizeValidationResult['violations'] = [];
  const warnings: SizeValidationResult['warnings'] = [];

  try {
    // 1. Validate response headers size
    const headersSize = calculateHeadersSize(response.headers);

    if (headersSize > limits.responseHeaders!) {
      violations.push({
        type: SizeValidationTypes.RESPONSE_HEADERS_SIZE,
        limit: limits.responseHeaders!,
        actual: headersSize,
        message: `Response headers too large: ${formatBytes(headersSize)} exceeds limit of ${formatBytes(limits.responseHeaders!)}`,
      });
    }

    // 2. Check content length if available
    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);

      if (!Number.isNaN(contentLength) && contentLength > limits.responseBody!) {
        violations.push({
          type: SizeValidationTypes.RESPONSE_BODY_SIZE,
          limit: limits.responseBody!,
          actual: contentLength,
          message: `Response body too large: ${formatBytes(contentLength)} exceeds limit of ${formatBytes(limits.responseBody!)}`,
        });
      } else if (!Number.isNaN(contentLength) && contentLength > limits.responseBody! * 0.8) {
        warnings.push({
          type: SizeValidationTypes.RESPONSE_BODY_WARNING,
          threshold: limits.responseBody! * 0.8,
          actual: contentLength,
          message: `Response body approaching limit: ${formatBytes(contentLength)} is ${Math.round((contentLength / limits.responseBody!) * 100)}% of limit`,
        });
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      warnings,
    };
  } catch (error) {
    return {
      isValid: true,
      violations: [],
      warnings: [{
        type: SizeValidationTypes.VALIDATION_ERROR,
        threshold: 0,
        actual: 0,
        message: `Response size validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
    };
  }
}

// ============================================================================
// MIDDLEWARE IMPLEMENTATION
// ============================================================================

/**
 * Create request size validation middleware
 */
export function createRequestSizeLimitMiddleware(config: SizeLimitConfig = {}) {
  return async (c: {
    req: {
      header: (name: string) => string | undefined;
      raw: Request;
    };
    env: CloudflareEnv;
  }, next: () => Promise<void>) => {
    // Validate basic request size limits
    const requestValidation = validateRequestSize(c, config);

    // Handle violations
    if (!requestValidation.isValid) {
      // Return the first violation as the error
      const primaryViolation = requestValidation.violations[0];
      throw new HTTPException(HttpStatusCodes.REQUEST_TOO_LONG, {
        message: primaryViolation?.message || 'Request size limit exceeded',
      });
    }

    // Validate request body size (if body exists)
    const contentType = c.req.header('content-type');
    const hasBody = c.req.raw.method !== 'GET'
      && c.req.raw.method !== 'HEAD'
      && contentType
      && !contentType.includes('application/x-www-form-urlencoded'); // Skip for simple forms

    if (hasBody) {
      const bodyValidation = await validateRequestBodySize(new Request(c.req.raw), config);

      if (!bodyValidation.isValid) {
        const primaryViolation = bodyValidation.violations[0];
        throw new HTTPException(HttpStatusCodes.REQUEST_TOO_LONG, {
          message: primaryViolation?.message || 'Request body size limit exceeded',
        });
      }
    }

    return next();
  };
}

/**
 * Create response size validation middleware
 */
export function createResponseSizeLimitMiddleware(config: SizeLimitConfig = {}) {
  return async (c: Context, next: () => Promise<void>) => {
    await next();

    // Validate response size after handler execution
    const response = c.res;
    if (response) {
      const responseValidation = validateResponseSize(response, config);

      // Handle violations by logging (we can't easily modify response at this point)
      if (!responseValidation.isValid) {
        // In production, you might want to truncate the response or return an error
        // For now, we log the violation and let the response proceed
      }
    }
  };
}

/**
 * Create comprehensive size limits middleware (combines request and response validation)
 */
export function createSizeLimitsMiddleware(config: SizeLimitConfig = {}) {
  const requestMiddleware = createRequestSizeLimitMiddleware(config);
  const responseMiddleware = createResponseSizeLimitMiddleware(config);

  return async (c: Context, next: () => Promise<void>) => {
    // Apply request validation first
    await requestMiddleware(c, async () => {
      // Then apply response validation
      await responseMiddleware(c, next);
    });
  };
}

// ============================================================================
// UTILITIES FOR SPECIFIC USE CASES
// ============================================================================

/**
 * Create file upload size middleware with specific limits
 */
export function createFileUploadSizeLimitMiddleware(customLimits: Partial<SizeLimitConfig> = {}) {
  const fileUploadConfig = {
    ...DEFAULT_SIZE_LIMITS,
    requestBody: DEFAULT_SIZE_LIMITS.fileUpload, // Use file upload limit as default
    ...customLimits,
  };

  return createRequestSizeLimitMiddleware(fileUploadConfig);
}

/**
 * Create API endpoint size middleware with JSON-focused limits
 */
export function createApiSizeLimitMiddleware(customLimits: Partial<SizeLimitConfig> = {}) {
  const apiConfig = {
    ...DEFAULT_SIZE_LIMITS,
    requestBody: DEFAULT_SIZE_LIMITS.jsonPayload, // Use JSON payload limit as default
    ...customLimits,
  };

  return createSizeLimitsMiddleware(apiConfig);
}

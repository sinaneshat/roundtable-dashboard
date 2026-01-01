/**
 * Production-Ready Fetch Utilities
 *
 * Following Hono best practices from Context7 docs for robust external API calls
 * Integrates with existing service factory and error handling patterns
 */

import * as HttpStatusCodes from 'stoker/http-status-codes';
import type { z } from 'zod';

import type { EnhancedHTTPException } from '@/api/core';
import { HTTPExceptionFactory } from '@/api/core';
import type { CircuitBreakerState } from '@/api/core/enums';
import { CircuitBreakerStates } from '@/api/core/enums';

// CloudflareEnv is globally available from cloudflare-env.d.ts
import { createError } from './error-handling';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type FetchConfig = {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelay?: number;
  backoffFactor?: number;
  retryableStatuses?: number[];
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeoutMs: number;
  };
  correlationId?: string;
};

export type RetryableError = {
  isRetryable: boolean;
  shouldCircuitBreak: boolean;
  delay: number;
};

export type FetchResult<T> = {
  success: true;
  data: T;
  response: Response;
  attempts: number;
  duration: number;
} | {
  success: false;
  error: string;
  response?: Response;
  attempts: number;
  duration: number;
};

/**
 * Response parsing result with ZERO CASTING
 * Discriminated union for type safety
 */
export type ParsedResponse<T>
  = | { success: true; data: T; contentType: string }
    | { success: false; error: string; contentType: string };

/**
 * Response parsing result for unvalidated data
 */
export type UnvalidatedParseResult
  = | { success: true; data: unknown; contentType: string }
    | { success: false; error: string; contentType: string };

// ============================================================================
// CIRCUIT BREAKER STATE MANAGEMENT
// ============================================================================

type CircuitBreakerStateData = {
  failures: number;
  lastFailureTime: number;
  nextAttemptTime: number;
  state: CircuitBreakerState;
};

const circuitBreakers = new Map<string, CircuitBreakerStateData>();

function getCircuitBreakerState(url: string): CircuitBreakerStateData {
  if (!circuitBreakers.has(url)) {
    circuitBreakers.set(url, {
      failures: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
      state: CircuitBreakerStates.CLOSED,
    });
  }
  return circuitBreakers.get(url)!;
}

function updateCircuitBreakerState(
  url: string,
  success: boolean,
  config: FetchConfig,
): void {
  const state = getCircuitBreakerState(url);
  const now = Date.now();

  if (success) {
    // Reset on success
    state.failures = 0;
    state.state = CircuitBreakerStates.CLOSED;
  } else if (config.circuitBreaker) {
    state.failures++;
    state.lastFailureTime = now;

    if (state.failures >= config.circuitBreaker.failureThreshold) {
      state.state = CircuitBreakerStates.OPEN;
      state.nextAttemptTime = now + config.circuitBreaker.resetTimeoutMs;
    }
  }
}

function shouldAllowRequest(url: string, config: FetchConfig): boolean {
  if (!config.circuitBreaker)
    return true;

  const state = getCircuitBreakerState(url);
  const now = Date.now();

  switch (state.state) {
    case CircuitBreakerStates.CLOSED:
      return true;
    case CircuitBreakerStates.OPEN:
      if (now >= state.nextAttemptTime) {
        state.state = CircuitBreakerStates.HALF_OPEN;
        return true;
      }
      return false;
    case CircuitBreakerStates.HALF_OPEN:
      return true;
    default:
      return true;
  }
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

function calculateRetryDelay(attempt: number, config: FetchConfig): number {
  const baseDelay = config.retryDelay || 1000;
  const backoffFactor = config.backoffFactor || 2;
  const maxDelay = 30000; // 30 seconds max

  const delay = baseDelay * backoffFactor ** attempt;
  return Math.min(delay, maxDelay);
}

function isRetryableError(response?: Response, error?: Error): RetryableError {
  // Network errors are always retryable
  if (error && !response) {
    return { isRetryable: true, shouldCircuitBreak: true, delay: 0 };
  }

  // HTTP status code based retry logic
  if (response) {
    const retryableStatuses = [
      HttpStatusCodes.REQUEST_TIMEOUT,
      HttpStatusCodes.TOO_MANY_REQUESTS,
      HttpStatusCodes.INTERNAL_SERVER_ERROR,
      HttpStatusCodes.BAD_GATEWAY,
      HttpStatusCodes.SERVICE_UNAVAILABLE,
      HttpStatusCodes.GATEWAY_TIMEOUT,
    ];
    const isRetryable = retryableStatuses.includes(response.status);
    const shouldCircuitBreak = response.status >= HttpStatusCodes.INTERNAL_SERVER_ERROR; // Only server errors affect circuit breaker

    // Rate limit specific delay
    const retryAfter = response.headers.get('retry-after');
    const delay = retryAfter ? Number.parseInt(retryAfter) * 1000 : 0;

    return { isRetryable, shouldCircuitBreak, delay };
  }

  return { isRetryable: false, shouldCircuitBreak: false, delay: 0 };
}

// ============================================================================
// CORE FETCH UTILITY
// ============================================================================

/**
 * Production-ready fetch utility with timeout, retries, and circuit breaker
 * Following Hono Context7 best practices for external API calls
 */
export async function fetchWithRetry<T = unknown>(
  url: string,
  init: RequestInit = {},
  config: FetchConfig = {},
  schema?: z.ZodSchema<T>,
): Promise<FetchResult<T>> {
  const startTime = Date.now();
  const correlationId = config.correlationId || crypto.randomUUID();
  const maxRetries = config.maxRetries || 3;
  const timeoutMs = config.timeoutMs || 30000;

  // Default configuration
  const fetchConfig: Required<FetchConfig> = {
    timeoutMs,
    maxRetries,
    retryDelay: 1000,
    backoffFactor: 2,
    retryableStatuses: [
      HttpStatusCodes.REQUEST_TIMEOUT,
      HttpStatusCodes.TOO_MANY_REQUESTS,
      HttpStatusCodes.INTERNAL_SERVER_ERROR,
      HttpStatusCodes.BAD_GATEWAY,
      HttpStatusCodes.SERVICE_UNAVAILABLE,
      HttpStatusCodes.GATEWAY_TIMEOUT,
    ],
    circuitBreaker: config.circuitBreaker || {
      failureThreshold: 5,
      resetTimeoutMs: 60000,
    },
    correlationId,
  };

  // Circuit breaker check
  if (!shouldAllowRequest(url, fetchConfig)) {
    const duration = Date.now() - startTime;

    return {
      success: false,
      error: 'Circuit breaker is open',
      attempts: 0,
      duration,
    };
  }

  let lastError: Error | undefined;
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Create abort controller with timeout following Hono patterns
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Make request with timeout
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Success case
      if (response.ok) {
        updateCircuitBreakerState(url, true, fetchConfig);

        // Parse response based on content type with ZERO CASTING
        // Use schema if provided for type safety
        const parseResult = schema
          ? await parseResponseSafely(response, schema)
          : await parseResponseSafely(response);
        if (!parseResult.success) {
          updateCircuitBreakerState(url, false, fetchConfig);
          const duration = Date.now() - startTime;

          return {
            success: false,
            error: `Response parsing failed: ${parseResult.error}`,
            response,
            attempts: attempt + 1,
            duration,
          };
        }

        // Type handling based on schema presence:
        // - With schema: parseResult.data is validated T (no casting needed)
        // - Without schema: parseResult.data is unknown, consumer casts to T at their own risk
        // This is the contract of the function - callers must provide schema for type safety
        const data = parseResult.data as T;

        const duration = Date.now() - startTime;

        return {
          success: true,
          data,
          response,
          attempts: attempt + 1,
          duration,
        };
      }

      // Handle error response
      lastResponse = response;
      const errorText = await response.text().catch(() => 'Unknown error');
      lastError = new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);

      // Check if should retry
      const retryInfo = isRetryableError(response);
      if (attempt === maxRetries || !retryInfo.isRetryable) {
        break;
      }

      // Calculate delay and wait
      const delay = Math.max(
        calculateRetryDelay(attempt, fetchConfig),
        retryInfo.delay,
      );

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (fetchError) {
      lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));

      // Handle timeout and network errors
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
      const isNetworkError = fetchError instanceof Error && fetchError.message.includes('fetch');

      if (attempt === maxRetries || (!isTimeout && !isNetworkError)) {
        break;
      }

      const delay = calculateRetryDelay(attempt, fetchConfig);

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All attempts failed
  updateCircuitBreakerState(url, false, fetchConfig);

  const duration = Date.now() - startTime;
  const errorMessage = lastError?.message || 'Unknown error';

  return {
    success: false,
    error: errorMessage,
    response: lastResponse,
    attempts: maxRetries + 1,
    duration,
  };
}

// ============================================================================
// CONVENIENCE METHODS
// ============================================================================

/**
 * GET request with production-ready error handling
 */
export async function fetchJSON<T = unknown>(
  url: string,
  config: FetchConfig = {},
  schema?: z.ZodSchema<T>,
): Promise<FetchResult<T>> {
  return fetchWithRetry<T>(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Roundtable-Dashboard/1.0',
    },
  }, config, schema);
}

/**
 * POST request with JSON body and production-ready error handling
 */
export async function postJSON<T = unknown>(
  url: string,
  body: unknown,
  config: FetchConfig = {},
  headers: Record<string, string> = {},
  schema?: z.ZodSchema<T>,
): Promise<FetchResult<T>> {
  return fetchWithRetry<T>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Roundtable-Dashboard/1.0',
      ...headers, // Custom headers override defaults
    },
    body: JSON.stringify(body),
  }, config, schema);
}

/**
 * Create HTTPException from fetch result for consistent error handling
 * Uses type-safe HTTPExceptionFactory instead of casting
 */
export function createHTTPExceptionFromFetchResult(
  result: FetchResult<unknown>,
  operation: string,
): EnhancedHTTPException {
  if (result.success) {
    throw new Error('Cannot create exception from successful result');
  }

  const status = result.response?.status || HttpStatusCodes.SERVICE_UNAVAILABLE;
  const message = `${operation} failed: ${result.error}`;

  return HTTPExceptionFactory.fromNumber(status, {
    message,
    correlationId: result.response?.headers.get('x-correlation-id') || undefined,
    details: {
      detailType: 'fetch_error',
      operation,
      originalStatus: status,
      errorDetails: result.error,
      attempts: result.attempts,
      duration: result.duration,
    },
  });
}

/**
 * Parse response content safely with ZERO CASTING
 * Function overloads for type safety without casting
 */
async function parseResponseSafely<T>(
  response: Response,
  schema: z.ZodSchema<T>,
): Promise<ParsedResponse<T>>;
async function parseResponseSafely(
  response: Response,
): Promise<UnvalidatedParseResult>;
async function parseResponseSafely<T>(
  response: Response,
  schema?: z.ZodSchema<T>,
): Promise<ParsedResponse<T> | UnvalidatedParseResult> {
  const contentType = response.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      const jsonData = await response.json();

      if (schema) {
        const parseResult = schema.safeParse(jsonData);
        if (!parseResult.success) {
          return {
            success: false,
            error: `JSON validation failed: ${parseResult.error.message}`,
            contentType,
          };
        }
        return { success: true, data: parseResult.data, contentType };
      }

      // If no schema provided, return the raw JSON data as unknown
      // Consumers must handle type validation themselves
      return { success: true, data: jsonData, contentType };
    }

    if (contentType.includes('text/')) {
      const textData = await response.text();

      if (schema) {
        const parseResult = schema.safeParse(textData);
        if (!parseResult.success) {
          return {
            success: false,
            error: `Text validation failed: ${parseResult.error.message}`,
            contentType,
          };
        }
        return { success: true, data: parseResult.data, contentType };
      }

      // For text responses without schema, return as unknown
      return { success: true, data: textData, contentType };
    }

    // Binary data (ArrayBuffer)
    const bufferData = await response.arrayBuffer();

    if (schema) {
      const parseResult = schema.safeParse(bufferData);
      if (!parseResult.success) {
        return {
          success: false,
          error: `Binary validation failed: ${parseResult.error.message}`,
          contentType,
        };
      }
      return { success: true, data: parseResult.data, contentType };
    }

    // For binary responses without schema, return as unknown
    return { success: true, data: bufferData, contentType };
  } catch (parseError) {
    return {
      success: false,
      error: parseError instanceof Error ? parseError.message : 'Unknown parsing error',
      contentType,
    };
  }
}

/**
 * Environment variable validation following Hono patterns
 * Uses CloudflareEnv type for type safety
 */
export function validateEnvironmentVariables(
  env: CloudflareEnv,
  required: (keyof CloudflareEnv)[],
): void {
  const missing = required.filter(key => !env[key]);

  if (missing.length > 0) {
    const errorMessage = `Missing required environment variables: ${missing.join(', ')}`;

    throw createError.internal(errorMessage);
  }
}

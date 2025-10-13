/**
 * Maximum Type Safety HTTP Types
 * Eliminates all Record<string, unknown> with discriminated unions and specific types
 * Based on Context7 advanced patterns for Hono + Zod integration
 */

import { z } from 'zod';

import { API } from '@/constants/application';

// ============================================================================
// ADVANCED HTTP HEADER TYPES (Context7 Pattern)
// ============================================================================

/**
 * Discriminated union for HTTP headers with maximum type safety
 * Replaces generic Record<string, string>
 */
export const HttpHeadersSchema = z.discriminatedUnion('type', [
  // Content headers
  z.object({
    'type': z.literal('content'),
    'content-type': z.enum([
      'application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'text/plain',
    ]),
    'content-length': z.coerce.number().positive().optional(),
    'content-encoding': z.enum(['gzip', 'deflate', 'br']).optional(),
  }),

  // Authentication headers
  z.object({
    'type': z.literal('auth'),
    'authorization': z.string().refine(val =>
      val.startsWith('Bearer ') || val.startsWith('Basic '), 'Must be Bearer or Basic auth'),
    'x-api-key': z.string().min(10).optional(),
  }),

  // Security headers
  z.object({
    'type': z.literal('security'),
    'x-csrf-token': z.string().min(16),
    'x-request-id': z.string().uuid(),
    'user-agent': z.string().min(1),
    'origin': z.string().url().optional(),
    'referer': z.string().url().optional(),
  }),

  // Cache headers
  z.object({
    'type': z.literal('cache'),
    'cache-control': z.enum(['no-cache', 'max-age=3600', 'public', 'private']),
    'if-none-match': z.string().optional(),
    'etag': z.string().optional(),
  }),
]);

export type HttpHeaders = z.infer<typeof HttpHeadersSchema>;

// ============================================================================
// ADVANCED QUERY PARAMETER TYPES (Context7 Pattern)
// ============================================================================

/**
 * Discriminated union for query parameters with maximum type safety
 * Replaces generic Record<string, string>
 */
export const QueryParametersSchema = z.discriminatedUnion('category', [
  // Pagination queries (using constants from single source of truth)
  z.object({
    category: z.literal('pagination'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(API.MAX_PAGE_SIZE).default(API.DEFAULT_PAGE_SIZE),
    offset: z.coerce.number().int().min(0).optional(),
    cursor: z.string().optional(),
  }),

  // Search queries
  z.object({
    category: z.literal('search'),
    q: z.string().min(1).max(100),
    fields: z.array(z.string()).optional(),
    fuzzy: z.boolean().default(false),
    highlight: z.boolean().default(false),
  }),

  // Filter queries
  z.object({
    category: z.literal('filter'),
    status: z.enum(['active', 'inactive', 'pending', 'cancelled']).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    tags: z.array(z.string()).optional(),
  }),

  // Sort queries
  z.object({
    category: z.literal('sort'),
    sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'price', 'status']),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
]);

export type QueryParameters = z.infer<typeof QueryParametersSchema>;

// ============================================================================
// ADVANCED REQUEST BODY TYPES (Context7 Pattern)
// ============================================================================

/**
 * Discriminated union for request bodies with maximum type safety
 * Replaces generic unknown types
 */
export const RequestBodySchema = z.discriminatedUnion('contentType', [
  // JSON body
  z.object({
    contentType: z.literal('application/json'),
    data: z.record(z.string(), z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.unknown()),
      z.object({}).passthrough(),
    ])),
  }),

  // Form data
  z.object({
    contentType: z.literal('application/x-www-form-urlencoded'),
    fields: z.record(z.string(), z.string()),
  }),

  // Multipart form (file uploads)
  z.object({
    contentType: z.literal('multipart/form-data'),
    fields: z.record(z.string(), z.string()),
    files: z.array(z.object({
      fieldName: z.string(),
      filename: z.string(),
      mimeType: z.string(),
      size: z.number().positive(),
      content: z.instanceof(ArrayBuffer),
    })),
  }),
]);

export type RequestBody = z.infer<typeof RequestBodySchema>;

// ============================================================================
// SECURITY VALIDATION TYPES (Context7 Pattern)
// ============================================================================

/**
 * Discriminated union for security validation results
 * Maximum type safety for security checks
 */
export const SecurityValidationSchema = z.discriminatedUnion('level', [
  z.object({
    level: z.literal('safe'),
    content: z.string(),
    sanitized: z.string(),
  }),

  z.object({
    level: z.literal('warning'),
    content: z.string(),
    sanitized: z.string(),
    patterns: z.array(z.enum(['suspicious_chars', 'long_input', 'special_encoding'])),
    message: z.string(),
  }),

  z.object({
    level: z.literal('dangerous'),
    content: z.string(),
    patterns: z.array(z.enum(['sql_injection', 'xss', 'path_traversal', 'command_injection'])),
    blocked: z.literal(true),
    reason: z.string(),
  }),
]);

export type SecurityValidation = z.infer<typeof SecurityValidationSchema>;

// ============================================================================
// ENVIRONMENT VARIABLE TYPES (Context7 Pattern)
// ============================================================================

/**
 * Strict environment variable types eliminating Record<string, string>
 */
export const EnvironmentVariablesSchema = z.object({
  // Core application
  NODE_ENV: z.enum(['development', 'production', 'test']),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),

  // Storage
  R2_PUBLIC_URL: z.string().url(),
  CLOUDFLARE_ACCOUNT_ID: z.string().length(32),
  SIGNED_URL_SECRET: z.string().min(32),

  // Optional configurations
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MAX_REQUEST_SIZE: z.coerce.number().positive().default(10485760),
  RATE_LIMIT_WINDOW: z.coerce.number().positive().default(900),
});

export type EnvironmentVariables = z.infer<typeof EnvironmentVariablesSchema>;

/**
 * Environment summary with only safe-to-log values
 * Replaces generic Record<string, string>
 */
export const SafeEnvironmentSummarySchema = z.object({
  NODE_ENV: z.string(),
  LOG_LEVEL: z.string(),
  ENVIRONMENT_VERIFIED: z.boolean(),
  DATABASE_CONNECTION_STATUS: z.enum(['connected', 'disconnected', 'pending']),
  OAUTH_STATUS: z.enum(['configured', 'missing', 'invalid']),
  TIMESTAMP: z.string().datetime(),
});

export type SafeEnvironmentSummary = z.infer<typeof SafeEnvironmentSummarySchema>;

/**
 * Type-safe logger interfaces based on Context7 Hono documentation
 * Uses Zod schemas and discriminated unions for maximum type safety
 */

import { z } from 'zod';

/**
 * Flexible log contexts with discriminated union support (Context7 Pattern)
 * Uses passthrough() for additional properties while maintaining core type safety
 */
export const LogContextSchema = z.discriminatedUnion('logType', [
  z.object({
    logType: z.literal('request'),
    requestId: z.string(),
    userId: z.string().optional(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']),
    path: z.string(),
    operation: z.string().optional(),
    statusCode: z.number().int().optional(),
    duration: z.number().positive().optional(),
    userAgent: z.string().optional(),
  }).passthrough(),
  z.object({
    logType: z.literal('database'),
    table: z.string().optional(),
    operation: z.enum(['select', 'insert', 'update', 'delete', 'batch']),
    duration: z.number().positive().optional(),
    affectedRows: z.number().int().nonnegative().optional(),
    queryId: z.string().optional(),
    connectionPool: z.string().optional(),
  }).passthrough(),
  z.object({
    logType: z.literal('auth'),
    userId: z.string(),
    action: z.enum(['login', 'logout', 'token_refresh', 'permission_check', 'registration']),
    success: z.boolean(),
    ipAddress: z.string().optional(),
    sessionId: z.string().optional(),
    failureReason: z.string().optional(),
  }).passthrough(),
  z.object({
    logType: z.literal('validation'),
    fieldCount: z.number().int().nonnegative(),
    validationType: z.enum(['body', 'query', 'params', 'headers']),
    schemaName: z.string().optional(),
    errors: z.array(z.object({
      field: z.string(),
      message: z.string(),
      code: z.string().optional(),
    })).optional(),
    validationDuration: z.number().positive().optional(),
  }).passthrough(),
  z.object({
    logType: z.literal('performance'),
    duration: z.number().positive(),
    memoryUsage: z.number().positive().optional(),
    itemCount: z.number().int().nonnegative().optional(),
    cacheHit: z.boolean().optional(),
    component: z.string().optional(),
    marks: z.record(z.string(), z.number()).optional(),
  }).passthrough(),
  z.object({
    logType: z.literal('api'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']),
    path: z.string(),
    statusCode: z.number().int().optional(),
    duration: z.number().positive().optional(),
    responseSize: z.number().int().nonnegative().optional(),
    requestId: z.string().optional(),
  }).passthrough(),
]);

// Flexible: Discriminated union with Record fallback for custom logging needs
export type LogContext = z.infer<typeof LogContextSchema> | Record<string, unknown>;

// Logger interface with proper typing
export type TypedLogger = {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, contextOrError?: Error | LogContext, context?: LogContext) => void;
};

// Validation helper
export function validateLogContext(context: unknown): LogContext | null {
  const result = LogContextSchema.safeParse(context);
  return result.success ? result.data : null;
}

// Balanced: Type-safe helpers for common patterns while maintaining flexibility
export const LogHelpers = {
  request: (data: Record<string, unknown> & {
    requestId: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
    path: string;
  }): LogContext => ({
    logType: 'request' as const,
    ...data,
  }),
  database: (data: Record<string, unknown> & {
    operation: 'select' | 'insert' | 'update' | 'delete' | 'batch';
  }): LogContext => ({
    logType: 'database' as const,
    ...data,
  }),
  auth: (data: Record<string, unknown> & {
    userId: string;
    action: 'login' | 'logout' | 'token_refresh' | 'permission_check' | 'registration';
    success: boolean;
  }): LogContext => ({
    logType: 'auth' as const,
    ...data,
  }),
  validation: (data: Record<string, unknown> & {
    fieldCount: number;
    validationType: 'body' | 'query' | 'params' | 'headers';
  }): LogContext => ({
    logType: 'validation' as const,
    ...data,
  }),
  performance: (data: Record<string, unknown> & {
    duration: number;
  }): LogContext => ({
    logType: 'performance' as const,
    ...data,
  }),
  api: (data: Record<string, unknown> & {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
    path: string;
  }): LogContext => ({
    logType: 'api' as const,
    ...data,
  }),
} as const;

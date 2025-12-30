/**
 * Type-safe logger interfaces based on Context7 Hono documentation
 * Uses Zod schemas and discriminated unions for maximum type safety
 */

import { z } from 'zod';

import { AuthActionSchema, DatabaseOperationSchema, HttpMethodSchema, ValidationTypeSchema } from '@/api/core/enums';

/**
 * Flexible log contexts with discriminated union support (Context7 Pattern)
 * Uses explicit 'extra' field for additional properties with type safety
 */
export const LogContextSchema = z.discriminatedUnion('logType', [
  z.object({
    logType: z.literal('request'),
    requestId: z.string(),
    userId: z.string().optional(),
    method: HttpMethodSchema,
    path: z.string(),
    operation: z.string().optional(),
    statusCode: z.number().int().optional(),
    duration: z.number().positive().optional(),
    userAgent: z.string().optional(),
    extra: z.record(z.string(), z.unknown()).optional(), // Explicit extension field
  }),
  z.object({
    logType: z.literal('database'),
    table: z.string().optional(),
    operation: DatabaseOperationSchema,
    duration: z.number().positive().optional(),
    affectedRows: z.number().int().nonnegative().optional(),
    queryId: z.string().optional(),
    connectionPool: z.string().optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    logType: z.literal('auth'),
    userId: z.string(),
    action: AuthActionSchema,
    success: z.boolean(),
    ipAddress: z.string().optional(),
    sessionId: z.string().optional(),
    failureReason: z.string().optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    logType: z.literal('validation'),
    fieldCount: z.number().int().nonnegative(),
    validationType: ValidationTypeSchema,
    schemaName: z.string().optional(),
    errors: z.array(z.object({
      field: z.string(),
      message: z.string(),
      code: z.string().optional(),
    })).optional(),
    validationDuration: z.number().positive().optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    logType: z.literal('performance'),
    duration: z.number().positive(),
    memoryUsage: z.number().positive().optional(),
    itemCount: z.number().int().nonnegative().optional(),
    cacheHit: z.boolean().optional(),
    component: z.string().optional(),
    marks: z.record(z.string(), z.number()).optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    logType: z.literal('api'),
    method: HttpMethodSchema,
    path: z.string(),
    statusCode: z.number().int().optional(),
    duration: z.number().positive().optional(),
    responseSize: z.number().int().nonnegative().optional(),
    requestId: z.string().optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  }),
]);

// Flexible: Discriminated union with Record fallback for custom logging needs
export type LogContext = z.infer<typeof LogContextSchema> | Record<string, unknown>;

// Logger interface schema with proper typing
export const TypedLoggerSchema = z.object({
  debug: z.custom<(message: string, context?: LogContext) => void>(),
  info: z.custom<(message: string, context?: LogContext) => void>(),
  warn: z.custom<(message: string, context?: LogContext) => void>(),
  error: z.custom<(message: string, contextOrError?: Error | LogContext, context?: LogContext) => void>(),
});

export type TypedLogger = z.infer<typeof TypedLoggerSchema>;

// Validation helper
export function validateLogContext(context: unknown): LogContext | null {
  const result = LogContextSchema.safeParse(context);
  return result.success ? result.data : null;
}

// Balanced: Type-safe helpers for common patterns while maintaining flexibility
export const LogHelpers = {
  request: (data: Record<string, unknown> & {
    requestId: string;
    method: import('@/api/core/enums').HttpMethod;
    path: string;
  }): LogContext => ({
    logType: 'request' as const,
    ...data,
  }),
  database: (data: Record<string, unknown> & {
    operation: import('@/api/core/enums').DatabaseOperation;
  }): LogContext => ({
    logType: 'database' as const,
    ...data,
  }),
  auth: (data: Record<string, unknown> & {
    userId: string;
    action: import('@/api/core/enums').AuthAction;
    success: boolean;
  }): LogContext => ({
    logType: 'auth' as const,
    ...data,
  }),
  validation: (data: Record<string, unknown> & {
    fieldCount: number;
    validationType: import('@/api/core/enums').ValidationType;
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
    method: import('@/api/core/enums').HttpMethod;
    path: string;
  }): LogContext => ({
    logType: 'api' as const,
    ...data,
  }),
} as const;

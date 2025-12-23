/**
 * Common/Shared Enums
 *
 * Generic enums used across multiple domains.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// HTTP METHOD
// ============================================================================

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;

export const HttpMethodSchema = z.enum(HTTP_METHODS).openapi({
  description: 'HTTP request method',
  example: 'POST',
});

export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const HttpMethods = {
  GET: 'GET' as const,
  POST: 'POST' as const,
  PUT: 'PUT' as const,
  DELETE: 'DELETE' as const,
  PATCH: 'PATCH' as const,
  HEAD: 'HEAD' as const,
  OPTIONS: 'OPTIONS' as const,
} as const;

// ============================================================================
// DATABASE OPERATION
// ============================================================================

export const DATABASE_OPERATIONS = ['select', 'insert', 'update', 'delete', 'batch'] as const;

export const DatabaseOperationSchema = z.enum(DATABASE_OPERATIONS).openapi({
  description: 'Database operation type',
  example: 'insert',
});

export type DatabaseOperation = z.infer<typeof DatabaseOperationSchema>;

export const DatabaseOperations = {
  SELECT: 'select' as const,
  INSERT: 'insert' as const,
  UPDATE: 'update' as const,
  DELETE: 'delete' as const,
  BATCH: 'batch' as const,
} as const;

// ============================================================================
// HEALTH STATUS
// ============================================================================

export const HEALTH_STATUSES = ['healthy', 'degraded', 'unhealthy'] as const;

export const HealthStatusSchema = z.enum(HEALTH_STATUSES).openapi({
  description: 'System health status',
  example: 'healthy',
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const HealthStatuses = {
  HEALTHY: 'healthy' as const,
  DEGRADED: 'degraded' as const,
  UNHEALTHY: 'unhealthy' as const,
} as const;

// ============================================================================
// ENVIRONMENT
// ============================================================================

export const ENVIRONMENTS = ['development', 'preview', 'production', 'test', 'local'] as const;

export const EnvironmentSchema = z.enum(ENVIRONMENTS).openapi({
  description: 'Application runtime environment',
  example: 'production',
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export const Environments = {
  DEVELOPMENT: 'development' as const,
  PREVIEW: 'preview' as const,
  PRODUCTION: 'production' as const,
  TEST: 'test' as const,
  LOCAL: 'local' as const,
} as const;

// ============================================================================
// SORT DIRECTION
// ============================================================================

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export const SortDirectionSchema = z.enum(SORT_DIRECTIONS).default('desc').openapi({
  description: 'Sort order direction',
  example: 'desc',
});

export type SortDirection = z.infer<typeof SortDirectionSchema>;

export const DEFAULT_SORT_DIRECTION: SortDirection = 'desc';

export const SortDirections = {
  ASC: 'asc' as const,
  DESC: 'desc' as const,
} as const;

// ============================================================================
// SORT DIRECTION LABELS (UI Display)
// ============================================================================

export const SORT_DIRECTION_LABELS: Record<SortDirection, string> = {
  [SortDirections.ASC]: 'Ascending',
  [SortDirections.DESC]: 'Descending',
} as const;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function isValidSortDirection(value: unknown): value is SortDirection {
  return typeof value === 'string' && SORT_DIRECTIONS.includes(value as SortDirection);
}

export function isValidDatabaseOperation(value: unknown): value is DatabaseOperation {
  return typeof value === 'string' && DATABASE_OPERATIONS.includes(value as DatabaseOperation);
}

export function isValidHealthStatus(value: unknown): value is HealthStatus {
  return typeof value === 'string' && HEALTH_STATUSES.includes(value as HealthStatus);
}

export function isValidEnvironment(value: unknown): value is Environment {
  return typeof value === 'string' && ENVIRONMENTS.includes(value as Environment);
}

export function isValidHttpMethod(value: unknown): value is HttpMethod {
  return typeof value === 'string' && HTTP_METHODS.includes(value as HttpMethod);
}

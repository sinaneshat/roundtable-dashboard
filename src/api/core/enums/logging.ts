/**
 * Logging Enums
 *
 * Enums for log levels and logging configurations.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// LOG LEVEL (API/Backend)
// ============================================================================

export const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;

export const DEFAULT_LOG_LEVEL: LogLevel = 'INFO';

export const LogLevelSchema = z.enum(LOG_LEVELS).openapi({
  description: 'API log level',
  example: 'INFO',
});

export type LogLevel = z.infer<typeof LogLevelSchema>;

export const LogLevels = {
  DEBUG: 'DEBUG' as const,
  INFO: 'INFO' as const,
  WARN: 'WARN' as const,
  ERROR: 'ERROR' as const,
} as const;

// ============================================================================
// DEV LOG LEVEL (Development Logger)
// ============================================================================

export const DEV_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export const DEFAULT_DEV_LOG_LEVEL: DevLogLevel = 'info';

export const DevLogLevelSchema = z.enum(DEV_LOG_LEVELS).openapi({
  description: 'Development logger level',
  example: 'info',
});

export type DevLogLevel = z.infer<typeof DevLogLevelSchema>;

export const DevLogLevels = {
  DEBUG: 'debug' as const,
  INFO: 'info' as const,
  WARN: 'warn' as const,
  ERROR: 'error' as const,
} as const;

// ============================================================================
// LOG LEVEL LABELS (UI Display)
// ============================================================================

export const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevels.DEBUG]: 'Debug',
  [LogLevels.INFO]: 'Info',
  [LogLevels.WARN]: 'Warning',
  [LogLevels.ERROR]: 'Error',
} as const;

export const DEV_LOG_LEVEL_LABELS: Record<DevLogLevel, string> = {
  [DevLogLevels.DEBUG]: 'Debug',
  [DevLogLevels.INFO]: 'Info',
  [DevLogLevels.WARN]: 'Warning',
  [DevLogLevels.ERROR]: 'Error',
} as const;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function isValidLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && LOG_LEVELS.includes(value as LogLevel);
}

export function isValidDevLogLevel(value: unknown): value is DevLogLevel {
  return typeof value === 'string' && DEV_LOG_LEVELS.includes(value as DevLogLevel);
}

// ============================================================================
// LOG LEVEL VALUES (for sorting/comparison)
// ============================================================================

export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  [LogLevels.DEBUG]: 0,
  [LogLevels.INFO]: 1,
  [LogLevels.WARN]: 2,
  [LogLevels.ERROR]: 3,
} as const;

export const DEV_LOG_LEVEL_VALUES: Record<DevLogLevel, number> = {
  [DevLogLevels.DEBUG]: 0,
  [DevLogLevels.INFO]: 1,
  [DevLogLevels.WARN]: 2,
  [DevLogLevels.ERROR]: 3,
} as const;

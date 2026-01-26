/**
 * Logging Enums
 *
 * Enums for log levels and logging configurations.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// LOG LEVEL (API/Backend)
// ============================================================================

// 1. ARRAY CONSTANT
export const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_LOG_LEVEL = 'INFO' as const;

// 3. ZOD SCHEMA
export const LogLevelSchema = z.enum(LOG_LEVELS).openapi({
  description: 'API log level',
  example: 'INFO',
});

// 4. TYPESCRIPT TYPE
export type LogLevel = z.infer<typeof LogLevelSchema>;

// 5. CONSTANT OBJECT
export const LogLevels = {
  DEBUG: 'DEBUG' as const,
  ERROR: 'ERROR' as const,
  INFO: 'INFO' as const,
  WARN: 'WARN' as const,
} as const;

// ============================================================================
// DEV LOG LEVEL (Development Logger)
// ============================================================================

// 1. ARRAY CONSTANT
export const DEV_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_DEV_LOG_LEVEL = 'info' as const;

// 3. ZOD SCHEMA
export const DevLogLevelSchema = z.enum(DEV_LOG_LEVELS).openapi({
  description: 'Development logger level',
  example: 'info',
});

// 4. TYPESCRIPT TYPE
export type DevLogLevel = z.infer<typeof DevLogLevelSchema>;

// 5. CONSTANT OBJECT
export const DevLogLevels = {
  DEBUG: 'debug' as const,
  ERROR: 'error' as const,
  INFO: 'info' as const,
  WARN: 'warn' as const,
} as const;

// ============================================================================
// LOG LEVEL LABELS (UI Display)
// ============================================================================

export const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevels.DEBUG]: 'Debug',
  [LogLevels.ERROR]: 'Error',
  [LogLevels.INFO]: 'Info',
  [LogLevels.WARN]: 'Warning',
} as const;

export const DEV_LOG_LEVEL_LABELS: Record<DevLogLevel, string> = {
  [DevLogLevels.DEBUG]: 'Debug',
  [DevLogLevels.ERROR]: 'Error',
  [DevLogLevels.INFO]: 'Info',
  [DevLogLevels.WARN]: 'Warning',
} as const;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function isValidLogLevel(value: unknown): value is LogLevel {
  return LogLevelSchema.safeParse(value).success;
}

export function isValidDevLogLevel(value: unknown): value is DevLogLevel {
  return DevLogLevelSchema.safeParse(value).success;
}

// ============================================================================
// LOG LEVEL VALUES (for sorting/comparison)
// ============================================================================

export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  [LogLevels.DEBUG]: 0,
  [LogLevels.ERROR]: 3,
  [LogLevels.INFO]: 1,
  [LogLevels.WARN]: 2,
} as const;

export const DEV_LOG_LEVEL_VALUES: Record<DevLogLevel, number> = {
  [DevLogLevels.DEBUG]: 0,
  [DevLogLevels.ERROR]: 3,
  [DevLogLevels.INFO]: 1,
  [DevLogLevels.WARN]: 2,
} as const;

// ============================================================================
// RLOG CATEGORY (Resumption Debug Logger)
// ============================================================================

// 1. ARRAY CONSTANT
export const RLOG_CATEGORIES = ['PHASE', 'RESUME', 'STREAM', 'MSG', 'GATE', 'TRIGGER', 'PRESRCH', 'MOD', 'CHANGELOG', 'SUBMIT', 'INIT', 'SYNC'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_RLOG_CATEGORY = 'PHASE' as const;

// 3. ZOD SCHEMA
export const RlogCategorySchema = z.enum(RLOG_CATEGORIES).openapi({
  description: 'Resumption debug log category',
  example: 'PHASE',
});

// 4. TYPESCRIPT TYPE
export type RlogCategory = z.infer<typeof RlogCategorySchema>;

// 5. CONSTANT OBJECT
export const RlogCategories = {
  CHANGELOG: 'CHANGELOG' as const,
  GATE: 'GATE' as const,
  INIT: 'INIT' as const,
  MOD: 'MOD' as const,
  MSG: 'MSG' as const,
  PHASE: 'PHASE' as const,
  PRESRCH: 'PRESRCH' as const,
  RESUME: 'RESUME' as const,
  STREAM: 'STREAM' as const,
  SUBMIT: 'SUBMIT' as const,
  SYNC: 'SYNC' as const,
  TRIGGER: 'TRIGGER' as const,
} as const;

// ============================================================================
// RLOG STREAM ACTION
// ============================================================================

// 1. ARRAY CONSTANT
export const RLOG_STREAM_ACTIONS = ['start', 'end', 'resume', 'check'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_RLOG_STREAM_ACTION = 'start' as const;

// 3. ZOD SCHEMA
export const RlogStreamActionSchema = z.enum(RLOG_STREAM_ACTIONS).openapi({
  description: 'Stream action for resumption debug logging',
  example: 'start',
});

// 4. TYPESCRIPT TYPE
export type RlogStreamAction = z.infer<typeof RlogStreamActionSchema>;

// 5. CONSTANT OBJECT
export const RlogStreamActions = {
  CHECK: 'check' as const,
  END: 'end' as const,
  RESUME: 'resume' as const,
  START: 'start' as const,
} as const;

// ============================================================================
// DEV LOG MOD EVENT
// ============================================================================

// 1. ARRAY CONSTANT
export const DEV_LOG_MOD_EVENTS = ['start', 'text', 'done', 'add', 'err'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_DEV_LOG_MOD_EVENT = 'start' as const;

// 3. ZOD SCHEMA
export const DevLogModEventSchema = z.enum(DEV_LOG_MOD_EVENTS).openapi({
  description: 'Moderator event type for dev logging',
  example: 'start',
});

// 4. TYPESCRIPT TYPE
export type DevLogModEvent = z.infer<typeof DevLogModEventSchema>;

// 5. CONSTANT OBJECT
export const DevLogModEvents = {
  ADD: 'add' as const,
  DONE: 'done' as const,
  ERR: 'err' as const,
  START: 'start' as const,
  TEXT: 'text' as const,
} as const;

// ============================================================================
// DEV LOG MSG EVENT
// ============================================================================

// 1. ARRAY CONSTANT
export const DEV_LOG_MSG_EVENTS = ['sync', 'flash'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_DEV_LOG_MSG_EVENT = 'sync' as const;

// 3. ZOD SCHEMA
export const DevLogMsgEventSchema = z.enum(DEV_LOG_MSG_EVENTS).openapi({
  description: 'Message event type for dev logging',
  example: 'sync',
});

// 4. TYPESCRIPT TYPE
export type DevLogMsgEvent = z.infer<typeof DevLogMsgEventSchema>;

// 5. CONSTANT OBJECT
export const DevLogMsgEvents = {
  FLASH: 'flash' as const,
  SYNC: 'sync' as const,
} as const;

// ============================================================================
// LOG TYPE (Logger Context Types)
// ============================================================================

// 1. ARRAY CONSTANT
export const LOG_TYPES = ['request', 'database', 'auth', 'validation', 'performance', 'api', 'operation', 'system', 'edge_case', 'alarm_error', 'alarm_retry', 'do_fetch_error'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_LOG_TYPE = 'operation' as const;

// 3. ZOD SCHEMA
export const LogTypeSchema = z.enum(LOG_TYPES).openapi({
  description: 'Log context type for discriminated union',
  example: 'request',
});

// 4. TYPESCRIPT TYPE
export type LogType = z.infer<typeof LogTypeSchema>;

// 5. CONSTANT OBJECT
export const LogTypes = {
  ALARM_ERROR: 'alarm_error' as const,
  ALARM_RETRY: 'alarm_retry' as const,
  API: 'api' as const,
  AUTH: 'auth' as const,
  DATABASE: 'database' as const,
  DO_FETCH_ERROR: 'do_fetch_error' as const,
  EDGE_CASE: 'edge_case' as const,
  OPERATION: 'operation' as const,
  PERFORMANCE: 'performance' as const,
  REQUEST: 'request' as const,
  SYSTEM: 'system' as const,
  VALIDATION: 'validation' as const,
} as const;

// ============================================================================
// RLOG STYLE MAPPING
// ============================================================================

export const RLOG_CATEGORY_STYLES: Record<RlogCategory, string> = {
  [RlogCategories.CHANGELOG]: 'color: #009688; font-weight: bold',
  [RlogCategories.GATE]: 'color: #F44336',
  [RlogCategories.INIT]: 'color: #607D8B; font-weight: bold',
  [RlogCategories.MOD]: 'color: #673AB7; font-weight: bold',
  [RlogCategories.MSG]: 'color: #9C27B0',
  [RlogCategories.PHASE]: 'color: #4CAF50; font-weight: bold',
  [RlogCategories.PRESRCH]: 'color: #E91E63',
  [RlogCategories.RESUME]: 'color: #2196F3; font-weight: bold',
  [RlogCategories.STREAM]: 'color: #FF9800',
  [RlogCategories.SUBMIT]: 'color: #795548; font-weight: bold',
  [RlogCategories.SYNC]: 'color: #3F51B5',
  [RlogCategories.TRIGGER]: 'color: #00BCD4; font-weight: bold',
} as const;

// ============================================================================
// POSTHOG LOG LEVEL (Extended log levels for PostHog observability)
// ============================================================================

// 1. ARRAY CONSTANT
export const POSTHOG_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_POSTHOG_LOG_LEVEL = 'info' as const;

// 3. ZOD SCHEMA
export const PosthogLogLevelSchema = z.enum(POSTHOG_LOG_LEVELS).openapi({
  description: 'PostHog log level for structured observability',
  example: 'info',
});

// 4. TYPESCRIPT TYPE
export type PosthogLogLevel = z.infer<typeof PosthogLogLevelSchema>;

// 5. CONSTANT OBJECT
export const PosthogLogLevels = {
  DEBUG: 'debug' as const,
  ERROR: 'error' as const,
  FATAL: 'fatal' as const,
  INFO: 'info' as const,
  TRACE: 'trace' as const,
  WARN: 'warn' as const,
} as const;

// 6. VALIDATION HELPER
export function isValidPosthogLogLevel(value: unknown): value is PosthogLogLevel {
  return PosthogLogLevelSchema.safeParse(value).success;
}

// 7. PRIORITY VALUES (for sorting/comparison)
export const POSTHOG_LOG_LEVEL_VALUES: Record<PosthogLogLevel, number> = {
  [PosthogLogLevels.DEBUG]: 1,
  [PosthogLogLevels.ERROR]: 4,
  [PosthogLogLevels.FATAL]: 5,
  [PosthogLogLevels.INFO]: 2,
  [PosthogLogLevels.TRACE]: 0,
  [PosthogLogLevels.WARN]: 3,
} as const;

// ============================================================================
// REQUEST LOG LEVEL (Request Logger Middleware)
// ============================================================================

// 1. ARRAY CONSTANT
export const REQUEST_LOG_LEVELS = ['none', 'minimal', 'standard', 'verbose'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_REQUEST_LOG_LEVEL: RequestLogLevel = 'standard';

// 3. ZOD SCHEMA
export const RequestLogLevelSchema = z.enum(REQUEST_LOG_LEVELS).openapi({
  description: 'Request logging verbosity level for middleware',
  example: 'standard',
});

// 4. TYPESCRIPT TYPE
export type RequestLogLevel = z.infer<typeof RequestLogLevelSchema>;

// 5. CONSTANT OBJECT
export const RequestLogLevels = {
  MINIMAL: 'minimal' as const,
  NONE: 'none' as const,
  STANDARD: 'standard' as const,
  VERBOSE: 'verbose' as const,
} as const;

// 6. VALIDATION HELPER
export function isValidRequestLogLevel(value: unknown): value is RequestLogLevel {
  return RequestLogLevelSchema.safeParse(value).success;
}

// 7. ENVIRONMENT MAPPING
export const REQUEST_LOG_LEVEL_BY_ENV: Record<string, RequestLogLevel> = {
  development: RequestLogLevels.NONE,
  local: RequestLogLevels.NONE,
  preview: RequestLogLevels.STANDARD,
  prod: RequestLogLevels.MINIMAL,
  production: RequestLogLevels.MINIMAL,
  test: RequestLogLevels.MINIMAL,
} as const;

// ============================================================================
// DEBUG DATA (Dev Logger)
// ============================================================================

export const DebugDataSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()]))
  .readonly();

export type DebugData = z.infer<typeof DebugDataSchema>;

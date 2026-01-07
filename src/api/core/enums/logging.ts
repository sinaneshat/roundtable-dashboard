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
  INFO: 'INFO' as const,
  WARN: 'WARN' as const,
  ERROR: 'ERROR' as const,
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

// ============================================================================
// RLOG CATEGORY (Resumption Debug Logger)
// ============================================================================

// 1. ARRAY CONSTANT
export const RLOG_CATEGORIES = ['PHASE', 'RESUME', 'STREAM', 'MSG', 'GATE', 'TRIGGER', 'PRESRCH', 'MOD', 'CHANGELOG', 'SUBMIT'] as const;

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
  PHASE: 'PHASE' as const,
  RESUME: 'RESUME' as const,
  STREAM: 'STREAM' as const,
  MSG: 'MSG' as const,
  GATE: 'GATE' as const,
  TRIGGER: 'TRIGGER' as const,
  PRESRCH: 'PRESRCH' as const,
  MOD: 'MOD' as const,
  CHANGELOG: 'CHANGELOG' as const,
  SUBMIT: 'SUBMIT' as const,
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
  START: 'start' as const,
  END: 'end' as const,
  RESUME: 'resume' as const,
  CHECK: 'check' as const,
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
  START: 'start' as const,
  TEXT: 'text' as const,
  DONE: 'done' as const,
  ADD: 'add' as const,
  ERR: 'err' as const,
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
  SYNC: 'sync' as const,
  FLASH: 'flash' as const,
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
  REQUEST: 'request' as const,
  DATABASE: 'database' as const,
  AUTH: 'auth' as const,
  VALIDATION: 'validation' as const,
  PERFORMANCE: 'performance' as const,
  API: 'api' as const,
  OPERATION: 'operation' as const,
  SYSTEM: 'system' as const,
  EDGE_CASE: 'edge_case' as const,
  ALARM_ERROR: 'alarm_error' as const,
  ALARM_RETRY: 'alarm_retry' as const,
  DO_FETCH_ERROR: 'do_fetch_error' as const,
} as const;

// ============================================================================
// RLOG STYLE MAPPING
// ============================================================================

export const RLOG_CATEGORY_STYLES: Record<RlogCategory, string> = {
  [RlogCategories.PHASE]: 'color: #4CAF50; font-weight: bold',
  [RlogCategories.RESUME]: 'color: #2196F3; font-weight: bold',
  [RlogCategories.STREAM]: 'color: #FF9800',
  [RlogCategories.MSG]: 'color: #9C27B0',
  [RlogCategories.GATE]: 'color: #F44336',
  [RlogCategories.TRIGGER]: 'color: #00BCD4; font-weight: bold',
  [RlogCategories.PRESRCH]: 'color: #E91E63',
  [RlogCategories.MOD]: 'color: #673AB7; font-weight: bold',
  [RlogCategories.CHANGELOG]: 'color: #009688; font-weight: bold',
  [RlogCategories.SUBMIT]: 'color: #795548; font-weight: bold',
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
  TRACE: 'trace' as const,
  DEBUG: 'debug' as const,
  INFO: 'info' as const,
  WARN: 'warn' as const,
  ERROR: 'error' as const,
  FATAL: 'fatal' as const,
} as const;

// 6. VALIDATION HELPER
export function isValidPosthogLogLevel(value: unknown): value is PosthogLogLevel {
  return typeof value === 'string' && POSTHOG_LOG_LEVELS.includes(value as PosthogLogLevel);
}

// 7. PRIORITY VALUES (for sorting/comparison)
export const POSTHOG_LOG_LEVEL_VALUES: Record<PosthogLogLevel, number> = {
  [PosthogLogLevels.TRACE]: 0,
  [PosthogLogLevels.DEBUG]: 1,
  [PosthogLogLevels.INFO]: 2,
  [PosthogLogLevels.WARN]: 3,
  [PosthogLogLevels.ERROR]: 4,
  [PosthogLogLevels.FATAL]: 5,
} as const;

// ============================================================================
// DEBUG DATA (Dev Logger)
// ============================================================================

export const DebugDataSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()]))
  .readonly();

export type DebugData = z.infer<typeof DebugDataSchema>;

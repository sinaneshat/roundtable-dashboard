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

// ============================================================================
// RLOG CATEGORY (Resumption Debug Logger)
// ============================================================================

export const RLOG_CATEGORIES = ['PHASE', 'RESUME', 'STREAM', 'MSG', 'GATE', 'TRIGGER', 'PRESRCH', 'MOD'] as const;

export const RlogCategorySchema = z.enum(RLOG_CATEGORIES).openapi({
  description: 'Resumption debug log category',
  example: 'PHASE',
});

export type RlogCategory = z.infer<typeof RlogCategorySchema>;

export const RlogCategories = {
  PHASE: 'PHASE' as const,
  RESUME: 'RESUME' as const,
  STREAM: 'STREAM' as const,
  MSG: 'MSG' as const,
  GATE: 'GATE' as const,
  TRIGGER: 'TRIGGER' as const,
  PRESRCH: 'PRESRCH' as const,
  MOD: 'MOD' as const,
} as const;

// ============================================================================
// RLOG STREAM ACTION
// ============================================================================

export const RLOG_STREAM_ACTIONS = ['start', 'end', 'resume', 'check'] as const;

export const RlogStreamActionSchema = z.enum(RLOG_STREAM_ACTIONS).openapi({
  description: 'Stream action for resumption debug logging',
  example: 'start',
});

export type RlogStreamAction = z.infer<typeof RlogStreamActionSchema>;

export const RlogStreamActions = {
  START: 'start' as const,
  END: 'end' as const,
  RESUME: 'resume' as const,
  CHECK: 'check' as const,
} as const;

// ============================================================================
// DEV LOG MOD EVENT
// ============================================================================

export const DEV_LOG_MOD_EVENTS = ['start', 'text', 'done', 'add', 'err'] as const;

export const DevLogModEventSchema = z.enum(DEV_LOG_MOD_EVENTS).openapi({
  description: 'Moderator event type for dev logging',
  example: 'start',
});

export type DevLogModEvent = z.infer<typeof DevLogModEventSchema>;

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

export const DEV_LOG_MSG_EVENTS = ['sync', 'flash'] as const;

export const DevLogMsgEventSchema = z.enum(DEV_LOG_MSG_EVENTS).openapi({
  description: 'Message event type for dev logging',
  example: 'sync',
});

export type DevLogMsgEvent = z.infer<typeof DevLogMsgEventSchema>;

export const DevLogMsgEvents = {
  SYNC: 'sync' as const,
  FLASH: 'flash' as const,
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
} as const;

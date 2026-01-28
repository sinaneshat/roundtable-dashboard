/**
 * Unified Logger Types
 *
 * Shared type definitions for the unified logger that works across
 * frontend (browser) and backend (Cloudflare Workers) environments.
 *
 * NOTE: Logger and LoggerConfig types use TypeScript's type system directly
 * because they contain function signatures which cannot be represented as Zod schemas.
 * Zod is designed for data validation, not function type definitions.
 */

import { z } from '@hono/zod-openapi';

import type { RlogCategory } from '../../enums/logging';

// ============================================================================
// BACKEND LOG CATEGORIES
// ============================================================================

// 1. ARRAY CONSTANT
export const BACKEND_LOG_CATEGORIES = [
  'PDF',
  'AUDIT',
  'AUTH',
  'DB',
  'CACHE',
  'UPLOAD',
  'BILLING',
  'AI',
  'MCP',
  'QUEUE',
  'CRON',
  'HTTP',
] as const;

// 2. ZOD SCHEMA
export const BackendLogCategorySchema = z.enum(BACKEND_LOG_CATEGORIES).openapi({
  description: 'Backend-specific log categories for service-level logging',
  example: 'AUTH',
});

// 3. TYPESCRIPT TYPE
export type BackendLogCategory = z.infer<typeof BackendLogCategorySchema>;

// 4. CONSTANT OBJECT
export const BackendLogCategories = {
  AI: 'AI' as const,
  AUDIT: 'AUDIT' as const,
  AUTH: 'AUTH' as const,
  BILLING: 'BILLING' as const,
  CACHE: 'CACHE' as const,
  CRON: 'CRON' as const,
  DB: 'DB' as const,
  HTTP: 'HTTP' as const,
  MCP: 'MCP' as const,
  PDF: 'PDF' as const,
  QUEUE: 'QUEUE' as const,
  UPLOAD: 'UPLOAD' as const,
} as const;

// ============================================================================
// UNIFIED LOG CATEGORY
// ============================================================================

/**
 * All log categories (rlog + backend)
 * Note: This is a union type that cannot be represented as a single Zod schema
 */
export type LogCategory = RlogCategory | BackendLogCategory;

// ============================================================================
// CONSOLE LOG LEVEL
// ============================================================================

// 1. ARRAY CONSTANT
export const CONSOLE_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

// 2. ZOD SCHEMA
export const ConsoleLogLevelSchema = z.enum(CONSOLE_LOG_LEVELS).openapi({
  description: 'Log levels matching console methods',
  example: 'info',
});

// 3. TYPESCRIPT TYPE
export type ConsoleLogLevel = z.infer<typeof ConsoleLogLevelSchema>;

// 4. CONSTANT OBJECT
export const ConsoleLogLevels = {
  DEBUG: 'debug' as const,
  ERROR: 'error' as const,
  INFO: 'info' as const,
  WARN: 'warn' as const,
} as const;

// ============================================================================
// LOG DATA
// ============================================================================

/**
 * Data that can be logged alongside messages
 */
export const LogDataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()]),
);

export type LogData = z.infer<typeof LogDataSchema>;

// ============================================================================
// OUTPUT FUNCTION
// ============================================================================

/**
 * Output function signature - implemented differently per environment
 */
export type LogOutputFn = (
  level: ConsoleLogLevel,
  category: LogCategory,
  action: string | null,
  message: string,
  data?: LogData | Error,
) => void;

// ============================================================================
// LOGGER CONFIG
// ============================================================================

/**
 * Logger configuration
 */
export type LoggerConfig = {
  /** Whether running in development mode */
  isDev: boolean;
  /** Output function - handles actual console calls */
  output: LogOutputFn;
  /** Optional: check if logging is enabled (e.g., localStorage flag) */
  isEnabled?: () => boolean;
};

// ============================================================================
// LOGGER INTERFACE
// ============================================================================

/**
 * The unified logger interface
 */
export type Logger = {
  // Backend service categories
  pdf: (action: string, message: string, data?: LogData) => void;
  audit: (action: string, data: LogData) => void;
  auth: (action: string, message: string, data?: LogData) => void;
  db: (action: string, message: string, data?: LogData) => void;
  cache: (action: string, message: string, data?: LogData) => void;
  upload: (action: string, message: string, data?: LogData) => void;
  billing: (action: string, message: string, data?: LogData) => void;
  ai: (action: string, message: string, data?: LogData) => void;
  mcp: (action: string, message: string, data?: LogData) => void;
  queue: (action: string, message: string, data?: LogData) => void;
  cron: (action: string, message: string, data?: LogData) => void;
  http: (action: string, message: string, data?: LogData) => void;

  // Generic level-based logging
  debug: (message: string, data?: LogData) => void;
  info: (message: string, data?: LogData) => void;
  warn: (message: string, data?: LogData) => void;
  error: (message: string, error?: Error | LogData) => void;
};

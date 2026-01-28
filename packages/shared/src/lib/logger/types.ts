/**
 * Unified Logger Types
 *
 * Shared type definitions for the unified logger that works across
 * frontend (browser) and backend (Cloudflare Workers) environments.
 */

import type { RlogCategory } from '../../enums/logging';

// ============================================================================
// BACKEND LOG CATEGORIES
// ============================================================================

/**
 * Backend-specific log categories for service-level logging
 */
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

export type BackendLogCategory = (typeof BACKEND_LOG_CATEGORIES)[number];

// ============================================================================
// UNIFIED LOG CATEGORY
// ============================================================================

/**
 * All log categories (rlog + backend)
 */
export type LogCategory = RlogCategory | BackendLogCategory;

// ============================================================================
// CONSOLE LOG LEVEL
// ============================================================================

/**
 * Log levels matching console methods
 */
export type ConsoleLogLevel = 'debug' | 'info' | 'warn' | 'error';

// ============================================================================
// LOG DATA
// ============================================================================

/**
 * Data that can be logged alongside messages
 */
export type LogData = Record<string, string | number | boolean | null | undefined>;

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

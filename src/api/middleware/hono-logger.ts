/**
 * Environment-Aware Centralized Hono Logger Middleware
 *
 * Logging behavior by environment:
 * - local/development: All logs (DEBUG, INFO, WARN, ERROR)
 * - preview: INFO, WARN, ERROR
 * - production: ERROR only
 */

import type { Context } from 'hono';
import { logger } from 'hono/logger';

import type { LogLevel } from '@/api/core/config';
import { getLoggingConfig, shouldLog } from '@/api/core/config';
import type { LogContext, TypedLogger } from '@/api/types/logger';

/**
 * Custom structured logger for Hono API
 * Follows official Hono documentation patterns
 */
export class HonoLogger implements TypedLogger {
  private static instance: HonoLogger;

  private constructor() {}

  static getInstance(): HonoLogger {
    if (!HonoLogger.instance) {
      HonoLogger.instance = new HonoLogger();
    }
    return HonoLogger.instance;
  }

  /**
   * Environment-aware logging
   * Respects LOGGING_CONFIG based on environment
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    // ✅ Check if this log level should be logged in current environment
    if (!shouldLog(level)) {
      return; // Silently skip - zero overhead in production
    }

    const config = getLoggingConfig();
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(context && { context }),
    };

    const formattedMessage = config.prettyPrint
      ? JSON.stringify(logEntry, null, 2)
      : JSON.stringify(logEntry);

    // Use appropriate console method based on level
    switch (level) {
      case 'DEBUG':
        console.warn(`[DEBUG] ${formattedMessage}`);
        break;
      case 'INFO':
        console.warn(`[INFO] ${formattedMessage}`);
        break;
      case 'WARN':
        console.warn(`[WARN] ${formattedMessage}`);
        break;
      case 'ERROR':
        console.error(`[ERROR] ${formattedMessage}`);
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('DEBUG', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('INFO', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('WARN', message, context);
  }

  error(message: string, contextOrError?: Error | LogContext, context?: LogContext): void {
    let finalContext: LogContext | undefined;

    if (contextOrError instanceof Error) {
      finalContext = { ...context, error: { name: contextOrError.name, message: contextOrError.message } };
    } else {
      finalContext = contextOrError;
    }
    this.log('ERROR', message, finalContext);
  }

  /**
   * Log API errors with request context
   * Always logged (even in production for critical errors)
   */
  apiError(c: Context, message: string, error?: unknown): void {
    const config = getLoggingConfig();
    const errorContext = {
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('User-Agent'),
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: config.includeStack ? error.stack : undefined }
        : error,
    };

    this.error(message, errorContext);
  }

  /**
   * Log API success with request context
   * Only logged in non-production environments
   */
  apiSuccess(c: Context, message: string, data?: LogContext): void {
    const successContext = {
      method: c.req.method,
      path: c.req.path,
      status: 'success',
      ...(data && { data }),
    };

    this.info(message, successContext);
  }
}

/**
 * Singleton instance for easy import
 */
export const apiLogger = HonoLogger.getInstance();

/**
 * Environment-aware PrintFunc for Hono's logger middleware
 * Only logs HTTP requests in non-production environments
 */
function customPrintFunc(message: string, ...rest: string[]) {
  // ✅ Skip HTTP request logging in production
  if (!shouldLog('INFO')) {
    return;
  }

  const config = getLoggingConfig();
  const trimmedMessage = message.trim();
  const timestamp = new Date().toISOString();

  // Enhanced formatting for API logs
  const formattedLog = config.prettyPrint
    ? `[API] ${timestamp} ${trimmedMessage} ${rest.join(' ')}`
    : JSON.stringify({
        timestamp,
        message: trimmedMessage,
        details: rest.join(' '),
        type: 'api_request',
      });

  console.warn(formattedLog);
}

/**
 * Configured Hono logger middleware
 * Disabled in production, enabled in dev/preview
 */
export const honoLoggerMiddleware = logger(customPrintFunc);

/**
 * Error handling middleware for logging unhandled errors
 */
export async function errorLoggerMiddleware(c: Context, next: () => Promise<void>) {
  try {
    await next();
  } catch (error) {
    apiLogger.apiError(c, 'Unhandled API error', error);

    // Re-throw to let other error handlers deal with it
    throw error;
  }
}

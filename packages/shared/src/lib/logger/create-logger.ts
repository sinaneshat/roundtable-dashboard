/**
 * Logger Factory
 *
 * Create a logger instance with the given configuration.
 * Works across frontend (browser) and backend (Cloudflare Workers) environments.
 */

import { formatError } from './format';
import type { LogData, Logger, LoggerConfig } from './types';

/**
 * Create a logger instance with the given configuration
 *
 * @example
 * // Backend usage
 * const log = createLogger({
 *   isDev: process.env.NODE_ENV === 'development',
 *   output: backendOutput,
 * });
 *
 * log.pdf('init', 'Initializing PDF.js...');
 * log.audit('download', { userId: 'abc', fileId: 'xyz' });
 */
export function createLogger(config: LoggerConfig): Logger {
  const { isEnabled, output } = config;

  const shouldLog = () => isEnabled?.() ?? true;

  const logCategory = (
    category: string,
    action: string,
    message: string,
    data?: LogData,
  ) => {
    if (!shouldLog()) {
      return;
    }
    output('info', category as never, action, message, data);
  };

  const logCategoryData = (
    category: string,
    action: string,
    data: LogData,
  ) => {
    if (!shouldLog()) {
      return;
    }
    // For audit-style logs, the data IS the message
    output('info', category as never, action, '', data);
  };

  return {
    // Backend service categories
    ai: (action, message, data) => logCategory('AI', action, message, data),
    audit: (action, data) => logCategoryData('AUDIT', action, data),
    auth: (action, message, data) => logCategory('AUTH', action, message, data),
    billing: (action, message, data) => logCategory('BILLING', action, message, data),
    cache: (action, message, data) => logCategory('CACHE', action, message, data),
    cron: (action, message, data) => logCategory('CRON', action, message, data),
    db: (action, message, data) => logCategory('DB', action, message, data),
    // Generic level-based
    debug: (message, data) => {
      if (!shouldLog()) {
        return;
      }
      output('debug', 'DEBUG' as never, null, message, data);
    },
    error: (message, error) => {
      if (!shouldLog()) {
        return;
      }
      const data = error instanceof Error ? formatError(error) : error;
      output('error', 'ERROR' as never, null, message, data);
    },
    http: (action, message, data) => logCategory('HTTP', action, message, data),
    info: (message, data) => {
      if (!shouldLog()) {
        return;
      }
      output('info', 'INFO' as never, null, message, data);
    },
    mcp: (action, message, data) => logCategory('MCP', action, message, data),

    pdf: (action, message, data) => logCategory('PDF', action, message, data),
    queue: (action, message, data) => logCategory('QUEUE', action, message, data),
    upload: (action, message, data) => logCategory('UPLOAD', action, message, data),
    warn: (message, data) => {
      if (!shouldLog()) {
        return;
      }
      output('warn', 'WARN' as never, null, message, data);
    },
  };
}

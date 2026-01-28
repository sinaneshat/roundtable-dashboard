/**
 * Logger Formatting Utilities
 *
 * Format log data as key=value pairs for structured logging.
 * Truncates long strings, converts booleans to 0/1.
 */

import type { LogData } from './types';

/**
 * Format log data as key=value pairs
 * Truncates long strings, converts booleans to 0/1
 */
export function formatLogData(data: LogData): string {
  return Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      if (typeof v === 'boolean') {
        return `${k}=${v ? 1 : 0}`;
      }
      if (typeof v === 'number') {
        return `${k}=${v}`;
      }
      if (typeof v === 'string') {
        return v.length > 20 ? `${k}=${v.slice(0, 20)}...` : `${k}=${v}`;
      }
      if (v === null) {
        return `${k}=null`;
      }
      return `${k}=?`;
    })
    .join(' ');
}

/**
 * Format error for logging
 */
export function formatError(error: Error): LogData {
  return {
    errorMessage: error.message.slice(0, 100),
    errorName: error.name,
  };
}

/**
 * Build the log message string
 */
export function buildLogMessage(
  category: string,
  action: string | null,
  message: string,
  data?: LogData,
): string {
  const prefix = action ? `[${category}:${action}]` : `[${category}]`;
  const dataStr = data ? ` ${formatLogData(data)}` : '';
  return `${prefix} ${message}${dataStr}`;
}

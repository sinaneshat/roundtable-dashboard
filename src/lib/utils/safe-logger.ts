/**
 * Safe Logging Utility
 *
 * This module provides secure logging functions that automatically redact
 * sensitive information before logging. It prevents accidental exposure of
 * secrets, tokens, passwords, and other sensitive data in logs.
 *
 * Features:
 * - Automatic sensitive data redaction
 * - Structured logging with metadata
 * - Correlation ID support
 * - Context-aware logging
 * - Environment-specific log levels
 */

import { z } from 'zod';

import { getConfigValue, isDevelopment } from '@/api/core/config';

// ============================================================================
// SENSITIVE DATA PATTERNS
// ============================================================================

/**
 * Patterns for sensitive data that should be redacted from logs
 */
const SENSITIVE_PATTERNS = [
  // Authentication & Authorization
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /auth/i,
  /authorization/i,
  /bearer/i,
  /api[_-]?key/i,
  /access[_-]?key/i,
  /private[_-]?key/i,
  /session/i,
  /cookie/i,

  // Payment & Financial
  /card[_-]?number/i,
  /cvv/i,
  /cvc/i,
  /expiry/i,
  /pin/i,
  /account[_-]?number/i,
  /iban/i,
  /routing[_-]?number/i,
  /swift/i,
  /merchant[_-]?id/i,

  // Personal Information
  /national[_-]?id/i,
  /ssn/i,
  /social[_-]?security/i,
  /phone/i,
  /mobile/i,
  /email/i,
  /address/i,

  // System Credentials
  /database[_-]?url/i,
  /db[_-]?url/i,
  /connection[_-]?string/i,
  /dsn/i,
  /credentials/i,
  /cert/i,
  /certificate/i,
  /signature/i,

  // External Services
  /callback[_-]?url/i,
  /endpoint/i,
] as const;

/**
 * Field names that should be completely redacted
 */
const REDACTED_FIELDS = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'auth',
  'authorization',
  'bearer',
  'apiKey',
  'api_key',
  'accessKey',
  'access_key',
  'privateKey',
  'private_key',
  'sessionId',
  'session_id',
  'merchantId',
  'merchant_id',
  'nationalId',
  'national_id',
  'cardNumber',
  'card_number',
  'cvv',
  'cvc',
  'pin',
  'accountNumber',
  'account_number',
  'signature',
]);

// ============================================================================
// LOG LEVELS
// ============================================================================

// Zod enum for log levels - reusable across logging modules
export const logLevelSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']);
export type LogLevel = z.infer<typeof logLevelSchema>;

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

// ============================================================================
// DATA SANITIZATION
// ============================================================================

/**
 * Redact sensitive information from a value
 */
export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    // Check for patterns that look like sensitive data
    if (value.length > 50 && /^[A-Z0-9+/=]+$/i.test(value)) {
      return '[REDACTED_BASE64]';
    }
    if (/^[A-F0-9]{32,}$/i.test(value)) {
      return '[REDACTED_HEX]';
    }
    if (/^[A-Z0-9]{20,}$/i.test(value)) {
      return '[REDACTED_TOKEN]';
    }
    if (value.includes('@') && value.includes('.')) {
      return '[REDACTED_EMAIL]';
    }
    if (/^\+?[1-9]\d{1,14}$/.test(value)) {
      return '[REDACTED_PHONE]';
    }
    return value;
  }

  if (typeof value === 'number') {
    // Redact numbers that could be card numbers, national IDs, etc.
    if (value > 1_000_000_000 && value < 999_999_999_999_999) {
      return '[REDACTED_NUMBER]';
    }
    return value;
  }

  return value;
}

/**
 * Check if a field name indicates sensitive data
 */
function isSensitiveField(fieldName: string): boolean {
  const lowerFieldName = fieldName.toLowerCase();

  // Check exact matches
  if (REDACTED_FIELDS.has(fieldName) || REDACTED_FIELDS.has(lowerFieldName)) {
    return true;
  }

  // Check patterns
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(fieldName));
}

/**
 * Sanitize an object by redacting sensitive fields
 */
function sanitizeObject(obj: unknown, depth = 0): unknown {
  if (depth > 10) {
    return '[MAX_DEPTH_REACHED]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: obj.message,
      stack: isDevelopment() ? obj.stack : '[REDACTED_STACK]',
    };
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeObject(value, depth + 1);
      }
    }

    return sanitized;
  }

  return obj;
}

/**
 * Sanitize any value for safe logging
 */
export function sanitize(value: unknown): unknown {
  try {
    return sanitizeObject(value);
  } catch {
    return '[SANITIZATION_ERROR]';
  }
}

// ============================================================================
// LOGGING CONTEXT
// ============================================================================

type LogContext = {
  correlationId?: string;
  userId?: string;
  requestId?: string;
  component?: string;
  operation?: string;
  timestamp?: string;
  [key: string]: unknown;
};

/**
 * Global log context that can be set per request
 */
let globalLogContext: LogContext = {};

/**
 * Set global log context
 */
export function setLogContext(context: LogContext): void {
  globalLogContext = { ...context };
}

/**
 * Get current log context
 */
export function getLogContext(): LogContext {
  return { ...globalLogContext };
}

/**
 * Clear log context
 */
export function clearLogContext(): void {
  globalLogContext = {};
}

// ============================================================================
// LOG FORMATTING
// ============================================================================

type LogEntry = {
  level: LogLevel;
  message: string;
  context?: LogContext;
  data?: unknown;
  timestamp: string;
  environment: string;
};

/**
 * Format log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
  const levelName = LOG_LEVEL_NAMES[entry.level];
  const timestamp = entry.timestamp;
  const environment = entry.environment;

  const baseInfo = {
    timestamp,
    level: levelName,
    environment,
    message: entry.message,
  };

  const fullEntry = {
    ...baseInfo,
    ...(entry.context && Object.keys(entry.context).length > 0 && { context: entry.context }),
    ...(entry.data !== undefined && { data: sanitize(entry.data) }),
  };

  if (isDevelopment()) {
    // Pretty format for development
    return JSON.stringify(fullEntry, null, 2);
  } else {
    // Single-line JSON for production
    return JSON.stringify(fullEntry);
  }
}

// ============================================================================
// LOGGING FUNCTIONS
// ============================================================================

/**
 * Get the current log level from configuration
 */
function getCurrentLogLevel(): LogLevel {
  try {
    const configLevel = getConfigValue('LOG_LEVEL');
    switch (configLevel) {
      case 'debug': return 'DEBUG';
      case 'info': return 'INFO';
      case 'warn': return 'WARN';
      case 'error': return 'ERROR';
      default: return 'INFO';
    }
  } catch {
    return 'INFO';
  }
}

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  return level >= getCurrentLogLevel();
}

/**
 * Core logging function
 */
function log(level: LogLevel, message: string, data?: unknown, context?: LogContext): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry: LogEntry = {
    level,
    message,
    context: { ...globalLogContext, ...context },
    data,
    timestamp: new Date().toISOString(),
    environment: isDevelopment() ? 'development' : 'production',
  };

  formatLogEntry(entry);

  // Output disabled - no console logging allowed
}

// ============================================================================
// PUBLIC LOGGING API
// ============================================================================

/**
 * Log debug information (development only)
 */
export function logDebug(message: string, data?: unknown, context?: LogContext): void {
  log('DEBUG', message, data, context);
}

/**
 * Log informational messages
 */
export function logInfo(message: string, data?: unknown, context?: LogContext): void {
  log('INFO', message, data, context);
}

/**
 * Log warnings
 */
export function logWarn(message: string, data?: unknown, context?: LogContext): void {
  log('WARN', message, data, context);
}

/**
 * Log errors with automatic sanitization
 */
export function logError(message: string, error?: unknown, context?: LogContext): void {
  const errorData = error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: isDevelopment() ? error.stack : undefined,
      }
    : error;

  log('ERROR', message, errorData, context);
}

/**
 * Log critical errors that require immediate attention
 */
export function logCritical(message: string, error?: unknown, context?: LogContext): void {
  const errorData = error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack, // Always include stack for critical errors
      }
    : error;

  log('ERROR', message, errorData, context);
}

// ============================================================================
// SPECIALIZED LOGGING FUNCTIONS
// ============================================================================

/**
 * Log API request/response safely
 */
export function logApiActivity(
  message: string,
  details: {
    method?: string;
    path?: string;
    status?: number;
    duration?: number;
    userId?: string;
    correlationId?: string;
  },
): void {
  logInfo(message, undefined, {
    component: 'api',
    operation: 'request',
    ...details,
  });
}

/**
 * Log authentication events
 */
export function logAuthActivity(
  message: string,
  details: {
    userId?: string;
    action?: string;
    ip?: string;
    userAgent?: string;
    correlationId?: string;
    success?: boolean;
  },
): void {
  // Sanitize IP and user agent
  const sanitizedDetails = {
    ...details,
    ...(details.ip && { ip: details.ip.replace(/\d+\.\d+\.\d+\./, 'XXX.XXX.XXX.') }),
    ...(details.userAgent && { userAgent: details.userAgent.substring(0, 50) }),
  };

  logInfo(message, undefined, {
    component: 'auth',
    operation: details.action || 'unknown',
    ...sanitizedDetails,
  });
}

/**
 * Log database operations
 */
export function logDatabaseActivity(
  message: string,
  details: {
    operation?: string;
    table?: string;
    duration?: number;
    rowsAffected?: number;
    correlationId?: string;
  },
): void {
  logDebug(message, undefined, {
    component: 'database',
    ...details,
  });
}

/**
 * Log external service calls
 */
export function logExternalService(
  message: string,
  details: {
    service?: string;
    operation?: string;
    status?: number;
    duration?: number;
    correlationId?: string;
  },
): void {
  logInfo(message, undefined, {
    component: 'external-service',
    ...details,
  });
}

// ============================================================================
// ERROR LOGGING UTILITIES
// ============================================================================

/**
 * Safe replacement for console.error() that automatically sanitizes
 */
export function safeConsoleError(message: string, ...args: unknown[]): void {
  logError(message, args.length === 1 ? args[0] : args);
}

/**
 * Safe replacement for console.log() with sanitization
 */
export function safeConsoleLog(message: string, ...args: unknown[]): void {
  logInfo(message, args.length === 1 ? args[0] : args);
}

/**
 * Safe replacement for console.warn() with sanitization
 */
export function safeConsoleWarn(message: string, ...args: unknown[]): void {
  logWarn(message, args.length === 1 ? args[0] : args);
}

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Create a logger instance with pre-set context
 */
export function createLogger(component: string) {
  return {
    debug: (message: string, data?: unknown, context?: LogContext) =>
      logDebug(message, data, { component, ...context }),

    info: (message: string, data?: unknown, context?: LogContext) =>
      logInfo(message, data, { component, ...context }),

    warn: (message: string, data?: unknown, context?: LogContext) =>
      logWarn(message, data, { component, ...context }),

    error: (message: string, error?: unknown, context?: LogContext) =>
      logError(message, error, { component, ...context }),

    critical: (message: string, error?: unknown, context?: LogContext) =>
      logCritical(message, error, { component, ...context }),
  };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  debug: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
  critical: logCritical,

  // Specialized logging
  apiActivity: logApiActivity,
  authActivity: logAuthActivity,
  databaseActivity: logDatabaseActivity,
  externalService: logExternalService,

  // Safe console replacements
  safeError: safeConsoleError,
  safeLog: safeConsoleLog,
  safeWarn: safeConsoleWarn,

  // Context management
  setContext: setLogContext,
  getContext: getLogContext,
  clearContext: clearLogContext,

  // Utils
  sanitize,
  createLogger,
};

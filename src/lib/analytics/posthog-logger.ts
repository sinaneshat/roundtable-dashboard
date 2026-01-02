/**
 * PostHog Server-Side Logger
 *
 * Structured logging utility that sends logs to PostHog for observability.
 * Designed for Cloudflare Workers edge environment (no OpenTelemetry SDK).
 *
 * Log levels: trace, debug, info, warn, error, fatal
 *
 * Usage:
 * ```ts
 * import { logger } from '@/lib/analytics/posthog-logger';
 *
 * logger.info('User signed in', { userId: '123', method: 'google' });
 * logger.error('Payment failed', { orderId: '456', error: err.message });
 * logger.warn('Rate limit approaching', { current: 95, limit: 100 });
 * ```
 */

import { getDistinctIdFromCookie, getPostHogClient } from './posthog-server';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

type LogAttributes = Record<string, unknown>;

type LogContext = {
  distinctId?: string;
  cookieHeader?: string | null;
  requestId?: string;
  service?: string;
};

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

const MIN_LOG_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LOG_LEVEL];
}

function createLogEvent(
  level: LogLevel,
  message: string,
  attributes?: LogAttributes,
  context?: LogContext,
) {
  const posthog = getPostHogClient();
  if (!posthog)
    return;

  if (!shouldLog(level))
    return;

  const distinctId = context?.distinctId
    ?? (context?.cookieHeader ? getDistinctIdFromCookie(context.cookieHeader) : 'system');

  posthog.capture({
    distinctId,
    event: '$log',
    properties: {
      $log_level: level,
      $log_message: message,
      $log_service: context?.service ?? 'api',
      $log_request_id: context?.requestId,
      $log_timestamp: new Date().toISOString(),
      ...attributes,
    },
  });
}

async function createExceptionEvent(
  error: Error | unknown,
  attributes?: LogAttributes,
  context?: LogContext,
) {
  const posthog = getPostHogClient();
  if (!posthog)
    return;

  const distinctId = context?.distinctId
    ?? (context?.cookieHeader ? getDistinctIdFromCookie(context.cookieHeader) : 'system');

  await posthog.captureException(error, distinctId, {
    $exception_source: 'backend',
    $log_service: context?.service ?? 'api',
    $log_request_id: context?.requestId,
    ...attributes,
  });
}

export const logger = {
  trace: (message: string, attributes?: LogAttributes, context?: LogContext) =>
    createLogEvent('trace', message, attributes, context),

  debug: (message: string, attributes?: LogAttributes, context?: LogContext) =>
    createLogEvent('debug', message, attributes, context),

  info: (message: string, attributes?: LogAttributes, context?: LogContext) =>
    createLogEvent('info', message, attributes, context),

  warn: (message: string, attributes?: LogAttributes, context?: LogContext) =>
    createLogEvent('warn', message, attributes, context),

  error: (message: string, attributes?: LogAttributes, context?: LogContext) =>
    createLogEvent('error', message, attributes, context),

  fatal: (message: string, attributes?: LogAttributes, context?: LogContext) =>
    createLogEvent('fatal', message, attributes, context),

  exception: (error: Error | unknown, attributes?: LogAttributes, context?: LogContext) =>
    createExceptionEvent(error, attributes, context),
};

export function createRequestLogger(request: Request, service = 'api') {
  const cookieHeader = request.headers.get('cookie');
  const requestId = request.headers.get('x-request-id')
    ?? request.headers.get('cf-ray')
    ?? crypto.randomUUID();

  const context: LogContext = {
    cookieHeader,
    requestId,
    service,
  };

  return {
    trace: (message: string, attributes?: LogAttributes) =>
      logger.trace(message, attributes, context),

    debug: (message: string, attributes?: LogAttributes) =>
      logger.debug(message, attributes, context),

    info: (message: string, attributes?: LogAttributes) =>
      logger.info(message, attributes, context),

    warn: (message: string, attributes?: LogAttributes) =>
      logger.warn(message, attributes, context),

    error: (message: string, attributes?: LogAttributes) =>
      logger.error(message, attributes, context),

    fatal: (message: string, attributes?: LogAttributes) =>
      logger.fatal(message, attributes, context),

    exception: (error: Error | unknown, attributes?: LogAttributes) =>
      logger.exception(error, attributes, context),
  };
}

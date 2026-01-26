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

import { NodeEnvs, POSTHOG_LOG_LEVEL_VALUES, PosthogLogLevels } from '@roundtable/shared';
import type { PosthogLogLevel } from '@roundtable/shared/enums';
import { z } from 'zod';

import { getDistinctIdFromCookie, getPostHogClient } from './posthog-server';

// ============================================================================
// Log Attributes Schema
// ============================================================================

/**
 * LogAttributesSchema - Typed log attributes for PostHog logging
 *
 * JUSTIFIED .passthrough(): PostHog analytics events accept arbitrary custom
 * properties for extensible logging. This schema validates known fields while
 * allowing additional app-specific properties per PostHog's design.
 *
 * Known fields are typed for IDE autocompletion and validation.
 */
export const LogAttributesSchema = z.object({
  // Common fields across all log types
  action: z.string().optional(),
  creditsUsed: z.number().optional(),
  current: z.number().optional(),
  duration: z.number().optional(),
  endpoint: z.string().optional(),
  error: z.string().optional(),
  finishReason: z.string().optional(),
  httpMethod: z.string().optional(),
  httpStatus: z.number().int().optional(),
  inputTokens: z.number().int().optional(),
  limit: z.number().optional(),
  method: z.string().optional(),
  modelId: z.string().optional(),
  operation: z.string().optional(),
  orderId: z.string().optional(),
  outputTokens: z.number().int().optional(),
  participantId: z.string().optional(),
  rowsAffected: z.number().int().optional(),
  subscriptionTier: z.string().optional(),
  tableName: z.string().optional(),
  threadId: z.string().optional(),
  userId: z.string().optional(),
}).passthrough();
// JUSTIFIED .passthrough(): PostHog logs accept arbitrary properties for extensible analytics

export type LogAttributes = z.infer<typeof LogAttributesSchema>;

type LogContext = {
  distinctId?: string;
  cookieHeader?: string | null;
  requestId?: string;
  service?: string;
};

const MIN_LOG_LEVEL: PosthogLogLevel = process.env.NODE_ENV === NodeEnvs.PRODUCTION ? PosthogLogLevels.INFO : PosthogLogLevels.DEBUG;

function shouldLog(level: PosthogLogLevel): boolean {
  return POSTHOG_LOG_LEVEL_VALUES[level] >= POSTHOG_LOG_LEVEL_VALUES[MIN_LOG_LEVEL];
}

function createLogEvent(
  level: PosthogLogLevel,
  message: string,
  attributes?: LogAttributes,
  context?: LogContext,
) {
  const posthog = getPostHogClient();
  if (!posthog) {
    return;
  }

  if (!shouldLog(level)) {
    return;
  }

  const distinctId = context?.distinctId
    ?? (context?.cookieHeader ? getDistinctIdFromCookie(context.cookieHeader) : 'system');

  posthog.capture({
    distinctId,
    event: '$log',
    properties: {
      $log_level: level,
      $log_message: message,
      $log_request_id: context?.requestId,
      $log_service: context?.service ?? 'api',
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
  if (!posthog) {
    return;
  }

  const distinctId = context?.distinctId
    ?? (context?.cookieHeader ? getDistinctIdFromCookie(context.cookieHeader) : 'system');

  await posthog.captureException(error, distinctId, {
    $exception_source: 'backend',
    $log_request_id: context?.requestId,
    $log_service: context?.service ?? 'api',
    ...attributes,
  });
}

export const logger = {
  debug: (message: string, attributes?: LogAttributes, context?: LogContext) =>
    createLogEvent(PosthogLogLevels.DEBUG, message, attributes, context),

  error: (message: string, attributes?: LogAttributes, context?: LogContext) =>
    createLogEvent(PosthogLogLevels.ERROR, message, attributes, context),

  exception: async (error: Error | unknown, attributes?: LogAttributes, context?: LogContext) =>
    await createExceptionEvent(error, attributes, context),

  fatal: (message: string, attributes?: LogAttributes, context?: LogContext) =>
    createLogEvent(PosthogLogLevels.FATAL, message, attributes, context),

  info: (message: string, attributes?: LogAttributes, context?: LogContext) =>
    createLogEvent(PosthogLogLevels.INFO, message, attributes, context),

  trace: (message: string, attributes?: LogAttributes, context?: LogContext) =>
    createLogEvent(PosthogLogLevels.TRACE, message, attributes, context),

  warn: (message: string, attributes?: LogAttributes, context?: LogContext) =>
    createLogEvent(PosthogLogLevels.WARN, message, attributes, context),
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
    debug: (message: string, attributes?: LogAttributes) =>
      logger.debug(message, attributes, context),

    error: (message: string, attributes?: LogAttributes) =>
      logger.error(message, attributes, context),

    exception: async (error: Error | unknown, attributes?: LogAttributes) =>
      await logger.exception(error, attributes, context),

    fatal: (message: string, attributes?: LogAttributes) =>
      logger.fatal(message, attributes, context),

    info: (message: string, attributes?: LogAttributes) =>
      logger.info(message, attributes, context),

    trace: (message: string, attributes?: LogAttributes) =>
      logger.trace(message, attributes, context),

    warn: (message: string, attributes?: LogAttributes) =>
      logger.warn(message, attributes, context),
  };
}

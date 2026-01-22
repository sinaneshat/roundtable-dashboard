/**
 * Turnstile Middleware
 *
 * Middleware for validating Cloudflare Turnstile tokens on protected endpoints.
 * Use this middleware on sensitive operations like:
 * - User registration
 * - Password reset
 * - Contact forms
 * - Any endpoint vulnerable to bot abuse
 *
 * Usage:
 *   app.post('/api/v1/auth/signup', turnstileMiddleware(), handler)
 *   app.post('/api/v1/contact', turnstileMiddleware({ action: 'contact' }), handler)
 */

import { createMiddleware } from 'hono/factory';

import { createError } from '@/common/error-handling';
import type { TurnstileValidationOptions } from '@/services/turnstile';
import {
  extractTurnstileToken,
  extractTurnstileTokenFromBody,
  validateTurnstileFromContext,
} from '@/services/turnstile';
import type { ApiEnv } from '@/types';

type TurnstileMiddlewareOptions = {
  /**
   * Whether to skip validation in development mode
   * @default true
   */
  skipInDevelopment?: boolean;

  /**
   * Whether to allow requests without a token (soft mode)
   * Useful for gradual rollout
   * @default false
   */
  optional?: boolean;

  /**
   * Custom error message for failed validation
   */
  errorMessage?: string;
} & TurnstileValidationOptions;

/**
 * Create Turnstile validation middleware
 */
export function turnstileMiddleware(options: TurnstileMiddlewareOptions = {}) {
  const {
    skipInDevelopment = true,
    optional = false,
    errorMessage = 'Bot protection verification failed',
    ...validationOptions
  } = options;

  return createMiddleware<ApiEnv>(async (c, next) => {
    // Skip in development if configured
    if (skipInDevelopment && c.env.NODE_ENV === 'development') {
      await next();
      return;
    }

    // Skip if no secret key configured
    if (!c.env.TURNSTILE_SECRET_KEY) {
      await next();
      return;
    }

    // Extract token from header or body
    let token = extractTurnstileToken(c);

    if (!token) {
      token = await extractTurnstileTokenFromBody(c);
    }

    // Handle missing token
    if (!token) {
      if (optional) {
        await next();
        return;
      }

      throw createError.unauthorized('Bot protection token is required');
    }

    // Validate token
    const result = await validateTurnstileFromContext(c, token, validationOptions);

    if (!result.success) {
      throw createError.unauthorized(errorMessage);
    }

    await next();
  });
}

/**
 * Strict Turnstile middleware - never skips validation
 * Use for critical endpoints like payments
 */
export function strictTurnstileMiddleware(options: Omit<TurnstileMiddlewareOptions, 'skipInDevelopment' | 'optional'> = {}) {
  return turnstileMiddleware({
    ...options,
    skipInDevelopment: false,
    optional: false,
  });
}

/**
 * Optional Turnstile middleware - doesn't fail if token missing
 * Use for gradual rollout or non-critical endpoints
 */
export function optionalTurnstileMiddleware(options: Omit<TurnstileMiddlewareOptions, 'optional'> = {}) {
  return turnstileMiddleware({
    ...options,
    optional: true,
  });
}

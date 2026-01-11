import type { Context, MiddlewareHandler } from 'hono';
import { csrf } from 'hono/csrf';

import type { ApiEnv } from '@/api/types';
import { getAllowedOriginsFromContext } from '@/lib/config/base-urls';

/**
 * CSRF Protection Middleware
 *
 * Protects against Cross-Site Request Forgery attacks following Hono best practices.
 * The middleware validates:
 * - Origin header matches allowed origins
 * - Sec-Fetch-Site header indicates same-origin requests
 *
 * Only validates unsafe methods (POST, PATCH, PUT, DELETE) with form-submittable content types.
 * Uses centralized URL config from base-urls.ts for allowed origins.
 *
 * @see https://hono.dev/docs/middleware/builtin/csrf
 */

/**
 * Dynamic CSRF middleware that configures allowed origins based on environment
 * Follows Hono's recommended pattern for dynamic origin validation
 */
export const csrfProtection: MiddlewareHandler<ApiEnv> = async (c: Context<ApiEnv>, next) => {
  // Skip CSRF check for API key authentication (follows security best practices)
  // API keys in headers are not subject to CSRF attacks
  const apiKey = c.req.header('x-api-key');
  if (apiKey) {
    return next();
  }

  // Use centralized URL config for allowed origins
  const allowedOrigins = getAllowedOriginsFromContext(c);

  // Apply CSRF middleware with configured origins
  const middleware = csrf({
    origin: (origin) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin)
        return true;

      // Check if origin is in allowed list
      return allowedOrigins.includes(origin);
    },
  });

  return middleware(c, next);
};

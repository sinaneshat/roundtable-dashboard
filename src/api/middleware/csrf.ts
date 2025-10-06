import type { Context, MiddlewareHandler } from 'hono';
import { csrf } from 'hono/csrf';

import type { ApiEnv } from '@/api/types';

/**
 * CSRF Protection Middleware
 *
 * Protects against Cross-Site Request Forgery attacks following Hono best practices.
 * The middleware validates:
 * - Origin header matches allowed origins
 * - Sec-Fetch-Site header indicates same-origin requests
 *
 * Only validates unsafe methods (POST, PATCH, PUT, DELETE) with form-submittable content types.
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

  const appUrl = c.env.NEXT_PUBLIC_APP_URL;
  const webappEnv = c.env.NEXT_PUBLIC_WEBAPP_ENV || 'local';
  const isDevelopment = webappEnv === 'local' || c.env.NODE_ENV === 'development';

  const allowedOrigins: string[] = [];

  // Only allow localhost in development environment
  if (isDevelopment) {
    allowedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000');
  }

  // Add current environment URL if available and not localhost
  if (appUrl && !appUrl.includes('localhost') && !appUrl.includes('127.0.0.1')) {
    allowedOrigins.push(appUrl);
  }

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

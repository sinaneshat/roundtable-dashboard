/**
 * TanStack Start Global Middleware Configuration
 *
 * Configures middleware that runs for all requests and server functions.
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/middleware
 */
import { createMiddleware, createStart } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import { serverLog } from '@/lib/utils/dev-logger';

// Skip logging for static assets and internal routes
const SKIP_LOG_PATTERNS = [
  '/_build/',
  '/_stream/',
  '/_server/', // Server functions logged separately
  '/favicon',
  '.js',
  '.css',
  '.map',
  '.woff',
  '.png',
  '.jpg',
  '.svg',
];

function shouldSkipLog(path: string): boolean {
  return SKIP_LOG_PATTERNS.some(pattern => path.includes(pattern));
}

/**
 * Request middleware - runs for ALL server requests (routes, SSR, server functions)
 * Logs SSR requests with timing for observability.
 */
const requestMiddleware = createMiddleware().server(async ({ next }) => {
  const request = getRequest();
  const url = new URL(request.url);
  const path = url.pathname;

  // Skip static assets and internal routes
  if (shouldSkipLog(path)) {
    return next();
  }

  const startTime = Date.now();

  try {
    const result = await next();
    const duration = Date.now() - startTime;

    // Log SSR renders (non-API page requests)
    serverLog.ssr('render', path, { durationMs: duration });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    serverLog.error(`SSR error: ${path}`, {
      durationMs: duration,
      errorMsg: error instanceof Error ? error.message.slice(0, 50) : 'unknown',
    });
    throw error;
  }
});

/**
 * Server function logging middleware.
 * Logs server function calls with timing for observability.
 */
const serverFnLoggingMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const request = getRequest();
    const url = new URL(request.url);

    // Extract function name from URL if available (/_server/functionName)
    const pathParts = url.pathname.split('/');
    const fnName = pathParts[pathParts.length - 1] || 'unknown';

    const startTime = Date.now();

    try {
      const result = await next();
      const duration = Date.now() - startTime;

      serverLog.serverFn('call', fnName, { durationMs: duration });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      serverLog.serverFn('error', fnName, {
        durationMs: duration,
        errorMsg: error instanceof Error ? error.message.slice(0, 50) : 'unknown',
      });
      throw error;
    }
  },
);

/**
 * Cookie extraction middleware for server functions.
 * Extracts cookie header once and provides via context.
 * Eliminates repetitive getRequest() calls in every server function.
 *
 * Registered as global functionMiddleware below, so runs automatically for ALL server functions.
 * No need to add .middleware([cookieMiddleware]) to individual server functions.
 *
 * Usage in server functions:
 * ```ts
 * export const myFn = createServerFn({ method: 'GET' })
 *   .handler(async ({ context }) => {
 *     // cookieHeader is automatically available via global middleware
 *     const { cookieHeader } = context;
 *     return await apiCall({ cookieHeader });
 *   });
 * ```
 */
export const cookieMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get('cookie') || '';

    return next({
      context: { cookieHeader },
    });
  },
);

/**
 * TanStack Start instance with global middleware.
 * - requestMiddleware: runs for ALL requests
 * - functionMiddleware: runs for ALL server functions
 *
 * Note: SSR is ENABLED (default) for fast first paint. Session fetching
 * is skipped on server in beforeLoad to avoid blocking TTFB.
 * Auth is handled client-side after hydration.
 */
export const startInstance = createStart(() => ({
  functionMiddleware: [serverFnLoggingMiddleware, cookieMiddleware],
  requestMiddleware: [requestMiddleware],
}));

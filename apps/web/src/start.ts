/**
 * TanStack Start Global Middleware Configuration
 *
 * Configures middleware that runs for all requests and server functions.
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/middleware
 */
import { createMiddleware, createStart } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

/**
 * Request middleware - runs for ALL server requests (routes, SSR, server functions)
 * Placeholder for request-level middleware (logging, observability, CSP, etc.)
 */
const requestMiddleware = createMiddleware().server(async ({ next }) => {
  return next();
});

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
 */
export const startInstance = createStart(() => ({
  requestMiddleware: [requestMiddleware],
  functionMiddleware: [cookieMiddleware],
}));

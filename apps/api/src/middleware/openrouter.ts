/**
 * OpenRouter Middleware
 *
 * Middleware to initialize OpenRouter service for chat routes.
 * Eliminates the need to call initializeOpenRouter() in every handler.
 *
 * Benefits:
 * - Centralized OpenRouter initialization
 * - Reduces code duplication
 * - Follows established middleware patterns
 * - Easier to mock for testing
 */

import { createMiddleware } from 'hono/factory';

// PERF FIX: Import directly from service file to avoid barrel export circular dependency chain
// The barrel export (@/services/models) pulls in openrouter.service which imports from billing, causing cascade
import { initializeOpenRouter } from '@/services/models/openrouter.service';
import type { ApiEnv } from '@/types';

/**
 * Middleware to ensure OpenRouter service is initialized before chat route handlers
 *
 * Usage:
 * ```typescript
 * app.use('/chat/*', ensureOpenRouterInitialized);
 * ```
 */
export const ensureOpenRouterInitialized = createMiddleware<ApiEnv>(async (c, next) => {
  // Initialize OpenRouter service with environment configuration
  // This is idempotent - safe to call multiple times
  initializeOpenRouter(c.env);

  return await next();
});

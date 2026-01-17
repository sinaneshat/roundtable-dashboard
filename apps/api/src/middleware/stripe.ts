/**
 * Stripe Middleware
 *
 * Middleware to initialize Stripe service for billing routes.
 * Eliminates the need to call initializeStripe() in every handler.
 *
 * Benefits:
 * - Centralized Stripe initialization
 * - Reduces code duplication
 * - Follows established middleware patterns
 * - Easier to mock for testing
 */

import { createMiddleware } from 'hono/factory';

import { initializeStripe } from '@/services/billing';
import type { ApiEnv } from '@/types';

/**
 * Middleware to ensure Stripe service is initialized before billing route handlers
 *
 * Usage:
 * ```typescript
 * app.use('/billing/*', ensureStripeInitialized);
 * ```
 */
export const ensureStripeInitialized = createMiddleware<ApiEnv>(async (c, next) => {
  // Initialize Stripe service with environment configuration
  // This is idempotent - safe to call multiple times
  initializeStripe(c.env);

  return next();
});

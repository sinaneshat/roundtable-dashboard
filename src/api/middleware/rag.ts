/**
 * RAG Middleware
 *
 * Middleware to initialize RAG service for chat routes.
 * Eliminates the need to call initializeRAG() in every handler.
 *
 * Benefits:
 * - Centralized RAG initialization
 * - Reduces code duplication
 * - Follows established middleware patterns
 * - Easier to mock for testing
 */

import { createMiddleware } from 'hono/factory';

import { initializeRAG } from '@/api/services/rag.service';
import type { ApiEnv } from '@/api/types';

/**
 * Middleware to ensure RAG service is initialized before chat route handlers
 *
 * Gracefully skips initialization if Cloudflare bindings (AI, VECTORIZE) are not available.
 * This allows the application to run in local development without RAG features.
 *
 * Usage:
 * ```typescript
 * app.use('/chat/*', ensureRAGInitialized);
 * ```
 */
export const ensureRAGInitialized = createMiddleware<ApiEnv>(async (c, next) => {
  // Skip RAG initialization if bindings are not available (local development)
  if (!c.env.AI || !c.env.VECTORIZE) {
    // RAG features will not be available, but the app continues to work
    return next();
  }

  // Initialize RAG service with environment configuration
  // This is idempotent - safe to call multiple times
  try {
    initializeRAG(c.env);
  } catch {
    // Log error but don't block the request

  }

  return next();
});

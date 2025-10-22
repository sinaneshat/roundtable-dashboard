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
 * Usage:
 * ```typescript
 * app.use('/chat/*', ensureRAGInitialized);
 * ```
 */
export const ensureRAGInitialized = createMiddleware<ApiEnv>(async (c, next) => {
  // Initialize RAG service with environment configuration
  // This is idempotent - safe to call multiple times
  initializeRAG(c.env);

  return next();
});

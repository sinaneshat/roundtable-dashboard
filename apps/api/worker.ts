/**
 * Hono API Worker Entry Point
 *
 * Pure Cloudflare Workers backend for the Roundtable API.
 * Handles all API routes, auth, and background tasks via:
 * - Hono API routes
 * - Durable Objects for scheduling
 * - Queue handlers for async tasks
 *
 * IMPORTANT: Uses lazy loading to reduce worker startup CPU time.
 * The full app is loaded on first request, not at module initialization.
 */

import type { MessageBatch } from '@cloudflare/workers-types';

// Type-only import for AppType (no runtime cost)
export type { AppType } from './src/index';

// Export Durable Object classes (lightweight, no heavy dependencies)
export { UploadCleanupScheduler } from './src/workers/upload-cleanup-scheduler';

// Lazy-loaded app cache - using unknown to avoid importing heavy types at startup
let _rootApp: unknown = null;

type HonoFetch = (request: Request, env: CloudflareEnv, ctx: ExecutionContext) => Promise<Response>;

async function getRootApp(): Promise<{ fetch: HonoFetch }> {
  if (!_rootApp) {
    // Dynamic import - not evaluated at worker startup!
    const module = await import('./src/index');
    _rootApp = module.default;
  }
  return _rootApp as { fetch: HonoFetch };
}

// Export the main worker handler with queue support
export default {
  /**
   * HTTP request handler.
   * Lazily loads the full app on first request.
   */
  async fetch(
    request: Request,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Quick health check without loading the full app
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname === '/api/v1/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'roundtable-api',
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Load full app for all other routes
    const rootApp = await getRootApp();
    return rootApp.fetch(request, env, ctx);
  },

  /**
   * Queue handler for Cloudflare Queues.
   * Uses dynamic imports to avoid loading heavy modules at startup.
   */
  async queue(
    batch: MessageBatch<unknown>,
    env: CloudflareEnv,
  ): Promise<void> {
    // Title generation queue
    if (batch.queue.startsWith('title-generation-queue')) {
      const { handleTitleGenerationQueue } = await import('./src/workers/title-generation-queue');
      type TitleMsg = import('./src/types/queues').TitleGenerationQueueMessage;
      return handleTitleGenerationQueue(batch as MessageBatch<TitleMsg>, env);
    }

    // Round orchestration queue
    if (batch.queue.startsWith('round-orchestration-queue')) {
      const { handleRoundOrchestrationQueue } = await import('./src/workers/round-orchestration-queue');
      type RoundMsg = import('./src/types/queues').RoundOrchestrationQueueMessage;
      return handleRoundOrchestrationQueue(batch as MessageBatch<RoundMsg>, env);
    }

    console.error(`[QueueRouter] Unknown queue: ${batch.queue}`);
  },
} satisfies ExportedHandler<CloudflareEnv>;

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

// Durable Object classes - lightweight exports with no heavy dependencies at worker startup
// Note: This is a valid re-export pattern for worker.ts as it's the Cloudflare Workers entry point
// that must export DO classes. The alternative would be inline class definitions here, which
// would reduce modularity. This re-export is acceptable as worker.ts serves as the deployment
// boundary/entry point, not a barrel export.
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
// Track worker cold start time
const workerStartTime = Date.now();
let workerInitialized = false;

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
    const requestStartTime = Date.now();
    const url = new URL(request.url);

    // Quick health check without loading the full app - with timing metrics
    if (url.pathname === '/health' || url.pathname === '/api/v1/health') {
      const isFirstRequest = !workerInitialized;
      workerInitialized = true;

      const timings = {
        workerAgeMs: requestStartTime - workerStartTime,
        requestProcessingMs: Date.now() - requestStartTime,
        isColdStart: isFirstRequest,
      };

      return new Response(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'roundtable-api',
        timings,
        env: env.WEBAPP_ENV || 'unknown',
      }), {
        headers: {
          'Content-Type': 'application/json',
          'X-Worker-Age-Ms': String(timings.workerAgeMs),
          'X-Request-Processing-Ms': String(timings.requestProcessingMs),
          'X-Cold-Start': String(isFirstRequest),
        },
      });
    }

    // Load full app for all other routes
    const appLoadStart = Date.now();
    const rootApp = await getRootApp();
    const appLoadMs = Date.now() - appLoadStart;

    // Add timing header to response
    const response = await rootApp.fetch(request, env, ctx);
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-App-Load-Ms', String(appLoadMs));
    newHeaders.set('X-Total-Ms', String(Date.now() - requestStartTime));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },

  /**
   * Queue handler for Cloudflare Queues.
   * Uses dynamic imports to avoid loading heavy modules at startup.
   */
  async queue(
    batch: MessageBatch,
    env: CloudflareEnv,
  ): Promise<void> {
    // Title generation queue
    if (batch.queue.startsWith('title-generation-queue')) {
      const { handleTitleGenerationQueue } = await import('./src/workers/title-generation-queue');
      type TitleMsg = import('./src/types/queues').TitleGenerationQueueMessage;
      return await handleTitleGenerationQueue(batch as MessageBatch<TitleMsg>, env);
    }

    // Round orchestration queue
    if (batch.queue.startsWith('round-orchestration-queue')) {
      const { handleRoundOrchestrationQueue } = await import('./src/workers/round-orchestration-queue');
      type RoundMsg = import('./src/types/queues').RoundOrchestrationQueueMessage;
      return await handleRoundOrchestrationQueue(batch as MessageBatch<RoundMsg>, env);
    }

    console.error(`[QueueRouter] Unknown queue: ${batch.queue}`);
  },
} satisfies ExportedHandler<CloudflareEnv>;

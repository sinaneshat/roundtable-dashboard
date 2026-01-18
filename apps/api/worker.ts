/**
 * Hono API Worker Entry Point
 *
 * Pure Cloudflare Workers backend for the Roundtable API.
 * Handles all API routes, auth, and background tasks via:
 * - Hono API routes
 * - Durable Objects for scheduling
 * - Queue handlers for async tasks
 *
 * IMPORTANT: Uses async lazy initialization to avoid Cloudflare Workers
 * startup CPU limit. Heavy modules (schemas, routes, services) are loaded
 * on first request, not at module evaluation time.
 *
 * @see https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time
 */

import type { MessageBatch } from '@cloudflare/workers-types';

// Re-export AppType for client type inference (static type, no runtime cost)
export type { AppType } from './src/index';

// Export Durable Object classes (lightweight, no heavy dependencies)
export { UploadCleanupScheduler } from './src/workers/upload-cleanup-scheduler';

// Lazy-loaded app instance (initialized on first request)
let app: Awaited<ReturnType<typeof import('./src/index').createApp>> | null = null;

// Export the main worker handler with queue support
export default {
  /**
   * HTTP request handler with lazy app initialization.
   * Defers all heavy schema/route loading to first request time.
   */
  async fetch(
    request: Request,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (!app) {
      const { createApp } = await import('./src/index');
      app = await createApp();
    }
    return app.fetch(request, env, ctx);
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

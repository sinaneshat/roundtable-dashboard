/**
 * Hono API Worker Entry Point
 *
 * Pure Cloudflare Workers backend for the Roundtable API.
 * Handles all API routes, auth, and background tasks via:
 * - Hono API routes
 * - Durable Objects for scheduling
 * - Queue handlers for async tasks
 *
 * IMPORTANT: All routes use createOpenApiApp() pattern for RPC type safety.
 * Routes are registered at module level for optimal Cloudflare Workers performance.
 */

import type { MessageBatch } from '@cloudflare/workers-types';

// Re-export AppType for client type inference (static type, no runtime cost)
export type { AppType } from './src/index';

// Export Durable Object classes (lightweight, no heavy dependencies)
export { UploadCleanupScheduler } from './src/workers/upload-cleanup-scheduler';

// Import the pre-configured app (synchronous, no factory pattern)
import rootApp from './src/index';

// Export the main worker handler with queue support
export default {
  /**
   * HTTP request handler.
   * App is already initialized at module level.
   */
  async fetch(
    request: Request,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
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

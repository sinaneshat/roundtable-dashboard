/**
 * Custom Worker Entry Point
 *
 * Wraps the OpenNext generated worker and exports:
 * - OpenNext's built-in DO classes for caching
 * - Custom Durable Objects (UploadCleanupScheduler)
 * - Cloudflare Queue handlers for async background tasks
 *
 * @see https://opennext.js.org/cloudflare/howtos/custom-worker
 * @see https://developers.cloudflare.com/queues/
 */

import type { MessageBatch } from '@cloudflare/workers-types';

// Import the OpenNext generated handler
// @ts-expect-error - .open-next/worker.js is generated at build time
import handler from './.open-next/worker.js';
import type {
  RoundOrchestrationQueueMessage,
  TitleGenerationQueueMessage,
} from './src/api/types/queues';
// Import queue consumer handlers (same directory as other custom workers)
import { handleRoundOrchestrationQueue } from './src/workers/round-orchestration-queue';
import { handleTitleGenerationQueue } from './src/workers/title-generation-queue';

/**
 * ARCHITECTURAL REQUIREMENT: Durable Object Re-Exports
 *
 * Cloudflare Workers requires all Durable Object classes to be exported
 * from the main worker entry point (wrangler.jsonc "main": "custom-worker.ts").
 *
 * These re-exports are necessary and CANNOT use barrel pattern because:
 * 1. wrangler.jsonc durable_objects.bindings references class names by export
 * 2. OpenNext classes are build-time artifacts (.open-next/worker.js)
 * 3. Worker runtime requires direct export from entry point
 *
 * See wrangler.jsonc lines 73-87 for Durable Object configuration.
 */

// Re-export OpenNext's Durable Object classes (required for caching)
// @ts-expect-error - .open-next/worker.js is generated at build time
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';

// Export our custom Durable Object for upload cleanup
export { UploadCleanupScheduler } from './src/workers/upload-cleanup-scheduler';

// Export the main worker handler with queue support
export default {
  fetch: handler.fetch,

  /**
   * Queue handler for Cloudflare Queues
   * Routes messages to appropriate consumers based on queue name
   *
   * Type safety: Queue messages arrive as unknown and are validated by
   * each consumer using Zod schemas from @/api/types/queues
   *
   * @see https://developers.cloudflare.com/queues/reference/how-queues-works/
   * @see /src/api/types/queues.ts - Queue message schemas
   */
  queue: async (
    // MessageBatch<unknown> is the correct type - messages validated by consumers
    batch: MessageBatch<unknown>,
    env: CloudflareEnv,
  ): Promise<void> => {
    // Route to appropriate handler based on queue name
    // Each consumer validates message structure with Zod schemas

    // Title generation queue
    if (batch.queue.startsWith('title-generation-queue')) {
      // Safe: handleTitleGenerationQueue validates messages internally with Zod
      return handleTitleGenerationQueue(
        batch as MessageBatch<TitleGenerationQueueMessage>,
        env,
      );
    }

    // Round orchestration queue (participant/moderator triggering)
    if (batch.queue.startsWith('round-orchestration-queue')) {
      // Safe: handleRoundOrchestrationQueue validates messages internally with Zod
      return handleRoundOrchestrationQueue(
        batch as MessageBatch<RoundOrchestrationQueueMessage>,
        env,
      );
    }

    // Unknown queue - log warning
    console.error(`[QueueRouter] Unknown queue: ${batch.queue}`);
  },
} satisfies ExportedHandler<CloudflareEnv>;

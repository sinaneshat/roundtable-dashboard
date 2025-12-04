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
import type { TitleGenerationQueueMessage } from './src/api/types/queues';
// Import queue consumer handler (same directory as other custom workers)
import { handleTitleGenerationQueue } from './src/workers/title-generation-queue';

// Re-export OpenNext's Durable Object classes (required for caching)
// @ts-expect-error - .open-next/worker.js is generated at build time
export { BucketCachePurge, DOQueueHandler } from './.open-next/worker.js';

// Export our custom Durable Object for upload cleanup
export { UploadCleanupScheduler } from './src/workers/upload-cleanup-scheduler';

// Export the main worker handler with queue support
export default {
  fetch: handler.fetch,

  /**
   * Queue handler for Cloudflare Queues
   * Routes messages to appropriate consumers based on queue name
   *
   * @see https://developers.cloudflare.com/queues/reference/how-queues-works/
   */
  queue: async (
    batch: MessageBatch<unknown>,
    env: CloudflareEnv,
  ): Promise<void> => {
    // Route to appropriate handler based on queue name
    // Currently only title-generation queue, but structured for future queues
    if (batch.queue.startsWith('title-generation-queue')) {
      // Type assertion: queue consumer validates message structure
      return handleTitleGenerationQueue(
        batch as MessageBatch<TitleGenerationQueueMessage>,
        env,
      );
    }

    // Unknown queue - log warning
    console.error(`[QueueRouter] Unknown queue: ${batch.queue}`);
  },
} satisfies ExportedHandler<CloudflareEnv>;

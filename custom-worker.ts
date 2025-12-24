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
    // Each consumer validates message structure with TitleGenerationQueueMessageSchema
    if (batch.queue.startsWith('title-generation-queue')) {
      // Safe: handleTitleGenerationQueue validates messages internally with Zod
      // The consumer's type signature accepts MessageBatch<TitleGenerationQueueMessage>
      // but performs runtime validation to ensure type safety
      return handleTitleGenerationQueue(
        batch as MessageBatch<TitleGenerationQueueMessage>,
        env,
      );
    }

    // Unknown queue - log warning
    console.error(`[QueueRouter] Unknown queue: ${batch.queue}`);
  },
} satisfies ExportedHandler<CloudflareEnv>;

/**
 * Hono API Worker Entry Point
 *
 * Pure Cloudflare Workers backend for the Roundtable API.
 * Handles all API routes, auth, and background tasks via:
 * - Hono API routes
 * - Durable Objects for scheduling
 * - Queue handlers for async tasks
 */

import type { MessageBatch } from '@cloudflare/workers-types';

import app from './src/index';
import type {
  RoundOrchestrationQueueMessage,
  TitleGenerationQueueMessage,
} from './src/types/queues';
import { handleRoundOrchestrationQueue } from './src/workers/round-orchestration-queue';
import { handleTitleGenerationQueue } from './src/workers/title-generation-queue';

// Re-export AppType for client type inference
export type { AppType } from './src/index';

// Export Durable Object classes
export { UploadCleanupScheduler } from './src/workers/upload-cleanup-scheduler';

// Export the main worker handler with queue support
export default {
  fetch: app.fetch,

  /**
   * Queue handler for Cloudflare Queues
   * Routes messages to appropriate consumers based on queue name
   */
  queue: async (
    batch: MessageBatch<unknown>,
    env: CloudflareEnv,
  ): Promise<void> => {
    // Title generation queue
    if (batch.queue.startsWith('title-generation-queue')) {
      return handleTitleGenerationQueue(
        batch as MessageBatch<TitleGenerationQueueMessage>,
        env,
      );
    }

    // Round orchestration queue
    if (batch.queue.startsWith('round-orchestration-queue')) {
      return handleRoundOrchestrationQueue(
        batch as MessageBatch<RoundOrchestrationQueueMessage>,
        env,
      );
    }

    console.error(`[QueueRouter] Unknown queue: ${batch.queue}`);
  },
} satisfies ExportedHandler<CloudflareEnv>;

/**
 * Title Generation Queue Consumer
 *
 * Cloudflare Queue consumer for async AI title generation.
 * Uses existing title-generator.service.ts - no duplicate logic.
 *
 * Following established patterns from:
 * - src/api/services/title-generator.service.ts (service layer usage)
 * - docs/backend-patterns.md (Drizzle ORM patterns)
 *
 * @see https://developers.cloudflare.com/queues/
 * @see src/api/services/title-generator.service.ts
 */

import type { Message, MessageBatch } from '@cloudflare/workers-types';

import {
  generateTitleFromMessage,
  updateThreadTitleAndSlug,
} from '@/api/services/title-generator.service';
import type { TitleGenerationQueueMessage } from '@/api/types/queues';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Max retry delay in seconds (cap for exponential backoff) */
const MAX_RETRY_DELAY_SECONDS = 300;

/** Base retry delay in seconds */
const BASE_RETRY_DELAY_SECONDS = 60;

// ============================================================================
// MESSAGE PROCESSOR
// ============================================================================

/**
 * Process a single title generation message
 * Uses existing service functions - no duplicate logic
 */
async function processMessage(
  message: TitleGenerationQueueMessage,
  env: CloudflareEnv,
): Promise<void> {
  const { threadId, firstMessage } = message;

  // Use existing service functions
  const title = await generateTitleFromMessage(firstMessage, env);
  await updateThreadTitleAndSlug(threadId, title);
}

// ============================================================================
// QUEUE CONSUMER HANDLER
// ============================================================================

/**
 * Queue Consumer Handler
 *
 * Processes batches of title generation messages.
 * Called by Cloudflare when messages are available in the queue.
 */
export async function handleTitleGenerationQueue(
  batch: MessageBatch<TitleGenerationQueueMessage>,
  env: CloudflareEnv,
): Promise<void> {
  for (const msg of batch.messages) {
    await processQueueMessage(msg, env);
  }
}

/**
 * Process a single queue message with error handling
 */
async function processQueueMessage(
  msg: Message<TitleGenerationQueueMessage>,
  env: CloudflareEnv,
): Promise<void> {
  try {
    await processMessage(msg.body, env);
    msg.ack();
  } catch (error) {
    console.error(
      `[TitleQueue] ❌ Failed thread ${msg.body.threadId}:`,
      error,
    );

    // Exponential backoff: 60s, 120s, 240s, max 300s
    const retryDelaySeconds = Math.min(
      BASE_RETRY_DELAY_SECONDS * 2 ** msg.attempts,
      MAX_RETRY_DELAY_SECONDS,
    );
    msg.retry({ delaySeconds: retryDelaySeconds });
  }
}

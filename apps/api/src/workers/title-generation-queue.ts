/**
 * Title Generation Queue Consumer
 *
 * Cloudflare Queue consumer for async AI title generation.
 * Uses existing title-generator.service.ts - no duplicate logic.
 *
 * IMPORTANT: Uses dynamic imports to prevent AI SDK from being bundled
 * at worker startup. The AI SDK is only loaded when processing messages.
 * This prevents "Script startup exceeded memory limits" deployment errors.
 *
 * Following established patterns from:
 * - src/api/services/title-generator.service.ts (service layer usage)
 * - docs/backend-patterns.md (Drizzle ORM patterns)
 *
 * @see https://developers.cloudflare.com/queues/
 * @see src/api/services/title-generator.service.ts
 */

import type { Message, MessageBatch } from '@cloudflare/workers-types';

import { log } from '@/lib/logger';
import { calculateExponentialBackoff } from '@/lib/utils/queue-utils';
import type { TitleGenerationQueueMessage } from '@/types/queues';

// IMPORTANT: No static imports of title-generator.service here!
// Use dynamic imports in processMessage() to lazy-load the AI SDK

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
 *
 * IMPORTANT: Uses dynamic import() to lazy-load the AI SDK.
 * This prevents the 2-3MB AI SDK from being bundled at worker startup.
 */
async function processMessage(
  message: TitleGenerationQueueMessage,
  env: CloudflareEnv,
): Promise<void> {
  const { firstMessage, threadId, userId } = message;

  // Dynamic import to lazy-load AI SDK (prevents startup memory overflow)
  const { generateTitleFromMessage, updateThreadTitleAndSlug } = await import(
    '@/services/prompts',
  );

  // ✅ BILLING: Pass billing context for title generation credit deduction
  const title = await generateTitleFromMessage(firstMessage, env, {
    threadId,
    userId,
  });
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
    log.queue('error', `Failed thread ${msg.body.threadId}`, {
      error: error instanceof Error ? error.message : String(error),
      threadId: msg.body.threadId,
    });

    // Exponential backoff using shared utility
    const retryDelaySeconds = calculateExponentialBackoff(
      msg.attempts,
      BASE_RETRY_DELAY_SECONDS,
      MAX_RETRY_DELAY_SECONDS,
    );
    msg.retry({ delaySeconds: retryDelaySeconds });
  }
}

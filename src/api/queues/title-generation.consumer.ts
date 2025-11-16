/**
 * Title Generation Queue Consumer
 *
 * Background worker that processes title generation tasks
 * Receives messages from TITLE_GENERATION_QUEUE and generates AI titles for threads
 *
 * ✅ RELIABLE BACKGROUND PROCESSING:
 * - Cloudflare Queues guarantee message delivery
 * - Automatic retries (max 3) with 60 second delay between attempts
 * - Non-blocking: doesn't delay thread creation response
 * - Independent execution: runs in separate worker invocation
 *
 * ✅ QUEUE CONFIGURATION (wrangler.jsonc):
 * - max_batch_size: 10 messages per batch
 * - max_batch_timeout: 5 seconds to collect batch
 * - max_retries: 3 attempts before dead letter
 * - retry_delay: 60 seconds between retry attempts
 */

import type { MessageBatch } from '@cloudflare/workers-types';

import { invalidateThreadCache } from '@/api/common/cache-utils';
import type { TitleGenerationQueueMessage } from '@/api/types/queue';
import { getDbAsync } from '@/db';

import { generateTitleFromMessage, updateThreadTitleAndSlug } from '../services/title-generator.service';

/**
 * Process a single title generation message
 *
 * @param message - Queue message with thread details
 * @param env - Cloudflare environment bindings
 */
async function processTitleGenerationMessage(
  message: TitleGenerationQueueMessage,
  env: CloudflareEnv,
): Promise<void> {
  const { threadId, userId, firstMessage } = message;

  try {
    // Generate AI title from first message
    const aiTitle = await generateTitleFromMessage(firstMessage, env);

    // Update thread with new title and slug atomically
    await updateThreadTitleAndSlug(threadId, aiTitle);

    // Invalidate cache so frontend gets updated title
    const db = await getDbAsync();
    await invalidateThreadCache(db, userId);

    // Success - logged as error level for Cloudflare Workers monitoring
    console.error(`✅ Title generated for thread ${threadId}: "${aiTitle}"`);
  } catch (error) {
    // Log error but let queue retry mechanism handle it
    console.error(`❌ Failed to generate title for thread ${threadId}:`, error);
    throw error; // Propagate error to trigger retry
  }
}

/**
 * Queue Consumer Handler
 *
 * Called by Cloudflare Workers runtime when messages are available
 * Processes batches of title generation requests
 *
 * @param batch - Batch of messages from queue
 * @param env - Cloudflare environment bindings
 */
export async function handleTitleGenerationQueue(
  batch: MessageBatch<TitleGenerationQueueMessage>,
  env: CloudflareEnv,
): Promise<void> {
  console.error(`📥 Processing ${batch.messages.length} title generation messages`);

  // Process all messages in batch
  const results = await Promise.allSettled(
    batch.messages.map(async (message) => {
      try {
        await processTitleGenerationMessage(message.body, env);
        // Acknowledge successful processing
        message.ack();
      } catch (error) {
        console.error('Message processing failed:', error);
        // Retry with exponential backoff
        // First retry: 60s, Second retry: 120s, Third retry: 240s
        const retryDelaySeconds = Math.min(60 * 2 ** message.attempts, 300);
        message.retry({ delaySeconds: retryDelaySeconds });
      }
    }),
  );

  // Log processing summary
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.error(
    `✅ Batch complete: ${successful} successful, ${failed} failed (will retry)`,
  );
}

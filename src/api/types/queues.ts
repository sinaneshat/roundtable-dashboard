/**
 * Queue Types
 *
 * Consolidated type definitions for Cloudflare Queue messages.
 * SINGLE SOURCE OF TRUTH for queue-related types across all workers.
 *
 * Services using these types:
 * - title-generation-queue.service.ts
 * - title-generation-queue.ts (worker consumer)
 *
 * @see /docs/type-inference-patterns.md for type safety patterns
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// TITLE GENERATION QUEUE
// ============================================================================

/**
 * Title generation queue message schema
 * Sent when a new thread is created to generate an AI title asynchronously.
 *
 * @see src/workers/title-generation-queue.ts - Consumer
 * @see src/api/services/title-generation-queue.service.ts - Producer
 */
export const TitleGenerationQueueMessageSchema = z.object({
  /** Unique message ID for idempotency */
  messageId: z.string(),
  /** Thread ID to update */
  threadId: z.string(),
  /** User ID who owns the thread */
  userId: z.string(),
  /** First message content for title generation */
  firstMessage: z.string(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
});

export type TitleGenerationQueueMessage = z.infer<typeof TitleGenerationQueueMessageSchema>;

/**
 * Queue Message Types
 *
 * Type definitions for Cloudflare Queues messages
 * Used for background processing and async task execution
 */

/**
 * Title Generation Queue Message
 *
 * Message sent to queue when a new thread is created
 * Queue consumer will process this message and generate AI title
 */
export type TitleGenerationQueueMessage = {
  /**
   * Thread ID to update with generated title
   */
  threadId: string;

  /**
   * User ID who owns the thread (for cache invalidation)
   */
  userId: string;

  /**
   * First message from user to generate title from
   */
  firstMessage: string;

  /**
   * Timestamp when message was queued
   */
  queuedAt: string;
};

/**
 * Union type of all queue message types
 * Add new message types here as needed
 */
export type QueueMessage = TitleGenerationQueueMessage;

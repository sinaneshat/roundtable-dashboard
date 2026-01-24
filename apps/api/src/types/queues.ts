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
import {
  CheckRoundCompletionReasonSchema,
  RoundOrchestrationMessageTypes,
} from '@roundtable/shared/enums';

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

// ============================================================================
// ROUND ORCHESTRATION QUEUE
// ============================================================================

/**
 * Trigger participant queue message schema
 * Sent when a participant completes to trigger the next participant.
 *
 * @see src/workers/round-orchestration-queue.ts - Consumer
 * @see src/api/routes/chat/handlers/streaming.handler.ts - Producer
 */
export const TriggerParticipantQueueMessageSchema = z.object({
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.TRIGGER_PARTICIPANT),
  /** Unique message ID for idempotency: trigger-{threadId}-r{round}-p{index} */
  messageId: z.string(),
  /** Thread ID */
  threadId: z.string(),
  /** Round number */
  roundNumber: z.number(),
  /** Index of participant to trigger (0-based) */
  participantIndex: z.number(),
  /** User ID who owns the thread */
  userId: z.string(),
  /** User's session token for auth - queue consumer uses this as Cookie header */
  sessionToken: z.string().min(32, 'Session token must be at least 32 characters'),
  /** Optional attachment IDs to pass to next participant */
  attachmentIds: z.array(z.string()).optional(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
});

export type TriggerParticipantQueueMessage = z.infer<typeof TriggerParticipantQueueMessageSchema>;

/**
 * Trigger moderator queue message schema
 * Sent when all participants complete to trigger moderator analysis.
 *
 * @see src/workers/round-orchestration-queue.ts - Consumer
 * @see src/api/routes/chat/handlers/streaming.handler.ts - Producer
 */
export const TriggerModeratorQueueMessageSchema = z.object({
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.TRIGGER_MODERATOR),
  /** Unique message ID for idempotency: trigger-{threadId}-r{round}-moderator */
  messageId: z.string(),
  /** Thread ID */
  threadId: z.string(),
  /** Round number */
  roundNumber: z.number(),
  /** User ID who owns the thread */
  userId: z.string(),
  /** User's session token for auth - queue consumer uses this as Cookie header */
  sessionToken: z.string().min(32, 'Session token must be at least 32 characters'),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
});

export type TriggerModeratorQueueMessage = z.infer<typeof TriggerModeratorQueueMessageSchema>;

// ============================================================================
// CHECK ROUND COMPLETION QUEUE
// ============================================================================

/**
 * Check round completion queue message schema
 * Sent to verify and complete stale/incomplete rounds.
 *
 * This message triggers the round orchestration worker to:
 * 1. Check KV and DB for current round state
 * 2. Determine if any participants or moderator need to be triggered
 * 3. Queue appropriate trigger messages to continue the round
 *
 * @see src/workers/round-orchestration-queue.ts - Consumer
 * @see src/api/routes/chat/handlers/stream-resume.handler.ts - Producer (on resume)
 * @see src/api/routes/chat/handlers/streaming.handler.ts - Producer (on error)
 */
export const CheckRoundCompletionQueueMessageSchema = z.object({
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.CHECK_ROUND_COMPLETION),
  /** Unique message ID for idempotency */
  messageId: z.string(),
  /** Thread ID to check */
  threadId: z.string(),
  /** Round number to check */
  roundNumber: z.number(),
  /** User ID who owns the thread */
  userId: z.string(),
  /** User's session token for auth - queue consumer uses this as Cookie header */
  sessionToken: z.string().min(32, 'Session token must be at least 32 characters'),
  /** Reason for the check */
  reason: CheckRoundCompletionReasonSchema,
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
});

export type CheckRoundCompletionQueueMessage = z.infer<typeof CheckRoundCompletionQueueMessageSchema>;

// ============================================================================
// TRIGGER PRE-SEARCH QUEUE
// ============================================================================

/**
 * Trigger pre-search queue message schema
 * Sent to trigger web search before participants (for threads with web search enabled).
 *
 * @see src/workers/round-orchestration-queue.ts - Consumer
 * @see src/api/routes/chat/handlers/stream-resume.handler.ts - Producer (on recovery)
 */
export const TriggerPreSearchQueueMessageSchema = z.object({
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.TRIGGER_PRE_SEARCH),
  /** Unique message ID for idempotency: trigger-{threadId}-r{round}-presearch */
  messageId: z.string(),
  /** Thread ID */
  threadId: z.string(),
  /** Round number */
  roundNumber: z.number(),
  /** User ID who owns the thread */
  userId: z.string(),
  /** User's session token for auth - queue consumer uses this as Cookie header */
  sessionToken: z.string().min(32, 'Session token must be at least 32 characters'),
  /** User query for web search */
  userQuery: z.string(),
  /** Optional attachment IDs */
  attachmentIds: z.array(z.string()).optional(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
});

export type TriggerPreSearchQueueMessage = z.infer<typeof TriggerPreSearchQueueMessageSchema>;

// ============================================================================
// AUTOMATED JOB QUEUE MESSAGES
// ============================================================================

/**
 * Start automated job queue message schema
 * Sent when an admin creates a new automated job.
 *
 * @see src/workers/round-orchestration-queue.ts - Consumer
 * @see src/routes/admin/jobs/handler.ts - Producer
 */
export const StartAutomatedJobQueueMessageSchema = z.object({
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.START_AUTOMATED_JOB),
  /** Unique message ID for idempotency */
  messageId: z.string(),
  /** Job ID to start */
  jobId: z.string(),
  /** User ID who owns the job */
  userId: z.string(),
  /** User's session token for auth */
  sessionToken: z.string().min(32, 'Session token must be at least 32 characters'),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
});

export type StartAutomatedJobQueueMessage = z.infer<typeof StartAutomatedJobQueueMessageSchema>;

/**
 * Continue automated job queue message schema
 * Sent after a round completes to continue with next round.
 *
 * @see src/workers/round-orchestration-queue.ts - Consumer
 */
export const ContinueAutomatedJobQueueMessageSchema = z.object({
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.CONTINUE_AUTOMATED_JOB),
  /** Unique message ID for idempotency */
  messageId: z.string(),
  /** Job ID to continue */
  jobId: z.string(),
  /** Thread ID for the conversation */
  threadId: z.string(),
  /** Current round number (0-based) */
  currentRound: z.number(),
  /** User ID who owns the job */
  userId: z.string(),
  /** User's session token for auth */
  sessionToken: z.string().min(32, 'Session token must be at least 32 characters'),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
});

export type ContinueAutomatedJobQueueMessage = z.infer<typeof ContinueAutomatedJobQueueMessageSchema>;

/**
 * Complete automated job queue message schema
 * Sent when all rounds are done to finalize the job.
 *
 * @see src/workers/round-orchestration-queue.ts - Consumer
 */
export const CompleteAutomatedJobQueueMessageSchema = z.object({
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.COMPLETE_AUTOMATED_JOB),
  /** Unique message ID for idempotency */
  messageId: z.string(),
  /** Job ID to complete */
  jobId: z.string(),
  /** Thread ID for the conversation */
  threadId: z.string(),
  /** Whether to auto-publish the thread */
  autoPublish: z.boolean(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
});

export type CompleteAutomatedJobQueueMessage = z.infer<typeof CompleteAutomatedJobQueueMessageSchema>;

/**
 * Round orchestration queue message union schema
 * Used by queue consumer to route messages to appropriate handlers.
 */
export const RoundOrchestrationQueueMessageSchema = z.discriminatedUnion('type', [
  TriggerParticipantQueueMessageSchema,
  TriggerModeratorQueueMessageSchema,
  CheckRoundCompletionQueueMessageSchema,
  TriggerPreSearchQueueMessageSchema,
  StartAutomatedJobQueueMessageSchema,
  ContinueAutomatedJobQueueMessageSchema,
  CompleteAutomatedJobQueueMessageSchema,
]);

export type RoundOrchestrationQueueMessage = z.infer<typeof RoundOrchestrationQueueMessageSchema>;

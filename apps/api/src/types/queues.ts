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
  /** First message content for title generation */
  firstMessage: z.string(),
  /** Unique message ID for idempotency */
  messageId: z.string(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
  /** Thread ID to update */
  threadId: z.string(),
  /** User ID who owns the thread */
  userId: z.string(),
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
  /** Optional attachment IDs to pass to next participant */
  attachmentIds: z.array(z.string()).optional(),
  /** Unique message ID for idempotency: trigger-{threadId}-r{round}-p{index} */
  messageId: z.string(),
  /** Index of participant to trigger (0-based) */
  participantIndex: z.number(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
  /** Round number */
  roundNumber: z.number(),
  /** User's session token for auth - queue consumer uses this as Cookie header */
  sessionToken: z.string().min(32, 'Session token must be at least 32 characters'),
  /** Thread ID */
  threadId: z.string(),
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.TRIGGER_PARTICIPANT),
  /** User ID who owns the thread */
  userId: z.string(),
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
  /** Unique message ID for idempotency: trigger-{threadId}-r{round}-moderator */
  messageId: z.string(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
  /** Round number */
  roundNumber: z.number(),
  /** User's session token for auth - queue consumer uses this as Cookie header */
  sessionToken: z.string().min(32, 'Session token must be at least 32 characters'),
  /** Thread ID */
  threadId: z.string(),
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.TRIGGER_MODERATOR),
  /** User ID who owns the thread */
  userId: z.string(),
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
  /** Unique message ID for idempotency */
  messageId: z.string(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
  /** Reason for the check */
  reason: CheckRoundCompletionReasonSchema,
  /** Round number to check */
  roundNumber: z.number(),
  /** User's session token for auth - queue consumer uses this as Cookie header */
  sessionToken: z.string().min(32, 'Session token must be at least 32 characters'),
  /** Thread ID to check */
  threadId: z.string(),
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.CHECK_ROUND_COMPLETION),
  /** User ID who owns the thread */
  userId: z.string(),
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
  /** Optional attachment IDs */
  attachmentIds: z.array(z.string()).optional(),
  /** Unique message ID for idempotency: trigger-{threadId}-r{round}-presearch */
  messageId: z.string(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
  /** Round number */
  roundNumber: z.number(),
  /** User's session token for auth - queue consumer uses this as Cookie header */
  sessionToken: z.string().min(32, 'Session token must be at least 32 characters'),
  /** Thread ID */
  threadId: z.string(),
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.TRIGGER_PRE_SEARCH),
  /** User ID who owns the thread */
  userId: z.string(),
  /** User query for web search */
  userQuery: z.string(),
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
  /** Job ID to start */
  jobId: z.string(),
  /** Unique message ID for idempotency */
  messageId: z.string(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
  /** User's session token for auth */
  sessionToken: z.string().min(32, 'Session token must be at least 32 characters'),
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.START_AUTOMATED_JOB),
  /** User ID who owns the job */
  userId: z.string(),
});

export type StartAutomatedJobQueueMessage = z.infer<typeof StartAutomatedJobQueueMessageSchema>;

/**
 * Continue automated job queue message schema
 * Sent after a round completes to continue with next round.
 *
 * @see src/workers/round-orchestration-queue.ts - Consumer
 */
export const ContinueAutomatedJobQueueMessageSchema = z.object({
  /** Current round number (0-based) */
  currentRound: z.number(),
  /** Job ID to continue */
  jobId: z.string(),
  /** Unique message ID for idempotency */
  messageId: z.string(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
  /** User's session token for auth */
  sessionToken: z.string().min(32, 'Session token must be at least 32 characters'),
  /** Thread ID for the conversation */
  threadId: z.string(),
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.CONTINUE_AUTOMATED_JOB),
  /** User ID who owns the job */
  userId: z.string(),
});

export type ContinueAutomatedJobQueueMessage = z.infer<typeof ContinueAutomatedJobQueueMessageSchema>;

/**
 * Complete automated job queue message schema
 * Sent when all rounds are done to finalize the job.
 *
 * @see src/workers/round-orchestration-queue.ts - Consumer
 */
export const CompleteAutomatedJobQueueMessageSchema = z.object({
  /** Whether to auto-publish the thread */
  autoPublish: z.boolean(),
  /** Job ID to complete */
  jobId: z.string(),
  /** Unique message ID for idempotency */
  messageId: z.string(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
  /** Thread ID for the conversation */
  threadId: z.string(),
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.COMPLETE_AUTOMATED_JOB),
});

export type CompleteAutomatedJobQueueMessage = z.infer<typeof CompleteAutomatedJobQueueMessageSchema>;

// ============================================================================
// ROBUST STREAMING RESUMPTION QUEUE MESSAGES
// ============================================================================

/**
 * Start round queue message schema
 * Replaces direct streaming trigger - all AI streaming runs via queue.
 *
 * Flow:
 * 1. Client request creates user message and queues START_ROUND
 * 2. Background worker processes round (pre-search → participants → moderator)
 * 3. Client subscribes to chunk buffer via SSE
 *
 * @see src/workers/round-orchestration-queue.ts - Consumer
 * @see src/services/streaming/background-stream-execution.service.ts - Executor
 */
export const StartRoundQueueMessageSchema = z.object({
  /** Optional attachment IDs */
  attachmentIds: z.array(z.string()).optional(),
  /** Unique message ID for idempotency */
  messageId: z.string(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
  /** Round number to execute (0-based) */
  roundNumber: z.number(),
  /** User's session token for auth - queue consumer uses this as Cookie header */
  sessionToken: z.string().min(32, 'Session token must be at least 32 characters'),
  /** Thread ID */
  threadId: z.string(),
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.START_ROUND),
  /** User ID who owns the thread */
  userId: z.string(),
  /** User query for this round (if starting with user message) */
  userQuery: z.string().optional(),
});

export type StartRoundQueueMessage = z.infer<typeof StartRoundQueueMessageSchema>;

/**
 * Recover round queue message schema
 * Sent by scheduled recovery cron or stale stream detection.
 *
 * @see src/workers/round-orchestration-queue.ts - Consumer
 * @see src/workers/round-recovery-cron.ts - Producer (scheduled)
 */
export const RecoverRoundQueueMessageSchema = z.object({
  /** round_execution.id from database */
  executionId: z.string(),
  /** Unique message ID for idempotency */
  messageId: z.string(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
  /** Round number to recover (0-based) */
  roundNumber: z.number(),
  /** User's session token for auth - queue consumer uses this as Cookie header */
  sessionToken: z.string().min(32, 'Session token must be at least 32 characters'),
  /** Thread ID */
  threadId: z.string(),
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.RECOVER_ROUND),
  /** User ID who owns the thread */
  userId: z.string(),
});

export type RecoverRoundQueueMessage = z.infer<typeof RecoverRoundQueueMessageSchema>;

/**
 * Finalize round queue message schema
 * Sent when round execution completes to perform cleanup.
 *
 * @see src/workers/round-orchestration-queue.ts - Consumer
 */
export const FinalizeRoundQueueMessageSchema = z.object({
  /** round_execution.id from database */
  executionId: z.string(),
  /** Unique message ID for idempotency */
  messageId: z.string(),
  /** ISO timestamp when message was queued */
  queuedAt: z.string(),
  /** Round number that completed (0-based) */
  roundNumber: z.number(),
  /** Thread ID */
  threadId: z.string(),
  /** Message type discriminator */
  type: z.literal(RoundOrchestrationMessageTypes.FINALIZE_ROUND),
});

export type FinalizeRoundQueueMessage = z.infer<typeof FinalizeRoundQueueMessageSchema>;

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
  StartRoundQueueMessageSchema,
  RecoverRoundQueueMessageSchema,
  FinalizeRoundQueueMessageSchema,
]);

export type RoundOrchestrationQueueMessage = z.infer<typeof RoundOrchestrationQueueMessageSchema>;

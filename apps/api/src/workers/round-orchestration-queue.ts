/**
 * Round Orchestration Queue Consumer
 *
 * Cloudflare Queue consumer for guaranteed participant/moderator triggering.
 * Replaces waitUntil(fetch) pattern with queue-based orchestration for reliability.
 *
 * Key benefits:
 * - Guaranteed delivery: Queue retries on worker timeout
 * - Decoupled execution: Streams complete regardless of original request lifecycle
 * - Retry semantics: Exponential backoff for transient failures
 *
 * Following established patterns from:
 * - src/workers/title-generation-queue.ts (queue consumer pattern)
 * - src/api/routes/chat/handlers/streaming.handler.ts (trigger pattern)
 *
 * @see https://developers.cloudflare.com/queues/
 * @see src/api/types/queues.ts for message schemas
 */

/**
 * IMPORTANT: Uses dynamic imports to prevent heavy schema files from being bundled
 * at worker startup. The chat schema (1861+ lines) is only loaded when needed.
 * This prevents "Script startup exceeded CPU limits" deployment errors.
 */

import type { Message, MessageBatch } from '@cloudflare/workers-types';
import { MessagePartTypes, RoundOrchestrationMessageTypes, UIMessageRoles } from '@roundtable/shared/enums';

import { buildSessionAuthHeaders, drainStream, getBaseUrl } from '@/lib/utils/internal-api';
import { calculateExponentialBackoff } from '@/lib/utils/queue-utils';
import type {
  CheckRoundCompletionQueueMessage,
  CompleteAutomatedJobQueueMessage,
  ContinueAutomatedJobQueueMessage,
  RoundOrchestrationQueueMessage,
  StartAutomatedJobQueueMessage,
  TriggerModeratorQueueMessage,
  TriggerParticipantQueueMessage,
  TriggerPreSearchQueueMessage,
} from '@/types/queues';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Max retry delay in seconds (cap for exponential backoff) */
const MAX_RETRY_DELAY_SECONDS = 300;

/** Base retry delay in seconds */
const BASE_RETRY_DELAY_SECONDS = 60;

// ============================================================================
// MESSAGE PROCESSORS
// ============================================================================

/**
 * Trigger a participant stream via internal API call
 */
async function triggerParticipantStream(
  message: TriggerParticipantQueueMessage,
  env: CloudflareEnv,
): Promise<void> {
  const { threadId, roundNumber, participantIndex, sessionToken, attachmentIds } = message;
  const baseUrl = getBaseUrl(env);

  // Build request body matching streaming handler expectations
  const requestBody = {
    id: threadId,
    message: {
      id: `trigger-${threadId}-r${roundNumber}-p${participantIndex}`,
      role: UIMessageRoles.USER,
      content: '', // Trigger message - no new user input
      parts: [{ type: MessagePartTypes.TEXT, text: '' }],
    },
    participantIndex,
    attachmentIds: attachmentIds || [],
  };

  const response = await fetch(`${baseUrl}/api/v1/chat`, {
    method: 'POST',
    headers: buildSessionAuthHeaders(sessionToken),
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Failed to trigger participant ${participantIndex}: ${response.status} ${response.statusText}`);
  }

  // Drain the stream response to allow completion
  await drainStream(response);
}

/**
 * Trigger a moderator stream via internal API call
 *
 * After moderator completes, checks if thread belongs to an automated job
 * and queues continuation if needed.
 */
async function triggerModeratorStream(
  message: TriggerModeratorQueueMessage,
  env: CloudflareEnv,
): Promise<void> {
  const { threadId, roundNumber, sessionToken } = message;
  const baseUrl = getBaseUrl(env);

  const response = await fetch(
    `${baseUrl}/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/moderator`,
    {
      method: 'POST',
      headers: buildSessionAuthHeaders(sessionToken),
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to trigger moderator: ${response.status} ${response.statusText}`);
  }

  // Drain the stream response to allow completion
  await drainStream(response);

  // Check if this thread belongs to an automated job
  // If so, queue the continuation to the next round
  try {
    const { checkJobContinuation } = await import('@/services/jobs');
    const { getDbAsync } = await import('@/db');
    const db = await getDbAsync();

    await checkJobContinuation(threadId, roundNumber, sessionToken, db, env.ROUND_ORCHESTRATION_QUEUE);
  } catch {
    // Job continuation check failed - non-critical, continue
  }
}

/**
 * Trigger pre-search via internal API call
 */
async function triggerPreSearch(
  message: TriggerPreSearchQueueMessage,
  env: CloudflareEnv,
): Promise<void> {
  const { threadId, roundNumber, sessionToken, userQuery, attachmentIds } = message;
  const baseUrl = getBaseUrl(env);

  const response = await fetch(
    `${baseUrl}/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/pre-search`,
    {
      method: 'POST',
      headers: buildSessionAuthHeaders(sessionToken),
      body: JSON.stringify({
        userQuery,
        attachmentIds: attachmentIds || [],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to trigger pre-search: ${response.status} ${response.statusText}`);
  }

  // Drain the stream response to allow completion
  await drainStream(response);
}

// ============================================================================
// AUTOMATED JOB PROCESSORS
// ============================================================================

/**
 * Start an automated job - create thread, select models, queue first round
 */
async function handleStartAutomatedJob(
  message: StartAutomatedJobQueueMessage,
  env: CloudflareEnv,
): Promise<void> {
  const { jobId, sessionToken } = message;

  // Lazy-load job orchestration service and DB
  const { startAutomatedJob } = await import('@/services/jobs');
  const { getDbAsync } = await import('@/db');

  const db = await getDbAsync();
  await startAutomatedJob(jobId, sessionToken, db, env, env.ROUND_ORCHESTRATION_QUEUE);
}

/**
 * Continue an automated job to the next round
 */
async function handleContinueAutomatedJob(
  message: ContinueAutomatedJobQueueMessage,
  env: CloudflareEnv,
): Promise<void> {
  const { jobId, threadId, currentRound, sessionToken } = message;

  // Lazy-load job orchestration service and DB
  const { continueAutomatedJob } = await import('@/services/jobs');
  const { getDbAsync } = await import('@/db');

  const db = await getDbAsync();
  await continueAutomatedJob(jobId, threadId, currentRound, sessionToken, db, env, env.ROUND_ORCHESTRATION_QUEUE);
}

/**
 * Complete an automated job - mark done, optionally publish
 */
async function handleCompleteAutomatedJob(
  message: CompleteAutomatedJobQueueMessage,
  _env: CloudflareEnv,
): Promise<void> {
  const { jobId, threadId, autoPublish } = message;

  // Lazy-load job orchestration service and DB
  const { completeAutomatedJob } = await import('@/services/jobs');
  const { getDbAsync } = await import('@/db');

  const db = await getDbAsync();
  await completeAutomatedJob(jobId, threadId, autoPublish, db);
}

/**
 * Check round completion and trigger next step if needed
 *
 * This handler:
 * 1. Validates recovery attempts to prevent infinite loops
 * 2. Gets current round state from internal API
 * 3. Determines what needs to happen next
 * 4. Queues appropriate trigger message
 *
 * IMPORTANT: Uses dynamic import for RoundStatusSchema to avoid
 * loading 1861+ line schema file at worker startup.
 */
async function checkRoundCompletion(
  message: CheckRoundCompletionQueueMessage,
  env: CloudflareEnv,
): Promise<void> {
  const { threadId, roundNumber, sessionToken } = message;
  const baseUrl = getBaseUrl(env);

  // Get round state via internal API (this validates recovery attempts server-side)
  const stateResponse = await fetch(
    `${baseUrl}/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/status`,
    {
      method: 'GET',
      headers: buildSessionAuthHeaders(sessionToken),
    },
  );

  if (!stateResponse.ok) {
    // 404 means round doesn't exist or is complete - not an error
    if (stateResponse.status === 404) {
      return;
    }
    throw new Error(`Failed to get round status: ${stateResponse.status} ${stateResponse.statusText}`);
  }

  // Lazy-load schema to avoid startup CPU limit
  const { RoundStatusSchema } = await import('@/routes/chat/schema');

  // Validate response with Zod schema - single source of truth
  const parseResult = RoundStatusSchema.safeParse(await stateResponse.json());
  if (!parseResult.success) {
    throw new Error(`Invalid round status response: ${parseResult.error.message}`);
  }
  const roundState = parseResult.data;

  // Check if recovery is allowed
  if (!roundState.canRecover) {
    // LOG:(`[RoundOrchestration] ⚠️ Max recovery attempts (${roundState.maxRecoveryAttempts}) reached for ${threadId} r${roundNumber}`);
    return;
  }

  // Determine next action based on round state
  if (roundState.needsPreSearch && roundState.userQuery) {
    // Pre-search needed - queue pre-search trigger
    // LOG:(`[RoundOrchestration] 📤 Queuing pre-search for ${threadId} r${roundNumber}`);
    await env.ROUND_ORCHESTRATION_QUEUE.send({
      type: RoundOrchestrationMessageTypes.TRIGGER_PRE_SEARCH,
      messageId: `trigger-${threadId}-r${roundNumber}-presearch-${Date.now()}`,
      threadId,
      roundNumber,
      userId: message.userId,
      sessionToken,
      userQuery: roundState.userQuery,
      attachmentIds: roundState.attachmentIds,
      queuedAt: new Date().toISOString(),
    } satisfies TriggerPreSearchQueueMessage);
  } else if (roundState.nextParticipantIndex !== null) {
    // Participant needed - queue participant trigger
    // LOG:(`[RoundOrchestration] 📤 Queuing participant ${roundState.nextParticipantIndex} for ${threadId} r${roundNumber}`);
    await env.ROUND_ORCHESTRATION_QUEUE.send({
      type: RoundOrchestrationMessageTypes.TRIGGER_PARTICIPANT,
      messageId: `trigger-${threadId}-r${roundNumber}-p${roundState.nextParticipantIndex}-${Date.now()}`,
      threadId,
      roundNumber,
      participantIndex: roundState.nextParticipantIndex,
      userId: message.userId,
      sessionToken,
      attachmentIds: roundState.attachmentIds,
      queuedAt: new Date().toISOString(),
    } satisfies TriggerParticipantQueueMessage);
  } else if (roundState.needsModerator) {
    // Moderator needed - queue moderator trigger
    // LOG:(`[RoundOrchestration] 📤 Queuing moderator for ${threadId} r${roundNumber}`);
    await env.ROUND_ORCHESTRATION_QUEUE.send({
      type: RoundOrchestrationMessageTypes.TRIGGER_MODERATOR,
      messageId: `trigger-${threadId}-r${roundNumber}-moderator-${Date.now()}`,
      threadId,
      roundNumber,
      userId: message.userId,
      sessionToken,
      queuedAt: new Date().toISOString(),
    } satisfies TriggerModeratorQueueMessage);
  } else {
    // Round is complete or in unknown state
    // LOG:(`[RoundOrchestration] ✅ Round ${roundNumber} for ${threadId} appears complete or no action needed`);
  }
}

// ============================================================================
// QUEUE CONSUMER HANDLER
// ============================================================================

/**
 * Process a single queue message with error handling and retry logic
 *
 * IMPORTANT: Uses dynamic imports for Zod schemas to avoid loading
 * heavy schema files at worker startup.
 */
async function processQueueMessage(
  msg: Message<RoundOrchestrationQueueMessage>,
  env: CloudflareEnv,
): Promise<void> {
  try {
    const { body } = msg;
    const messageType = body.type;

    // Lazy-load schemas to avoid startup CPU limit
    const {
      CheckRoundCompletionQueueMessageSchema,
      CompleteAutomatedJobQueueMessageSchema,
      ContinueAutomatedJobQueueMessageSchema,
      StartAutomatedJobQueueMessageSchema,
      TriggerModeratorQueueMessageSchema,
      TriggerParticipantQueueMessageSchema,
      TriggerPreSearchQueueMessageSchema,
    } = await import('@/types/queues');

    // Validate and narrow types using Zod schemas for proper TypeScript inference
    if (messageType === 'trigger-participant') {
      const parsed = TriggerParticipantQueueMessageSchema.safeParse(body);
      if (parsed.success) {
        await triggerParticipantStream(parsed.data, env);
      } else {
        throw new Error(`Invalid trigger-participant message: ${parsed.error.message}`);
      }
    } else if (messageType === 'trigger-moderator') {
      const parsed = TriggerModeratorQueueMessageSchema.safeParse(body);
      if (parsed.success) {
        await triggerModeratorStream(parsed.data, env);
      } else {
        throw new Error(`Invalid trigger-moderator message: ${parsed.error.message}`);
      }
    } else if (messageType === 'check-round-completion') {
      const parsed = CheckRoundCompletionQueueMessageSchema.safeParse(body);
      if (parsed.success) {
        await checkRoundCompletion(parsed.data, env);
      } else {
        throw new Error(`Invalid check-round-completion message: ${parsed.error.message}`);
      }
    } else if (messageType === 'trigger-pre-search') {
      const parsed = TriggerPreSearchQueueMessageSchema.safeParse(body);
      if (parsed.success) {
        await triggerPreSearch(parsed.data, env);
      } else {
        throw new Error(`Invalid trigger-pre-search message: ${parsed.error.message}`);
      }
    } else if (messageType === 'start-automated-job') {
      const parsed = StartAutomatedJobQueueMessageSchema.safeParse(body);
      if (parsed.success) {
        await handleStartAutomatedJob(parsed.data, env);
      } else {
        throw new Error(`Invalid start-automated-job message: ${parsed.error.message}`);
      }
    } else if (messageType === 'continue-automated-job') {
      const parsed = ContinueAutomatedJobQueueMessageSchema.safeParse(body);
      if (parsed.success) {
        await handleContinueAutomatedJob(parsed.data, env);
      } else {
        throw new Error(`Invalid continue-automated-job message: ${parsed.error.message}`);
      }
    } else if (messageType === 'complete-automated-job') {
      const parsed = CompleteAutomatedJobQueueMessageSchema.safeParse(body);
      if (parsed.success) {
        await handleCompleteAutomatedJob(parsed.data, env);
      } else {
        throw new Error(`Invalid complete-automated-job message: ${parsed.error.message}`);
      }
    } else {
      throw new Error(`Unhandled message type: ${messageType}`);
    }

    msg.ack();
  } catch (error) {
    const messageType = msg.body.type;
    // threadId exists on most message types except start-automated-job which has jobId
    const identifier = 'threadId' in msg.body ? msg.body.threadId : ('jobId' in msg.body ? msg.body.jobId : 'unknown');

    console.error(
      `[RoundOrchestration] ❌ Failed ${messageType} for ${identifier}:`,
      error,
    );

    // Exponential backoff using shared utility
    const retryDelaySeconds = calculateExponentialBackoff(
      msg.attempts,
      BASE_RETRY_DELAY_SECONDS,
      MAX_RETRY_DELAY_SECONDS,
    );

    msg.retry({ delaySeconds: retryDelaySeconds });
  }
}

/**
 * Queue Consumer Handler
 *
 * Processes batches of round orchestration messages.
 * Called by Cloudflare when messages are available in the queue.
 *
 * Note: batch_size is set to 1 in wrangler.jsonc to ensure
 * sequential processing within a round.
 */
export async function handleRoundOrchestrationQueue(
  batch: MessageBatch<RoundOrchestrationQueueMessage>,
  env: CloudflareEnv,
): Promise<void> {
  for (const msg of batch.messages) {
    await processQueueMessage(msg, env);
  }
}

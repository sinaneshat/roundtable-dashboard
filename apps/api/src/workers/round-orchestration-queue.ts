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

import { rlog } from '@/lib/utils/dev-logger';
import { buildSessionAuthHeaders, drainStream, getBaseUrl } from '@/lib/utils/internal-api';
import { calculateExponentialBackoff } from '@/lib/utils/queue-utils';
import type {
  CheckRoundCompletionQueueMessage,
  CompleteAutomatedJobQueueMessage,
  ContinueAutomatedJobQueueMessage,
  FinalizeRoundQueueMessage,
  RecoverRoundQueueMessage,
  RoundOrchestrationQueueMessage,
  StartAutomatedJobQueueMessage,
  StartRoundQueueMessage,
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
 * Check if participant should still be triggered
 * Returns true if participant should be triggered, false if round is already complete
 *
 * IMPORTANT: This check is intentionally minimal - we only skip if ALL participants
 * are done (completed + failed >= total). We do NOT check:
 * - nextParticipantIndex (excludes "triggered" participants, breaking direct triggers)
 * - Individual participant status (status endpoint doesn't return per-participant map)
 *
 * The streaming endpoint has its own idempotency protection via ACTIVE status in KV,
 * which prevents the same participant from streaming twice.
 */
async function shouldTriggerParticipant(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  sessionToken: string,
  env: CloudflareEnv,
): Promise<boolean> {
  const baseUrl = getBaseUrl(env);

  try {
    const stateResponse = await fetch(
      `${baseUrl}/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/status`,
      {
        headers: buildSessionAuthHeaders(sessionToken),
        method: 'GET',
      },
    );

    if (!stateResponse.ok) {
      // If status check fails, proceed with trigger (fail-open for reliability)
      // The streaming endpoint has its own duplicate protection
      return true;
    }

    // Lazy-load schema to avoid startup CPU limit
    const { RoundStatusSchema } = await import('@/routes/chat/schema');

    // Parse wrapped API response: { data: RoundStatus, meta: ... }
    const json = await stateResponse.json() as { data?: unknown };
    if (!json.data) {
      // Invalid response - proceed with trigger
      return true;
    }

    const parseResult = RoundStatusSchema.safeParse(json.data);
    if (!parseResult.success) {
      // Invalid response - proceed with trigger
      return true;
    }

    const roundState = parseResult.data;

    // ✅ IDEMPOTENCY: Only skip if ALL participants are done
    // This is a minimal check - let the streaming endpoint handle per-participant idempotency
    const allParticipantsDone = (roundState.completedParticipants + roundState.failedParticipants) >= roundState.totalParticipants;
    if (allParticipantsDone) {
      rlog.race('queue-skip-all-done', `r${roundNumber} P${participantIndex} skipped - all participants done (${roundState.completedParticipants}/${roundState.totalParticipants})`);
      return false;
    }

    return true;
  } catch {
    // On error, proceed with trigger - streaming endpoint will handle duplicates
    return true;
  }
}

/**
 * Trigger a participant stream via internal API call
 */
async function triggerParticipantStream(
  message: TriggerParticipantQueueMessage,
  env: CloudflareEnv,
): Promise<void> {
  const { attachmentIds, participantIndex, roundNumber, sessionToken, threadId } = message;
  const baseUrl = getBaseUrl(env);

  // ✅ IDEMPOTENCY GUARD: Check if participant should still be triggered
  const shouldTrigger = await shouldTriggerParticipant(
    threadId,
    roundNumber,
    participantIndex,
    sessionToken,
    env,
  );

  if (!shouldTrigger) {
    // Participant already streaming or completed - skip duplicate trigger
    rlog.race('queue-idempotency', `r${roundNumber} P${participantIndex} skipped - already triggered`);
    return;
  }

  // ✅ FRAME: Queue triggering participant
  const isRound1 = roundNumber === 0;
  if (participantIndex === 0) {
    if (isRound1) {
      rlog.frame(3, 'queue-P0', `r${roundNumber} Queue triggering P0 via API`);
    } else {
      rlog.frame(11, 'queue-P0', `r${roundNumber} Queue triggering P0 after pre-search`);
    }
  } else {
    rlog.handoff('queue-trigger', `r${roundNumber} Queue triggering P${participantIndex}`);
  }

  // Build request body matching streaming handler expectations
  const requestBody = {
    attachmentIds: attachmentIds || [],
    id: threadId,
    message: {
      content: '', // Trigger message - no new user input
      id: `trigger-${threadId}-r${roundNumber}-p${participantIndex}`,
      parts: [{ text: '', type: MessagePartTypes.TEXT }],
      role: UIMessageRoles.USER,
    },
    participantIndex,
  };

  const response = await fetch(`${baseUrl}/api/v1/chat`, {
    body: JSON.stringify(requestBody),
    headers: buildSessionAuthHeaders(sessionToken),
    method: 'POST',
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
  const { roundNumber, sessionToken, threadId } = message;
  const baseUrl = getBaseUrl(env);

  // ✅ FRAME 5: Queue triggering moderator after all participants
  rlog.frame(5, 'queue-mod', `r${roundNumber} Queue triggering moderator via API`);

  const response = await fetch(
    `${baseUrl}/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/moderator`,
    {
      body: JSON.stringify({}),
      headers: buildSessionAuthHeaders(sessionToken),
      method: 'POST',
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
  const { attachmentIds, roundNumber, sessionToken, threadId, userQuery } = message;
  const baseUrl = getBaseUrl(env);

  // ✅ FRAME 10: Queue triggering pre-search (web research)
  rlog.frame(10, 'queue-presearch', `r${roundNumber} Queue triggering web research via API`);

  const response = await fetch(
    `${baseUrl}/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/pre-search`,
    {
      body: JSON.stringify({
        attachmentIds: attachmentIds || [],
        userQuery,
      }),
      headers: buildSessionAuthHeaders(sessionToken),
      method: 'POST',
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
  const { currentRound, jobId, sessionToken, threadId } = message;

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
  const { autoPublish, jobId, threadId } = message;

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
  const { roundNumber, sessionToken, threadId } = message;
  const baseUrl = getBaseUrl(env);

  // Get round state via internal API (this validates recovery attempts server-side)
  const stateResponse = await fetch(
    `${baseUrl}/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/status`,
    {
      headers: buildSessionAuthHeaders(sessionToken),
      method: 'GET',
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

  // Parse wrapped API response: { data: RoundStatus, meta: ... }
  const json = await stateResponse.json() as { data?: unknown };
  if (!json.data) {
    throw new Error('Invalid round status response: missing data field');
  }

  // Validate response with Zod schema - single source of truth
  const parseResult = RoundStatusSchema.safeParse(json.data);
  if (!parseResult.success) {
    // Debug: Log what we actually received to diagnose the issue
    const received = JSON.stringify(json).slice(0, 500);
    throw new Error(`Invalid round status response. Received: ${received}. Errors: ${parseResult.error.message}`);
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
      attachmentIds: roundState.attachmentIds,
      messageId: `trigger-${threadId}-r${roundNumber}-presearch-${Date.now()}`,
      queuedAt: new Date().toISOString(),
      roundNumber,
      sessionToken,
      threadId,
      type: RoundOrchestrationMessageTypes.TRIGGER_PRE_SEARCH,
      userId: message.userId,
      userQuery: roundState.userQuery,
    } satisfies TriggerPreSearchQueueMessage);
  } else if (roundState.nextParticipantIndex !== null) {
    // Participant needed - queue participant trigger
    // LOG:(`[RoundOrchestration] 📤 Queuing participant ${roundState.nextParticipantIndex} for ${threadId} r${roundNumber}`);
    await env.ROUND_ORCHESTRATION_QUEUE.send({
      attachmentIds: roundState.attachmentIds,
      messageId: `trigger-${threadId}-r${roundNumber}-p${roundState.nextParticipantIndex}-${Date.now()}`,
      participantIndex: roundState.nextParticipantIndex,
      queuedAt: new Date().toISOString(),
      roundNumber,
      sessionToken,
      threadId,
      type: RoundOrchestrationMessageTypes.TRIGGER_PARTICIPANT,
      userId: message.userId,
    } satisfies TriggerParticipantQueueMessage);
  } else if (roundState.needsModerator) {
    // Moderator needed - queue moderator trigger
    // LOG:(`[RoundOrchestration] 📤 Queuing moderator for ${threadId} r${roundNumber}`);
    await env.ROUND_ORCHESTRATION_QUEUE.send({
      messageId: `trigger-${threadId}-r${roundNumber}-moderator-${Date.now()}`,
      queuedAt: new Date().toISOString(),
      roundNumber,
      sessionToken,
      threadId,
      type: RoundOrchestrationMessageTypes.TRIGGER_MODERATOR,
      userId: message.userId,
    } satisfies TriggerModeratorQueueMessage);
  } else {
    // Round is complete or in unknown state
    // LOG:(`[RoundOrchestration] ✅ Round ${roundNumber} for ${threadId} appears complete or no action needed`);
  }
}

// ============================================================================
// ROBUST STREAMING RESUMPTION HANDLERS
// ============================================================================

/**
 * Start a new round execution
 * Replaces direct streaming trigger - all AI streaming runs via queue
 */
async function handleStartRound(
  message: StartRoundQueueMessage,
  env: CloudflareEnv,
): Promise<void> {
  const { attachmentIds, roundNumber, sessionToken, threadId, userId, userQuery } = message;

  // Lazy-load services to avoid startup CPU limit
  const { executeRound } = await import('@/services/streaming/background-stream-execution.service');
  const { getDbAsync } = await import('@/db');

  const db = await getDbAsync();

  await executeRound({
    attachmentIds,
    db,
    env,
    queue: env.ROUND_ORCHESTRATION_QUEUE,
    roundNumber,
    sessionToken,
    threadId,
    userId,
    userQuery,
  });
}

/**
 * Recover a stalled round execution
 * Called by scheduled cron or stale stream detection
 */
async function handleRecoverRound(
  message: RecoverRoundQueueMessage,
  env: CloudflareEnv,
): Promise<void> {
  const { executionId, sessionToken } = message;

  // Lazy-load services to avoid startup CPU limit
  const { recoverRound } = await import('@/services/streaming/background-stream-execution.service');
  const { getDbAsync } = await import('@/db');

  const db = await getDbAsync();

  await recoverRound(
    db,
    executionId,
    env.ROUND_ORCHESTRATION_QUEUE,
    sessionToken,
  );
}

/**
 * Finalize a completed round execution
 * Cleans up KV state and performs any post-completion tasks
 */
async function handleFinalizeRound(
  message: FinalizeRoundQueueMessage,
  env: CloudflareEnv,
): Promise<void> {
  const { executionId } = message;

  // Lazy-load services to avoid startup CPU limit
  const { finalizeRound } = await import('@/services/streaming/background-stream-execution.service');
  const { getDbAsync } = await import('@/db');

  const db = await getDbAsync();

  await finalizeRound(db, executionId, env);
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
      FinalizeRoundQueueMessageSchema,
      RecoverRoundQueueMessageSchema,
      StartAutomatedJobQueueMessageSchema,
      StartRoundQueueMessageSchema,
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
    } else if (messageType === 'start-round') {
      const parsed = StartRoundQueueMessageSchema.safeParse(body);
      if (parsed.success) {
        await handleStartRound(parsed.data, env);
      } else {
        throw new Error(`Invalid start-round message: ${parsed.error.message}`);
      }
    } else if (messageType === 'recover-round') {
      const parsed = RecoverRoundQueueMessageSchema.safeParse(body);
      if (parsed.success) {
        await handleRecoverRound(parsed.data, env);
      } else {
        throw new Error(`Invalid recover-round message: ${parsed.error.message}`);
      }
    } else if (messageType === 'finalize-round') {
      const parsed = FinalizeRoundQueueMessageSchema.safeParse(body);
      if (parsed.success) {
        await handleFinalizeRound(parsed.data, env);
      } else {
        throw new Error(`Invalid finalize-round message: ${parsed.error.message}`);
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

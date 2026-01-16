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

import type { Message, MessageBatch } from '@cloudflare/workers-types';

import { BETTER_AUTH_SESSION_COOKIE_NAME, MessagePartTypes, RoundOrchestrationMessageTypes, UIMessageRoles } from '@/api/core/enums';
import { RoundStatusSchema } from '@/api/routes/chat/schema';
import type {
  CheckRoundCompletionQueueMessage,
  RoundOrchestrationQueueMessage,
  TriggerModeratorQueueMessage,
  TriggerParticipantQueueMessage,
  TriggerPreSearchQueueMessage,
} from '@/api/types/queues';
import type { WebappEnv } from '@/lib/config/base-urls';
import { BASE_URLS, isWebappEnv, WEBAPP_ENVS } from '@/lib/config/base-urls';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Max retry delay in seconds (cap for exponential backoff) */
const MAX_RETRY_DELAY_SECONDS = 300;

/** Base retry delay in seconds */
const BASE_RETRY_DELAY_SECONDS = 60;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get base URL for current environment
 */
function getBaseUrl(env: CloudflareEnv): string {
  const webappEnv = env.NEXT_PUBLIC_WEBAPP_ENV;
  const validEnv: WebappEnv = isWebappEnv(webappEnv) ? webappEnv : WEBAPP_ENVS.LOCAL;
  return BASE_URLS[validEnv].app;
}

/**
 * Build auth headers using user's session cookie
 *
 * Uses the session token from the original request (passed via queue message)
 * to authenticate with Better Auth - same as browser-based requests.
 */
function buildSessionAuthHeaders(sessionToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cookie': `${BETTER_AUTH_SESSION_COOKIE_NAME}=${sessionToken}`,
  };
}

/**
 * Drain a response stream (consume all data without processing)
 */
async function drainStream(response: Response): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader)
    return;

  try {
    while (true) {
      const { done } = await reader.read();
      if (done)
        break;
    }
  } finally {
    reader.releaseLock();
  }
}

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

/**
 * Check round completion and trigger next step if needed
 *
 * This handler:
 * 1. Validates recovery attempts to prevent infinite loops
 * 2. Gets current round state from internal API
 * 3. Determines what needs to happen next
 * 4. Queues appropriate trigger message
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
 */
async function processQueueMessage(
  msg: Message<RoundOrchestrationQueueMessage>,
  env: CloudflareEnv,
): Promise<void> {
  try {
    const { body } = msg;

    switch (body.type) {
      case RoundOrchestrationMessageTypes.TRIGGER_PARTICIPANT:
        await triggerParticipantStream(body, env);
        break;
      case RoundOrchestrationMessageTypes.TRIGGER_MODERATOR:
        await triggerModeratorStream(body, env);
        break;
      case RoundOrchestrationMessageTypes.CHECK_ROUND_COMPLETION:
        await checkRoundCompletion(body, env);
        break;
      case RoundOrchestrationMessageTypes.TRIGGER_PRE_SEARCH:
        await triggerPreSearch(body, env);
        break;
      default:
        // TypeScript exhaustiveness check - unreachable if all message types handled
        body satisfies never;
    }

    msg.ack();
  } catch (error) {
    const messageType = msg.body.type;
    const threadId = msg.body.threadId;

    console.error(
      `[RoundOrchestration] ❌ Failed ${messageType} for thread ${threadId}:`,
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

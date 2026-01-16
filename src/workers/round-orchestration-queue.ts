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

import { MessagePartTypes, UIMessageRoles } from '@/api/core/enums';
import type {
  RoundOrchestrationQueueMessage,
  TriggerModeratorQueueMessage,
  TriggerParticipantQueueMessage,
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

/** Internal auth header name */
const INTERNAL_AUTH_HEADER = 'X-Internal-Queue-Secret';

/** User ID header for internal auth */
const USER_ID_HEADER = 'X-Queue-User-Id';

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
 * Build auth headers for internal queue calls
 */
function buildInternalAuthHeaders(
  secret: string,
  userId: string,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    [INTERNAL_AUTH_HEADER]: secret,
    [USER_ID_HEADER]: userId,
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
  const { threadId, roundNumber, participantIndex, userId, attachmentIds } = message;
  const baseUrl = getBaseUrl(env);
  const secret = env.INTERNAL_QUEUE_SECRET;

  if (!secret) {
    throw new Error('INTERNAL_QUEUE_SECRET not configured');
  }

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
    headers: buildInternalAuthHeaders(secret, userId),
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
  const { threadId, roundNumber, userId } = message;
  const baseUrl = getBaseUrl(env);
  const secret = env.INTERNAL_QUEUE_SECRET;

  if (!secret) {
    throw new Error('INTERNAL_QUEUE_SECRET not configured');
  }

  const response = await fetch(
    `${baseUrl}/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/moderator`,
    {
      method: 'POST',
      headers: buildInternalAuthHeaders(secret, userId),
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to trigger moderator: ${response.status} ${response.statusText}`);
  }

  // Drain the stream response to allow completion
  await drainStream(response);
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

    if (body.type === 'trigger-participant') {
      await triggerParticipantStream(body, env);
    } else if (body.type === 'trigger-moderator') {
      await triggerModeratorStream(body, env);
    } else {
      // TypeScript exhaustiveness check
      const _exhaustive: never = body;
      console.error(`[RoundOrchestration] Unknown message type:`, _exhaustive);
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

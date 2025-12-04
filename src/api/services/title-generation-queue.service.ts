/**
 * Title Generation Queue Service
 *
 * Provides async title generation with environment-aware execution:
 * - Preview/Prod: Uses Cloudflare Queues (guaranteed delivery, retries)
 * - Local: Falls back to waitUntil() (best-effort, non-blocking)
 *
 * Following established patterns from:
 * - src/api/services/upload-cleanup.service.ts
 *
 * @see src/workers/title-generation-queue.ts - Queue consumer
 * @see src/api/services/title-generator.service.ts - Title generation logic
 */

import type { Context } from 'hono';
import { ulid } from 'ulid';

import type { ApiEnv } from '@/api/types';
import type { TitleGenerationQueueMessage } from '@/api/types/queues';
import { getDbAsync } from '@/db';

import { invalidateThreadCache } from '../common/cache-utils';
import {
  generateTitleFromMessage,
  updateThreadTitleAndSlug,
} from './title-generator.service';

// ============================================================================
// AVAILABILITY CHECK
// ============================================================================

/**
 * Check if title generation queue is available
 *
 * Queue is only available in deployed Cloudflare Workers environments.
 * Returns false in local development (next dev, wrangler dev without queues).
 */
export function isTitleQueueAvailable(env: CloudflareEnv): boolean {
  return env.TITLE_GENERATION_QUEUE !== undefined;
}

// ============================================================================
// QUEUE MESSAGE BUILDER
// ============================================================================

/**
 * Build a title generation queue message
 */
function buildQueueMessage(
  threadId: string,
  userId: string,
  firstMessage: string,
): TitleGenerationQueueMessage {
  return {
    messageId: ulid(),
    threadId,
    userId,
    firstMessage,
    queuedAt: new Date().toISOString(),
  };
}

// ============================================================================
// LOCAL FALLBACK (waitUntil)
// ============================================================================

/**
 * Generate a simple title from the first message (fallback when AI not available)
 */
function generateSimpleTitle(firstMessage: string): string {
  // Take first 5 words, capitalize first letter of each
  const words = firstMessage
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  let title = words.join(' ');

  // Limit to 50 chars
  if (title.length > 50) {
    title = `${title.substring(0, 47)}...`;
  }

  return title || 'New Chat';
}

/**
 * Generate title - runs synchronously when queue not available
 */
async function generateTitleLocal(
  threadId: string,
  userId: string,
  firstMessage: string,
  env: CloudflareEnv,
): Promise<void> {
  // Always run synchronously in local dev (no waitUntil needed)
  let title: string;

  // Use AI if API key available, otherwise use simple extraction
  if (env.OPENROUTER_API_KEY) {
    title = await generateTitleFromMessage(firstMessage, env);
  } else {
    title = generateSimpleTitle(firstMessage);
  }

  await updateThreadTitleAndSlug(threadId, title);
  const db = await getDbAsync();
  await invalidateThreadCache(db, userId);
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Queue title generation for a thread
 *
 * Automatically selects the best execution strategy:
 * - Preview/Prod: Cloudflare Queue (guaranteed, retries, DLQ)
 * - Local: waitUntil() fallback (best-effort, non-blocking)
 *
 * @param c - Hono context with env and executionCtx
 * @param threadId - Thread to update
 * @param userId - User who owns the thread
 * @param firstMessage - First message for title generation
 */
export async function queueTitleGeneration(
  c: Context<ApiEnv>,
  threadId: string,
  userId: string,
  firstMessage: string,
): Promise<void> {
  const env = c.env;

  // Use queue in deployed environments
  if (isTitleQueueAvailable(env)) {
    try {
      const message = buildQueueMessage(threadId, userId, firstMessage);
      await env.TITLE_GENERATION_QUEUE.send(message);
      return;
    } catch {
      // Fall through to waitUntil fallback
    }
  }

  // Fallback to local generation for local dev or queue failure
  // Run synchronously - errors will propagate to help identify issues
  await generateTitleLocal(threadId, userId, firstMessage, env);
}

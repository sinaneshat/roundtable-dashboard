/**
 * Title Generator Service
 *
 * Auto-generates descriptive titles for chat threads using AI
 * Similar to ChatGPT's automatic title generation
 * Uses the first user message to create a concise, descriptive title
 */

import 'server-only';

import { eq } from 'drizzle-orm';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import { TITLE_GENERATION_MODEL_ID } from '@/api/core/ai-models';
import { MessagePartTypes, UIMessageRoles } from '@/api/core/enums';
import { TITLE_GENERATION_CONFIG } from '@/api/services/billing';
import { initializeOpenRouter, openRouterService } from '@/api/services/models';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db';

import { generateUniqueSlug } from './slug-generator.service';

/**
 * Generate title from first user message
 * Uses Google Gemini 2.0 Flash for fast, reliable title generation
 * Single attempt - falls back to truncated message on failure
 */
export async function generateTitleFromMessage(
  firstMessage: string,
  env: ApiEnv['Bindings'],
): Promise<string> {
  initializeOpenRouter(env);

  const MAX_WORDS = 5;
  const MAX_LENGTH = 50;

  // Single attempt - no retry delays. If it fails, use fallback immediately.
  try {
    const result = await openRouterService.generateText({
      modelId: TITLE_GENERATION_MODEL_ID,
      messages: [
        {
          id: 'msg-title-gen',
          role: UIMessageRoles.USER,
          parts: [{ type: MessagePartTypes.TEXT, text: firstMessage }],
        },
      ],
      system: TITLE_GENERATION_CONFIG.systemPrompt,
      temperature: TITLE_GENERATION_CONFIG.temperature,
      maxTokens: TITLE_GENERATION_CONFIG.maxTokens,
    });

    let title = result.text.trim().replace(/^["']|["']$/g, '');

    const words = title.split(/\s+/);
    if (words.length > MAX_WORDS) {
      title = words.slice(0, MAX_WORDS).join(' ');
    }

    if (title.length > MAX_LENGTH) {
      title = title.substring(0, MAX_LENGTH).trim();
    }

    return title;
  } catch {
    // Fallback to first words of user message
    const words = firstMessage.trim().split(/\s+/).slice(0, MAX_WORDS).join(' ');
    return words.length > MAX_LENGTH ? words.substring(0, MAX_LENGTH).trim() : words || 'Chat';
  }
}

/**
 * Update thread title and slug
 * Single atomic update for both title and slug
 * Preserves original slug in previousSlug field for dual-slug routing support
 */
export async function updateThreadTitleAndSlug(
  threadId: string,
  newTitle: string,
): Promise<{ title: string; slug: string }> {
  const db = await getDbAsync();

  const currentThread = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.id, threadId),
    columns: { slug: true, previousSlug: true },
  });

  const newSlug = await generateUniqueSlug(newTitle);

  await db
    .update(tables.chatThread)
    .set({
      title: newTitle,
      slug: newSlug,
      previousSlug: currentThread?.previousSlug ?? currentThread?.slug ?? null,
      isAiGeneratedTitle: true,
      updatedAt: new Date(),
    })
    .where(eq(tables.chatThread.id, threadId));

  return { title: newTitle, slug: newSlug };
}

/**
 * Auto-generate and update thread title from first message
 * Should be called when the first message is sent in a thread
 */
export async function autoGenerateThreadTitle(
  threadId: string,
  firstMessage: string,
  env: ApiEnv['Bindings'],
): Promise<{ title: string; slug: string }> {
  const db = await getDbAsync();

  // Check if thread exists
  const thread = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.id, threadId),
  });

  if (!thread) {
    const context: ErrorContext = {
      errorType: 'resource',
      resource: 'chat_thread',
      resourceId: threadId,
    };
    throw createError.notFound('Thread not found', context);
  }

  // Only auto-generate if thread still has default "New Chat" title
  if (thread.title !== 'New Chat') {
    return { title: thread.title, slug: thread.slug };
  }

  // Generate title from message
  const generatedTitle = await generateTitleFromMessage(firstMessage, env);

  // Update thread with new title and slug
  return await updateThreadTitleAndSlug(threadId, generatedTitle);
}

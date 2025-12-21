/**
 * Title Generator Service
 *
 * ✅ CONSOLIDATED CONFIG: Title generation settings from lib/config/ai-defaults.ts
 * Auto-generates descriptive titles for chat threads using AI
 * Similar to ChatGPT's automatic title generation
 * Uses the first user message to create a concise, descriptive title
 */

import { eq } from 'drizzle-orm';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import { AIModels } from '@/api/core/ai-models';
import { MessagePartTypes, UIMessageRoles } from '@/api/core/enums';
import { TITLE_GENERATION_CONFIG } from '@/api/services/product-logic.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db';

import { initializeOpenRouter, openRouterService } from './openrouter.service';
import { generateUniqueSlug } from './slug-generator.service';

/**
 * Get the model for title generation
 * ✅ SINGLE SOURCE: Uses centralized constant from ai-models.ts
 * ✅ FIXED MODEL: Google Gemini 2.5 Flash for reliability
 * - Very fast response times (< 1 second)
 * - Cheap (cost-effective for high-volume operations)
 * - Smart enough for title generation
 * - Highly reliable and available
 */
function getTitleGenerationModel(): string {
  return AIModels.TITLE_GENERATION;
}

/**
 * Generate title from first user message
 * ✅ FIXED MODEL: Uses Google Gemini Flash 1.5 8B for reliable, fast title generation
 * ✅ RETRY LOGIC: Attempts up to 10 times before falling back
 */
export async function generateTitleFromMessage(
  firstMessage: string,
  env: ApiEnv['Bindings'],
): Promise<string> {
  // Initialize OpenRouter with API key
  initializeOpenRouter(env);

  // ✅ FIXED MODEL: Get reliable model for title generation
  const titleModel = getTitleGenerationModel();

  // ✅ RETRY LOOP: Try up to 10 times before falling back
  const MAX_ATTEMPTS = 10;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Using AI SDK v5 UIMessage format with consolidated config
      const result = await openRouterService.generateText({
        modelId: titleModel,
        messages: [
          {
            id: 'msg-title-gen',
            role: UIMessageRoles.USER,
            parts: [
              {
                type: MessagePartTypes.TEXT,
                text: firstMessage,
              },
            ],
          },
        ],
        system: TITLE_GENERATION_CONFIG.systemPrompt,
        temperature: TITLE_GENERATION_CONFIG.temperature,
        maxTokens: TITLE_GENERATION_CONFIG.maxTokens,
      });

      // Clean up the generated title
      let title = result.text.trim();

      // Remove quotes if AI added them
      title = title.replace(/^["']|["']$/g, '');

      // Enforce 5-word maximum constraint
      const words = title.split(/\s+/);
      if (words.length > 5) {
        title = words.slice(0, 5).join(' ');
      }

      // Limit to 50 characters max (5 words ~= 50 chars)
      if (title.length > 50) {
        title = title.substring(0, 50).trim();
      }

      // ✅ SUCCESS: Return title (no minimum length validation - accept any model response)

      return title;
    } catch {
      // If we've exhausted all attempts, break and use fallback
      if (attempt >= MAX_ATTEMPTS) {
        break;
      }

      // Delay before next retry (1 second)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // ✅ FALLBACK: Only reached if ALL 10 attempts failed

  // Extract first 5 words from message as fallback
  const words = firstMessage.trim().split(/\s+/).slice(0, 5).join(' ');
  const fallbackTitle = words.length > 50 ? words.substring(0, 50).trim() : words || 'Chat';

  return fallbackTitle;
}

/**
 * Update thread title and slug
 * Called after generating a title from the first message
 *
 * Single atomic update for both title and slug following backend-patterns.md.
 * Preserves original slug in previousSlug field for dual-slug routing support.
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

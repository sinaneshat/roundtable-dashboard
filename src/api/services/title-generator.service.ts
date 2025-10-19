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
import { TITLE_GENERATION_CONFIG } from '@/api/services/product-logic.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import { initializeOpenRouter, openRouterService } from './openrouter.service';
import { openRouterModelsService } from './openrouter-models.service';
import { generateUniqueSlug } from './slug-generator.service';

/**
 * Get the best model for title generation
 * ✅ FULLY DYNAMIC: Selects fastest available model from OpenRouter API
 * Prioritizes speed over cost for low-latency title generation
 * No hard-coded model preferences
 */
async function getTitleGenerationModel(): Promise<string> {
  // ✅ DYNAMIC MODEL SELECTION: Get fastest available model for title generation
  // Title generation is latency-sensitive, so we prioritize speed over cost
  const fastestModel = await openRouterModelsService.getFastestAvailableModel();

  if (!fastestModel) {
    throw new Error('No models available for title generation');
  }

  return fastestModel.id;
}

/**
 * Generate title from first user message
 * ✅ FULLY DYNAMIC: Uses fastest available model from OpenRouter API for low-latency response
 */
export async function generateTitleFromMessage(
  firstMessage: string,
  env: ApiEnv['Bindings'],
): Promise<string> {
  try {
    console.warn('[generateTitleFromMessage] 🎯 Starting title generation', {
      messagePreview: firstMessage.substring(0, 100),
      messageLength: firstMessage.length,
    });

    // Initialize OpenRouter with API key
    initializeOpenRouter(env);

    // ✅ DYNAMIC MODEL SELECTION: Get best model for title generation
    const titleModel = await getTitleGenerationModel();

    console.warn('[generateTitleFromMessage] 🤖 Using model for title generation', {
      modelId: titleModel,
    });

    // Using AI SDK v5 UIMessage format with consolidated config
    const result = await openRouterService.generateText({
      modelId: titleModel,
      messages: [
        {
          id: 'msg-title-gen',
          role: 'user',
          parts: [
            {
              type: 'text',
              text: firstMessage,
            },
          ],
        },
      ],
      system: TITLE_GENERATION_CONFIG.systemPrompt,
      temperature: TITLE_GENERATION_CONFIG.temperature,
      maxTokens: TITLE_GENERATION_CONFIG.maxTokens,
    });

    console.warn('[generateTitleFromMessage] ✅ Raw title generated from model', {
      rawTitle: result.text,
      rawLength: result.text.length,
    });

    // Clean up the generated title
    let title = result.text.trim();

    // Remove quotes if AI added them
    title = title.replace(/^["']|["']$/g, '');

    // Enforce 5-word maximum constraint
    const words = title.split(/\s+/);
    if (words.length > 5) {
      title = words.slice(0, 5).join(' ');
      console.warn('[generateTitleFromMessage] ✂️ Truncated to 5 words', {
        originalWords: words.length,
        truncatedTitle: title,
      });
    }

    // Limit to 50 characters max (5 words ~= 50 chars)
    if (title.length > 50) {
      title = title.substring(0, 50).trim();
      console.warn('[generateTitleFromMessage] ✂️ Truncated to 50 characters', {
        truncatedTitle: title,
      });
    }

    // ✅ FIX: If title is empty or very short, use first few words of message
    // NO "New Chat" fallback - always ensure slug will be unique and change
    if (title.length < 3) {
      // Extract first 5 words from the user's message
      const messageWords = firstMessage.trim().split(/\s+/).slice(0, 5).join(' ');
      title = messageWords.length > 0 && messageWords.length <= 50
        ? messageWords
        : messageWords.substring(0, 50).trim() || 'Chat';

      console.warn('[generateTitleFromMessage] ⚠️ Title too short, using message excerpt', {
        shortTitle: title,
        originalMessage: firstMessage.substring(0, 100),
        extractedTitle: title,
      });
    }

    console.warn('[generateTitleFromMessage] 🎉 Final title generated', {
      finalTitle: title,
      finalLength: title.length,
      wordCount: title.split(/\s+/).length,
    });

    return title;
  } catch (error) {
    console.error('[generateTitleFromMessage] ❌ Title generation failed, using fallback', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // ✅ FIX: Fallback uses first 5 words of message - NO "New Chat"
    // This ensures slug will always be unique and change
    const words = firstMessage.trim().split(/\s+/).slice(0, 5).join(' ');
    const fallbackTitle = words.length > 50 ? words.substring(0, 50).trim() : words || 'Chat';

    console.warn('[generateTitleFromMessage] 📝 Using fallback title from message', {
      fallbackTitle,
      originalMessage: firstMessage.substring(0, 100),
    });

    return fallbackTitle;
  }
}

/**
 * Update thread title and slug
 * Called after generating a title from the first message
 *
 * ✅ OPTIMIZED: Single atomic update for both title and slug
 * Following backend-patterns.md - Combine related updates into single operation
 */
export async function updateThreadTitleAndSlug(
  threadId: string,
  newTitle: string,
): Promise<{ title: string; slug: string }> {
  const db = await getDbAsync();

  // Generate new slug from title (without DB update)
  const newSlug = await generateUniqueSlug(newTitle);

  // ✅ SINGLE ATOMIC UPDATE: Both title and slug in one operation
  await db
    .update(tables.chatThread)
    .set({
      title: newTitle,
      slug: newSlug,
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

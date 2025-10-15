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
 * ✅ FULLY DYNAMIC: Selects cheapest available model from OpenRouter API
 * No hard-coded model preferences
 */
async function getTitleGenerationModel(): Promise<string> {
  // ✅ DYNAMIC MODEL SELECTION: Get cheapest available model for title generation
  const cheapestModel = await openRouterModelsService.getCheapestAvailableModel();

  if (!cheapestModel) {
    throw new Error('No models available for title generation');
  }

  return cheapestModel.id;
}

/**
 * Generate title from first user message
 * ✅ FULLY DYNAMIC: Uses cheapest available model from OpenRouter API
 */
export async function generateTitleFromMessage(
  firstMessage: string,
  env: ApiEnv['Bindings'],
): Promise<string> {
  try {
    // Initialize OpenRouter with API key
    initializeOpenRouter(env);

    // ✅ DYNAMIC MODEL SELECTION: Get best model for title generation
    const titleModel = await getTitleGenerationModel();

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

    // If title is empty or too short, use fallback
    if (title.length < 3) {
      title = 'New Chat';
    }

    return title;
  } catch {
    // Fallback: Use first 5 words of message (enforcing 5-word constraint)
    const words = firstMessage.split(/\s+/).slice(0, 5).join(' ');
    return words.length > 50 ? words.substring(0, 50).trim() : words || 'New Chat';
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

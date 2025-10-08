/**
 * Title Generator Service
 *
 * Auto-generates descriptive titles for chat threads using AI
 * Similar to ChatGPT's automatic title generation
 * Uses the first user message to create a concise, descriptive title
 */

import { eq } from 'drizzle-orm';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import { apiLogger } from '@/api/middleware/hono-logger';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import { AI_MODELS, AllowedModelId } from '@/lib/ai/models-config';

import { initializeOpenRouter, openRouterService } from './openrouter.service';
import { updateThreadSlug } from './slug-generator.service';

/**
 * System prompt for title generation
 * Ultra-short and simple for fastest, cheapest title generation
 */
const TITLE_GENERATION_PROMPT = `Generate a 5-word title from this message. Title only, no quotes.`;

/**
 * Get the best model for title generation
 * Prioritizes fast, cost-effective models from the configuration
 * ✅ Uses AllowedModelId enum for type safety
 */
function getTitleGenerationModel(): string {
  // Priority order: cheapest/fastest models first (from AI_MODELS config)
  const preferredModels = [
    AllowedModelId.GEMINI_2_5_FLASH, // $0.075/Mtok - ultra cheap
    AllowedModelId.CLAUDE_3_HAIKU, // $0.25/Mtok - fast and cheap
    AllowedModelId.DEEPSEEK_R1_FREE, // FREE - reasoning model
    AllowedModelId.CLAUDE_SONNET_4_5, // Fallback to premium model
  ];

  // Find first available enabled model from preferences
  for (const modelId of preferredModels) {
    const model = AI_MODELS.find(m => m.modelId === modelId && m.isEnabled);
    if (model) {
      return model.modelId;
    }
  }

  // Final fallback: use first enabled model
  const firstEnabled = AI_MODELS.find(m => m.isEnabled);
  if (!firstEnabled) {
    throw new Error('No enabled models found in configuration');
  }

  return firstEnabled.modelId;
}

/**
 * Generate title from first user message
 * Uses the most cost-effective model from configuration
 */
export async function generateTitleFromMessage(
  firstMessage: string,
  env: ApiEnv['Bindings'],
): Promise<string> {
  try {
    // Initialize OpenRouter with API key
    initializeOpenRouter(env);

    // Get best model for title generation from configuration
    const titleModel = getTitleGenerationModel();

    // Using AI SDK v5 UIMessage format
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
      system: TITLE_GENERATION_PROMPT,
      temperature: 0.3, // Lower temperature for more predictable, concise output
      maxTokens: 15, // Very low limit: ~5 words at ~3 tokens/word
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
  } catch (error) {
    apiLogger.error('Title generation failed, using fallback', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Fallback: Use first 5 words of message (enforcing 5-word constraint)
    const words = firstMessage.split(/\s+/).slice(0, 5).join(' ');
    return words.length > 50 ? words.substring(0, 50).trim() : words || 'New Chat';
  }
}

/**
 * Update thread title and slug
 * Called after generating a title from the first message
 */
export async function updateThreadTitleAndSlug(
  threadId: string,
  newTitle: string,
): Promise<{ title: string; slug: string }> {
  const db = await getDbAsync();

  // Generate new slug from title
  const newSlug = await updateThreadSlug(threadId, newTitle);

  // Update title in database (slug already updated by updateThreadSlug)
  await db
    .update(tables.chatThread)
    .set({
      title: newTitle,
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

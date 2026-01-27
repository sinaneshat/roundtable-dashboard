/**
 * Title Generator Service
 *
 * Auto-generates descriptive titles for chat threads using AI
 * Similar to ChatGPT's automatic title generation
 * Uses the first user message to create a concise, descriptive title
 */

import { CreditActions, MessagePartTypes, UIMessageRoles } from '@roundtable/shared/enums';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/common/error-handling';
import type { BillingContext } from '@/common/schemas/billing-context';
import type { ErrorContext } from '@/core';
import { TITLE_GENERATION_MODEL_ID } from '@/core/ai-models';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import { finalizeCredits, TITLE_GENERATION_CONFIG } from '@/services/billing';
import {
  extractModelPricing,
  generateTraceId,
  trackLLMGeneration,
} from '@/services/errors/posthog-llm-tracking.service';
import { getModelById, initializeOpenRouter, openRouterService } from '@/services/models';
import type { ApiEnv } from '@/types';

import { generateUniqueSlug } from './slug-generator.service';

// ✅ SINGLE SOURCE OF TRUTH: Use BillingContext from @/api/services/billing

/**
 * Generate title from first user message
 * Uses Google Gemini 2.0 Flash for fast, reliable title generation
 * Single attempt - falls back to truncated message on failure
 *
 * @param firstMessage - The user's first message to generate title from
 * @param env - API environment bindings
 * @param billingContext - Optional billing context for credit deduction
 */
export async function generateTitleFromMessage(
  firstMessage: string,
  env: ApiEnv['Bindings'],
  billingContext?: BillingContext,
): Promise<string> {
  initializeOpenRouter(env);

  const MAX_WORDS = 5;
  const MAX_LENGTH = 50;

  // Single attempt - no retry delays. If it fails, use fallback immediately.
  const startTime = performance.now();
  const traceId = generateTraceId();

  try {
    const result = await openRouterService.generateText({
      maxTokens: TITLE_GENERATION_CONFIG.maxTokens,
      messages: [
        {
          id: 'msg-title-gen',
          parts: [{ text: firstMessage, type: MessagePartTypes.TEXT }],
          role: UIMessageRoles.USER,
        },
      ],
      modelId: TITLE_GENERATION_MODEL_ID,
      system: TITLE_GENERATION_CONFIG.systemPrompt,
      temperature: TITLE_GENERATION_CONFIG.temperature,
    });

    // Track title generation for PostHog analytics
    const modelConfig = getModelById(TITLE_GENERATION_MODEL_ID);
    const modelPricing = extractModelPricing(modelConfig);
    trackLLMGeneration(
      {
        modelId: TITLE_GENERATION_MODEL_ID,
        modelName: modelConfig?.name || TITLE_GENERATION_MODEL_ID,
        participantId: 'system',
        participantIndex: 0,
        roundNumber: 0,
        threadId: billingContext?.threadId || 'system',
        threadMode: 'title_generation',
        userId: billingContext?.userId || 'system',
      },
      result,
      [{ content: firstMessage, role: UIMessageRoles.USER }],
      traceId,
      startTime,
      {
        additionalProperties: {
          operation_type: 'title_generation',
        },
        modelConfig: {
          maxTokens: TITLE_GENERATION_CONFIG.maxTokens,
          temperature: TITLE_GENERATION_CONFIG.temperature,
        },
        modelPricing,
      },
    ).catch(() => {}); // Fire and forget

    let title = result.text.trim().replace(/^["']|["']$/g, '');

    const words = title.split(/\s+/);
    if (words.length > MAX_WORDS) {
      title = words.slice(0, MAX_WORDS).join(' ');
    }

    if (title.length > MAX_LENGTH) {
      title = title.substring(0, MAX_LENGTH).trim();
    }

    // ✅ BILLING: Deduct credits for title generation AI call
    if (billingContext && result.usage) {
      const rawInput = result.usage.inputTokens ?? 0;
      const rawOutput = result.usage.outputTokens ?? 0;
      const safeInputTokens = Number.isFinite(rawInput) ? rawInput : 0;
      const safeOutputTokens = Number.isFinite(rawOutput) ? rawOutput : 0;

      // Only deduct if we actually used tokens
      if (safeInputTokens > 0 || safeOutputTokens > 0) {
        try {
          await finalizeCredits(billingContext.userId, `title-gen-${ulid()}`, {
            action: CreditActions.AI_RESPONSE,
            inputTokens: safeInputTokens,
            modelId: TITLE_GENERATION_MODEL_ID,
            outputTokens: safeOutputTokens,
            threadId: billingContext.threadId,
          });
        } catch (billingError) {
          // Don't fail title generation if billing fails - log and continue
          console.error('[TitleGenerator] Billing failed:', billingError);
        }
      }
    }

    return title;
  } catch (error) {
    console.error('[TitleGenerator] AI generation failed, using fallback:', error);
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
    columns: { previousSlug: true, slug: true },
    where: eq(tables.chatThread.id, threadId),
  });

  const newSlug = await generateUniqueSlug(newTitle);

  await db
    .update(tables.chatThread)
    .set({
      isAiGeneratedTitle: true,
      previousSlug: currentThread?.previousSlug ?? currentThread?.slug ?? null,
      slug: newSlug,
      title: newTitle,
      updatedAt: new Date(),
    })
    .where(eq(tables.chatThread.id, threadId));

  return { slug: newSlug, title: newTitle };
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
    return { slug: thread.slug, title: thread.title };
  }

  // Generate title from message
  const generatedTitle = await generateTitleFromMessage(firstMessage, env);

  // Update thread with new title and slug
  return await updateThreadTitleAndSlug(threadId, generatedTitle);
}

/**
 * Analyze Handler - Auto Mode Prompt Analysis (Streaming)
 *
 * ✅ STREAMING: Uses streamText with Output.object() for gradual config streaming
 * ✅ PATTERN: Follows pre-search.handler.ts SSE streaming architecture
 *
 * Analyzes user prompts and streams optimal configuration:
 * - Participant models based on user's tier and prompt complexity
 * - Roles for each participant (Ideator, Strategist, Analyst, Builder, Critic)
 * - Chat mode (BRAINSTORMING, ANALYZING, DEBATING, etc.)
 * - Web search enabled/disabled
 *
 * Used by Auto Mode feature for intelligent chat setup.
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { Output, streamText } from 'ai';
import { streamSSE } from 'hono/streaming';
import { ulid } from 'ulid';
import { z } from 'zod';

import { createHandler } from '@/api/core';
import { PROMPT_ANALYSIS_MODEL_ID } from '@/api/core/ai-models';
import type { ChatMode } from '@/api/core/enums';
import {
  AnalyzePromptSseEvents,
  ChatModes,
  ChatModeSchema,
  CreditActions,
  DEFAULT_CHAT_MODE,
  SHORT_ROLE_NAMES,
  ShortRoleNameSchema,
  SubscriptionTiers,
} from '@/api/core/enums';
import {
  canAccessModelByPricing,
  checkFreeUserHasCompletedRound,
  enforceCredits,
  finalizeCredits,
  MAX_MODELS_BY_TIER,
} from '@/api/services/billing';
import { HARDCODED_MODELS, initializeOpenRouter, openRouterService } from '@/api/services/models';
import type { AnalyzeModelInfo } from '@/api/services/prompts';
import { buildAnalyzeSystemPrompt } from '@/api/services/prompts';
import { getUserTier } from '@/api/services/usage';
import type { ApiEnv } from '@/api/types';
import { MIN_PARTICIPANTS_REQUIRED } from '@/lib/config';
import { AUTO_MODE_FALLBACK_CONFIG } from '@/stores/chat/store-defaults';

import type { analyzePromptRoute } from '../route';
import type { AnalyzePromptPayload, RecommendedParticipant } from '../schema';
import { AnalyzePromptRequestSchema } from '../schema';

// ============================================================================
// Constants
// ============================================================================

const ANALYSIS_TEMPERATURE = 0.3;

// ============================================================================
// Zod Schema for AI Structured Output
// ============================================================================

const AIAnalysisOutputSchema = z.object({
  participants: z.array(z.object({
    modelId: z.string(),
    role: z.string().nullable(),
  })).min(MIN_PARTICIPANTS_REQUIRED).max(12), // Max (12) matches MAX_PARTICIPANTS_LIMIT from product-logic.service.ts
  mode: z.string(),
  enableWebSearch: z.boolean(),
});

// ============================================================================
// Model Info Helper
// ============================================================================

function getModelInfo(accessibleModelIds: string[]): AnalyzeModelInfo[] {
  return HARDCODED_MODELS
    .filter(m => accessibleModelIds.includes(m.id))
    .map(m => ({
      id: m.id,
      name: m.name,
      description: m.description || '',
      isReasoning: m.is_reasoning_model,
      hasVision: m.supports_vision,
    }));
}

// ============================================================================
// Validation Helpers
// ============================================================================

// Type for partial object from AI SDK streaming (handles undefined values)
type PartialAnalysisConfig = {
  participants?: Array<{ modelId?: string; role?: string | null } | undefined>;
  mode?: string;
  enableWebSearch?: boolean;
};

/**
 * Type guard for ShortRoleName validation using Zod schema
 */
function isValidShortRoleName(role: string | null | undefined): role is (typeof SHORT_ROLE_NAMES)[number] {
  if (!role)
    return false;
  return ShortRoleNameSchema.safeParse(role).success;
}

/**
 * Type guard for ChatMode validation using Zod schema
 */
function isValidChatMode(mode: string | undefined): mode is ChatMode {
  if (!mode)
    return false;
  return ChatModeSchema.safeParse(mode).success;
}

function validateAndCleanConfig(
  partial: PartialAnalysisConfig,
  accessibleModelIds: string[],
  maxModels: number,
): AnalyzePromptPayload | null {
  // Need at least participants to be valid
  if (!partial.participants || partial.participants.length === 0) {
    return null;
  }

  // Validate and filter participants
  const validParticipants: RecommendedParticipant[] = [];

  for (const p of partial.participants) {
    if (!p || !p.modelId)
      continue;
    if (!accessibleModelIds.includes(p.modelId))
      continue;
    if (validParticipants.length >= maxModels)
      break;

    // Type guard narrows p.role to valid ShortRoleName or returns null
    const validatedRole = isValidShortRoleName(p.role) ? p.role : null;

    validParticipants.push({
      modelId: p.modelId,
      role: validatedRole,
    });
  }

  // Need at least MIN_PARTICIPANTS_REQUIRED valid participants for multi-perspective value
  if (validParticipants.length < MIN_PARTICIPANTS_REQUIRED) {
    return null;
  }

  // Type guard narrows partial.mode to ChatMode or uses default
  const validatedMode = isValidChatMode(partial.mode) ? partial.mode : DEFAULT_CHAT_MODE;

  return {
    participants: validParticipants,
    mode: validatedMode,
    enableWebSearch: partial.enableWebSearch ?? false,
  };
}

// ============================================================================
// Handler
// ============================================================================

export const analyzePromptHandler: RouteHandler<typeof analyzePromptRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: AnalyzePromptRequestSchema,
    operationName: 'analyzePrompt',
  },
  async (c) => {
    const { user } = c.auth();
    const { prompt, hasImageFiles, hasDocumentFiles, hasVisualFiles } = c.validated.body;

    // ✅ GRANULAR: Derive flags - use new granular flags, fallback to legacy hasVisualFiles
    // Legacy clients sending hasVisualFiles=true will filter for both vision AND file support
    const requiresVision = hasImageFiles || hasVisualFiles;
    const requiresFile = hasDocumentFiles || hasVisualFiles; // PDFs were grouped with visual files

    // Get user tier and model limits
    const userTier = await getUserTier(user.id);
    const maxModels = MAX_MODELS_BY_TIER[userTier];

    // Free users get 1 free round - skip credit enforcement if they haven't used it yet
    const isFreeUser = userTier === SubscriptionTiers.FREE;
    const freeRoundUsed = isFreeUser ? await checkFreeUserHasCompletedRound(user.id) : false;

    // ✅ BILLING: Enforce credits before AI call (actual deduction happens after with real token count)
    // Only enforce if user is paid OR has already used their free round
    const shouldBill = !isFreeUser || freeRoundUsed;
    if (shouldBill) {
      await enforceCredits(user.id, 1, { skipRoundCheck: true });
    }

    // Filter models accessible to user's tier
    let accessibleModels = HARDCODED_MODELS.filter(
      model => canAccessModelByPricing(userTier, model),
    );

    // ✅ GRANULAR FILTERING: Filter by both image and document capabilities
    if (requiresVision) {
      accessibleModels = accessibleModels.filter(model => model.supports_vision);
    }
    if (requiresFile) {
      accessibleModels = accessibleModels.filter(model => model.supports_file);
    }

    const accessibleModelIds = accessibleModels.map(m => m.id);

    // Build system prompt with user's accessible options
    // ✅ SINGLE SOURCE: Uses buildAnalyzeSystemPrompt from prompts.service.ts
    const models = getModelInfo(accessibleModelIds);
    const hasAnyVisualFiles = requiresVision || requiresFile;
    const systemPrompt = buildAnalyzeSystemPrompt(
      models,
      maxModels,
      MIN_PARTICIPANTS_REQUIRED,
      SHORT_ROLE_NAMES,
      Object.values(ChatModes),
      hasAnyVisualFiles,
      MAX_MODELS_BY_TIER[SubscriptionTiers.FREE],
    );

    // ✅ STREAMING: Return SSE stream for gradual config updates
    return streamSSE(c, async (stream) => {
      const startTime = performance.now();

      // Helper for sending SSE events
      const writeSSE = async (event: string, data: string) => {
        await stream.writeSSE({ event, data });
      };

      try {
        // Send start event
        await writeSSE(AnalyzePromptSseEvents.START, JSON.stringify({
          timestamp: Date.now(),
          prompt: prompt.substring(0, 100),
        }));

        // Initialize OpenRouter
        initializeOpenRouter(c.env);
        const client = openRouterService.getClient();

        // ✅ STREAM: Use streamText with Output.object() for structured output
        const analysisStream = streamText({
          model: client.chat(PROMPT_ANALYSIS_MODEL_ID),
          output: Output.object({ schema: AIAnalysisOutputSchema }),
          system: systemPrompt,
          prompt,
          temperature: ANALYSIS_TEMPERATURE,
        });

        // Track best partial result for fallback
        let bestConfig: AnalyzePromptPayload | null = null;
        let lastSentConfig: string | null = null;

        // ✅ INCREMENTAL STREAMING: Stream partial configs as they're generated
        try {
          for await (const partialResult of analysisStream.partialOutputStream) {
            const validated = validateAndCleanConfig(
              partialResult,
              accessibleModelIds,
              maxModels,
            );

            if (validated) {
              bestConfig = validated;
              const configJson = JSON.stringify(validated);

              // Only send if config changed
              if (configJson !== lastSentConfig) {
                lastSentConfig = configJson;
                await writeSSE(AnalyzePromptSseEvents.CONFIG, JSON.stringify({
                  timestamp: Date.now(),
                  config: validated,
                  partial: true,
                }));
              }
            }
          }
        } catch (streamErr) {
          console.error('[Analyze] Streaming error:', streamErr);
        }

        // ✅ FINAL: Get complete output
        let finalConfig: AnalyzePromptPayload;
        try {
          const finalOutput = await analysisStream.output;
          const validated = validateAndCleanConfig(
            finalOutput,
            accessibleModelIds,
            maxModels,
          );
          finalConfig = validated ?? bestConfig ?? AUTO_MODE_FALLBACK_CONFIG;
        } catch {
          // Use best partial or fallback
          finalConfig = bestConfig ?? AUTO_MODE_FALLBACK_CONFIG;
        }

        // ✅ BILLING: Deduct credits based on actual token usage (not fixed cost)
        if (shouldBill) {
          try {
            const usage = await analysisStream.usage;
            if (usage) {
              const rawInput = usage.inputTokens ?? 0;
              const rawOutput = usage.outputTokens ?? 0;
              const safeInputTokens = Number.isFinite(rawInput) ? rawInput : 0;
              const safeOutputTokens = Number.isFinite(rawOutput) ? rawOutput : 0;
              if (safeInputTokens > 0 || safeOutputTokens > 0) {
                c.executionCtx.waitUntil(
                  finalizeCredits(user.id, `analyze-prompt-${ulid()}`, {
                    inputTokens: safeInputTokens,
                    outputTokens: safeOutputTokens,
                    action: CreditActions.AI_RESPONSE,
                    modelId: PROMPT_ANALYSIS_MODEL_ID,
                  }),
                );
              }
            }
          } catch (billingError) {
            console.error('[Analyze] Billing failed:', billingError);
          }
        }

        // Send final done event with complete config
        await writeSSE(AnalyzePromptSseEvents.DONE, JSON.stringify({
          timestamp: Date.now(),
          config: finalConfig,
          duration: performance.now() - startTime,
        }));
      } catch (error) {
        console.error('[Analyze] Handler error:', error);

        // Send error event with fallback config
        await writeSSE(AnalyzePromptSseEvents.FAILED, JSON.stringify({
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : 'Analysis failed',
          config: AUTO_MODE_FALLBACK_CONFIG,
        }));
      }
    });
  },
);

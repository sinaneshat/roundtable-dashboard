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
import { z } from 'zod';

import { createHandler } from '@/api/core';
import { PROMPT_ANALYSIS_MODEL_ID } from '@/api/core/ai-models';
import type { ChatMode } from '@/api/core/enums';
import {
  AnalyzePromptSseEvents,
  ChatModes,
  ChatModeSchema,
  DEFAULT_CHAT_MODE,
  SHORT_ROLE_NAMES,
  ShortRoleNameSchema,
  SubscriptionTiers,
} from '@/api/core/enums';
import {
  canAccessModelByPricing,
  checkFreeUserHasCompletedRound,
  deductCreditsForAction,
  MAX_MODELS_BY_TIER,
} from '@/api/services/billing';
import { HARDCODED_MODELS, initializeOpenRouter, openRouterService } from '@/api/services/models';
import { getUserTier } from '@/api/services/usage';
import type { ApiEnv } from '@/api/types';

import type { analyzePromptRoute } from '../route';
import type { AnalyzePromptPayload, RecommendedParticipant } from '../schema';
import { AnalyzePromptRequestSchema } from '../schema';

// ============================================================================
// Constants
// ============================================================================

const FALLBACK_CONFIG: AnalyzePromptPayload = {
  participants: [{ modelId: 'google/gemini-2.5-flash', role: null }],
  mode: DEFAULT_CHAT_MODE,
  enableWebSearch: false,
};

const ANALYSIS_TEMPERATURE = 0.3;

// ============================================================================
// Zod Schema for AI Structured Output
// ============================================================================

const AIAnalysisOutputSchema = z.object({
  participants: z.array(z.object({
    modelId: z.string(),
    role: z.string().nullable(),
  })).min(1).max(12),
  mode: z.string(),
  enableWebSearch: z.boolean(),
});

// ============================================================================
// Model Info for Prompt
// ============================================================================

type ModelInfo = {
  id: string;
  name: string;
  description: string;
  isReasoning: boolean;
  hasVision: boolean;
};

function getModelInfo(accessibleModelIds: string[]): ModelInfo[] {
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
// System Prompt
// ============================================================================

function buildAnalysisSystemPrompt(
  accessibleModelIds: string[],
  maxModels: number,
  roleNames: readonly string[],
  chatModes: string[],
): string {
  const models = getModelInfo(accessibleModelIds);

  const modelList = models.map((m) => {
    const tags: string[] = [];
    if (m.isReasoning)
      tags.push('reasoning');
    if (m.hasVision)
      tags.push('vision');
    const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
    return `- ${m.id}: ${m.description}${tagStr}`;
  }).join('\n');

  return `You are an expert AI orchestrator that analyzes user prompts and configures optimal multi-model chat sessions. Your goal is to maximize response quality by intelligently selecting models, assigning roles, choosing the right conversation mode, and deciding whether web search would help.

## YOUR TASK
Analyze the user's prompt deeply. Consider:
1. What is the user trying to accomplish?
2. What type of thinking is required (creative, analytical, critical, practical)?
3. Would multiple perspectives improve the outcome?
4. Does this need current/real-time information?

Return a JSON configuration that will produce the BEST possible response.

## AVAILABLE MODELS (use exact IDs)
${modelList}

## AVAILABLE ROLES (use exactly as written, or null)
${roleNames.map(r => `- ${r}`).join('\n')}

## AVAILABLE MODES (use exactly as written)
${chatModes.map(m => `- ${m}`).join('\n')}

## CONFIGURATION LIMITS
- Maximum participants: ${maxModels}
- Minimum participants: 1

---

## DECISION FRAMEWORK

### STEP 1: Determine Complexity & Participant Count

**Use 1 model (no role) when:**
- Simple factual questions ("What is X?", "How do I Y?")
- Straightforward tasks with clear answers
- Quick lookups or definitions
- Casual conversation

**Use 2 models with roles when:**
- Questions that benefit from different angles
- Moderate complexity requiring validation
- Tasks where creativity + critique helps
- Comparisons or evaluations

**Use 3+ models with diverse roles when:**
- Complex problems requiring deep analysis
- Important decisions needing multiple perspectives
- Creative projects benefiting from ideation + building + critique
- Debates, comparisons of approaches, or thorough evaluations
- Research requiring comprehensive coverage

### STEP 2: Select Models Strategically

**Match model strengths to task needs:**
- **Reasoning models** (marked [reasoning]): Complex logic, math, step-by-step analysis, coding problems, deep thinking
- **Vision models** (marked [vision]): When user might share images, visual tasks, or UI/design discussions
- **Fast models** (Flash, Mini, Nano): Quick responses, simpler tasks, brainstorming quantity
- **Deep thinkers** (R1, reasoning models): Quality over speed, complex analysis

**Create synergy with model diversity:**
- Pair creative models with analytical ones
- Mix fast models (quantity of ideas) with deep thinkers (quality refinement)
- Use different providers for varied perspectives (OpenAI + Google + DeepSeek)

### STEP 3: Assign Roles Purposefully

**CRITICAL: Roles shape HOW models respond. Assign thoughtfully!**

- **Ideator**: Assign for creative generation, brainstorming, exploring possibilities, "what if" thinking. Best for open-ended prompts seeking new ideas.

- **Strategist**: Assign for planning, decision frameworks, weighing options, roadmapping. Best when user needs to make choices or plan ahead.

- **Analyst**: Assign for breaking down problems, data interpretation, technical deep-dives, research synthesis. Best for understanding complex topics.

- **Builder**: Assign for implementation, coding, practical solutions, step-by-step instructions. Best when user needs actionable output they can use.

- **Critic**: Assign for evaluation, finding flaws, playing devil's advocate, quality assurance. Best paired with other roles to refine ideas.

- **null (no role)**: Use for simple queries where role-specific thinking isn't needed, or when you want the model's natural balanced response.

**Role Combinations That Work Well:**
- Ideator + Critic = Generate ideas then refine them
- Analyst + Builder = Understand problem then solve it
- Strategist + Critic = Plan then stress-test the plan
- Ideator + Analyst + Builder = Full creative-to-implementation pipeline
- Multiple Analysts = Deep comprehensive research

### STEP 4: Choose the Right Mode

**Mode sets the conversation's collaborative style:**

- **brainstorming**: Use when seeking creative ideas, exploring options, divergent thinking. Models will build on each other's ideas generously.

- **analyzing**: Use for technical breakdowns, understanding systems, interpreting data, research. Models will be thorough and precise.

- **debating**: Use when comparing options, exploring trade-offs, or when the user needs to see multiple sides of an argument. Models will respectfully challenge each other.

- **researching**: Use for fact-finding, comprehensive topic exploration, or when the user needs thorough information gathering.

- **creating**: Use when the goal is producing something: writing, code, designs, content. Models collaborate to build the output.

- **planning**: Use for roadmaps, project planning, strategy development, goal-setting. Models will be structured and action-oriented.

### STEP 5: Decide on Web Search

**Enable web search when:**
- User asks about current events, news, recent developments
- Question involves specific dates, prices, statistics that change
- User needs real-time information (weather, stocks, sports scores)
- Researching recent products, services, or technologies
- Fact-checking claims about current state of the world
- Questions containing "latest", "current", "recent", "now", "today", "2024", "2025"

**Disable web search when:**
- Creative writing, brainstorming, ideation
- Coding and programming tasks
- Conceptual or theoretical discussions
- Personal advice or opinion-based questions
- Tasks involving user-provided content only
- General knowledge that doesn't change frequently
- Math, logic, or reasoning puzzles

---

## OUTPUT FORMAT

Return valid JSON:
{
  "participants": [
    { "modelId": "exact-model-id", "role": "Role" | null }
  ],
  "mode": "mode-name",
  "enableWebSearch": true | false
}

Think carefully. Your configuration directly impacts the quality of help the user receives.`;
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

  // Need at least one valid participant
  if (validParticipants.length === 0) {
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
    const { prompt } = c.validated.body;

    // Get user tier and model limits
    const userTier = await getUserTier(user.id);
    const maxModels = MAX_MODELS_BY_TIER[userTier];

    // Free users get 1 free round - skip credit deduction if they haven't used it yet
    const isFreeUser = userTier === SubscriptionTiers.FREE;
    const freeRoundUsed = isFreeUser ? await checkFreeUserHasCompletedRound(user.id) : false;

    // Only deduct credits if user is paid OR has already used their free round
    if (!isFreeUser || freeRoundUsed) {
      await deductCreditsForAction(user.id, 'autoModeAnalysis', {
        description: 'Auto mode prompt analysis',
      });
    }

    // Filter models accessible to user's tier
    const accessibleModels = HARDCODED_MODELS.filter(
      model => canAccessModelByPricing(userTier, model),
    );
    const accessibleModelIds = accessibleModels.map(m => m.id);

    // Build system prompt with user's accessible options
    const systemPrompt = buildAnalysisSystemPrompt(
      accessibleModelIds,
      maxModels,
      SHORT_ROLE_NAMES,
      Object.values(ChatModes),
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
          finalConfig = validated ?? bestConfig ?? FALLBACK_CONFIG;
        } catch {
          // Use best partial or fallback
          finalConfig = bestConfig ?? FALLBACK_CONFIG;
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
          config: FALLBACK_CONFIG,
        }));
      }
    });
  },
);

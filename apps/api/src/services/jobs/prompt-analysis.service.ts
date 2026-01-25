/**
 * Prompt Analysis Service for Automated Jobs
 *
 * Analyzes prompts to determine optimal configuration for automated conversations.
 * Similar to auto mode but designed for server-side job execution without streaming.
 *
 * Determines:
 * - Model selection (2-3 diverse models)
 * - Conversation mode (brainstorming, debating, analyzing, etc.)
 * - Web search enablement (when current events/data needed)
 */

import type { ChatMode } from '@roundtable/shared/enums';
import { ChatModes, ChatModeSchema, DEFAULT_CHAT_MODE, SHORT_ROLE_NAMES, ShortRoleNameSchema } from '@roundtable/shared/enums';
import { z } from 'zod';

import { PROMPT_ANALYSIS_MODEL_ID } from '@/core/ai-models';
import { MIN_PARTICIPANTS_REQUIRED } from '@/lib/config';
import { AI_TIMEOUT_CONFIG, MAX_MODELS_BY_TIER } from '@/services/billing';
import type { AnalyzeModelInfo } from '@/services/prompts';
import { buildAnalyzeSystemPrompt } from '@/services/prompts';
import type { ApiEnv } from '@/types';

import { HARDCODED_MODELS, initializeOpenRouter, openRouterService } from '../models';

// Lazy load AI SDK
let aiSdkModule: typeof import('ai') | null = null;

async function getAiSdk() {
  if (!aiSdkModule) {
    aiSdkModule = await import('ai');
  }
  return aiSdkModule;
}

// Schema for AI structured output
const AIAnalysisOutputSchema = z.object({
  participants: z.array(z.object({
    modelId: z.string(),
    role: z.string().nullable(),
  })).min(MIN_PARTICIPANTS_REQUIRED).max(5),
  mode: z.string(),
  enableWebSearch: z.boolean(),
});

// Default/fallback config
const DEFAULT_JOB_CONFIG = {
  modelIds: ['google/gemini-2.5-flash', 'anthropic/claude-sonnet-4.5', 'openai/gpt-5.1'],
  participants: [
    { modelId: 'google/gemini-2.5-flash', role: 'Analyst' as const },
    { modelId: 'anthropic/claude-sonnet-4.5', role: 'Strategist' as const },
    { modelId: 'openai/gpt-5.1', role: 'Critic' as const },
  ],
  mode: 'brainstorming' as ChatMode,
  enableWebSearch: false,
  reasoning: 'Default configuration: diverse model selection for balanced perspectives.',
};

export type JobPromptAnalysisResult = {
  modelIds: string[];
  participants: Array<{ modelId: string; role: string | null }>;
  mode: ChatMode;
  enableWebSearch: boolean;
  reasoning: string;
};

function isValidShortRoleName(role: string | null | undefined): role is (typeof SHORT_ROLE_NAMES)[number] {
  if (!role)
    return false;
  return ShortRoleNameSchema.safeParse(role).success;
}

function isValidChatMode(mode: string | undefined): mode is ChatMode {
  if (!mode)
    return false;
  return ChatModeSchema.safeParse(mode).success;
}

function getAvailableModelInfo(): AnalyzeModelInfo[] {
  // For automated jobs, use all user-facing models (admin-level access)
  const userFacingModels = HARDCODED_MODELS.filter(m =>
    m.id.includes('gemini')
    || m.id.includes('claude')
    || m.id.includes('gpt'),
  );

  return userFacingModels.map(m => ({
    id: m.id,
    name: m.name,
    description: m.description || '',
    isReasoning: m.is_reasoning_model,
    hasVision: m.supports_vision,
  }));
}

/**
 * Analyze a prompt to determine optimal job configuration
 *
 * Uses AI to determine:
 * - Which models to use (2-3 diverse models)
 * - What conversation mode fits best
 * - Whether web search should be enabled
 */
export async function analyzePromptForJob(
  prompt: string,
  env: ApiEnv['Bindings'],
): Promise<JobPromptAnalysisResult> {
  try {
    const { generateObject } = await getAiSdk();

    initializeOpenRouter(env);
    const client = await openRouterService.getClient();

    // Get available models
    const models = getAvailableModelInfo();
    const accessibleModelIds = models.map(m => m.id);

    // Build system prompt - use pro tier limits for automated jobs
    const maxModels = 4;
    const systemPrompt = buildAnalyzeSystemPrompt(
      models,
      maxModels,
      MIN_PARTICIPANTS_REQUIRED,
      SHORT_ROLE_NAMES,
      Object.values(ChatModes),
      false, // requiresVision
      MAX_MODELS_BY_TIER.free,
    );

    const result = await generateObject({
      model: client.chat(PROMPT_ANALYSIS_MODEL_ID),
      schema: AIAnalysisOutputSchema,
      system: systemPrompt,
      prompt,
      temperature: 0.3,
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_CONFIG.default),
    });

    const output = result.object;

    // Validate participants
    const validParticipants: Array<{ modelId: string; role: string | null }> = [];
    for (const p of output.participants) {
      if (!p?.modelId)
        continue;
      if (!accessibleModelIds.includes(p.modelId))
        continue;
      if (validParticipants.length >= maxModels)
        break;

      validParticipants.push({
        modelId: p.modelId,
        role: isValidShortRoleName(p.role) ? p.role : null,
      });
    }

    // Ensure minimum participants
    if (validParticipants.length < MIN_PARTICIPANTS_REQUIRED) {
      return DEFAULT_JOB_CONFIG;
    }

    const validatedMode = isValidChatMode(output.mode) ? output.mode : DEFAULT_CHAT_MODE;

    const analysisResult: JobPromptAnalysisResult = {
      modelIds: validParticipants.map(p => p.modelId),
      participants: validParticipants,
      mode: validatedMode,
      enableWebSearch: output.enableWebSearch ?? false,
      reasoning: `AI analysis: Selected ${validParticipants.length} models for ${validatedMode} mode. Web search: ${output.enableWebSearch ? 'enabled' : 'disabled'}.`,
    };

    return analysisResult;
  } catch {
    return DEFAULT_JOB_CONFIG;
  }
}

/**
 * Re-analyze a follow-up prompt to determine if config should change
 *
 * Used during job continuation to decide if web search should be enabled
 * for a specific round based on the generated prompt content.
 *
 * Returns only web search and mode decisions (models stay the same).
 */
export async function analyzeRoundPrompt(
  prompt: string,
  env: ApiEnv['Bindings'],
): Promise<{ enableWebSearch: boolean; mode: ChatMode }> {
  try {
    const { generateObject } = await getAiSdk();

    initializeOpenRouter(env);
    const client = await openRouterService.getClient();

    // Simplified schema for round analysis - just web search and mode
    const RoundAnalysisSchema = z.object({
      enableWebSearch: z.boolean().describe('Enable web search if the prompt asks about current events, recent data, news, or real-time information'),
      mode: z.string().describe('Conversation mode: brainstorming, analyzing, debating, researching, creating, or planning'),
    });

    const systemPrompt = `You are analyzing a follow-up prompt in an ongoing AI discussion.

Determine:
1. enableWebSearch: Set to true if the prompt:
   - Asks about current events, news, or recent happenings
   - Requests up-to-date statistics or data
   - Mentions specific dates, "latest", "current", "recent", "2024", "2025", "2026"
   - Asks about real-world facts that may have changed
   - Requests fact-checking or verification
   Set to false for theoretical discussions, creative writing, coding, or general knowledge.

2. mode: Choose the most appropriate:
   - "brainstorming": Creative exploration, generating ideas
   - "analyzing": Technical breakdown, research synthesis
   - "debating": Comparing viewpoints, trade-offs
   - "researching": Deep fact-finding, comprehensive exploration
   - "creating": Building outputs (writing, code, designs)
   - "planning": Strategy, roadmaps, action items

Respond with JSON.`;

    const result = await generateObject({
      model: client.chat(PROMPT_ANALYSIS_MODEL_ID),
      schema: RoundAnalysisSchema,
      system: systemPrompt,
      prompt,
      temperature: 0.2,
      abortSignal: AbortSignal.timeout(30000), // 30s timeout
    });

    const validatedMode = isValidChatMode(result.object.mode) ? result.object.mode : 'analyzing';

    return {
      enableWebSearch: result.object.enableWebSearch ?? false,
      mode: validatedMode,
    };
  } catch {
    return {
      enableWebSearch: false,
      mode: 'analyzing',
    };
  }
}

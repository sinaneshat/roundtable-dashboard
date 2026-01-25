/**
 * Model Selection Service
 *
 * Analyzes prompts and selects diverse AI models for automated jobs.
 * Uses a fast model to analyze the prompt and pick 2-3 models from USER_FACING_MODEL_IDS.
 */

import { ModelIds } from '@roundtable/shared/enums';

import type { ApiEnv } from '@/types';

import { getModelById, USER_FACING_MODEL_IDS } from '../models';
import { openRouterService } from '../models/openrouter.service';

const MODEL_SELECTION_SYSTEM_PROMPT = `You are an AI model selection expert. Given a user's discussion prompt, select 2-3 AI models that would provide diverse and valuable perspectives.

Available models (pick 2-3):
- google/gemini-2.5-flash: Fast, analytical. Good for math, coding, technical problems.
- google/gemini-2.5-pro: Top performer. Excels at complex reasoning across all domains.
- openai/gpt-5.1: Natural conversationalist. Thoughtful, human-like responses.
- google/gemini-3-pro-preview: Multimedia master. Analyzes text, images, video together.
- anthropic/claude-sonnet-4.5: Balanced brilliance. Thoughtful, nuanced, great at writing.
- anthropic/claude-opus-4.5: Deep thinker. Best for complex analysis and creative projects.

Selection criteria:
1. Diversity: Pick models from different providers for varied perspectives
2. Relevance: Match model strengths to the prompt topic
3. Balance: Mix fast/affordable with powerful/thorough models

Respond with ONLY a JSON object in this exact format:
{
  "models": ["provider/model-id", "provider/model-id"],
  "reasoning": "Brief explanation of why these models were chosen"
}`;

export type ModelSelectionResult = {
  modelIds: string[];
  reasoning: string;
};

/**
 * Select models for an automated job based on the initial prompt
 *
 * Uses Gemini Flash for fast, cheap analysis to pick 2-3 diverse models.
 */
export async function selectModelsForPrompt(
  prompt: string,
  env: ApiEnv['Bindings'],
): Promise<ModelSelectionResult> {
  // Initialize service if needed
  openRouterService.initialize({
    apiKey: env.OPENROUTER_API_KEY,
  });

  try {
    const result = await openRouterService.generateText({
      modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH,
      messages: [{
        id: 'select-models',
        role: 'user',
        parts: [{ type: 'text', text: `Select 2-3 AI models for this discussion prompt:\n\n"${prompt}"` }],
      }],
      system: MODEL_SELECTION_SYSTEM_PROMPT,
      temperature: 0.3,
      maxTokens: 500,
    });

    // Parse the JSON response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return getDefaultSelection();
    }

    const parsed = JSON.parse(jsonMatch[0]) as { models: string[]; reasoning: string };

    // Validate model IDs
    const validModels = parsed.models.filter(id =>
      USER_FACING_MODEL_IDS.includes(id as typeof USER_FACING_MODEL_IDS[number])
      && getModelById(id),
    );

    if (validModels.length < 2) {
      return getDefaultSelection();
    }

    return {
      modelIds: validModels.slice(0, 3),
      reasoning: parsed.reasoning || 'Models selected for diverse perspectives.',
    };
  } catch {
    return getDefaultSelection();
  }
}

/**
 * Default selection when AI selection fails
 */
function getDefaultSelection(): ModelSelectionResult {
  return {
    modelIds: [
      ModelIds.GOOGLE_GEMINI_2_5_PRO,
      ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
      ModelIds.OPENAI_GPT_5_1,
    ],
    reasoning: 'Default selection: Gemini Pro (analytical), Claude Sonnet (nuanced), GPT-5 (conversational).',
  };
}

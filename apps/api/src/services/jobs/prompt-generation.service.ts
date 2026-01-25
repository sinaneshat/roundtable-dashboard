/**
 * Prompt Generation Service
 *
 * Generates follow-up prompts for automated multi-round conversations.
 * Analyzes previous round messages and creates prompts that deepen the discussion.
 */

import { MessageRoles, ModelIds } from '@roundtable/shared/enums';
import { desc, eq } from 'drizzle-orm';

import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ApiEnv } from '@/types';

import { openRouterService } from '../models/openrouter.service';

const PROMPT_GENERATION_SYSTEM = `You are facilitating a multi-round AI discussion. Based on the conversation so far, generate a follow-up question or prompt that:

1. Builds on the key insights from the previous responses
2. Explores areas of disagreement or tension between models
3. Pushes the discussion deeper into unexplored territory
4. Avoids repeating what's already been discussed

Keep the prompt concise (1-3 sentences) and open-ended to encourage diverse perspectives.

Respond with ONLY the follow-up prompt text, no explanations or formatting.`;

/**
 * Generate a follow-up prompt based on previous round messages
 */
export async function generateNextRoundPrompt(
  threadId: string,
  currentRound: number,
  initialPrompt: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  env: ApiEnv['Bindings'],
): Promise<string> {
  // Initialize service if needed
  openRouterService.initialize({
    apiKey: env.OPENROUTER_API_KEY,
  });

  try {
    // Load all messages from the thread
    const messages = await db
      .select()
      .from(tables.chatMessage)
      .where(eq(tables.chatMessage.threadId, threadId))
      .orderBy(desc(tables.chatMessage.createdAt));

    // Build conversation summary
    const conversationSummary = buildConversationSummary(messages, currentRound);

    const result = await openRouterService.generateText({
      modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH,
      messages: [{
        id: 'generate-prompt',
        role: 'user',
        parts: [{ type: 'text', text: `Original discussion topic: "${initialPrompt}"

Conversation so far:
${conversationSummary}

Current round: ${currentRound + 1}

Generate the next follow-up prompt to deepen this discussion.` }],
      }],
      system: PROMPT_GENERATION_SYSTEM,
      temperature: 0.7,
      maxTokens: 300,
    });

    const prompt = result.text.trim();

    // Validate we got a reasonable prompt
    if (prompt.length < 10 || prompt.length > 1000) {
      return getDefaultFollowUp(currentRound);
    }

    return prompt;
  } catch {
    return getDefaultFollowUp(currentRound);
  }
}

/**
 * Build a summary of the conversation for context
 */
function buildConversationSummary(
  messages: Array<typeof tables.chatMessage.$inferSelect>,
  upToRound: number,
): string {
  const relevantMessages = messages
    .filter(m => m.roundNumber <= upToRound)
    .slice(0, 20); // Limit to avoid token overflow

  return relevantMessages
    .map((m) => {
      const roleLabel = m.role === MessageRoles.USER ? 'User' : 'AI';
      const text = extractTextFromParts(m.parts);
      // Truncate long messages
      const truncated = text.length > 500 ? `${text.slice(0, 500)}...` : text;
      return `[${roleLabel}]: ${truncated}`;
    })
    .join('\n\n');
}

/**
 * Extract text content from message parts
 */
function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts))
    return '';

  return parts
    .filter((p): p is { type: 'text'; text: string } =>
      typeof p === 'object' && p !== null && 'type' in p && p.type === 'text' && 'text' in p,
    )
    .map(p => p.text)
    .join(' ');
}

/**
 * Default follow-up prompts when generation fails
 */
const DEFAULT_FOLLOWUP_PROMPTS = [
  'Based on these perspectives, what are the strongest arguments on each side?',
  'What potential blind spots or assumptions might we be missing in this discussion?',
  'How might these ideas be practically applied or tested?',
  'What are the long-term implications of these different viewpoints?',
  'Where do you see the most promising areas for consensus or synthesis?',
] as const;

function getDefaultFollowUp(round: number): string {
  const index = round % DEFAULT_FOLLOWUP_PROMPTS.length;
  return DEFAULT_FOLLOWUP_PROMPTS.at(index) ?? DEFAULT_FOLLOWUP_PROMPTS[0];
}

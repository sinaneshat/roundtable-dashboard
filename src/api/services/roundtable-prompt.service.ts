/**
 * Roundtable Prompt Engineering Service
 *
 * Builds context-aware prompts for multi-model discussions following AI SDK best practices.
 */

import type { CoreMessage } from 'ai';

import type {
  ParticipantInfo,
  RoundtablePromptConfig,
} from '@/api/routes/chat/schema';
import { extractModelName } from '@/lib/utils/ai-display';

/**
 * Builds structured system prompt for multi-participant roundtable discussions.
 *
 * ✅ AI SDK BEST PRACTICE: Static behavior definition goes in system prompt
 * ✅ DYNAMIC CONTEXT: Use buildRoundtableContextMessage() for dynamic data
 *
 * This function creates a comprehensive system prompt that defines:
 * - The participant's role and identity
 * - Mode-specific behavioral rules (analyzing, brainstorming, debating, solving)
 * - Output structure and formatting requirements
 * - Quality validation checklist
 *
 * @param config - Roundtable configuration with mode, participants, and role info
 * @returns Formatted system prompt ready for AI SDK streamText({ system })
 *
 * @example
 * ```typescript
 * const systemPrompt = buildRoundtableSystemPrompt({
 *   mode: 'brainstorming',
 *   currentParticipant: { id: '1', modelId: 'gpt-4', role: 'The Ideator' },
 *   allParticipants: [...],
 *   customSystemPrompt: null,
 *   currentParticipantIndex: 0,
 * });
 *
 * const result = streamText({
 *   model: openai('gpt-4'),
 *   system: systemPrompt, // ← Use here
 *   messages: [...]
 * });
 * ```
 *
 * @see buildRoundtableContextMessage For dynamic context in user messages
 * @see https://v4.ai-sdk.dev/docs/ai-sdk-core/generating-text Official AI SDK docs
 */
export function buildRoundtableSystemPrompt(config: RoundtablePromptConfig): string {
  const {
    mode,
    currentParticipant,
    customSystemPrompt,
  } = config;

  // If custom system prompt provided, use it directly
  if (customSystemPrompt) {
    return customSystemPrompt;
  }

  // Build structured system prompt
  const sections: string[] = [];

  // 1. CORE IDENTITY
  sections.push(
    '# Roundtable Discussion',
    '',
    `Mode: ${mode} | Your role: ${currentParticipant.role || 'participant'}`,
    '',
  );

  // 2. CORE RULES
  sections.push(
    '## Rules',
    '',
    '**Attribution:**',
    '- Reference other models by their exact names (e.g., "Claude Sonnet 4.5", "GPT-4o")',
    '- Acknowledge previous contributions before adding your perspective',
    '- Build on others\' ideas - don\'t repeat them',
    '',
    '**Response Style:**',
    '- Be concise and direct',
    '- Add unique value',
    '- Stay in your assigned role',
    '',
  );

  // 3. MODE-SPECIFIC GUIDANCE
  switch (mode) {
    case 'analyzing':
      sections.push(
        '## Analyzing Mode',
        '- Break down complex topics logically',
        '- Support claims with evidence',
        '- Identify patterns and implications',
        '- Reference: "Building on [Model Name]\'s framework..."',
        '',
      );
      break;

    case 'brainstorming':
      sections.push(
        '## Brainstorming Mode',
        '- Propose 3-5 actionable ideas',
        '- Build on others\' suggestions ("yes, and...")',
        '- Explore unconventional approaches',
        '- Reference: "[Model Name]\'s idea sparked..."',
        '',
      );
      break;

    case 'debating':
      sections.push(
        '## Debating Mode',
        '- Take a clear position with 2-3 arguments',
        '- Challenge ideas respectfully',
        '- Acknowledge valid points before countering',
        '- Reference: "[Model Name] makes a compelling case, but..."',
        '',
      );
      break;

    case 'solving':
      sections.push(
        '## Solving Mode',
        '- Propose 1-2 concrete solutions',
        '- Evaluate feasibility and trade-offs',
        '- Identify obstacles and mitigations',
        '- Reference: "[Model Name]\'s solution addresses X; I\'d enhance it by..."',
        '',
      );
      break;
  }

  // 4. OUTPUT FORMAT
  sections.push(
    '## Response Format',
    '- Acknowledge previous contributions by name',
    '- Present your unique perspective (2-3 key points)',
    '- Be concise: aim for 150-300 words',
    '',
  );

  return sections.join('\n');
}

// ============================================================================
// CONTEXT MESSAGE BUILDER (AI SDK Best Practice)
// ============================================================================

/**
 * Build context message as a structured user message
 *
 * ✅ AI SDK PATTERN: Dynamic context belongs in user messages, not system prompts
 * ✅ STRUCTURED FORMAT: Clear sections for participants and instructions
 * ✅ PARTICIPANT AWARENESS: Each model knows who else is in the conversation
 *
 * This message provides:
 * - List of other participants (who has spoken so far)
 * - Instructions for referencing participants
 *
 * @param config - Roundtable prompt configuration
 * @returns Formatted context as user message content (empty string if no context needed)
 *
 * @example
 * ```typescript
 * const contextMessage = buildRoundtableContextMessage({
 *   mode: 'brainstorming',
 *   currentParticipant: { id: '2', modelId: 'claude-3', role: 'The Critic' },
 *   allParticipants: [participant1, participant2, participant3],
 *   currentParticipantIndex: 1,
 * });
 *
 * // Use as first user message in conversation:
 * const messages: UIMessage[] = [
 *   ...(contextMessage ? [{ role: 'user', content: contextMessage }] : []),
 *   { role: 'user', content: 'What are the benefits of AI?' },
 * ];
 * ```
 *
 * @see buildRoundtableSystemPrompt For static behavior definition
 * @see https://v4.ai-sdk.dev/docs/ai-sdk-core/generating-text AI SDK message patterns
 */
export function buildRoundtableContextMessage(config: RoundtablePromptConfig): string {
  const {
    currentParticipantIndex,
    allParticipants,
    currentParticipant,
  } = config;

  const sections: string[] = [];

  // 1. PARTICIPANT ROSTER
  const otherParticipants = allParticipants
    .slice(0, currentParticipantIndex)
    .filter((p, idx) => idx !== currentParticipantIndex);

  if (otherParticipants.length > 0) {
    sections.push('## Previous Speakers', '');

    otherParticipants.forEach((p) => {
      const modelDisplay = p.modelName || extractModelName(p.modelId);
      const roleDisplay = p.role ? ` (${p.role})` : '';
      sections.push(`- ${modelDisplay}${roleDisplay}`);
    });

    sections.push('');
  }

  // 2. YOUR IDENTITY
  const currentModelDisplay = currentParticipant.modelName || extractModelName(currentParticipant.modelId);
  const currentRoleDisplay = currentParticipant.role;

  sections.push(
    '## Your Identity',
    '',
    `Model: ${currentModelDisplay}`,
    ...(currentRoleDisplay ? [`Role: ${currentRoleDisplay}`] : []),
    '',
  );

  if (sections.length === 0) {
    return '';
  }

  return sections.join('\n');
}

// ============================================================================
// MESSAGE HISTORY FORMATTER - REMOVED
// ============================================================================

/**
 * ⚠️ NOTE: Message history formatting removed
 *
 * The participant context is already provided in the context message (buildRoundtableContextMessage).
 * AI SDK's CoreMessage type doesn't support custom metadata, so we can't add participant labels
 * to individual messages without complex workarounds.
 *
 * Instead, the system relies on:
 * 1. Clear system prompt defining the participant's role
 * 2. Context message listing other participants
 * 3. Natural conversation flow where participants reference each other by number
 *
 * This approach follows AI SDK best practices while maintaining clean type safety.
 */

// ============================================================================
// COMPLETE PROMPT BUILDER (Main Entry Point)
// ============================================================================

/**
 * Build complete prompt setup for a roundtable participant
 *
 * ✅ AI SDK BEST PRACTICE: Returns structured prompt components
 * ✅ CLEAN SEPARATION: System prompt, context message, and formatted history
 * ✅ READY TO USE: Direct integration with AI SDK generateText/streamText
 *
 * Usage:
 * ```typescript
 * const promptSetup = buildRoundtablePrompt(config);
 *
 * const result = await streamText({
 *   model: client.chat(participant.modelId),
 *   system: promptSetup.systemPrompt,
 *   messages: [
 *     ...promptSetup.contextMessage ? [{ role: 'user', content: promptSetup.contextMessage }] : [],
 *     ...promptSetup.formattedHistory,
 *   ],
 * });
 * ```
 *
 * @param config - Roundtable prompt configuration
 * @param _messageHistory - Existing conversation history (currently unused)
 * @returns Complete prompt setup ready for AI SDK
 */
export function buildRoundtablePrompt(
  config: RoundtablePromptConfig,
  _messageHistory: CoreMessage[] = [],
): {
  /** System prompt defining behavior (for AI SDK 'system' parameter) */
  systemPrompt: string;
  /** Context message to prepend to conversation (as user message) */
  contextMessage: string;
  /** Participant info map for reference */
  participantMap: Map<string, ParticipantInfo>;
} {
  // Build system prompt (behavior definition)
  const systemPrompt = buildRoundtableSystemPrompt(config);

  // Build context message (dynamic context as user message)
  const contextMessage = buildRoundtableContextMessage(config);

  // Create participant map for reference
  const participantMap = new Map<string, ParticipantInfo>(
    config.allParticipants.map(p => [p.id, p]),
  );

  return {
    systemPrompt,
    contextMessage,
    participantMap,
  };
}

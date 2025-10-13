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
import { extractModelName } from '@/lib/ai/models-config';

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

  // 1. CORE IDENTITY - What you are
  sections.push(
    '# Your Role in This Roundtable',
    '',
    `You are an AI participant in a ${mode} roundtable discussion. Multiple AI models are working together to provide diverse perspectives and insights.`,
    '',
  );

  // 2. YOUR ASSIGNMENT - Your specific role
  if (currentParticipant.role) {
    sections.push(
      `## Your Assigned Role: ${currentParticipant.role}`,
      '',
      'This role defines your perspective and approach in the discussion. Embody this role consistently while maintaining helpfulness and clarity.',
      '',
    );
  }

  // 3. CORE GUIDELINES - Universal behavioral rules
  sections.push(
    '## Core Guidelines',
    '',
    '- **Be Collaborative**: You are one voice among many. Reference and build on other participants\' contributions.',
    '- **Stay In Character**: Maintain your assigned role and perspective throughout the discussion.',
    '- **Be Clear & Concise**: Express ideas clearly without unnecessary verbosity.',
    '- **Cite Participants**: When referencing others, use their participant number (e.g., "As Participant 2 mentioned...").',
    '- **Add Value**: Contribute unique insights that complement rather than repeat what others have said.',
    '',
  );

  // 4. MODE-SPECIFIC INSTRUCTIONS - Detailed guidance per mode
  sections.push(
    `## ${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode Instructions`,
    '',
  );

  switch (mode) {
    case 'analyzing':
      sections.push(
        '**Objective**: Provide analytical insights and evidence-based reasoning.',
        '',
        '**Your Approach**:',
        '- Break down complex topics into understandable components',
        '- Support claims with reasoning and examples',
        '- Identify patterns, trends, and relationships',
        '- Question assumptions and examine implications',
        '- Build on analyses from other participants',
        '',
        '**Expected Output**: Structured, logical analysis that advances understanding of the topic.',
      );
      break;

    case 'brainstorming':
      sections.push(
        '**Objective**: Generate creative ideas and explore possibilities.',
        '',
        '**Your Approach**:',
        '- Propose innovative and diverse ideas',
        '- Build on and remix suggestions from other participants',
        '- Embrace "yes, and..." thinking',
        '- Consider unconventional approaches',
        '- Explore multiple directions without premature judgment',
        '',
        '**Expected Output**: Fresh ideas and creative angles that expand the solution space.',
      );
      break;

    case 'debating':
      sections.push(
        '**Objective**: Present arguments and engage in constructive critical discussion.',
        '',
        '**Your Approach**:',
        '- Present clear positions with supporting arguments',
        '- Challenge ideas respectfully with counter-arguments',
        '- Identify logical flaws or missing considerations',
        '- Acknowledge valid points from opposing views',
        '- Maintain focus on ideas, not personalities',
        '',
        '**Expected Output**: Well-reasoned arguments that advance the debate productively.',
      );
      break;

    case 'solving':
      sections.push(
        '**Objective**: Develop practical solutions and actionable plans.',
        '',
        '**Your Approach**:',
        '- Propose concrete, implementable solutions',
        '- Evaluate feasibility and trade-offs',
        '- Build on solutions suggested by others',
        '- Identify potential obstacles and mitigation strategies',
        '- Focus on actionable next steps',
        '',
        '**Expected Output**: Practical solutions with clear implementation paths.',
      );
      break;
  }

  sections.push('');

  // 5. RESPONSE STRUCTURE - How to format responses
  sections.push(
    '## Response Structure',
    '',
    '1. **Acknowledge Context**: Reference the user\'s question and relevant previous responses',
    '2. **Provide Your Perspective**: Share your unique insights aligned with your role',
    '3. **Connect with Others**: Build on or contrast with other participants when relevant',
    '4. **Be Actionable**: Ensure your contribution moves the conversation forward',
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
 * @returns Formatted context as user message content
 */
export function buildRoundtableContextMessage(config: RoundtablePromptConfig): string {
  const {
    currentParticipantIndex,
    allParticipants,
  } = config;

  const sections: string[] = [];

  // 1. PARTICIPANT ROSTER - Who else is in this roundtable
  const otherParticipants = allParticipants
    .slice(0, currentParticipantIndex) // Only participants who have spoken or will speak before this one
    .filter((p, idx) => idx !== currentParticipantIndex);

  if (otherParticipants.length > 0) {
    sections.push(
      '## Roundtable Participants',
      '',
    );

    otherParticipants.forEach((p, idx) => {
      const participantNumber = idx + 1;
      const modelDisplay = p.modelName || extractModelName(p.modelId);
      const roleDisplay = p.role ? ` - ${p.role}` : '';

      sections.push(
        `**Participant ${participantNumber}**${roleDisplay}`,
        `- Model: ${modelDisplay}`,
        '',
      );
    });

    sections.push('');
  }

  // 2. INSTRUCTIONS - How to reference participants
  if (otherParticipants.length > 0) {
    sections.push(
      '## How to Reference Other Participants',
      '',
      'When referring to other participants, use their assigned numbers:',
      '- "As Participant 2 suggested..."',
      '- "Building on Participant 1\'s analysis..."',
      '- "I agree with Participant 3 that..."',
      '',
    );
  }

  // If no context to add, return empty string (no context message needed)
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
 * @param messageHistory - Existing conversation history
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

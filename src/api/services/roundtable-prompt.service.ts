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

  // 3. CORE BEHAVIORAL RULES - Non-negotiable participation standards
  sections.push(
    '## Core Behavioral Rules (MANDATORY)',
    '',
    '**Good Faith Participation:**',
    '- Engage honestly and constructively with all ideas presented',
    '- Assume best intentions from other participants',
    '- Focus on advancing the conversation, not winning arguments',
    '- Acknowledge valid points before offering critiques',
    '- Be intellectually honest - admit limitations or uncertainties',
    '',
    '**Collaboration Standards:**',
    '- You are ONE voice among many - not the sole authority',
    '- ALWAYS reference other participants by number when building on their ideas',
    '- Add UNIQUE value - do not simply repeat what others have said',
    '- Build bridges between different perspectives when possible',
    '',
    '**Role Adherence:**',
    '- Stay firmly in your assigned role throughout the entire discussion',
    '- Your role defines your LENS, not your entire identity',
    '- Balance role consistency with helpfulness',
    '',
    '**Communication Standards:**',
    '- Be clear, direct, and concise',
    '- Avoid tangents or unnecessary elaboration',
    '- Use precise language over vague generalities',
    '- Structure your thoughts logically',
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
        '- Break down complex topics into clear, logical components',
        '- Support every claim with reasoning, data, or examples',
        '- Identify patterns, trends, causal relationships, and implications',
        '- Question underlying assumptions systematically',
        '- Build on and extend analyses from other participants',
        '- Use analytical frameworks (e.g., SWOT, cause-effect, comparison)',
        '',
        '**Response Format**:',
        '- Opening: State your analytical angle or framework',
        '- Main: Present 3-4 key analytical insights, each with supporting evidence',
        '- Closing: Synthesize findings into a clear conclusion',
        '',
        '**Tone**: Logical, objective, evidence-based, methodical',
        '',
        '**Expected Output**: Structured, logical analysis with clear reasoning chains.',
      );
      break;

    case 'brainstorming':
      sections.push(
        '**Objective**: Generate creative ideas and explore diverse possibilities.',
        '',
        '**Your Approach**:',
        '- Propose 3-5 innovative and actionable ideas',
        '- Build on and remix suggestions from other participants ("yes, and...")',
        '- Explore unconventional approaches and lateral thinking',
        '- Consider multiple dimensions and angles',
        '- Balance creativity with practical viability',
        '- Avoid premature criticism or filtering',
        '',
        '**Response Format**:',
        '- Opening: Frame the creative challenge or opportunity',
        '- Main: Present distinct ideas, each with brief explanation',
        '- Closing: Highlight the most promising direction',
        '',
        '**Tone**: Enthusiastic, open-minded, exploratory, constructive',
        '',
        '**Expected Output**: Fresh, diverse ideas that expand the solution space.',
      );
      break;

    case 'debating':
      sections.push(
        '**Objective**: Present arguments and engage in constructive critical discussion.',
        '',
        '**Your Approach**:',
        '- Take a clear position and defend it with 2-3 strong arguments',
        '- Challenge opposing ideas respectfully with logical counter-arguments',
        '- Identify logical flaws, assumptions, or missing considerations',
        '- Acknowledge valid points from other participants before countering',
        '- Use evidence, examples, or reasoning to support your stance',
        '- Maintain focus on ideas and logic, not personalities',
        '',
        '**Response Format**:',
        '- Opening: State your position clearly',
        '- Main: Present arguments with supporting reasoning, address counterpoints',
        '- Closing: Reinforce your stance or find common ground',
        '',
        '**Tone**: Assertive yet respectful, logical, evidence-based',
        '',
        '**Expected Output**: Well-reasoned arguments that advance the debate productively.',
      );
      break;

    case 'solving':
      sections.push(
        '**Objective**: Develop practical solutions and actionable implementation plans.',
        '',
        '**Your Approach**:',
        '- Propose 1-2 concrete, implementable solutions with clear steps',
        '- Evaluate feasibility, costs, benefits, and trade-offs',
        '- Build on or refine solutions suggested by other participants',
        '- Identify potential obstacles and propose mitigation strategies',
        '- Focus on actionable next steps with clear ownership',
        '- Consider resources, timeline, and dependencies',
        '',
        '**Response Format**:',
        '- Opening: Summarize the problem and your solution approach',
        '- Main: Detail solution steps, address feasibility and trade-offs',
        '- Closing: Provide clear next actions or recommendations',
        '',
        '**Tone**: Practical, actionable, solution-oriented, realistic',
        '',
        '**Expected Output**: Practical solutions with clear, actionable implementation paths.',
      );
      break;
  }

  sections.push('');

  // 5. OUTPUT STRUCTURE - Strict formatting requirements for consistency
  sections.push(
    '## Output Structure & Formatting (MANDATORY)',
    '',
    '**Your response MUST follow this exact structure:**',
    '',
    '1. **Opening** (1-2 sentences)',
    '   - Acknowledge the user\'s question or context',
    '   - State your role\'s perspective or approach',
    '',
    '2. **Main Content** (3-5 well-structured paragraphs)',
    '   - Present your key insights, ideas, or arguments',
    '   - Use clear topic sentences for each paragraph',
    '   - Support points with reasoning or examples',
    '   - Reference other participants when relevant (e.g., "As Participant 2 noted...")',
    '',
    '3. **Closing** (1-2 sentences)',
    '   - Summarize your contribution',
    '   - Provide a clear takeaway or actionable insight',
    '',
    '**Formatting Requirements:**',
    '- Use **bold** for emphasis on key terms only',
    '- Use bullet points (•) for lists of 3+ items',
    '- Keep paragraphs focused (3-5 sentences each)',
    '- Maintain professional, clear language',
    '- Avoid excessive markdown formatting (no tables, no code blocks unless specifically requested)',
    '',
    '**Length Guidelines:**',
    '- Minimum: 150 words',
    '- Target: 200-350 words',
    '- Maximum: 400 words',
    '',
    '**Consistency Requirements:**',
    '- Maintain consistent tone throughout your response',
    '- Stay true to your assigned role',
    '- Build logically on previous context',
    '- Ensure coherent transitions between paragraphs',
    '',
  );

  // 6. PRE-RESPONSE PLANNING - Think before you write
  sections.push(
    '## Before You Respond: Mental Checklist',
    '',
    'PAUSE and mentally confirm:',
    '1. **Context**: Do I understand what the user is asking and what others have said?',
    '2. **Role**: Am I clear on my role and how it applies to this question?',
    '3. **Value**: What UNIQUE insight can I contribute that others haven\'t?',
    `4. **Mode**: How does ${mode} mode shape my approach?`,
    '5. **Structure**: Do I have a clear opening, main points, and closing?',
    '',
  );

  // 7. OUTPUT VALIDATION - Final quality control
  sections.push(
    '## Final Validation (CHECK BEFORE SENDING)',
    '',
    '**Structure Compliance:**',
    '- [ ] Opening: 1-2 sentences acknowledging context',
    '- [ ] Main: 3-5 paragraphs with distinct points',
    '- [ ] Closing: 1-2 sentences with clear takeaway',
    '',
    '**Content Quality:**',
    '- [ ] Directly addresses the user\'s question',
    '- [ ] Provides unique value (not repetition)',
    '- [ ] References other participants when relevant',
    '- [ ] Stays true to assigned role',
    '- [ ] Demonstrates good faith engagement',
    '',
    '**Format & Length:**',
    '- [ ] Length: 200-350 words (preferred range)',
    '- [ ] Clean formatting (minimal markdown, clear structure)',
    '- [ ] Professional tone matching mode requirements',
    '',
    '**CRITICAL**: If any checklist item fails, revise your response before sending.',
    '',
  );

  // 8. RESPONSE INITIATION INSTRUCTION - Force structured start
  sections.push(
    '---',
    '',
    '## NOW RESPOND',
    '',
    'Begin your response immediately with your Opening (1-2 sentences acknowledging context).',
    `Remember: You are in ${mode} mode. Follow the structure. Add unique value. Engage in good faith.`,
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

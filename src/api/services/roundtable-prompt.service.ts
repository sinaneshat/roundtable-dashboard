/**
 * Roundtable Prompt Engineering Service
 *
 * Builds context-aware prompts for multi-model discussions following AI SDK best practices.
 *
 * ADVANCED PROMPT ENGINEERING TECHNIQUES USED:
 * ============================================
 * 1. **Mandatory Response Structures**: Each mode has required sections (ANALYZING, BRAINSTORMING, DEBATING, SOLVING)
 * 2. **Strong Enforcement Language**: Using MUST/REQUIRED/PROHIBITED for critical behaviors
 * 3. **Few-Shot Examples**: Showing exact expected format for each mode
 * 4. **Role Immersion**: Deep character prompts with explicit identity reinforcement
 * 5. **Conditional Instructions**: Different rules for first participant vs subsequent participants
 * 6. **Self-Validation Checklist**: Pre-response verification questions
 * 7. **Explicit Addressing Rules**: MUST reference ALL previous speakers by exact model name
 * 8. **Mode-Specific Costs**: Each mode has vastly different behavioral requirements
 * 9. **Negative Examples**: Explicit "PROHIBITED" behaviors to avoid
 * 10. **Layered Instructions**: Core rules → Role rules → Mode rules → Response structure
 *
 * ENFORCEMENT HIERARCHY:
 * =====================
 * Level 1: Role Identity (🎭 Assigned character/perspective)
 * Level 2: Critical Rules (✅ MUST follow - addressing all participants, role adherence, value addition)
 * Level 3: Mode-Specific Behavior (Vastly different per mode with mandatory structures)
 * Level 4: Self-Validation (Checklist before responding)
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

  // 1. CORE IDENTITY & ROLE IMMERSION
  const roleAssigned = currentParticipant.role;

  sections.push(
    '# Roundtable Discussion',
    '',
    `**Conversation Mode:** ${mode.toUpperCase()}`,
    '',
  );

  // ROLE IMMERSION: If role is assigned, make it prominent
  if (roleAssigned) {
    sections.push(
      `## 🎭 YOUR ASSIGNED ROLE: "${roleAssigned}"`,
      '',
      '**ROLE REQUIREMENTS:**',
      `✅ CRITICAL: You are "${roleAssigned}" - this is your identity in this discussion`,
      '✅ CRITICAL: Every response must reflect this role\'s perspective and personality',
      '✅ CRITICAL: Other participants know you as this role - maintain consistency',
      '✅ PROHIBITED: Generic responses that don\'t reflect your role',
      '✅ PROHIBITED: Breaking character or speaking from a neutral perspective',
      '',
      `**HOW TO EMBODY "${roleAssigned}":**`,
      '1. Consider how this role would uniquely view the topic',
      '2. Use language and framing consistent with this perspective',
      '3. Emphasize aspects that matter most to this role',
      '4. When referencing others, do so through your role\'s lens',
      '',
    );
  } else {
    sections.push(
      '## Your Role: Active Participant',
      '',
      'You are an engaged participant without a specialized role.',
      'Contribute thoughtfully based on your model\'s strengths.',
      '',
    );
  }

  // 2. CORE RULES - MANDATORY REQUIREMENTS
  sections.push(
    '## CRITICAL RULES (MUST FOLLOW)',
    '',
    '**MANDATORY ADDRESSING REQUIREMENTS:**',
    '✅ REQUIRED: You MUST explicitly address EVERY participant who has already spoken',
    '✅ REQUIRED: Use their EXACT model names (e.g., "Claude Sonnet 4.5 said...", "GPT-4o argued...")',
    '✅ REQUIRED: Comment on WHAT they said before presenting your own ideas',
    '✅ PROHIBITED: Generic references like "others mentioned" or "previous speakers" - use NAMES',
    '✅ PROHIBITED: Ignoring any previous participant - ALL must be acknowledged',
    '',
    '**ROLE ADHERENCE:**',
    `✅ REQUIRED: Embody "${currentParticipant.role || 'participant'}" personality in every response`,
    '✅ REQUIRED: Your perspective must reflect your assigned role\'s viewpoint',
    '✅ PROHIBITED: Generic responses that could come from any participant',
    '',
    '**VALUE ADDITION:**',
    '✅ REQUIRED: Add NEW insights not already mentioned by previous participants',
    '✅ REQUIRED: Build upon or challenge existing ideas with substantive reasoning',
    '✅ PROHIBITED: Repeating what others have already said',
    '',
  );

  // 3. MODE-SPECIFIC GUIDANCE
  switch (mode) {
    case 'analyzing':
      sections.push(
        '## ANALYZING MODE - Systematic Deconstruction',
        '',
        '**MODE OBJECTIVE:** Break down complex topics into logical components with evidence-based reasoning',
        '',
        '**MANDATORY RESPONSE STRUCTURE:**',
        '```',
        '1. SYNTHESIS OF PREVIOUS ANALYSES:',
        '   - "[Model Name] identified [their key finding]..."',
        '   - "[Model Name] analyzed [their angle]..."',
        '   - "Building on these analyses..."',
        '',
        '2. YOUR ANALYTICAL FRAMEWORK:',
        '   - Present your unique analytical lens',
        '   - Break down the topic into 2-3 logical components',
        '   - Support each component with evidence or reasoning',
        '',
        '3. PATTERNS & IMPLICATIONS:',
        '   - What patterns emerge from combining all perspectives?',
        '   - What are the deeper implications?',
        '```',
        '',
        '**BEHAVIOR REQUIREMENTS:**',
        '✅ MUST: Reference specific analytical points made by ALL previous participants',
        '✅ MUST: Provide a unique analytical lens not yet explored',
        '✅ MUST: Support all claims with logical reasoning or evidence',
        '✅ MUST: Identify connections between different participants\' analyses',
        '⚠️ AVOID: Opinion-based arguments (save for debating mode)',
        '⚠️ AVOID: Brainstorming new ideas (save for brainstorming mode)',
        '',
        '**EXAMPLE START:**',
        '"Claude Sonnet 4.5 identified the root cause as X, while GPT-4o analyzed the systemic factors Y and Z. Building on these frameworks, I\'ll examine the structural interdependencies..."',
        '',
      );
      break;

    case 'brainstorming':
      sections.push(
        '## BRAINSTORMING MODE - Creative Ideation',
        '',
        '**MODE OBJECTIVE:** Generate creative, actionable ideas with "yes, and..." collaborative spirit',
        '',
        '**MANDATORY RESPONSE STRUCTURE:**',
        '```',
        '1. ACKNOWLEDGE ALL PREVIOUS IDEAS:',
        '   - "[Model Name] proposed [their idea]..."',
        '   - "[Model Name] suggested [their approach]..."',
        '   - "These ideas sparked my thinking on..."',
        '',
        '2. BUILD WITH "YES, AND...":',
        '   - Take at least ONE previous idea and enhance it',
        '   - "Yes, and we could extend [Model Name]\'s idea by..."',
        '   - Show how ideas can combine or evolve',
        '',
        '3. YOUR UNIQUE IDEAS (3-5 NEW CONCEPTS):',
        '   - Present fresh, actionable ideas',
        '   - At least one should be unconventional/creative',
        '   - Each idea: 1-2 sentences explaining the concept',
        '```',
        '',
        '**BEHAVIOR REQUIREMENTS:**',
        '✅ MUST: Reference EVERY previous participant\'s ideas by name',
        '✅ MUST: Use "yes, and..." framework to build on at least one existing idea',
        '✅ MUST: Propose 3-5 NEW ideas (not mentioned by others)',
        '✅ MUST: Make ideas actionable (not just abstract concepts)',
        '✅ MUST: Include at least one unconventional/creative approach',
        '⚠️ AVOID: Criticism or debate (save for debating mode)',
        '⚠️ AVOID: Deep analysis (save for analyzing mode)',
        '',
        '**EXAMPLE START:**',
        '"Claude Sonnet 4.5 proposed idea A which I love, and GPT-4o suggested approach B. Yes, and we could combine these by... Here are my additional ideas: 1) [novel idea], 2) [creative angle]..."',
        '',
      );
      break;

    case 'debating':
      sections.push(
        '## DEBATING MODE - Critical Argumentation',
        '',
        '**MODE OBJECTIVE:** Engage in rigorous debate by directly challenging and defending positions',
        '',
        '**MANDATORY RESPONSE STRUCTURE:**',
        '```',
        '1. DIRECTLY ADDRESS EACH PREVIOUS ARGUMENT:',
        '   For EACH previous participant:',
        '   - "[Model Name] argued that [their position]..."',
        '   - "I agree/disagree with this because [your reasoning]..."',
        '   - "However, [Model Name] overlooks [your counterpoint]..."',
        '',
        '2. YOUR POSITION & ARGUMENTS:',
        '   - State your clear position on the debate topic',
        '   - Present 2-3 distinct arguments supporting your position',
        '   - Each argument must have logical reasoning',
        '',
        '3. REBUTTALS TO OPPOSING VIEWS:',
        '   - Identify weaknesses in opposing arguments',
        '   - Explain WHY your position is stronger',
        '   - Acknowledge valid points, then counter them',
        '```',
        '',
        '**BEHAVIOR REQUIREMENTS:**',
        '✅ MUST: Address EVERY previous participant\'s argument by name',
        '✅ MUST: Clearly state your position (agree/disagree/nuanced)',
        '✅ MUST: Provide 2-3 distinct arguments with logical reasoning',
        '✅ MUST: Challenge or counter at least one opposing view',
        '✅ MUST: Acknowledge valid points before rebutting ("X makes a good point about Y, but...")',
        '✅ ENCOURAGED: Be intellectually combative but respectful',
        '⚠️ AVOID: Agreement without critical engagement',
        '⚠️ AVOID: Neutral analysis (save for analyzing mode)',
        '',
        '**EXAMPLE START:**',
        '"Claude Sonnet 4.5 argued that X is preferable because Y, and I strongly agree with this reasoning. However, GPT-4o\'s counterargument about Z overlooks a critical factor... My position is that we should prioritize X because: 1) [first argument], 2) [second argument]..."',
        '',
      );
      break;

    case 'solving':
      sections.push(
        '## SOLVING MODE - Solution Engineering',
        '',
        '**MODE OBJECTIVE:** Develop concrete, actionable solutions with feasibility analysis',
        '',
        '**MANDATORY RESPONSE STRUCTURE:**',
        '```',
        '1. EVALUATE ALL PREVIOUS SOLUTIONS:',
        '   For EACH previous participant:',
        '   - "[Model Name] proposed [their solution]..."',
        '   - "This addresses [strengths] but may face [limitations]..."',
        '   - "I would enhance/modify this by..."',
        '',
        '2. YOUR SOLUTION(S):',
        '   - Propose 1-2 concrete, actionable solutions',
        '   - Explain step-by-step implementation',
        '   - Address how your solution builds on previous ones',
        '',
        '3. FEASIBILITY ANALYSIS:',
        '   - Evaluate: Cost, Time, Resources, Complexity',
        '   - Identify potential obstacles',
        '   - Propose specific mitigations',
        '   - Compare trade-offs with previous solutions',
        '```',
        '',
        '**BEHAVIOR REQUIREMENTS:**',
        '✅ MUST: Evaluate EVERY previous participant\'s solution by name',
        '✅ MUST: Propose concrete solutions (not abstract concepts)',
        '✅ MUST: Include implementation steps or approach',
        '✅ MUST: Analyze feasibility (resources, time, obstacles)',
        '✅ MUST: Either build on or improve previous solutions',
        '✅ MUST: Identify specific trade-offs and mitigation strategies',
        '⚠️ AVOID: Vague ideas without implementation details',
        '⚠️ AVOID: Ignoring feasibility constraints',
        '',
        '**EXAMPLE START:**',
        '"Claude Sonnet 4.5\'s solution to implement X is solid but may face scalability challenges. GPT-4o\'s alternative approach Y addresses cost but introduces complexity. Building on both, I propose: [concrete solution with steps]... Feasibility: This requires [resources], can be completed in [timeframe], with [trade-offs]..."',
        '',
      );
      break;
  }

  // 4. OUTPUT FORMAT & VALIDATION
  sections.push(
    '## RESPONSE FORMAT',
    '',
    '**Length Target:**',
    '- Aim for 200-400 words (enough depth without verbosity)',
    '- First participant can be shorter (no previous speakers to address)',
    '- Later participants need more length to address all previous contributions',
    '',
    '**SELF-VALIDATION CHECKLIST (Before Responding):**',
    '✅ Have I explicitly mentioned EVERY previous participant by their model name?',
    '✅ Have I commented on WHAT each previous participant said (not just that they spoke)?',
    '✅ Have I followed the mandatory response structure for this mode?',
    '✅ Does my response clearly reflect my assigned role\'s perspective?',
    '✅ Have I added NEW value (not repeated existing points)?',
    '✅ Have I followed all the "MUST" requirements for this mode?',
    '',
    '**IMMEDIATE DISQUALIFIERS (Will Result in Poor Response):**',
    '❌ Generic references like "others said" without using names',
    '❌ Skipping any previous participant',
    '❌ Not following the mode-specific response structure',
    '❌ Repeating points already made by others without adding value',
    '❌ Speaking outside your assigned role\'s perspective',
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
    mode,
  } = config;

  const sections: string[] = [];

  // 1. PARTICIPANT ROSTER & ADDRESSING INSTRUCTIONS
  const otherParticipants = allParticipants
    .slice(0, currentParticipantIndex)
    .filter((p, idx) => idx !== currentParticipantIndex);

  if (otherParticipants.length > 0) {
    sections.push(
      '## ⚠️ CRITICAL: Previous Speakers You MUST Address',
      '',
      '**YOU MUST explicitly reference EACH of these participants by name in your response:**',
      '',
    );

    otherParticipants.forEach((p, index) => {
      const modelDisplay = p.modelName || extractModelName(p.modelId);
      const roleDisplay = p.role ? ` (Role: ${p.role})` : '';
      sections.push(`${index + 1}. **${modelDisplay}**${roleDisplay}`);
      sections.push(`   ↳ You must comment on their contribution`);
    });

    sections.push(
      '',
      '**REQUIRED FORMAT:**',
      '- Use their exact names: "Claude Sonnet 4.5 said...", "GPT-4o argued..."',
      '- Comment on WHAT they said, not just that they spoke',
      '- Address ALL participants above - missing even one is a critical error',
      '',
    );
  } else {
    // First participant - different instructions
    sections.push(
      '## Your Position: First Participant',
      '',
      '**INSTRUCTIONS:**',
      '- You are the first participant in this conversation',
      '- No previous speakers to address',
      '- Set a strong foundation for others to build upon',
      `- Embody your role fully: ${currentParticipant.role || 'engaged participant'}`,
      '',
    );
  }

  // 2. YOUR IDENTITY
  const currentModelDisplay = currentParticipant.modelName || extractModelName(currentParticipant.modelId);
  const currentRoleDisplay = currentParticipant.role;

  sections.push(
    '## Your Identity in This Discussion',
    '',
    `**Model:** ${currentModelDisplay}`,
    ...(currentRoleDisplay ? [`**Role:** ${currentRoleDisplay} (embody this perspective fully)`] : []),
    `**Mode:** ${mode.toUpperCase()} (follow mode-specific structure exactly)`,
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

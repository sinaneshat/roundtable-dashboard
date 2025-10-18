/**
 * Moderator Analysis Service
 *
 * ✅ SINGLE SOURCE OF TRUTH: Schema now in @/api/routes/chat/schema.ts
 * This service only contains prompt building logic for AI SDK streamObject()
 */

import type { ModeratorAnalysisPayload } from '@/api/routes/chat/schema';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { extractModelName } from '@/lib/utils/ai-display';

export type ModeratorAnalysis = ModeratorAnalysisPayload;
export type ModeratorPromptConfig = {
  /** Conversation mode */
  mode: ChatModeId;
  /** Round number (1-indexed) */
  roundNumber: number;
  /** User's original question */
  userQuestion: string;
  /** All participants with their messages */
  participantResponses: Array<{
    participantIndex: number;
    participantRole: string | null;
    modelId: string;
    modelName: string;
    responseContent: string;
  }>;
};

/**
 * Builds structured system prompt for AI moderator analysis of roundtable discussions.
 *
 * ✅ AI SDK BEST PRACTICE: System prompt defines moderator's analytical framework
 * ✅ STRUCTURED OUTPUT: Designed for use with AI SDK's streamObject() pattern
 *
 * This function creates a comprehensive moderator prompt that defines:
 * - Mode-specific rating criteria (analyzing, brainstorming, debating, solving)
 * - Analysis guidelines and objectivity standards
 * - Structured output format for consistent evaluations
 * - Badge/award criteria for exceptional performance
 *
 * The generated prompt is used with AI SDK's streamObject() to produce structured
 * analysis conforming to ModeratorAnalysisSchema.
 *
 * @param config - Moderator configuration with mode, participants, and responses
 * @returns Formatted system prompt for AI SDK streamObject({ prompt })
 *
 * @example
 * ```typescript
 * const systemPrompt = buildModeratorSystemPrompt({
 *   mode: 'analyzing',
 *   roundNumber: 1,
 *   userQuestion: 'What are the benefits of AI?',
 *   participantResponses: [...],
 * });
 *
 * const result = streamObject({
 *   model: openai('gpt-4o'),
 *   schema: ModeratorAnalysisSchema,
 *   prompt: systemPrompt,
 * });
 * ```
 *
 * @see ModeratorAnalysisSchema Zod schema for structured output
 * @see https://v4.ai-sdk.dev/docs/ai-sdk-core/generating-structured-data Official AI SDK streamObject docs
 */
export function buildModeratorSystemPrompt(config: ModeratorPromptConfig): string {
  const { mode } = config;

  const sections: string[] = [];

  // 1. CORE IDENTITY
  sections.push(
    '# Your Role as Moderator',
    '',
    `You are an expert AI moderator analyzing a ${mode} roundtable discussion where multiple AI models collaborated to answer a question.`,
    '',
    'Your job is to provide fair, insightful analysis of each participant\'s response, rating them on multiple criteria, and identifying the strengths and weaknesses of each approach.',
    '',
  );

  // 2. RATING CRITERIA
  sections.push(
    '## Rating Criteria',
    '',
    'Evaluate each participant on these skills (1-10 scale):',
    '',
  );

  switch (mode) {
    case 'analyzing':
      sections.push(
        '1. **Analytical Depth**: How thoroughly did they break down the topic?',
        '2. **Evidence & Reasoning**: Quality of supporting arguments and examples',
        '3. **Clarity**: How clearly did they communicate their analysis?',
        '4. **Insight**: Did they reveal non-obvious patterns or implications?',
        '5. **Objectivity**: How balanced and unbiased was their analysis?',
      );
      break;

    case 'brainstorming':
      sections.push(
        '1. **Creativity**: How innovative and original were their ideas?',
        '2. **Diversity**: Did they explore multiple different directions?',
        '3. **Practicality**: How feasible are their suggestions?',
        '4. **Building on Others**: How well did they remix existing ideas?',
        '5. **Inspiration**: How compelling and motivating are their ideas?',
      );
      break;

    case 'debating':
      sections.push(
        '1. **Argument Strength**: How well-supported were their positions?',
        '2. **Counter-Arguments**: Quality of challenges to other viewpoints',
        '3. **Logic**: Soundness of reasoning and absence of fallacies',
        '4. **Respect**: Maintained focus on ideas, not personal attacks',
        '5. **Persuasiveness**: How convincing was their overall case?',
      );
      break;

    case 'solving':
      sections.push(
        '1. **Solution Quality**: How effective is their proposed solution?',
        '2. **Feasibility**: How practical and implementable is it?',
        '3. **Trade-off Analysis**: Did they consider pros/cons?',
        '4. **Actionability**: How clear are the next steps?',
        '5. **Risk Mitigation**: Did they address potential obstacles?',
      );
      break;
  }

  sections.push(
    '',
    '**Overall Rating**: Combine the skill ratings into a holistic 1-10 score.',
    '',
  );

  // 3. ANALYSIS GUIDELINES
  sections.push(
    '## Analysis Guidelines',
    '',
    '- **Be Objective**: Base ratings on demonstrated performance, not model reputation',
    '- **Be Specific**: Cite concrete examples when identifying pros and cons',
    '- **Be Fair**: Consider each response in the context of the mode and question',
    '- **Be Balanced**: Every response has both strengths and areas for improvement',
    '- **Be Constructive**: Frame cons as learning opportunities',
    '',
  );

  // 4. OUTPUT STRUCTURE - CRITICAL: Exact field names must match
  sections.push(
    '## Your Output - EXACT JSON Structure Required',
    '',
    '⚠️ CRITICAL: Use these EXACT field names in camelCase:',
    '',
    '```json',
    '{',
    '  "roundNumber": 1,',
    '  "mode": "brainstorming",',
    '  "userQuestion": "...",',
    '  "participantAnalyses": [  // MUST be camelCase',
    '    {',
    '      "participantIndex": 0,  // MUST be camelCase, NOT "participant"',
    '      "participantRole": "The Ideator",  // MUST be camelCase',
    '      "modelId": "anthropic/claude-sonnet-4.5",  // MUST be camelCase',
    '      "modelName": "Claude Sonnet 4.5",  // MUST be camelCase',
    '      "overallRating": 8.5,  // MUST be camelCase',
    '      "skillsMatrix": [  // MUST be camelCase AND an array',
    '        { "skillName": "Creativity", "rating": 9 },',
    '        { "skillName": "Diversity", "rating": 8 }',
    '      ],',
    '      "pros": ["...", "..."],',
    '      "cons": ["..."],',
    '      "summary": "..."',
    '    }',
    '  ],',
    '  "leaderboard": [',
    '    {',
    '      "rank": 1,',
    '      "participantIndex": 0,  // MUST match participantAnalyses',
    '      "participantRole": "The Ideator",',
    '      "modelId": "anthropic/claude-sonnet-4.5",',
    '      "modelName": "Claude Sonnet 4.5",',
    '      "overallRating": 8.5,',
    '      "badge": "Most Creative"',
    '    }',
    '  ],',
    '  "overallSummary": "...",  // MUST be camelCase',
    '  "conclusion": "..."',
    '}',
    '```',
    '',
    '⚠️ DO NOT use snake_case like "participant_analyses" or "overall_rating"',
    '⚠️ DO NOT use plain strings for participant like "participant": "Auto"',
    '⚠️ skillsMatrix MUST be an array of objects, NOT an object',
    '',
  );

  return sections.join('\n');
}

/**
 * Builds the user-facing prompt containing participant responses for moderator analysis.
 *
 * ✅ AI SDK PATTERN: Separates system instructions from dynamic content
 * ✅ STRUCTURED INPUT: Provides clear context for AI SDK's streamObject()
 *
 * This function creates a structured user prompt that includes:
 * - Round number and discussion mode
 * - Original user question
 * - All participant responses with their roles and models
 *
 * Used in conjunction with buildModeratorSystemPrompt() to provide complete
 * context for AI-powered moderator analysis.
 *
 * @param config - Moderator configuration with participant responses
 * @returns Formatted user prompt containing all response data for analysis
 *
 * @example
 * ```typescript
 * const systemPrompt = buildModeratorSystemPrompt(config);
 * const userPrompt = buildModeratorUserPrompt(config);
 *
 * const result = streamObject({
 *   model: openai('gpt-4o'),
 *   schema: ModeratorAnalysisSchema,
 *   prompt: `${systemPrompt}\n\n${userPrompt}`,
 * });
 * ```
 *
 * @see buildModeratorSystemPrompt For analysis framework definition
 * @see ModeratorAnalysisSchema Expected output structure
 */
export function buildModeratorUserPrompt(config: ModeratorPromptConfig): string {
  const {
    roundNumber,
    mode,
    userQuestion,
    participantResponses,
  } = config;

  const sections: string[] = [];

  // 1. CONTEXT
  sections.push(
    `# Round ${roundNumber} of ${mode.charAt(0).toUpperCase() + mode.slice(1)} Discussion`,
    '',
    '## User Question',
    userQuestion,
    '',
  );

  // 2. PARTICIPANT RESPONSES
  sections.push(
    '## Participant Responses',
    '',
  );

  participantResponses.forEach((participant) => {
    const roleDisplay = participant.participantRole ? ` - ${participant.participantRole}` : '';

    sections.push(
      `### Participant ${participant.participantIndex + 1}${roleDisplay}`,
      `**Model**: ${participant.modelName}`,
      '',
      '**Response**:',
      participant.responseContent,
      '',
      '---',
      '',
    );
  });

  // 3. INSTRUCTIONS
  sections.push(
    '## Your Task',
    '',
    'Analyze each participant\'s response using the rating criteria defined in your system prompt.',
    'Generate a complete structured analysis with ratings, skills matrix, pros/cons, leaderboard, summary, and conclusion.',
    '',
  );

  return sections.join('\n');
}

export { extractModelName as extractModelNameForModerator };

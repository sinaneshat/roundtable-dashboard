/**
 * Moderator Analysis Service
 *
 * ✅ SINGLE SOURCE OF TRUTH: Schema now in @/api/routes/chat/schema.ts
 * ✅ ZOD-FIRST: All types inferred from Zod schemas
 * This service only contains prompt building logic for AI SDK streamObject()
 */

import { z } from '@hono/zod-openapi';

import type { ModeratorAnalysisPayload } from '@/api/routes/chat/schema';
import { CHAT_MODES } from '@/lib/config/chat-modes';
import { extractModelName } from '@/lib/utils/ai-display';

export type ModeratorAnalysis = ModeratorAnalysisPayload;

// ============================================================================
// ZOD SCHEMAS (Single Source of Truth)
// ============================================================================

/**
 * Participant response schema for moderator analysis
 */
const ParticipantResponseSchema = z.object({
  participantIndex: z.number().int().nonnegative(),
  participantRole: z.string().nullable(),
  modelId: z.string().min(1),
  modelName: z.string().min(1),
  responseContent: z.string().min(1),
});

/**
 * Changelog entry schema
 * Tracks changes that occurred before the current round
 * (participant additions/removals, role changes, mode changes, etc.)
 */
const ChangelogEntrySchema = z.object({
  changeType: z.string(),
  description: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.date(),
});

/**
 * Moderator prompt configuration schema
 * Used for building prompts for AI SDK streamObject()
 */
export const ModeratorPromptConfigSchema = z.object({
  /** Conversation mode */
  mode: z.enum(CHAT_MODES),
  /** Round number (1-indexed) */
  roundNumber: z.number().int().positive(),
  /** User's original question for THIS round */
  userQuestion: z.string().min(1),
  /** Participant responses for THIS round ONLY (round-specific analysis) */
  participantResponses: z.array(ParticipantResponseSchema).min(1),
  /** Changelog entries before this round (participant/mode/role changes) */
  changelogEntries: z.array(ChangelogEntrySchema).optional(),
});

export type ModeratorPromptConfig = z.infer<typeof ModeratorPromptConfigSchema>;

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

  // 2. RATING CRITERIA - EXACTLY 5 SKILLS FOR PENTAGON VISUALIZATION
  sections.push(
    '## Rating Criteria',
    '',
    '⚠️ CRITICAL: Evaluate each participant on EXACTLY 5 skills (1-10 scale) for pentagon radar chart visualization:',
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
    '      "skillsMatrix": [  // MUST be camelCase AND an array of EXACTLY 5 skills',
    '        { "skillName": "Creativity", "rating": 9 },',
    '        { "skillName": "Diversity", "rating": 8 },',
    '        { "skillName": "Practicality", "rating": 7 },',
    '        { "skillName": "Building on Others", "rating": 8 },',
    '        { "skillName": "Inspiration", "rating": 9 }',
    '      ],',
    '      "pros": ["...", "..."],',
    '      "cons": ["..."],',
    '      "summary": "...",',
    '',
    '      // ✅ ENHANCED METRICS: Optional but highly recommended',
    '      "responseMetrics": {  // Optional quantitative analysis',
    '        "wordCount": 342,  // Count words in the response',
    '        "sentenceCount": 18,  // Count sentences',
    '        "uniqueIdeas": 5,  // How many distinct ideas/concepts?',
    '        "examplesProvided": 3,  // How many concrete examples given?',
    '        "questionsRaised": 2,  // How many thought-provoking questions?',
    '        "referencesToOthers": 2  // How many times built on others?',
    '      },',
    '      "strengthCategories": ["Creativity", "Collaboration"],  // Key strength themes',
    '      "weaknessCategories": ["Technical Depth"],  // Key weakness themes',
    '      "detailedInsights": {  // Deeper analysis',
    '        "keyStrengths": ["Specific example of what stood out..."],',
    '        "missedOpportunities": ["What could have been stronger..."],',
    '        "uniqueContributions": ["What only this participant provided..."]',
    '      },',
    '      "comparativeInsights": {  // How they compare',
    '        "rankInRound": 2,',
    '        "scoreRelativeToAverage": 1.2,',
    '        "percentileScore": 75',
    '      }',
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
    '      "badge": "Most Creative",',
    '',
    '      // ✅ ENHANCED METRICS: Optional but adds value',
    '      "scoreBreakdown": {  // Map skills to scores',
    '        "creativity": 9,',
    '        "diversity": 8,',
    '        "practicality": 7',
    '      },',
    '      "responseMetrics": {  // Same as in participantAnalyses',
    '        "wordCount": 342,',
    '        "uniqueIdeas": 5,',
    '        "examplesProvided": 3',
    '      },',
    '      "comparative": {  // Comparative context',
    '        "percentile": 85,',
    '        "aboveAverage": true,',
    '        "scoreDifference": 1.2',
    '      },',
    '      "strengths": ["Creative thinking", "Diverse perspectives"],',
    '      "weaknesses": ["Technical depth"],',
    '      "highlights": ["Introduced 3 highly innovative concepts"]',
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
    '✅ ENHANCED FIELDS: The new optional fields (responseMetrics, comparative, etc.) provide richer insights',
    '✅ Fill these when you can - they help users understand performance in more depth',
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
    changelogEntries,
  } = config;

  const sections: string[] = [];

  // 1. CONTEXT
  sections.push(
    `# Round ${roundNumber} Analysis - ${mode.charAt(0).toUpperCase() + mode.slice(1)} Discussion`,
    '',
    '⚠️ CRITICAL: You are analyzing ONLY this round\'s participant responses.',
    'Focus your analysis, ratings, and feedback on what happened in THIS round specifically.',
    '',
    '## User Question for This Round',
    userQuestion,
    '',
  );

  // ✅ Changelog Context: Show what changed before this round
  if (changelogEntries && changelogEntries.length > 0) {
    sections.push(
      '## Recent Changes Before This Round',
      '',
      '⚠️ CONTEXT: The following changes occurred before this round started.',
      'Be aware that participants, their roles, or the conversation mode may have changed.',
      'Consider these changes when analyzing participant performance in this round.',
      '',
    );

    changelogEntries.forEach((entry, idx) => {
      const timestamp = entry.createdAt.toLocaleString();
      sections.push(
        `### Change ${idx + 1}: ${entry.changeType}`,
        `**When**: ${timestamp}`,
        `**What Changed**: ${entry.description}`,
        '',
      );

      // Add metadata if available
      if (entry.metadata && Object.keys(entry.metadata).length > 0) {
        sections.push(
          '**Details**:',
          JSON.stringify(entry.metadata, null, 2),
          '',
        );
      }
    });

    sections.push('---', '');
  }

  // 2. PARTICIPANT RESPONSES FOR CURRENT ROUND ONLY
  sections.push(
    `## Round ${roundNumber} Participant Responses`,
    '',
    '⚠️ ANALYZE ONLY THESE RESPONSES: Rate and evaluate each participant based ONLY on their performance in this round.',
    'Do not consider performance from previous rounds - focus exclusively on what happened in this round.',
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
    `⚠️ CRITICAL: Analyze ALL ${participantResponses.length} participant responses listed above. The participantAnalyses array MUST contain exactly ${participantResponses.length} entries, and the leaderboard array MUST also contain exactly ${participantResponses.length} entries - one for each participant.`,
    '',
    'Analyze each participant\'s response using the rating criteria defined in your system prompt.',
    'Generate a complete structured analysis with ratings, skills matrix, pros/cons, leaderboard, summary, and conclusion.',
    '',
    '### Enhanced Analysis Guidelines',
    '',
    '**For responseMetrics** (optional but recommended):',
    '- Count the actual words, sentences, and ideas in each response',
    '- Identify concrete examples vs abstract statements',
    '- Note how many times participant referenced or built on others',
    '- Count thought-provoking questions that advance the discussion',
    '',
    '**For strengthCategories and weaknessCategories**:',
    '- Categorize pros/cons into themes (e.g., "Creativity", "Technical Depth", "Clarity")',
    '- Use consistent category names across participants for comparison',
    '- Focus on 2-4 key categories per participant',
    '',
    '**For detailedInsights**:',
    '- keyStrengths: Cite specific examples from their response',
    '- missedOpportunities: What could have made it stronger?',
    '- uniqueContributions: What did ONLY this participant bring up?',
    '',
    '**For comparativeInsights**:',
    '- Calculate average rating across all participants first',
    '- Determine each participant\'s rank and percentile',
    '- Show how far above/below average each participant scored',
    '',
    '**For leaderboard entries**:',
    `- MUST include ALL ${participantResponses.length} participants in the leaderboard array`,
    '- Rank participants from 1 (best) to N (where N = total number of participants)',
    '- Include scoreBreakdown mapping skill names to ratings',
    '- Add comparative context (percentile, above/below average)',
    '- List 2-3 key strengths and weaknesses as short phrases',
    '- Provide 1-3 specific highlights of standout contributions',
    '',
  );

  return sections.join('\n');
}

export { extractModelName as extractModelNameForModerator };

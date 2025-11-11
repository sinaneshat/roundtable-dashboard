/**
 * Moderator Analysis Service
 *
 * ✅ SINGLE SOURCE OF TRUTH: Schema now in @/api/routes/chat/schema.ts
 * ✅ ZOD-FIRST: All types inferred from Zod schemas
 * This service only contains prompt building logic for AI SDK streamObject()
 */

import { z } from '@hono/zod-openapi';

import { CHAT_MODES } from '@/api/core/enums';
import type { ModeratorAnalysisPayload } from '@/api/routes/chat/schema';
import { getAllModels } from '@/api/services/models-config.service';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { canAccessModelByPricing } from '@/api/services/product-logic.service';
import { DEFAULT_ROLES, extractModelName } from '@/lib/utils/ai-display';

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
  /** User's subscription tier for filtering model suggestions */
  userTier: z.enum(['free', 'starter', 'pro', 'power']).optional(),
});

export type ModeratorPromptConfig = z.infer<typeof ModeratorPromptConfigSchema>;

/**
 * Builds structured system prompt for AI moderator analysis of roundtable discussions.
 *
 * ✅ SINGLE SOURCE OF TRUTH: This is THE centralized moderator prompt builder
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
    'Evaluate each participant on exactly 5 skills (1-10 scale):',
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
    '**Overall Rating**: Holistic 1-10 score combining skill ratings.',
    '',
    '## Analysis Guidelines',
    '',
    '- Base ratings on demonstrated performance, not model reputation',
    '- Cite concrete examples for pros and cons',
    '- Every response has strengths and areas for improvement',
    '',
  );

  // 3. AVAILABLE MODELS AND ROLES (FILTERED BY USER TIER)
  const allModels = getAllModels();

  // Filter models by user's subscription tier access
  const availableModels = config.userTier
    ? allModels.filter(model => canAccessModelByPricing(config.userTier as SubscriptionTier, model))
    : allModels; // If no tier provided, show all models (backward compatibility)

  const modelList = availableModels.map(m => `- ${m.id} (${m.name})`).join('\n');
  const rolesList = DEFAULT_ROLES.map(r => `- ${r}`).join('\n');

  sections.push(
    '## Available Models for Suggestions',
    '',
    `When suggesting new models to add, ONLY use model IDs from this list (based on user's subscription tier):`,
    '',
    modelList,
    '',
    '## Available Roles for Suggestions',
    '',
    'When suggesting roles for new participants, ONLY use roles from this list:',
    '',
    rolesList,
    '',
  );

  // 4. OUTPUT STRUCTURE
  sections.push(
    '## Output Structure',
    '',
    'Use camelCase field names:',
    '',
    '```json',
    '{',
    '  "roundNumber": 1,',
    '  "mode": "brainstorming",',
    '  "userQuestion": "...",',
    '  "participantAnalyses": [',
    '    {',
    '      "participantIndex": 0,',
    '      "participantRole": "The Ideator",',
    '      "modelId": "anthropic/claude-sonnet-4.5",',
    '      "modelName": "Claude Sonnet 4.5",',
    '      "overallRating": 8.5,',
    '      "skillsMatrix": [',
    '        { "skillName": "Creativity", "rating": 9 },',
    '        { "skillName": "Diversity", "rating": 8 },',
    '        { "skillName": "Practicality", "rating": 7 },',
    '        { "skillName": "Building on Others", "rating": 8 },',
    '        { "skillName": "Inspiration", "rating": 9 }',
    '      ],',
    '      "pros": ["...", "..."],',
    '      "cons": ["..."],',
    '      "summary": "..."',
    '    }',
    '  ],',
    '  "leaderboard": [',
    '    {',
    '      "rank": 1,',
    '      "participantIndex": 0,',
    '      "participantRole": "The Ideator",',
    '      "modelId": "anthropic/claude-sonnet-4.5",',
    '      "modelName": "Claude Sonnet 4.5",',
    '      "overallRating": 8.5,',
    '      "badge": "Most Creative"',
    '    }',
    '  ],',
    '',
    '  "roundSummary": {',
    '    "keyInsights": [',
    '      "All participants emphasized user-centric design as foundational",',
    '      "Technical implementation approaches varied significantly in complexity"',
    '    ],',
    '    "consensusPoints": [',
    '      "Need for modular architecture to support future growth"',
    '    ],',
    '    "divergentApproaches": [',
    '      {',
    '        "topic": "Technology Stack",',
    '        "perspectives": [',
    '          "Claude Sonnet: Favored modern microservices with containerization",',
    '          "GPT-4: Recommended monolithic approach for faster initial development",',
    '          "Gemini Pro: Suggested hybrid approach with progressive migration"',
    '        ]',
    '      }',
    '    ],',
    '    "comparativeAnalysis": {',
    '      "strengthsByCategory": [',
    '        {',
    '          "category": "Technical Depth",',
    '          "participants": ["Claude Sonnet", "Gemini Pro"]',
    '        },',
    '        {',
    '          "category": "Practical Implementation",',
    '          "participants": ["GPT-4"]',
    '        },',
    '        {',
    '          "category": "Innovation",',
    '          "participants": ["Claude Sonnet"]',
    '        }',
    '      ],',
    '      "tradeoffs": [',
    '        "Complexity vs Maintainability: More sophisticated approaches require higher expertise",',
    '        "Cost vs Performance: Premium solutions deliver better results but at higher expense",',
    '        "Speed vs Quality: Faster implementation may sacrifice long-term robustness"',
    '      ]',
    '    },',
    '    "decisionFramework": {',
    '      "criteriaToConsider": [',
    '        "Timeline constraints and urgency",',
    '        "Available technical expertise and resources",',
    '        "Long-term scalability requirements",',
    '        "Budget and cost considerations"',
    '      ],',
    '      "scenarioRecommendations": [',
    '        {',
    '          "scenario": "Startup with limited resources needing MVP quickly",',
    '          "recommendation": "Follow GPT-4\'s monolithic approach for speed, with clear migration path documented"',
    '        },',
    '        {',
    '          "scenario": "Enterprise with long-term scalability needs",',
    '          "recommendation": "Adopt Claude Sonnet\'s microservices architecture despite higher initial complexity"',
    '        }',
    '      ]',
    '    },',
    '    "overallSummary": "...",',
    '    "conclusion": "...",',
    '    "recommendedActions": [',
    '      {',
    '        "action": "Can you dive deeper into the scalability challenges of each approach? Specifically, I\'d like to understand how these solutions would handle 10x growth in users, data volume, and concurrent requests. What infrastructure bottlenecks should we anticipate?",',
    '        "rationale": "Analysis revealed gaps in infrastructure planning that need expert input",',
    '        "suggestedModels": ["openai/chatgpt-4o-latest"],',
    '        "suggestedRoles": ["Domain Expert"],',
    '        "suggestedMode": "analyzing"',
    '      },',
    '      {',
    '        "action": "I\'d like to hear a debate on the microservices versus monolithic trade-offs. What are the specific advantages and disadvantages of each approach for this use case? Which one would you choose and why?",',
    '        "rationale": "Participants showed different preferences without fully exploring implications",',
    '        "suggestedModels": [],',
    '        "suggestedRoles": [],',
    '        "suggestedMode": "debating"',
    '      },',
    '      {',
    '        "action": "What are some creative ways we could reduce infrastructure costs while maintaining performance and reliability? I\'m looking for specific optimization strategies that haven\'t been mentioned yet.",',
    '        "rationale": "Budget constraints mentioned but not thoroughly addressed",',
    '        "suggestedModels": [],',
    '        "suggestedRoles": [],',
    '        "suggestedMode": "brainstorming"',
    '      }',
    '    ]',
    '  }',
    '}',
    '```',
    '',
    '## Key Requirements',
    '',
    '1. Use camelCase, not snake_case',
    '2. skillsMatrix is an array of exactly 5 objects',
    '3. Use exact model names from participant data below - do not make up names',
    '4. Generate recommendedActions after conclusion based on identified gaps',
    '5. Write actions as user-ready prompts, not meta-suggestions',
    '6. ONLY suggest model IDs from the "Available Models" list above',
    '7. ONLY suggest roles from the "Available Roles" list above',
    '8. ONLY suggest modes from: analyzing, brainstorming, debating, solving',
    '',
    'Action examples:',
    '- Good: "Can you identify risks we haven\'t discussed? What could go wrong?"',
    '- Bad: "Explore edge cases" or "Consider risks"',
    '',
    'Model/Role suggestion examples:',
    '- Good: "suggestedModels": ["anthropic/claude-4.5-sonnet-20250929"]',
    '- Bad: "suggestedModels": ["claude-sonnet"] or ["gpt-4"]',
    '- Good: "suggestedRoles": ["Domain Expert", "Devil\'s Advocate"]',
    '- Bad: "suggestedRoles": ["expert"] or ["critic"]',
    '',
  );

  return sections.join('\n');
}

/**
 * Builds the user-facing prompt containing participant responses for moderator analysis.
 *
 * ✅ AI SDK PATTERN: Separates system instructions from dynamic content
 * ✅ STRUCTURED INPUT: Provides clear context for AI SDK's streamObject()
 * ✅ PARTICIPANT RESPONSES ONLY: Pre-search messages are filtered out before reaching this function
 *
 * This function creates a structured user prompt that includes:
 * - Round number and discussion mode
 * - Original user question
 * - All participant responses with their roles and models
 *
 * IMPORTANT: participantResponses parameter contains ONLY actual participant responses,
 * NOT web search results. Pre-search messages are filtered at the analysis handler level
 * (analysis.handler.ts) before being passed to this function. This ensures the analysis
 * evaluates participant contributions, not search result summaries.
 *
 * Used in conjunction with buildModeratorSystemPrompt() to provide complete
 * context for AI-powered moderator analysis.
 *
 * @param config - Moderator configuration with participant responses (pre-search already filtered)
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
    'Analyze only this round\'s participant responses.',
    '',
    '## User Question',
    userQuestion,
    '',
  );

  // Changelog Context
  if (changelogEntries && changelogEntries.length > 0) {
    sections.push(
      '## Recent Changes',
      '',
      'These changes occurred before this round:',
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

  // 2. PARTICIPANT RESPONSES
  sections.push(
    '## Participant Responses',
    '',
  );

  participantResponses.forEach((participant) => {
    const roleDisplay = participant.participantRole ? ` - ${participant.participantRole}` : '';

    sections.push(
      `### Participant ${participant.participantIndex + 1}${roleDisplay}`,
      `**Model ID**: ${participant.modelId}`,
      `**Model Name**: ${participant.modelName}`,
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
    `Analyze all ${participantResponses.length} participants using the rating criteria. Generate complete structured analysis with ratings, skills matrix, pros/cons, leaderboard, summary, and conclusion.`,
    '',
  );

  return sections.join('\n');
}

export { extractModelName as extractModelNameForModerator };

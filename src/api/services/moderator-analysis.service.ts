/**
 * Moderator Analysis Service
 *
 * ✅ SINGLE SOURCE OF TRUTH: Schema now in @/api/routes/chat/schema.ts
 * ✅ ZOD-FIRST: All types inferred from Zod schemas
 * ✅ ERROR HANDLING: Comprehensive error context following error-metadata.service.ts pattern
 * This service only contains prompt building logic for AI SDK streamObject()
 */

import { z } from '@hono/zod-openapi';

import { createError, normalizeError } from '@/api/common/error-handling';
import { CHAT_MODES } from '@/api/core/enums';
import type { ModeratorAnalysisPayload } from '@/api/routes/chat/schema';
import { getAllModels } from '@/api/services/models-config.service';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { canAccessModelByPricing } from '@/api/services/product-logic.service';
import type { TypedLogger } from '@/api/types/logger';
// ============================================================================
// ZOD SCHEMAS (Single Source of Truth)
// ============================================================================
import { DbChangelogDataSchema } from '@/db/schemas/chat-metadata';
import { RoundNumberSchema } from '@/lib/schemas/round-schemas';
import { DEFAULT_ROLES } from '@/lib/utils/ai-display';

export type ModeratorAnalysis = ModeratorAnalysisPayload;

/**
 * Participant response schema for moderator analysis
 */
const ParticipantResponseSchema = z.object({
  participantIndex: RoundNumberSchema,
  participantRole: z.string().nullable(),
  modelId: z.string().min(1),
  modelName: z.string().min(1),
  responseContent: z.string().min(1),
});

/**
 * Changelog entry schema
 * Tracks changes that occurred before the current round
 * (participant additions/removals, role changes, mode changes, etc.)
 *
 * ✅ ENUM-BASED PATTERN: Uses DbChangelogDataSchema discriminated union
 * Discriminates by 'type' field with values: 'participant', 'participant_role',
 * 'mode_change', 'participant_reorder', 'web_search_toggle'
 *
 * Reference: /src/db/schemas/chat-metadata.ts:315-321
 */
const ChangelogEntrySchema = z.object({
  changeType: z.string(),
  description: z.string(),
  // ✅ TYPE-SAFE: Uses existing DbChangelogDataSchema (discriminated union)
  // Replaces Record<string, unknown> with proper type safety
  metadata: DbChangelogDataSchema.nullable(),
  createdAt: z.date(),
});

/**
 * Moderator prompt configuration schema
 * Used for building prompts for AI SDK streamObject()
 */
export const ModeratorPromptConfigSchema = z.object({
  /** Conversation mode */
  mode: z.enum(CHAT_MODES),
  /** Round number (✅ 0-BASED: First round is 0) */
  roundNumber: RoundNumberSchema, // ✅ 0-BASED: Allow 0
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
 * ✅ ERROR HANDLING: Validates config and provides error context
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
 * @param logger - Optional logger for validation failures
 * @returns Formatted system prompt for AI SDK streamObject({ prompt })
 * @throws HttpException if config validation fails
 */
export function buildModeratorSystemPrompt(
  config: ModeratorPromptConfig,
  logger?: TypedLogger,
): string {
  try {
    // ✅ VALIDATION: Zod schema validation
    const validated = ModeratorPromptConfigSchema.parse(config);
    const { mode } = validated;

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
    const availableModels = validated.userTier
      ? allModels.filter(model => canAccessModelByPricing(validated.userTier as SubscriptionTier, model))
      : allModels; // If no tier provided, show all models

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

    // 4. OUTPUT STRUCTURE - Multi-AI Deliberation Framework
    sections.push(
      '## Output Structure - Multi-AI Deliberation Framework',
      '',
      'You are analyzing a collaborative AI deliberation. Generate a comprehensive analysis following this structure:',
      '',
      '**CRITICAL: ALL VALUES MUST BE DYNAMICALLY COMPUTED FROM THE ACTUAL CONVERSATION.**',
      '- roundConfidence: Calculate based on actual vote distribution and evidence quality',
      '- consensusEvolution percentages: Derive from how agreement evolved through the discussion',
      '- All scores: Base on actual participant performance, not template values',
      '',
      '```json',
      '{',
      '  "roundNumber": 0,',
      '  "mode": "debating",',
      '  "userQuestion": "What approach should we take?",',
      '',
      '  "roundConfidence": 78,',
      '  "confidenceWeighting": "balanced",',
      '',
      '  "consensusEvolution": [',
      '    { "phase": "opening", "percentage": 32, "label": "Opening" },',
      '    { "phase": "rebuttal", "percentage": 58, "label": "Rebuttal" },',
      '    { "phase": "cross_exam", "percentage": 65, "label": "Cross-Exam" },',
      '    { "phase": "synthesis", "percentage": 72, "label": "Synthesis" },',
      '    { "phase": "final_vote", "percentage": 78, "label": "Final Vote" }',
      '  ],',
      '',
      '  "summary": "High-level synthesis of the deliberation: What was decided? What are the key findings?",',
      '',
      '  "recommendations": [',
      '    {',
      '      "title": "Complete privacy audit before launch",',
      '      "description": "Prioritize closing the 35% gap in privacy compliance to eliminate primary risk vector",',
      '      "suggestedPrompt": "What specific privacy compliance gaps should we address first?",',
      '      "suggestedModels": ["anthropic/claude-sonnet-4", "openai/gpt-4o"],',
      '      "suggestedRoles": ["Security Analyst", "Privacy Expert"]',
      '    }',
      '  ],',
      '',
      '  "contributorPerspectives": [',
      '    {',
      '      "participantIndex": 0,',
      '      "role": "Innovator",',
      '      "modelId": "anthropic/claude-sonnet-4.5",',
      '      "modelName": "Claude Sonnet 4.5",',
      '      "scorecard": {',
      '        "logic": 82,',
      '        "riskAwareness": 70,',
      '        "creativity": 95,',
      '        "evidence": 88,',
      '        "consensus": 75',
      '      },',
      '      "stance": "Strong advocate for immediate launch with differentiation through privacy features",',
      '      "evidence": [',
      '        "Privacy regulations strengthening across 3 major markets",',
      '        "Competitor analysis shows feature gap"',
      '      ],',
      '      "vote": "approve"',
      '    }',
      '  ],',
      '',
      '  "consensusAnalysis": {',
      '    "alignmentSummary": {',
      '      "totalClaims": 5,',
      '      "majorAlignment": 4,',
      '      "contestedClaims": 1,',
      '      "contestedClaimsList": [',
      '        {',
      '          "claim": "Privacy framework is production-ready",',
      '          "status": "contested"',
      '        }',
      '      ]',
      '    },',
      '    "agreementHeatmap": [',
      '      {',
      '        "claim": "Market timing is favorable for launch",',
      '        "perspectives": {',
      '          "GPT-4": "agree",',
      '          "Claude-3": "agree",',
      '          "Gemini-Pro": "caution"',
      '        }',
      '      }',
      '    ],',
      '    "argumentStrengthProfile": {',
      '      "GPT-4": {',
      '        "logic": 85,',
      '        "evidence": 90,',
      '        "riskAwareness": 75,',
      '        "consensus": 80,',
      '        "creativity": 70',
      '      }',
      '    }',
      '  },',
      '',
      '  "evidenceAndReasoning": {',
      '    "reasoningThreads": [',
      '      {',
      '        "claim": "Market timing is favorable for launch",',
      '        "synthesis": "Strong consensus that Q2 2025 represents optimal market window"',
      '      }',
      '    ],',
      '    "evidenceCoverage": [',
      '      {',
      '        "claim": "Market timing is favorable for launch",',
      '        "strength": "strong",',
      '        "percentage": 95',
      '      }',
      '    ]',
      '  },',
      '',
      '  "alternatives": [',
      '    {',
      '      "scenario": "Delay launch to Q3 2025",',
      '      "confidence": 62',
      '    }',
      '  ],',
      '',
      '  "roundSummary": {',
      '    "participation": {',
      '      "approved": 3,',
      '      "cautioned": 1,',
      '      "rejected": 0',
      '    },',
      '    "keyThemes": "Board reached 78% confidence decision citing privacy audit as key consideration",',
      '    "unresolvedQuestions": [',
      '      "Can privacy audit be completed within 6-week timeline?"',
      '    ],',
      '    "generated": "2025-01-15T15:30:00Z"',
      '  }',
      '}',
      '```',
      '',
      '## Key Requirements',
      '',
      '1. **Round Confidence**: Calculate overall confidence (0-100) based on vote distribution and evidence strength',
      '2. **Consensus Evolution**: Generate 5 phases showing how consensus evolved:',
      '   - opening: Initial positions (typically low consensus, 20-40%)',
      '   - rebuttal: After counter-arguments (moderate, 40-60%)',
      '   - cross_exam: After examination (improving, 55-70%)',
      '   - synthesis: After synthesis (high, 65-80%)',
      '   - final_vote: Final consensus (matches roundConfidence)',
      '3. **Contributor Perspectives**: Score each AI on 5 dimensions (0-100): logic, riskAwareness, creativity, evidence, consensus',
      '4. **Votes**: Each contributor must vote: "approve", "caution", or "reject"',
      '5. **Claims Analysis**: Identify key claims and track agreement/disagreement across models',
      '6. **Evidence Strength**: Classify as "strong" (75%+), "moderate" (50-74%), or "weak" (<50%)',
      '7. **Alternatives**: Generate scenarios with confidence percentages',
      '8. **Participation Stats**: Count approve/caution/reject votes',
      '9. Use exact model names from participant data - do not make up names',
      '10. **Recommendations with Actionable Prompts**: Each recommendation MUST include:',
      '    - `title`: Short action title (e.g., "Deep dive on security")',
      '    - `description`: Why this matters',
      '    - `suggestedPrompt`: An actual user prompt to continue the conversation. Write it as if the user is asking a follow-up question. Example: "Can you analyze the security implications in more detail and suggest specific mitigation strategies?"',
      '    - `suggestedModels`: Array of model IDs from the Available Models list (optional)',
      '    - `suggestedRoles`: Matching roles for each model (optional)',
      '',
    );

    return sections.join('\n');
  } catch (error) {
    // ✅ LOG: Prompt generation validation failure
    if (logger) {
      logger.error('Failed to build moderator system prompt', {
        logType: 'validation',
        error: normalizeError(error),
        mode: config.mode,
        roundNumber: config.roundNumber,
      });
    }

    // ✅ ERROR CONTEXT: Validation error for prompt configuration
    throw createError.badRequest(
      'Invalid moderator prompt configuration',
      {
        errorType: 'validation',
        field: 'moderatorConfig',
      },
    );
  }
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
  // ✅ 0-BASED: roundNumber is 0-based internally, display adds +1 only in UI
  sections.push(
    `# Round Analysis - ${mode.charAt(0).toUpperCase() + mode.slice(1)} Discussion`,
    '',
    `Analyze participant responses for round ${roundNumber} (0-based indexing).`,
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

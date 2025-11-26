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
      'You are analyzing a collaborative AI deliberation. Generate a comprehensive analysis following this structure.',
      '',
      '**CRITICAL: ALL VALUES MUST BE DYNAMICALLY COMPUTED FROM THE ACTUAL CONVERSATION.**',
      '- roundConfidence: Calculate based on actual vote distribution and evidence quality',
      '- consensusEvolution percentages: Derive from how agreement evolved through the discussion',
      '- All scores: Base on actual participant performance, not template values',
      '',
      '```json',
      '{',
      '  "roundNumber": <ROUND_NUMBER_FROM_CONTEXT>,',
      '  "mode": "<MODE_FROM_CONTEXT>",',
      '  "userQuestion": "<ACTUAL_USER_QUESTION>",',
      '',
      '  "roundConfidence": <CALCULATED_0_TO_100>,',
      '  "confidenceWeighting": "<balanced|evidence_heavy|consensus_heavy|expertise_weighted>",',
      '',
      '  "consensusEvolution": [',
      '    { "phase": "opening", "percentage": <CALCULATED_INITIAL_CONSENSUS>, "label": "Opening" },',
      '    { "phase": "rebuttal", "percentage": <CALCULATED_AFTER_REBUTTALS>, "label": "Rebuttal" },',
      '    { "phase": "cross_exam", "percentage": <CALCULATED_AFTER_EXAMINATION>, "label": "Cross-Exam" },',
      '    { "phase": "synthesis", "percentage": <CALCULATED_AFTER_SYNTHESIS>, "label": "Synthesis" },',
      '    { "phase": "final_vote", "percentage": <MUST_MATCH_ROUND_CONFIDENCE>, "label": "Final Vote" }',
      '  ],',
      '',
      '  "summary": "High-level synthesis of the deliberation: What was decided? What are the key findings?",',
      '',
      '  "recommendations": [',
      '    {',
      '      "title": "<ACTIONABLE_TITLE_FROM_DISCUSSION>",',
      '      "description": "<WHY_THIS_MATTERS_BASED_ON_ANALYSIS>",',
      '      "suggestedPrompt": "<FOLLOW_UP_QUESTION_DERIVED_FROM_GAPS>",',
      '      "suggestedModels": ["<MODEL_ID_FROM_AVAILABLE_LIST>"],',
      '      "suggestedRoles": ["<ROLE_FROM_AVAILABLE_LIST>"]',
      '    }',
      '  ],',
      '',
      '  "contributorPerspectives": [',
      '    {',
      '      "participantIndex": <INDEX_FROM_PARTICIPANT_DATA>,',
      '      "role": "<ROLE_FROM_PARTICIPANT_DATA>",',
      '      "modelId": "<MODEL_ID_FROM_PARTICIPANT_DATA>",',
      '      "modelName": "<MODEL_NAME_FROM_PARTICIPANT_DATA>",',
      '      "scorecard": {',
      '        "logic": <SCORE_0_100_BASED_ON_RESPONSE>,',
      '        "riskAwareness": <SCORE_0_100_BASED_ON_RESPONSE>,',
      '        "creativity": <SCORE_0_100_BASED_ON_RESPONSE>,',
      '        "evidence": <SCORE_0_100_BASED_ON_RESPONSE>,',
      '        "consensus": <SCORE_0_100_BASED_ON_RESPONSE>',
      '      },',
      '      "stance": "<SUMMARIZE_THEIR_ACTUAL_POSITION>",',
      '      "evidence": [',
      '        "<EVIDENCE_POINT_FROM_THEIR_RESPONSE>",',
      '        "<EVIDENCE_POINT_FROM_THEIR_RESPONSE>"',
      '      ],',
      '      "vote": "<approve|caution|reject_BASED_ON_THEIR_STANCE>"',
      '    }',
      '  ],',
      '',
      '  "consensusAnalysis": {',
      '    "alignmentSummary": {',
      '      "totalClaims": <COUNT_CLAIMS_FROM_DISCUSSION>,',
      '      "majorAlignment": <COUNT_WHERE_MAJORITY_AGREES>,',
      '      "contestedClaims": <COUNT_DISPUTED_CLAIMS>,',
      '      "contestedClaimsList": [',
      '        {',
      '          "claim": "<ACTUAL_CONTESTED_CLAIM_FROM_DISCUSSION>",',
      '          "status": "contested"',
      '        }',
      '      ]',
      '    },',
      '    "agreementHeatmap": [',
      '      {',
      '        "claim": "<KEY_CLAIM_FROM_DISCUSSION>",',
      '        "perspectives": {',
      '          "<PARTICIPANT_ROLE>": "<agree|caution|disagree>",',
      '          "<PARTICIPANT_ROLE>": "<agree|caution|disagree>"',
      '        }',
      '      }',
      '    ],',
      '    "argumentStrengthProfile": {',
      '      "<PARTICIPANT_ROLE>": {',
      '        "logic": <SCORE_0_100>,',
      '        "evidence": <SCORE_0_100>,',
      '        "riskAwareness": <SCORE_0_100>,',
      '        "consensus": <SCORE_0_100>,',
      '        "creativity": <SCORE_0_100>',
      '      }',
      '    }',
      '  },',
      '',
      '  "evidenceAndReasoning": {',
      '    "reasoningThreads": [',
      '      {',
      '        "claim": "<KEY_CLAIM_FROM_DISCUSSION>",',
      '        "synthesis": "<HOW_PARTICIPANTS_REASONED_ABOUT_THIS_CLAIM>"',
      '      }',
      '    ],',
      '    "evidenceCoverage": [',
      '      {',
      '        "claim": "<CLAIM_FROM_DISCUSSION>",',
      '        "strength": "<strong|moderate|weak_BASED_ON_SUPPORT>",',
      '        "percentage": <CALCULATED_EVIDENCE_STRENGTH_0_100>',
      '      }',
      '    ]',
      '  },',
      '',
      '  "alternatives": [',
      '    {',
      '      "scenario": "<ALTERNATIVE_APPROACH_MENTIONED>",',
      '      "confidence": <CALCULATED_VIABILITY_0_100>',
      '    }',
      '  ],',
      '',
      '  "roundSummary": {',
      '    "participation": {',
      '      "approved": <COUNT_APPROVE_VOTES>,',
      '      "cautioned": <COUNT_CAUTION_VOTES>,',
      '      "rejected": <COUNT_REJECT_VOTES>',
      '    },',
      '    "keyThemes": "<SUMMARY_OF_MAIN_DISCUSSION_OUTCOMES>",',
      '    "unresolvedQuestions": [',
      '      "<QUESTION_THAT_NEEDS_FURTHER_DISCUSSION>"',
      '    ],',
      '    "generated": "<CURRENT_TIMESTAMP>"',
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

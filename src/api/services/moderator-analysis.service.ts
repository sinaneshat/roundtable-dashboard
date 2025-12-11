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
import { CHAT_MODES, ChatModes } from '@/api/core/enums';
import { getAllModels } from '@/api/services/models-config.service';
import {
  canAccessModelByPricing,
  subscriptionTierSchema,
} from '@/api/services/product-logic.service';
import type { TypedLogger } from '@/api/types/logger';
// ============================================================================
// ZOD SCHEMAS (Single Source of Truth)
// ============================================================================
import { DbChangelogDataSchema } from '@/db/schemas/chat-metadata';
import { RoundNumberSchema } from '@/lib/schemas/round-schemas';
import { DEFAULT_ROLES } from '@/lib/utils/ai-display';

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
  userTier: subscriptionTierSchema.optional(),
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
      case ChatModes.ANALYZING:
        sections.push(
          '1. **Analytical Depth**: How thoroughly did they break down the topic?',
          '2. **Evidence & Reasoning**: Quality of supporting arguments and examples',
          '3. **Clarity**: How clearly did they communicate their analysis?',
          '4. **Insight**: Did they reveal non-obvious patterns or implications?',
          '5. **Objectivity**: How balanced and unbiased was their analysis?',
        );
        break;

      case ChatModes.BRAINSTORMING:
        sections.push(
          '1. **Creativity**: How innovative and original were their ideas?',
          '2. **Diversity**: Did they explore multiple different directions?',
          '3. **Practicality**: How feasible are their suggestions?',
          '4. **Building on Others**: How well did they remix existing ideas?',
          '5. **Inspiration**: How compelling and motivating are their ideas?',
        );
        break;

      case ChatModes.DEBATING:
        sections.push(
          '1. **Argument Strength**: How well-supported were their positions?',
          '2. **Counter-Arguments**: Quality of challenges to other viewpoints',
          '3. **Logic**: Soundness of reasoning and absence of fallacies',
          '4. **Respect**: Maintained focus on ideas, not personal attacks',
          '5. **Persuasiveness**: How convincing was their overall case?',
        );
        break;

      case ChatModes.SOLVING:
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
    // ✅ TYPE-SAFE: userTier is already validated as SubscriptionTier by Zod schema
    const availableModels = validated.userTier
      ? allModels.filter(model =>
          canAccessModelByPricing(validated.userTier!, model),
        )
      : allModels; // If no tier provided, show all models

    const modelList = availableModels
      .map(m => `- ${m.id} (${m.name})`)
      .join('\n');
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

    // 4. OUTPUT STRUCTURE - Summary Article Format
    sections.push(
      '## Output Structure - Brief Summary Article',
      '',
      'Generate a CONCISE analysis as a polished summary article. Users want quick-glance insights, not lengthy reports.',
      '',
      '**IMPORTANT: Be BRIEF. Write like a journalist with a tight word count - every word must earn its place.**',
      '',
      '```json',
      '{',
      '  "roundNumber": 0,',
      '  "mode": "debating",',
      '  "userQuestion": "Should we launch the product now?",',
      '  "article": {',
      '    "headline": "Panel favors Q2 launch pending privacy audit",',
      '    "narrative": "The panel agreed on Q2 timing but flagged privacy concerns. Most support launching after a brief audit to address compliance gaps identified by the cautious voices.",',
      '    "keyTakeaway": "Proceed with Q2 launch after 6-week privacy audit."',
      '  },',
      '  "modelVoices": [',
      '    { "modelName": "Claude", "modelId": "anthropic/claude-sonnet-4", "participantIndex": 0, "role": "Analyst", "position": "Advocates launch to capture market window", "keyContribution": "Identified competitor gap", "notableQuote": null }',
      '  ],',
      '  "consensusTable": [',
      '    { "topic": "Q2 timing", "positions": [{ "modelName": "Claude", "stance": "agree", "brief": "Window closing" }], "resolution": "consensus" },',
      '    { "topic": "Privacy readiness", "positions": [{ "modelName": "Claude", "stance": "nuanced", "brief": "Needs audit" }], "resolution": "contested" }',
      '  ],',
      '  "minorityViews": [],',
      '  "convergenceDivergence": {',
      '    "convergedOn": ["Q2 is optimal window", "Privacy is differentiator"],',
      '    "divergedOn": ["Framework sufficiency"],',
      '    "evolved": [{ "point": "Timeline", "initialState": "Split", "finalState": "Q2 with audit" }]',
      '  },',
      '  "recommendations": [',
      '    { "title": "Complete privacy audit", "description": "Address gaps before launch" }',
      '  ],',
      '  "confidence": { "overall": 78, "reasoning": "Strong timing consensus, contested privacy" }',
      '}',
      '```',
      '',
      '## Key Requirements - BREVITY IS ESSENTIAL',
      '',
      '1. **Headline**: Max 15 words - capture the bottom line',
      '2. **Key Takeaway**: 1 actionable sentence - what should user do/know',
      '3. **Narrative**: 1-2 SHORT paragraphs max (NOT 4) - be concise',
      '4. **Model Voices**: 1 sentence per model - their core stance only',
      '5. **Consensus Table**: 2-3 most important topics only, not exhaustive',
      '6. **Minority Views**: Only if genuinely notable - empty array if unanimous',
      '7. **Convergence**: Keep lists short - top 2-3 points each',
      '8. **Recommendations**: Max 2-3 actionable follow-ups',
      '9. **Use EXACT model names from participant data**',
      '10. **Resolution Types**: consensus | majority | split | contested',
      '11. **Stance Types**: agree | disagree | nuanced',
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

    // ✅ BETTER ERROR CONTEXT: Show which field failed validation
    // Check for common validation failures
    const issues: string[] = [];
    if (!config.userQuestion || config.userQuestion.length === 0) {
      issues.push('userQuestion is empty');
    }
    if (
      !config.participantResponses
      || config.participantResponses.length === 0
    ) {
      issues.push('participantResponses is empty');
    }
    if (!config.mode) {
      issues.push('mode is missing');
    }
    if (config.roundNumber === undefined || config.roundNumber < 0) {
      issues.push('roundNumber is invalid');
    }

    const errorDetail
      = issues.length > 0
        ? `Validation failed: ${issues.join(', ')}`
        : error instanceof Error
          ? error.message
          : 'Unknown validation error';

    throw createError.badRequest(
      `Invalid moderator prompt configuration: ${errorDetail}`,
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
export function buildModeratorUserPrompt(
  config: ModeratorPromptConfig,
): string {
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
  sections.push('## Participant Responses', '');

  participantResponses.forEach((participant) => {
    const roleDisplay = participant.participantRole
      ? ` - ${participant.participantRole}`
      : '';

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

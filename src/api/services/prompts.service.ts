/**
 * AI SDK v5 Prompt Utilities
 *
 * Helpers for building structured system prompts and prompt templates.
 * Reduces boilerplate and ensures consistent prompt formatting.
 *
 * Key Patterns:
 * - Template-based prompt construction
 * - Variable interpolation
 * - Prompt validation
 * - Context engineering best practices
 *
 * @module api/services/prompts.service
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/prompts
 * @see exercises/05-context-engineering in AI SDK v5 course
 */

// ============================================================================
// Application-Specific Prompts - Single Source of Truth
// ============================================================================

/**
 * Title generation prompt
 * ✅ SINGLE SOURCE: Used across title-generator.service.ts and product-logic.service.ts
 * ✅ REPLACES: Inline prompt in product-logic.service.ts:670
 *
 * Used by:
 * - /src/api/services/title-generator.service.ts - Title generation
 * - /src/api/services/product-logic.service.ts - TITLE_GENERATION_CONFIG
 */
export const TITLE_GENERATION_PROMPT = 'Generate a concise, descriptive title (5 words max) for this conversation. Output only the title, no quotes or extra text.';

/**
 * Web search complexity analysis system prompt
 * ✅ SINGLE SOURCE: Used by web-search.service.ts for query generation with complexity analysis
 * ✅ REPLACES: Inline QUERY_GENERATION_SYSTEM_PROMPT in web-search.service.ts:87-113
 *
 * Used by:
 * - /src/api/services/web-search.service.ts - streamSearchQuery()
 */
export const WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT = `Expert search optimizer. Transform questions into keyword-focused queries. Return ONLY valid JSON.

**QUERY RULES (3-8 words)**:
- Remove question words (what/how/why/when/where/who)
- Extract core concepts only
- Use keywords not sentences
- Add year (2025) for current topics only

**EXAMPLES**:
"Best practices for React state?" → "React state management best practices"
"Setup Docker on Ubuntu?" → "Docker Ubuntu setup guide"
"Latest AI developments" → "AI developments 2025"

**COMPLEXITY & SOURCES**:
BASIC: Facts, definitions → 2-3 sources, "basic" depth
MODERATE: How-tos, comparisons → 4-6 sources, "advanced" depth
DEEP: Research, analysis → 7-10 sources, "advanced" depth`;

/**
 * Web search query generation user prompt template
 * ✅ SINGLE SOURCE: Used by web-search.service.ts for creating search queries
 * ✅ REPLACES: Inline prompt in web-search.service.ts:114-119
 *
 * Used by:
 * - /src/api/services/web-search.service.ts - streamSearchQuery()
 *
 * @param userMessage - The user's question to search for
 * @returns Formatted prompt for query generation
 */
export function buildWebSearchQueryPrompt(userMessage: string): string {
  return `Q: "${userMessage}"

**REQUIRED**:
- query: Keyword search (3-8 words)
- rationale: Brief reason (1 sentence)
- searchDepth: "basic" or "advanced"
- complexity: "BASIC", "MODERATE", or "DEEP"
- sourceCount: Sources needed (BASIC: 2-3, MODERATE: 4-6, DEEP: 7-10)

**OPTIONAL** (only if relevant):
- topic: "technology"/"news"/"science" etc
- timeRange: "day"/"week"/"month"/"year" (only for recent/latest requests)
- needsAnswer: "basic" or "advanced"

**EXAMPLES**:
{"query":"Van Gogh paintings style","rationale":"Art style keywords","searchDepth":"advanced","complexity":"MODERATE","sourceCount":4}
{"query":"AI developments 2025","rationale":"Current tech advances","searchDepth":"advanced","complexity":"MODERATE","sourceCount":5,"timeRange":"month"}
{"query":"React definition","rationale":"Simple factual query","searchDepth":"basic","complexity":"BASIC","sourceCount":2}

Return ONLY JSON.`;
}

/**
 * Participant default role system prompts
 * ✅ SINGLE SOURCE: Used by streaming.handler.ts for default participant system prompts
 * ✅ REPLACES: Inline prompts in streaming.handler.ts:443-446
 *
 * Used by:
 * - /src/api/routes/chat/handlers/streaming.handler.ts - Default system prompts for participants
 *
 * @param role - Optional participant role name
 * @returns Optimized system prompt for natural conversation
 */
export function buildParticipantSystemPrompt(role?: string | null): string {
  if (role) {
    return `You're ${role}. Engage naturally in this discussion, sharing your perspective and insights. Be direct, thoughtful, and conversational.`;
  }
  return `Engage naturally in this discussion. Share your thoughts, ask questions, and build on others' ideas. Be direct and conversational.`;
}

/**
 * Moderator analysis JSON structure instruction
 * ✅ CRITICAL: MUST match ModeratorAnalysisPayloadSchema exactly
 * ✅ SINGLE SOURCE: Used by analysis.handler.ts for enforcing JSON output structure
 *
 * Since we use mode:'json' (not mode:'json_schema'), the model follows this text example.
 * This structure MUST match the Zod schema in /src/api/routes/chat/schema.ts
 *
 * Used by:
 * - /src/api/routes/chat/handlers/analysis.handler.ts - Moderator analysis streaming
 *
 * @returns JSON structure template matching ModeratorAnalysisPayloadSchema
 */
export const MODERATOR_ANALYSIS_JSON_STRUCTURE = {
  roundNumber: 0, // ✅ 0-BASED: Example showing first round
  mode: 'analyzing',
  userQuestion: 'string',
  leaderboard: [{
    rank: 1,
    participantIndex: 0,
    participantRole: 'string|null',
    modelId: 'string',
    modelName: 'string',
    overallRating: 8.5,
    badge: 'string|null',
  }],
  participantAnalyses: [{
    participantIndex: 0,
    participantRole: 'string|null',
    modelId: 'string',
    modelName: 'string',
    overallRating: 8.5,
    skillsMatrix: [
      { skillName: 'Skill 1', rating: 8 },
      { skillName: 'Skill 2', rating: 7 },
      { skillName: 'Skill 3', rating: 9 },
      { skillName: 'Skill 4', rating: 6 },
      { skillName: 'Skill 5', rating: 8 },
    ],
    pros: ['string'],
    cons: ['string'],
    summary: 'string',
  }],
  roundSummary: {
    keyInsights: ['string'],
    consensusPoints: ['string'],
    divergentApproaches: [{
      topic: 'string',
      perspectives: ['string'],
    }],
    comparativeAnalysis: {
      strengthsByCategory: [{
        category: 'string',
        participants: ['string'],
      }],
      tradeoffs: ['string'],
    },
    decisionFramework: {
      criteriaToConsider: ['string'],
      scenarioRecommendations: [{
        scenario: 'string',
        recommendation: 'string',
      }],
    },
    overallSummary: 'string',
    conclusion: 'string',
    recommendedActions: [{
      action: 'string',
      rationale: 'string',
      suggestedModels: ['string'],
      suggestedRoles: ['string'],
      suggestedMode: 'string',
    }],
  },
};

/**
 * Build moderator analysis enhanced user prompt
 * ✅ SINGLE SOURCE: Creates user prompt with JSON structure instructions
 * ✅ REPLACES: Inline prompt construction in analysis.handler.ts:88-95
 *
 * Used by:
 * - /src/api/routes/chat/handlers/analysis.handler.ts - generateModeratorAnalysis()
 *
 * @param userPrompt - Base user prompt from moderator-analysis.service
 * @returns Enhanced prompt with JSON structure guidance
 */
export function buildModeratorAnalysisEnhancedPrompt(userPrompt: string): string {
  return `${userPrompt}\n\nIMPORTANT: Respond with a valid JSON object matching this exact structure. Use null for missing values:\n${JSON.stringify(MODERATOR_ANALYSIS_JSON_STRUCTURE, null, 2)}`;
}

/**
 * Moderator analysis prompts
 * ✅ NOTE: Complex moderator prompt building logic lives in:
 * - /src/api/services/moderator-analysis.service.ts - buildModeratorSystemPrompt()
 * - /src/api/services/moderator-analysis.service.ts - buildModeratorUserPrompt()
 *
 * Those functions are the SINGLE SOURCE OF TRUTH for moderator analysis prompts.
 * They handle mode-specific criteria, rating scales, badge logic, and model suggestions.
 */

// ============================================================================
// Role Template Helpers
// ============================================================================

/**
 * Create system prompt for custom participant roles
 * ✅ SINGLE SOURCE: Used for user-defined participant roles
 *
 * Used by:
 * - /src/components/chat/role-selector.tsx - Custom role system prompts
 *
 * @param roleName - The role name to create a system prompt for
 * @returns System prompt string for the role
 *
 * @example
 * createRoleSystemPrompt('Security Expert')
 * // Returns: "You are a Security Expert assistant."
 */
export function createRoleSystemPrompt(roleName: string): string {
  return `You are a ${roleName} assistant.`;
}

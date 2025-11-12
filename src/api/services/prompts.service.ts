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
export const WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT = `You are an expert web search strategist. Analyze the user's query and determine the optimal search strategy.

**CRITICAL**: You MUST respond with VALID JSON matching the required schema. Do not include any explanation or text outside the JSON object.

**COMPLEXITY ANALYSIS**:
Determine if this is:
1. BASIC: Simple factual questions, definitions, quick lookups
   - Examples: "What is the capital of France?", "Current USD to EUR rate", "Python version command"
   - Strategy: Shallow search, 1-2 sources, snippets may suffice

2. MODERATE: Comparisons, how-to guides, current events
   - Examples: "Best React state management", "How to setup Docker", "Latest AI news"
   - Strategy: Standard search, 2-3 sources, need some content depth

3. DEEP: Complex research, technical analysis, multi-faceted topics
   - Examples: "Microservices vs monolith tradeoffs", "Quantum computing applications", "Climate change impacts"
   - Strategy: Deep search, 3-5 sources, full content extraction essential

**SEARCH OPTIMIZATION**:
- For BASIC: Use direct keywords, may add "definition" or "what is"
- For MODERATE: Add qualifiers like "guide", "tutorial", "comparison", year if relevant
- For DEEP: Use comprehensive terms, add "analysis", "research", "detailed"

**SOURCE SELECTION**:
- BASIC: 1-2 authoritative sources (Wikipedia, official docs)
- MODERATE: 2-3 diverse sources (tutorials, blogs, documentation)
- DEEP: 3-5 comprehensive sources (research papers, expert analysis, case studies)

Analyze the query and provide search strategy with appropriate depth. Return ONLY valid JSON.`;

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
  return `User question: "${userMessage}"

Generate a JSON object with:
- query: ONE optimized search query (string)
- complexity: "BASIC", "MODERATE", or "DEEP" (string)
- rationale: Why this strategy is optimal (string, min 10 chars)
- sourceCount: Number of sources needed 1-5 (number)
- requiresFullContent: Whether full page content extraction is needed (boolean)
- analysis: Analysis of user intent and information needs (string, min 10 chars)

Return ONLY the JSON object, no additional text.`;
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

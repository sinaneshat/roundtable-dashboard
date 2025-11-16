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
export const WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT = `You are an expert search query optimizer. Transform user questions into search-engine-optimized queries that maximize relevance and findability.

**CRITICAL**: You MUST respond with VALID JSON matching the required schema. Do not include any explanation or text outside the JSON object.

**QUERY TRANSFORMATION RULES**:
Transform natural language questions into optimized search queries by:
1. REMOVE question words (what, how, why, when, where, who, which)
2. EXTRACT core concepts and key terms
3. ADD relevant qualifiers (guide, tutorial, comparison, best practices, 2025)
4. USE keywords instead of complete sentences
5. INCLUDE technical terms and domain-specific language
6. ADD year (2025) for current/trending topics

**TRANSFORMATION EXAMPLES**:
- "What are the best practices for React state management?" → "React state management best practices 2025 guide"
- "How do I set up Docker on Ubuntu?" → "Docker Ubuntu installation setup tutorial 2025"
- "Why should I use TypeScript?" → "TypeScript benefits advantages comparison JavaScript 2025"
- "Tell me about microservices architecture" → "microservices architecture patterns design best practices"

**COMPLEXITY ANALYSIS**:
Determine if this is:
1. BASIC: Simple factual questions, definitions, quick lookups
   - User: "What is the capital of France?" → Query: "France capital city"
   - User: "Current USD to EUR rate" → Query: "USD EUR exchange rate 2025"
   - Strategy: Shallow search, 1-2 sources, snippets may suffice

2. MODERATE: Comparisons, how-to guides, current events
   - User: "Best React state management libraries" → Query: "React state management libraries comparison 2025 Redux Zustand"
   - User: "How to setup Docker" → Query: "Docker setup installation guide tutorial 2025"
   - Strategy: Standard search, 2-3 sources, need some content depth

3. DEEP: Complex research, technical analysis, multi-faceted topics
   - User: "Microservices vs monolith tradeoffs" → Query: "microservices monolithic architecture comparison tradeoffs scalability performance"
   - User: "Quantum computing applications" → Query: "quantum computing practical applications industry use cases 2025"
   - Strategy: Deep search, 3-5 sources, full content extraction essential

**SOURCE SELECTION**:
- BASIC: 1-2 authoritative sources (Wikipedia, official docs)
- MODERATE: 2-3 diverse sources (tutorials, blogs, documentation)
- DEEP: 3-5 comprehensive sources (research papers, expert analysis, case studies)

Transform the user's question into an optimized search query and provide search strategy. Return ONLY valid JSON.`;

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

TRANSFORM this question into a search-engine-optimized query following the transformation rules above.

Generate a JSON object with ALL fields for MAXIMUM Tavily-style search capabilities:

**REQUIRED FIELDS**:
- query: ONE optimized search query (string) - MUST be transformed from the user's natural language question into keyword-based search terms
- complexity: "BASIC", "MODERATE", or "DEEP" (string)
- rationale: Why this search strategy and transformation is optimal (string, min 10 chars)
- analysis: Analysis of user intent and information needs (string, min 10 chars)

**ADVANCED TAVILY PARAMETERS** (Choose optimal values):
- sourceCount: Number of sources needed 1-10 (number) - Scale based on query complexity
  * BASIC: 2-3 sources
  * MODERATE: 3-5 sources
  * DEEP: 5-10 sources

- searchDepth: "basic" or "advanced" (string)
  * "basic": Quick search, snippets only
  * "advanced": Deep content extraction with full text

- requiresFullContent: Whether full page content extraction is needed (boolean)
  * true for: research, analysis, comparisons, technical docs, detailed guides
  * false for: facts, news, simple questions, definitions

- chunksPerSource: Number of content chunks per source 1-3 (number)
  * 1: Single best excerpt per source (quick research)
  * 2: Two key sections per source (moderate depth)
  * 3: Multiple excerpts for comprehensive analysis

- topic: Topic category (string, optional) - Choose from:
  * "general", "news", "finance", "science", "technology", "health", "sports", "entertainment"

- timeRange: Time relevance (string, optional) - Choose from:
  * "day" (24 hours), "week", "month", "year", "anytime"
  * Use "day"/"week" for: current events, trending topics, news
  * Use "month"/"year" for: recent developments, 2025 content
  * Use "anytime" for: timeless concepts, historical info

- needsAnswer: AI-generated answer summary (string or boolean)
  * "basic": Quick summary answer
  * "advanced": Comprehensive synthesis with citations
  * false: No answer generation (raw results only)
  * DEFAULT to "advanced" for research questions, "basic" for simple queries

**OPTIMIZATION RULES**:
1. The "query" field should NOT be the same as the user's question. Transform it into search-optimized keywords.
2. Scale sourceCount based on complexity: more sources = better coverage
3. Use searchDepth "advanced" for research/analysis, "basic" for quick lookups
4. Set chunksPerSource higher (2-3) for comprehensive research
5. Auto-detect topic from user question (tech, news, science, etc.)
6. Auto-detect timeRange if user mentions "latest", "recent", "current", "2025", etc.
7. Generate AI answers ("basic" or "advanced") for most queries - helps users quickly understand results

**EXAMPLES**:
User: "What are Van Gogh paintings like?"
{
  "query": "Van Gogh paintings style characteristics famous works",
  "complexity": "MODERATE",
  "rationale": "Art history query needs multiple authoritative sources",
  "sourceCount": 4,
  "searchDepth": "advanced",
  "requiresFullContent": true,
  "chunksPerSource": 2,
  "topic": "entertainment",
  "timeRange": "anytime",
  "needsAnswer": "advanced",
  "analysis": "User seeks understanding of Van Gogh's artistic style and notable works"
}

User: "Latest AI developments 2025"
{
  "query": "AI developments 2025 latest breakthroughs artificial intelligence",
  "complexity": "DEEP",
  "rationale": "Current tech research needs comprehensive recent sources",
  "sourceCount": 7,
  "searchDepth": "advanced",
  "requiresFullContent": true,
  "chunksPerSource": 3,
  "topic": "technology",
  "timeRange": "month",
  "needsAnswer": "advanced",
  "analysis": "User wants comprehensive overview of cutting-edge AI progress"
}

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

/**
 * Search Context Builder Service
 *
 * **BACKEND SERVICE**: Builds search context strings for LLM system prompts
 * Following backend-patterns.md: Service layer for business logic, reusable utilities
 *
 * **PURPOSE**:
 * - Consolidates search context building logic from streaming.handler.ts:826-933
 * - Provides type-safe context generation with Zod validation
 * - Handles different strategies for current vs previous round results
 *
 * **CONSOLIDATION NOTES**:
 * - Replaces inline context building in streaming.handler.ts:863-924
 * - Separates concerns: type guards in message-type-guards.ts, context building here
 * - ✅ ZOD-FIRST: All types imported from schema.ts (Single Source of Truth)
 *
 * @module api/services/search-context-builder
 */

import type {
  SearchContextOptions,
  ValidatedPreSearchData,
} from '@/api/routes/chat/schema';
import type { ChatMessage } from '@/db/validation';
import { PreSearchMetadataSchema } from '@/lib/schemas/message-metadata';
import { getRoundNumber } from '@/lib/utils/metadata';
import { isObject } from '@/lib/utils/type-guards';

import { filterDbToPreSearchMessages } from './message-type-guards';

// ============================================================================
// Type Definitions (imported from schema.ts - no manual definitions)
// ============================================================================

export type { SearchContextOptions, ValidatedPreSearchData };

// ============================================================================
// Main Context Builder
// ============================================================================

/**
 * Build search context string from pre-search messages
 *
 * Consolidates search context building logic from streaming handler.
 * Uses type-safe filtering and Zod validation for metadata extraction.
 *
 * **CONTEXT STRATEGY**:
 * - Current round: Full search results with all website contents
 * - Previous rounds: Summary/analysis only (to avoid context bloat)
 *
 * **REPLACES**: streaming.handler.ts:863-924
 *
 * @param allMessages - All messages from thread (includes pre-search and conversation)
 * @param options - Configuration for context building (round number, detail level)
 * @returns Formatted search context string for system prompt, or empty string if no results
 *
 * @example
 * ```typescript
 * // In streaming.handler.ts
 * const searchContext = buildSearchContext(previousDbMessages, {
 *   currentRoundNumber: roundNumber,
 *   includeFullResults: true, // Full details for current round
 * });
 *
 * // Add to system prompt
 * if (searchContext) {
 *   systemPrompt = `${systemPrompt}${searchContext}`;
 * }
 * ```
 */
export function buildSearchContext(
  allMessages: ChatMessage[],
  options: SearchContextOptions,
): string {
  const { currentRoundNumber, includeFullResults = true } = options;

  // Filter to only pre-search messages (type-safe)
  const preSearchMessages = filterDbToPreSearchMessages(allMessages);

  if (preSearchMessages.length === 0) {
    return '';
  }

  let searchContext = '\n\n## Web Search Context\n\n';

  // Process each round's search results
  for (const preSearchMsg of preSearchMessages) {
    // Extract and validate pre-search metadata
    const validatedData = extractValidatedPreSearchData(preSearchMsg);
    if (!validatedData)
      continue; // Skip invalid metadata

    // ✅ TYPE-SAFE: Use metadata utility instead of force cast
    const msgRoundNumber = getRoundNumber(preSearchMsg.metadata) || 0;
    const isCurrentRound = msgRoundNumber === currentRoundNumber;

    if (isCurrentRound && includeFullResults) {
      // Current round: Full search results with all details
      searchContext += buildCurrentRoundSearchContext(validatedData);
    } else {
      // Previous rounds: Summary/analysis only
      searchContext += buildPreviousRoundSearchContext(msgRoundNumber, validatedData);
    }
  }

  return `${searchContext}\n`;
}

// ============================================================================
// Context Building Helpers
// ============================================================================

/**
 * Extract and validate pre-search data from message metadata
 *
 * Uses Zod validation to ensure metadata structure is correct.
 * Returns null if validation fails (prevents runtime errors).
 *
 * @param message - Database message with pre-search metadata
 * @returns Validated pre-search data or null if invalid
 */
function extractValidatedPreSearchData(
  message: ChatMessage,
): ValidatedPreSearchData | null {
  // ✅ TYPE-SAFE: Use type guard instead of force cast
  if (!isObject(message.metadata) || !message.metadata.preSearch)
    return null;

  const metadata = message.metadata;

  // Validate with Zod schema
  const validation = PreSearchMetadataSchema.safeParse(metadata.preSearch);
  if (!validation.success)
    return null;

  return validation.data;
}

/**
 * Build search context for current round
 *
 * Provides full details: queries, AI summaries, sources with content snippets.
 * This gives participants maximum context for the current question.
 *
 * **REPLACES**: streaming.handler.ts:887-907
 *
 * @param preSearch - Validated pre-search data
 * @returns Formatted context string with full details
 */
function buildCurrentRoundSearchContext(preSearch: ValidatedPreSearchData): string {
  let context = '### Current Round Search Results\n\n';
  context += 'The following information was gathered from web searches to help answer the current question:\n\n';

  for (const searchResult of preSearch.results) {
    context += `**Search Query:** "${searchResult.query}"\n\n`;

    if (searchResult.answer) {
      context += `**AI Summary:** ${searchResult.answer}\n\n`;
    }

    context += '**Sources:**\n\n';
    // Limit to top 3 results for context window management
    for (const result of searchResult.results.slice(0, 3)) {
      context += `- **${result.title}**\n`;
      context += `  URL: ${result.url}\n`;
      // Limit content snippet to 200 chars
      context += `  ${result.content.slice(0, 200)}...\n\n`;
    }
  }

  context += '\nUse this information to provide an accurate, well-sourced response. ';
  context += 'Cite specific sources when referencing search results.\n\n';

  return context;
}

/**
 * Build search context for previous rounds
 *
 * Provides summary/analysis only (no full website contents).
 * This prevents context bloat while maintaining search history awareness.
 *
 * **REPLACES**: streaming.handler.ts:908-920
 *
 * @param roundNumber - Round number for labeling
 * @param preSearch - Validated pre-search data
 * @returns Formatted context string with summary only
 */
function buildPreviousRoundSearchContext(
  roundNumber: number,
  preSearch: ValidatedPreSearchData,
): string {
  let context = `### Round ${roundNumber} Search Summary\n\n`;

  if (preSearch.analysis) {
    // Use AI-generated analysis as summary
    context += `${preSearch.analysis}\n\n`;
  } else {
    // Fallback: list queries and basic stats
    context += `Searched ${preSearch.results.length} ${preSearch.results.length === 1 ? 'query' : 'queries'}: `;
    context += preSearch.results.map(r => `"${r.query}"`).join(', ');
    context += '\n\n';
  }

  return context;
}

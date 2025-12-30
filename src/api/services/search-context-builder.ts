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
import { DbPreSearchDataSchema, isPreSearchMessageMetadata } from '@/db/schemas/chat-metadata';
import type { ChatMessage } from '@/db/validation';
import { getRoundNumber } from '@/lib/utils';

import { filterDbToPreSearchMessages } from './message-type-guards';

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
  // ✅ TYPE-SAFE: Check if metadata exists and is not null
  if (!message.metadata)
    return null;

  // ✅ TYPE-SAFE: Use type guard to narrow to pre-search metadata
  if (!isPreSearchMessageMetadata(message.metadata))
    return null;

  // ✅ TYPE-SAFE: Now TypeScript knows metadata has preSearch property
  const validation = DbPreSearchDataSchema.safeParse(message.metadata.preSearch);
  if (!validation.success)
    return null;

  return validation.data;
}

/**
 * Build search context for current round
 *
 * ✅ TAVILY PATTERN: Expose ALL raw data directly to participants
 * No summarization - participants synthesize from raw scraped content
 *
 * **KEY CHANGES**:
 * - Prioritize rawContent (markdown) over content (text)
 * - Include ALL scraped results, not just top 3
 * - Include full metadata for citation
 * - No AI summary - participants generate their own
 *
 * @param preSearch - Validated pre-search data
 * @returns Formatted context string with full raw data
 */
function buildCurrentRoundSearchContext(preSearch: ValidatedPreSearchData): string {
  let context = '### Web Search Results\n\n';
  context += 'The following raw content was scraped from web sources. Use this information directly to formulate your response:\n\n';

  for (const searchResult of preSearch.results) {
    context += `---\n**Search Query:** "${searchResult.query}"\n\n`;

    // ✅ EXPOSE ALL RESULTS: Don't limit - let participants see everything
    for (let i = 0; i < searchResult.results.length; i++) {
      const result = searchResult.results[i];
      if (!result)
        continue;

      context += `#### Source ${i + 1}: ${result.title}\n`;
      context += `**URL:** ${result.url}\n`;
      if (result.domain) {
        context += `**Domain:** ${result.domain}\n`;
      }
      if (result.publishedDate) {
        context += `**Published:** ${result.publishedDate}\n`;
      }

      // ✅ METADATA: Include all available metadata
      if (result.metadata) {
        const meta: string[] = [];
        if (result.metadata.author)
          meta.push(`Author: ${result.metadata.author}`);
        if (result.metadata.wordCount)
          meta.push(`${result.metadata.wordCount.toLocaleString()} words`);
        if (result.metadata.readingTime)
          meta.push(`${result.metadata.readingTime} min read`);
        if (result.metadata.description)
          meta.push(`Description: ${result.metadata.description}`);
        if (meta.length > 0) {
          context += `**Metadata:** ${meta.join(' | ')}\n`;
        }
      }

      // ✅ RAW CONTENT PRIORITY: Prefer rawContent (markdown) > fullContent > content > excerpt
      // rawContent is scraped markdown, fullContent is extracted text, content is truncated
      const rawData = result.rawContent || result.fullContent || result.content || result.excerpt || '';

      if (rawData) {
        context += '\n**Raw Content:**\n```\n';
        context += rawData;
        context += '\n```\n\n';
      }
    }
  }

  context += '---\n\n**Instructions:** Synthesize the above raw data to answer the user\'s question. ';
  context += 'Cite sources with URLs when referencing specific information.\n\n';

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
  // ✅ 0-BASED: roundNumber is 0-based, add +1 for display
  let context = `### Round ${roundNumber + 1} Search Summary (internal: ${roundNumber})\n\n`;

  if (preSearch.summary) {
    // Use AI-generated summary
    context += `${preSearch.summary}\n\n`;
  } else {
    // Fallback: list queries and basic stats
    context += `Searched ${preSearch.results.length} ${preSearch.results.length === 1 ? 'query' : 'queries'}: `;
    context += preSearch.results.map(r => `"${r.query}"`).join(', ');
    context += '\n\n';
  }

  return context;
}

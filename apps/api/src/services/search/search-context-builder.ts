import { CitationSourcePrefixes, CitationSourceTypes } from '@roundtable/shared/enums';

import { isPreSearchMessageMetadata } from '@/db/schemas/chat-metadata';
import { rlog } from '@/lib/utils/dev-logger';
import type { ChatMessage } from '@/db/validation';
import { getRoundNumber } from '@/lib/utils';
import {
  ValidatedPreSearchDataSchema,
  type SearchContextOptions,
  type ValidatedPreSearchData,
} from '@/routes/chat/schema';
import { filterDbToPreSearchMessages } from '@/services/messages';
import type { CitableSource, CitationSourceMap } from '@/types/citations';

/**
 * Result from building search context with citation support
 */
export type SearchContextResult = {
  formattedPrompt: string;
  citableSources: CitableSource[];
  sourceMap: CitationSourceMap;
};

/**
 * Generate a citation ID for a search result
 */
function generateSearchCitationId(queryIndex: number, resultIndex: number): string {
  const uniqueId = `q${queryIndex}r${resultIndex}`;
  return `${CitationSourcePrefixes[CitationSourceTypes.SEARCH]}_${uniqueId}`;
}

/**
 * Build search context with citation support
 * Returns both the formatted prompt and citable sources for the source map
 */
export function buildSearchContextWithCitations(
  allMessages: ChatMessage[],
  options: SearchContextOptions,
): SearchContextResult {
  const citableSources: CitableSource[] = [];
  const sourceMap: CitationSourceMap = new Map();

  const preSearchMessages = filterDbToPreSearchMessages(allMessages);

  // ✅ DEBUG: Log filter results
  rlog.presearch('filter-result', `totalMsgs=${allMessages.length} preSearchMsgs=${preSearchMessages.length}`);

  if (preSearchMessages.length === 0) {
    rlog.presearch('filter-empty', `no pre-search messages found in ${allMessages.length} total messages`);
    return { citableSources, formattedPrompt: '', sourceMap };
  }

  const { currentRoundNumber, includeFullResults = true } = options;

  // ✅ PERF: Use array collect pattern instead of string += (O(n) vs O(n²))
  const contextParts: string[] = ['\n\n## Web Search Context\n\n'];

  for (const preSearchMsg of preSearchMessages) {
    const validatedData = extractValidatedPreSearchData(preSearchMsg);
    if (!validatedData) {
      rlog.presearch('extract-skip', `msgId=${preSearchMsg.id.slice(-8)} - validation failed`);
      continue;
    }

    const msgRoundNumber = getRoundNumber(preSearchMsg.metadata) || 0;
    const isCurrentRound = msgRoundNumber === currentRoundNumber;
    rlog.presearch('round-check', `msgId=${preSearchMsg.id.slice(-8)} msgRound=${msgRoundNumber} currentRound=${currentRoundNumber} isCurrent=${isCurrentRound} results=${validatedData.results.length}`);

    if (isCurrentRound && includeFullResults) {
      const result = buildCurrentRoundSearchContextWithCitations(validatedData);
      contextParts.push(result.content);
      rlog.presearch('current-round-content', `msgId=${preSearchMsg.id.slice(-8)} contentLen=${result.content.length} sourcesAdded=${result.sources.length}`);

      // Add sources to collections
      for (const source of result.sources) {
        citableSources.push(source);
        sourceMap.set(source.id, source);
      }
    } else {
      const prevContent = buildPreviousRoundSearchContext(msgRoundNumber, validatedData);
      contextParts.push(prevContent);
      rlog.presearch('prev-round-content', `msgId=${preSearchMsg.id.slice(-8)} round=${msgRoundNumber} contentLen=${prevContent.length}`);
    }
  }

  // Add citation instructions if there are citable sources
  if (citableSources.length > 0) {
    // Build source list for emphasis
    const sourceList = citableSources
      .slice(0, 10)
      .map(s => `  • "${s.title}" → cite as [${s.id}]`)
      .join('\n');

    contextParts.push(
      '\n## 🚨 MANDATORY: Web Search Citation Requirements\n\n',
      '**YOU MUST CITE web search results when using their information. This is NOT optional.**\n\n',
      '### Available Sources to Cite:\n',
      sourceList,
      '\n\n',
      '### Citation Rules (MUST FOLLOW):\n\n',
      '1. **EVERY fact from search results needs a citation**\n',
      '   When you state ANY information from the web search, add [sch_qXrY] immediately after.\n\n',
      '2. **Use the EXACT citation format: [sch_qXrY]**\n',
      `   Format: [sch_q0r0], [sch_q0r1], etc. Example: "${citableSources[0]?.id || 'sch_q0r0'}"\n\n`,
      '3. **Quote or paraphrase specific content**\n',
      '   Don\'t just cite - show WHAT you\'re citing from the search result.\n\n',
      '### Correct Citation Examples:\n\n',
      '✅ GOOD (shows specific content + citation):\n',
      `- "According to ${citableSources[0]?.metadata?.domain || 'the source'}, the latest version is 2.0 [${citableSources[0]?.id || 'sch_q0r0'}]."\n`,
      `- "The article states: 'This feature was released in January 2024' [${citableSources[0]?.id || 'sch_q0r0'}]."\n\n`,
      '❌ BAD (no citation):\n',
      '- "The latest version is 2.0." ← MISSING CITATION\n',
      '- "Based on my search, it was released recently." ← NOT SPECIFIC\n\n',
      '---\n',
      '**Remember: NO citation = INCOMPLETE RESPONSE. Always cite your web search sources.**\n\n',
    );
  }

  return { citableSources, formattedPrompt: contextParts.join(''), sourceMap };
}

/**
 * Build current round search context with citation markers
 * Returns both formatted content and citable sources
 */
function buildCurrentRoundSearchContextWithCitations(
  preSearch: ValidatedPreSearchData,
): { content: string; sources: CitableSource[] } {
  const sources: CitableSource[] = [];
  // ✅ PERF: Use array collect pattern instead of string += (O(n) vs O(n²))
  const parts: string[] = [
    '### Web Search Results\n\n',
    'The following content was retrieved from web sources. Reference information using the provided citation IDs:\n\n',
  ];

  // ✅ DEBUG: Log pre-search data structure
  rlog.presearch('build-current', `resultsCount=${preSearch.results.length} queriesCount=${preSearch.queries.length}`);

  let queryIndex = 0;
  for (const searchResult of preSearch.results) {
    parts.push(`---\n**Search Query:** "${searchResult.query}"\n\n`);
    rlog.presearch('build-query', `q${queryIndex} query="${searchResult.query.slice(0, 50)}" itemCount=${searchResult.results.length}`);

    for (let resultIndex = 0; resultIndex < searchResult.results.length; resultIndex++) {
      const result = searchResult.results[resultIndex];
      if (!result) {
        continue;
      }

      const citationId = generateSearchCitationId(queryIndex, resultIndex);
      // ✅ DEBUG: Log content availability
      rlog.presearch('build-item', `${citationId} title="${result.title.slice(0, 30)}" hasRaw=${!!result.rawContent} hasFull=${!!result.fullContent} hasContent=${!!result.content} len=${(result.rawContent || result.fullContent || result.content || '').length}`);

      // Add to citable sources
      const rawData = result.rawContent || result.fullContent || result.content || result.excerpt || '';
      sources.push({
        content: rawData.slice(0, 500),
        id: citationId,
        metadata: {
          author: result.metadata?.author ?? undefined,
          description: result.metadata?.description ?? undefined,
          domain: result.domain ?? undefined,
          publishedDate: result.publishedDate ?? undefined,
          query: searchResult.query,
          readingTime: result.metadata?.readingTime ?? undefined,
          url: result.url,
          wordCount: result.metadata?.wordCount ?? undefined,
        },
        sourceId: `${queryIndex}_${resultIndex}`,
        title: result.title,
        type: CitationSourceTypes.SEARCH,
      });

      // Build context with citation ID
      parts.push(`#### [${citationId}] ${result.title}\n`);
      parts.push(`**URL:** ${result.url}\n`);
      if (result.domain) {
        parts.push(`**Domain:** ${result.domain}\n`);
      }
      if (result.publishedDate) {
        parts.push(`**Published:** ${result.publishedDate}\n`);
      }

      if (result.metadata) {
        const meta: string[] = [];
        if (result.metadata.author) {
          meta.push(`Author: ${result.metadata.author}`);
        }
        if (result.metadata.wordCount) {
          meta.push(`${result.metadata.wordCount.toLocaleString()} words`);
        }
        if (result.metadata.readingTime) {
          meta.push(`${result.metadata.readingTime} min read`);
        }
        if (result.metadata.description) {
          meta.push(`Description: ${result.metadata.description}`);
        }
        if (meta.length > 0) {
          parts.push(`**Metadata:** ${meta.join(' | ')}\n`);
        }
      }

      if (rawData) {
        parts.push('\n**Content:**\n```\n', rawData, '\n```\n\n');
      }
    }
    queryIndex++;
  }

  parts.push('---\n\n');

  return { content: parts.join(''), sources };
}

function extractValidatedPreSearchData(
  message: ChatMessage,
): ValidatedPreSearchData | null {
  if (!message.metadata) {
    rlog.presearch('extract-fail', 'no metadata');
    return null;
  }

  if (!isPreSearchMessageMetadata(message.metadata)) {
    rlog.presearch('extract-fail', `not presearch metadata, keys=${Object.keys(message.metadata).join(',')}`);
    return null;
  }

  // ✅ FIX: Use ValidatedPreSearchDataSchema instead of DbPreSearchDataSchema
  // ValidatedPreSearchDataSchema includes rawContent, fullContent, metadata, etc.
  // DbPreSearchDataSchema was missing these fields, causing data loss
  const validation = ValidatedPreSearchDataSchema.safeParse(message.metadata.preSearch);
  if (!validation.success) {
    // Log validation errors to help debug schema mismatches
    const errors = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    rlog.presearch('extract-fail', `validation failed: ${errors.slice(0, 300)}`);
    return null;
  }

  rlog.presearch('extract-ok', `results=${validation.data.results.length} queries=${validation.data.queries.length}`);
  return validation.data;
}

function buildPreviousRoundSearchContext(
  roundNumber: number,
  preSearch: ValidatedPreSearchData,
): string {
  // ✅ PERF: Use array collect pattern instead of string += (O(n) vs O(n²))
  const parts: string[] = [`### Round ${roundNumber + 1} Search Summary (internal: ${roundNumber})\n\n`];

  if (preSearch.summary) {
    parts.push(`${preSearch.summary}\n\n`);
  } else {
    parts.push(
      `Searched ${preSearch.results.length} ${preSearch.results.length === 1 ? 'query' : 'queries'}: `,
      preSearch.results.map(r => `"${r.query}"`).join(', '),
      '\n\n',
    );
  }

  return parts.join('');
}

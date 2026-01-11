import type {
  SearchContextOptions,
  ValidatedPreSearchData,
} from '@/api/routes/chat/schema';
import { filterDbToPreSearchMessages } from '@/api/services/messages';
import { DbPreSearchDataSchema, isPreSearchMessageMetadata } from '@/db/schemas/chat-metadata';
import type { ChatMessage } from '@/db/validation';
import { getRoundNumber } from '@/lib/utils';

export function buildSearchContext(
  allMessages: ChatMessage[],
  options: SearchContextOptions,
): string {
  const { currentRoundNumber, includeFullResults = true } = options;

  const preSearchMessages = filterDbToPreSearchMessages(allMessages);

  if (preSearchMessages.length === 0) {
    return '';
  }

  let searchContext = '\n\n## Web Search Context\n\n';

  for (const preSearchMsg of preSearchMessages) {
    const validatedData = extractValidatedPreSearchData(preSearchMsg);
    if (!validatedData)
      continue;

    const msgRoundNumber = getRoundNumber(preSearchMsg.metadata) || 0;
    const isCurrentRound = msgRoundNumber === currentRoundNumber;

    if (isCurrentRound && includeFullResults) {
      searchContext += buildCurrentRoundSearchContext(validatedData);
    } else {
      searchContext += buildPreviousRoundSearchContext(msgRoundNumber, validatedData);
    }
  }

  return `${searchContext}\n`;
}

function extractValidatedPreSearchData(
  message: ChatMessage,
): ValidatedPreSearchData | null {
  if (!message.metadata)
    return null;

  if (!isPreSearchMessageMetadata(message.metadata))
    return null;

  const validation = DbPreSearchDataSchema.safeParse(message.metadata.preSearch);
  if (!validation.success)
    return null;

  return validation.data;
}

function buildCurrentRoundSearchContext(preSearch: ValidatedPreSearchData): string {
  let context = '### Web Search Results\n\n';
  context += 'The following raw content was scraped from web sources. Use this information directly to formulate your response:\n\n';

  for (const searchResult of preSearch.results) {
    context += `---\n**Search Query:** "${searchResult.query}"\n\n`;

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

function buildPreviousRoundSearchContext(
  roundNumber: number,
  preSearch: ValidatedPreSearchData,
): string {
  let context = `### Round ${roundNumber + 1} Search Summary (internal: ${roundNumber})\n\n`;

  if (preSearch.summary) {
    context += `${preSearch.summary}\n\n`;
  } else {
    context += `Searched ${preSearch.results.length} ${preSearch.results.length === 1 ? 'query' : 'queries'}: `;
    context += preSearch.results.map(r => `"${r.query}"`).join(', ');
    context += '\n\n';
  }

  return context;
}

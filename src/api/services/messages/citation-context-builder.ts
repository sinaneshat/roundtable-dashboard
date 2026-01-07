/**
 * Citation Context Builder Service
 *
 * Following backend-patterns.md: Service layer for business logic
 *
 * Builds citable context from project sources:
 * - Assigns unique source IDs (mem_abc123, thd_xyz456, etc.)
 * - Formats context in clean XML for AI consumption
 * - Creates source maps for citation resolution
 */

import type { CitationSourceType } from '@/api/core/enums';
import {
  CITATION_SOURCE_TYPES,
  CitationSourceContentLimits,
  CitationSourceLabels,
  CitationSourcePrefixes,
  CitationSourceTypes,
} from '@/api/core/enums';
import type { AggregatedProjectContext, ProjectContextParams } from '@/api/services/context';
import { getAggregatedProjectContext } from '@/api/services/context';
import type { CitableContextResult, CitableSource, CitationSourceMap } from '@/api/types/citations';

// ============================================================================
// Types
// ============================================================================

export type CitableContextParams = ProjectContextParams & {
  includeAttachments?: boolean;
};

// ============================================================================
// Helpers
// ============================================================================

function generateSourceId(type: CitationSourceType, sourceId: string): string {
  return `${CitationSourcePrefixes[type]}_${sourceId.slice(0, 8)}`;
}

// ============================================================================
// Context Building
// ============================================================================

/**
 * Build citable sources from memories
 */
function buildMemorySources(
  memories: AggregatedProjectContext['memories'],
): CitableSource[] {
  return memories.memories.map(memory => ({
    id: generateSourceId(CitationSourceTypes.MEMORY, memory.id),
    type: CitationSourceTypes.MEMORY,
    sourceId: memory.id,
    title: memory.summary || memory.content.slice(0, 50),
    content: memory.content,
    metadata: {
      threadId: memory.sourceThreadId || undefined,
      importance: memory.importance,
    },
  }));
}

/**
 * Build citable sources from thread messages
 */
function buildThreadSources(
  chats: AggregatedProjectContext['chats'],
): CitableSource[] {
  const sources: CitableSource[] = [];

  for (const thread of chats.threads) {
    // Create one source per thread with combined message context
    const messageContent = thread.messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    if (messageContent.trim()) {
      sources.push({
        id: generateSourceId(CitationSourceTypes.THREAD, thread.id),
        type: CitationSourceTypes.THREAD,
        sourceId: thread.id,
        title: thread.title,
        content: messageContent,
        metadata: {
          threadId: thread.id,
          threadTitle: thread.title,
          roundNumber: thread.messages[0]?.roundNumber,
        },
      });
    }
  }

  return sources;
}

/**
 * Build citable sources from pre-search results
 */
function buildSearchSources(
  searches: AggregatedProjectContext['searches'],
): CitableSource[] {
  return searches.searches.map((search) => {
    const content = search.results
      .map(r => `Query: ${r.query}\nAnswer: ${r.answer || 'N/A'}`)
      .join('\n\n');

    // Create unique ID from threadId + roundNumber
    const uniqueId = `${search.threadId}_r${search.roundNumber}`;

    return {
      id: generateSourceId(CitationSourceTypes.SEARCH, uniqueId),
      type: CitationSourceTypes.SEARCH,
      sourceId: uniqueId,
      title: `Search: "${search.userQuery}"`,
      content: search.summary || content,
      metadata: {
        threadId: search.threadId,
        threadTitle: search.threadTitle,
        roundNumber: search.roundNumber,
      },
    };
  });
}

/**
 * Build citable sources from moderators
 */
function buildModeratorSources(
  moderators: AggregatedProjectContext['moderators'],
): CitableSource[] {
  return moderators.moderators.map((moderator) => {
    const content = [
      `Question: ${moderator.userQuestion}`,
      `Moderator: ${moderator.moderator}`,
      moderator.recommendations.length > 0
        ? `Recommendations: ${moderator.recommendations.join(', ')}`
        : '',
      moderator.keyThemes ? `Key Themes: ${moderator.keyThemes}` : '',
    ].filter(Boolean).join('\n');

    // Create unique ID from threadId + roundNumber
    const uniqueId = `${moderator.threadId}_r${moderator.roundNumber}`;

    return {
      id: generateSourceId(CitationSourceTypes.MODERATOR, uniqueId),
      type: CitationSourceTypes.MODERATOR,
      sourceId: uniqueId,
      title: `Moderator: ${moderator.userQuestion.slice(0, 50)}`,
      content,
      metadata: {
        threadId: moderator.threadId,
        threadTitle: moderator.threadTitle,
        roundNumber: moderator.roundNumber,
      },
    };
  });
}

/**
 * Build citable sources from project attachments
 */
function buildAttachmentSources(
  attachments: AggregatedProjectContext['attachments'],
): CitableSource[] {
  return attachments.attachments.map((attachment) => {
    // Format file size for display
    const sizeKB = (attachment.fileSize / 1024).toFixed(1);
    const sizeMB = (attachment.fileSize / (1024 * 1024)).toFixed(1);
    const sizeDisplay = attachment.fileSize > 1024 * 1024 ? `${sizeMB}MB` : `${sizeKB}KB`;

    // Determine file type description
    const typeDescription = attachment.mimeType.startsWith('image/')
      ? 'Image file'
      : attachment.mimeType.startsWith('text/')
        ? 'Text file'
        : attachment.mimeType === 'application/pdf'
          ? 'PDF document'
          : attachment.mimeType.includes('json')
            ? 'JSON file'
            : 'File';

    const content = [
      `Filename: ${attachment.filename}`,
      `Type: ${typeDescription} (${attachment.mimeType})`,
      `Size: ${sizeDisplay}`,
      attachment.threadTitle ? `From thread: ${attachment.threadTitle}` : '',
    ].filter(Boolean).join('\n');

    return {
      id: generateSourceId(CitationSourceTypes.ATTACHMENT, attachment.id),
      type: CitationSourceTypes.ATTACHMENT,
      sourceId: attachment.id,
      title: attachment.filename,
      content,
      metadata: {
        threadId: attachment.threadId || undefined,
        threadTitle: attachment.threadTitle || undefined,
        filename: attachment.filename,
      },
    };
  });
}

function formatSourcesList(sources: CitableSource[]): string {
  if (sources.length === 0)
    return '';

  const lines = sources.map(source =>
    `<source id="${source.id}" type="${CitationSourceLabels[source.type]}" title="${source.title}" />`,
  );

  return `<available-context>\n${lines.join('\n')}\n</available-context>`;
}

function formatContextWithSources(sources: CitableSource[]): string {
  if (sources.length === 0)
    return '';

  const sections: string[] = [];
  const byType = sources.reduce<Partial<Record<CitationSourceType, CitableSource[]>>>((acc, source) => {
    const existing = acc[source.type];
    if (existing) {
      existing.push(source);
    } else {
      acc[source.type] = [source];
    }
    return acc;
  }, {});

  for (const sourceType of CITATION_SOURCE_TYPES) {
    const typeSources = byType[sourceType];
    if (!typeSources?.length)
      continue;

    const contentLimit = CitationSourceContentLimits[sourceType];
    const content = typeSources.map((s, index) => {
      const truncated = s.content.length > contentLimit;
      return `<item id="${s.id}" index="${index + 1}" title="${s.title}">
${s.content.slice(0, contentLimit)}${truncated ? '...' : ''}
</item>`;
    }).join('\n\n');

    sections.push(`<${sourceType}-context>\n${content}\n</${sourceType}-context>`);
  }

  return sections.join('\n\n');
}

// ============================================================================
// Main Functions
// ============================================================================

export async function buildCitableContext(params: CitableContextParams): Promise<CitableContextResult> {
  const aggregatedContext = await getAggregatedProjectContext(params);

  const memorySources = buildMemorySources(aggregatedContext.memories);
  const threadSources = buildThreadSources(aggregatedContext.chats);
  const searchSources = buildSearchSources(aggregatedContext.searches);
  const moderatorSources = buildModeratorSources(aggregatedContext.moderators);
  const attachmentSources = buildAttachmentSources(aggregatedContext.attachments);

  const allSources = [
    ...memorySources,
    ...threadSources,
    ...searchSources,
    ...moderatorSources,
    ...attachmentSources,
  ];

  const sourceMap: CitationSourceMap = new Map(allSources.map(source => [source.id, source]));

  const formattedPrompt = allSources.length > 0
    ? [
        '\n\n<project-context>',
        formatSourcesList(allSources),
        formatContextWithSources(allSources),
        '</project-context>',
        '',
        '## Citation Instructions',
        '',
        'When referencing information from the project context above, cite the source using its ID in square brackets.',
        'Format: [source_id] (e.g., [mem_abc123], [thd_xyz456], [att_upload1], [sch_search1], [ana_round0])',
        '',
        'Citation guidelines:',
        '- Cite memories with [mem_...] when referencing stored knowledge',
        '- Cite threads with [thd_...] when referencing previous conversations',
        '- Cite attachments with [att_...] when referencing uploaded files',
        '- Cite searches with [sch_...] when referencing web search results',
        '- Cite moderators with [ana_...] when referencing moderators',
        '- Place citations inline where the information is used',
        '- You may cite multiple sources for the same point',
      ].join('\n')
    : '';

  return {
    sources: allSources,
    sourceMap,
    formattedPrompt,
    stats: {
      totalMemories: aggregatedContext.memories.totalCount,
      totalThreads: aggregatedContext.chats.totalThreads,
      totalSearches: aggregatedContext.searches.totalCount,
      totalModerators: aggregatedContext.moderators.totalCount,
      totalAttachments: attachmentSources.length,
    },
  };
}

export function resolveSourceId(sourceId: string, sourceMap: CitationSourceMap): CitableSource | undefined {
  return sourceMap.get(sourceId);
}

export function extractCitationMarkers(text: string): string[] {
  const citationPattern = /\[(mem|thd|att|sch|ana|rag)_[a-zA-Z0-9]+\]/g;
  const matches = text.match(citationPattern) || [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
}

export function resolveCitations(text: string, sourceMap: CitationSourceMap): Array<{
  sourceId: string;
  displayNumber: number;
  source: CitableSource | undefined;
}> {
  const markers = extractCitationMarkers(text);
  return markers.map((sourceId, index) => ({
    sourceId,
    displayNumber: index + 1,
    source: sourceMap.get(sourceId),
  }));
}

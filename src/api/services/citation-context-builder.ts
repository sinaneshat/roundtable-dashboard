/**
 * Citation Context Builder Service
 *
 * Following backend-patterns.md: Service layer for business logic
 *
 * This service handles:
 * - Building citable context from project sources with unique source IDs
 * - Formatting context in clean XML format for AI consumption
 * - Creating source maps for optional citation resolution
 *
 * Citation Flow:
 * 1. Build citable context from all project sources (memories, threads, files, searches, analyses)
 * 2. Assign unique source IDs to each source (e.g., mem_abc123, thd_xyz456)
 * 3. Format context in clean XML for AI prompt (no forced citation markers)
 * 4. IF AI naturally includes [source_id] markers, parse and resolve them
 * 5. Store resolved citations in message metadata for UI display
 *
 * Note: Following AI SDK v5 patterns - we provide clean context but don't force
 * citation markers. Models naturally reference information by describing it.
 *
 * @see /src/api/types/citations.ts for type definitions
 */

import type { CitationSourceType } from '@/api/core/enums';
import {
  CITATION_SOURCE_TYPES,
  CitationSourceContentLimits,
  CitationSourceLabels,
  CitationSourcePrefixes,
  CitationSourceTypes,
} from '@/api/core/enums';
import type {
  CitableContextResult,
  CitableSource,
  CitationSourceMap,
} from '@/api/types/citations';

import type {
  AggregatedProjectContext,
  ProjectContextParams,
} from './project-context.service';
import { getAggregatedProjectContext } from './project-context.service';

// ============================================================================
// Type Definitions
// ============================================================================

export type CitableContextParams = ProjectContextParams & {
  /** Include attachment sources (requires AutoRAG integration) */
  includeAttachments?: boolean;
};

// ============================================================================
// Source ID Generation
// ============================================================================

/**
 * Generate unique source ID with type prefix
 * Format: {type_prefix}_{source_id}
 * Uses CitationSourcePrefixes from enums for single source of truth
 */
function generateSourceId(type: CitationSourceType, sourceId: string): string {
  // Use first 8 chars of source ID for brevity
  const shortId = sourceId.slice(0, 8);
  return `${CitationSourcePrefixes[type]}_${shortId}`;
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
 * Build citable sources from moderator summaries
 */
function buildSummarySources(
  summaries: AggregatedProjectContext['summaries'],
): CitableSource[] {
  return summaries.summaries.map((summary) => {
    const content = [
      `Question: ${summary.userQuestion}`,
      `Summary: ${summary.summary}`,
      summary.recommendations.length > 0
        ? `Recommendations: ${summary.recommendations.join(', ')}`
        : '',
      summary.keyThemes ? `Key Themes: ${summary.keyThemes}` : '',
    ].filter(Boolean).join('\n');

    // Create unique ID from threadId + roundNumber
    const uniqueId = `${summary.threadId}_r${summary.roundNumber}`;

    return {
      id: generateSourceId(CitationSourceTypes.SUMMARY, uniqueId),
      type: CitationSourceTypes.SUMMARY,
      sourceId: uniqueId,
      title: `Summary: ${summary.userQuestion.slice(0, 50)}`,
      content,
      metadata: {
        threadId: summary.threadId,
        threadTitle: summary.threadTitle,
        roundNumber: summary.roundNumber,
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

/**
 * Format sources list for AI prompt - includes source IDs for citation
 */
function formatSourcesList(sources: CitableSource[]): string {
  if (sources.length === 0) {
    return '';
  }

  const lines = sources.map((source) => {
    const typeLabel = CitationSourceLabels[source.type];
    return `<source id="${source.id}" type="${typeLabel}" title="${source.title}" />`;
  });

  return `<available-context>\n${lines.join('\n')}\n</available-context>`;
}

/**
 * Format full context with source content for AI - clean XML format
 * Uses enum constants for section headers and content limits (single source of truth)
 */
function formatContextWithSources(sources: CitableSource[]): string {
  if (sources.length === 0) {
    return '';
  }

  const sections: string[] = [];

  // Group sources by type using enum values
  const byType = sources.reduce<Partial<Record<CitationSourceType, CitableSource[]>>>((acc, source) => {
    const existing = acc[source.type];
    if (existing) {
      existing.push(source);
    } else {
      acc[source.type] = [source];
    }
    return acc;
  }, {});

  // Format each type section using enum constants
  // Process in defined order from CITATION_SOURCE_TYPES array
  for (const sourceType of CITATION_SOURCE_TYPES) {
    const typeSources = byType[sourceType];
    if (!typeSources?.length) {
      continue;
    }

    const contentLimit = CitationSourceContentLimits[sourceType];

    const content = typeSources.map((s, index) => {
      const truncated = s.content.length > contentLimit;
      // Include source ID so AI can cite it using [source_id] format
      return `<item id="${s.id}" index="${index + 1}" title="${s.title}">
${s.content.slice(0, contentLimit)}${truncated ? '...' : ''}
</item>`;
    }).join('\n\n');

    sections.push(`<${sourceType}-context>\n${content}\n</${sourceType}-context>`);
  }

  return sections.join('\n\n');
}

// ============================================================================
// Main Export Functions
// ============================================================================

/**
 * Build citable context from all project sources
 *
 * Returns sources with unique IDs for AI to reference in citations,
 * formatted prompt with citation instructions, and source map for resolution.
 */
export async function buildCitableContext(
  params: CitableContextParams,
): Promise<CitableContextResult> {
  // Get aggregated project context
  const aggregatedContext = await getAggregatedProjectContext(params);

  // Build citable sources from each context type
  const memorySources = buildMemorySources(aggregatedContext.memories);
  const threadSources = buildThreadSources(aggregatedContext.chats);
  const searchSources = buildSearchSources(aggregatedContext.searches);
  const summarySources = buildSummarySources(aggregatedContext.summaries);
  const attachmentSources = buildAttachmentSources(aggregatedContext.attachments);

  // Combine all sources
  const allSources = [
    ...memorySources,
    ...threadSources,
    ...searchSources,
    ...summarySources,
    ...attachmentSources,
  ];

  // Build source map for quick lookup
  const sourceMap: CitationSourceMap = new Map(
    allSources.map(source => [source.id, source]),
  );

  // Format the prompt with XML context AND citation instructions
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
        '- Cite analyses with [ana_...] when referencing moderator analyses',
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
      totalSummaries: aggregatedContext.summaries.totalCount,
      totalAttachments: attachmentSources.length,
    },
  };
}

/**
 * Resolve a source ID to full source data
 */
export function resolveSourceId(
  sourceId: string,
  sourceMap: CitationSourceMap,
): CitableSource | undefined {
  return sourceMap.get(sourceId);
}

/**
 * Parse citation markers from AI response text
 * Returns array of source IDs found in the text
 *
 * Matches patterns like: [mem_abc12345], [thd_xyz456], etc.
 */
export function extractCitationMarkers(text: string): string[] {
  const citationPattern = /\[(mem|thd|att|sch|ana|rag)_[a-zA-Z0-9]+\]/g;
  const matches = text.match(citationPattern) || [];

  // Remove brackets and deduplicate
  const sourceIds = [...new Set(matches.map(m => m.slice(1, -1)))];
  return sourceIds;
}

/**
 * Resolve all citations in text to full source data
 */
export function resolveCitations(
  text: string,
  sourceMap: CitationSourceMap,
): Array<{
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

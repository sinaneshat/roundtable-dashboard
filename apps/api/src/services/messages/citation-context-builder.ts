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

import type { CitationSourceType } from '@roundtable/shared/enums';
import {
  CITATION_PREFIXES,
  CITATION_SOURCE_TYPES,
  CitationSourceContentLimits,
  CitationSourceLabels,
  CitationSourcePrefixes,
  CitationSourceTypes,
} from '@roundtable/shared/enums';

import type {
  AggregatedProjectContext,
  CitableContextParams,
} from '@/common/schemas/project-context';
import { getAggregatedProjectContext } from '@/services/context';
import type { CitableContextResult, CitableSource, CitationSourceMap } from '@/types/citations';

// ============================================================================
// Types
// ============================================================================

// CitableContextParams is now defined via Zod schema in project-context.ts
// Re-export for backwards compatibility
export type { CitableContextParams } from '@/common/schemas/project-context';

// ============================================================================
// Helpers
// ============================================================================

function generateSourceId(type: CitationSourceType, sourceId: string) {
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
    content: memory.content,
    id: generateSourceId(CitationSourceTypes.MEMORY, memory.id),
    metadata: {
      importance: memory.importance,
      threadId: memory.sourceThreadId || undefined,
    },
    sourceId: memory.id,
    title: memory.summary || memory.content.slice(0, 50),
    type: CitationSourceTypes.MEMORY,
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
        content: messageContent,
        id: generateSourceId(CitationSourceTypes.THREAD, thread.id),
        metadata: {
          roundNumber: thread.messages[0]?.roundNumber,
          threadId: thread.id,
          threadTitle: thread.title,
        },
        sourceId: thread.id,
        title: thread.title,
        type: CitationSourceTypes.THREAD,
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
      content: search.summary || content,
      id: generateSourceId(CitationSourceTypes.SEARCH, uniqueId),
      metadata: {
        roundNumber: search.roundNumber,
        threadId: search.threadId,
        threadTitle: search.threadTitle,
      },
      sourceId: uniqueId,
      title: `Search: "${search.userQuery}"`,
      type: CitationSourceTypes.SEARCH,
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
      content,
      id: generateSourceId(CitationSourceTypes.MODERATOR, uniqueId),
      metadata: {
        roundNumber: moderator.roundNumber,
        threadId: moderator.threadId,
        threadTitle: moderator.threadTitle,
      },
      sourceId: uniqueId,
      title: `Moderator: ${moderator.userQuestion.slice(0, 50)}`,
      type: CitationSourceTypes.MODERATOR,
    };
  });
}

/**
 * Build citable sources from project attachments
 * When textContent is available, includes actual file content for AI to reference
 */
function buildAttachmentSources(
  attachments: AggregatedProjectContext['attachments'],
  baseUrl: string,
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

    // Source label: project-level files vs thread uploads
    const sourceLabel = attachment.source === 'project'
      ? 'Project file'
      : attachment.threadTitle
        ? `From thread: ${attachment.threadTitle}`
        : '';

    // Build content: use textContent if available, else metadata only
    let content: string;
    if (attachment.textContent) {
      // Include actual file content for AI to reference and cite
      const header = [
        `Filename: ${attachment.filename}`,
        `Type: ${typeDescription} (${attachment.mimeType})`,
        `Size: ${sizeDisplay}`,
        sourceLabel,
      ].filter(Boolean).join('\n');
      content = `${header}\n\n--- Document Content ---\n${attachment.textContent}`;
    } else {
      // Metadata only for files without extractable text (images, etc.)
      content = [
        `Filename: ${attachment.filename}`,
        `Type: ${typeDescription} (${attachment.mimeType})`,
        `Size: ${sizeDisplay}`,
        sourceLabel,
        '(No text content available - binary file)',
      ].filter(Boolean).join('\n');
    }

    // Generate absolute download URL for attachment
    const downloadUrl = `${baseUrl}/api/v1/uploads/${attachment.id}/download`;

    return {
      content,
      id: generateSourceId(CitationSourceTypes.ATTACHMENT, attachment.id),
      metadata: {
        // Include attachment-specific fields for citation UI
        downloadUrl,
        filename: attachment.filename,
        fileSize: attachment.fileSize,
        hasTextContent: !!attachment.textContent,
        mimeType: attachment.mimeType,
        source: attachment.source,
        threadId: attachment.threadId || undefined,
        threadTitle: attachment.threadTitle || undefined,
      },
      sourceId: attachment.id,
      title: attachment.filename,
      type: CitationSourceTypes.ATTACHMENT,
    };
  });
}

function formatSourcesList(sources: CitableSource[]) {
  if (sources.length === 0) {
    return '';
  }

  const lines = sources.map(source =>
    `<source id="${source.id}" type="${CitationSourceLabels[source.type]}" title="${source.title}" />`,
  );

  return `<available-context>\n${lines.join('\n')}\n</available-context>`;
}

function formatContextWithSources(sources: CitableSource[]) {
  if (sources.length === 0) {
    return '';
  }

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
    if (!typeSources?.length) {
      continue;
    }

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
  const attachmentSources = buildAttachmentSources(aggregatedContext.attachments, params.baseUrl);

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
        '## 🚨 MANDATORY: Project Context Citation Requirements',
        '',
        '**YOU MUST CITE project context when using information from it. This is NOT optional.**',
        '',
        '### Available Sources to Cite:',
        ...allSources.slice(0, 15).map(s => `  • "${s.title}" → cite as [${s.id}]`),
        '',
        '### Citation Rules (MUST FOLLOW):',
        '',
        '1. **EVERY fact from project context needs a citation**',
        '   When you state ANY information from memories, threads, or files, add the citation immediately after.',
        '',
        '2. **Use the EXACT citation format for each type:**',
        '   - Memories: [mem_xxxxxxxx] - stored knowledge and user preferences',
        '   - Threads: [thd_xxxxxxxx] - previous conversation history',
        '   - Attachments: [att_xxxxxxxx] - uploaded files and documents',
        '   - Searches: [sch_xxxxxxxx] - web search results',
        '   - Moderators: [mod_xxxxxxxx] - moderator summaries',
        '',
        '3. **Quote or paraphrase specific content**',
        '   Don\'t just cite - show WHAT you\'re citing from the source.',
        '',
        '### Correct Citation Examples:',
        '',
        '✅ GOOD (shows specific content + citation):',
        `- "Based on your previous preference, you prefer dark mode [${memorySources[0]?.id || 'mem_example'}]."`,
        `- "In our earlier conversation, you mentioned working at Company X [${threadSources[0]?.id || 'thd_example'}]."`,
        `- "The uploaded resume shows 5 years of experience [${attachmentSources[0]?.id || 'att_example'}]."`,
        '',
        '❌ BAD (no citation):',
        '- "You prefer dark mode." ← MISSING CITATION',
        '- "Based on what I know, you work at Company X." ← NOT SPECIFIC',
        '',
        '---',
        '**Remember: NO citation = INCOMPLETE RESPONSE. Always cite your sources from project context.**',
      ].join('\n')
    : '';

  return {
    formattedPrompt,
    sourceMap,
    sources: allSources,
    stats: {
      totalAttachments: attachmentSources.length,
      totalMemories: aggregatedContext.memories.totalCount,
      totalModerators: aggregatedContext.moderators.totalCount,
      totalSearches: aggregatedContext.searches.totalCount,
      totalThreads: aggregatedContext.chats.totalThreads,
    },
  };
}

export function resolveSourceId(sourceId: string, sourceMap: CitationSourceMap): CitableSource | undefined {
  return sourceMap.get(sourceId);
}

export function extractCitationMarkers(text: string): string[] {
  // Use CITATION_PREFIXES from enum for single source of truth
  const citationPattern = new RegExp(
    `\\[(${CITATION_PREFIXES.join('|')})_[a-zA-Z0-9]+\\]`,
    'g',
  );
  const matches = text.match(citationPattern) || [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
}

export function resolveCitations(text: string, sourceMap: CitationSourceMap): {
  sourceId: string;
  displayNumber: number;
  source: CitableSource | undefined;
}[] {
  const markers = extractCitationMarkers(text);
  return markers.map((sourceId, index) => ({
    displayNumber: index + 1,
    source: sourceMap.get(sourceId),
    sourceId,
  }));
}

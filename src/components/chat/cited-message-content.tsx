'use client';

/**
 * CitedMessageContent Component
 *
 * Renders AI response text with citations stripped from inline text and shown
 * in a unified Sources tooltip at the end of the response. Uses carousel
 * navigation for browsing multiple sources.
 *
 * @module components/chat/cited-message-content
 */

import { useMemo } from 'react';
import Markdown from 'react-markdown';
import { Streamdown } from 'streamdown';

import { CitationSegmentTypes } from '@/api/core/enums';
import type { AvailableSource } from '@/api/types/citations';
import type { DbCitation } from '@/db/schemas/chat-metadata';
import { cn } from '@/lib/ui/cn';
import { parseCitations } from '@/lib/utils';

import type { SourceData } from '../ai-elements/inline-citation';
import { SourcesFooter } from '../ai-elements/inline-citation';
import { streamdownComponents } from '../markdown/unified-markdown-components';

// ============================================================================
// Types
// ============================================================================

export type CitedMessageContentProps = {
  /** The text content to render with citations */
  text: string;
  /** Optional resolved citation data from message metadata */
  citations?: DbCitation[];
  /** Optional available sources for fallback during streaming (before citations are resolved) */
  availableSources?: AvailableSource[];
  /** Whether the message is currently streaming */
  isStreaming?: boolean;
  /** Additional class name for the wrapper */
  className?: string;
  /** Skip transitions and use SSR-friendly rendering (ReactMarkdown instead of Streamdown) */
  skipTransitions?: boolean;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Renders message content with citations shown in a unified footer
 *
 * Citations markers are stripped from text and all sources are displayed
 * in a single Sources tooltip at the end of the response with carousel navigation.
 */
export function CitedMessageContent({
  text,
  citations,
  availableSources,
  isStreaming: _isStreaming = false,
  className,
  skipTransitions = false,
}: CitedMessageContentProps) {
  const parsedResult = useMemo(
    () => parseCitations(text),
    [text],
  );

  // Build citation map from resolved citations
  const citationMap = useMemo(() => {
    if (!citations) {
      return new Map<string, DbCitation>();
    }
    return new Map(citations.map(c => [c.id, c]));
  }, [citations]);

  // Build fallback map from availableSources (for during streaming before citations are resolved)
  const availableSourceMap = useMemo(() => {
    if (!availableSources) {
      return new Map<string, AvailableSource>();
    }
    return new Map(availableSources.map(s => [s.id, s]));
  }, [availableSources]);

  // Strip citation markers and collect source data
  const { plainText, sourceData } = useMemo(() => {
    // Join all text segments, ignoring citation markers
    const textParts: string[] = [];
    const sources: SourceData[] = [];
    const seenIds = new Set<string>();

    for (const segment of parsedResult.segments) {
      if (segment.type === CitationSegmentTypes.TEXT) {
        textParts.push(segment.content);
      } else if (segment.type === CitationSegmentTypes.CITATION) {
        const { citation } = segment;

        // Skip duplicates
        if (seenIds.has(citation.sourceId))
          continue;
        seenIds.add(citation.sourceId);

        const resolvedCitation = citationMap.get(citation.sourceId);
        const fallbackSource = availableSourceMap.get(citation.sourceId);

        sources.push({
          id: citation.sourceId,
          sourceType: citation.sourceType,
          // ✅ REQUIRED FIELD: AvailableSource.title is required per Zod schema
          title: resolvedCitation?.title || fallbackSource?.title || citation.sourceId,
          url: resolvedCitation?.url || fallbackSource?.url,
          description: fallbackSource?.description,
          // ✅ FIX: Use excerpt from resolved citation OR fallback source for quote display
          excerpt: resolvedCitation?.excerpt || fallbackSource?.excerpt,
          downloadUrl: resolvedCitation?.downloadUrl || fallbackSource?.downloadUrl,
          filename: resolvedCitation?.filename || fallbackSource?.filename,
          mimeType: resolvedCitation?.mimeType || fallbackSource?.mimeType,
          fileSize: resolvedCitation?.fileSize || fallbackSource?.fileSize,
          threadTitle: resolvedCitation?.threadTitle || fallbackSource?.threadTitle,
        });
      }
    }

    return {
      plainText: textParts.join(''),
      sourceData: sources,
    };
  }, [parsedResult, citationMap, availableSourceMap]);

  // ✅ FIX: Show availableSources even when AI didn't include inline citations
  // This happens when pre-search ran but AI wasn't instructed to cite sources
  const fallbackSources = useMemo((): SourceData[] => {
    if (sourceData.length > 0 || !availableSources || availableSources.length === 0) {
      return [];
    }
    return availableSources.map(s => ({
      id: s.id,
      sourceType: s.sourceType,
      title: s.title,
      url: s.url,
      description: s.description,
      excerpt: s.excerpt,
      downloadUrl: s.downloadUrl,
      filename: s.filename,
      mimeType: s.mimeType,
      fileSize: s.fileSize,
      threadTitle: s.threadTitle,
    }));
  }, [sourceData.length, availableSources]);

  // Final sources: use parsed citations if available, otherwise fallback to availableSources
  const finalSources = sourceData.length > 0 ? sourceData : fallbackSources;

  // Helper to render markdown with SSR support
  const renderMarkdown = (content: string) => {
    if (skipTransitions) {
      return <Markdown components={streamdownComponents}>{content}</Markdown>;
    }
    return <Streamdown components={streamdownComponents}>{content}</Streamdown>;
  };

  // No citations and no available sources - render plain markdown
  if (finalSources.length === 0) {
    return (
      <div dir="auto" className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
        {renderMarkdown(text)}
      </div>
    );
  }

  // Render text with unified Sources footer
  // Use plainText (with citations stripped) if inline citations were found, otherwise original text
  const displayText = sourceData.length > 0 ? plainText : text;
  return (
    <div dir="auto" className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      {renderMarkdown(displayText)}
      <SourcesFooter sources={finalSources} />
    </div>
  );
}

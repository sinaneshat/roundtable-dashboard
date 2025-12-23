'use client';

/**
 * CitedMessageContent Component
 *
 * Renders AI response text with inline citations. Parses the text for citation
 * markers (e.g., [mem_abc123]) and renders them as interactive citation badges
 * that show source details on hover.
 *
 * This component wraps Streamdown to preserve markdown rendering while adding
 * citation support.
 *
 * @module components/chat/cited-message-content
 */

import { useMemo } from 'react';
import { Streamdown } from 'streamdown';

import type { DbCitation } from '@/db/schemas/chat-metadata';
import { cn } from '@/lib/ui/cn';
import { parseCitations } from '@/lib/utils';

import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationQuote,
  InlineCitationSource,
} from '../ai-elements/inline-citation';
import { streamdownComponents } from '../markdown/streamdown-components';

// ============================================================================
// Types
// ============================================================================

export type CitedMessageContentProps = {
  /** The text content to render with citations */
  text: string;
  /** Optional resolved citation data from message metadata */
  citations?: DbCitation[];
  /** Whether the message is currently streaming */
  isStreaming?: boolean;
  /** Additional class name for the wrapper */
  className?: string;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Renders message content with inline citations
 *
 * Citations are ALWAYS parsed and rendered as interactive badges, even during
 * streaming. During streaming, badges show with basic info (display number,
 * source type). After streaming completes, resolved metadata (title, excerpt,
 * download URL) is available for full citation cards.
 *
 * If citations array is not provided, the component will parse the text and
 * render basic citation badges without resolved source data.
 */
export function CitedMessageContent({
  text,
  citations,
  isStreaming: _isStreaming = false,
  className,
}: CitedMessageContentProps) {
  // Parse citations from text - always parse, even during streaming
  const parsedResult = useMemo(
    () => parseCitations(text),
    [text],
  );

  // Build citation map from resolved data
  const citationMap = useMemo(() => {
    if (!citations) {
      return new Map<string, DbCitation>();
    }
    return new Map(citations.map(c => [c.id, c]));
  }, [citations]);

  // If no citations found, render with Streamdown as usual
  if (parsedResult.citations.length === 0) {
    return (
      <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
        <Streamdown components={streamdownComponents}>
          {text}
        </Streamdown>
      </div>
    );
  }

  // ✅ FIX: Always render citations, even during streaming
  // During streaming: Show citation badges with basic info (display number, source type)
  // After streaming: Show full citation cards with resolved metadata
  // This prevents raw [att_xxx] markers from showing in the UI
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      {parsedResult.segments.map((segment) => {
        if (segment.type === 'text') {
          // Render text segment with Streamdown
          // Use content hash for key since text segments don't have IDs
          const textKey = `text-${segment.content.slice(0, 20).replace(/\W/g, '')}-${segment.content.length}`;
          return (
            <Streamdown
              key={textKey}
              components={streamdownComponents}
            >
              {segment.content}
            </Streamdown>
          );
        }

        // Render citation segment
        const { citation } = segment;
        const resolvedCitation = citationMap.get(citation.sourceId);
        // Use citation sourceId + displayNumber for stable key
        const citationKey = `citation-${citation.sourceId}-${citation.displayNumber}`;

        // ✅ During streaming without resolved metadata, show minimal citation badge
        // The trigger badge always shows (display number + source type icon)
        // The card body shows resolved data when available
        return (
          <InlineCitation key={citationKey}>
            <InlineCitationCard>
              <InlineCitationCardTrigger
                displayNumber={citation.displayNumber}
                sourceType={citation.sourceType}
              />
              <InlineCitationCardBody>
                <InlineCitationSource
                  title={resolvedCitation?.title || citation.sourceId}
                  sourceType={citation.sourceType}
                  description={resolvedCitation?.excerpt}
                  url={resolvedCitation?.url}
                  threadTitle={resolvedCitation?.threadTitle}
                  // Attachment-specific props
                  downloadUrl={resolvedCitation?.downloadUrl}
                  filename={resolvedCitation?.filename}
                  mimeType={resolvedCitation?.mimeType}
                  fileSize={resolvedCitation?.fileSize}
                />
                {resolvedCitation?.excerpt && (
                  <InlineCitationQuote>
                    {resolvedCitation.excerpt}
                  </InlineCitationQuote>
                )}
              </InlineCitationCardBody>
            </InlineCitationCard>
          </InlineCitation>
        );
      })}
    </div>
  );
}

// ============================================================================
// Simple Citation Badge (for use outside full CitedMessageContent)
// ============================================================================

export type SimpleCitationBadgeProps = {
  citation: DbCitation;
  className?: string;
};

/**
 * A standalone citation badge for simple use cases
 */
export function SimpleCitationBadge({ citation, className }: SimpleCitationBadgeProps) {
  return (
    <InlineCitation className={className}>
      <InlineCitationCard>
        <InlineCitationCardTrigger
          displayNumber={citation.displayNumber}
          sourceType={citation.sourceType}
        />
        <InlineCitationCardBody>
          <InlineCitationSource
            title={citation.title || citation.id}
            sourceType={citation.sourceType}
            description={citation.excerpt}
            url={citation.url}
            threadTitle={citation.threadTitle}
            // Attachment-specific props
            downloadUrl={citation.downloadUrl}
            filename={citation.filename}
            mimeType={citation.mimeType}
            fileSize={citation.fileSize}
          />
          {citation.excerpt && (
            <InlineCitationQuote>
              {citation.excerpt}
            </InlineCitationQuote>
          )}
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  );
}

'use client';

import type { DeepPartial } from 'ai';

import type { ArticleNarrative } from '@/api/routes/chat/schema';
import { StreamingCursor, StreamingText } from '@/components/ui/streaming-text';

type RoundSummaryTextProps = {
  article?: ArticleNarrative | DeepPartial<ArticleNarrative>;
  isStreaming?: boolean;
};

/**
 * RoundSummaryText - Simple Round Summary
 *
 * Shows a brief 2-3 line summary of what happened in the round.
 */
export function RoundSummaryText({
  article,
  isStreaming = false,
}: RoundSummaryTextProps) {
  if (!article?.narrative) {
    return null;
  }

  return (
    <p className="text-sm leading-relaxed text-foreground/80">
      <StreamingText isStreaming={isStreaming}>
        {article.narrative}
      </StreamingText>
      {isStreaming && <StreamingCursor />}
    </p>
  );
}

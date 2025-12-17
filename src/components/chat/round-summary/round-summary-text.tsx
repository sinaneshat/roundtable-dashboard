'use client';

import type { DeepPartial } from 'ai';

import type { RoundSummaryMetrics } from '@/api/routes/chat/schema';
import { StreamingCursor, StreamingText } from '@/components/ui/streaming-text';

type RoundSummaryTextProps = {
  summary?: string | DeepPartial<string>;
  metrics?: RoundSummaryMetrics | DeepPartial<RoundSummaryMetrics>;
  isStreaming?: boolean;
};

/**
 * RoundSummaryText - Simple Round Summary
 *
 * Shows the summary text and 4 metrics (Engagement, Insight, Balance, Clarity).
 */
export function RoundSummaryText({
  summary,
  metrics,
  isStreaming = false,
}: RoundSummaryTextProps) {
  if (!summary && !metrics) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Summary Text */}
      {summary && (
        <p className="text-sm leading-relaxed text-foreground/80">
          <StreamingText isStreaming={isStreaming}>
            {summary}
          </StreamingText>
          {isStreaming && <StreamingCursor />}
        </p>
      )}

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {metrics.engagement !== undefined && (
            <div className="flex justify-between items-center px-2 py-1 rounded bg-muted/30">
              <span className="text-muted-foreground">Engagement</span>
              <span className="font-medium">{Math.round(metrics.engagement)}</span>
            </div>
          )}
          {metrics.insight !== undefined && (
            <div className="flex justify-between items-center px-2 py-1 rounded bg-muted/30">
              <span className="text-muted-foreground">Insight</span>
              <span className="font-medium">{Math.round(metrics.insight)}</span>
            </div>
          )}
          {metrics.balance !== undefined && (
            <div className="flex justify-between items-center px-2 py-1 rounded bg-muted/30">
              <span className="text-muted-foreground">Balance</span>
              <span className="font-medium">{Math.round(metrics.balance)}</span>
            </div>
          )}
          {metrics.clarity !== undefined && (
            <div className="flex justify-between items-center px-2 py-1 rounded bg-muted/30">
              <span className="text-muted-foreground">Clarity</span>
              <span className="font-medium">{Math.round(metrics.clarity)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

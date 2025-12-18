'use client';

import type { DeepPartial } from 'ai';
import { memo } from 'react';

import type { RoundSummaryMetrics } from '@/api/routes/chat/schema';
import { StreamingCursor, StreamingText } from '@/components/ui/streaming-text';

type RoundSummaryTextProps = {
  summary?: string | DeepPartial<string>;
  metrics?: RoundSummaryMetrics | DeepPartial<RoundSummaryMetrics>;
  isStreaming?: boolean;
};

/**
 * MetricItem - Single metric display
 * No nested animations - scroll animation at parent level handles entrance
 */
const MetricItem = memo(({
  label,
  value,
}: {
  label: string;
  value: number;
  index: number;
}) => {
  return (
    <div className="flex justify-between items-center px-2 py-1 rounded bg-muted/30">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{Math.round(value)}</span>
    </div>
  );
});

/**
 * RoundSummaryText - Simple Round Summary with Progressive Streaming
 *
 * Shows the summary text character-by-character as it streams,
 * and 4 metrics (Engagement, Insight, Balance, Clarity).
 * No nested animations - scroll animation at parent level handles entrance.
 */
export const RoundSummaryText = memo(({
  summary,
  metrics,
  isStreaming = false,
}: RoundSummaryTextProps) => {
  if (!summary && !metrics) {
    return null;
  }

  // Build metrics array dynamically - each metric appears as it arrives
  const metricsToShow: { label: string; value: number; key: string }[] = [];
  if (metrics?.engagement !== undefined) {
    metricsToShow.push({ label: 'Engagement', value: metrics.engagement, key: 'engagement' });
  }
  if (metrics?.insight !== undefined) {
    metricsToShow.push({ label: 'Insight', value: metrics.insight, key: 'insight' });
  }
  if (metrics?.balance !== undefined) {
    metricsToShow.push({ label: 'Balance', value: metrics.balance, key: 'balance' });
  }
  if (metrics?.clarity !== undefined) {
    metricsToShow.push({ label: 'Clarity', value: metrics.clarity, key: 'clarity' });
  }

  return (
    <div className="space-y-3">
      {/* Summary Text - streams character by character */}
      {summary && (
        <p className="text-sm leading-relaxed text-foreground/80">
          <StreamingText isStreaming={isStreaming}>
            {summary}
          </StreamingText>
          {isStreaming && <StreamingCursor />}
        </p>
      )}

      {/* Metrics - displayed as they become available */}
      {metricsToShow.length > 0 && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {metricsToShow.map((metric, index) => (
            <MetricItem
              key={metric.key}
              label={metric.label}
              value={metric.value}
              index={index}
            />
          ))}
        </div>
      )}
    </div>
  );
});

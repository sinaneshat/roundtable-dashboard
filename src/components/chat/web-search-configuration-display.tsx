'use client';

import { useTranslations } from 'next-intl';

import type { WebSearchDepth } from '@/api/core/enums';
import type { GeneratedSearchQuery, WebSearchResultItem } from '@/api/routes/chat/schema';
import { FadeInText, TypingText } from '@/components/ui/typing-text';
import { cn } from '@/lib/ui/cn';

import { WebSearchImageGallery } from './web-search-image-gallery';

/**
 * Display-specific query type derived from GeneratedSearchQuery schema
 * Adds `index` field from SSE events for tracking query position
 */
type GeneratedQueryDisplay = Pick<GeneratedSearchQuery, 'query' | 'rationale' | 'complexity' | 'sourceCount'> & {
  searchDepth: WebSearchDepth;
  index?: number;
};

type WebSearchConfigurationDisplayProps = {
  queries?: GeneratedQueryDisplay[];
  results?: WebSearchResultItem[];
  totalResults?: number;
  successCount?: number;
  failureCount?: number;
  totalTime?: number;
  searchPlan?: string;
  isStreamingPlan?: boolean;
  className?: string;
};

// Empty array constant to avoid React infinite render loop warning
const EMPTY_RESULTS: WebSearchResultItem[] = [];

export function WebSearchConfigurationDisplay({
  queries,
  results,
  totalResults,
  totalTime,
  searchPlan,
  isStreamingPlan = false,
  className,
}: WebSearchConfigurationDisplayProps) {
  const tPreSearch = useTranslations('chat.preSearch.plan');

  // Don't render if no data available
  if ((!queries || queries.length === 0) && !searchPlan) {
    return null;
  }

  // Use EMPTY_RESULTS if results is undefined to avoid default prop warning
  const safeResults = results || EMPTY_RESULTS;

  // Calculate derived data
  const hasImages = safeResults.some(r => r.metadata?.imageUrl || (r.images && r.images.length > 0));

  // Build simple summary text
  const summaryParts: string[] = [];
  if (queries && queries.length > 0) {
    summaryParts.push(`${queries.length} ${queries.length === 1 ? 'query' : 'queries'}`);
  }
  if (totalResults && totalResults > 0) {
    summaryParts.push(`${totalResults} sources`);
  }
  if (totalTime && totalTime > 0) {
    summaryParts.push(`${(totalTime / 1000).toFixed(1)}s`);
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Search Plan - Animated */}
      {searchPlan && (
        <div className="space-y-1">
          <FadeInText>
            <span className="text-xs font-medium text-muted-foreground">{tPreSearch('title')}</span>
          </FadeInText>
          <div className="text-sm text-foreground/80 leading-relaxed">
            <TypingText text={searchPlan} speed={0} delay={0} enabled={isStreamingPlan} />
          </div>
        </div>
      )}

      {/* Simple Stats Line */}
      {summaryParts.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {summaryParts.join(' • ')}
        </p>
      )}

      {/* Image Gallery - Inline, no collapsible */}
      {hasImages && (
        <WebSearchImageGallery results={safeResults} />
      )}
    </div>
  );
}

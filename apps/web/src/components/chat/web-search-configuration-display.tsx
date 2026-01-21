import type { WebSearchDepth } from '@roundtable/shared';

import { FadeInText, TypingText } from '@/components/ui/typing-text';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import type { WebSearchResultItem } from '@/services/api';

import { WebSearchImageGallery } from './web-search-image-gallery';

/**
 * Display-specific query type for web search configuration
 * Extends base query fields with optional streaming-only fields
 */
type GeneratedQueryDisplay = {
  query: string;
  rationale?: string;
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
  const t = useTranslations();

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
      {/* Search Plan - Animated with streaming cursor */}
      {searchPlan && (
        <div className="space-y-1">
          <FadeInText>
            <span className="text-xs font-medium text-muted-foreground">{t('chat.preSearch.plan.title')}</span>
          </FadeInText>
          <div className="text-sm text-foreground/80 leading-relaxed">
            <TypingText
              text={searchPlan}
              speed={0}
              delay={0}
              enabled={isStreamingPlan}
              showStreamingCursor={isStreamingPlan}
            />
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

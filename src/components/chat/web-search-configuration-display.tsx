'use client';

import {
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { WebSearchResultItem } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FadeInText, TypingText } from '@/components/ui/typing-text';
import { cn } from '@/lib/ui/cn';

import { WebSearchContentPreview } from './web-search-content-preview';
import { WebSearchImageGallery } from './web-search-image-gallery';

type GeneratedQuery = {
  query: string;
  rationale: string;
  searchDepth: 'basic' | 'advanced';
  index?: number;
  complexity?: string;
  sourceCount?: number;
};

type WebSearchConfigurationDisplayProps = {
  queries?: GeneratedQuery[];
  results?: WebSearchResultItem[];
  totalResults?: number;
  successCount?: number;
  failureCount?: number;
  totalTime?: number;
  autoParameters?: {
    topic?: string;
    timeRange?: string;
    searchDepth?: string;
    reasoning?: string;
  };
  searchPlan?: string;
  isStreamingPlan?: boolean;
  className?: string;
  onConfigChange?: (config: {
    maxResults: number;
    searchDepth: 'basic' | 'advanced';
    numQueries: number;
  }) => void;
};

// Empty array constant to avoid React infinite render loop warning
const EMPTY_RESULTS: WebSearchResultItem[] = [];

export function WebSearchConfigurationDisplay({
  queries,
  results,
  searchPlan,
  isStreamingPlan = false,
  className,
}: WebSearchConfigurationDisplayProps) {
  const tPreSearch = useTranslations('chat.preSearch.plan');
  const tImages = useTranslations('chat.tools.webSearch.images');
  const tContent = useTranslations('chat.tools.webSearch.contentPreview');
  const [isImagesOpen, setIsImagesOpen] = useState(false);

  // Don't render if no data available
  if ((!queries || queries.length === 0) && !searchPlan) {
    return null;
  }

  // Use EMPTY_RESULTS if results is undefined to avoid default prop warning
  const safeResults = results || EMPTY_RESULTS;

  // Calculate derived data for Tavily features
  const hasImages = safeResults.some(r => r.metadata?.imageUrl || (r.images && r.images.length > 0));
  const hasRawContent = safeResults.some(r => r.rawContent || r.fullContent);
  const totalWordCount = safeResults.reduce((sum, r) => sum + (r.metadata?.wordCount || 0), 0);
  const resultsWithContent = safeResults.filter(r => r.rawContent || r.fullContent);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Search Plan - Animated */}
      {searchPlan && (
        <div className="space-y-2">
          <FadeInText>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{tPreSearch('title')}</span>
            </div>
          </FadeInText>
          <div className="text-sm text-foreground/80 leading-relaxed">
            <TypingText text={searchPlan} speed={0} delay={0} enabled={isStreamingPlan} />
          </div>
        </div>
      )}

      {/* Image Gallery */}
      {hasImages && (
        <Collapsible open={isImagesOpen} onOpenChange={setIsImagesOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between px-3 py-2 h-auto hover:bg-muted/50 border border-border/40 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{tImages('title')}</span>
                <Badge variant="secondary" className="text-xs">
                  {safeResults.reduce((count, r) => {
                    const metaImageCount = r.metadata?.imageUrl ? 1 : 0;
                    const arrayImageCount = r.images?.length || 0;
                    return count + metaImageCount + arrayImageCount;
                  }, 0)}
                  {' '}
                  images
                </Badge>
              </div>
              {isImagesOpen
                ? <ChevronUp className="size-4 text-muted-foreground" />
                : <ChevronDown className="size-4 text-muted-foreground" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <WebSearchImageGallery results={safeResults} />
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Raw Content Preview */}
      {hasRawContent && resultsWithContent.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {tContent('title')}
              </span>
              <Badge variant="secondary" className="text-xs">
                {resultsWithContent.length}
                {' '}
                {resultsWithContent.length === 1 ? 'page' : 'pages'}
              </Badge>
              {totalWordCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  {totalWordCount.toLocaleString()}
                  {' '}
                  words
                </Badge>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {resultsWithContent.map((result, idx) => (
              <WebSearchContentPreview
                key={result.url}
                result={result}
                defaultExpanded={idx === 0}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

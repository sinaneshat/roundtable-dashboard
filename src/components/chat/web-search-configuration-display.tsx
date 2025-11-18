'use client';

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Hash,
  Layers,
  Lightbulb,
  Search,
  Settings,
  Sparkles,
  Target,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { WebSearchResultItem } from '@/api/routes/chat/schema';
import { AnimatedBadge, AnimatedListItem } from '@/components/ui/animated-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { FadeInText, TypingText } from '@/components/ui/typing-text';
import { cn } from '@/lib/ui/cn';

import { WebSearchConfigPanel } from './web-search-config-panel';
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
  totalResults = 0,
  successCount = 0,
  failureCount = 0,
  totalTime = 0,
  autoParameters,
  searchPlan,
  isStreamingPlan = false,
  className,
  onConfigChange,
}: WebSearchConfigurationDisplayProps) {
  const t = useTranslations('chat.tools.webSearch.configuration');
  const tPreSearch = useTranslations('chat.preSearch.plan');
  const tDepth = useTranslations('chat.preSearch.searchDepth');
  const tImages = useTranslations('chat.tools.webSearch.images');
  const tContent = useTranslations('chat.tools.webSearch.contentPreview');
  const [isOpen, setIsOpen] = useState(false);
  const [isImagesOpen, setIsImagesOpen] = useState(false);

  // Don't render if no data available
  if ((!queries || queries.length === 0) && !autoParameters && !searchPlan) {
    return null;
  }

  const totalQueries = queries?.length || 0;
  const successRate = totalQueries > 0 ? (successCount / totalQueries) * 100 : 0;

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
              <Sparkles className="size-4 text-primary" />
              <span className="text-sm font-medium text-foreground">{tPreSearch('title')}</span>
              {isStreamingPlan && (
                <AnimatedBadge delay={0.1}>
                  <Badge variant="secondary" className="text-xs animate-pulse">
                    Generating...
                  </Badge>
                </AnimatedBadge>
              )}
            </div>
          </FadeInText>
          <div className="text-sm text-foreground/80 leading-relaxed pl-6">
            <TypingText text={searchPlan} speed={15} delay={100} enabled={isStreamingPlan} />
          </div>
        </div>
      )}

      {/* Configuration Controls - NEW */}
      {onConfigChange && (
        <WebSearchConfigPanel
          maxResults={totalResults}
          searchDepth={autoParameters?.searchDepth as 'basic' | 'advanced' || 'basic'}
          numQueries={totalQueries}
          onConfigChange={onConfigChange}
          defaultExpanded={false}
        />
      )}

      {/* Configuration Details - Minimal */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between px-0 py-2 h-auto hover:bg-transparent"
          >
            <div className="flex items-center gap-2">
              <Settings className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('title')}</span>
              {totalQueries > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {totalQueries}
                  {' '}
                  {t('queriesGenerated')}
                </Badge>
              )}
            </div>
            {isOpen
              ? <ChevronUp className="size-4 text-muted-foreground" />
              : <ChevronDown className="size-4 text-muted-foreground" />}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-2 pl-6">
          <div className="space-y-3">
            {/* Performance Summary - Simplified */}
            {totalQueries > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Hash className="size-3" />
                  <span className="font-medium">{totalQueries}</span>
                  <span>{t('queries')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Search className="size-3" />
                  <span className="font-medium">{totalResults}</span>
                  <span>{t('results')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3" />
                  <span className="font-medium">
                    {totalTime < 1000
                      ? `${totalTime}ms`
                      : `${(totalTime / 1000).toFixed(1)}s`}
                  </span>
                </div>
              </div>
            )}

            {/* Success Rate Indicator */}
            {totalQueries > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Activity className="size-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">{t('performance')}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {successRate.toFixed(0)}
                    %
                    {' '}
                    {t('successRate')}
                  </span>
                </div>
                <Progress value={successRate} className="h-2" />
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-green-600 dark:text-green-400" />
                    <span className="text-xs text-muted-foreground">
                      {successCount}
                      {' '}
                      {t('successful')}
                    </span>
                  </div>
                  {failureCount > 0 && (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="size-3.5 text-red-600 dark:text-red-400" />
                      <span className="text-xs text-muted-foreground">
                        {failureCount}
                        {' '}
                        {t('failed')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI-Detected Parameters */}
            {autoParameters && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="size-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">{t('autoDetectedParams')}</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {autoParameters.searchDepth && (
                      <Badge
                        variant={autoParameters.searchDepth === 'advanced' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        <Layers className="size-3 mr-1" />
                        {autoParameters.searchDepth === 'advanced' ? 'Advanced Search' : 'Basic Search'}
                      </Badge>
                    )}
                    {autoParameters.topic && (
                      <Badge variant="outline" className="text-xs capitalize">
                        <Target className="size-3 mr-1" />
                        {autoParameters.topic}
                      </Badge>
                    )}
                    {autoParameters.timeRange && (
                      <Badge variant="outline" className="text-xs capitalize">
                        <Clock className="size-3 mr-1" />
                        {autoParameters.timeRange.replace('_', ' ')}
                      </Badge>
                    )}
                  </div>

                  {autoParameters.reasoning && (
                    <div className="p-2.5 rounded-md bg-muted/30 border border-border/30">
                      <p className="text-xs text-foreground/80 leading-relaxed italic">
                        {autoParameters.reasoning}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Generated Queries - Simplified List */}
            {queries && queries.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Search className="size-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground/70">{t('generatedQueries')}</span>
                </div>

                <div className="space-y-2">
                  {queries.map((query, idx) => {
                    const uniqueKey = query.index !== undefined
                      ? `query-${query.index}`
                      : `query-${query.query}-${query.searchDepth}`;
                    const displayIndex = query.index !== undefined ? query.index + 1 : 0;

                    return (
                      <AnimatedListItem key={uniqueKey} index={idx} className="pl-6 space-y-1">
                        <div className="flex items-start gap-2">
                          {displayIndex > 0 && (
                            <FadeInText delay={idx * 0.05}>
                              <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                                {displayIndex}
                                .
                              </span>
                            </FadeInText>
                          )}
                          <p className="text-xs text-foreground/80 break-words flex-1">
                            <TypingText
                              text={query.query}
                              speed={10}
                              delay={idx * 50 + 50}
                            />
                          </p>
                        </div>
                        {query.searchDepth && (
                          <AnimatedBadge delay={idx * 0.05 + 0.2}>
                            <Badge
                              variant={query.searchDepth === 'advanced' ? 'default' : 'secondary'}
                              className="text-xs h-5 ml-5"
                            >
                              {tDepth(query.searchDepth)}
                            </Badge>
                          </AnimatedBadge>
                        )}
                      </AnimatedListItem>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Image Gallery - NEW (Tavily Feature) */}
      {hasImages && (
        <Collapsible open={isImagesOpen} onOpenChange={setIsImagesOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between px-3 py-2 h-auto hover:bg-muted/50 border border-border/40 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
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

      {/* Raw Content Preview - NEW (Tavily Feature) */}
      {hasRawContent && resultsWithContent.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center gap-2">
              <Hash className="size-4 text-muted-foreground" />
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

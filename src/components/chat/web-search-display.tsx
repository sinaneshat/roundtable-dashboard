'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ChevronDown, ChevronUp, Globe, Search, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { WebSearchDisplayProps } from '@/api/routes/chat/schema';
import { LLMAnswerDisplay } from '@/components/chat/llm-answer-display';
import { WebSearchImageGallery } from '@/components/chat/web-search-image-gallery';
import { WebSearchParametersDisplay } from '@/components/chat/web-search-parameters-display';
import { WebSearchResultItem } from '@/components/chat/web-search-result-item';
import { WebSearchStatistics } from '@/components/chat/web-search-statistics';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

// Card-based display component
export function WebSearchDisplay({
  results,
  className,
  meta,
  answer,
  isStreaming = false,
  requestId,
  query,
  autoParameters,
}: WebSearchDisplayProps & {
  isStreaming?: boolean;
  requestId?: string;
  query?: string;
  autoParameters?: {
    topic?: string;
    timeRange?: string;
    searchDepth?: string;
    reasoning?: string;
  };
}) {
  const t = useTranslations('chat.tools.webSearch');
  const [isOpen, setIsOpen] = useState(true);

  // Show loading state while streaming
  if (isStreaming && (!results || results.length === 0)) {
    // Determine current stage based on available data
    const currentStage = !query
      ? 'query'
      : !answer
          ? 'search'
          : 'synthesize';

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn('relative py-2', className)}
      >
        <div>
          <div className="mb-3">
            {/* Simple header */}
            <div className="flex items-center gap-2 mb-2">
              <Globe className="size-4 text-muted-foreground animate-pulse" />
              <span className="text-sm font-medium text-foreground">{t('title')}</span>
              <span className="text-xs text-muted-foreground animate-pulse">searching...</span>
            </div>

            {/* Compact stages */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn(currentStage === 'query' && 'font-medium animate-pulse')}>
                Query
              </span>
              <span>→</span>
              <span className={cn(currentStage === 'search' && 'font-medium animate-pulse')}>
                Search
              </span>
              <span>→</span>
              <span className={cn(currentStage === 'synthesize' && 'font-medium animate-pulse')}>
                Answer
              </span>
            </div>
          </div>

          {/* Simplified skeletons */}
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-5/6" />
          </div>
        </div>
      </motion.div>
    );
  }

  if (!results || results.length === 0) {
    return null;
  }

  const totalResults = results.length;
  const successfulResults = results.filter(r => r.title !== 'Search Failed');
  const hasErrors = successfulResults.length < totalResults;

  // Count results with full content
  const resultsWithContent = successfulResults.filter(r => r.fullContent);
  const hasFullContent = resultsWithContent.length > 0;

  // Determine if this is a cached result or fresh search
  const isCached = meta?.cached === true;
  const limitReached = meta?.limitReached === true;
  const hasMetadata = meta && (meta.searchesUsed !== undefined || meta.remainingSearches !== undefined);

  // Calculate total words extracted
  const totalWords = successfulResults.reduce((sum, r) => sum + (r.metadata?.wordCount || 0), 0);

  // Check if we have images
  const hasImages = successfulResults.some(r => r.metadata?.imageUrl);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('relative py-2', className)}
    >
      <div className="border-l-2 border-primary/20 pl-3">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between px-2 py-1.5 h-auto hover:bg-muted/30"
            >
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <div className="flex items-center gap-1.5">
                  <Globe className="size-4 text-muted-foreground" />
                  <span className="font-medium">{t('title')}</span>
                </div>

                {/* Results summary badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Search depth indicator */}
                  {autoParameters?.searchDepth && (
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-xs',
                        autoParameters.searchDepth === 'advanced'
                          ? 'bg-purple-500/10 text-purple-700 dark:text-purple-400'
                          : 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
                      )}
                    >
                      {autoParameters.searchDepth === 'advanced' ? '🔬 Advanced Search' : '⚡ Quick Search'}
                    </Badge>
                  )}

                  {/* Results count */}
                  <Badge variant="secondary" className="text-xs">
                    <Search className="size-3 mr-1" />
                    {successfulResults.length}
                    {' '}
                    {t(successfulResults.length === 1 ? 'source.singular' : 'source.plural')}
                  </Badge>

                  {hasFullContent && (
                    <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400">
                      <TrendingUp className="size-3 mr-1" />
                      {resultsWithContent.length}
                      {' '}
                      with content
                    </Badge>
                  )}

                  {totalWords > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {totalWords.toLocaleString()}
                      {' '}
                      words extracted
                    </Badge>
                  )}

                  {/* Cached indicator */}
                  {isCached && (
                    <Badge variant="secondary" className="text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                      <Zap className="size-3 mr-1" />
                      Cached
                    </Badge>
                  )}

                  {/* Query display */}
                  {query && (
                    <Badge variant="outline" className="text-xs bg-muted/50 max-w-[200px]">
                      <span className="truncate">{query}</span>
                    </Badge>
                  )}

                  {/* Search limit */}
                  {hasMetadata && !limitReached && (
                    <Badge variant="outline" className="text-xs">
                      {meta.remainingSearches !== undefined
                        ? `${meta.remainingSearches} left`
                        : `${meta.searchesUsed}/${meta.maxSearches}`}
                    </Badge>
                  )}

                  {limitReached && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="size-3 mr-1" />
                      Limit Reached
                    </Badge>
                  )}

                  {hasErrors && (
                    <Badge variant="destructive" className="text-xs">
                      {totalResults - successfulResults.length}
                      {' '}
                      {t('failed')}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isOpen
                  ? (
                      <ChevronUp className="size-4 text-muted-foreground" />
                    )
                  : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
              </div>
            </Button>
          </CollapsibleTrigger>

          <AnimatePresence>
            {isOpen && (
              <CollapsibleContent forceMount>
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-border/50"
                >
                  {/* Results display - Reorganized to match Tavily pattern */}
                  <div className="p-4 space-y-4">
                    {/* 1. Search Plan/Reasoning - Show prominently at TOP if available */}
                    {autoParameters?.reasoning && (
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="size-5 rounded-full bg-primary/10 flex items-center justify-center">
                            <Sparkles className="size-3 text-primary" />
                          </div>
                          <p className="text-sm font-medium text-foreground">Search Plan</p>
                          {isStreaming && (
                            <Badge variant="secondary" className="text-xs animate-pulse">
                              Generating...
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-foreground/90 leading-relaxed pl-7">
                          {autoParameters.reasoning}
                        </p>
                      </div>
                    )}

                    {/* 2. AI Answer Summary - Display prominently with streaming support */}
                    {(answer || isStreaming) && (
                      <div className="p-4 rounded-lg bg-muted/10 border border-border/30">
                        <LLMAnswerDisplay
                          answer={answer ?? null}
                          isStreaming={isStreaming}
                          sources={successfulResults.map(r => ({ url: r.url, title: r.title }))}
                        />
                      </div>
                    )}

                    {/* 3. Search Statistics - Show comprehensive metrics */}
                    {!isStreaming && successfulResults.length > 0 && (
                      <WebSearchStatistics
                        results={successfulResults}
                      />
                    )}

                    {/* 4. Search Parameters Display - Collapsible details */}
                    <WebSearchParametersDisplay
                      autoParameters={autoParameters}
                      query={query}
                    />

                    {/* 5. Image Gallery */}
                    {hasImages && <WebSearchImageGallery results={successfulResults} />}

                    {/* 6. Detailed Sources - Expandable detailed results */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between py-2 border-t border-border/20 pt-4">
                        <div className="flex items-center gap-2">
                          <Search className="size-4 text-muted-foreground" />
                          <p className="text-sm font-medium text-foreground">
                            Detailed Sources
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {successfulResults.length}
                            {' '}
                            {successfulResults.length === 1 ? 'source' : 'sources'}
                          </Badge>
                          {hasFullContent && (
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                              {resultsWithContent.length}
                              {' '}
                              with full content
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="space-y-0">
                        {successfulResults.map((result, index) => (
                          <WebSearchResultItem
                            key={result.url}
                            result={result}
                            showDivider={index < successfulResults.length - 1}
                            citationNumber={index + 1}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Error display */}
                    {hasErrors && (
                      <Alert variant="destructive" className="mt-4">
                        <AlertCircle className="size-4" />
                        <AlertDescription>
                          {t('error.failedToLoad', {
                            count: totalResults - successfulResults.length,
                          })}
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Progress indicator for content extraction */}
                    {hasFullContent && (
                      <div className="mt-4 p-3 rounded-md bg-muted/50">
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Content extraction progress</span>
                            <span>
                              {resultsWithContent.length}
                              {' '}
                              /
                              {' '}
                              {successfulResults.length}
                              {' '}
                              pages
                            </span>
                          </div>
                          <Progress
                            value={(resultsWithContent.length / successfulResults.length) * 100}
                            className="h-2"
                          />
                        </div>
                      </div>
                    )}

                    {/* Request ID footer (subtle) */}
                    {requestId && (
                      <div className="mt-4 pt-3 border-t border-border/20">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                                <span>
                                  {t('requestId')}
                                  :
                                </span>
                                <code className="font-mono text-xs bg-muted/30 px-1.5 py-0.5 rounded">
                                  {requestId.slice(0, 12)}
                                  ...
                                </code>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="space-y-1">
                                <p className="font-medium">Full Request ID</p>
                                <code className="text-xs">{requestId}</code>
                                <p className="text-xs text-muted-foreground">For support and debugging</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                  </div>
                </motion.div>
              </CollapsibleContent>
            )}
          </AnimatePresence>
        </Collapsible>
      </div>
    </motion.div>
  );
}

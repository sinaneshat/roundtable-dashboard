'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ChevronDown, ChevronUp, Globe, Search, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { WebSearchDisplayProps } from '@/api/routes/chat/schema';
import { LLMAnswerDisplay } from '@/components/chat/llm-answer-display';
import { WebSearchImageGallery } from '@/components/chat/web-search-image-gallery';
import { WebSearchResultItem } from '@/components/chat/web-search-result-item';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn('relative', className)}
      >
        <Card className="overflow-hidden border-primary/10 bg-gradient-to-br from-primary/5 via-background to-background">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative">
                <Globe className="size-5 text-primary animate-pulse" />
                <Sparkles className="size-3 text-yellow-500 absolute -top-1 -right-1 animate-pulse" />
              </div>
              <span className="text-base font-semibold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                {t('title')}
              </span>
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="size-3 mr-1 animate-pulse" />
                {t('searching')}
              </Badge>
            </div>
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        </Card>
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
      className={cn('relative', className)}
    >
      <Card className="overflow-hidden border-primary/10 bg-gradient-to-br from-primary/5 via-background to-background">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between p-4 h-auto hover:bg-primary/5 rounded-t-lg"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Globe className="size-5 text-primary" />
                    <Sparkles className="size-3 text-yellow-500 absolute -top-1 -right-1" />
                  </div>
                  <span className="text-base font-semibold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                    {t('title')}
                  </span>
                </div>

                {/* Results summary badges */}
                <div className="flex items-center gap-2">
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
                  {/* Results display */}
                  <div className="p-4 space-y-4">
                    {/* Search Query Display */}
                    {query && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/40">
                        <div className="flex-shrink-0 pt-0.5">
                          <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <Globe className="size-3.5 text-primary" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Search Query</p>
                          <p className="text-sm font-medium text-foreground">
                            &quot;
                            {query}
                            &quot;
                          </p>
                          {autoParameters?.reasoning && (
                            <p className="text-xs text-muted-foreground/80 mt-1.5 italic">{autoParameters.reasoning}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Auto-detected Parameters */}
                    {autoParameters && (autoParameters.topic || autoParameters.searchDepth || autoParameters.timeRange) && (
                      <div className="flex flex-wrap gap-1.5">
                        {autoParameters.topic && (
                          <Badge variant="secondary" className="text-xs">
                            Topic:
                            {' '}
                            {autoParameters.topic}
                          </Badge>
                        )}
                        {autoParameters.searchDepth && (
                          <Badge variant="secondary" className="text-xs">
                            Depth:
                            {' '}
                            {autoParameters.searchDepth}
                          </Badge>
                        )}
                        {autoParameters.timeRange && (
                          <Badge variant="secondary" className="text-xs">
                            Time:
                            {' '}
                            {autoParameters.timeRange}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* LLM Answer - Display prominently at top with streaming support */}
                    {(answer || isStreaming) && <LLMAnswerDisplay answer={answer ?? null} isStreaming={isStreaming} />}

                    {/* Image Gallery */}
                    {hasImages && <WebSearchImageGallery results={successfulResults} />}

                    {/* Search Results */}
                    <div className="space-y-0">
                      {successfulResults.map((result, index) => (
                        <WebSearchResultItem
                          key={result.url}
                          result={result}
                          showDivider={index < successfulResults.length - 1}
                        />
                      ))}
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
      </Card>
    </motion.div>
  );
}

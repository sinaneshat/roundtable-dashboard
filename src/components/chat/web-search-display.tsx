'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ChevronDown, ChevronUp, Globe, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { WebSearchDisplayProps } from '@/api/routes/chat/schema';
import { LLMAnswerDisplay } from '@/components/chat/llm-answer-display';
import { WebSearchImageGallery } from '@/components/chat/web-search-image-gallery';
import { WebSearchResultItem } from '@/components/chat/web-search-result-item';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

// Card-based display component
export function WebSearchDisplay({
  results,
  className,
  meta: _meta,
  answer,
  isStreaming = false,
  requestId: _requestId,
  query: _query,
  autoParameters: _autoParameters,
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
    const currentStage = !_query
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

                {/* Results summary badges - Simplified for clean UX */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Results count */}
                  <Badge variant="secondary" className="text-xs">
                    <Search className="size-3 mr-1" />
                    {successfulResults.length}
                    {' '}
                    {t(successfulResults.length === 1 ? 'source.singular' : 'source.plural')}
                  </Badge>

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
                  {/* Results display - Clean, focused on rich content */}
                  <div className="p-4 space-y-4">
                    {/* 1. AI Answer Summary - Display prominently with streaming support */}
                    {(answer || isStreaming) && (
                      <div className="p-4 rounded-lg bg-muted/10 border border-border/30">
                        <LLMAnswerDisplay
                          answer={answer ?? null}
                          isStreaming={isStreaming}
                          sources={successfulResults.map(r => ({ url: r.url, title: r.title }))}
                        />
                      </div>
                    )}

                    {/* 2. Image Gallery - Show rich visual content */}
                    {hasImages && <WebSearchImageGallery results={successfulResults} />}

                    {/* 3. Detailed Sources - Expandable detailed results */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between py-2 border-t border-border/20 pt-4">
                        <div className="flex items-center gap-2">
                          <Search className="size-4 text-muted-foreground" />
                          <p className="text-sm font-medium text-foreground">
                            Detailed Sources
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {successfulResults.length}
                          {' '}
                          {successfulResults.length === 1 ? 'source' : 'sources'}
                        </Badge>
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

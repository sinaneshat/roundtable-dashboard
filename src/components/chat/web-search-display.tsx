'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ChevronDown, ChevronUp, Globe, Search, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { WebSearchComplexity } from '@/api/core/enums';
import type { WebSearchResultItem, WebSearchResultMeta } from '@/api/routes/chat/schema';
import { WebSearchResultCard } from '@/components/chat/web-search-result-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/ui/cn';

type WebSearchDisplayProps = {
  results: WebSearchResultItem[];
  className?: string;
  meta?: WebSearchResultMeta;
  complexity?: WebSearchComplexity;
};

// Export the flat version as default (no nested cards)
export { WebSearchFlatDisplay as default } from './web-search-flat-display';

// Keep the original display component for backward compatibility
export function WebSearchDisplay({ results, className, meta }: WebSearchDisplayProps) {
  const t = useTranslations('chat.tools.webSearch');
  const [isOpen, setIsOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'cards' | 'compact'>('cards');

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
                  {/* View mode toggle */}
                  <div className="p-3 border-b border-border/30 bg-muted/30">
                    <Tabs value={viewMode} onValueChange={v => setViewMode(v as 'cards' | 'compact')}>
                      <TabsList className="grid w-full max-w-xs grid-cols-2">
                        <TabsTrigger value="cards">
                          <Globe className="size-4 mr-2" />
                          Cards View
                        </TabsTrigger>
                        <TabsTrigger value="compact">
                          <Search className="size-4 mr-2" />
                          Compact View
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  {/* Results display */}
                  <div className="p-4">
                    {viewMode === 'cards'
                      ? (
                          <div className="space-y-4">
                            {successfulResults.map((result, index) => (
                              <WebSearchResultCard
                                key={result.url}
                                result={result}
                                index={index}
                                defaultExpanded={index === 0 && hasFullContent}
                              />
                            ))}
                          </div>
                        )
                      : (
                          <div className="space-y-2">
                            {successfulResults.map((result, index) => (
                              <motion.div
                                key={result.url}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.03 }}
                                className="p-3 rounded-md border border-border/30 bg-card/50 hover:bg-card/80 transition-colors"
                              >
                                <div className="flex items-start gap-3">
                                  <Badge variant="outline" className="text-xs mt-0.5">
                                    {index + 1}
                                  </Badge>
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <h4 className="text-sm font-medium line-clamp-1">
                                      {result.title}
                                    </h4>
                                    <a
                                      href={result.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-primary hover:underline truncate block"
                                    >
                                      {result.domain}
                                    </a>
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                      {result.excerpt || result.content}
                                    </p>
                                    {result.fullContent && (
                                      <Badge variant="secondary" className="text-xs">
                                        Full content available
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        )}

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

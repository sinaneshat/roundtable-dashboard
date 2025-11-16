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
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/ui/cn';

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
};

export function WebSearchConfigurationDisplay({
  queries,
  totalResults = 0,
  successCount = 0,
  failureCount = 0,
  totalTime = 0,
  autoParameters,
  searchPlan,
  isStreamingPlan = false,
  className,
}: WebSearchConfigurationDisplayProps) {
  const t = useTranslations('chat.tools.webSearch.configuration');
  const tPreSearch = useTranslations('chat.preSearch.plan');
  const [isOpen, setIsOpen] = useState(false);
  const [isPlanExpanded, setIsPlanExpanded] = useState(true);

  // Don't render if no data available
  if ((!queries || queries.length === 0) && !autoParameters && !searchPlan) {
    return null;
  }

  const totalQueries = queries?.length || 0;
  const successRate = totalQueries > 0 ? (successCount / totalQueries) * 100 : 0;
  const avgTimePerQuery = totalQueries > 0 ? totalTime / totalQueries : 0;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Search Plan - Display Prominently at Top */}
      {searchPlan && (
        <Collapsible open={isPlanExpanded} onOpenChange={setIsPlanExpanded}>
          <div className="rounded-lg bg-primary/5 border border-primary/20">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between px-3 py-2 h-auto hover:bg-primary/10"
              >
                <div className="flex items-center gap-2">
                  <div className="size-5 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="size-3 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{tPreSearch('title')}</span>
                  {isStreamingPlan && (
                    <Badge variant="secondary" className="text-xs animate-pulse">
                      Generating...
                    </Badge>
                  )}
                </div>
                {isPlanExpanded
                  ? <ChevronUp className="size-4 text-muted-foreground" />
                  : <ChevronDown className="size-4 text-muted-foreground" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <div className="pt-2 text-sm text-foreground/90 leading-relaxed">
                {searchPlan}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* Configuration Details - Collapsible */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between px-3 py-2 h-auto hover:bg-muted/50 border border-border/40 rounded-lg"
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

        <CollapsibleContent className="pt-3">
          <div className="space-y-4 px-3 py-3 rounded-lg bg-muted/20 border border-border/30">
            {/* Performance Summary Cards */}
            {totalQueries > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {/* Queries Count */}
                <div className="p-2.5 rounded-md bg-background border border-border/40 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Hash className="size-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{t('queries')}</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{totalQueries}</p>
                </div>

                {/* Results Count */}
                <div className="p-2.5 rounded-md bg-background border border-border/40 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Search className="size-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{t('results')}</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{totalResults}</p>
                </div>

                {/* Total Time */}
                <div className="p-2.5 rounded-md bg-background border border-border/40 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Clock className="size-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{t('totalTime')}</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    {totalTime < 1000
                      ? `${totalTime}ms`
                      : `${(totalTime / 1000).toFixed(1)}s`}
                  </p>
                </div>

                {/* Average Time */}
                <div className="p-2.5 rounded-md bg-background border border-border/40 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Zap className="size-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{t('avgTime')}</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    {avgTimePerQuery < 1000
                      ? `${avgTimePerQuery.toFixed(0)}ms`
                      : `${(avgTimePerQuery / 1000).toFixed(1)}s`}
                  </p>
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

            {/* Generated Queries List */}
            {queries && queries.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Search className="size-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">{t('generatedQueries')}</span>
                  </div>

                  <div className="space-y-2">
                    {queries.map((query) => {
                    // Use query.index if available, otherwise use query + searchDepth for uniqueness
                      const uniqueKey = query.index !== undefined
                        ? `query-${query.index}`
                        : `query-${query.query}-${query.searchDepth}`;
                      const displayIndex = query.index !== undefined ? query.index + 1 : 0;

                      return (
                        <div
                          key={uniqueKey}
                          className="p-3 rounded-md bg-background border border-border/40 space-y-2"
                        >
                          <div className="flex items-start gap-2">
                            {displayIndex > 0 && (
                              <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                                {displayIndex}
                              </Badge>
                            )}
                            <div className="flex-1 min-w-0 space-y-2">
                              <p className="text-sm font-medium text-foreground break-words">
                                {query.query}
                              </p>

                              {query.rationale && (
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                  <span className="font-medium">
                                    {t('rationale')}
                                    :
                                  </span>
                                  {' '}
                                  {query.rationale}
                                </p>
                              )}

                              <div className="flex flex-wrap gap-2">
                                {query.searchDepth && (
                                  <Badge
                                    variant={query.searchDepth === 'advanced' ? 'default' : 'secondary'}
                                    className="text-xs"
                                  >
                                    <Layers className="size-3 mr-1" />
                                    {query.searchDepth === 'advanced' ? 'Advanced' : 'Basic'}
                                  </Badge>
                                )}
                                {query.complexity && (
                                  <Badge variant="outline" className="text-xs capitalize">
                                    <TrendingUp className="size-3 mr-1" />
                                    {query.complexity}
                                  </Badge>
                                )}
                                {query.sourceCount !== undefined && (
                                  <Badge variant="outline" className="text-xs">
                                    <Hash className="size-3 mr-1" />
                                    {query.sourceCount}
                                    {' '}
                                    {t('sources')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

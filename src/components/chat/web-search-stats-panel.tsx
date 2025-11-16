'use client';

import {
  BarChart3,
  Clock,
  Database,
  FileText,
  Globe,
  Layers,
  Search,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';

import type { WebSearchResultMeta } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

type WebSearchStatsPanelProps = {
  meta?: WebSearchResultMeta;
  resultCount: number;
  totalWords: number;
  searchDepth?: 'basic' | 'advanced';
  responseTime?: number;
  hasFullContent?: boolean;
  className?: string;
};

export function WebSearchStatsPanel({
  meta,
  resultCount,
  totalWords,
  searchDepth,
  responseTime,
  hasFullContent,
  className,
}: WebSearchStatsPanelProps) {
  const stats = [
    {
      icon: Search,
      label: 'Sources Found',
      value: resultCount.toString(),
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      icon: FileText,
      label: 'Words Extracted',
      value: totalWords.toLocaleString(),
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      icon: Clock,
      label: 'Response Time',
      value: responseTime ? `${responseTime}ms` : 'N/A',
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
    {
      icon: Layers,
      label: 'Search Depth',
      value: searchDepth === 'advanced' ? 'Advanced' : 'Basic',
      color: searchDepth === 'advanced' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400',
      bgColor: searchDepth === 'advanced' ? 'bg-orange-500/10' : 'bg-gray-500/10',
    },
  ];

  const cacheHitRate = meta?.cacheHitRate ? Math.round(meta.cacheHitRate * 100) : 0;
  const searchesRemaining = meta?.remainingSearches;
  const searchesUsed = meta?.searchesUsed;
  const maxSearches = meta?.maxSearches;

  return (
    <Card className={cn('border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background', className)}>
      <CardContent className="p-4 space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <TooltipProvider key={index}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col gap-2 p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-card transition-colors cursor-help">
                      <div className="flex items-center gap-2">
                        <div className={cn('p-1.5 rounded-md', stat.bgColor)}>
                          <Icon className={cn('size-3.5', stat.color)} />
                        </div>
                        <span className="text-xs text-muted-foreground">{stat.label}</span>
                      </div>
                      <div className={cn('text-lg font-semibold', stat.color)}>
                        {stat.value}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      {stat.label}
                      :
                      {' '}
                      {stat.value}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>

        {/* Advanced Features Indicator */}
        {(searchDepth === 'advanced' || hasFullContent || meta?.cached) && (
          <>
            <Separator className="opacity-30" />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">Search Features</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchDepth === 'advanced' && (
                  <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">
                    <BarChart3 className="size-3 mr-1" />
                    Advanced Search
                  </Badge>
                )}
                {hasFullContent && (
                  <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                    <Database className="size-3 mr-1" />
                    Full Content Extraction
                  </Badge>
                )}
                {meta?.cached && (
                  <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
                    <Zap className="size-3 mr-1" />
                    Cached Result
                  </Badge>
                )}
                {meta?.complexity && (
                  <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                    <Sparkles className="size-3 mr-1" />
                    {meta.complexity.charAt(0).toUpperCase() + meta.complexity.slice(1)}
                    {' '}
                    Complexity
                  </Badge>
                )}
              </div>
            </div>
          </>
        )}

        {/* Cache Performance */}
        {meta?.cached !== undefined && (
          <>
            <Separator className="opacity-30" />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="size-3.5 text-primary" />
                  <span className="text-xs font-medium text-foreground">Cache Performance</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {cacheHitRate}
                  % hit rate
                </span>
              </div>
              <Progress value={cacheHitRate} className="h-2" />
              {meta.cacheAge && (
                <p className="text-xs text-muted-foreground">
                  Cached
                  {' '}
                  {Math.round(meta.cacheAge / 1000)}
                  s ago
                </p>
              )}
            </div>
          </>
        )}

        {/* Usage Limits */}
        {(searchesRemaining !== undefined || (searchesUsed !== undefined && maxSearches !== undefined)) && (
          <>
            <Separator className="opacity-30" />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="size-3.5 text-primary" />
                  <span className="text-xs font-medium text-foreground">Search Quota</span>
                </div>
                {searchesRemaining !== undefined && (
                  <Badge variant="outline" className="text-xs">
                    {searchesRemaining}
                    {' '}
                    remaining
                  </Badge>
                )}
              </div>
              {searchesUsed !== undefined && maxSearches !== undefined && (
                <>
                  <Progress
                    value={(searchesUsed / maxSearches) * 100}
                    className={cn(
                      'h-2',
                      (searchesUsed / maxSearches) > 0.8 && '[&>div]:bg-orange-600',
                      (searchesUsed / maxSearches) > 0.95 && '[&>div]:bg-red-600',
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    {searchesUsed}
                    {' '}
                    of
                    {maxSearches}
                    {' '}
                    searches used
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

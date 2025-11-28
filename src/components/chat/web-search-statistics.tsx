'use client';

import {
  BarChart3,
  BookOpen,
  Clock,
  FileText,
  Image as ImageIcon,
  TrendingUp,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { WebSearchResultItem } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

type WebSearchStatisticsProps = {
  results: WebSearchResultItem[];
  responseTime?: number;
  className?: string;
};

export function WebSearchStatistics({
  results,
  responseTime,
  className,
}: WebSearchStatisticsProps) {
  const t = useTranslations('chat.tools.webSearch.statistics');

  // Calculate statistics
  const totalResults = results.length;
  const resultsWithFullContent = results.filter(r => r.fullContent).length;
  const totalWords = results.reduce((sum, r) => sum + (r.metadata?.wordCount || 0), 0);
  const totalImages = results.reduce(
    (sum, r) => sum + (r.images?.length || 0) + (r.metadata?.imageUrl ? 1 : 0),
    0,
  );
  const avgReadingTime = results.reduce((sum, r) => sum + (r.metadata?.readingTime || 0), 0) / totalResults;
  const avgRelevance = results.reduce((sum, r) => sum + r.score, 0) / totalResults;
  const contentExtractionRate = (resultsWithFullContent / totalResults) * 100;

  // Categorize results by content type
  const contentTypes = results.reduce<Record<string, number>>((acc, r) => {
    const type = r.contentType || 'general';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="size-4 text-primary" />
        <span className="text-sm font-medium">{t('title')}</span>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {/* Total Results */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <FileText className="size-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{t('totalResults')}</span>
                </div>
                <p className="text-xl font-bold text-foreground">{totalResults}</p>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{t('totalResultsDesc')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Full Content Extraction */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="size-3.5 text-green-600 dark:text-green-400" />
                  <span className="text-xs text-muted-foreground">{t('fullContent')}</span>
                </div>
                <p className="text-xl font-bold text-foreground">{resultsWithFullContent}</p>
                <Progress
                  value={contentExtractionRate}
                  className="h-1.5"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {contentExtractionRate.toFixed(0)}
                % of results with full content
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Total Words */}
        {totalWords > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="size-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{t('totalWords')}</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    {totalWords > 1000
                      ? `${(totalWords / 1000).toFixed(1)}k`
                      : totalWords.toLocaleString()}
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {totalWords.toLocaleString()}
                  {' '}
                  words extracted from all sources
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Total Images */}
        {totalImages > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <ImageIcon className="size-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{t('totalImages')}</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">{totalImages}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {totalImages}
                  {' '}
                  images discovered across all sources
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Average Reading Time */}
        {avgReadingTime > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Clock className="size-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{t('avgReadTime')}</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    {avgReadingTime.toFixed(0)}
                    m
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Average reading time per source</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Response Time */}
        {responseTime && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Clock className="size-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{t('responseTime')}</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    {responseTime < 1000
                      ? `${responseTime}ms`
                      : `${(responseTime / 1000).toFixed(1)}s`}
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Total search and extraction time</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Quality Metrics */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">{t('qualityMetrics')}</span>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Average Relevance */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('avgRelevance')}</span>
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                avgRelevance >= 0.8
                  ? 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20'
                  : avgRelevance >= 0.6
                    ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20'
                    : 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
              )}
            >
              {(avgRelevance * 100).toFixed(0)}
              %
            </Badge>
          </div>

          {/* Content Types Distribution */}
          {Object.entries(contentTypes).map(([type, count]) => (
            <div key={type} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground capitalize">{type}</span>
              <Badge variant="secondary" className="text-xs">
                {count}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

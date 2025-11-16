'use client';
import {
  BookOpen,
  Calendar,
  ChevronDown,
  FileText,
  Globe,
  Lightbulb,
  Newspaper,
  Star,
  TrendingUp,
  User,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { WebSearchResultItemProps } from '@/api/routes/chat/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';
import { buildGoogleFaviconUrl, safeExtractDomain } from '@/lib/utils';

// Helper function to get content type icon
function getContentTypeIcon(contentType?: string) {
  switch (contentType) {
    case 'news':
      return Newspaper;
    case 'article':
      return FileText;
    case 'research':
      return BookOpen;
    case 'blog':
      return TrendingUp;
    default:
      return Globe;
  }
}

export function WebSearchResultItem({ result, showDivider = true, className }: WebSearchResultItemProps) {
  const t = useTranslations('chat.tools.webSearch');
  const [faviconError, setFaviconError] = useState(false);
  const [fallbackFaviconError, setFallbackFaviconError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // ✅ TYPE-SAFE: Extract domain with safe URL parsing (no throws)
  const domain = result.domain || safeExtractDomain(result.url, 'unknown');
  const cleanDomain = domain.replace('www.', '');
  const fallbackFaviconUrl = buildGoogleFaviconUrl(cleanDomain, 64);

  // Prioritize fullContent over content/excerpt (matching WebSearchFlatDisplay pattern)
  const hasFullContent = result.fullContent && result.fullContent.length > 0;
  const displayContent = hasFullContent ? result.fullContent : (result.content || result.excerpt);
  const isLongContent = displayContent && displayContent.length > 300;

  // Determine which favicon to show with multi-level fallback
  const getFaviconSrc = (): string | null => {
    if (!faviconError && result.metadata?.faviconUrl) {
      return result.metadata.faviconUrl;
    }
    if (!fallbackFaviconError) {
      return fallbackFaviconUrl;
    }
    return null;
  };

  const faviconSrc = getFaviconSrc();

  // Calculate relevance percentage (score is 0-1)
  const relevancePercentage = Math.round(result.score * 100);

  return (
    <div className={cn('flex gap-3 py-2.5', showDivider && 'border-b border-border/20', className)}>
      {/* Avatar with multi-level favicon fallback */}
      <Avatar className="size-8 flex-shrink-0 mt-0.5">
        <AvatarImage
          src={faviconSrc || ''}
          alt={cleanDomain}
          role="img"
          onError={() => {
            if (!faviconError) {
              setFaviconError(true);
            } else {
              setFallbackFaviconError(true);
            }
          }}
        />
        <AvatarFallback className="bg-muted/50 text-muted-foreground" role="img" aria-label={cleanDomain}>
          <Globe className="size-4" aria-hidden="true" />
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-sm hover:text-primary transition-colors line-clamp-1 block"
              >
                {result.title}
              </a>
            </TooltipTrigger>
            <TooltipContent>
              <p>{result.title}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground truncate">{cleanDomain}</p>

          {/* Relevance Score - Inline with domain, closer to content */}
          {result.score > 0 && (
            <Badge
              variant="outline"
              className={cn(
                'text-xs h-5 flex-shrink-0',
                relevancePercentage >= 80
                  ? 'bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400'
                  : relevancePercentage >= 60
                    ? 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-400'
                    : 'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-400',
              )}
            >
              <Star
                className={cn(
                  'size-3 mr-1',
                  relevancePercentage >= 80
                    ? 'fill-green-600/20'
                    : relevancePercentage >= 60
                      ? 'fill-yellow-600/20'
                      : 'fill-orange-600/20',
                )}
              />
              {relevancePercentage}
              %
            </Badge>
          )}
        </div>

        {/* Featured Image from scraped content - Show inline */}
        {result.metadata?.imageUrl && (
          <div className="rounded-md overflow-hidden border border-border/30 bg-muted/30 my-1.5">
            {/* eslint-disable-next-line next/no-img-element -- External image from search result */}
            <img
              src={result.metadata.imageUrl}
              alt={result.title}
              className="w-full h-auto max-h-48 object-cover"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Additional images from scraped content */}
        {result.images && result.images.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5 my-1.5">
            {result.images.slice(0, 3).map((img, idx) => (
              <div key={idx} className="rounded overflow-hidden border border-border/30 bg-muted/30 aspect-video">
                {/* eslint-disable-next-line next/no-img-element -- External images from search results */}
                <img
                  src={img.url}
                  alt={img.alt || img.description || result.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Content preview - Show full scraped content with expand/collapse */}
        {displayContent && (
          <div className="text-xs text-foreground/70 leading-relaxed">
            <p className={cn(!isExpanded && isLongContent && 'line-clamp-3')}>
              {displayContent}
            </p>

            {isLongContent && (
              <Button
                variant="link"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-0 h-auto text-xs mt-1"
              >
                <ChevronDown
                  className={cn('size-3 mr-1 transition-transform', isExpanded && 'rotate-180')}
                />
                {isExpanded ? 'Show less' : 'Show more'}
              </Button>
            )}
          </div>
        )}

        {/* Detailed Relevance Tooltip - Only show on hover */}
        {result.score > 0 && false && (
          <div className="pt-1 hidden">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Star
                          className={cn(
                            'size-3',
                            relevancePercentage >= 80
                              ? 'text-green-600 fill-green-600/20 dark:text-green-400'
                              : relevancePercentage >= 60
                                ? 'text-yellow-600 fill-yellow-600/20 dark:text-yellow-400'
                                : 'text-orange-600 fill-orange-600/20 dark:text-orange-400',
                          )}
                        />
                        <span>{t('relevanceLabel')}</span>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs h-5',
                          relevancePercentage >= 80
                            ? 'bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400'
                            : relevancePercentage >= 60
                              ? 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-400'
                              : 'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-400',
                        )}
                      >
                        {relevancePercentage}
                        % match
                      </Badge>
                    </div>
                    <Progress
                      value={relevancePercentage}
                      className={cn(
                        'h-1.5',
                        relevancePercentage >= 80
                          ? '[&>div]:bg-green-600 dark:[&>div]:bg-green-400'
                          : relevancePercentage >= 60
                            ? '[&>div]:bg-yellow-600 dark:[&>div]:bg-yellow-400'
                            : '[&>div]:bg-orange-600 dark:[&>div]:bg-orange-400',
                      )}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs text-muted-foreground">Relevance hidden</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {/* Metadata badges */}
        {(result.metadata?.author
          || result.publishedDate
          || result.metadata?.readingTime
          || result.metadata?.wordCount
          || result.contentType) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {/* Content Type Badge */}
            {result.contentType && (() => {
              const Icon = getContentTypeIcon(result.contentType);
              return (
                <Badge variant="outline" className="text-xs h-5">
                  <Icon className="size-3 mr-1" />
                  {t(`contentType.${result.contentType}`)}
                </Badge>
              );
            })()}

            {/* Author Badge */}
            {result.metadata?.author && (
              <Badge variant="outline" className="text-xs h-5">
                <User className="size-3 mr-1" />
                {result.metadata.author}
              </Badge>
            )}

            {/* Published Date Badge */}
            {result.publishedDate && (
              <Badge variant="outline" className="text-xs h-5">
                <Calendar className="size-3 mr-1" />
                {new Date(result.publishedDate).toLocaleDateString()}
              </Badge>
            )}

            {/* Reading Time Badge */}
            {result.metadata?.readingTime && (
              <Badge variant="outline" className="text-xs h-5">
                <BookOpen className="size-3 mr-1" />
                {result.metadata.readingTime}
                {' '}
                {t('metadata.minRead')}
              </Badge>
            )}

            {/* Word Count Badge */}
            {result.metadata?.wordCount && (
              <Badge variant="outline" className="text-xs h-5">
                {result.metadata.wordCount.toLocaleString()}
                {' '}
                {t('metadata.words')}
              </Badge>
            )}
          </div>
        )}

        {/* Key Points */}
        {result.keyPoints && result.keyPoints.length > 0 && (
          <div className="pt-2 space-y-1">
            <div className="flex items-center gap-1 text-xs font-medium text-foreground">
              <Lightbulb className="size-3" />
              <span>{t('keyPoints')}</span>
            </div>
            <ul className="space-y-0.5 pl-4">
              {result.keyPoints.map(point => (
                <li key={point} className="text-xs text-muted-foreground list-disc">
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

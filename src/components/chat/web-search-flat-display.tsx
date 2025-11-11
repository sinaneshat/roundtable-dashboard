'use client';
import { ChevronDown, ChevronUp, Globe, Layers, Search, Sparkles, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { WebSearchComplexity } from '@/api/core/enums';
import { WebSearchComplexities } from '@/api/core/enums';
import type { WebSearchResultItem, WebSearchResultMeta } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/ui/cn';

type WebSearchFlatDisplayProps = {
  results: WebSearchResultItem[];
  className?: string;
  meta?: WebSearchResultMeta;
  complexity?: WebSearchComplexity;
};

type SearchResultItemProps = {
  result: WebSearchResultItem;
  index: number;
};

function SearchResultItem({ result, index }: SearchResultItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasFullContent = result.fullContent && result.fullContent.length > 0;
  const displayContent = hasFullContent ? result.fullContent : (result.content || result.excerpt);
  const isLongContent = displayContent && displayContent.length > 400;

  return (
    <div className="group">
      {/* Main content area - flat design */}
      <div className="flex gap-4 py-4">
        {/* Favicon column */}
        <div className="flex-shrink-0 pt-1">
          <div className="size-10 rounded-lg bg-background border border-border overflow-hidden flex items-center justify-center">
            {result.metadata?.faviconUrl
              ? (
                  // eslint-disable-next-line next/no-img-element -- External favicon from arbitrary search result domains
                  <img
                    src={result.metadata.faviconUrl}
                    alt=""
                    className="size-6 object-contain"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )
              : (
                  <Globe className="size-5 text-muted-foreground" />
                )}
          </div>
        </div>

        {/* Content column */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Title and domain */}
          <div>
            <h3 className="font-medium text-base leading-tight mb-1">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline hover:text-primary transition-colors"
              >
                {result.title}
              </a>
            </h3>
            <p className="text-sm text-muted-foreground">{result.domain}</p>
          </div>

          {/* Content preview */}
          <div className="text-sm text-foreground/80 leading-relaxed">
            {displayContent && (
              <div>
                <p className={cn(
                  'whitespace-pre-wrap',
                  !isExpanded && isLongContent && 'line-clamp-3',
                )}
                >
                  {isExpanded || !isLongContent
                    ? displayContent
                    : `${displayContent.substring(0, 400)}...`}
                </p>

                {isLongContent && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="p-0 h-auto text-xs text-primary mt-1"
                  >
                    {isExpanded
                      ? (
                          <>
                            <ChevronUp className="size-3 mr-1" />
                            Show less
                          </>
                        )
                      : (
                          <>
                            <ChevronDown className="size-3 mr-1" />
                            Show more
                          </>
                        )}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Metadata line */}
          {(result.metadata?.author || result.publishedDate || result.metadata?.readingTime) && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {result.metadata?.author && (
                <span>
                  By
                  {result.metadata.author}
                </span>
              )}
              {result.publishedDate && (
                <span>{new Date(result.publishedDate).toLocaleDateString()}</span>
              )}
              {result.metadata?.readingTime && (
                <span>
                  {result.metadata.readingTime}
                  {' '}
                  min read
                </span>
              )}
              {hasFullContent && result.metadata?.wordCount && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {result.metadata.wordCount.toLocaleString()}
                  {' '}
                  words
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Separator between items */}
      {index < 4 && <Separator className="opacity-50" />}
    </div>
  );
}

export function WebSearchFlatDisplay({
  results,
  className,
  meta,
  complexity = WebSearchComplexities.MODERATE,
}: WebSearchFlatDisplayProps) {
  const t = useTranslations('chat.tools.webSearch');

  if (!results || results.length === 0) {
    return null;
  }

  const successfulResults = results.filter(r => r.title && r.title !== 'Search Failed');
  const hasFullContent = successfulResults.some(r => r.fullContent);
  const totalWords = successfulResults.reduce((sum, r) => sum + (r.metadata?.wordCount || 0), 0);

  // Get complexity indicator
  const getComplexityBadge = () => {
    switch (complexity) {
      case WebSearchComplexities.BASIC:
        return (
          <Badge variant="secondary" className="text-xs">
            <Zap className="size-3 mr-1" />
            Quick Search
          </Badge>
        );
      case WebSearchComplexities.DEEP:
        return (
          <Badge variant="secondary" className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Layers className="size-3 mr-1" />
            Deep Analysis
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-xs">
            <Search className="size-3 mr-1" />
            Standard Search
          </Badge>
        );
    }
  };

  return (
    <div className={cn('relative', className)}>
      {/* Clean header without card nesting */}
      <div className="border border-border rounded-lg overflow-hidden bg-card/50 backdrop-blur-sm">
        {/* Header section */}
        <div className="px-4 py-3 border-b border-border/50 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="size-4 text-primary" />
                {hasFullContent && (
                  <Sparkles className="size-3 text-yellow-500 absolute -top-1 -right-1" />
                )}
              </div>
              <span className="font-medium text-sm">{t('title')}</span>
              {getComplexityBadge()}
              <span className="text-xs text-muted-foreground">
                {successfulResults.length}
                {' '}
                {t(successfulResults.length === 1 ? 'source.singular' : 'source.plural')}
                {totalWords > 0 && ` • ${totalWords.toLocaleString()} words`}
              </span>
            </div>
            {meta?.cached && (
              <Badge variant="outline" className="text-xs">
                <Zap className="size-3 mr-1" />
                Cached
              </Badge>
            )}
          </div>
        </div>

        {/* Results section - no nested cards */}
        <div className="px-4">
          {successfulResults.map((result, index) => (
            <SearchResultItem
              key={result.url}
              result={result}
              index={index}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

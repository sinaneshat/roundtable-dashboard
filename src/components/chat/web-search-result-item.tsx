'use client';
import { ChevronDown, Globe } from 'lucide-react';
import { useState } from 'react';

import type { WebSearchResultItemProps } from '@/api/routes/chat/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';
import { buildGoogleFaviconUrl, safeExtractDomain } from '@/lib/utils';

export function WebSearchResultItem({ result, showDivider = true, className }: WebSearchResultItemProps) {
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

  return (
    <div className={cn('flex gap-3 py-2.5', showDivider && 'border-b border-border/20', className)}>
      {/* Avatar with multi-level favicon fallback */}
      <Avatar className="size-8 flex-shrink-0 mt-0.5">
        {faviconSrc && (
          <AvatarImage
            src={faviconSrc}
            alt={cleanDomain}
            onError={() => {
              if (!faviconError) {
                setFaviconError(true);
              } else {
                setFallbackFaviconError(true);
              }
            }}
          />
        )}
        <AvatarFallback className="bg-muted/50 text-muted-foreground">
          <Globe className="size-4" />
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-sm hover:text-primary transition-colors line-clamp-1 block"
        >
          {result.title}
        </a>

        <p className="text-xs text-muted-foreground truncate">{cleanDomain}</p>

        {/* Content preview - Show full scraped content with expand/collapse */}
        {displayContent && (
          <div className="text-xs text-foreground/60 leading-relaxed pt-0.5">
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

        {/* Metadata - word count and reading time */}
        {(result.metadata?.wordCount || result.metadata?.readingTime) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground/60 pt-0.5">
            {result.metadata?.wordCount && (
              <span>
                {result.metadata.wordCount.toLocaleString()}
                {' '}
                words
              </span>
            )}
            {result.metadata?.readingTime && (
              <span>
                {result.metadata.readingTime}
                {' '}
                min
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

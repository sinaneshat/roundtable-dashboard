'use client';
import {
  ChevronDown,
  Globe,
  Star,
} from 'lucide-react';
import { useState } from 'react';

import { UNKNOWN_DOMAIN } from '@/api/core/enums';
import type { WebSearchResultItemProps } from '@/api/routes/chat/schema';
import { AnimatedBadge } from '@/components/ui/animated-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FadeInText, TypingText } from '@/components/ui/typing-text';
import { cn } from '@/lib/ui/cn';
import { buildGoogleFaviconUrl, handleImageError, safeExtractDomain } from '@/lib/utils';

export function WebSearchResultItem({
  result,
  showDivider = true,
  className,
  citationNumber,
}: WebSearchResultItemProps & { citationNumber?: number }) {
  const [faviconError, setFaviconError] = useState(false);
  const [fallbackFaviconError, setFallbackFaviconError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // ✅ TYPE-SAFE: Extract domain with safe URL parsing (no throws)
  const domain = result.domain || safeExtractDomain(result.url, UNKNOWN_DOMAIN);
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

  // Format date relative or absolute
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0)
      return 'Today';
    if (diffDays === 1)
      return 'Yesterday';
    if (diffDays < 7)
      return `${diffDays} days ago`;
    if (diffDays < 30)
      return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={cn('flex gap-3 py-2', showDivider && 'border-b border-border/10', className)}>
      {/* Citation number or Avatar */}
      {citationNumber
        ? (
            <div className="flex-shrink-0 mt-0.5">
              <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-semibold text-primary">{citationNumber}</span>
              </div>
            </div>
          )
        : (
            <Avatar className="size-6 flex-shrink-0 mt-0.5">
              {faviconSrc && (
                <AvatarImage
                  src={faviconSrc}
                  alt={cleanDomain}
                  role="img"
                  onError={e => handleImageError(e, () => {
                    if (!faviconError) {
                      setFaviconError(true);
                    } else {
                      setFallbackFaviconError(true);
                    }
                  })}
                />
              )}
              <AvatarFallback className="bg-muted/30 text-muted-foreground" role="img" aria-label={cleanDomain}>
                <Globe className="size-3" aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
          )}

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
                <FadeInText delay={0.05}>{result.title}</FadeInText>
              </a>
            </TooltipTrigger>
            <TooltipContent>
              <p>{result.title}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex items-center justify-between gap-2">
          <FadeInText delay={0.1}>
            <p className="text-xs text-muted-foreground truncate">{cleanDomain}</p>
          </FadeInText>

          {/* Relevance Score - Animated */}
          {result.score > 0 && (
            <AnimatedBadge delay={0.15}>
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
            </AnimatedBadge>
          )}
        </div>

        {/* Description Preview - Instant display to match streaming */}
        {result.metadata?.description && (
          <p className="text-xs text-muted-foreground italic line-clamp-2 pt-0.5">
            <TypingText text={result.metadata.description} speed={0} delay={0} />
          </p>
        )}

        {/* Featured Image - Minimal */}
        {result.metadata?.imageUrl && (
          <div className="rounded overflow-hidden my-1">
            {/* eslint-disable-next-line next/no-img-element -- External image from search result */}
            <img
              src={result.metadata.imageUrl}
              alt={result.title}
              className="w-full h-auto max-h-40 object-cover"
              loading="lazy"
              onError={e => handleImageError(e, () => {
                e.currentTarget.style.display = 'none';
              })}
            />
          </div>
        )}

        {/* Content preview - Instant display to match streaming */}
        {displayContent && (
          <div className="text-xs text-foreground/70 leading-relaxed">
            <div className={cn(!isExpanded && isLongContent && 'line-clamp-3')}>
              <TypingText text={displayContent} speed={0} delay={0} />
            </div>

            {isLongContent && (
              <FadeInText delay={0.5}>
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
              </FadeInText>
            )}
          </div>
        )}

        {/* Metadata - Animated */}
        {(result.metadata?.author || result.publishedDate) && (
          <FadeInText delay={0.3}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-0.5">
              {result.metadata?.author && (
                <span>{result.metadata.author}</span>
              )}
              {result.metadata?.author && result.publishedDate && (
                <span>•</span>
              )}
              {result.publishedDate && (
                <span>{formatDate(result.publishedDate)}</span>
              )}
            </div>
          </FadeInText>
        )}

        {/* Key Points - Instant display to match streaming */}
        {result.keyPoints && result.keyPoints.length > 0 && (
          <ul className="space-y-0.5 pl-4 pt-1">
            {result.keyPoints.map((point, idx) => (
              <FadeInText key={point} delay={0.1 + (idx * 0.02)}>
                <li className="text-xs text-muted-foreground list-disc">
                  <TypingText text={point} speed={0} delay={0} />
                </li>
              </FadeInText>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

'use client';

import { ChevronDown, ExternalLink, Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { UNKNOWN_DOMAIN } from '@/api/core/enums';
import type { WebSearchResultItemProps } from '@/api/routes/chat/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/ui/cn';
import { buildGoogleFaviconUrl, handleImageError, safeExtractDomain } from '@/lib/utils';

export function WebSearchResultItem({
  result,
  showDivider = true,
  className,
}: WebSearchResultItemProps) {
  const t = useTranslations('webSearch.result');
  const [faviconError, setFaviconError] = useState(false);
  const [fallbackFaviconError, setFallbackFaviconError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract domain with safe URL parsing
  const domain = result.domain || safeExtractDomain(result.url, UNKNOWN_DOMAIN);
  const cleanDomain = domain.replace('www.', '');
  const fallbackFaviconUrl = buildGoogleFaviconUrl(cleanDomain, 64);

  // Content priority: rawContent > fullContent > content > excerpt
  const rawContent = result.rawContent || result.fullContent || '';
  const displayContent = rawContent || result.content || result.excerpt || '';
  const contentLength = displayContent.length;
  const isLongContent = contentLength > 300;

  // Get favicon src with fallbacks
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

  // Images from page - combine og:image and page images
  const pageImages = result.images || [];
  const metaImage = result.metadata?.imageUrl;
  const allImages = [
    ...(metaImage ? [{ url: metaImage, alt: result.title }] : []),
    ...pageImages,
  ];

  return (
    <div className={cn('py-3', showDivider && 'border-b border-border/10 last:border-0', className)}>
      {/* Content */}
      <div className="flex-1 min-w-0 pb-1">
        {/* Header: Favicon + Title + Domain */}
        <div className="flex items-start gap-2">
          <Avatar className="size-4 flex-shrink-0 mt-0.5">
            {faviconSrc && (
              <AvatarImage
                src={faviconSrc}
                alt={cleanDomain}
                onError={e => handleImageError(e, () => {
                  if (!faviconError) {
                    setFaviconError(true);
                  } else {
                    setFallbackFaviconError(true);
                  }
                })}
              />
            )}
            <AvatarFallback className="bg-muted/50">
              <Globe className="size-2.5 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-foreground hover:text-primary transition-colors line-clamp-1 flex items-center gap-1.5 group"
            >
              <span className="truncate">{result.title}</span>
              <ExternalLink className="size-3 opacity-0 group-hover:opacity-60 flex-shrink-0 transition-opacity" />
            </a>
            <span className="text-xs text-muted-foreground">{cleanDomain}</span>
          </div>
        </div>

        {/* Content Preview */}
        {displayContent && (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="mt-2">
            <div className="text-xs text-muted-foreground leading-relaxed">
              <div className={cn(!isExpanded && isLongContent && 'line-clamp-2')}>
                {displayContent}
              </div>
              {isLongContent && (
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-0 h-5 text-xs mt-1 text-primary/70 hover:text-primary hover:bg-transparent"
                  >
                    <ChevronDown className={cn('size-3 mr-0.5 transition-transform', isExpanded && 'rotate-180')} />
                    {isExpanded ? t('collapseLess') : t('expandMore')}
                  </Button>
                </CollapsibleTrigger>
              )}
            </div>
            <CollapsibleContent />
          </Collapsible>
        )}

        {/* Images - Clickable thumbnails that open source in new window */}
        {allImages.length > 0 && (
          <div className="mt-2.5 flex gap-1.5 flex-wrap">
            {allImages.slice(0, 4).map(img => (
              <a
                key={img.url}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 w-12 h-9 rounded-md overflow-hidden bg-muted/30 border border-border/20 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer group"
                title={`View on ${cleanDomain}`}
              >
                {/* eslint-disable-next-line next/no-img-element -- External image */}
                <img
                  src={img.url}
                  alt={img.alt || result.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </a>
            ))}
            {allImages.length > 4 && (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 w-12 h-9 rounded-md bg-muted/20 border border-border/20 flex items-center justify-center text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
                title={`View all images on ${cleanDomain}`}
              >
                +
                {allImages.length - 4}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

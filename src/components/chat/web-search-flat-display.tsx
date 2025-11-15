'use client';
import { ChevronDown, Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type {
  SearchResultItemProps,
  WebSearchFlatDisplayProps,
} from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/ui/cn';
import { buildGoogleFaviconUrl, safeExtractDomain } from '@/lib/utils';

function SearchResultItem({ result, index, totalCount }: SearchResultItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [faviconError, setFaviconError] = useState(false);
  const [fallbackFaviconError, setFallbackFaviconError] = useState(false);
  const [showIframe, setShowIframe] = useState(false);

  const hasFullContent = result.fullContent && result.fullContent.length > 0;
  const displayContent = hasFullContent ? result.fullContent : (result.content || result.excerpt);
  const isLongContent = displayContent && displayContent.length > 300;

  // ✅ TYPE-SAFE: Extract domain with safe URL parsing (no throws)
  const domain = result.domain || safeExtractDomain(result.url, 'unknown');
  const fallbackFaviconUrl = buildGoogleFaviconUrl(domain, 64);

  // Determine which favicon to show
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
    <div>
      <div className="flex gap-3 py-3">
        {/* Favicon with multi-level fallback */}
        <div className="flex-shrink-0 pt-0.5">
          <div className="size-8 rounded-md bg-muted/50 border border-border/40 overflow-hidden flex items-center justify-center">
            {faviconSrc
              ? (
                  // eslint-disable-next-line next/no-img-element -- External favicon from arbitrary search result domains
                  <img
                    src={faviconSrc}
                    alt=""
                    className="size-5 object-contain"
                    loading="lazy"
                    onError={() => {
                      if (!faviconError) {
                        setFaviconError(true);
                      } else {
                        setFallbackFaviconError(true);
                      }
                    }}
                  />
                )
              : (
                  <Globe className="size-4 text-muted-foreground/60" />
                )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title */}
          <h3 className="font-medium text-sm leading-snug line-clamp-1">
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (hasFullContent) {
                  e.preventDefault();
                  setShowIframe(true);
                }
              }}
              className="hover:underline hover:text-primary transition-colors cursor-pointer"
            >
              {result.title}
            </a>
          </h3>

          {/* Domain */}
          <p className="text-xs text-muted-foreground/80 truncate">{result.domain}</p>

          {/* Content preview - Show scraped data */}
          {displayContent && (
            <div className="text-xs text-foreground/70 leading-relaxed">
              <p className={cn(!isExpanded && isLongContent && 'line-clamp-2')}>
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

          {/* Minimal metadata */}
          {(result.metadata?.wordCount || result.metadata?.readingTime) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
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

      {/* Separator */}
      {index < totalCount - 1 && <Separator className="opacity-30" />}

      {/* Iframe Dialog for scraped content */}
      {hasFullContent && (
        <Dialog open={showIframe} onOpenChange={setShowIframe}>
          <DialogContent glass={true} className="max-w-6xl max-h-[90vh] p-0">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="text-base">{result.title}</DialogTitle>
              <DialogDescription className="text-xs">{result.url}</DialogDescription>
            </DialogHeader>
            <div className="px-6 pb-6">
              <div className="w-full h-[70vh] border rounded-md overflow-hidden bg-background">
                <iframe
                  src={result.url}
                  title={result.title}
                  className="w-full h-full"
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function WebSearchFlatDisplay({
  results,
  className,
  meta,
}: WebSearchFlatDisplayProps) {
  const t = useTranslations('chat.tools.webSearch');
  const [isOpen, setIsOpen] = useState(true);

  if (!results || results.length === 0) {
    return null;
  }

  const successfulResults = results.filter(r => r.title && r.title !== 'Search Failed');

  return (
    <div className={cn('py-1.5', className)}>
      <ChainOfThought open={isOpen} onOpenChange={setIsOpen}>
        <ChainOfThoughtHeader>
          <div className="flex items-center gap-2.5 w-full">
            <Globe className="size-4 text-blue-500 flex-shrink-0" />
            <span className="text-sm font-medium">{t('title')}</span>

            {/* Single count badge */}
            <Badge variant="secondary" className="text-xs">
              {successfulResults.length}
              {' '}
              {t(successfulResults.length === 1 ? 'source.singular' : 'source.plural')}
            </Badge>

            {/* Optional cached indicator */}
            {meta?.cached && (
              <Badge variant="outline" className="text-xs">
                Cached
              </Badge>
            )}
          </div>
        </ChainOfThoughtHeader>

        <ChainOfThoughtContent>
          <div>
            {successfulResults.map((result, index) => (
              <SearchResultItem
                key={result.url}
                result={result}
                index={index}
                totalCount={successfulResults.length}
              />
            ))}
          </div>
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}

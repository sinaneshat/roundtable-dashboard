'use client';
import { motion } from 'framer-motion';
import { ChevronDown, Globe, Sparkles } from 'lucide-react';
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
import { LLMAnswerDisplay } from '@/components/chat/llm-answer-display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';
import { buildGoogleFaviconUrl, safeExtractDomain } from '@/lib/utils';

function SearchResultItem({ result, index, totalCount }: SearchResultItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [faviconError, setFaviconError] = useState(false);
  const [fallbackFaviconError, setFallbackFaviconError] = useState(false);

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
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
    >
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
              className="hover:underline hover:text-primary transition-colors"
            >
              {result.title}
            </a>
          </h3>

          {/* Domain and relevance score inline */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground/80 truncate">{result.domain}</p>

            {result.score > 0 && (
              <Badge
                variant="outline"
                className={cn(
                  'text-xs h-5 flex-shrink-0',
                  Math.round(result.score * 100) >= 80
                    ? 'bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400'
                    : Math.round(result.score * 100) >= 60
                      ? 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-400'
                      : 'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-400',
                )}
              >
                {Math.round(result.score * 100)}
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
    </motion.div>
  );
}

export function WebSearchFlatDisplay({
  results,
  answer,
  className,
  meta,
  isStreaming = false,
  requestId,
}: WebSearchFlatDisplayProps & { isStreaming?: boolean; requestId?: string }) {
  const t = useTranslations('chat.tools.webSearch');
  const [isOpen, setIsOpen] = useState(true);

  // Show loading state while streaming
  if (isStreaming && (!results || results.length === 0)) {
    return (
      <div className={cn('py-1.5', className)}>
        <ChainOfThought open={true} onOpenChange={() => {}}>
          <ChainOfThoughtHeader>
            <div className="flex items-center gap-2.5 w-full">
              <Globe className="size-4 text-blue-500 flex-shrink-0 animate-pulse" />
              <span className="text-sm font-medium">{t('title')}</span>
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="size-3 mr-1 animate-pulse" />
                {t('searching')}
              </Badge>
            </div>
          </ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </ChainOfThoughtContent>
        </ChainOfThought>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return null;
  }

  const successfulResults = results.filter(r => r.title && r.title !== 'Search Failed');
  const totalWords = successfulResults.reduce((sum, r) => sum + (r.metadata?.wordCount || 0), 0);

  return (
    <div className={cn('py-1.5', className)}>
      <ChainOfThought open={isOpen} onOpenChange={setIsOpen}>
        <ChainOfThoughtHeader>
          <div className="flex items-center gap-2.5 w-full">
            <Globe className={cn('size-4 text-blue-500 flex-shrink-0', isStreaming && 'animate-pulse')} />
            <span className="text-sm font-medium">{t('title')}</span>

            {/* Single count badge */}
            <Badge variant="secondary" className="text-xs">
              {successfulResults.length}
              {' '}
              {t(successfulResults.length === 1 ? 'source.singular' : 'source.plural')}
            </Badge>

            {/* Word count badge */}
            {totalWords > 0 && (
              <Badge variant="outline" className="text-xs">
                {totalWords.toLocaleString()}
                {' '}
                {t('wordsExtracted')}
              </Badge>
            )}

            {/* Optional cached indicator */}
            {meta?.cached && (
              <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                <Sparkles className="size-3 mr-1" />
                {t('cached')}
              </Badge>
            )}

            {/* Streaming indicator */}
            {isStreaming && (
              <Badge variant="outline" className="text-xs">
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  {t('loading')}
                </motion.span>
              </Badge>
            )}
          </div>
        </ChainOfThoughtHeader>

        <ChainOfThoughtContent>
          <div className="space-y-3">
            {/* LLM Answer - Display at top with streaming support */}
            {(answer || isStreaming) && <LLMAnswerDisplay answer={answer ?? null} isStreaming={isStreaming} />}

            {/* Search Results with progressive loading and inline images */}
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

            {/* Request ID footer (subtle) */}
            {requestId && (
              <div className="pt-2 border-t border-border/20">
                <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                  <span>
                    {t('requestId')}
                    :
                  </span>
                  <code className="font-mono text-xs bg-muted/30 px-1.5 py-0.5 rounded">
                    {requestId.slice(0, 12)}
                    ...
                  </code>
                </div>
              </div>
            )}
          </div>
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}

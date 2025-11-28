'use client';

import { AlertCircle, Globe, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { WebSearchStreamingStage } from '@/api/core/enums';
import { ChainOfThoughtStepStatuses, WebSearchStreamingStages } from '@/api/core/enums';
import type { WebSearchDisplayExtendedProps } from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought';
import { LLMAnswerDisplay } from '@/components/chat/llm-answer-display';
import { WebSearchImageGallery } from '@/components/chat/web-search-image-gallery';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';
import { safeExtractDomain } from '@/lib/utils';

/**
 * Determine current streaming stage based on available data
 */
function getStreamingStage(query: string | undefined, answer: string | null | undefined): WebSearchStreamingStage {
  if (!query)
    return WebSearchStreamingStages.QUERY;
  if (!answer)
    return WebSearchStreamingStages.SEARCH;
  return WebSearchStreamingStages.SYNTHESIZE;
}

export function WebSearchDisplay({
  results,
  className,
  meta: _meta,
  answer,
  isStreaming = false,
  requestId: _requestId,
  query,
  autoParameters: _autoParameters,
}: WebSearchDisplayExtendedProps) {
  const t = useTranslations('chat.tools.webSearch');
  const [isOpen, setIsOpen] = useState(true);

  // Show loading state while streaming
  if (isStreaming && (!results || results.length === 0)) {
    const currentStage = getStreamingStage(query, answer);

    return (
      <div className={cn('relative py-2', className)}>
        <ChainOfThought open disabled>
          <ChainOfThoughtHeader disabled>
            <div className="flex items-center gap-2">
              <Globe className="size-4 animate-pulse" />
              <span>{query ? `Searching for "${query}"` : t('title')}</span>
            </div>
          </ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            <ChainOfThoughtStep
              icon={Search}
              label="Query"
              status={currentStage === WebSearchStreamingStages.QUERY ? ChainOfThoughtStepStatuses.ACTIVE : ChainOfThoughtStepStatuses.COMPLETE}
            />
            <ChainOfThoughtStep
              icon={Globe}
              label="Searching the web"
              status={currentStage === WebSearchStreamingStages.SEARCH ? ChainOfThoughtStepStatuses.ACTIVE : currentStage === WebSearchStreamingStages.QUERY ? ChainOfThoughtStepStatuses.PENDING : ChainOfThoughtStepStatuses.COMPLETE}
            />
            <ChainOfThoughtStep
              icon={Search}
              label="Synthesizing answer"
              status={currentStage === WebSearchStreamingStages.SYNTHESIZE ? ChainOfThoughtStepStatuses.ACTIVE : ChainOfThoughtStepStatuses.PENDING}
            />
            <div className="space-y-2 mt-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-5/6" />
            </div>
          </ChainOfThoughtContent>
        </ChainOfThought>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return null;
  }

  const totalResults = results.length;
  const successfulResults = results.filter(r => r.title !== 'Search Failed');
  const hasErrors = successfulResults.length < totalResults;
  const hasImages = successfulResults.some(r => r.metadata?.imageUrl);

  // Extract unique domains for badge display
  const domains = successfulResults.map((r) => {
    const domain = r.domain || safeExtractDomain(r.url, 'unknown');
    return domain.replace('www.', '');
  });

  return (
    <div className={cn('relative py-2', className)}>
      <ChainOfThought open={isOpen} onOpenChange={setIsOpen}>
        <ChainOfThoughtHeader>
          <div className="flex items-center gap-2">
            <Globe className="size-4" />
            <span>{query ? `Searched for "${query}"` : t('title')}</span>
          </div>
        </ChainOfThoughtHeader>

        <ChainOfThoughtContent>
          {/* Search Results as Domain Badges */}
          <ChainOfThoughtStep
            icon={Search}
            label={`Found ${successfulResults.length} ${successfulResults.length === 1 ? 'source' : 'sources'}`}
            status={ChainOfThoughtStepStatuses.COMPLETE}
          >
            <ChainOfThoughtSearchResults>
              {domains.map((domain, index) => (
                // eslint-disable-next-line react/no-array-index-key -- domains can be duplicated across results; index ensures uniqueness
                <ChainOfThoughtSearchResult key={`${domain}-${index}`}>
                  <a
                    href={successfulResults[index]?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {domain}
                  </a>
                </ChainOfThoughtSearchResult>
              ))}
            </ChainOfThoughtSearchResults>
          </ChainOfThoughtStep>

          {/* Image Gallery */}
          {hasImages && (
            <ChainOfThoughtStep
              icon={Globe}
              label="Found images"
              status={ChainOfThoughtStepStatuses.COMPLETE}
            >
              <WebSearchImageGallery results={successfulResults} />
            </ChainOfThoughtStep>
          )}

          {/* AI Answer Summary */}
          {(answer || isStreaming) && (
            <ChainOfThoughtStep
              icon={Search}
              label="Answer"
              status={isStreaming ? ChainOfThoughtStepStatuses.ACTIVE : ChainOfThoughtStepStatuses.COMPLETE}
            >
              <div className="p-4 rounded-lg bg-muted/10 border border-border/30">
                <LLMAnswerDisplay
                  answer={answer ?? null}
                  isStreaming={isStreaming}
                  sources={successfulResults.map(r => ({ url: r.url, title: r.title }))}
                />
              </div>
            </ChainOfThoughtStep>
          )}

          {/* Error display */}
          {hasErrors && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>
                {t('error.failedToLoad', {
                  count: totalResults - successfulResults.length,
                })}
              </AlertDescription>
            </Alert>
          )}
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}

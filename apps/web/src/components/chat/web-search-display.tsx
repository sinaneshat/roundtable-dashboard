import type { WebSearchStreamingStage } from '@roundtable/shared';
import { ChainOfThoughtStepStatuses, WebSearchStreamingStages } from '@roundtable/shared';
import { memo } from 'react';

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought';
import { TextShimmer } from '@/components/ai-elements/shimmer';
import { LLMAnswerDisplay } from '@/components/chat/llm-answer-display';
import { WebSearchImageGallery } from '@/components/chat/web-search-image-gallery';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AccordionEntrance } from '@/components/ui/motion';
import { Skeleton } from '@/components/ui/skeleton';
import { useBoolean } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import { safeExtractDomain } from '@/lib/utils';
import type { WebSearchResultItem } from '@/services/api';

export type WebSearchDisplayExtendedProps = {
  results: WebSearchResultItem[];
  className?: string;
  meta?: Record<string, unknown>;
  answer?: string | null;
  isStreaming?: boolean;
  requestId?: string;
  query?: string;
  autoParameters?: Record<string, unknown>;
  isLoading?: boolean;
};

function getStreamingStage(query: string | undefined, answer: string | null | undefined): WebSearchStreamingStage {
  if (!query)
    return WebSearchStreamingStages.QUERY;
  if (!answer)
    return WebSearchStreamingStages.SEARCH;
  return WebSearchStreamingStages.SYNTHESIZE;
}

function WebSearchDisplayComponent({
  results,
  className,
  meta: _meta,
  answer,
  isStreaming = false,
  requestId: _requestId,
  query,
  autoParameters: _autoParameters,
}: WebSearchDisplayExtendedProps) {
  const t = useTranslations();
  const isOpen = useBoolean(true);

  if (isStreaming && (!results || results.length === 0)) {
    const currentStage = getStreamingStage(query, answer);

    return (
      <AccordionEntrance>
        <div className={cn('relative py-2', className)}>
          <ChainOfThought open={isOpen.value} onOpenChange={isOpen.setValue}>
            <ChainOfThoughtHeader>
              <div className="flex items-center gap-2">
                <Icons.globe className="size-4 animate-pulse" />
                <TextShimmer className="text-sm">{query ? t('chat.tools.webSearch.searchingFor', { query }) : t('chat.tools.webSearch.title')}</TextShimmer>
              </div>
            </ChainOfThoughtHeader>
            <ChainOfThoughtContent>
              <ChainOfThoughtStep
                icon={Icons.search}
                label={t('chat.preSearch.steps.query')}
                status={currentStage === WebSearchStreamingStages.QUERY ? ChainOfThoughtStepStatuses.ACTIVE : ChainOfThoughtStepStatuses.COMPLETE}
              />
              <ChainOfThoughtStep
                icon={Icons.globe}
                label={t('chat.preSearch.steps.searchingTheWeb')}
                status={currentStage === WebSearchStreamingStages.SEARCH ? ChainOfThoughtStepStatuses.ACTIVE : currentStage === WebSearchStreamingStages.QUERY ? ChainOfThoughtStepStatuses.PENDING : ChainOfThoughtStepStatuses.COMPLETE}
              />
              <ChainOfThoughtStep
                icon={Icons.search}
                label={t('chat.preSearch.steps.synthesizingAnswer')}
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
      </AccordionEntrance>
    );
  }

  if (!results || results.length === 0) {
    return null;
  }

  const totalResults = results.length;
  const successfulResults = results.filter(r => r.title !== 'Search Failed');
  const hasErrors = successfulResults.length < totalResults;
  const hasImages = successfulResults.some(r => r.metadata?.imageUrl);

  const domains = successfulResults.map((r) => {
    const domain = r.domain || safeExtractDomain(r.url, 'unknown');
    return domain.replace('www.', '');
  });

  return (
    <AccordionEntrance>
      <div className={cn('relative py-2', className)}>
        <ChainOfThought open={isOpen.value} onOpenChange={isOpen.setValue}>
          <ChainOfThoughtHeader>
            <div className="flex items-center gap-2">
              <Icons.globe className="size-4" />
              <span>{query ? t('chat.tools.webSearch.searchedFor', { query }) : t('chat.tools.webSearch.title')}</span>
            </div>
          </ChainOfThoughtHeader>

          <ChainOfThoughtContent>
            <ChainOfThoughtStep
              icon={Icons.search}
              label={t('chat.tools.webSearch.foundSources', { count: successfulResults.length })}
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
                      className="hover:underline inline-flex items-center gap-1"
                    >
                      <span>{domain}</span>
                      <Icons.externalLink className="size-3 opacity-60" aria-hidden="true" />
                    </a>
                  </ChainOfThoughtSearchResult>
                ))}
              </ChainOfThoughtSearchResults>
            </ChainOfThoughtStep>

            {hasImages && (
              <ChainOfThoughtStep
                icon={Icons.globe}
                label={t('chat.preSearch.steps.foundImages')}
                status={ChainOfThoughtStepStatuses.COMPLETE}
              >
                <WebSearchImageGallery results={successfulResults} />
              </ChainOfThoughtStep>
            )}

            {(answer || isStreaming) && (
              <ChainOfThoughtStep
                icon={Icons.search}
                label={t('chat.preSearch.steps.answer')}
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

            {hasErrors && (
              <Alert variant="destructive">
                <Icons.alertCircle className="size-4" />
                <AlertDescription>
                  {t('chat.tools.webSearch.error.failedToLoad', {
                    count: totalResults - successfulResults.length,
                  })}
                </AlertDescription>
              </Alert>
            )}
          </ChainOfThoughtContent>
        </ChainOfThought>
      </div>
    </AccordionEntrance>
  );
}

export const WebSearchDisplay = memo(WebSearchDisplayComponent);

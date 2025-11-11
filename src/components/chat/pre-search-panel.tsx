'use client';
import { Brain, CheckCircle, Globe, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ChainOfThoughtStepStatuses, WebSearchDepths } from '@/api/core/enums';
import type { PreSearchDataPayload } from '@/api/routes/chat/schema';
import {
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought';
import { Badge } from '@/components/ui/badge';

import { WebSearchResultCard } from './web-search-result-card';

type PreSearchPanelProps = {
  preSearch: PreSearchDataPayload;
  className?: string;
};

export function PreSearchPanel({ preSearch, className }: PreSearchPanelProps) {
  const t = useTranslations();

  return (
    <div className={className}>
      {preSearch.results.map((searchResult, searchIndex) => {
        const query = preSearch.queries[searchIndex];

        return (
          <div key={searchResult.query} className="space-y-3 mb-4">
            {/* Step 1: Understanding */}
            <ChainOfThoughtStep
              icon={Brain}
              label={t('chat.preSearch.steps.understanding')}
              description={query?.rationale}
              status={ChainOfThoughtStepStatuses.COMPLETE}
              badge={query?.searchDepth && (
                <Badge
                  variant={query.searchDepth === WebSearchDepths.ADVANCED ? 'default' : 'outline'}
                  className="text-xs"
                >
                  {t(`chat.preSearch.searchDepth.${query.searchDepth}`)}
                </Badge>
              )}
            >
              {query?.query && (
                <div className="p-2.5 rounded-lg bg-muted/50 border border-border/40">
                  <div className="flex items-start gap-2">
                    <Search className="size-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-xs font-medium text-foreground/90">{query.query}</p>
                  </div>
                </div>
              )}
            </ChainOfThoughtStep>

            {/* Step 2: Search Results */}
            <ChainOfThoughtStep
              icon={Globe}
              label={t('chat.preSearch.steps.searchComplete')}
              status={ChainOfThoughtStepStatuses.COMPLETE}
              metadata={(
                <>
                  <Badge variant="outline" className="text-xs">
                    {searchResult.results?.length || 0}
                    {' '}
                    {searchResult.results?.length === 1 ? t('chat.tools.webSearch.source.singular') : t('chat.tools.webSearch.source.plural')}
                  </Badge>
                  {searchResult.responseTime && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {Math.round(searchResult.responseTime)}
                      ms
                    </Badge>
                  )}
                </>
              )}
            >
              {searchResult.results && searchResult.results.length > 0 && (
                <ChainOfThoughtSearchResults>
                  {searchResult.results.slice(0, 5).map(result => (
                    <ChainOfThoughtSearchResult key={result.url}>
                      {new URL(result.url).hostname.replace('www.', '')}
                    </ChainOfThoughtSearchResult>
                  ))}
                  {searchResult.results.length > 5 && (
                    <ChainOfThoughtSearchResult>
                      +
                      {searchResult.results.length - 5}
                      {' '}
                      more
                    </ChainOfThoughtSearchResult>
                  )}
                </ChainOfThoughtSearchResults>
              )}
            </ChainOfThoughtStep>

            {/* Step 3: Analysis */}
            <ChainOfThoughtStep
              icon={CheckCircle}
              label={t('chat.preSearch.steps.results')}
              status={ChainOfThoughtStepStatuses.COMPLETE}
            >
              {searchResult.answer && (
                <div className="p-3 rounded-lg border border-border/50 bg-background/30">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {searchResult.answer}
                  </p>
                </div>
              )}

              {searchResult.results && searchResult.results.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-foreground/90">
                    {t('chat.preSearch.steps.sources')}
                    {' '}
                    (
                    {searchResult.results.length}
                    ):
                  </span>
                  <div className="space-y-2.5">
                    {searchResult.results.map((result, idx) => (
                      <WebSearchResultCard key={result.url} result={result} index={idx} />
                    ))}
                  </div>
                </div>
              )}
            </ChainOfThoughtStep>
          </div>
        );
      })}
    </div>
  );
}

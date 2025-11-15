'use client';
import { Search, Sparkles } from 'lucide-react';

import { WebSearchDepths } from '@/api/core/enums';
import type { PreSearchDataPayload } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/ui/cn';

import { WebSearchResultItem } from './web-search-result-item';

type PreSearchPanelProps = {
  preSearch: PreSearchDataPayload;
  className?: string;
};

export function PreSearchPanel({ preSearch, className }: PreSearchPanelProps) {
  if (!preSearch.results || preSearch.results.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-6', className)}>
      {preSearch.results.map((searchResult, searchIndex) => {
        const query = preSearch.queries[searchIndex];
        const hasResults = searchResult.results && searchResult.results.length > 0;

        return (
          <div key={searchResult.query || `search-${searchIndex}`} className="space-y-3">
            {/* Query header with mode */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Search className="size-4 text-primary/70 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {query?.query || searchResult.query}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {query?.searchDepth && (
                    <Badge variant={query.searchDepth === WebSearchDepths.ADVANCED ? 'default' : 'secondary'} className="text-xs">
                      {query.searchDepth === WebSearchDepths.ADVANCED ? 'Advanced' : 'Simple'}
                    </Badge>
                  )}
                  {searchResult.responseTime && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {Math.round(searchResult.responseTime)}
                      ms
                    </Badge>
                  )}
                </div>
              </div>

              {/* Result count */}
              {hasResults && (
                <p className="text-xs text-muted-foreground pl-6">
                  {searchResult.results.length}
                  {' '}
                  {searchResult.results.length === 1 ? 'source found' : 'sources found'}
                </p>
              )}
            </div>

            {/* Results list */}
            {hasResults && (
              <div className="pl-6 space-y-0">
                {searchResult.results.map((result, idx) => (
                  <WebSearchResultItem
                    key={result.url}
                    result={result}
                    showDivider={idx < searchResult.results.length - 1}
                  />
                ))}
              </div>
            )}

            {/* Summary */}
            {searchResult.answer && (
              <div className="pl-6">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <Sparkles className="size-4 text-primary/70 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs font-medium text-foreground/90">Summary</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {searchResult.answer}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Separator between searches */}
            {searchIndex < preSearch.results.length - 1 && (
              <Separator className="!mt-6" />
            )}
          </div>
        );
      })}
    </div>
  );
}

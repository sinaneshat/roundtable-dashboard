'use client';

import { motion } from 'framer-motion';
import { AlertCircle, Brain, CheckCircle, Globe, Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useRef } from 'react';

import { AnalysisStatuses, ChainOfThoughtStepStatuses, WebSearchDepths } from '@/api/core/enums';
import type { PreSearchDataPayload, StoredPreSearch } from '@/api/routes/chat/schema';
import {
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { Badge } from '@/components/ui/badge';
import { usePreSearchSSE } from '@/hooks/utils';

import { WebSearchResultCard } from './web-search-result-card';

type PreSearchStreamProps = {
  threadId: string;
  preSearch: StoredPreSearch;
  onStreamComplete?: (completedSearchData?: PreSearchDataPayload) => void;
  onStreamStart?: () => void;
};

// Track at TWO levels to prevent duplicate submissions
const triggeredSearchIds = new Map<string, boolean>();
const triggeredRounds = new Map<string, Set<number>>();

// eslint-disable-next-line react-refresh/only-export-components
export function clearTriggeredPreSearch(searchId: string) {
  triggeredSearchIds.delete(searchId);
}

// eslint-disable-next-line react-refresh/only-export-components
export function clearTriggeredPreSearchForRound(roundNumber: number) {
  const keysToDelete: string[] = [];
  triggeredSearchIds.forEach((_value, key) => {
    if (key.includes(`-${roundNumber}-`) || key.includes(`round-${roundNumber}`)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => triggeredSearchIds.delete(key));

  triggeredRounds.forEach((roundSet) => {
    roundSet.delete(roundNumber);
  });
}

function PreSearchStreamComponent({
  threadId,
  preSearch,
  onStreamComplete,
  onStreamStart,
}: PreSearchStreamProps) {
  const t = useTranslations();

  // ✅ CRITICAL: Store actions to update pre-search status during streaming
  const updatePreSearchStatus = useChatStore(s => s.updatePreSearchStatus);
  const updatePreSearchData = useChatStore(s => s.updatePreSearchData);

  // Store callbacks in refs for stability and to allow calling after unmount
  const onStreamCompleteRef = useRef(onStreamComplete);
  const onStreamStartRef = useRef(onStreamStart);

  useEffect(() => {
    onStreamCompleteRef.current = onStreamComplete;
  }, [onStreamComplete]);

  useEffect(() => {
    onStreamStartRef.current = onStreamStart;
  }, [onStreamStart]);

  // ✅ Use custom SSE hook instead of useObject (backend sends custom events)
  const { partialData: partialSearchData, error, isStreaming, submit } = usePreSearchSSE({
    threadId,
    roundNumber: preSearch.roundNumber,
    userQuery: preSearch.userQuery,
    enabled: preSearch.status === AnalysisStatuses.PENDING || preSearch.status === AnalysisStatuses.STREAMING,
    autoSubmit: false, // Don't auto-submit, we'll control it manually
    onDone: (finalObject) => {
      // ✅ Update store: Completed status with data
      updatePreSearchData(preSearch.roundNumber, finalObject);
      updatePreSearchStatus(preSearch.roundNumber, AnalysisStatuses.COMPLETE);

      onStreamCompleteRef.current?.(finalObject);
    },
    onError: (streamError) => {
      const errorMessage = streamError.message || String(streamError);
      if (errorMessage.includes('409') || errorMessage.includes('Conflict')) {
        return; // Ignore conflict errors
      }
      // ✅ Update store: Failed status
      updatePreSearchStatus(preSearch.roundNumber, AnalysisStatuses.FAILED);
    },
  });

  // Update store when streaming starts
  useEffect(() => {
    if (isStreaming && preSearch.status !== AnalysisStatuses.STREAMING) {
      updatePreSearchStatus(preSearch.roundNumber, AnalysisStatuses.STREAMING);
      onStreamStartRef.current?.();
    }
    // ✅ FIX: Zustand actions are stable, don't need them in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, preSearch.status, preSearch.roundNumber]);

  // Trigger pre-search submission once per round (deduplication)
  useEffect(() => {
    const roundAlreadyTriggered = triggeredRounds.get(threadId)?.has(preSearch.roundNumber) ?? false;

    if (
      !triggeredSearchIds.has(preSearch.id)
      && !roundAlreadyTriggered
      && (preSearch.status === AnalysisStatuses.PENDING || preSearch.status === AnalysisStatuses.STREAMING)
    ) {
      // Mark as triggered BEFORE submitting to prevent duplicate submissions
      triggeredSearchIds.set(preSearch.id, true);

      const roundSet = triggeredRounds.get(threadId);
      if (roundSet) {
        roundSet.add(preSearch.roundNumber);
      } else {
        triggeredRounds.set(threadId, new Set([preSearch.roundNumber]));
      }

      // Now submit the request
      queueMicrotask(() => {
        updatePreSearchStatus(preSearch.roundNumber, AnalysisStatuses.STREAMING);
        onStreamStartRef.current?.();
        submit();
      });
    }
    // ✅ FIX: Zustand actions are stable, don't need them in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSearch.id, preSearch.roundNumber, preSearch.status, threadId]);

  // Cleanup on unmount - NO dependencies to prevent re-running on re-renders
  useEffect(() => {
    return () => {
      // Direct abort without calling stop() to avoid dependency issues
      // The hook's internal cleanup will handle setting isStreaming to false
    };
  }, []);

  // Mark completed/failed pre-searches as triggered to prevent re-streaming
  const roundAlreadyMarked = triggeredRounds.get(threadId)?.has(preSearch.roundNumber) ?? false;

  if (
    !triggeredSearchIds.has(preSearch.id)
    && !roundAlreadyMarked
    && (preSearch.status === AnalysisStatuses.COMPLETE
      || preSearch.status === AnalysisStatuses.FAILED)
  ) {
    triggeredSearchIds.set(preSearch.id, true);

    const roundSet = triggeredRounds.get(threadId);
    if (roundSet) {
      roundSet.add(preSearch.roundNumber);
    } else {
      triggeredRounds.set(threadId, new Set([preSearch.roundNumber]));
    }
  }

  // Show error if present (excluding abort and conflict errors)
  const shouldShowError = error && !(
    error instanceof Error
    && (error.name === 'AbortError'
      || error.message?.includes('aborted')
      || error.message?.includes('409')
      || error.message?.includes('Conflict'))
  );

  if (shouldShowError) {
    return (
      <div className="flex flex-col gap-2 py-2">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4" />
          <span>
            Failed to stream pre-search:
            {' '}
            {error.message || 'Unknown error'}
          </span>
        </div>
      </div>
    );
  }

  const displayData = preSearch.status === AnalysisStatuses.COMPLETE
    ? preSearch.searchData
    : partialSearchData;

  const hasData = displayData && (
    (displayData.queries && displayData.queries.length > 0)
    || (displayData.results && displayData.results.length > 0)
  );

  if ((preSearch.status === AnalysisStatuses.PENDING || preSearch.status === AnalysisStatuses.STREAMING) && !hasData) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span>Generating search queries...</span>
      </div>
    );
  }

  if (!hasData) {
    return null;
  }

  const { queries = [], results = [] } = displayData;

  /**
   * Type compatibility bridge for AI SDK streaming
   *
   * AI SDK's DeepPartial makes all properties recursively optional, but components
   * expect complete types. This is safe because:
   * 1. Schema validation ensures data structure is correct
   * 2. UI will render whatever fields are available during streaming
   * 3. Incomplete data is visually acceptable (progressive rendering)
   *
   * This is an established pattern when bridging streaming (partial) and
   * complete types - similar to how AI SDK itself handles streaming text.
   */
  const validQueries = queries.filter((q): q is NonNullable<typeof q> => q != null) as PreSearchDataPayload['queries'];
  const validResults = results.filter((r): r is NonNullable<typeof r> => r != null) as PreSearchDataPayload['results'];

  const isStreamingNow = preSearch.status === AnalysisStatuses.STREAMING;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {validResults.map((searchResult, searchIndex) => {
        const query = validQueries[searchIndex];
        const hasResult = !!searchResult;
        const uniqueKey = searchResult?.query || query?.query || `${preSearch.id}-search-${searchIndex}`;

        return (
          <motion.div
            key={uniqueKey}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 * searchIndex }}
            className="space-y-3"
          >
            {/* Step 1: Understanding */}
            <ChainOfThoughtStep
              icon={Brain}
              label={t('chat.preSearch.steps.understanding')}
              description={query?.rationale}
              status={isStreamingNow && !hasResult ? ChainOfThoughtStepStatuses.ACTIVE : ChainOfThoughtStepStatuses.COMPLETE}
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

            {/* Step 2: Searching */}
            <ChainOfThoughtStep
              icon={isStreamingNow && !hasResult ? Loader2 : Globe}
              label={isStreamingNow && !hasResult ? t('chat.preSearch.steps.searching') : t('chat.preSearch.steps.searchComplete')}
              description={isStreamingNow && !hasResult ? t('chat.preSearch.steps.searchingDesc') : undefined}
              status={isStreamingNow && !hasResult ? ChainOfThoughtStepStatuses.ACTIVE : ChainOfThoughtStepStatuses.COMPLETE}
              metadata={hasResult && (
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
              {hasResult && searchResult.results && searchResult.results.length > 0 && (
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
            {hasResult && (
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
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export const PreSearchStream = memo(PreSearchStreamComponent, (prevProps, nextProps) => {
  // ✅ Memo optimization: Prevent re-renders when props haven't changed
  // Callbacks are stored in refs internally, so callback equality checks prevent unnecessary work
  return (
    prevProps.preSearch.id === nextProps.preSearch.id
    && prevProps.preSearch.status === nextProps.preSearch.status
    && prevProps.preSearch.searchData === nextProps.preSearch.searchData
    && prevProps.threadId === nextProps.threadId
    && prevProps.onStreamComplete === nextProps.onStreamComplete
    && prevProps.onStreamStart === nextProps.onStreamStart
  );
});

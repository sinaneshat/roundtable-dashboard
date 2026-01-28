import { MessageStatuses, WebSearchDepths } from '@roundtable/shared';
import { memo, use, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';

import { TextShimmer } from '@/components/ai-elements/shimmer';
import { WebSearchConfigurationDisplay } from '@/components/chat/web-search-configuration-display';
import { Icons } from '@/components/icons';
import { ChatStoreContext, useChatStoreOptional } from '@/components/providers';
import { PreSearchQuerySkeleton, PreSearchResultsSkeleton, PreSearchSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { AnimatedStreamingItem, AnimatedStreamingList } from '@/components/ui/motion';
import { Separator } from '@/components/ui/separator';
import { useBoolean, useGetThreadPreSearchesForPolling } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import { rlog } from '@/lib/utils/dev-logger';
import type { PreSearchDataPayload, PreSearchQuery, PreSearchResult, StoredPreSearch, WebSearchResultItem as WebSearchResultItemType } from '@/services/api';

import { WebSearchResultItem } from './web-search-result-item';

// Stable no-op function for read-only contexts without ChatStoreProvider
const NOOP = () => false;

// PreSearchDataPayload is now imported from @/services/api (RPC-derived type)

type PreSearchStreamProps = {
  threadId: string;
  preSearch: StoredPreSearch;
  onStreamComplete?: (completedSearchData?: PreSearchDataPayload) => void;
};

function PreSearchStreamComponent({
  onStreamComplete,
  preSearch,
  threadId,
}: PreSearchStreamProps) {
  const t = useTranslations('chat.preSearch');
  const tErrors = useTranslations('errors');
  const is409Conflict = useBoolean(false);
  const isAutoRetrying = useBoolean(false);

  const store = use(ChatStoreContext);

  // Use optional store hook - returns undefined on public pages without ChatStoreProvider
  const storeData = useChatStoreOptional(
    useShallow(s => ({
      clearPreSearchTracking: s.clearPreSearchTracking,
      markPreSearchTriggered: s.markPreSearchTriggered,
    })),
  );

  // Fallback values for read-only pages (public threads) without ChatStoreProvider
  const markPreSearchTriggered = storeData?.markPreSearchTriggered ?? NOOP;
  const clearPreSearchTracking = storeData?.clearPreSearchTracking ?? NOOP;

  const [partialSearchData, setPartialSearchData] = useState<Partial<PreSearchDataPayload> | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Progressive skeleton state - track expected counts and stream completion
  const [expectedQueryCount, setExpectedQueryCount] = useState<number | null>(null);
  const [isStreamComplete, setIsStreamComplete] = useState(false);

  // FIX 2: Track which queries/results have been rendered to animate only "new" items
  // Without this, React batches multiple SSE events into one render cycle,
  // causing all items to appear/animate simultaneously
  const renderedQueriesRef = useRef<Set<number>>(new Set());
  const renderedResultsRef = useRef<Set<number>>(new Set());

  // Reset progressive skeleton state when preSearch.id changes
  // useLayoutEffect ensures synchronous reset before paint
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- synchronous reset on prop change required
    setExpectedQueryCount(null);
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- synchronous reset on prop change required
    setIsStreamComplete(false);
    // Reset rendered item tracking for new conversation/round
    renderedQueriesRef.current = new Set();
    renderedResultsRef.current = new Set();
  }, [preSearch.id]);

  // Refs to access callback values in async polling without re-triggering effects
  const onStreamCompleteRef = useRef(onStreamComplete);
  onStreamCompleteRef.current = onStreamComplete;
  const is409ConflictOnFalseRef = useRef(is409Conflict.onFalse);
  is409ConflictOnFalseRef.current = is409Conflict.onFalse;
  const isAutoRetryingOnTrueRef = useRef(isAutoRetrying.onTrue);
  isAutoRetryingOnTrueRef.current = isAutoRetrying.onTrue;
  const isAutoRetryingOnFalseRef = useRef(isAutoRetrying.onFalse);
  isAutoRetryingOnFalseRef.current = isAutoRetrying.onFalse;

  const getThreadPreSearchesForPolling = useGetThreadPreSearchesForPolling();

  // ✅ RACE CONDITION FIX (Issue 3): Removed independent streaming effect
  // Previously, this component had its own effect that called tryMarkPreSearchTriggered
  // and initiated pre-search streaming. This caused a race condition with use-streaming-trigger.ts
  // which also triggers pre-search. Now use-streaming-trigger.ts is the SINGLE SOURCE OF TRUTH
  // for stream initiation. This component is purely a RENDER component that:
  // 1. Reads preSearch.searchData from props (store state updated by the hook)
  // 2. Handles 409 conflict polling fallback
  // 3. Marks already-complete searches as triggered

  // Sync local state from store when preSearch.searchData changes (updated by use-streaming-trigger.ts)
  // Use direct state updates - React 18 will process these efficiently
  // Note: We avoid flushSync here because it can cause warnings when called during render cycles
  useEffect(() => {
    if (preSearch.searchData) {
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- intentional prop-to-state sync for streaming UI
      setPartialSearchData(preSearch.searchData ?? null);
      if (preSearch.status === MessageStatuses.COMPLETE) {
        // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- intentional prop-to-state sync for streaming UI
        setIsStreamComplete(true);
      }
      // Extract expected query count from searchData if available
      if (preSearch.searchData.queries?.length) {
        const total = preSearch.searchData.queries[0]?.total;
        if (total && total > 0) {
          // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- intentional prop-to-state sync for streaming UI
          setExpectedQueryCount(total);
        }
      }
    }
  }, [preSearch.searchData, preSearch.status]);

  const isPollingRef = useRef(false);

  useEffect(() => {
    if (!is409Conflict.value) {
      return;
    }

    if (isPollingRef.current) {
      return;
    }
    isPollingRef.current = true;

    let timeoutId: NodeJS.Timeout;
    let isMounted = true;
    const pollingStartTime = Date.now();
    const POLLING_TIMEOUT_MS = 5_000;

    // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: immediate UI feedback for polling state
    flushSync(() => {
      isAutoRetryingOnTrueRef.current();
    });

    const poll = async () => {
      try {
        const result = await getThreadPreSearchesForPolling(threadId);

        if (!result?.success || !result.data?.items) {
          if (isMounted) {
            timeoutId = setTimeout(poll, 2000);
          }
          return;
        }

        const preSearchList = result.data.items;
        const current = preSearchList.find((ps: StoredPreSearch) => ps.id === preSearch.id);

        if (current) {
          if (current.status === MessageStatuses.COMPLETE && current.searchData) {
            const completedData = current.searchData;
            // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: polling completion update
            flushSync(() => {
              setPartialSearchData(completedData);
              setIsStreamComplete(true);
            });
            onStreamCompleteRef.current?.(completedData);
            if (isMounted) {
              isPollingRef.current = false;
              is409ConflictOnFalseRef.current();
              isAutoRetryingOnFalseRef.current();
            }
            return;
          } else if (current.status === MessageStatuses.FAILED) {
            // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: immediate error display
            flushSync(() => {
              setError(new Error(current.errorMessage || 'Pre-search failed'));
            });
            if (isMounted) {
              isPollingRef.current = false;
              is409ConflictOnFalseRef.current(); // Stop polling
              isAutoRetryingOnFalseRef.current(); // Clear auto-retry state
            }
            return;
          } else if (current.status === MessageStatuses.STREAMING || current.status === MessageStatuses.PENDING) {
            const elapsedMs = Date.now() - pollingStartTime;
            if (elapsedMs > POLLING_TIMEOUT_MS) {
              // Polling timeout - clear tracking so use-streaming-trigger.ts can retry
              clearPreSearchTracking(preSearch.roundNumber);
              if (isMounted) {
                isPollingRef.current = false;
                is409ConflictOnFalseRef.current();
                isAutoRetryingOnFalseRef.current();
              }
              return;
            }

            if (current.searchData) {
              const searchDataToSet = current.searchData;
              // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: progressive polling update
              flushSync(() => {
                setPartialSearchData(searchDataToSet);
              });
            }
          }
        }
      } catch (error) {
        // Log polling errors for debugging but don't crash UI
        // Network errors during polling shouldn't block the user
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Only log non-abort errors (abort is expected during cleanup)
        const isAbortError = error instanceof Error && (
          error.name === 'AbortError'
          || errorMessage.toLowerCase().includes('abort')
        );
        if (!isAbortError) {
          rlog.presearch('poll-error', `${preSearch.id.slice(-8)} polling error: ${errorMessage.slice(0, 100)}`);
        }
      }

      if (isMounted) {
        timeoutId = setTimeout(poll, 2000);
      }
    };

    poll();

    return () => {
      isMounted = false;
      isPollingRef.current = false;
      clearTimeout(timeoutId);
      isAutoRetryingOnFalseRef.current();
    };
  }, [is409Conflict.value, threadId, preSearch.id, preSearch.roundNumber, clearPreSearchTracking, getThreadPreSearchesForPolling]);

  useEffect(() => {
    const currentState = store?.getState();
    const roundAlreadyMarked = currentState?.hasPreSearchBeenTriggered(preSearch.roundNumber) ?? false;

    if (
      !roundAlreadyMarked
      && (preSearch.status === MessageStatuses.COMPLETE
        || preSearch.status === MessageStatuses.FAILED)
    ) {
      markPreSearchTriggered(preSearch.roundNumber);
    }
  }, [store, preSearch.roundNumber, preSearch.status, markPreSearchTriggered]);

  // Use deferred value for rapidly updating streaming state to allow React to batch updates
  const deferredSearchData = useDeferredValue(partialSearchData);

  // Memoize error detection
  const errorFlags = useMemo(() => {
    const isAbortError = error instanceof Error && (error.name === 'AbortError' || error.message?.includes('aborted'));
    const shouldShowError = error && !is409Conflict.value && !isAbortError;
    return { isAbortError, shouldShowError };
  }, [error, is409Conflict.value]);

  // Memoize display data derivation
  const displayData = useMemo(() => deferredSearchData || preSearch.searchData, [deferredSearchData, preSearch.searchData]);

  // Memoize status flags to prevent recalculation on every render
  const statusFlags = useMemo(() => {
    const hasQueries = displayData?.queries && displayData.queries.length > 0;
    const hasResults = displayData?.results && displayData.results.length > 0;
    const hasData = hasQueries || hasResults;
    const isPending = preSearch.status === MessageStatuses.PENDING || preSearch.status === MessageStatuses.STREAMING;
    const isPendingWithNoData = isPending && !hasData;
    const isStreamingNow = preSearch.status === MessageStatuses.STREAMING;
    const isEffectivelyComplete = isStreamComplete || preSearch.status === MessageStatuses.COMPLETE;

    return {
      hasData,
      hasQueries,
      hasResults,
      isEffectivelyComplete,
      isPending,
      isPendingWithNoData,
      isStreamingNow,
    };
  }, [displayData?.queries, displayData?.results, preSearch.status, isStreamComplete]);

  // Memoize filtered arrays to prevent recalculation
  const { summary, totalResults, totalTime, validQueries, validResults } = useMemo(() => {
    const queries = displayData?.queries ?? [];
    const results = displayData?.results ?? [];
    return {
      summary: displayData?.summary,
      totalResults: displayData?.totalResults,
      totalTime: displayData?.totalTime,
      validQueries: queries.filter((q: PreSearchQuery | null | undefined): q is PreSearchQuery => q !== null && q !== undefined),
      validResults: results.filter((r: PreSearchResult | null | undefined): r is PreSearchResult => r !== null && r !== undefined),
    };
  }, [displayData?.queries, displayData?.results, displayData?.summary, displayData?.totalResults, displayData?.totalTime]);

  // FIX P4: Memoize result lookup by query index to avoid stale find() results
  // Parent shows hasResults=true but child query shows hasResult=false due to React batching.
  // Using a Map ensures the lookup uses the same reference as the parent's hasResults check.
  const resultsByQueryIndex = useMemo(() => {
    const map = new Map<number, PreSearchResult>();
    for (const result of validResults) {
      if (result?.index !== undefined) {
        map.set(result.index, result);
      }
    }
    return map;
  }, [validResults]);

  if (errorFlags.shouldShowError) {
    return (
      <div className="flex flex-col gap-2 py-2">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <span className="size-1.5 rounded-full bg-destructive/80" />
          <span>
            {tErrors('streamFailed')}
            :
            {' '}
            {error?.message || tErrors('unknownError')}
          </span>
        </div>
      </div>
    );
  }

  if (preSearch.status === MessageStatuses.COMPLETE && !statusFlags.hasResults) {
    return null;
  }

  if (!statusFlags.hasData && !statusFlags.isPendingWithNoData) {
    return null;
  }

  // Debug: Log skeleton visibility conditions
  rlog.presearch('render-state', `status=${preSearch.status} streaming=${statusFlags.isStreamingNow} complete=${statusFlags.isEffectivelyComplete} q=${validQueries.length}/${expectedQueryCount ?? '?'} r=${validResults.length} mapSize=${resultsByQueryIndex.size}`);

  if (statusFlags.isPendingWithNoData || isAutoRetrying.value) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <TextShimmer>{isAutoRetrying.value ? t('autoRetryingSearch') : t('pendingSearch')}</TextShimmer>
        </div>
        <PreSearchSkeleton queryCount={2} resultsPerQuery={2} />
      </div>
    );
  }

  return (
    <AnimatedStreamingList groupId={`pre-search-stream-${preSearch.id}`} className="space-y-4">
      {/* Search Summary - only show if we have summary text */}
      {summary && (
        <AnimatedStreamingItem
          key="search-config"
          itemKey="search-config"
          index={0}
        >
          <WebSearchConfigurationDisplay
            queries={validQueries.filter((q: PreSearchQuery) => q?.query).map((q: PreSearchQuery) => ({
              index: q.index,
              query: q.query,
              rationale: q.rationale,
              searchDepth: q.searchDepth ?? WebSearchDepths.BASIC,
            }))}
            results={validResults.flatMap((r: PreSearchResult) => r.results || [])}
            searchPlan={summary}
            isStreamingPlan={statusFlags.isStreamingNow && !summary}
            {...(totalResults !== undefined ? { totalResults } : {})}
            {...(totalTime !== undefined ? { totalTime } : {})}
          />
        </AnimatedStreamingItem>
      )}

      {validQueries.map((query: PreSearchQuery, queryIndex: number) => {
        if (!query?.query) {
          return null;
        }

        // FIX 2: Track if this query is new (not yet rendered) for gradual animation
        // Without this tracking, React batches multiple SSE events into one render cycle,
        // causing all items to appear simultaneously instead of one by one
        const isNewQuery = !renderedQueriesRef.current.has(query.index);
        if (isNewQuery) {
          renderedQueriesRef.current.add(query.index);
        }

        // FIX P4: Use memoized map lookup instead of find() to avoid stale results during React batching
        const searchResult = resultsByQueryIndex.get(query.index)
          ?? validResults.find((r: PreSearchResult) => r?.query === query?.query);
        // ✅ FIX #8: Only consider having a result when data actually exists
        // Previously hasResult was true when object existed but data was empty, causing skeleton flash
        const hasResult = !!searchResult && searchResult.results && searchResult.results.length > 0;

        // FIX 2: Track if this result is new for gradual animation
        const isNewResult = hasResult && !renderedResultsRef.current.has(query.index);
        if (isNewResult) {
          renderedResultsRef.current.add(query.index);
        }

        const uniqueKey = `query-${query?.query || queryIndex}`;
        const hasResultsData = hasResult && searchResult.results && searchResult.results.length > 0;
        const isLastQuery = queryIndex === validQueries.length - 1;
        const remainingQueriesCount = !statusFlags.isEffectivelyComplete && expectedQueryCount ? Math.max(0, expectedQueryCount - validQueries.length) : 0;
        const showSeparator = !isLastQuery || remainingQueriesCount > 0;

        // Debug: Log per-query skeleton visibility
        const showResultSkeleton = !hasResultsData && !statusFlags.isEffectivelyComplete && statusFlags.isStreamingNow;
        rlog.presearch('query-render', `q${query.index} hasResult=${hasResult} hasResultsData=${hasResultsData} showSkeleton=${showResultSkeleton} isStreamingNow=${statusFlags.isStreamingNow}`);

        return (
          <AnimatedStreamingItem
            key={uniqueKey}
            itemKey={uniqueKey}
            index={queryIndex + 1} // +1 because search-config is index 0
            skipAnimation={!isNewQuery} // Only animate new items
          >
            <div className="space-y-2">
              {/* Query header with rationale and depth */}
              <div className="flex items-start gap-2">
                <Icons.search className="size-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  {/* Query text + depth badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-foreground">{query?.query}</p>
                    {query?.searchDepth && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'h-4 px-1.5 text-[10px] font-normal',
                          query.searchDepth === WebSearchDepths.ADVANCED
                            ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                            : 'bg-muted/50 text-muted-foreground border-border/50',
                        )}
                      >
                        {query.searchDepth === WebSearchDepths.ADVANCED && (
                          <Icons.zap className="size-2.5 mr-0.5" />
                        )}
                        {query.searchDepth}
                      </Badge>
                    )}
                  </div>
                  {/* Query rationale */}
                  {query?.rationale && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {query.rationale}
                    </p>
                  )}
                  {/* Result count - only show when results have arrived */}
                  {hasResult && (
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {searchResult.results.length}
                      {' '}
                      {searchResult.results.length === 1 ? t('source') : t('sources')}
                    </p>
                  )}
                </div>
              </div>

              {/* Results list - show actual results if available */}
              {hasResultsData && (
                <div className="pl-6">
                  {searchResult.results.map((result: WebSearchResultItemType, idx: number) => (
                    <WebSearchResultItem
                      key={result.url}
                      result={result}
                      showDivider={idx < searchResult.results.length - 1}
                    />
                  ))}
                </div>
              )}

              {/* Results skeleton - show when query arrived but results haven't yet (during streaming) */}
              {!hasResultsData && !statusFlags.isEffectivelyComplete && statusFlags.isStreamingNow && (
                <PreSearchResultsSkeleton count={3} />
              )}

              {/* Separator between searches */}
              {showSeparator && (
                <Separator className="!mt-4" />
              )}
            </div>
          </AnimatedStreamingItem>
        );
      })}

      {/* Remaining query skeletons - show for expected queries that haven't arrived yet */}
      {!statusFlags.isEffectivelyComplete && expectedQueryCount && validQueries.length < expectedQueryCount && (
        Array.from({ length: expectedQueryCount - validQueries.length }, (_, idx) => {
          const skeletonIndex = validQueries.length + idx;
          const isLastSkeleton = skeletonIndex === expectedQueryCount - 1;
          return (
            <AnimatedStreamingItem
              key={`skeleton-query-${idx}`}
              itemKey={`skeleton-query-${idx}`}
              index={validQueries.length + 1 + idx}
            >
              <PreSearchQuerySkeleton
                resultsPerQuery={3}
                showSeparator={!isLastSkeleton}
              />
            </AnimatedStreamingItem>
          );
        })
      )}

      {/* Fallback skeleton - show when streaming but no expected count yet (before first QUERY with total) */}
      {!statusFlags.isEffectivelyComplete && !expectedQueryCount && statusFlags.isStreamingNow && validQueries.length === 0 && (
        <AnimatedStreamingItem
          key="skeleton-fallback"
          itemKey="skeleton-fallback"
          index={1}
        >
          <PreSearchQuerySkeleton resultsPerQuery={3} showSeparator={false} />
        </AnimatedStreamingItem>
      )}
    </AnimatedStreamingList>
  );
}

export const PreSearchStream = memo(PreSearchStreamComponent, (prevProps, nextProps) => {
  return (
    prevProps.preSearch.id === nextProps.preSearch.id
    && prevProps.preSearch.status === nextProps.preSearch.status
    && prevProps.preSearch.searchData === nextProps.preSearch.searchData
    && prevProps.threadId === nextProps.threadId
    && prevProps.onStreamComplete === nextProps.onStreamComplete
  );
});

PreSearchStream.displayName = 'PreSearchStream';

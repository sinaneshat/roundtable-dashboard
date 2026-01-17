import { MessageStatuses, PreSearchSseEvents, WebSearchDepths } from '@roundtable/shared';
import { memo, use, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';

import { TextShimmer } from '@/components/ai-elements/shimmer';
import { WebSearchConfigurationDisplay } from '@/components/chat/web-search-configuration-display';
import { Icons } from '@/components/icons';
import { ChatStoreContext, useChatStore } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import { AnimatedStreamingItem, AnimatedStreamingList } from '@/components/ui/motion';
import { Separator } from '@/components/ui/separator';
import { PreSearchQuerySkeleton, PreSearchResultsSkeleton, PreSearchSkeleton } from '@/components/ui/skeleton';
import { useBoolean, useExecutePreSearchStream, useGetThreadPreSearchesForPolling } from '@/hooks/utils';
import { useTranslations } from '@/lib/compat';
import { cn } from '@/lib/ui/cn';
import type { StoredPreSearch } from '@/types/api';
import { PreSearchResponseSchema } from '@/types/api';

import { WebSearchResultItem } from './web-search-result-item';

type PreSearchDataPayload = NonNullable<StoredPreSearch['searchData']>;

type PreSearchStreamProps = {
  threadId: string;
  preSearch: StoredPreSearch;
  onStreamComplete?: (completedSearchData?: PreSearchDataPayload) => void;
  onStreamStart?: () => void;
};

function PreSearchStreamComponent({
  threadId,
  preSearch,
  onStreamComplete,
  onStreamStart,
}: PreSearchStreamProps) {
  const t = useTranslations('chat.preSearch');
  const tErrors = useTranslations('errors');
  const is409Conflict = useBoolean(false);
  const isAutoRetrying = useBoolean(false);

  const MAX_STREAM_RETRIES = 3;
  const RETRY_INTERVAL_MS = 3000;
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const postRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const store = use(ChatStoreContext);

  const {
    tryMarkPreSearchTriggered,
    markPreSearchTriggered,
    clearPreSearchTracking,
    isWaitingForChangelog,
    configChangeRoundNumber,
  } = useChatStore(
    useShallow(s => ({
      tryMarkPreSearchTriggered: s.tryMarkPreSearchTriggered,
      markPreSearchTriggered: s.markPreSearchTriggered,
      clearPreSearchTracking: s.clearPreSearchTracking,
      isWaitingForChangelog: s.isWaitingForChangelog,
      configChangeRoundNumber: s.configChangeRoundNumber,
    })),
  );

  const [partialSearchData, setPartialSearchData] = useState<Partial<PreSearchDataPayload> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [forceRetryCount, setForceRetryCount] = useState(0);

  // Progressive skeleton state - track expected counts and stream completion
  const [expectedQueryCount, setExpectedQueryCount] = useState<number | null>(null);
  const [isStreamComplete, setIsStreamComplete] = useState(false);

  // Reset progressive skeleton state when preSearch.id changes
  // useLayoutEffect ensures synchronous reset before paint
  useLayoutEffect(() => {
    retryCountRef.current = 0;
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- synchronous reset on prop change required
    setExpectedQueryCount(null);
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- synchronous reset on prop change required
    setIsStreamComplete(false);
  }, [preSearch.id]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (postRetryTimeoutRef.current) {
        clearTimeout(postRetryTimeoutRef.current);
      }
    };
  }, []);

  const onStreamCompleteRef = useRef(onStreamComplete);
  onStreamCompleteRef.current = onStreamComplete;
  const onStreamStartRef = useRef(onStreamStart);
  onStreamStartRef.current = onStreamStart;
  const is409ConflictOnFalseRef = useRef(is409Conflict.onFalse);
  is409ConflictOnFalseRef.current = is409Conflict.onFalse;
  const isAutoRetryingOnTrueRef = useRef(isAutoRetrying.onTrue);
  isAutoRetryingOnTrueRef.current = isAutoRetrying.onTrue;
  const isAutoRetryingOnFalseRef = useRef(isAutoRetrying.onFalse);
  isAutoRetryingOnFalseRef.current = isAutoRetrying.onFalse;

  const executePreSearchStream = useExecutePreSearchStream();
  const getThreadPreSearchesForPolling = useGetThreadPreSearchesForPolling();

  useEffect(() => {
    if (isWaitingForChangelog || configChangeRoundNumber !== null) {
      return;
    }

    if (preSearch.status !== MessageStatuses.PENDING && preSearch.status !== MessageStatuses.STREAMING) {
      return;
    }

    const didMark = tryMarkPreSearchTriggered(preSearch.roundNumber);
    if (!didMark) {
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const queriesMap = new Map<number, NonNullable<PreSearchDataPayload['queries']>[number]>();
    const resultsMap = new Map<number, NonNullable<PreSearchDataPayload['results']>[number]>();

    const MAX_POST_RETRIES = 5;
    const DEFAULT_RETRY_DELAY_MS = 2000;
    let postRetryCount = 0;

    const startStream = async (): Promise<void> => {
      try {
        if (!preSearch.userQuery || typeof preSearch.userQuery !== 'string') {
          throw new Error('userQuery is required but was not provided');
        }

        const response = await executePreSearchStream({
          param: {
            threadId,
            roundNumber: String(preSearch.roundNumber),
          },
          json: {
            userQuery: preSearch.userQuery,
          },
        });

        if (response.status === 202) {
          let retryDelayMs = DEFAULT_RETRY_DELAY_MS;
          let responseData: { data?: { status?: string; searchData?: PreSearchDataPayload; retryAfterMs?: number } } | undefined;

          try {
            responseData = await response.json();
            if (responseData?.data?.retryAfterMs) {
              retryDelayMs = responseData.data.retryAfterMs;
            }
          } catch {
          }

          if (responseData?.data?.status === MessageStatuses.COMPLETE && responseData.data.searchData) {
            const completedSearchData = responseData.data.searchData;
            // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: immediate UI update for streaming completion
            flushSync(() => {
              setPartialSearchData(completedSearchData);
              setIsStreamComplete(true);
              isAutoRetryingOnFalseRef.current();
            });
            onStreamCompleteRef.current?.(completedSearchData);
            return;
          }

          postRetryCount++;

          // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: immediate UI feedback for retry state
          flushSync(() => {
            isAutoRetryingOnTrueRef.current();
          });

          if (postRetryCount <= MAX_POST_RETRIES) {
            await new Promise<void>((resolve) => {
              postRetryTimeoutRef.current = setTimeout(() => {
                postRetryTimeoutRef.current = null;
                resolve();
              }, retryDelayMs);
            });
            if (!abortController.signal.aborted) {
              return startStream();
            }
            return;
          }

          is409Conflict.onTrue();
          return;
        }

        if (!response.ok) {
          if (response.status === 409) {
            is409Conflict.onTrue();
            return;
          }
          throw new Error(`Pre-search failed: ${response.statusText}`);
        }

        isAutoRetryingOnFalseRef.current();

        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
          const rawJson = await response.json();
          const parseResult = PreSearchResponseSchema.safeParse(rawJson);
          const searchData = parseResult.success ? parseResult.data.data?.searchData : undefined;
          if (searchData) {
            // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: immediate UI update for JSON response
            flushSync(() => {
              setPartialSearchData(searchData);
              setIsStreamComplete(true);
            });
            onStreamCompleteRef.current?.(searchData);
          }
          return;
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('No response body');
        }

        let buffer = '';
        let currentEvent = '';
        let currentData = '';

        const processEvent = async (event: string, data: string) => {
          try {
            if (event === PreSearchSseEvents.START) {
              onStreamStartRef.current?.();
            } else if (event === PreSearchSseEvents.QUERY) {
              const queryData = JSON.parse(data);
              queriesMap.set(queryData.index, {
                query: queryData.query,
                rationale: queryData.rationale,
                searchDepth: queryData.searchDepth || WebSearchDepths.BASIC,
                index: queryData.index,
                total: queryData.total,
              });
              const queries = Array.from(queriesMap.values()).sort((a, b) => a.index - b.index);
              const results = Array.from(resultsMap.values());
              // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: progressive streaming UI for SSE events
              flushSync(() => {
                if (queryData.total && queryData.total > 0) {
                  setExpectedQueryCount(queryData.total);
                }
                setPartialSearchData({ queries, results });
              });
              await new Promise(resolve => requestAnimationFrame(resolve));
            } else if (event === PreSearchSseEvents.RESULT) {
              const resultData = JSON.parse(data);
              resultsMap.set(resultData.index, {
                query: resultData.query,
                answer: resultData.answer,
                results: resultData.results || [],
                responseTime: resultData.responseTime,
                index: resultData.index,
              });
              const queries = Array.from(queriesMap.values()).sort((a, b) => a.index - b.index);
              const results = Array.from(resultsMap.values());
              // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: progressive streaming UI for SSE events
              flushSync(() => {
                setPartialSearchData({ queries, results });
              });
              await new Promise(resolve => requestAnimationFrame(resolve));
            } else if (event === PreSearchSseEvents.DONE) {
              const finalData = JSON.parse(data);

              if (finalData?.interrupted) {
                clearPreSearchTracking(preSearch.roundNumber);

                if (retryCountRef.current < MAX_STREAM_RETRIES) {
                  retryCountRef.current++;
                  // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: immediate UI feedback for retry state
                  flushSync(() => {
                    isAutoRetryingOnTrueRef.current();
                  });
                  // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: immediate effect re-trigger
                  flushSync(() => {
                    setForceRetryCount(c => c + 1);
                  });
                  return;
                }

                // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: immediate error display
                flushSync(() => {
                  setError(new Error('Pre-search stream interrupted after multiple retries'));
                });
                return;
              }

              // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: streaming completion
              flushSync(() => {
                setPartialSearchData(finalData);
                setIsStreamComplete(true);
              });
              onStreamCompleteRef.current?.(finalData);
            } else if (event === PreSearchSseEvents.FAILED) {
              const errorData = JSON.parse(data);
              // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: immediate error display
              flushSync(() => {
                setError(new Error(errorData.error || 'Pre-search failed'));
              });
            }
          } catch {
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done)
            break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              currentData = line.slice(5).trim();
            } else if (line === '' && currentEvent && currentData) {
              await processEvent(currentEvent, currentData);
              currentEvent = '';
              currentData = '';
            }
          }
        }

        if (currentEvent && currentData) {
          await processEvent(currentEvent, currentData);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        if (retryCountRef.current < MAX_STREAM_RETRIES) {
          retryCountRef.current++;
          isAutoRetrying.onTrue();

          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }

          retryTimeoutRef.current = setTimeout(() => {
            clearPreSearchTracking(preSearch.roundNumber);
            startStream().catch(() => {
            });
          }, RETRY_INTERVAL_MS);
          return;
        }

        retryCountRef.current = 0;
        isAutoRetrying.onFalse();
        setError(err instanceof Error ? err : new Error(tErrors('streamFailed')));
      }
    };

    startStream().catch(() => {
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- is409Conflict/isAutoRetrying callbacks accessed via refs, preSearch.status used in guard, tErrors is stable
  }, [preSearch.id, preSearch.roundNumber, threadId, preSearch.userQuery, store, tryMarkPreSearchTriggered, clearPreSearchTracking, forceRetryCount, isWaitingForChangelog, configChangeRoundNumber, executePreSearchStream]);

  const isPollingRef = useRef(false);

  useEffect(() => {
    if (!is409Conflict.value)
      return;

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

        if (!(result as any)?.data?.items) {
          if (isMounted) {
            timeoutId = setTimeout(poll, 2000);
          }
          return;
        }

        const preSearchList = (result as any).data.items;
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
              clearPreSearchTracking(preSearch.roundNumber);
              // eslint-disable-next-line react-dom/no-flush-sync -- Required for React concurrent mode: immediate effect re-trigger
              flushSync(() => {
                setForceRetryCount(c => c + 1);
              });
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
      } catch {
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

  const isAbortError = error instanceof Error && (error.name === 'AbortError' || error.message?.includes('aborted'));
  const shouldShowError = error && !is409Conflict.value && !isAbortError;

  if (shouldShowError) {
    return (
      <div className="flex flex-col gap-2 py-2">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <span className="size-1.5 rounded-full bg-destructive/80" />
          <span>
            {tErrors('streamFailed')}
            :
            {' '}
            {error.message || tErrors('unknownError')}
          </span>
        </div>
      </div>
    );
  }

  const displayData = partialSearchData || preSearch.searchData;
  const hasQueries = displayData?.queries && displayData.queries.length > 0;
  const hasResults = displayData?.results && displayData.results.length > 0;
  const hasData = hasQueries || hasResults;
  const isPending = preSearch.status === MessageStatuses.PENDING || preSearch.status === MessageStatuses.STREAMING;
  const isPendingWithNoData = isPending && !hasData;

  if (preSearch.status === MessageStatuses.COMPLETE && !hasResults) {
    return null;
  }

  if (!hasData && !isPendingWithNoData) {
    return null;
  }

  const queries = displayData?.queries ?? [];
  const results = displayData?.results ?? [];
  const summary = displayData?.summary;
  const totalResults = displayData?.totalResults;
  const totalTime = displayData?.totalTime;
  const validQueries = queries.filter((q): q is NonNullable<typeof q> => q != null);
  const validResults = results.filter((r): r is NonNullable<typeof r> => r != null);
  const isStreamingNow = preSearch.status === MessageStatuses.STREAMING;
  const isEffectivelyComplete = isStreamComplete || preSearch.status === MessageStatuses.COMPLETE;

  if (isPendingWithNoData || isAutoRetrying.value) {
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
            queries={validQueries.filter(q => q?.query).map(q => ({
              query: q.query,
              rationale: q.rationale,
              searchDepth: q.searchDepth,
              index: q.index,
            }))}
            results={validResults.flatMap(r => r.results || [])}
            searchPlan={summary}
            isStreamingPlan={isStreamingNow && !summary}
            totalResults={totalResults}
            totalTime={totalTime}
          />
        </AnimatedStreamingItem>
      )}

      {validQueries.map((query, queryIndex) => {
        if (!query?.query) {
          return null;
        }

        const searchResult = validResults.find(r => r?.index === query?.index) || validResults.find(r => r?.query === query?.query);
        const hasResult = !!searchResult;
        const uniqueKey = `query-${query?.query || queryIndex}`;
        const hasResultsData = hasResult && searchResult.results && searchResult.results.length > 0;
        const isLastQuery = queryIndex === validQueries.length - 1;
        const remainingQueriesCount = !isEffectivelyComplete && expectedQueryCount ? Math.max(0, expectedQueryCount - validQueries.length) : 0;
        const showSeparator = !isLastQuery || remainingQueriesCount > 0;

        return (
          <AnimatedStreamingItem
            key={uniqueKey}
            itemKey={uniqueKey}
            index={queryIndex + 1} // +1 because search-config is index 0
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
                  {searchResult.results.map((result, idx) => (
                    <WebSearchResultItem
                      key={result.url}
                      result={result}
                      showDivider={idx < searchResult.results.length - 1}
                    />
                  ))}
                </div>
              )}

              {/* Results skeleton - show when query arrived but results haven't yet (during streaming) */}
              {!hasResultsData && !isEffectivelyComplete && isStreamingNow && (
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
      {!isEffectivelyComplete && expectedQueryCount && validQueries.length < expectedQueryCount && (
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
      {!isEffectivelyComplete && !expectedQueryCount && isStreamingNow && validQueries.length === 0 && (
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
    && prevProps.onStreamStart === nextProps.onStreamStart
  );
});

PreSearchStream.displayName = 'PreSearchStream';

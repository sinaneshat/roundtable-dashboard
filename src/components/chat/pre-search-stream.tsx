'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, use, useEffect, useRef, useState } from 'react';

import { AnalysisStatuses, PreSearchSseEvents } from '@/api/core/enums';
import type { PreSearchDataPayload, StoredPreSearch } from '@/api/routes/chat/schema';
import { WebSearchConfigurationDisplay } from '@/components/chat/web-search-configuration-display';
import { ChatStoreContext, useChatStore } from '@/components/providers/chat-store-provider';
import { LoaderFive } from '@/components/ui/loader';
import { AnimatedStreamingItem, AnimatedStreamingList } from '@/components/ui/motion';
import { Separator } from '@/components/ui/separator';
import { useBoolean } from '@/hooks/utils';

import { WebSearchResultItem } from './web-search-result-item';

type PreSearchStreamProps = {
  threadId: string;
  preSearch: StoredPreSearch;
  onStreamComplete?: (completedSearchData?: PreSearchDataPayload) => void;
  onStreamStart?: () => void;
  /**
   * ✅ CRITICAL FIX: If true, the provider has already triggered this pre-search
   * PreSearchStream should NOT execute if provider is handling it
   * This prevents race condition during navigation (overview → thread screen)
   */
  providerTriggered?: boolean;
};

// Track at TWO levels to prevent duplicate submissions
const triggeredSearchIds = new Map<string, boolean>();
const triggeredRounds = new Map<string, Set<number>>();

// eslint-disable-next-line react-refresh/only-export-components -- Utility function for managing component state
export function clearTriggeredPreSearch(searchId: string) {
  triggeredSearchIds.delete(searchId);
}

// eslint-disable-next-line react-refresh/only-export-components -- Utility function for managing component state
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
  providerTriggered = false,
}: PreSearchStreamProps) {
  const t = useTranslations('chat.preSearch');
  const is409Conflict = useBoolean(false);

  // ✅ CRITICAL FIX: Get store directly to check state synchronously inside effects
  // Using useContext instead of useChatStore allows us to call getState() at execution time
  // This prevents race conditions where render-time values are stale when effects run
  const store = use(ChatStoreContext);

  // ✅ CRITICAL FIX: Get markPreSearchTriggered to signal to provider
  // When PreSearchStream decides to execute, it MUST mark the store so provider knows
  // Without this, both PreSearchStream and provider can race to execute simultaneously
  const markPreSearchTriggered = useChatStore(s => s.markPreSearchTriggered);

  // Local streaming state
  const [partialSearchData, setPartialSearchData] = useState<Partial<PreSearchDataPayload> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ✅ DEBUG: Track component renders
  const renderCountRef = useRef(0);
  renderCountRef.current++;

  // Store callbacks in refs for stability and to allow calling after unmount
  const onStreamCompleteRef = useRef(onStreamComplete);
  const onStreamStartRef = useRef(onStreamStart);

  // ✅ CRITICAL FIX: Do NOT abort fetch on unmount
  // Following the ModeratorAnalysisStream pattern - let the fetch complete in the background
  // Aborting on unmount causes "Malformed JSON in request body" errors because:
  // 1. Component unmounts quickly after starting fetch
  // 2. Abort happens after HTTP headers sent but before body completes
  // 3. Server receives partial/empty body → 400 error
  //
  // Instead, we let the fetch complete naturally:
  // - The callback refs (onStreamCompleteRef) allow callbacks to fire even after unmount
  // - Deduplication (triggeredSearchIds) prevents duplicate fetches
  // - The store updates will still happen via the ref callbacks
  useEffect(() => {
    return () => {
      // ✅ REMOVED: abortControllerRef.current?.abort()
      // Do NOT abort - let the request complete in background
      // The ref callbacks will handle completion even after unmount
    };
  }, []); // Empty deps = only runs on mount/unmount

  useEffect(() => {
    onStreamCompleteRef.current = onStreamComplete;
  }, [onStreamComplete]);

  useEffect(() => {
    onStreamStartRef.current = onStreamStart;
  }, [onStreamStart]);

  // Custom SSE handler for backend's custom event format (POST with fetch)
  useEffect(() => {
    // ✅ CRITICAL FIX: Skip if provider is already handling this pre-search
    // The provider marks rounds as triggered in the store before executing
    // This prevents race condition during navigation (overview → thread screen)
    // where provider starts fetch, navigation aborts it, then PreSearchStream tries to start
    if (providerTriggered) {
      return;
    }

    // ✅ CRITICAL FIX: Check store SYNCHRONOUSLY at effect execution time
    // The render-time hasStoreTriggered value can be stale when effects run concurrently
    // This ensures we check the actual current state right before marking/executing
    // If provider already marked this round, we skip to prevent duplicate fetch
    const currentStoreState = store?.getState();
    if (currentStoreState?.hasPreSearchBeenTriggered(preSearch.roundNumber)) {
      return;
    }

    // ✅ FIX: Only trigger for PENDING status, not STREAMING/COMPLETE/FAILED
    // STREAMING status means the backend has already started processing
    // COMPLETE/FAILED means it's done - no need to trigger
    if (preSearch.status !== AnalysisStatuses.PENDING) {
      return;
    }

    // ✅ CRITICAL: Check BOTH id-level AND round-level deduplication
    const idAlreadyTriggered = triggeredSearchIds.has(preSearch.id);
    const roundAlreadyTriggered = triggeredRounds.get(threadId)?.has(preSearch.roundNumber) ?? false;

    // If EITHER check passes, don't trigger
    if (idAlreadyTriggered || roundAlreadyTriggered) {
      return;
    }

    // Mark as triggered BEFORE starting stream to prevent duplicate submissions
    triggeredSearchIds.set(preSearch.id, true);

    const roundSet = triggeredRounds.get(threadId);
    if (roundSet) {
      roundSet.add(preSearch.roundNumber);
    } else {
      triggeredRounds.set(threadId, new Set([preSearch.roundNumber]));
    }

    // ✅ CRITICAL FIX: Also mark store's triggeredPreSearchRounds
    // This signals to the provider that PreSearchStream is handling this pre-search
    // Without this, provider's pendingMessage effect may also try to execute,
    // causing duplicate fetches and "Malformed JSON in request body" errors
    // @see ChatStoreProvider pendingMessage effect at lines 1076-1224
    markPreSearchTriggered(preSearch.roundNumber);

    const abortController = new AbortController();
    // Store controller for cleanup - we use AbortController API for fetch-based streaming
    abortControllerRef.current = abortController;

    // Track partial data accumulation using Maps to avoid sparse arrays
    const queriesMap = new Map<number, PreSearchDataPayload['queries'][number]>();
    const resultsMap = new Map<number, PreSearchDataPayload['results'][number]>();

    // Start fetch-based SSE stream (backend uses POST)
    const startStream = async () => {
      try {
        // ✅ FIX: Guard against undefined userQuery (malformed JSON error)
        if (!preSearch.userQuery || typeof preSearch.userQuery !== 'string') {
          console.error('[PreSearchStream] userQuery is missing or invalid:', {
            id: preSearch.id,
            roundNumber: preSearch.roundNumber,
            userQuery: preSearch.userQuery,
            preSearch,
          });
          throw new Error('userQuery is required but was not provided');
        }

        const response = await fetch(
          `/api/v1/chat/threads/${threadId}/rounds/${preSearch.roundNumber}/pre-search`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
            },
            body: JSON.stringify({ userQuery: preSearch.userQuery }),
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          if (response.status === 409) {
            is409Conflict.onTrue();
            return;
          }
          const errorMsg = `Pre-search failed: ${response.statusText}`;
          throw new Error(errorMsg);
        }

        // Parse SSE stream manually
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('No response body');
        }

        let buffer = '';
        let currentEvent = '';
        let currentData = '';

        // ✅ CRITICAL FIX: Process events helper function
        // Extracted to be used both during streaming AND after stream ends
        const processEvent = (event: string, data: string) => {
          try {
            if (event === PreSearchSseEvents.START) {
              onStreamStartRef.current?.();
            } else if (event === PreSearchSseEvents.QUERY) {
              const queryData = JSON.parse(data);
              queriesMap.set(queryData.index, {
                query: queryData.query,
                rationale: queryData.rationale,
                searchDepth: queryData.searchDepth || 'basic',
                index: queryData.index,
                total: queryData.total,
              });
              // Convert Maps to arrays sorted by index
              const queries = Array.from(queriesMap.values()).sort((a, b) => a.index - b.index);
              const results = Array.from(resultsMap.values());
              setPartialSearchData({ queries, results });
            } else if (event === PreSearchSseEvents.RESULT) {
              const resultData = JSON.parse(data);
              resultsMap.set(resultData.index, {
                query: resultData.query,
                answer: resultData.answer,
                results: resultData.results || [],
                responseTime: resultData.responseTime,
              });
              // Convert Maps to arrays sorted by index
              const queries = Array.from(queriesMap.values()).sort((a, b) => a.index - b.index);
              const results = Array.from(resultsMap.values());
              setPartialSearchData({ queries, results });
            } else if (event === PreSearchSseEvents.DONE) {
              const finalData = JSON.parse(data);
              setPartialSearchData(finalData);
              onStreamCompleteRef.current?.(finalData);
            } else if (event === PreSearchSseEvents.FAILED) {
              const errorData = JSON.parse(data);
              setError(new Error(errorData.error || 'Pre-search failed'));
            }
          } catch {
            // Failed to parse event, continue
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
              // Process complete event
              processEvent(currentEvent, currentData);

              // Reset for next event
              currentEvent = '';
              currentData = '';
            }
          }
        }

        // ✅ CRITICAL FIX: Process any remaining buffered event after stream ends
        // If the last event doesn't have a trailing newline, it won't be processed in the loop
        // This ensures the final 'done' event is always processed, even without a trailing newline
        if (currentEvent && currentData) {
          processEvent(currentEvent, currentData);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return; // Normal abort, don't show error
        }
        setError(err instanceof Error ? err : new Error('Stream failed'));
      }
    };

    startStream().catch(() => {
      // Stream failed, error state already handled
    });

    // ✅ CRITICAL FIX: NO cleanup here - abort is handled by the separate unmount effect
    // Previously, the cleanup ran on EVERY dependency change (not just unmount), which:
    // 1. Aborted the running fetch
    // 2. Then the effect re-ran and returned early (due to deduplication)
    // 3. Result: fetch aborted, no new fetch started → stuck at PENDING
    // Now: abort only happens on true unmount via the empty-deps effect above
    // ✅ FIX: Removed preSearch.status from dependencies to prevent effect re-run when backend updates status
    // The effect should only run once per unique search (id + roundNumber)
    // Status changes (pending→streaming→completed) should NOT re-trigger the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSearch.id, preSearch.roundNumber, threadId, preSearch.userQuery, providerTriggered, store, markPreSearchTriggered]);

  // ✅ POLLING RECOVERY: Handle 409 Conflict (Stream already active)
  // If we reconnect to a stream that's already running (e.g. after reload),
  // we poll the status until it completes, then sync the data.
  useEffect(() => {
    if (!is409Conflict.value)
      return;

    let timeoutId: NodeJS.Timeout;
    let isMounted = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/chat/threads/${threadId}/pre-searches`);
        if (!res.ok)
          throw new Error('Failed to fetch pre-searches');

        const json = (await res.json()) as { data: StoredPreSearch[] };
        const preSearches = json.data;
        const current = preSearches.find(ps => ps.id === preSearch.id);

        if (current) {
          if (current.status === AnalysisStatuses.COMPLETE && current.searchData) {
            setPartialSearchData(current.searchData);
            onStreamCompleteRef.current?.(current.searchData);
            if (isMounted)
              is409Conflict.onFalse(); // Stop polling
            return;
          } else if (current.status === AnalysisStatuses.FAILED) {
            setError(new Error(current.errorMessage || 'Pre-search failed'));
            if (isMounted)
              is409Conflict.onFalse(); // Stop polling
            return;
          }
          // If still STREAMING or PENDING, continue polling
        }
      } catch (err) {
        // Silent failure on polling error, retry next interval
        console.error('[PreSearchStream] Polling failed:', err);
      }

      if (isMounted) {
        timeoutId = setTimeout(poll, 2000); // Poll every 2s
      }
    };

    poll();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [is409Conflict.value, threadId, preSearch.id, is409Conflict]);

  // Mark completed/failed/streaming pre-searches as triggered to prevent re-streaming
  // ✅ FIX: Also mark STREAMING status to prevent duplicate triggers during status transitions
  const roundAlreadyMarked = triggeredRounds.get(threadId)?.has(preSearch.roundNumber) ?? false;

  if (
    !triggeredSearchIds.has(preSearch.id)
    && !roundAlreadyMarked
    && (preSearch.status === AnalysisStatuses.COMPLETE
      || preSearch.status === AnalysisStatuses.FAILED
      || preSearch.status === AnalysisStatuses.STREAMING)
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
  const shouldShowError = error && !is409Conflict.value && !(
    error instanceof Error
    && (error.name === 'AbortError' || error.message?.includes('aborted'))
  );

  if (shouldShowError) {
    return (
      <div className="flex flex-col gap-2 py-2">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <span className="size-1.5 rounded-full bg-destructive/80" />
          <span>
            Failed to stream pre-search:
            {' '}
            {error.message || 'Unknown error'}
          </span>
        </div>
      </div>
    );
  }

  // Handle streaming state properly
  // ✅ FIX: Always prefer partialSearchData when available (it has the streamed data)
  // Only fall back to preSearch.searchData when partialSearchData is null/empty
  // This prevents data disappearing when status changes to COMPLETE before store sync
  const displayData = partialSearchData || preSearch.searchData;

  const hasData = displayData && (
    (displayData.queries && displayData.queries.length > 0)
    || (displayData.results && displayData.results.length > 0)
  );

  // For COMPLETE status, only show if there are actual results (not just queries)
  const hasResults = displayData && displayData.results && displayData.results.length > 0;
  if (preSearch.status === AnalysisStatuses.COMPLETE && !hasResults) {
    return null;
  }

  // ✅ EAGER RENDERING: Show loading UI when PENDING/STREAMING with no data
  // This provides immediate visual feedback that search is coming
  if ((preSearch.status === AnalysisStatuses.PENDING || preSearch.status === AnalysisStatuses.STREAMING) && !hasData) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <LoaderFive text={t('pendingSearch')} />
      </div>
    );
  }

  // Don't render if no data and not pending/streaming
  if (!hasData) {
    return null;
  }

  const { queries = [], results = [], analysis, totalResults, totalTime } = displayData;
  const validQueries = queries.filter((q): q is NonNullable<typeof q> => q != null);
  const validResults = results.filter((r): r is NonNullable<typeof r> => r != null);

  const isStreamingNow = preSearch.status === AnalysisStatuses.STREAMING;

  // Track section indices for staggered top-to-bottom animations
  let sectionIndex = 0;

  return (
    <AnimatedStreamingList groupId={`pre-search-stream-${preSearch.id}`} className="space-y-4">
      {/* Search Summary - only show if we have analysis text */}
      {analysis && (
        <AnimatedStreamingItem
          key="search-config"
          itemKey="search-config"
          index={sectionIndex++}
        >
          <WebSearchConfigurationDisplay
            queries={validQueries.filter(q => q?.query).map(q => ({
              query: q.query,
              rationale: q.rationale,
              searchDepth: q.searchDepth,
              index: q.index,
            }))}
            results={validResults.flatMap(r => r.results || [])}
            searchPlan={analysis}
            isStreamingPlan={isStreamingNow && !analysis}
            totalResults={totalResults}
            totalTime={totalTime}
          />
        </AnimatedStreamingItem>
      )}

      {validQueries.map((query, queryIndex) => {
        if (!query?.query) {
          return null;
        }

        const searchResult = validResults.find(r => r?.query === query?.query);
        const hasResult = !!searchResult;
        const uniqueKey = `query-${query?.query || queryIndex}`;
        const hasResults = hasResult && searchResult.results && searchResult.results.length > 0;
        const currentIndex = sectionIndex++;

        return (
          <AnimatedStreamingItem
            key={uniqueKey}
            itemKey={uniqueKey}
            index={currentIndex}
          >
            <div className="space-y-2">
              {/* Query header - minimal */}
              <div className="flex items-start gap-2">
                <Search className="size-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{query?.query}</p>
                  {hasResult && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {searchResult.results.length}
                      {' '}
                      {searchResult.results.length === 1 ? 'result' : 'results'}
                    </p>
                  )}
                </div>
              </div>

              {/* Results list */}
              {hasResults && (
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

              {/* Separator between searches */}
              {queryIndex < validQueries.length - 1 && (
                <Separator className="!mt-4" />
              )}
            </div>
          </AnimatedStreamingItem>
        );
      })}
    </AnimatedStreamingList>
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
    && prevProps.providerTriggered === nextProps.providerTriggered
  );
});

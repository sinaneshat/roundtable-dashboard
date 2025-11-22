'use client';

import { Search } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';

import { AnalysisStatuses, PreSearchSseEvents, WebSearchDepths } from '@/api/core/enums';
import type { PreSearchDataPayload, StoredPreSearch } from '@/api/routes/chat/schema';
import { LLMAnswerDisplay } from '@/components/chat/llm-answer-display';
import { WebSearchConfigurationDisplay } from '@/components/chat/web-search-configuration-display';
import { WebSearchImageGallery } from '@/components/chat/web-search-image-gallery';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useBoolean } from '@/hooks/utils';

import { WebSearchResultItem } from './web-search-result-item';

type PreSearchStreamProps = {
  threadId: string;
  preSearch: StoredPreSearch;
  onStreamComplete?: (completedSearchData?: PreSearchDataPayload) => void;
  onStreamStart?: () => void;
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
}: PreSearchStreamProps) {
  const is409Conflict = useBoolean(false);

  // Local streaming state
  const [partialSearchData, setPartialSearchData] = useState<Partial<PreSearchDataPayload> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ✅ DEBUG: Track component renders
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  //   id: preSearch.id,
  //   round: preSearch.roundNumber,
  //   status: preSearch.status,
  //   threadId,
  // });

  // Store callbacks in refs for stability and to allow calling after unmount
  const onStreamCompleteRef = useRef(onStreamComplete);
  const onStreamStartRef = useRef(onStreamStart);

  useEffect(() => {
    onStreamCompleteRef.current = onStreamComplete;
  }, [onStreamComplete]);

  useEffect(() => {
    onStreamStartRef.current = onStreamStart;
  }, [onStreamStart]);

  // Custom SSE handler for backend's custom event format (POST with fetch)
  useEffect(() => {
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

    const abortController = new AbortController();
    // Store controller for cleanup - we use AbortController API for fetch-based streaming
    abortControllerRef.current = abortController;

    // Track partial data accumulation using Maps to avoid sparse arrays
    const queriesMap = new Map<number, PreSearchDataPayload['queries'][number]>();
    const resultsMap = new Map<number, PreSearchDataPayload['results'][number]>();

    // Start fetch-based SSE stream (backend uses POST)
    const startStream = async () => {
      try {
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
                searchDepth: queryData.searchDepth || WebSearchDepths.BASIC,
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

    // Cleanup on unmount
    return () => {
      // ✅ CRITICAL FIX: Do NOT delete search ID from triggered map on unmount
      // This prevents double-calling when component unmounts/remounts (e.g., React Strict Mode, parent re-renders)
      // The ID is only cleared via clearTriggeredPreSearchForRound() during regeneration
      // Background fetch will complete and sync via PreSearchOrchestrator
      // triggeredSearchIds.delete(preSearch.id); // REMOVED - causes double fetching
      // triggeredRounds cleanup // REMOVED - causes double fetching

      // Clean up the ref but DON'T abort the fetch
      // Let it complete in background - results will sync via orchestrator
      abortControllerRef.current = null;
    };
    // ✅ FIX: Removed preSearch.status from dependencies to prevent effect re-run when backend updates status
    // The effect should only run once per unique search (id + roundNumber)
    // Status changes (pending→streaming→completed) should NOT re-trigger the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSearch.id, preSearch.roundNumber, threadId, preSearch.userQuery]);

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
  // PENDING/STREAMING: Show partialSearchData (actual stream data), fallback to preSearch.searchData
  // COMPLETED: Show stored searchData
  const displayData = preSearch.status === AnalysisStatuses.COMPLETE
    ? preSearch.searchData
    : (partialSearchData || preSearch.searchData);

  const hasData = displayData && (
    (displayData.queries && displayData.queries.length > 0)
    || (displayData.results && displayData.results.length > 0)
  );

  // For COMPLETE status, only show if there are actual results (not just queries)
  const hasResults = displayData && displayData.results && displayData.results.length > 0;
  if (preSearch.status === AnalysisStatuses.COMPLETE && !hasResults) {
    return null;
  }

  // Don't show internal loading - unified loading indicator handles this
  if ((preSearch.status === AnalysisStatuses.PENDING || preSearch.status === AnalysisStatuses.STREAMING) && !hasData) {
    return null;
  }

  // Don't render if no data
  if (!hasData) {
    return null;
  }

  const { queries = [], results = [], analysis, successCount, failureCount, totalResults, totalTime } = displayData;
  const validQueries = queries.filter((q): q is NonNullable<typeof q> => q != null);
  const validResults = results.filter((r): r is NonNullable<typeof r> => r != null);

  const isStreamingNow = preSearch.status === AnalysisStatuses.STREAMING;

  return (
    <div className="space-y-6">
      {/* Search Plan & Configuration Summary */}
      {validQueries.length > 0 && validQueries.some(q => q?.query) && (
        <div>
          <WebSearchConfigurationDisplay
            queries={validQueries.filter(q => q?.query).map(q => ({
              query: q.query,
              rationale: q.rationale,
              searchDepth: q.searchDepth as 'basic' | 'advanced',
              index: q.index,
            }))}
            searchPlan={analysis}
            isStreamingPlan={isStreamingNow && !analysis}
            totalResults={totalResults}
            successCount={successCount}
            failureCount={failureCount}
            totalTime={totalTime}
          />
        </div>
      )}

      {validQueries.map((query, queryIndex) => {
        if (!query?.query) {
          return null;
        }

        const searchResult = validResults.find(r => r?.query === query?.query);
        const hasResult = !!searchResult;
        const uniqueKey = `query-${query?.query || queryIndex}`;
        const hasResults = hasResult && searchResult.results && searchResult.results.length > 0;

        return (
          <div key={uniqueKey} className="space-y-2">
            {/* Query header */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Search className="size-4 text-primary/70 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {query?.index !== undefined && query?.total !== undefined && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        Query
                        {' '}
                        {query.index + 1}
                        {' '}
                        of
                        {' '}
                        {query.total}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {query?.query}
                  </p>
                  {query?.rationale && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      {query.rationale}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {query?.searchDepth && (
                    <Badge variant={query.searchDepth === WebSearchDepths.ADVANCED ? 'default' : 'secondary'} className="text-xs">
                      {query.searchDepth === WebSearchDepths.ADVANCED ? 'Advanced' : 'Simple'}
                    </Badge>
                  )}
                  {hasResult && searchResult.responseTime && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {Math.round(searchResult.responseTime)}
                      ms
                    </Badge>
                  )}
                </div>
              </div>
              {hasResult && (
                <p className="text-xs text-muted-foreground pl-6">
                  {searchResult.results.length}
                  {' '}
                  {searchResult.results.length === 1 ? 'source' : 'sources'}
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

            {/* Image Gallery */}
            {hasResults && (
              <div className="pl-6">
                <WebSearchImageGallery results={searchResult.results} />
              </div>
            )}

            {/* Search Statistics */}
            {hasResults && (() => {
              const totalImages = searchResult.results.reduce(
                (sum, r) => sum + (r.images?.length || 0) + (r.metadata?.imageUrl ? 1 : 0),
                0,
              );
              const totalWords = searchResult.results.reduce(
                (sum, r) => sum + (r.metadata?.wordCount || 0),
                0,
              );
              const resultsWithContent = searchResult.results.filter(r => r.fullContent);
              const hasMetadata = totalImages > 0 || totalWords > 0 || resultsWithContent.length > 0;

              if (!hasMetadata)
                return null;

              return (
                <div className="pl-6 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                  {totalImages > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {totalImages}
                      {' '}
                      {totalImages === 1 ? 'image' : 'images'}
                    </Badge>
                  )}
                  {totalWords > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {totalWords.toLocaleString()}
                      {' '}
                      words extracted
                    </Badge>
                  )}
                  {resultsWithContent.length > 0 && (
                    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                      {resultsWithContent.length}
                      {' '}
                      full content
                    </Badge>
                  )}
                </div>
              );
            })()}

            {/* AI-Generated Answer Summary */}
            {hasResult && (
              <div className="pl-6">
                <LLMAnswerDisplay
                  answer={searchResult.answer}
                  isStreaming={isStreamingNow}
                  sources={searchResult.results.map(r => ({ url: r.url, title: r.title }))}
                />
              </div>
            )}

            {/* Separator between searches */}
            {queryIndex < validQueries.length - 1 && (
              <Separator className="!mt-6" />
            )}
          </div>
        );
      })}
    </div>
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

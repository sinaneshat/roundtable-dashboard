'use client';

import { motion } from 'framer-motion';
import { Search, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useRef, useState } from 'react';

import { AnalysisStatuses, WebSearchDepths } from '@/api/core/enums';
import type { PreSearchDataPayload, StoredPreSearch } from '@/api/routes/chat/schema';
import { ChatLoading } from '@/components/chat/chat-loading';
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
  const t = useTranslations('chat.preSearch');
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

        while (true) {
          const { done, value } = await reader.read();
          if (done)
            break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = '';
          let currentData = '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              currentData = line.slice(5).trim();
            } else if (line === '' && currentEvent && currentData) {
              // Process complete event
              try {
                if (currentEvent === 'start') {
                  onStreamStartRef.current?.();
                } else if (currentEvent === 'query') {
                  const queryData = JSON.parse(currentData);
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
                } else if (currentEvent === 'result') {
                  const resultData = JSON.parse(currentData);
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
                } else if (currentEvent === 'done') {
                  const finalData = JSON.parse(currentData) as PreSearchDataPayload;
                  setPartialSearchData(finalData);
                  onStreamCompleteRef.current?.(finalData);
                } else if (currentEvent === 'failed') {
                  const errorData = JSON.parse(currentData);
                  setError(new Error(errorData.error || 'Pre-search failed'));
                }
              } catch {
                // Failed to parse event, continue
              }

              // Reset for next event
              currentEvent = '';
              currentData = '';
            }
          }
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
  // PENDING/STREAMING: Show partialSearchData (actual stream data)
  // COMPLETED: Show stored searchData
  const displayData = preSearch.status === AnalysisStatuses.COMPLETE
    ? preSearch.searchData
    : partialSearchData;

  const hasData = displayData && (
    (displayData.queries && displayData.queries.length > 0)
    || (displayData.results && displayData.results.length > 0)
  );

  // Show loading indicator for PENDING/STREAMING with no stream data yet
  if ((preSearch.status === AnalysisStatuses.PENDING || preSearch.status === AnalysisStatuses.STREAMING) && !hasData) {
    return <ChatLoading text="Generating search queries..." />;
  }

  // Don't render if no data
  if (!hasData) {
    return null;
  }

  const { queries = [], results = [] } = displayData;
  const validQueries = queries.filter((q): q is NonNullable<typeof q> => q != null);
  const validResults = results.filter((r): r is NonNullable<typeof r> => r != null);

  const isStreamingNow = preSearch.status === AnalysisStatuses.STREAMING;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {validQueries.map((query, queryIndex) => {
        const searchResult = validResults.find(r => r?.query === query?.query);
        const hasResult = !!searchResult;
        const uniqueKey = query?.query || `${preSearch.id}-search-${queryIndex}`;
        const hasResults = hasResult && searchResult.results && searchResult.results.length > 0;

        return (
          <motion.div
            key={uniqueKey}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 * queryIndex }}
            className="space-y-3"
          >
            {/* Query header with mode */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Search className="size-4 text-primary/70 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {query?.query}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {query?.searchDepth && (
                    <Badge variant={query.searchDepth === WebSearchDepths.ADVANCED ? 'default' : 'secondary'} className="text-xs">
                      {query.searchDepth === WebSearchDepths.ADVANCED ? 'Advanced' : 'Simple'}
                    </Badge>
                  )}
                  {isStreamingNow && !hasResult && (
                    <div className="flex items-center gap-1">
                      {[0, 1, 2].map(i => (
                        <motion.div
                          key={i}
                          className="size-1.5 bg-primary/40 rounded-full"
                          animate={{
                            scale: [1, 1.3, 1],
                            opacity: [0.4, 1, 0.4],
                          }}
                          transition={{
                            repeat: Infinity,
                            duration: 1.2,
                            delay: i * 0.2,
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {hasResult && searchResult.responseTime && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {Math.round(searchResult.responseTime)}
                      ms
                    </Badge>
                  )}
                </div>
              </div>

              {/* Result count or searching indicator */}
              {!hasResult && (
                <p className="text-xs text-muted-foreground pl-6">
                  {t('steps.searchingDesc')}
                </p>
              )}
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

            {/* Summary */}
            {hasResult && searchResult.answer && (
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
            {queryIndex < validQueries.length - 1 && (
              <Separator className="!mt-6" />
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

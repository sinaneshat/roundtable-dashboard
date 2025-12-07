'use client';

import { Search, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, use, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { AnalysisStatuses, PreSearchSseEvents, WebSearchDepths } from '@/api/core/enums';
import type { PreSearchDataPayload, StoredPreSearch } from '@/api/routes/chat/schema';
import { PreSearchResponseSchema } from '@/api/routes/chat/schema';
import { TextShimmer } from '@/components/ai-elements/shimmer';
import { WebSearchConfigurationDisplay } from '@/components/chat/web-search-configuration-display';
import { ChatStoreContext, useChatStore } from '@/components/providers/chat-store-provider';
import { Badge } from '@/components/ui/badge';
import { AnimatedStreamingItem, AnimatedStreamingList } from '@/components/ui/motion';
import { Separator } from '@/components/ui/separator';
import { useBoolean } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';
import { executePreSearchStreamService, getThreadPreSearchesService } from '@/services/api';

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

// ✅ ZUSTAND PATTERN: Pre-search deduplication moved to store
// - store.triggeredPreSearchRounds: Set<number> - tracks triggered rounds
// - store.markPreSearchTriggered(roundNumber) - marks round as triggered
// - store.hasPreSearchBeenTriggered(roundNumber) - checks if triggered
// - store.clearPreSearchTracking(roundNumber) - clears for retry
// This eliminates module-level state anti-pattern and memory leaks

function PreSearchStreamComponent({
  threadId,
  preSearch,
  onStreamComplete,
  onStreamStart,
  providerTriggered = false,
}: PreSearchStreamProps) {
  const t = useTranslations('chat.preSearch');
  const is409Conflict = useBoolean(false);
  // ✅ AUTO-RETRY UI: Track when retrying after stream failure
  const isAutoRetrying = useBoolean(false);

  // ✅ AUTO-RETRY: Track retry attempts for stream failures
  // Stream failures often succeed on retry (transient network/model issues)
  // Auto-retry provides better UX than showing error immediately
  const MAX_STREAM_RETRIES = 3;
  const RETRY_INTERVAL_MS = 3000; // Fixed 3-second intervals
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ✅ CRITICAL FIX: Get store directly to check state synchronously inside effects
  // Using useContext instead of useChatStore allows us to call getState() at execution time
  // This prevents race conditions where render-time values are stale when effects run
  const store = use(ChatStoreContext);

  // ✅ ZUSTAND PATTERN: Use store for pre-search deduplication tracking
  // When PreSearchStream decides to execute, it MUST mark the store so provider knows
  // Without this, both PreSearchStream and provider can race to execute simultaneously
  const markPreSearchTriggered = useChatStore(s => s.markPreSearchTriggered);
  const clearPreSearchTracking = useChatStore(s => s.clearPreSearchTracking);

  // Local streaming state
  const [partialSearchData, setPartialSearchData] = useState<Partial<PreSearchDataPayload> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ✅ DEBUG: Track component renders
  const renderCountRef = useRef(0);
  renderCountRef.current++;

  // ✅ Reset retry count when preSearch ID changes (new search)
  useEffect(() => {
    retryCountRef.current = 0;
  }, [preSearch.id]);

  // ✅ AUTO-RETRY: Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Store callbacks in refs for stability and to allow calling after unmount
  const onStreamCompleteRef = useRef(onStreamComplete);
  const onStreamStartRef = useRef(onStreamStart);

  // ✅ STABLE REFS: Store callback functions in refs to avoid effect re-runs
  // useBoolean returns new object on each render, so we use refs for callbacks
  // Defined early to avoid use-before-define in effects
  // Direct assignment on each render keeps refs current without triggering effects
  const is409ConflictOnFalseRef = useRef(is409Conflict.onFalse);
  is409ConflictOnFalseRef.current = is409Conflict.onFalse;
  const isAutoRetryingOnTrueRef = useRef(isAutoRetrying.onTrue);
  isAutoRetryingOnTrueRef.current = isAutoRetrying.onTrue;
  const isAutoRetryingOnFalseRef = useRef(isAutoRetrying.onFalse);
  isAutoRetryingOnFalseRef.current = isAutoRetrying.onFalse;

  // ✅ CRITICAL FIX: Do NOT abort fetch on unmount
  // Following the ModeratorAnalysisStream pattern - let the fetch complete in the background
  // Aborting on unmount causes "Malformed JSON in request body" errors because:
  // 1. Component unmounts quickly after starting fetch
  // 2. Abort happens after HTTP headers sent but before body completes
  // 3. Server receives partial/empty body → 400 error
  //
  // Instead, we let the fetch complete naturally:
  // - The callback refs (onStreamCompleteRef) allow callbacks to fire even after unmount
  // - Store deduplication (triggeredPreSearchRounds) prevents duplicate fetches
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
  // ✅ RESUMABLE STREAMS: Now also triggers for STREAMING status to attempt resumption
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

    // ✅ RESUMABLE STREAMS: Trigger for both PENDING and STREAMING status
    // PENDING: Start new stream
    // STREAMING: Attempt to resume from KV buffer (backend handles this automatically)
    // COMPLETE/FAILED: No action needed
    if (preSearch.status !== AnalysisStatuses.PENDING && preSearch.status !== AnalysisStatuses.STREAMING) {
      return;
    }

    // ✅ ZUSTAND PATTERN: Mark store BEFORE starting stream to prevent duplicates
    // This signals to provider that PreSearchStream is handling this pre-search
    // Without this, provider's pendingMessage effect may also try to execute
    // @see ChatStoreProvider pendingMessage effect
    markPreSearchTriggered(preSearch.roundNumber);

    const abortController = new AbortController();
    // Store controller for cleanup - we use AbortController API for fetch-based streaming
    abortControllerRef.current = abortController;

    // Track partial data accumulation using Maps to avoid sparse arrays
    const queriesMap = new Map<number, PreSearchDataPayload['queries'][number]>();
    const resultsMap = new Map<number, PreSearchDataPayload['results'][number]>();

    // ✅ POST RETRY CONFIG: Like analyze component, retry POST before falling back to LIST polling
    const MAX_POST_RETRIES = 5;
    const DEFAULT_RETRY_DELAY_MS = 2000;
    let postRetryCount = 0;

    // Start fetch-based SSE stream (backend uses POST)
    // ✅ RETRY LOGIC: Recursive function that retries POST on 202 response
    const startStream = async (): Promise<void> => {
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

        // ✅ TYPE-SAFE: Use service instead of direct fetch
        const response = await executePreSearchStreamService({
          param: {
            threadId,
            roundNumber: String(preSearch.roundNumber),
          },
          json: {
            userQuery: preSearch.userQuery,
          },
        });

        // ✅ RESUMABLE STREAMS: Handle various response codes
        // 200: Normal stream or resumed stream
        // 202: Stream is active but no buffer yet - RETRY POST (like analyze component)
        //      BUT if data.status is 'complete', the pre-search finished during our retries!
        // 409: Conflict (legacy - should use 202 now)
        if (response.status === 202) {
          // Parse response body to check status and get retry delay
          let retryDelayMs = DEFAULT_RETRY_DELAY_MS;
          type ResponseData = {
            data?: {
              status?: string;
              searchData?: PreSearchDataPayload;
              retryAfterMs?: number;
            };
          };
          let responseData: ResponseData | undefined;

          try {
            responseData = await response.json() as ResponseData;
            if (responseData?.data?.retryAfterMs) {
              retryDelayMs = responseData.data.retryAfterMs;
            }
          } catch {
            // Use default delay if body parsing fails
          }

          // ✅ CRITICAL FIX: Check if pre-search completed during our retries
          // Backend returns 202 with status:'complete' and searchData when pre-search finishes
          // We must detect this and call onStreamComplete instead of continuing to retry
          if (responseData?.data?.status === AnalysisStatuses.COMPLETE && responseData.data.searchData) {
            // Pre-search is complete! Update UI and call completion callback
            const completedSearchData = responseData.data.searchData;
            // eslint-disable-next-line react-dom/no-flush-sync -- Intentional for immediate UI update
            flushSync(() => {
              setPartialSearchData(completedSearchData);
              isAutoRetryingOnFalseRef.current();
            });
            onStreamCompleteRef.current?.(completedSearchData);
            return;
          }

          postRetryCount++;

          // ✅ AUTO-RETRY: Show user we're retrying the stream request (like analyze)
          // Use flushSync to force immediate re-render so user sees "Auto-retrying..." text
          // Without flushSync, React 18 batches the update and user sees "Searching..." during retries
          // eslint-disable-next-line react-dom/no-flush-sync -- Intentional for immediate UI feedback
          flushSync(() => {
            isAutoRetryingOnTrueRef.current();
          });

          if (postRetryCount <= MAX_POST_RETRIES) {
            // Debug log removed - only console.error allowed by ESLint config

            // Wait and retry the POST request (like analyze component)
            // eslint-disable-next-line react-web-api/no-leaked-timeout -- Promise resolves when timeout fires; no cleanup needed for awaited delays
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));

            // Recursive retry - this makes the stream request again
            if (!abortController.signal.aborted) {
              return startStream();
            }
            return;
          }

          // Max retries exceeded - fall back to LIST polling
          console.error('[PreSearchStream] Max POST retries exceeded, falling back to LIST polling', {
            attempts: postRetryCount,
            preSearchId: preSearch.id,
          });
          is409Conflict.onTrue();
          return;
        }

        if (!response.ok) {
          if (response.status === 409) {
            is409Conflict.onTrue();
            return;
          }
          const errorMsg = `Pre-search failed: ${response.statusText}`;
          throw new Error(errorMsg);
        }

        // ✅ SUCCESS: Clear auto-retry state if it was set
        isAutoRetryingOnFalseRef.current();

        // ✅ IDEMPOTENT RESPONSE: Handle JSON response for already-complete pre-searches
        // When the backend sees a pre-search is already COMPLETE, it returns JSON instead of SSE
        // Check Content-Type to distinguish between SSE stream and JSON response
        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
          // Pre-search is already complete - parse JSON and set data directly
          // ✅ TYPE-SAFE: Use Zod validation instead of force cast
          const rawJson = await response.json();
          const parseResult = PreSearchResponseSchema.safeParse(rawJson);
          const searchData = parseResult.success ? parseResult.data.data?.searchData : undefined;
          if (searchData) {
            // eslint-disable-next-line react-dom/no-flush-sync -- Intentional for immediate UI update
            flushSync(() => {
              setPartialSearchData(searchData);
            });
            onStreamCompleteRef.current?.(searchData);
          }
          return;
        }

        // Parse SSE stream manually
        // Note: Response may have X-Resumed-From-Buffer header if stream was resumed
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
        // ✅ PROGRESSIVE UI UPDATE: Uses flushSync + frame yield for immediate DOM updates
        // flushSync commits React updates, but browser may batch paints together
        // Adding frame yield after flushSync ensures browser actually paints between events
        const processEvent = async (event: string, data: string) => {
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
              // ✅ flushSync forces React to update DOM immediately
              // This makes each query appear as it streams in
              // eslint-disable-next-line react-dom/no-flush-sync -- Intentional for progressive streaming UI
              flushSync(() => {
                setPartialSearchData({ queries, results });
              });
              // ✅ Frame yield: Give browser time to paint after React commit
              // Without this, rapid flushSync calls may have their paints batched together
              await new Promise(resolve => requestAnimationFrame(resolve));
            } else if (event === PreSearchSseEvents.RESULT) {
              const resultData = JSON.parse(data);
              resultsMap.set(resultData.index, {
                query: resultData.query,
                answer: resultData.answer,
                results: resultData.results || [],
                responseTime: resultData.responseTime,
                index: resultData.index, // ✅ Store index for matching
              });
              // Convert Maps to arrays sorted by index
              const queries = Array.from(queriesMap.values()).sort((a, b) => a.index - b.index);
              const results = Array.from(resultsMap.values());
              // ✅ flushSync forces React to update DOM immediately
              // This makes each result appear as it streams in
              // eslint-disable-next-line react-dom/no-flush-sync -- Intentional for progressive streaming UI
              flushSync(() => {
                setPartialSearchData({ queries, results });
              });
              // ✅ Frame yield: Give browser time to paint after React commit
              await new Promise(resolve => requestAnimationFrame(resolve));
            } else if (event === PreSearchSseEvents.DONE) {
              const finalData = JSON.parse(data);
              // eslint-disable-next-line react-dom/no-flush-sync -- Intentional for progressive streaming UI
              flushSync(() => {
                setPartialSearchData(finalData);
              });
              onStreamCompleteRef.current?.(finalData);
            } else if (event === PreSearchSseEvents.FAILED) {
              const errorData = JSON.parse(data);
              // eslint-disable-next-line react-dom/no-flush-sync -- Intentional for progressive streaming UI
              flushSync(() => {
                setError(new Error(errorData.error || 'Pre-search failed'));
              });
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
              // Process complete event (await for frame yield to work)
              await processEvent(currentEvent, currentData);

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
          await processEvent(currentEvent, currentData);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return; // Normal abort, don't show error
        }

        // ✅ AUTO-RETRY: Automatically retry stream failures
        // Stream failures often succeed on retry (transient network/model issues)
        // This is expected during page refresh recovery - don't alarm with console.error
        if (retryCountRef.current < MAX_STREAM_RETRIES) {
          retryCountRef.current++;

          // Show "Retrying..." UI to user instead of raw error
          isAutoRetrying.onTrue();

          // Clear any existing timeout
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }

          // Schedule retry after interval
          retryTimeoutRef.current = setTimeout(() => {
            // ✅ ZUSTAND PATTERN: Use store to clear tracking for retry
            clearPreSearchTracking(preSearch.roundNumber);

            // Retry by calling startStream again
            startStream().catch(() => {
              // Retry failed, error state will be handled by next catch
            });
          }, RETRY_INTERVAL_MS);
          return; // Don't set error yet - retry in progress
        }

        // Max retries exceeded - show error
        retryCountRef.current = 0; // Reset for next attempt
        isAutoRetrying.onFalse(); // Clear retrying state
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
  }, [preSearch.id, preSearch.roundNumber, threadId, preSearch.userQuery, providerTriggered, store, markPreSearchTriggered, clearPreSearchTracking]);

  // ✅ POLLING DEDUPLICATION: Prevent multiple concurrent polling loops
  const isPollingRef = useRef(false);

  // ✅ POLLING RECOVERY: Handle 409 Conflict (Stream already active)
  // If we reconnect to a stream that's already running (e.g. after reload),
  // we poll the status until it completes, then sync the data.
  //
  // ✅ STUCK STREAM RECOVERY: If polling sees STREAMING for too long (30s),
  // the original stream likely got interrupted by the page refresh.
  // In this case, we clear deduplication flags and trigger a fresh POST request.
  useEffect(() => {
    if (!is409Conflict.value)
      return;

    // ✅ DEDUPLICATION: Skip if already polling
    if (isPollingRef.current) {
      return;
    }
    isPollingRef.current = true;

    let timeoutId: NodeJS.Timeout;
    let isMounted = true;
    const pollingStartTime = Date.now();
    const POLLING_TIMEOUT_MS = 30_000; // 30 seconds - if still STREAMING after this, restart

    // ✅ AUTO-RETRY UI: Show user that we're auto-retrying
    // Use flushSync to force immediate re-render so user sees "Auto-retrying..." text
    // eslint-disable-next-line react-dom/no-flush-sync -- Intentional for immediate UI feedback
    flushSync(() => {
      isAutoRetryingOnTrueRef.current();
    });

    const poll = async () => {
      try {
        // ✅ TYPE-SAFE: Use service instead of direct fetch
        const result = await getThreadPreSearchesService({ param: { id: threadId } });

        if (!result.data?.items) {
          console.error('[PreSearchStream] Invalid API response: missing items');
          // Continue polling on validation error
          if (isMounted) {
            timeoutId = setTimeout(poll, 2000);
          }
          return;
        }

        const preSearchList = result.data.items;
        const current = preSearchList.find(ps => ps.id === preSearch.id);

        if (current) {
          if (current.status === AnalysisStatuses.COMPLETE && current.searchData) {
            const completedData = current.searchData;
            // eslint-disable-next-line react-dom/no-flush-sync -- Intentional for progressive polling UI
            flushSync(() => {
              setPartialSearchData(completedData);
            });
            onStreamCompleteRef.current?.(completedData);
            if (isMounted) {
              isPollingRef.current = false;
              is409ConflictOnFalseRef.current(); // Stop polling
              isAutoRetryingOnFalseRef.current(); // Clear auto-retry state
            }
            return;
          } else if (current.status === AnalysisStatuses.FAILED) {
            // eslint-disable-next-line react-dom/no-flush-sync -- Intentional for progressive polling UI
            flushSync(() => {
              setError(new Error(current.errorMessage || 'Pre-search failed'));
            });
            if (isMounted) {
              isPollingRef.current = false;
              is409ConflictOnFalseRef.current(); // Stop polling
              isAutoRetryingOnFalseRef.current(); // Clear auto-retry state
            }
            return;
          } else if (current.status === AnalysisStatuses.STREAMING || current.status === AnalysisStatuses.PENDING) {
            // ✅ STUCK STREAM DETECTION: Check if we've been polling for too long
            // This happens in local dev when:
            // 1. User refreshes during streaming
            // 2. Backend has no KV buffer (returns 202)
            // 3. Original stream was interrupted but DB still shows STREAMING
            // After 30 seconds, the original stream is definitely gone - restart
            const elapsedMs = Date.now() - pollingStartTime;
            if (elapsedMs > POLLING_TIMEOUT_MS) {
              console.error('[PreSearchStream] Polling timeout - stream appears stuck, will retry', {
                preSearchId: preSearch.id,
                status: current.status,
                elapsedMs,
                timeoutMs: POLLING_TIMEOUT_MS,
              });

              // ✅ ZUSTAND PATTERN: Use store to clear tracking for fresh POST request
              clearPreSearchTracking(preSearch.roundNumber);

              // Clear conflict state - this will stop this polling effect
              // and the main SSE effect will re-trigger due to status still being STREAMING
              if (isMounted) {
                isPollingRef.current = false;
                is409ConflictOnFalseRef.current();
                isAutoRetryingOnFalseRef.current();
              }
              return;
            }

            // Show partial data if available
            if (current.searchData) {
              // eslint-disable-next-line react-dom/no-flush-sync -- Intentional for progressive polling UI
              flushSync(() => {
                setPartialSearchData(current.searchData!);
              });
            }
          }
          // Continue polling for STREAMING or PENDING
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
      isPollingRef.current = false;
      clearTimeout(timeoutId);
      isAutoRetryingOnFalseRef.current(); // Clear auto-retry state on cleanup
    };
  }, [is409Conflict.value, threadId, preSearch.id, preSearch.roundNumber, clearPreSearchTracking]);

  // ✅ REMOVED: Separate STREAMING polling effect is no longer needed
  // The main SSE effect now handles STREAMING status via stream resumption
  // Backend returns resumed stream (200 with X-Resumed-From-Buffer header) or 202 (poll)
  // 202 triggers the 409 conflict polling mechanism above

  // ✅ ZUSTAND PATTERN: Mark completed/failed pre-searches to prevent re-triggering
  // Use store's synchronous getState() check to avoid unnecessary effect re-runs
  // Do NOT mark STREAMING - that would prevent useEffect from triggering resumption
  const currentState = store?.getState();
  const roundAlreadyMarked = currentState?.hasPreSearchBeenTriggered(preSearch.roundNumber) ?? false;

  if (
    !roundAlreadyMarked
    && (preSearch.status === AnalysisStatuses.COMPLETE
      || preSearch.status === AnalysisStatuses.FAILED)
  ) {
    markPreSearchTriggered(preSearch.roundNumber);
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

  // ✅ Determine loading state for AnimatePresence
  const isPendingWithNoData = (preSearch.status === AnalysisStatuses.PENDING || preSearch.status === AnalysisStatuses.STREAMING) && !hasData;

  // Don't render if no data and not pending/streaming
  if (!hasData && !isPendingWithNoData) {
    return null;
  }

  // ✅ Safe access with optional chaining when displayData could be undefined
  const queries = displayData?.queries ?? [];
  const results = displayData?.results ?? [];
  const analysis = displayData?.analysis;
  const totalResults = displayData?.totalResults;
  const totalTime = displayData?.totalTime;
  const validQueries = queries.filter((q): q is NonNullable<typeof q> => q != null);
  const validResults = results.filter((r): r is NonNullable<typeof r> => r != null);

  const isStreamingNow = preSearch.status === AnalysisStatuses.STREAMING;

  // ✅ SIMPLIFIED: No easing animations - sections appear instantly
  // Only the typing effect inside items is animated

  if (isPendingWithNoData || isAutoRetrying.value) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <TextShimmer>{isAutoRetrying.value ? t('autoRetryingSearch') : t('pendingSearch')}</TextShimmer>
      </div>
    );
  }

  return (
    <AnimatedStreamingList groupId={`pre-search-stream-${preSearch.id}`} className="space-y-4">
      {/* Search Summary - only show if we have analysis text */}
      {analysis && (
        <AnimatedStreamingItem
          key="search-config"
          itemKey="search-config"
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

        // ✅ FIX: Match by index instead of query text to ensure results show progressively
        // Query text matching can fail due to normalization or casing differences
        const searchResult = validResults.find(r => r?.index === query?.index)
          || validResults.find(r => r?.query === query?.query); // Fallback to text match
        const hasResult = !!searchResult;
        const uniqueKey = `query-${query?.query || queryIndex}`;
        const hasResults = hasResult && searchResult.results && searchResult.results.length > 0;

        return (
          <AnimatedStreamingItem
            key={uniqueKey}
            itemKey={uniqueKey}
          >
            <div className="space-y-2">
              {/* Query header with rationale and depth */}
              <div className="flex items-start gap-2">
                <Search className="size-4 text-muted-foreground mt-0.5 flex-shrink-0" />
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
                          <Zap className="size-2.5 mr-0.5" />
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
                  {/* Result count */}
                  {hasResult && (
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {searchResult.results.length}
                      {' '}
                      {searchResult.results.length === 1 ? t('source') : t('sources')}
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

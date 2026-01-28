/**
 * Entity Subscription Hooks - Backend-First Streaming Architecture
 *
 * Pure subscriber hooks for entity-specific streams.
 * Per FLOW_DOCUMENTATION.md: Frontend is pure subscriber, backend is orchestrator/publisher.
 *
 * These hooks:
 * - Subscribe to entity-specific SSE endpoints
 * - Handle 202 Accepted (waiting) with automatic retry
 * - Handle 200 OK JSON (complete/error status)
 * - Handle 200 OK SSE (active streaming)
 * - Support resumption via lastSeq tracking
 *
 * ✅ FIX P6: Network Request Optimizations
 * - Request deduplication via activeRequestsMap
 * - Global connection limit (MAX_CONCURRENT_CONNECTIONS)
 * - Visibility change handling for tab switching
 * - Proper cleanup on unmount
 */

import type { EntityPhase } from '@roundtable/shared/enums';
import { EntityPhases, EntitySubscriptionStatuses } from '@roundtable/shared/enums';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { rlog } from '@/lib/utils/dev-logger';
import type { EntitySubscriptionResponse } from '@/services/api';
import {
  subscribeToModeratorStreamService,
  subscribeToParticipantStreamService,
  subscribeToPreSearchStreamService,
} from '@/services/api';

// Re-export for backwards compatibility
export type { EntityPhase } from '@roundtable/shared/enums';

// ============================================================================
// TYPES
// ============================================================================

export type EntitySubscriptionState = {
  /** Current status of the subscription */
  status: 'idle' | 'waiting' | 'streaming' | 'complete' | 'error' | 'disabled';
  /** Last sequence number received */
  lastSeq: number;
  /** Error message if status is 'error' */
  errorMessage?: string;
  /** Whether currently streaming */
  isStreaming: boolean;
  /** Round number this state belongs to - used to detect stale completions */
  roundNumber: number;
};

export type EntitySubscriptionCallbacks = {
  /** Called when a text chunk is received */
  onTextChunk?: (text: string, seq: number) => void;
  /** Called when the stream completes */
  onComplete?: (lastSeq: number) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** Called when status changes */
  onStatusChange?: (status: EntitySubscriptionState['status']) => void;
  /**
   * Called for presearch-specific events (query, result, start, complete, done)
   *
   * DESIGN NOTE: `data: unknown` is intentional here - this is a PROTOCOL BOUNDARY
   * where SSE data arrives from the server as JSON that must be parsed.
   * The PreSearchSSEEvent schemas are defined on the API side; consumers should
   * validate the data shape based on eventType before use.
   */
  onPreSearchEvent?: (eventType: string, data: unknown) => void;
};

type UseEntitySubscriptionOptions = {
  threadId: string;
  roundNumber: number;
  phase: EntityPhase;
  participantIndex?: number;
  enabled?: boolean;
  callbacks?: EntitySubscriptionCallbacks;
  /** Initial lastSeq for resumption */
  initialLastSeq?: number;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_RETRY_DELAY = 500;
const MAX_RETRY_ATTEMPTS = 60; // 30 seconds with 500ms delay

// ============================================================================
// ✅ FIX P6: GLOBAL CONNECTION MANAGEMENT
// ============================================================================

/**
 * Maximum concurrent SSE connections to prevent browser connection exhaustion.
 * HTTP/1.1 browsers typically limit to 6 connections per domain.
 * We stay under with 4 to leave headroom for other requests.
 */
const MAX_CONCURRENT_CONNECTIONS = 4;

/** Global counter for active SSE connections */
let globalActiveConnections = 0;

/** Map of active requests for deduplication: key → AbortController */
const activeRequestsMap = new Map<string, AbortController>();

/**
 * Check if we can start a new connection without exceeding the limit
 */
function canStartConnection(): boolean {
  return globalActiveConnections < MAX_CONCURRENT_CONNECTIONS;
}

/**
 * Increment the global connection counter and log
 */
function incrementConnections(entity: string, roundNumber: number): void {
  globalActiveConnections++;
  rlog.stream('start', `${entity} r${roundNumber} conn started (active: ${globalActiveConnections})`);
}

/**
 * Decrement the global connection counter and log
 */
function decrementConnections(entity: string, roundNumber: number): void {
  globalActiveConnections = Math.max(0, globalActiveConnections - 1);
  rlog.stream('end', `${entity} r${roundNumber} conn ended (active: ${globalActiveConnections})`);
}

/**
 * Generate a unique key for request deduplication
 */
function getRequestKey(threadId: string, roundNumber: number, phase: EntityPhase, participantIndex?: number): string {
  const participantSuffix = participantIndex !== undefined ? `:p${participantIndex}` : '';
  return `${threadId}:r${roundNumber}:${phase}${participantSuffix}`;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Hook for subscribing to entity-specific streams.
 *
 * Handles all response types:
 * - 202 Accepted: Polls with retryAfter delay
 * - 200 JSON (complete/error/disabled): Returns status
 * - 200 SSE: Streams chunks and calls onTextChunk
 */
export function useEntitySubscription({
  callbacks,
  enabled = true,
  initialLastSeq = 0,
  participantIndex,
  phase,
  roundNumber,
  threadId,
}: UseEntitySubscriptionOptions) {
  const [state, setState] = useState<EntitySubscriptionState>({
    errorMessage: undefined,
    isStreaming: false,
    lastSeq: initialLastSeq,
    roundNumber,
    status: 'idle',
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const lastSeqRef = useRef(initialLastSeq);
  const prevRoundNumberRef = useRef(roundNumber);
  // BUG FIX: Track definitive completion to prevent retry race condition
  // When 'done' event is received, this prevents any pending setTimeout retries from firing
  const isCompleteRef = useRef(false);

  // ✅ FIX P6: Track subscription key to prevent re-subscription for same params
  // This prevents unnecessary subscription restarts when enabled toggles
  const hasSubscribedKeyRef = useRef<string | null>(null);

  // FIX: Track dispatched presearch events to prevent re-dispatch at SSE parsing level
  // When incomplete JSON is buffered and completed, the event could be processed twice.
  // Key format: `${roundNumber}:${eventType}:${index}` (e.g., "0:query:0", "0:result:1")
  // Events without index (start, complete, done) use just `${roundNumber}:${eventType}` as key
  // This ref persists across 202 retries but is reset when round number changes
  const dispatchedPresearchEventsRef = useRef<Set<string>>(new Set());

  // Reset lastSeq when round number changes to prevent stale sequence numbers
  // This fixes the round 2+ submission failure where subscriptions detect "complete"
  // instantly because they're using stale lastSeq values from the previous round
  // Using useLayoutEffect to ensure state is reset synchronously before render
  useLayoutEffect(() => {
    if (prevRoundNumberRef.current !== roundNumber) {
      rlog.stream(
        'check',
        `${phase} r${prevRoundNumberRef.current}→r${roundNumber} resetting lastSeq from ${lastSeqRef.current} to 0`,
      );
      lastSeqRef.current = 0;
      retryCountRef.current = 0;
      isCompleteRef.current = false; // BUG FIX: Reset completion flag for new round
      hasSubscribedKeyRef.current = null; // ✅ FIX P6: Reset subscription key for new round
      dispatchedPresearchEventsRef.current.clear(); // FIX: Reset dispatched events for new round
      setState(prev => ({
        ...prev,
        lastSeq: 0,
        roundNumber, // Track which round this state belongs to
        status: 'idle',
      }));
      prevRoundNumberRef.current = roundNumber;
    }
  }, [roundNumber, phase]);

  // Update ref when lastSeq changes
  useEffect(() => {
    lastSeqRef.current = state.lastSeq;
  }, [state.lastSeq]);

  // NOTE: Cleanup is handled in the main subscription effect (line ~517)
  // Having duplicate cleanup effects can cause timing issues with abort

  // Store callbacks in ref to avoid stale closures
  // When callbacks prop changes mid-stream, the in-flight subscription would use stale callbacks
  // By using a ref, we always call the latest callbacks
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const subscribe = useCallback(async () => {
    if (!enabled || !threadId) {
      return;
    }

    // BUG FIX: Don't restart subscription if already completed for this round
    // This prevents the race condition where callback changes cause subscription to restart
    // after onComplete has already been called (e.g., when presearchReady state changes)
    if (isCompleteRef.current) {
      rlog.stream('check', `${phase} r${roundNumber} subscription skip - already complete`);
      return;
    }

    const logPrefix = `${phase} r${roundNumber}${participantIndex !== undefined ? ` p${participantIndex}` : ''}`;

    // ✅ FIX P6: Request deduplication - check for existing active request
    const requestKey = getRequestKey(threadId, roundNumber, phase, participantIndex);
    if (activeRequestsMap.has(requestKey)) {
      rlog.stream('skip', `${logPrefix} duplicate request blocked (already active)`);
      return;
    }

    // ✅ FIX P6: Connection limit guard - wait if at capacity
    if (!canStartConnection()) {
      rlog.stream('skip', `${logPrefix} waiting for connection slot (active: ${globalActiveConnections})`);
      // Don't block, just return - the stagger mechanism in use-round-subscription
      // will naturally retry when a slot becomes available
      return;
    }

    // Abort any existing subscription
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // ✅ FIX P6: Track this request for deduplication
    activeRequestsMap.set(requestKey, controller);

    // ✅ FIX P6: Increment connection counter
    incrementConnections(phase, roundNumber);

    // Helper to clean up connection tracking on any exit path
    const cleanupConnection = () => {
      activeRequestsMap.delete(requestKey);
      decrementConnections(phase, roundNumber);
    };

    rlog.stream('start', `${logPrefix} subscription lastSeq=${lastSeqRef.current}`);

    setState(prev => ({
      ...prev,
      isStreaming: false,
      status: 'waiting',
    }));
    callbacksRef.current?.onStatusChange?.('waiting');

    try {
      // Select the appropriate service based on phase
      let response: Response;

      switch (phase) {
        case 'presearch':
          response = await subscribeToPreSearchStreamService(
            { lastSeq: lastSeqRef.current, roundNumber, threadId },
            { signal: controller.signal },
          );
          break;

        case 'participant':
          if (participantIndex === undefined) {
            throw new Error('participantIndex required for participant phase');
          }
          response = await subscribeToParticipantStreamService(
            { lastSeq: lastSeqRef.current, participantIndex, roundNumber, threadId },
            { signal: controller.signal },
          );
          break;

        case 'moderator':
          response = await subscribeToModeratorStreamService(
            { lastSeq: lastSeqRef.current, roundNumber, threadId },
            { signal: controller.signal },
          );
          break;

        default:
          throw new Error(`Unknown phase: ${phase}`);
      }

      // Handle 202 Accepted (waiting)
      if (response.status === 202) {
        const data = await response.json() as { data: EntitySubscriptionResponse };
        const retryAfter = data.data?.retryAfter ?? DEFAULT_RETRY_DELAY;

        rlog.stream('check', `${logPrefix} 202 waiting, retry after ${retryAfter}ms`);

        // ✅ FIX P6: Clean up current connection before scheduling retry
        // The retry will create a new connection with its own tracking
        cleanupConnection();

        retryCountRef.current++;
        // BUG FIX: Check isCompleteRef to prevent retries after 'done' event
        // Race condition: setTimeout from 202 polling can fire AFTER 'done' event completes the stream
        if (retryCountRef.current < MAX_RETRY_ATTEMPTS && !isCompleteRef.current) {
          setTimeout(() => {
            // BUG FIX: Double-check completion inside setTimeout callback
            // The 'done' event may have been received between scheduling and execution
            if (!controller.signal.aborted && !isCompleteRef.current) {
              subscribe();
            }
          }, retryAfter);
        } else if (isCompleteRef.current) {
          // Stream already completed via 'done' event - no error, just exit silently
          rlog.stream('check', `${logPrefix} 202 retry skipped - stream already complete`);
        } else {
          rlog.stuck('sub', `${logPrefix} max retries exceeded`);
          setState(prev => ({
            ...prev,
            errorMessage: 'Max retries exceeded waiting for stream',
            isStreaming: false,
            status: 'error',
          }));
          callbacksRef.current?.onStatusChange?.('error');
          callbacksRef.current?.onError?.(new Error('Max retries exceeded waiting for stream'));
        }
        return;
      }

      // Reset retry count on successful connection
      retryCountRef.current = 0;

      // Check content type to determine response format
      const contentType = response.headers.get('content-type') || '';

      // Handle JSON response (complete/error/disabled)
      if (contentType.includes('application/json')) {
        const data = await response.json() as { data: EntitySubscriptionResponse };
        const result = data.data;

        rlog.stream('check', `${logPrefix} JSON response status=${result?.status}`);

        if (result?.status === EntitySubscriptionStatuses.COMPLETE) {
          // Mark complete to prevent any pending retries
          // Guard against concurrent completion from another execution
          if (isCompleteRef.current) {
            return;
          }
          isCompleteRef.current = true;
          setState(prev => ({
            ...prev,
            isStreaming: false,
            lastSeq: result.lastSeq ?? prev.lastSeq,
            status: 'complete',
          }));
          callbacksRef.current?.onStatusChange?.('complete');
          callbacksRef.current?.onComplete?.(result.lastSeq ?? lastSeqRef.current);
        } else if (result?.status === EntitySubscriptionStatuses.DISABLED) {
          setState(prev => ({
            ...prev,
            errorMessage: result.message,
            isStreaming: false,
            status: 'disabled',
          }));
          callbacksRef.current?.onStatusChange?.('disabled');
        } else if (result?.status === EntitySubscriptionStatuses.ERROR) {
          setState(prev => ({
            ...prev,
            errorMessage: 'Stream encountered an error',
            isStreaming: false,
            lastSeq: result.lastSeq ?? prev.lastSeq,
            status: 'error',
          }));
          callbacksRef.current?.onStatusChange?.('error');
          callbacksRef.current?.onError?.(new Error('Stream encountered an error'));
        }
        // ✅ FIX P6: Clean up connection tracking
        cleanupConnection();
        return;
      }

      // Handle SSE stream (active)
      if (contentType.includes('text/event-stream') || contentType.includes('text/plain')) {
        rlog.stream('start', `${logPrefix} SSE stream active`);

        setState(prev => ({
          ...prev,
          isStreaming: true,
          status: 'streaming',
        }));
        callbacksRef.current?.onStatusChange?.('streaming');

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let currentSeq = lastSeqRef.current;
        let textDeltaCount = 0;
        // Track SSE event type for presearch events (format: "event: query\ndata: {...}")
        let currentEventType: string | null = null;
        // FIX 2: Buffer incomplete JSON lines for chunked SSE data
        // Large JSON payloads can be split across multiple SSE chunks
        const MAX_JSON_BUFFER_SIZE = 512 * 1024; // 512KB max buffer
        let jsonBuffer = '';

        while (true) {
          const { done, value } = await reader.read();

          // Debug logging for moderator stream end detection
          if (phase === 'moderator') {
            rlog.stream('check', `${logPrefix} reader.read() done=${done} valueLen=${value?.length ?? 0}`);
          }

          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const rawLine of lines) {
            if (!rawLine.trim()) {
              continue;
            }

            // Debug: Log all lines for moderator to see what format the stream uses
            if (phase === 'moderator') {
              rlog.stream('check', `${logPrefix} line: ${rawLine.slice(0, 80)}${rawLine.length > 80 ? '...' : ''}`);
            }

            // Track SSE event type lines (e.g., "event: query")
            if (rawLine.startsWith('event: ')) {
              currentEventType = rawLine.slice(7).trim();
              rlog.presearch('event-type', `${logPrefix} type=${currentEventType} phase=${phase}`);
              continue;
            }

            // Strip SSE framing
            const line = rawLine.startsWith('data: ') ? rawLine.slice(6) : rawLine;

            // Count ALL meaningful events for seq tracking (not just text)
            // This ensures frontend seq matches backend chunk count
            const isAiSdkEvent = line.startsWith('0:') || line.startsWith('8:') || line.startsWith('e:') || line.startsWith('d:');
            const isJsonEvent = line.startsWith('{') || jsonBuffer.length > 0;

            // FIX 2: Handle JSON buffering for chunked presearch events
            // When we have a buffer or start of JSON, try to accumulate and parse
            if (phase === 'presearch' && currentEventType && isJsonEvent) {
              // Append to buffer
              jsonBuffer += line;

              // Try to parse the accumulated buffer
              try {
                const eventData = JSON.parse(jsonBuffer);

                // FIX: Deduplicate presearch events at SSE parsing level
                // Generate unique key based on eventType and index (if present)
                // This prevents re-dispatch when buffered JSON completes
                const eventIndex = typeof eventData.index === 'number' ? eventData.index : null;
                const eventKey = eventIndex !== null
                  ? `${roundNumber}:${currentEventType}:${eventIndex}`
                  : `${roundNumber}:${currentEventType}`;

                if (dispatchedPresearchEventsRef.current.has(eventKey)) {
                  rlog.race('sse-dupe-skip', `${logPrefix} ${eventKey} already dispatched - skipping`);
                  // Clear buffer and event type, but don't dispatch again
                  currentEventType = null;
                  jsonBuffer = '';
                  continue;
                }
                dispatchedPresearchEventsRef.current.add(eventKey);

                // Success - process the complete JSON
                currentSeq++;
                lastSeqRef.current = currentSeq;

                rlog.presearch('event-dispatch', `${logPrefix} dispatching type=${currentEventType}${jsonBuffer.length > 1000 ? ` (${jsonBuffer.length} chars buffered)` : ''}`);
                callbacksRef.current?.onPreSearchEvent?.(currentEventType, eventData);

                // FIX 1: Detect 'done' event as completion signal for presearch
                // The 'done' event is a data event, not a stream end signal.
                // Without this, the subscription keeps polling with 202 after stream ends.
                if (currentEventType === 'done') {
                  // BUG FIX: Set completion flag BEFORE any async operations
                  // This prevents pending setTimeout retries from 202 polling from firing
                  isCompleteRef.current = true;
                  rlog.presearch('done-complete', `${logPrefix} 'done' event received, marking complete`);

                  setState(prev => ({
                    ...prev,
                    isStreaming: false,
                    lastSeq: currentSeq,
                    status: 'complete',
                  }));
                  callbacksRef.current?.onStatusChange?.('complete');
                  callbacksRef.current?.onComplete?.(currentSeq);

                  // ✅ FIX P6: Clean up connection tracking
                  cleanupConnection();

                  // Small delay before cancel to ensure all state updates flush
                  // Abort-aware wait: clears timeout and resolves early if signal aborts
                  if (!controller.signal.aborted) {
                    await new Promise<void>((resolve) => {
                      const timeoutId = setTimeout(resolve, 50);
                      const abortHandler = () => {
                        clearTimeout(timeoutId);
                        resolve();
                      };
                      controller.signal.addEventListener('abort', abortHandler, { once: true });
                    });
                  }
                  // Cancel reader with catch to prevent unhandled rejection on abort
                  if (!controller.signal.aborted) {
                    reader.cancel().catch(() => {
                      // Ignore cancel errors - expected during abort
                    });
                  }
                  return; // Exit read loop
                }

                currentEventType = null; // Reset after processing
                jsonBuffer = ''; // Clear buffer after successful parse
                // Natural pacing: SSE chunk arrival provides gradual delivery
                // No artificial delays - React handles state batching naturally
              } catch (parseError) {
                // Check if it's an incomplete JSON error (unterminated string, unexpected end)
                const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
                const isIncomplete = errorMsg.includes('Unterminated')
                  || errorMsg.includes('Unexpected end')
                  || errorMsg.includes('JSON at position');

                if (isIncomplete) {
                  // Check buffer size limit to prevent memory issues
                  if (jsonBuffer.length > MAX_JSON_BUFFER_SIZE) {
                    rlog.presearch('json-buffer-overflow', `${logPrefix} buffer exceeded ${MAX_JSON_BUFFER_SIZE} bytes, clearing`);
                    jsonBuffer = '';
                    currentEventType = null;
                  } else {
                    // Keep buffering, wait for more data
                    rlog.presearch('json-buffer', `${logPrefix} buffering incomplete JSON (${jsonBuffer.length} chars) for type=${currentEventType}`);
                  }
                } else {
                  // Other parse error - log and clear buffer
                  rlog.presearch('event-error', `${logPrefix} parse error for type=${currentEventType}: ${errorMsg}`);
                  jsonBuffer = '';
                  currentEventType = null;
                }
              }
              continue; // Skip AI SDK handling for presearch events
            }

            if (isAiSdkEvent) {
              currentSeq++;
              lastSeqRef.current = currentSeq;

              // Detect AI SDK finish events and mark subscription as complete immediately
              // e: events contain finishReason (e.g., e:{"finishReason":"stop"})
              // d: events are finish data (e.g., d:{"finishReason":"stop","usage":{...}})
              if (line.startsWith('e:') || line.startsWith('d:')) {
                try {
                  const finishData = JSON.parse(line.slice(2));
                  rlog.stream('check', `${logPrefix} e:/d: event parsed: ${JSON.stringify(finishData).slice(0, 100)}`);
                  if (finishData.finishReason) {
                    rlog.stream('check', `🏁 ${logPrefix} finish event detected (${line.slice(0, 2)}), reason=${finishData.finishReason}`);

                    // Set completion flag BEFORE any async operations to prevent retry race conditions
                    isCompleteRef.current = true;

                    setState(prev => ({
                      ...prev,
                      isStreaming: false,
                      lastSeq: currentSeq,
                      status: 'complete',
                    }));
                    callbacksRef.current?.onStatusChange?.('complete');
                    rlog.stream('check', `🏁 ${logPrefix} about to call onComplete, callback exists: ${!!callbacksRef.current?.onComplete}`);
                    callbacksRef.current?.onComplete?.(currentSeq);

                    // ✅ FIX P6: Clean up connection tracking
                    cleanupConnection();

                    // Small delay before cancel to ensure all state updates flush
                    // Abort-aware wait: clears timeout and resolves early if signal aborts
                    if (!controller.signal.aborted) {
                      await new Promise<void>((resolve) => {
                        const timeoutId = setTimeout(resolve, 50);
                        const abortHandler = () => {
                          clearTimeout(timeoutId);
                          resolve();
                        };
                        controller.signal.addEventListener('abort', abortHandler, { once: true });
                      });
                    }
                    // Cancel reader with catch to prevent unhandled rejection on abort
                    if (!controller.signal.aborted) {
                      reader.cancel().catch(() => {
                        // Ignore cancel errors - expected during abort
                      });
                    }
                    return; // Exit read loop
                  }
                } catch {
                  // Ignore parse errors - not all e:/d: events are finish events
                }
              }
            }

            // Handle AI SDK data stream format (0:) - call onTextChunk for actual text
            if (line.startsWith('0:')) {
              try {
                const textData = JSON.parse(line.slice(2));
                if (typeof textData === 'string') {
                  textDeltaCount++;
                  callbacksRef.current?.onTextChunk?.(textData, currentSeq);
                  // Natural pacing: SSE chunk arrival provides gradual delivery
                  // No artificial delays - React handles state batching naturally
                }
              } catch {
                // Ignore parse errors
              }
            } else if (line.startsWith('{')) {
              // Handle AI SDK v6 UI message stream format (JSON objects)
              try {
                const event = JSON.parse(line);
                const textContent = event.delta ?? event.textDelta;
                if (event.type === 'text-delta' && typeof textContent === 'string') {
                  // Increment sequence for JSON format text deltas (same as AI SDK events)
                  currentSeq++;
                  lastSeqRef.current = currentSeq;
                  textDeltaCount++;
                  callbacksRef.current?.onTextChunk?.(textContent, currentSeq);
                  // Natural pacing: SSE chunk arrival provides gradual delivery
                  // No artificial delays - React handles state batching naturally
                }

                // Handle finish signals in JSON format
                if (event.type === 'finish' || event.finishReason) {
                  isCompleteRef.current = true;
                  rlog.stream('check', `🏁 ${logPrefix} JSON finish event detected, marking complete seq=${currentSeq}`);
                  setState(prev => ({
                    ...prev,
                    isStreaming: false,
                    lastSeq: currentSeq,
                    status: 'complete',
                  }));
                  rlog.stream('check', `🏁 ${logPrefix} calling onStatusChange and onComplete, callback exists: ${!!callbacksRef.current?.onComplete}`);
                  callbacksRef.current?.onStatusChange?.('complete');
                  callbacksRef.current?.onComplete?.(currentSeq);
                  // ✅ FIX P6: Clean up connection tracking
                  cleanupConnection();
                  reader.cancel().catch(() => {
                    // Ignore cancel errors - expected during abort
                  });
                  return; // Exit read loop
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        // Log summary instead of per-line (reduces clutter)
        rlog.stream('check', `${logPrefix} parsed ${currentSeq} events, ${textDeltaCount} text deltas`);

        // Stream ended - mark complete to prevent any pending retries
        rlog.stream('check', `🏁 ${logPrefix} SSE reader done (natural end) seq=${currentSeq}`);

        // Guard against concurrent completion from another execution
        if (isCompleteRef.current) {
          cleanupConnection();
          return;
        }
        isCompleteRef.current = true;
        setState(prev => ({
          ...prev,
          isStreaming: false,
          lastSeq: currentSeq,
          status: 'complete',
        }));
        rlog.stream('check', `🏁 ${logPrefix} calling onStatusChange and onComplete (natural end), callback exists: ${!!callbacksRef.current?.onComplete}`);
        callbacksRef.current?.onStatusChange?.('complete');
        callbacksRef.current?.onComplete?.(currentSeq);
        // ✅ FIX P6: Clean up connection tracking
        cleanupConnection();
      }
    } catch (error) {
      // Handle all abort-related errors (AbortError, BodyStreamBuffer aborted, etc.)
      const isAbortError = error instanceof Error && (
        error.name === 'AbortError'
        || error.message.toLowerCase().includes('abort')
        || error.message.includes('BodyStreamBuffer')
      );
      if (isAbortError) {
        rlog.stream('end', `${logPrefix} aborted`);
        // ✅ FIX P6: Clean up connection tracking on abort
        cleanupConnection();
        return;
      }

      rlog.stuck('sub', `${logPrefix} error: ${error instanceof Error ? error.message : String(error)}`);
      setState(prev => ({
        ...prev,
        errorMessage: error instanceof Error ? error.message : String(error),
        isStreaming: false,
        status: 'error',
      }));
      callbacksRef.current?.onStatusChange?.('error');
      callbacksRef.current?.onError?.(error instanceof Error ? error : new Error(String(error)));
      // ✅ FIX P6: Clean up connection tracking on error
      cleanupConnection();
    }
  // Note: callbacks intentionally excluded from deps - we use callbacksRef to avoid stale closures
  }, [enabled, threadId, roundNumber, phase, participantIndex]);

  // Auto-subscribe when enabled and parameters are valid
  useEffect(() => {
    const logPrefix = `${phase} r${roundNumber}${participantIndex !== undefined ? ` p${participantIndex}` : ''}`;
    const subscriptionKey = getRequestKey(threadId, roundNumber, phase, participantIndex);

    // 🔍 DEBUG: Log every time this effect runs
    rlog.stream('check', `${logPrefix} subscribe-effect: enabled=${enabled} threadId=${!!threadId} prevRound=${prevRoundNumberRef.current} isComplete=${isCompleteRef.current}`);

    // ✅ FIX: Skip subscription if round reset hasn't happened yet
    // When roundNumber changes, both this effect and the reset effect run.
    // If prevRoundNumberRef doesn't match current roundNumber, the reset effect
    // hasn't run yet (or will run in a different order). Skipping prevents
    // stale state (isCompleteRef, lastSeqRef) from causing P1 to be marked
    // complete without streaming in non-initial rounds.
    if (prevRoundNumberRef.current !== roundNumber) {
      rlog.stream('check', `${logPrefix} subscribe-effect: SKIP - round mismatch (prev=${prevRoundNumberRef.current} curr=${roundNumber})`);
      return; // Reset effect will update prevRoundNumberRef, then this effect re-runs
    }

    // ✅ FIX P6: Handle enabled state change
    if (!enabled) {
      // Reset subscription key when disabled so we can re-subscribe if re-enabled
      hasSubscribedKeyRef.current = null;
      return;
    }

    // ✅ FIX P6: Don't re-subscribe if already subscribed for same params
    if (hasSubscribedKeyRef.current === subscriptionKey) {
      rlog.stream('skip', `${logPrefix} already subscribed for same params`);
      return;
    }

    if (threadId && roundNumber >= 0) {
      hasSubscribedKeyRef.current = subscriptionKey;
      // FIX: Catch any promise rejections from subscribe to prevent uncaught errors
      // when the component unmounts mid-stream. The subscribe() catch block handles
      // most abort errors, but timing issues with React's cleanup can cause escapes.
      subscribe().catch((error) => {
        // Silently ignore AbortError - it's expected during unmount
        const isAbortError = error instanceof Error && (
          error.name === 'AbortError'
          || error.message.toLowerCase().includes('abort')
          || error.message.includes('BodyStreamBuffer')
        );
        if (!isAbortError) {
          rlog.stuck('sub', `unexpected error: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }

    return () => {
      // NOTE: We intentionally do NOT set isCompleteRef.current = true here
      // The cleanup runs both on unmount AND when effect re-runs due to dep changes.
      // If we set isCompleteRef = true on re-run, the new subscription won't start
      // because subscribe() checks isCompleteRef and returns early.
      //
      // The abort is sufficient - it will:
      // 1. Cancel any in-flight fetch/reader operations
      // 2. Cause pending setTimeout callbacks to be ignored (they check aborted signal)
      //
      // isCompleteRef is only set to true when:
      // - The stream naturally completes (finish event or reader done)
      // - The 'done' event is received (presearch)
      // - Max retries exceeded
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // ✅ FIX P6: Reset subscription key on cleanup so re-subscription is possible
      hasSubscribedKeyRef.current = null;

      // ✅ FIX P6: Clean up active request tracking on unmount/re-run
      // This ensures the request key is available for new subscriptions
      const requestKey = getRequestKey(threadId, roundNumber, phase, participantIndex);
      if (activeRequestsMap.has(requestKey)) {
        activeRequestsMap.delete(requestKey);
        decrementConnections(phase, roundNumber);
        rlog.stream('end', `${phase} r${roundNumber} cleaned up on effect cleanup`);
      }
    };
  }, [enabled, threadId, roundNumber, phase, participantIndex, subscribe]);

  // Store state in ref for visibility change handler to access current values
  const stateRef = useRef(state);
  stateRef.current = state;

  // Build entity identifier for logging
  const entity = `${phase}${participantIndex !== undefined ? ` p${participantIndex}` : ''}`;

  // ✅ VISIBILITY CHANGE: Reconnect when tab becomes visible
  // Per FLOW_DOCUMENTATION.md: "Handle reconnection automatically on visibility change"
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleVisibilityChange = () => {
      // Only reconnect if:
      // 1. Tab is now visible
      // 2. Stream is not already complete
      // 3. Stream is not currently in a terminal state
      // 4. Not already subscribed for these params (NEW)
      // 5. No active request in flight (NEW)
      const requestKey = getRequestKey(threadId, roundNumber, phase, participantIndex);

      if (
        document.visibilityState === 'visible'
        && !isCompleteRef.current
        && stateRef.current.status !== 'complete'
        && stateRef.current.status !== 'error'
        && stateRef.current.status !== 'disabled'
        && !activeRequestsMap.has(requestKey)
      ) {
        rlog.stream('resume', `Tab visible - reconnecting ${entity} r${roundNumber}`);

        // Trigger reconnection by calling subscribe again
        // The subscribe function handles deduplication internally
        subscribe().catch((error) => {
          // Silently ignore AbortError - expected if component unmounts
          const isAbortError = error instanceof Error && (
            error.name === 'AbortError'
            || error.message.toLowerCase().includes('abort')
            || error.message.includes('BodyStreamBuffer')
          );
          if (!isAbortError) {
            rlog.stuck('sub', `visibility reconnect error: ${error instanceof Error ? error.message : String(error)}`);
          }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, entity, participantIndex, phase, roundNumber, subscribe, threadId]);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    abort,
    retry: subscribe,
    state,
  };
}

// ============================================================================
// CONVENIENCE HOOKS
// ============================================================================

type UsePreSearchSubscriptionOptions = Omit<UseEntitySubscriptionOptions, 'phase' | 'participantIndex'>;

/**
 * Convenience hook for pre-search stream subscription.
 */
export function usePreSearchSubscription(options: UsePreSearchSubscriptionOptions) {
  return useEntitySubscription({ ...options, phase: EntityPhases.PRESEARCH });
}

type UseParticipantSubscriptionOptions = Omit<UseEntitySubscriptionOptions, 'phase'> & {
  participantIndex: number;
};

/**
 * Convenience hook for participant stream subscription.
 */
export function useParticipantSubscription(options: UseParticipantSubscriptionOptions) {
  return useEntitySubscription({ ...options, phase: EntityPhases.PARTICIPANT });
}

type UseModeratorSubscriptionOptions = Omit<UseEntitySubscriptionOptions, 'phase' | 'participantIndex'>;

/**
 * Convenience hook for moderator stream subscription.
 */
export function useModeratorSubscription(options: UseModeratorSubscriptionOptions) {
  return useEntitySubscription({ ...options, phase: EntityPhases.MODERATOR });
}

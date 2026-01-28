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
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { rlog } from '@/lib/utils/dev-logger';
import type { EntitySubscriptionResponse } from '@/services/api';
import {
  subscribeToModeratorStreamService,
  subscribeToParticipantStreamService,
  subscribeToPreSearchStreamService,
} from '@/services/api';

// ============================================================================
// TYPES
// ============================================================================

export type EntityPhase = 'presearch' | 'participant' | 'moderator';

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
  /** Called for presearch-specific events (query, result, start, complete, done) */
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

  // Reset lastSeq when round number changes to prevent stale sequence numbers
  // This fixes the round 2+ submission failure where subscriptions detect "complete"
  // instantly because they're using stale lastSeq values from the previous round
  useEffect(() => {
    if (prevRoundNumberRef.current !== roundNumber) {
      rlog.stream(
        'check',
        `${phase} r${prevRoundNumberRef.current}→r${roundNumber} resetting lastSeq from ${lastSeqRef.current} to 0`,
      );
      lastSeqRef.current = 0;
      retryCountRef.current = 0;
      isCompleteRef.current = false; // BUG FIX: Reset completion flag for new round
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

  const subscribe = useCallback(async () => {
    if (!enabled || !threadId) {
      return;
    }

    // Abort any existing subscription
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const logPrefix = `${phase} r${roundNumber}${participantIndex !== undefined ? ` p${participantIndex}` : ''}`;
    rlog.stream('start', `${logPrefix} subscription lastSeq=${lastSeqRef.current}`);

    setState(prev => ({
      ...prev,
      isStreaming: false,
      status: 'waiting',
    }));
    callbacks?.onStatusChange?.('waiting');

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
          callbacks?.onStatusChange?.('error');
          callbacks?.onError?.(new Error('Max retries exceeded waiting for stream'));
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

        if (result?.status === 'complete') {
          // Mark complete to prevent any pending retries
          isCompleteRef.current = true;
          setState(prev => ({
            ...prev,
            isStreaming: false,
            lastSeq: result.lastSeq ?? prev.lastSeq,
            status: 'complete',
          }));
          callbacks?.onStatusChange?.('complete');
          callbacks?.onComplete?.(result.lastSeq ?? lastSeqRef.current);
        } else if (result?.status === 'disabled') {
          setState(prev => ({
            ...prev,
            errorMessage: result.message,
            isStreaming: false,
            status: 'disabled',
          }));
          callbacks?.onStatusChange?.('disabled');
        } else if (result?.status === 'error') {
          setState(prev => ({
            ...prev,
            errorMessage: 'Stream encountered an error',
            isStreaming: false,
            lastSeq: result.lastSeq ?? prev.lastSeq,
            status: 'error',
          }));
          callbacks?.onStatusChange?.('error');
          callbacks?.onError?.(new Error('Stream encountered an error'));
        }
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
        callbacks?.onStatusChange?.('streaming');

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
          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const rawLine of lines) {
            if (!rawLine.trim()) {
              continue;
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

                // Success - process the complete JSON
                currentSeq++;
                lastSeqRef.current = currentSeq;

                rlog.presearch('event-dispatch', `${logPrefix} dispatching type=${currentEventType}${jsonBuffer.length > 1000 ? ` (${jsonBuffer.length} chars buffered)` : ''}`);
                callbacks?.onPreSearchEvent?.(currentEventType, eventData);

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
                  callbacks?.onStatusChange?.('complete');
                  callbacks?.onComplete?.(currentSeq);

                  // Small delay before cancel to ensure all state updates flush
                  // Check abort signal before waiting to avoid stale cleanup
                  if (!controller.signal.aborted) {
                    await new Promise<void>((resolve) => {
                      setTimeout(resolve, 50);
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
            }

            // Handle AI SDK data stream format (0:) - call onTextChunk for actual text
            if (line.startsWith('0:')) {
              try {
                const textData = JSON.parse(line.slice(2));
                if (typeof textData === 'string') {
                  textDeltaCount++;
                  callbacks?.onTextChunk?.(textData, currentSeq);
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
                  textDeltaCount++;
                  callbacks?.onTextChunk?.(textContent, currentSeq);
                  // Natural pacing: SSE chunk arrival provides gradual delivery
                  // No artificial delays - React handles state batching naturally
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
        isCompleteRef.current = true;
        setState(prev => ({
          ...prev,
          isStreaming: false,
          lastSeq: currentSeq,
          status: 'complete',
        }));
        callbacks?.onStatusChange?.('complete');
        callbacks?.onComplete?.(currentSeq);
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
        return;
      }

      rlog.stuck('sub', `${logPrefix} error: ${error instanceof Error ? error.message : String(error)}`);
      setState(prev => ({
        ...prev,
        errorMessage: error instanceof Error ? error.message : String(error),
        isStreaming: false,
        status: 'error',
      }));
      callbacks?.onStatusChange?.('error');
      callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [enabled, threadId, roundNumber, phase, participantIndex, callbacks]);

  // Auto-subscribe when enabled and parameters are valid
  useEffect(() => {
    if (enabled && threadId && roundNumber >= 0) {
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
      // BUG FIX: Set completion flag BEFORE aborting to prevent retry race conditions
      // This stops any pending 202 retry setTimeout callbacks from firing
      isCompleteRef.current = true;

      // Abort any active stream - the abort() call doesn't throw, but pending
      // async operations (reader.read()) will reject with AbortError which is
      // caught by the subscribe().catch() handler above
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, threadId, roundNumber, phase, participantIndex, subscribe]);

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
  return useEntitySubscription({ ...options, phase: 'presearch' });
}

type UseParticipantSubscriptionOptions = Omit<UseEntitySubscriptionOptions, 'phase'> & {
  participantIndex: number;
};

/**
 * Convenience hook for participant stream subscription.
 */
export function useParticipantSubscription(options: UseParticipantSubscriptionOptions) {
  return useEntitySubscription({ ...options, phase: 'participant' });
}

type UseModeratorSubscriptionOptions = Omit<UseEntitySubscriptionOptions, 'phase' | 'participantIndex'>;

/**
 * Convenience hook for moderator stream subscription.
 */
export function useModeratorSubscription(options: UseModeratorSubscriptionOptions) {
  return useEntitySubscription({ ...options, phase: 'moderator' });
}

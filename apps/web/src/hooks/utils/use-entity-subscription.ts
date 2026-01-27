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
    status: 'idle',
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const lastSeqRef = useRef(initialLastSeq);
  const prevRoundNumberRef = useRef(roundNumber);

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
      setState(prev => ({
        ...prev,
        lastSeq: 0,
        status: 'idle',
      }));
      prevRoundNumberRef.current = roundNumber;
    }
  }, [roundNumber, phase]);

  // Update ref when lastSeq changes
  useEffect(() => {
    lastSeqRef.current = state.lastSeq;
  }, [state.lastSeq]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

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
        if (retryCountRef.current < MAX_RETRY_ATTEMPTS) {
          setTimeout(() => {
            if (!controller.signal.aborted) {
              subscribe();
            }
          }, retryAfter);
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
              continue;
            }

            // Strip SSE framing
            const line = rawLine.startsWith('data: ') ? rawLine.slice(6) : rawLine;

            // Count ALL meaningful events for seq tracking (not just text)
            // This ensures frontend seq matches backend chunk count
            const isAiSdkEvent = line.startsWith('0:') || line.startsWith('8:') || line.startsWith('e:') || line.startsWith('d:');
            const isJsonEvent = line.startsWith('{');

            if (isAiSdkEvent || isJsonEvent) {
              currentSeq++;
              lastSeqRef.current = currentSeq;
            }

            // Handle presearch-specific SSE events (query, result, start, complete, done)
            // These use standard SSE format: "event: query\ndata: {...}" not AI SDK format
            if (phase === 'presearch' && currentEventType && isJsonEvent) {
              try {
                const eventData = JSON.parse(line);
                callbacks?.onPreSearchEvent?.(currentEventType, eventData);
                currentEventType = null; // Reset after processing

                // Yield to React for gradual rendering
                await new Promise<void>((resolve) => {
                  requestAnimationFrame(() => resolve());
                });
              } catch {
                // Ignore parse errors
              }
              continue; // Skip AI SDK handling for presearch events
            }

            // Handle AI SDK data stream format (0:) - call onTextChunk for actual text
            if (line.startsWith('0:')) {
              try {
                const textData = JSON.parse(line.slice(2));
                if (typeof textData === 'string') {
                  textDeltaCount++;
                  callbacks?.onTextChunk?.(textData, currentSeq);

                  // CRITICAL FIX: Yield to React AFTER each chunk for gradual rendering
                  // Without this, React 18 batches all state updates together
                  await new Promise<void>((resolve) => {
                    requestAnimationFrame(() => resolve());
                  });
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

                  // CRITICAL FIX: Yield to React AFTER each chunk for gradual rendering
                  await new Promise<void>((resolve) => {
                    requestAnimationFrame(() => resolve());
                  });
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        // Log summary instead of per-line (reduces clutter)
        rlog.stream('check', `${logPrefix} parsed ${currentSeq} events, ${textDeltaCount} text deltas`);

        // Stream ended
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
      if (error instanceof Error && error.name === 'AbortError') {
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
      subscribe();
    }

    return () => {
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

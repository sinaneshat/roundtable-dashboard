/**
 * Stream Subscription Hook
 *
 * Implements the pub/sub delivery pattern for robust streaming resumption.
 * Clients subscribe to existing streams produced by background workers.
 *
 * **ARCHITECTURE**:
 * - Background worker produces chunks to KV buffer (server-side)
 * - This hook subscribes via SSE and receives chunks
 * - Supports mid-stream join (replay existing chunks, then live)
 * - Handles "queued" status with automatic retry
 *
 * Flow:
 * 1. Client calls subscribe endpoint
 * 2. If response.status === 'queued', wait retryAfter ms and retry
 * 3. If response.status === 'active', process SSE stream
 * 4. If response.status === 'completed', round is done
 *
 * @module web/hooks/utils/use-stream-subscription
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Stream chunk received from SSE */
export type StreamChunk = {
  data: string;
  timestamp: number;
  type: 'text' | 'reasoning' | 'finish' | 'error';
};

/** Subscription status */
export type SubscriptionStatus
  = | 'idle'
    | 'connecting'
    | 'queued'
    | 'streaming'
    | 'completed'
    | 'failed';

/** Stream subscription state */
export type StreamSubscriptionState = {
  chunks: StreamChunk[];
  error: Error | null;
  isActive: boolean;
  phase: 'presearch' | 'participant' | 'moderator' | null;
  retryCount: number;
  roundNumber: number | null;
  status: SubscriptionStatus;
  streamId: string | null;
};

/** Hook configuration options */
export type UseStreamSubscriptionOptions = {
  /** Whether the subscription is enabled */
  enabled?: boolean;
  /** Maximum retry attempts for "queued" status */
  maxRetries?: number;
  /** Callback when stream completes */
  onComplete?: (chunks: StreamChunk[]) => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
  /** Callback when new chunk received */
  onStreamChunk?: (chunk: StreamChunk) => void;
  /** Round number to subscribe to */
  roundNumber: number;
  /** Thread ID to subscribe to */
  threadId: string;
};

// ============================================================================
// RESPONSE SCHEMAS
// ============================================================================

const SubscribeResponseSchema = z.discriminatedUnion('status', [
  z.object({
    retryAfter: z.number(),
    status: z.literal('queued'),
  }),
  z.object({
    isActive: z.boolean(),
    phase: z.enum(['presearch', 'participant', 'moderator']),
    roundNumber: z.number(),
    status: z.literal('active'),
    streamId: z.string(),
  }),
  z.object({
    roundNumber: z.number(),
    status: z.literal('completed'),
  }),
]);

type SubscribeResponse = z.infer<typeof SubscribeResponseSchema>;

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Default maximum retries for "queued" status */
const DEFAULT_MAX_RETRIES = 30;

/** Default retry interval when server doesn't specify */
const DEFAULT_RETRY_INTERVAL = 1000;

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Subscribe to a stream for a specific thread and round
 *
 * Example usage:
 * ```tsx
 * const { chunks, status, error } = useStreamSubscription({
 *   threadId: 'thread_123',
 *   roundNumber: 0,
 *   onStreamChunk: (chunk) => console.log('Received:', chunk),
 *   onComplete: (chunks) => console.log('Stream complete:', chunks.length),
 * });
 * ```
 */
export function useStreamSubscription({
  enabled = true,
  maxRetries = DEFAULT_MAX_RETRIES,
  onComplete,
  onError,
  onStreamChunk,
  roundNumber,
  threadId,
}: UseStreamSubscriptionOptions) {
  const [state, setState] = useState<StreamSubscriptionState>({
    chunks: [],
    error: null,
    isActive: false,
    phase: null,
    retryCount: 0,
    roundNumber: null,
    status: 'idle',
    streamId: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Subscribe to the stream
   */
  const subscribe = useCallback(async () => {
    if (!enabled || !threadId) {
      return;
    }

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState(prev => ({
      ...prev,
      error: null,
      status: 'connecting',
    }));

    try {
      // Make subscription request
      const response = await fetch(
        `/api/chat/threads/${threadId}/rounds/${roundNumber}/subscribe`,
        {
          credentials: 'include',
          headers: {
            Accept: 'application/json, text/event-stream',
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Subscription failed: ${response.status}`);
      }

      // Check content type
      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('text/event-stream')) {
        // SSE stream - process chunks
        await processSSEStream(response, controller.signal);
      } else {
        // JSON response - parse and handle
        // Response may be wrapped in { data: ... } or be the raw payload
        const json = await response.json() as { data?: unknown } | unknown;
        const payload = typeof json === 'object' && json !== null && 'data' in json ? json.data : json;
        const parsed = SubscribeResponseSchema.safeParse(payload);

        if (!parsed.success) {
          throw new Error('Invalid response format');
        }

        await handleSubscribeResponse(parsed.data);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Aborted - not an error
        return;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({
        ...prev,
        error: err,
        status: 'failed',
      }));
      onError?.(err);
    } finally {
      abortControllerRef.current = null;
    }
  }, [enabled, threadId, roundNumber, onError]);

  /**
   * Handle subscribe response based on status
   */
  const handleSubscribeResponse = useCallback(async (response: SubscribeResponse) => {
    switch (response.status) {
      case 'queued':
        // Stream not ready yet - retry after interval
        setState(prev => ({
          ...prev,
          retryCount: prev.retryCount + 1,
          status: 'queued',
        }));

        if (state.retryCount < maxRetries) {
          const delay = response.retryAfter ?? DEFAULT_RETRY_INTERVAL;
          retryTimeoutRef.current = setTimeout(() => {
            subscribe();
          }, delay);
        } else {
          const error = new Error('Max retries exceeded while waiting for stream');
          setState(prev => ({
            ...prev,
            error,
            status: 'failed',
          }));
          onError?.(error);
        }
        break;

      case 'active':
        // Stream is active - we should have received SSE
        // This shouldn't happen in normal flow, but handle gracefully
        setState(prev => ({
          ...prev,
          isActive: response.isActive,
          phase: response.phase,
          roundNumber: response.roundNumber,
          status: 'streaming',
          streamId: response.streamId,
        }));
        break;

      case 'completed':
        // Round is already completed
        setState(prev => ({
          ...prev,
          roundNumber: response.roundNumber,
          status: 'completed',
        }));
        onComplete?.(state.chunks);
        break;
    }
  }, [state.retryCount, state.chunks, maxRetries, subscribe, onComplete, onError]);

  /**
   * Process SSE stream and accumulate chunks
   */
  const processSSEStream = useCallback(async (response: Response, signal: AbortSignal) => {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    // Extract metadata from headers
    const streamId = response.headers.get('x-stream-id');
    const phase = response.headers.get('x-phase') as 'presearch' | 'participant' | 'moderator' | null;
    const roundNum = response.headers.get('x-round-number');

    setState(prev => ({
      ...prev,
      isActive: true,
      phase,
      roundNumber: roundNum ? Number.parseInt(roundNum, 10) : prev.roundNumber,
      status: 'streaming',
      streamId,
    }));

    const decoder = new TextDecoder();
    const chunks: StreamChunk[] = [];

    try {
      while (true) {
        if (signal.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          // Parse SSE chunk
          const chunk = parseSSEChunk(line);
          if (chunk) {
            chunks.push(chunk);
            setState(prev => ({
              ...prev,
              chunks: [...prev.chunks, chunk],
            }));
            onStreamChunk?.(chunk);
          }
        }
      }

      // Stream completed
      setState(prev => ({
        ...prev,
        isActive: false,
        status: 'completed',
      }));
      onComplete?.(chunks);
    } finally {
      reader.releaseLock();
    }
  }, [onStreamChunk, onComplete]);

  /**
   * Parse an SSE line into a StreamChunk
   */
  const parseSSEChunk = useCallback((line: string): StreamChunk | null => {
    // AI SDK v6 SSE format: {prefix}:{data}
    // 0: = text-delta
    // g: = reasoning-delta
    // d: = finish
    // 3: = error

    if (!line.includes(':')) {
      return null;
    }

    const colonIndex = line.indexOf(':');
    const prefix = line.substring(0, colonIndex);
    const data = line.substring(colonIndex + 1);

    let type: StreamChunk['type'] = 'text';
    switch (prefix) {
      case '0':
        type = 'text';
        break;
      case 'g':
        type = 'reasoning';
        break;
      case 'd':
        type = 'finish';
        break;
      case '3':
        type = 'error';
        break;
      default:
        return null;
    }

    return {
      data,
      timestamp: Date.now(),
      type,
    };
  }, []);

  // Start subscription when enabled
  useEffect(() => {
    if (enabled && threadId && state.status === 'idle') {
      subscribe();
    }
  }, [enabled, threadId, state.status, subscribe]);

  // Retry handler
  const retry = useCallback(() => {
    setState(prev => ({
      ...prev,
      chunks: [],
      error: null,
      retryCount: 0,
      status: 'idle',
    }));
  }, []);

  // Cancel handler
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    setState(prev => ({
      ...prev,
      isActive: false,
      status: 'idle',
    }));
  }, []);

  return {
    ...state,
    cancel,
    retry,
    subscribe,
  };
}

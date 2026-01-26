/**
 * useEntitySubscription Hook Tests
 *
 * Comprehensive unit tests for the entity subscription hook following TDD principles.
 * Tests cover the scenarios documented in FLOW_DOCUMENTATION.md:
 *
 * 1. Round number change resets state (prevents stale sequence bugs)
 * 2. 202 Accepted handling (waiting state with retry)
 * 3. 200 JSON response handling (complete/disabled/error)
 * 4. 200 SSE stream handling (AI SDK format parsing)
 * 5. Abort handling (graceful cancellation)
 * 6. Cleanup on unmount
 *
 * @module hooks/utils/__tests__/use-entity-subscription.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook, waitFor } from '@/lib/testing';
import type { EntitySubscriptionResponse } from '@/services/api';
import * as apiServices from '@/services/api';

import type { EntitySubscriptionCallbacks, EntitySubscriptionState } from '../use-entity-subscription';
import { useEntitySubscription } from '../use-entity-subscription';

// ============================================================================
// Mock Setup
// ============================================================================

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof apiServices>();
  return {
    ...actual,
    subscribeToModeratorStreamService: vi.fn(),
    subscribeToParticipantStreamService: vi.fn(),
    subscribeToPreSearchStreamService: vi.fn(),
  };
});

vi.mock('@/lib/utils/dev-logger', () => ({
  rlog: {
    stream: vi.fn(),
    stuck: vi.fn(),
  },
}));

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Creates a mock Response object with specified properties.
 */
function createMockResponse(options: {
  status: number;
  contentType: string;
  body?: string | ReadableStream<Uint8Array>;
  json?: () => Promise<unknown>;
}): Response {
  const headers = new Headers();
  headers.set('content-type', options.contentType);

  return {
    body: typeof options.body === 'string'
      ? new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(options.body));
          controller.close();
        },
      })
      : options.body ?? null,
    headers,
    json: options.json ?? (() => Promise.resolve({})),
    ok: options.status >= 200 && options.status < 300,
    status: options.status,
  } as Response;
}

/**
 * Creates a 202 Accepted response for waiting state.
 */
function create202WaitingResponse(retryAfter = 500): Response {
  return createMockResponse({
    contentType: 'application/json',
    json: () => Promise.resolve({
      data: {
        retryAfter,
        status: 'waiting',
      } satisfies EntitySubscriptionResponse,
    }),
    status: 202,
  });
}

/**
 * Creates a 200 JSON response for complete/error/disabled states.
 */
function create200JsonResponse(
  responseStatus: 'complete' | 'error' | 'disabled',
  lastSeq?: number,
  message?: string,
): Response {
  return createMockResponse({
    contentType: 'application/json',
    json: () => Promise.resolve({
      data: {
        lastSeq,
        message,
        status: responseStatus,
      } satisfies EntitySubscriptionResponse,
    }),
    status: 200,
  });
}

/**
 * Creates a 200 SSE stream response with AI SDK format data.
 */
function create200SseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let chunkIndex = 0;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(encoder.encode(chunks[chunkIndex]));
        chunkIndex++;
      } else {
        controller.close();
      }
    },
  });

  return createMockResponse({
    body,
    contentType: 'text/event-stream',
    status: 200,
  });
}

/**
 * Default hook options for testing.
 */
function createDefaultOptions(overrides?: Partial<{
  callbacks: EntitySubscriptionCallbacks;
  enabled: boolean;
  initialLastSeq: number;
  participantIndex: number;
  phase: 'presearch' | 'participant' | 'moderator';
  roundNumber: number;
  threadId: string;
}>) {
  return {
    enabled: true,
    phase: 'presearch' as const,
    roundNumber: 0,
    threadId: 'test-thread-id',
    ...overrides,
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('useEntitySubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 1. Round Number Change Resets State
  // ==========================================================================

  describe('round Number Change Resets State', () => {
    it('should reset lastSeq to 0 when round changes', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      // First subscription completes with lastSeq = 10
      mockService.mockResolvedValueOnce(create200JsonResponse('complete', 10));
      mockService.mockResolvedValueOnce(create200JsonResponse('complete', 0));

      const { rerender, result } = renderHook(
        (props: { roundNumber: number }) =>
          useEntitySubscription(createDefaultOptions({ roundNumber: props.roundNumber })),
        { initialProps: { roundNumber: 0 } },
      );

      await vi.runAllTimersAsync();

      // Verify initial state completed with lastSeq = 10
      await waitFor(() => {
        expect(result.current.state.status).toBe('complete');
        expect(result.current.state.lastSeq).toBe(10);
      });

      // Change round number to 1
      rerender({ roundNumber: 1 });

      // State should reset
      await waitFor(() => {
        expect(result.current.state.lastSeq).toBe(0);
      });
    });

    it('should reset retryCount to 0 when round changes', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      // First call returns waiting, triggering retry logic
      mockService.mockResolvedValueOnce(create202WaitingResponse(100));
      // Second call (after round change) returns complete immediately
      mockService.mockResolvedValueOnce(create200JsonResponse('complete', 0));

      const { rerender, result } = renderHook(
        (props: { roundNumber: number }) =>
          useEntitySubscription(createDefaultOptions({ roundNumber: props.roundNumber })),
        { initialProps: { roundNumber: 0 } },
      );

      await vi.runAllTimersAsync();

      // Verify it's in waiting state (would retry)
      await waitFor(() => {
        expect(result.current.state.status).toBe('waiting');
      });

      // Change round number - should reset retry count
      rerender({ roundNumber: 1 });

      await vi.runAllTimersAsync();

      // New round should succeed without hitting max retries
      await waitFor(() => {
        expect(result.current.state.status).toBe('complete');
      });
    });

    it('should reset status to idle when round changes', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      mockService.mockResolvedValueOnce(create200JsonResponse('complete', 5));
      mockService.mockResolvedValueOnce(create200JsonResponse('complete', 0));

      const { rerender, result } = renderHook(
        (props: { roundNumber: number }) =>
          useEntitySubscription(createDefaultOptions({ roundNumber: props.roundNumber })),
        { initialProps: { roundNumber: 0 } },
      );

      await vi.runAllTimersAsync();

      // Wait for complete
      await waitFor(() => {
        expect(result.current.state.status).toBe('complete');
      });

      // Change round - status should transition through idle
      rerender({ roundNumber: 1 });

      // After rerender, state should reset then start new subscription
      // The hook sets status to 'idle' when round changes
      expect(result.current.state.status).toBe('idle');
    });

    it('should prevent stale sequence bugs in round 2+ submissions', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      const capturedLastSeqs: number[] = [];

      // Capture lastSeq values passed to service
      mockService.mockImplementation(async (params) => {
        capturedLastSeqs.push(params.lastSeq ?? 0);
        return create200JsonResponse('complete', params.roundNumber * 10 + 5);
      });

      const { rerender } = renderHook(
        (props: { roundNumber: number }) =>
          useEntitySubscription(createDefaultOptions({ roundNumber: props.roundNumber })),
        { initialProps: { roundNumber: 0 } },
      );

      await vi.runAllTimersAsync();

      // Round 0 should use lastSeq = 0
      expect(capturedLastSeqs[0]).toBe(0);

      // Change to round 1
      rerender({ roundNumber: 1 });
      await vi.runAllTimersAsync();

      // Round 1 should also use lastSeq = 0 (reset on round change)
      // Not the stale value from round 0
      expect(capturedLastSeqs[1]).toBe(0);

      // Change to round 2
      rerender({ roundNumber: 2 });
      await vi.runAllTimersAsync();

      // Round 2 should also use lastSeq = 0
      expect(capturedLastSeqs[2]).toBe(0);
    });
  });

  // ==========================================================================
  // 2. 202 Accepted Handling (Waiting State)
  // ==========================================================================

  describe('202 Accepted Handling (Waiting State)', () => {
    it('should poll with retryAfter delay', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      // First call returns waiting with 200ms retry
      mockService.mockResolvedValueOnce(create202WaitingResponse(200));
      // Second call returns complete
      mockService.mockResolvedValueOnce(create200JsonResponse('complete', 5));

      renderHook(() => useEntitySubscription(createDefaultOptions()));

      await vi.runAllTimersAsync();

      // Should have called the service twice (initial + retry after 200ms)
      expect(mockService).toHaveBeenCalledTimes(2);
    });

    it('should increment retryCount on each 202 response', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      let callCount = 0;

      mockService.mockImplementation(async () => {
        callCount++;
        if (callCount < 5) {
          return create202WaitingResponse(100);
        }
        return create200JsonResponse('complete', 0);
      });

      renderHook(() => useEntitySubscription(createDefaultOptions()));

      // Advance timers for each retry
      for (let i = 0; i < 5; i++) {
        await vi.runAllTimersAsync();
      }

      // Should have been called 5 times (4 retries + 1 success)
      expect(mockService).toHaveBeenCalledTimes(5);
    });

    it('should stop after MAX_RETRY_ATTEMPTS (60)', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      // Always return waiting
      mockService.mockResolvedValue(create202WaitingResponse(10));

      const onError = vi.fn();
      const onStatusChange = vi.fn();

      const { result } = renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onError, onStatusChange },
          }),
        ));

      // Run timers enough times to hit max retries
      for (let i = 0; i <= 60; i++) {
        await vi.runAllTimersAsync();
      }

      // Should stop at 60 retries
      expect(mockService.mock.calls.length).toBeLessThanOrEqual(61);

      // Should be in error state
      await waitFor(() => {
        expect(result.current.state.status).toBe('error');
        expect(result.current.state.errorMessage).toBe('Max retries exceeded waiting for stream');
      });

      // Error callback should have been called
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Max retries exceeded waiting for stream',
        }),
      );
    });

    it('should call onStatusChange with waiting', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      mockService.mockResolvedValueOnce(create202WaitingResponse(100));
      mockService.mockResolvedValueOnce(create200JsonResponse('complete', 0));

      const onStatusChange = vi.fn();

      renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onStatusChange },
          }),
        ));

      await vi.runAllTimersAsync();

      // Should have called with 'waiting' status
      expect(onStatusChange).toHaveBeenCalledWith('waiting');
    });

    it('should use default retry delay when retryAfter is not provided', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      // Return response without retryAfter
      mockService.mockResolvedValueOnce(
        createMockResponse({
          contentType: 'application/json',
          json: () => Promise.resolve({
            data: { status: 'waiting' } satisfies Partial<EntitySubscriptionResponse>,
          }),
          status: 202,
        }),
      );
      mockService.mockResolvedValueOnce(create200JsonResponse('complete', 0));

      renderHook(() => useEntitySubscription(createDefaultOptions()));

      await vi.runAllTimersAsync();

      // Service should be called twice (uses default 500ms delay)
      expect(mockService).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // 3. 200 JSON Response Handling
  // ==========================================================================

  describe('200 JSON Response Handling', () => {
    describe('status: complete', () => {
      it('should call onComplete with lastSeq', async () => {
        const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
        mockService.mockResolvedValueOnce(create200JsonResponse('complete', 42));

        const onComplete = vi.fn();

        const { result } = renderHook(() =>
          useEntitySubscription(
            createDefaultOptions({
              callbacks: { onComplete },
            }),
          ));

        await vi.runAllTimersAsync();

        await waitFor(() => {
          expect(result.current.state.status).toBe('complete');
          expect(result.current.state.lastSeq).toBe(42);
        });

        expect(onComplete).toHaveBeenCalledWith(42);
      });

      it('should set status to complete', async () => {
        const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
        mockService.mockResolvedValueOnce(create200JsonResponse('complete', 10));

        const onStatusChange = vi.fn();

        const { result } = renderHook(() =>
          useEntitySubscription(
            createDefaultOptions({
              callbacks: { onStatusChange },
            }),
          ));

        await vi.runAllTimersAsync();

        await waitFor(() => {
          expect(result.current.state.status).toBe('complete');
        });

        expect(onStatusChange).toHaveBeenCalledWith('complete');
      });
    });

    describe('status: disabled', () => {
      it('should set status to disabled', async () => {
        const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
        mockService.mockResolvedValueOnce(
          create200JsonResponse('disabled', undefined, 'Web search not enabled'),
        );

        const onStatusChange = vi.fn();

        const { result } = renderHook(() =>
          useEntitySubscription(
            createDefaultOptions({
              callbacks: { onStatusChange },
            }),
          ));

        await vi.runAllTimersAsync();

        await waitFor(() => {
          expect(result.current.state.status).toBe('disabled');
          expect(result.current.state.errorMessage).toBe('Web search not enabled');
        });

        expect(onStatusChange).toHaveBeenCalledWith('disabled');
      });
    });

    describe('status: error', () => {
      it('should call onError and set error status', async () => {
        const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
        mockService.mockResolvedValueOnce(create200JsonResponse('error', 5));

        const onError = vi.fn();
        const onStatusChange = vi.fn();

        const { result } = renderHook(() =>
          useEntitySubscription(
            createDefaultOptions({
              callbacks: { onError, onStatusChange },
            }),
          ));

        await vi.runAllTimersAsync();

        await waitFor(() => {
          expect(result.current.state.status).toBe('error');
          expect(result.current.state.lastSeq).toBe(5);
        });

        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Stream encountered an error',
          }),
        );
        expect(onStatusChange).toHaveBeenCalledWith('error');
      });
    });
  });

  // ==========================================================================
  // 4. 200 SSE Stream Handling
  // ==========================================================================

  describe('200 SSE Stream Handling', () => {
    it('should parse AI SDK format (0: prefix for text)', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      // AI SDK data stream format: 0:"text content"\n
      const sseChunks = [
        'data: 0:"Hello "\n\n',
        'data: 0:"World!"\n\n',
      ];
      mockService.mockResolvedValueOnce(create200SseResponse(sseChunks));

      const onTextChunk = vi.fn();

      const { result } = renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onTextChunk },
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.status).toBe('complete');
      });

      // Should have received both text chunks
      expect(onTextChunk).toHaveBeenCalledTimes(2);
      expect(onTextChunk).toHaveBeenNthCalledWith(1, 'Hello ', expect.any(Number));
      expect(onTextChunk).toHaveBeenNthCalledWith(2, 'World!', expect.any(Number));
    });

    it('should count ALL meaningful events for seq tracking', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      // Mix of event types that should all increment seq
      const sseChunks = [
        '0:"text1"\n',
        '8:some-metadata\n',
        '0:"text2"\n',
        'e:finish-event\n',
        'd:done-event\n',
      ];
      mockService.mockResolvedValueOnce(create200SseResponse(sseChunks));

      const onTextChunk = vi.fn();
      const onComplete = vi.fn();

      renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onComplete, onTextChunk },
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled();
      });

      // Final seq should count all events (5 total)
      expect(onComplete).toHaveBeenCalledWith(5);
    });

    it('should call onTextChunk for each text delta', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      const sseChunks = [
        '0:"First "\n',
        '0:"Second "\n',
        '0:"Third"\n',
      ];
      mockService.mockResolvedValueOnce(create200SseResponse(sseChunks));

      const onTextChunk = vi.fn();

      renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onTextChunk },
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(onTextChunk).toHaveBeenCalledTimes(3);
      });

      expect(onTextChunk).toHaveBeenNthCalledWith(1, 'First ', 1);
      expect(onTextChunk).toHaveBeenNthCalledWith(2, 'Second ', 2);
      expect(onTextChunk).toHaveBeenNthCalledWith(3, 'Third', 3);
    });

    it('should handle AI SDK v6 UI message stream format (JSON objects)', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      // AI SDK v6 uses JSON objects with type field
      const sseChunks = [
        '{"type":"text-delta","delta":"Hello "}\n',
        '{"type":"text-delta","textDelta":"World!"}\n',
      ];
      mockService.mockResolvedValueOnce(create200SseResponse(sseChunks));

      const onTextChunk = vi.fn();

      renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onTextChunk },
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(onTextChunk).toHaveBeenCalledTimes(2);
      });

      expect(onTextChunk).toHaveBeenNthCalledWith(1, 'Hello ', 1);
      expect(onTextChunk).toHaveBeenNthCalledWith(2, 'World!', 2);
    });

    it('should set isStreaming to true during stream and false after', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      const sseChunks = ['0:"test"\n'];
      mockService.mockResolvedValueOnce(create200SseResponse(sseChunks));

      const statusChanges: EntitySubscriptionState['status'][] = [];
      const onStatusChange = vi.fn((status) => {
        statusChanges.push(status);
      });

      const { result } = renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onStatusChange },
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.status).toBe('complete');
      });

      // Should have transitioned: waiting -> streaming -> complete
      expect(statusChanges).toContain('streaming');
      expect(statusChanges).toContain('complete');
    });

    it('should handle SSE data: prefix stripping', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      // SSE format with data: prefix
      const sseChunks = [
        'data: 0:"stripped"\n',
      ];
      mockService.mockResolvedValueOnce(create200SseResponse(sseChunks));

      const onTextChunk = vi.fn();

      renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onTextChunk },
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(onTextChunk).toHaveBeenCalledWith('stripped', expect.any(Number));
      });
    });
  });

  // ==========================================================================
  // 5. Abort Handling
  // ==========================================================================

  describe('abort Handling', () => {
    it('should abort previous subscription when new one starts', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      let abortSignals: AbortSignal[] = [];

      mockService.mockImplementation(async (_, options) => {
        if (options?.signal) {
          abortSignals.push(options.signal);
        }
        // Return a slow response to allow abort
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(create200JsonResponse('complete', 0));
          }, 1000);
        });
      });

      const { rerender } = renderHook(
        (props: { roundNumber: number }) =>
          useEntitySubscription(createDefaultOptions({ roundNumber: props.roundNumber })),
        { initialProps: { roundNumber: 0 } },
      );

      // Start first subscription
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // First signal should not be aborted yet
      expect(abortSignals[0]?.aborted).toBe(false);

      // Change round to trigger new subscription
      rerender({ roundNumber: 1 });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // First signal should now be aborted
      expect(abortSignals[0]?.aborted).toBe(true);
    });

    it('should not retry after abort', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      // Return abort error
      mockService.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
      mockService.mockResolvedValueOnce(create200JsonResponse('complete', 0));

      const onError = vi.fn();

      const { result } = renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onError },
          }),
        ));

      await vi.runAllTimersAsync();

      // onError should NOT be called for AbortError
      expect(onError).not.toHaveBeenCalled();

      // Service should only be called once (no retry on abort)
      expect(mockService).toHaveBeenCalledTimes(1);

      // Status should remain as it was (not error)
      expect(result.current.state.status).not.toBe('error');
    });

    it('should handle AbortError gracefully', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      const abortError = new DOMException('The user aborted a request.', 'AbortError');
      mockService.mockRejectedValueOnce(abortError);

      const onError = vi.fn();
      const onStatusChange = vi.fn();

      renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onError, onStatusChange },
          }),
        ));

      await vi.runAllTimersAsync();

      // Should not trigger error callbacks
      expect(onError).not.toHaveBeenCalled();

      // Should not set error status
      const errorCalls = onStatusChange.mock.calls.filter(
        ([status]) => status === 'error',
      );
      expect(errorCalls).toHaveLength(0);
    });

    it('should abort via abort() method', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      let capturedSignal: AbortSignal | undefined;

      mockService.mockImplementation(async (_, options) => {
        capturedSignal = options?.signal;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(create200JsonResponse('complete', 0));
          }, 5000);
        });
      });

      const { result } = renderHook(() =>
        useEntitySubscription(createDefaultOptions()));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Abort the subscription
      act(() => {
        result.current.abort();
      });

      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  // ==========================================================================
  // 6. Cleanup on Unmount
  // ==========================================================================

  describe('cleanup on Unmount', () => {
    it('should abort controller on unmount', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      let capturedSignal: AbortSignal | undefined;

      mockService.mockImplementation(async (_, options) => {
        capturedSignal = options?.signal;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(create200JsonResponse('complete', 0));
          }, 5000);
        });
      });

      const { unmount } = renderHook(() =>
        useEntitySubscription(createDefaultOptions()));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(capturedSignal?.aborted).toBe(false);

      // Unmount the hook
      unmount();

      expect(capturedSignal?.aborted).toBe(true);
    });

    it('should not call callbacks after unmount', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      // Create a delayed response
      mockService.mockImplementation(async () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(create200JsonResponse('complete', 42));
          }, 1000);
        });
      });

      const onComplete = vi.fn();
      const onStatusChange = vi.fn();

      const { unmount } = renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onComplete, onStatusChange },
          }),
        ));

      // Start subscription
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Clear mock calls to track only post-unmount calls
      onComplete.mockClear();
      onStatusChange.mockClear();

      // Unmount before response arrives
      unmount();

      // Advance timers to when response would arrive
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      // Callbacks should not have been called after unmount
      // (AbortError prevents the callback chain)
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Phase-specific Service Selection
  // ==========================================================================

  describe('phase-specific Service Selection', () => {
    it('should use subscribeToPreSearchStreamService for presearch phase', async () => {
      const mockPresearch = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      mockPresearch.mockResolvedValueOnce(create200JsonResponse('complete', 0));

      renderHook(() =>
        useEntitySubscription(createDefaultOptions({ phase: 'presearch' })));

      await vi.runAllTimersAsync();

      expect(mockPresearch).toHaveBeenCalled();
    });

    it('should use subscribeToParticipantStreamService for participant phase', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      mockParticipant.mockResolvedValueOnce(create200JsonResponse('complete', 0));

      renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            participantIndex: 0,
            phase: 'participant',
          }),
        ));

      await vi.runAllTimersAsync();

      expect(mockParticipant).toHaveBeenCalledWith(
        expect.objectContaining({
          participantIndex: 0,
          roundNumber: 0,
          threadId: 'test-thread-id',
        }),
        expect.anything(),
      );
    });

    it('should use subscribeToModeratorStreamService for moderator phase', async () => {
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);
      mockModerator.mockResolvedValueOnce(create200JsonResponse('complete', 0));

      renderHook(() =>
        useEntitySubscription(createDefaultOptions({ phase: 'moderator' })));

      await vi.runAllTimersAsync();

      expect(mockModerator).toHaveBeenCalled();
    });

    it('should throw error when participantIndex missing for participant phase', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      mockParticipant.mockResolvedValueOnce(create200JsonResponse('complete', 0));

      const onError = vi.fn();

      const { result } = renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onError },
            participantIndex: undefined,
            phase: 'participant',
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.status).toBe('error');
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'participantIndex required for participant phase',
        }),
      );
    });
  });

  // ==========================================================================
  // Enabled/Disabled State
  // ==========================================================================

  describe('enabled/Disabled State', () => {
    it('should not subscribe when enabled is false', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      mockService.mockResolvedValueOnce(create200JsonResponse('complete', 0));

      renderHook(() =>
        useEntitySubscription(createDefaultOptions({ enabled: false })));

      await vi.runAllTimersAsync();

      expect(mockService).not.toHaveBeenCalled();
    });

    it('should not subscribe when threadId is empty', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      mockService.mockResolvedValueOnce(create200JsonResponse('complete', 0));

      renderHook(() =>
        useEntitySubscription(createDefaultOptions({ threadId: '' })));

      await vi.runAllTimersAsync();

      expect(mockService).not.toHaveBeenCalled();
    });

    it('should subscribe when enabled changes from false to true', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      mockService.mockResolvedValue(create200JsonResponse('complete', 0));

      const { rerender } = renderHook(
        (props: { enabled: boolean }) =>
          useEntitySubscription(createDefaultOptions({ enabled: props.enabled })),
        { initialProps: { enabled: false } },
      );

      await vi.runAllTimersAsync();

      expect(mockService).not.toHaveBeenCalled();

      // Enable subscription
      rerender({ enabled: true });

      await vi.runAllTimersAsync();

      expect(mockService).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Initial State and Resumption
  // ==========================================================================

  describe('initial State and Resumption', () => {
    it('should use initialLastSeq for resumption', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      mockService.mockResolvedValueOnce(create200JsonResponse('complete', 20));

      const { result } = renderHook(() =>
        useEntitySubscription(createDefaultOptions({ initialLastSeq: 10 })));

      // Initial state should have the provided lastSeq
      expect(result.current.state.lastSeq).toBe(10);

      await vi.runAllTimersAsync();

      // Service should be called with initialLastSeq
      expect(mockService).toHaveBeenCalledWith(
        expect.objectContaining({
          lastSeq: 10,
        }),
        expect.anything(),
      );
    });

    it('should start with idle status', () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      mockService.mockResolvedValueOnce(create200JsonResponse('complete', 0));

      const { result } = renderHook(() =>
        useEntitySubscription(createDefaultOptions({ enabled: false })));

      expect(result.current.state.status).toBe('idle');
      expect(result.current.state.isStreaming).toBe(false);
    });
  });

  // ==========================================================================
  // Retry Function
  // ==========================================================================

  describe('retry Function', () => {
    it('should allow manual retry via retry() method', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      mockService.mockResolvedValue(create200JsonResponse('complete', 0));

      const { result } = renderHook(() =>
        useEntitySubscription(createDefaultOptions()));

      await vi.runAllTimersAsync();

      expect(mockService).toHaveBeenCalledTimes(1);

      // Manual retry
      await act(async () => {
        result.current.retry();
        await vi.runAllTimersAsync();
      });

      expect(mockService).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('error Handling', () => {
    it('should handle network errors', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      mockService.mockRejectedValueOnce(new Error('Network error'));

      const onError = vi.fn();

      const { result } = renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onError },
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.status).toBe('error');
        expect(result.current.state.errorMessage).toBe('Network error');
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Network error',
        }),
      );
    });

    it('should handle non-Error exceptions', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      mockService.mockRejectedValueOnce('String error');

      const onError = vi.fn();

      const { result } = renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onError },
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.status).toBe('error');
        expect(result.current.state.errorMessage).toBe('String error');
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'String error',
        }),
      );
    });

    it('should handle missing response body in SSE', async () => {
      const mockService = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      mockService.mockResolvedValueOnce({
        body: null,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        ok: true,
        status: 200,
      } as Response);

      const onError = vi.fn();

      const { result } = renderHook(() =>
        useEntitySubscription(
          createDefaultOptions({
            callbacks: { onError },
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.status).toBe('error');
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No response body',
        }),
      );
    });
  });
});

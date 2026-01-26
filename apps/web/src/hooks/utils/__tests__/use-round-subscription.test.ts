/**
 * Round Subscription Hook Tests
 *
 * Comprehensive tests for the unified round subscription hook following
 * FLOW_DOCUMENTATION.md scenarios.
 *
 * Key scenarios from FLOW_DOCUMENTATION.md:
 *
 * 1. Frame 1→2: User Sends → Placeholders Appear
 *    - All entity subscriptions created (presearch?, P0-PN, moderator)
 *    - Phase tracking
 *
 * 2. Frame 3→4: P0 Streams → P1 Starts (Baton Passing)
 *    - Sequential entity completion detection
 *
 * 3. Frame 5→6: All Done → Moderator → Complete
 *    - Round completion detection
 *
 * 4. Round 2+: Web Search + Participant Flow
 *    - Pre-search blocking participants
 *
 * 5. Resumption Scenarios
 *    - User returns mid-P1
 *    - User returns after round complete
 *    - User returns mid-moderator
 *
 * @module hooks/utils/__tests__/use-round-subscription.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook, waitFor } from '@/lib/testing';
import * as apiServices from '@/services/api';

import type { UseRoundSubscriptionOptions } from '../use-round-subscription';
import { useRoundSubscription } from '../use-round-subscription';

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
    phase: vi.fn(),
    stream: vi.fn(),
    stuck: vi.fn(),
  },
}));

// ============================================================================
// Test Utilities
// ============================================================================

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

function create202WaitingResponse(retryAfter = 500): Response {
  return createMockResponse({
    contentType: 'application/json',
    json: () => Promise.resolve({
      data: { retryAfter, status: 'waiting' },
    }),
    status: 202,
  });
}

function create200CompleteResponse(lastSeq = 10): Response {
  return createMockResponse({
    contentType: 'application/json',
    json: () => Promise.resolve({
      data: { lastSeq, status: 'complete' },
    }),
    status: 200,
  });
}

function create200DisabledResponse(): Response {
  return createMockResponse({
    contentType: 'application/json',
    json: () => Promise.resolve({
      data: { message: 'Web search not enabled', status: 'disabled' },
    }),
    status: 200,
  });
}

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

function createDefaultOptions(
  overrides?: Partial<UseRoundSubscriptionOptions>,
): UseRoundSubscriptionOptions {
  return {
    enabled: true,
    enablePreSearch: false,
    participantCount: 2,
    roundNumber: 0,
    threadId: 'test-thread-id',
    ...overrides,
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('useRoundSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Frame 1→2: User Sends → ALL Placeholders Appear
  // ==========================================================================

  describe('Frame 1→2: User Sends → ALL Placeholders Appear', () => {
    it('should create subscriptions for all participants when enabled', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      renderHook(() =>
        useRoundSubscription(createDefaultOptions({ participantCount: 3 })));

      await vi.runAllTimersAsync();

      // Should create subscriptions for P0, P1, P2
      expect(mockParticipant).toHaveBeenCalledTimes(3);
      expect(mockParticipant).toHaveBeenCalledWith(
        expect.objectContaining({ participantIndex: 0 }),
        expect.anything(),
      );
      expect(mockParticipant).toHaveBeenCalledWith(
        expect.objectContaining({ participantIndex: 1 }),
        expect.anything(),
      );
      expect(mockParticipant).toHaveBeenCalledWith(
        expect.objectContaining({ participantIndex: 2 }),
        expect.anything(),
      );
    });

    it('should create presearch subscription when enabled', async () => {
      const mockPresearch = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockPresearch.mockResolvedValue(create200CompleteResponse());
      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            enablePreSearch: true,
            participantCount: 2,
          }),
        ));

      await vi.runAllTimersAsync();

      expect(mockPresearch).toHaveBeenCalledTimes(1);
    });

    it('should NOT create presearch subscription when disabled', async () => {
      const mockPresearch = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockPresearch.mockResolvedValue(create200CompleteResponse());
      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            enablePreSearch: false,
            participantCount: 2,
          }),
        ));

      await vi.runAllTimersAsync();

      expect(mockPresearch).not.toHaveBeenCalled();
    });

    it('should always create moderator subscription', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      renderHook(() =>
        useRoundSubscription(createDefaultOptions({ participantCount: 1 })));

      await vi.runAllTimersAsync();

      expect(mockModerator).toHaveBeenCalledTimes(1);
    });

    it('should not create subscriptions when disabled', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      renderHook(() =>
        useRoundSubscription(createDefaultOptions({ enabled: false })));

      await vi.runAllTimersAsync();

      expect(mockParticipant).not.toHaveBeenCalled();
      // Moderator subscription is still created but with enabled=false
    });
  });

  // ==========================================================================
  // Round Completion Detection
  // ==========================================================================

  describe('Round Completion Detection', () => {
    it('should detect round completion when all entities complete', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const onRoundComplete = vi.fn();

      const { result } = renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            onRoundComplete,
            participantCount: 2,
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.isRoundComplete).toBe(true);
      });

      expect(onRoundComplete).toHaveBeenCalledTimes(1);
    });

    it('should NOT mark round complete when only participants are done', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      // Moderator returns 202 waiting indefinitely
      mockModerator.mockResolvedValue(create202WaitingResponse());

      const onRoundComplete = vi.fn();

      const { result } = renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            onRoundComplete,
            participantCount: 2,
          }),
        ));

      await vi.runAllTimersAsync();

      // Participants complete but moderator is waiting
      expect(result.current.state.isRoundComplete).toBe(false);
      expect(onRoundComplete).not.toHaveBeenCalled();
    });

    it('should NOT mark round complete when only moderator is done', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      // Participants waiting
      mockParticipant.mockResolvedValue(create202WaitingResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const onRoundComplete = vi.fn();

      const { result } = renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            onRoundComplete,
            participantCount: 2,
          }),
        ));

      await vi.runAllTimersAsync();

      expect(result.current.state.isRoundComplete).toBe(false);
      expect(onRoundComplete).not.toHaveBeenCalled();
    });

    it('should treat error status as complete for round completion', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      // P0 completes, P1 errors
      let callCount = 0;
      mockParticipant.mockImplementation(async (params) => {
        if (params.participantIndex === 0) {
          return create200CompleteResponse();
        }
        // P1 returns error
        return createMockResponse({
          contentType: 'application/json',
          json: () => Promise.resolve({
            data: { lastSeq: 5, status: 'error' },
          }),
          status: 200,
        });
      });
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const onRoundComplete = vi.fn();

      const { result } = renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            onRoundComplete,
            participantCount: 2,
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.isRoundComplete).toBe(true);
      });

      expect(onRoundComplete).toHaveBeenCalledTimes(1);
    });

    it('should include presearch completion when enabled', async () => {
      const mockPresearch = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockPresearch.mockResolvedValue(create200CompleteResponse());
      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const onRoundComplete = vi.fn();

      const { result } = renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            enablePreSearch: true,
            onRoundComplete,
            participantCount: 1,
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.isRoundComplete).toBe(true);
      });

      expect(onRoundComplete).toHaveBeenCalledTimes(1);
    });

    it('should treat disabled presearch as complete', async () => {
      const mockPresearch = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      // Presearch returns disabled
      mockPresearch.mockResolvedValue(create200DisabledResponse());
      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const onRoundComplete = vi.fn();

      const { result } = renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            enablePreSearch: true,
            onRoundComplete,
            participantCount: 1,
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.isRoundComplete).toBe(true);
      });

      expect(onRoundComplete).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Entity Completion Callbacks
  // ==========================================================================

  describe('Entity Completion Callbacks', () => {
    it('should call onEntityComplete for each entity type', async () => {
      const mockPresearch = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockPresearch.mockResolvedValue(create200CompleteResponse(15));
      mockParticipant.mockResolvedValue(create200CompleteResponse(25));
      mockModerator.mockResolvedValue(create200CompleteResponse(35));

      const onEntityComplete = vi.fn();

      renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            enablePreSearch: true,
            onEntityComplete,
            participantCount: 2,
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        // presearch + 2 participants + moderator = 4 calls
        expect(onEntityComplete).toHaveBeenCalledTimes(4);
      });

      expect(onEntityComplete).toHaveBeenCalledWith('presearch', expect.any(Number));
      expect(onEntityComplete).toHaveBeenCalledWith('participant_0', expect.any(Number));
      expect(onEntityComplete).toHaveBeenCalledWith('participant_1', expect.any(Number));
      expect(onEntityComplete).toHaveBeenCalledWith('moderator', expect.any(Number));
    });

    it('should call onChunk for text streaming', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      const sseChunks = ['0:"Hello "\n', '0:"World!"\n'];
      mockParticipant.mockResolvedValue(create200SseResponse(sseChunks));
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const onChunk = vi.fn();

      renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            onChunk,
            participantCount: 1,
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(onChunk).toHaveBeenCalled();
      });

      // Should have received text chunks from participant_0
      const p0Calls = onChunk.mock.calls.filter(([entity]) => entity === 'participant_0');
      expect(p0Calls.length).toBeGreaterThan(0);
    });

    it('should call onEntityError when an entity errors', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockRejectedValue(new Error('Network error'));
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const onEntityError = vi.fn();

      renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            onEntityError,
            participantCount: 1,
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(onEntityError).toHaveBeenCalled();
      });

      expect(onEntityError).toHaveBeenCalledWith(
        'participant_0',
        expect.objectContaining({ message: 'Network error' }),
      );
    });
  });

  // ==========================================================================
  // Round Number Change Handling
  // ==========================================================================

  describe('Round Number Change Handling', () => {
    it('should reset round complete flag when round changes', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const onRoundComplete = vi.fn();

      const { rerender, result } = renderHook(
        (props: { roundNumber: number }) =>
          useRoundSubscription(
            createDefaultOptions({
              onRoundComplete,
              participantCount: 1,
              roundNumber: props.roundNumber,
            }),
          ),
        { initialProps: { roundNumber: 0 } },
      );

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.isRoundComplete).toBe(true);
      });

      expect(onRoundComplete).toHaveBeenCalledTimes(1);

      // Change to round 1
      rerender({ roundNumber: 1 });

      await vi.runAllTimersAsync();

      // Should call onRoundComplete again for round 1
      await waitFor(() => {
        expect(onRoundComplete).toHaveBeenCalledTimes(2);
      });
    });

    it('should not call onRoundComplete multiple times for same round', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const onRoundComplete = vi.fn();

      const { result } = renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            onRoundComplete,
            participantCount: 2,
          }),
        ));

      await vi.runAllTimersAsync();
      await vi.runAllTimersAsync();
      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.isRoundComplete).toBe(true);
      });

      // Should only be called once
      expect(onRoundComplete).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Abort and Retry
  // ==========================================================================

  describe('Abort and Retry', () => {
    it('should abort all subscriptions when abort() is called', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      let abortSignals: AbortSignal[] = [];

      mockParticipant.mockImplementation(async (_, options) => {
        if (options?.signal) {
          abortSignals.push(options.signal);
        }
        return new Promise((resolve) => {
          setTimeout(() => resolve(create200CompleteResponse()), 5000);
        });
      });

      mockModerator.mockImplementation(async (_, options) => {
        if (options?.signal) {
          abortSignals.push(options.signal);
        }
        return new Promise((resolve) => {
          setTimeout(() => resolve(create200CompleteResponse()), 5000);
        });
      });

      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ participantCount: 2 })));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // All signals should be created and not aborted
      expect(abortSignals.length).toBeGreaterThan(0);
      expect(abortSignals.every(s => !s.aborted)).toBe(true);

      // Abort all
      act(() => {
        result.current.abort();
      });

      // All signals should now be aborted
      expect(abortSignals.every(s => s.aborted)).toBe(true);
    });

    it('should allow retry of specific entity via retryEntity()', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ participantCount: 2 })));

      await vi.runAllTimersAsync();

      const initialCallCount = mockParticipant.mock.calls.length;

      // Retry participant_0
      act(() => {
        result.current.retryEntity('participant_0');
      });

      await vi.runAllTimersAsync();

      // Should have called the service again
      expect(mockParticipant.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  // ==========================================================================
  // State Tracking
  // ==========================================================================

  describe('State Tracking', () => {
    it('should track presearch state', async () => {
      const mockPresearch = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockPresearch.mockResolvedValue(create200CompleteResponse(10));
      mockParticipant.mockResolvedValue(create200CompleteResponse(20));
      mockModerator.mockResolvedValue(create200CompleteResponse(30));

      const { result } = renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            enablePreSearch: true,
            participantCount: 1,
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.presearch.status).toBe('complete');
        expect(result.current.state.presearch.lastSeq).toBe(10);
      });
    });

    it('should track participant states', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockImplementation(async (params) => {
        return create200CompleteResponse(10 + params.participantIndex * 10);
      });
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ participantCount: 3 })));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.participants).toHaveLength(3);
        expect(result.current.state.participants[0]?.status).toBe('complete');
        expect(result.current.state.participants[1]?.status).toBe('complete');
        expect(result.current.state.participants[2]?.status).toBe('complete');
      });
    });

    it('should track moderator state', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse(100));

      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ participantCount: 1 })));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.moderator.status).toBe('complete');
        expect(result.current.state.moderator.lastSeq).toBe(100);
      });
    });

    it('should track hasActiveStream correctly', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      // First response is SSE stream
      const sseChunks = ['0:"test"\n'];
      mockParticipant.mockResolvedValue(create200SseResponse(sseChunks));
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ participantCount: 1 })));

      // Initially or during stream, hasActiveStream might be true
      // After completion, it should be false
      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.isRoundComplete).toBe(true);
        expect(result.current.state.hasActiveStream).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle zero participants gracefully', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ participantCount: 0 })));

      await vi.runAllTimersAsync();

      expect(result.current.state.participants).toHaveLength(0);
      // With 0 participants, we need moderator to complete for round to complete
      // But the implementation guards against empty array (isRoundComplete requires participants.length > 0)
      expect(result.current.state.isRoundComplete).toBe(false);
    });

    it('should handle single participant', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const onRoundComplete = vi.fn();

      const { result } = renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            onRoundComplete,
            participantCount: 1,
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.isRoundComplete).toBe(true);
      });

      expect(onRoundComplete).toHaveBeenCalledTimes(1);
    });

    it('should handle maximum participants (10)', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ participantCount: 10 })));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(result.current.state.participants).toHaveLength(10);
        expect(result.current.state.isRoundComplete).toBe(true);
      });
    });

    it('should handle empty threadId', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      renderHook(() =>
        useRoundSubscription(createDefaultOptions({ threadId: '' })));

      await vi.runAllTimersAsync();

      // Should not make any calls with empty threadId
      expect(mockParticipant).not.toHaveBeenCalled();
    });
  });
});

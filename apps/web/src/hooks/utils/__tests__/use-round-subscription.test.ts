/**
 * Round Subscription Hook Tests
 *
 * Tests the unified round subscription hook that orchestrates
 * presearch, participant, and moderator subscriptions.
 *
 * Per FLOW_DOCUMENTATION.md: Frontend SUBSCRIBES and DISPLAYS only,
 * Backend ORCHESTRATES everything (P0 → P1 → ... → Moderator).
 *
 * Note: Detailed service behavior is tested in use-entity-subscription.test.ts.
 * These tests focus on the round-level orchestration and state aggregation.
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
      data: { status: 'disabled', message: 'Feature disabled' },
    }),
    status: 200,
  });
}

function createDefaultOptions(overrides?: Partial<UseRoundSubscriptionOptions>): UseRoundSubscriptionOptions {
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
  // Initial State
  // ==========================================================================

  describe('Initial State', () => {
    it('should have correct initial state when disabled', () => {
      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ enabled: false })));

      expect(result.current.state.presearch.status).toBe('idle');
      expect(result.current.state.participants).toHaveLength(2);
      expect(result.current.state.participants[0]?.status).toBe('idle');
      expect(result.current.state.participants[1]?.status).toBe('idle');
      expect(result.current.state.moderator.status).toBe('idle');
      expect(result.current.state.isRoundComplete).toBe(false);
      expect(result.current.state.hasActiveStream).toBe(false);
    });

    it('should track correct number of participants', () => {
      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ enabled: false, participantCount: 5 })));

      expect(result.current.state.participants).toHaveLength(5);
    });

    it('should handle zero participants', () => {
      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ enabled: false, participantCount: 0 })));

      expect(result.current.state.participants).toHaveLength(0);
      // isRoundComplete guards against empty participant array
      expect(result.current.state.isRoundComplete).toBe(false);
    });
  });

  // ==========================================================================
  // Subscription Creation
  // ==========================================================================

  describe('Subscription Creation', () => {
    it('should call participant services for each participant', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      renderHook(() =>
        useRoundSubscription(createDefaultOptions({ participantCount: 3 })));

      await vi.runAllTimersAsync();

      // Should be called for each participant (3)
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

    it('should call presearch service when enabled', async () => {
      const mockPresearch = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockPresearch.mockResolvedValue(create200CompleteResponse());
      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      renderHook(() =>
        useRoundSubscription(createDefaultOptions({ enablePreSearch: true })));

      await vi.runAllTimersAsync();

      expect(mockPresearch).toHaveBeenCalled();
    });

    it('should not call presearch service when disabled', async () => {
      const mockPresearch = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      renderHook(() =>
        useRoundSubscription(createDefaultOptions({ enablePreSearch: false })));

      await vi.runAllTimersAsync();

      expect(mockPresearch).not.toHaveBeenCalled();
    });

    it('should not call services when disabled', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      renderHook(() =>
        useRoundSubscription(createDefaultOptions({ enabled: false })));

      await vi.runAllTimersAsync();

      expect(mockParticipant).not.toHaveBeenCalled();
      expect(mockModerator).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Round Completion
  // ==========================================================================

  describe('Round Completion', () => {
    it('should detect round complete when all entities complete', async () => {
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
      }, { timeout: 5000 });
    });

    it('should call onRoundComplete callback when round completes', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const onRoundComplete = vi.fn();

      renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            onRoundComplete,
            participantCount: 1,
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(onRoundComplete).toHaveBeenCalledTimes(1);
      }, { timeout: 5000 });
    });

    it('should not call onRoundComplete more than once per round', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const onRoundComplete = vi.fn();

      const { rerender } = renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            onRoundComplete,
            participantCount: 1,
          }),
        ));

      await vi.runAllTimersAsync();

      // Rerender to trigger any potential duplicate calls
      rerender();
      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(onRoundComplete).toHaveBeenCalledTimes(1);
      }, { timeout: 5000 });
    });
  });

  // ==========================================================================
  // Presearch Skip
  // ==========================================================================

  describe('Presearch Skip', () => {
    it('should treat disabled presearch as complete for round completion', async () => {
      const mockPresearch = vi.mocked(apiServices.subscribeToPreSearchStreamService);
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      // Presearch returns disabled
      mockPresearch.mockResolvedValue(create200DisabledResponse());
      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const { result } = renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            enablePreSearch: true,
            participantCount: 1,
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        // Presearch disabled counts as complete for round completion
        expect(result.current.state.presearch.status).toBe('disabled');
        expect(result.current.state.isRoundComplete).toBe(true);
      }, { timeout: 5000 });
    });
  });

  // ==========================================================================
  // Callbacks
  // ==========================================================================

  describe('Callbacks', () => {
    it('should call onEntityComplete for each entity', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse(20));
      mockModerator.mockResolvedValue(create200CompleteResponse(30));

      const onEntityComplete = vi.fn();

      renderHook(() =>
        useRoundSubscription(
          createDefaultOptions({
            onEntityComplete,
            participantCount: 1,
          }),
        ));

      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(onEntityComplete).toHaveBeenCalledWith('participant_0', 20);
        expect(onEntityComplete).toHaveBeenCalledWith('moderator', 30);
      }, { timeout: 5000 });
    });
  });

  // ==========================================================================
  // Abort
  // ==========================================================================

  describe('Abort', () => {
    it('should provide abort function', () => {
      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ enabled: false })));

      expect(typeof result.current.abort).toBe('function');
    });

    it('should provide retryEntity function', () => {
      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ enabled: false })));

      expect(typeof result.current.retryEntity).toBe('function');
    });
  });

  // ==========================================================================
  // Round Number Reset
  // ==========================================================================

  describe('Round Number Change', () => {
    it('should reset hasCalledRoundComplete when round changes', async () => {
      const mockParticipant = vi.mocked(apiServices.subscribeToParticipantStreamService);
      const mockModerator = vi.mocked(apiServices.subscribeToModeratorStreamService);

      mockParticipant.mockResolvedValue(create200CompleteResponse());
      mockModerator.mockResolvedValue(create200CompleteResponse());

      const onRoundComplete = vi.fn();

      const { rerender } = renderHook(
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
        expect(onRoundComplete).toHaveBeenCalledTimes(1);
      }, { timeout: 5000 });

      // Change round number - should allow callback to be called again
      rerender({ roundNumber: 1 });
      await vi.runAllTimersAsync();

      await waitFor(() => {
        expect(onRoundComplete).toHaveBeenCalledTimes(2);
      }, { timeout: 5000 });
    });
  });
});

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

import { renderHook } from '@/lib/testing';
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
    changelog: vi.fn(),
    disable: vi.fn(),
    disableVerbose: vi.fn(),
    enable: vi.fn(),
    enableVerbose: vi.fn(),
    flow: vi.fn(),
    frame: vi.fn(),
    gate: vi.fn(),
    getVerboseResume: vi.fn(),
    handoff: vi.fn(),
    init: vi.fn(),
    isEnabled: vi.fn(),
    logDedupeStats: vi.fn(),
    moderator: vi.fn(),
    msg: vi.fn(),
    phase: vi.fn(),
    presearch: vi.fn(),
    race: vi.fn(),
    resume: vi.fn(),
    resumeAlways: vi.fn(),
    setVerboseResume: vi.fn(),
    state: vi.fn(),
    stream: vi.fn(),
    stuck: vi.fn(),
    submit: vi.fn(),
    sync: vi.fn(),
    trigger: vi.fn(),
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

function _create200DisabledResponse(): Response {
  return createMockResponse({
    contentType: 'application/json',
    json: () => Promise.resolve({
      data: { message: 'Feature disabled', status: 'disabled' },
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

  describe('initial State', () => {
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

  describe('subscription Creation', () => {
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

      expect(mockPresearch).toHaveBeenCalledWith();
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
  // Abort
  // ==========================================================================

  describe('abort', () => {
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
  // State Computation
  // ==========================================================================

  describe('state Computation', () => {
    it('should compute isRoundComplete correctly when all entities idle (incomplete)', () => {
      // With enabled=false, all entities stay idle
      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ enabled: false, participantCount: 2 })));

      // Idle entities are NOT complete
      expect(result.current.state.isRoundComplete).toBe(false);
    });

    it('should compute hasActiveStream correctly when no streams active', () => {
      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ enabled: false })));

      expect(result.current.state.hasActiveStream).toBe(false);
    });

    it('should require participants.length > 0 for round completion', () => {
      // Zero participants guard - prevents false completion
      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ enabled: false, participantCount: 0 })));

      // Even if moderator is complete-ish, empty participants array = not complete
      expect(result.current.state.isRoundComplete).toBe(false);
    });
  });

  // ==========================================================================
  // Presearch Toggle Behavior
  // ==========================================================================

  describe('presearch Toggle', () => {
    it('should not call presearch when disabled but include in state', () => {
      const mockPresearch = vi.mocked(apiServices.subscribeToPreSearchStreamService);

      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ enabled: false, enablePreSearch: false })));

      expect(mockPresearch).not.toHaveBeenCalled();
      // Presearch state should still exist but be idle
      expect(result.current.state.presearch.status).toBe('idle');
    });

    it('should treat disabled presearch as complete for isRoundComplete logic', () => {
      // When enablePreSearch is false, presearch doesn't affect round completion
      // The state computation uses: !enablePreSearch || presearch.status === 'complete' || presearch.status === 'disabled'
      const { result } = renderHook(() =>
        useRoundSubscription(createDefaultOptions({ enabled: false, enablePreSearch: false, participantCount: 0 })));

      // Presearch complete = true (since enablePreSearch is false)
      // But participants.length === 0, so isRoundComplete = false
      expect(result.current.state.isRoundComplete).toBe(false);
    });
  });
});

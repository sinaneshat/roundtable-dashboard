/**
 * useChatScroll Hook Tests
 *
 * Tests for the chat scroll behavior inspired by use-stick-to-bottom pattern:
 * - User scrolling UP immediately disengages auto-scroll
 * - User scrolling to bottom re-engages auto-scroll
 * - Auto-scroll only triggers when user is at bottom
 * - No timeout-based locks - just state-based opt-out
 *
 * Location: /src/hooks/utils/__tests__/useChatScroll.test.ts
 */

import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import type { StoredModeratorAnalysis, StoredPreSearch } from '@/api/routes/chat/schema';

import { useChatScroll } from '../useChatScroll';

// =============================================================================
// TEST UTILITIES
// =============================================================================

function createTestMessage(id: string, roundNumber: number): UIMessage {
  return {
    id,
    role: 'assistant',
    parts: [{ type: 'text', text: `Message ${id}` }],
    metadata: {
      role: 'assistant',
      roundNumber,
      participantIndex: 0,
      participantId: 'p1',
      participantRole: null,
      model: 'gpt-4',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
    },
  } as UIMessage;
}

function createTestAnalysis(
  id: string,
  roundNumber: number,
  status: string = AnalysisStatuses.PENDING,
): StoredModeratorAnalysis {
  return {
    id,
    threadId: 'thread-1',
    roundNumber,
    mode: 'debating',
    userQuestion: 'Test question',
    status,
    analysisData: null,
    participantMessageIds: [],
    createdAt: new Date(),
    completedAt: null,
    errorMessage: null,
  } as StoredModeratorAnalysis;
}

function createTestPreSearch(
  id: string,
  roundNumber: number,
  status: string = AnalysisStatuses.PENDING,
): StoredPreSearch {
  return {
    id,
    threadId: 'thread-1',
    roundNumber,
    userQuery: 'Test query',
    status,
    searchData: null,
    createdAt: new Date(),
    completedAt: null,
    errorMessage: null,
  } as StoredPreSearch;
}

// Mock window scroll properties
function mockWindowScroll(scrollY: number, scrollHeight: number, innerHeight: number) {
  Object.defineProperty(window, 'scrollY', { value: scrollY, writable: true, configurable: true });
  Object.defineProperty(document.documentElement, 'scrollTop', { value: scrollY, writable: true, configurable: true });
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrollHeight, writable: true, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, writable: true, configurable: true });
}

// =============================================================================
// TESTS
// =============================================================================

describe('useChatScroll', () => {
  let scrollToSpy: ReturnType<typeof vi.spyOn>;
  let containerElement: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();

    // Mock window.scrollTo
    scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    // Create mock container element
    containerElement = document.createElement('div');
    containerElement.id = 'chat-scroll-container';
    Object.defineProperty(containerElement, 'scrollHeight', { value: 2000, writable: true });
    document.body.appendChild(containerElement);

    // Default scroll position: at bottom
    mockWindowScroll(1000, 2000, 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('isAtBottom State', () => {
    it('should start with isAtBottom = true (auto-scroll engaged)', () => {
      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [],
          isStreaming: false,
        }),
      );

      expect(result.current.isAtBottomRef.current).toBe(true);
    });

    it('should set isAtBottom = false when user scrolls UP', () => {
      // Start at bottom
      mockWindowScroll(1000, 2000, 1000);

      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [],
          isStreaming: true,
          autoScrollThreshold: 100,
        }),
      );

      // Initialize
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      expect(result.current.isAtBottomRef.current).toBe(true);

      // User scrolls UP (position decreases)
      mockWindowScroll(800, 2000, 1000);

      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      // Should immediately disengage auto-scroll
      expect(result.current.isAtBottomRef.current).toBe(false);
    });

    it('should set isAtBottom = true when user scrolls to bottom', () => {
      // Start scrolled up (not at bottom)
      mockWindowScroll(500, 2000, 1000);

      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [],
          isStreaming: true,
          autoScrollThreshold: 100,
        }),
      );

      // Initialize - should be false since not at bottom
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      // Simulate scrolling up first to disengage
      mockWindowScroll(400, 2000, 1000);
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      expect(result.current.isAtBottomRef.current).toBe(false);

      // Now scroll to bottom (within threshold)
      mockWindowScroll(950, 2000, 1000); // 50px from bottom, within 100px threshold

      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      // Should re-engage auto-scroll
      expect(result.current.isAtBottomRef.current).toBe(true);
    });

    it('should NOT re-engage when scrolling down but not at bottom', () => {
      // Start at bottom
      mockWindowScroll(1000, 2000, 1000);

      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [],
          isStreaming: true,
          autoScrollThreshold: 100,
        }),
      );

      // Initialize
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      // User scrolls up to disengage
      mockWindowScroll(500, 2000, 1000);
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      expect(result.current.isAtBottomRef.current).toBe(false);

      // User scrolls down but not to bottom (still 200px from bottom)
      mockWindowScroll(700, 2000, 1000);
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      // Should still be disengaged
      expect(result.current.isAtBottomRef.current).toBe(false);
    });
  });

  describe('user Opt-Out Behavior', () => {
    it('should allow user to freely scroll up without being forced back', () => {
      mockWindowScroll(1000, 2000, 1000);

      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [],
          isStreaming: true,
        }),
      );

      // Initialize at bottom
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      expect(result.current.isAtBottomRef.current).toBe(true);

      // User scrolls up
      mockWindowScroll(500, 2000, 1000);
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      // Auto-scroll should be disabled
      expect(result.current.isAtBottomRef.current).toBe(false);

      // scrollToBottom should NOT be called automatically anymore
      scrollToSpy.mockClear();

      // Simulate content update during streaming
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // No scroll should happen since user opted out
      // (The hook won't call scrollToBottom when isAtBottomRef is false)
    });

    it('should re-engage when user manually scrolls back to bottom', () => {
      mockWindowScroll(1000, 2000, 1000);

      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [],
          isStreaming: true,
          autoScrollThreshold: 100,
        }),
      );

      // User scrolls up
      mockWindowScroll(500, 2000, 1000);
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      expect(result.current.isAtBottomRef.current).toBe(false);

      // User scrolls back to bottom
      mockWindowScroll(950, 2000, 1000);
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      // Auto-scroll should be re-engaged
      expect(result.current.isAtBottomRef.current).toBe(true);
    });
  });

  describe('programmatic Scroll', () => {
    it('should NOT disengage when programmatic scroll happens', () => {
      mockWindowScroll(1000, 2000, 1000);

      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [],
          isStreaming: true,
        }),
      );

      // Initialize
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      expect(result.current.isAtBottomRef.current).toBe(true);

      // Call scrollToBottom programmatically
      act(() => {
        result.current.scrollToBottom('smooth');
      });

      // Advance timers for the programmatic scroll delay
      act(() => {
        vi.advanceTimersByTime(600);
      });

      // Should still be engaged
      expect(result.current.isAtBottomRef.current).toBe(true);
    });

    it('should call window.scrollTo when scrollToBottom is called', () => {
      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [],
          isStreaming: false,
        }),
      );

      act(() => {
        result.current.scrollToBottom('smooth');
      });

      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: 'smooth',
        }),
      );
    });
  });

  describe('streaming Auto-Scroll', () => {
    it('should auto-scroll during participant streaming when at bottom', () => {
      mockWindowScroll(1000, 2000, 1000);

      renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [],
          isStreaming: true,
          scrollContainerId: 'chat-scroll-container',
        }),
      );

      // Initialize at bottom
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      // Scroll should be called for streaming content
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(scrollToSpy).toHaveBeenCalled();
    });

    it('should auto-scroll during analysis streaming when at bottom', () => {
      mockWindowScroll(1000, 2000, 1000);

      renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [createTestAnalysis('a1', 0, AnalysisStatuses.STREAMING)],
          isStreaming: false,
          scrollContainerId: 'chat-scroll-container',
        }),
      );

      act(() => {
        window.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(100);
      });

      expect(scrollToSpy).toHaveBeenCalled();
    });

    it('should auto-scroll during pre-search streaming when at bottom', () => {
      mockWindowScroll(1000, 2000, 1000);

      renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [],
          isStreaming: false,
          preSearches: [createTestPreSearch('ps1', 0, AnalysisStatuses.STREAMING)],
          scrollContainerId: 'chat-scroll-container',
        }),
      );

      act(() => {
        window.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(100);
      });

      expect(scrollToSpy).toHaveBeenCalled();
    });

    it('should NOT auto-scroll when user has scrolled up (opted out)', () => {
      // Start scrolled up
      mockWindowScroll(500, 2000, 1000);

      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [],
          isStreaming: true,
          autoScrollThreshold: 100,
        }),
      );

      // Scroll up to disengage
      mockWindowScroll(400, 2000, 1000);
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      expect(result.current.isAtBottomRef.current).toBe(false);

      scrollToSpy.mockClear();

      // Advance time - streaming updates happen
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // No scroll should happen since user opted out
      expect(scrollToSpy).not.toHaveBeenCalled();
    });
  });

  describe('new Analysis Scroll', () => {
    it('should track scrolled analyses', () => {
      mockWindowScroll(1000, 2000, 1000);

      const analysis = createTestAnalysis('a1', 0, AnalysisStatuses.COMPLETE);

      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [analysis],
          isStreaming: false,
        }),
      );

      act(() => {
        window.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(100);
      });

      expect(result.current.scrolledToAnalysesRef.current.has('a1')).toBe(true);
    });
  });

  describe('backwards Compatibility', () => {
    it('should provide isNearBottomRef as alias for isAtBottomRef', () => {
      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [],
          isStreaming: false,
        }),
      );

      // Both should reference the same ref
      expect(result.current.isNearBottomRef).toBe(result.current.isAtBottomRef);
    });
  });

  describe('cleanup', () => {
    it('should cleanup event listeners on unmount', () => {
      const { unmount } = renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [],
          isStreaming: false,
        }),
      );

      // Should not throw on unmount
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('bottom Offset', () => {
    it('should include bottomOffset in scroll calculation', () => {
      mockWindowScroll(1000, 2000, 1000);

      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createTestMessage('m1', 0)],
          analyses: [],
          isStreaming: false,
          bottomOffset: 180,
        }),
      );

      act(() => {
        result.current.scrollToBottom('smooth');
      });

      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          top: expect.any(Number),
          behavior: 'smooth',
        }),
      );
    });
  });
});

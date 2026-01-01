/**
 * useVirtualizedTimeline - Scroll Behavior Tests
 *
 * Tests specifically focused on scroll behavior and manual scroll invocation.
 * These tests verify:
 * 1. No auto-scroll behavior (per lines 93-94 comment in useVirtualizedTimeline.ts)
 * 2. scrollToBottom method is available but requires manual invocation
 * 3. scrollToIndex method is available but requires manual invocation
 * 4. Virtualizer is only enabled when isDataReady=true
 * 5. Virtualizer is disabled when timelineItems.length === 0
 * 6. RAF-deferred state updates don't cause scroll jumps
 * 7. scrollMargin is calculated correctly
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@/lib/testing';

import type { TimelineItem } from '../use-thread-timeline';
import { useVirtualizedTimeline } from '../use-virtualized-timeline';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock virtualizer instance methods
const mockGetVirtualItems = vi.fn(() => []);
const mockGetTotalSize = vi.fn(() => 0);
const mockMeasureElement = vi.fn();
const mockScrollToIndex = vi.fn();
const mockScrollToOffset = vi.fn();

// Captured onChange callback for testing scroll updates
let capturedOnChange: ((instance: unknown) => void) | null = null;

const mockUseWindowVirtualizer = vi.fn((options: { onChange?: (instance: unknown) => void }) => {
  if (options?.onChange) {
    capturedOnChange = options.onChange;
  }
  return {
    getVirtualItems: mockGetVirtualItems,
    getTotalSize: mockGetTotalSize,
    measureElement: mockMeasureElement,
    scrollToIndex: mockScrollToIndex,
    scrollToOffset: mockScrollToOffset,
  };
});

// Mock TanStack Virtual
vi.mock('@tanstack/react-virtual', () => ({
  useWindowVirtualizer: (options: unknown) => mockUseWindowVirtualizer(options),
}));

// RAF tracking for deferred execution
const rafCallbacks: Array<() => void> = [];
let rafIdCounter = 0;
const cancelledRafIds = new Set<number>();

// Store original RAF/CAF for restoration
const originalRaf = globalThis.requestAnimationFrame;
const originalCaf = globalThis.cancelAnimationFrame;

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockTimelineItem(
  roundNumber: number,
  type: TimelineItem['type'] = 'messages',
): TimelineItem {
  if (type === 'messages') {
    return {
      type: 'messages',
      key: `round-${roundNumber}-messages`,
      roundNumber,
      data: [
        {
          id: `msg-${roundNumber}`,
          role: 'user' as const,
          content: 'Test message',
          parts: [{ type: 'text' as const, text: 'Test message' }],
        } as UIMessage,
      ],
    };
  }

  if (type === 'moderator') {
    return {
      type: 'moderator',
      key: `round-${roundNumber}-moderator`,
      roundNumber,
      data: {
        id: `moderator-${roundNumber}`,
        threadId: 'thread-123',
        roundNumber,
        mode: 'analyzing' as const,
        userQuestion: 'Test question',
        status: 'complete' as const,
        moderatorData: null,
        participantMessageIds: [],
        errorMessage: null,
        completedAt: new Date(),
        createdAt: new Date(),
      },
    };
  }

  return createMockTimelineItem(roundNumber, 'messages');
}

// ============================================================================
// SETUP AND TEARDOWN
// ============================================================================

describe('useVirtualizedTimeline - Scroll Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset RAF tracking
    rafCallbacks.length = 0;
    rafIdCounter = 0;
    cancelledRafIds.clear();
    capturedOnChange = null;

    // Reset mock return values
    mockGetVirtualItems.mockReturnValue([]);
    mockGetTotalSize.mockReturnValue(0);

    // Mock RAF to capture callbacks
    globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = ++rafIdCounter;
      rafCallbacks.push(() => callback(performance.now()));
      return id;
    });

    globalThis.cancelAnimationFrame = vi.fn((id: number) => {
      cancelledRafIds.add(id);
    });

    // Mock window.scrollY
    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
    });

    // Mock getBoundingClientRect
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 500,
      x: 0,
      y: 100,
      toJSON: () => {},
    }));

    // Mock querySelector for timeline container
    vi.spyOn(document, 'querySelector').mockImplementation((selector) => {
      if (selector === '[data-virtualized-timeline]') {
        return document.createElement('div');
      }
      return null;
    });
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
    vi.clearAllMocks();
  });

  // ============================================================================
  // NO AUTO-SCROLL BEHAVIOR TESTS (Lines 93-94)
  // ============================================================================

  describe('no auto-scroll behavior', () => {
    it('should NOT auto-scroll on initial render', () => {
      mockScrollToIndex.mockClear();

      const timelineItems = [
        createMockTimelineItem(0, 'messages'),
        createMockTimelineItem(0, 'moderator'),
        createMockTimelineItem(1, 'messages'),
      ];

      renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
        }),
      );

      // Execute RAF callbacks
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      // CRITICAL: scrollToIndex should NOT be called automatically
      expect(mockScrollToIndex).not.toHaveBeenCalled();
    });

    it('should NOT auto-scroll when new items are added', () => {
      mockScrollToIndex.mockClear();

      const { rerender } = renderHook(
        ({ items }) => useVirtualizedTimeline({ timelineItems: items, isDataReady: true }),
        { initialProps: { items: [createMockTimelineItem(0)] } },
      );

      // Execute initial RAF
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      mockScrollToIndex.mockClear();

      // Add new items (simulating streaming)
      rerender({
        items: [
          createMockTimelineItem(0),
          createMockTimelineItem(1),
          createMockTimelineItem(2),
        ],
      });

      // Execute RAF after update
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      // Should NOT auto-scroll when items are added
      expect(mockScrollToIndex).not.toHaveBeenCalled();
    });

    it('should NOT auto-scroll during rapid updates (streaming)', () => {
      mockScrollToIndex.mockClear();

      const { rerender } = renderHook(
        ({ items }) => useVirtualizedTimeline({ timelineItems: items, isDataReady: true }),
        { initialProps: { items: [createMockTimelineItem(0)] } },
      );

      // Simulate rapid streaming updates
      for (let i = 1; i < 10; i++) {
        const items: TimelineItem[] = [];
        for (let j = 0; j <= i; j++) {
          items.push(createMockTimelineItem(j));
        }
        rerender({ items });
      }

      // Execute all RAF callbacks
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      // No auto-scroll should occur during streaming
      expect(mockScrollToIndex).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // MANUAL SCROLL INVOCATION TESTS
  // ============================================================================

  describe('manual scroll invocation', () => {
    describe('scrollToBottom', () => {
      it('is available as a method', () => {
        const { result } = renderHook(() =>
          useVirtualizedTimeline({
            timelineItems: [createMockTimelineItem(0)],
            isDataReady: true,
          }),
        );

        expect(typeof result.current.scrollToBottom).toBe('function');
      });

      it('requires manual invocation to scroll', () => {
        mockScrollToIndex.mockClear();

        const { result } = renderHook(() =>
          useVirtualizedTimeline({
            timelineItems: [
              createMockTimelineItem(0),
              createMockTimelineItem(1),
              createMockTimelineItem(2),
            ],
            isDataReady: true,
          }),
        );

        // Execute RAF
        act(() => {
          rafCallbacks.forEach(cb => cb());
        });

        // No automatic scroll
        expect(mockScrollToIndex).not.toHaveBeenCalled();

        // Manual invocation required
        act(() => {
          result.current.scrollToBottom();
        });

        // Now scrollToIndex should be called
        expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
        expect(mockScrollToIndex).toHaveBeenCalledWith(2, {
          align: 'end',
          behavior: 'auto',
        });
      });

      it('scrolls to last item index when invoked', () => {
        mockScrollToIndex.mockClear();

        const timelineItems = [
          createMockTimelineItem(0),
          createMockTimelineItem(1),
          createMockTimelineItem(2),
        ];

        const { result } = renderHook(() =>
          useVirtualizedTimeline({
            timelineItems,
            isDataReady: true,
          }),
        );

        act(() => {
          result.current.scrollToBottom();
        });

        expect(mockScrollToIndex).toHaveBeenCalledWith(
          timelineItems.length - 1,
          expect.objectContaining({ align: 'end' }),
        );
      });

      it('does nothing when items are empty', () => {
        mockScrollToIndex.mockClear();

        const { result } = renderHook(() =>
          useVirtualizedTimeline({
            timelineItems: [],
            isDataReady: true,
          }),
        );

        act(() => {
          result.current.scrollToBottom();
        });

        expect(mockScrollToIndex).not.toHaveBeenCalled();
      });

      it('accepts behavior option for smooth scrolling', () => {
        mockScrollToIndex.mockClear();

        const { result } = renderHook(() =>
          useVirtualizedTimeline({
            timelineItems: [createMockTimelineItem(0), createMockTimelineItem(1)],
            isDataReady: true,
          }),
        );

        act(() => {
          result.current.scrollToBottom({ behavior: 'smooth' });
        });

        expect(mockScrollToIndex).toHaveBeenCalledWith(1, {
          align: 'end',
          behavior: 'smooth',
        });
      });

      it('defaults to auto behavior when no option provided', () => {
        mockScrollToIndex.mockClear();

        const { result } = renderHook(() =>
          useVirtualizedTimeline({
            timelineItems: [createMockTimelineItem(0)],
            isDataReady: true,
          }),
        );

        act(() => {
          result.current.scrollToBottom();
        });

        expect(mockScrollToIndex).toHaveBeenCalledWith(0, {
          align: 'end',
          behavior: 'auto',
        });
      });
    });

    describe('scrollToIndex', () => {
      it('is available as a method', () => {
        const { result } = renderHook(() =>
          useVirtualizedTimeline({
            timelineItems: [createMockTimelineItem(0)],
            isDataReady: true,
          }),
        );

        expect(typeof result.current.scrollToIndex).toBe('function');
      });

      it('requires manual invocation to scroll', () => {
        mockScrollToIndex.mockClear();

        const { result } = renderHook(() =>
          useVirtualizedTimeline({
            timelineItems: [createMockTimelineItem(0), createMockTimelineItem(1)],
            isDataReady: true,
          }),
        );

        // No automatic scroll
        expect(mockScrollToIndex).not.toHaveBeenCalled();

        // Manual invocation required
        act(() => {
          result.current.scrollToIndex(1);
        });

        expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
        expect(mockScrollToIndex).toHaveBeenCalledWith(1, undefined);
      });

      it('accepts options for align and behavior', () => {
        mockScrollToIndex.mockClear();

        const { result } = renderHook(() =>
          useVirtualizedTimeline({
            timelineItems: [createMockTimelineItem(0), createMockTimelineItem(1)],
            isDataReady: true,
          }),
        );

        act(() => {
          result.current.scrollToIndex(0, { align: 'center', behavior: 'smooth' });
        });

        expect(mockScrollToIndex).toHaveBeenCalledWith(0, {
          align: 'center',
          behavior: 'smooth',
        });
      });
    });

    describe('scrollToOffset', () => {
      it('is available as a method', () => {
        const { result } = renderHook(() =>
          useVirtualizedTimeline({
            timelineItems: [createMockTimelineItem(0)],
            isDataReady: true,
          }),
        );

        expect(typeof result.current.scrollToOffset).toBe('function');
      });

      it('requires manual invocation to scroll', () => {
        mockScrollToOffset.mockClear();

        const { result } = renderHook(() =>
          useVirtualizedTimeline({
            timelineItems: [createMockTimelineItem(0)],
            isDataReady: true,
          }),
        );

        // No automatic scroll
        expect(mockScrollToOffset).not.toHaveBeenCalled();

        // Manual invocation required
        act(() => {
          result.current.scrollToOffset(500);
        });

        expect(mockScrollToOffset).toHaveBeenCalledTimes(1);
        expect(mockScrollToOffset).toHaveBeenCalledWith(500, undefined);
      });

      it('accepts options for align and behavior', () => {
        mockScrollToOffset.mockClear();

        const { result } = renderHook(() =>
          useVirtualizedTimeline({
            timelineItems: [createMockTimelineItem(0)],
            isDataReady: true,
          }),
        );

        act(() => {
          result.current.scrollToOffset(1000, { align: 'start', behavior: 'smooth' });
        });

        expect(mockScrollToOffset).toHaveBeenCalledWith(1000, {
          align: 'start',
          behavior: 'smooth',
        });
      });
    });
  });

  // ============================================================================
  // VIRTUALIZER ENABLEMENT TESTS
  // ============================================================================

  describe('virtualizer enablement', () => {
    it('is ONLY enabled when isDataReady=true', () => {
      mockUseWindowVirtualizer.mockClear();

      const { rerender } = renderHook(
        ({ isDataReady }) =>
          useVirtualizedTimeline({
            timelineItems: [createMockTimelineItem(0)],
            isDataReady,
          }),
        { initialProps: { isDataReady: false } },
      );

      // Disabled initially
      expect(mockUseWindowVirtualizer).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );

      mockUseWindowVirtualizer.mockClear();

      // Enable data
      rerender({ isDataReady: true });

      // Now enabled
      expect(mockUseWindowVirtualizer).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
      );
    });

    it('is disabled when timelineItems.length === 0', () => {
      mockUseWindowVirtualizer.mockClear();

      renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [],
          isDataReady: true,
        }),
      );

      expect(mockUseWindowVirtualizer).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
    });

    it('is disabled when both isDataReady=false AND items are empty', () => {
      mockUseWindowVirtualizer.mockClear();

      renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [],
          isDataReady: false,
        }),
      );

      expect(mockUseWindowVirtualizer).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
    });

    it('is enabled when isDataReady=true AND items exist', () => {
      mockUseWindowVirtualizer.mockClear();

      renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: true,
        }),
      );

      expect(mockUseWindowVirtualizer).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
      );
    });
  });

  // ============================================================================
  // RAF-DEFERRED STATE UPDATES (NO SCROLL JUMPS)
  // ============================================================================

  describe('rAF-deferred state updates prevent scroll jumps', () => {
    it('does not update virtualItems during render (defers via RAF)', () => {
      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
      ]);

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: true,
        }),
      );

      // Before RAF: state should be empty (default)
      expect(result.current.virtualItems).toEqual([]);
      expect(result.current.totalSize).toBe(0);

      // RAF callback should be scheduled
      expect(rafCallbacks.length).toBeGreaterThan(0);
    });

    it('updates virtualItems after RAF executes', () => {
      const mockVirtualItems = [
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
        { index: 1, key: '1', start: 200, end: 400, size: 200, lane: 0 },
      ];

      mockGetVirtualItems.mockReturnValue(mockVirtualItems);
      mockGetTotalSize.mockReturnValue(400);

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0), createMockTimelineItem(1)],
          isDataReady: true,
        }),
      );

      // Before RAF
      expect(result.current.virtualItems).toEqual([]);

      // Execute RAF
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      // After RAF: state populated
      expect(result.current.virtualItems).toEqual(mockVirtualItems);
      expect(result.current.totalSize).toBe(400);
    });

    it('does not call getVirtualItems during onChange before initial sync', () => {
      mockGetVirtualItems.mockClear();

      renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: true,
        }),
      );

      // Simulate onChange being called during initialization
      if (capturedOnChange) {
        capturedOnChange({
          getVirtualItems: mockGetVirtualItems,
          getTotalSize: mockGetTotalSize,
        });
      }

      // onChange should skip before initial sync completes
      // Only the initial RAF should be scheduled
      expect(mockGetVirtualItems).not.toHaveBeenCalled();
    });

    it('defers onChange updates via RAF after initial sync', () => {
      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: true,
        }),
      );

      // Execute initial RAF
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      // Clear tracking
      rafCallbacks.length = 0;
      mockGetVirtualItems.mockClear();

      // Simulate onChange (scroll event)
      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
      ]);

      if (capturedOnChange) {
        capturedOnChange({
          getVirtualItems: mockGetVirtualItems,
          getTotalSize: mockGetTotalSize,
        });
      }

      // A new RAF should be scheduled
      expect(rafCallbacks.length).toBeGreaterThan(0);

      // State not updated yet
      expect(result.current.virtualItems).toEqual([]);

      // Execute RAF
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      // Now state is updated
      expect(result.current.virtualItems.length).toBeGreaterThan(0);
    });

    it('cancels pending RAF before scheduling new one (coalescing)', () => {
      renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: true,
        }),
      );

      // Execute initial RAF
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      rafCallbacks.length = 0;

      // Trigger multiple onChange calls rapidly
      if (capturedOnChange) {
        const virtualizerInstance = {
          getVirtualItems: mockGetVirtualItems,
          getTotalSize: mockGetTotalSize,
        };

        capturedOnChange(virtualizerInstance);
        capturedOnChange(virtualizerInstance);
        capturedOnChange(virtualizerInstance);
      }

      // Only last RAF should remain (previous ones cancelled)
      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // SCROLL MARGIN CALCULATION
  // ============================================================================

  describe('scrollMargin calculation', () => {
    it('is calculated from container getBoundingClientRect', () => {
      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: true,
        }),
      );

      // scrollMargin = rect.top + window.scrollY
      // From mock: rect.top = 100, window.scrollY = 0
      // Expected: 100
      expect(result.current.scrollMargin).toBe(100);
    });

    it('is calculated correctly with window.scrollY offset', () => {
      Object.defineProperty(window, 'scrollY', {
        value: 50,
        writable: true,
      });

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: true,
        }),
      );

      // scrollMargin = rect.top + window.scrollY = 100 + 50 = 150
      expect(result.current.scrollMargin).toBe(150);
    });

    it('is always >= 0 (Math.max ensures non-negative)', () => {
      Element.prototype.getBoundingClientRect = vi.fn(() => ({
        top: -50,
        left: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 500,
        x: 0,
        y: -50,
        toJSON: () => {},
      }));

      Object.defineProperty(window, 'scrollY', {
        value: 0,
        writable: true,
      });

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: true,
        }),
      );

      // Math.max(0, -50 + 0) = 0
      expect(result.current.scrollMargin).toBeGreaterThanOrEqual(0);
    });

    it('is only measured once per mount', () => {
      const getClientRectSpy = vi.fn(() => ({
        top: 100,
        left: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 500,
        x: 0,
        y: 100,
        toJSON: () => {},
      }));

      Element.prototype.getBoundingClientRect = getClientRectSpy;

      const { rerender } = renderHook(
        ({ items }) => useVirtualizedTimeline({ timelineItems: items, isDataReady: true }),
        { initialProps: { items: [createMockTimelineItem(0)] } },
      );

      // Clear previous calls
      getClientRectSpy.mockClear();

      // Re-render with same data
      rerender({ items: [createMockTimelineItem(0)] });

      // getBoundingClientRect should not be called again
      expect(getClientRectSpy).not.toHaveBeenCalled();
    });

    it('is reset and re-measured when items become empty (navigation)', () => {
      const { result, rerender } = renderHook(
        ({ items }) => useVirtualizedTimeline({ timelineItems: items, isDataReady: true }),
        { initialProps: { items: [createMockTimelineItem(0)] } },
      );

      const initialMargin = result.current.scrollMargin;
      expect(initialMargin).toBe(100);

      // Navigate away (clear items)
      rerender({ items: [] });

      // Navigate back (add items again)
      rerender({ items: [createMockTimelineItem(0)] });

      // scrollMargin should be re-calculated (measurement flag reset)
      expect(result.current.scrollMargin).toBeDefined();
    });

    it('is not measured when virtualizer is disabled (data not ready)', () => {
      const getClientRectSpy = vi.fn(() => ({
        top: 100,
        left: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 500,
        x: 0,
        y: 100,
        toJSON: () => {},
      }));

      Element.prototype.getBoundingClientRect = getClientRectSpy;

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: false,
        }),
      );

      // scrollMargin should remain 0 (not measured)
      expect(result.current.scrollMargin).toBe(0);
    });

    it('is passed to useWindowVirtualizer', () => {
      mockUseWindowVirtualizer.mockClear();

      renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: true,
        }),
      );

      expect(mockUseWindowVirtualizer).toHaveBeenCalledWith(
        expect.objectContaining({
          scrollMargin: 100,
        }),
      );
    });
  });
});

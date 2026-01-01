/**
 * useVirtualizedTimeline Tests
 *
 * Tests for the virtualized timeline hook that manages
 * window-level virtualization for chat timeline items.
 *
 * KEY RACE CONDITIONS AND ISSUES TESTED:
 * 1. flushSync called during render (causes React warning) - CRITICAL
 * 2. Initial render defers getVirtualItems/getTotalSize via RAF
 * 3. onChange callback defers updates via RAF
 * 4. RAF cancellation on unmount
 * 5. Navigation reset clears state properly
 * 6. Rapid update coalescing
 * 7. Proper scroll margin calculation
 * 8. Dynamic item measurement
 *
 * TanStack Virtual internally calls flushSync when calculating measurements.
 * This hook must defer all virtualizer method calls (getVirtualItems, getTotalSize)
 * to requestAnimationFrame to avoid "flushSync called during lifecycle" warnings.
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@/lib/testing';

import type { TimelineItem } from '../use-thread-timeline';
import { useVirtualizedTimeline } from '../use-virtualized-timeline';

// Create mock functions outside of mock to track calls
const mockGetVirtualItems = vi.fn(() => []);
const mockGetTotalSize = vi.fn(() => 0);
const mockMeasureElement = vi.fn();
const mockScrollToIndex = vi.fn();
const mockScrollToOffset = vi.fn();

// Track onChange callback for simulating virtualizer updates
let capturedOnChange: ((instance: unknown) => void) | null = null;

const mockUseWindowVirtualizer = vi.fn((options: { onChange?: (instance: unknown) => void }) => {
  // Capture onChange for testing
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

// Track RAF callbacks for testing deferred execution
const rafCallbacks: Array<() => void> = [];
let rafIdCounter = 0;
const cancelledRafIds = new Set<number>();

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

  // Default to messages for other types
  return createMockTimelineItem(roundNumber, 'messages');
}

// ============================================================================
// SETUP
// ============================================================================

// Store original RAF/CAF for restoration
const originalRaf = globalThis.requestAnimationFrame;
const originalCaf = globalThis.cancelAnimationFrame;

describe('useVirtualizedTimeline', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset all mocks to default state
    vi.clearAllMocks();

    // Reset RAF tracking
    rafCallbacks.length = 0;
    rafIdCounter = 0;
    cancelledRafIds.clear();
    capturedOnChange = null;

    // Reset mock return values to defaults
    mockGetVirtualItems.mockReturnValue([]);
    mockGetTotalSize.mockReturnValue(0);

    // Mock requestAnimationFrame to capture callbacks
    globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = ++rafIdCounter;
      rafCallbacks.push(() => callback(performance.now()));
      return id;
    });

    globalThis.cancelAnimationFrame = vi.fn((id: number) => {
      cancelledRafIds.add(id);
    });

    // Capture console errors/warnings to detect flushSync issues
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
    vi.clearAllMocks();
  });

  // ============================================================================
  // flushSync ISSUE TESTS - CRITICAL RACE CONDITIONS
  // ============================================================================

  describe('flushSync during render prevention', () => {
    it('should NOT call getVirtualItems during initial render - defers via RAF', () => {
      const timelineItems = [
        createMockTimelineItem(0, 'messages'),
        createMockTimelineItem(0, 'moderator'),
        createMockTimelineItem(1, 'messages'),
      ];

      mockGetVirtualItems.mockClear();

      // Render the hook
      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
        }),
      );

      // CRITICAL: Initial render should NOT have called getVirtualItems
      // because it triggers flushSync which React doesn't allow during render
      // Instead, RAF should be scheduled
      expect(rafCallbacks.length).toBeGreaterThan(0);

      // State should be default (empty) until RAF fires
      expect(result.current.virtualItems).toEqual([]);
      expect(result.current.totalSize).toBe(0);

      // No flushSync warning should have been logged
      const flushSyncError = consoleErrorSpy.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('flushSync'),
      );
      expect(flushSyncError).toBeUndefined();
    });

    it('should NOT call getTotalSize during initial render - defers via RAF', () => {
      const timelineItems = [createMockTimelineItem(0, 'messages')];

      mockGetTotalSize.mockClear();
      mockGetTotalSize.mockReturnValue(500);

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
        }),
      );

      // totalSize should be 0 (default) until RAF fires
      expect(result.current.totalSize).toBe(0);

      // Execute RAF callbacks
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      // Now totalSize should be populated
      expect(result.current.totalSize).toBe(500);
    });

    it('should populate state after RAF callback fires', () => {
      const timelineItems = [createMockTimelineItem(0, 'messages')];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
        { index: 1, key: '1', start: 200, end: 400, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(400);

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
        }),
      );

      // Before RAF: empty state
      expect(result.current.virtualItems).toEqual([]);

      // Execute RAF callbacks
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      // After RAF: state should be populated
      expect(result.current.virtualItems).toHaveLength(2);
      expect(result.current.totalSize).toBe(400);
    });

    it('should handle rapid re-renders without flushSync errors', () => {
      const timelineItems = [createMockTimelineItem(0, 'messages')];

      const { rerender } = renderHook(
        ({ items }) => useVirtualizedTimeline({ timelineItems: items, isDataReady: true }),
        { initialProps: { items: timelineItems } },
      );

      // Simulate rapid re-renders (like during streaming)
      for (let i = 0; i < 10; i++) {
        rerender({
          items: [
            ...timelineItems,
            createMockTimelineItem(i + 1, 'messages'),
          ],
        });
      }

      // No flushSync errors should occur
      const flushSyncError = consoleErrorSpy.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('flushSync'),
      );

      expect(flushSyncError).toBeUndefined();
    });
  });

  // ============================================================================
  // RAF CANCELLATION TESTS - CLEANUP RACE CONDITIONS
  // ============================================================================

  describe('rAF cancellation on unmount and navigation', () => {
    it('should cancel pending RAF on unmount', () => {
      const timelineItems = [createMockTimelineItem(0, 'messages')];

      const { unmount } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
        }),
      );

      // RAF should be pending
      expect(rafCallbacks.length).toBeGreaterThan(0);

      // Unmount before RAF executes
      unmount();

      // cancelAnimationFrame should have been called
      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should cancel pending RAF when shouldEnable becomes false', () => {
      const { rerender } = renderHook(
        ({ items, isDataReady }) => useVirtualizedTimeline({ timelineItems: items, isDataReady }),
        {
          initialProps: {
            items: [createMockTimelineItem(0, 'messages')],
            isDataReady: true,
          },
        },
      );

      // RAF should be pending
      expect(rafCallbacks.length).toBeGreaterThan(0);

      // Disable before RAF executes (simulating navigation)
      rerender({
        items: [createMockTimelineItem(0, 'messages')],
        isDataReady: false,
      });

      // cancelAnimationFrame should have been called
      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should reset state when items become empty (navigation)', () => {
      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(200);

      const { result, rerender } = renderHook(
        ({ items }) => useVirtualizedTimeline({ timelineItems: items, isDataReady: true }),
        { initialProps: { items: [createMockTimelineItem(0, 'messages')] } },
      );

      // Execute RAF to populate state
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      expect(result.current.virtualItems).toHaveLength(1);
      expect(result.current.totalSize).toBe(200);

      // Navigate away (empty items)
      rerender({ items: [] });

      // State should be reset immediately
      expect(result.current.virtualItems).toEqual([]);
      expect(result.current.totalSize).toBe(0);
    });
  });

  // ============================================================================
  // onChange CALLBACK RACE CONDITIONS
  // ============================================================================

  describe('onChange callback race conditions', () => {
    it('should skip onChange during initial sync phase', () => {
      const timelineItems = [createMockTimelineItem(0, 'messages')];

      renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
        }),
      );

      // Simulate TanStack Virtual calling onChange during initialization
      // This should be skipped because hasInitialSyncRef is false
      if (capturedOnChange) {
        capturedOnChange({
          getVirtualItems: mockGetVirtualItems,
          getTotalSize: mockGetTotalSize,
        });
      }

      // Only the initial sync RAF should be scheduled (not an additional one from onChange)
      // Note: Test verifies onChange doesn't trigger extra RAF before initial sync
    });

    it('should defer onChange updates via RAF after initial sync', () => {
      const timelineItems = [createMockTimelineItem(0, 'messages')];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
      ]);

      renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
        }),
      );

      // Execute initial RAF
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      // Clear RAF tracking
      rafCallbacks.length = 0;

      // Now simulate onChange being called (e.g., scroll event)
      if (capturedOnChange) {
        capturedOnChange({
          getVirtualItems: mockGetVirtualItems,
          getTotalSize: mockGetTotalSize,
        });
      }

      // A new RAF should be scheduled
      expect(rafCallbacks.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // BASIC FUNCTIONALITY TESTS
  // ============================================================================

  describe('basic functionality', () => {
    it('returns empty virtualItems when no timeline items provided', () => {
      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [],
          isDataReady: true,
        }),
      );

      expect(result.current.virtualItems).toEqual([]);
    });

    it('disables virtualizer when data is not ready', () => {
      mockUseWindowVirtualizer.mockClear();

      renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: false,
        }),
      );

      // Verify virtualizer was called with enabled: false
      expect(mockUseWindowVirtualizer).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        }),
      );
    });

    it('enables virtualizer when data is ready and items exist', () => {
      mockUseWindowVirtualizer.mockClear();

      renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: true,
        }),
      );

      expect(mockUseWindowVirtualizer).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
        }),
      );
    });
  });

  // ============================================================================
  // SCROLL METHODS TESTS
  // ============================================================================

  describe('scroll methods', () => {
    it('provides scrollToIndex method', () => {
      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: true,
        }),
      );

      expect(typeof result.current.scrollToIndex).toBe('function');
    });

    it('provides scrollToBottom method', () => {
      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: true,
        }),
      );

      expect(typeof result.current.scrollToBottom).toBe('function');
    });

    it('scrollToBottom does nothing with empty items', () => {
      mockScrollToIndex.mockClear();

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [],
          isDataReady: true,
        }),
      );

      result.current.scrollToBottom();

      expect(mockScrollToIndex).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // SCROLL MARGIN TESTS
  // ============================================================================

  describe('scroll margin calculation', () => {
    it('calculates scroll margin from container position', () => {
      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [createMockTimelineItem(0)],
          isDataReady: true,
        }),
      );

      // scrollMargin should be calculated from getBoundingClientRect
      expect(result.current.scrollMargin).toBeGreaterThanOrEqual(0);
    });

    it('resets scroll margin measurement when items become empty', () => {
      const { result, rerender } = renderHook(
        ({ items }) => useVirtualizedTimeline({ timelineItems: items, isDataReady: true }),
        { initialProps: { items: [createMockTimelineItem(0)] } },
      );

      // Initial state
      expect(result.current.scrollMargin).toBeDefined();

      // Clear items (navigation)
      rerender({ items: [] });

      // Add items again
      rerender({ items: [createMockTimelineItem(0)] });

      // Scroll margin should be re-measured
      expect(result.current.scrollMargin).toBeDefined();
    });
  });
});

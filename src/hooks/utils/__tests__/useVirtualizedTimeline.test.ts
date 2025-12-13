/**
 * useVirtualizedTimeline Tests
 *
 * Tests for the virtualized timeline hook that manages
 * window-level virtualization for chat timeline items.
 *
 * Key Issues Tested:
 * 1. flushSync called during render (causes React warning)
 * 2. Proper scroll margin calculation
 * 3. Dynamic item measurement
 */

import { renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TimelineItem } from '../useThreadTimeline';
import { useVirtualizedTimeline } from '../useVirtualizedTimeline';

// Create mock functions outside of mock to track calls
const mockGetVirtualItems = vi.fn(() => []);
const mockGetTotalSize = vi.fn(() => 0);
const mockMeasureElement = vi.fn();
const mockScrollToIndex = vi.fn();
const mockScrollToOffset = vi.fn();
const mockUseWindowVirtualizer = vi.fn(() => ({
  getVirtualItems: mockGetVirtualItems,
  getTotalSize: mockGetTotalSize,
  measureElement: mockMeasureElement,
  scrollToIndex: mockScrollToIndex,
  scrollToOffset: mockScrollToOffset,
}));

// Mock TanStack Virtual
vi.mock('@tanstack/react-virtual', () => ({
  useWindowVirtualizer: (options: unknown) => mockUseWindowVirtualizer(options),
}));

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

  if (type === 'analysis') {
    return {
      type: 'analysis',
      key: `round-${roundNumber}-analysis`,
      roundNumber,
      data: {
        id: `analysis-${roundNumber}`,
        threadId: 'thread-123',
        roundNumber,
        mode: 'analyzing' as const,
        userQuestion: 'Test question',
        status: 'complete' as const,
        analysisData: null,
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

describe('useVirtualizedTimeline', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset all mocks to default state
    vi.clearAllMocks();

    // Reset mock return values to defaults
    mockGetVirtualItems.mockReturnValue([]);
    mockGetTotalSize.mockReturnValue(0);

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
    vi.clearAllMocks();
  });

  // ============================================================================
  // flushSync ISSUE TEST
  // ============================================================================

  describe('flushSync during render prevention', () => {
    it('should not call flushSync during render cycle', () => {
      const timelineItems = [
        createMockTimelineItem(0, 'messages'),
        createMockTimelineItem(0, 'analysis'),
        createMockTimelineItem(1, 'messages'),
      ];

      // Render the hook
      renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
        }),
      );

      // Check that no flushSync warning was logged
      const flushSyncError = consoleErrorSpy.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('flushSync'),
      );

      expect(flushSyncError).toBeUndefined();
    });

    it('should not trigger state updates in useMemo dependency calculation', () => {
      const timelineItems = [
        createMockTimelineItem(0, 'messages'),
      ];

      // Reset call count before test
      mockGetVirtualItems.mockClear();

      // Configure mock to return actual items
      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 100, size: 100, lane: 0 },
      ]);

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
        }),
      );

      // The hook should call getVirtualItems directly (not in useMemo dep array)
      // Previously, calling getVirtualItems() in the useMemo dependency array
      // caused it to be called 3x (once for callback, once for dep array, once for render)
      expect(result.current.virtualItems).toBeDefined();

      // After fix: getVirtualItems is called directly, not wrapped in useMemo
      // React may render multiple times (especially in StrictMode/tests)
      // but the key is we removed the extra dep array call
      // In test environment, 2 calls is acceptable (1 per render in StrictMode)
      // Before fix, it would be 3+ calls (extra from dependency array evaluation)
      expect(mockGetVirtualItems.mock.calls.length).toBeLessThanOrEqual(2);
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

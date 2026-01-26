/**
 * useVirtualizedTimeline Tests
 *
 * Tests for the virtualized timeline hook following official TanStack Virtual pattern.
 *
 * OFFICIAL PATTERN:
 * - Hook returns virtualizer instance directly
 * - Consumer calls getVirtualItems() and getTotalSize() in render
 * - No state caching, no RAF deferral
 * - This ensures positions are ALWAYS current, never stale
 */

import { MessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@/lib/testing';

import type { TimelineItem } from '../use-thread-timeline';
import type { UseVirtualizedTimelineOptions } from '../use-virtualized-timeline';
import { TIMELINE_BOTTOM_PADDING_PX, useVirtualizedTimeline } from '../use-virtualized-timeline';

// Mock virtualizer instance
const mockGetVirtualItems = vi.fn(() => []);
const mockGetTotalSize = vi.fn(() => 0);
const mockMeasureElement = vi.fn();
const mockScrollToIndex = vi.fn();
const mockScrollToOffset = vi.fn();

type VirtualizerOptions = {
  count?: number;
  enabled?: boolean;
  scrollMargin?: number;
  [key: string]: unknown;
};

let lastVirtualizerOptions: VirtualizerOptions | null = null;

const mockVirtualizerInstance = {
  getTotalSize: mockGetTotalSize,
  getVirtualItems: mockGetVirtualItems,
  measureElement: mockMeasureElement,
  options: { scrollMargin: 0 },
  scrollToIndex: mockScrollToIndex,
  scrollToOffset: mockScrollToOffset,
  shouldAdjustScrollPositionOnItemSizeChange: undefined as unknown,
};

vi.mock('@tanstack/react-virtual', () => ({
  useWindowVirtualizer: (options: VirtualizerOptions) => {
    lastVirtualizerOptions = options;
    mockVirtualizerInstance.options.scrollMargin = options.scrollMargin ?? 0;
    return mockVirtualizerInstance;
  },
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
      data: [
        {
          content: 'Test message',
          id: `msg-${roundNumber}`,
          parts: [{ text: 'Test message', type: 'text' }],
          role: MessageRoles.USER,
        } satisfies UIMessage,
      ],
      key: `round-${roundNumber}-messages`,
      roundNumber,
      type: 'messages',
    };
  }

  return createMockTimelineItem(roundNumber, 'messages');
}

// Wrapper to call the hook with a listRef
function useTestVirtualizedTimeline(
  options: Omit<UseVirtualizedTimelineOptions, 'listRef'>,
) {
  const listRef = useRef<HTMLDivElement | null>(null);
  // Simulate the DOM element with offsetTop
  if (!listRef.current) {
    const mockElement = document.createElement('div');
    Object.defineProperty(mockElement, 'offsetTop', { value: 100 });
    listRef.current = mockElement;
  }
  return useVirtualizedTimeline({ ...options, listRef });
}

// ============================================================================
// SETUP
// ============================================================================

describe('useVirtualizedTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastVirtualizerOptions = null;
    mockGetVirtualItems.mockReturnValue([]);
    mockGetTotalSize.mockReturnValue(0);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // EXPORTS AND CONSTANTS
  // ============================================================================

  describe('exports and constants', () => {
    it('exports TIMELINE_BOTTOM_PADDING_PX constant', () => {
      expect(TIMELINE_BOTTOM_PADDING_PX).toBe(320);
    });
  });

  // ============================================================================
  // BASIC FUNCTIONALITY
  // ============================================================================

  describe('basic functionality', () => {
    it('returns virtualizer instance directly', () => {
      const { result } = renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: true,
          timelineItems: [createMockTimelineItem(0)],
        }),
      );

      expect(result.current.virtualizer).toBe(mockVirtualizerInstance);
    });

    it('returns measureElement from virtualizer', () => {
      const { result } = renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: true,
          timelineItems: [createMockTimelineItem(0)],
        }),
      );

      expect(result.current.measureElement).toBe(mockMeasureElement);
    });

    it('disables virtualizer when data is not ready', () => {
      renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: false,
          timelineItems: [createMockTimelineItem(0)],
        }),
      );

      expect(lastVirtualizerOptions?.enabled).toBeFalsy();
    });

    it('disables virtualizer when timeline items are empty', () => {
      renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: true,
          timelineItems: [],
        }),
      );

      expect(lastVirtualizerOptions?.enabled).toBeFalsy();
    });

    it('enables virtualizer when data is ready and items exist', () => {
      renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: true,
          timelineItems: [createMockTimelineItem(0)],
        }),
      );

      expect(lastVirtualizerOptions?.enabled).toBeTruthy();
    });

    it('passes correct count to virtualizer', () => {
      const items = [
        createMockTimelineItem(0),
        createMockTimelineItem(1),
        createMockTimelineItem(2),
      ];

      renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: true,
          timelineItems: items,
        }),
      );

      expect(lastVirtualizerOptions?.count).toBe(3);
    });
  });

  // ============================================================================
  // SCROLL METHODS
  // ============================================================================

  describe('scroll methods', () => {
    it('provides scrollToIndex method', () => {
      const { result } = renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: true,
          timelineItems: [createMockTimelineItem(0)],
        }),
      );

      expect(typeof result.current.scrollToIndex).toBe('function');
      result.current.scrollToIndex(0);
      expect(mockScrollToIndex).toHaveBeenCalledWith(0, undefined);
    });

    it('provides scrollToOffset method', () => {
      const { result } = renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: true,
          timelineItems: [createMockTimelineItem(0)],
        }),
      );

      expect(typeof result.current.scrollToOffset).toBe('function');
      result.current.scrollToOffset(100);
      expect(mockScrollToOffset).toHaveBeenCalledWith(100, undefined);
    });

    it('provides scrollToBottom method', () => {
      const { result } = renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: true,
          timelineItems: [createMockTimelineItem(0), createMockTimelineItem(1)],
        }),
      );

      expect(typeof result.current.scrollToBottom).toBe('function');
      result.current.scrollToBottom();
      expect(mockScrollToIndex).toHaveBeenCalledWith(1, {
        align: 'end',
        behavior: 'auto',
      });
    });

    it('scrollToBottom does nothing with empty items', () => {
      mockScrollToIndex.mockClear();

      const { result } = renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: true,
          timelineItems: [],
        }),
      );

      result.current.scrollToBottom();
      expect(mockScrollToIndex).not.toHaveBeenCalled();
    });

    it('scrollToBottom accepts behavior option', () => {
      const { result } = renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: true,
          timelineItems: [createMockTimelineItem(0)],
        }),
      );

      result.current.scrollToBottom({ behavior: 'smooth' });
      expect(mockScrollToIndex).toHaveBeenCalledWith(0, {
        align: 'end',
        behavior: 'smooth',
      });
    });
  });

  // ============================================================================
  // CONFIGURATION OPTIONS
  // ============================================================================

  describe('configuration options', () => {
    it('passes estimateSize to virtualizer', () => {
      renderHook(() =>
        useTestVirtualizedTimeline({
          estimateSize: 300,
          isDataReady: true,
          timelineItems: [createMockTimelineItem(0)],
        }),
      );

      expect(lastVirtualizerOptions?.estimateSize).toBeDefined();
      expect(typeof lastVirtualizerOptions?.estimateSize).toBe('function');
      expect(lastVirtualizerOptions?.estimateSize?.()).toBe(300);
    });

    it('passes overscan to virtualizer', () => {
      renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: true,
          overscan: 10,
          timelineItems: [createMockTimelineItem(0)],
        }),
      );

      expect(lastVirtualizerOptions?.overscan).toBe(10);
    });

    it('passes paddingStart and paddingEnd to virtualizer', () => {
      renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: true,
          paddingEnd: 100,
          paddingStart: 50,
          timelineItems: [createMockTimelineItem(0)],
        }),
      );

      expect(lastVirtualizerOptions?.paddingStart).toBe(50);
      expect(lastVirtualizerOptions?.paddingEnd).toBe(100);
    });
  });

  // ============================================================================
  // STREAMING SCROLL ADJUSTMENT
  // ============================================================================

  describe('streaming scroll adjustment', () => {
    it('sets shouldAdjustScrollPositionOnItemSizeChange on virtualizer', () => {
      renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: true,
          isStreaming: false,
          timelineItems: [createMockTimelineItem(0)],
        }),
      );

      expect(mockVirtualizerInstance.shouldAdjustScrollPositionOnItemSizeChange).toBeDefined();
    });

    it('returns false during streaming to prevent scroll jumps', () => {
      renderHook(() =>
        useTestVirtualizedTimeline({
          isDataReady: true,
          isStreaming: true,
          timelineItems: [createMockTimelineItem(0)],
        }),
      );

      const adjustFn = mockVirtualizerInstance.shouldAdjustScrollPositionOnItemSizeChange as (
        item: { start: number },
        delta: number,
        instance: { scrollOffset: number; scrollDirection: string },
      ) => boolean;

      const result = adjustFn(
        { start: 0 },
        100,
        { scrollDirection: 'forward', scrollOffset: 500 },
      );

      expect(result).toBeFalsy();
    });

    it('uses getIsStreamingFromStore callback for real-time streaming state', () => {
      const getIsStreamingFromStore = vi.fn(() => true);

      renderHook(() =>
        useTestVirtualizedTimeline({
          getIsStreamingFromStore,
          isDataReady: true,
          isStreaming: false,
          timelineItems: [createMockTimelineItem(0)],
        }),
      );

      const adjustFn = mockVirtualizerInstance.shouldAdjustScrollPositionOnItemSizeChange as (
        item: { start: number },
        delta: number,
        instance: { scrollOffset: number; scrollDirection: string },
      ) => boolean;

      const result = adjustFn(
        { start: 0 },
        100,
        { scrollDirection: 'forward', scrollOffset: 500 },
      );

      expect(getIsStreamingFromStore).toHaveBeenCalledWith();
      expect(result).toBeFalsy();
    });
  });
});

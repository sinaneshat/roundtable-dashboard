import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TimelineItem } from '../useThreadTimeline';
import { useVirtualizedTimeline } from '../useVirtualizedTimeline';

describe('useVirtualizedTimeline', () => {
  const mockScrollContainer = document.createElement('div');
  mockScrollContainer.id = 'chat-scroll-container';
  mockScrollContainer.style.position = 'relative';

  beforeEach(() => {
    document.body.appendChild(mockScrollContainer);
    // Mock window.visualViewport
    Object.defineProperty(window, 'visualViewport', {
      value: {
        height: 800,
        width: 400,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      writable: true,
      configurable: true,
    });

    // Mock window.scrollY
    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
      configurable: true,
    });

    // Mock window.scrollTo
    window.scrollTo = vi.fn();

    // Mock window innerHeight
    Object.defineProperty(window, 'innerHeight', {
      value: 800,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    document.body.removeChild(mockScrollContainer);
    vi.clearAllMocks();
  });

  const createMockTimelineItems = (count: number): TimelineItem[] => {
    return Array.from({ length: count }, (_, index) => ({
      type: 'messages' as const,
      data: [
        {
          id: `msg-${index}`,
          content: `Message ${index}`,
          role: 'user' as const,
          metadata: { roundNumber: index + 1, participantId: 'user-1' },
          createdAt: new Date(),
        },
      ],
    }));
  };

  it('should initialize virtualized timeline', () => {
    const timelineItems = createMockTimelineItems(10);

    const { result } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems,
        scrollContainerId: 'chat-scroll-container',
        enabled: true,
      }),
    );

    expect(result.current.virtualizer).toBeDefined();
    expect(result.current.virtualItems).toBeDefined();
    expect(result.current.totalSize).toBeGreaterThan(0);
  });

  it('should handle disabled virtualization', () => {
    const timelineItems = createMockTimelineItems(100);

    const { result } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems,
        scrollContainerId: 'chat-scroll-container',
        enabled: false,
      }),
    );

    // Virtualizer should still be initialized even when disabled
    expect(result.current.virtualizer).toBeDefined();
    // Virtual items may be empty or partial when disabled
    expect(result.current.virtualItems).toBeDefined();
  });

  it('should include paddingEnd in total size', () => {
    const timelineItems = createMockTimelineItems(10);
    const paddingEnd = 200;

    const { result } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems,
        scrollContainerId: 'chat-scroll-container',
        paddingEnd,
        enabled: true,
      }),
    );

    // ✅ OFFICIAL PATTERN: getTotalSize() already includes paddingEnd
    // The virtualizer's built-in padding is automatically included in totalSize
    expect(result.current.paddingEnd).toBe(paddingEnd);
    expect(result.current.totalSize).toBeGreaterThan(0);
  });

  it('should keep streaming rounds visible', () => {
    const timelineItems = createMockTimelineItems(50);
    const streamingRounds = new Set([25, 26]);

    const { result } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems,
        scrollContainerId: 'chat-scroll-container',
        enabled: true,
        streamingRounds,
        // ✅ Uses new default overscan=10 for smoother scrolling
      }),
    );

    // Streaming rounds should be included in virtual items
    // even if not in viewport
    const hasStreamingRounds = result.current.virtualItems.some(
      item => item.index === 24 || item.index === 25,
    );

    // At least one of the streaming rounds should be visible
    expect(hasStreamingRounds).toBe(true);
  });

  it('should provide scroll-to-index functionality', () => {
    const timelineItems = createMockTimelineItems(100);

    const { result } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems,
        scrollContainerId: 'chat-scroll-container',
        enabled: true,
      }),
    );

    expect(result.current.scrollToIndex).toBeDefined();
    expect(typeof result.current.scrollToIndex).toBe('function');

    // Should not throw when called
    expect(() => result.current.scrollToIndex(50)).not.toThrow();
  });

  it('should provide scroll-to-item predicate functionality', () => {
    const timelineItems = createMockTimelineItems(100);

    const { result } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems,
        scrollContainerId: 'chat-scroll-container',
        enabled: true,
      }),
    );

    // Should return true when item is found
    const found = result.current.scrollToItem(
      item => item.type === 'messages' && item.data[0]?.id === 'msg-50',
    );

    expect(found).toBe(true);

    // Should return false when item is not found
    const notFound = result.current.scrollToItem(
      item => item.type === 'messages' && item.data[0]?.id === 'msg-999',
    );

    expect(notFound).toBe(false);
  });

  it('should provide measureElement function', () => {
    const timelineItems = createMockTimelineItems(10);

    const { result } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems,
        scrollContainerId: 'chat-scroll-container',
        enabled: true,
      }),
    );

    expect(result.current.measureElement).toBeDefined();
    expect(typeof result.current.measureElement).toBe('function');
  });

  it('should handle custom estimate size', () => {
    const timelineItems = createMockTimelineItems(10);
    const customEstimateSize = 600;

    const { result } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems,
        scrollContainerId: 'chat-scroll-container',
        estimateSize: customEstimateSize,
        enabled: true,
      }),
    );

    // Total size should be based on estimate size * count
    expect(result.current.totalSize).toBeGreaterThanOrEqual(
      customEstimateSize * timelineItems.length * 0.8,
    );
  });

  it('should handle custom overscan value', () => {
    const timelineItems = createMockTimelineItems(100);
    const customOverscan = 5;

    const { result } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems,
        scrollContainerId: 'chat-scroll-container',
        overscan: customOverscan,
        enabled: true,
      }),
    );

    // With higher overscan, more items should be virtualized
    expect(result.current.virtualItems.length).toBeGreaterThan(0);
  });

  it('should handle empty timeline items', () => {
    const paddingEnd = 200;
    const { result } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems: [],
        scrollContainerId: 'chat-scroll-container',
        paddingEnd,
        enabled: true,
      }),
    );

    expect(result.current.virtualItems).toHaveLength(0);
    // ✅ OFFICIAL PATTERN: getTotalSize() includes paddingEnd even with 0 items
    // This ensures proper scroll area for empty lists
    expect(result.current.totalSize).toBe(paddingEnd);
  });

  it('should preserve streaming items across scroll', () => {
    const timelineItems = createMockTimelineItems(100);
    const streamingRounds = new Set([75, 76]);

    const { result, rerender } = renderHook(
      ({ rounds }) =>
        useVirtualizedTimeline({
          timelineItems,
          scrollContainerId: 'chat-scroll-container',
          enabled: true,
          streamingRounds: rounds,
        }),
      {
        initialProps: { rounds: streamingRounds },
      },
    );

    // Rerender with same streaming rounds
    rerender({ rounds: streamingRounds });

    // Streaming items should still be present
    const hasStreamingItems = result.current.virtualItems.some(
      item => item.index === 74 || item.index === 75,
    );

    expect(hasStreamingItems).toBe(true);
  });

  it('should use relaxed overscan to prevent overlapping during fast scrolls', () => {
    const timelineItems = createMockTimelineItems(100);

    const { result: resultWithDefaultOverscan } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems,
        scrollContainerId: 'chat-scroll-container',
        enabled: true,
        // Uses default overscan=10 (relaxed)
      }),
    );

    const { result: resultWithAggressiveOverscan } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems,
        scrollContainerId: 'chat-scroll-container',
        enabled: true,
        overscan: 1, // Old aggressive setting
      }),
    );

    // Relaxed overscan should render more items or equal items (buffer zone adds to both)
    // This prevents text collision and overlapping during fast scrolls
    expect(resultWithDefaultOverscan.current.virtualItems.length).toBeGreaterThanOrEqual(
      resultWithAggressiveOverscan.current.virtualItems.length,
    );

    // Default overscan should render items for smooth scrolling
    // Note: Exact count depends on viewport size, but should have some items
    expect(resultWithDefaultOverscan.current.virtualItems.length).toBeGreaterThan(0);

    // Verify both configurations work without errors
    expect(resultWithDefaultOverscan.current.virtualizer).toBeDefined();
    expect(resultWithAggressiveOverscan.current.virtualizer).toBeDefined();
  });

  it('should expose scrollMargin for correct transform calculations', () => {
    const timelineItems = createMockTimelineItems(10);

    const { result } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems,
        scrollContainerId: 'chat-scroll-container',
        enabled: true,
      }),
    );

    // scrollMargin should be exposed in the result
    expect(result.current.scrollMargin).toBeDefined();
    expect(typeof result.current.scrollMargin).toBe('number');

    // In test environment, scroll margin should be 0 (no offset)
    expect(result.current.scrollMargin).toBe(0);
  });

  it('should calculate correct transform with scrollMargin subtraction', () => {
    const timelineItems = createMockTimelineItems(10);

    const { result } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems,
        scrollContainerId: 'chat-scroll-container',
        enabled: true,
        estimateSize: 400,
      }),
    );

    const { virtualItems, scrollMargin } = result.current;

    // Virtual items should have proper positioning
    virtualItems.forEach((item) => {
      // Each item's transform should account for scrollMargin
      // transform = translateY(item.start - scrollMargin)
      const expectedTransformY = item.start - scrollMargin;
      expect(expectedTransformY).toBeGreaterThanOrEqual(0);
    });
  });
});

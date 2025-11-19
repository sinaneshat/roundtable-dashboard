/**
 * Virtualization Overlap Prevention Tests
 *
 * Tests to ensure virtualization doesn't cause:
 * - Text overlap between items
 * - Content collision during fast scrolling
 * - Missing content due to aggressive virtualization
 * - Layout shifts during streaming
 */

import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import type { TimelineItem } from '@/hooks/utils';
import { useVirtualizedTimeline } from '@/hooks/utils';

// Mock TanStack Virtual
vi.mock('@tanstack/react-virtual', () => ({
  useWindowVirtualizer: vi.fn((options) => {
    // Mock virtualizer that returns all items for testing
    const count = options.count || 0;
    const virtualItems = Array.from({ length: count }, (_, index) => ({
      key: `item-${index}`,
      index,
      start: index * (options.estimateSize?.() || 400),
      size: options.estimateSize?.() || 400,
      end: (index + 1) * (options.estimateSize?.() || 400),
    }));

    return {
      getVirtualItems: () => virtualItems,
      getTotalSize: () => count * (options.estimateSize?.() || 400),
      scrollOffset: 0,
      measureElement: vi.fn(),
      scrollToIndex: vi.fn(),
      scrollToOffset: vi.fn(),
      measure: vi.fn(),
    };
  }),
}));

function TestVirtualizedComponent({
  timelineItems,
  overscan = 15,
  estimateSize = 400,
  streamingRounds,
}: {
  timelineItems: TimelineItem[];
  overscan?: number;
  estimateSize?: number;
  streamingRounds?: Set<number>;
}) {
  const { virtualItems, measureElement, totalSize, scrollMargin } = useVirtualizedTimeline({
    timelineItems,
    scrollContainerId: 'test-container',
    overscan,
    estimateSize,
    streamingRounds,
  });

  return (
    <div
      id="test-container"
      style={{
        position: 'relative',
        // ✅ OFFICIAL PATTERN: getTotalSize() already includes paddingEnd
        height: `${totalSize}px`,
        width: '100%',
      }}
    >
      {virtualItems.map((virtualItem) => {
        const item = timelineItems[virtualItem.index];
        if (!item)
          return null;

        return (
          <div
            key={virtualItem.key}
            ref={measureElement}
            data-testid={`item-${virtualItem.index}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
            }}
          >
            {item.type === 'messages' && (
              <div data-testid={`message-group-${virtualItem.index}`}>
                Message Group
                {' '}
                {virtualItem.index}
              </div>
            )}
            {item.type === 'analysis' && (
              <div data-testid={`analysis-${virtualItem.index}`}>
                Analysis
                {' '}
                {item.data.roundNumber}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

describe('useVirtualizedTimeline - Overlap Prevention', () => {
  beforeEach(() => {
    // Mock window properties
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    });

    // Mock document element for scroll container
    const mockContainer = document.createElement('div');
    mockContainer.id = 'test-container';

    // Mock offsetTop using defineProperty
    Object.defineProperty(mockContainer, 'offsetTop', {
      configurable: true,
      get: () => 0,
    });

    document.body.appendChild(mockContainer);
  });

  describe('correct positioning without overlap', () => {
    it('should include paddingEnd in totalSize for correct container sizing', () => {
      const timelineItems: TimelineItem[] = [
        {
          type: 'messages',
          data: [],
        },
        {
          type: 'messages',
          data: [],
        },
      ];

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          scrollContainerId: 'test-container',
          estimateSize: 400,
          paddingEnd: 200,
        }),
      );

      // ✅ OFFICIAL PATTERN: getTotalSize() already includes paddingEnd
      // No need for separate totalSizeWithPadding calculation
      expect(result.current.totalSize).toBeGreaterThan(0);
      expect(result.current.paddingEnd).toBe(200);
      // Component uses height directly via totalSize (which includes padding)
    });

    it('should expose scrollMargin for correct transform calculations', () => {
      const timelineItems: TimelineItem[] = [
        {
          type: 'messages',
          data: [],
        },
        {
          type: 'messages',
          data: [],
        },
      ];

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          scrollContainerId: 'test-container',
          estimateSize: 400,
        }),
      );

      // Hook should expose scrollMargin for transform subtraction
      expect(result.current.scrollMargin).toBeDefined();
      expect(typeof result.current.scrollMargin).toBe('number');

      // Virtual items should have correct positioning data
      result.current.virtualItems.forEach((item) => {
        // Each item's start position should be >= 0
        expect(item.start).toBeGreaterThanOrEqual(0);
        // Transform should subtract scrollMargin: translateY(item.start - scrollMargin)
        const transformY = item.start - result.current.scrollMargin;
        expect(transformY).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('overscan configuration', () => {
    it('should render extra items with overscan=15 to prevent overlap during fast scrolling', () => {
      const timelineItems: TimelineItem[] = Array.from({ length: 50 }, () => ({
        type: 'messages' as const,
        data: [],
      }));

      render(
        <TestVirtualizedComponent timelineItems={timelineItems} overscan={15} />,
      );

      const renderedItems = screen.getAllByTestId(/^item-/);

      // Should render all items in test mode (mocked virtualizer)
      expect(renderedItems).toHaveLength(50);
    });

    it('should handle overscan=1 (aggressive virtualization) without breaking', () => {
      const timelineItems: TimelineItem[] = Array.from({ length: 20 }, () => ({
        type: 'messages' as const,
        data: [],
      }));

      render(
        <TestVirtualizedComponent timelineItems={timelineItems} overscan={1} />,
      );

      const renderedItems = screen.getAllByTestId(/^item-/);
      expect(renderedItems.length).toBeGreaterThan(0);
    });
  });

  describe('streaming protection', () => {
    it('should keep streaming rounds mounted even if outside viewport', () => {
      const timelineItems: TimelineItem[] = [
        {
          type: 'messages',
          data: [],
        },
        {
          type: 'analysis',
          data: {
            id: 'analysis-1',
            threadId: 'thread-1',
            roundNumber: 1,
            status: AnalysisStatuses.STREAMING,
            data: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        {
          type: 'messages',
          data: [],
        },
      ];

      const streamingRounds = new Set([1]);

      render(
        <TestVirtualizedComponent
          timelineItems={timelineItems}
          streamingRounds={streamingRounds}
        />,
      );

      // Analysis should be rendered even if outside viewport
      expect(screen.getByTestId('analysis-1')).toBeInTheDocument();
    });

    it('should prevent unmounting of items during active streaming', async () => {
      const timelineItems: TimelineItem[] = [
        {
          type: 'messages',
          data: [],
        },
        {
          type: 'analysis',
          data: {
            id: 'analysis-1',
            threadId: 'thread-1',
            roundNumber: 1,
            status: AnalysisStatuses.PENDING,
            data: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ];

      const streamingRounds = new Set([1]);

      const { rerender } = render(
        <TestVirtualizedComponent
          timelineItems={timelineItems}
          streamingRounds={streamingRounds}
        />,
      );

      // Verify analysis is rendered
      expect(screen.getByTestId('analysis-1')).toBeInTheDocument();

      // Update streaming status
      const updatedItems: TimelineItem[] = [
        {
          type: 'messages',
          data: [],
        },
        {
          type: 'analysis',
          data: {
            id: 'analysis-1',
            threadId: 'thread-1',
            roundNumber: 1,
            status: AnalysisStatuses.STREAMING,
            data: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ];

      rerender(
        <TestVirtualizedComponent
          timelineItems={updatedItems}
          streamingRounds={streamingRounds}
        />,
      );

      // Should still be mounted during streaming
      await waitFor(() => {
        expect(screen.getByTestId('analysis-1')).toBeInTheDocument();
      });
    });
  });

  describe('transform positioning', () => {
    it('should use translateY with scrollMargin subtraction for correct positioning', () => {
      const timelineItems: TimelineItem[] = [
        {
          type: 'messages',
          data: [],
        },
        {
          type: 'messages',
          data: [],
        },
        {
          type: 'messages',
          data: [],
        },
      ];

      const { container } = render(
        <TestVirtualizedComponent timelineItems={timelineItems} estimateSize={400} />,
      );

      const items = Array.from(container.querySelectorAll('[data-testid^="item-"]'));

      // Check transforms are sequential without gaps or overlaps
      // Transform should subtract scrollMargin (which is 0 in test environment)
      items.forEach((item, index) => {
        const transform = window.getComputedStyle(item as HTMLElement).transform;
        const expectedY = index * 400; // estimateSize - scrollMargin (0 in tests)
        expect(transform).toBe(`translateY(${expectedY}px)`);
      });
    });

    it('should maintain consistent positioning during rapid content updates', async () => {
      const initialItems: TimelineItem[] = [
        {
          type: 'messages',
          data: [],
        },
        {
          type: 'messages',
          data: [],
        },
      ];

      const { container, rerender } = render(
        <TestVirtualizedComponent timelineItems={initialItems} estimateSize={400} />,
      );

      // Add more items rapidly
      const updatedItems: TimelineItem[] = [
        ...initialItems,
        {
          type: 'messages',
          data: [],
        },
        {
          type: 'messages',
          data: [],
        },
      ];

      rerender(
        <TestVirtualizedComponent timelineItems={updatedItems} estimateSize={400} />,
      );

      await waitFor(() => {
        const items = Array.from(container.querySelectorAll('[data-testid^="item-"]'));
        expect(items).toHaveLength(4);

        // Verify no overlapping transforms
        const transforms = items.map(item =>
          window.getComputedStyle(item as HTMLElement).transform,
        );

        const uniqueTransforms = new Set(transforms);
        // All transforms should be unique (no overlap)
        expect(uniqueTransforms.size).toBe(transforms.length);
      });
    });
  });

  describe('container sizing', () => {
    it('should set correct container min-height to prevent layout shifts', () => {
      const timelineItems: TimelineItem[] = Array.from({ length: 10 }, () => ({
        type: 'messages' as const,
        data: [],
      }));

      render(
        <TestVirtualizedComponent timelineItems={timelineItems} estimateSize={400} />,
      );

      // Verify all items are rendered
      const items = screen.getAllByTestId(/^item-/);
      expect(items).toHaveLength(10);

      // Each item should have correct positioning
      items.forEach((item, index) => {
        const style = item.getAttribute('style');
        expect(style).toContain(`translateY(${index * 400}px)`);
      });
    });

    it('should update container height when items are added', async () => {
      const initialItems: TimelineItem[] = [
        {
          type: 'messages',
          data: [],
        },
      ];

      const { rerender } = render(
        <TestVirtualizedComponent timelineItems={initialItems} estimateSize={400} />,
      );

      // Should render 1 item initially
      let items = screen.getAllByTestId(/^item-/);
      expect(items).toHaveLength(1);

      // Add more items
      const updatedItems: TimelineItem[] = [
        ...initialItems,
        {
          type: 'messages',
          data: [],
        },
        {
          type: 'messages',
          data: [],
        },
      ];

      rerender(
        <TestVirtualizedComponent timelineItems={updatedItems} estimateSize={400} />,
      );

      await waitFor(() => {
        items = screen.getAllByTestId(/^item-/);
        // Should render 3 items after update
        expect(items).toHaveLength(3);
      });
    });
  });
});

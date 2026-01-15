/**
 * Virtualized Timeline SSR Hydration Tests
 *
 * Tests for SSR hydration behavior of the virtualized timeline.
 *
 * SSR FIX IMPLEMENTED:
 * - Initial render now creates estimated virtual items based on item count and estimateSize
 * - This ensures server and client both render with content on first paint
 * - RAF callback refines items with actual measurements after hydration
 *
 * BEHAVIOR:
 * 1. Server renders with estimated items (SSR items based on count)
 * 2. Client hydrates with same estimated items (no flash)
 * 3. RAF callback updates with actual virtualizer measurements
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageRoles } from '@/api/core/enums';
import { act, renderHook } from '@/lib/testing';

import type { TimelineItem } from '../use-thread-timeline';
import { useVirtualizedTimeline } from '../use-virtualized-timeline';

// ============================================================================
// MOCKS
// ============================================================================

type VirtualItem = {
  index: number;
  key: string;
  start: number;
  end: number;
  size: number;
};

type VirtualizerInstance = {
  getVirtualItems: () => VirtualItem[];
  getTotalSize: () => number;
  measureElement: (element: Element | null) => void;
  scrollToIndex: (index: number, options?: object) => void;
  scrollToOffset: (offset: number, options?: object) => void;
};

type VirtualizerOptions = {
  count: number;
  onChange?: (instance: VirtualizerInstance) => void;
  enabled?: boolean;
  getScrollElement?: () => Element | null;
  estimateSize?: (index: number) => number;
  overscan?: number;
};

const mockUseWindowVirtualizer = vi.fn((options: VirtualizerOptions) => {
  // Create mock virtual items based on count (simulate what virtualizer would do)
  const mockVirtualItems: VirtualItem[] = options.enabled !== false
    ? Array.from({ length: Math.min(options.count, 10) }, (_, i) => ({
        index: i,
        key: `item-${i}`,
        start: i * 200,
        end: (i + 1) * 200,
        size: 200,
      }))
    : [];

  return {
    getVirtualItems: vi.fn(() => mockVirtualItems),
    getTotalSize: vi.fn(() => options.count * 200),
    measureElement: vi.fn(),
    scrollToIndex: vi.fn(),
    scrollToOffset: vi.fn(),
  };
});

vi.mock('@tanstack/react-virtual', () => ({
  useWindowVirtualizer: (options: VirtualizerOptions) => mockUseWindowVirtualizer(options),
}));

// RAF mock
const rafCallbacks: Array<() => void> = [];
let rafIdCounter = 0;

beforeEach(() => {
  vi.clearAllMocks();
  rafCallbacks.length = 0;
  rafIdCounter = 0;

  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    rafCallbacks.push(cb);
    return ++rafIdCounter;
  });

  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function flushRafCallbacks() {
  const callbacks = [...rafCallbacks];
  rafCallbacks.length = 0;
  callbacks.forEach(cb => cb());
}

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockTimelineItems(count: number): TimelineItem[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'messages' as const,
    key: `round-${i}-messages`,
    roundNumber: i,
    data: [
      {
        id: `msg-${i}`,
        role: MessageRoles.USER,
        content: `Message ${i}`,
        parts: [{ type: 'text', text: `Message ${i}` }],
      } satisfies UIMessage,
    ],
  }));
}

// ============================================================================
// SSR HYDRATION TESTS - FIXED BEHAVIOR
// ============================================================================

describe('useVirtualizedTimeline SSR Hydration', () => {
  describe('initial render state (SSR fix verified)', () => {
    it('should have SSR items on initial render when data is ready', () => {
      const timelineItems = createMockTimelineItems(5);

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
        }),
      );

      // ✅ SSR FIX: Initial state has estimated items for SSR
      // This prevents the flash of empty content on first paint
      expect(result.current.virtualItems.length).toBeGreaterThan(0);
      expect(result.current.virtualItems).toHaveLength(5);
      expect(result.current.totalSize).toBe(5 * 200); // 5 items * 200px estimate
    });

    it('should refine items with actual measurements after RAF', () => {
      const timelineItems = createMockTimelineItems(5);

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
        }),
      );

      // Before RAF: SSR estimated items are present
      expect(result.current.virtualItems).toHaveLength(5);

      // Simulate RAF running (client-side refinement)
      act(() => {
        flushRafCallbacks();
      });

      // After RAF: Items may be refined with actual measurements
      // (in our mock, they happen to match, but in real usage measurements would differ)
      expect(result.current.virtualItems.length).toBeGreaterThan(0);
    });

    it('should have empty content when isDataReady is false', () => {
      const timelineItems = createMockTimelineItems(5);

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: false,
        }),
      );

      // When data isn't ready, should be empty (correct behavior)
      expect(result.current.virtualItems).toHaveLength(0);
      expect(result.current.totalSize).toBe(0);
    });

    it('should have empty content when no timeline items', () => {
      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: [],
          isDataReady: true,
        }),
      );

      // No items = no SSR content (correct behavior)
      expect(result.current.virtualItems).toHaveLength(0);
      expect(result.current.totalSize).toBe(0);
    });
  });

  describe('ssr/client hydration match', () => {
    it('server and client should render the same initial content', () => {
      const timelineItems = createMockTimelineItems(5);

      // SERVER RENDER SIMULATION (no RAF runs on server)
      const { result: serverResult } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
        }),
      );

      const serverVirtualItems = serverResult.current.virtualItems;
      const serverTotalSize = serverResult.current.totalSize;

      // CLIENT RENDER SIMULATION (before RAF runs)
      const { result: clientResult } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
        }),
      );

      const clientVirtualItems = clientResult.current.virtualItems;
      const clientTotalSize = clientResult.current.totalSize;

      // ✅ SSR FIX VERIFIED: Server and client have SAME initial content
      // This prevents hydration mismatch and flash of empty content
      expect(serverVirtualItems).toHaveLength(5);
      expect(clientVirtualItems).toHaveLength(5);
      expect(serverTotalSize).toBe(clientTotalSize);
      expect(serverVirtualItems).toHaveLength(clientVirtualItems.length);
    });

    it('ssr items have correct structure for rendering', () => {
      const timelineItems = createMockTimelineItems(3);

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
          estimateSize: 150, // Custom estimate size
        }),
      );

      // Verify SSR items have required properties for rendering
      const items = result.current.virtualItems;
      expect(items).toHaveLength(3);

      items.forEach((item, idx) => {
        expect(item.index).toBe(idx);
        expect(item.start).toBe(idx * 150);
        expect(item.end).toBe((idx + 1) * 150);
        expect(item.size).toBe(150);
      });

      expect(result.current.totalSize).toBe(3 * 150);
    });
  });

  describe('store integration', () => {
    it('should have SSR items when hasInitiallyLoaded is true', () => {
      const timelineItems = createMockTimelineItems(5);

      // Simulate the pattern used in ChatView
      // isDataReady = hasInitiallyLoaded && messages.length > 0
      const hasInitiallyLoaded = true;
      const messages = timelineItems;
      const isDataReady = hasInitiallyLoaded && messages.length > 0;

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady,
        }),
      );

      // ✅ SSR FIX: Initial state has items for SSR rendering
      expect(result.current.virtualItems).toHaveLength(5);
      expect(result.current.totalSize).toBe(1000); // 5 * 200
    });
  });

  describe('ssr item limits', () => {
    it('should limit SSR items to maxItems (15 by default)', () => {
      const timelineItems = createMockTimelineItems(30); // More than maxItems

      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems,
          isDataReady: true,
        }),
      );

      // SSR items capped at 15 to avoid rendering too much content
      // (actual virtualizer will show correct items after RAF)
      expect(result.current.virtualItems.length).toBeLessThanOrEqual(15);
      // totalSize should still reflect all items
      expect(result.current.totalSize).toBe(30 * 200);
    });
  });
});

describe('ssr fix implementation', () => {
  it('implements SSR fix via estimated virtual items', () => {
    // The fix creates estimated virtual items on initial render:
    // 1. useState initializer checks isDataReady && timelineItems.length > 0
    // 2. If true, creates SSR items with estimated positions
    // 3. Client RAF refines with actual measurements
    //
    // Benefits:
    // - Server renders with content (no empty flash)
    // - Client hydrates with same content (no mismatch)
    // - RAF updates with actual measurements seamlessly

    const timelineItems = createMockTimelineItems(5);

    const { result } = renderHook(() =>
      useVirtualizedTimeline({
        timelineItems,
        isDataReady: true,
      }),
    );

    // Verify fix is working
    expect(result.current.virtualItems).toHaveLength(5);
    expect(result.current.totalSize).toBe(1000);
  });
});

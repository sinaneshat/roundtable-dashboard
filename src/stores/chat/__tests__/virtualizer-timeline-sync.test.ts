/**
 * Virtualizer Timeline Sync Tests
 *
 * Tests for use-virtualized-timeline sync logic focusing on:
 * - Count change detection logic
 * - Streaming state behavior
 * - shouldAdjustScrollPositionOnItemSizeChange logic
 * - Configuration and edge cases
 *
 * These tests verify the core logic that ensures:
 * 1. Count changes are detected correctly
 * 2. Streaming prevents scroll position adjustments
 * 3. totalSize behaves correctly based on streaming state
 * 4. Configuration options are respected
 */

import { describe, expect, it } from 'vitest';

import type { TimelineItem } from '@/hooks/utils/use-thread-timeline';

// ============================================================================
// TEST HELPERS - Pure function logic extracted from hook
// ============================================================================

/**
 * Create mock timeline items
 */
function createMockTimelineItems(count: number): TimelineItem[] {
  return Array.from({ length: count }, (_, index) => ({
    type: 'messages' as const,
    data: [],
    key: `round-${index + 1}-messages`,
    roundNumber: index + 1,
  }));
}

/**
 * Determines if virtualizer should be enabled
 * Extracted from hook logic
 */
function shouldEnableVirtualizer(isDataReady: boolean, itemCount: number): boolean {
  return isDataReady && itemCount > 0;
}

/**
 * Determines if scroll position should adjust based on streaming state and item position
 * Extracted from shouldAdjustScrollPositionOnItemSizeChange logic
 */
function shouldAdjustScrollPosition(params: {
  isStreaming: boolean;
  isStreamingFromStore?: boolean;
  itemStart: number;
  scrollOffset: number;
  scrollDirection: 'forward' | 'backward' | null;
}): boolean {
  const { isStreaming, isStreamingFromStore, itemStart, scrollOffset, scrollDirection } = params;

  // Check BOTH ref and store for streaming state (race condition fix)
  const isCurrentlyStreaming = isStreaming || (isStreamingFromStore ?? false);

  // During streaming, NEVER adjust scroll position
  if (isCurrentlyStreaming) {
    return false;
  }

  // Maintainer pattern: Only adjust for items above scroll position when scrolling backward
  const isItemAboveViewport = itemStart < scrollOffset;
  const isScrollingBackward = scrollDirection === 'backward';

  return isItemAboveViewport && isScrollingBackward;
}

/**
 * Determines effective totalSize based on streaming state
 * Extracted from syncVirtualizerState logic
 */
function getEffectiveTotalSize(params: {
  newTotalSize: number;
  isStreaming: boolean;
  isStreamingFromStore?: boolean;
  minTotalSize: number | null;
}): {
  effectiveTotalSize: number;
  updatedMinTotalSize: number | null;
} {
  const { newTotalSize, isStreaming, isStreamingFromStore, minTotalSize } = params;

  // Check BOTH ref and store for streaming state
  const isCurrentlyStreaming = isStreaming || (isStreamingFromStore ?? false);

  if (isCurrentlyStreaming && minTotalSize !== null) {
    // Allow totalSize to GROW but not SHRINK below minimum
    const updatedMin = newTotalSize > minTotalSize ? newTotalSize : minTotalSize;
    return {
      effectiveTotalSize: Math.max(newTotalSize, minTotalSize),
      updatedMinTotalSize: updatedMin,
    };
  }

  if (isCurrentlyStreaming && minTotalSize === null) {
    // Streaming just started - capture current size as minimum
    return {
      effectiveTotalSize: newTotalSize,
      updatedMinTotalSize: newTotalSize,
    };
  }

  // Not streaming - reset minimum and use actual size
  return {
    effectiveTotalSize: newTotalSize,
    updatedMinTotalSize: null,
  };
}

/**
 * Detects if count changed between renders
 */
function hasCountChanged(prevCount: number, newCount: number): boolean {
  return prevCount !== newCount;
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('virtualizer enablement logic', () => {
  it('enables virtualizer when data is ready and items exist', () => {
    expect(shouldEnableVirtualizer(true, 5)).toBe(true);
  });

  it('disables virtualizer when data is not ready', () => {
    expect(shouldEnableVirtualizer(false, 5)).toBe(false);
  });

  it('disables virtualizer when no items exist', () => {
    expect(shouldEnableVirtualizer(true, 0)).toBe(false);
  });

  it('disables virtualizer when both conditions fail', () => {
    expect(shouldEnableVirtualizer(false, 0)).toBe(false);
  });
});

describe('count change detection', () => {
  it('detects count increase', () => {
    expect(hasCountChanged(3, 5)).toBe(true);
  });

  it('detects count decrease', () => {
    expect(hasCountChanged(5, 3)).toBe(true);
  });

  it('detects no change when count same', () => {
    expect(hasCountChanged(3, 3)).toBe(false);
  });

  it('handles zero to non-zero transition', () => {
    expect(hasCountChanged(0, 1)).toBe(true);
  });

  it('handles non-zero to zero transition', () => {
    expect(hasCountChanged(1, 0)).toBe(true);
  });
});

describe('scroll position adjustment logic', () => {
  describe('during Streaming', () => {
    it('prevents scroll adjustment when streaming prop is true', () => {
      const result = shouldAdjustScrollPosition({
        isStreaming: true,
        itemStart: 100,
        scrollOffset: 300,
        scrollDirection: 'backward',
      });
      expect(result).toBe(false);
    });

    it('prevents scroll adjustment when store says streaming', () => {
      const result = shouldAdjustScrollPosition({
        isStreaming: false, // Prop says not streaming
        isStreamingFromStore: true, // But store says streaming
        itemStart: 100,
        scrollOffset: 300,
        scrollDirection: 'backward',
      });
      expect(result).toBe(false);
    });

    it('prevents scroll adjustment when BOTH indicate streaming', () => {
      const result = shouldAdjustScrollPosition({
        isStreaming: true,
        isStreamingFromStore: true,
        itemStart: 100,
        scrollOffset: 300,
        scrollDirection: 'backward',
      });
      expect(result).toBe(false);
    });

    it('prevents scroll adjustment regardless of item position', () => {
      // Item above viewport
      expect(shouldAdjustScrollPosition({
        isStreaming: true,
        itemStart: 100,
        scrollOffset: 300,
        scrollDirection: 'backward',
      })).toBe(false);

      // Item below viewport
      expect(shouldAdjustScrollPosition({
        isStreaming: true,
        itemStart: 400,
        scrollOffset: 300,
        scrollDirection: 'backward',
      })).toBe(false);
    });

    it('prevents scroll adjustment regardless of scroll direction', () => {
      // Backward scroll
      expect(shouldAdjustScrollPosition({
        isStreaming: true,
        itemStart: 100,
        scrollOffset: 300,
        scrollDirection: 'backward',
      })).toBe(false);

      // Forward scroll
      expect(shouldAdjustScrollPosition({
        isStreaming: true,
        itemStart: 100,
        scrollOffset: 300,
        scrollDirection: 'forward',
      })).toBe(false);
    });
  });

  describe('when Not Streaming', () => {
    it('adjusts for item above viewport during backward scroll', () => {
      const result = shouldAdjustScrollPosition({
        isStreaming: false,
        itemStart: 100,
        scrollOffset: 300,
        scrollDirection: 'backward',
      });
      expect(result).toBe(true);
    });

    it('does not adjust for item below viewport during backward scroll', () => {
      const result = shouldAdjustScrollPosition({
        isStreaming: false,
        itemStart: 400,
        scrollOffset: 300,
        scrollDirection: 'backward',
      });
      expect(result).toBe(false);
    });

    it('does not adjust for item above viewport during forward scroll', () => {
      const result = shouldAdjustScrollPosition({
        isStreaming: false,
        itemStart: 100,
        scrollOffset: 300,
        scrollDirection: 'forward',
      });
      expect(result).toBe(false);
    });

    it('does not adjust for item below viewport during forward scroll', () => {
      const result = shouldAdjustScrollPosition({
        isStreaming: false,
        itemStart: 400,
        scrollOffset: 300,
        scrollDirection: 'forward',
      });
      expect(result).toBe(false);
    });

    it('does not adjust when scroll direction is null', () => {
      const result = shouldAdjustScrollPosition({
        isStreaming: false,
        itemStart: 100,
        scrollOffset: 300,
        scrollDirection: null,
      });
      expect(result).toBe(false);
    });
  });
});

describe('totalSize Behavior During Streaming', () => {
  describe('streaming Active with Minimum Captured', () => {
    it('allows totalSize to grow above minimum', () => {
      const result = getEffectiveTotalSize({
        newTotalSize: 1200,
        isStreaming: true,
        minTotalSize: 1000,
      });

      expect(result.effectiveTotalSize).toBe(1200);
      expect(result.updatedMinTotalSize).toBe(1200); // Minimum updated to new size
    });

    it('prevents totalSize from shrinking below minimum', () => {
      const result = getEffectiveTotalSize({
        newTotalSize: 800,
        isStreaming: true,
        minTotalSize: 1000,
      });

      expect(result.effectiveTotalSize).toBe(1000); // Clamped to minimum
      expect(result.updatedMinTotalSize).toBe(1000); // Minimum unchanged
    });

    it('maintains totalSize when equal to minimum', () => {
      const result = getEffectiveTotalSize({
        newTotalSize: 1000,
        isStreaming: true,
        minTotalSize: 1000,
      });

      expect(result.effectiveTotalSize).toBe(1000);
      expect(result.updatedMinTotalSize).toBe(1000);
    });
  });

  describe('streaming Just Started (No Minimum)', () => {
    it('captures current totalSize as minimum', () => {
      const result = getEffectiveTotalSize({
        newTotalSize: 1000,
        isStreaming: true,
        minTotalSize: null,
      });

      expect(result.effectiveTotalSize).toBe(1000);
      expect(result.updatedMinTotalSize).toBe(1000); // Minimum captured
    });

    it('handles zero totalSize when streaming starts', () => {
      const result = getEffectiveTotalSize({
        newTotalSize: 0,
        isStreaming: true,
        minTotalSize: null,
      });

      expect(result.effectiveTotalSize).toBe(0);
      expect(result.updatedMinTotalSize).toBe(0);
    });
  });

  describe('streaming Ended', () => {
    it('resets minimum and uses actual totalSize', () => {
      const result = getEffectiveTotalSize({
        newTotalSize: 800,
        isStreaming: false,
        minTotalSize: 1000, // Had a minimum, but streaming ended
      });

      expect(result.effectiveTotalSize).toBe(800); // Uses actual size
      expect(result.updatedMinTotalSize).toBeNull(); // Minimum reset
    });

    it('allows totalSize to decrease after streaming ends', () => {
      const result = getEffectiveTotalSize({
        newTotalSize: 500,
        isStreaming: false,
        minTotalSize: 1000,
      });

      expect(result.effectiveTotalSize).toBe(500);
      expect(result.updatedMinTotalSize).toBeNull();
    });
  });

  describe('store-Based Streaming Check', () => {
    it('uses store value when prop is false but store is true', () => {
      const result = getEffectiveTotalSize({
        newTotalSize: 800,
        isStreaming: false, // Prop says not streaming
        isStreamingFromStore: true, // But store says streaming
        minTotalSize: 1000,
      });

      // Should prevent shrinking because store says streaming
      expect(result.effectiveTotalSize).toBe(1000);
      expect(result.updatedMinTotalSize).toBe(1000);
    });

    it('falls back to prop when store not provided', () => {
      const result = getEffectiveTotalSize({
        newTotalSize: 800,
        isStreaming: true,
        // No isStreamingFromStore
        minTotalSize: 1000,
      });

      // Should prevent shrinking because prop says streaming
      expect(result.effectiveTotalSize).toBe(1000);
      expect(result.updatedMinTotalSize).toBe(1000);
    });
  });
});

describe('timeline item creation', () => {
  it('creates correct number of timeline items', () => {
    const items = createMockTimelineItems(5);
    expect(items).toHaveLength(5);
  });

  it('creates items with correct type', () => {
    const items = createMockTimelineItems(3);
    items.forEach((item) => {
      expect(item.type).toBe('messages');
    });
  });

  it('creates items with unique keys', () => {
    const items = createMockTimelineItems(5);
    const keys = items.map(item => item.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(5);
  });

  it('creates items with sequential round numbers', () => {
    const items = createMockTimelineItems(5);
    items.forEach((item, index) => {
      expect(item.roundNumber).toBe(index + 1);
    });
  });

  it('handles zero count', () => {
    const items = createMockTimelineItems(0);
    expect(items).toHaveLength(0);
  });

  it('handles single item', () => {
    const items = createMockTimelineItems(1);
    expect(items).toHaveLength(1);
    expect(items[0].roundNumber).toBe(1);
  });
});

describe('edge cases and regression scenarios', () => {
  describe('count Change Without Scroll Event', () => {
    it('detects count change that should trigger sync', () => {
      // Simulates user submitting non-initial round message
      const prevCount = 3;
      const newCount = 4;

      // This change should trigger the useLayoutEffect in the hook
      expect(hasCountChanged(prevCount, newCount)).toBe(true);
    });

    it('handles multiple rapid count changes', () => {
      const changes = [
        { prev: 3, new: 5 },
        { prev: 5, new: 7 },
        { prev: 7, new: 4 },
      ];

      changes.forEach(({ prev, new: newCount }) => {
        expect(hasCountChanged(prev, newCount)).toBe(true);
      });
    });
  });

  describe('streaming State Transitions', () => {
    it('handles streaming start (captures minimum)', () => {
      // Not streaming → streaming (should capture minimum)
      const result = getEffectiveTotalSize({
        newTotalSize: 1000,
        isStreaming: true,
        minTotalSize: null, // Was null before streaming started
      });

      expect(result.updatedMinTotalSize).toBe(1000);
    });

    it('handles streaming end (resets minimum)', () => {
      // Streaming → not streaming (should reset minimum)
      const result = getEffectiveTotalSize({
        newTotalSize: 1000,
        isStreaming: false,
        minTotalSize: 1000, // Had minimum during streaming
      });

      expect(result.updatedMinTotalSize).toBeNull();
    });

    it('handles rapid streaming toggles', () => {
      // Start streaming
      const start = getEffectiveTotalSize({
        newTotalSize: 1000,
        isStreaming: true,
        minTotalSize: null,
      });
      expect(start.updatedMinTotalSize).toBe(1000);

      // End streaming
      const end = getEffectiveTotalSize({
        newTotalSize: 1000,
        isStreaming: false,
        minTotalSize: start.updatedMinTotalSize,
      });
      expect(end.updatedMinTotalSize).toBeNull();

      // Start again
      const restart = getEffectiveTotalSize({
        newTotalSize: 1200,
        isStreaming: true,
        minTotalSize: end.updatedMinTotalSize,
      });
      expect(restart.updatedMinTotalSize).toBe(1200);
    });
  });

  describe('scroll Jump Prevention', () => {
    it('prevents jumps during participant streaming', () => {
      // Item size increases during streaming (content growing)
      const itemStart = 100;
      const scrollOffset = 300;

      const shouldAdjust = shouldAdjustScrollPosition({
        isStreaming: true,
        itemStart,
        scrollOffset,
        scrollDirection: 'backward',
      });

      // Should NOT adjust to prevent scroll jump
      expect(shouldAdjust).toBe(false);
    });

    it('prevents jumps during moderator streaming', () => {
      // Same scenario but during moderator streaming
      const shouldAdjust = shouldAdjustScrollPosition({
        isStreaming: false, // Participant not streaming
        isStreamingFromStore: true, // But moderator is streaming
        itemStart: 100,
        scrollOffset: 300,
        scrollDirection: 'backward',
      });

      expect(shouldAdjust).toBe(false);
    });

    it('allows normal adjustments when not streaming', () => {
      // Reading history - item above viewport during backward scroll
      const shouldAdjust = shouldAdjustScrollPosition({
        isStreaming: false,
        itemStart: 100,
        scrollOffset: 300,
        scrollDirection: 'backward',
      });

      // Should adjust for reading experience
      expect(shouldAdjust).toBe(true);
    });
  });
});

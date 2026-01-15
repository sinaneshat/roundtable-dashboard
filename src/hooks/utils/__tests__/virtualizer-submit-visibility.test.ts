/**
 * Virtualizer Submit Visibility Tests
 *
 * Tests for the critical issue where virtualizer hides content upon message submission.
 * This test suite verifies:
 * 1. Timeline items are properly created when optimistic message is added
 * 2. Virtualizer responds to item count changes immediately
 * 3. Placeholders are visible during streaming
 * 4. Content height is properly adjusted
 *
 * BUG BEING TESTED:
 * When user submits a message, the virtualizer hides content instead of:
 * - Showing the user message immediately
 * - Showing placeholder cards for participants
 * - Maintaining proper scroll position
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageRoles, ModelIds } from '@/api/core/enums';
import { act, renderHook } from '@/lib/testing';

import type { TimelineItem } from '../use-thread-timeline';
import { useThreadTimeline } from '../use-thread-timeline';
import { useVirtualizedTimeline } from '../use-virtualized-timeline';

// Create mock functions outside of mock to track calls
const mockGetVirtualItems = vi.fn(() => []);
const mockGetTotalSize = vi.fn(() => 0);
const mockMeasureElement = vi.fn();
const mockScrollToIndex = vi.fn();
const mockScrollToOffset = vi.fn();

type VirtualizerInstance = {
  getVirtualItems: () => unknown[];
  getTotalSize: () => number;
  measureElement: (element: Element | null) => void;
  scrollToIndex: (index: number, options?: object) => void;
  scrollToOffset: (offset: number, options?: object) => void;
  shouldAdjustScrollPositionOnItemSizeChange?: unknown;
};

type VirtualizerOptions = {
  onChange?: (instance: VirtualizerInstance) => void;
  count?: number;
  [key: string]: unknown;
};

let capturedOnChange: ((instance: VirtualizerInstance) => void) | null = null;
let lastVirtualizerCount = 0;

// Track RAF callbacks for testing deferred execution
const rafCallbacks: Array<() => void> = [];
let rafIdCounter = 0;

// Store original RAF/CAF for restoration
const originalRaf = globalThis.requestAnimationFrame;
const originalCaf = globalThis.cancelAnimationFrame;

const mockVirtualizerInstance: VirtualizerInstance = {
  getVirtualItems: mockGetVirtualItems,
  getTotalSize: mockGetTotalSize,
  measureElement: mockMeasureElement,
  scrollToIndex: mockScrollToIndex,
  scrollToOffset: mockScrollToOffset,
};

const mockUseWindowVirtualizer = vi.fn((options: VirtualizerOptions) => {
  if (options?.onChange) {
    capturedOnChange = options.onChange;
  }
  if (options?.count !== undefined) {
    lastVirtualizerCount = options.count;
  }
  return mockVirtualizerInstance;
});

vi.mock('@tanstack/react-virtual', () => ({
  useWindowVirtualizer: (options: VirtualizerOptions) => mockUseWindowVirtualizer(options),
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

function createUserMessage(roundNumber: number, text: string, isOptimistic = false): UIMessage {
  return {
    id: isOptimistic ? `optimistic-user-${roundNumber}-${Date.now()}` : `user-msg-round-${roundNumber}`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
      ...(isOptimistic && { isOptimistic: true }),
    },
  };
}

function createAssistantMessage(
  roundNumber: number,
  participantIndex: number,
  text: string,
): UIMessage {
  return {
    id: `assistant-msg-round-${roundNumber}-p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      participantId: `participant-${participantIndex + 1}`,
      model: participantIndex === 0 ? ModelIds.OPENAI_GPT_4O : ModelIds.ANTHROPIC_CLAUDE_3_5_SONNET,
      finishReason: 'stop',
      hasError: false,
    },
  };
}

function createModeratorMessage(roundNumber: number, text: string): UIMessage {
  return {
    id: `moderator-msg-round-${roundNumber}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      isModerator: true,
      roundNumber,
      model: ModelIds.GOOGLE_GEMINI_3_FLASH_PREVIEW,
      finishReason: 'stop',
    },
  };
}

function createCompletedRound0(): UIMessage[] {
  return [
    createUserMessage(0, 'First question'),
    createAssistantMessage(0, 0, 'GPT response'),
    createAssistantMessage(0, 1, 'Claude response'),
    createModeratorMessage(0, 'Round 0 summary'),
  ];
}

function createTimelineItem(
  roundNumber: number,
  messages: UIMessage[],
): TimelineItem {
  return {
    type: 'messages',
    key: `round-${roundNumber}-messages`,
    roundNumber,
    data: messages,
  };
}

// ============================================================================
// SETUP
// ============================================================================

describe('virtualizer Submit Visibility', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    rafCallbacks.length = 0;
    rafIdCounter = 0;
    capturedOnChange = null;
    lastVirtualizerCount = 0;

    mockGetVirtualItems.mockReturnValue([]);
    mockGetTotalSize.mockReturnValue(0);

    globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = ++rafIdCounter;
      rafCallbacks.push(() => callback(performance.now()));
      return id;
    });

    globalThis.cancelAnimationFrame = vi.fn();

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
    });

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

    vi.spyOn(document, 'querySelector').mockImplementation((selector) => {
      if (selector === '[data-virtualized-timeline]') {
        return document.createElement('div');
      }
      return null;
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
    vi.clearAllMocks();
  });

  // ============================================================================
  // TIMELINE ITEM CREATION ON SUBMIT
  // ============================================================================

  describe('timeline Item Creation on Submit', () => {
    it('should create timeline item when optimistic user message is added', () => {
      const round0Messages = createCompletedRound0();

      const { result: timelineResult, rerender } = renderHook(
        ({ messages }) => useThreadTimeline({ messages, changelog: [] }),
        { initialProps: { messages: round0Messages } },
      );

      // Initially should have 1 timeline item (round 0)
      expect(timelineResult.current).toHaveLength(1);
      expect(timelineResult.current[0]!.roundNumber).toBe(0);

      // Add optimistic user message for round 1
      const optimisticMessage = createUserMessage(1, 'Second question', true);
      const newMessages = [...round0Messages, optimisticMessage];

      rerender({ messages: newMessages });

      // Should now have 2 timeline items (round 0 and round 1)
      expect(timelineResult.current).toHaveLength(2);
      expect(timelineResult.current[1]!.roundNumber).toBe(1);
      expect(timelineResult.current[1]!.type).toBe('messages');

      // Round 1 should have the user message
      const round1Item = timelineResult.current[1]!;
      expect(round1Item.type).toBe('messages');
      // Type narrowing via assertion - we verified type above
      const messagesItem = round1Item as Extract<typeof round1Item, { type: 'messages' }>;
      expect(messagesItem.data).toHaveLength(1);
      expect(messagesItem.data[0]!.role).toBe(MessageRoles.USER);
    });

    it('should include round in timeline even with only user message (no participants yet)', () => {
      const round0Messages = createCompletedRound0();
      const optimisticMessage = createUserMessage(1, 'Second question', true);

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages: [...round0Messages, optimisticMessage],
          changelog: [],
        }),
      );

      // Round 1 should be in timeline despite having only user message
      const round1Items = result.current.filter(item => item.roundNumber === 1);
      expect(round1Items).toHaveLength(1);

      const round1 = round1Items[0]!;
      expect(round1.type).toBe('messages');
      // Type narrowing via assertion - we verified type above
      const messagesItem = round1 as Extract<typeof round1, { type: 'messages' }>;
      // Only user message, no participants yet
      expect(messagesItem.data).toHaveLength(1);
      expect(messagesItem.data[0]!.role).toBe(MessageRoles.USER);
    });
  });

  // ============================================================================
  // VIRTUALIZER COUNT CHANGES ON SUBMIT
  // ============================================================================

  describe('virtualizer Count Change on Submit', () => {
    it('should detect timeline item count increase when message is submitted', () => {
      const round0Timeline = [createTimelineItem(0, createCompletedRound0())];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(200);

      const { rerender } = renderHook(
        ({ items }) => useVirtualizedTimeline({
          timelineItems: items,
          isDataReady: true,
        }),
        { initialProps: { items: round0Timeline } },
      );

      // Execute RAF to complete initial sync
      act(() => {
        rafCallbacks.forEach(cb => cb());
        rafCallbacks.length = 0;
      });

      // Verify initial count
      expect(lastVirtualizerCount).toBe(1);

      // Add round 1 timeline item (simulating submit)
      const round1Timeline = [
        ...round0Timeline,
        createTimelineItem(1, [createUserMessage(1, 'Second question', true)]),
      ];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
        { index: 1, key: '1', start: 200, end: 400, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(400);

      rerender({ items: round1Timeline });

      // Virtualizer should be called with new count
      expect(lastVirtualizerCount).toBe(2);
    });

    it('should sync virtualizer state via RAF when item count changes', () => {
      const round0Timeline = [createTimelineItem(0, createCompletedRound0())];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(200);

      const { result, rerender } = renderHook(
        ({ items }) => useVirtualizedTimeline({
          timelineItems: items,
          isDataReady: true,
        }),
        { initialProps: { items: round0Timeline } },
      );

      // Execute initial RAF
      act(() => {
        rafCallbacks.forEach(cb => cb());
        rafCallbacks.length = 0;
      });

      // Verify initial state
      expect(result.current.virtualItems).toHaveLength(1);

      // Add round 1 (submit)
      const round1Timeline = [
        ...round0Timeline,
        createTimelineItem(1, [createUserMessage(1, 'Second question', true)]),
      ];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
        { index: 1, key: '1', start: 200, end: 400, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(400);

      rerender({ items: round1Timeline });

      // CRITICAL: RAF should be scheduled for count change sync
      expect(rafCallbacks.length).toBeGreaterThan(0);

      // Execute RAF
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      // Virtual items should now reflect 2 items
      expect(result.current.virtualItems).toHaveLength(2);
      expect(result.current.totalSize).toBe(400);
    });

    it('should NOT have empty virtualItems after submit (critical regression)', () => {
      const round0Timeline = [createTimelineItem(0, createCompletedRound0())];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(200);

      const { result, rerender } = renderHook(
        ({ items, isDataReady }) => useVirtualizedTimeline({
          timelineItems: items,
          isDataReady,
        }),
        { initialProps: { items: round0Timeline, isDataReady: true } },
      );

      // Complete initial sync
      act(() => {
        rafCallbacks.forEach(cb => cb());
        rafCallbacks.length = 0;
      });

      expect(result.current.virtualItems).toHaveLength(1);

      // Simulate submit: add new timeline item
      const round1Timeline = [
        ...round0Timeline,
        createTimelineItem(1, [createUserMessage(1, 'Second question', true)]),
      ];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
        { index: 1, key: '1', start: 200, end: 400, size: 200, lane: 0 },
      ]);

      rerender({ items: round1Timeline, isDataReady: true });

      // CRITICAL: virtualItems should NEVER be empty after submit
      // Even before RAF, SSR items should be present
      expect(result.current.virtualItems.length).toBeGreaterThan(0);

      // Execute RAF for actual measurements
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      expect(result.current.virtualItems).toHaveLength(2);
    });
  });

  // ============================================================================
  // isDataReady STATE TRANSITIONS
  // ============================================================================

  describe('isDataReady State Transitions', () => {
    it('should maintain virtualItems when isDataReady stays true during submit', () => {
      const timeline = [createTimelineItem(0, createCompletedRound0())];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(200);

      const { result, rerender } = renderHook(
        ({ items, isDataReady }) => useVirtualizedTimeline({
          timelineItems: items,
          isDataReady,
        }),
        { initialProps: { items: timeline, isDataReady: true } },
      );

      act(() => {
        rafCallbacks.forEach(cb => cb());
        rafCallbacks.length = 0;
      });

      expect(result.current.virtualItems).toHaveLength(1);

      // isDataReady stays true (normal submit flow)
      const newTimeline = [
        ...timeline,
        createTimelineItem(1, [createUserMessage(1, 'Question', true)]),
      ];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
        { index: 1, key: '1', start: 200, end: 400, size: 200, lane: 0 },
      ]);

      rerender({ items: newTimeline, isDataReady: true });

      // virtualItems should NOT be empty during transition
      expect(result.current.virtualItems.length).toBeGreaterThan(0);
    });

    it('should clear virtualItems only when isDataReady becomes false', () => {
      const timeline = [createTimelineItem(0, createCompletedRound0())];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(200);

      const { result, rerender } = renderHook(
        ({ items, isDataReady }) => useVirtualizedTimeline({
          timelineItems: items,
          isDataReady,
        }),
        { initialProps: { items: timeline, isDataReady: true } },
      );

      act(() => {
        rafCallbacks.forEach(cb => cb());
        rafCallbacks.length = 0;
      });

      expect(result.current.virtualItems).toHaveLength(1);

      // isDataReady becomes false (this would cause the bug)
      rerender({ items: timeline, isDataReady: false });

      // virtualItems should be cleared
      expect(result.current.virtualItems).toEqual([]);
    });

    it('cRITICAL: isDataReady should remain true during submit flow', () => {
      // This test documents the expected behavior:
      // isDataReady = hasInitiallyLoaded && messages.length > 0
      // During submit:
      // - hasInitiallyLoaded should stay true (we've already loaded)
      // - messages.length > 0 should stay true (we're adding, not removing)
      // Therefore isDataReady should remain true

      const round0Messages = createCompletedRound0();
      const hasInitiallyLoaded = true;

      // Before submit
      let isDataReady = hasInitiallyLoaded && round0Messages.length > 0;
      expect(isDataReady).toBe(true);

      // During submit (optimistic message added)
      const messagesAfterSubmit = [...round0Messages, createUserMessage(1, 'Q', true)];
      isDataReady = hasInitiallyLoaded && messagesAfterSubmit.length > 0;
      expect(isDataReady).toBe(true);
    });
  });

  // ============================================================================
  // STREAMING STATE AND PLACEHOLDER VISIBILITY
  // ============================================================================

  describe('streaming State and Placeholder Visibility', () => {
    it('should handle isStreaming transition without hiding content', () => {
      const timeline = [
        createTimelineItem(0, createCompletedRound0()),
        createTimelineItem(1, [createUserMessage(1, 'Question', true)]),
      ];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
        { index: 1, key: '1', start: 200, end: 400, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(400);

      const { result, rerender } = renderHook(
        ({ items, isStreaming }) => useVirtualizedTimeline({
          timelineItems: items,
          isDataReady: true,
          isStreaming,
        }),
        { initialProps: { items: timeline, isStreaming: false } },
      );

      act(() => {
        rafCallbacks.forEach(cb => cb());
        rafCallbacks.length = 0;
      });

      expect(result.current.virtualItems).toHaveLength(2);

      // Streaming starts
      rerender({ items: timeline, isStreaming: true });

      // virtualItems should still be present
      expect(result.current.virtualItems).toHaveLength(2);
      expect(result.current.totalSize).toBe(400);
    });

    it('should maintain totalSize minimum during streaming (prevent scroll jump)', () => {
      const timeline = [
        createTimelineItem(0, createCompletedRound0()),
        createTimelineItem(1, [createUserMessage(1, 'Question', true)]),
      ];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
        { index: 1, key: '1', start: 200, end: 600, size: 400, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(600);

      const { result, rerender } = renderHook(
        ({ items, isStreaming }) => useVirtualizedTimeline({
          timelineItems: items,
          isDataReady: true,
          isStreaming,
        }),
        { initialProps: { items: timeline, isStreaming: false } },
      );

      act(() => {
        rafCallbacks.forEach(cb => cb());
        rafCallbacks.length = 0;
      });

      expect(result.current.totalSize).toBe(600);

      // Start streaming
      rerender({ items: timeline, isStreaming: true });

      // Simulate totalSize wanting to shrink during streaming
      mockGetTotalSize.mockReturnValue(300);

      // Trigger onChange
      if (capturedOnChange) {
        capturedOnChange(mockVirtualizerInstance);
      }

      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      // totalSize should NOT shrink below initial value during streaming
      expect(result.current.totalSize).toBeGreaterThanOrEqual(600);
    });
  });

  // ============================================================================
  // COMPLETE SUBMIT FLOW SIMULATION
  // ============================================================================

  // ============================================================================
  // CRITICAL BUG FIX TEST - Count Increase Immediate SSR Items
  // ============================================================================

  describe('count Increase Immediate SSR Items', () => {
    it('cRITICAL: should have SSR items for new count IMMEDIATELY (before RAF)', () => {
      // This test catches the exact bug:
      // When count increases, virtualItems should immediately reflect new count
      // NOT wait for RAF to update

      const round0Timeline = [createTimelineItem(0, createCompletedRound0())];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(200);

      const { result, rerender } = renderHook(
        ({ items }) => useVirtualizedTimeline({
          timelineItems: items,
          isDataReady: true,
          estimateSize: 200,
        }),
        { initialProps: { items: round0Timeline } },
      );

      // Complete initial sync
      act(() => {
        rafCallbacks.forEach(cb => cb());
        rafCallbacks.length = 0;
      });

      expect(result.current.virtualItems).toHaveLength(1);
      expect(result.current.totalSize).toBe(200);

      // Add round 1 (simulating submit) - count increases from 1 to 2
      const round1Timeline = [
        ...round0Timeline,
        createTimelineItem(1, [createUserMessage(1, 'Second question', true)]),
      ];

      // Mock returns for AFTER RAF (but we want to test BEFORE RAF)
      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
        { index: 1, key: '1', start: 200, end: 400, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(400);

      // Rerender with new items - DO NOT execute RAF yet
      rerender({ items: round1Timeline });

      // CRITICAL ASSERTION: Even BEFORE RAF runs, virtualItems should have 2 items
      // This is the exact bug fix - immediate SSR items when count increases
      expect(result.current.virtualItems).toHaveLength(2);

      // totalSize should also be updated immediately
      expect(result.current.totalSize).toBe(400); // 2 items * 200px estimate

      // Now execute RAF - should still have 2 items (refined measurements)
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      expect(result.current.virtualItems).toHaveLength(2);
    });

    it('should maintain measured sizes for existing items when count increases', () => {
      const round0Timeline = [createTimelineItem(0, createCompletedRound0())];

      // Simulate that round 0 was measured at 300px (larger than estimate)
      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 300, size: 300, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(300);

      const { result, rerender } = renderHook(
        ({ items }) => useVirtualizedTimeline({
          timelineItems: items,
          isDataReady: true,
          estimateSize: 200,
        }),
        { initialProps: { items: round0Timeline } },
      );

      // Complete initial sync with measured size
      act(() => {
        rafCallbacks.forEach(cb => cb());
        rafCallbacks.length = 0;
      });

      expect(result.current.totalSize).toBe(300);

      // Add round 1
      const round1Timeline = [
        ...round0Timeline,
        createTimelineItem(1, [createUserMessage(1, 'Q', true)]),
      ];

      // After RAF, virtualizer will have accurate measurements
      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 300, size: 300, lane: 0 },
        { index: 1, key: '1', start: 300, end: 500, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(500);

      rerender({ items: round1Timeline });

      // Before RAF: SSR items use estimate (200px each)
      expect(result.current.virtualItems).toHaveLength(2);
      expect(result.current.totalSize).toBe(400); // 2 * 200px estimate

      // After RAF: Actual measurements
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      expect(result.current.totalSize).toBe(500); // Actual measured size
    });

    it('should NOT use SSR items when count DECREASES (navigation/reset)', () => {
      // When navigating away, count decreases - should not override with SSR items
      const timeline = [
        createTimelineItem(0, createCompletedRound0()),
        createTimelineItem(1, [createUserMessage(1, 'Q', true)]),
      ];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
        { index: 1, key: '1', start: 200, end: 400, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(400);

      const { result, rerender } = renderHook(
        ({ items }) => useVirtualizedTimeline({
          timelineItems: items,
          isDataReady: true,
        }),
        { initialProps: { items: timeline } },
      );

      act(() => {
        rafCallbacks.forEach(cb => cb());
        rafCallbacks.length = 0;
      });

      expect(result.current.virtualItems).toHaveLength(2);

      // Remove round 1 (simulating navigation back)
      const reducedTimeline = [timeline[0]!];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(200);

      rerender({ items: reducedTimeline });

      // RAF should run to get actual state (not SSR override)
      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      expect(result.current.virtualItems).toHaveLength(1);
      expect(result.current.totalSize).toBe(200);
    });
  });

  describe('complete Submit Flow Simulation', () => {
    it('should maintain visibility through entire submit flow', () => {
      // Initial state: completed round 0
      const round0Messages = createCompletedRound0();
      const initialTimeline = [createTimelineItem(0, round0Messages)];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 300, size: 300, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(300);

      const { result, rerender } = renderHook(
        ({ items, isDataReady, isStreaming }) => useVirtualizedTimeline({
          timelineItems: items,
          isDataReady,
          isStreaming,
        }),
        {
          initialProps: {
            items: initialTimeline,
            isDataReady: true,
            isStreaming: false,
          },
        },
      );

      // Complete initial sync
      act(() => {
        rafCallbacks.forEach(cb => cb());
        rafCallbacks.length = 0;
      });

      // STEP 1: Before submit - verify initial state
      expect(result.current.virtualItems).toHaveLength(1);
      expect(result.current.totalSize).toBe(300);

      // STEP 2: User clicks submit - optimistic message added
      const optimisticMessage = createUserMessage(1, 'Second question', true);
      const afterOptimisticTimeline = [
        ...initialTimeline,
        createTimelineItem(1, [optimisticMessage]),
      ];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 300, size: 300, lane: 0 },
        { index: 1, key: '1', start: 300, end: 400, size: 100, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(400);

      rerender({
        items: afterOptimisticTimeline,
        isDataReady: true,
        isStreaming: false,
      });

      // CRITICAL: Content should NOT disappear
      expect(result.current.virtualItems.length).toBeGreaterThan(0);

      // Execute RAF for sync
      act(() => {
        rafCallbacks.forEach(cb => cb());
        rafCallbacks.length = 0;
      });

      // STEP 3: After RAF - should have 2 items
      expect(result.current.virtualItems).toHaveLength(2);

      // STEP 4: Streaming starts
      rerender({
        items: afterOptimisticTimeline,
        isDataReady: true,
        isStreaming: true,
      });

      // Content should still be visible
      expect(result.current.virtualItems).toHaveLength(2);
      expect(result.current.totalSize).toBeGreaterThan(0);
    });

    it('rEGRESSION: should not have zero virtualItems at any point during submit', () => {
      const states: Array<{ step: string; itemCount: number; totalSize: number }> = [];

      const round0Messages = createCompletedRound0();
      const initialTimeline = [createTimelineItem(0, round0Messages)];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(200);

      const { result, rerender } = renderHook(
        ({ items, isDataReady }) => useVirtualizedTimeline({
          timelineItems: items,
          isDataReady,
        }),
        { initialProps: { items: initialTimeline, isDataReady: true } },
      );

      states.push({
        step: 'initial-render',
        itemCount: result.current.virtualItems.length,
        totalSize: result.current.totalSize,
      });

      act(() => {
        rafCallbacks.forEach(cb => cb());
        rafCallbacks.length = 0;
      });

      states.push({
        step: 'after-initial-raf',
        itemCount: result.current.virtualItems.length,
        totalSize: result.current.totalSize,
      });

      // Submit: add new timeline item
      const newTimeline = [
        ...initialTimeline,
        createTimelineItem(1, [createUserMessage(1, 'Q', true)]),
      ];

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: '0', start: 0, end: 200, size: 200, lane: 0 },
        { index: 1, key: '1', start: 200, end: 400, size: 200, lane: 0 },
      ]);
      mockGetTotalSize.mockReturnValue(400);

      rerender({ items: newTimeline, isDataReady: true });

      states.push({
        step: 'after-rerender',
        itemCount: result.current.virtualItems.length,
        totalSize: result.current.totalSize,
      });

      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      states.push({
        step: 'after-submit-raf',
        itemCount: result.current.virtualItems.length,
        totalSize: result.current.totalSize,
      });

      // CRITICAL ASSERTION: No state should have zero items
      states.forEach((state) => {
        expect(state.itemCount).toBeGreaterThan(0);
        expect(state.totalSize).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================================
  // HEIGHT CALCULATION
  // ============================================================================

  describe('height Calculation', () => {
    it('should calculate proper totalSize for new timeline items', () => {
      const timeline = [createTimelineItem(0, createCompletedRound0())];

      mockGetTotalSize.mockReturnValue(400);

      const { result, rerender } = renderHook(
        ({ items }) => useVirtualizedTimeline({
          timelineItems: items,
          isDataReady: true,
        }),
        { initialProps: { items: timeline } },
      );

      act(() => {
        rafCallbacks.forEach(cb => cb());
        rafCallbacks.length = 0;
      });

      expect(result.current.totalSize).toBe(400);

      // Add new item
      mockGetTotalSize.mockReturnValue(600);

      rerender({
        items: [
          ...timeline,
          createTimelineItem(1, [createUserMessage(1, 'Q', true)]),
        ],
      });

      act(() => {
        rafCallbacks.forEach(cb => cb());
      });

      // totalSize should increase
      expect(result.current.totalSize).toBe(600);
    });

    it('should use estimateSize for SSR items before actual measurements', () => {
      const timeline = [
        createTimelineItem(0, createCompletedRound0()),
        createTimelineItem(1, [createUserMessage(1, 'Q', true)]),
      ];

      // Before RAF executes, should use estimated sizes (200px default)
      const { result } = renderHook(() =>
        useVirtualizedTimeline({
          timelineItems: timeline,
          isDataReady: true,
          estimateSize: 200,
        }),
      );

      // SSR items should be present with estimated size
      // 2 items * 200px = 400px total
      expect(result.current.totalSize).toBe(400);
      expect(result.current.virtualItems).toHaveLength(2);
    });
  });
});

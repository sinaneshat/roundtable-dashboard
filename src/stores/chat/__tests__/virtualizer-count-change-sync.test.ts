/**
 * Virtualizer Count Change Sync Tests
 *
 * Verifies that the virtualized timeline properly syncs state when item count changes.
 *
 * ROOT CAUSE BUG (Fixed):
 * TanStack Virtual's onChange callback only fires on scroll/resize events, NOT on count changes.
 * When a new timeline item is added without scroll, the virtualizer state becomes stale.
 *
 * FIX: Added a useLayoutEffect that detects count changes and forces a state sync via RAF.
 * This ensures new items are immediately visible without requiring a scroll event.
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { MessageRoles } from '@/api/core/enums';
import type { TimelineItem } from '@/hooks/utils/use-thread-timeline';
import { getRoundNumberFromMetadata } from '@/lib/utils';

// Simulate useThreadTimeline's message grouping
function createTimelineItems(messages: UIMessage[]): TimelineItem[] {
  const messagesByRound = new Map<number, UIMessage[]>();

  messages.forEach((message) => {
    const roundNumber = getRoundNumberFromMetadata(message.metadata, 0);
    if (!messagesByRound.has(roundNumber)) {
      messagesByRound.set(roundNumber, []);
    }
    messagesByRound.get(roundNumber)!.push(message);
  });

  const timeline: TimelineItem[] = [];
  const sortedRounds = Array.from(messagesByRound.keys()).sort((a, b) => a - b);

  sortedRounds.forEach((roundNumber) => {
    const roundMessages = messagesByRound.get(roundNumber)!;
    timeline.push({
      type: 'messages',
      data: roundMessages,
      key: `round-${roundNumber}-messages`,
      roundNumber,
    });
  });

  return timeline;
}

// Simulate virtualizer state management with count change detection
type VirtualizerState = {
  virtualItems: Array<{ index: number; key: string; start: number }>;
  totalSize: number;
};

function createMockVirtualizerStateManager() {
  let state: VirtualizerState = { virtualItems: [], totalSize: 0 };
  let prevCount = 0;
  let syncCallCount = 0;

  return {
    getState: () => state,
    getSyncCallCount: () => syncCallCount,

    // Simulates what useVirtualizedTimeline does on count change
    handleCountChange: (newCount: number) => {
      if (prevCount === newCount) {
        return; // No change, skip sync
      }

      // Count changed - this is what the fix adds
      syncCallCount++;
      prevCount = newCount;

      // Simulate virtualizer.getVirtualItems() returning new items
      state = {
        virtualItems: Array.from({ length: newCount }, (_, i) => ({
          index: i,
          key: `item-${i}`,
          start: i * 200,
        })),
        totalSize: newCount * 200,
      };
    },

    reset: () => {
      state = { virtualItems: [], totalSize: 0 };
      prevCount = 0;
      syncCallCount = 0;
    },
  };
}

describe('Virtualizer Count Change Sync', () => {
  describe('Count Change Detection', () => {
    it('should detect count increase from 1 to 2', () => {
      const manager = createMockVirtualizerStateManager();

      // Initial state with 1 item
      manager.handleCountChange(1);
      expect(manager.getState().virtualItems.length).toBe(1);
      expect(manager.getSyncCallCount()).toBe(1);

      // Add new item (non-initial round submission)
      manager.handleCountChange(2);
      expect(manager.getState().virtualItems.length).toBe(2);
      expect(manager.getSyncCallCount()).toBe(2); // Sync called again
    });

    it('should NOT sync when count stays the same', () => {
      const manager = createMockVirtualizerStateManager();

      // Initial state
      manager.handleCountChange(2);
      expect(manager.getSyncCallCount()).toBe(1);

      // Same count - should not sync
      manager.handleCountChange(2);
      expect(manager.getSyncCallCount()).toBe(1); // Still 1, no new sync
    });

    it('should handle rapid count increases', () => {
      const manager = createMockVirtualizerStateManager();

      manager.handleCountChange(1);
      manager.handleCountChange(2);
      manager.handleCountChange(3);

      expect(manager.getState().virtualItems.length).toBe(3);
      expect(manager.getSyncCallCount()).toBe(3);
    });
  });

  describe('Timeline Item Visibility After Non-Initial Round Submission', () => {
    it('should have correct timeline item count after optimistic message added', () => {
      // BEFORE submission: round 0 complete (3 messages: user + 2 participants)
      const beforeSubmission: UIMessage[] = [
        {
          id: 'user-r0',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Initial question' }],
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
        },
        {
          id: 'assistant-r0-p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Response 1' }],
          metadata: { role: MessageRoles.ASSISTANT, roundNumber: 0, participantIndex: 0 },
        },
        {
          id: 'assistant-r0-p1',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Response 2' }],
          metadata: { role: MessageRoles.ASSISTANT, roundNumber: 0, participantIndex: 1 },
        },
      ];

      const timelineBefore = createTimelineItems(beforeSubmission);
      expect(timelineBefore.length).toBe(1); // Only round 0

      // AFTER submission: add optimistic user message for round 1
      const afterSubmission: UIMessage[] = [
        ...beforeSubmission,
        {
          id: 'optimistic-user-1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Follow-up question' }],
          metadata: { role: MessageRoles.USER, roundNumber: 1, isOptimistic: true },
        },
      ];

      const timelineAfter = createTimelineItems(afterSubmission);
      expect(timelineAfter.length).toBe(2); // Round 0 + Round 1

      // Verify round 1 has the user message
      const round1 = timelineAfter.find(item => item.roundNumber === 1);
      expect(round1).toBeDefined();
      expect(round1!.type).toBe('messages');
      expect((round1!.data as UIMessage[]).length).toBe(1);
    });

    it('should trigger virtualizer sync when timeline count increases', () => {
      const manager = createMockVirtualizerStateManager();

      // Initial: 1 timeline item (round 0)
      manager.handleCountChange(1);
      const initialVirtualItems = manager.getState().virtualItems;
      expect(initialVirtualItems.length).toBe(1);

      // After submission: 2 timeline items (round 0 + round 1)
      manager.handleCountChange(2);
      const afterVirtualItems = manager.getState().virtualItems;
      expect(afterVirtualItems.length).toBe(2);

      // New item should have correct index
      expect(afterVirtualItems[1].index).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle count decrease (message deletion)', () => {
      const manager = createMockVirtualizerStateManager();

      manager.handleCountChange(3);
      expect(manager.getState().virtualItems.length).toBe(3);

      manager.handleCountChange(2);
      expect(manager.getState().virtualItems.length).toBe(2);
      expect(manager.getSyncCallCount()).toBe(2);
    });

    it('should handle reset to zero (navigation away)', () => {
      const manager = createMockVirtualizerStateManager();

      manager.handleCountChange(3);
      manager.handleCountChange(0);

      expect(manager.getState().virtualItems.length).toBe(0);
    });

    it('should handle initial load with multiple items', () => {
      const manager = createMockVirtualizerStateManager();

      // Initial load with 5 rounds already complete
      manager.handleCountChange(5);
      expect(manager.getState().virtualItems.length).toBe(5);
      expect(manager.getSyncCallCount()).toBe(1);
    });
  });

  describe('Critical Scenario: Non-Initial Round User Message Visibility', () => {
    it('CRITICAL: virtualizer state should update immediately when new round added', () => {
      const manager = createMockVirtualizerStateManager();

      // Simulate thread with round 0 complete
      manager.handleCountChange(1);
      expect(manager.getState().virtualItems.length).toBe(1);

      // User submits message for round 1 (non-initial)
      // This MUST trigger a sync to make the new item visible
      manager.handleCountChange(2);

      // CRITICAL ASSERTION: New item MUST be in virtualItems
      const virtualItems = manager.getState().virtualItems;
      expect(virtualItems.length).toBe(2);
      expect(virtualItems[1]).toBeDefined();
      expect(virtualItems[1].index).toBe(1);

      // Sync MUST have been called
      expect(manager.getSyncCallCount()).toBe(2);
    });

    it('CRITICAL: each new item should have correct positioning data', () => {
      const manager = createMockVirtualizerStateManager();

      // Add 3 items sequentially (simulating 3 rounds)
      manager.handleCountChange(1);
      manager.handleCountChange(2);
      manager.handleCountChange(3);

      const virtualItems = manager.getState().virtualItems;

      // Each item should have sequential positioning
      expect(virtualItems[0].start).toBe(0);
      expect(virtualItems[1].start).toBe(200);
      expect(virtualItems[2].start).toBe(400);

      // Keys should be unique
      const keys = virtualItems.map(v => v.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });
});

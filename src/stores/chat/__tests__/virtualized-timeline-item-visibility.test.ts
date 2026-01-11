/**
 * Virtualized Timeline Item Visibility Tests
 *
 * Tests that the virtualization logic properly includes NEW timeline items
 * when they are added (e.g., after user submits a new round).
 *
 * KEY BUG: User message and placeholders don't show until streaming completes.
 * This could be due to:
 * 1. Virtualizer not updating when timelineItems changes
 * 2. RAF timing causing delayed state updates
 * 3. Something else preventing the new item from appearing
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { MessageRoles } from '@/api/core/enums';
import type { TimelineItem } from '@/hooks/utils';
import { getRoundNumberFromMetadata } from '@/lib/utils';

// Simulate useThreadTimeline logic
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

// Simulate which items would be visible in virtualizer with overscan
function getVisibleItems(
  timelineItems: TimelineItem[],
  scrollOffset: number,
  viewportHeight: number,
  estimatedItemSize: number,
  overscan: number,
): TimelineItem[] {
  const totalItems = timelineItems.length;

  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollOffset / estimatedItemSize) - overscan);
  const endIndex = Math.min(
    totalItems,
    Math.ceil((scrollOffset + viewportHeight) / estimatedItemSize) + overscan,
  );

  return timelineItems.slice(startIndex, endIndex);
}

// Helper to create messages
function createUserMessage(roundNumber: number, text: string): UIMessage {
  return {
    id: `user-r${roundNumber}`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: { role: MessageRoles.USER, roundNumber },
  };
}

function createAssistantMessage(roundNumber: number, participantIndex: number): UIMessage {
  return {
    id: `assistant-r${roundNumber}-p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text: 'Response' }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
    },
  };
}

describe('virtualized Timeline Item Visibility', () => {
  describe('timeline Item Creation', () => {
    it('should create timeline item for new round with optimistic user message', () => {
      const messages: UIMessage[] = [
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0),
        createAssistantMessage(0, 1),
        // Just added optimistic message for round 1
        { ...createUserMessage(1, 'Round 1'), id: 'optimistic-user-1' },
      ];

      const timeline = createTimelineItems(messages);

      expect(timeline).toHaveLength(2);
      expect(timeline[0].roundNumber).toBe(0);
      expect(timeline[1].roundNumber).toBe(1);
    });
  });

  describe('virtualization Visibility', () => {
    // Constants matching ThreadTimeline's configuration
    const VIEWPORT_HEIGHT = 800;
    const ESTIMATED_ITEM_SIZE = 200;
    const OVERSCAN = 5;

    it('should include ALL items when total count is small (< overscan * 2)', () => {
      const messages: UIMessage[] = [
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0),
        { ...createUserMessage(1, 'Round 1'), id: 'optimistic-user-1' },
      ];

      const timeline = createTimelineItems(messages);
      const visibleItems = getVisibleItems(
        timeline,
        0, // at top
        VIEWPORT_HEIGHT,
        ESTIMATED_ITEM_SIZE,
        OVERSCAN,
      );

      // With only 2 items and overscan of 5, ALL items should be visible
      expect(visibleItems).toHaveLength(2);
      expect(visibleItems[0].roundNumber).toBe(0);
      expect(visibleItems[1].roundNumber).toBe(1);
    });

    it('should include new item when scrolled to bottom of existing content', () => {
      const messages: UIMessage[] = [
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0),
        createAssistantMessage(0, 1),
        { ...createUserMessage(1, 'Round 1'), id: 'optimistic-user-1' },
      ];

      const timeline = createTimelineItems(messages);

      // User is scrolled to bottom (viewing round 0)
      const scrollOffset = 0; // Just 1 item in round 0, so no scrolling needed

      const visibleItems = getVisibleItems(
        timeline,
        scrollOffset,
        VIEWPORT_HEIGHT,
        ESTIMATED_ITEM_SIZE,
        OVERSCAN,
      );

      // Both rounds should be visible
      expect(visibleItems).toHaveLength(2);
      expect(visibleItems.some(item => item.roundNumber === 1)).toBe(true);
    });

    it('should calculate correct visible range for small item count', () => {
      // Simulate the exact calculation the virtualizer would do
      const itemCount = 2;
      const scrollOffset = 0;
      const startIndex = Math.max(0, Math.floor(scrollOffset / ESTIMATED_ITEM_SIZE) - OVERSCAN);
      const endIndex = Math.min(
        itemCount,
        Math.ceil((scrollOffset + VIEWPORT_HEIGHT) / ESTIMATED_ITEM_SIZE) + OVERSCAN,
      );

      expect(startIndex).toBe(0);
      expect(endIndex).toBe(2); // Both items should be included
    });
  });

  describe('critical Path: Immediate Visibility After Submission', () => {
    it('should have round 1 in visible items immediately after optimistic message added', () => {
      // BEFORE submission: only round 0
      const beforeSubmission: UIMessage[] = [
        createUserMessage(0, 'Initial question'),
        createAssistantMessage(0, 0),
        createAssistantMessage(0, 1),
      ];

      const timelineBefore = createTimelineItems(beforeSubmission);
      expect(timelineBefore).toHaveLength(1);

      // AFTER submission: round 0 + optimistic round 1
      const afterSubmission: UIMessage[] = [
        ...beforeSubmission,
        { ...createUserMessage(1, 'Follow-up'), id: 'optimistic-user-1' },
      ];

      const timelineAfter = createTimelineItems(afterSubmission);
      expect(timelineAfter).toHaveLength(2);

      // Check that virtualization would include the new item
      const visibleAfter = getVisibleItems(
        timelineAfter,
        0,
        800,
        200,
        5,
      );

      expect(visibleAfter).toHaveLength(2);
      expect(visibleAfter[1].roundNumber).toBe(1);
      expect((visibleAfter[1].data as UIMessage[])[0].parts[0]).toEqual({
        type: 'text',
        text: 'Follow-up',
      });
    });
  });
});

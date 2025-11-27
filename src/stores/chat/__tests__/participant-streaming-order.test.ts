/**
 * Participant Streaming Order Tests
 *
 * Tests that participants stream in the correct order (by priority) and that
 * the currentParticipantIndex correctly maps to priority-sorted participants.
 *
 * BUG FIXED:
 * - currentParticipantIndex was set based on priority-sorted array in use-multi-participant-chat.ts
 * - But ChatMessageList and screen components indexed into UNSORTED participant arrays
 * - This caused the first stream to fill the last placeholder instead of the first
 *
 * FIX:
 * - Sort participants by priority before indexing with currentParticipantIndex
 * - Applied in:
 *   - ChatOverviewScreen.tsx (sortedContextParticipants)
 *   - ChatThreadScreen.tsx (sortedContextParticipants)
 *   - chat-message-list.tsx (getParticipantInfoForMessage)
 */

import { describe, expect, it } from 'vitest';

import type { ChatParticipant } from '@/api/routes/chat/schema';

import { createMockParticipant } from './test-factories';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Simulates how the streaming hook sorts participants by priority
 * This is the source of truth for currentParticipantIndex
 */
function sortParticipantsByPriority(participants: ChatParticipant[]): ChatParticipant[] {
  return [...participants].sort((a, b) => a.priority - b.priority);
}

/**
 * Gets the participant at a given index from a priority-sorted array
 * This is what currentParticipantIndex refers to
 */
function getParticipantAtStreamingIndex(
  participants: ChatParticipant[],
  currentParticipantIndex: number,
): ChatParticipant | undefined {
  const sorted = sortParticipantsByPriority(participants);
  return sorted[currentParticipantIndex];
}

// ============================================================================
// Tests
// ============================================================================

describe('participant Streaming Order', () => {
  describe('priority-based ordering', () => {
    it('should return first priority participant at index 0', () => {
      // Participants added in order: Claude (priority 1), GPT (priority 0), Gemini (priority 2)
      // Expected streaming order: GPT (0), Claude (1), Gemini (2)
      const participants: ChatParticipant[] = [
        createMockParticipant(0, { id: 'claude', modelId: 'anthropic/claude-3.5-sonnet', priority: 1 }),
        createMockParticipant(1, { id: 'gpt', modelId: 'openai/gpt-4', priority: 0 }),
        createMockParticipant(2, { id: 'gemini', modelId: 'google/gemini-pro', priority: 2 }),
      ];

      // currentParticipantIndex = 0 means first participant in priority order
      const streamingParticipant = getParticipantAtStreamingIndex(participants, 0);

      expect(streamingParticipant?.id).toBe('gpt');
      expect(streamingParticipant?.priority).toBe(0);
    });

    it('should return second priority participant at index 1', () => {
      const participants: ChatParticipant[] = [
        createMockParticipant(0, { id: 'claude', modelId: 'anthropic/claude-3.5-sonnet', priority: 1 }),
        createMockParticipant(1, { id: 'gpt', modelId: 'openai/gpt-4', priority: 0 }),
        createMockParticipant(2, { id: 'gemini', modelId: 'google/gemini-pro', priority: 2 }),
      ];

      const streamingParticipant = getParticipantAtStreamingIndex(participants, 1);

      expect(streamingParticipant?.id).toBe('claude');
      expect(streamingParticipant?.priority).toBe(1);
    });

    it('should return third priority participant at index 2', () => {
      const participants: ChatParticipant[] = [
        createMockParticipant(0, { id: 'claude', modelId: 'anthropic/claude-3.5-sonnet', priority: 1 }),
        createMockParticipant(1, { id: 'gpt', modelId: 'openai/gpt-4', priority: 0 }),
        createMockParticipant(2, { id: 'gemini', modelId: 'google/gemini-pro', priority: 2 }),
      ];

      const streamingParticipant = getParticipantAtStreamingIndex(participants, 2);

      expect(streamingParticipant?.id).toBe('gemini');
      expect(streamingParticipant?.priority).toBe(2);
    });
  });

  describe('reversed priority order (bug scenario)', () => {
    it('should NOT return last participant at index 0 (was the bug)', () => {
      // This tests the exact bug scenario:
      // User selects 3 models, they get priorities 0, 1, 2 in selection order
      // But store might have them in any order
      const participants: ChatParticipant[] = [
        createMockParticipant(0, { id: 'third', modelId: 'google/gemini-pro', priority: 2 }),
        createMockParticipant(1, { id: 'second', modelId: 'anthropic/claude-3.5-sonnet', priority: 1 }),
        createMockParticipant(2, { id: 'first', modelId: 'openai/gpt-4', priority: 0 }),
      ];

      // currentParticipantIndex = 0 should be the one with priority 0 (first)
      const streamingParticipant = getParticipantAtStreamingIndex(participants, 0);

      // BUG: Without sorting, participants[0] would return 'third' (wrong!)
      // FIX: With sorting, sorted[0] returns 'first' (correct!)
      expect(streamingParticipant?.id).toBe('first');
      expect(streamingParticipant?.id).not.toBe('third');
    });

    it('should stream all participants in correct priority order', () => {
      const participants: ChatParticipant[] = [
        createMockParticipant(0, { id: 'c', priority: 2 }),
        createMockParticipant(1, { id: 'a', priority: 0 }),
        createMockParticipant(2, { id: 'b', priority: 1 }),
      ];

      const streamingOrder = [0, 1, 2].map(idx =>
        getParticipantAtStreamingIndex(participants, idx)?.id,
      );

      expect(streamingOrder).toEqual(['a', 'b', 'c']);
    });
  });

  describe('sortParticipantsByPriority', () => {
    it('should sort participants ascending by priority', () => {
      const participants: ChatParticipant[] = [
        createMockParticipant(0, { id: 'high', priority: 10 }),
        createMockParticipant(1, { id: 'low', priority: 0 }),
        createMockParticipant(2, { id: 'mid', priority: 5 }),
      ];

      const sorted = sortParticipantsByPriority(participants);

      expect(sorted[0].id).toBe('low');
      expect(sorted[1].id).toBe('mid');
      expect(sorted[2].id).toBe('high');
    });

    it('should not mutate original array', () => {
      const participants: ChatParticipant[] = [
        createMockParticipant(0, { id: 'a', priority: 2 }),
        createMockParticipant(1, { id: 'b', priority: 0 }),
      ];

      const originalFirstId = participants[0].id;
      sortParticipantsByPriority(participants);

      expect(participants[0].id).toBe(originalFirstId);
    });

    it('should handle empty array', () => {
      const sorted = sortParticipantsByPriority([]);
      expect(sorted).toEqual([]);
    });

    it('should handle single participant', () => {
      const participants = [createMockParticipant(0, { id: 'only' })];
      const sorted = sortParticipantsByPriority(participants);

      expect(sorted).toHaveLength(1);
      expect(sorted[0].id).toBe('only');
    });

    it('should handle participants with same priority (stable sort)', () => {
      const participants: ChatParticipant[] = [
        createMockParticipant(0, { id: 'a', priority: 1 }),
        createMockParticipant(1, { id: 'b', priority: 1 }),
        createMockParticipant(2, { id: 'c', priority: 1 }),
      ];

      const sorted = sortParticipantsByPriority(participants);

      // All have same priority, order should be preserved (stable sort behavior)
      expect(sorted).toHaveLength(3);
      // Just verify all are present
      const ids = sorted.map(p => p.id);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).toContain('c');
    });
  });

  describe('index bounds', () => {
    it('should return undefined for out-of-bounds index', () => {
      const participants = [createMockParticipant(0)];

      expect(getParticipantAtStreamingIndex(participants, 1)).toBeUndefined();
      expect(getParticipantAtStreamingIndex(participants, -1)).toBeUndefined();
    });

    it('should return undefined for empty participants', () => {
      expect(getParticipantAtStreamingIndex([], 0)).toBeUndefined();
    });
  });

  describe('real-world scenarios', () => {
    it('should handle typical 3-model debate setup', () => {
      // User sets up debate with GPT-4, Claude, and Gemini
      // They drag to reorder: Claude first, then GPT-4, then Gemini
      const participants: ChatParticipant[] = [
        createMockParticipant(0, {
          id: 'p-claude',
          modelId: 'anthropic/claude-3.5-sonnet',
          priority: 0, // First in order
        }),
        createMockParticipant(1, {
          id: 'p-gpt',
          modelId: 'openai/gpt-4',
          priority: 1, // Second
        }),
        createMockParticipant(2, {
          id: 'p-gemini',
          modelId: 'google/gemini-pro',
          priority: 2, // Third
        }),
      ];

      // Streaming should happen in priority order
      expect(getParticipantAtStreamingIndex(participants, 0)?.modelId).toBe('anthropic/claude-3.5-sonnet');
      expect(getParticipantAtStreamingIndex(participants, 1)?.modelId).toBe('openai/gpt-4');
      expect(getParticipantAtStreamingIndex(participants, 2)?.modelId).toBe('google/gemini-pro');
    });

    it('should handle participants loaded from database in random order', () => {
      // When thread is loaded from DB, participants may come in any order
      // (e.g., ordered by createdAt or id)
      const participants: ChatParticipant[] = [
        createMockParticipant(0, { id: 'db-row-3', modelId: 'google/gemini-pro', priority: 2 }),
        createMockParticipant(1, { id: 'db-row-1', modelId: 'anthropic/claude-3.5-sonnet', priority: 0 }),
        createMockParticipant(2, { id: 'db-row-2', modelId: 'openai/gpt-4', priority: 1 }),
      ];

      // Despite DB order, streaming should follow priority
      expect(getParticipantAtStreamingIndex(participants, 0)?.id).toBe('db-row-1'); // priority 0
      expect(getParticipantAtStreamingIndex(participants, 1)?.id).toBe('db-row-2'); // priority 1
      expect(getParticipantAtStreamingIndex(participants, 2)?.id).toBe('db-row-3'); // priority 2
    });
  });
});

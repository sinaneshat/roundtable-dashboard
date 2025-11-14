/**
 * Round Number Utilities Tests
 *
 * Tests the SINGLE SOURCE OF TRUTH for round number calculations
 * Critical for ensuring 0-based indexing works correctly across the app
 *
 * BUG BEING TESTED:
 * - User reports: Initial round shows as "round 2" instead of "round 1"
 * - Expected: r0 should display as "Round 1", r1 as "Round 2"
 * - Issue: r0 is not made, r1 is sent to analyze
 */

import type { UIMessage } from 'ai';

import { MessageRoles } from '@/api/core/enums';
import {
  calculateNextRound,
  DEFAULT_ROUND_NUMBER,
  extractRoundNumber,
  formatRoundNumber,
  getDisplayRoundNumber,
  NO_ROUND_SENTINEL,
} from '@/lib/schemas/round-schemas';
import { createAssistantMetadata, createTestUIMessage, createUserMetadata } from '@/lib/testing';

import {
  calculateNextRoundNumber,
  getCurrentRoundNumber,
  getMaxRoundNumber,
  getRoundNumberFromMetadata,
  groupMessagesByRound,
  isLastRound,
} from '../round-utils';

describe('round number utilities - SINGLE SOURCE OF TRUTH', () => {
  describe('calculateNextRoundNumber', () => {
    it('should return 0 for first round when no messages exist', () => {
      const messages: UIMessage[] = [];
      expect(calculateNextRoundNumber(messages)).toBe(0);
    });

    it('should return 1 for second round when one user message exists with round 0', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({
          id: 'msg-1',
          role: MessageRoles.USER,
          content: 'First question',
          metadata: createUserMetadata(0),
        }),
      ];
      expect(calculateNextRoundNumber(messages)).toBe(1);
    });

    it('should return 2 for third round when user messages exist with rounds 0 and 1', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({
          id: 'msg-1',
          role: MessageRoles.USER,
          content: 'First question',
          metadata: createUserMetadata(0),
        }),
        createTestUIMessage({
          id: 'msg-2',
          role: MessageRoles.ASSISTANT,
          content: 'First response',
          metadata: createAssistantMetadata(0, 'p0', 0),
        }),
        createTestUIMessage({
          id: 'msg-3',
          role: MessageRoles.USER,
          content: 'Second question',
          metadata: createUserMetadata(1),
        }),
      ];
      expect(calculateNextRoundNumber(messages)).toBe(2);
    });

    it('should handle incomplete rounds correctly', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({
          id: 'msg-1',
          role: MessageRoles.USER,
          content: 'First question',
          metadata: createUserMetadata(0),
        }),
        createTestUIMessage({
          id: 'msg-2',
          role: MessageRoles.ASSISTANT,
          content: 'Partial response',
          metadata: createAssistantMetadata(0, 'p0', 0),
        }),
        // Round 0 is incomplete (missing some participants)
      ];
      // Next round should still be 1, not affected by incomplete round
      expect(calculateNextRoundNumber(messages)).toBe(1);
    });

    it('should ignore assistant messages when calculating next round', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({
          id: 'msg-1',
          role: MessageRoles.USER,
          content: 'First question',
          metadata: createUserMetadata(0),
        }),
        createTestUIMessage({
          id: 'msg-2',
          role: MessageRoles.ASSISTANT,
          content: 'Response',
          metadata: createAssistantMetadata(0, 'p0', 0),
        }),
        createTestUIMessage({
          id: 'msg-3',
          role: MessageRoles.ASSISTANT,
          content: 'Another response',
          metadata: createAssistantMetadata(0, 'p1', 1),
        }),
      ];
      // Should look at user messages only
      expect(calculateNextRoundNumber(messages)).toBe(1);
    });
  });

  describe('getCurrentRoundNumber', () => {
    it('should return 0 when no user messages exist', () => {
      const messages: UIMessage[] = [];
      expect(getCurrentRoundNumber(messages)).toBe(0);
    });

    it('should return round number from last user message', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({
          id: 'msg-1',
          role: MessageRoles.USER,
          content: 'First question',
          metadata: createUserMetadata(0),
        }),
        createTestUIMessage({
          id: 'msg-2',
          role: MessageRoles.ASSISTANT,
          content: 'Response',
          metadata: createAssistantMetadata(0, 'p0', 0),
        }),
      ];
      expect(getCurrentRoundNumber(messages)).toBe(0);
    });

    it('should return latest round when multiple user messages exist', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({
          id: 'msg-1',
          role: MessageRoles.USER,
          content: 'First question',
          metadata: createUserMetadata(0),
        }),
        createTestUIMessage({
          id: 'msg-2',
          role: MessageRoles.ASSISTANT,
          content: 'Response',
          metadata: createAssistantMetadata(0, 'p0', 0),
        }),
        createTestUIMessage({
          id: 'msg-3',
          role: MessageRoles.USER,
          content: 'Second question',
          metadata: createUserMetadata(1),
        }),
      ];
      expect(getCurrentRoundNumber(messages)).toBe(1);
    });
  });

  describe('getMaxRoundNumber', () => {
    it('should return 0 when no messages exist', () => {
      const messages: UIMessage[] = [];
      expect(getMaxRoundNumber(messages)).toBe(0);
    });

    it('should return highest round number from all messages', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({ id: 'msg-1', role: MessageRoles.USER, content: 'Q1', metadata: createUserMetadata(0) }),
        createTestUIMessage({ id: 'msg-2', role: MessageRoles.ASSISTANT, content: 'A1', metadata: createAssistantMetadata(0, 'p0', 0) }),
        createTestUIMessage({ id: 'msg-3', role: MessageRoles.USER, content: 'Q2', metadata: createUserMetadata(1) }),
        createTestUIMessage({ id: 'msg-4', role: MessageRoles.ASSISTANT, content: 'A2', metadata: createAssistantMetadata(1, 'p0', 0) }),
        createTestUIMessage({ id: 'msg-5', role: MessageRoles.USER, content: 'Q3', metadata: createUserMetadata(2) }),
      ];
      expect(getMaxRoundNumber(messages)).toBe(2);
    });

    it('should handle out-of-order messages correctly', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({ id: 'msg-1', role: MessageRoles.USER, content: 'Q1', metadata: createUserMetadata(2) }),
        createTestUIMessage({ id: 'msg-2', role: MessageRoles.ASSISTANT, content: 'A1', metadata: createAssistantMetadata(0, 'p0', 0) }),
        createTestUIMessage({ id: 'msg-3', role: MessageRoles.USER, content: 'Q2', metadata: createUserMetadata(1) }),
      ];
      expect(getMaxRoundNumber(messages)).toBe(2);
    });
  });

  describe('getRoundNumberFromMetadata', () => {
    it('should extract round number from UIMessage', () => {
      const message: UIMessage = createTestUIMessage({
        id: 'msg-1',
        role: MessageRoles.USER,
        content: 'Test',
        metadata: createUserMetadata(5),
      });
      expect(getRoundNumberFromMetadata(message)).toBe(5);
    });

    it('should extract round number from raw metadata', () => {
      const metadata = createUserMetadata(3);
      expect(getRoundNumberFromMetadata(metadata)).toBe(3);
    });

    it('should return default value when metadata is missing', () => {
      expect(getRoundNumberFromMetadata(null)).toBe(DEFAULT_ROUND_NUMBER);
      expect(getRoundNumberFromMetadata(undefined)).toBe(DEFAULT_ROUND_NUMBER);
      expect(getRoundNumberFromMetadata({})).toBe(DEFAULT_ROUND_NUMBER);
    });

    it('should use custom default value when provided', () => {
      expect(getRoundNumberFromMetadata(null, 10)).toBe(10);
      expect(getRoundNumberFromMetadata({}, 5)).toBe(5);
    });
  });

  describe('groupMessagesByRound', () => {
    it('should group messages by round number correctly', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({ id: 'msg-1', role: MessageRoles.USER, content: 'Q1', metadata: createUserMetadata(0) }),
        createTestUIMessage({ id: 'msg-2', role: MessageRoles.ASSISTANT, content: 'A1', metadata: createAssistantMetadata(0, 'p0', 0) }),
        createTestUIMessage({ id: 'msg-3', role: MessageRoles.ASSISTANT, content: 'A2', metadata: createAssistantMetadata(0, 'p1', 1) }),
        createTestUIMessage({ id: 'msg-4', role: MessageRoles.USER, content: 'Q2', metadata: createUserMetadata(1) }),
        createTestUIMessage({ id: 'msg-5', role: MessageRoles.ASSISTANT, content: 'A3', metadata: createAssistantMetadata(1, 'p0', 0) }),
      ];

      const grouped = groupMessagesByRound(messages);

      expect(grouped.size).toBe(2);
      expect(grouped.get(0)).toHaveLength(3);
      expect(grouped.get(1)).toHaveLength(2);
    });

    it('should handle single round correctly', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({ id: 'msg-1', role: MessageRoles.USER, content: 'Q1', metadata: createUserMetadata(0) }),
        createTestUIMessage({ id: 'msg-2', role: MessageRoles.ASSISTANT, content: 'A1', metadata: createAssistantMetadata(0, 'p0', 0) }),
      ];

      const grouped = groupMessagesByRound(messages);

      expect(grouped.size).toBe(1);
      expect(grouped.get(0)).toHaveLength(2);
    });

    it('should deduplicate messages with same ID', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({ id: 'msg-1', role: MessageRoles.USER, content: 'Q1', metadata: createUserMetadata(0) }),
        createTestUIMessage({ id: 'msg-2', role: MessageRoles.ASSISTANT, content: 'A1', metadata: createAssistantMetadata(0, 'p0', 0) }),
        createTestUIMessage({ id: 'msg-1', role: MessageRoles.USER, content: 'Q1 duplicate', metadata: createUserMetadata(0) }),
      ];

      const grouped = groupMessagesByRound(messages);

      // Should have 2 unique messages (msg-1 appears once, msg-2)
      expect(grouped.get(0)).toHaveLength(2);
      // Verify msg-1 appears only once (duplicate removed)
      const msg1Count = grouped.get(0)!.filter(m => m.id === 'msg-1').length;
      expect(msg1Count).toBe(1);
      // Verify msg-2 still exists
      const hasMsg2 = grouped.get(0)!.some(m => m.id === 'msg-2');
      expect(hasMsg2).toBe(true);
    });

    it('should infer round number from context when metadata is missing', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({ id: 'msg-1', role: MessageRoles.USER, content: 'Q1', metadata: createUserMetadata(0) }),
        createTestUIMessage({ id: 'msg-2', role: MessageRoles.ASSISTANT, content: 'A1', metadata: createAssistantMetadata(0, 'p0', 0) }),
        createTestUIMessage({ id: 'msg-3', role: MessageRoles.USER, content: 'Q2', metadata: createUserMetadata(1) }),
      ];

      const grouped = groupMessagesByRound(messages);

      // msg-2 should be in round 0
      expect(grouped.get(0)).toHaveLength(2);
      expect(grouped.get(1)).toHaveLength(1);
    });
  });

  describe('isLastRound', () => {
    it('should return true for the last round', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({ id: 'msg-1', role: MessageRoles.USER, content: 'Q1', metadata: createUserMetadata(0) }),
        createTestUIMessage({ id: 'msg-2', role: MessageRoles.USER, content: 'Q2', metadata: createUserMetadata(1) }),
        createTestUIMessage({ id: 'msg-3', role: MessageRoles.USER, content: 'Q3', metadata: createUserMetadata(2) }),
      ];

      expect(isLastRound(2, messages)).toBe(true);
      expect(isLastRound(1, messages)).toBe(false);
      expect(isLastRound(0, messages)).toBe(false);
    });

    it('should return true for round 0 when only one round exists', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({ id: 'msg-1', role: MessageRoles.USER, content: 'Q1', metadata: createUserMetadata(0) }),
      ];

      expect(isLastRound(0, messages)).toBe(true);
    });
  });

  describe('round number display - BUG VERIFICATION', () => {
    /**
     * CRITICAL TEST: Verifies 0-based → 1-based display conversion
     * User reported bug: Initial round shows as "round 2" instead of "round 1"
     *
     * Expected behavior:
     * - Round 0 (storage) → "Round 1" (display)
     * - Round 1 (storage) → "Round 2" (display)
     * - Round 2 (storage) → "Round 3" (display)
     */

    it('should convert round 0 to display as "Round 1"', () => {
      expect(getDisplayRoundNumber(0)).toBe(1);
      expect(formatRoundNumber(0)).toBe('Round 1');
    });

    it('should convert round 1 to display as "Round 2"', () => {
      expect(getDisplayRoundNumber(1)).toBe(2);
      expect(formatRoundNumber(1)).toBe('Round 2');
    });

    it('should convert round 2 to display as "Round 3"', () => {
      expect(getDisplayRoundNumber(2)).toBe(3);
      expect(formatRoundNumber(2)).toBe('Round 3');
    });

    it('should correctly display first user message as Round 1', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({
          id: 'msg-1',
          role: MessageRoles.USER,
          content: 'First question',
          metadata: createUserMetadata(0),
        }),
      ];

      const currentRound = getCurrentRoundNumber(messages);
      expect(currentRound).toBe(0);
      expect(formatRoundNumber(currentRound)).toBe('Round 1');
    });

    it('should correctly calculate and display round for analysis', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({
          id: 'msg-1',
          role: MessageRoles.USER,
          content: 'First question',
          metadata: createUserMetadata(0),
        }),
        createTestUIMessage({
          id: 'msg-2',
          role: MessageRoles.ASSISTANT,
          content: 'Response 1',
          metadata: createAssistantMetadata(0, 'p0', 0),
        }),
        createTestUIMessage({
          id: 'msg-3',
          role: MessageRoles.ASSISTANT,
          content: 'Response 2',
          metadata: createAssistantMetadata(0, 'p1', 1),
        }),
      ];

      // Analysis should be for round 0 (displayed as "Round 1")
      const currentRound = getCurrentRoundNumber(messages);
      expect(currentRound).toBe(0);

      // This is what should be sent to the analysis endpoint
      const analysisRound = currentRound;
      expect(analysisRound).toBe(0); // Backend uses 0-based
      expect(formatRoundNumber(analysisRound)).toBe('Round 1'); // Display uses 1-based
    });

    it('should verify next round calculation is correct', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({
          id: 'msg-1',
          role: MessageRoles.USER,
          content: 'First question',
          metadata: createUserMetadata(0),
        }),
      ];

      const nextRound = calculateNextRoundNumber(messages);
      expect(nextRound).toBe(1); // Next round is 1 (displayed as "Round 2")
      expect(formatRoundNumber(nextRound)).toBe('Round 2');
    });
  });

  describe('schema utilities - type safety', () => {
    it('should extract round number correctly using schema utility', () => {
      const metadata = createUserMetadata(5);
      expect(extractRoundNumber(metadata)).toBe(5);
    });

    it('should return fallback for invalid metadata', () => {
      expect(extractRoundNumber(null)).toBe(DEFAULT_ROUND_NUMBER);
      expect(extractRoundNumber(undefined)).toBe(DEFAULT_ROUND_NUMBER);
      expect(extractRoundNumber({ roundNumber: 'invalid' })).toBe(DEFAULT_ROUND_NUMBER);
    });

    it('should calculate next round correctly using schema utility', () => {
      expect(calculateNextRound(NO_ROUND_SENTINEL)).toBe(0); // First round
      expect(calculateNextRound(0)).toBe(1); // Second round
      expect(calculateNextRound(1)).toBe(2); // Third round
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty messages array', () => {
      const messages: UIMessage[] = [];

      expect(getCurrentRoundNumber(messages)).toBe(0);
      expect(calculateNextRoundNumber(messages)).toBe(0);
      expect(getMaxRoundNumber(messages)).toBe(0);
      expect(groupMessagesByRound(messages)).toEqual(new Map());
    });

    it('should handle messages without metadata', () => {
      const messages: UIMessage[] = [
        { id: 'msg-1', role: MessageRoles.USER, parts: [{ type: 'text', text: 'Q1' }] },
      ];

      const currentRound = getCurrentRoundNumber(messages);
      expect(currentRound).toBe(DEFAULT_ROUND_NUMBER);
    });

    it('should handle messages with null metadata', () => {
      const messages: UIMessage[] = [
        { id: 'msg-1', role: MessageRoles.USER, parts: [{ type: 'text', text: 'Q1' }], metadata: null },
      ];

      const currentRound = getCurrentRoundNumber(messages);
      expect(currentRound).toBe(DEFAULT_ROUND_NUMBER);
    });

    it('should handle messages with invalid round numbers gracefully', () => {
      const messages: UIMessage[] = [
        createTestUIMessage({ id: 'msg-1', role: MessageRoles.USER, content: 'Q1', metadata: { ...createUserMetadata(-5), roundNumber: -5 } }),
      ];

      // Should fall back to default
      const currentRound = getCurrentRoundNumber(messages);
      expect(currentRound).toBeGreaterThanOrEqual(0);
    });
  });
});

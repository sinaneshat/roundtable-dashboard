/**
 * Non-Initial Round Animation Skip Tests
 *
 * Regression tests for the animation visibility fix in non-initial rounds.
 *
 * ROOT CAUSE BUG (Fixed):
 * User messages in non-initial rounds (round 1+) weren't visible immediately after submission.
 *
 * The issue was:
 * 1. ScrollAwareUserMessage uses `whileInView` animation with `initial={{ opacity: 0 }}`
 * 2. No auto-scroll by design (users control scroll via ChatScrollButton)
 * 3. New messages might be outside viewport, so animation never triggers
 * 4. Message stays at `opacity: 0`, appearing invisible
 *
 * The fix:
 * - Skip animation for ALL user messages in non-initial rounds (roundNumber > 0)
 * - This ensures visibility regardless of viewport position or ID changes
 *
 * Additional complexity:
 * - Optimistic messages have ID like `optimistic-user-1234567890`
 * - When DB persists, ID changes to something like `01KE5W6ER2Q1SFYSXNDZ0YZZVJ`
 * - Old fix only skipped for `optimistic-` prefix, but component remounts with new ID
 * - New fix uses roundNumber > 0, which persists across ID changes
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { MessageRoles } from '@/api/core/enums';
import { getRoundNumberFromMetadata } from '@/lib/utils';

/**
 * Simulates the animation skip logic from chat-message-list.tsx
 *
 * This is the critical decision point:
 * - `skipEntranceAnimations` from screen initialization
 * - `optimistic-` prefix check (legacy, still useful for round 0)
 * - `roundNumber > 0` check (the fix)
 */
function shouldSkipUserMessageAnimation(
  message: UIMessage,
  skipEntranceAnimations: boolean,
): boolean {
  // Skip if global flag is set (e.g., screen already initialized)
  if (skipEntranceAnimations) {
    return true;
  }

  // Skip for optimistic messages (any round)
  if (message.id.startsWith('optimistic-')) {
    return true;
  }

  // FIX: Skip for ALL user messages in non-initial rounds
  const roundNumber = getRoundNumberFromMetadata(message.metadata, 0);
  if (roundNumber > 0) {
    return true;
  }

  return false;
}

describe('non-Initial Round Animation Skip', () => {
  describe('animation Skip Logic', () => {
    it('should NOT skip animation for round 0 user message with normal ID', () => {
      const message: UIMessage = {
        id: '01KE5W6ER2Q1SFYSXNDZ0YZZVJ',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
      };

      expect(shouldSkipUserMessageAnimation(message, false)).toBe(false);
    });

    it('should skip animation for round 0 optimistic user message', () => {
      const message: UIMessage = {
        id: 'optimistic-user-1736128000000',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { role: MessageRoles.USER, roundNumber: 0, isOptimistic: true },
      };

      expect(shouldSkipUserMessageAnimation(message, false)).toBe(true);
    });

    it('cRITICAL: should skip animation for round 1 user message (non-initial)', () => {
      const message: UIMessage = {
        id: '01KE5W6ER2Q1SFYSXNDZ0YZZVJ',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Follow-up question' }],
        metadata: { role: MessageRoles.USER, roundNumber: 1 },
      };

      // This is the critical fix - roundNumber > 0 should skip animation
      expect(shouldSkipUserMessageAnimation(message, false)).toBe(true);
    });

    it('cRITICAL: should skip animation for round 2+ user messages', () => {
      const rounds = [2, 3, 5, 10];

      for (const roundNumber of rounds) {
        const message: UIMessage = {
          id: `db-id-round-${roundNumber}`,
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: `Question for round ${roundNumber}` }],
          metadata: { role: MessageRoles.USER, roundNumber },
        };

        expect(shouldSkipUserMessageAnimation(message, false)).toBe(true);
      }
    });

    it('should skip animation when skipEntranceAnimations is true (any round)', () => {
      const round0Message: UIMessage = {
        id: 'some-id-1',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Round 0' }],
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
      };

      const round1Message: UIMessage = {
        id: 'some-id-2',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Round 1' }],
        metadata: { role: MessageRoles.USER, roundNumber: 1 },
      };

      // Both should skip when global flag is set
      expect(shouldSkipUserMessageAnimation(round0Message, true)).toBe(true);
      expect(shouldSkipUserMessageAnimation(round1Message, true)).toBe(true);
    });
  });

  describe('optimistic to DB ID Transition (Critical Edge Case)', () => {
    /**
     * This scenario tests the exact bug that was discovered:
     * 1. User submits round 1 message
     * 2. Optimistic message added with ID `optimistic-user-1736128000000`
     * 3. Animation skipped (optimistic- prefix) - message visible
     * 4. DB response arrives, ID changes to `01KE5W6ER2Q1SFYSXNDZ0YZZVJ`
     * 5. Component remounts
     * 6. OLD BUG: Animation triggers, opacity: 0, message invisible
     * 7. FIX: roundNumber > 0 still skips animation, message remains visible
     */
    it('cRITICAL: should skip animation after optimistic ID replaced by DB ID', () => {
      // Step 1: Optimistic message (animation skipped via optimistic- prefix)
      const optimisticMessage: UIMessage = {
        id: 'optimistic-user-1736128000000',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Follow-up' }],
        metadata: { role: MessageRoles.USER, roundNumber: 1, isOptimistic: true },
      };

      expect(shouldSkipUserMessageAnimation(optimisticMessage, false)).toBe(true);

      // Step 2: DB ID replaces optimistic ID (component remounts)
      const dbMessage: UIMessage = {
        id: '01KE5W6ER2Q1SFYSXNDZ0YZZVJ',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Follow-up' }],
        metadata: { role: MessageRoles.USER, roundNumber: 1 }, // isOptimistic removed
      };

      // CRITICAL: Animation must STILL be skipped because roundNumber > 0
      expect(shouldSkipUserMessageAnimation(dbMessage, false)).toBe(true);
    });

    it('should handle multiple round transitions correctly', () => {
      // Simulate a conversation with multiple rounds
      const messages: Array<{ round: number; phase: 'optimistic' | 'persisted' }> = [
        { round: 0, phase: 'persisted' }, // Initial round - should animate
        { round: 1, phase: 'optimistic' }, // Round 1 optimistic - skip
        { round: 1, phase: 'persisted' }, // Round 1 persisted - skip (roundNumber > 0)
        { round: 2, phase: 'optimistic' }, // Round 2 optimistic - skip
        { round: 2, phase: 'persisted' }, // Round 2 persisted - skip (roundNumber > 0)
      ];

      for (const { round, phase } of messages) {
        const isOptimistic = phase === 'optimistic';
        const message: UIMessage = {
          id: isOptimistic ? `optimistic-user-${round}-${Date.now()}` : `db-id-${round}`,
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: `Round ${round}` }],
          metadata: {
            role: MessageRoles.USER,
            roundNumber: round,
            ...(isOptimistic ? { isOptimistic: true } : {}),
          },
        };

        const shouldSkip = shouldSkipUserMessageAnimation(message, false);
        const shouldAnimate = round === 0 && phase === 'persisted';

        // Only round 0 persisted messages should animate, all others skip
        expect(shouldSkip).toBe(!shouldAnimate);
      }
    });
  });

  describe('edge Cases', () => {
    it('should handle missing roundNumber metadata (default to 0)', () => {
      const message: UIMessage = {
        id: 'message-without-round',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'No round number' }],
        metadata: { role: MessageRoles.USER }, // No roundNumber
      };

      // Should NOT skip (defaults to round 0)
      expect(shouldSkipUserMessageAnimation(message, false)).toBe(false);
    });

    it('should handle null metadata gracefully', () => {
      const message: UIMessage = {
        id: 'message-null-metadata',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Null metadata' }],
        metadata: null as unknown as Record<string, unknown>,
      };

      // getRoundNumberFromMetadata should return default (0)
      // So animation should NOT be skipped
      expect(shouldSkipUserMessageAnimation(message, false)).toBe(false);
    });

    it('should handle optimistic- prefix in any round', () => {
      // Even in round 0, optimistic messages should skip
      const round0Optimistic: UIMessage = {
        id: 'optimistic-user-first',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'First message' }],
        metadata: { role: MessageRoles.USER, roundNumber: 0, isOptimistic: true },
      };

      const round5Optimistic: UIMessage = {
        id: 'optimistic-user-fifth',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Fifth round' }],
        metadata: { role: MessageRoles.USER, roundNumber: 5, isOptimistic: true },
      };

      expect(shouldSkipUserMessageAnimation(round0Optimistic, false)).toBe(true);
      expect(shouldSkipUserMessageAnimation(round5Optimistic, false)).toBe(true);
    });
  });

  describe('visibility Guarantee', () => {
    /**
     * These tests verify the core guarantee:
     * "User messages MUST be visible immediately after submission, regardless of scroll position"
     */
    it('gUARANTEE: non-initial round user messages always visible (skip animation)', () => {
      // Generate various realistic scenarios
      const scenarios = [
        // Typical follow-up
        { id: 'db-123', round: 1, optimistic: false },
        // Optimistic before DB persist
        { id: 'optimistic-user-456', round: 1, optimistic: true },
        // Later round
        { id: 'db-789', round: 3, optimistic: false },
        // Much later round
        { id: 'db-abc', round: 10, optimistic: false },
      ];

      for (const scenario of scenarios) {
        const message: UIMessage = {
          id: scenario.id,
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Test' }],
          metadata: {
            role: MessageRoles.USER,
            roundNumber: scenario.round,
            ...(scenario.optimistic ? { isOptimistic: true } : {}),
          },
        };

        const shouldSkip = shouldSkipUserMessageAnimation(message, false);

        // ALL non-initial round messages must skip animation
        expect(shouldSkip).toBe(true);
      }
    });

    it('gUARANTEE: initial round persisted messages still animate normally', () => {
      const message: UIMessage = {
        id: '01KE5W6ER2Q1SFYSXNDZ0YZZVJ',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'First message ever' }],
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
      };

      // Round 0 persisted messages should animate normally
      expect(shouldSkipUserMessageAnimation(message, false)).toBe(false);
    });
  });
});

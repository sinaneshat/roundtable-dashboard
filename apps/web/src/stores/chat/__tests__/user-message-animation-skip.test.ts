/**
 * User Message Animation Skip Tests
 *
 * Comprehensive tests for the animation skip logic in chat-message-list.tsx
 * that prevents user messages from becoming invisible during ID transitions.
 *
 * ROOT CAUSE BUG (Fixed):
 * Non-initial round user messages became invisible after DB ID replaced optimistic ID.
 *
 * The issue flow:
 * 1. User submits round 1 message
 * 2. Optimistic message added with ID `optimistic-user-123456`
 * 3. Animation skipped via `optimistic-` prefix check - message visible
 * 4. DB persists message, ID changes to deterministic ID like `thread_r1_user`
 * 5. Component remounts with new ID
 * 6. BUG: New ID doesn't start with `optimistic-` so animation triggers
 * 7. ScrollAwareUserMessage renders with `initial={{ opacity: 0 }}`
 * 8. whileInView animation never triggers (message might be outside viewport)
 * 9. Message stays at opacity: 0, appearing invisible
 *
 * The fix (line 1124 in chat-message-list.tsx):
 * ```typescript
 * const skipUserMsgAnimation = roundNumber > 0 || !shouldAnimateMessage(message.id);
 * ```
 *
 * This ensures:
 * - ALL user messages in non-initial rounds skip animation (roundNumber > 0)
 * - Visibility is guaranteed regardless of ID changes
 * - Initial round messages still animate normally for polish
 * - Optimistic messages in any round skip animation
 *
 * Test Coverage:
 * 1. Non-initial round messages skip animation (roundNumber > 0)
 * 2. Optimistic messages skip animation (optimistic- prefix)
 * 3. Initial round persisted messages animate normally
 * 4. ID transition from optimistic to DB maintains visibility
 * 5. shouldAnimateMessage function logic
 * 6. Edge cases and guard conditions
 */

import { MessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { createInvalidMetadata } from '@/lib/testing';
import { getRoundNumberFromMetadata } from '@/lib/utils';

/**
 * Simulates the shouldAnimateMessage logic from chat-message-list.tsx (lines 612-625)
 *
 * This function determines whether a message should use entrance animations.
 * Called for both user messages and participant messages.
 *
 * Returns false when animation should be SKIPPED (message appears immediately)
 * Returns true when animation should PLAY (scroll-triggered fade-in)
 */
function shouldAnimateMessage(
  messageId: string,
  skipEntranceAnimations: boolean,
): boolean {
  // Skip all animations when explicitly disabled (e.g., demo mode)
  if (skipEntranceAnimations) {
    return false;
  }

  // Skip animation for optimistic messages (they should appear immediately)
  // Optimistic messages have IDs like 'optimistic-user-1736128000000'
  if (messageId.startsWith('optimistic-')) {
    return false;
  }

  // Otherwise, animate (whileInView with once:true handles scroll trigger)
  return true;
}

/**
 * Simulates the skipUserMsgAnimation logic from chat-message-list.tsx (line 1124)
 *
 * This is the CRITICAL decision point that was fixed.
 * Original bug: Only checked optimistic prefix, causing issues on ID transition
 * Fixed: Also checks roundNumber > 0 to ensure ALL non-initial round messages skip
 */
function shouldSkipUserMessageAnimation(
  message: UIMessage,
  skipEntranceAnimations: boolean,
): boolean {
  const roundNumber = getRoundNumberFromMetadata(message.metadata, 0);

  // FIX: Skip for ALL user messages in non-initial rounds
  // This ensures visibility even when optimistic ID is replaced by DB ID
  const skipDueToRound = roundNumber > 0;

  // Check message-specific animation skip logic
  const skipDueToMessage = !shouldAnimateMessage(message.id, skipEntranceAnimations);

  // Skip if EITHER condition is true
  return skipDueToRound || skipDueToMessage;
}

describe('user Message Animation Skip Logic', () => {
  describe('shouldAnimateMessage (Base Function)', () => {
    it('should animate normal message IDs by default', () => {
      const messageId = '01KE5W6ER2Q1SFYSXNDZ0YZZVJ';
      expect(shouldAnimateMessage(messageId, false)).toBeTruthy();
    });

    it('should NOT animate optimistic message IDs', () => {
      const messageId = 'optimistic-user-1736128000000';
      expect(shouldAnimateMessage(messageId, false)).toBeFalsy();
    });

    it('should NOT animate when skipEntranceAnimations is true', () => {
      const normalId = '01KE5W6ER2Q1SFYSXNDZ0YZZVJ';
      const optimisticId = 'optimistic-user-123';

      expect(shouldAnimateMessage(normalId, true)).toBeFalsy();
      expect(shouldAnimateMessage(optimisticId, true)).toBeFalsy();
    });

    it('should handle deterministic thread IDs correctly', () => {
      // Deterministic IDs like 'thread_r1_user' should animate
      const threadId = 'thread_r1_user';
      expect(shouldAnimateMessage(threadId, false)).toBeTruthy();
    });

    it('should handle various optimistic ID formats', () => {
      const optimisticFormats = [
        'optimistic-user-123',
        'optimistic-123456789',
        'optimistic-assistant-abc',
      ];

      optimisticFormats.forEach((id) => {
        expect(shouldAnimateMessage(id, false)).toBeFalsy();
      });
    });
  });

  describe('shouldSkipUserMessageAnimation (Critical Fix)', () => {
    describe('initial Round (roundNumber = 0)', () => {
      it('should NOT skip animation for round 0 persisted messages', () => {
        const message: UIMessage = {
          id: '01KE5W6ER2Q1SFYSXNDZ0YZZVJ',
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
          parts: [{ text: 'First message', type: 'text' }],
          role: MessageRoles.USER,
        };

        // Round 0 persisted messages should animate for polish
        expect(shouldSkipUserMessageAnimation(message, false)).toBeFalsy();
      });

      it('should skip animation for round 0 optimistic messages', () => {
        const message: UIMessage = {
          id: 'optimistic-user-1736128000000',
          metadata: {
            isOptimistic: true,
            role: MessageRoles.USER,
            roundNumber: 0,
          },
          parts: [{ text: 'First message', type: 'text' }],
          role: MessageRoles.USER,
        };

        // Optimistic messages always skip (immediate visibility)
        expect(shouldSkipUserMessageAnimation(message, false)).toBeTruthy();
      });
    });

    describe('non-Initial Rounds (roundNumber > 0) - CRITICAL FIX', () => {
      it('should skip animation for round 1 persisted messages', () => {
        const message: UIMessage = {
          id: 'thread_r1_user',
          metadata: { role: MessageRoles.USER, roundNumber: 1 },
          parts: [{ text: 'Follow-up question', type: 'text' }],
          role: MessageRoles.USER,
        };

        // CRITICAL: roundNumber > 0 should ALWAYS skip
        expect(shouldSkipUserMessageAnimation(message, false)).toBeTruthy();
      });

      it('should skip animation for round 1 optimistic messages', () => {
        const message: UIMessage = {
          id: 'optimistic-user-1736128000000',
          metadata: {
            isOptimistic: true,
            role: MessageRoles.USER,
            roundNumber: 1,
          },
          parts: [{ text: 'Follow-up question', type: 'text' }],
          role: MessageRoles.USER,
        };

        // Both roundNumber check AND optimistic check should trigger skip
        expect(shouldSkipUserMessageAnimation(message, false)).toBeTruthy();
      });

      it('should skip animation for all rounds beyond round 1', () => {
        const testRounds = [2, 3, 5, 10, 20];

        testRounds.forEach((roundNumber) => {
          const message: UIMessage = {
            id: `thread_r${roundNumber}_user`,
            metadata: { role: MessageRoles.USER, roundNumber },
            parts: [{ text: `Round ${roundNumber}`, type: 'text' }],
            role: MessageRoles.USER,
          };

          expect(shouldSkipUserMessageAnimation(message, false)).toBeTruthy();
        });
      });
    });

    describe('iD Transition (Optimistic to DB) - Critical Edge Case', () => {
      /**
       * Flow:
       * 1. User submits round 1 message
       * 2. Optimistic message created: ID = 'optimistic-user-1736128000000'
       * 3. skipUserMsgAnimation = true (optimistic prefix) → message visible
       * 4. DB persists, ID changes to 'thread_r1_user'
       * 5. Component remounts (new key from new ID)
       * 6. roundNumber > 0 maintains skip → message stays visible
       */
      it('should maintain skip when optimistic ID replaced by DB ID', () => {
        // Phase 1: Optimistic message (animation skipped via optimistic prefix)
        const optimisticMessage: UIMessage = {
          id: 'optimistic-user-1736128000000',
          metadata: {
            isOptimistic: true,
            role: MessageRoles.USER,
            roundNumber: 1,
          },
          parts: [{ text: 'Follow-up', type: 'text' }],
          role: MessageRoles.USER,
        };

        // Verify optimistic message skips animation
        expect(shouldSkipUserMessageAnimation(optimisticMessage, false)).toBeTruthy();

        // Phase 2: DB ID replaces optimistic (component remounts with new key)
        const persistedMessage: UIMessage = {
          id: 'thread_r1_user', // No optimistic prefix!
          metadata: {
            role: MessageRoles.USER,
            roundNumber: 1,
            // isOptimistic removed (persisted)
          },
          parts: [{ text: 'Follow-up', type: 'text' }],
          role: MessageRoles.USER,
        };

        // CRITICAL: Animation must STILL be skipped (roundNumber > 0)
        // This prevents the message from becoming invisible during ID transition
        expect(shouldSkipUserMessageAnimation(persistedMessage, false)).toBeTruthy();
      });

      it('should handle multiple ID transitions across rounds', () => {
        type TransitionPhase = {
          round: number;
          id: string;
          isOptimistic: boolean;
          expectedSkip: boolean;
          reason: string;
        };

        const transitions: TransitionPhase[] = [
          {
            expectedSkip: true,
            id: 'optimistic-user-round0',
            isOptimistic: true,
            reason: 'Round 0 optimistic - skip via prefix',
            round: 0,
          },
          {
            expectedSkip: false,
            id: 'thread_r0_user',
            isOptimistic: false,
            reason: 'Round 0 persisted - should animate',
            round: 0,
          },
          {
            expectedSkip: true,
            id: 'optimistic-user-round1',
            isOptimistic: true,
            reason: 'Round 1 optimistic - skip via prefix AND round',
            round: 1,
          },
          {
            expectedSkip: true,
            id: 'thread_r1_user',
            isOptimistic: false,
            reason: 'Round 1 persisted - skip via roundNumber > 0 (THE FIX)',
            round: 1,
          },
          {
            expectedSkip: true,
            id: 'optimistic-user-round2',
            isOptimistic: true,
            reason: 'Round 2 optimistic - skip via prefix AND round',
            round: 2,
          },
          {
            expectedSkip: true,
            id: 'thread_r2_user',
            isOptimistic: false,
            reason: 'Round 2 persisted - skip via roundNumber > 0',
            round: 2,
          },
        ];

        transitions.forEach(({ expectedSkip, id, isOptimistic, reason: _reason, round }) => {
          const message: UIMessage = {
            id,
            metadata: {
              role: MessageRoles.USER,
              roundNumber: round,
              ...(isOptimistic ? { isOptimistic: true } : {}),
            },
            parts: [{ text: `Round ${round}`, type: 'text' }],
            role: MessageRoles.USER,
          };

          const result = shouldSkipUserMessageAnimation(message, false);
          expect(result).toBe(expectedSkip);
        });
      });
    });

    describe('edge Cases', () => {
      it('should handle missing roundNumber metadata (defaults to 0)', () => {
        const message: UIMessage = {
          id: 'message-without-round',
          metadata: { role: MessageRoles.USER }, // No roundNumber
          parts: [{ text: 'No round number', type: 'text' }],
          role: MessageRoles.USER,
        };

        // Should NOT skip (defaults to round 0, not optimistic)
        expect(shouldSkipUserMessageAnimation(message, false)).toBeFalsy();
      });

      it('should handle null metadata gracefully', () => {
        const message: UIMessage = {
          id: 'message-null-metadata',
          metadata: createInvalidMetadata('null'),
          parts: [{ text: 'Null metadata', type: 'text' }],
          role: MessageRoles.USER,
        };

        // getRoundNumberFromMetadata returns 0 for null
        // So should NOT skip
        expect(shouldSkipUserMessageAnimation(message, false)).toBeFalsy();
      });

      it('should handle undefined metadata gracefully', () => {
        const message: UIMessage = {
          id: 'message-undefined-metadata',
          metadata: createInvalidMetadata('undefined'),
          parts: [{ text: 'Undefined metadata', type: 'text' }],
          role: MessageRoles.USER,
        };

        // Should NOT skip (defaults to round 0)
        expect(shouldSkipUserMessageAnimation(message, false)).toBeFalsy();
      });

      it('should handle negative round numbers (defensive)', () => {
        const message: UIMessage = {
          id: 'negative-round',
          metadata: { role: MessageRoles.USER, roundNumber: -1 },
          parts: [{ text: 'Negative round', type: 'text' }],
          role: MessageRoles.USER,
        };

        // roundNumber > 0 check should be false for negative
        expect(shouldSkipUserMessageAnimation(message, false)).toBeFalsy();
      });

      it('should skip when skipEntranceAnimations is true (any round)', () => {
        const messages = [
          {
            description: 'Round 0',
            id: 'round0-id',
            roundNumber: 0,
          },
          {
            description: 'Round 1',
            id: 'round1-id',
            roundNumber: 1,
          },
          {
            description: 'Round 2 optimistic',
            id: 'optimistic-user-123',
            roundNumber: 2,
          },
        ];

        messages.forEach(({ description, id, roundNumber }) => {
          const message: UIMessage = {
            id,
            metadata: { role: MessageRoles.USER, roundNumber },
            parts: [{ text: description, type: 'text' }],
            role: MessageRoles.USER,
          };

          // ALL should skip when global flag is set
          expect(shouldSkipUserMessageAnimation(message, true)).toBeTruthy();
        });
      });
    });

    describe('visibility Guarantees', () => {
      /**
       * Core guarantee: User messages MUST be visible immediately after submission
       * regardless of viewport position or ID transitions
       */
      it('gUARANTEE: non-initial round messages always visible', () => {
        const scenarios = [
          // Standard DB ID
          { id: 'thread_r1_user', optimistic: false, round: 1 },
          // Optimistic before persist
          { id: 'optimistic-user-456', optimistic: true, round: 1 },
          // Later rounds
          { id: 'thread_r3_user', optimistic: false, round: 3 },
          { id: 'thread_r10_user', optimistic: false, round: 10 },
          // Optimistic in later rounds
          { id: 'optimistic-user-789', optimistic: true, round: 5 },
        ];

        scenarios.forEach((scenario) => {
          const message: UIMessage = {
            id: scenario.id,
            metadata: {
              role: MessageRoles.USER,
              roundNumber: scenario.round,
              ...(scenario.optimistic ? { isOptimistic: true } : {}),
            },
            parts: [{ text: 'Test', type: 'text' }],
            role: MessageRoles.USER,
          };

          const shouldSkip = shouldSkipUserMessageAnimation(message, false);

          // ALL non-initial round messages MUST skip animation
          expect(shouldSkip).toBeTruthy();
        });
      });

      it('gUARANTEE: initial round persisted messages still animate', () => {
        const message: UIMessage = {
          id: 'thread_r0_user',
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
          parts: [{ text: 'First message', type: 'text' }],
          role: MessageRoles.USER,
        };

        // Round 0 persisted should animate (for visual polish)
        expect(shouldSkipUserMessageAnimation(message, false)).toBeFalsy();
      });

      it('gUARANTEE: optimistic messages in ANY round skip animation', () => {
        const rounds = [0, 1, 2, 5, 10];

        rounds.forEach((roundNumber) => {
          const message: UIMessage = {
            id: `optimistic-user-round${roundNumber}`,
            metadata: {
              isOptimistic: true,
              role: MessageRoles.USER,
              roundNumber,
            },
            parts: [{ text: `Round ${roundNumber}`, type: 'text' }],
            role: MessageRoles.USER,
          };

          // ALL optimistic messages skip animation
          expect(shouldSkipUserMessageAnimation(message, false)).toBeTruthy();
        });
      });
    });
  });

  describe('real-World Scenarios', () => {
    it('should handle typical conversation flow correctly', () => {
      type ConversationPhase = {
        description: string;
        message: UIMessage;
        expectedSkip: boolean;
      };

      const conversationFlow: ConversationPhase[] = [
        // Initial message submission
        {
          description: 'Round 0: User submits first message (optimistic)',
          expectedSkip: true, // Optimistic
          message: {
            id: 'optimistic-user-1736000000000',
            metadata: {
              isOptimistic: true,
              role: MessageRoles.USER,
              roundNumber: 0,
            },
            parts: [{ text: 'What is AI?', type: 'text' }],
            role: MessageRoles.USER,
          },
        },
        {
          description: 'Round 0: DB ID replaces optimistic',
          expectedSkip: false, // Round 0 persisted should animate
          message: {
            id: 'thread_r0_user',
            metadata: {
              role: MessageRoles.USER,
              roundNumber: 0,
            },
            parts: [{ text: 'What is AI?', type: 'text' }],
            role: MessageRoles.USER,
          },
        },
        // Follow-up message
        {
          description: 'Round 1: User submits follow-up (optimistic)',
          expectedSkip: true, // Optimistic
          message: {
            id: 'optimistic-user-1736000100000',
            metadata: {
              isOptimistic: true,
              role: MessageRoles.USER,
              roundNumber: 1,
            },
            parts: [{ text: 'Tell me more', type: 'text' }],
            role: MessageRoles.USER,
          },
        },
        {
          description: 'Round 1: DB ID replaces optimistic',
          expectedSkip: true, // THE FIX: roundNumber > 0 keeps it skipped
          message: {
            id: 'thread_r1_user',
            metadata: {
              role: MessageRoles.USER,
              roundNumber: 1,
            },
            parts: [{ text: 'Tell me more', type: 'text' }],
            role: MessageRoles.USER,
          },
        },
        // Third round
        {
          description: 'Round 2: User continues conversation (optimistic)',
          expectedSkip: true, // Optimistic
          message: {
            id: 'optimistic-user-1736000200000',
            metadata: {
              isOptimistic: true,
              role: MessageRoles.USER,
              roundNumber: 2,
            },
            parts: [{ text: 'Can you explain further?', type: 'text' }],
            role: MessageRoles.USER,
          },
        },
        {
          description: 'Round 2: DB ID replaces optimistic',
          expectedSkip: true, // roundNumber > 0
          message: {
            id: 'thread_r2_user',
            metadata: {
              role: MessageRoles.USER,
              roundNumber: 2,
            },
            parts: [{ text: 'Can you explain further?', type: 'text' }],
            role: MessageRoles.USER,
          },
        },
      ];

      conversationFlow.forEach(({ description: _description, expectedSkip, message }) => {
        const result = shouldSkipUserMessageAnimation(message, false);
        expect(result).toBe(expectedSkip);
      });
    });

    it('should handle page refresh with resumed conversation', () => {
      // After refresh, we load persisted messages directly (no optimistic phase)
      const messages = [
        { id: 'thread_r0_user', round: 0 },
        { id: 'thread_r1_user', round: 1 },
        { id: 'thread_r2_user', round: 2 },
      ];

      messages.forEach(({ id, round }) => {
        const message: UIMessage = {
          id,
          metadata: { role: MessageRoles.USER, roundNumber: round },
          parts: [{ text: `Round ${round}`, type: 'text' }],
          role: MessageRoles.USER,
        };

        const shouldSkip = shouldSkipUserMessageAnimation(message, false);
        // Round 0 should animate, Round 1+ should skip
        expect(shouldSkip).toBe(round !== 0);
      });
    });

    it('should handle demo mode with skipEntranceAnimations', () => {
      // Demo mode: all messages already loaded, skip all animations
      const messages = [
        { id: 'thread_r0_user', optimistic: false, round: 0 },
        { id: 'thread_r1_user', optimistic: false, round: 1 },
        { id: 'optimistic-user-123', optimistic: true, round: 2 },
      ];

      messages.forEach(({ id, optimistic, round }) => {
        const message: UIMessage = {
          id,
          metadata: {
            role: MessageRoles.USER,
            roundNumber: round,
            ...(optimistic ? { isOptimistic: true } : {}),
          },
          parts: [{ text: `Round ${round}`, type: 'text' }],
          role: MessageRoles.USER,
        };

        // ALL should skip in demo mode
        expect(shouldSkipUserMessageAnimation(message, true)).toBeTruthy();
      });
    });
  });

  describe('logic Truth Table', () => {
    /**
     * Complete truth table for all combinations
     */
    type LogicCase = {
      skipEntranceAnimations: boolean;
      roundNumber: number;
      isOptimisticId: boolean;
      expectedSkip: boolean;
      description: string;
    };

    const logicCases: LogicCase[] = [
      // skipEntranceAnimations = true (overrides everything)
      {
        description: 'Global skip overrides round 0 normal ID',
        expectedSkip: true,
        isOptimisticId: false,
        roundNumber: 0,
        skipEntranceAnimations: true,
      },
      {
        description: 'Global skip overrides round 1 normal ID',
        expectedSkip: true,
        isOptimisticId: false,
        roundNumber: 1,
        skipEntranceAnimations: true,
      },
      {
        description: 'Global skip + optimistic ID',
        expectedSkip: true,
        isOptimisticId: true,
        roundNumber: 0,
        skipEntranceAnimations: true,
      },

      // skipEntranceAnimations = false, roundNumber = 0
      {
        description: 'Round 0 normal ID - should animate',
        expectedSkip: false,
        isOptimisticId: false,
        roundNumber: 0,
        skipEntranceAnimations: false,
      },
      {
        description: 'Round 0 optimistic ID - skip',
        expectedSkip: true,
        isOptimisticId: true,
        roundNumber: 0,
        skipEntranceAnimations: false,
      },

      // skipEntranceAnimations = false, roundNumber > 0
      {
        description: 'Round 1 normal ID - skip (THE FIX)',
        expectedSkip: true,
        isOptimisticId: false,
        roundNumber: 1,
        skipEntranceAnimations: false,
      },
      {
        description: 'Round 1 optimistic ID - skip (redundant)',
        expectedSkip: true,
        isOptimisticId: true,
        roundNumber: 1,
        skipEntranceAnimations: false,
      },
      {
        description: 'Round 5 normal ID - skip',
        expectedSkip: true,
        isOptimisticId: false,
        roundNumber: 5,
        skipEntranceAnimations: false,
      },
      {
        description: 'Round 10 optimistic ID - skip',
        expectedSkip: true,
        isOptimisticId: true,
        roundNumber: 10,
        skipEntranceAnimations: false,
      },
    ];

    it('should handle all logic combinations correctly', () => {
      logicCases.forEach(({
        description,
        expectedSkip,
        isOptimisticId,
        roundNumber,
        skipEntranceAnimations,
      }) => {
        const message: UIMessage = {
          id: isOptimisticId
            ? `optimistic-user-${roundNumber}`
            : `thread_r${roundNumber}_user`,
          metadata: { role: MessageRoles.USER, roundNumber },
          parts: [{ text: description, type: 'text' }],
          role: MessageRoles.USER,
        };

        const result = shouldSkipUserMessageAnimation(message, skipEntranceAnimations);
        expect(result).toBe(expectedSkip);
      });
    });
  });
});

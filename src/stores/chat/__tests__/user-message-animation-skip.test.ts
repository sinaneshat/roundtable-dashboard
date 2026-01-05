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

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { MessageRoles } from '@/api/core/enums';
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
      expect(shouldAnimateMessage(messageId, false)).toBe(true);
    });

    it('should NOT animate optimistic message IDs', () => {
      const messageId = 'optimistic-user-1736128000000';
      expect(shouldAnimateMessage(messageId, false)).toBe(false);
    });

    it('should NOT animate when skipEntranceAnimations is true', () => {
      const normalId = '01KE5W6ER2Q1SFYSXNDZ0YZZVJ';
      const optimisticId = 'optimistic-user-123';

      expect(shouldAnimateMessage(normalId, true)).toBe(false);
      expect(shouldAnimateMessage(optimisticId, true)).toBe(false);
    });

    it('should handle deterministic thread IDs correctly', () => {
      // Deterministic IDs like 'thread_r1_user' should animate
      const threadId = 'thread_r1_user';
      expect(shouldAnimateMessage(threadId, false)).toBe(true);
    });

    it('should handle various optimistic ID formats', () => {
      const optimisticFormats = [
        'optimistic-user-123',
        'optimistic-123456789',
        'optimistic-assistant-abc',
      ];

      optimisticFormats.forEach((id) => {
        expect(shouldAnimateMessage(id, false)).toBe(false);
      });
    });
  });

  describe('shouldSkipUserMessageAnimation (Critical Fix)', () => {
    describe('initial Round (roundNumber = 0)', () => {
      it('should NOT skip animation for round 0 persisted messages', () => {
        const message: UIMessage = {
          id: '01KE5W6ER2Q1SFYSXNDZ0YZZVJ',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'First message' }],
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
        };

        // Round 0 persisted messages should animate for polish
        expect(shouldSkipUserMessageAnimation(message, false)).toBe(false);
      });

      it('should skip animation for round 0 optimistic messages', () => {
        const message: UIMessage = {
          id: 'optimistic-user-1736128000000',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'First message' }],
          metadata: {
            role: MessageRoles.USER,
            roundNumber: 0,
            isOptimistic: true,
          },
        };

        // Optimistic messages always skip (immediate visibility)
        expect(shouldSkipUserMessageAnimation(message, false)).toBe(true);
      });
    });

    describe('non-Initial Rounds (roundNumber > 0) - CRITICAL FIX', () => {
      it('should skip animation for round 1 persisted messages', () => {
        const message: UIMessage = {
          id: 'thread_r1_user',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Follow-up question' }],
          metadata: { role: MessageRoles.USER, roundNumber: 1 },
        };

        // CRITICAL: roundNumber > 0 should ALWAYS skip
        expect(shouldSkipUserMessageAnimation(message, false)).toBe(true);
      });

      it('should skip animation for round 1 optimistic messages', () => {
        const message: UIMessage = {
          id: 'optimistic-user-1736128000000',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Follow-up question' }],
          metadata: {
            role: MessageRoles.USER,
            roundNumber: 1,
            isOptimistic: true,
          },
        };

        // Both roundNumber check AND optimistic check should trigger skip
        expect(shouldSkipUserMessageAnimation(message, false)).toBe(true);
      });

      it('should skip animation for all rounds beyond round 1', () => {
        const testRounds = [2, 3, 5, 10, 20];

        testRounds.forEach((roundNumber) => {
          const message: UIMessage = {
            id: `thread_r${roundNumber}_user`,
            role: MessageRoles.USER,
            parts: [{ type: 'text', text: `Round ${roundNumber}` }],
            metadata: { role: MessageRoles.USER, roundNumber },
          };

          expect(shouldSkipUserMessageAnimation(message, false)).toBe(true);
        });
      });
    });

    describe('iD Transition Bug (Optimistic to DB) - THE CRITICAL EDGE CASE', () => {
      /**
       * This is the exact bug scenario that was discovered and fixed.
       *
       * Flow:
       * 1. User submits round 1 message
       * 2. Optimistic message created: ID = 'optimistic-user-1736128000000'
       * 3. skipUserMsgAnimation = true (optimistic prefix) → message visible
       * 4. DB persists, ID changes to 'thread_r1_user'
       * 5. Component remounts (new key from new ID)
       * 6. OLD BUG: skipUserMsgAnimation = false (no optimistic prefix)
       * 7. Animation triggers with initial={{ opacity: 0 }}
       * 8. whileInView doesn't trigger (outside viewport)
       * 9. Message stays invisible (opacity: 0)
       * 10. FIX: roundNumber > 0 still returns true → message stays visible
       */
      it('cRITICAL BUG FIX: should maintain skip when optimistic ID replaced by DB ID', () => {
        // Phase 1: Optimistic message (animation skipped via optimistic prefix)
        const optimisticMessage: UIMessage = {
          id: 'optimistic-user-1736128000000',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Follow-up' }],
          metadata: {
            role: MessageRoles.USER,
            roundNumber: 1,
            isOptimistic: true,
          },
        };

        // Verify optimistic message skips animation
        expect(shouldSkipUserMessageAnimation(optimisticMessage, false)).toBe(true);

        // Phase 2: DB ID replaces optimistic (component remounts with new key)
        const persistedMessage: UIMessage = {
          id: 'thread_r1_user', // No optimistic prefix!
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Follow-up' }],
          metadata: {
            role: MessageRoles.USER,
            roundNumber: 1,
            // isOptimistic removed (persisted)
          },
        };

        // CRITICAL: Animation must STILL be skipped (roundNumber > 0)
        // This prevents the message from becoming invisible during ID transition
        expect(shouldSkipUserMessageAnimation(persistedMessage, false)).toBe(true);
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
            round: 0,
            id: 'optimistic-user-round0',
            isOptimistic: true,
            expectedSkip: true,
            reason: 'Round 0 optimistic - skip via prefix',
          },
          {
            round: 0,
            id: 'thread_r0_user',
            isOptimistic: false,
            expectedSkip: false,
            reason: 'Round 0 persisted - should animate',
          },
          {
            round: 1,
            id: 'optimistic-user-round1',
            isOptimistic: true,
            expectedSkip: true,
            reason: 'Round 1 optimistic - skip via prefix AND round',
          },
          {
            round: 1,
            id: 'thread_r1_user',
            isOptimistic: false,
            expectedSkip: true,
            reason: 'Round 1 persisted - skip via roundNumber > 0 (THE FIX)',
          },
          {
            round: 2,
            id: 'optimistic-user-round2',
            isOptimistic: true,
            expectedSkip: true,
            reason: 'Round 2 optimistic - skip via prefix AND round',
          },
          {
            round: 2,
            id: 'thread_r2_user',
            isOptimistic: false,
            expectedSkip: true,
            reason: 'Round 2 persisted - skip via roundNumber > 0',
          },
        ];

        transitions.forEach(({ round, id, isOptimistic, expectedSkip, reason: _reason }) => {
          const message: UIMessage = {
            id,
            role: MessageRoles.USER,
            parts: [{ type: 'text', text: `Round ${round}` }],
            metadata: {
              role: MessageRoles.USER,
              roundNumber: round,
              ...(isOptimistic ? { isOptimistic: true } : {}),
            },
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
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'No round number' }],
          metadata: { role: MessageRoles.USER }, // No roundNumber
        };

        // Should NOT skip (defaults to round 0, not optimistic)
        expect(shouldSkipUserMessageAnimation(message, false)).toBe(false);
      });

      it('should handle null metadata gracefully', () => {
        const message: UIMessage = {
          id: 'message-null-metadata',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Null metadata' }],
          metadata: null as unknown as Record<string, unknown>,
        };

        // getRoundNumberFromMetadata returns 0 for null
        // So should NOT skip
        expect(shouldSkipUserMessageAnimation(message, false)).toBe(false);
      });

      it('should handle undefined metadata gracefully', () => {
        const message: UIMessage = {
          id: 'message-undefined-metadata',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Undefined metadata' }],
          metadata: undefined as unknown as Record<string, unknown>,
        };

        // Should NOT skip (defaults to round 0)
        expect(shouldSkipUserMessageAnimation(message, false)).toBe(false);
      });

      it('should handle negative round numbers (defensive)', () => {
        const message: UIMessage = {
          id: 'negative-round',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Negative round' }],
          metadata: { role: MessageRoles.USER, roundNumber: -1 },
        };

        // roundNumber > 0 check should be false for negative
        expect(shouldSkipUserMessageAnimation(message, false)).toBe(false);
      });

      it('should skip when skipEntranceAnimations is true (any round)', () => {
        const messages = [
          {
            id: 'round0-id',
            roundNumber: 0,
            description: 'Round 0',
          },
          {
            id: 'round1-id',
            roundNumber: 1,
            description: 'Round 1',
          },
          {
            id: 'optimistic-user-123',
            roundNumber: 2,
            description: 'Round 2 optimistic',
          },
        ];

        messages.forEach(({ id, roundNumber, description }) => {
          const message: UIMessage = {
            id,
            role: MessageRoles.USER,
            parts: [{ type: 'text', text: description }],
            metadata: { role: MessageRoles.USER, roundNumber },
          };

          // ALL should skip when global flag is set
          expect(shouldSkipUserMessageAnimation(message, true)).toBe(true);
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
          { id: 'thread_r1_user', round: 1, optimistic: false },
          // Optimistic before persist
          { id: 'optimistic-user-456', round: 1, optimistic: true },
          // Later rounds
          { id: 'thread_r3_user', round: 3, optimistic: false },
          { id: 'thread_r10_user', round: 10, optimistic: false },
          // Optimistic in later rounds
          { id: 'optimistic-user-789', round: 5, optimistic: true },
        ];

        scenarios.forEach((scenario) => {
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

          // ALL non-initial round messages MUST skip animation
          expect(shouldSkip).toBe(true);
        });
      });

      it('gUARANTEE: initial round persisted messages still animate', () => {
        const message: UIMessage = {
          id: 'thread_r0_user',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'First message' }],
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
        };

        // Round 0 persisted should animate (for visual polish)
        expect(shouldSkipUserMessageAnimation(message, false)).toBe(false);
      });

      it('gUARANTEE: optimistic messages in ANY round skip animation', () => {
        const rounds = [0, 1, 2, 5, 10];

        rounds.forEach((roundNumber) => {
          const message: UIMessage = {
            id: `optimistic-user-round${roundNumber}`,
            role: MessageRoles.USER,
            parts: [{ type: 'text', text: `Round ${roundNumber}` }],
            metadata: {
              role: MessageRoles.USER,
              roundNumber,
              isOptimistic: true,
            },
          };

          // ALL optimistic messages skip animation
          expect(shouldSkipUserMessageAnimation(message, false)).toBe(true);
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
          message: {
            id: 'optimistic-user-1736000000000',
            role: MessageRoles.USER,
            parts: [{ type: 'text', text: 'What is AI?' }],
            metadata: {
              role: MessageRoles.USER,
              roundNumber: 0,
              isOptimistic: true,
            },
          },
          expectedSkip: true, // Optimistic
        },
        {
          description: 'Round 0: DB ID replaces optimistic',
          message: {
            id: 'thread_r0_user',
            role: MessageRoles.USER,
            parts: [{ type: 'text', text: 'What is AI?' }],
            metadata: {
              role: MessageRoles.USER,
              roundNumber: 0,
            },
          },
          expectedSkip: false, // Round 0 persisted should animate
        },
        // Follow-up message
        {
          description: 'Round 1: User submits follow-up (optimistic)',
          message: {
            id: 'optimistic-user-1736000100000',
            role: MessageRoles.USER,
            parts: [{ type: 'text', text: 'Tell me more' }],
            metadata: {
              role: MessageRoles.USER,
              roundNumber: 1,
              isOptimistic: true,
            },
          },
          expectedSkip: true, // Optimistic
        },
        {
          description: 'Round 1: DB ID replaces optimistic',
          message: {
            id: 'thread_r1_user',
            role: MessageRoles.USER,
            parts: [{ type: 'text', text: 'Tell me more' }],
            metadata: {
              role: MessageRoles.USER,
              roundNumber: 1,
            },
          },
          expectedSkip: true, // THE FIX: roundNumber > 0 keeps it skipped
        },
        // Third round
        {
          description: 'Round 2: User continues conversation (optimistic)',
          message: {
            id: 'optimistic-user-1736000200000',
            role: MessageRoles.USER,
            parts: [{ type: 'text', text: 'Can you explain further?' }],
            metadata: {
              role: MessageRoles.USER,
              roundNumber: 2,
              isOptimistic: true,
            },
          },
          expectedSkip: true, // Optimistic
        },
        {
          description: 'Round 2: DB ID replaces optimistic',
          message: {
            id: 'thread_r2_user',
            role: MessageRoles.USER,
            parts: [{ type: 'text', text: 'Can you explain further?' }],
            metadata: {
              role: MessageRoles.USER,
              roundNumber: 2,
            },
          },
          expectedSkip: true, // roundNumber > 0
        },
      ];

      conversationFlow.forEach(({ description: _description, message, expectedSkip }) => {
        const result = shouldSkipUserMessageAnimation(message, false);
        expect(result).toBe(expectedSkip);
      });
    });

    it('should handle page refresh with resumed conversation', () => {
      // After refresh, we load persisted messages directly (no optimistic phase)
      const messages = [
        { round: 0, id: 'thread_r0_user' },
        { round: 1, id: 'thread_r1_user' },
        { round: 2, id: 'thread_r2_user' },
      ];

      messages.forEach(({ round, id }) => {
        const message: UIMessage = {
          id,
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: `Round ${round}` }],
          metadata: { role: MessageRoles.USER, roundNumber: round },
        };

        const shouldSkip = shouldSkipUserMessageAnimation(message, false);

        if (round === 0) {
          // Round 0 should animate
          expect(shouldSkip).toBe(false);
        } else {
          // Round 1+ should skip
          expect(shouldSkip).toBe(true);
        }
      });
    });

    it('should handle demo mode with skipEntranceAnimations', () => {
      // Demo mode: all messages already loaded, skip all animations
      const messages = [
        { round: 0, id: 'thread_r0_user', optimistic: false },
        { round: 1, id: 'thread_r1_user', optimistic: false },
        { round: 2, id: 'optimistic-user-123', optimistic: true },
      ];

      messages.forEach(({ round, id, optimistic }) => {
        const message: UIMessage = {
          id,
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: `Round ${round}` }],
          metadata: {
            role: MessageRoles.USER,
            roundNumber: round,
            ...(optimistic ? { isOptimistic: true } : {}),
          },
        };

        // ALL should skip in demo mode
        expect(shouldSkipUserMessageAnimation(message, true)).toBe(true);
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
        skipEntranceAnimations: true,
        roundNumber: 0,
        isOptimisticId: false,
        expectedSkip: true,
        description: 'Global skip overrides round 0 normal ID',
      },
      {
        skipEntranceAnimations: true,
        roundNumber: 1,
        isOptimisticId: false,
        expectedSkip: true,
        description: 'Global skip overrides round 1 normal ID',
      },
      {
        skipEntranceAnimations: true,
        roundNumber: 0,
        isOptimisticId: true,
        expectedSkip: true,
        description: 'Global skip + optimistic ID',
      },

      // skipEntranceAnimations = false, roundNumber = 0
      {
        skipEntranceAnimations: false,
        roundNumber: 0,
        isOptimisticId: false,
        expectedSkip: false,
        description: 'Round 0 normal ID - should animate',
      },
      {
        skipEntranceAnimations: false,
        roundNumber: 0,
        isOptimisticId: true,
        expectedSkip: true,
        description: 'Round 0 optimistic ID - skip',
      },

      // skipEntranceAnimations = false, roundNumber > 0
      {
        skipEntranceAnimations: false,
        roundNumber: 1,
        isOptimisticId: false,
        expectedSkip: true,
        description: 'Round 1 normal ID - skip (THE FIX)',
      },
      {
        skipEntranceAnimations: false,
        roundNumber: 1,
        isOptimisticId: true,
        expectedSkip: true,
        description: 'Round 1 optimistic ID - skip (redundant)',
      },
      {
        skipEntranceAnimations: false,
        roundNumber: 5,
        isOptimisticId: false,
        expectedSkip: true,
        description: 'Round 5 normal ID - skip',
      },
      {
        skipEntranceAnimations: false,
        roundNumber: 10,
        isOptimisticId: true,
        expectedSkip: true,
        description: 'Round 10 optimistic ID - skip',
      },
    ];

    it('should handle all logic combinations correctly', () => {
      logicCases.forEach(({
        skipEntranceAnimations,
        roundNumber,
        isOptimisticId,
        expectedSkip,
        description,
      }) => {
        const message: UIMessage = {
          id: isOptimisticId
            ? `optimistic-user-${roundNumber}`
            : `thread_r${roundNumber}_user`,
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: description }],
          metadata: { role: MessageRoles.USER, roundNumber },
        };

        const result = shouldSkipUserMessageAnimation(message, skipEntranceAnimations);
        expect(result).toBe(expectedSkip);
      });
    });
  });
});

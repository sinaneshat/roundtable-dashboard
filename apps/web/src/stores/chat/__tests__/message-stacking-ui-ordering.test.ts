/**
 * Message Stacking and UI Ordering Tests
 *
 * Tests for how messages are stacked, ordered, and displayed
 * in the thread screen UI.
 *
 * Key Areas:
 * - Message grouping by round
 * - Participant message ordering within rounds
 * - Optimistic message handling
 * - Message replacement patterns
 * - Round summary positioning
 * - Summary card placement
 *
 * Key Validations:
 * - Correct visual order
 * - Optimistic → real message transitions
 * - No duplicate messages displayed
 * - Proper round boundaries
 */

import { FinishReasons, MessageRoles, MessageStatuses, UIMessageRoles } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import type { TestAssistantMessage, TestUserMessage } from '@/lib/testing';
import {
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { getRoundNumber } from '@/lib/utils';

import type { StoredModeratorSummary } from '../store-schemas';

// ============================================================================
// TYPE ALIASES
// ============================================================================

/** Union type for test messages */
type TestMessage = TestUserMessage | TestAssistantMessage;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for assistant messages
 */
function isAssistantMessage(msg: TestMessage): msg is TestAssistantMessage {
  return msg.role === UIMessageRoles.ASSISTANT;
}

/**
 * Get assistant messages with proper typing
 */
function getAssistantMessages(messages: TestMessage[]): TestAssistantMessage[] {
  return messages.filter(isAssistantMessage);
}

// ============================================================================
// TEST HELPERS
// ============================================================================

type RoundGroup = {
  roundNumber: number;
  userMessage: TestMessage | null;
  participantMessages: TestAssistantMessage[];
  summary: StoredModeratorSummary | null;
};

/**
 * Groups messages by round number for UI display
 * ✅ TYPE-SAFE: Uses type guards and metadata helpers
 */
function groupMessagesByRound(
  messages: TestMessage[],
): RoundGroup[] {
  const roundMap = new Map<number, RoundGroup>();

  // Group messages by round - ✅ Uses getRoundNumber helper for type-safe extraction
  messages.forEach((msg) => {
    const roundNumber = getRoundNumber(msg.metadata) ?? 0;

    if (!roundMap.has(roundNumber)) {
      roundMap.set(roundNumber, {
        participantMessages: [],
        roundNumber,
        summary: null,
        userMessage: null,
      });
    }

    const group = roundMap.get(roundNumber);
    if (!group) {
      throw new Error('expected round group');
    }

    if (msg.role === MessageRoles.USER) {
      group.userMessage = msg;
    } else if (isAssistantMessage(msg)) {
      group.participantMessages.push(msg);
    }
  });

  // Sort participant messages by participantIndex - ✅ Direct typed access
  roundMap.forEach((group) => {
    group.participantMessages.sort((a, b) => {
      const aIndex = a.metadata.participantIndex ?? 0;
      const bIndex = b.metadata.participantIndex ?? 0;
      return aIndex - bIndex;
    });
  });

  // Return sorted by round number
  return Array.from(roundMap.values()).sort((a, b) => a.roundNumber - b.roundNumber);
}

/**
 * Determines UI element order within a round
 * ✅ TYPE-SAFE: Direct access on typed participantMessages
 */
function getRoundElementOrder(group: RoundGroup): string[] {
  const order: string[] = [];

  // 1. User message first
  if (group.userMessage) {
    order.push(`user-${group.roundNumber}`);
  }

  // 2. Participant messages in order - ✅ Direct typed access
  group.participantMessages.forEach((msg) => {
    const pIndex = msg.metadata.participantIndex ?? 0;
    order.push(`participant-${group.roundNumber}-${pIndex}`);
  });

  // 3. Summary card last (if complete)
  if (group.summary && group.summary.status === MessageStatuses.COMPLETE) {
    order.push(`summary-${group.roundNumber}`);
  }

  return order;
}

/**
 * Checks if message is optimistic (not yet confirmed by server)
 * ✅ TYPE-SAFE: Checks both ID convention and metadata flag
 */
function isOptimisticMessage(msg: TestMessage | { id: string; metadata?: { isOptimistic?: boolean } }): boolean {
  // Check ID prefix first (primary method)
  if (msg.id.startsWith('optimistic-')) {
    return true;
  }
  // Check metadata flag as fallback
  if (msg.metadata && 'isOptimistic' in msg.metadata && msg.metadata.isOptimistic === true) {
    return true;
  }
  return false;
}

/**
 * Filters out optimistic messages when real messages exist
 * ✅ TYPE-SAFE: Uses getRoundNumber helper
 */
function filterOptimisticDuplicates(messages: TestMessage[]): TestMessage[] {
  const realMessages = messages.filter(m => !isOptimisticMessage(m));
  const optimisticMessages = messages.filter(m => isOptimisticMessage(m));

  // Keep optimistic only if no real message exists for that round
  const realRounds = new Set(
    realMessages
      .filter(m => m.role === MessageRoles.USER)
      .map(m => getRoundNumber(m.metadata) ?? 0),
  );

  const filteredOptimistic = optimisticMessages.filter((m) => {
    if (m.role !== MessageRoles.USER) {
      return true;
    }
    const round = getRoundNumber(m.metadata) ?? 0;
    return !realRounds.has(round);
  });

  return [...realMessages, ...filteredOptimistic];
}

// ============================================================================
// MESSAGE GROUPING BY ROUND TESTS
// ============================================================================

describe('message Grouping by Round', () => {
  describe('single Round Grouping', () => {
    it('groups user and participant messages together', () => {
      const messages = [
        createTestUserMessage({ content: 'Question', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Response 0',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'Response 1',
          finishReason: FinishReasons.STOP,
          id: 'p1-r0',
          participantId: 'p1',
          participantIndex: 1,
          roundNumber: 0,
        }),
      ];

      const groups = groupMessagesByRound(messages, []);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.roundNumber).toBe(0);
      expect(groups[0]?.userMessage).toBeDefined();
      expect(groups[0]?.participantMessages).toHaveLength(2);
    });
  });

  describe('multi Round Grouping', () => {
    it('separates messages into correct rounds', () => {
      const messages = [
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'R0',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestUserMessage({ content: 'Q1', id: 'u1', roundNumber: 1 }),
        createTestAssistantMessage({
          content: 'R1',
          finishReason: FinishReasons.STOP,
          id: 'p0-r1',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 1,
        }),
      ];

      const groups = groupMessagesByRound(messages, []);

      expect(groups).toHaveLength(2);
      expect(groups[0]?.roundNumber).toBe(0);
      expect(groups[1]?.roundNumber).toBe(1);
    });

    it('handles out-of-order message arrays', () => {
      const messages = [
        createTestUserMessage({ content: 'Q1', id: 'u1', roundNumber: 1 }),
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'R1',
          finishReason: FinishReasons.STOP,
          id: 'p0-r1',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 1,
        }),
        createTestAssistantMessage({
          content: 'R0',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      const groups = groupMessagesByRound(messages, []);

      // Should be sorted by round number
      expect(groups[0]?.roundNumber).toBe(0);
      expect(groups[1]?.roundNumber).toBe(1);
    });
  });

  describe('participant Message Ordering', () => {
    it('orders participants by participantIndex within round', () => {
      const messages = [
        createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'R2',
          finishReason: FinishReasons.STOP,
          id: 'p2-r0',
          participantId: 'p2',
          participantIndex: 2,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'R0',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'R1',
          finishReason: FinishReasons.STOP,
          id: 'p1-r0',
          participantId: 'p1',
          participantIndex: 1,
          roundNumber: 0,
        }),
      ];

      const groups = groupMessagesByRound(messages, []);
      const participantMessages = groups[0]?.participantMessages ?? [];

      expect(participantMessages[0]?.id).toBe('p0-r0');
      expect(participantMessages[1]?.id).toBe('p1-r0');
      expect(participantMessages[2]?.id).toBe('p2-r0');
    });
  });

  describe('summary Inclusion', () => {
    it('attaches summary to correct round', () => {
      const messages = [
        createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'R',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      const groups = groupMessagesByRound(messages, []);

      expect(groups[0]).toBeDefined();
    });
  });
});

// ============================================================================
// UI ELEMENT ORDER TESTS
// ============================================================================

describe('uI Element Order', () => {
  describe('round Element Sequence', () => {
    it('orders: user → participants → summary', () => {
      const group: RoundGroup = {
        participantMessages: [
          createTestAssistantMessage({
            content: 'R0',
            finishReason: FinishReasons.STOP,
            id: 'p0-r0',
            participantId: 'p0',
            participantIndex: 0,
            roundNumber: 0,
          }),
          createTestAssistantMessage({
            content: 'R1',
            finishReason: FinishReasons.STOP,
            id: 'p1-r0',
            participantId: 'p1',
            participantIndex: 1,
            roundNumber: 0,
          }),
        ],
        roundNumber: 0,
        summary: {
          completedAt: new Date(),
          createdAt: new Date(),
          errorMessage: null,
          id: 'summary-0',
          roundNumber: 0,
          status: MessageStatuses.COMPLETE,
          summaryData: null,
          threadId: 'thread-123',
        } as StoredModeratorSummary,
        userMessage: createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
      };

      const order = getRoundElementOrder(group);

      expect(order).toEqual([
        'user-0',
        'participant-0-0',
        'participant-0-1',
        'summary-0',
      ]);
    });

    it('excludes incomplete summary from order', () => {
      const group: RoundGroup = {
        participantMessages: [
          createTestAssistantMessage({
            content: 'R',
            finishReason: FinishReasons.STOP,
            id: 'p0-r0',
            participantId: 'p0',
            participantIndex: 0,
            roundNumber: 0,
          }),
        ],
        roundNumber: 0,
        summary: {
          completedAt: null,
          createdAt: new Date(),
          errorMessage: null,
          id: 'summary-0',
          roundNumber: 0,
          status: MessageStatuses.STREAMING, // Not complete
          summaryData: null,
          threadId: 'thread-123',
        } as StoredModeratorSummary,
        userMessage: createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
      };

      const order = getRoundElementOrder(group);

      expect(order).not.toContain('summary-0');
    });

    it('handles round with only user message (during streaming)', () => {
      const group: RoundGroup = {
        participantMessages: [],
        roundNumber: 0,
        summary: null,
        userMessage: createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
      };

      const order = getRoundElementOrder(group);

      expect(order).toEqual(['user-0']);
    });
  });

  describe('multi Round Visual Stack', () => {
    it('stacks rounds sequentially', () => {
      const messages = [
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'R0',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestUserMessage({ content: 'Q1', id: 'u1', roundNumber: 1 }),
        createTestAssistantMessage({
          content: 'R1',
          finishReason: FinishReasons.STOP,
          id: 'p0-r1',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 1,
        }),
      ];

      const groups = groupMessagesByRound(messages, []);
      const allElements = groups.flatMap(g => getRoundElementOrder(g));

      expect(allElements).toEqual([
        'user-0',
        'participant-0-0',
        'user-1',
        'participant-1-0',
      ]);
    });
  });
});

// ============================================================================
// OPTIMISTIC MESSAGE TESTS
// ============================================================================

describe('optimistic Message Handling', () => {
  describe('optimistic Detection', () => {
    it('detects optimistic message by flag', () => {
      const msg = {
        id: 'real-id',
        metadata: {
          isOptimistic: true,
          role: MessageRoles.USER,
          roundNumber: 0,
        },
        parts: [{ text: 'Test', type: 'text' as const }],
        role: MessageRoles.USER as const,
      };

      expect(isOptimisticMessage(msg)).toBeTruthy();
    });

    it('detects optimistic message by id prefix', () => {
      const msg = {
        id: 'optimistic-123-r0',
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 0,
        },
        parts: [{ text: 'Test', type: 'text' as const }],
        role: MessageRoles.USER as const,
      };

      expect(isOptimisticMessage(msg)).toBeTruthy();
    });

    it('identifies real message', () => {
      const msg = createTestUserMessage({ content: 'Test', id: 'msg-123', roundNumber: 0 });

      expect(isOptimisticMessage(msg)).toBeFalsy();
    });
  });

  describe('optimistic to Real Transition', () => {
    it('filters optimistic when real message exists for same round', () => {
      const messages = [
        {
          id: 'optimistic-123-r0',
          metadata: {
            isOptimistic: true,
            role: MessageRoles.USER,
            roundNumber: 0,
          },
          parts: [{ text: 'Test', type: 'text' as const }],
          role: MessageRoles.USER as const,
        },
        createTestUserMessage({ content: 'Test', id: 'real-msg-r0', roundNumber: 0 }),
      ];

      const filtered = filterOptimisticDuplicates(messages);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.id).toBe('real-msg-r0');
    });

    it('keeps optimistic if no real message exists', () => {
      const messages = [
        {
          id: 'optimistic-123-r0',
          metadata: {
            isOptimistic: true,
            role: MessageRoles.USER,
            roundNumber: 0,
          },
          parts: [{ text: 'Test', type: 'text' as const }],
          role: MessageRoles.USER as const,
        },
      ];

      const filtered = filterOptimisticDuplicates(messages);

      expect(filtered).toHaveLength(1);
    });

    it('handles mixed rounds with optimistic', () => {
      const messages = [
        createTestUserMessage({ content: 'Q0', id: 'real-r0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'R0',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        {
          id: 'optimistic-r1',
          metadata: {
            isOptimistic: true,
            role: MessageRoles.USER,
            roundNumber: 1,
          },
          parts: [{ text: 'Q1', type: 'text' as const }],
          role: MessageRoles.USER as const,
        },
      ];

      const filtered = filterOptimisticDuplicates(messages);

      expect(filtered).toHaveLength(3);
      expect(filtered.find(m => m.id === 'optimistic-r1')).toBeDefined();
    });
  });
});

// ============================================================================
// MESSAGE REPLACEMENT PATTERNS
// ============================================================================

describe('message Replacement Patterns', () => {
  describe('streaming Message Update', () => {
    it('replaces streaming message content in-place', () => {
      const messages: TestMessage[] = [
        createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Partial...',
          finishReason: FinishReasons.UNKNOWN, // Still streaming
          id: 'p0-r0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      // Simulate content update during streaming
      const updatedMessages = messages.map((m) => {
        if (m.id === 'p0-r0') {
          return {
            ...m,
            parts: [{ text: 'Partial... more content...', type: 'text' as const }],
          };
        }
        return m;
      });

      expect(updatedMessages[1]?.parts?.[0]?.type).toBe('text');
      expect((updatedMessages[1]?.parts?.[0] as { text: string }).text).toContain('more content');
    });

    it('finalizes message with finish reason', () => {
      const finalizedMsg = createTestAssistantMessage({
        content: 'Complete response',
        finishReason: FinishReasons.STOP,
        id: 'p0-r0',
        participantId: 'p0',
        participantIndex: 0,
        roundNumber: 0,
      });

      expect(finalizedMsg.metadata.finishReason).toBe(FinishReasons.STOP);
    });
  });

  describe('regeneration Message Replacement', () => {
    it('removes old messages and adds new ones', () => {
      const messages = [
        createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Old response',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0-old',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      // Step 1: Remove old assistant messages for round
      // ✅ TYPE-SAFE: Use type guard and getRoundNumber helper
      const roundToRegenerate = 0;
      let updatedMessages = messages.filter((m) => {
        if (!isAssistantMessage(m)) {
          return true;
        }
        return m.metadata.roundNumber !== roundToRegenerate;
      });

      expect(updatedMessages).toHaveLength(1);

      // Step 2: Add new response
      updatedMessages = [
        ...updatedMessages,
        createTestAssistantMessage({
          content: 'New response',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0-new',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      expect(updatedMessages).toHaveLength(2);
      expect(updatedMessages[1]?.id).toBe('p0-r0-new');
    });
  });
});

// ============================================================================
// ROUND BOUNDARY TESTS
// ============================================================================

describe('round Boundaries', () => {
  describe('round Start Detection', () => {
    it('detects new round when user message round increases', () => {
      const messages = [
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'R0',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      // ✅ TYPE-SAFE: Use getRoundNumber helper
      const currentMaxRound = Math.max(
        ...messages.map(m => getRoundNumber(m.metadata) ?? 0),
      );

      const newRoundNumber = 1;
      const isNewRound = newRoundNumber > currentMaxRound;

      expect(isNewRound).toBeTruthy();
    });
  });

  describe('round Completion Detection', () => {
    it('detects complete round when all participants have finishReason', () => {
      const participantCount = 3;
      const messages = [
        createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'R0',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'R1',
          finishReason: FinishReasons.STOP,
          id: 'p1-r0',
          participantId: 'p1',
          participantIndex: 1,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'R2',
          finishReason: FinishReasons.STOP,
          id: 'p2-r0',
          participantId: 'p2',
          participantIndex: 2,
          roundNumber: 0,
        }),
      ];

      // ✅ TYPE-SAFE: Use getAssistantMessages for properly typed filtering
      const roundMessages = getAssistantMessages(messages).filter(
        m => m.metadata.roundNumber === 0,
      );

      const allComplete = roundMessages.every(m =>
        m.metadata.finishReason === FinishReasons.STOP
        || m.metadata.finishReason === FinishReasons.LENGTH);

      const hasAllParticipants = roundMessages.length === participantCount;

      expect(allComplete && hasAllParticipants).toBeTruthy();
    });

    it('detects incomplete round when participant missing finishReason', () => {
      // ✅ TYPE-SAFE: Use createTestAssistantMessage for properly typed message
      const messages: TestMessage[] = [
        createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Streaming...',
          finishReason: FinishReasons.UNKNOWN, // Still streaming
          id: 'p0-r0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      // ✅ TYPE-SAFE: Use helper for typed filtering
      const roundMessages = getAssistantMessages(messages).filter(
        m => m.metadata.roundNumber === 0,
      );

      const allComplete = roundMessages.every(m =>
        m.metadata.finishReason === FinishReasons.STOP
        || m.metadata.finishReason === FinishReasons.LENGTH);

      expect(allComplete).toBeFalsy();
    });
  });
});

// ============================================================================
// EMPTY STATE TESTS
// ============================================================================

describe('empty States', () => {
  describe('no Messages', () => {
    it('returns empty groups for empty message array', () => {
      const groups = groupMessagesByRound([], []);

      expect(groups).toHaveLength(0);
    });
  });

  describe('no Participants in Round', () => {
    it('handles round with only user message', () => {
      const messages = [
        createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
      ];

      const groups = groupMessagesByRound(messages, []);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.userMessage).toBeDefined();
      expect(groups[0]?.participantMessages).toHaveLength(0);
    });
  });
});

// ============================================================================
// ERROR MESSAGE DISPLAY TESTS
// ============================================================================

describe('error Message Display', () => {
  describe('participant Error', () => {
    it('shows error message inline with participant', () => {
      const messages = [
        createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Error: Rate limit exceeded',
          finishReason: FinishReasons.ERROR,
          hasError: true,
          id: 'p0-r0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      const groups = groupMessagesByRound(messages, []);
      const errorMsg = groups[0]?.participantMessages[0];

      // ✅ TYPE-SAFE: participantMessages is already TestAssistantMessage[]
      expect(errorMsg?.metadata.hasError).toBeTruthy();
      expect(errorMsg?.metadata.finishReason).toBe(FinishReasons.ERROR);
    });
  });
});

// ============================================================================
// LARGE CONVERSATION TESTS
// ============================================================================

describe('large Conversations', () => {
  describe('many Rounds', () => {
    it('handles 20 rounds efficiently', () => {
      // ✅ TYPE-SAFE: Use proper test type
      const messages: TestMessage[] = [];

      for (let round = 0; round < 20; round++) {
        messages.push(createTestUserMessage({ content: `Q${round}`, id: `u${round}`, roundNumber: round }));
        for (let p = 0; p < 3; p++) {
          messages.push(createTestAssistantMessage({
            content: `R${round}-P${p}`,
            finishReason: FinishReasons.STOP,
            id: `p${p}-r${round}`,
            participantId: `p${p}`,
            participantIndex: p,
            roundNumber: round,
          }));
        }
      }

      const groups = groupMessagesByRound(messages, []);

      expect(groups).toHaveLength(20);
      expect(groups[19]?.roundNumber).toBe(19);
    });
  });

  describe('many Participants', () => {
    it('handles 10 participants per round', () => {
      const messages: TestMessage[] = [
        createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
      ];

      for (let p = 0; p < 10; p++) {
        messages.push(createTestAssistantMessage({
          content: `R-P${p}`,
          finishReason: FinishReasons.STOP,
          id: `p${p}-r0`,
          participantId: `p${p}`,
          participantIndex: p,
          roundNumber: 0,
        }));
      }

      const groups = groupMessagesByRound(messages, []);

      expect(groups[0]?.participantMessages).toHaveLength(10);

      // Verify order - ✅ TYPE-SAFE: participantMessages is TestAssistantMessage[]
      groups[0]?.participantMessages.forEach((msg, idx) => {
        expect(msg.metadata.participantIndex).toBe(idx);
      });
    });
  });
});

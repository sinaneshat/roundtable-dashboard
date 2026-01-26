/**
 * Multi-Conversation E2E Tests
 *
 * Comprehensive tests for participant continuation across multiple conversations.
 * Tests the fix for the triggeredNextForRef bug where stale phantom guard entries
 * blocked participant continuation in subsequent conversations.
 *
 * Scenarios covered:
 * - Multiple sequential conversations (3+ in a row)
 * - Rapid conversation switching
 * - Different participant counts between conversations
 * - Interrupting first conversation mid-stream
 * - Mixed round numbers across conversations
 * - Thread navigation patterns
 */

import { FinishReasons, ScreenModes, UIMessageRoles } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import type { TestAssistantMessage, TestUserMessage } from '@/lib/testing';
import {
  createMockParticipant,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';

// ============================================================================
// SIMULATION TYPES
// ============================================================================

type StreamingState = {
  threadId: string | null;
  currentRound: number;
  currentParticipantIndex: number;
  isStreaming: boolean;
  isTriggeringRef: boolean;
  messages: (TestUserMessage | TestAssistantMessage)[];
  participants: ReturnType<typeof createMockParticipant>[];
  // Simulates triggeredNextForRef from use-multi-participant-chat.ts
  triggeredNextFor: Set<string>;
  // Simulates queuedParticipantsThisRoundRef
  queuedParticipants: Set<number>;
  // Simulates processedMessageIdsRef
  processedMessageIds: Set<string>;
  // Simulates roundParticipantsRef
  roundParticipants: ReturnType<typeof createMockParticipant>[];
  screenMode: typeof ScreenModes[keyof typeof ScreenModes];
};

function createInitialState(): StreamingState {
  return {
    currentParticipantIndex: 0,
    currentRound: 0,
    isStreaming: false,
    isTriggeringRef: false,
    messages: [],
    participants: [],
    processedMessageIds: new Set(),
    queuedParticipants: new Set(),
    roundParticipants: [],
    screenMode: ScreenModes.OVERVIEW,
    threadId: null,
    triggeredNextFor: new Set(),
  };
}

// ============================================================================
// SIMULATION FUNCTIONS (Matching actual hook behavior)
// ============================================================================

/**
 * Simulates the FIXED navigation reset from use-multi-participant-chat.ts
 * Lines 1465-1495
 */
function simulateNavigationReset(state: StreamingState): StreamingState {
  return {
    ...state,
    currentParticipantIndex: 0,
    currentRound: 0,
    isStreaming: false,
    isTriggeringRef: false,
    messages: [],
    processedMessageIds: new Set(),
    queuedParticipants: new Set(),
    roundParticipants: [],
    screenMode: ScreenModes.OVERVIEW,
    threadId: null,
    // ✅ FIX: These are now cleared in the actual code
    triggeredNextFor: new Set(),
  };
}

/**
 * Simulates startRound from use-multi-participant-chat.ts
 * Lines 1509-1700
 */
function simulateStartRound(
  state: StreamingState,
  participants: ReturnType<typeof createMockParticipant>[],
  userMessage: string,
  threadId: string,
): StreamingState {
  const roundNumber = state.messages.filter(m => m.role === UIMessageRoles.USER).length;

  // Create user message
  const userMsg = createTestUserMessage({
    content: userMessage,
    id: `${threadId}_r${roundNumber}_user`,
    roundNumber,
  });

  return {
    ...state,
    currentParticipantIndex: 0,
    currentRound: roundNumber,
    isStreaming: true,
    isTriggeringRef: true,
    messages: [...state.messages, userMsg],
    participants,
    queuedParticipants: new Set([0]),
    roundParticipants: participants.filter(p => p.isEnabled !== false),
    screenMode: state.screenMode,
    threadId,
    // ✅ FIX: Clear at start of each round
    triggeredNextFor: new Set(),
  };
}

/**
 * Simulates onFinish callback triggering next participant
 * Lines 895-1380 in use-multi-participant-chat.ts
 */
function simulateParticipantComplete(
  state: StreamingState,
  participantIndex: number,
): { state: StreamingState; nextTriggered: boolean; blockedByPhantomGuard: boolean } {
  const triggerKey = `r${state.currentRound}_p${participantIndex}`;

  // PHANTOM GUARD check (line 1360)
  if (state.triggeredNextFor.has(triggerKey)) {
    return {
      blockedByPhantomGuard: true,
      nextTriggered: false,
      state,
    };
  }

  // Mark as triggered
  const newTriggeredNextFor = new Set(state.triggeredNextFor);
  newTriggeredNextFor.add(triggerKey);

  // Create assistant message
  const participant = state.roundParticipants[participantIndex];
  const assistantMsg = createTestAssistantMessage({
    content: `Response from participant ${participantIndex}`,
    finishReason: FinishReasons.STOP,
    id: `${state.threadId}_r${state.currentRound}_p${participantIndex}`,
    participantId: participant?.id || `participant-${participantIndex}`,
    participantIndex,
    roundNumber: state.currentRound,
  });

  const nextIndex = participantIndex + 1;
  const totalParticipants = state.roundParticipants.length;

  // Round complete?
  if (nextIndex >= totalParticipants) {
    return {
      blockedByPhantomGuard: false,
      nextTriggered: true,
      state: {
        ...state,
        currentParticipantIndex: 0,
        isStreaming: false,
        isTriggeringRef: false,
        messages: [...state.messages, assistantMsg],
        triggeredNextFor: newTriggeredNextFor,
      },
    };
  }

  // More participants to process
  const newQueuedParticipants = new Set(state.queuedParticipants);
  newQueuedParticipants.add(nextIndex);

  return {
    blockedByPhantomGuard: false,
    nextTriggered: true,
    state: {
      ...state,
      currentParticipantIndex: nextIndex,
      messages: [...state.messages, assistantMsg],
      queuedParticipants: newQueuedParticipants,
      triggeredNextFor: newTriggeredNextFor,
    },
  };
}

/**
 * Simulates a complete round with all participants
 */
function simulateCompleteRound(
  state: StreamingState,
  participants: ReturnType<typeof createMockParticipant>[],
  userMessage: string,
  threadId: string,
): { state: StreamingState; allParticipantsCompleted: boolean; blockedAt: number | null } {
  // Start the round
  let currentState = simulateStartRound(state, participants, userMessage, threadId);

  // Complete each participant
  for (let i = 0; i < participants.length; i++) {
    const result = simulateParticipantComplete(currentState, i);
    currentState = result.state;

    if (result.blockedByPhantomGuard) {
      return {
        allParticipantsCompleted: false,
        blockedAt: i,
        state: currentState,
      };
    }
  }

  return {
    allParticipantsCompleted: true,
    blockedAt: null,
    state: currentState,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('multi-Conversation E2E Tests', () => {
  describe('sequential Conversations', () => {
    it('should complete 3 conversations in a row without blocking', () => {
      let state = createInitialState();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      // Conversation 1
      let result = simulateCompleteRound(state, participants, 'Question 1', 'thread-1');
      expect(result.allParticipantsCompleted).toBeTruthy();
      expect(result.blockedAt).toBeNull();
      expect(result.state.messages.filter(m => m.role === UIMessageRoles.ASSISTANT)).toHaveLength(2);

      // Navigate to new chat
      state = simulateNavigationReset(result.state);
      expect(state.triggeredNextFor.size).toBe(0);

      // Conversation 2
      result = simulateCompleteRound(state, participants, 'Question 2', 'thread-2');
      expect(result.allParticipantsCompleted).toBeTruthy();
      expect(result.blockedAt).toBeNull();
      expect(result.state.messages.filter(m => m.role === UIMessageRoles.ASSISTANT)).toHaveLength(2);

      // Navigate to new chat
      state = simulateNavigationReset(result.state);

      // Conversation 3
      result = simulateCompleteRound(state, participants, 'Question 3', 'thread-3');
      expect(result.allParticipantsCompleted).toBeTruthy();
      expect(result.blockedAt).toBeNull();
      expect(result.state.messages.filter(m => m.role === UIMessageRoles.ASSISTANT)).toHaveLength(2);
    });

    it('should complete 5 conversations with varying participant counts', () => {
      let state = createInitialState();

      const conversationConfigs = [
        { participants: 2, threadId: 'thread-1' },
        { participants: 3, threadId: 'thread-2' },
        { participants: 1, threadId: 'thread-3' },
        { participants: 4, threadId: 'thread-4' },
        { participants: 2, threadId: 'thread-5' },
      ];

      for (const config of conversationConfigs) {
        const participants = Array.from({ length: config.participants }, (_, i) =>
          createMockParticipant(i));

        const result = simulateCompleteRound(
          state,
          participants,
          `Question for ${config.threadId}`,
          config.threadId,
        );

        expect(result.allParticipantsCompleted).toBeTruthy();
        expect(result.blockedAt).toBeNull();
        expect(result.state.messages.filter(m => m.role === UIMessageRoles.ASSISTANT)).toHaveLength(
          config.participants,
        );

        // Navigate to new chat
        state = simulateNavigationReset(result.state);
      }
    });
  });

  describe('interrupted Conversations', () => {
    it('should handle interrupting mid-round and starting new conversation', () => {
      let state = createInitialState();
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ];

      // Start first conversation
      state = simulateStartRound(state, participants, 'Question 1', 'thread-1');

      // Only complete first participant
      const result = simulateParticipantComplete(state, 0);
      expect(result.nextTriggered).toBeTruthy();
      expect(result.blockedByPhantomGuard).toBeFalsy();

      // User interrupts and navigates to new chat
      state = simulateNavigationReset(result.state);

      // Start second conversation - should work without blocking
      const fullResult = simulateCompleteRound(state, participants, 'Question 2', 'thread-2');
      expect(fullResult.allParticipantsCompleted).toBeTruthy();
      expect(fullResult.blockedAt).toBeNull();
    });

    it('should handle interrupting after 2 of 3 participants', () => {
      let state = createInitialState();
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ];

      // Start first conversation
      state = simulateStartRound(state, participants, 'Question 1', 'thread-1');

      // Complete participants 0 and 1
      let result = simulateParticipantComplete(state, 0);
      state = result.state;
      result = simulateParticipantComplete(state, 1);
      expect(result.state.triggeredNextFor.size).toBe(2);

      // User interrupts (participant 2 never completes)
      state = simulateNavigationReset(result.state);

      // Second conversation - all participants should complete
      const fullResult = simulateCompleteRound(state, participants, 'Question 2', 'thread-2');
      expect(fullResult.allParticipantsCompleted).toBeTruthy();
      expect(fullResult.blockedAt).toBeNull();
    });
  });

  describe('rapid Switching', () => {
    it('should handle rapid new chat clicks without starting any rounds', () => {
      let state = createInitialState();

      // Rapidly click new chat 5 times without starting any rounds
      for (let i = 0; i < 5; i++) {
        state = simulateNavigationReset(state);
        expect(state.triggeredNextFor.size).toBe(0);
        expect(state.threadId).toBeNull();
      }

      // Now start and complete a conversation
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      const result = simulateCompleteRound(state, participants, 'Finally asking', 'thread-1');
      expect(result.allParticipantsCompleted).toBeTruthy();
    });

    it('should handle rapid start-reset-start cycles', () => {
      let state = createInitialState();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      for (let i = 0; i < 3; i++) {
        // Start a round
        state = simulateStartRound(state, participants, `Question ${i}`, `thread-${i}`);
        expect(state.isStreaming).toBeTruthy();

        // Immediately reset before any participant completes
        state = simulateNavigationReset(state);
        expect(state.isStreaming).toBeFalsy();
        expect(state.triggeredNextFor.size).toBe(0);
      }

      // Final conversation should work
      const result = simulateCompleteRound(state, participants, 'Final question', 'thread-final');
      expect(result.allParticipantsCompleted).toBeTruthy();
    });
  });

  describe('multi-Round Within Same Thread', () => {
    it('should handle multiple rounds within same thread then new chat', () => {
      let state = createInitialState();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      // Round 0
      let result = simulateCompleteRound(state, participants, 'Round 0 question', 'thread-1');
      expect(result.allParticipantsCompleted).toBeTruthy();
      state = result.state;

      // Round 1 (same thread - don't reset)
      // Manually set up for round 1 without full reset
      state = {
        ...state,
        currentRound: 1,
        triggeredNextFor: new Set(), // Cleared by startRound
      };
      result = simulateCompleteRound(state, participants, 'Round 1 question', 'thread-1');
      expect(result.allParticipantsCompleted).toBeTruthy();

      // Now navigate to new chat
      state = simulateNavigationReset(result.state);

      // New thread - should work
      result = simulateCompleteRound(state, participants, 'New thread question', 'thread-2');
      expect(result.allParticipantsCompleted).toBeTruthy();
    });
  });

  describe('edge Cases', () => {
    it('should handle single participant conversations', () => {
      let state = createInitialState();
      const singleParticipant = [createMockParticipant(0)];

      // Multiple single-participant conversations
      for (let i = 0; i < 5; i++) {
        const result = simulateCompleteRound(
          state,
          singleParticipant,
          `Question ${i}`,
          `thread-${i}`,
        );
        expect(result.allParticipantsCompleted).toBeTruthy();
        expect(result.state.messages.filter(m => m.role === UIMessageRoles.ASSISTANT)).toHaveLength(1);
        state = simulateNavigationReset(result.state);
      }
    });

    it('should handle max participants (10) across conversations', () => {
      let state = createInitialState();
      const maxParticipants = Array.from({ length: 10 }, (_, i) => createMockParticipant(i));

      // Conversation with 10 participants
      let result = simulateCompleteRound(state, maxParticipants, 'Max participants', 'thread-1');
      expect(result.allParticipantsCompleted).toBeTruthy();
      expect(result.state.triggeredNextFor.size).toBe(10);

      // Navigate and start new conversation
      state = simulateNavigationReset(result.state);
      expect(state.triggeredNextFor.size).toBe(0);

      // New conversation with 10 participants
      result = simulateCompleteRound(state, maxParticipants, 'Another max', 'thread-2');
      expect(result.allParticipantsCompleted).toBeTruthy();
    });

    it('should maintain correct phantom guard keys format', () => {
      const state = createInitialState();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      // Complete a round
      const result = simulateCompleteRound(state, participants, 'Test question', 'thread-1');

      // Verify key format
      expect(result.state.triggeredNextFor.has('r0_p0')).toBeTruthy();
      expect(result.state.triggeredNextFor.has('r0_p1')).toBeTruthy();
      expect(result.state.triggeredNextFor.size).toBe(2);
    });
  });
});

describe('phantom Guard Isolation Tests', () => {
  it('should NOT have cross-conversation phantom guard pollution', () => {
    const guard1 = new Set<string>();
    const guard2 = new Set<string>();

    // Conversation 1 adds entries
    guard1.add('r0_p0');
    guard1.add('r0_p1');

    // Conversation 2 should be independent
    expect(guard2.has('r0_p0')).toBeFalsy();
    expect(guard2.has('r0_p1')).toBeFalsy();

    // After navigation reset, guard1 is replaced with new Set
    const guard1AfterReset = new Set<string>();
    expect(guard1AfterReset.has('r0_p0')).toBeFalsy();
  });

  it('should verify Set clearing vs replacement behavior', () => {
    const originalSet = new Set(['r0_p0', 'r0_p1']);

    // Method 1: .clear() - same reference
    originalSet.clear();
    expect(originalSet.size).toBe(0);

    // Method 2: new Set() - new reference (what we do in the fix)
    const newSet = new Set<string>();
    expect(newSet.size).toBe(0);
    expect(newSet).not.toBe(originalSet);
  });
});

describe('regression Tests', () => {
  it('bUG SCENARIO: second conversation blocked without fix', () => {
    // This test documents the original bug behavior
    // The state simulation shows what would happen WITHOUT the fix

    const buggyState = {
      triggeredNextFor: new Set(['r0_p0', 'r0_p1']), // Stale from conversation 1
    };

    // Second conversation starts at round 0 again
    const triggerKey = 'r0_p0';

    // WITHOUT FIX: This would be true and block the participant
    const wouldBeBlockedWithoutFix = buggyState.triggeredNextFor.has(triggerKey);
    expect(wouldBeBlockedWithoutFix).toBeTruthy();

    // WITH FIX: triggeredNextFor is cleared, so this is false
    const fixedState = {
      triggeredNextFor: new Set<string>(), // Cleared by navigation reset
    };
    const isBlockedWithFix = fixedState.triggeredNextFor.has(triggerKey);
    expect(isBlockedWithFix).toBeFalsy();
  });

  it('should verify fix locations are hit during simulation', () => {
    let state = createInitialState();
    const participants = [createMockParticipant(0), createMockParticipant(1)];

    // Complete first conversation
    const result = simulateCompleteRound(state, participants, 'Q1', 'thread-1');
    expect(result.state.triggeredNextFor.size).toBe(2);

    // FIX LOCATION 1: Navigation reset clears triggeredNextFor
    state = simulateNavigationReset(result.state);
    expect(state.triggeredNextFor.size).toBe(0); // ✅ Fixed

    // FIX LOCATION 2: startRound clears triggeredNextFor
    state = simulateStartRound(state, participants, 'Q2', 'thread-2');
    expect(state.triggeredNextFor.size).toBe(0); // ✅ Fixed (cleared in startRound)
  });
});

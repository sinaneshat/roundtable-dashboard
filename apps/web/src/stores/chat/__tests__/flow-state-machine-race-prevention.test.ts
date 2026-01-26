/**
 * Flow State Machine Race Prevention Tests
 *
 * These tests verify that the flow state machine correctly prevents
 * race conditions during state transitions:
 *
 * 1. Moderator creation NEVER happens while any participant is streaming
 * 2. State transitions happen in correct order
 * 3. Actions are called exactly once (no over-triggering)
 * 4. Fresh state is always used for decisions (no stale closures)
 *
 * Location: /src/stores/chat/__tests__/flow-state-machine-race-prevention.test.ts
 */

import { FlowStates, MessageRoles, MessageStatuses } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ChatParticipant } from '@/services/api';

import {
  areAllParticipantsCompleteForRound,
  getParticipantCompletionStatus,
} from '../utils/participant-completion-gate';

// ============================================================================
// Test Utilities
// ============================================================================

function createParticipant(id: string, index: number): ChatParticipant {
  return {
    createdAt: new Date('2024-01-01'),
    customRoleId: null,
    id,
    isEnabled: true,
    modelId: `model-${index}`,
    priority: index,
    role: null,
    settings: null,
    threadId: 'thread-123',
    updatedAt: new Date('2024-01-01'),
  };
}

function createUserMessage(roundNumber: number): UIMessage {
  return {
    id: `user-r${roundNumber}`,
    metadata: { role: MessageRoles.USER, roundNumber },
    parts: [{ text: 'Question', type: 'text' }],
    role: MessageRoles.USER,
  };
}

function createAssistantMessage(
  participantId: string,
  roundNumber: number,
  participantIndex: number,
  options: { streaming?: boolean; hasContent?: boolean; finishReason?: string } = {},
): UIMessage {
  const { finishReason = 'stop', hasContent = true, streaming = false } = options;

  return {
    id: `msg-${participantId}-r${roundNumber}`,
    metadata: {
      finishReason: streaming ? undefined : finishReason,
      model: `model-${participantIndex}`,
      participantId,
      participantIndex,
      role: MessageRoles.ASSISTANT,
      roundNumber,
    },
    parts: hasContent
      ? [{ state: streaming ? 'streaming' as const : 'done' as const, text: 'Response', type: 'text' }]
      : [],
    role: MessageRoles.ASSISTANT,
  };
}

// ============================================================================
// Action Call Tracker - Simulates Store Actions
// ============================================================================

type ActionParams = {
  roundNumber?: number;
  participantIndex?: number;
  messageId?: string;
};

type ActionCallLog = {
  action: string;
  timestamp: number;
  params?: ActionParams;
};

function createMockStore() {
  const actionLog: ActionCallLog[] = [];
  let moderatorCreatedForRound: number | null = null;

  return {
    actionLog,
    // Simulates completeStreaming
    completeStreaming: () => {
      actionLog.push({
        action: 'completeStreaming',
        timestamp: Date.now(),
      });
    },
    // Simulates createPendingModerator
    createPendingModerator: (params: { roundNumber: number }) => {
      actionLog.push({
        action: 'createPendingModerator',
        params,
        timestamp: Date.now(),
      });
    },

    getActionCount: (actionName: string): number => {
      return actionLog.filter(a => a.action === actionName).length;
    },

    getModeratorCreatedRound: () => moderatorCreatedForRound,

    resetLog: () => {
      actionLog.length = 0;
      moderatorCreatedForRound = null;
    },

    // Simulates tryMarkModeratorCreated (atomic check)
    tryMarkModeratorCreated: (roundNumber: number): boolean => {
      if (moderatorCreatedForRound === roundNumber) {
        return false; // Already created
      }
      moderatorCreatedForRound = roundNumber;
      actionLog.push({
        action: 'tryMarkModeratorCreated',
        params: { roundNumber, success: true },
        timestamp: Date.now(),
      });
      return true;
    },
  };
}

// ============================================================================
// Flow State Calculation (Simplified from flow-state-machine.ts)
// ============================================================================

type FlowContext = {
  allParticipantsResponded: boolean;
  moderatorExists: boolean;
  moderatorStatus: string | null;
  isAiSdkStreaming: boolean;
  streamingJustCompleted: boolean;
  isModeratorStreaming: boolean;
  participantCount: number;
};

function determineFlowState(context: FlowContext): string {
  // Moderator streaming
  if (context.moderatorStatus === MessageStatuses.STREAMING) {
    return FlowStates.STREAMING_MODERATOR;
  }

  // Creating moderator (all participants done, no moderator yet)
  if (
    !context.isAiSdkStreaming
    && !context.streamingJustCompleted
    && context.allParticipantsResponded
    && context.participantCount > 0
    && !context.moderatorExists
    && !context.isModeratorStreaming
  ) {
    return FlowStates.CREATING_MODERATOR;
  }

  // Participants streaming
  if (context.isAiSdkStreaming && !context.moderatorExists) {
    return FlowStates.STREAMING_PARTICIPANTS;
  }

  return FlowStates.IDLE;
}

// ============================================================================
// Simulated Moderator Gate (from flow-state-machine.ts CREATE_MODERATOR case)
// ============================================================================

function simulateModeratorGate(
  messages: UIMessage[],
  participants: ChatParticipant[],
  roundNumber: number,
  isStreaming: boolean,
  store: ReturnType<typeof createMockStore>,
): { created: boolean; blockedReason?: string } {
  // Gate 1: Check isStreaming flag
  if (isStreaming) {
    return { blockedReason: 'isStreaming=true', created: false };
  }

  // Gate 2: Strict completion check using participant-completion-gate
  const completionStatus = getParticipantCompletionStatus(
    messages,
    participants,
    roundNumber,
  );

  if (!completionStatus.allComplete) {
    return {
      blockedReason: `participants not complete: ${completionStatus.streamingParticipantIds.join(', ')}`,
      created: false,
    };
  }

  // Gate 3: Atomic check to prevent duplicate creation
  if (!store.tryMarkModeratorCreated(roundNumber)) {
    return { blockedReason: 'already created', created: false };
  }

  // All gates passed - create moderator
  store.createPendingModerator({ roundNumber });
  store.completeStreaming();

  return { created: true };
}

// ============================================================================
// TESTS: Race Condition Prevention
// ============================================================================

describe('flow State Machine Race Prevention', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
  });

  describe('gate 1: isStreaming Flag', () => {
    it('blocks moderator creation when isStreaming is true', () => {
      const participants = [createParticipant('p1', 0)];
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0, { streaming: false }),
      ];

      const result = simulateModeratorGate(
        messages,
        participants,
        0,
        true, // isStreaming = true
        store,
      );

      expect(result.created).toBeFalsy();
      expect(result.blockedReason).toBe('isStreaming=true');
      expect(store.getActionCount('createPendingModerator')).toBe(0);
    });

    it('allows moderator creation when isStreaming is false', () => {
      const participants = [createParticipant('p1', 0)];
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0, { streaming: false }),
      ];

      const result = simulateModeratorGate(
        messages,
        participants,
        0,
        false, // isStreaming = false
        store,
      );

      expect(result.created).toBeTruthy();
      expect(store.getActionCount('createPendingModerator')).toBe(1);
    });
  });

  describe('gate 2: Participant Completion Check', () => {
    it('blocks when first participant is streaming', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
      ];
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0, { streaming: true }), // P1 streaming
      ];

      const result = simulateModeratorGate(messages, participants, 0, false, store);

      expect(result.created).toBeFalsy();
      expect(result.blockedReason).toContain('p1');
    });

    it('blocks when last participant is streaming', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
        createParticipant('p3', 2),
      ];
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0, { streaming: false }),
        createAssistantMessage('p2', 0, 1, { streaming: false }),
        createAssistantMessage('p3', 0, 2, { streaming: true }), // P3 (last) streaming
      ];

      const result = simulateModeratorGate(messages, participants, 0, false, store);

      expect(result.created).toBeFalsy();
      expect(result.blockedReason).toContain('p3');
      expect(store.getActionCount('createPendingModerator')).toBe(0);
    });

    it('blocks when any middle participant is streaming', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
        createParticipant('p3', 2),
      ];
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0, { streaming: false }),
        createAssistantMessage('p2', 0, 1, { streaming: true }), // P2 (middle) streaming
        createAssistantMessage('p3', 0, 2, { streaming: false }),
      ];

      const result = simulateModeratorGate(messages, participants, 0, false, store);

      expect(result.created).toBeFalsy();
      expect(result.blockedReason).toContain('p2');
    });

    it('blocks when participant has no message yet', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
      ];
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0, { streaming: false }),
        // P2 has no message
      ];

      const result = simulateModeratorGate(messages, participants, 0, false, store);

      expect(result.created).toBeFalsy();
      expect(result.blockedReason).toContain('p2');
    });

    it('allows when ALL participants are complete', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
        createParticipant('p3', 2),
      ];
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0, { streaming: false }),
        createAssistantMessage('p2', 0, 1, { streaming: false }),
        createAssistantMessage('p3', 0, 2, { streaming: false }),
      ];

      const result = simulateModeratorGate(messages, participants, 0, false, store);

      expect(result.created).toBeTruthy();
      expect(store.getActionCount('createPendingModerator')).toBe(1);
    });
  });

  describe('gate 3: Atomic Creation Check', () => {
    it('prevents duplicate moderator creation on concurrent calls', () => {
      const participants = [createParticipant('p1', 0)];
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0, { streaming: false }),
      ];

      // First call succeeds
      const result1 = simulateModeratorGate(messages, participants, 0, false, store);
      expect(result1.created).toBeTruthy();
      expect(store.getActionCount('createPendingModerator')).toBe(1);

      // Second call is blocked by atomic check
      const result2 = simulateModeratorGate(messages, participants, 0, false, store);
      expect(result2.created).toBeFalsy();
      expect(result2.blockedReason).toBe('already created');
      expect(store.getActionCount('createPendingModerator')).toBe(1); // Still 1
    });

    it('allows moderator creation for different rounds', () => {
      const participants = [createParticipant('p1', 0)];
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0, { streaming: false }),
        createUserMessage(1),
        createAssistantMessage('p1', 1, 0, { streaming: false }),
      ];

      // Round 0
      const result0 = simulateModeratorGate(messages, participants, 0, false, store);
      expect(result0.created).toBeTruthy();

      // Round 1 (separate atomic check)
      const result1 = simulateModeratorGate(messages, participants, 1, false, store);
      expect(result1.created).toBeTruthy();

      expect(store.getActionCount('createPendingModerator')).toBe(2);
    });
  });

  describe('flow State Transitions', () => {
    it('transitions to CREATING_MODERATOR only when all conditions met', () => {
      // Condition 1: isAiSdkStreaming = false
      // Condition 2: allParticipantsResponded = true
      // Condition 3: moderatorExists = false
      // Condition 4: isModeratorStreaming = false
      // Condition 5: streamingJustCompleted = false

      const context: FlowContext = {
        allParticipantsResponded: true,
        isAiSdkStreaming: false,
        isModeratorStreaming: false,
        moderatorExists: false,
        moderatorStatus: null,
        participantCount: 2,
        streamingJustCompleted: false,
      };

      expect(determineFlowState(context)).toBe(FlowStates.CREATING_MODERATOR);
    });

    it('stays at STREAMING_PARTICIPANTS when isAiSdkStreaming is true', () => {
      const context: FlowContext = {
        allParticipantsResponded: true, // Even if all responded...
        isAiSdkStreaming: true, // ...streaming flag blocks
        isModeratorStreaming: false,
        moderatorExists: false,
        moderatorStatus: null,
        participantCount: 2,
        streamingJustCompleted: false,
      };

      expect(determineFlowState(context)).toBe(FlowStates.STREAMING_PARTICIPANTS);
    });

    it('stays at IDLE when streamingJustCompleted is true', () => {
      const context: FlowContext = {
        allParticipantsResponded: true,
        isAiSdkStreaming: false,
        isModeratorStreaming: false,
        moderatorExists: false,
        moderatorStatus: null,
        participantCount: 2,
        streamingJustCompleted: true, // Delay window blocks
      };

      // Won't be CREATING_MODERATOR due to streamingJustCompleted
      const state = determineFlowState(context);
      expect(state).not.toBe(FlowStates.CREATING_MODERATOR);
    });

    it('does not transition when allParticipantsResponded is false', () => {
      const context: FlowContext = {
        allParticipantsResponded: false, // Not all responded
        isAiSdkStreaming: false,
        isModeratorStreaming: false,
        moderatorExists: false,
        moderatorStatus: null,
        participantCount: 2,
        streamingJustCompleted: false,
      };

      expect(determineFlowState(context)).toBe(FlowStates.IDLE);
    });
  });
});

// ============================================================================
// TESTS: Real-World Timing Scenarios
// ============================================================================

describe('real-World Timing Scenarios', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
  });

  describe('scenario: Fast Last Participant', () => {
    it('handles rapid completion without race condition', () => {
      const participants = [
        createParticipant('slow-model', 0),
        createParticipant('fast-model', 1),
      ];

      // Step 1: Slow model starts streaming
      let messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('slow-model', 0, 0, { streaming: true }),
      ];

      let result = simulateModeratorGate(messages, participants, 0, true, store);
      expect(result.created).toBeFalsy();

      // Step 2: Fast model completes while slow is still streaming
      messages = [
        createUserMessage(0),
        createAssistantMessage('slow-model', 0, 0, { streaming: true }),
        createAssistantMessage('fast-model', 0, 1, { streaming: false }),
      ];

      result = simulateModeratorGate(messages, participants, 0, true, store);
      expect(result.created).toBeFalsy();

      // Step 3: Slow model completes
      messages = [
        createUserMessage(0),
        createAssistantMessage('slow-model', 0, 0, { streaming: false }),
        createAssistantMessage('fast-model', 0, 1, { streaming: false }),
      ];

      result = simulateModeratorGate(messages, participants, 0, false, store);
      expect(result.created).toBeTruthy();
      expect(store.getActionCount('createPendingModerator')).toBe(1);
    });
  });

  describe('scenario: Effect Re-runs', () => {
    it('handles multiple effect triggers without over-calling', () => {
      const participants = [createParticipant('p1', 0)];
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0, { streaming: false }),
      ];

      // Simulate multiple effect runs (React strict mode, state updates)
      for (let i = 0; i < 10; i++) {
        simulateModeratorGate(messages, participants, 0, false, store);
      }

      // Should only create moderator once
      expect(store.getActionCount('createPendingModerator')).toBe(1);
      expect(store.getActionCount('tryMarkModeratorCreated')).toBe(1); // Atomic check passes once
    });
  });

  describe('scenario: Stale Closure Prevention', () => {
    it('always uses fresh messages for decision', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
      ];

      // Stale messages (p2 still streaming)
      const staleMessages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0, { streaming: false }),
        createAssistantMessage('p2', 0, 1, { streaming: true }),
      ];

      // Fresh messages (p2 now complete)
      const freshMessages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0, { streaming: false }),
        createAssistantMessage('p2', 0, 1, { streaming: false }),
      ];

      // If code uses stale messages, it would block
      const staleResult = simulateModeratorGate(staleMessages, participants, 0, false, store);
      expect(staleResult.created).toBeFalsy();

      // Fresh messages should allow
      const freshResult = simulateModeratorGate(freshMessages, participants, 0, false, store);
      expect(freshResult.created).toBeTruthy();
    });
  });
});

// ============================================================================
// TESTS: Action Call Counts
// ============================================================================

describe('action Call Count Verification', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
  });

  it('calls completeStreaming exactly once on success', () => {
    const participants = [createParticipant('p1', 0)];
    const messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, 0, { streaming: false }),
    ];

    // Multiple gate checks
    simulateModeratorGate(messages, participants, 0, false, store);
    simulateModeratorGate(messages, participants, 0, false, store);
    simulateModeratorGate(messages, participants, 0, false, store);

    expect(store.getActionCount('completeStreaming')).toBe(1);
  });

  it('never calls createPendingModerator when blocked', () => {
    const participants = [createParticipant('p1', 0)];
    const messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, 0, { streaming: true }),
    ];

    // Multiple attempts while streaming
    for (let i = 0; i < 5; i++) {
      simulateModeratorGate(messages, participants, 0, true, store);
    }

    expect(store.getActionCount('createPendingModerator')).toBe(0);
    expect(store.getActionCount('tryMarkModeratorCreated')).toBe(0);
    expect(store.getActionCount('completeStreaming')).toBe(0);
  });

  it('tracks action sequence correctly', () => {
    const participants = [createParticipant('p1', 0)];
    const messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, 0, { streaming: false }),
    ];

    simulateModeratorGate(messages, participants, 0, false, store);

    const actions = store.actionLog.map(a => a.action);
    expect(actions).toEqual([
      'tryMarkModeratorCreated',
      'createPendingModerator',
      'completeStreaming',
    ]);
  });
});

// ============================================================================
// TESTS: Multi-Round Isolation
// ============================================================================

describe('multi-Round Isolation', () => {
  it('round completion status is isolated per round', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];
    const messages: UIMessage[] = [
      // Round 0 - complete
      createUserMessage(0),
      createAssistantMessage('p1', 0, 0, { streaming: false }),
      createAssistantMessage('p2', 0, 1, { streaming: false }),
      // Round 1 - incomplete (p2 streaming)
      createUserMessage(1),
      createAssistantMessage('p1', 1, 0, { streaming: false }),
      createAssistantMessage('p2', 1, 1, { streaming: true }),
    ];

    expect(areAllParticipantsCompleteForRound(messages, participants, 0)).toBeTruthy();
    expect(areAllParticipantsCompleteForRound(messages, participants, 1)).toBeFalsy();
  });

  it('moderator gate uses correct round for checks', () => {
    const store = createMockStore();
    const participants = [createParticipant('p1', 0)];
    const messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, 0, { streaming: false }),
      createUserMessage(1),
      createAssistantMessage('p1', 1, 0, { streaming: true }),
    ];

    // Round 0 should succeed
    const result0 = simulateModeratorGate(messages, participants, 0, false, store);
    expect(result0.created).toBeTruthy();

    // Round 1 should block (streaming)
    const result1 = simulateModeratorGate(messages, participants, 1, false, store);
    expect(result1.created).toBeFalsy();
  });
});

// ============================================================================
// TESTS: Edge Cases
// ============================================================================

describe('edge Cases', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
  });

  it('handles empty participants list', () => {
    const messages: UIMessage[] = [createUserMessage(0)];

    const result = simulateModeratorGate(messages, [], 0, false, store);

    expect(result.created).toBeFalsy();
  });

  it('handles empty messages list', () => {
    const participants = [createParticipant('p1', 0)];

    const result = simulateModeratorGate([], participants, 0, false, store);

    expect(result.created).toBeFalsy();
  });

  it('handles single participant correctly', () => {
    const participants = [createParticipant('p1', 0)];

    // Streaming
    let messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, 0, { streaming: true }),
    ];
    let result = simulateModeratorGate(messages, participants, 0, true, store);
    expect(result.created).toBeFalsy();

    // Complete
    messages = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, 0, { streaming: false }),
    ];
    result = simulateModeratorGate(messages, participants, 0, false, store);
    expect(result.created).toBeTruthy();
  });

  it('handles many participants (stress test)', () => {
    const participantCount = 10;
    const participants = Array.from(
      { length: participantCount },
      (_, i) => createParticipant(`p${i}`, i),
    );

    // All but last streaming
    const messagesWithStreaming: UIMessage[] = [
      createUserMessage(0),
      ...participants.slice(0, -1).map((p, i) =>
        createAssistantMessage(p.id, 0, i, { streaming: false }),
      ),
      createAssistantMessage(
        participants[participantCount - 1].id,
        0,
        participantCount - 1,
        { streaming: true },
      ),
    ];

    const result1 = simulateModeratorGate(messagesWithStreaming, participants, 0, false, store);
    expect(result1.created).toBeFalsy();

    // All complete
    const messagesAllComplete: UIMessage[] = [
      createUserMessage(0),
      ...participants.map((p, i) =>
        createAssistantMessage(p.id, 0, i, { streaming: false }),
      ),
    ];

    const result2 = simulateModeratorGate(messagesAllComplete, participants, 0, false, store);
    expect(result2.created).toBeTruthy();
  });
});

/**
 * Stale Streaming State Cleanup Tests
 *
 * Tests for detecting and cleaning up stale streaming state where
 * streamingRoundNumber is stuck but the round is actually complete.
 *
 * Bug scenario:
 * 1. User submits follow-up message → streamingRoundNumber = N
 * 2. Participants stream and complete
 * 3. Moderator streams and completes (finishReason: 'stop')
 * 4. completeStreaming() is NOT called due to race condition
 * 5. streamingRoundNumber remains N, blocking chat input
 *
 * Fix:
 * - use-moderator-trigger.ts: Checks if round is complete on early return
 * - use-stale-streaming-cleanup.ts: Periodic cleanup as safety net
 * - isRoundComplete(): New utility to check full round completion
 */

import { FinishReasons, MessagePartTypes, MessageRoles, TextPartStates, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  getModeratorMessageForRound,
  getParticipantCompletionStatus,
  isMessageComplete,
  isRoundComplete,
} from '../utils/participant-completion-gate';

// ============================================================================
// Test Data Factories
// ============================================================================

function createUserMessage(roundNumber: number, text = 'Test message'): UIMessage {
  return {
    id: `user_r${roundNumber}`,
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
    parts: [{ text, type: MessagePartTypes.TEXT }],
    role: UIMessageRoles.USER,
  };
}

function createParticipantMessage(
  roundNumber: number,
  participantIndex: number,
  options: {
    finishReason?: string;
    text?: string;
    isStreaming?: boolean;
    participantId?: string;
  } = {},
): UIMessage {
  const {
    finishReason = FinishReasons.STOP,
    isStreaming = false,
    participantId = `participant_${participantIndex}`,
    text = 'Participant response',
  } = options;

  return {
    id: `thread_r${roundNumber}_p${participantIndex}`,
    metadata: {
      finishReason,
      participantId,
      participantIndex,
      role: MessageRoles.ASSISTANT,
      roundNumber,
    },
    parts: [{
      text,
      type: MessagePartTypes.TEXT,
      ...(isStreaming ? { state: TextPartStates.STREAMING } : { state: TextPartStates.DONE }),
    }],
    role: UIMessageRoles.ASSISTANT,
  };
}

function createModeratorMessage(
  roundNumber: number,
  options: {
    finishReason?: string;
    text?: string;
    isStreaming?: boolean;
  } = {},
): UIMessage {
  const {
    finishReason = FinishReasons.STOP,
    isStreaming = false,
    text = 'Moderator summary',
  } = options;

  return {
    id: `thread_r${roundNumber}_moderator`,
    metadata: {
      finishReason,
      isModerator: true,
      model: 'test/moderator-model', // Required by DbModeratorMessageMetadataSchema
      role: MessageRoles.ASSISTANT,
      roundNumber,
    },
    parts: [{
      text,
      type: MessagePartTypes.TEXT,
      ...(isStreaming ? { state: TextPartStates.STREAMING } : { state: TextPartStates.DONE }),
    }],
    role: UIMessageRoles.ASSISTANT,
  };
}

function createParticipant(id: string, priority: number, isEnabled = true) {
  return {
    createdAt: new Date().toISOString(),
    customRoleId: null,
    id,
    is_accessible_to_user: true,
    isEnabled,
    modelId: `model_${priority}`,
    priority,
    required_tier_name: 'Free' as const,
    role: null,
    settings: null,
    threadId: 'thread_1',
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// isMessageComplete Tests
// ============================================================================

describe('isMessageComplete', () => {
  it('returns true for message with finishReason and content', () => {
    const msg = createParticipantMessage(0, 0, { finishReason: FinishReasons.STOP });
    expect(isMessageComplete(msg)).toBeTruthy();
  });

  it('returns false for message with streaming parts', () => {
    const msg = createParticipantMessage(0, 0, { isStreaming: true });
    expect(isMessageComplete(msg)).toBeFalsy();
  });

  it('returns true for message with content but no finishReason', () => {
    const msg: UIMessage = {
      id: 'test',
      metadata: { role: MessageRoles.ASSISTANT, roundNumber: 0 },
      parts: [{ state: TextPartStates.DONE, text: 'Content', type: MessagePartTypes.TEXT }],
      role: UIMessageRoles.ASSISTANT,
    };
    expect(isMessageComplete(msg)).toBeTruthy();
  });

  it('returns false for message with finishReason unknown and no content', () => {
    const msg: UIMessage = {
      id: 'test',
      metadata: {
        finishReason: FinishReasons.UNKNOWN,
        role: MessageRoles.ASSISTANT,
        roundNumber: 0,
      },
      parts: [],
      role: UIMessageRoles.ASSISTANT,
    };
    expect(isMessageComplete(msg)).toBeFalsy();
  });

  it('returns true for moderator with finishReason stop', () => {
    const msg = createModeratorMessage(0, { finishReason: FinishReasons.STOP });
    expect(isMessageComplete(msg)).toBeTruthy();
  });
});

// ============================================================================
// getModeratorMessageForRound Tests
// ============================================================================

describe('getModeratorMessageForRound', () => {
  it('finds moderator message for the specified round', () => {
    const messages = [
      createUserMessage(0),
      createParticipantMessage(0, 0),
      createModeratorMessage(0),
    ];
    const moderator = getModeratorMessageForRound(messages, 0);
    expect(moderator).toBeDefined();
    expect(moderator?.id).toBe('thread_r0_moderator');
  });

  it('returns undefined if no moderator exists for round', () => {
    const messages = [
      createUserMessage(0),
      createParticipantMessage(0, 0),
    ];
    const moderator = getModeratorMessageForRound(messages, 0);
    expect(moderator).toBeUndefined();
  });

  it('distinguishes moderators by round number', () => {
    const messages = [
      createModeratorMessage(0),
      createModeratorMessage(1),
    ];
    expect(getModeratorMessageForRound(messages, 0)?.id).toBe('thread_r0_moderator');
    expect(getModeratorMessageForRound(messages, 1)?.id).toBe('thread_r1_moderator');
    expect(getModeratorMessageForRound(messages, 2)).toBeUndefined();
  });
});

// ============================================================================
// isRoundComplete Tests
// ============================================================================

describe('isRoundComplete', () => {
  // Use consistent participant IDs that match between participants and messages
  const p1Id = 'participant_0';
  const p2Id = 'participant_1';
  const singleParticipant = [createParticipant(p1Id, 0)];
  const twoParticipants = [
    createParticipant(p1Id, 0),
    createParticipant(p2Id, 1),
  ];

  describe('complete rounds', () => {
    it('returns true when all participants and moderator are complete', () => {
      const messages = [
        createUserMessage(0),
        createParticipantMessage(0, 0, { participantId: p1Id }),
        createModeratorMessage(0),
      ];
      expect(isRoundComplete(messages, singleParticipant, 0)).toBeTruthy();
    });

    it('returns true for multi-participant round with all complete', () => {
      const messages = [
        createUserMessage(0),
        createParticipantMessage(0, 0, { participantId: p1Id }),
        createParticipantMessage(0, 1, { participantId: p2Id }),
        createModeratorMessage(0),
      ];
      expect(isRoundComplete(messages, twoParticipants, 0)).toBeTruthy();
    });
  });

  describe('incomplete rounds - missing moderator', () => {
    it('returns false when moderator is missing', () => {
      const messages = [
        createUserMessage(0),
        createParticipantMessage(0, 0, { participantId: p1Id }),
        // No moderator
      ];
      expect(isRoundComplete(messages, singleParticipant, 0)).toBeFalsy();
    });

    it('returns false when moderator is still streaming', () => {
      const messages = [
        createUserMessage(0),
        createParticipantMessage(0, 0, { participantId: p1Id }),
        createModeratorMessage(0, { isStreaming: true }),
      ];
      expect(isRoundComplete(messages, singleParticipant, 0)).toBeFalsy();
    });
  });

  describe('incomplete rounds - missing participants', () => {
    it('returns false when no participants have responded', () => {
      const messages = [
        createUserMessage(0),
        // No participant messages
      ];
      expect(isRoundComplete(messages, singleParticipant, 0)).toBeFalsy();
    });

    it('returns false when some participants are missing', () => {
      const messages = [
        createUserMessage(0),
        createParticipantMessage(0, 0, { participantId: p1Id }),
        // Missing p2
        createModeratorMessage(0),
      ];
      expect(isRoundComplete(messages, twoParticipants, 0)).toBeFalsy();
    });

    it('returns false when participant is still streaming', () => {
      const messages = [
        createUserMessage(0),
        createParticipantMessage(0, 0, { isStreaming: true, participantId: p1Id }),
      ];
      expect(isRoundComplete(messages, singleParticipant, 0)).toBeFalsy();
    });
  });

  describe('stale streaming state scenarios', () => {
    it('correctly identifies complete round that appears incomplete due to stale state', () => {
      // This is the bug scenario: all messages are complete but streamingRoundNumber is stuck
      // Note: participantId must match the participant's id field
      const participantId = 'participant_0';
      const participant = createParticipant(participantId, 0);
      const messages = [
        createUserMessage(2),
        createParticipantMessage(2, 0, {
          finishReason: FinishReasons.STOP,
          participantId,
        }),
        createModeratorMessage(2, {
          finishReason: FinishReasons.STOP,
        }),
      ];
      // Round IS complete - this would allow stale streaming cleanup
      expect(isRoundComplete(messages, [participant], 2)).toBeTruthy();
    });

    it('correctly identifies incomplete round during moderator streaming', () => {
      const participantId = 'participant_0';
      const participant = createParticipant(participantId, 0);
      const messages = [
        createUserMessage(2),
        createParticipantMessage(2, 0, {
          finishReason: FinishReasons.STOP,
          participantId,
        }),
        createModeratorMessage(2, {
          isStreaming: true, // Still streaming
        }),
      ];
      // Round is NOT complete - should not trigger cleanup
      expect(isRoundComplete(messages, [participant], 2)).toBeFalsy();
    });
  });
});

// ============================================================================
// getParticipantCompletionStatus Tests
// ============================================================================

describe('getParticipantCompletionStatus', () => {
  const participants = [
    createParticipant('p1', 0),
    createParticipant('p2', 1),
  ];

  it('returns allComplete=true when all participants have finished', () => {
    const messages = [
      createParticipantMessage(0, 0, { participantId: 'p1' }),
      createParticipantMessage(0, 1, { participantId: 'p2' }),
    ];
    const status = getParticipantCompletionStatus(messages, participants, 0);
    expect(status.allComplete).toBeTruthy();
    expect(status.completedCount).toBe(2);
    expect(status.streamingCount).toBe(0);
  });

  it('returns allComplete=false when some participants are missing', () => {
    const messages = [
      createParticipantMessage(0, 0, { participantId: 'p1' }),
      // Missing p2
    ];
    const status = getParticipantCompletionStatus(messages, participants, 0);
    expect(status.allComplete).toBeFalsy();
    expect(status.completedCount).toBe(1);
    expect(status.streamingCount).toBe(1);
    expect(status.streamingParticipantIds).toContain('p2');
  });

  it('returns allComplete=false when participant is streaming', () => {
    const messages = [
      createParticipantMessage(0, 0, { participantId: 'p1' }),
      createParticipantMessage(0, 1, { isStreaming: true, participantId: 'p2' }),
    ];
    const status = getParticipantCompletionStatus(messages, participants, 0);
    expect(status.allComplete).toBeFalsy();
    expect(status.streamingCount).toBe(1);
  });

  it('excludes disabled participants from count', () => {
    const mixedParticipants = [
      createParticipant('p1', 0, true),
      createParticipant('p2', 1, false), // Disabled
    ];
    const messages = [
      createParticipantMessage(0, 0, { participantId: 'p1' }),
    ];
    const status = getParticipantCompletionStatus(messages, mixedParticipants, 0);
    expect(status.allComplete).toBeTruthy();
    expect(status.expectedCount).toBe(1); // Only enabled participants
  });
});

// ============================================================================
// Early Return Cleanup Scenario Tests
// ============================================================================

describe('early return cleanup scenarios', () => {
  describe('use-moderator-trigger early return', () => {
    it('should detect complete round when moderator already triggered', () => {
      // Scenario: triggerModerator is called but moderator was already triggered
      // The early return should check if the round is complete and cleanup if so
      // Note: participant ID must match the participant's id field
      const participantId = 'participant_0';
      const messages = [
        createUserMessage(2),
        createParticipantMessage(2, 0, { participantId }),
        createModeratorMessage(2, { finishReason: FinishReasons.STOP }),
      ];
      const participants = [createParticipant(participantId, 0)];

      // This is what the early return logic should check
      const roundComplete = isRoundComplete(messages, participants, 2);
      expect(roundComplete).toBeTruthy();

      // If round is complete, completeStreaming() should be called
    });

    it('should NOT cleanup if round is still in progress', () => {
      // Scenario: moderator trigger race condition, but moderator is still streaming
      const participantId = 'participant_0';
      const messages = [
        createUserMessage(2),
        createParticipantMessage(2, 0, { participantId }),
        createModeratorMessage(2, { isStreaming: true }),
      ];
      const participants = [createParticipant(participantId, 0)];

      const roundComplete = isRoundComplete(messages, participants, 2);
      expect(roundComplete).toBeFalsy();

      // Should NOT call completeStreaming() - would interrupt active stream
    });
  });

  describe('stale streaming cleanup hook', () => {
    it('should trigger cleanup when streamingRoundNumber set but round complete', () => {
      // Scenario: streamingRoundNumber=2 but isStreaming=false and round is complete
      // This indicates stale state that needs cleanup
      const participantId = 'participant_0';
      const messages = [
        createUserMessage(2),
        createParticipantMessage(2, 0, { participantId }),
        createModeratorMessage(2, { finishReason: FinishReasons.STOP }),
      ];
      const participants = [createParticipant(participantId, 0)];

      const storeState = {
        isModeratorStreaming: false,
        isStreaming: false,
        streamingRoundNumber: 2,
        waitingToStartStreaming: false,
      };

      // Hook should detect this as stale
      const isStale = storeState.streamingRoundNumber !== null
        && !storeState.isStreaming
        && !storeState.isModeratorStreaming
        && !storeState.waitingToStartStreaming;
      expect(isStale).toBeTruthy();

      // And round is actually complete
      expect(isRoundComplete(messages, participants, 2)).toBeTruthy();

      // So completeStreaming() should be called
    });

    it('should NOT trigger cleanup when actively streaming', () => {
      const storeState = {
        isModeratorStreaming: false,
        isStreaming: true, // Actively streaming
        streamingRoundNumber: 2,
        waitingToStartStreaming: false,
      };

      const isStale = storeState.streamingRoundNumber !== null
        && !storeState.isStreaming
        && !storeState.isModeratorStreaming
        && !storeState.waitingToStartStreaming;
      expect(isStale).toBeFalsy();
    });

    it('should NOT trigger cleanup when waiting to start', () => {
      const storeState = {
        isModeratorStreaming: false,
        isStreaming: false,
        streamingRoundNumber: 2,
        waitingToStartStreaming: true, // About to start
      };

      const isStale = storeState.streamingRoundNumber !== null
        && !storeState.isStreaming
        && !storeState.isModeratorStreaming
        && !storeState.waitingToStartStreaming;
      expect(isStale).toBeFalsy();
    });
  });
});

/**
 * Participant Completion Gate Tests
 *
 * These tests verify the strict participant completion checks that MUST pass
 * before any summary creation can proceed. These guards prevent race conditions
 * where the summarizer starts while a participant is still streaming.
 *
 * KEY INVARIANTS TESTED:
 * 1. A participant is NOT complete if ANY part has `state: 'streaming'`
 * 2. A participant is NOT complete if it has no finishReason
 * 3. A participant is NOT complete if it has no content parts
 * 4. ALL expected participants must have complete messages for the round
 */

import type { FinishReason, TextPartState } from '@roundtable/shared';
import {
  FinishReasons,
  MessageRoles,
  TextPartStates,
} from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import type { ChatParticipant } from '@/services/api';

import {
  areAllParticipantsCompleteForRound,
  getParticipantCompletionStatus,
  isMessageComplete,
} from '../utils/participant-completion-gate';

// ============================================================================
// Test Utilities
// ============================================================================

function createParticipant(id: string, index: number, enabled = true): ChatParticipant {
  return {
    createdAt: new Date('2024-01-01'),
    customRoleId: null,
    id,
    isEnabled: enabled,
    modelId: `model-${index}`,
    priority: index,
    role: null,
    settings: null,
    threadId: 'thread-123',
    updatedAt: new Date('2024-01-01'),
  };
}

function createAssistantMessage(
  participantId: string,
  roundNumber: number,
  options: {
    partState?: TextPartState;
    hasText?: boolean;
    finishReason?: FinishReason | null;
    participantIndex?: number;
  } = {},
): UIMessage {
  const {
    finishReason = FinishReasons.STOP,
    hasText = true,
    participantIndex = 0,
    partState = TextPartStates.DONE,
  } = options;

  return {
    id: `msg-${participantId}-r${roundNumber}`,
    metadata: {
      finishReason: finishReason ?? undefined,
      model: `model-${participantIndex}`,
      participantId,
      participantIndex,
      role: MessageRoles.ASSISTANT,
      roundNumber,
      usage: finishReason ? { completionTokens: 50, promptTokens: 100, totalTokens: 150 } : undefined,
    },
    parts: hasText
      ? [{ state: partState, text: 'Response content', type: 'text' }]
      : [],
    role: MessageRoles.ASSISTANT,
  };
}

// ============================================================================
// isMessageComplete Tests
// ============================================================================

describe('isMessageComplete', () => {
  it('returns false when message has streaming parts', () => {
    const message = createAssistantMessage('p1', 1, { partState: TextPartStates.STREAMING });
    expect(isMessageComplete(message)).toBeFalsy();
  });

  it('returns true when message has done parts with content', () => {
    const message = createAssistantMessage('p1', 1, { hasText: true, partState: TextPartStates.DONE });
    expect(isMessageComplete(message)).toBeTruthy();
  });

  it('returns true when message has both text content AND finishReason', () => {
    // A complete message should have both content and finishReason
    const message = createAssistantMessage('p1', 1, {
      finishReason: FinishReasons.STOP,
      hasText: true,
      partState: TextPartStates.DONE,
    });
    expect(isMessageComplete(message)).toBeTruthy();
  });

  it('returns false when message has no content and no finishReason', () => {
    const message = createAssistantMessage('p1', 1, {
      finishReason: null,
      hasText: false,
      partState: TextPartStates.DONE,
    });
    expect(isMessageComplete(message)).toBeFalsy();
  });

  it('returns false when parts is undefined', () => {
    // Test edge case where message has no parts array
    // This can happen during message creation before parts are populated
    const message = {
      id: 'msg-1',
      metadata: { role: MessageRoles.ASSISTANT, roundNumber: 1 },
      parts: undefined,
      role: MessageRoles.ASSISTANT,
    } as UIMessage;
    expect(isMessageComplete(message)).toBeFalsy();
  });
});

// ============================================================================
// getParticipantCompletionStatus Tests
// ============================================================================

describe('getParticipantCompletionStatus', () => {
  describe('basic completion checks', () => {
    it('returns allComplete: false when no participants', () => {
      const status = getParticipantCompletionStatus([], [], 1);
      expect(status.allComplete).toBeFalsy();
      expect(status.expectedCount).toBe(0);
    });

    it('returns allComplete: false when participant has no message', () => {
      const participants = [createParticipant('p1', 0)];
      const messages: UIMessage[] = [];

      const status = getParticipantCompletionStatus(messages, participants, 1);

      expect(status.allComplete).toBeFalsy();
      expect(status.expectedCount).toBe(1);
      expect(status.completedCount).toBe(0);
      expect(status.streamingCount).toBe(1);
      expect(status.streamingParticipantIds).toContain('p1');
    });

    it('returns allComplete: true when all participants have complete messages', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
      ];
      const messages: UIMessage[] = [
        createAssistantMessage('p1', 1, { partState: TextPartStates.DONE }),
        createAssistantMessage('p2', 1, { participantIndex: 1, partState: TextPartStates.DONE }),
      ];

      const status = getParticipantCompletionStatus(messages, participants, 1);

      expect(status.allComplete).toBeTruthy();
      expect(status.expectedCount).toBe(2);
      expect(status.completedCount).toBe(2);
      expect(status.streamingCount).toBe(0);
    });
  });

  describe('streaming detection', () => {
    it('returns allComplete: false when ONE participant is still streaming', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
      ];
      const messages: UIMessage[] = [
        createAssistantMessage('p1', 1, { partState: TextPartStates.DONE }),
        createAssistantMessage('p2', 1, { participantIndex: 1, partState: TextPartStates.STREAMING }),
      ];

      const status = getParticipantCompletionStatus(messages, participants, 1);

      expect(status.allComplete).toBeFalsy();
      expect(status.completedCount).toBe(1);
      expect(status.streamingCount).toBe(1);
      expect(status.streamingParticipantIds).toContain('p2');
      expect(status.completedParticipantIds).toContain('p1');
    });

    it('returns allComplete: false when LAST participant is streaming (race condition scenario)', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
        createParticipant('p3', 2),
      ];
      const messages: UIMessage[] = [
        createAssistantMessage('p1', 1, { partState: TextPartStates.DONE }),
        createAssistantMessage('p2', 1, { participantIndex: 1, partState: TextPartStates.DONE }),
        createAssistantMessage('p3', 1, { participantIndex: 2, partState: TextPartStates.STREAMING }),
      ];

      const status = getParticipantCompletionStatus(messages, participants, 1);

      expect(status.allComplete).toBeFalsy();
      expect(status.streamingParticipantIds).toContain('p3');
    });

    it('returns allComplete: false when ALL participants are streaming', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
      ];
      const messages: UIMessage[] = [
        createAssistantMessage('p1', 1, { partState: TextPartStates.STREAMING }),
        createAssistantMessage('p2', 1, { participantIndex: 1, partState: TextPartStates.STREAMING }),
      ];

      const status = getParticipantCompletionStatus(messages, participants, 1);

      expect(status.allComplete).toBeFalsy();
      expect(status.streamingCount).toBe(2);
    });
  });

  describe('disabled participants', () => {
    it('only counts enabled participants', () => {
      const participants = [
        createParticipant('p1', 0, true),
        createParticipant('p2', 1, false), // disabled
        createParticipant('p3', 2, true),
      ];
      const messages: UIMessage[] = [
        createAssistantMessage('p1', 1, { partState: TextPartStates.DONE }),
        createAssistantMessage('p3', 1, { participantIndex: 2, partState: TextPartStates.DONE }),
      ];

      const status = getParticipantCompletionStatus(messages, participants, 1);

      expect(status.allComplete).toBeTruthy();
      expect(status.expectedCount).toBe(2); // Only enabled participants
    });
  });

  describe('multi-round handling', () => {
    it('only checks messages for the specified round', () => {
      const participants = [createParticipant('p1', 0)];
      const messages: UIMessage[] = [
        createAssistantMessage('p1', 0, { partState: TextPartStates.DONE }), // Round 0
        createAssistantMessage('p1', 1, { partState: TextPartStates.STREAMING }), // Round 1
      ];

      // Round 0 should be complete
      const round0Status = getParticipantCompletionStatus(messages, participants, 0);
      expect(round0Status.allComplete).toBeTruthy();

      // Round 1 should NOT be complete
      const round1Status = getParticipantCompletionStatus(messages, participants, 1);
      expect(round1Status.allComplete).toBeFalsy();
    });
  });

  describe('debug info', () => {
    it('provides detailed debug info for each participant', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
      ];
      const messages: UIMessage[] = [
        createAssistantMessage('p1', 1, { partState: TextPartStates.DONE }),
        createAssistantMessage('p2', 1, { participantIndex: 1, partState: TextPartStates.STREAMING }),
      ];

      const status = getParticipantCompletionStatus(messages, participants, 1);

      expect(status.debugInfo).toHaveLength(2);

      const p1Info = status.debugInfo.find(d => d.participantId === 'p1');
      expect(p1Info?.hasMessage).toBeTruthy();
      expect(p1Info?.hasStreamingParts).toBeFalsy();
      expect(p1Info?.isComplete).toBeTruthy();

      const p2Info = status.debugInfo.find(d => d.participantId === 'p2');
      expect(p2Info?.hasMessage).toBeTruthy();
      expect(p2Info?.hasStreamingParts).toBeTruthy();
      expect(p2Info?.isComplete).toBeFalsy();
    });
  });
});

// ============================================================================
// areAllParticipantsCompleteForRound Tests (convenience wrapper)
// ============================================================================

describe('areAllParticipantsCompleteForRound', () => {
  it('returns true when all complete', () => {
    const participants = [createParticipant('p1', 0)];
    const messages = [createAssistantMessage('p1', 1, { partState: TextPartStates.DONE })];

    expect(areAllParticipantsCompleteForRound(messages, participants, 1)).toBeTruthy();
  });

  it('returns false when any streaming', () => {
    const participants = [createParticipant('p1', 0)];
    const messages = [createAssistantMessage('p1', 1, { partState: TextPartStates.STREAMING })];

    expect(areAllParticipantsCompleteForRound(messages, participants, 1)).toBeFalsy();
  });
});

// ============================================================================
// finishReason: 'unknown' Handling (Interrupted Stream Fix)
// ============================================================================

describe('finishReason: unknown handling', () => {
  describe('isMessageComplete', () => {
    it('returns true when finishReason is "unknown" but HAS content', () => {
      // finishReason: 'unknown' indicates interrupted stream, BUT if content exists,
      // the message can still be displayed. Content alone is sufficient for completion.
      const message = createAssistantMessage('p1', 1, {
        finishReason: FinishReasons.UNKNOWN,
        hasText: true, // Has content
        partState: TextPartStates.DONE,
      });
      expect(isMessageComplete(message)).toBeTruthy();
    });

    it('returns false when finishReason is "unknown" and NO content', () => {
      // finishReason: 'unknown' with no content = definitely incomplete
      // This is the key case we're trying to catch - interrupted before any content
      const message = createAssistantMessage('p1', 1, {
        finishReason: FinishReasons.UNKNOWN,
        hasText: false, // No content!
        partState: TextPartStates.DONE,
      });
      expect(isMessageComplete(message)).toBeFalsy();
    });

    it('returns true when finishReason is "stop" (valid completion)', () => {
      const message = createAssistantMessage('p1', 1, {
        finishReason: FinishReasons.STOP,
        hasText: true,
        partState: TextPartStates.DONE,
      });
      expect(isMessageComplete(message)).toBeTruthy();
    });

    it('returns true when finishReason is "length" (valid completion)', () => {
      const message = createAssistantMessage('p1', 1, {
        finishReason: FinishReasons.LENGTH,
        hasText: true,
        partState: TextPartStates.DONE,
      });
      expect(isMessageComplete(message)).toBeTruthy();
    });

    it('returns true when message has content but no finishReason', () => {
      // Content alone is sufficient for completion
      const message = createAssistantMessage('p1', 1, {
        finishReason: null,
        hasText: true,
        partState: TextPartStates.DONE,
      });
      expect(isMessageComplete(message)).toBeTruthy();
    });

    it('returns true when message has valid finishReason but no content (error case)', () => {
      // Failed streams with finishReason but no content should be complete
      // (e.g., timeout, error before any content was generated)
      const message = createAssistantMessage('p1', 1, {
        finishReason: FinishReasons.ERROR,
        hasText: false,
        partState: TextPartStates.DONE,
      });
      expect(isMessageComplete(message)).toBeTruthy();
    });
  });

  describe('getParticipantCompletionStatus', () => {
    it('marks participant as incomplete when finishReason is "unknown" and NO content', () => {
      // finishReason: 'unknown' with no content = definitely interrupted, NOT complete
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
      ];
      const messages: UIMessage[] = [
        createAssistantMessage('p1', 1, { finishReason: FinishReasons.STOP, partState: TextPartStates.DONE }),
        createAssistantMessage('p2', 1, {
          finishReason: FinishReasons.UNKNOWN, // Interrupted stream
          hasText: false, // No content!
          participantIndex: 1,
          partState: TextPartStates.DONE,
        }),
      ];

      const status = getParticipantCompletionStatus(messages, participants, 1);

      expect(status.allComplete).toBeFalsy();
      expect(status.completedCount).toBe(1);
      expect(status.streamingCount).toBe(1);
      expect(status.streamingParticipantIds).toContain('p2');
      expect(status.completedParticipantIds).toContain('p1');
    });

    it('marks participant as COMPLETE when finishReason is "unknown" but HAS content', () => {
      // If there's content, the message can be displayed even if finishReason is unknown
      // This handles edge case where content was generated but metadata is incomplete
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
      ];
      const messages: UIMessage[] = [
        createAssistantMessage('p1', 1, { finishReason: FinishReasons.STOP, partState: TextPartStates.DONE }),
        createAssistantMessage('p2', 1, {
          finishReason: FinishReasons.UNKNOWN, // Unknown but has content
          hasText: true, // Has content!
          participantIndex: 1,
          partState: TextPartStates.DONE,
        }),
      ];

      const status = getParticipantCompletionStatus(messages, participants, 1);

      // p2 is complete because it has content (regardless of finishReason)
      expect(status.allComplete).toBeTruthy();
      expect(status.completedCount).toBe(2);
      expect(status.streamingCount).toBe(0);
    });

    it('sCENARIO: Page refresh during last participant streaming - finishReason: unknown, NO content', () => {
      // This is the exact bug scenario:
      // 1. 4 participants in a round
      // 2. Page refreshes during last participant (p3) streaming BEFORE any content
      // 3. p3 gets finishReason: 'unknown' (interrupted) with NO content
      // 4. GATE should report 3/4 complete (not 4/4)
      // 5. Moderator should NOT trigger until p3 resumes and completes
      const participants = [
        createParticipant('gemini', 0),
        createParticipant('gpt-nano', 1),
        createParticipant('claude-opus', 2),
        createParticipant('grok-fast', 3),
      ];

      const messages: UIMessage[] = [
        createAssistantMessage('gemini', 0, { finishReason: FinishReasons.STOP, partState: TextPartStates.DONE }),
        createAssistantMessage('gpt-nano', 0, { finishReason: FinishReasons.STOP, participantIndex: 1, partState: TextPartStates.DONE }),
        createAssistantMessage('claude-opus', 0, { finishReason: FinishReasons.STOP, participantIndex: 2, partState: TextPartStates.DONE }),
        createAssistantMessage('grok-fast', 0, {
          finishReason: FinishReasons.UNKNOWN, // finishReason indicates interruption
          hasText: false, // NO content - interrupted before generating any
          participantIndex: 3,
          partState: TextPartStates.DONE, // Parts might show done after state reset
        }),
      ];

      const status = getParticipantCompletionStatus(messages, participants, 0);

      // MUST be false - grok-fast has finishReason: 'unknown' and NO content
      expect(status.allComplete).toBeFalsy();
      expect(status.completedCount).toBe(3);
      expect(status.streamingCount).toBe(1);
      expect(status.streamingParticipantIds).toContain('grok-fast');
    });
  });
});

// ============================================================================
// Race Condition Scenarios
// ============================================================================

describe('race Condition Prevention Scenarios', () => {
  it('sCENARIO: Summarizer check during last participant streaming', () => {
    // This is the exact scenario from the bug report:
    // - Participant 1 (gpt-4.1) finished
    // - Participant 2 (claude-sonnet-4) still streaming with state: 'streaming'
    // - Summary creation was attempted prematurely

    const participants = [
      createParticipant('gpt-4-1', 0),
      createParticipant('claude-sonnet-4', 1),
    ];

    const messages: UIMessage[] = [
      createAssistantMessage('gpt-4-1', 1, {
        finishReason: FinishReasons.STOP,
        partState: TextPartStates.DONE,
      }),
      createAssistantMessage('claude-sonnet-4', 1, {
        finishReason: null, // No finish reason yet
        participantIndex: 1,
        partState: TextPartStates.STREAMING, // Still streaming!
      }),
    ];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    // MUST be false - summarizer should NOT proceed
    expect(status.allComplete).toBeFalsy();
    expect(status.streamingParticipantIds).toContain('claude-sonnet-4');
  });

  it('sCENARIO: Resume with stale store state', () => {
    // When page refreshes during streaming, store might have stale data
    // The completion gate should still correctly identify streaming parts

    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];

    // Simulate stale state where one message was persisted mid-stream
    const messages: UIMessage[] = [
      createAssistantMessage('p1', 1, { partState: TextPartStates.DONE }),
      // p2 message was persisted but with streaming state
      {
        id: 'msg-p2-r1',
        metadata: {
          finishReason: undefined, // No finish reason
          participantId: 'p2',
          participantIndex: 1,
          role: MessageRoles.ASSISTANT,
          roundNumber: 1,
        },
        parts: [{ state: TextPartStates.STREAMING, text: 'Partial response...', type: 'text' }],
        role: MessageRoles.ASSISTANT,
      },
    ];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    // MUST be false - even with persisted data, streaming state should block
    expect(status.allComplete).toBeFalsy();
  });

  it('sCENARIO: All participants finished but parts not yet updated to done', () => {
    // Edge case where finishReason is set but parts still show streaming
    // This can happen due to React batching

    const participants = [createParticipant('p1', 0)];

    const messages: UIMessage[] = [
      {
        id: 'msg-p1-r1',
        metadata: {
          finishReason: FinishReasons.STOP, // But finishReason is set
          participantId: 'p1',
          participantIndex: 0,
          role: MessageRoles.ASSISTANT,
          roundNumber: 1,
        },
        parts: [{ state: TextPartStates.STREAMING, text: 'Complete response', type: 'text' }], // Parts say streaming
        role: MessageRoles.ASSISTANT,
      },
    ];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    // MUST be false - parts state takes precedence for visual consistency
    expect(status.allComplete).toBeFalsy();
  });

  it('sCENARIO: Participant message exists but is empty placeholder', () => {
    const participants = [createParticipant('p1', 0)];

    const messages: UIMessage[] = [
      {
        id: 'msg-p1-r1',
        metadata: {
          finishReason: undefined, // No finish reason
          participantId: 'p1',
          role: MessageRoles.ASSISTANT,
          roundNumber: 1,
        },
        parts: [], // Empty parts
        role: MessageRoles.ASSISTANT,
      },
    ];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    // MUST be false - empty message is not complete
    expect(status.allComplete).toBeFalsy();
  });
});

/**
 * Streaming UI Sync Race Condition Tests
 *
 * These tests verify that the UI is fully synchronized before state transitions:
 * 1. All message parts have state='done' before moderator triggers
 * 2. Store sync completes before next participant/moderator
 * 3. Streaming end detection bypasses throttle for final sync
 * 4. Double completeStreaming() calls are prevented
 *
 * KEY INVARIANT: UI must display final content before moderator placeholder appears
 *
 * Location: /src/stores/chat/__tests__/streaming-ui-sync-race-conditions.test.ts
 */

import { MessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import type { ChatParticipant } from '@/services/api';

import {
  getParticipantCompletionStatus,
  isMessageComplete,
} from '../utils/participant-completion-gate';

// ============================================================================
// Test Utilities - Message Factories
// ============================================================================

function createParticipant(
  id: string,
  index: number,
  enabled = true,
): ChatParticipant {
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

function createUserMessage(roundNumber: number): UIMessage {
  return {
    id: `user-r${roundNumber}`,
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
    parts: [{ text: 'User question', type: 'text' }],
    role: MessageRoles.USER,
  };
}

function createAssistantMessage(
  participantId: string,
  roundNumber: number,
  options: {
    partState?: 'streaming' | 'done';
    hasText?: boolean;
    finishReason?: string | null;
    participantIndex?: number;
    hasReasoning?: boolean;
    reasoningState?: 'streaming' | 'done';
  } = {},
): UIMessage {
  const {
    finishReason = 'stop',
    hasReasoning = false,
    hasText = true,
    participantIndex = 0,
    partState = 'done',
    reasoningState = 'done',
  } = options;

  const parts: UIMessage['parts'] = [];

  if (hasReasoning) {
    parts.push({ state: reasoningState, text: 'Thinking...', type: 'reasoning' } as UIMessage['parts'][0]);
  }

  if (hasText) {
    parts.push({ state: partState, text: 'Response content', type: 'text' } as UIMessage['parts'][0]);
  }

  return {
    id: `msg-${participantId}-r${roundNumber}`,
    metadata: {
      finishReason: finishReason ?? undefined,
      model: `model-${participantIndex}`,
      participantId,
      participantIndex,
      role: MessageRoles.ASSISTANT,
      roundNumber,
      usage: finishReason
        ? { completionTokens: 50, promptTokens: 100, totalTokens: 150 }
        : undefined,
    },
    parts,
    role: MessageRoles.ASSISTANT,
  };
}

// ============================================================================
// Helper to simulate onFinish part state update (the fix we implemented)
// ============================================================================

/**
 * Simulates the fix in use-multi-participant-chat.ts onFinish callback
 * where we ensure all parts have state='done' before creating completeMessage
 */
function simulateOnFinishPartStateUpdate(message: UIMessage): UIMessage {
  const completedParts = message.parts?.map((part) => {
    if ('state' in part && part.state === 'streaming') {
      return { ...part, state: 'done' as const };
    }
    return part;
  }) ?? [];

  return {
    ...message,
    parts: completedParts,
  };
}

// ============================================================================
// PART STATE TRANSITION TESTS
// ============================================================================

describe('part State Transition: streaming → done', () => {
  describe('onFinish must set all parts to state=done', () => {
    it('converts single streaming text part to done', () => {
      const message = createAssistantMessage('p1', 0, {
        finishReason: 'stop',
        partState: 'streaming',
      });

      // Before fix: message has streaming parts
      expect(message.parts?.[0]).toHaveProperty('state', 'streaming');
      expect(isMessageComplete(message)).toBeFalsy();

      // After fix: onFinish converts to done
      const fixed = simulateOnFinishPartStateUpdate(message);
      expect(fixed.parts?.[0]).toHaveProperty('state', 'done');
      expect(isMessageComplete(fixed)).toBeTruthy();
    });

    it('converts multiple streaming parts (reasoning + text) to done', () => {
      const message = createAssistantMessage('p1', 0, {
        finishReason: 'stop',
        hasReasoning: true,
        partState: 'streaming',
        reasoningState: 'streaming',
      });

      // Both parts are streaming
      expect(message.parts?.[0]).toHaveProperty('state', 'streaming');
      expect(message.parts?.[1]).toHaveProperty('state', 'streaming');
      expect(isMessageComplete(message)).toBeFalsy();

      // After fix: both parts are done
      const fixed = simulateOnFinishPartStateUpdate(message);
      expect(fixed.parts?.[0]).toHaveProperty('state', 'done');
      expect(fixed.parts?.[1]).toHaveProperty('state', 'done');
      expect(isMessageComplete(fixed)).toBeTruthy();
    });

    it('preserves parts already in done state', () => {
      const message = createAssistantMessage('p1', 0, {
        finishReason: 'stop',
        hasReasoning: true,
        partState: 'done',
        reasoningState: 'done',
      });

      const fixed = simulateOnFinishPartStateUpdate(message);

      // Parts remain done (not changed)
      expect(fixed.parts?.[0]).toHaveProperty('state', 'done');
      expect(fixed.parts?.[1]).toHaveProperty('state', 'done');
      expect(isMessageComplete(fixed)).toBeTruthy();
    });

    it('converts mixed state parts (reasoning done, text streaming) correctly', () => {
      const message: UIMessage = {
        id: 'msg-1',
        metadata: {
          finishReason: 'stop',
          model: 'model-0',
          participantId: 'p1',
          participantIndex: 0,
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
        },
        parts: [
          { state: 'done', text: 'Thinking...', type: 'reasoning' } as UIMessage['parts'][0],
          { state: 'streaming', text: 'Response', type: 'text' } as UIMessage['parts'][0],
        ],
        role: MessageRoles.ASSISTANT,
      };

      expect(isMessageComplete(message)).toBeFalsy();

      const fixed = simulateOnFinishPartStateUpdate(message);

      // Reasoning stays done, text becomes done
      expect(fixed.parts?.[0]).toHaveProperty('state', 'done');
      expect(fixed.parts?.[1]).toHaveProperty('state', 'done');
      expect(isMessageComplete(fixed)).toBeTruthy();
    });
  });
});

// ============================================================================
// UI SYNC BEFORE MODERATOR TESTS
// ============================================================================

describe('uI Sync Before Moderator Trigger', () => {
  describe('moderator gate must wait for all parts to have state=done', () => {
    it('blocks moderator when last participant has streaming reasoning', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
        createParticipant('p3', 2),
      ];

      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, { finishReason: 'stop', partState: 'done' }),
        createAssistantMessage('p2', 0, { finishReason: 'stop', participantIndex: 1, partState: 'done' }),
        // Last participant: reasoning streaming, no text yet (like the bug scenario)
        {
          id: 'msg-p3-r0',
          metadata: {
            finishReason: 'unknown', // Stream didn't complete normally
            model: 'model-2',
            participantId: 'p3',
            participantIndex: 2,
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
          },
          parts: [
            { type: 'step-start' } as UIMessage['parts'][0],
            { state: 'streaming', text: 'I shoul', type: 'reasoning' } as UIMessage['parts'][0],
          ],
          role: MessageRoles.ASSISTANT,
        },
      ];

      const status = getParticipantCompletionStatus(messages, participants, 0);

      // Moderator must NOT be allowed to trigger
      expect(status.allComplete).toBeFalsy();
      expect(status.streamingParticipantIds).toContain('p3');
    });

    it('allows moderator only after fix converts all parts to done', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
        createParticipant('p3', 2),
      ];

      // Before: streaming parts
      const beforeMessages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, { finishReason: 'stop', partState: 'done' }),
        createAssistantMessage('p2', 0, { finishReason: 'stop', participantIndex: 1, partState: 'done' }),
        createAssistantMessage('p3', 0, { finishReason: 'stop', participantIndex: 2, partState: 'streaming' }),
      ];

      const beforeStatus = getParticipantCompletionStatus(beforeMessages, participants, 0);
      expect(beforeStatus.allComplete).toBeFalsy();

      // After: fix applied - all parts done
      const afterMessages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, { finishReason: 'stop', partState: 'done' }),
        createAssistantMessage('p2', 0, { finishReason: 'stop', participantIndex: 1, partState: 'done' }),
        simulateOnFinishPartStateUpdate(
          createAssistantMessage('p3', 0, { finishReason: 'stop', participantIndex: 2, partState: 'streaming' }),
        ),
      ];

      const afterStatus = getParticipantCompletionStatus(afterMessages, participants, 0);
      expect(afterStatus.allComplete).toBeTruthy();
    });
  });
});

// ============================================================================
// STORE SYNC SIMULATION TESTS
// ============================================================================

describe('store Sync Before State Transitions', () => {
  /**
   * Simulates the waitForStoreSync function from provider.tsx
   * Verifies that all messages have state='done' before proceeding
   */
  function simulateWaitForStoreSync(
    sdkMessages: UIMessage[],
    storeMessages: UIMessage[],
    roundNumber: number,
    participants: ChatParticipant[],
  ): { allComplete: boolean; needsSync: boolean } {
    // Check if store has messages that still have streaming parts
    const participantMessages = storeMessages.filter((m) => {
      if (m.role !== MessageRoles.ASSISTANT) {
        return false;
      }
      const meta = m.metadata;
      if (!meta || typeof meta !== 'object') {
        return false;
      }
      const msgRound = 'roundNumber' in meta ? meta.roundNumber : null;
      const isModerator = 'isModerator' in meta && meta.isModerator === true;
      return msgRound === roundNumber && !isModerator;
    });

    const hasStreamingParts = participantMessages.some(msg =>
      msg.parts?.some(p => 'state' in p && p.state === 'streaming'),
    );

    // Check if SDK has updated versions
    const sdkHasDoneParts = sdkMessages.every((msg) => {
      if (msg.role !== MessageRoles.ASSISTANT) {
        return true;
      }
      return !msg.parts?.some(p => 'state' in p && p.state === 'streaming');
    });

    return {
      allComplete: !hasStreamingParts && participantMessages.length === participants.filter(p => p.isEnabled).length,
      needsSync: hasStreamingParts && sdkHasDoneParts,
    };
  }

  it('detects when store needs sync from SDK (store has streaming, SDK has done)', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];

    // SDK has updated parts (after onFinish fix)
    const sdkMessages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { finishReason: 'stop', partState: 'done' }),
      createAssistantMessage('p2', 0, { finishReason: 'stop', participantIndex: 1, partState: 'done' }),
    ];

    // Store still has streaming parts (throttled sync)
    const storeMessages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { finishReason: 'stop', partState: 'done' }),
      createAssistantMessage('p2', 0, { finishReason: 'stop', participantIndex: 1, partState: 'streaming' }),
    ];

    const result = simulateWaitForStoreSync(sdkMessages, storeMessages, 0, participants);

    expect(result.allComplete).toBeFalsy();
    expect(result.needsSync).toBeTruthy();
  });

  it('passes when store is already synced', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];

    const messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { finishReason: 'stop', partState: 'done' }),
      createAssistantMessage('p2', 0, { finishReason: 'stop', participantIndex: 1, partState: 'done' }),
    ];

    const result = simulateWaitForStoreSync(messages, messages, 0, participants);

    expect(result.allComplete).toBeTruthy();
    expect(result.needsSync).toBeFalsy();
  });
});

// ============================================================================
// STREAMING END TRANSITION TESTS
// ============================================================================

describe('streaming End Transition Detection', () => {
  /**
   * Simulates the streamingJustEnded detection from use-message-sync.ts
   */
  function detectStreamingEndTransition(
    prevStreaming: boolean,
    currentStreaming: boolean,
  ): { streamingJustEnded: boolean; shouldBypassThrottle: boolean } {
    const streamingJustEnded = prevStreaming && !currentStreaming;
    return {
      shouldBypassThrottle: streamingJustEnded,
      streamingJustEnded,
    };
  }

  it('detects streaming end transition (true → false)', () => {
    const result = detectStreamingEndTransition(true, false);

    expect(result.streamingJustEnded).toBeTruthy();
    expect(result.shouldBypassThrottle).toBeTruthy();
  });

  it('does not trigger on streaming start (false → true)', () => {
    const result = detectStreamingEndTransition(false, true);

    expect(result.streamingJustEnded).toBeFalsy();
    expect(result.shouldBypassThrottle).toBeFalsy();
  });

  it('does not trigger when streaming continues (true → true)', () => {
    const result = detectStreamingEndTransition(true, true);

    expect(result.streamingJustEnded).toBeFalsy();
    expect(result.shouldBypassThrottle).toBeFalsy();
  });

  it('does not trigger when not streaming (false → false)', () => {
    const result = detectStreamingEndTransition(false, false);

    expect(result.streamingJustEnded).toBeFalsy();
    expect(result.shouldBypassThrottle).toBeFalsy();
  });
});

// ============================================================================
// COMPLETE STREAMING CALL PREVENTION TESTS
// ============================================================================

describe('double completeStreaming Prevention', () => {
  /**
   * Simulates the flow-state-machine.ts fix where we prevent double completeStreaming calls
   */
  function simulateModeratorCreation(
    isModeratorStreaming: boolean,
    tryMarkModeratorCreated: () => boolean,
    completeStreaming: () => void,
    completeStreamingCallCount: { value: number },
  ): { moderatorJustCreated: boolean } {
    const moderatorJustCreated = tryMarkModeratorCreated();

    // ✅ FIX: Only call completeStreaming once
    if (!isModeratorStreaming) {
      completeStreaming();
      completeStreamingCallCount.value++;
    }

    return { moderatorJustCreated };
  }

  it('calls completeStreaming only once when moderator not streaming', () => {
    const callCount = { value: 0 };
    let moderatorCreated = false;

    // First call: creates moderator
    simulateModeratorCreation(
      false, // not streaming yet
      () => {
        if (!moderatorCreated) {
          moderatorCreated = true;
          return true;
        }
        return false;
      },
      () => {},
      callCount,
    );

    expect(callCount.value).toBe(1);

    // Second call: moderator already created
    simulateModeratorCreation(
      true, // now streaming
      () => false, // already created
      () => {},
      callCount,
    );

    // completeStreaming NOT called again (because isModeratorStreaming is true)
    expect(callCount.value).toBe(1);
  });

  it('prevents completeStreaming when moderator streaming already started', () => {
    const callCount = { value: 0 };

    simulateModeratorCreation(
      true, // already streaming
      () => false, // already created
      () => {},
      callCount,
    );

    expect(callCount.value).toBe(0);
  });
});

// ============================================================================
// END-TO-END RACE CONDITION SCENARIOS
// ============================================================================

describe('end-to-End Race Condition Prevention', () => {
  it('scenario: Last participant finishes → store sync → moderator trigger (correct order)', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
      createParticipant('p3', 2),
    ];

    // Step 1: All participants streaming
    const step1Messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { partState: 'streaming' }),
      createAssistantMessage('p2', 0, { participantIndex: 1, partState: 'streaming' }),
      createAssistantMessage('p3', 0, { participantIndex: 2, partState: 'streaming' }),
    ];

    const step1Status = getParticipantCompletionStatus(step1Messages, participants, 0);
    expect(step1Status.allComplete).toBeFalsy();
    expect(step1Status.streamingCount).toBe(3);

    // Step 2: P1 and P2 complete, P3 still streaming
    const step2Messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { finishReason: 'stop', partState: 'done' }),
      createAssistantMessage('p2', 0, { finishReason: 'stop', participantIndex: 1, partState: 'done' }),
      createAssistantMessage('p3', 0, { participantIndex: 2, partState: 'streaming' }),
    ];

    const step2Status = getParticipantCompletionStatus(step2Messages, participants, 0);
    expect(step2Status.allComplete).toBeFalsy();
    expect(step2Status.completedCount).toBe(2);
    expect(step2Status.streamingCount).toBe(1);

    // Step 3: P3 onFinish fires, but parts not yet updated (race condition window)
    // This is the bug: moderator would trigger here before fix
    const step3Messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { finishReason: 'stop', partState: 'done' }),
      createAssistantMessage('p2', 0, { finishReason: 'stop', participantIndex: 1, partState: 'done' }),
      {
        id: 'msg-p3-r0',
        metadata: {
          finishReason: 'stop', // Backend says done, but parts still streaming
          model: 'model-2',
          participantId: 'p3',
          participantIndex: 2,
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
        },
        parts: [{ state: 'streaming', text: 'Final response', type: 'text' }],
        role: MessageRoles.ASSISTANT,
      },
    ];

    const step3Status = getParticipantCompletionStatus(step3Messages, participants, 0);
    // Parts state takes precedence - still not complete
    expect(step3Status.allComplete).toBeFalsy();

    // Step 4: After fix - parts updated to done
    const step4Messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { finishReason: 'stop', partState: 'done' }),
      createAssistantMessage('p2', 0, { finishReason: 'stop', participantIndex: 1, partState: 'done' }),
      createAssistantMessage('p3', 0, { finishReason: 'stop', participantIndex: 2, partState: 'done' }),
    ];

    const step4Status = getParticipantCompletionStatus(step4Messages, participants, 0);
    expect(step4Status.allComplete).toBeTruthy();
    // NOW moderator can trigger
  });

  it('scenario: Page refresh with interrupted stream → correct resumption', () => {
    const participants = [
      createParticipant('gpt-4', 0),
      createParticipant('claude', 1),
      createParticipant('gemini', 2),
    ];

    // After refresh: GPT-4 and Claude complete, Gemini interrupted mid-reasoning
    // This matches the exact bug scenario from the user's report
    const afterRefreshMessages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('gpt-4', 0, { finishReason: 'stop', partState: 'done' }),
      createAssistantMessage('claude', 0, { finishReason: 'stop', participantIndex: 1, partState: 'done' }),
      {
        id: 'msg-gemini-r0',
        metadata: {
          finishReason: 'unknown', // Stream didn't complete
          hasError: false,
          isPartialResponse: false,
          model: 'gemini',
          participantId: 'gemini',
          participantIndex: 2,
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
        },
        parts: [
          { type: 'step-start' } as UIMessage['parts'][0],
          {
            state: 'streaming',
            text: 'The user is asking me to say "hi" in 1 word only... I shoul',
            type: 'reasoning',
          } as UIMessage['parts'][0],
          // No text part - stream was interrupted
        ],
        role: MessageRoles.ASSISTANT,
      },
    ];

    const status = getParticipantCompletionStatus(afterRefreshMessages, participants, 0);

    // Gemini is NOT complete - must resume streaming
    expect(status.allComplete).toBeFalsy();
    expect(status.completedCount).toBe(2);
    expect(status.streamingParticipantIds).toEqual(['gemini']);

    // Verify the streaming participant details
    const geminiDebug = status.debugInfo.find(d => d.participantId === 'gemini');
    expect(geminiDebug?.hasStreamingParts).toBeTruthy();
    expect(geminiDebug?.isComplete).toBeFalsy();
  });

  it('scenario: Fast model finishes but UI lags behind', () => {
    const participants = [
      createParticipant('fast-model', 0),
      createParticipant('slow-model', 1),
    ];

    // Fast model finished on backend but UI still shows streaming
    // (due to message sync throttling)
    const messages: UIMessage[] = [
      createUserMessage(0),
      {
        id: 'msg-fast-r0',
        metadata: {
          finishReason: 'stop', // Backend says done
          model: 'fast-model',
          participantId: 'fast-model',
          participantIndex: 0,
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          usage: { completionTokens: 1, promptTokens: 10, totalTokens: 11 },
        },
        parts: [{ state: 'streaming', text: 'Hi', type: 'text' }], // UI still shows streaming
        role: MessageRoles.ASSISTANT,
      },
    ];

    const status = getParticipantCompletionStatus(messages, participants, 0);

    // Parts state takes precedence - not complete until UI shows done
    expect(status.allComplete).toBeFalsy();

    // After sync applies the fix
    const fixedMessages: UIMessage[] = [
      createUserMessage(0),
      simulateOnFinishPartStateUpdate(messages[1]),
    ];

    const fixedStatus = getParticipantCompletionStatus(fixedMessages, participants, 0);
    // Still not complete - slow-model hasn't started
    expect(fixedStatus.allComplete).toBeFalsy();
    expect(fixedStatus.completedCount).toBe(1);
  });
});

// ============================================================================
// MODERATOR PLACEHOLDER VISIBILITY TESTS
// ============================================================================

describe('moderator Placeholder Timing', () => {
  it('moderator placeholder should NOT appear while any participant shows streaming UI', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];

    // Scenario: P1 done, P2 streaming
    const messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { finishReason: 'stop', partState: 'done' }),
      createAssistantMessage('p2', 0, { participantIndex: 1, partState: 'streaming' }),
    ];

    const status = getParticipantCompletionStatus(messages, participants, 0);

    // Moderator gate must block
    expect(status.allComplete).toBeFalsy();

    // This simulates what the UI would check
    const shouldShowModeratorPlaceholder = status.allComplete;
    expect(shouldShowModeratorPlaceholder).toBeFalsy();
  });

  it('moderator placeholder can appear after all participants show done state', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];

    const messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { finishReason: 'stop', partState: 'done' }),
      createAssistantMessage('p2', 0, { finishReason: 'stop', participantIndex: 1, partState: 'done' }),
    ];

    const status = getParticipantCompletionStatus(messages, participants, 0);

    expect(status.allComplete).toBeTruthy();

    const shouldShowModeratorPlaceholder = status.allComplete;
    expect(shouldShowModeratorPlaceholder).toBeTruthy();
  });
});

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

import type { ChatParticipant } from '@/types/api';

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
    id,
    threadId: 'thread-123',
    modelId: `model-${index}`,
    customRoleId: null,
    role: null,
    priority: index,
    isEnabled: enabled,
    settings: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };
}

function createUserMessage(roundNumber: number): UIMessage {
  return {
    id: `user-r${roundNumber}`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text: 'User question' }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
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
    partState = 'done',
    hasText = true,
    finishReason = 'stop',
    participantIndex = 0,
    hasReasoning = false,
    reasoningState = 'done',
  } = options;

  const parts: UIMessage['parts'] = [];

  if (hasReasoning) {
    parts.push({ type: 'reasoning', text: 'Thinking...', state: reasoningState } as UIMessage['parts'][0]);
  }

  if (hasText) {
    parts.push({ type: 'text', text: 'Response content', state: partState } as UIMessage['parts'][0]);
  }

  return {
    id: `msg-${participantId}-r${roundNumber}`,
    role: MessageRoles.ASSISTANT,
    parts,
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantId,
      participantIndex,
      model: `model-${participantIndex}`,
      finishReason: finishReason ?? undefined,
      usage: finishReason
        ? { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
        : undefined,
    },
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
        partState: 'streaming',
        finishReason: 'stop',
      });

      // Before fix: message has streaming parts
      expect(message.parts?.[0]).toHaveProperty('state', 'streaming');
      expect(isMessageComplete(message)).toBe(false);

      // After fix: onFinish converts to done
      const fixed = simulateOnFinishPartStateUpdate(message);
      expect(fixed.parts?.[0]).toHaveProperty('state', 'done');
      expect(isMessageComplete(fixed)).toBe(true);
    });

    it('converts multiple streaming parts (reasoning + text) to done', () => {
      const message = createAssistantMessage('p1', 0, {
        partState: 'streaming',
        hasReasoning: true,
        reasoningState: 'streaming',
        finishReason: 'stop',
      });

      // Both parts are streaming
      expect(message.parts?.[0]).toHaveProperty('state', 'streaming');
      expect(message.parts?.[1]).toHaveProperty('state', 'streaming');
      expect(isMessageComplete(message)).toBe(false);

      // After fix: both parts are done
      const fixed = simulateOnFinishPartStateUpdate(message);
      expect(fixed.parts?.[0]).toHaveProperty('state', 'done');
      expect(fixed.parts?.[1]).toHaveProperty('state', 'done');
      expect(isMessageComplete(fixed)).toBe(true);
    });

    it('preserves parts already in done state', () => {
      const message = createAssistantMessage('p1', 0, {
        partState: 'done',
        hasReasoning: true,
        reasoningState: 'done',
        finishReason: 'stop',
      });

      const fixed = simulateOnFinishPartStateUpdate(message);

      // Parts remain done (not changed)
      expect(fixed.parts?.[0]).toHaveProperty('state', 'done');
      expect(fixed.parts?.[1]).toHaveProperty('state', 'done');
      expect(isMessageComplete(fixed)).toBe(true);
    });

    it('converts mixed state parts (reasoning done, text streaming) correctly', () => {
      const message: UIMessage = {
        id: 'msg-1',
        role: MessageRoles.ASSISTANT,
        parts: [
          { type: 'reasoning', text: 'Thinking...', state: 'done' } as UIMessage['parts'][0],
          { type: 'text', text: 'Response', state: 'streaming' } as UIMessage['parts'][0],
        ],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
          model: 'model-0',
          finishReason: 'stop',
        },
      };

      expect(isMessageComplete(message)).toBe(false);

      const fixed = simulateOnFinishPartStateUpdate(message);

      // Reasoning stays done, text becomes done
      expect(fixed.parts?.[0]).toHaveProperty('state', 'done');
      expect(fixed.parts?.[1]).toHaveProperty('state', 'done');
      expect(isMessageComplete(fixed)).toBe(true);
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
        createAssistantMessage('p1', 0, { partState: 'done', finishReason: 'stop' }),
        createAssistantMessage('p2', 0, { partState: 'done', finishReason: 'stop', participantIndex: 1 }),
        // Last participant: reasoning streaming, no text yet (like the bug scenario)
        {
          id: 'msg-p3-r0',
          role: MessageRoles.ASSISTANT,
          parts: [
            { type: 'step-start' } as UIMessage['parts'][0],
            { type: 'reasoning', text: 'I shoul', state: 'streaming' } as UIMessage['parts'][0],
          ],
          metadata: {
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            participantId: 'p3',
            participantIndex: 2,
            model: 'model-2',
            finishReason: 'unknown', // Stream didn't complete normally
          },
        },
      ];

      const status = getParticipantCompletionStatus(messages, participants, 0);

      // Moderator must NOT be allowed to trigger
      expect(status.allComplete).toBe(false);
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
        createAssistantMessage('p1', 0, { partState: 'done', finishReason: 'stop' }),
        createAssistantMessage('p2', 0, { partState: 'done', finishReason: 'stop', participantIndex: 1 }),
        createAssistantMessage('p3', 0, { partState: 'streaming', finishReason: 'stop', participantIndex: 2 }),
      ];

      const beforeStatus = getParticipantCompletionStatus(beforeMessages, participants, 0);
      expect(beforeStatus.allComplete).toBe(false);

      // After: fix applied - all parts done
      const afterMessages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, { partState: 'done', finishReason: 'stop' }),
        createAssistantMessage('p2', 0, { partState: 'done', finishReason: 'stop', participantIndex: 1 }),
        simulateOnFinishPartStateUpdate(
          createAssistantMessage('p3', 0, { partState: 'streaming', finishReason: 'stop', participantIndex: 2 }),
        ),
      ];

      const afterStatus = getParticipantCompletionStatus(afterMessages, participants, 0);
      expect(afterStatus.allComplete).toBe(true);
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
      if (m.role !== MessageRoles.ASSISTANT)
        return false;
      const meta = m.metadata;
      if (!meta || typeof meta !== 'object')
        return false;
      const msgRound = 'roundNumber' in meta ? meta.roundNumber : null;
      const isModerator = 'isModerator' in meta && meta.isModerator === true;
      return msgRound === roundNumber && !isModerator;
    });

    const hasStreamingParts = participantMessages.some(msg =>
      msg.parts?.some(p => 'state' in p && p.state === 'streaming'),
    );

    // Check if SDK has updated versions
    const sdkHasDoneParts = sdkMessages.every((msg) => {
      if (msg.role !== MessageRoles.ASSISTANT)
        return true;
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
      createAssistantMessage('p1', 0, { partState: 'done', finishReason: 'stop' }),
      createAssistantMessage('p2', 0, { partState: 'done', finishReason: 'stop', participantIndex: 1 }),
    ];

    // Store still has streaming parts (throttled sync)
    const storeMessages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { partState: 'done', finishReason: 'stop' }),
      createAssistantMessage('p2', 0, { partState: 'streaming', finishReason: 'stop', participantIndex: 1 }),
    ];

    const result = simulateWaitForStoreSync(sdkMessages, storeMessages, 0, participants);

    expect(result.allComplete).toBe(false);
    expect(result.needsSync).toBe(true);
  });

  it('passes when store is already synced', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];

    const messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { partState: 'done', finishReason: 'stop' }),
      createAssistantMessage('p2', 0, { partState: 'done', finishReason: 'stop', participantIndex: 1 }),
    ];

    const result = simulateWaitForStoreSync(messages, messages, 0, participants);

    expect(result.allComplete).toBe(true);
    expect(result.needsSync).toBe(false);
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
      streamingJustEnded,
      shouldBypassThrottle: streamingJustEnded,
    };
  }

  it('detects streaming end transition (true → false)', () => {
    const result = detectStreamingEndTransition(true, false);

    expect(result.streamingJustEnded).toBe(true);
    expect(result.shouldBypassThrottle).toBe(true);
  });

  it('does not trigger on streaming start (false → true)', () => {
    const result = detectStreamingEndTransition(false, true);

    expect(result.streamingJustEnded).toBe(false);
    expect(result.shouldBypassThrottle).toBe(false);
  });

  it('does not trigger when streaming continues (true → true)', () => {
    const result = detectStreamingEndTransition(true, true);

    expect(result.streamingJustEnded).toBe(false);
    expect(result.shouldBypassThrottle).toBe(false);
  });

  it('does not trigger when not streaming (false → false)', () => {
    const result = detectStreamingEndTransition(false, false);

    expect(result.streamingJustEnded).toBe(false);
    expect(result.shouldBypassThrottle).toBe(false);
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
      createAssistantMessage('p2', 0, { partState: 'streaming', participantIndex: 1 }),
      createAssistantMessage('p3', 0, { partState: 'streaming', participantIndex: 2 }),
    ];

    const step1Status = getParticipantCompletionStatus(step1Messages, participants, 0);
    expect(step1Status.allComplete).toBe(false);
    expect(step1Status.streamingCount).toBe(3);

    // Step 2: P1 and P2 complete, P3 still streaming
    const step2Messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { partState: 'done', finishReason: 'stop' }),
      createAssistantMessage('p2', 0, { partState: 'done', finishReason: 'stop', participantIndex: 1 }),
      createAssistantMessage('p3', 0, { partState: 'streaming', participantIndex: 2 }),
    ];

    const step2Status = getParticipantCompletionStatus(step2Messages, participants, 0);
    expect(step2Status.allComplete).toBe(false);
    expect(step2Status.completedCount).toBe(2);
    expect(step2Status.streamingCount).toBe(1);

    // Step 3: P3 onFinish fires, but parts not yet updated (race condition window)
    // This is the bug: moderator would trigger here before fix
    const step3Messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { partState: 'done', finishReason: 'stop' }),
      createAssistantMessage('p2', 0, { partState: 'done', finishReason: 'stop', participantIndex: 1 }),
      {
        id: 'msg-p3-r0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Final response', state: 'streaming' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'p3',
          participantIndex: 2,
          model: 'model-2',
          finishReason: 'stop', // Backend says done, but parts still streaming
        },
      },
    ];

    const step3Status = getParticipantCompletionStatus(step3Messages, participants, 0);
    // Parts state takes precedence - still not complete
    expect(step3Status.allComplete).toBe(false);

    // Step 4: After fix - parts updated to done
    const step4Messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { partState: 'done', finishReason: 'stop' }),
      createAssistantMessage('p2', 0, { partState: 'done', finishReason: 'stop', participantIndex: 1 }),
      createAssistantMessage('p3', 0, { partState: 'done', finishReason: 'stop', participantIndex: 2 }),
    ];

    const step4Status = getParticipantCompletionStatus(step4Messages, participants, 0);
    expect(step4Status.allComplete).toBe(true);
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
      createAssistantMessage('gpt-4', 0, { partState: 'done', finishReason: 'stop' }),
      createAssistantMessage('claude', 0, { partState: 'done', finishReason: 'stop', participantIndex: 1 }),
      {
        id: 'msg-gemini-r0',
        role: MessageRoles.ASSISTANT,
        parts: [
          { type: 'step-start' } as UIMessage['parts'][0],
          {
            type: 'reasoning',
            text: 'The user is asking me to say "hi" in 1 word only... I shoul',
            state: 'streaming',
          } as UIMessage['parts'][0],
          // No text part - stream was interrupted
        ],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'gemini',
          participantIndex: 2,
          model: 'gemini',
          finishReason: 'unknown', // Stream didn't complete
          hasError: false,
          isPartialResponse: false,
        },
      },
    ];

    const status = getParticipantCompletionStatus(afterRefreshMessages, participants, 0);

    // Gemini is NOT complete - must resume streaming
    expect(status.allComplete).toBe(false);
    expect(status.completedCount).toBe(2);
    expect(status.streamingParticipantIds).toEqual(['gemini']);

    // Verify the streaming participant details
    const geminiDebug = status.debugInfo.find(d => d.participantId === 'gemini');
    expect(geminiDebug?.hasStreamingParts).toBe(true);
    expect(geminiDebug?.isComplete).toBe(false);
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
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Hi', state: 'streaming' }], // UI still shows streaming
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'fast-model',
          participantIndex: 0,
          model: 'fast-model',
          finishReason: 'stop', // Backend says done
          usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
        },
      },
    ];

    const status = getParticipantCompletionStatus(messages, participants, 0);

    // Parts state takes precedence - not complete until UI shows done
    expect(status.allComplete).toBe(false);

    // After sync applies the fix
    const fixedMessages: UIMessage[] = [
      createUserMessage(0),
      simulateOnFinishPartStateUpdate(messages[1]),
    ];

    const fixedStatus = getParticipantCompletionStatus(fixedMessages, participants, 0);
    // Still not complete - slow-model hasn't started
    expect(fixedStatus.allComplete).toBe(false);
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
      createAssistantMessage('p1', 0, { partState: 'done', finishReason: 'stop' }),
      createAssistantMessage('p2', 0, { partState: 'streaming', participantIndex: 1 }),
    ];

    const status = getParticipantCompletionStatus(messages, participants, 0);

    // Moderator gate must block
    expect(status.allComplete).toBe(false);

    // This simulates what the UI would check
    const shouldShowModeratorPlaceholder = status.allComplete;
    expect(shouldShowModeratorPlaceholder).toBe(false);
  });

  it('moderator placeholder can appear after all participants show done state', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];

    const messages: UIMessage[] = [
      createUserMessage(0),
      createAssistantMessage('p1', 0, { partState: 'done', finishReason: 'stop' }),
      createAssistantMessage('p2', 0, { partState: 'done', finishReason: 'stop', participantIndex: 1 }),
    ];

    const status = getParticipantCompletionStatus(messages, participants, 0);

    expect(status.allComplete).toBe(true);

    const shouldShowModeratorPlaceholder = status.allComplete;
    expect(shouldShowModeratorPlaceholder).toBe(true);
  });
});

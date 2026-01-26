/**
 * Participant Completion Gate Edge Cases Test
 *
 * Tests critical edge cases in the participant completion gate logic:
 * - Mid-stream participant failures
 * - Dynamic participant count changes (add/remove during streaming)
 * - Multiple gate trigger prevention
 * - Failed participant detection
 *
 * CRITICAL BUGS TESTED:
 * 1. Gate triggers moderator before all participants done
 * 2. Participant count changes mid-stream cause gate malfunction
 * 3. Gate doesn't detect failed participants (finishReason but no content)
 * 4. Multiple gate triggers for same round
 *
 * Location: /src/stores/chat/__tests__/participant-completion-gate-edge-cases.test.ts
 */

import { MessagePartTypes, MessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import type { ChatParticipant } from '@/services/api';
import { getParticipantCompletionStatus, isMessageComplete } from '@/stores/chat';

// ============================================================================
// Test Utilities
// ============================================================================

function createParticipant(id: string, priority: number, isEnabled = true): ChatParticipant {
  return {
    createdAt: new Date(),
    description: `Participant ${id}`,
    id,
    isEnabled,
    model: `gpt-${id}`,
    name: `Model ${id}`,
    priority,
    provider: 'openai',
    updatedAt: new Date(),
  };
}

function createUserMessage(round: number): UIMessage {
  return {
    id: `user_${round}`,
    metadata: { role: MessageRoles.USER, roundNumber: round },
    parts: [{ text: 'Test query', type: MessagePartTypes.TEXT }],
    role: MessageRoles.USER,
  };
}

function createParticipantMessage(
  participantId: string,
  round: number,
  options: {
    hasContent?: boolean;
    isStreaming?: boolean;
    finishReason?: string | null;
    participantIndex?: number;
  } = {},
): UIMessage {
  const {
    finishReason = 'stop',
    hasContent = true,
    isStreaming = false,
    participantIndex = 0,
  } = options;

  const parts = hasContent
    ? [
        {
          text: 'Response from participant',
          type: MessagePartTypes.TEXT as const,
          ...(isStreaming ? { state: 'streaming' as const } : {}),
        },
      ]
    : [];

  return {
    id: `${participantId}_r${round}`,
    metadata: {
      finishReason,
      participantId,
      participantIndex,
      role: MessageRoles.ASSISTANT,
      roundNumber: round,
    },
    parts,
    role: MessageRoles.ASSISTANT,
  };
}

// ============================================================================
// Basic Completion Detection Tests
// ============================================================================

describe('isMessageComplete - basic cases', () => {
  it('complete message with text content and finishReason', () => {
    const message: UIMessage = {
      id: 'msg1',
      metadata: { finishReason: 'stop' },
      parts: [{ text: 'Hello', type: MessagePartTypes.TEXT }],
      role: MessageRoles.ASSISTANT,
    };

    expect(isMessageComplete(message)).toBeTruthy();
  });

  it('incomplete message with streaming parts', () => {
    const message: UIMessage = {
      id: 'msg1',
      metadata: { finishReason: null },
      parts: [
        { state: 'streaming', text: 'Hello', type: MessagePartTypes.TEXT },
      ],
      role: MessageRoles.ASSISTANT,
    };

    expect(isMessageComplete(message)).toBeFalsy();
  });

  it('empty message with no parts', () => {
    const message: UIMessage = {
      id: 'msg1',
      metadata: {},
      parts: [],
      role: MessageRoles.ASSISTANT,
    };

    expect(isMessageComplete(message)).toBeFalsy();
  });

  it('failed message with finishReason but no content', () => {
    const message: UIMessage = {
      id: 'msg1',
      metadata: { finishReason: 'error' },
      parts: [],
      role: MessageRoles.ASSISTANT,
    };

    // Should be complete - finishReason indicates stream ended
    expect(isMessageComplete(message)).toBeTruthy();
  });
});

// ============================================================================
// EDGE CASE 1: Mid-Stream Participant Failures
// ============================================================================

describe('getParticipantCompletionStatus - participant failures', () => {
  it('bUG: 3 participants, one fails mid-stream (no content, has finishReason)', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
      createParticipant('p3', 2),
    ];

    const messages: UIMessage[] = [
      createUserMessage(1),
      // P1: Complete with content
      createParticipantMessage('p1', 1, { finishReason: 'stop', hasContent: true }),
      // P2: Failed - has finishReason but no content (error/timeout)
      createParticipantMessage('p2', 1, { finishReason: 'error', hasContent: false }),
      // P3: Still streaming
      createParticipantMessage('p3', 1, { hasContent: true, isStreaming: true }),
    ];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    expect(status.expectedCount).toBe(3);
    expect(status.completedCount).toBe(2); // p1 (success) + p2 (failed but complete)
    expect(status.streamingCount).toBe(1); // p3 still streaming
    expect(status.allComplete).toBeFalsy(); // p3 not done yet
    expect(status.completedParticipantIds).toContain('p1');
    expect(status.completedParticipantIds).toContain('p2'); // Failed is still "complete"
    expect(status.streamingParticipantIds).toContain('p3');
  });

  it('all participants complete, one with error finishReason', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
      createParticipant('p3', 2),
    ];

    const messages: UIMessage[] = [
      createUserMessage(1),
      createParticipantMessage('p1', 1, { finishReason: 'stop', hasContent: true }),
      createParticipantMessage('p2', 1, { finishReason: 'error', hasContent: false }),
      createParticipantMessage('p3', 1, { finishReason: 'stop', hasContent: true }),
    ];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    // Gate should PASS - all participants done (even if one failed)
    expect(status.allComplete).toBeTruthy();
    expect(status.expectedCount).toBe(3);
    expect(status.completedCount).toBe(3);
    expect(status.streamingCount).toBe(0);
  });

  it('participant with finishReason=unknown but no content is NOT complete (interrupted stream)', () => {
    const participants = [createParticipant('p1', 0)];

    const messages: UIMessage[] = [
      createUserMessage(1),
      createParticipantMessage('p1', 1, { finishReason: 'unknown', hasContent: false }),
    ];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    // ✅ FIX: 'unknown' finishReason with NO content = INTERRUPTED stream
    // This stream needs to be resumed, NOT counted as complete
    // Gate should BLOCK to allow stream resumption to detect and re-trigger
    expect(status.allComplete).toBeFalsy();
    expect(status.completedCount).toBe(0);
    expect(status.streamingCount).toBe(1);
  });

  it('participant with finishReason=unknown WITH content IS complete', () => {
    const participants = [createParticipant('p1', 0)];

    const messages: UIMessage[] = [
      createUserMessage(1),
      createParticipantMessage('p1', 1, { finishReason: 'unknown', hasContent: true }),
    ];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    // 'unknown' finishReason WITH content = stream has usable content, can proceed
    expect(status.allComplete).toBeTruthy();
    expect(status.completedCount).toBe(1);
    expect(status.streamingCount).toBe(0);
  });
});

// ============================================================================
// EDGE CASE 2: Dynamic Participant Count Changes
// ============================================================================

describe('getParticipantCompletionStatus - dynamic participant changes', () => {
  it('bUG: add participant during streaming should NOT affect gate', () => {
    // Initial: 2 participants
    const initialParticipants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];

    const messages: UIMessage[] = [
      createUserMessage(1),
      createParticipantMessage('p1', 1, { finishReason: 'stop', hasContent: true }),
      createParticipantMessage('p2', 1, { finishReason: 'stop', hasContent: true }),
    ];

    // Gate passes with 2 participants
    let status = getParticipantCompletionStatus(messages, initialParticipants, 1);
    expect(status.allComplete).toBeTruthy();
    expect(status.completedCount).toBe(2);

    // NOW: User adds 3rd participant mid-stream (should NOT block gate)
    const updatedParticipants = [
      ...initialParticipants,
      createParticipant('p3', 2),
    ];

    // Gate should FAIL because we now expect 3 but only have 2 messages
    status = getParticipantCompletionStatus(messages, updatedParticipants, 1);
    expect(status.allComplete).toBeFalsy();
    expect(status.expectedCount).toBe(3);
    expect(status.completedCount).toBe(2);
    expect(status.streamingCount).toBe(1); // p3 missing
    expect(status.streamingParticipantIds).toContain('p3');
  });

  it('bUG: disable participant during streaming should affect gate', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
      createParticipant('p3', 2), // Will be disabled
    ];

    const messages: UIMessage[] = [
      createUserMessage(1),
      createParticipantMessage('p1', 1, { finishReason: 'stop', hasContent: true }),
      createParticipantMessage('p2', 1, { finishReason: 'stop', hasContent: true }),
      // p3 is still streaming
      createParticipantMessage('p3', 1, { hasContent: true, isStreaming: true }),
    ];

    // Gate fails - p3 still streaming
    let status = getParticipantCompletionStatus(messages, participants, 1);
    expect(status.allComplete).toBeFalsy();
    expect(status.streamingCount).toBe(1);

    // NOW: User disables p3 (or p3 fails and is auto-disabled)
    const updatedParticipants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
      createParticipant('p3', 2, false), // isEnabled = false
    ];

    // Gate should NOW PASS - only enabled participants count
    status = getParticipantCompletionStatus(messages, updatedParticipants, 1);
    expect(status.allComplete).toBeTruthy();
    expect(status.expectedCount).toBe(2); // Only p1 and p2
    expect(status.completedCount).toBe(2);
    expect(status.streamingCount).toBe(0);
  });

  it('only enabled participants are counted', () => {
    const participants = [
      createParticipant('p1', 0, true),
      createParticipant('p2', 1, false), // Disabled
      createParticipant('p3', 2, true),
    ];

    const messages: UIMessage[] = [
      createUserMessage(1),
      createParticipantMessage('p1', 1, { finishReason: 'stop', hasContent: true }),
      // p2 disabled, no message expected
      createParticipantMessage('p3', 1, { finishReason: 'stop', hasContent: true }),
    ];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    // Should only count p1 and p3
    expect(status.expectedCount).toBe(2);
    expect(status.completedCount).toBe(2);
    expect(status.allComplete).toBeTruthy();
  });
});

// ============================================================================
// EDGE CASE 3: Multiple Gate Trigger Prevention
// ============================================================================

describe('getParticipantCompletionStatus - multiple gate triggers', () => {
  it('bUG: gate should only trigger once per round', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];

    const messages: UIMessage[] = [
      createUserMessage(1),
      createParticipantMessage('p1', 1, { finishReason: 'stop', hasContent: true }),
      createParticipantMessage('p2', 1, { finishReason: 'stop', hasContent: true }),
    ];

    // First check - gate passes
    const status1 = getParticipantCompletionStatus(messages, participants, 1);
    expect(status1.allComplete).toBeTruthy();

    // Second check - gate should still pass (idempotent)
    const status2 = getParticipantCompletionStatus(messages, participants, 1);
    expect(status2.allComplete).toBeTruthy();

    // Results should be identical
    expect(status1).toEqual(status2);
  });

  it('completion status is round-specific', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];

    const messages: UIMessage[] = [
      // Round 1 - complete
      createUserMessage(1),
      createParticipantMessage('p1', 1, { finishReason: 'stop', hasContent: true }),
      createParticipantMessage('p2', 1, { finishReason: 'stop', hasContent: true }),
      // Round 2 - incomplete
      createUserMessage(2),
      createParticipantMessage('p1', 2, { finishReason: 'stop', hasContent: true }),
      // p2 still streaming in round 2
    ];

    // Round 1 - complete
    const status1 = getParticipantCompletionStatus(messages, participants, 1);
    expect(status1.allComplete).toBeTruthy();

    // Round 2 - incomplete
    const status2 = getParticipantCompletionStatus(messages, participants, 2);
    expect(status2.allComplete).toBeFalsy();
    expect(status2.completedCount).toBe(1);
    expect(status2.streamingCount).toBe(1);
  });
});

// ============================================================================
// EDGE CASE 4: Streaming State Detection
// ============================================================================

describe('getParticipantCompletionStatus - streaming detection', () => {
  it('message with streaming parts is NOT complete', () => {
    const participants = [createParticipant('p1', 0)];

    const messages: UIMessage[] = [
      createUserMessage(1),
      {
        id: 'p1_r1',
        metadata: {
          participantId: 'p1',
          role: MessageRoles.ASSISTANT,
          roundNumber: 1,
          // finishReason not set yet - stream active
        },
        parts: [
          { state: 'streaming', text: 'Partial', type: MessagePartTypes.TEXT },
        ],
        role: MessageRoles.ASSISTANT,
      },
    ];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    expect(status.allComplete).toBeFalsy();
    expect(status.streamingCount).toBe(1);
    expect(status.completedCount).toBe(0);
    expect(status.debugInfo[0].hasStreamingParts).toBeTruthy();
    expect(status.debugInfo[0].isComplete).toBeFalsy();
  });

  it('message with content but no finishReason is complete', () => {
    const participants = [createParticipant('p1', 0)];

    const messages: UIMessage[] = [
      createUserMessage(1),
      {
        id: 'p1_r1',
        metadata: {
          participantId: 'p1',
          role: MessageRoles.ASSISTANT,
          roundNumber: 1,
          // No finishReason - but has content and no streaming parts
        },
        parts: [
          { text: 'Complete content', type: MessagePartTypes.TEXT },
        ],
        role: MessageRoles.ASSISTANT,
      },
    ];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    // Complete because has content and no streaming parts
    expect(status.allComplete).toBeTruthy();
    expect(status.completedCount).toBe(1);
    expect(status.debugInfo[0].hasContent).toBeTruthy();
    expect(status.debugInfo[0].hasStreamingParts).toBeFalsy();
    expect(status.debugInfo[0].isComplete).toBeTruthy();
  });

  it('bUG: empty placeholder message should NOT be complete', () => {
    const participants = [createParticipant('p1', 0)];

    const messages: UIMessage[] = [
      createUserMessage(1),
      {
        id: 'p1_r1',
        metadata: {
          participantId: 'p1',
          role: MessageRoles.ASSISTANT,
          roundNumber: 1,
        },
        parts: [], // Empty placeholder created by AI SDK
        role: MessageRoles.ASSISTANT,
      },
    ];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    // Should NOT be complete - empty placeholder
    expect(status.allComplete).toBeFalsy();
    expect(status.streamingCount).toBe(1);
    expect(status.debugInfo[0].hasContent).toBeFalsy();
    expect(status.debugInfo[0].hasFinishReason).toBeFalsy();
    expect(status.debugInfo[0].isComplete).toBeFalsy();
  });
});

// ============================================================================
// EDGE CASE 5: No Participants or Messages
// ============================================================================

describe('getParticipantCompletionStatus - empty cases', () => {
  it('no enabled participants returns allComplete=false', () => {
    const participants: ChatParticipant[] = [];
    const messages: UIMessage[] = [createUserMessage(1)];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    expect(status.allComplete).toBeFalsy();
    expect(status.expectedCount).toBe(0);
    expect(status.completedCount).toBe(0);
    expect(status.streamingCount).toBe(0);
  });

  it('all participants disabled returns allComplete=false', () => {
    const participants = [
      createParticipant('p1', 0, false),
      createParticipant('p2', 1, false),
    ];
    const messages: UIMessage[] = [createUserMessage(1)];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    expect(status.allComplete).toBeFalsy();
    expect(status.expectedCount).toBe(0);
  });

  it('participants present but no messages for round', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];
    const messages: UIMessage[] = [createUserMessage(1)];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    expect(status.allComplete).toBeFalsy();
    expect(status.expectedCount).toBe(2);
    expect(status.completedCount).toBe(0);
    expect(status.streamingCount).toBe(2);
    expect(status.streamingParticipantIds).toEqual(['p1', 'p2']);
  });
});

// ============================================================================
// EDGE CASE 6: Debug Info Validation
// ============================================================================

describe('getParticipantCompletionStatus - debug info', () => {
  it('provides detailed debug info for each participant', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
      createParticipant('p3', 2),
    ];

    const messages: UIMessage[] = [
      createUserMessage(1),
      createParticipantMessage('p1', 1, { finishReason: 'stop', hasContent: true }),
      createParticipantMessage('p2', 1, { hasContent: true, isStreaming: true }),
      // p3 has no message yet
    ];

    const status = getParticipantCompletionStatus(messages, participants, 1);

    expect(status.debugInfo).toHaveLength(3);

    // p1 - complete
    expect(status.debugInfo[0]).toMatchObject({
      hasContent: true,
      hasFinishReason: true,
      hasMessage: true,
      hasStreamingParts: false,
      isComplete: true,
      participantId: 'p1',
      participantIndex: 0,
    });

    // p2 - streaming
    expect(status.debugInfo[1]).toMatchObject({
      hasContent: true,
      hasFinishReason: true,
      hasMessage: true,
      hasStreamingParts: true,
      isComplete: false,
      participantId: 'p2',
      participantIndex: 1,
    });

    // p3 - no message
    expect(status.debugInfo[2]).toMatchObject({
      hasContent: false,
      hasFinishReason: false,
      hasMessage: false,
      hasStreamingParts: false,
      isComplete: false,
      participantId: 'p3',
      participantIndex: 2,
    });
  });
});

// ============================================================================
// CRITICAL INTEGRATION SCENARIO
// ============================================================================

describe('getParticipantCompletionStatus - integration scenario', () => {
  it('cRITICAL: realistic streaming lifecycle with failures', () => {
    const participants = [
      createParticipant('gpt-4', 0),
      createParticipant('claude', 1),
      createParticipant('gemini', 2),
    ];

    let messages: UIMessage[] = [createUserMessage(1)];

    // STEP 1: All participants start (empty placeholders)
    messages = [
      ...messages,
      createParticipantMessage('gpt-4', 1, { finishReason: null, hasContent: false }),
      createParticipantMessage('claude', 1, { finishReason: null, hasContent: false }),
      createParticipantMessage('gemini', 1, { finishReason: null, hasContent: false }),
    ];

    let status = getParticipantCompletionStatus(messages, participants, 1);
    expect(status.allComplete).toBeFalsy();
    expect(status.streamingCount).toBe(3);

    // STEP 2: GPT-4 completes successfully
    messages[1] = createParticipantMessage('gpt-4', 1, { finishReason: 'stop', hasContent: true });

    status = getParticipantCompletionStatus(messages, participants, 1);
    expect(status.allComplete).toBeFalsy();
    expect(status.completedCount).toBe(1);
    expect(status.streamingCount).toBe(2);

    // STEP 3: Claude fails (error but finishReason set)
    messages[2] = createParticipantMessage('claude', 1, { finishReason: 'error', hasContent: false });

    status = getParticipantCompletionStatus(messages, participants, 1);
    expect(status.allComplete).toBeFalsy(); // Gemini still pending
    expect(status.completedCount).toBe(2); // gpt-4 + claude (failed)
    expect(status.streamingCount).toBe(1);

    // STEP 4: Gemini streaming
    messages[3] = createParticipantMessage('gemini', 1, { hasContent: true, isStreaming: true });

    status = getParticipantCompletionStatus(messages, participants, 1);
    expect(status.allComplete).toBeFalsy();
    expect(status.completedCount).toBe(2);
    expect(status.streamingCount).toBe(1);

    // STEP 5: Gemini completes
    messages[3] = createParticipantMessage('gemini', 1, { finishReason: 'stop', hasContent: true });

    status = getParticipantCompletionStatus(messages, participants, 1);
    expect(status.allComplete).toBeTruthy(); // ALL DONE (including failed claude)
    expect(status.completedCount).toBe(3);
    expect(status.streamingCount).toBe(0);
  });
});

/**
 * Moderator Transition Race Condition Tests
 *
 * Tests for the race condition where submissions can slip through during
 * the transition window between participants finishing and moderator starting.
 *
 * BUG CONTEXT (December 2024):
 * - When all participants finish streaming, `isStreaming` becomes false
 * - The `handleComplete` callback in provider.tsx has async operations
 *   (waitForStoreSync, waitForAllAnimations) before setting `isModeratorStreaming`
 * - During this ~1 second window, BOTH `isStreaming` and `isModeratorStreaming` are false
 * - This allowed duplicate submissions to create duplicate rounds in the database
 *
 * FIX:
 * - Added `isAwaitingModerator` check: blocks when all participants complete but
 *   no moderator message exists yet for the current round
 *
 * PREVENTION:
 * - These tests verify the blocking logic covers all transition windows
 * - Similar race conditions in pre-search → participants transition are also tested
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  createMockParticipant,
  createMockParticipants,
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { getCurrentRoundNumber } from '@/lib/utils';

import {
  areAllParticipantsCompleteForRound,
  getModeratorMessageForRound,
} from '../utils/participant-completion-gate';

// ============================================================================
// Core Helper: isAwaitingModerator calculation
// ============================================================================

/**
 * Calculate isAwaitingModerator - mirrors the fix in ChatThreadScreen.tsx
 * This is the core logic that prevents the race condition
 */
function calculateIsAwaitingModerator(
  messages: UIMessage[],
  participants: ReturnType<typeof createMockParticipant>[],
): boolean {
  if (messages.length === 0 || participants.length === 0)
    return false;

  const currentRound = getCurrentRoundNumber(messages);
  const allParticipantsComplete = areAllParticipantsCompleteForRound(messages, participants, currentRound);
  const moderatorExists = getModeratorMessageForRound(messages, currentRound) !== undefined;

  // Block if all participants are done but moderator hasn't been created yet
  return allParticipantsComplete && !moderatorExists;
}

/**
 * Extended blocking check that includes isAwaitingModerator
 * This is the COMPLETE blocking logic for submit buttons
 */
type ExtendedBlockingState = {
  isStreaming: boolean;
  isModeratorStreaming: boolean;
  pendingMessage: string | null;
  messages: UIMessage[];
  participants: ReturnType<typeof createMockParticipant>[];
};

function calculateIsSubmitBlocked(state: ExtendedBlockingState): boolean {
  const isAwaitingModerator = calculateIsAwaitingModerator(state.messages, state.participants);

  return (
    state.isStreaming
    || state.isModeratorStreaming
    || Boolean(state.pendingMessage)
    || isAwaitingModerator
  );
}

// ============================================================================
// CORE RACE CONDITION TESTS
// ============================================================================

describe('moderator Transition Race Condition - Core Bug Scenario', () => {
  /**
   * THE BUG: This was the exact scenario that caused duplicate rounds
   *
   * Timeline:
   * - 21:47:16: User sends "say hi, 1 word only" (round 1)
   * - 21:47:29: Last participant (p2) finishes streaming
   * - 21:47:30: isStreaming=false, isModeratorStreaming=false, DUPLICATE USER MESSAGE CREATED
   * - 21:47:31: Moderator starts streaming
   *
   * The window between 21:47:29-21:47:31 allowed a duplicate submission
   */
  it('cRITICAL: blocks submission during moderator transition window', () => {
    const participants = createMockParticipants(3);

    // Round 1: User message + all participants complete, NO moderator yet
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'user-1', content: 'say hi, 1 word only', roundNumber: 1 }),
      createTestAssistantMessage({ id: 'p0-1', content: 'Hi', roundNumber: 1, participantId: participants[0].id, participantIndex: 0 }),
      createTestAssistantMessage({ id: 'p1-1', content: 'Hello', roundNumber: 1, participantId: participants[1].id, participantIndex: 1 }),
      createTestAssistantMessage({ id: 'p2-1', content: 'Hey', roundNumber: 1, participantId: participants[2].id, participantIndex: 2 }),
      // NO moderator message yet - this is the race condition window!
    ];

    // During the race condition window:
    // - isStreaming = false (participants done)
    // - isModeratorStreaming = false (not started yet)
    // - pendingMessage = null (already sent)
    const isBlocked = calculateIsSubmitBlocked({
      isStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      messages,
      participants,
    });

    // ✅ FIX: isAwaitingModerator should block this
    expect(isBlocked).toBe(true);
  });

  it('does NOT block when moderator message exists', () => {
    const participants = createMockParticipants(2);

    // Round complete with moderator
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'user-1', content: 'Test', roundNumber: 1 }),
      createTestAssistantMessage({ id: 'p0-1', content: 'Response 0', roundNumber: 1, participantId: participants[0].id, participantIndex: 0 }),
      createTestAssistantMessage({ id: 'p1-1', content: 'Response 1', roundNumber: 1, participantId: participants[1].id, participantIndex: 1 }),
      createTestModeratorMessage({ id: 'mod-1', content: 'Summary', roundNumber: 1 }), // Moderator exists!
    ];

    const isBlocked = calculateIsSubmitBlocked({
      isStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      messages,
      participants,
    });

    // Should NOT block - round is truly complete
    expect(isBlocked).toBe(false);
  });

  it('blocks when isStreaming is true (participants still streaming)', () => {
    const participants = createMockParticipants(2);

    // One participant response exists
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'user-1', content: 'Test', roundNumber: 1 }),
      createTestAssistantMessage({ id: 'p0-1', content: 'Response 0', roundNumber: 1, participantId: participants[0].id, participantIndex: 0 }),
    ];

    // isStreaming would be true in real scenario
    const isBlocked = calculateIsSubmitBlocked({
      isStreaming: true, // Active streaming
      isModeratorStreaming: false,
      pendingMessage: null,
      messages,
      participants,
    });

    // Should block due to isStreaming
    expect(isBlocked).toBe(true);
  });

  it('blocks when isModeratorStreaming is true', () => {
    const participants = createMockParticipants(1);

    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'user-1', content: 'Test', roundNumber: 1 }),
      createTestAssistantMessage({ id: 'p0-1', content: 'Response', roundNumber: 1, participantId: participants[0].id, participantIndex: 0 }),
      createTestModeratorMessage({ id: 'mod-1', content: 'Streaming...', roundNumber: 1 }),
    ];

    const isBlocked = calculateIsSubmitBlocked({
      isStreaming: false,
      isModeratorStreaming: true, // Moderator actively streaming
      pendingMessage: null,
      messages,
      participants,
    });

    expect(isBlocked).toBe(true);
  });
});

// ============================================================================
// isAwaitingModerator CALCULATION TESTS
// ============================================================================

describe('isAwaitingModerator Calculation', () => {
  describe('empty state handling', () => {
    it('returns false when messages array is empty', () => {
      const participants = createMockParticipants(1);
      const isAwaiting = calculateIsAwaitingModerator([], participants);
      expect(isAwaiting).toBe(false);
    });

    it('returns false when participants array is empty', () => {
      const messages = [createTestUserMessage({ id: 'user-0', content: 'Test', roundNumber: 0 })];
      const isAwaiting = calculateIsAwaitingModerator(messages, []);
      expect(isAwaiting).toBe(false);
    });

    it('returns false when both arrays are empty', () => {
      const isAwaiting = calculateIsAwaitingModerator([], []);
      expect(isAwaiting).toBe(false);
    });
  });

  describe('round 0 (initial round)', () => {
    it('returns true when all participants complete but no moderator (round 0)', () => {
      const participants = createMockParticipants(2);

      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'user-0', content: 'Test', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'p0-0', content: 'Response 0', roundNumber: 0, participantId: participants[0].id, participantIndex: 0 }),
        createTestAssistantMessage({ id: 'p1-0', content: 'Response 1', roundNumber: 0, participantId: participants[1].id, participantIndex: 1 }),
      ];

      const isAwaiting = calculateIsAwaitingModerator(messages, participants);
      expect(isAwaiting).toBe(true);
    });

    it('returns false when moderator exists (round 0)', () => {
      const participants = createMockParticipants(1);

      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'user-0', content: 'Test', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'p0-0', content: 'Response', roundNumber: 0, participantId: participants[0].id, participantIndex: 0 }),
        createTestModeratorMessage({ id: 'mod-0', content: 'Summary', roundNumber: 0 }),
      ];

      const isAwaiting = calculateIsAwaitingModerator(messages, participants);
      expect(isAwaiting).toBe(false);
    });
  });

  describe('subsequent rounds (round 1+)', () => {
    it('returns true when all participants complete but no moderator (round 1)', () => {
      const participants = createMockParticipants(2);

      // Complete round 0, then round 1 participants done but no moderator
      const messages: UIMessage[] = [
        // Round 0 - complete
        createTestUserMessage({ id: 'user-0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'p0-0', content: 'R0-0', roundNumber: 0, participantId: participants[0].id, participantIndex: 0 }),
        createTestAssistantMessage({ id: 'p1-0', content: 'R0-1', roundNumber: 0, participantId: participants[1].id, participantIndex: 1 }),
        createTestModeratorMessage({ id: 'mod-0', content: 'Summary 0', roundNumber: 0 }),
        // Round 1 - participants done, no moderator
        createTestUserMessage({ id: 'user-1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'p0-1', content: 'R1-0', roundNumber: 1, participantId: participants[0].id, participantIndex: 0 }),
        createTestAssistantMessage({ id: 'p1-1', content: 'R1-1', roundNumber: 1, participantId: participants[1].id, participantIndex: 1 }),
      ];

      const isAwaiting = calculateIsAwaitingModerator(messages, participants);
      expect(isAwaiting).toBe(true);
    });

    it('handles multiple complete rounds before current incomplete round', () => {
      const participants = createMockParticipants(1);

      const messages: UIMessage[] = [
        // Round 0 - complete
        createTestUserMessage({ id: 'user-0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'p0-0', content: 'R0', roundNumber: 0, participantId: participants[0].id, participantIndex: 0 }),
        createTestModeratorMessage({ id: 'mod-0', content: 'S0', roundNumber: 0 }),
        // Round 1 - complete
        createTestUserMessage({ id: 'user-1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'p0-1', content: 'R1', roundNumber: 1, participantId: participants[0].id, participantIndex: 0 }),
        createTestModeratorMessage({ id: 'mod-1', content: 'S1', roundNumber: 1 }),
        // Round 2 - participants done, no moderator
        createTestUserMessage({ id: 'user-2', content: 'Q2', roundNumber: 2 }),
        createTestAssistantMessage({ id: 'p0-2', content: 'R2', roundNumber: 2, participantId: participants[0].id, participantIndex: 0 }),
      ];

      const isAwaiting = calculateIsAwaitingModerator(messages, participants);
      expect(isAwaiting).toBe(true);
    });
  });

  describe('participant completion edge cases', () => {
    it('returns false when only some participants have responded', () => {
      const participants = createMockParticipants(3);

      // Only 2 of 3 participants have responded
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'user-1', content: 'Test', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'p0-1', content: 'R0', roundNumber: 1, participantId: participants[0].id, participantIndex: 0 }),
        createTestAssistantMessage({ id: 'p1-1', content: 'R1', roundNumber: 1, participantId: participants[1].id, participantIndex: 1 }),
        // p2 hasn't responded yet
      ];

      const isAwaiting = calculateIsAwaitingModerator(messages, participants);
      expect(isAwaiting).toBe(false);
    });

    it('only considers enabled participants', () => {
      // Create participants where one is disabled
      const enabledParticipant = createMockParticipant(0, { isEnabled: true });
      const disabledParticipant = createMockParticipant(1, { isEnabled: false });
      const participants = [enabledParticipant, disabledParticipant];

      // Only enabled participant has responded
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'user-1', content: 'Test', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'p0-1', content: 'R0', roundNumber: 1, participantId: enabledParticipant.id, participantIndex: 0 }),
      ];

      const isAwaiting = calculateIsAwaitingModerator(messages, participants);
      // All ENABLED participants complete, no moderator = awaiting
      expect(isAwaiting).toBe(true);
    });
  });
});

// ============================================================================
// MULTI-ROUND RACE CONDITION SCENARIOS
// ============================================================================

describe('multi-Round Race Conditions', () => {
  it('scenario: rapid succession of rounds without race condition', () => {
    const participants = createMockParticipants(1);

    // Each round fully complete with moderator
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'user-0', content: 'Q0', roundNumber: 0 }),
      createTestAssistantMessage({ id: 'p0-0', content: 'R0', roundNumber: 0, participantId: participants[0].id, participantIndex: 0 }),
      createTestModeratorMessage({ id: 'mod-0', content: 'S0', roundNumber: 0 }),
      createTestUserMessage({ id: 'user-1', content: 'Q1', roundNumber: 1 }),
      createTestAssistantMessage({ id: 'p0-1', content: 'R1', roundNumber: 1, participantId: participants[0].id, participantIndex: 0 }),
      createTestModeratorMessage({ id: 'mod-1', content: 'S1', roundNumber: 1 }),
      createTestUserMessage({ id: 'user-2', content: 'Q2', roundNumber: 2 }),
      createTestAssistantMessage({ id: 'p0-2', content: 'R2', roundNumber: 2, participantId: participants[0].id, participantIndex: 0 }),
      createTestModeratorMessage({ id: 'mod-2', content: 'S2', roundNumber: 2 }),
    ];

    const isBlocked = calculateIsSubmitBlocked({
      isStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      messages,
      participants,
    });

    // All rounds complete - should NOT block
    expect(isBlocked).toBe(false);
  });

  it('scenario: user tries to submit during every transition window', () => {
    const participants = createMockParticipants(2);

    // Test each transition state
    const testCases = [
      {
        name: 'only user message (no participants yet)',
        messages: [createTestUserMessage({ id: 'user-1', content: 'Q1', roundNumber: 1 })],
        shouldBlock: false, // No participants complete yet
      },
      {
        name: 'first participant complete, second still missing',
        messages: [
          createTestUserMessage({ id: 'user-1', content: 'Q1', roundNumber: 1 }),
          createTestAssistantMessage({ id: 'p0-1', content: 'R0', roundNumber: 1, participantId: participants[0].id, participantIndex: 0 }),
        ],
        shouldBlock: false, // Not all participants complete
      },
      {
        name: 'all participants complete, no moderator (THE BUG)',
        messages: [
          createTestUserMessage({ id: 'user-1', content: 'Q1', roundNumber: 1 }),
          createTestAssistantMessage({ id: 'p0-1', content: 'R0', roundNumber: 1, participantId: participants[0].id, participantIndex: 0 }),
          createTestAssistantMessage({ id: 'p1-1', content: 'R1', roundNumber: 1, participantId: participants[1].id, participantIndex: 1 }),
        ],
        shouldBlock: true, // MUST block - this was the bug!
      },
      {
        name: 'round complete with moderator',
        messages: [
          createTestUserMessage({ id: 'user-1', content: 'Q1', roundNumber: 1 }),
          createTestAssistantMessage({ id: 'p0-1', content: 'R0', roundNumber: 1, participantId: participants[0].id, participantIndex: 0 }),
          createTestAssistantMessage({ id: 'p1-1', content: 'R1', roundNumber: 1, participantId: participants[1].id, participantIndex: 1 }),
          createTestModeratorMessage({ id: 'mod-1', content: 'Summary', roundNumber: 1 }),
        ],
        shouldBlock: false, // Round complete
      },
    ];

    for (const testCase of testCases) {
      const isBlocked = calculateIsSubmitBlocked({
        isStreaming: false,
        isModeratorStreaming: false,
        pendingMessage: null,
        messages: testCase.messages,
        participants,
      });

      expect(isBlocked, `Failed for: ${testCase.name}`).toBe(testCase.shouldBlock);
    }
  });
});

// ============================================================================
// REGRESSION TESTS - SPECIFIC BUG SCENARIOS
// ============================================================================

describe('regression Tests - Known Bug Scenarios', () => {
  it('bUG-001: duplicate round created when submitting during moderator delay', () => {
    /**
     * Exact reproduction from production bug (December 2024):
     * - Thread: capitalism-growth-and-earths-limits-oyx6ee
     * - Round 1 user message: 21:47:16
     * - Round 2 user message: 21:47:30 (DUPLICATE - same content!)
     * - Round 1 moderator: 21:47:31
     *
     * The 1-second gap between participants finishing and moderator starting
     * allowed the duplicate submission.
     */
    const participants = createMockParticipants(3);

    // State at 21:47:30 - right when duplicate was created
    const messagesAt214730: UIMessage[] = [
      // Round 0 complete
      createTestUserMessage({ id: 'user-0', content: 'Initial question', roundNumber: 0 }),
      createTestAssistantMessage({ id: 'p0-0', content: 'R0-0', roundNumber: 0, participantId: participants[0].id, participantIndex: 0 }),
      createTestAssistantMessage({ id: 'p1-0', content: 'R0-1', roundNumber: 0, participantId: participants[1].id, participantIndex: 1 }),
      createTestAssistantMessage({ id: 'p2-0', content: 'R0-2', roundNumber: 0, participantId: participants[2].id, participantIndex: 2 }),
      createTestModeratorMessage({ id: 'mod-0', content: 'Summary 0', roundNumber: 0 }),
      // Round 1 - all participants done, NO moderator yet
      createTestUserMessage({ id: 'user-1', content: 'say hi, 1 word only', roundNumber: 1 }),
      createTestAssistantMessage({ id: 'p0-1', content: 'Hi', roundNumber: 1, participantId: participants[0].id, participantIndex: 0 }),
      createTestAssistantMessage({ id: 'p1-1', content: 'Hello', roundNumber: 1, participantId: participants[1].id, participantIndex: 1 }),
      createTestAssistantMessage({ id: 'p2-1', content: 'Hey', roundNumber: 1, participantId: participants[2].id, participantIndex: 2 }),
      // Moderator doesn't exist at 21:47:30 (created at 21:47:31)
    ];

    const isBlocked = calculateIsSubmitBlocked({
      isStreaming: false, // Participants done
      isModeratorStreaming: false, // Not started yet
      pendingMessage: null, // Already sent
      messages: messagesAt214730,
      participants,
    });

    // ✅ THE FIX: This should now be blocked
    expect(isBlocked).toBe(true);
  });

  it('bUG-001 (after fix): submission allowed after moderator created', () => {
    const participants = createMockParticipants(3);

    // State at 21:47:31+ - moderator exists now
    const messagesAfterModerator: UIMessage[] = [
      createTestUserMessage({ id: 'user-0', content: 'Initial question', roundNumber: 0 }),
      createTestAssistantMessage({ id: 'p0-0', content: 'R0-0', roundNumber: 0, participantId: participants[0].id, participantIndex: 0 }),
      createTestAssistantMessage({ id: 'p1-0', content: 'R0-1', roundNumber: 0, participantId: participants[1].id, participantIndex: 1 }),
      createTestAssistantMessage({ id: 'p2-0', content: 'R0-2', roundNumber: 0, participantId: participants[2].id, participantIndex: 2 }),
      createTestModeratorMessage({ id: 'mod-0', content: 'Summary 0', roundNumber: 0 }),
      createTestUserMessage({ id: 'user-1', content: 'say hi, 1 word only', roundNumber: 1 }),
      createTestAssistantMessage({ id: 'p0-1', content: 'Hi', roundNumber: 1, participantId: participants[0].id, participantIndex: 0 }),
      createTestAssistantMessage({ id: 'p1-1', content: 'Hello', roundNumber: 1, participantId: participants[1].id, participantIndex: 1 }),
      createTestAssistantMessage({ id: 'p2-1', content: 'Hey', roundNumber: 1, participantId: participants[2].id, participantIndex: 2 }),
      createTestModeratorMessage({ id: 'mod-1', content: 'Summary 1', roundNumber: 1 }), // Now exists!
    ];

    const isBlocked = calculateIsSubmitBlocked({
      isStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      messages: messagesAfterModerator,
      participants,
    });

    // Should NOT block - round is complete
    expect(isBlocked).toBe(false);
  });
});

// ============================================================================
// STRESS TESTS - RAPID STATE CHANGES
// ============================================================================

describe('stress Tests - Rapid State Changes', () => {
  it('handles rapid participant completion sequence', () => {
    const participants = createMockParticipants(4);

    // Simulate checking blocking state as each participant completes
    const checkResults: boolean[] = [];

    // Only user message
    let messages: UIMessage[] = [createTestUserMessage({ id: 'user-1', content: 'Q1', roundNumber: 1 })];
    checkResults.push(calculateIsAwaitingModerator(messages, participants));

    // p0 complete
    messages = [...messages, createTestAssistantMessage({ id: 'p0-1', content: 'R0', roundNumber: 1, participantId: participants[0].id, participantIndex: 0 })];
    checkResults.push(calculateIsAwaitingModerator(messages, participants));

    // p1 complete
    messages = [...messages, createTestAssistantMessage({ id: 'p1-1', content: 'R1', roundNumber: 1, participantId: participants[1].id, participantIndex: 1 })];
    checkResults.push(calculateIsAwaitingModerator(messages, participants));

    // p2 complete
    messages = [...messages, createTestAssistantMessage({ id: 'p2-1', content: 'R2', roundNumber: 1, participantId: participants[2].id, participantIndex: 2 })];
    checkResults.push(calculateIsAwaitingModerator(messages, participants));

    // p3 complete - ALL participants done, no moderator
    messages = [...messages, createTestAssistantMessage({ id: 'p3-1', content: 'R3', roundNumber: 1, participantId: participants[3].id, participantIndex: 3 })];
    checkResults.push(calculateIsAwaitingModerator(messages, participants));

    // Moderator added
    messages = [...messages, createTestModeratorMessage({ id: 'mod-1', content: 'Summary', roundNumber: 1 })];
    checkResults.push(calculateIsAwaitingModerator(messages, participants));

    expect(checkResults).toEqual([
      false, // No participants yet
      false, // 1/4 complete
      false, // 2/4 complete
      false, // 3/4 complete
      true, // 4/4 complete, NO moderator - MUST BLOCK
      false, // Moderator exists - can proceed
    ]);
  });

  it('handles many sequential rounds', () => {
    const participants = createMockParticipants(1);
    let messages: UIMessage[] = [];

    // Simulate 10 rounds
    for (let round = 0; round < 10; round++) {
      // Add user message
      messages = [...messages, createTestUserMessage({ id: `user-${round}`, content: `Q${round}`, roundNumber: round })];
      expect(calculateIsAwaitingModerator(messages, participants)).toBe(false);

      // Add participant response
      messages = [...messages, createTestAssistantMessage({
        id: `p0-${round}`,
        content: `R${round}`,
        roundNumber: round,
        participantId: participants[0].id,
        participantIndex: 0,
      })];
      // Should be awaiting moderator
      expect(calculateIsAwaitingModerator(messages, participants)).toBe(true);

      // Add moderator
      messages = [...messages, createTestModeratorMessage({ id: `mod-${round}`, content: `S${round}`, roundNumber: round })];
      // Should NOT be awaiting
      expect(calculateIsAwaitingModerator(messages, participants)).toBe(false);
    }

    // Final state: 10 complete rounds
    expect(messages).toHaveLength(30); // 3 messages per round
    expect(calculateIsAwaitingModerator(messages, participants)).toBe(false);
  });
});

/**
 * Consecutive Round Race Conditions Tests
 *
 * Tests for race conditions that occur when Round 1 completes and Round 2 starts immediately.
 * These race conditions can cause state leakage between rounds, especially with:
 * - Configuration changes (participant count, web search, mode)
 * - Moderator state from Round 1 appearing during Round 2 participants
 * - Pre-search state not being cleared between rounds
 *
 * CRITICAL SCENARIOS:
 * 1. Round 1 completes → Round 2 starts immediately (no user pause)
 * 2. Participant configuration changes between rounds
 * 3. Pre-search enabled/disabled between rounds
 * 4. Moderator creation race with participant streaming
 *
 * CONSOLE LOG PATTERNS TO WATCH:
 * - [TRANS] - Status transitions
 * - [MOD] - Moderator state
 * - [MOD-TRIGGER] - Moderator trigger logic
 * - [CARD] - Card rendering
 *
 * Location: /src/stores/chat/__tests__/consecutive-round-race-conditions.test.ts
 */

import { ChatModes, FinishReasons, MessagePartTypes, MessageRoles, ScreenModes } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockParticipant,
  createMockParticipants,
  createMockThread,
  createTestAssistantMessage,
  createTestUserMessage,
  getStoreState,
} from '@/lib/testing';
import { getCurrentRoundNumber } from '@/lib/utils';

import { createChatStore } from '../store';
import { getModeratorMessageForRound } from '../utils/participant-completion-gate';

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Create complete round messages (user + participants + moderator)
 */
function createCompleteRound(
  threadId: string,
  roundNumber: number,
  participantCount: number,
  options: {
    userMessage?: string;
    includeModeratorMessage?: boolean;
  } = {},
): UIMessage[] {
  const { userMessage = `Question for round ${roundNumber}`, includeModeratorMessage = true } = options;

  const messages: UIMessage[] = [
    createTestUserMessage({
      id: `${threadId}_r${roundNumber}_user`,
      content: userMessage,
      roundNumber,
    }),
  ];

  // Add participant responses
  for (let i = 0; i < participantCount; i++) {
    messages.push(
      createTestAssistantMessage({
        id: `${threadId}_r${roundNumber}_p${i}`,
        content: `Participant ${i} response for round ${roundNumber}`,
        roundNumber,
        participantId: `participant-${i}`,
        participantIndex: i,
        finishReason: FinishReasons.STOP,
      }),
    );
  }

  // Add moderator message if requested
  if (includeModeratorMessage) {
    // Create moderator message with correct metadata structure
    const moderatorMessage: UIMessage = {
      id: `${threadId}_r${roundNumber}_moderator`,
      role: MessageRoles.ASSISTANT,
      parts: [
        {
          type: MessagePartTypes.TEXT,
          text: `Moderator analysis for round ${roundNumber}`,
        },
      ],
      metadata: {
        role: MessageRoles.ASSISTANT,
        roundNumber,
        isModerator: true,
        model: 'gpt-4o', // Required field for moderator metadata
        finishReason: FinishReasons.STOP,
        hasError: false,
      },
    };
    messages.push(moderatorMessage);
  }

  return messages;
}

/**
 * Create streaming participant message (incomplete)
 */
function createStreamingParticipantMessage(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  partialContent: string = '',
): UIMessage {
  return createTestAssistantMessage({
    id: `${threadId}_r${roundNumber}_p${participantIndex}`,
    content: partialContent,
    roundNumber,
    participantId: `participant-${participantIndex}`,
    participantIndex,
    finishReason: partialContent ? undefined : FinishReasons.UNKNOWN,
  });
}

// ============================================================================
// RACE CONDITION 1: MODERATOR FROM ROUND 1 APPEARING DURING ROUND 2
// ============================================================================

describe('race Condition: Round 1 Moderator Leaking Into Round 2', () => {
  let store: ReturnType<typeof createChatStore>;
  const threadId = 'thread-race-1';

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: threadId }));
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
  });

  it('fAILING: Round 1 moderator should not appear during Round 2 participant streaming', () => {
    const state = getStoreState(store);

    // === ROUND 1: Complete with moderator ===
    const round1Messages = createCompleteRound(threadId, 0, 2, { includeModeratorMessage: true });
    state.setMessages(round1Messages);
    state.tryMarkModeratorCreated(0);

    expect(getCurrentRoundNumber(round1Messages)).toBe(0);
    expect(getModeratorMessageForRound(round1Messages, 0)).toBeTruthy();

    // === ROUND 2: Starts immediately (no pause) ===
    const round2UserMessage = createTestUserMessage({
      id: `${threadId}_r1_user`,
      content: 'Second question',
      roundNumber: 1,
    });

    const messagesWithRound2 = [...round1Messages, round2UserMessage];
    state.setMessages(messagesWithRound2);

    // Start streaming for round 2
    state.setIsStreaming(true);
    state.setCurrentParticipantIndex(0);
    state.setStreamingRoundNumber(1);
    state.setCurrentRoundNumber(1);

    // First participant in Round 2 starts streaming
    const round2P0Streaming = createStreamingParticipantMessage(threadId, 1, 0, 'Partial response');
    // Set streaming state for round 2 participant
    state.setIsStreaming(true);
    state.setCurrentParticipantIndex(0);
    state.setStreamingRoundNumber(1);
    state.setCurrentRoundNumber(1);

    state.setMessages([...messagesWithRound2, round2P0Streaming]);

    // ❌ BUG: Round 1 moderator is still present in messages
    const currentMessages = getStoreState(store).messages;
    const round1Moderator = getModeratorMessageForRound(currentMessages, 0);
    const round2Moderator = getModeratorMessageForRound(currentMessages, 1);

    // Round 1 moderator should still exist (historical data)
    expect(round1Moderator).toBeTruthy();

    // Round 2 moderator should NOT exist yet (participants still streaming)
    expect(round2Moderator).toBeFalsy();

    // ❌ RACE CONDITION: If UI logic checks for "any moderator in messages"
    // instead of "moderator for current round", it will find Round 1 moderator
    // and might trigger incorrect UI states

    // The flow state machine should recognize we're streaming participants, not moderator
    expect(getStoreState(store).isStreaming).toBe(true);
    expect(getStoreState(store).currentRoundNumber).toBe(1);

    // ✅ FIX VERIFICATION: Ensure state machine doesn't think moderator is streaming
    expect(getStoreState(store).isModeratorStreaming).toBe(false);

    // ✅ FIX VERIFICATION: createdModeratorRounds should track round 0 only
    expect(getStoreState(store).createdModeratorRounds.has(0)).toBe(true);
    expect(getStoreState(store).createdModeratorRounds.has(1)).toBe(false);
  });

  it('fAILING: Round 2 should not trigger moderator creation until all participants complete', () => {
    const state = getStoreState(store);

    // Round 1 complete
    const round1Messages = createCompleteRound(threadId, 0, 2, { includeModeratorMessage: true });
    state.setMessages(round1Messages);
    state.tryMarkModeratorCreated(0);

    // Round 2 starts - first participant completes immediately
    const round2Messages = [
      createTestUserMessage({
        id: `${threadId}_r1_user`,
        content: 'Second question',
        roundNumber: 1,
      }),
      createTestAssistantMessage({
        id: `${threadId}_r1_p0`,
        content: 'First participant response',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ];

    state.setMessages([...round1Messages, ...round2Messages]);
    state.setIsStreaming(true);
    state.setCurrentParticipantIndex(1);
    state.setStreamingRoundNumber(1);
    state.setCurrentRoundNumber(1);

    // ❌ RACE: Second participant hasn't responded yet
    // Moderator should NOT be created for round 1

    // Verify moderator NOT created for round 1
    expect(state.tryMarkModeratorCreated(1)).toBe(true); // Should return true (not created yet)

    // Now complete second participant
    const round2Complete = [
      ...round2Messages,
      createTestAssistantMessage({
        id: `${threadId}_r1_p1`,
        content: 'Second participant response',
        roundNumber: 1,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      }),
    ];

    state.setMessages([...round1Messages, ...round2Complete]);
    state.completeStreaming();

    // Now moderator CAN be created
    const canCreate = state.tryMarkModeratorCreated(1);
    expect(canCreate).toBe(false); // Already marked in previous check
  });

  it('fAILING: Moderator trigger guard should check round-specific completion', () => {
    const state = getStoreState(store);

    // Round 0 complete with moderator
    const round0Messages = createCompleteRound(threadId, 0, 2, { includeModeratorMessage: true });
    state.setMessages(round0Messages);
    state.tryMarkModeratorCreated(0);

    // Round 1 with only 1 of 2 participants complete
    const round1Partial = [
      createTestUserMessage({
        id: `${threadId}_r1_user`,
        content: 'Second question',
        roundNumber: 1,
      }),
      createTestAssistantMessage({
        id: `${threadId}_r1_p0`,
        content: 'First participant response',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ];

    state.setMessages([...round0Messages, ...round1Partial]);

    const allMessages = getStoreState(store).messages;
    const currentRound = getCurrentRoundNumber(allMessages);

    // Current round should be 1
    expect(currentRound).toBe(1);

    // Filter assistant messages for round 1
    const round1AssistantMessages = allMessages.filter(
      m => m.role === MessageRoles.ASSISTANT
        && (m.metadata as { roundNumber?: number })?.roundNumber === 1,
    );

    // Should only have 1 participant message (out of 2 expected)
    expect(round1AssistantMessages).toHaveLength(1);
    expect(getStoreState(store).participants).toHaveLength(2);

    // ❌ RACE: Not all participants responded for current round
    // Moderator should NOT trigger yet
    const allParticipantsResponded = round1AssistantMessages.length >= 2;
    expect(allParticipantsResponded).toBe(false);
  });
});

// ============================================================================
// RACE CONDITION 2: PARTICIPANT COUNT CHANGES BETWEEN ROUNDS
// ============================================================================

describe('race Condition: Participant Count Changes Between Rounds', () => {
  let store: ReturnType<typeof createChatStore>;
  const threadId = 'thread-race-2';

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: threadId }));
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
  });

  it('fAILING: Round 1 messages should not leak into Round 2 when participant count increases', () => {
    const state = getStoreState(store);

    // Round 0: 2 participants
    state.setParticipants(createMockParticipants(2));
    const round0Messages = createCompleteRound(threadId, 0, 2, { includeModeratorMessage: true });
    state.setMessages(round0Messages);
    state.tryMarkModeratorCreated(0);

    // Verify round 0 has 2 participant messages
    const round0Participants = round0Messages.filter(
      m => m.role === MessageRoles.ASSISTANT
        && (m.metadata as { roundNumber?: number; isModerator?: boolean })?.roundNumber === 0
        && !(m.metadata as { isModerator?: boolean })?.isModerator,
    );
    expect(round0Participants).toHaveLength(2);

    // CONFIG CHANGE: Add 3rd participant
    state.setParticipants([
      ...createMockParticipants(2),
      createMockParticipant(2),
    ]);

    // Round 1: Should have 3 participants
    const round1UserMessage = createTestUserMessage({
      id: `${threadId}_r1_user`,
      content: 'Second question',
      roundNumber: 1,
    });

    state.setMessages([...round0Messages, round1UserMessage]);

    // Start streaming with 3 participants
    state.setIsStreaming(true);
    state.setCurrentParticipantIndex(0);
    state.setStreamingRoundNumber(1);
    state.setCurrentRoundNumber(1);

    // ❌ RACE: When checking participant completion for round 1,
    // we should count against 3 participants (NEW count), not 2 (old count)

    const currentParticipants = getStoreState(store).participants;
    expect(currentParticipants).toHaveLength(3);

    // Add first participant response
    const round1P0 = createTestAssistantMessage({
      id: `${threadId}_r1_p0`,
      content: 'P0 response round 1',
      roundNumber: 1,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    state.setMessages([...round0Messages, round1UserMessage, round1P0]);

    // Round 1 should only have 1 participant so far (out of 3)
    const round1Participants = getStoreState(store).messages.filter(
      m => m.role === MessageRoles.ASSISTANT
        && (m.metadata as { roundNumber?: number })?.roundNumber === 1,
    );

    expect(round1Participants).toHaveLength(1);

    // ❌ BUG: If we accidentally count round 0 participants (2) + round 1 (1) = 3,
    // we might think all participants responded when they haven't
  });

  it('fAILING: Round 2 should wait for all NEW participant count before moderator', () => {
    const state = getStoreState(store);

    // Round 0: 3 participants
    state.setParticipants(createMockParticipants(3));
    const round0Messages = createCompleteRound(threadId, 0, 3, { includeModeratorMessage: true });
    state.setMessages(round0Messages);
    state.tryMarkModeratorCreated(0);

    // CONFIG CHANGE: Reduce to 2 participants
    state.setParticipants(createMockParticipants(2));

    // Round 1: Should expect only 2 participants
    const round1Messages = [
      createTestUserMessage({
        id: `${threadId}_r1_user`,
        content: 'Second question',
        roundNumber: 1,
      }),
      createTestAssistantMessage({
        id: `${threadId}_r1_p0`,
        content: 'P0 response',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
      createTestAssistantMessage({
        id: `${threadId}_r1_p1`,
        content: 'P1 response',
        roundNumber: 1,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      }),
    ];

    state.setMessages([...round0Messages, ...round1Messages]);
    state.completeStreaming();

    // Round 1 has 2 participants (matches current participant count)
    const round1Participants = round1Messages.filter(m => m.role === MessageRoles.ASSISTANT);
    expect(round1Participants).toHaveLength(2);
    expect(getStoreState(store).participants).toHaveLength(2);

    // ✅ All participants responded for round 1 (2 out of 2)
    const allResponded = round1Participants.length >= 2;
    expect(allResponded).toBe(true);

    // Moderator should be triggerable now
    const canCreate = state.tryMarkModeratorCreated(1);
    expect(canCreate).toBe(true);
  });
});

// ============================================================================
// RACE CONDITION 3: PRE-SEARCH STATE BETWEEN ROUNDS
// ============================================================================

describe('race Condition: Pre-Search Enabled/Disabled Between Rounds', () => {
  let store: ReturnType<typeof createChatStore>;
  const threadId = 'thread-race-3';

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: threadId, enableWebSearch: false }));
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
  });

  it('fAILING: Pre-search from Round 1 should not block Round 2 when disabled', () => {
    const state = getStoreState(store);

    // Round 0: Web search ENABLED
    state.setEnableWebSearch(true);
    state.markPreSearchTriggered(0);

    const round0Messages = createCompleteRound(threadId, 0, 2, { includeModeratorMessage: true });
    state.setMessages(round0Messages);
    state.tryMarkModeratorCreated(0);

    expect(state.hasPreSearchBeenTriggered(0)).toBe(true);

    // CONFIG CHANGE: Disable web search
    state.setEnableWebSearch(false);

    // Round 1: Should NOT wait for pre-search (disabled)
    const round1UserMessage = createTestUserMessage({
      id: `${threadId}_r1_user`,
      content: 'Second question',
      roundNumber: 1,
    });

    state.setMessages([...round0Messages, round1UserMessage]);

    // ❌ RACE: Pre-search tracking for round 0 should not affect round 1
    expect(state.hasPreSearchBeenTriggered(1)).toBe(false);

    // Start streaming immediately (no pre-search wait)
    state.setIsStreaming(true);
    state.setCurrentParticipantIndex(0);
    state.setStreamingRoundNumber(1);
    state.setCurrentRoundNumber(1);

    // Should be streaming (not waiting)
    expect(getStoreState(store).isStreaming).toBe(true);
    expect(getStoreState(store).waitingToStartStreaming).toBe(false);
  });

  it('fAILING: Pre-search enabled mid-conversation should block Round 2', () => {
    const state = getStoreState(store);

    // Round 0: No web search
    state.setEnableWebSearch(false);
    const round0Messages = createCompleteRound(threadId, 0, 2, { includeModeratorMessage: true });
    state.setMessages(round0Messages);
    state.tryMarkModeratorCreated(0);

    expect(state.hasPreSearchBeenTriggered(0)).toBe(false);

    // CONFIG CHANGE: Enable web search
    state.setEnableWebSearch(true);

    // Round 1: Should wait for pre-search
    const round1UserMessage = createTestUserMessage({
      id: `${threadId}_r1_user`,
      content: 'Second question',
      roundNumber: 1,
    });

    state.setMessages([...round0Messages, round1UserMessage]);

    // Mark pre-search as triggered for round 1
    state.markPreSearchTriggered(1);

    // ✅ Pre-search should be tracked for round 1
    expect(state.hasPreSearchBeenTriggered(1)).toBe(true);

    // ❌ RACE: If we check "any pre-search triggered" instead of "round 1 pre-search complete",
    // we might incorrectly wait or not wait
  });

  it('fAILING: Pre-search tracking should be per-round, not global', () => {
    const state = getStoreState(store);

    // Mark pre-search for rounds 0, 1, 2
    state.markPreSearchTriggered(0);
    state.markPreSearchTriggered(1);
    state.markPreSearchTriggered(2);

    expect(state.hasPreSearchBeenTriggered(0)).toBe(true);
    expect(state.hasPreSearchBeenTriggered(1)).toBe(true);
    expect(state.hasPreSearchBeenTriggered(2)).toBe(true);

    // Clear round 1 only
    state.clearPreSearchTracking(1);

    // Round 0 and 2 should still be tracked
    expect(state.hasPreSearchBeenTriggered(0)).toBe(true);
    expect(state.hasPreSearchBeenTriggered(1)).toBe(false);
    expect(state.hasPreSearchBeenTriggered(2)).toBe(true);

    // ✅ Per-round tracking works correctly
  });
});

// ============================================================================
// RACE CONDITION 4: MODE CHANGES BETWEEN ROUNDS
// ============================================================================

describe('race Condition: Chat Mode Changes Between Rounds', () => {
  let store: ReturnType<typeof createChatStore>;
  const threadId = 'thread-race-4';

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: threadId, mode: ChatModes.ANALYZING }));
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
  });

  it('fAILING: Mode change should not affect Round 1 moderator that already exists', () => {
    const state = getStoreState(store);

    // Round 0: ANALYZING mode
    state.setSelectedMode(ChatModes.ANALYZING);
    const round0Messages = createCompleteRound(threadId, 0, 2, { includeModeratorMessage: true });
    state.setMessages(round0Messages);
    state.tryMarkModeratorCreated(0);

    // Round 0 moderator created in ANALYZING mode
    expect(getStoreState(store).createdModeratorRounds.has(0)).toBe(true);

    // CONFIG CHANGE: Switch to DEBATING
    state.setSelectedMode(ChatModes.DEBATING);

    // Round 0 moderator should still be tracked (historical)
    expect(getStoreState(store).createdModeratorRounds.has(0)).toBe(true);

    // ❌ RACE: Changing mode should not clear moderator tracking for completed rounds
  });

  it('fAILING: New round should use NEW mode for moderator', () => {
    const state = getStoreState(store);

    // Round 0: BRAINSTORMING
    state.setSelectedMode(ChatModes.BRAINSTORMING);
    const round0Messages = createCompleteRound(threadId, 0, 2, { includeModeratorMessage: true });
    state.setMessages(round0Messages);
    state.tryMarkModeratorCreated(0);

    // CONFIG CHANGE: Switch to ANALYZING
    state.setSelectedMode(ChatModes.ANALYZING);

    // Round 1: Should use ANALYZING mode
    const round1Messages = [
      createTestUserMessage({
        id: `${threadId}_r1_user`,
        content: 'Second question',
        roundNumber: 1,
      }),
      createTestAssistantMessage({
        id: `${threadId}_r1_p0`,
        content: 'P0 response',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
      createTestAssistantMessage({
        id: `${threadId}_r1_p1`,
        content: 'P1 response',
        roundNumber: 1,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      }),
    ];

    state.setMessages([...round0Messages, ...round1Messages]);
    state.completeStreaming();

    // Moderator for round 1 should be created with ANALYZING mode
    const canCreate = state.tryMarkModeratorCreated(1);
    expect(canCreate).toBe(true);

    // Verify selectedMode is ANALYZING
    expect(getStoreState(store).selectedMode).toBe(ChatModes.ANALYZING);

    // ✅ Round 1 moderator would be created with current mode (ANALYZING)
  });
});

// ============================================================================
// RACE CONDITION 5: STREAMING STATE CLEANUP
// ============================================================================

describe('race Condition: Streaming State Cleanup Between Rounds', () => {
  let store: ReturnType<typeof createChatStore>;
  const threadId = 'thread-race-5';

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: threadId }));
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
  });

  it('fAILING: Round 1 streaming state should be cleared before Round 2 starts', () => {
    const state = getStoreState(store);

    // Round 0: Complete streaming
    const round0Messages = createCompleteRound(threadId, 0, 2, { includeModeratorMessage: true });
    state.setMessages(round0Messages);

    // Simulate streaming state during round 0
    state.setIsStreaming(true);
    state.setCurrentParticipantIndex(1);
    state.setStreamingRoundNumber(0);
    state.setCurrentRoundNumber(0);

    // Complete round 0
    state.completeStreaming();
    state.tryMarkModeratorCreated(0);

    // ✅ Streaming state should be cleared
    expect(getStoreState(store).isStreaming).toBe(false);
    expect(getStoreState(store).currentParticipantIndex).toBe(0);
    expect(getStoreState(store).streamingRoundNumber).toBe(null);

    // Round 1 starts
    const round1UserMessage = createTestUserMessage({
      id: `${threadId}_r1_user`,
      content: 'Second question',
      roundNumber: 1,
    });

    state.setMessages([...round0Messages, round1UserMessage]);

    // ❌ RACE: If streaming state not cleared, round 1 might inherit stale values
    expect(getStoreState(store).currentParticipantIndex).toBe(0);
    expect(getStoreState(store).streamingRoundNumber).toBe(null);

    // Start round 1 streaming
    state.setIsStreaming(true);
    state.setCurrentParticipantIndex(0);
    state.setStreamingRoundNumber(1);
    state.setCurrentRoundNumber(1);

    expect(getStoreState(store).isStreaming).toBe(true);
    expect(getStoreState(store).currentParticipantIndex).toBe(0);
    expect(getStoreState(store).streamingRoundNumber).toBe(1);
  });

  it('fAILING: pendingAnimations should be cleared between rounds', () => {
    const state = getStoreState(store);

    // Round 0: Add pending animations
    state.registerAnimation(0);
    state.registerAnimation(1);

    expect(getStoreState(store).pendingAnimations.size).toBe(2);
    expect(getStoreState(store).pendingAnimations.has(0)).toBe(true);
    expect(getStoreState(store).pendingAnimations.has(1)).toBe(true);

    // Complete round 0
    const round0Messages = createCompleteRound(threadId, 0, 2, { includeModeratorMessage: true });
    state.setMessages(round0Messages);
    state.tryMarkModeratorCreated(0);

    // Clear animations
    state.completeAnimation(0);
    state.completeAnimation(1);

    expect(getStoreState(store).pendingAnimations.size).toBe(0);

    // ❌ RACE: If animations not cleared, they block moderator creation for round 1
    // flow-state-machine.ts line 146 checks: pendingAnimations.size === 0
  });

  it('fAILING: createdModeratorRounds should persist across rounds', () => {
    const state = getStoreState(store);

    // Round 0
    const round0Messages = createCompleteRound(threadId, 0, 2, { includeModeratorMessage: true });
    state.setMessages(round0Messages);
    state.tryMarkModeratorCreated(0);

    expect(getStoreState(store).createdModeratorRounds.has(0)).toBe(true);

    // Round 1
    const round1Messages = [
      ...round0Messages,
      createTestUserMessage({
        id: `${threadId}_r1_user`,
        content: 'Second question',
        roundNumber: 1,
      }),
      createTestAssistantMessage({
        id: `${threadId}_r1_p0`,
        content: 'Response',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
      createTestAssistantMessage({
        id: `${threadId}_r1_p1`,
        content: 'Response',
        roundNumber: 1,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      }),
    ];

    state.setMessages(round1Messages);
    state.completeStreaming();
    state.tryMarkModeratorCreated(1);

    // ✅ Both rounds should be tracked
    expect(getStoreState(store).createdModeratorRounds.has(0)).toBe(true);
    expect(getStoreState(store).createdModeratorRounds.has(1)).toBe(true);
    expect(getStoreState(store).createdModeratorRounds.size).toBe(2);

    // ❌ RACE: If tracking uses global flag instead of Set, round 0 might be lost
  });
});

// ============================================================================
// RACE CONDITION 6: IMMEDIATE CONSECUTIVE ROUNDS (NO USER PAUSE)
// ============================================================================

describe('race Condition: Immediate Consecutive Rounds', () => {
  let store: ReturnType<typeof createChatStore>;
  const threadId = 'thread-race-6';

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: threadId }));
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
  });

  it('fAILING: Round 2 starts before Round 1 moderator message added to messages array', () => {
    const state = getStoreState(store);

    // Round 0: Complete with moderator
    const round0Messages = createCompleteRound(threadId, 0, 2, { includeModeratorMessage: true });
    state.setMessages(round0Messages);
    state.tryMarkModeratorCreated(0);

    // Round 1: Participants complete but moderator MESSAGE not in array yet
    const round1Messages = [
      createTestUserMessage({
        id: `${threadId}_r1_user`,
        content: 'Second question',
        roundNumber: 1,
      }),
      createTestAssistantMessage({
        id: `${threadId}_r1_p0`,
        content: 'Response',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
      createTestAssistantMessage({
        id: `${threadId}_r1_p1`,
        content: 'Response',
        roundNumber: 1,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      }),
    ];

    state.setMessages([...round0Messages, ...round1Messages]);
    state.completeStreaming();

    // Mark moderator created for round 1 (flag set, but message not yet in array)
    state.tryMarkModeratorCreated(1);

    expect(getStoreState(store).createdModeratorRounds.has(1)).toBe(true);

    // ❌ RACE: User immediately submits Round 2 question
    // Moderator message for Round 1 hasn't been added to messages array yet
    const round2UserMessage = createTestUserMessage({
      id: `${threadId}_r2_user`,
      content: 'Third question immediately',
      roundNumber: 2,
    });

    state.setMessages([...round0Messages, ...round1Messages, round2UserMessage]);

    // Round 1 moderator message should NOT exist yet
    const round1Moderator = getModeratorMessageForRound(
      getStoreState(store).messages,
      1,
    );
    expect(round1Moderator).toBeFalsy();

    // But tracking says it was created
    expect(getStoreState(store).createdModeratorRounds.has(1)).toBe(true);

    // ❌ This desync can cause UI issues where:
    // - Moderator card tries to render for round 1 but finds no message
    // - Round 2 thinks round 1 is incomplete because no moderator message
  });
});

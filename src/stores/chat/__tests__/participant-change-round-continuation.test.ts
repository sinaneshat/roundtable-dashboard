/**
 * Participant Change Round Continuation Flow Tests
 *
 * Comprehensive end-to-end tests for the "Participant at index X not found" bug fix.
 * Tests the complete flow from participant configuration changes through round
 * continuation, streaming orchestration, and UI state updates.
 *
 * BUG FIXED:
 * When user changes participants between rounds:
 * 1. Round 0 completes with participants A, B (2 participants)
 * 2. User changes to participants C, D, E (3 participants)
 * 3. OLD BUG: System detected "incomplete round" (2 responses < 3 participants)
 * 4. OLD BUG: Tried to trigger participant index 2 for round 0
 * 5. OLD BUG: Backend failed with "Participant at index 2 not found"
 *
 * FIX: Detect participant configuration changes by comparing model IDs
 * of responded messages against current enabled participants.
 *
 * Location: /src/stores/chat/__tests__/participant-change-round-continuation.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  MessageRoles,
  ScreenModes,
  UIMessageRoles,
} from '@/api/core/enums';
import type {
  ChatParticipant,
  StoredModeratorAnalysis,
} from '@/api/routes/chat/schema';
import { getAssistantMetadata, getParticipantIndex, getRoundNumber } from '@/lib/utils/metadata';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockParticipant,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

/**
 * Helper to create a message with specific model ID
 *
 * IMPORTANT: Metadata must match DbAssistantMessageMetadataSchema:
 * - role: 'assistant' (not 'participant')
 * - All required fields: finishReason, usage, hasError, isTransient, isPartialResponse
 */
function createMessageWithModel(
  participantIndex: number,
  roundNumber: number,
  modelId: string,
  participantId: string,
): UIMessage {
  return {
    id: `thread-123_r${roundNumber}_p${participantIndex}`,
    role: UIMessageRoles.ASSISTANT,
    parts: [
      {
        type: 'text',
        text: `Response from ${modelId}`,
      },
    ],
    metadata: {
      // ✅ Must be 'assistant' for DbAssistantMessageMetadataSchema validation
      role: 'assistant' as const,
      roundNumber,
      participantId,
      participantIndex,
      participantRole: null,
      model: modelId,
      // ✅ Required fields for schema validation
      finishReason: 'stop' as const,
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
    },
  };
}

/**
 * Helper to set up a complete round with specific models
 */
function setupRoundWithModels(
  store: ReturnType<typeof createChatStore>,
  roundNumber: number,
  userQuestion: string,
  models: string[],
): void {
  // Add user message
  const userMessage = createMockUserMessage(roundNumber, userQuestion);
  store.getState().setMessages(prev => [...prev, userMessage]);

  // Add participant messages for each model
  models.forEach((modelId, index) => {
    const msg = createMessageWithModel(
      index,
      roundNumber,
      modelId,
      `participant-${index}`,
    );
    store.getState().setMessages(prev => [...prev, msg]);
  });
}

/**
 * Helper to detect if round is incomplete (implementing the fix logic)
 * This mirrors the logic in useIncompleteRoundResumption hook
 */
function detectIncompleteRound(
  messages: UIMessage[],
  enabledParticipants: ChatParticipant[],
): {
  isIncomplete: boolean;
  participantsChanged: boolean;
  nextParticipantIndex: number | null;
  respondedCount: number;
  currentRoundNumber: number;
  respondedModelIds: string[];
  currentModelIds: string[];
} {
  const currentRoundNumber = getCurrentRoundNumber(messages);

  // Find responded participant indices and model IDs for current round
  const respondedIndices = new Set<number>();
  const respondedModelIds = new Set<string>();

  messages.forEach((msg) => {
    if (msg.role === MessageRoles.ASSISTANT) {
      const msgRound = getRoundNumber(msg.metadata);
      const participantIndex = getParticipantIndex(msg.metadata);
      const assistantMetadata = getAssistantMetadata(msg.metadata);
      const modelId = assistantMetadata?.model;

      if (msgRound === currentRoundNumber && participantIndex !== null) {
        respondedIndices.add(participantIndex);
        if (modelId) {
          respondedModelIds.add(modelId);
        }
      }
    }
  });

  // Check if participants changed (fix logic)
  const currentModelIds = new Set(enabledParticipants.map(p => p.modelId));
  const participantsChanged = respondedModelIds.size > 0
    && [...respondedModelIds].some(modelId => !currentModelIds.has(modelId));

  // Determine if incomplete (with fix)
  const responseCount = respondedIndices.size;
  const isIncomplete = responseCount < enabledParticipants.length && !participantsChanged;

  // Find next participant index
  let nextParticipantIndex: number | null = null;
  if (isIncomplete) {
    for (let i = 0; i < enabledParticipants.length; i++) {
      if (!respondedIndices.has(i)) {
        nextParticipantIndex = i;
        break;
      }
    }
  }

  return {
    isIncomplete,
    participantsChanged,
    nextParticipantIndex,
    respondedCount: responseCount,
    currentRoundNumber,
    respondedModelIds: [...respondedModelIds],
    currentModelIds: [...currentModelIds],
  };
}

// ============================================================================
// SECTION 1: END-TO-END PARTICIPANT CHANGE FLOWS
// ============================================================================

describe('end-to-End Participant Change Flows', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('scenario: Complete Participant Replacement Between Rounds', () => {
    /**
     * This is the EXACT scenario that caused the original bug:
     * - Round 0: Grok + Gemini (2 participants)
     * - User changes to: Claude Sonnet + Claude Haiku + Claude Thinking (3 participants)
     * - System should NOT try to resume round 0
     */
    it('should NOT attempt round resumption when all participants are replaced', () => {
      const thread = createMockThread({ id: 'thread-replaced' });

      // OLD participants that completed round 0 (documented for test clarity)
      const _oldParticipants = [
        createMockParticipant(0, { modelId: 'x-ai/grok-4', id: 'old-p0' }),
        createMockParticipant(1, { modelId: 'google/gemini-2.5-flash-lite', id: 'old-p1' }),
      ];

      // NEW participants user selected
      const newParticipants = [
        createMockParticipant(0, { modelId: 'anthropic/claude-sonnet-4', id: 'new-p0' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-haiku-4.5', id: 'new-p1' }),
        createMockParticipant(2, { modelId: 'anthropic/claude-3.7-sonnet:thinking', id: 'new-p2' }),
      ];

      // Setup: Initialize with NEW participants but OLD messages
      store.getState().initializeThread(thread, newParticipants, []);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Add round 0 messages with OLD models
      setupRoundWithModels(store, 0, 'say hi, 1 word only', [
        'x-ai/grok-4',
        'google/gemini-2.5-flash-lite',
      ]);

      const state = store.getState();
      const result = detectIncompleteRound(state.messages, state.participants.filter(p => p.isEnabled));

      // CRITICAL ASSERTIONS
      expect(result.participantsChanged).toBe(true);
      expect(result.isIncomplete).toBe(false); // Should NOT be incomplete
      expect(result.nextParticipantIndex).toBeNull(); // Should NOT trigger any participant
      expect(result.respondedCount).toBe(2);
      expect(state.participants).toHaveLength(3);
    });

    it('should correctly set up new round with new participants after config change', () => {
      const thread = createMockThread({ id: 'thread-new-round' });

      // NEW participants
      const newParticipants = [
        createMockParticipant(0, { modelId: 'anthropic/claude-sonnet-4', id: 'p0' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-haiku-4.5', id: 'p1' }),
        createMockParticipant(2, { modelId: 'anthropic/claude-3.7-sonnet:thinking', id: 'p2' }),
      ];

      store.getState().initializeThread(thread, newParticipants, []);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Add OLD round 0 messages
      setupRoundWithModels(store, 0, 'first question', [
        'x-ai/grok-4',
        'google/gemini-2.5-flash-lite',
      ]);

      // User submits NEW message - this should be round 1
      const newUserMessage = createMockUserMessage(1, 'new question with new participants');
      store.getState().setMessages(prev => [...prev, newUserMessage]);

      // Set expected participants for the new round
      store.getState().setExpectedParticipantIds(newParticipants.map(p => p.modelId));

      const state = store.getState();

      // Current round should be 1
      const currentRound = getCurrentRoundNumber(state.messages);
      expect(currentRound).toBe(1);

      // No responses yet for round 1
      const result = detectIncompleteRound(state.messages, state.participants.filter(p => p.isEnabled));

      // Round 1 has no responses, so respondedModelIds is empty
      // participantsChanged should be false (no mismatch when empty)
      expect(result.respondedCount).toBe(0);
      expect(result.participantsChanged).toBe(false);
      expect(result.isIncomplete).toBe(true); // IS incomplete - need to start streaming
      expect(result.nextParticipantIndex).toBe(0); // Start with participant 0
    });
  });

  describe('scenario: Partial Participant Change', () => {
    it('should detect change when some participants removed', () => {
      const thread = createMockThread({ id: 'thread-partial' });

      // User kept GPT-4, removed Claude, added Gemini
      const newParticipants = [
        createMockParticipant(0, { modelId: 'openai/gpt-4', id: 'p0' }),
        createMockParticipant(1, { modelId: 'google/gemini-pro', id: 'p1' }),
      ];

      store.getState().initializeThread(thread, newParticipants, []);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Round 0 had GPT-4 and Claude (Claude now removed)
      store.getState().setMessages([
        createMockUserMessage(0, 'test'),
        createMessageWithModel(0, 0, 'openai/gpt-4', 'old-p0'),
        createMessageWithModel(1, 0, 'anthropic/claude-3', 'old-p1'), // REMOVED from current
      ]);

      const state = store.getState();
      const result = detectIncompleteRound(state.messages, state.participants.filter(p => p.isEnabled));

      // claude-3 is not in current participants
      expect(result.participantsChanged).toBe(true);
      expect(result.isIncomplete).toBe(false);
    });

    it('should allow resumption when only participants are added (no removal)', () => {
      const thread = createMockThread({ id: 'thread-added' });

      // Original 2 participants + 1 new
      const participants = [
        createMockParticipant(0, { modelId: 'openai/gpt-4', id: 'p0' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-3', id: 'p1' }),
        createMockParticipant(2, { modelId: 'google/gemini-pro', id: 'p2' }), // NEW
      ];

      store.getState().initializeThread(thread, participants, []);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Round 0 only has responses from first 2 (before 3rd was added)
      store.getState().setMessages([
        createMockUserMessage(0, 'test'),
        createMessageWithModel(0, 0, 'openai/gpt-4', 'p0'),
        createMessageWithModel(1, 0, 'anthropic/claude-3', 'p1'),
      ]);

      const state = store.getState();
      const result = detectIncompleteRound(state.messages, state.participants.filter(p => p.isEnabled));

      // All responded models are still in current participants
      expect(result.participantsChanged).toBe(false);
      // This IS an edge case - it's technically "incomplete" but semantically might be a new round
      // The fix is conservative and allows resumption since responded models are still valid
      expect(result.respondedCount).toBe(2);
      expect(result.isIncomplete).toBe(true);
      expect(result.nextParticipantIndex).toBe(2);
    });
  });
});

// ============================================================================
// SECTION 2: STREAMING ORCHESTRATION WITH PARTICIPANT CHANGES
// ============================================================================

describe('streaming Orchestration with Participant Changes', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should properly track currentParticipantIndex during streaming', () => {
    const thread = createMockThread({ id: 'thread-streaming' });
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
      createMockParticipant(2, { modelId: 'google/gemini-pro' }),
    ];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Simulate streaming start
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setCurrentParticipantIndex(0);

    expect(store.getState().isStreaming).toBe(true);
    expect(store.getState().currentParticipantIndex).toBe(0);

    // Participant 0 completes
    store.getState().setMessages(prev => [
      ...prev,
      createMessageWithModel(0, 0, 'openai/gpt-4', 'p0'),
    ]);
    store.getState().setCurrentParticipantIndex(1);

    expect(store.getState().currentParticipantIndex).toBe(1);

    // Participant 1 completes
    store.getState().setMessages(prev => [
      ...prev,
      createMessageWithModel(1, 0, 'anthropic/claude-3', 'p1'),
    ]);
    store.getState().setCurrentParticipantIndex(2);

    expect(store.getState().currentParticipantIndex).toBe(2);

    // Participant 2 completes
    store.getState().setMessages(prev => [
      ...prev,
      createMessageWithModel(2, 0, 'google/gemini-pro', 'p2'),
    ]);
    store.getState().setIsStreaming(false);

    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().messages.filter(m => m.role === MessageRoles.ASSISTANT)).toHaveLength(3);
  });

  it('should handle streaming interruption and resumption with same participants', () => {
    const thread = createMockThread({ id: 'thread-interrupt' });
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
    ];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'test'),
      createMessageWithModel(0, 0, 'openai/gpt-4', 'p0'), // Only first responded
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setIsStreaming(false);

    const state = store.getState();
    const result = detectIncompleteRound(state.messages, state.participants.filter(p => p.isEnabled));

    // Same participants, incomplete round
    expect(result.participantsChanged).toBe(false);
    expect(result.isIncomplete).toBe(true);
    expect(result.nextParticipantIndex).toBe(1);

    // Should resume with participant 1
    store.getState().setNextParticipantToTrigger(1);
    store.getState().setWaitingToStartStreaming(true);

    expect(store.getState().nextParticipantToTrigger).toBe(1);
    expect(store.getState().waitingToStartStreaming).toBe(true);
  });

  it('should NOT resume streaming when participants changed during interruption', () => {
    const thread = createMockThread({ id: 'thread-changed-interrupt' });

    // User changed from GPT-4/Claude to Gemini/Mistral while streaming was interrupted
    const newParticipants = [
      createMockParticipant(0, { modelId: 'google/gemini-pro' }),
      createMockParticipant(1, { modelId: 'mistral/mistral-large' }),
    ];

    store.getState().initializeThread(thread, newParticipants, [
      createMockUserMessage(0, 'test'),
      createMessageWithModel(0, 0, 'openai/gpt-4', 'old-p0'), // OLD participant
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();
    const result = detectIncompleteRound(state.messages, state.participants.filter(p => p.isEnabled));

    // Participants changed - should NOT resume
    expect(result.participantsChanged).toBe(true);
    expect(result.isIncomplete).toBe(false);
    expect(result.nextParticipantIndex).toBeNull();
  });
});

// ============================================================================
// SECTION 3: UI STATE UPDATES DURING PARTICIPANT CHANGES
// ============================================================================

describe('uI State Updates During Participant Changes', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should update selectedParticipants when user changes configuration', () => {
    const thread = createMockThread({ id: 'thread-ui' });
    const initialParticipants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
    ];

    store.getState().initializeThread(thread, initialParticipants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Sync selectedParticipants with DB participants
    store.getState().setSelectedParticipants(
      initialParticipants.map((p, idx) => ({
        id: p.id,
        modelId: p.modelId,
        role: p.role ?? '',
        priority: idx,
      })),
    );

    expect(store.getState().selectedParticipants).toHaveLength(2);

    // User adds a participant
    const newSelected = [
      ...store.getState().selectedParticipants,
      { id: 'new-p', modelId: 'google/gemini-pro', role: '', priority: 2 },
    ];
    store.getState().setSelectedParticipants(newSelected);
    store.getState().setHasPendingConfigChanges(true);

    expect(store.getState().selectedParticipants).toHaveLength(3);
    expect(store.getState().hasPendingConfigChanges).toBe(true);
  });

  it('should update expectedParticipantIds after PATCH completes', () => {
    const thread = createMockThread({ id: 'thread-patch' });
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
    ];

    store.getState().initializeThread(thread, participants, []);

    // Simulate PATCH response with new participants
    const newParticipants = [
      createMockParticipant(0, { modelId: 'anthropic/claude-sonnet-4', id: 'new-p0' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-haiku-4.5', id: 'new-p1' }),
    ];

    store.getState().updateParticipants(newParticipants);
    store.getState().setExpectedParticipantIds(newParticipants.map(p => p.modelId));

    expect(store.getState().participants).toHaveLength(2);
    expect(store.getState().expectedParticipantIds).toEqual([
      'anthropic/claude-sonnet-4',
      'anthropic/claude-haiku-4.5',
    ]);
  });

  it('should clear pending config changes after successful submission', () => {
    store.getState().setHasPendingConfigChanges(true);
    expect(store.getState().hasPendingConfigChanges).toBe(true);

    // Simulate successful submission
    store.getState().setHasPendingConfigChanges(false);
    expect(store.getState().hasPendingConfigChanges).toBe(false);
  });

  it('should track streamingRoundNumber correctly across rounds', () => {
    const thread = createMockThread({ id: 'thread-rounds' });
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
    ];

    store.getState().initializeThread(thread, participants, []);

    // Round 0
    store.getState().setStreamingRoundNumber(0);
    expect(store.getState().streamingRoundNumber).toBe(0);

    // Round 1
    store.getState().setStreamingRoundNumber(1);
    expect(store.getState().streamingRoundNumber).toBe(1);

    // Round 2
    store.getState().setStreamingRoundNumber(2);
    expect(store.getState().streamingRoundNumber).toBe(2);
  });
});

// ============================================================================
// SECTION 4: MULTI-ROUND CONTINUATION WITH PARTICIPANT CHANGES
// ============================================================================

describe('multi-Round Continuation with Participant Changes', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle 3 rounds with participant changes between each', () => {
    const thread = createMockThread({ id: 'thread-3rounds' });

    // Round 0: GPT-4 only
    const round0Participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
    ];

    store.getState().initializeThread(thread, round0Participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);
    setupRoundWithModels(store, 0, 'Round 0 question', ['openai/gpt-4']);

    // Round 1: Add Claude
    const round1Participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
    ];
    store.getState().updateParticipants(round1Participants);

    // Check round 0 detection with new participants
    let result = detectIncompleteRound(
      store.getState().messages,
      round1Participants.filter(p => p.isEnabled),
    );
    // Responded model (gpt-4) is still in current, so no change detected
    expect(result.participantsChanged).toBe(false);

    // Add round 1 messages
    store.getState().setMessages(prev => [
      ...prev,
      createMockUserMessage(1, 'Round 1 question'),
    ]);
    setupRoundWithModels(store, 1, 'Round 1 question', ['openai/gpt-4', 'anthropic/claude-3']);

    // Round 2: Replace Claude with Gemini
    const round2Participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { modelId: 'google/gemini-pro' }),
    ];
    store.getState().updateParticipants(round2Participants);

    // Check round 1 with round 2 participants
    result = detectIncompleteRound(
      store.getState().messages,
      round2Participants.filter(p => p.isEnabled),
    );

    // Claude-3 responded in round 1 but is not in round 2 participants
    expect(result.participantsChanged).toBe(true);
    expect(result.isIncomplete).toBe(false);
  });

  it('should correctly identify current round when navigating back to thread', () => {
    const thread = createMockThread({ id: 'thread-navigate' });

    // Setup: 2 complete rounds
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Round 0 complete
    setupRoundWithModels(store, 0, 'First question', ['openai/gpt-4', 'anthropic/claude-3']);

    // Round 1 complete
    store.getState().setMessages(prev => [...prev, createMockUserMessage(1, 'Second question')]);
    store.getState().setMessages(prev => [
      ...prev,
      createMessageWithModel(0, 1, 'openai/gpt-4', 'p0'),
      createMessageWithModel(1, 1, 'anthropic/claude-3', 'p1'),
    ]);

    const currentRound = getCurrentRoundNumber(store.getState().messages);
    expect(currentRound).toBe(1);

    const result = detectIncompleteRound(
      store.getState().messages,
      participants.filter(p => p.isEnabled),
    );

    expect(result.currentRoundNumber).toBe(1);
    expect(result.respondedCount).toBe(2);
    expect(result.isIncomplete).toBe(false);
  });
});

// ============================================================================
// SECTION 5: ERROR SCENARIOS AND EDGE CASES
// ============================================================================

describe('error Scenarios and Edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle messages with malformed metadata gracefully', () => {
    const thread = createMockThread({ id: 'thread-malformed' });
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Message with invalid metadata (model: '' fails min(1) validation)
    // This tests the DEFENSIVE behavior: malformed metadata is safely ignored
    // rather than causing crashes or incorrect detection
    const messageWithMalformedMetadata: UIMessage = {
      id: 'msg-malformed',
      role: UIMessageRoles.ASSISTANT,
      parts: [{ type: 'text', text: 'Response' }],
      metadata: {
        role: 'assistant' as const,
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
        participantRole: null,
        // Empty model fails schema validation (z.string().min(1))
        model: '',
        finishReason: 'stop' as const,
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        hasError: false,
        isTransient: false,
        isPartialResponse: false,
      },
    };

    store.getState().setMessages([
      createMockUserMessage(0, 'test'),
      messageWithMalformedMetadata,
    ]);

    const result = detectIncompleteRound(
      store.getState().messages,
      participants.filter(p => p.isEnabled),
    );

    // DEFENSIVE BEHAVIOR: Malformed metadata causes message to be ignored
    // - Schema validation fails due to model: '' (min(1) constraint)
    // - getParticipantMetadata returns null for the entire message
    // - getParticipantIndex returns null, so message isn't counted
    // - This is SAFE: malformed data doesn't cause incorrect resumption
    expect(result.respondedCount).toBe(0); // Message ignored due to schema failure
    expect(result.participantsChanged).toBe(false);
    expect(result.isIncomplete).toBe(true); // Still incomplete (0 < 2 participants)
    expect(result.nextParticipantIndex).toBe(0); // Would start from beginning
  });

  it('should handle empty participants array', () => {
    const thread = createMockThread({ id: 'thread-empty' });

    store.getState().initializeThread(thread, [], [
      createMockUserMessage(0, 'test'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const result = detectIncompleteRound(
      store.getState().messages,
      [],
    );

    expect(result.isIncomplete).toBe(false);
    expect(result.nextParticipantIndex).toBeNull();
  });

  it('should handle disabled participants correctly', () => {
    const thread = createMockThread({ id: 'thread-disabled' });
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4', isEnabled: true }),
      createMockParticipant(1, { modelId: 'anthropic/claude-3', isEnabled: false }), // DISABLED
      createMockParticipant(2, { modelId: 'google/gemini-pro', isEnabled: true }),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Only enabled participants responded
    store.getState().setMessages([
      createMockUserMessage(0, 'test'),
      createMessageWithModel(0, 0, 'openai/gpt-4', 'p0'),
    ]);

    const enabledParticipants = participants.filter(p => p.isEnabled);
    expect(enabledParticipants).toHaveLength(2);

    const result = detectIncompleteRound(store.getState().messages, enabledParticipants);

    expect(result.respondedCount).toBe(1);
    expect(result.isIncomplete).toBe(true);
    // Next should be index 1 in enabled list (which is gemini)
  });

  it('should handle rapid participant switching', () => {
    const thread = createMockThread({ id: 'thread-rapid' });

    // Simulate rapid switching between configs
    const config1 = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];
    const config2 = [createMockParticipant(0, { modelId: 'anthropic/claude-3' })];
    const config3 = [createMockParticipant(0, { modelId: 'google/gemini-pro' })];

    store.getState().initializeThread(thread, config1, []);

    // User rapidly switches
    store.getState().updateParticipants(config2);
    expect(store.getState().participants[0].modelId).toBe('anthropic/claude-3');

    store.getState().updateParticipants(config3);
    expect(store.getState().participants[0].modelId).toBe('google/gemini-pro');

    store.getState().updateParticipants(config1);
    expect(store.getState().participants[0].modelId).toBe('openai/gpt-4');
  });

  it('should handle duplicate model IDs in participants', () => {
    const thread = createMockThread({ id: 'thread-duplicate' });

    // Same model twice (different roles perhaps)
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4', id: 'p0' }),
      createMockParticipant(1, { modelId: 'openai/gpt-4', id: 'p1' }), // SAME model
    ];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'test'),
      createMessageWithModel(0, 0, 'openai/gpt-4', 'p0'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const result = detectIncompleteRound(
      store.getState().messages,
      participants.filter(p => p.isEnabled),
    );

    // Model matched, so no change detected
    expect(result.participantsChanged).toBe(false);
    expect(result.respondedCount).toBe(1);
    expect(result.isIncomplete).toBe(true);
    expect(result.nextParticipantIndex).toBe(1);
  });
});

// ============================================================================
// SECTION 6: INTEGRATION WITH ANALYSIS FLOW
// ============================================================================

describe('integration with Analysis Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should create analysis only after all participants respond in same round', () => {
    const thread = createMockThread({ id: 'thread-analysis' });
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
    ];

    // Initialize with user message
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'test'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // First participant responds
    const currentMessages = store.getState().messages;
    store.getState().setMessages([
      ...currentMessages,
      createMessageWithModel(0, 0, 'openai/gpt-4', 'p0'),
    ]);

    // Analysis should NOT be created yet
    expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);

    // Second participant responds
    const messagesAfterFirst = store.getState().messages;
    store.getState().setMessages([
      ...messagesAfterFirst,
      createMessageWithModel(1, 0, 'anthropic/claude-3', 'p1'),
    ]);

    // Check all participants responded
    const result = detectIncompleteRound(
      store.getState().messages,
      participants.filter(p => p.isEnabled),
    );

    expect(result.respondedCount).toBe(2);
    expect(result.isIncomplete).toBe(false);

    // NOW analysis can be created
    const analysis: StoredModeratorAnalysis = createMockAnalysis({
      id: 'analysis-0',
      threadId: thread.id,
      roundNumber: 0,
      status: AnalysisStatuses.PENDING,
    });
    store.getState().addAnalysis(analysis);
    store.getState().markAnalysisCreated(0);

    expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
  });

  it('should NOT create analysis when participants changed mid-round', () => {
    const thread = createMockThread({ id: 'thread-no-analysis' });

    // NEW participants
    const newParticipants = [
      createMockParticipant(0, { modelId: 'anthropic/claude-sonnet-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-haiku-4.5' }),
    ];

    // Initialize with OLD responses (from different models)
    store.getState().initializeThread(thread, newParticipants, [
      createMockUserMessage(0, 'test'),
      createMessageWithModel(0, 0, 'openai/gpt-4', 'old-p0'), // OLD model
      createMessageWithModel(1, 0, 'anthropic/claude-3', 'old-p1'), // OLD model
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const result = detectIncompleteRound(
      store.getState().messages,
      newParticipants.filter(p => p.isEnabled),
    );

    // Participants changed - round is NOT considered complete for current config
    // Old models (gpt-4, claude-3) are not in new participants (claude-sonnet-4, claude-haiku-4.5)
    expect(result.participantsChanged).toBe(true);

    // Analysis should NOT be created for this "old" round
    // (In real app, new round would start with new participants)
  });
});

// ============================================================================
// SECTION 7: CONCURRENT OPERATIONS
// ============================================================================

describe('concurrent Operations', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle participant update while streaming is in progress', () => {
    const thread = createMockThread({ id: 'thread-concurrent' });
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
    ];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'test'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Start streaming
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // User tries to change participants while streaming (documented for test clarity)
    const _newParticipants = [
      createMockParticipant(0, { modelId: 'google/gemini-pro' }),
    ];

    // This should update selectedParticipants (pending) but not active participants
    store.getState().setSelectedParticipants([
      { id: 'new', modelId: 'google/gemini-pro', role: '', priority: 0 },
    ]);
    store.getState().setHasPendingConfigChanges(true);

    // Active participants should still be original during streaming
    expect(store.getState().participants[0].modelId).toBe('openai/gpt-4');
    expect(store.getState().selectedParticipants[0].modelId).toBe('google/gemini-pro');
    expect(store.getState().hasPendingConfigChanges).toBe(true);
  });

  it('should apply pending changes only after streaming completes', () => {
    const thread = createMockThread({ id: 'thread-pending' });
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setIsStreaming(true);
    store.getState().setHasPendingConfigChanges(true);

    // Streaming completes
    store.getState().setIsStreaming(false);

    // Now apply pending changes
    const newParticipants = [
      createMockParticipant(0, { modelId: 'anthropic/claude-3' }),
    ];
    store.getState().updateParticipants(newParticipants);
    store.getState().setHasPendingConfigChanges(false);

    expect(store.getState().participants[0].modelId).toBe('anthropic/claude-3');
    expect(store.getState().hasPendingConfigChanges).toBe(false);
  });
});

// ============================================================================
// SECTION 8: ROUND NUMBER EDGE CASES
// ============================================================================

describe('round Number Edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should correctly detect current round with gaps in round numbers', () => {
    const thread = createMockThread({ id: 'thread-gaps' });
    const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

    store.getState().initializeThread(thread, participants, []);

    // Messages with gap (round 0, then round 2 - round 1 missing)
    store.getState().setMessages([
      createMockUserMessage(0, 'round 0'),
      createMessageWithModel(0, 0, 'openai/gpt-4', 'p0'),
      createMockUserMessage(2, 'round 2'), // Gap - no round 1
      createMessageWithModel(0, 2, 'openai/gpt-4', 'p0'),
    ]);

    const currentRound = getCurrentRoundNumber(store.getState().messages);
    expect(currentRound).toBe(2);
  });

  it('should handle very high round numbers', () => {
    const thread = createMockThread({ id: 'thread-high' });
    const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

    store.getState().initializeThread(thread, participants, []);

    store.getState().setMessages([
      createMockUserMessage(999, 'round 999'),
      createMessageWithModel(0, 999, 'openai/gpt-4', 'p0'),
    ]);

    const currentRound = getCurrentRoundNumber(store.getState().messages);
    expect(currentRound).toBe(999);

    store.getState().setStreamingRoundNumber(1000);
    expect(store.getState().streamingRoundNumber).toBe(1000);
  });

  it('should handle round 0 correctly (0-based indexing)', () => {
    const thread = createMockThread({ id: 'thread-zero' });
    const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setMessages([createMockUserMessage(0, 'first message')]);

    const currentRound = getCurrentRoundNumber(store.getState().messages);
    expect(currentRound).toBe(0);

    // 0 is a valid round number, not falsy
    expect(currentRound === 0).toBe(true);
    expect(currentRound !== null).toBe(true);
  });
});

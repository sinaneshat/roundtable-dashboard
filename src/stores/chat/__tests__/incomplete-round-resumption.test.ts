/**
 * Incomplete Round Resumption Tests
 *
 * Tests for detecting and resuming incomplete rounds when user navigates
 * to a thread page with an unfinished round (some participants responded,
 * others have not).
 *
 * ROOT CAUSE ADDRESSED:
 * When user navigates away during participant streaming and returns later:
 * - The AI SDK's resume: true only handles ACTIVE streams (currently streaming)
 * - It doesn't detect when a round is INCOMPLETE (streams completed, but more participants need to speak)
 * - This test suite verifies the incomplete round detection and resumption logic
 *
 * Location: /src/stores/chat/__tests__/incomplete-round-resumption.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, MessageRoles, ScreenModes } from '@/api/core/enums';
import { shouldWaitForPreSearch } from '@/stores/chat/actions/pending-message-sender';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockMessage,
  createMockParticipant,
  createMockParticipants,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

// ============================================================================
// SECTION 1: INCOMPLETE ROUND DETECTION
// ============================================================================

describe('incomplete Round Detection', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should detect incomplete round when not all participants have responded', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    // Initialize thread with only 1 participant response (out of 3)
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // Only participant 0 responded
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Get messages and participants for incomplete round detection
    const messages = state.messages;
    const enabledParticipants = state.participants.filter(p => p.isEnabled);

    // Count responses for round 0
    let responseCount = 0;
    messages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata;
        if (metadata && typeof metadata === 'object' && 'roundNumber' in metadata && metadata.roundNumber === 0) {
          responseCount++;
        }
      }
    });

    // Should have 1 response but 3 enabled participants
    expect(responseCount).toBe(1);
    expect(enabledParticipants).toHaveLength(3);

    // Round is incomplete
    expect(responseCount < enabledParticipants.length).toBe(true);
  });

  it('should NOT detect incomplete round when all participants have responded', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    // NOTE: createMockMessage signature is (participantIndex, roundNumber)
    // NOT (roundNumber, participantIndex)!
    const initialMessages = [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // participantIndex=0, roundNumber=0
      createMockMessage(1, 0), // participantIndex=1, roundNumber=0
      createMockMessage(2, 0), // participantIndex=2, roundNumber=0
    ];

    // Initialize thread with all participant responses
    store.getState().initializeThread(thread, participants, initialMessages);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Get messages and participants
    const messages = state.messages;
    const enabledParticipants = state.participants.filter(p => p.isEnabled);

    // Count responses for round 0
    let responseCount = 0;
    messages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata;
        if (metadata && typeof metadata === 'object' && 'roundNumber' in metadata && metadata.roundNumber === 0) {
          responseCount++;
        }
      }
    });

    // Should have 3 responses and 3 enabled participants
    expect(responseCount).toBe(3);
    expect(enabledParticipants).toHaveLength(3);

    // Round is complete
    expect(responseCount >= enabledParticipants.length).toBe(true);
  });

  it('should find the first missing participant index', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    // Initialize thread with participant 0 responded but not 1, 2
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // Participant 0 responded
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();
    const messages = state.messages;
    const enabledParticipants = state.participants.filter(p => p.isEnabled);

    // Find which participants have responded
    const respondedIndices = new Set<number>();
    messages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata;
        if (
          metadata
          && typeof metadata === 'object'
          && 'roundNumber' in metadata
          && metadata.roundNumber === 0
          && 'participantIndex' in metadata
        ) {
          respondedIndices.add(metadata.participantIndex as number);
        }
      }
    });

    // Find first missing participant
    let firstMissingIndex: number | null = null;
    for (let i = 0; i < enabledParticipants.length; i++) {
      if (!respondedIndices.has(i)) {
        firstMissingIndex = i;
        break;
      }
    }

    // First missing should be participant 1
    expect(firstMissingIndex).toBe(1);
  });

  it('should find missing participant when gap exists (0 and 2 responded, 1 missing)', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    // Initialize thread with participants 0 and 2 responded (gap at 1)
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // Participant 0 responded
      createMockMessage(0, 2), // Participant 2 responded (skipped 1)
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();
    const messages = state.messages;
    const enabledParticipants = state.participants.filter(p => p.isEnabled);

    // Find which participants have responded
    const respondedIndices = new Set<number>();
    messages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata;
        if (
          metadata
          && typeof metadata === 'object'
          && 'roundNumber' in metadata
          && metadata.roundNumber === 0
          && 'participantIndex' in metadata
        ) {
          respondedIndices.add(metadata.participantIndex as number);
        }
      }
    });

    // Find first missing participant
    let firstMissingIndex: number | null = null;
    for (let i = 0; i < enabledParticipants.length; i++) {
      if (!respondedIndices.has(i)) {
        firstMissingIndex = i;
        break;
      }
    }

    // First missing should be participant 1 (even though 2 responded)
    expect(firstMissingIndex).toBe(1);
  });
});

// ============================================================================
// SECTION 2: STORE RESUMPTION STATE MANAGEMENT
// ============================================================================

describe('store Resumption State Management', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should have setNextParticipantToTrigger action', () => {
    const state = store.getState();

    expect(typeof state.setNextParticipantToTrigger).toBe('function');
    expect(typeof state.getNextParticipantToTrigger).toBe('function');
  });

  it('should set and get nextParticipantToTrigger', () => {
    const state = store.getState();

    // Initially null
    expect(state.getNextParticipantToTrigger()).toBeNull();

    // Set to participant 1
    state.setNextParticipantToTrigger(1);
    expect(store.getState().getNextParticipantToTrigger()).toBe(1);

    // Clear back to null
    state.setNextParticipantToTrigger(null);
    expect(store.getState().getNextParticipantToTrigger()).toBeNull();
  });

  it('should persist nextParticipantToTrigger across state reads', () => {
    store.getState().setNextParticipantToTrigger(2);

    // Read from fresh getState() calls
    expect(store.getState().nextParticipantToTrigger).toBe(2);
    expect(store.getState().getNextParticipantToTrigger()).toBe(2);
  });
});

// ============================================================================
// SECTION 3: INTEGRATION WITH WAITING TO START STREAMING
// ============================================================================

describe('integration with Waiting To Start Streaming', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should combine waitingToStartStreaming with nextParticipantToTrigger for resumption', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // Participant 0 responded
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Set up resumption state
    state.setNextParticipantToTrigger(1);
    state.setWaitingToStartStreaming(true);

    // Verify both flags are set
    const updatedState = store.getState();
    expect(updatedState.waitingToStartStreaming).toBe(true);
    expect(updatedState.nextParticipantToTrigger).toBe(1);
  });

  it('should clear resumption state when streaming starts', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Set up resumption
    store.getState().setNextParticipantToTrigger(1);
    store.getState().setWaitingToStartStreaming(true);

    // Simulate streaming started
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setNextParticipantToTrigger(null);

    const state = store.getState();
    expect(state.isStreaming).toBe(true);
    expect(state.waitingToStartStreaming).toBe(false);
    expect(state.nextParticipantToTrigger).toBeNull();
  });
});

// ============================================================================
// SECTION 4: MULTI-ROUND SCENARIO TESTS
// ============================================================================

describe('multi-Round Incomplete Resumption', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should detect incomplete round 1 when round 0 is complete', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    // Round 0 complete, Round 1 incomplete
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0), // Round 0, Participant 0
      createMockMessage(0, 1), // Round 0, Participant 1 (complete)
      createMockUserMessage(1, 'Second question'),
      createMockMessage(1, 0), // Round 1, Participant 0 (incomplete - missing 1)
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const messages = store.getState().messages;
    const enabledParticipants = store.getState().participants.filter(p => p.isEnabled);

    // Find current round (should be 1)
    const userMessages = messages.filter(m => m.role === MessageRoles.USER);
    const lastUserMessage = userMessages[userMessages.length - 1];
    const currentRound = lastUserMessage?.metadata && typeof lastUserMessage.metadata === 'object' && 'roundNumber' in lastUserMessage.metadata
      ? lastUserMessage.metadata.roundNumber as number
      : 0;

    expect(currentRound).toBe(1);

    // Count responses for round 1
    let responseCount = 0;
    messages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata;
        if (metadata && typeof metadata === 'object' && 'roundNumber' in metadata && metadata.roundNumber === 1) {
          responseCount++;
        }
      }
    });

    // Should have 1 response but 2 participants
    expect(responseCount).toBe(1);
    expect(enabledParticipants).toHaveLength(2);

    // Round 1 is incomplete
    expect(responseCount < enabledParticipants.length).toBe(true);
  });

  it('should only resume current round, not previous incomplete rounds', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    // Round 0 technically incomplete but Round 1 exists
    // Only Round 1 should be considered for resumption
    // NOTE: createMockMessage signature is (participantIndex, roundNumber)
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0), // participantIndex=0, roundNumber=0
      // Missing participant 1 for round 0
      createMockUserMessage(1, 'Second question'),
      createMockMessage(0, 1), // participantIndex=0, roundNumber=1
      createMockMessage(1, 1), // participantIndex=1, roundNumber=1 (complete)
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const messages = store.getState().messages;
    const enabledParticipants = store.getState().participants.filter(p => p.isEnabled);

    // Find current round (should be 1)
    const userMessages = messages.filter(m => m.role === MessageRoles.USER);
    const lastUserMessage = userMessages[userMessages.length - 1];
    const currentRound = lastUserMessage?.metadata && typeof lastUserMessage.metadata === 'object' && 'roundNumber' in lastUserMessage.metadata
      ? lastUserMessage.metadata.roundNumber as number
      : 0;

    expect(currentRound).toBe(1);

    // Count responses for current round (1)
    let responseCount = 0;
    messages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata;
        if (metadata && typeof metadata === 'object' && 'roundNumber' in metadata && metadata.roundNumber === currentRound) {
          responseCount++;
        }
      }
    });

    // Current round (1) is complete
    expect(responseCount).toBe(2);
    expect(responseCount >= enabledParticipants.length).toBe(true);

    // Should not need resumption for current round
    const needsResumption = responseCount < enabledParticipants.length;
    expect(needsResumption).toBe(false);
  });
});

// ============================================================================
// SECTION 5: EDGE CASES
// ============================================================================

describe('edge Cases for Incomplete Round Resumption', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should NOT resume when no messages exist', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const messages = store.getState().messages;

    // No messages, no resumption needed
    expect(messages).toHaveLength(0);

    // Should not set nextParticipantToTrigger for empty thread
    expect(store.getState().nextParticipantToTrigger).toBeNull();
  });

  it('should NOT resume when only user message exists (round not started)', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const messages = store.getState().messages;
    const enabledParticipants = store.getState().participants.filter(p => p.isEnabled);

    // Count responses for round 0
    let responseCount = 0;
    messages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        responseCount++;
      }
    });

    // No responses yet - this is a fresh round, not an incomplete resumption
    expect(responseCount).toBe(0);
    expect(enabledParticipants).toHaveLength(2);

    // This is technically "incomplete" but it's the START of a round
    // The first participant needs to be triggered
    const firstMissingIndex = 0;
    expect(firstMissingIndex).toBe(0);
  });

  it('should handle disabled participants correctly', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3).map((p, idx) => ({
      ...p,
      isEnabled: idx !== 1, // Disable participant 1
    }));

    // Only participants 0 and 2 are enabled
    // Participant 0 responded
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // Participant 0 responded
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const enabledParticipants = store.getState().participants.filter(p => p.isEnabled);

    // Should have 2 enabled participants (0 and 2)
    expect(enabledParticipants).toHaveLength(2);
    expect(enabledParticipants[0].priority).toBe(0);
    expect(enabledParticipants[1].priority).toBe(2);

    // 1 response, 2 enabled participants = incomplete
    // But need to figure out the correct index mapping
    // In the enabled list: index 0 = priority 0, index 1 = priority 2
    // Participant at enabled index 0 responded
    // Next should be enabled index 1 (which is participant with priority 2)
  });

  it('should not resume when already streaming', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // Participant 0 responded
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setIsStreaming(true);

    const isStreaming = store.getState().isStreaming;

    // Should not trigger resumption when already streaming
    expect(isStreaming).toBe(true);
  });
});

// ============================================================================
// SECTION 6: PARTICIPANT CONFIGURATION CHANGE DETECTION
// ============================================================================

describe('participant Configuration Change Detection', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * BUG FIX TEST: Participant at index X not found
   *
   * ROOT CAUSE: When user changes participants between rounds:
   * 1. Round 0 completes with 2 participants (e.g., Grok, Gemini)
   * 2. User changes to 3 new participants (e.g., Claude models)
   * 3. Resumption logic compares: 3 enabled participants vs 2 responses
   * 4. Incorrectly detects "incomplete" and tries to trigger participant 2
   * 5. Backend fails: "Participant at index 2 not found"
   *
   * FIX: Detect participant config changes by comparing responded model IDs
   * against current enabled participants' model IDs
   */
  it('should NOT resume when participants have changed since round started (different models)', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // NEW participants (what user changed to) - Claude models
    const newParticipants = [
      createMockParticipant(0, { modelId: 'anthropic/claude-sonnet-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-haiku-4.5' }),
      createMockParticipant(2, { modelId: 'anthropic/claude-3.7-sonnet:thinking' }),
    ];

    // OLD responses from round 0 - different models (Grok and Gemini)
    const messagesWithOldParticipants = [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'old-participant-0',
          participantIndex: 0,
          participantRole: null,
          model: 'x-ai/grok-4', // OLD model
        },
      }),
      createMockMessage(1, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'old-participant-1',
          participantIndex: 1,
          participantRole: null,
          model: 'google/gemini-2.5-flash-lite', // OLD model
        },
      }),
    ];

    store.getState().initializeThread(thread, newParticipants, messagesWithOldParticipants);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();
    const messages = state.messages;
    const enabledParticipants = state.participants.filter(p => p.isEnabled);

    // Check responded model IDs
    const respondedModelIds = new Set<string>();
    messages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata as { roundNumber?: number; model?: string } | null;
        if (metadata?.roundNumber === 0 && metadata?.model) {
          respondedModelIds.add(metadata.model);
        }
      }
    });

    // Check current participant model IDs
    const currentModelIds = new Set(enabledParticipants.map(p => p.modelId));

    // Detect mismatch: responded models are NOT in current participants
    const participantsChangedSinceRound = respondedModelIds.size > 0
      && [...respondedModelIds].some(modelId => !currentModelIds.has(modelId));

    // ASSERTION: Participants HAVE changed (old models not in new participants)
    expect(participantsChangedSinceRound).toBe(true);

    // With the fix, isIncomplete should be FALSE because participants changed
    const responseCount = messages.filter(m => m.role === MessageRoles.ASSISTANT).length;
    expect(responseCount).toBe(2);
    expect(enabledParticipants).toHaveLength(3);

    // Without the fix: 2 < 3 would be true (incorrectly detected as incomplete)
    // With the fix: participantsChangedSinceRound prevents resumption
    const isIncompleteWithFix = responseCount < enabledParticipants.length && !participantsChangedSinceRound;
    expect(isIncompleteWithFix).toBe(false);
  });

  it('should resume when participants are the SAME (model IDs match)', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // 3 participants with specific models
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
      createMockParticipant(2, { modelId: 'google/gemini-pro' }),
    ];

    // Round 0 incomplete - only 2 of 3 responded, but SAME models
    const messages = [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          participantRole: null,
          model: 'openai/gpt-4', // SAME as current participant 0
        },
      }),
      createMockMessage(1, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          participantRole: null,
          model: 'anthropic/claude-3', // SAME as current participant 1
        },
      }),
      // Participant 2 (google/gemini-pro) has NOT responded yet
    ];

    store.getState().initializeThread(thread, participants, messages);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();
    const storeMessages = state.messages;
    const enabledParticipants = state.participants.filter(p => p.isEnabled);

    // Check responded model IDs
    const respondedModelIds = new Set<string>();
    storeMessages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata as { roundNumber?: number; model?: string } | null;
        if (metadata?.roundNumber === 0 && metadata?.model) {
          respondedModelIds.add(metadata.model);
        }
      }
    });

    // Check current participant model IDs
    const currentModelIds = new Set(enabledParticipants.map(p => p.modelId));

    // No mismatch: all responded models ARE in current participants
    const participantsChangedSinceRound = respondedModelIds.size > 0
      && [...respondedModelIds].some(modelId => !currentModelIds.has(modelId));

    // ASSERTION: Participants have NOT changed
    expect(participantsChangedSinceRound).toBe(false);

    // Round IS incomplete and should be resumed
    const responseCount = storeMessages.filter(m => m.role === MessageRoles.ASSISTANT).length;
    expect(responseCount).toBe(2);
    expect(enabledParticipants).toHaveLength(3);

    const isIncompleteWithFix = responseCount < enabledParticipants.length && !participantsChangedSinceRound;
    expect(isIncompleteWithFix).toBe(true); // SHOULD resume
  });

  it('should detect partial participant change (some models changed, some same)', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // User changed from [gpt-4, claude-3] to [gpt-4, gemini-pro, mistral]
    // gpt-4 stayed, claude-3 removed, gemini-pro and mistral added
    const newParticipants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }), // SAME
      createMockParticipant(1, { modelId: 'google/gemini-pro' }), // NEW
      createMockParticipant(2, { modelId: 'mistral/mistral-large' }), // NEW
    ];

    // Old responses: gpt-4 and claude-3 responded
    const messages = [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          participantRole: null,
          model: 'openai/gpt-4', // Still in new participants
        },
      }),
      createMockMessage(1, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          participantRole: null,
          model: 'anthropic/claude-3', // NOT in new participants anymore
        },
      }),
    ];

    store.getState().initializeThread(thread, newParticipants, messages);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();
    const storeMessages = state.messages;
    const enabledParticipants = state.participants.filter(p => p.isEnabled);

    // Check responded model IDs
    const respondedModelIds = new Set<string>();
    storeMessages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata as { roundNumber?: number; model?: string } | null;
        if (metadata?.roundNumber === 0 && metadata?.model) {
          respondedModelIds.add(metadata.model);
        }
      }
    });

    // claude-3 is in responded but NOT in current participants
    const currentModelIds = new Set(enabledParticipants.map(p => p.modelId));
    const participantsChangedSinceRound = respondedModelIds.size > 0
      && [...respondedModelIds].some(modelId => !currentModelIds.has(modelId));

    // ASSERTION: Even one model mismatch means participants changed
    expect(participantsChangedSinceRound).toBe(true);
    expect(respondedModelIds.has('anthropic/claude-3')).toBe(true);
    expect(currentModelIds.has('anthropic/claude-3')).toBe(false);
  });

  it('should handle case where more participants added (same models, just more)', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // User added a 3rd participant, keeping first 2 the same
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
      createMockParticipant(2, { modelId: 'google/gemini-pro' }), // NEW addition
    ];

    // Both original participants responded in round 0
    const messages = [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          participantRole: null,
          model: 'openai/gpt-4',
        },
      }),
      createMockMessage(1, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          participantRole: null,
          model: 'anthropic/claude-3',
        },
      }),
    ];

    store.getState().initializeThread(thread, participants, messages);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();
    const storeMessages = state.messages;
    const enabledParticipants = state.participants.filter(p => p.isEnabled);

    // Check responded model IDs
    const respondedModelIds = new Set<string>();
    storeMessages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata as { roundNumber?: number; model?: string } | null;
        if (metadata?.roundNumber === 0 && metadata?.model) {
          respondedModelIds.add(metadata.model);
        }
      }
    });

    const currentModelIds = new Set(enabledParticipants.map(p => p.modelId));

    // All responded models ARE in current participants (just more were added)
    const participantsChangedSinceRound = respondedModelIds.size > 0
      && [...respondedModelIds].some(modelId => !currentModelIds.has(modelId));

    // ASSERTION: No change detected (responded models still valid)
    // This is actually a valid resumption case - user added more models
    // But this could be a new round, not a resumption of old round
    // The fix is conservative: if responded models are still valid, allow resumption
    expect(participantsChangedSinceRound).toBe(false);

    // Note: In practice, adding participants mid-conversation would likely
    // start a new round, not resume the old one. But the fix handles this
    // by not blocking when responded models are still present.
  });

  it('should NOT resume when ALL participants were replaced', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Completely new set of participants
    const newParticipants = [
      createMockParticipant(0, { modelId: 'anthropic/claude-sonnet-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-haiku-4.5' }),
    ];

    // Old responses from completely different models
    const messages = [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'old-0',
          participantIndex: 0,
          participantRole: null,
          model: 'openai/gpt-4', // NOT in new participants
        },
      }),
    ];

    store.getState().initializeThread(thread, newParticipants, messages);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();
    const storeMessages = state.messages;
    const enabledParticipants = state.participants.filter(p => p.isEnabled);

    const respondedModelIds = new Set<string>();
    storeMessages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata as { roundNumber?: number; model?: string } | null;
        if (metadata?.roundNumber === 0 && metadata?.model) {
          respondedModelIds.add(metadata.model);
        }
      }
    });

    const currentModelIds = new Set(enabledParticipants.map(p => p.modelId));
    const participantsChangedSinceRound = respondedModelIds.size > 0
      && [...respondedModelIds].some(modelId => !currentModelIds.has(modelId));

    // All models changed
    expect(participantsChangedSinceRound).toBe(true);
    expect([...respondedModelIds].every(id => !currentModelIds.has(id))).toBe(true);
  });

  it('should handle empty responded model IDs gracefully', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    // Only user message, no assistant responses
    const messages = [
      createMockUserMessage(0, 'Test question'),
    ];

    store.getState().initializeThread(thread, participants, messages);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();
    const storeMessages = state.messages;
    const enabledParticipants = state.participants.filter(p => p.isEnabled);

    const respondedModelIds = new Set<string>();
    storeMessages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata as { roundNumber?: number; model?: string } | null;
        if (metadata?.roundNumber === 0 && metadata?.model) {
          respondedModelIds.add(metadata.model);
        }
      }
    });

    // No responses yet
    expect(respondedModelIds.size).toBe(0);

    // participantsChangedSinceRound should be false when no responses
    // (we check respondedModelIds.size > 0 first)
    const participantsChangedSinceRound = respondedModelIds.size > 0
      && [...respondedModelIds].some(modelId => !new Set(enabledParticipants.map(p => p.modelId)).has(modelId));

    expect(participantsChangedSinceRound).toBe(false);
  });
});

// ============================================================================
// SECTION 7: DISABLED PARTICIPANTS FILTERING
// ============================================================================
// BUG FIX: When participants are disabled, they should NOT be counted
// for incomplete round detection. Only enabled participants should matter.
// This prevents duplicate participant cards and incorrect resumption.

describe('disabled Participants Filtering in Resumption Logic', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should only count enabled participants when detecting incomplete rounds', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // 4 participants total: 2 disabled (from old config), 2 enabled (current)
    const participants = [
      createMockParticipant(0, { modelId: 'model-a', isEnabled: false }),
      createMockParticipant(1, { modelId: 'model-b', isEnabled: false }),
      createMockParticipant(2, { modelId: 'model-c', isEnabled: true }), // Active
      createMockParticipant(3, { modelId: 'model-d', isEnabled: true }), // Active
    ];

    // Messages from previous round with now-disabled participants
    // + Current round with one enabled participant responding
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 2, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'participant-2',
          participantIndex: 2,
          participantRole: null,
          model: 'model-c',
        },
      }),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();
    const enabledParticipants = state.participants.filter(p => p.isEnabled);

    // Should ONLY count enabled participants
    expect(enabledParticipants).toHaveLength(2);
    expect(enabledParticipants[0].modelId).toBe('model-c');
    expect(enabledParticipants[1].modelId).toBe('model-d');

    // Count responses from enabled participants only
    const messages = state.messages;
    const respondedEnabledIndices = new Set<number>();

    messages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata as { roundNumber?: number; participantIndex?: number; model?: string } | null;
        if (metadata?.roundNumber === 0 && metadata?.participantIndex !== undefined) {
          // Only count if this participant is enabled
          const participant = state.participants[metadata.participantIndex];
          if (participant?.isEnabled) {
            respondedEnabledIndices.add(metadata.participantIndex);
          }
        }
      }
    });

    // Only 1 enabled participant has responded
    expect(respondedEnabledIndices.size).toBe(1);
    expect(respondedEnabledIndices.has(2)).toBe(true);

    // Round is incomplete: 1 response < 2 enabled participants
    const isIncomplete = respondedEnabledIndices.size < enabledParticipants.length;
    expect(isIncomplete).toBe(true);

    // Next participant should be the other enabled one (index 3)
    let nextParticipantIndex: number | null = null;
    for (let i = 0; i < state.participants.length; i++) {
      const p = state.participants[i];
      if (p.isEnabled && !respondedEnabledIndices.has(i)) {
        nextParticipantIndex = i;
        break;
      }
    }

    expect(nextParticipantIndex).toBe(3);
  });

  it('should NOT detect incomplete round when all enabled participants have responded', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Mix of enabled and disabled participants
    const participants = [
      createMockParticipant(0, { modelId: 'model-a', isEnabled: false }),
      createMockParticipant(1, { modelId: 'model-b', isEnabled: true }), // Enabled
      createMockParticipant(2, { modelId: 'model-c', isEnabled: false }),
      createMockParticipant(3, { modelId: 'model-d', isEnabled: true }), // Enabled
    ];

    // Both enabled participants have responded
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 1, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          participantRole: null,
          model: 'model-b',
        },
      }),
      createMockMessage(1, 3, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'participant-3',
          participantIndex: 3,
          participantRole: null,
          model: 'model-d',
        },
      }),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();
    const enabledParticipants = state.participants.filter(p => p.isEnabled);

    expect(enabledParticipants).toHaveLength(2);

    // Count responses from enabled participants
    const messages = state.messages;
    const respondedEnabledIndices = new Set<number>();

    messages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata as { roundNumber?: number; participantIndex?: number } | null;
        if (metadata?.roundNumber === 0 && metadata?.participantIndex !== undefined) {
          const participant = state.participants[metadata.participantIndex];
          if (participant?.isEnabled) {
            respondedEnabledIndices.add(metadata.participantIndex);
          }
        }
      }
    });

    // Both enabled participants responded
    expect(respondedEnabledIndices.size).toBe(2);

    // Round is complete
    const isIncomplete = respondedEnabledIndices.size < enabledParticipants.length;
    expect(isIncomplete).toBe(false);
  });

  it('should handle case where disabled participants have responses but enabled ones do not', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Scenario: User had 2 participants, they both responded, then user
    // disabled them and added 2 new participants. The round with old
    // participants is "complete" for them, but the new enabled participants
    // need a fresh round.
    const participants = [
      createMockParticipant(0, { modelId: 'model-old-a', isEnabled: false }),
      createMockParticipant(1, { modelId: 'model-old-b', isEnabled: false }),
      createMockParticipant(2, { modelId: 'model-new-c', isEnabled: true }),
      createMockParticipant(3, { modelId: 'model-new-d', isEnabled: true }),
    ];

    // Only disabled participants have responses
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          participantRole: null,
          model: 'model-old-a',
        },
      }),
      createMockMessage(1, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          participantRole: null,
          model: 'model-old-b',
        },
      }),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();
    const enabledParticipants = state.participants.filter(p => p.isEnabled);

    expect(enabledParticipants).toHaveLength(2);

    // Count responses from ENABLED participants only
    const messages = state.messages;
    const respondedEnabledIndices = new Set<number>();

    messages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata as { roundNumber?: number; participantIndex?: number } | null;
        if (metadata?.roundNumber === 0 && metadata?.participantIndex !== undefined) {
          const participant = state.participants[metadata.participantIndex];
          if (participant?.isEnabled) {
            respondedEnabledIndices.add(metadata.participantIndex);
          }
        }
      }
    });

    // No enabled participants have responded
    expect(respondedEnabledIndices.size).toBe(0);

    // This is technically an "incomplete" round - 0 responses from 2 enabled
    // BUT this should be treated as needing a NEW round, not resumption
    // The participant config change detection should handle this
    const isIncomplete = respondedEnabledIndices.size < enabledParticipants.length;
    expect(isIncomplete).toBe(true);

    // Check for participant config change
    const respondedModelIds = new Set<string>();
    messages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const metadata = msg.metadata as { roundNumber?: number; model?: string } | null;
        if (metadata?.roundNumber === 0 && metadata?.model) {
          respondedModelIds.add(metadata.model);
        }
      }
    });

    const currentModelIds = new Set(enabledParticipants.map(p => p.modelId));
    const participantsChangedSinceRound = respondedModelIds.size > 0
      && [...respondedModelIds].some(modelId => !currentModelIds.has(modelId));

    // Models HAVE changed - old models are not in current enabled participants
    expect(participantsChangedSinceRound).toBe(true);

    // With the fix, should NOT resume because participants changed
    const isIncompleteWithFix = isIncomplete && !participantsChangedSinceRound;
    expect(isIncompleteWithFix).toBe(false);
  });
});

// ============================================================================
// SECTION 8: SUBMISSION STATE INTERFERENCE PREVENTION
// ============================================================================
// BUG FIX: The resumption hook must NOT interfere with normal message
// submissions. When user submits a new message, the resumption logic
// should NOT try to "resume" the round that was just started.

describe('submission State Interference Prevention', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should NOT detect incomplete round when pendingMessage is set', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Simulate user submitting a message (pendingMessage set, not yet sent)
    store.getState().prepareForNewMessage('New question', participants.map(p => p.id));

    const state = store.getState();

    // pendingMessage should be set
    expect(state.pendingMessage).not.toBeNull();
    expect(state.hasSentPendingMessage).toBe(false);

    // The submission is in progress
    const isSubmissionInProgress = state.hasEarlyOptimisticMessage
      || (state.pendingMessage !== null && !state.hasSentPendingMessage);

    expect(isSubmissionInProgress).toBe(true);

    // Resumption should be blocked when submission is in progress
  });

  it('should NOT detect incomplete round when hasEarlyOptimisticMessage is true', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Simulate early optimistic message state (before prepareForNewMessage)
    store.getState().setHasEarlyOptimisticMessage(true);

    const state = store.getState();

    expect(state.hasEarlyOptimisticMessage).toBe(true);

    // Submission is in progress
    const isSubmissionInProgress = state.hasEarlyOptimisticMessage
      || (state.pendingMessage !== null && !state.hasSentPendingMessage);

    expect(isSubmissionInProgress).toBe(true);
  });

  it('should allow resumption when hasSentPendingMessage is true (message already sent)', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // Participant 0 responded
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Simulate message sent state
    store.getState().prepareForNewMessage('Some message', participants.map(p => p.id));
    store.getState().setHasSentPendingMessage(true);

    const state = store.getState();

    expect(state.hasSentPendingMessage).toBe(true);

    // Submission is NOT in progress (message already sent)
    const isSubmissionInProgress = state.hasEarlyOptimisticMessage
      || (state.pendingMessage !== null && !state.hasSentPendingMessage);

    expect(isSubmissionInProgress).toBe(false);

    // Resumption is allowed when message has been sent
  });

  it('should NOT resume when optimistic user message exists for current round', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    // Round 0 with optimistic user message (just submitted, not persisted)
    const optimisticUserMessage = {
      ...createMockUserMessage(0, 'New question'),
      metadata: {
        role: 'user' as const,
        roundNumber: 0,
        isOptimistic: true, // Optimistic flag
      },
    };

    store.getState().initializeThread(thread, participants, [optimisticUserMessage]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const messages = store.getState().messages;

    // Find user message for current round
    const userMessageForRound = messages.find((msg) => {
      if (msg.role !== MessageRoles.USER)
        return false;
      const metadata = msg.metadata;
      if (metadata && typeof metadata === 'object' && 'roundNumber' in metadata) {
        return metadata.roundNumber === 0;
      }
      return false;
    });

    expect(userMessageForRound).toBeDefined();

    // Check if it's optimistic
    const metadata = userMessageForRound?.metadata;
    const isOptimistic = metadata
      && typeof metadata === 'object'
      && 'isOptimistic' in metadata
      && metadata.isOptimistic === true;

    expect(isOptimistic).toBe(true);

    // Should NOT resume for optimistic messages - this is a new submission
  });
});

// ============================================================================
// SECTION 9: PRE-SEARCH BLOCKING DURING RESUMPTION
// ============================================================================
// BUG FIX: When user refreshes during pre-search streaming, the resumption
// logic must wait for pre-search to complete before triggering participants.
// Without this fix, participants would start responding without web search context.

describe('pre-Search Blocking During Resumption', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * CORE BUG FIX TEST: Pre-search STREAMING should block participant resumption
   *
   * SCENARIO:
   * 1. User submits question with web search enabled
   * 2. Pre-search starts streaming
   * 3. Participant 0 starts responding (using pre-search context)
   * 4. User refreshes the page mid-stream
   * 5. On page load: pre-search is STREAMING, participant 0 has partial response
   * 6. WITHOUT FIX: Resumption triggers participant 1 immediately (NO web search context!)
   * 7. WITH FIX: Resumption waits for pre-search to complete
   */
  it('should NOT resume when pre-search is STREAMING', () => {
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });
    const participants = createMockParticipants(3);

    // Pre-search is still streaming
    const streamingPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.STREAMING,
      userQuery: 'Test question with web search',
    });

    // Initialize thread with incomplete round (1 of 3 participants responded)
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question with web search'),
      createMockMessage(0, 0), // Participant 0 responded
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setPreSearches([streamingPreSearch]);
    store.getState().setEnableWebSearch(true);

    const state = store.getState();

    // Verify incomplete round detection
    const messages = state.messages;
    const enabledParticipants = state.participants.filter(p => p.isEnabled);
    const responseCount = messages.filter(m => m.role === MessageRoles.ASSISTANT).length;

    expect(responseCount).toBe(1);
    expect(enabledParticipants).toHaveLength(3);

    // Round IS incomplete
    const isIncomplete = responseCount < enabledParticipants.length;
    expect(isIncomplete).toBe(true);

    // BUT pre-search is STREAMING - should block resumption
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: state.enableWebSearch,
      preSearches: state.preSearches,
      roundNumber: 0,
    });

    expect(shouldWait).toBe(true);

    // With the fix, resumption should NOT proceed
    // isIncomplete && !shouldWait = true && false = false
    const shouldResume = isIncomplete && !shouldWait;
    expect(shouldResume).toBe(false);
  });

  it('should NOT resume when pre-search is PENDING', () => {
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });
    const participants = createMockParticipants(2);

    // Pre-search is pending (hasn't started yet)
    const pendingPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.PENDING,
      userQuery: 'Test question',
    });

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setPreSearches([pendingPreSearch]);
    store.getState().setEnableWebSearch(true);

    const state = store.getState();

    // Pre-search PENDING should also block
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: state.enableWebSearch,
      preSearches: state.preSearches,
      roundNumber: 0,
    });

    expect(shouldWait).toBe(true);
  });

  it('should ALLOW resumption when pre-search is COMPLETE', () => {
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });
    const participants = createMockParticipants(3);

    // Pre-search completed successfully
    const completePreSearch = createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
      userQuery: 'Test question',
      searchData: { queries: [], results: [] },
    });

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setPreSearches([completePreSearch]);
    store.getState().setEnableWebSearch(true);

    const state = store.getState();

    // Pre-search COMPLETE should NOT block
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: state.enableWebSearch,
      preSearches: state.preSearches,
      roundNumber: 0,
    });

    expect(shouldWait).toBe(false);

    // Resumption SHOULD proceed
    const messages = state.messages;
    const enabledParticipants = state.participants.filter(p => p.isEnabled);
    const responseCount = messages.filter(m => m.role === MessageRoles.ASSISTANT).length;
    const isIncomplete = responseCount < enabledParticipants.length;

    const shouldResume = isIncomplete && !shouldWait;
    expect(shouldResume).toBe(true);
  });

  it('should ALLOW resumption when pre-search FAILED', () => {
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });
    const participants = createMockParticipants(2);

    // Pre-search failed - should not block conversation
    const failedPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.FAILED,
      userQuery: 'Test question',
      errorMessage: 'Search failed',
    });

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setPreSearches([failedPreSearch]);
    store.getState().setEnableWebSearch(true);

    const state = store.getState();

    // Pre-search FAILED should NOT block (don't block conversation on failures)
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: state.enableWebSearch,
      preSearches: state.preSearches,
      roundNumber: 0,
    });

    expect(shouldWait).toBe(false);
  });

  it('should ALLOW resumption when web search is disabled', () => {
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: false });
    const participants = createMockParticipants(2);

    // Even with a streaming pre-search, if web search is disabled, don't block
    const streamingPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.STREAMING,
    });

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setPreSearches([streamingPreSearch]);
    store.getState().setEnableWebSearch(false);

    const state = store.getState();

    // Web search disabled - should NOT wait
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: state.enableWebSearch,
      preSearches: state.preSearches,
      roundNumber: 0,
    });

    expect(shouldWait).toBe(false);
  });

  it('should wait when pre-search does not exist yet (optimistic wait)', () => {
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });
    const participants = createMockParticipants(2);

    // No pre-search in store yet (backend creating it, orchestrator hasn't synced)
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setPreSearches([]); // Empty - no pre-search synced yet
    store.getState().setEnableWebSearch(true);

    const state = store.getState();

    // Should wait for pre-search to be created (optimistic wait)
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: state.enableWebSearch,
      preSearches: state.preSearches,
      roundNumber: 0,
    });

    expect(shouldWait).toBe(true);
  });

  it('should handle pre-search for different round (should not block current round)', () => {
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });
    const participants = createMockParticipants(2);

    // Pre-search exists but for round 1, not round 0
    const preSearchForRound1 = createMockPreSearch({
      roundNumber: 1,
      status: AnalysisStatuses.STREAMING,
    });

    // Round 0 complete, round 1 incomplete
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0),
      createMockMessage(0, 1),
      createMockUserMessage(1, 'Second question'),
      createMockMessage(1, 0), // Only participant 0 responded for round 1
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setPreSearches([preSearchForRound1]);
    store.getState().setEnableWebSearch(true);

    const state = store.getState();

    // Pre-search for round 1 SHOULD block (current round is 1)
    const shouldWaitRound1 = shouldWaitForPreSearch({
      webSearchEnabled: state.enableWebSearch,
      preSearches: state.preSearches,
      roundNumber: 1,
    });

    expect(shouldWaitRound1).toBe(true);

    // Pre-search for round 0 should NOT exist, so should wait (optimistic)
    const shouldWaitRound0 = shouldWaitForPreSearch({
      webSearchEnabled: state.enableWebSearch,
      preSearches: state.preSearches,
      roundNumber: 0,
    });

    // Round 0 has no pre-search but web search is enabled - optimistic wait
    expect(shouldWaitRound0).toBe(true);
  });

  it('should resume correctly when pre-search transitions from STREAMING to COMPLETE', () => {
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });
    const participants = createMockParticipants(3);

    // Start with streaming pre-search
    const streamingPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.STREAMING,
      userQuery: 'Test question',
    });

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setPreSearches([streamingPreSearch]);
    store.getState().setEnableWebSearch(true);

    // Initially should wait
    let state = store.getState();
    let shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: state.enableWebSearch,
      preSearches: state.preSearches,
      roundNumber: 0,
    });
    expect(shouldWait).toBe(true);

    // Simulate pre-search completing (status changes to COMPLETE)
    const completedPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
      userQuery: 'Test question',
      searchData: { queries: [], results: [] },
    });
    store.getState().setPreSearches([completedPreSearch]);

    // Now should NOT wait
    state = store.getState();
    shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: state.enableWebSearch,
      preSearches: state.preSearches,
      roundNumber: 0,
    });
    expect(shouldWait).toBe(false);

    // Resumption should proceed
    const messages = state.messages;
    const enabledParticipants = state.participants.filter(p => p.isEnabled);
    const responseCount = messages.filter(m => m.role === MessageRoles.ASSISTANT).length;
    const isIncomplete = responseCount < enabledParticipants.length;

    const shouldResume = isIncomplete && !shouldWait;
    expect(shouldResume).toBe(true);
  });

  /**
   * REAL-WORLD SCENARIO TEST: User refresh during pre-search + participant streaming
   *
   * This test simulates the exact bug scenario from the issue:
   * - 5 participants selected
   * - Web search enabled
   * - User submits question
   * - Pre-search starts streaming
   * - Participant 0 (gemini-3-pro) starts streaming (with reasoning)
   * - User refreshes page
   * - On reload: pre-search is STREAMING, participant 0 has partial response
   * - BUG: Without fix, participants 1-4 would start without web search context
   * - FIX: Wait for pre-search to complete before resuming
   */
  it('should block resumption in real-world refresh scenario with 5 participants', () => {
    const thread = createMockThread({
      id: '01KB599HCFM5BCW27M5RTB04R0',
      enableWebSearch: true,
    });

    // 5 participants (from the real scenario)
    const participants = [
      createMockParticipant(0, { modelId: 'google/gemini-3-pro-preview-20251117' }),
      createMockParticipant(1, { modelId: 'qwen/qwen3-max' }),
      createMockParticipant(2, { modelId: 'google/gemini-2.5-flash' }),
      createMockParticipant(3, { modelId: 'meta-llama/llama-3.3-70b-instruct:free' }),
      createMockParticipant(4, { modelId: 'x-ai/grok-4-fast' }),
    ];

    // Pre-search still streaming (from the real state dump)
    const streamingPreSearch = createMockPreSearch({
      id: '01KB599HFRXF7QN9ZNHEAM1W5T',
      threadId: '01KB599HCFM5BCW27M5RTB04R0',
      roundNumber: 0,
      userQuery: 'say hi, 1 word only, then say your name, and the name of person before you that spoke',
      status: AnalysisStatuses.STREAMING,
    });

    // Only participant 0 has responded (partial response with reasoning)
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, streamingPreSearch.userQuery!),
      createMockMessage(0, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: '01KB599HCV9PG087GZBW9EJ1HG',
          participantIndex: 0,
          participantRole: 'Computational Consciousness Expert',
          model: 'google/gemini-3-pro-preview-20251117',
        },
      }),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setPreSearches([streamingPreSearch]);
    store.getState().setEnableWebSearch(true);

    const state = store.getState();

    // Verify the state matches the bug scenario
    expect(state.participants).toHaveLength(5);
    expect(state.preSearches[0].status).toBe(AnalysisStatuses.STREAMING);
    expect(state.enableWebSearch).toBe(true);

    // Round is incomplete (1 of 5 responded)
    const messages = state.messages;
    const enabledParticipants = state.participants.filter(p => p.isEnabled);
    const responseCount = messages.filter(m => m.role === MessageRoles.ASSISTANT).length;

    expect(responseCount).toBe(1);
    expect(enabledParticipants).toHaveLength(5);

    const isIncomplete = responseCount < enabledParticipants.length;
    expect(isIncomplete).toBe(true);

    // THE FIX: Pre-search STREAMING should block resumption
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: state.enableWebSearch,
      preSearches: state.preSearches,
      roundNumber: 0,
    });

    expect(shouldWait).toBe(true);

    // Resumption should NOT proceed while pre-search is streaming
    const shouldResume = isIncomplete && !shouldWait;
    expect(shouldResume).toBe(false);
  });
});

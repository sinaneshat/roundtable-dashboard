/**
 * Multi-Round Configuration Changes Tests
 *
 * Tests conversation behavior when configuration changes between rounds:
 * - Adding/removing participants
 * - Toggling web search
 * - Changing chat modes
 * - State consistency through changes
 *
 * These tests verify that the store correctly handles mid-conversation
 * configuration modifications without breaking existing state.
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';

import { AnalysisStatuses, ChatModes, FinishReasons, ScreenModes } from '@/api/core/enums';
import {
  createMockParticipant,
  createMockParticipants,
  createMockThread,
  createTestAssistantMessage,
  createTestUserMessage,
  getStoreState,
} from '@/lib/testing';

import { createChatStore } from '../store';

function createRoundMessages(
  roundNumber: number,
  participantCount: number,
): UIMessage[] {
  const messages: UIMessage[] = [
    createTestUserMessage({
      id: `thread-config-123_r${roundNumber}_user`,
      content: `Question for round ${roundNumber}`,
      roundNumber,
    }),
  ];

  for (let i = 0; i < participantCount; i++) {
    messages.push(
      createTestAssistantMessage({
        id: `thread-config-123_r${roundNumber}_p${i}`,
        content: `Response from participant ${i} for round ${roundNumber}`,
        roundNumber,
        participantId: `participant-${i}`,
        participantIndex: i,
        finishReason: FinishReasons.STOP,
      }),
    );
  }

  return messages;
}

// ============================================================================
// PARTICIPANT CONFIGURATION CHANGES
// ============================================================================

describe('participant Configuration Changes', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
  });

  describe('adding Participants Between Rounds', () => {
    it('adds new participant after round 0 completes', () => {
      const state = getStoreState(store);

      // Round 0 with 2 participants
      state.setParticipants(createMockParticipants(2));
      const round0Messages = createRoundMessages(0, 2);
      state.setMessages(round0Messages);

      expect(getStoreState(store).participants).toHaveLength(2);
      expect(getStoreState(store).messages).toHaveLength(3); // 1 user + 2 assistant

      // Add 3rd participant for round 1
      const newParticipants = [
        ...createMockParticipants(2),
        createMockParticipant(2),
      ];
      state.setParticipants(newParticipants);

      expect(getStoreState(store).participants).toHaveLength(3);
      // Round 0 messages preserved
      expect(getStoreState(store).messages).toHaveLength(3);
    });

    it('preserves round 0 analysis when participant added', () => {
      const state = getStoreState(store);

      // Round 0 with 2 participants
      state.setParticipants(createMockParticipants(2));
      const round0Messages = createRoundMessages(0, 2);
      state.setMessages(round0Messages);

      // Create analysis for round 0
      state.createPendingAnalysis({
        roundNumber: 0,
        messages: round0Messages,
        userQuestion: 'Question for round 0',
        threadId: 'thread-config-123',
        mode: ChatModes.ANALYZING,
      });
      state.updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);

      expect(getStoreState(store).analyses).toHaveLength(1);
      expect(getStoreState(store).analyses[0]!.status).toBe(AnalysisStatuses.COMPLETE);

      // Add participant
      state.setParticipants(createMockParticipants(3));

      // Analysis preserved
      expect(getStoreState(store).analyses).toHaveLength(1);
      expect(getStoreState(store).analyses[0]!.roundNumber).toBe(0);
    });

    it('round 1 uses new participant count', () => {
      const state = getStoreState(store);

      // Round 0 with 2 participants
      state.setParticipants(createMockParticipants(2));
      const round0Messages = createRoundMessages(0, 2);
      state.setMessages(round0Messages);

      // Add 3rd participant
      state.setParticipants(createMockParticipants(3));

      // Round 1 with 3 participants
      const round1Messages = createRoundMessages(1, 3);
      state.setMessages([...round0Messages, ...round1Messages]);

      // Create analysis for round 1 - should find 3 participant messages
      state.createPendingAnalysis({
        roundNumber: 1,
        messages: [...round0Messages, ...round1Messages],
        userQuestion: 'Question for round 1',
        threadId: 'thread-config-123',
        mode: ChatModes.ANALYZING,
      });

      expect(getStoreState(store).analyses).toHaveLength(1);
      expect(getStoreState(store).analyses[0]!.participantMessageIds).toHaveLength(3);
    });
  });

  describe('removing Participants Between Rounds', () => {
    it('removes participant after round 0 completes', () => {
      const state = getStoreState(store);

      // Round 0 with 3 participants
      state.setParticipants(createMockParticipants(3));
      const round0Messages = createRoundMessages(0, 3);
      state.setMessages(round0Messages);

      expect(getStoreState(store).participants).toHaveLength(3);
      expect(getStoreState(store).messages).toHaveLength(4); // 1 user + 3 assistant

      // Remove 3rd participant for round 1
      state.setParticipants(createMockParticipants(2));

      expect(getStoreState(store).participants).toHaveLength(2);
      // Round 0 messages still preserved
      expect(getStoreState(store).messages).toHaveLength(4);
    });

    it('round 0 messages remain even after participant removed', () => {
      const state = getStoreState(store);

      // Round 0 with 3 participants
      state.setParticipants(createMockParticipants(3));
      const round0Messages = createRoundMessages(0, 3);
      state.setMessages(round0Messages);

      // Create analysis for round 0
      state.createPendingAnalysis({
        roundNumber: 0,
        messages: round0Messages,
        userQuestion: 'Question for round 0',
        threadId: 'thread-config-123',
        mode: ChatModes.ANALYZING,
      });

      // Remove participant
      state.setParticipants(createMockParticipants(2));

      // Round 0 analysis preserved with original 3 participant message IDs
      expect(getStoreState(store).analyses[0]!.participantMessageIds).toHaveLength(3);
    });

    it('round 1 uses reduced participant count', () => {
      const state = getStoreState(store);

      // Round 0 with 3 participants
      state.setParticipants(createMockParticipants(3));
      const round0Messages = createRoundMessages(0, 3);
      state.setMessages(round0Messages);

      // Remove 3rd participant
      state.setParticipants(createMockParticipants(2));

      // Round 1 with 2 participants
      const round1Messages = createRoundMessages(1, 2);
      state.setMessages([...round0Messages, ...round1Messages]);

      // Create analysis for round 1 - should find 2 participant messages
      state.createPendingAnalysis({
        roundNumber: 1,
        messages: [...round0Messages, ...round1Messages],
        userQuestion: 'Question for round 1',
        threadId: 'thread-config-123',
        mode: ChatModes.ANALYZING,
      });

      // Find round 1 analysis
      const round1Analysis = getStoreState(store).analyses.find(a => a.roundNumber === 1);
      expect(round1Analysis!.participantMessageIds).toHaveLength(2);
    });
  });

  describe('disabling Participants', () => {
    it('disabled participant not counted in active participants', () => {
      const state = getStoreState(store);

      const participants = createMockParticipants(3);
      // Disable participant 1
      (participants[1] as ChatParticipant).isEnabled = false;
      state.setParticipants(participants);

      // Check all participants stored but isEnabled differs
      expect(getStoreState(store).participants).toHaveLength(3);
      expect(getStoreState(store).participants[1]!.isEnabled).toBe(false);

      // Filter for enabled (simulating what the app does)
      const enabled = getStoreState(store).participants.filter(p => p.isEnabled);
      expect(enabled).toHaveLength(2);
    });
  });
});

// ============================================================================
// WEB SEARCH CONFIGURATION CHANGES
// ============================================================================

describe('web Search Configuration Changes', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ enableWebSearch: false }));
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
  });

  it('tracks web search toggle in form state', () => {
    const state = getStoreState(store);

    expect(getStoreState(store).enableWebSearch).toBe(false);

    state.setEnableWebSearch(true);
    expect(getStoreState(store).enableWebSearch).toBe(true);

    state.setEnableWebSearch(false);
    expect(getStoreState(store).enableWebSearch).toBe(false);
  });

  it('thread enableWebSearch independent of form state', () => {
    const state = getStoreState(store);

    // Thread has its own setting
    expect(getStoreState(store).thread!.enableWebSearch).toBe(false);

    // Form state can differ
    state.setEnableWebSearch(true);
    expect(getStoreState(store).enableWebSearch).toBe(true);

    // Thread setting unchanged
    expect(getStoreState(store).thread!.enableWebSearch).toBe(false);
  });

  it('enabling web search mid-conversation allows pre-search', () => {
    const state = getStoreState(store);

    // Round 0 without web search
    const round0Messages = createRoundMessages(0, 2);
    state.setMessages(round0Messages);

    expect(getStoreState(store).preSearches).toHaveLength(0);

    // Enable web search
    state.setEnableWebSearch(true);

    // Pre-search can be triggered for round 1
    expect(state.hasPreSearchBeenTriggered(1)).toBe(false);
    state.markPreSearchTriggered(1);
    expect(state.hasPreSearchBeenTriggered(1)).toBe(true);
  });
});

// ============================================================================
// CHAT MODE CHANGES
// ============================================================================

describe('chat Mode Changes', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ mode: ChatModes.ANALYZING }));
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
  });

  it('tracks mode changes in form state', () => {
    const state = getStoreState(store);

    expect(getStoreState(store).selectedMode).toBe(ChatModes.ANALYZING);

    state.setSelectedMode(ChatModes.DEBATING);
    expect(getStoreState(store).selectedMode).toBe(ChatModes.DEBATING);

    state.setSelectedMode(ChatModes.BRAINSTORMING);
    expect(getStoreState(store).selectedMode).toBe(ChatModes.BRAINSTORMING);
  });

  it('analysis uses mode at time of creation', () => {
    const state = getStoreState(store);

    // Round 0 in ANALYZING mode
    state.setSelectedMode(ChatModes.ANALYZING);
    const round0Messages = createRoundMessages(0, 2);
    state.setMessages(round0Messages);

    state.createPendingAnalysis({
      roundNumber: 0,
      messages: round0Messages,
      userQuestion: 'Question for round 0',
      threadId: 'thread-config-123',
      mode: ChatModes.ANALYZING, // Mode at creation time
    });

    // Change mode
    state.setSelectedMode(ChatModes.DEBATING);

    // Round 0 analysis still has ANALYZING mode
    expect(getStoreState(store).analyses[0]!.mode).toBe(ChatModes.ANALYZING);
  });

  it('subsequent round uses new mode', () => {
    const state = getStoreState(store);

    // Round 0 in ANALYZING mode
    const round0Messages = createRoundMessages(0, 2);
    state.setMessages(round0Messages);
    state.createPendingAnalysis({
      roundNumber: 0,
      messages: round0Messages,
      userQuestion: 'Q0',
      threadId: 'thread-config-123',
      mode: ChatModes.ANALYZING,
    });

    // Change to DEBATING
    state.setSelectedMode(ChatModes.DEBATING);

    // Round 1 in DEBATING mode
    const round1Messages = createRoundMessages(1, 2);
    state.setMessages([...round0Messages, ...round1Messages]);
    state.createPendingAnalysis({
      roundNumber: 1,
      messages: [...round0Messages, ...round1Messages],
      userQuestion: 'Q1',
      threadId: 'thread-config-123',
      mode: ChatModes.DEBATING,
    });

    // Each round has its mode preserved
    expect(getStoreState(store).analyses[0]!.mode).toBe(ChatModes.ANALYZING);
    expect(getStoreState(store).analyses[1]!.mode).toBe(ChatModes.DEBATING);
  });
});

// ============================================================================
// COMPLETE CONFIG CHANGE JOURNEY
// ============================================================================

describe('complete Configuration Change Journey', () => {
  it('full journey: 2 participants → 3 participants → web search enabled', () => {
    const store = createChatStore();
    const state = getStoreState(store);

    // === SETUP ===
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
    state.setEnableWebSearch(false);

    // === ROUND 0: 2 participants, no web search ===
    const round0Messages = createRoundMessages(0, 2);
    state.setMessages(round0Messages);

    state.createPendingAnalysis({
      roundNumber: 0,
      messages: round0Messages,
      userQuestion: 'Q0',
      threadId: 'thread-config-123',
      mode: ChatModes.ANALYZING,
    });
    state.updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);

    expect(getStoreState(store).messages).toHaveLength(3);
    expect(getStoreState(store).analyses).toHaveLength(1);
    expect(getStoreState(store).analyses[0]!.participantMessageIds).toHaveLength(2);

    // === CONFIG CHANGE: Add participant ===
    state.setParticipants(createMockParticipants(3));

    // === ROUND 1: 3 participants, no web search ===
    const round1Messages = createRoundMessages(1, 3);
    state.setMessages([...round0Messages, ...round1Messages]);

    state.createPendingAnalysis({
      roundNumber: 1,
      messages: [...round0Messages, ...round1Messages],
      userQuestion: 'Q1',
      threadId: 'thread-config-123',
      mode: ChatModes.ANALYZING,
    });
    state.updateAnalysisStatus(1, AnalysisStatuses.COMPLETE);

    expect(getStoreState(store).messages).toHaveLength(7); // 3 + 4
    expect(getStoreState(store).analyses).toHaveLength(2);
    expect(getStoreState(store).analyses[1]!.participantMessageIds).toHaveLength(3);

    // === CONFIG CHANGE: Enable web search ===
    state.setEnableWebSearch(true);

    // === ROUND 2: 3 participants, with web search ===
    state.markPreSearchTriggered(2);

    const round2Messages = createRoundMessages(2, 3);
    state.setMessages([...round0Messages, ...round1Messages, ...round2Messages]);

    state.createPendingAnalysis({
      roundNumber: 2,
      messages: [...round0Messages, ...round1Messages, ...round2Messages],
      userQuestion: 'Q2',
      threadId: 'thread-config-123',
      mode: ChatModes.ANALYZING,
    });
    state.updateAnalysisStatus(2, AnalysisStatuses.COMPLETE);

    // === VERIFY FINAL STATE ===
    const finalState = getStoreState(store);

    // All rounds preserved
    expect(finalState.messages).toHaveLength(11); // 3 + 4 + 4
    expect(finalState.analyses).toHaveLength(3);

    // Each round has correct participant count
    expect(finalState.analyses[0]!.participantMessageIds).toHaveLength(2);
    expect(finalState.analyses[1]!.participantMessageIds).toHaveLength(3);
    expect(finalState.analyses[2]!.participantMessageIds).toHaveLength(3);

    // Pre-search was triggered for round 2
    expect(finalState.triggeredPreSearchRounds.has(2)).toBe(true);

    // Web search now enabled
    expect(finalState.enableWebSearch).toBe(true);
  });
});

// ============================================================================
// TRACKING STATE ISOLATION
// ============================================================================

describe('tracking State Isolation Between Rounds', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
  });

  it('analysis tracking per round is independent', () => {
    const state = getStoreState(store);

    // Mark round 0 as created
    expect(state.tryMarkAnalysisCreated(0)).toBe(true);
    expect(state.tryMarkAnalysisCreated(0)).toBe(false); // Already marked

    // Round 1 is independent
    expect(state.tryMarkAnalysisCreated(1)).toBe(true);
    expect(state.tryMarkAnalysisCreated(1)).toBe(false);

    // Round 2 is independent
    expect(state.tryMarkAnalysisCreated(2)).toBe(true);

    // Check all are tracked
    expect(getStoreState(store).createdAnalysisRounds.size).toBe(3);
  });

  it('pre-search tracking per round is independent', () => {
    const state = getStoreState(store);

    expect(state.hasPreSearchBeenTriggered(0)).toBe(false);
    state.markPreSearchTriggered(0);
    expect(state.hasPreSearchBeenTriggered(0)).toBe(true);

    // Round 1 independent
    expect(state.hasPreSearchBeenTriggered(1)).toBe(false);
    state.markPreSearchTriggered(1);
    expect(state.hasPreSearchBeenTriggered(1)).toBe(true);

    expect(getStoreState(store).triggeredPreSearchRounds.size).toBe(2);
  });

  it('clearing tracking for one round does not affect others', () => {
    const state = getStoreState(store);

    state.markPreSearchTriggered(0);
    state.markPreSearchTriggered(1);
    state.markPreSearchTriggered(2);

    expect(getStoreState(store).triggeredPreSearchRounds.size).toBe(3);

    // Clear only round 1
    state.clearPreSearchTracking(1);

    expect(getStoreState(store).triggeredPreSearchRounds.size).toBe(2);
    expect(state.hasPreSearchBeenTriggered(0)).toBe(true);
    expect(state.hasPreSearchBeenTriggered(1)).toBe(false);
    expect(state.hasPreSearchBeenTriggered(2)).toBe(true);
  });
});

// ============================================================================
// MODEL ORDER PERSISTENCE
// ============================================================================

describe('model Order Persistence', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(3));
  });

  it('tracks model order for drag-and-drop', () => {
    const state = getStoreState(store);

    expect(getStoreState(store).modelOrder).toEqual([]);

    state.setModelOrder(['model-0', 'model-1', 'model-2']);
    expect(getStoreState(store).modelOrder).toEqual(['model-0', 'model-1', 'model-2']);
  });

  it('model order persists through round changes', () => {
    const state = getStoreState(store);

    state.setModelOrder(['model-2', 'model-0', 'model-1']);

    // Complete round 0
    const round0Messages = createRoundMessages(0, 3);
    state.setMessages(round0Messages);

    // Model order unchanged
    expect(getStoreState(store).modelOrder).toEqual(['model-2', 'model-0', 'model-1']);

    // Complete round 1
    const round1Messages = createRoundMessages(1, 3);
    state.setMessages([...round0Messages, ...round1Messages]);

    // Model order still unchanged
    expect(getStoreState(store).modelOrder).toEqual(['model-2', 'model-0', 'model-1']);
  });

  it('model order can be changed mid-conversation', () => {
    const state = getStoreState(store);

    state.setModelOrder(['model-0', 'model-1', 'model-2']);

    // Complete round 0
    const round0Messages = createRoundMessages(0, 3);
    state.setMessages(round0Messages);

    // Change order
    state.setModelOrder(['model-1', 'model-2', 'model-0']);

    // Round 0 messages preserved
    expect(getStoreState(store).messages).toHaveLength(4);

    // New order in place
    expect(getStoreState(store).modelOrder).toEqual(['model-1', 'model-2', 'model-0']);
  });
});

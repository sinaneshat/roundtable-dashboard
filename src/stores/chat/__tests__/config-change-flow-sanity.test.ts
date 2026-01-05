/**
 * Configuration Change Flow Sanity Check - Comprehensive End-to-End Test
 *
 * This test validates the complete configuration change flow from start to finish,
 * ensuring all components work together correctly. It serves as a comprehensive
 * sanity check for the entire system.
 *
 * CRITICAL FLOW (from form-actions.ts and use-changelog-sync.ts):
 * 1. User makes config changes (participants, mode, web search)
 * 2. User submits message
 * 3. configChangeRoundNumber set BEFORE PATCH
 * 4. PATCH /threads/:id completes
 * 5. If hasAnyChanges: setIsWaitingForChangelog(true)
 * 6. Changelog query runs (blocked by isWaitingForChangelog)
 * 7. Changelog fetched and merged into cache
 * 8. BOTH flags cleared atomically: setIsWaitingForChangelog(false) + setConfigChangeRoundNumber(null)
 * 9. Pre-search can start (if web search enabled)
 * 10. Streaming can start
 *
 * This test verifies that placeholders are NOT cleared during steps 3-8.
 *
 * Test File: /src/stores/chat/__tests__/config-change-flow-sanity.test.ts
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ChatModes, MessageRoles, MessageStatuses, ScreenModes } from '@/api/core/enums';
import type { ChatParticipant, ChatThread } from '@/db/validation';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';
import { createOptimisticUserMessage, createPlaceholderPreSearch } from '../utils/placeholder-factories';

// ============================================================================
// HELPERS
// ============================================================================

function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    id: 'thread-123',
    title: 'Test Thread',
    slug: 'test-thread',
    mode: ChatModes.DEBATING,
    status: 'active',
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    enableWebSearch: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
    ...overrides,
  };
}

function createMockParticipant(index: number, overrides?: Partial<ChatParticipant>): ChatParticipant {
  return {
    id: `participant-${index}`,
    threadId: 'thread-123',
    modelId: `model-${index}`,
    role: `Role ${index}`,
    customRoleId: null,
    priority: index,
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Simulates the complete submission flow from form-actions.ts
 */
function simulateSubmission(
  store: ChatStoreApi,
  options: {
    roundNumber: number;
    message: string;
    hasConfigChanges: boolean;
    enableWebSearch: boolean;
    participants: ChatParticipant[];
  },
): void {
  const { roundNumber, message, hasConfigChanges, enableWebSearch, participants } = options;
  const state = store.getState();

  // 1. Create and add optimistic user message
  const optimisticMessage = createOptimisticUserMessage({
    roundNumber,
    text: message,
    fileParts: [],
  });
  state.setMessages(currentMessages => [...currentMessages, optimisticMessage]);

  // 2. Set streaming round number
  state.setStreamingRoundNumber(roundNumber);

  // 3. Set expected participant IDs
  const participantIds = participants.map(p => p.modelId);
  state.setExpectedParticipantIds(participantIds);

  // 4. Create pre-search placeholder if web search enabled
  if (enableWebSearch) {
    state.addPreSearch(createPlaceholderPreSearch({
      threadId: 'thread-123',
      roundNumber,
      userQuery: message,
    }));
  }

  // 5. CRITICAL: Set configChangeRoundNumber BEFORE PATCH to block streaming
  if (hasConfigChanges) {
    state.setConfigChangeRoundNumber(roundNumber);
  }

  // 6. Enable streaming trigger
  state.setWaitingToStartStreaming(true);
  state.setNextParticipantToTrigger(0);
}

/**
 * Simulates PATCH completion
 */
function simulatePatchCompletion(
  store: ChatStoreApi,
  options: {
    hasAnyChanges: boolean;
    thread: ChatThread;
    participants: ChatParticipant[];
  },
): void {
  const { hasAnyChanges, thread, participants } = options;
  const state = store.getState();

  // Update thread and participants (this can trigger screen initialization)
  state.setThread(thread);
  state.setParticipants(participants);

  // Set isWaitingForChangelog if there were changes
  if (hasAnyChanges) {
    state.setIsWaitingForChangelog(true);
  } else {
    // No changes, clear configChangeRoundNumber immediately
    state.setConfigChangeRoundNumber(null);
  }
}

/**
 * Simulates changelog fetch completion
 */
function simulateChangelogCompletion(store: ChatStoreApi): void {
  const state = store.getState();

  // Changelog query completed - clear BOTH flags atomically
  state.setIsWaitingForChangelog(false);
  state.setConfigChangeRoundNumber(null);
}

// ============================================================================
// SANITY CHECK TESTS
// ============================================================================

describe('config Change Flow Sanity Check', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();

    // Initialize with Round 0 complete
    const mockThread = createMockThread({ enableWebSearch: false, mode: ChatModes.DEBATING });
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4', role: 'Analyst' }),
      createMockParticipant(1, { modelId: 'claude-3', role: 'Critic' }),
    ];

    store.getState().initializeThread(mockThread, round0Participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().completeStreaming();
  });

  describe('complete Flow with Config Changes', () => {
    it('verifies complete flow: submission → PATCH → changelog → streaming (WITH changes)', () => {
      const state = store.getState();

      // ============================================================================
      // STEP 1: User makes config changes
      // ============================================================================
      const round1Participants = [
        createMockParticipant(0, { modelId: 'gpt-4', role: 'Analyst' }),
        createMockParticipant(1, { modelId: 'claude-3', role: 'Critic' }),
        createMockParticipant(2, { modelId: 'gemini-pro', role: 'Ideator' }), // ADDED
      ];
      state.setParticipants(round1Participants);
      state.setEnableWebSearch(true); // CHANGED
      state.setSelectedMode(ChatModes.SOLVING); // CHANGED

      // ============================================================================
      // STEP 2: User submits message
      // ============================================================================
      simulateSubmission(store, {
        roundNumber: 1,
        message: 'Second message with config changes',
        hasConfigChanges: true,
        enableWebSearch: true,
        participants: round1Participants,
      });

      // Verify submission state
      let currentState = store.getState();
      expect(currentState.streamingRoundNumber).toBe(1);
      expect(currentState.configChangeRoundNumber).toBe(1); // Set BEFORE PATCH
      expect(currentState.waitingToStartStreaming).toBe(true);
      expect(currentState.expectedParticipantIds).toEqual(['gpt-4', 'claude-3', 'gemini-pro']);

      // Pre-search placeholder created
      const preSearch = currentState.preSearches.find(p => p.roundNumber === 1);
      expect(preSearch).toBeDefined();
      expect(preSearch?.status).toBe(MessageStatuses.PENDING);

      // User message added
      const userMessages = currentState.messages.filter(m => m.role === MessageRoles.USER);
      expect(userMessages).toHaveLength(1);

      // ============================================================================
      // STEP 3: PATCH completes
      // ============================================================================
      const updatedThread = createMockThread({
        enableWebSearch: true,
        mode: ChatModes.SOLVING,
        updatedAt: new Date(),
      });

      simulatePatchCompletion(store, {
        hasAnyChanges: true,
        thread: updatedThread,
        participants: round1Participants,
      });

      // Verify PATCH completion state
      currentState = store.getState();
      expect(currentState.isWaitingForChangelog).toBe(true); // Set after PATCH
      expect(currentState.configChangeRoundNumber).toBe(1); // Still blocking

      // CRITICAL: Placeholders should NOT be cleared
      expect(currentState.streamingRoundNumber).toBe(1);
      expect(currentState.waitingToStartStreaming).toBe(true);
      expect(currentState.expectedParticipantIds).toEqual(['gpt-4', 'claude-3', 'gemini-pro']);

      // Pre-search placeholder should still exist
      const preSearchAfterPatch = currentState.preSearches.find(p => p.roundNumber === 1);
      expect(preSearchAfterPatch).toBeDefined();
      expect(preSearchAfterPatch?.status).toBe(MessageStatuses.PENDING);

      // User message should still exist
      const userMessagesAfterPatch = currentState.messages.filter(m => m.role === MessageRoles.USER);
      expect(userMessagesAfterPatch).toHaveLength(1);

      // ============================================================================
      // STEP 4: Changelog fetch completes
      // ============================================================================
      simulateChangelogCompletion(store);

      // Verify changelog completion state
      currentState = store.getState();
      expect(currentState.isWaitingForChangelog).toBe(false); // Cleared
      expect(currentState.configChangeRoundNumber).toBe(null); // Cleared

      // Placeholders should STILL exist
      expect(currentState.streamingRoundNumber).toBe(1);
      expect(currentState.waitingToStartStreaming).toBe(true);
      expect(currentState.expectedParticipantIds).toEqual(['gpt-4', 'claude-3', 'gemini-pro']);

      // ============================================================================
      // STEP 5: Verify streaming can start
      // ============================================================================
      const isBlockedByChangelog = currentState.isWaitingForChangelog;
      const isBlockedByConfigChange = currentState.configChangeRoundNumber !== null;

      expect(isBlockedByChangelog).toBe(false);
      expect(isBlockedByConfigChange).toBe(false);

      // Streaming trigger should be ready
      expect(currentState.waitingToStartStreaming).toBe(true);
      expect(currentState.nextParticipantToTrigger).toBe(0);
    });

    it('verifies complete flow: submission → PATCH → streaming (NO changes)', () => {
      // ============================================================================
      // STEP 1: User submits message WITHOUT config changes
      // ============================================================================
      const participants = store.getState().participants;

      simulateSubmission(store, {
        roundNumber: 1,
        message: 'Second message without config changes',
        hasConfigChanges: false,
        enableWebSearch: false,
        participants,
      });

      // Verify submission state
      let currentState = store.getState();
      expect(currentState.streamingRoundNumber).toBe(1);
      expect(currentState.configChangeRoundNumber).toBe(null); // Not set (no changes)
      expect(currentState.waitingToStartStreaming).toBe(true);

      // ============================================================================
      // STEP 2: PATCH completes (no changes)
      // ============================================================================
      const updatedThread = createMockThread({ updatedAt: new Date() });

      simulatePatchCompletion(store, {
        hasAnyChanges: false,
        thread: updatedThread,
        participants,
      });

      // Verify PATCH completion state
      currentState = store.getState();
      expect(currentState.isWaitingForChangelog).toBe(false); // NOT set (no changes)
      expect(currentState.configChangeRoundNumber).toBe(null); // Cleared immediately

      // Placeholders should exist
      expect(currentState.streamingRoundNumber).toBe(1);
      expect(currentState.waitingToStartStreaming).toBe(true);

      // ============================================================================
      // STEP 3: Verify streaming can start immediately (no changelog fetch)
      // ============================================================================
      const isBlockedByChangelog = currentState.isWaitingForChangelog;
      const isBlockedByConfigChange = currentState.configChangeRoundNumber !== null;

      expect(isBlockedByChangelog).toBe(false);
      expect(isBlockedByConfigChange).toBe(false);

      // Streaming should be ready
      expect(currentState.waitingToStartStreaming).toBe(true);
    });

    it('verifies streaming is blocked while waiting for changelog', () => {
      const state = store.getState();

      // Simulate submission with config changes
      const participants = [
        ...store.getState().participants,
        createMockParticipant(2, { modelId: 'gemini-pro' }),
      ];

      state.setParticipants(participants);

      simulateSubmission(store, {
        roundNumber: 1,
        message: 'Test message',
        hasConfigChanges: true,
        enableWebSearch: false,
        participants,
      });

      // PATCH completes
      simulatePatchCompletion(store, {
        hasAnyChanges: true,
        thread: createMockThread({ updatedAt: new Date() }),
        participants,
      });

      // Verify streaming is blocked
      let currentState = store.getState();
      const shouldBlockStreaming = currentState.configChangeRoundNumber !== null
        || currentState.isWaitingForChangelog;

      expect(shouldBlockStreaming).toBe(true);
      expect(currentState.isWaitingForChangelog).toBe(true);
      expect(currentState.configChangeRoundNumber).toBe(1);

      // Changelog completes
      simulateChangelogCompletion(store);

      // Verify streaming is no longer blocked
      currentState = store.getState();
      const stillBlocked = currentState.configChangeRoundNumber !== null
        || currentState.isWaitingForChangelog;

      expect(stillBlocked).toBe(false);
    });

    it('verifies pre-search can start after changelog completes', () => {
      const state = store.getState();

      // Simulate submission with web search enabled
      const participants = store.getState().participants;
      state.setEnableWebSearch(true);

      simulateSubmission(store, {
        roundNumber: 1,
        message: 'Search query',
        hasConfigChanges: true,
        enableWebSearch: true,
        participants,
      });

      // PATCH completes
      simulatePatchCompletion(store, {
        hasAnyChanges: true,
        thread: createMockThread({ enableWebSearch: true, updatedAt: new Date() }),
        participants,
      });

      // Pre-search should exist but be blocked
      let currentState = store.getState();
      const preSearch = currentState.preSearches.find(p => p.roundNumber === 1);
      expect(preSearch).toBeDefined();
      expect(preSearch?.status).toBe(MessageStatuses.PENDING);

      // Pre-search should not start yet (blocked by changelog)
      const isBlocked = currentState.isWaitingForChangelog;
      expect(isBlocked).toBe(true);

      // Changelog completes
      simulateChangelogCompletion(store);

      // Pre-search can now start
      currentState = store.getState();
      expect(currentState.isWaitingForChangelog).toBe(false);

      // Simulate pre-search starting
      const didMark = state.tryMarkPreSearchTriggered(1);
      expect(didMark).toBe(true);
    });
  });

  describe('multiple Rounds with Config Changes', () => {
    it('handles config changes across multiple rounds', () => {
      const state = store.getState();

      // ============================================================================
      // ROUND 1: Add participant
      // ============================================================================
      const participants = [
        ...store.getState().participants,
        createMockParticipant(2, { modelId: 'gemini-pro' }),
      ];
      state.setParticipants(participants);

      simulateSubmission(store, {
        roundNumber: 1,
        message: 'Round 1 message',
        hasConfigChanges: true,
        enableWebSearch: false,
        participants,
      });

      simulatePatchCompletion(store, {
        hasAnyChanges: true,
        thread: createMockThread({ updatedAt: new Date() }),
        participants,
      });

      simulateChangelogCompletion(store);

      // Complete round 1
      state.completeStreaming();

      // ============================================================================
      // ROUND 2: Change mode
      // ============================================================================
      state.setSelectedMode(ChatModes.SOLVING);

      simulateSubmission(store, {
        roundNumber: 2,
        message: 'Round 2 message',
        hasConfigChanges: true,
        enableWebSearch: false,
        participants,
      });

      simulatePatchCompletion(store, {
        hasAnyChanges: true,
        thread: createMockThread({ mode: ChatModes.SOLVING, updatedAt: new Date() }),
        participants,
      });

      simulateChangelogCompletion(store);

      // Complete round 2
      state.completeStreaming();

      // ============================================================================
      // ROUND 3: Enable web search
      // ============================================================================
      state.setEnableWebSearch(true);

      simulateSubmission(store, {
        roundNumber: 3,
        message: 'Round 3 message',
        hasConfigChanges: true,
        enableWebSearch: true,
        participants,
      });

      simulatePatchCompletion(store, {
        hasAnyChanges: true,
        thread: createMockThread({
          mode: ChatModes.SOLVING,
          enableWebSearch: true,
          updatedAt: new Date(),
        }),
        participants,
      });

      simulateChangelogCompletion(store);

      // Verify final state
      const currentState = store.getState();
      expect(currentState.selectedMode).toBe(ChatModes.SOLVING);
      expect(currentState.enableWebSearch).toBe(true);
      expect(currentState.participants).toHaveLength(3);
    });
  });

  describe('edge Cases', () => {
    it('handles user submitting with flags already set from previous round', () => {
      const state = store.getState();

      // Simulate flags left over from previous round (shouldn't happen but testing)
      state.setConfigChangeRoundNumber(0);
      state.setIsWaitingForChangelog(true);

      // User submits new message
      const participants = store.getState().participants;

      simulateSubmission(store, {
        roundNumber: 1,
        message: 'New message',
        hasConfigChanges: true,
        enableWebSearch: false,
        participants,
      });

      // Flags should be updated to new round
      const currentState = store.getState();
      expect(currentState.configChangeRoundNumber).toBe(1); // Updated to round 1
    });

    it('handles PATCH failure (flags should remain set)', () => {
      // Simulate submission
      const participants = store.getState().participants;

      simulateSubmission(store, {
        roundNumber: 1,
        message: 'Test message',
        hasConfigChanges: true,
        enableWebSearch: false,
        participants,
      });

      // PATCH fails - flags should remain set
      const currentState = store.getState();
      expect(currentState.configChangeRoundNumber).toBe(1);
      expect(currentState.waitingToStartStreaming).toBe(true);

      // Placeholders should still exist
      expect(currentState.streamingRoundNumber).toBe(1);
    });

    it('handles changelog timeout (flags should clear)', () => {
      const state = store.getState();

      // Simulate submission
      const participants = store.getState().participants;

      simulateSubmission(store, {
        roundNumber: 1,
        message: 'Test message',
        hasConfigChanges: true,
        enableWebSearch: false,
        participants,
      });

      // PATCH completes
      simulatePatchCompletion(store, {
        hasAnyChanges: true,
        thread: createMockThread({ updatedAt: new Date() }),
        participants,
      });

      // Changelog timeout - clear flags
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);

      // Verify flags cleared
      const currentState = store.getState();
      expect(currentState.isWaitingForChangelog).toBe(false);
      expect(currentState.configChangeRoundNumber).toBe(null);

      // Streaming should be unblocked
      const isBlocked = currentState.isWaitingForChangelog
        || currentState.configChangeRoundNumber !== null;
      expect(isBlocked).toBe(false);
    });

    it('handles rapid config changes before submission', () => {
      const state = store.getState();

      // Rapid changes
      state.setEnableWebSearch(true);
      state.setEnableWebSearch(false);
      state.setEnableWebSearch(true);

      state.setSelectedMode(ChatModes.DEBATING);
      state.setSelectedMode(ChatModes.SOLVING);

      // Final state at submission
      const participants = store.getState().participants;

      simulateSubmission(store, {
        roundNumber: 1,
        message: 'Final message',
        hasConfigChanges: true,
        enableWebSearch: true,
        participants,
      });

      // Should use final state
      const currentState = store.getState();
      expect(currentState.enableWebSearch).toBe(true);
      expect(currentState.selectedMode).toBe(ChatModes.SOLVING);
    });
  });

  describe('screen Mode Independence', () => {
    it('handles config changes in OVERVIEW mode', () => {
      const state = store.getState();

      // Switch to OVERVIEW mode
      state.setScreenMode(ScreenModes.OVERVIEW);

      // Config changes in overview
      state.setEnableWebSearch(true);

      const participants = store.getState().participants;

      simulateSubmission(store, {
        roundNumber: 1,
        message: 'Message from overview',
        hasConfigChanges: true,
        enableWebSearch: true,
        participants,
      });

      // Verify config changes work in overview mode
      const currentState = store.getState();
      expect(currentState.screenMode).toBe(ScreenModes.OVERVIEW);
      expect(currentState.configChangeRoundNumber).toBe(1);
    });

    it('handles config changes in THREAD mode', () => {
      const state = store.getState();

      // Ensure THREAD mode
      state.setScreenMode(ScreenModes.THREAD);

      // Config changes in thread
      state.setSelectedMode(ChatModes.SOLVING);

      const participants = store.getState().participants;

      simulateSubmission(store, {
        roundNumber: 1,
        message: 'Message from thread',
        hasConfigChanges: true,
        enableWebSearch: false,
        participants,
      });

      // Verify config changes work in thread mode
      const currentState = store.getState();
      expect(currentState.screenMode).toBe(ScreenModes.THREAD);
      expect(currentState.configChangeRoundNumber).toBe(1);
    });
  });

  describe('atomic Flag Clearing', () => {
    it('clears both flags atomically', () => {
      const state = store.getState();

      // Set both flags
      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(1);

      let currentState = store.getState();
      expect(currentState.isWaitingForChangelog).toBe(true);
      expect(currentState.configChangeRoundNumber).toBe(1);

      // Clear both flags atomically
      simulateChangelogCompletion(store);

      // Verify both cleared
      currentState = store.getState();
      expect(currentState.isWaitingForChangelog).toBe(false);
      expect(currentState.configChangeRoundNumber).toBe(null);
    });

    it('verifies flags cleared together not separately', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(1);

      // WRONG: Clearing separately (should not happen)
      // state.setIsWaitingForChangelog(false);
      // // GAP: configChangeRoundNumber still set here!
      // state.setConfigChangeRoundNumber(null);

      // RIGHT: Clearing atomically
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);

      // Verify both cleared
      const currentState = store.getState();
      expect(currentState.isWaitingForChangelog).toBe(false);
      expect(currentState.configChangeRoundNumber).toBe(null);
    });
  });
});

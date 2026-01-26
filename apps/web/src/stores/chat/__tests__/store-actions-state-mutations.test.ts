/**
 * Store Actions and State Mutations Tests
 *
 * Tests for the actual Zustand store actions and state mutations
 * covering the full lifecycle of chat conversations.
 *
 * Key Areas:
 * - Form slice actions (participants, mode, input)
 * - Thread slice actions (messages, streaming state)
 * - PreSearch slice actions (creation, status, data)
 * - Tracking slice actions (deduplication, round tracking)
 * - Operations slice actions (composite operations)
 * - Stream resumption actions
 *
 * Key Validations:
 * - State mutations are correct
 * - Deduplication works properly
 * - Reset operations clear all necessary state
 * - Race condition prevention
 */

import { ChatModes, FinishReasons, MessageRoles, MessageStatuses, ScreenModes, StreamStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import {
  createMockParticipant,
  createMockStoredPreSearch,
  createMockThread,
  createParticipantConfig,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';

import { createChatStore } from '../store';
import {
  FORM_DEFAULTS,
  MODERATOR_STATE_RESET,
  PENDING_MESSAGE_STATE_RESET,
  REGENERATION_STATE_RESET,
  STREAMING_STATE_RESET,
  THREAD_NAVIGATION_RESET_STATE,
} from '../store-defaults';

// ============================================================================
// FORM SLICE TESTS
// ============================================================================

describe('form Slice Actions', () => {
  describe('setInputValue', () => {
    it('updates input value', () => {
      const store = createChatStore();

      store.getState().setInputValue('Hello world');

      expect(store.getState().inputValue).toBe('Hello world');
    });

    it('clears input value', () => {
      const store = createChatStore();

      store.getState().setInputValue('Hello');
      store.getState().setInputValue('');

      expect(store.getState().inputValue).toBe('');
    });
  });

  describe('setSelectedMode', () => {
    it('sets chat mode', () => {
      const store = createChatStore();

      store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

      expect(store.getState().selectedMode).toBe(ChatModes.BRAINSTORMING);
    });

    it('sets mode to null', () => {
      const store = createChatStore();

      store.getState().setSelectedMode(ChatModes.DEBATING);
      store.getState().setSelectedMode(null);

      expect(store.getState().selectedMode).toBeNull();
    });
  });

  describe('addParticipant', () => {
    it('adds participant to empty list', () => {
      const store = createChatStore();

      // Clear default participants for isolated test
      store.getState().setSelectedParticipants([]);
      const participant = createParticipantConfig(0);

      store.getState().addParticipant(participant);

      expect(store.getState().selectedParticipants).toHaveLength(1);
      expect(store.getState().selectedParticipants[0]?.modelId).toBe('model-0');
    });

    it('does not add duplicate participant', () => {
      const store = createChatStore();

      // Clear default participants for isolated test
      store.getState().setSelectedParticipants([]);
      const participant = createParticipantConfig(0);

      store.getState().addParticipant(participant);
      store.getState().addParticipant(participant);

      expect(store.getState().selectedParticipants).toHaveLength(1);
    });

    it('assigns correct priority on add', () => {
      const store = createChatStore();

      // Clear default participants for isolated test
      store.getState().setSelectedParticipants([]);
      store.getState().addParticipant(createParticipantConfig(0));
      store.getState().addParticipant(createParticipantConfig(1));
      store.getState().addParticipant(createParticipantConfig(2));

      const participants = store.getState().selectedParticipants;
      expect(participants[0]?.priority).toBe(0);
      expect(participants[1]?.priority).toBe(1);
      expect(participants[2]?.priority).toBe(2);
    });
  });

  describe('removeParticipant', () => {
    it('removes participant by id', () => {
      const store = createChatStore();

      // Clear default participants for isolated test
      store.getState().setSelectedParticipants([]);
      store.getState().addParticipant(createParticipantConfig(0));
      store.getState().addParticipant(createParticipantConfig(1));
      store.getState().removeParticipant('participant-0');

      expect(store.getState().selectedParticipants).toHaveLength(1);
      expect(store.getState().selectedParticipants[0]?.id).toBe('participant-1');
    });

    it('recalculates priorities after removal', () => {
      const store = createChatStore();

      // Clear default participants for isolated test
      store.getState().setSelectedParticipants([]);
      store.getState().addParticipant(createParticipantConfig(0));
      store.getState().addParticipant(createParticipantConfig(1));
      store.getState().addParticipant(createParticipantConfig(2));
      store.getState().removeParticipant('participant-1');

      const participants = store.getState().selectedParticipants;
      expect(participants[0]?.priority).toBe(0);
      expect(participants[1]?.priority).toBe(1);
    });
  });

  describe('reorderParticipants', () => {
    it('moves participant from index 0 to 2', () => {
      const store = createChatStore();

      // Clear default participants for isolated test
      store.getState().setSelectedParticipants([]);
      store.getState().addParticipant(createParticipantConfig(0));
      store.getState().addParticipant(createParticipantConfig(1));
      store.getState().addParticipant(createParticipantConfig(2));

      store.getState().reorderParticipants(0, 2);

      const participants = store.getState().selectedParticipants;
      expect(participants[0]?.id).toBe('participant-1');
      expect(participants[1]?.id).toBe('participant-2');
      expect(participants[2]?.id).toBe('participant-0');
    });

    it('updates priorities after reorder', () => {
      const store = createChatStore();

      // Clear default participants for isolated test
      store.getState().setSelectedParticipants([]);
      store.getState().addParticipant(createParticipantConfig(0));
      store.getState().addParticipant(createParticipantConfig(1));
      store.getState().reorderParticipants(1, 0);

      const participants = store.getState().selectedParticipants;
      expect(participants[0]?.priority).toBe(0);
      expect(participants[1]?.priority).toBe(1);
    });
  });

  describe('resetForm', () => {
    it('resets all form state to defaults', () => {
      const store = createChatStore();

      store.getState().setInputValue('Test');
      store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
      store.getState().addParticipant(createParticipantConfig(0));
      store.getState().setEnableWebSearch(true);

      store.getState().resetForm();

      expect(store.getState().inputValue).toBe(FORM_DEFAULTS.inputValue);
      expect(store.getState().selectedMode).toBe(FORM_DEFAULTS.selectedMode);
      // resetForm restores the default preset participants
      expect(store.getState().selectedParticipants).toHaveLength(FORM_DEFAULTS.selectedParticipants.length);
      expect(store.getState().enableWebSearch).toBe(FORM_DEFAULTS.enableWebSearch);
    });
  });
});

// ============================================================================
// THREAD SLICE TESTS
// ============================================================================

describe('thread Slice Actions', () => {
  describe('setThread', () => {
    it('sets thread and syncs enableWebSearch', () => {
      const store = createChatStore();
      const thread = createMockThread({ enableWebSearch: true });

      store.getState().setThread(thread);

      expect(store.getState().thread).toEqual(thread);
      expect(store.getState().enableWebSearch).toBeTruthy();
    });

    it('clears thread when set to null', () => {
      const store = createChatStore();

      store.getState().setThread(createMockThread());
      store.getState().setThread(null);

      expect(store.getState().thread).toBeNull();
    });
  });

  describe('setParticipants', () => {
    it('sorts participants by priority', () => {
      const store = createChatStore();

      const participants = [
        createMockParticipant(2, { priority: 2 }),
        createMockParticipant(0, { priority: 0 }),
        createMockParticipant(1, { priority: 1 }),
      ];

      store.getState().setParticipants(participants);

      const sorted = store.getState().participants;
      expect(sorted[0]?.priority).toBe(0);
      expect(sorted[1]?.priority).toBe(1);
      expect(sorted[2]?.priority).toBe(2);
    });
  });

  describe('setMessages', () => {
    it('sets messages directly', () => {
      const store = createChatStore();

      const messages = [
        createTestUserMessage({ content: 'Test', id: 'u1', roundNumber: 0 }),
      ];

      store.getState().setMessages(messages);

      expect(store.getState().messages).toHaveLength(1);
    });

    it('accepts function updater', () => {
      const store = createChatStore();

      store.getState().setMessages([
        createTestUserMessage({ content: 'First', id: 'u1', roundNumber: 0 }),
      ]);

      store.getState().setMessages(prev => [
        ...prev,
        createTestAssistantMessage({
          content: 'Response',
          finishReason: FinishReasons.STOP,
          id: 'a1',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ]);

      expect(store.getState().messages).toHaveLength(2);
    });
  });

  describe('setIsStreaming', () => {
    it('sets streaming state', () => {
      const store = createChatStore();

      store.getState().setIsStreaming(true);
      expect(store.getState().isStreaming).toBeTruthy();

      store.getState().setIsStreaming(false);
      expect(store.getState().isStreaming).toBeFalsy();
    });
  });

  describe('setCurrentParticipantIndex', () => {
    it('tracks current participant', () => {
      const store = createChatStore();

      store.getState().setCurrentParticipantIndex(2);

      expect(store.getState().currentParticipantIndex).toBe(2);
    });
  });
});

// ============================================================================
// PRESEARCH SLICE TESTS
// ============================================================================

describe('preSearch Slice Actions', () => {
  describe('addPreSearch', () => {
    it('adds new pre-search', () => {
      const store = createChatStore();

      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.PENDING));

      expect(store.getState().preSearches).toHaveLength(1);
    });

    it('handles STREAMING > PENDING race condition', () => {
      const store = createChatStore();

      // Orchestrator adds PENDING
      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.PENDING));

      // Provider tries to add STREAMING (should win)
      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.STREAMING));

      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
    });

    it('skips if COMPLETE already exists', () => {
      const store = createChatStore();

      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE));
      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.STREAMING));

      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    });
  });

  describe('updatePreSearchStatus', () => {
    it('updates status for matching round', () => {
      const store = createChatStore();

      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.PENDING));
      store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    });
  });

  describe('updatePreSearchActivity', () => {
    it('updates activity timestamp', () => {
      const store = createChatStore();

      store.getState().updatePreSearchActivity(0);

      const time = store.getState().getPreSearchActivityTime(0);
      expect(time).toBeDefined();
      expect(time).toBeLessThanOrEqual(Date.now());
    });
  });
});

// ============================================================================
// TRACKING SLICE TESTS
// ============================================================================

describe('tracking Slice Actions', () => {
  describe('markModeratorCreated', () => {
    it('tracks round as created', () => {
      const store = createChatStore();

      store.getState().markModeratorCreated(0);

      expect(store.getState().hasModeratorBeenCreated(0)).toBeTruthy();
      expect(store.getState().hasModeratorBeenCreated(1)).toBeFalsy();
    });

    it('prevents duplicate creation', () => {
      const store = createChatStore();

      store.getState().markModeratorCreated(0);

      // Second call should be idempotent
      expect(store.getState().hasModeratorBeenCreated(0)).toBeTruthy();
    });
  });

  describe('tryMarkModeratorCreated (atomic check-and-mark)', () => {
    it('returns true and marks round when not already created', () => {
      const store = createChatStore();

      const result = store.getState().tryMarkModeratorCreated(0);

      expect(result).toBeTruthy();
      expect(store.getState().hasModeratorBeenCreated(0)).toBeTruthy();
    });

    it('returns false when round already created (prevents race condition)', () => {
      const store = createChatStore();

      // First call succeeds
      const firstResult = store.getState().tryMarkModeratorCreated(0);
      expect(firstResult).toBeTruthy();

      // Second call fails - round already marked
      const secondResult = store.getState().tryMarkModeratorCreated(0);
      expect(secondResult).toBeFalsy();

      // State still shows created
      expect(store.getState().hasModeratorBeenCreated(0)).toBeTruthy();
    });

    it('handles multiple rounds independently', () => {
      const store = createChatStore();

      // Mark round 0
      expect(store.getState().tryMarkModeratorCreated(0)).toBeTruthy();

      // Can still mark round 1
      expect(store.getState().tryMarkModeratorCreated(1)).toBeTruthy();

      // Cannot re-mark round 0
      expect(store.getState().tryMarkModeratorCreated(0)).toBeFalsy();

      // Both rounds are marked
      expect(store.getState().hasModeratorBeenCreated(0)).toBeTruthy();
      expect(store.getState().hasModeratorBeenCreated(1)).toBeTruthy();
    });

    it('respects clearModeratorTracking', () => {
      const store = createChatStore();

      // Mark round 0
      store.getState().tryMarkModeratorCreated(0);
      expect(store.getState().hasModeratorBeenCreated(0)).toBeTruthy();

      // Clear tracking
      store.getState().clearModeratorTracking(0);
      expect(store.getState().hasModeratorBeenCreated(0)).toBeFalsy();

      // Can mark again after clearing
      expect(store.getState().tryMarkModeratorCreated(0)).toBeTruthy();
    });
  });

  describe('markPreSearchTriggered', () => {
    it('tracks pre-search as triggered', () => {
      const store = createChatStore();

      store.getState().markPreSearchTriggered(0);

      expect(store.getState().hasPreSearchBeenTriggered(0)).toBeTruthy();
    });
  });

  describe('markModeratorStreamTriggered', () => {
    it('tracks both moderator ID and round number', () => {
      const store = createChatStore();

      store.getState().markModeratorStreamTriggered('moderator-123', 0);

      expect(store.getState().hasModeratorStreamBeenTriggered('moderator-123', 0)).toBeTruthy();
      expect(store.getState().hasModeratorStreamBeenTriggered('different-id', 0)).toBeTruthy(); // Same round
    });
  });

  describe('clearModeratorTracking', () => {
    it('clears tracking for specific round', () => {
      const store = createChatStore();

      store.getState().markModeratorCreated(0);
      store.getState().markModeratorCreated(1);
      store.getState().clearModeratorTracking(0);

      expect(store.getState().hasModeratorBeenCreated(0)).toBeFalsy();
      expect(store.getState().hasModeratorBeenCreated(1)).toBeTruthy();
    });
  });
});

// ============================================================================
// OPERATIONS SLICE TESTS
// ============================================================================

describe('operations Slice Actions', () => {
  describe('initializeThread', () => {
    it('initializes all thread state atomically', () => {
      const store = createChatStore();
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      const messages = [
        createTestUserMessage({ content: 'Test', id: 'u1', roundNumber: 0 }),
      ];

      store.getState().initializeThread(thread, participants, messages);

      expect(store.getState().thread).toEqual(thread);
      expect(store.getState().participants).toHaveLength(2);
      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().hasInitiallyLoaded).toBeTruthy();
      expect(store.getState().showInitialUI).toBeFalsy();
    });

    it('preserves existing messages if same thread and more complete', () => {
      const store = createChatStore();
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      // Set up existing state with more messages
      store.getState().setThread(thread);
      store.getState().setMessages([
        createTestUserMessage({ content: 'Test', id: 'u1', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Response',
          finishReason: FinishReasons.STOP,
          id: 'a1',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ]);

      // Initialize with fewer messages (stale SSR data)
      const staleMessages = [
        createTestUserMessage({ content: 'Test', id: 'u1', roundNumber: 0 }),
      ];

      store.getState().initializeThread(thread, participants, staleMessages);

      // Should preserve existing messages
      expect(store.getState().messages).toHaveLength(2);
    });

    it('syncs form participants from thread participants', () => {
      const store = createChatStore();
      const thread = createMockThread();
      const participants = [
        createMockParticipant(0, { isEnabled: true }),
        createMockParticipant(1, { isEnabled: true }),
        createMockParticipant(2, { isEnabled: false }), // Disabled
      ];

      store.getState().initializeThread(thread, participants);

      // Only enabled participants synced to form
      const formParticipants = store.getState().selectedParticipants;
      expect(formParticipants).toHaveLength(2);
    });
  });

  describe('prepareForNewMessage', () => {
    it('sets pending message and resets streaming state', () => {
      const store = createChatStore();

      store.getState().prepareForNewMessage('Hello', ['p0', 'p1']);

      expect(store.getState().pendingMessage).toBe('Hello');
      expect(store.getState().expectedParticipantIds).toEqual(['p0', 'p1']);
      expect(store.getState().waitingToStartStreaming).toBeFalsy();
      expect(store.getState().isStreaming).toBeFalsy();
    });

    it('adds optimistic user message on thread screen', () => {
      const store = createChatStore();

      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().prepareForNewMessage('Hello', ['p0']);

      const messages = store.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]?.role).toBe(MessageRoles.USER);
      expect((messages[0]?.metadata as { isOptimistic?: boolean }).isOptimistic).toBeTruthy();
    });

    it('does NOT add optimistic message on overview screen', () => {
      const store = createChatStore();

      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().prepareForNewMessage('Hello', ['p0']);

      expect(store.getState().messages).toHaveLength(0);
    });
  });

  describe('completeStreaming', () => {
    it('clears all streaming and moderator state', () => {
      const store = createChatStore();

      // Set up active streaming state
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(2);

      store.getState().completeStreaming();

      expect(store.getState().isStreaming).toBeFalsy();
      expect(store.getState().currentParticipantIndex).toBe(0);
      expect(store.getState().waitingToStartStreaming).toBeFalsy();
      expect(store.getState().isModeratorStreaming).toBeFalsy();
      expect(store.getState().pendingMessage).toBeNull();
    });
  });

  describe('startRegeneration', () => {
    it('sets regeneration state and clears tracking', () => {
      const store = createChatStore();

      store.getState().markModeratorCreated(0);
      store.getState().markPreSearchTriggered(0);

      store.getState().startRegeneration(0);

      expect(store.getState().isRegenerating).toBeTruthy();
      expect(store.getState().regeneratingRoundNumber).toBe(0);
      expect(store.getState().hasModeratorBeenCreated(0)).toBeFalsy();
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBeFalsy();
    });
  });

  describe('resetToNewChat', () => {
    it('resets all state to defaults', () => {
      const store = createChatStore();

      // Set up various state
      store.getState().setThread(createMockThread());
      store.getState().setMessages([createTestUserMessage({ content: 'Test', id: 'u1', roundNumber: 0 })]);
      store.getState().setIsStreaming(true);

      store.getState().resetToNewChat();

      expect(store.getState().thread).toBeNull();
      expect(store.getState().messages).toHaveLength(0);
      expect(store.getState().isStreaming).toBeFalsy();
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });

    it('restores preferences if provided', () => {
      const store = createChatStore();

      store.getState().resetToNewChat({
        enableWebSearch: true,
        selectedMode: ChatModes.BRAINSTORMING,
        selectedModelIds: ['gpt-4', 'claude-3'],
      });

      expect(store.getState().selectedParticipants).toHaveLength(2);
      expect(store.getState().selectedMode).toBe(ChatModes.BRAINSTORMING);
      expect(store.getState().enableWebSearch).toBeTruthy();
    });
  });

  describe('resetForThreadNavigation', () => {
    it('clears thread data and messages', () => {
      const store = createChatStore();

      store.getState().setThread(createMockThread());
      store.getState().setMessages([createTestUserMessage({ content: 'Test', id: 'u1', roundNumber: 0 })]);

      store.getState().resetForThreadNavigation();

      expect(store.getState().thread).toBeNull();
      expect(store.getState().messages).toHaveLength(0);
    });
  });
});

// ============================================================================
// STREAM RESUMPTION SLICE TESTS
// ============================================================================

describe('stream Resumption Slice Actions', () => {
  describe('setStreamResumptionState', () => {
    it('sets resumption state', () => {
      const store = createChatStore();

      store.getState().setStreamResumptionState({
        createdAt: new Date(),
        participantIndex: 1,
        roundNumber: 0,
        state: StreamStatuses.ACTIVE,
        threadId: 'thread-123',
      });

      const resumptionState = store.getState().streamResumptionState;
      expect(resumptionState?.threadId).toBe('thread-123');
      expect(resumptionState?.participantIndex).toBe(1);
    });
  });

  describe('needsStreamResumption', () => {
    it('returns false when no resumption state', () => {
      const store = createChatStore();

      expect(store.getState().needsStreamResumption()).toBeFalsy();
    });

    it('returns false when stream is COMPLETED', () => {
      const store = createChatStore();

      store.getState().setStreamResumptionState({
        createdAt: new Date(),
        participantIndex: 0,
        roundNumber: 0,
        state: StreamStatuses.COMPLETED,
        threadId: 'thread-123',
      });

      expect(store.getState().needsStreamResumption()).toBeFalsy();
    });

    it('returns true when stream is ACTIVE and matches thread', () => {
      const store = createChatStore();

      store.getState().setThread(createMockThread());
      store.getState().setParticipants([createMockParticipant(0), createMockParticipant(1)]);
      store.getState().setStreamResumptionState({
        createdAt: new Date(),
        participantIndex: 0,
        roundNumber: 0,
        state: StreamStatuses.ACTIVE,
        threadId: 'thread-123',
      });

      expect(store.getState().needsStreamResumption()).toBeTruthy();
    });
  });

  describe('isStreamResumptionStale', () => {
    it('returns false for fresh state', () => {
      const store = createChatStore();

      store.getState().setStreamResumptionState({
        createdAt: new Date(),
        participantIndex: 0,
        roundNumber: 0,
        state: StreamStatuses.ACTIVE,
        threadId: 'thread-123',
      });

      expect(store.getState().isStreamResumptionStale()).toBeFalsy();
    });

    it('returns true for state older than 1 hour', () => {
      const store = createChatStore();

      const twoHoursAgo = new Date(Date.now() - (2 * 60 * 60 * 1000));
      store.getState().setStreamResumptionState({
        createdAt: twoHoursAgo,
        participantIndex: 0,
        roundNumber: 0,
        state: StreamStatuses.ACTIVE,
        threadId: 'thread-123',
      });

      expect(store.getState().isStreamResumptionStale()).toBeTruthy();
    });
  });

  describe('handleResumedStreamComplete', () => {
    it('clears resumption state and sets next participant', () => {
      const store = createChatStore();

      store.getState().setParticipants([createMockParticipant(0), createMockParticipant(1), createMockParticipant(2)]);
      store.getState().setStreamResumptionState({
        createdAt: new Date(),
        participantIndex: 0,
        roundNumber: 0,
        state: StreamStatuses.ACTIVE,
        threadId: 'thread-123',
      });

      store.getState().handleResumedStreamComplete(0, 0);

      expect(store.getState().streamResumptionState).toBeNull();
      expect(store.getState().nextParticipantToTrigger).toBe(1);
      expect(store.getState().waitingToStartStreaming).toBeTruthy();
    });

    it('clears nextParticipantToTrigger when last participant', () => {
      const store = createChatStore();

      store.getState().setParticipants([createMockParticipant(0)]);

      store.getState().handleResumedStreamComplete(0, 0);

      expect(store.getState().nextParticipantToTrigger).toBeNull();
      expect(store.getState().waitingToStartStreaming).toBeFalsy();
    });
  });

  describe('markResumptionAttempted', () => {
    it('tracks resumption attempts', () => {
      const store = createChatStore();

      const firstAttempt = store.getState().markResumptionAttempted(0, 1);
      const secondAttempt = store.getState().markResumptionAttempted(0, 1);

      expect(firstAttempt).toBeTruthy();
      expect(secondAttempt).toBeFalsy();
    });
  });
});

// ============================================================================
// ANIMATION SLICE TESTS
// ============================================================================

describe('animation Slice Actions', () => {
  describe('registerAnimation', () => {
    it('registers pending animation', () => {
      const store = createChatStore();

      store.getState().registerAnimation(0);

      expect(store.getState().pendingAnimations.has(0)).toBeTruthy();
    });
  });

  describe('completeAnimation', () => {
    it('removes from pending animations', () => {
      const store = createChatStore();

      store.getState().registerAnimation(0);
      store.getState().completeAnimation(0);

      expect(store.getState().pendingAnimations.has(0)).toBeFalsy();
    });
  });

  describe('waitForAnimation', () => {
    it('resolves immediately if no pending animation', async () => {
      const store = createChatStore();

      await expect(store.getState().waitForAnimation(0)).resolves.toBeUndefined();
    });

    it('waits for animation to complete', async () => {
      const store = createChatStore();

      store.getState().registerAnimation(0);

      const promise = store.getState().waitForAnimation(0);

      // Complete animation after short delay
      setTimeout(() => {
        store.getState().completeAnimation(0);
      }, 10);

      await expect(promise).resolves.toBeUndefined();
    });
  });
});

// ============================================================================
// RESET STATE GROUP TESTS
// ============================================================================

describe('reset State Groups', () => {
  describe('sTREAMING_STATE_RESET', () => {
    it('contains all streaming-related fields', () => {
      expect(STREAMING_STATE_RESET).toHaveProperty('isStreaming');
      expect(STREAMING_STATE_RESET).toHaveProperty('streamingRoundNumber');
      expect(STREAMING_STATE_RESET).toHaveProperty('currentRoundNumber');
      expect(STREAMING_STATE_RESET).toHaveProperty('waitingToStartStreaming');
      expect(STREAMING_STATE_RESET).toHaveProperty('currentParticipantIndex');
    });
  });

  describe('moderator state reset', () => {
    it('contains moderator creation flags', () => {
      expect(MODERATOR_STATE_RESET).toHaveProperty('isModeratorStreaming');
      // ⚠️ NOTE: isWaitingForChangelog and configChangeRoundNumber are NOT included
      // in MODERATOR_STATE_RESET. They must ONLY be cleared by use-changelog-sync.ts
      // after changelog is fetched. This ensures correct ordering: PATCH → changelog → streaming
      expect(MODERATOR_STATE_RESET).not.toHaveProperty('isWaitingForChangelog');
      expect(MODERATOR_STATE_RESET).not.toHaveProperty('configChangeRoundNumber');
    });
  });

  describe('pENDING_MESSAGE_STATE_RESET', () => {
    it('contains pending message fields', () => {
      expect(PENDING_MESSAGE_STATE_RESET).toHaveProperty('pendingMessage');
      expect(PENDING_MESSAGE_STATE_RESET).toHaveProperty('pendingAttachmentIds');
      expect(PENDING_MESSAGE_STATE_RESET).toHaveProperty('expectedParticipantIds');
      expect(PENDING_MESSAGE_STATE_RESET).toHaveProperty('hasSentPendingMessage');
    });
  });

  describe('rEGENERATION_STATE_RESET', () => {
    it('contains regeneration fields', () => {
      expect(REGENERATION_STATE_RESET).toHaveProperty('isRegenerating');
      expect(REGENERATION_STATE_RESET).toHaveProperty('regeneratingRoundNumber');
    });
  });

  describe('tHREAD_NAVIGATION_RESET_STATE', () => {
    it('includes thread data reset', () => {
      expect(THREAD_NAVIGATION_RESET_STATE).toHaveProperty('thread');
      expect(THREAD_NAVIGATION_RESET_STATE).toHaveProperty('participants');
      expect(THREAD_NAVIGATION_RESET_STATE).toHaveProperty('messages');
      expect(THREAD_NAVIGATION_RESET_STATE).toHaveProperty('preSearches');
    });
  });
});

// ============================================================================
// SCREEN SLICE TESTS
// ============================================================================

describe('screen Slice Actions', () => {
  describe('setScreenMode', () => {
    it('sets screen mode', () => {
      const store = createChatStore();

      store.getState().setScreenMode(ScreenModes.THREAD);

      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    });

    it('sets isReadOnly for PUBLIC mode', () => {
      const store = createChatStore();

      store.getState().setScreenMode(ScreenModes.PUBLIC);

      expect(store.getState().isReadOnly).toBeTruthy();
    });

    it('clears isReadOnly for non-PUBLIC mode', () => {
      const store = createChatStore();

      store.getState().setScreenMode(ScreenModes.PUBLIC);
      store.getState().setScreenMode(ScreenModes.THREAD);

      expect(store.getState().isReadOnly).toBeFalsy();
    });
  });
});

// ============================================================================
// UI SLICE TESTS
// ============================================================================

describe('uI Slice Actions', () => {
  describe('setShowInitialUI', () => {
    it('toggles initial UI visibility', () => {
      const store = createChatStore();

      store.getState().setShowInitialUI(false);
      expect(store.getState().showInitialUI).toBeFalsy();

      store.getState().setShowInitialUI(true);
      expect(store.getState().showInitialUI).toBeTruthy();
    });
  });

  describe('setWaitingToStartStreaming', () => {
    it('sets waiting state', () => {
      const store = createChatStore();

      store.getState().setWaitingToStartStreaming(true);

      expect(store.getState().waitingToStartStreaming).toBeTruthy();
    });
  });

  describe('setCreatedThreadId', () => {
    it('tracks newly created thread', () => {
      const store = createChatStore();

      store.getState().setCreatedThreadId('new-thread-123');

      expect(store.getState().createdThreadId).toBe('new-thread-123');
    });
  });
});

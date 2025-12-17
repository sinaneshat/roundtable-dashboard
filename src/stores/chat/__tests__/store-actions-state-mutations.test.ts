/**
 * Store Actions and State Mutations Tests
 *
 * Tests for the actual Zustand store actions and state mutations
 * covering the full lifecycle of chat conversations.
 *
 * Key Areas:
 * - Form slice actions (participants, mode, input)
 * - Thread slice actions (messages, streaming state)
 * - Summary slice actions (creation, updates, status)
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

import { describe, expect, it } from 'vitest';

import { ChatModes, FinishReasons, MessageStatuses, ScreenModes, StreamStatuses } from '@/api/core/enums';
import {
  createMockParticipant,
  createMockStoredPreSearch,
  createMockSummary,
  createMockThread,
  createParticipantConfig,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';

import { createChatStore } from '../store';
import {
  FORM_DEFAULTS,
  PENDING_MESSAGE_STATE_RESET,
  REGENERATION_STATE_RESET,
  STREAMING_STATE_RESET,
  SUMMARY_STATE_RESET,
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
      const participant = createParticipantConfig(0);

      store.getState().addParticipant(participant);

      expect(store.getState().selectedParticipants).toHaveLength(1);
      expect(store.getState().selectedParticipants[0]?.modelId).toBe('model-0');
    });

    it('does not add duplicate participant', () => {
      const store = createChatStore();
      const participant = createParticipantConfig(0);

      store.getState().addParticipant(participant);
      store.getState().addParticipant(participant);

      expect(store.getState().selectedParticipants).toHaveLength(1);
    });

    it('assigns correct priority on add', () => {
      const store = createChatStore();

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

      store.getState().addParticipant(createParticipantConfig(0));
      store.getState().addParticipant(createParticipantConfig(1));
      store.getState().removeParticipant('participant-0');

      expect(store.getState().selectedParticipants).toHaveLength(1);
      expect(store.getState().selectedParticipants[0]?.id).toBe('participant-1');
    });

    it('recalculates priorities after removal', () => {
      const store = createChatStore();

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
      expect(store.getState().selectedParticipants).toHaveLength(0);
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
      expect(store.getState().enableWebSearch).toBe(true);
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
        createTestUserMessage({ id: 'u1', content: 'Test', roundNumber: 0 }),
      ];

      store.getState().setMessages(messages);

      expect(store.getState().messages).toHaveLength(1);
    });

    it('accepts function updater', () => {
      const store = createChatStore();

      store.getState().setMessages([
        createTestUserMessage({ id: 'u1', content: 'First', roundNumber: 0 }),
      ]);

      store.getState().setMessages(prev => [
        ...prev,
        createTestAssistantMessage({
          id: 'a1',
          content: 'Response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ]);

      expect(store.getState().messages).toHaveLength(2);
    });
  });

  describe('setIsStreaming', () => {
    it('sets streaming state', () => {
      const store = createChatStore();

      store.getState().setIsStreaming(true);
      expect(store.getState().isStreaming).toBe(true);

      store.getState().setIsStreaming(false);
      expect(store.getState().isStreaming).toBe(false);
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
// SUMMARY SLICE TESTS
// ============================================================================

describe('summary Slice Actions', () => {
  describe('addSummary', () => {
    it('adds new summary', () => {
      const store = createChatStore();
      const summary = createMockSummary(0, MessageStatuses.PENDING);

      store.getState().addSummary(summary);

      expect(store.getState().summaries).toHaveLength(1);
    });

    it('deduplicates by roundNumber and threadId', () => {
      const store = createChatStore();
      const summary = createMockSummary(0, MessageStatuses.PENDING);

      store.getState().addSummary(summary);
      store.getState().addSummary(summary);

      expect(store.getState().summaries).toHaveLength(1);
    });

    it('allows different rounds', () => {
      const store = createChatStore();

      store.getState().addSummary(createMockSummary(0, MessageStatuses.PENDING));
      store.getState().addSummary(createMockSummary(1, MessageStatuses.PENDING));

      expect(store.getState().summaries).toHaveLength(2);
    });
  });

  describe('updateMessageStatus', () => {
    it('updates status for matching round', () => {
      const store = createChatStore();

      store.getState().addSummary(createMockSummary(0, MessageStatuses.PENDING));
      store.getState().updateMessageStatus(0, MessageStatuses.STREAMING);

      expect(store.getState().summaries[0]?.status).toBe(MessageStatuses.STREAMING);
    });

    it('does not affect other rounds', () => {
      const store = createChatStore();

      store.getState().addSummary(createMockSummary(0, MessageStatuses.PENDING));
      store.getState().addSummary(createMockSummary(1, MessageStatuses.PENDING));
      store.getState().updateMessageStatus(0, MessageStatuses.COMPLETE);

      expect(store.getState().summaries[1]?.status).toBe(MessageStatuses.PENDING);
    });
  });

  describe('updateSummaryError', () => {
    it('sets failed status and error message', () => {
      const store = createChatStore();

      store.getState().addSummary(createMockSummary(0, MessageStatuses.STREAMING));
      store.getState().updateSummaryError(0, 'Connection failed');

      const summary = store.getState().summaries[0];
      expect(summary?.status).toBe(MessageStatuses.FAILED);
      expect(summary?.errorMessage).toBe('Connection failed');
    });
  });

  describe('removeSummary', () => {
    it('removes summary by roundNumber', () => {
      const store = createChatStore();

      store.getState().addSummary(createMockSummary(0, MessageStatuses.COMPLETE));
      store.getState().addSummary(createMockSummary(1, MessageStatuses.COMPLETE));
      store.getState().removeSummary(0);

      expect(store.getState().summaries).toHaveLength(1);
      expect(store.getState().summaries[0]?.roundNumber).toBe(1);
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
  describe('markSummaryCreated', () => {
    it('tracks round as created', () => {
      const store = createChatStore();

      store.getState().markSummaryCreated(0);

      expect(store.getState().hasSummaryBeenCreated(0)).toBe(true);
      expect(store.getState().hasSummaryBeenCreated(1)).toBe(false);
    });

    it('prevents duplicate creation', () => {
      const store = createChatStore();

      store.getState().markSummaryCreated(0);

      // Second call should be idempotent
      expect(store.getState().hasSummaryBeenCreated(0)).toBe(true);
    });
  });

  describe('tryMarkSummaryCreated (atomic check-and-mark)', () => {
    it('returns true and marks round when not already created', () => {
      const store = createChatStore();

      const result = store.getState().tryMarkSummaryCreated(0);

      expect(result).toBe(true);
      expect(store.getState().hasSummaryBeenCreated(0)).toBe(true);
    });

    it('returns false when round already created (prevents race condition)', () => {
      const store = createChatStore();

      // First call succeeds
      const firstResult = store.getState().tryMarkSummaryCreated(0);
      expect(firstResult).toBe(true);

      // Second call fails - round already marked
      const secondResult = store.getState().tryMarkSummaryCreated(0);
      expect(secondResult).toBe(false);

      // State still shows created
      expect(store.getState().hasSummaryBeenCreated(0)).toBe(true);
    });

    it('handles multiple rounds independently', () => {
      const store = createChatStore();

      // Mark round 0
      expect(store.getState().tryMarkSummaryCreated(0)).toBe(true);

      // Can still mark round 1
      expect(store.getState().tryMarkSummaryCreated(1)).toBe(true);

      // Cannot re-mark round 0
      expect(store.getState().tryMarkSummaryCreated(0)).toBe(false);

      // Both rounds are marked
      expect(store.getState().hasSummaryBeenCreated(0)).toBe(true);
      expect(store.getState().hasSummaryBeenCreated(1)).toBe(true);
    });

    it('respects clearSummaryTracking', () => {
      const store = createChatStore();

      // Mark round 0
      store.getState().tryMarkSummaryCreated(0);
      expect(store.getState().hasSummaryBeenCreated(0)).toBe(true);

      // Clear tracking
      store.getState().clearSummaryTracking(0);
      expect(store.getState().hasSummaryBeenCreated(0)).toBe(false);

      // Can mark again after clearing
      expect(store.getState().tryMarkSummaryCreated(0)).toBe(true);
    });
  });

  describe('markPreSearchTriggered', () => {
    it('tracks pre-search as triggered', () => {
      const store = createChatStore();

      store.getState().markPreSearchTriggered(0);

      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);
    });
  });

  describe('markSummaryStreamTriggered', () => {
    it('tracks both summary ID and round number', () => {
      const store = createChatStore();

      store.getState().markSummaryStreamTriggered('summary-123', 0);

      expect(store.getState().hasSummaryStreamBeenTriggered('summary-123', 0)).toBe(true);
      expect(store.getState().hasSummaryStreamBeenTriggered('different-id', 0)).toBe(true); // Same round
    });
  });

  describe('clearSummaryTracking', () => {
    it('clears tracking for specific round', () => {
      const store = createChatStore();

      store.getState().markSummaryCreated(0);
      store.getState().markSummaryCreated(1);
      store.getState().clearSummaryTracking(0);

      expect(store.getState().hasSummaryBeenCreated(0)).toBe(false);
      expect(store.getState().hasSummaryBeenCreated(1)).toBe(true);
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
        createTestUserMessage({ id: 'u1', content: 'Test', roundNumber: 0 }),
      ];

      store.getState().initializeThread(thread, participants, messages);

      expect(store.getState().thread).toEqual(thread);
      expect(store.getState().participants).toHaveLength(2);
      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().hasInitiallyLoaded).toBe(true);
      expect(store.getState().showInitialUI).toBe(false);
    });

    it('preserves existing messages if same thread and more complete', () => {
      const store = createChatStore();
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      // Set up existing state with more messages
      store.getState().setThread(thread);
      store.getState().setMessages([
        createTestUserMessage({ id: 'u1', content: 'Test', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a1',
          content: 'Response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ]);

      // Initialize with fewer messages (stale SSR data)
      const staleMessages = [
        createTestUserMessage({ id: 'u1', content: 'Test', roundNumber: 0 }),
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
      expect(store.getState().waitingToStartStreaming).toBe(false);
      expect(store.getState().isStreaming).toBe(false);
    });

    it('adds optimistic user message on thread screen', () => {
      const store = createChatStore();

      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().prepareForNewMessage('Hello', ['p0']);

      const messages = store.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]?.role).toBe('user');
      expect((messages[0]?.metadata as { isOptimistic?: boolean }).isOptimistic).toBe(true);
    });

    it('does NOT add optimistic message on overview screen', () => {
      const store = createChatStore();

      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().prepareForNewMessage('Hello', ['p0']);

      expect(store.getState().messages).toHaveLength(0);
    });
  });

  describe('completeStreaming', () => {
    it('clears all streaming and summary state', () => {
      const store = createChatStore();

      // Set up active streaming state
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(2);

      store.getState().completeStreaming();

      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().currentParticipantIndex).toBe(0);
      expect(store.getState().waitingToStartStreaming).toBe(false);
      expect(store.getState().isCreatingSummary).toBe(false);
      expect(store.getState().pendingMessage).toBeNull();
    });
  });

  describe('startRegeneration', () => {
    it('sets regeneration state and clears tracking', () => {
      const store = createChatStore();

      store.getState().markSummaryCreated(0);
      store.getState().markPreSearchTriggered(0);

      store.getState().startRegeneration(0);

      expect(store.getState().isRegenerating).toBe(true);
      expect(store.getState().regeneratingRoundNumber).toBe(0);
      expect(store.getState().hasSummaryBeenCreated(0)).toBe(false);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
    });
  });

  describe('resetToNewChat', () => {
    it('resets all state to defaults', () => {
      const store = createChatStore();

      // Set up various state
      store.getState().setThread(createMockThread());
      store.getState().setMessages([createTestUserMessage({ id: 'u1', content: 'Test', roundNumber: 0 })]);
      store.getState().setIsStreaming(true);

      store.getState().resetToNewChat();

      expect(store.getState().thread).toBeNull();
      expect(store.getState().messages).toHaveLength(0);
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });

    it('restores preferences if provided', () => {
      const store = createChatStore();

      store.getState().resetToNewChat({
        selectedModelIds: ['gpt-4', 'claude-3'],
        selectedMode: ChatModes.BRAINSTORMING,
        enableWebSearch: true,
      });

      expect(store.getState().selectedParticipants).toHaveLength(2);
      expect(store.getState().selectedMode).toBe(ChatModes.BRAINSTORMING);
      expect(store.getState().enableWebSearch).toBe(true);
    });
  });

  describe('resetForThreadNavigation', () => {
    it('clears thread data and messages', () => {
      const store = createChatStore();

      store.getState().setThread(createMockThread());
      store.getState().setMessages([createTestUserMessage({ id: 'u1', content: 'Test', roundNumber: 0 })]);
      store.getState().addSummary(createMockSummary(0, MessageStatuses.COMPLETE));

      store.getState().resetForThreadNavigation();

      expect(store.getState().thread).toBeNull();
      expect(store.getState().messages).toHaveLength(0);
      expect(store.getState().summaries).toHaveLength(0);
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
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 1,
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      const resumptionState = store.getState().streamResumptionState;
      expect(resumptionState?.threadId).toBe('thread-123');
      expect(resumptionState?.participantIndex).toBe(1);
    });
  });

  describe('needsStreamResumption', () => {
    it('returns false when no resumption state', () => {
      const store = createChatStore();

      expect(store.getState().needsStreamResumption()).toBe(false);
    });

    it('returns false when stream is COMPLETED', () => {
      const store = createChatStore();

      store.getState().setStreamResumptionState({
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 0,
        state: StreamStatuses.COMPLETED,
        createdAt: new Date(),
      });

      expect(store.getState().needsStreamResumption()).toBe(false);
    });

    it('returns true when stream is ACTIVE and matches thread', () => {
      const store = createChatStore();

      store.getState().setThread(createMockThread());
      store.getState().setParticipants([createMockParticipant(0), createMockParticipant(1)]);
      store.getState().setStreamResumptionState({
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      expect(store.getState().needsStreamResumption()).toBe(true);
    });
  });

  describe('isStreamResumptionStale', () => {
    it('returns false for fresh state', () => {
      const store = createChatStore();

      store.getState().setStreamResumptionState({
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      expect(store.getState().isStreamResumptionStale()).toBe(false);
    });

    it('returns true for state older than 1 hour', () => {
      const store = createChatStore();

      const twoHoursAgo = new Date(Date.now() - (2 * 60 * 60 * 1000));
      store.getState().setStreamResumptionState({
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: twoHoursAgo,
      });

      expect(store.getState().isStreamResumptionStale()).toBe(true);
    });
  });

  describe('handleResumedStreamComplete', () => {
    it('clears resumption state and sets next participant', () => {
      const store = createChatStore();

      store.getState().setParticipants([createMockParticipant(0), createMockParticipant(1), createMockParticipant(2)]);
      store.getState().setStreamResumptionState({
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      store.getState().handleResumedStreamComplete(0, 0);

      expect(store.getState().streamResumptionState).toBeNull();
      expect(store.getState().nextParticipantToTrigger).toBe(1);
      expect(store.getState().waitingToStartStreaming).toBe(true);
    });

    it('clears nextParticipantToTrigger when last participant', () => {
      const store = createChatStore();

      store.getState().setParticipants([createMockParticipant(0)]);

      store.getState().handleResumedStreamComplete(0, 0);

      expect(store.getState().nextParticipantToTrigger).toBeNull();
      expect(store.getState().waitingToStartStreaming).toBe(false);
    });
  });

  describe('markResumptionAttempted', () => {
    it('tracks resumption attempts', () => {
      const store = createChatStore();

      const firstAttempt = store.getState().markResumptionAttempted(0, 1);
      const secondAttempt = store.getState().markResumptionAttempted(0, 1);

      expect(firstAttempt).toBe(true);
      expect(secondAttempt).toBe(false);
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

      expect(store.getState().pendingAnimations.has(0)).toBe(true);
    });
  });

  describe('completeAnimation', () => {
    it('removes from pending animations', () => {
      const store = createChatStore();

      store.getState().registerAnimation(0);
      store.getState().completeAnimation(0);

      expect(store.getState().pendingAnimations.has(0)).toBe(false);
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

  describe('sUMMARY_STATE_RESET', () => {
    it('contains summary creation flags', () => {
      expect(SUMMARY_STATE_RESET).toHaveProperty('isCreatingSummary');
      expect(SUMMARY_STATE_RESET).toHaveProperty('isWaitingForChangelog');
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
      expect(THREAD_NAVIGATION_RESET_STATE).toHaveProperty('summaries');
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

      expect(store.getState().isReadOnly).toBe(true);
    });

    it('clears isReadOnly for non-PUBLIC mode', () => {
      const store = createChatStore();

      store.getState().setScreenMode(ScreenModes.PUBLIC);
      store.getState().setScreenMode(ScreenModes.THREAD);

      expect(store.getState().isReadOnly).toBe(false);
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
      expect(store.getState().showInitialUI).toBe(false);

      store.getState().setShowInitialUI(true);
      expect(store.getState().showInitialUI).toBe(true);
    });
  });

  describe('setWaitingToStartStreaming', () => {
    it('sets waiting state', () => {
      const store = createChatStore();

      store.getState().setWaitingToStartStreaming(true);

      expect(store.getState().waitingToStartStreaming).toBe(true);
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

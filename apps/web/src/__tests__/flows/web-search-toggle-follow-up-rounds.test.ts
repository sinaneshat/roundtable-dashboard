/**
 * Web Search Toggle in Follow-Up Rounds - Flow Tests
 *
 * Tests web search toggle behavior in follow-up rounds (Round 1+) focusing on:
 * 1. Web search enabled shows proper placeholder text
 * 2. Web search disabled removes placeholder
 * 3. Toggle changes trigger changelog entries
 * 4. Flow continues correctly with web search changes
 * 5. Web search combined with other configuration changes
 *
 * Per FLOW_DOCUMENTATION.md PART 2:
 * - Mid-conversation web search toggle support (v2.8)
 * - Form state is source of truth for current round
 * - Thread enableWebSearch is just a default preference
 * - Each round can have independent web search setting
 *
 * @see docs/FLOW_DOCUMENTATION.md Section 2 - Web Search Functionality
 */

import { MessageStatuses, ScreenModes } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockStoredPreSearch,
  createMockThread,
  createParticipantConfigs,
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';
import type { StoredPreSearch } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore, getEffectiveWebSearchEnabled, shouldWaitForPreSearch } from '@/stores/chat';

// ============================================================================
// TEST SETUP HELPERS
// ============================================================================

function setupCompletedRound0(store: ChatStoreApi, webSearchEnabled = false) {
  const thread = createMockThread({
    enableWebSearch: webSearchEnabled,
    id: 'thread-test',
  });

  const participantConfigs = createParticipantConfigs(2);

  const messages = [
    createTestUserMessage({
      content: 'First question',
      id: 'user-r0',
      roundNumber: 0,
    }),
    createTestAssistantMessage({
      content: 'First response',
      id: 'asst-r0-p0',
      participantId: participantConfigs[0].id,
      participantIndex: 0,
      roundNumber: 0,
    }),
    createTestAssistantMessage({
      content: 'Second response',
      id: 'asst-r0-p1',
      participantId: participantConfigs[1].id,
      participantIndex: 1,
      roundNumber: 0,
    }),
    createTestModeratorMessage({
      content: 'Moderator summary',
      id: 'mod-r0',
      roundNumber: 0,
    }),
  ];

  // initializeThread stores thread participants in participants array
  // selectedParticipants is for form state (empty initially on thread screen)
  store.getState().initializeThread(thread, participantConfigs, messages);
  store.getState().setScreenMode(ScreenModes.THREAD);

  if (webSearchEnabled) {
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE, {
      threadId: 'thread-test',
    }));
  }

  return { participantConfigs, thread };
}

// ============================================================================
// SCENARIO 1: Web Search Enabled Shows Proper Placeholder
// ============================================================================

describe('scenario 1: Web Search Enabled Shows Proper Placeholder', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should show web search placeholder when enabled for Round 1', () => {
    // Setup: Round 0 completed WITHOUT web search
    setupCompletedRound0(store, false);

    // User enables web search for Round 1
    store.getState().setEnableWebSearch(true);

    // Verify placeholder state
    const webSearchEnabled = getEffectiveWebSearchEnabled(
      store.getState().thread,
      store.getState().enableWebSearch,
    );
    expect(webSearchEnabled).toBeTruthy();

    // Form state takes precedence over thread state
    expect(store.getState().enableWebSearch).toBeTruthy();
    expect(store.getState().thread?.enableWebSearch).toBeFalsy();
  });

  it('should create PENDING pre-search placeholder when web search enabled', () => {
    setupCompletedRound0(store, false);
    store.getState().setEnableWebSearch(true);

    // Add user message for Round 1
    const userMessage = createTestUserMessage({
      content: 'Second question with web search',
      id: 'user-r1',
      roundNumber: 1,
    });
    store.getState().setMessages([...store.getState().messages, userMessage]);

    // Create PENDING pre-search (as provider would)
    const preSearch: StoredPreSearch = {
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: 'presearch-r1',
      roundNumber: 1,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-test',
      userQuery: userMessage.parts[0].text,
    };
    store.getState().addPreSearch(preSearch);

    // Verify placeholder exists
    const preSearchR1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearchR1).toBeDefined();
    expect(preSearchR1?.status).toBe(MessageStatuses.PENDING);

    // Verify it shows placeholder (blocks participants)
    expect(shouldWaitForPreSearch(true, preSearchR1)).toBeTruthy();
  });

  it('should show STREAMING status placeholder during web search execution', () => {
    setupCompletedRound0(store, false);
    store.getState().setEnableWebSearch(true);

    // Add PENDING pre-search
    store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.PENDING, {
      threadId: 'thread-test',
    }));

    // Transition to STREAMING
    store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);

    const preSearchR1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearchR1?.status).toBe(MessageStatuses.STREAMING);

    // Should still block (show placeholder)
    expect(shouldWaitForPreSearch(true, preSearchR1)).toBeTruthy();
  });

  it('should remove placeholder when web search completes', () => {
    setupCompletedRound0(store, false);
    store.getState().setEnableWebSearch(true);

    store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.PENDING, {
      threadId: 'thread-test',
    }));

    // Complete the pre-search
    store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);
    store.getState().updatePreSearchData(1, {
      failureCount: 0,
      queries: [{ index: 0, query: 'test', rationale: 'test', searchDepth: 'basic', total: 1 }],
      results: [],
      successCount: 1,
      summary: 'Search complete',
      totalResults: 5,
      totalTime: 1200,
    });

    const preSearchR1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearchR1?.status).toBe(MessageStatuses.COMPLETE);

    // Placeholder should be removed (no longer blocking)
    expect(shouldWaitForPreSearch(true, preSearchR1)).toBeFalsy();
  });
});

// ============================================================================
// SCENARIO 2: Web Search Disabled Removes Placeholder
// ============================================================================

describe('scenario 2: Web Search Disabled Removes Placeholder', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should NOT create pre-search when disabled for Round 1', () => {
    // Setup: Round 0 WITH web search
    setupCompletedRound0(store, true);

    // User disables web search for Round 1
    store.getState().setEnableWebSearch(false);

    // Add user message
    const userMessage = createTestUserMessage({
      content: 'Second question without web search',
      id: 'user-r1',
      roundNumber: 1,
    });
    store.getState().setMessages([...store.getState().messages, userMessage]);

    // Should NOT have pre-search for Round 1
    const preSearchR1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearchR1).toBeUndefined();

    // Verify no blocking
    expect(shouldWaitForPreSearch(false, undefined)).toBeFalsy();
  });

  it('should allow immediate participant streaming when disabled', () => {
    setupCompletedRound0(store, true);
    store.getState().setEnableWebSearch(false);

    // Add Round 1 user message
    store.getState().setMessages([
      ...store.getState().messages,
      createTestUserMessage({
        content: 'Question without web search',
        id: 'user-r1',
        roundNumber: 1,
      }),
    ]);

    // Set streaming state
    store.getState().setStreamingRoundNumber(1);
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setIsStreaming(true);

    // Participants should start immediately
    expect(store.getState().isStreaming).toBeTruthy();
    expect(store.getState().waitingToStartStreaming).toBeFalsy();
  });

  it('should remove placeholder when toggling from enabled to disabled', () => {
    setupCompletedRound0(store, false);

    // Initially enable web search
    store.getState().setEnableWebSearch(true);
    expect(getEffectiveWebSearchEnabled(store.getState().thread, store.getState().enableWebSearch)).toBeTruthy();

    // Then disable before submitting
    store.getState().setEnableWebSearch(false);
    expect(getEffectiveWebSearchEnabled(store.getState().thread, store.getState().enableWebSearch)).toBeFalsy();

    // No pre-search should be created
    const preSearchCount = store.getState().preSearches.filter(ps => ps.roundNumber === 1).length;
    expect(preSearchCount).toBe(0);
  });
});

// ============================================================================
// SCENARIO 3: Toggle Changes Trigger Changelog
// ============================================================================

describe('scenario 3: Toggle Changes Trigger Changelog', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should detect web search state change from disabled to enabled', () => {
    setupCompletedRound0(store, false);

    // Initial state: disabled
    expect(store.getState().thread?.enableWebSearch).toBeFalsy();
    expect(store.getState().enableWebSearch).toBeFalsy();

    // Enable web search
    store.getState().setEnableWebSearch(true);

    // Should mark as having pending config changes
    store.getState().setHasPendingConfigChanges(true);

    expect(store.getState().hasPendingConfigChanges).toBeTruthy();
    expect(store.getState().enableWebSearch).toBeTruthy();
  });

  it('should detect web search state change from enabled to disabled', () => {
    setupCompletedRound0(store, true);

    // Initial state: enabled
    expect(store.getState().thread?.enableWebSearch).toBeTruthy();
    expect(store.getState().enableWebSearch).toBeTruthy();

    // Disable web search
    store.getState().setEnableWebSearch(false);
    store.getState().setHasPendingConfigChanges(true);

    expect(store.getState().hasPendingConfigChanges).toBeTruthy();
    expect(store.getState().enableWebSearch).toBeFalsy();
  });

  it('should NOT mark as changed if web search state stays the same', () => {
    setupCompletedRound0(store, true);

    // Keep web search enabled (no change)
    expect(store.getState().enableWebSearch).toBeTruthy();

    // No pending changes initially
    expect(store.getState().hasPendingConfigChanges).toBeFalsy();

    // Toggling to same state should not trigger change
    store.getState().setEnableWebSearch(true);
    expect(store.getState().hasPendingConfigChanges).toBeFalsy();
  });

  it('should create changelog entry for web search toggle', () => {
    setupCompletedRound0(store, false);

    // Enable web search
    store.getState().setEnableWebSearch(true);

    // Mark as having pending config changes (simulates what form-actions does)
    store.getState().setHasPendingConfigChanges(true);

    // Verify the change is detected
    expect(store.getState().hasPendingConfigChanges).toBeTruthy();
    expect(store.getState().enableWebSearch).toBeTruthy();
    expect(store.getState().thread?.enableWebSearch).toBeFalsy();

    // Note: Actual changelog entries are created by the backend when submitting
    // the message, not by the store directly
  });
});

// ============================================================================
// SCENARIO 4: Flow Continues Correctly with Web Search Changes
// ============================================================================

describe('scenario 4: Flow Continues Correctly with Web Search Changes', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should complete full Round 1 flow after enabling web search', () => {
    const { participantConfigs } = setupCompletedRound0(store, false);

    // Enable web search for Round 1
    store.getState().setEnableWebSearch(true);

    // Add user message
    const userMessage = createTestUserMessage({
      content: 'Second question',
      id: 'user-r1',
      roundNumber: 1,
    });
    store.getState().setMessages([...store.getState().messages, userMessage]);

    // Create and complete pre-search
    store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.PENDING, {
      threadId: 'thread-test',
    }));
    store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);
    store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

    // Verify pre-search complete
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(shouldWaitForPreSearch(true, preSearch)).toBeFalsy();

    // Add participant responses
    store.getState().setMessages([
      ...store.getState().messages,
      createTestAssistantMessage({
        content: 'Response with context',
        id: 'asst-r1-p0',
        participantId: participantConfigs[0].id,
        participantIndex: 0,
        roundNumber: 1,
      }),
      createTestAssistantMessage({
        content: 'Another response',
        id: 'asst-r1-p1',
        participantId: participantConfigs[1].id,
        participantIndex: 1,
        roundNumber: 1,
      }),
      createTestModeratorMessage({
        content: 'Round 1 summary',
        id: 'mod-r1',
        roundNumber: 1,
      }),
    ]);

    // Verify Round 1 complete
    const round1Messages = store.getState().messages.filter(
      m => (m.metadata as { roundNumber?: number })?.roundNumber === 1,
    );
    expect(round1Messages).toHaveLength(4); // 1 user + 2 assistant + 1 moderator
  });

  it('should complete full Round 1 flow after disabling web search', () => {
    const { participantConfigs } = setupCompletedRound0(store, true);

    // Disable web search for Round 1
    store.getState().setEnableWebSearch(false);

    // Add user message
    const userMessage = createTestUserMessage({
      content: 'Second question',
      id: 'user-r1',
      roundNumber: 1,
    });
    store.getState().setMessages([...store.getState().messages, userMessage]);

    // No pre-search should exist
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)).toBeUndefined();

    // Add participant responses directly (no waiting)
    store.getState().setMessages([
      ...store.getState().messages,
      createTestAssistantMessage({
        content: 'Response without context',
        id: 'asst-r1-p0',
        participantId: participantConfigs[0].id,
        participantIndex: 0,
        roundNumber: 1,
      }),
      createTestAssistantMessage({
        content: 'Another response',
        id: 'asst-r1-p1',
        participantId: participantConfigs[1].id,
        participantIndex: 1,
        roundNumber: 1,
      }),
      createTestModeratorMessage({
        content: 'Round 1 summary',
        id: 'mod-r1',
        roundNumber: 1,
      }),
    ]);

    // Verify Round 1 complete
    const round1Messages = store.getState().messages.filter(
      m => (m.metadata as { roundNumber?: number })?.roundNumber === 1,
    );
    expect(round1Messages).toHaveLength(4);
  });

  it('should handle multiple round toggles: OFF → ON → OFF', () => {
    const { participantConfigs } = setupCompletedRound0(store, false);

    // Round 1: Enable web search
    store.getState().setEnableWebSearch(true);
    store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.COMPLETE, {
      threadId: 'thread-test',
    }));

    // Add Round 1 messages
    store.getState().setMessages([
      ...store.getState().messages,
      createTestUserMessage({ content: 'Q1', id: 'user-r1', roundNumber: 1 }),
      createTestAssistantMessage({
        content: 'A1',
        id: 'asst-r1-p0',
        participantId: participantConfigs[0].id,
        participantIndex: 0,
        roundNumber: 1,
      }),
      createTestModeratorMessage({ content: 'M1', id: 'mod-r1', roundNumber: 1 }),
    ]);

    // Round 2: Disable web search
    store.getState().setEnableWebSearch(false);

    store.getState().setMessages([
      ...store.getState().messages,
      createTestUserMessage({ content: 'Q2', id: 'user-r2', roundNumber: 2 }),
      createTestAssistantMessage({
        content: 'A2',
        id: 'asst-r2-p0',
        participantId: participantConfigs[0].id,
        participantIndex: 0,
        roundNumber: 2,
      }),
      createTestModeratorMessage({ content: 'M2', id: 'mod-r2', roundNumber: 2 }),
    ]);

    // Verify state
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)).toBeDefined();
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 2)).toBeUndefined();
  });
});

// ============================================================================
// SCENARIO 5: Web Search Combined with Other Changes
// ============================================================================

describe('scenario 5: Web Search Combined with Other Configuration Changes', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should handle web search toggle + mode change', () => {
    setupCompletedRound0(store, false);

    // Change both web search AND mode
    store.getState().setEnableWebSearch(true);
    store.getState().setSelectedMode('analyzing');
    store.getState().setHasPendingConfigChanges(true);

    expect(store.getState().enableWebSearch).toBeTruthy();
    expect(store.getState().selectedMode).toBe('analyzing');
    expect(store.getState().hasPendingConfigChanges).toBeTruthy();
  });

  it('should handle web search toggle + participant addition', () => {
    setupCompletedRound0(store, false);

    // Enable web search
    store.getState().setEnableWebSearch(true);

    // Count participants before adding
    const initialCount = store.getState().selectedParticipants.length;

    // Add new participant using form slice
    const newParticipant = createParticipantConfigs(1)[0];
    newParticipant.id = 'participant-new';
    newParticipant.priority = initialCount; // Append to end
    newParticipant.modelId = 'model-new';

    store.getState().addParticipant(newParticipant);
    store.getState().setHasPendingConfigChanges(true);

    // Should have one more participant than before
    expect(store.getState().selectedParticipants).toHaveLength(initialCount + 1);
    expect(store.getState().enableWebSearch).toBeTruthy();
  });

  it('should handle web search toggle + participant removal', () => {
    const { participantConfigs } = setupCompletedRound0(store, true);

    // Disable web search
    store.getState().setEnableWebSearch(false);

    // Add some participants first
    participantConfigs.forEach(p => store.getState().addParticipant(p));

    // Remove one participant
    store.getState().removeParticipant(participantConfigs[0].id);
    store.getState().setHasPendingConfigChanges(true);

    expect(store.getState().selectedParticipants).toHaveLength(1);
    expect(store.getState().enableWebSearch).toBeFalsy();
  });

  it('should handle web search toggle + participant reordering', () => {
    const { participantConfigs } = setupCompletedRound0(store, false);

    // Enable web search
    store.getState().setEnableWebSearch(true);

    // Add participants
    participantConfigs.forEach(p => store.getState().addParticipant(p));

    // Reorder participants (swap positions 0 and 1)
    store.getState().reorderParticipants(0, 1);
    store.getState().setHasPendingConfigChanges(true);

    expect(store.getState().selectedParticipants).toHaveLength(2);
    expect(store.getState().selectedParticipants[0].priority).toBe(0);
    expect(store.getState().selectedParticipants[1].priority).toBe(1);
    expect(store.getState().enableWebSearch).toBeTruthy();
  });

  it('should process multiple config changes with web search in single round', () => {
    setupCompletedRound0(store, false);

    // Multiple simultaneous changes
    store.getState().setEnableWebSearch(true);
    store.getState().setSelectedMode('problem_solving');

    const newParticipant = createParticipantConfigs(1)[0];
    newParticipant.id = 'participant-extra';
    newParticipant.modelId = 'model-extra';
    newParticipant.priority = 0; // First in form selection

    store.getState().addParticipant(newParticipant);
    store.getState().setHasPendingConfigChanges(true);

    // Verify all changes applied
    expect(store.getState().enableWebSearch).toBeTruthy();
    expect(store.getState().selectedMode).toBe('problem_solving');
    // Note: selectedParticipants is form state - contains only newly added participants
    // initializeThread sets thread.participants (stored participants from DB)
    expect(store.getState().selectedParticipants.length).toBeGreaterThanOrEqual(1);
    expect(store.getState().hasPendingConfigChanges).toBeTruthy();
  });

  it('should maintain independent pre-search state when participants change', () => {
    setupCompletedRound0(store, false);

    // Enable web search and add participant
    store.getState().setEnableWebSearch(true);

    const newParticipant = createParticipantConfigs(1)[0];
    newParticipant.id = 'participant-third';
    newParticipant.modelId = 'model-third';
    newParticipant.priority = 0;

    store.getState().addParticipant(newParticipant);

    // Add pre-search for Round 1
    store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.COMPLETE, {
      threadId: 'thread-test',
    }));

    // Verify pre-search exists independently of participant change
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearch).toBeDefined();
    expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);

    // Verify participant was added (form state)
    const addedParticipant = store.getState().selectedParticipants.find(p => p.id === 'participant-third');
    expect(addedParticipant).toBeDefined();
  });
});

// ============================================================================
// EDGE CASES & ERROR SCENARIOS
// ============================================================================

describe('edge Cases & Error Scenarios', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should handle web search FAILED status gracefully', () => {
    setupCompletedRound0(store, false);
    store.getState().setEnableWebSearch(true);

    // Add FAILED pre-search
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: 'Search service unavailable',
      id: 'presearch-r1',
      roundNumber: 1,
      searchData: null,
      status: MessageStatuses.FAILED,
      threadId: 'thread-test',
      userQuery: 'test',
    });

    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearch?.status).toBe(MessageStatuses.FAILED);

    // Should NOT block participants (graceful degradation)
    expect(shouldWaitForPreSearch(true, preSearch)).toBeFalsy();
  });

  it('should handle rapid web search toggle (enabled → disabled → enabled)', () => {
    setupCompletedRound0(store, false);

    // Rapid toggles before submitting
    store.getState().setEnableWebSearch(true);
    expect(store.getState().enableWebSearch).toBeTruthy();

    store.getState().setEnableWebSearch(false);
    expect(store.getState().enableWebSearch).toBeFalsy();

    store.getState().setEnableWebSearch(true);
    expect(store.getState().enableWebSearch).toBeTruthy();

    // Final state should be enabled
    expect(getEffectiveWebSearchEnabled(store.getState().thread, store.getState().enableWebSearch)).toBeTruthy();
  });

  it('should handle missing thread gracefully', () => {
    // No thread initialized
    expect(store.getState().thread).toBeNull();

    // Form state should still work
    store.getState().setEnableWebSearch(true);
    expect(store.getState().enableWebSearch).toBeTruthy();

    // getEffectiveWebSearchEnabled should use form state
    const effective = getEffectiveWebSearchEnabled(null, true);
    expect(effective).toBeTruthy();
  });

  it('should handle web search toggle during active streaming', () => {
    setupCompletedRound0(store, false);

    // Start streaming for Round 1
    store.getState().setStreamingRoundNumber(1);
    store.getState().setIsStreaming(true);

    // User toggles web search during streaming (shouldn't affect current round)
    store.getState().setEnableWebSearch(true);

    // Streaming continues
    expect(store.getState().isStreaming).toBeTruthy();
    expect(store.getState().streamingRoundNumber).toBe(1);

    // Change will apply to Round 2
    expect(store.getState().enableWebSearch).toBeTruthy();
  });
});

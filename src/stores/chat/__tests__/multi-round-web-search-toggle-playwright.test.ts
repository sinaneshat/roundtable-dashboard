/**
 * Multi-Round Web Search Toggle E2E Tests
 *
 * Tests comprehensive scenarios for toggling web search ON/OFF across multiple rounds
 * per FLOW_DOCUMENTATION.md PART 2 - Mid-Conversation Web Search Toggle.
 *
 * KEY BEHAVIORS TESTED:
 * 1. OFF → ON: Enable web search mid-conversation (Round 1 OFF, Round 2 ON)
 * 2. ON → OFF: Disable web search mid-conversation (Round 1 ON, Round 2 OFF)
 * 3. ON → OFF → ON: Toggle back and forth across rounds
 * 4. Each round can have different web search setting independently
 * 5. Form state (enableWebSearch) is source of truth for current round
 * 6. Thread's stored enableWebSearch is just a default preference
 *
 * BUG SCENARIOS COVERED:
 * - Web search enabled but participants preset (fixed in v2.9)
 * - Pre-search created but never executed (PENDING stuck)
 * - Pre-search status transitions per round (PENDING → STREAMING → COMPLETE)
 *
 * @see docs/FLOW_DOCUMENTATION.md Section 2 - Web Search Functionality
 * @see docs/FLOW_DOCUMENTATION.md Version 2.8 - Mid-Conversation Toggle Support
 * @see docs/FLOW_DOCUMENTATION.md Version 2.9 - Thread Screen Pre-Search Fix
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { MessageRoles, MessageStatuses, ScreenModes } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';
import { getEffectiveWebSearchEnabled, shouldWaitForPreSearch } from '../utils/pre-search-execution';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createUserMessage(roundNumber: number, text = `Question ${roundNumber}`) {
  return {
    id: `user-msg-r${roundNumber}`,
    role: MessageRoles.USER as const,
    parts: [{ type: 'text' as const, text }],
    metadata: { roundNumber, role: MessageRoles.USER },
  };
}

function createAssistantMessage(roundNumber: number, participantIndex: number) {
  return {
    id: `assistant-msg-r${roundNumber}-p${participantIndex}`,
    role: MessageRoles.ASSISTANT as const,
    parts: [{ type: 'text' as const, text: `Response from participant ${participantIndex}` }],
    metadata: {
      roundNumber,
      participantIndex,
      role: MessageRoles.ASSISTANT,
      modelId: `model-${participantIndex}`,
    },
  };
}

function createModeratorMessage(roundNumber: number) {
  return {
    id: `moderator-msg-r${roundNumber}`,
    role: MessageRoles.ASSISTANT as const,
    parts: [{ type: 'text' as const, text: 'Moderator summary' }],
    metadata: {
      roundNumber,
      role: MessageRoles.ASSISTANT,
      isModerator: true,
    },
  };
}

function createMockThread(options: {
  enableWebSearch?: boolean;
  mode?: string;
} = {}) {
  return {
    id: 'thread-123',
    userId: 'user-1',
    title: 'Test Thread',
    slug: 'test-thread',
    mode: options.mode || 'brainstorm',
    status: 'active',
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    enableWebSearch: options.enableWebSearch ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
  };
}

function createMockParticipants() {
  return [
    {
      id: 'participant-1',
      threadId: 'thread-123',
      modelId: 'model-a',
      role: null,
      priority: 0,
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'participant-2',
      threadId: 'thread-123',
      modelId: 'model-b',
      role: null,
      priority: 1,
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

function createPreSearch(
  roundNumber: number,
  status: 'pending' | 'streaming' | 'complete' | 'failed',
): StoredPreSearch {
  return {
    id: `presearch-round-${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    userQuery: `Query for round ${roundNumber}`,
    status: status === 'pending'
      ? MessageStatuses.PENDING
      : status === 'streaming'
        ? MessageStatuses.STREAMING
        : status === 'complete'
          ? MessageStatuses.COMPLETE
          : MessageStatuses.FAILED,
    searchData: status === 'complete'
      ? {
          queries: [{ query: 'test', rationale: 'test', searchDepth: 'basic' as const, index: 0, total: 1 }],
          results: [],
          summary: 'Search complete',
          successCount: 1,
          failureCount: 0,
          totalResults: 0,
          totalTime: 100,
        }
      : null,
    errorMessage: status === 'failed' ? 'Search failed' : null,
    createdAt: new Date(),
    completedAt: status === 'complete' ? new Date() : null,
  } as StoredPreSearch;
}

// ============================================================================
// SCENARIO 1: OFF → ON (Enable Web Search Mid-Conversation)
// ============================================================================

describe('scenario 1: OFF → ON - Enable Web Search Mid-Conversation', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should enable web search in Round 1 after Round 0 had it disabled', () => {
    // =====================================================
    // SETUP: Round 0 completed WITHOUT web search
    // =====================================================
    const thread = createMockThread({ enableWebSearch: false });
    const participants = createMockParticipants();

    store.getState().initializeThread(thread, participants, [
      createUserMessage(0, 'First question'),
      createAssistantMessage(0, 0),
      createAssistantMessage(0, 1),
      createModeratorMessage(0),
    ]);

    store.getState().setScreenMode(ScreenModes.THREAD);

    // Verify Round 0 state
    expect(store.getState().thread?.enableWebSearch).toBe(false);
    expect(store.getState().enableWebSearch).toBe(false);

    // =====================================================
    // USER ACTION: Enable web search for Round 1
    // =====================================================
    store.getState().setEnableWebSearch(true);

    // Verify form state updated but thread state unchanged
    expect(store.getState().enableWebSearch).toBe(true);
    expect(store.getState().thread?.enableWebSearch).toBe(false);

    // Form state is source of truth
    const webSearchEnabled = getEffectiveWebSearchEnabled(
      store.getState().thread,
      store.getState().enableWebSearch,
    );
    expect(webSearchEnabled).toBe(true);
  });

  it('should create PENDING pre-search for Round 1 when web search enabled', () => {
    // Setup: Round 0 complete without web search
    const thread = createMockThread({ enableWebSearch: false });
    store.getState().initializeThread(thread, createMockParticipants(), [
      createUserMessage(0),
      createAssistantMessage(0, 0),
      createModeratorMessage(0),
    ]);

    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setEnableWebSearch(true);

    // Add user message for Round 1
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMessage(1, 'Second question with web search'),
    ]);

    // Create PENDING pre-search (as provider does)
    store.getState().addPreSearch({
      id: 'placeholder-presearch-thread-123-1',
      threadId: 'thread-123',
      roundNumber: 1,
      userQuery: 'Second question with web search',
      status: MessageStatuses.PENDING,
      searchData: null,
      createdAt: new Date(),
      completedAt: null,
      errorMessage: null,
    });

    // Verify PENDING pre-search created
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearch).toBeDefined();
    expect(preSearch?.status).toBe(MessageStatuses.PENDING);

    // Should block participants until complete
    const webSearchEnabled = getEffectiveWebSearchEnabled(
      store.getState().thread,
      store.getState().enableWebSearch,
    );
    expect(shouldWaitForPreSearch(webSearchEnabled, preSearch)).toBe(true);
  });

  it('should allow participants after pre-search completes', () => {
    // Setup
    const thread = createMockThread({ enableWebSearch: false });
    store.getState().initializeThread(thread, createMockParticipants(), [
      createUserMessage(0),
      createAssistantMessage(0, 0),
      createModeratorMessage(0),
    ]);

    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setEnableWebSearch(true);

    // Add PENDING pre-search
    store.getState().addPreSearch(createPreSearch(1, 'pending'));

    // Simulate pre-search completion: PENDING → STREAMING → COMPLETE
    store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);

    store.getState().updatePreSearchData(1, {
      queries: [{ query: 'test', rationale: 'test', searchDepth: 'basic', index: 0, total: 1 }],
      results: [],
      summary: 'Done',
      successCount: 1,
      failureCount: 0,
      totalResults: 0,
      totalTime: 100,
    });

    // Verify COMPLETE
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);

    // Should NOT block participants
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(shouldWaitForPreSearch(true, preSearch)).toBe(false);
  });
});

// ============================================================================
// SCENARIO 2: ON → OFF (Disable Web Search Mid-Conversation)
// ============================================================================

describe('scenario 2: ON → OFF - Disable Web Search Mid-Conversation', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should disable web search in Round 1 after Round 0 had it enabled', () => {
    // =====================================================
    // SETUP: Round 0 completed WITH web search
    // =====================================================
    const thread = createMockThread({ enableWebSearch: true });
    const participants = createMockParticipants();

    store.getState().initializeThread(thread, participants, [
      createUserMessage(0, 'First question'),
      createAssistantMessage(0, 0),
      createAssistantMessage(0, 1),
      createModeratorMessage(0),
    ]);

    // Add Round 0 pre-search (complete)
    store.getState().addPreSearch(createPreSearch(0, 'complete'));

    store.getState().setScreenMode(ScreenModes.THREAD);

    // Verify Round 0 had web search enabled
    expect(store.getState().thread?.enableWebSearch).toBe(true);
    expect(store.getState().enableWebSearch).toBe(true);

    // =====================================================
    // USER ACTION: Disable web search for Round 1
    // =====================================================
    store.getState().setEnableWebSearch(false);

    // Verify form state updated
    expect(store.getState().enableWebSearch).toBe(false);
    expect(store.getState().thread?.enableWebSearch).toBe(true); // Thread unchanged

    // Form state is source of truth
    const webSearchEnabled = getEffectiveWebSearchEnabled(
      store.getState().thread,
      store.getState().enableWebSearch,
    );
    expect(webSearchEnabled).toBe(false);
  });

  it('should NOT create pre-search for Round 1 when web search disabled', () => {
    // Setup: Round 0 with web search enabled
    const thread = createMockThread({ enableWebSearch: true });
    store.getState().initializeThread(thread, createMockParticipants(), [
      createUserMessage(0),
      createAssistantMessage(0, 0),
      createModeratorMessage(0),
    ]);

    store.getState().addPreSearch(createPreSearch(0, 'complete'));
    store.getState().setScreenMode(ScreenModes.THREAD);

    // User disables web search for Round 1
    store.getState().setEnableWebSearch(false);

    // Add user message for Round 1
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMessage(1, 'Second question without web search'),
    ]);

    // Should NOT have pre-search for Round 1
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearch).toBeUndefined();

    // Should NOT wait (web search disabled)
    expect(shouldWaitForPreSearch(false, undefined)).toBe(false);
  });

  it('should allow participants immediately when web search disabled', () => {
    // Setup
    const thread = createMockThread({ enableWebSearch: true });
    store.getState().initializeThread(thread, createMockParticipants(), [
      createUserMessage(0),
      createAssistantMessage(0, 0),
      createModeratorMessage(0),
    ]);

    store.getState().addPreSearch(createPreSearch(0, 'complete'));
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Disable web search
    store.getState().setEnableWebSearch(false);

    // Add Round 1 messages
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMessage(1),
    ]);

    // Set streaming state
    store.getState().setStreamingRoundNumber(1);
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setIsStreaming(true);

    // Participants should start immediately
    expect(store.getState().isStreaming).toBe(true);
    expect(store.getState().waitingToStartStreaming).toBe(false);
  });
});

// ============================================================================
// SCENARIO 3: ON → OFF → ON (Toggle Back and Forth)
// ============================================================================

describe('scenario 3: ON → OFF → ON - Toggle Back and Forth', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should handle 3-round toggle: ON (R0) → OFF (R1) → ON (R2)', () => {
    // =====================================================
    // Round 0: Web search ON
    // =====================================================
    const thread = createMockThread({ enableWebSearch: true });
    const participants = createMockParticipants();

    store.getState().initializeThread(thread, participants, [
      createUserMessage(0),
      createAssistantMessage(0, 0),
      createAssistantMessage(0, 1),
      createModeratorMessage(0),
    ]);

    store.getState().addPreSearch(createPreSearch(0, 'complete'));
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Verify Round 0 had web search
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 0)).toBeDefined();
    expect(store.getState().enableWebSearch).toBe(true);

    // =====================================================
    // Round 1: Web search OFF
    // =====================================================
    store.getState().setEnableWebSearch(false);

    store.getState().setMessages([
      ...store.getState().messages,
      createUserMessage(1),
      createAssistantMessage(1, 0),
      createAssistantMessage(1, 1),
      createModeratorMessage(1),
    ]);

    // No pre-search for Round 1
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)).toBeUndefined();
    expect(getEffectiveWebSearchEnabled(store.getState().thread, store.getState().enableWebSearch)).toBe(false);

    // =====================================================
    // Round 2: Web search ON again
    // =====================================================
    store.getState().setEnableWebSearch(true);

    store.getState().addPreSearch(createPreSearch(2, 'pending'));

    // Should have pre-search for Round 2
    const preSearchR2 = store.getState().preSearches.find(ps => ps.roundNumber === 2);
    expect(preSearchR2).toBeDefined();
    expect(preSearchR2?.status).toBe(MessageStatuses.PENDING);
    expect(getEffectiveWebSearchEnabled(store.getState().thread, store.getState().enableWebSearch)).toBe(true);

    // Should block until complete
    expect(shouldWaitForPreSearch(true, preSearchR2)).toBe(true);

    // Complete pre-search
    store.getState().updatePreSearchStatus(2, MessageStatuses.COMPLETE);
    expect(shouldWaitForPreSearch(true, store.getState().preSearches.find(ps => ps.roundNumber === 2))).toBe(false);
  });

  it('should handle 4-round toggle: OFF (R0) → ON (R1) → OFF (R2) → ON (R3)', () => {
    // Round 0: OFF
    const thread = createMockThread({ enableWebSearch: false });
    store.getState().initializeThread(thread, createMockParticipants(), [
      createUserMessage(0),
      createAssistantMessage(0, 0),
      createModeratorMessage(0),
    ]);

    store.getState().setScreenMode(ScreenModes.THREAD);
    expect(store.getState().preSearches).toHaveLength(0);

    // Round 1: ON
    store.getState().setEnableWebSearch(true);
    store.getState().addPreSearch(createPreSearch(1, 'complete'));
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)).toBeDefined();

    // Round 2: OFF
    store.getState().setEnableWebSearch(false);
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 2)).toBeUndefined();

    // Round 3: ON
    store.getState().setEnableWebSearch(true);
    store.getState().addPreSearch(createPreSearch(3, 'pending'));
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 3)).toBeDefined();

    // Verify independent pre-search states
    expect(store.getState().preSearches).toHaveLength(2); // Round 1 and Round 3
    expect(store.getState().preSearches.map(ps => ps.roundNumber)).toEqual([1, 3]);
  });
});

// ============================================================================
// SCENARIO 4: Each Round Independent
// ============================================================================

describe('scenario 4: Each Round Has Independent Web Search Setting', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should maintain independent pre-search state per round', () => {
    // Round 0: Complete
    store.getState().addPreSearch(createPreSearch(0, 'complete'));

    // Round 1: Streaming
    store.getState().addPreSearch(createPreSearch(1, 'streaming'));

    // Round 2: Pending
    store.getState().addPreSearch(createPreSearch(2, 'pending'));

    // Verify each round independently
    const r0 = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const r1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    const r2 = store.getState().preSearches.find(ps => ps.roundNumber === 2);

    expect(shouldWaitForPreSearch(true, r0)).toBe(false); // Complete - don't wait
    expect(shouldWaitForPreSearch(true, r1)).toBe(true); // Streaming - wait
    expect(shouldWaitForPreSearch(true, r2)).toBe(true); // Pending - wait
  });

  it('should complete one round without affecting others', () => {
    store.getState().addPreSearch(createPreSearch(0, 'pending'));
    store.getState().addPreSearch(createPreSearch(1, 'pending'));
    store.getState().addPreSearch(createPreSearch(2, 'pending'));

    // Complete Round 1
    store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

    // Round 0 and 2 still pending
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 0)?.status).toBe(MessageStatuses.PENDING);
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)?.status).toBe(MessageStatuses.COMPLETE);
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 2)?.status).toBe(MessageStatuses.PENDING);

    // Verify blocking state per round
    const r0 = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const r1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    const r2 = store.getState().preSearches.find(ps => ps.roundNumber === 2);

    expect(shouldWaitForPreSearch(true, r0)).toBe(true);
    expect(shouldWaitForPreSearch(true, r1)).toBe(false);
    expect(shouldWaitForPreSearch(true, r2)).toBe(true);
  });
});

// ============================================================================
// SCENARIO 5: Form State is Source of Truth
// ============================================================================

describe('scenario 5: Form State is Source of Truth', () => {
  beforeEach(() => {
    createChatStore();
  });

  it('should use form state when thread has web search disabled', () => {
    const thread = createMockThread({ enableWebSearch: false });
    const formEnableWebSearch = true;

    // Form state overrides thread state
    expect(getEffectiveWebSearchEnabled(thread, formEnableWebSearch)).toBe(true);
    expect(getEffectiveWebSearchEnabled(thread, false)).toBe(false);
  });

  it('should use form state when thread has web search enabled', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const formEnableWebSearch = false;

    // Form state overrides thread state
    expect(getEffectiveWebSearchEnabled(thread, formEnableWebSearch)).toBe(false);
    expect(getEffectiveWebSearchEnabled(thread, true)).toBe(true);
  });

  it('should ignore thread state and always use form state', () => {
    const threadEnabled = createMockThread({ enableWebSearch: true });
    const threadDisabled = createMockThread({ enableWebSearch: false });

    // Form state is always used
    expect(getEffectiveWebSearchEnabled(threadEnabled, true)).toBe(true);
    expect(getEffectiveWebSearchEnabled(threadEnabled, false)).toBe(false);
    expect(getEffectiveWebSearchEnabled(threadDisabled, true)).toBe(true);
    expect(getEffectiveWebSearchEnabled(threadDisabled, false)).toBe(false);
  });
});

// ============================================================================
// SCENARIO 6: Thread Default Preference
// ============================================================================

describe('scenario 6: Thread enableWebSearch is Default Preference', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should sync thread preference to form state on initialization', () => {
    // Thread with web search enabled
    const threadEnabled = createMockThread({ enableWebSearch: true });
    store.getState().initializeThread(threadEnabled, createMockParticipants(), []);

    // Form state should sync to thread default
    expect(store.getState().enableWebSearch).toBe(true);

    // Create new store and test disabled
    const newStore = createChatStore();
    const threadDisabled = createMockThread({ enableWebSearch: false });
    newStore.getState().initializeThread(threadDisabled, createMockParticipants(), []);

    expect(newStore.getState().enableWebSearch).toBe(false);
  });

  it('should allow overriding thread default with form state', () => {
    const thread = createMockThread({ enableWebSearch: true });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // Initially synced
    expect(store.getState().enableWebSearch).toBe(true);

    // User overrides
    store.getState().setEnableWebSearch(false);
    expect(store.getState().enableWebSearch).toBe(false);
    expect(store.getState().thread?.enableWebSearch).toBe(true); // Thread unchanged

    // Form state is what matters
    expect(getEffectiveWebSearchEnabled(store.getState().thread, store.getState().enableWebSearch)).toBe(false);
  });
});

// ============================================================================
// BUG SCENARIO: Web Search Enabled + Preset Participants (v2.9 Fix)
// ============================================================================

describe('bUG SCENARIO: Web Search Enabled + Preset Participants', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should execute pre-search on THREAD screen with preset participants', () => {
    // Setup: Round 0 complete, on THREAD screen
    const thread = createMockThread({ enableWebSearch: false });
    const participants = createMockParticipants();

    store.getState().initializeThread(thread, participants, [
      createUserMessage(0),
      createAssistantMessage(0, 0),
      createAssistantMessage(0, 1),
      createModeratorMessage(0),
    ]);

    store.getState().setScreenMode(ScreenModes.THREAD);

    // User enables web search and has preset participants
    store.getState().setEnableWebSearch(true);
    store.getState().setExpectedParticipantIds(['model-a', 'model-b']);

    // Add PENDING pre-search (as provider creates)
    store.getState().addPreSearch(createPreSearch(1, 'pending'));
    store.getState().setPendingMessage('Second question');
    store.getState().setWaitingToStartStreaming(true);

    // Verify conditions for execution
    const state = store.getState();
    expect(state.screenMode).toBe(ScreenModes.THREAD);
    expect(state.enableWebSearch).toBe(true);
    expect(state.pendingMessage).toBeTruthy();
    expect(state.expectedParticipantIds).toHaveLength(2);

    const preSearch = state.preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearch?.status).toBe(MessageStatuses.PENDING);

    // Should wait for pre-search
    expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);

    // Simulate execution: PENDING → STREAMING → COMPLETE
    store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);
    expect(shouldWaitForPreSearch(true, store.getState().preSearches.find(ps => ps.roundNumber === 1))).toBe(true);

    store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);
    expect(shouldWaitForPreSearch(true, store.getState().preSearches.find(ps => ps.roundNumber === 1))).toBe(false);

    // Now participants can start
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setIsStreaming(true);
    expect(store.getState().isStreaming).toBe(true);
  });

  it('should NOT execute pre-search if already triggered', () => {
    store.getState().addPreSearch(createPreSearch(1, 'pending'));

    // First trigger succeeds
    expect(store.getState().tryMarkPreSearchTriggered(1)).toBe(true);
    expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);

    // Second trigger fails (already triggered)
    expect(store.getState().tryMarkPreSearchTriggered(1)).toBe(false);
  });
});

// ============================================================================
// EDGE CASE: Pre-Search Created But Never Executed
// ============================================================================

describe('eDGE CASE: Pre-Search Created But Never Executed', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should detect stuck PENDING pre-search', () => {
    store.getState().addPreSearch(createPreSearch(1, 'pending'));

    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearch?.status).toBe(MessageStatuses.PENDING);

    // Should block participants
    expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);

    // Verify it's blocking
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should recover from stuck PENDING by clearing tracking', () => {
    store.getState().addPreSearch(createPreSearch(1, 'pending'));
    store.getState().markPreSearchTriggered(1);

    // Stuck state
    expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
    expect(store.getState().tryMarkPreSearchTriggered(1)).toBe(false);

    // Clear tracking to allow retry
    store.getState().clearPreSearchTracking(1);

    // Can trigger again
    expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
    expect(store.getState().tryMarkPreSearchTriggered(1)).toBe(true);
  });
});

// ============================================================================
// STATUS TRANSITIONS: PENDING → STREAMING → COMPLETE
// ============================================================================

describe('sTATUS TRANSITIONS: PENDING → STREAMING → COMPLETE', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should transition through all states correctly', () => {
    // PENDING
    store.getState().addPreSearch(createPreSearch(0, 'pending'));
    let preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    expect(preSearch?.status).toBe(MessageStatuses.PENDING);
    expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);

    // STREAMING
    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);
    preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    expect(preSearch?.status).toBe(MessageStatuses.STREAMING);
    expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);

    // COMPLETE
    store.getState().updatePreSearchData(0, {
      queries: [{ query: 'test', rationale: 'test', searchDepth: 'basic', index: 0, total: 1 }],
      results: [],
      summary: 'Done',
      successCount: 1,
      failureCount: 0,
      totalResults: 0,
      totalTime: 100,
    });
    preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);
    expect(shouldWaitForPreSearch(true, preSearch)).toBe(false);
  });

  it('should handle FAILED status gracefully', () => {
    store.getState().addPreSearch(createPreSearch(0, 'pending'));
    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);

    // Failure
    store.getState().updatePreSearchStatus(0, MessageStatuses.FAILED);

    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    expect(preSearch?.status).toBe(MessageStatuses.FAILED);

    // Should NOT block (graceful degradation)
    expect(shouldWaitForPreSearch(true, preSearch)).toBe(false);
  });

  it('should track activity during streaming', () => {
    store.getState().addPreSearch(createPreSearch(0, 'streaming'));

    // Update activity
    store.getState().updatePreSearchActivity(0);

    const activityTime = store.getState().getPreSearchActivityTime(0);
    expect(activityTime).toBeGreaterThan(0);

    // Clear activity on complete
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);
    store.getState().clearPreSearchActivity(0);

    const clearedTime = store.getState().getPreSearchActivityTime(0);
    expect(clearedTime === undefined || clearedTime === 0).toBe(true);
  });
});

// ============================================================================
// PRE-SEARCH PLACEHOLDER BEHAVIOR TESTS
// ============================================================================

describe('pRE-SEARCH PLACEHOLDER: Appearance and Visibility', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should create pre-search placeholder immediately when web search ENABLED', () => {
    // Setup: Round 0 complete without web search
    const thread = createMockThread({ enableWebSearch: false });
    store.getState().initializeThread(thread, createMockParticipants(), [
      createUserMessage(0),
      createAssistantMessage(0, 0),
      createModeratorMessage(0),
    ]);

    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setEnableWebSearch(true);

    // User submits Round 1 with web search enabled
    const roundNumber = 1;

    // ✅ TEST: addPreSearch called immediately after submission
    store.getState().addPreSearch({
      id: `placeholder-presearch-thread-123-${roundNumber}`,
      threadId: 'thread-123',
      roundNumber,
      userQuery: 'Question with web search',
      status: MessageStatuses.PENDING,
      searchData: null,
      createdAt: new Date(),
      completedAt: null,
      errorMessage: null,
    });

    // ✅ VERIFY: Pre-search placeholder appears with correct roundNumber
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch).toBeDefined();
    expect(preSearch?.roundNumber).toBe(roundNumber);
    expect(preSearch?.status).toBe(MessageStatuses.PENDING);
    expect(preSearch?.searchData).toBeNull();
  });

  it('should NOT create pre-search placeholder when web search DISABLED', () => {
    // Setup: Round 0 complete
    const thread = createMockThread({ enableWebSearch: false });
    store.getState().initializeThread(thread, createMockParticipants(), [
      createUserMessage(0),
      createAssistantMessage(0, 0),
      createModeratorMessage(0),
    ]);

    store.getState().setScreenMode(ScreenModes.THREAD);
    // Web search remains disabled
    expect(store.getState().enableWebSearch).toBe(false);

    // User submits Round 1 with web search disabled
    const roundNumber = 1;
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMessage(roundNumber),
    ]);

    // ✅ VERIFY: No pre-search placeholder created
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch).toBeUndefined();
  });

  it('should keep pre-search placeholder visible during PENDING → STREAMING transition', () => {
    const roundNumber = 1;

    // Add PENDING pre-search
    store.getState().addPreSearch(createPreSearch(roundNumber, 'pending'));

    const pendingPreSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(pendingPreSearch).toBeDefined();
    expect(pendingPreSearch?.status).toBe(MessageStatuses.PENDING);

    // Transition to STREAMING
    store.getState().updatePreSearchStatus(roundNumber, MessageStatuses.STREAMING);

    // ✅ VERIFY: Pre-search still exists (not removed)
    const streamingPreSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(streamingPreSearch).toBeDefined();
    expect(streamingPreSearch?.roundNumber).toBe(roundNumber);
    expect(streamingPreSearch?.status).toBe(MessageStatuses.STREAMING);
  });

  it('should keep pre-search placeholder visible during STREAMING → COMPLETE transition', () => {
    const roundNumber = 1;

    // Add STREAMING pre-search
    store.getState().addPreSearch(createPreSearch(roundNumber, 'streaming'));

    const streamingPreSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(streamingPreSearch).toBeDefined();
    expect(streamingPreSearch?.status).toBe(MessageStatuses.STREAMING);

    // Transition to COMPLETE with data
    store.getState().updatePreSearchData(roundNumber, {
      queries: [{ query: 'test query', rationale: 'test rationale', searchDepth: 'basic', index: 0, total: 1 }],
      results: [],
      summary: 'Search complete',
      successCount: 1,
      failureCount: 0,
      totalResults: 0,
      totalTime: 150,
    });

    // ✅ VERIFY: Pre-search still exists with COMPLETE status
    const completePreSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(completePreSearch).toBeDefined();
    expect(completePreSearch?.roundNumber).toBe(roundNumber);
    expect(completePreSearch?.status).toBe(MessageStatuses.COMPLETE);
    expect(completePreSearch?.searchData).toBeDefined();
    expect(completePreSearch?.searchData?.queries).toHaveLength(1);
  });

  it('should NOT remove pre-search before COMPLETE status', () => {
    const roundNumber = 1;

    // Add PENDING pre-search
    store.getState().addPreSearch(createPreSearch(roundNumber, 'pending'));
    expect(store.getState().preSearches.find(ps => ps.roundNumber === roundNumber)).toBeDefined();

    // Update to STREAMING
    store.getState().updatePreSearchStatus(roundNumber, MessageStatuses.STREAMING);
    expect(store.getState().preSearches.find(ps => ps.roundNumber === roundNumber)).toBeDefined();

    // ✅ VERIFY: Pre-search remains throughout lifecycle
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch).toBeDefined();
    expect(preSearch?.status).toBe(MessageStatuses.STREAMING);

    // Only when COMPLETE should it stay visible (not removed)
    store.getState().updatePreSearchStatus(roundNumber, MessageStatuses.COMPLETE);
    expect(store.getState().preSearches.find(ps => ps.roundNumber === roundNumber)).toBeDefined();
  });
});

describe('pRE-SEARCH PLACEHOLDER: Progressive Content Updates', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should update pre-search placeholder with partial query data', () => {
    const roundNumber = 1;

    // Add STREAMING pre-search
    store.getState().addPreSearch(createPreSearch(roundNumber, 'streaming'));

    // ✅ TEST: updatePartialPreSearchData updates queries
    store.getState().updatePartialPreSearchData(roundNumber, {
      queries: [
        { query: 'first query', rationale: 'test rationale', searchDepth: 'basic', index: 0, total: 2 },
      ],
      results: [],
    });

    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch?.searchData).toBeDefined();
    expect(preSearch?.searchData?.queries).toHaveLength(1);
    expect(preSearch?.searchData?.queries[0]?.query).toBe('first query');
  });

  it('should progressively add queries as they arrive', () => {
    const roundNumber = 1;

    store.getState().addPreSearch(createPreSearch(roundNumber, 'streaming'));

    // First query arrives
    store.getState().updatePartialPreSearchData(roundNumber, {
      queries: [
        { query: 'first query', rationale: 'rationale 1', searchDepth: 'basic', index: 0, total: 3 },
      ],
      results: [],
    });

    let preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch?.searchData?.queries).toHaveLength(1);

    // Second query arrives
    store.getState().updatePartialPreSearchData(roundNumber, {
      queries: [
        { query: 'first query', rationale: 'rationale 1', searchDepth: 'basic', index: 0, total: 3 },
        { query: 'second query', rationale: 'rationale 2', searchDepth: 'basic', index: 1, total: 3 },
      ],
      results: [],
    });

    preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch?.searchData?.queries).toHaveLength(2);
    expect(preSearch?.searchData?.queries[1]?.query).toBe('second query');

    // Third query arrives
    store.getState().updatePartialPreSearchData(roundNumber, {
      queries: [
        { query: 'first query', rationale: 'rationale 1', searchDepth: 'basic', index: 0, total: 3 },
        { query: 'second query', rationale: 'rationale 2', searchDepth: 'basic', index: 1, total: 3 },
        { query: 'third query', rationale: 'rationale 3', searchDepth: 'basic', index: 2, total: 3 },
      ],
      results: [],
    });

    preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch?.searchData?.queries).toHaveLength(3);
    expect(preSearch?.searchData?.queries[2]?.query).toBe('third query');
  });

  it('should update pre-search placeholder with partial result data', () => {
    const roundNumber = 1;

    store.getState().addPreSearch(createPreSearch(roundNumber, 'streaming'));

    // ✅ TEST: updatePartialPreSearchData updates results
    store.getState().updatePartialPreSearchData(roundNumber, {
      queries: [
        { query: 'test query', rationale: 'rationale', searchDepth: 'basic', index: 0, total: 1 },
      ],
      results: [
        {
          query: 'test query',
          answer: 'Partial answer',
          results: [
            { title: 'Result 1', url: 'https://example.com/1', excerpt: 'excerpt 1' },
          ],
          responseTime: 50,
          index: 0,
        },
      ],
    });

    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch?.searchData?.results).toHaveLength(1);
    expect(preSearch?.searchData?.results[0]?.answer).toBe('Partial answer');
    expect(preSearch?.searchData?.results[0]?.results).toHaveLength(1);
  });

  it('should update pre-search placeholder with summary data', () => {
    const roundNumber = 1;

    store.getState().addPreSearch(createPreSearch(roundNumber, 'streaming'));

    // ✅ TEST: updatePartialPreSearchData updates summary
    store.getState().updatePartialPreSearchData(roundNumber, {
      queries: [],
      results: [],
      summary: 'Analysis in progress...',
    });

    let preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch?.searchData?.summary).toBe('Analysis in progress...');

    // Update summary again
    store.getState().updatePartialPreSearchData(roundNumber, {
      queries: [],
      results: [],
      summary: 'Final analysis summary',
    });

    preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch?.searchData?.summary).toBe('Final analysis summary');
  });

  it('should handle complete data updates with full payload', () => {
    const roundNumber = 1;

    store.getState().addPreSearch(createPreSearch(roundNumber, 'streaming'));

    // ✅ TEST: Final complete data update
    store.getState().updatePreSearchData(roundNumber, {
      queries: [
        { query: 'query 1', rationale: 'rationale 1', searchDepth: 'basic', index: 0, total: 2 },
        { query: 'query 2', rationale: 'rationale 2', searchDepth: 'basic', index: 1, total: 2 },
      ],
      results: [
        {
          query: 'query 1',
          answer: 'Answer 1',
          results: [
            { title: 'Result 1', url: 'https://example.com/1' },
          ],
          responseTime: 100,
          index: 0,
        },
        {
          query: 'query 2',
          answer: 'Answer 2',
          results: [
            { title: 'Result 2', url: 'https://example.com/2' },
          ],
          responseTime: 120,
          index: 1,
        },
      ],
      summary: 'Complete analysis',
      successCount: 2,
      failureCount: 0,
      totalResults: 2,
      totalTime: 220,
    });

    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);
    expect(preSearch?.searchData?.queries).toHaveLength(2);
    expect(preSearch?.searchData?.results).toHaveLength(2);
    expect(preSearch?.searchData?.summary).toBe('Complete analysis');
    expect(preSearch?.searchData?.totalTime).toBe(220);
    expect(preSearch?.completedAt).toBeDefined();
  });
});

describe('pRE-SEARCH PLACEHOLDER: Status Transitions', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should transition PENDING → STREAMING → COMPLETE correctly', () => {
    const roundNumber = 1;

    // PENDING
    store.getState().addPreSearch(createPreSearch(roundNumber, 'pending'));
    let preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch?.status).toBe(MessageStatuses.PENDING);
    expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);

    // STREAMING
    store.getState().updatePreSearchStatus(roundNumber, MessageStatuses.STREAMING);
    preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch?.status).toBe(MessageStatuses.STREAMING);
    expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);

    // COMPLETE
    store.getState().updatePreSearchData(roundNumber, {
      queries: [{ query: 'test', rationale: 'test', searchDepth: 'basic', index: 0, total: 1 }],
      results: [],
      summary: 'Done',
      successCount: 1,
      failureCount: 0,
      totalResults: 0,
      totalTime: 100,
    });
    preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);
    expect(shouldWaitForPreSearch(true, preSearch)).toBe(false);
  });

  it('should block participants during PENDING status', () => {
    const roundNumber = 1;

    store.getState().addPreSearch(createPreSearch(roundNumber, 'pending'));
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);

    // ✅ VERIFY: PENDING blocks participants
    expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);
  });

  it('should block participants during STREAMING status', () => {
    const roundNumber = 1;

    store.getState().addPreSearch(createPreSearch(roundNumber, 'streaming'));
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);

    // ✅ VERIFY: STREAMING blocks participants
    expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);
  });

  it('should NOT block participants after COMPLETE status', () => {
    const roundNumber = 1;

    store.getState().addPreSearch(createPreSearch(roundNumber, 'complete'));
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);

    // ✅ VERIFY: COMPLETE does not block
    expect(shouldWaitForPreSearch(true, preSearch)).toBe(false);
  });

  it('should NOT block participants after FAILED status', () => {
    const roundNumber = 1;

    store.getState().addPreSearch(createPreSearch(roundNumber, 'failed'));
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);

    // ✅ VERIFY: FAILED does not block (graceful degradation)
    expect(shouldWaitForPreSearch(true, preSearch)).toBe(false);
  });
});

// ============================================================================
// COMPLETE E2E JOURNEY: 3-Round Toggle
// ============================================================================

describe('cOMPLETE E2E JOURNEY: 3-Round Toggle', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should complete full journey: OFF → ON → OFF across 3 rounds', () => {
    // =====================================================
    // Round 0: Web search OFF
    // =====================================================
    const thread = createMockThread({ enableWebSearch: false });
    const participants = createMockParticipants();

    store.getState().initializeThread(thread, participants, [
      createUserMessage(0),
      createAssistantMessage(0, 0),
      createAssistantMessage(0, 1),
      createModeratorMessage(0),
    ]);

    store.getState().setScreenMode(ScreenModes.THREAD);

    // Verify Round 0 state
    expect(store.getState().enableWebSearch).toBe(false);
    expect(store.getState().preSearches).toHaveLength(0);

    // =====================================================
    // Round 1: Web search ON
    // =====================================================
    store.getState().setEnableWebSearch(true);

    // Add user message
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMessage(1, 'Question with web search'),
    ]);

    // Create PENDING pre-search
    store.getState().addPreSearch(createPreSearch(1, 'pending'));
    store.getState().setWaitingToStartStreaming(true);

    // Verify blocking
    const preSearchR1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(shouldWaitForPreSearch(true, preSearchR1)).toBe(true);

    // Execute: PENDING → STREAMING → COMPLETE
    store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);
    store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

    // Participants can start
    expect(shouldWaitForPreSearch(true, store.getState().preSearches.find(ps => ps.roundNumber === 1))).toBe(false);

    // Add participant responses
    store.getState().setMessages([
      ...store.getState().messages,
      createAssistantMessage(1, 0),
      createAssistantMessage(1, 1),
      createModeratorMessage(1),
    ]);

    // =====================================================
    // Round 2: Web search OFF again
    // =====================================================
    store.getState().setEnableWebSearch(false);

    // Add user message
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMessage(2, 'Question without web search'),
    ]);

    // No pre-search created
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 2)).toBeUndefined();

    // Participants start immediately
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setIsStreaming(true);

    expect(store.getState().isStreaming).toBe(true);

    // =====================================================
    // Final Verification
    // =====================================================
    // Only Round 1 has pre-search
    expect(store.getState().preSearches).toHaveLength(1);
    expect(store.getState().preSearches[0]?.roundNumber).toBe(1);
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);

    // Messages from all rounds
    const rounds = new Set(
      store.getState().messages.map(m => (m.metadata as { roundNumber?: number })?.roundNumber).filter((r): r is number => r !== undefined),
    );
    expect(rounds.size).toBe(3); // Rounds 0, 1, 2
    expect([...rounds].sort()).toEqual([0, 1, 2]);
  });
});

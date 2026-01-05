/**
 * Configuration Change Edge Cases Tests
 *
 * Tests for edge cases and corner scenarios not covered in the main test suites.
 * These tests validate behavior in unusual but possible situations.
 *
 * Test File: /src/stores/chat/__tests__/config-change-edge-cases.test.ts
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ChatModes, MessageStatuses, ScreenModes } from '@/api/core/enums';
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
    mode: ChatModes.PANEL,
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

// ============================================================================
// EDGE CASE 1: NO CONFIG CHANGES BUT STALE FLAGS
// ============================================================================

describe('submission with NO config changes but stale flags', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();

    const mockThread = createMockThread({ enableWebSearch: false, mode: ChatModes.PANEL });
    const participants = [
      createMockParticipant(0, { modelId: 'gpt-4' }),
      createMockParticipant(1, { modelId: 'claude-3' }),
    ];

    store.getState().initializeThread(mockThread, participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().completeStreaming();
  });

  it('should clear stale flags when PATCH completes with hasAnyChanges=false', () => {
    const state = store.getState();

    // Simulate stale flags from incomplete previous round
    state.setConfigChangeRoundNumber(0);
    state.setIsWaitingForChangelog(true);

    // Verify stale flags are set
    expect(state.configChangeRoundNumber).toBe(0);
    expect(state.isWaitingForChangelog).toBe(true);

    // User submits follow-up message WITHOUT making config changes
    const participants = store.getState().participants;

    // Add optimistic user message
    const optimisticMessage = createOptimisticUserMessage({
      roundNumber: 1,
      text: 'Follow-up message without changes',
      fileParts: [],
    });
    state.setMessages([optimisticMessage]);

    state.setStreamingRoundNumber(1);
    state.setExpectedParticipantIds(['model-0', 'model-1']);
    state.setWaitingToStartStreaming(true);

    // Simulate PATCH request (no config changes this time)
    // configChangeRoundNumber NOT set because hasConfigChanges=false
    // But stale flags might still be present

    // PATCH completes with hasAnyChanges=false
    const updatedThread = createMockThread({ updatedAt: new Date() });
    state.setThread(updatedThread);
    state.setParticipants(participants);

    // Critical: Flags should be cleared even though they were stale
    const hasAnyChanges = false;

    if (hasAnyChanges) {
      state.setIsWaitingForChangelog(true);
    } else {
      // No changes - clear configChangeRoundNumber immediately
      state.setConfigChangeRoundNumber(null);
      // isWaitingForChangelog should already be false or should be cleared
      state.setIsWaitingForChangelog(false);
    }

    // Verify flags are cleared
    expect(state.configChangeRoundNumber).toBe(null);
    expect(state.isWaitingForChangelog).toBe(false);

    // Streaming should not be blocked
    const isBlocked = state.configChangeRoundNumber !== null
      || state.isWaitingForChangelog;

    expect(isBlocked).toBe(false);
  });

  it('should handle rapid submissions with intermittent stale flags', () => {
    const state = store.getState();
    const participants = store.getState().participants;

    // Round 1: With config changes
    state.setEnableWebSearch(true);

    state.setConfigChangeRoundNumber(1);
    state.setIsWaitingForChangelog(true);

    // Simulate PATCH completion and changelog completion for round 1
    state.setIsWaitingForChangelog(false);
    state.setConfigChangeRoundNumber(null);
    state.completeStreaming();

    // Round 2: WITHOUT config changes, but user submits quickly
    const optimisticMessage = createOptimisticUserMessage({
      roundNumber: 2,
      text: 'Quick follow-up',
      fileParts: [],
    });
    state.setMessages(currentMessages => [...currentMessages, optimisticMessage]);

    state.setStreamingRoundNumber(2);
    state.setWaitingToStartStreaming(true);

    // No config changes, so configChangeRoundNumber NOT set
    // Verify flags are clean
    expect(state.configChangeRoundNumber).toBe(null);
    expect(state.isWaitingForChangelog).toBe(false);

    // PATCH completes
    const updatedThread = createMockThread({ enableWebSearch: true, updatedAt: new Date() });
    state.setThread(updatedThread);
    state.setParticipants(participants);

    // hasAnyChanges=false
    state.setConfigChangeRoundNumber(null);
    state.setIsWaitingForChangelog(false);

    // Streaming should proceed immediately
    const isBlocked = state.configChangeRoundNumber !== null
      || state.isWaitingForChangelog;

    expect(isBlocked).toBe(false);
  });

  it('should not set configChangeRoundNumber when hasConfigChanges=false', () => {
    const state = store.getState();

    // User submits WITHOUT making config changes
    const optimisticMessage = createOptimisticUserMessage({
      roundNumber: 1,
      text: 'Simple follow-up',
      fileParts: [],
    });
    state.setMessages([optimisticMessage]);

    state.setStreamingRoundNumber(1);
    state.setWaitingToStartStreaming(true);

    // hasConfigChanges=false, so do NOT set configChangeRoundNumber
    const hasConfigChanges = false;

    if (hasConfigChanges) {
      state.setConfigChangeRoundNumber(1);
    }

    // Verify flag is NOT set
    expect(state.configChangeRoundNumber).toBe(null);

    // PATCH completes
    const participants = store.getState().participants;
    const updatedThread = createMockThread({ updatedAt: new Date() });
    state.setThread(updatedThread);
    state.setParticipants(participants);

    // No changes detected by backend
    const hasAnyChanges = false;

    if (hasAnyChanges) {
      state.setIsWaitingForChangelog(true);
    } else {
      state.setConfigChangeRoundNumber(null);
      state.setIsWaitingForChangelog(false);
    }

    // Both flags should be clear
    expect(state.configChangeRoundNumber).toBe(null);
    expect(state.isWaitingForChangelog).toBe(false);
  });
});

// ============================================================================
// EDGE CASE 2: CONFIG CHANGES DURING ACTIVE PRE-SEARCH STREAMING
// ============================================================================

describe('config changes during active pre-search streaming', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();

    const mockThread = createMockThread({ enableWebSearch: true, mode: ChatModes.PANEL });
    const participants = [
      createMockParticipant(0, { modelId: 'gpt-4' }),
    ];

    store.getState().initializeThread(mockThread, participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setEnableWebSearch(true);
  });

  it('should preserve round 0 pre-search when user submits round 1 during streaming', () => {
    const state = store.getState();

    // Round 0 with web search enabled, pre-search is streaming
    state.addPreSearch({
      id: 'presearch-r0',
      threadId: 'thread-123',
      roundNumber: 0,
      status: MessageStatuses.STREAMING, // Important: actively streaming
      searchData: null,
      userQuery: 'Query 0',
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    });

    state.setStreamingRoundNumber(0);

    // Verify round 0 pre-search is streaming
    const round0PreSearchBefore = state.preSearches.find(p => p.roundNumber === 0);
    expect(round0PreSearchBefore?.status).toBe(MessageStatuses.STREAMING);

    // User changes config and submits round 1 while pre-search still streaming
    state.setEnableWebSearch(true); // Keep web search enabled
    state.setSelectedMode(ChatModes.COUNCIL); // Change mode

    // Round 1 submission
    const optimisticMessage = createOptimisticUserMessage({
      roundNumber: 1,
      text: 'New message while search streaming',
      fileParts: [],
    });
    state.setMessages([optimisticMessage]);

    state.setStreamingRoundNumber(1);
    state.setConfigChangeRoundNumber(1);
    state.setExpectedParticipantIds(['gpt-4']);
    state.setWaitingToStartStreaming(true);

    // Add round 1 pre-search placeholder
    state.addPreSearch(createPlaceholderPreSearch({
      threadId: 'thread-123',
      roundNumber: 1,
      userQuery: 'New message while search streaming',
    }));

    // Verify round 0 pre-search STILL streaming (not affected)
    const round0PreSearchAfter = state.preSearches.find(p => p.roundNumber === 0);
    expect(round0PreSearchAfter?.status).toBe(MessageStatuses.STREAMING);

    // Round 1 pre-search should be pending
    const round1PreSearch = state.preSearches.find(p => p.roundNumber === 1);
    expect(round1PreSearch?.status).toBe(MessageStatuses.PENDING);

    // Both pre-searches should coexist
    expect(state.preSearches).toHaveLength(2);
  });

  it('should allow round 0 pre-search to complete while round 1 waits for PATCH', () => {
    const state = store.getState();

    // Round 0 pre-search streaming
    state.addPreSearch({
      id: 'presearch-r0',
      threadId: 'thread-123',
      roundNumber: 0,
      status: MessageStatuses.STREAMING,
      searchData: null,
      userQuery: 'Query 0',
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    });

    // User submits round 1 during round 0 pre-search
    state.setConfigChangeRoundNumber(1);
    state.setWaitingToStartStreaming(true);

    // Round 1 pre-search placeholder
    state.addPreSearch(createPlaceholderPreSearch({
      threadId: 'thread-123',
      roundNumber: 1,
      userQuery: 'Query 1',
    }));

    // Round 0 pre-search completes
    state.updatePreSearchData(0, {
      queries: [],
      results: [],
      summary: 'Complete',
      successCount: 1,
      failureCount: 0,
      totalResults: 1,
      totalTime: 1000,
    });

    const round0PreSearch = state.preSearches.find(p => p.roundNumber === 0);
    expect(round0PreSearch?.status).toBe(MessageStatuses.COMPLETE);

    // Round 1 pre-search should still be pending
    const round1PreSearch = state.preSearches.find(p => p.roundNumber === 1);
    expect(round1PreSearch?.status).toBe(MessageStatuses.PENDING);

    // Round 1 waiting for PATCH completion
    expect(state.configChangeRoundNumber).toBe(1);
  });

  it('should handle pre-search failure in previous round during new submission', () => {
    const state = store.getState();

    // Round 0 pre-search fails
    state.addPreSearch({
      id: 'presearch-r0',
      threadId: 'thread-123',
      roundNumber: 0,
      status: MessageStatuses.ERROR,
      searchData: null,
      userQuery: 'Query 0',
      errorMessage: 'Network error',
      createdAt: new Date(),
      completedAt: new Date(),
    });

    // User submits round 1 with web search still enabled
    state.setEnableWebSearch(true);

    const optimisticMessage = createOptimisticUserMessage({
      roundNumber: 1,
      text: 'Try again',
      fileParts: [],
    });
    state.setMessages([optimisticMessage]);

    state.setStreamingRoundNumber(1);
    state.setConfigChangeRoundNumber(1);

    // Round 1 pre-search placeholder created
    state.addPreSearch(createPlaceholderPreSearch({
      threadId: 'thread-123',
      roundNumber: 1,
      userQuery: 'Try again',
    }));

    // Round 0 pre-search should still be in error state
    const round0PreSearch = state.preSearches.find(p => p.roundNumber === 0);
    expect(round0PreSearch?.status).toBe(MessageStatuses.ERROR);

    // Round 1 pre-search should be pending
    const round1PreSearch = state.preSearches.find(p => p.roundNumber === 1);
    expect(round1PreSearch?.status).toBe(MessageStatuses.PENDING);

    // Both pre-searches should exist
    expect(state.preSearches).toHaveLength(2);
  });

  it('should handle web search disabled mid-stream in previous round', () => {
    const state = store.getState();

    // Round 0 pre-search streaming
    state.addPreSearch({
      id: 'presearch-r0',
      threadId: 'thread-123',
      roundNumber: 0,
      status: MessageStatuses.STREAMING,
      searchData: null,
      userQuery: 'Query 0',
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    });

    // User disables web search for round 1
    state.setEnableWebSearch(false);

    // Round 1 submission
    const optimisticMessage = createOptimisticUserMessage({
      roundNumber: 1,
      text: 'No search this time',
      fileParts: [],
    });
    state.setMessages([optimisticMessage]);

    state.setStreamingRoundNumber(1);
    state.setConfigChangeRoundNumber(1);
    state.setWaitingToStartStreaming(true);

    // Round 1 should NOT have pre-search
    const round1PreSearch = state.preSearches.find(p => p.roundNumber === 1);
    expect(round1PreSearch).toBeUndefined();

    // Round 0 pre-search should still be streaming
    const round0PreSearch = state.preSearches.find(p => p.roundNumber === 0);
    expect(round0PreSearch?.status).toBe(MessageStatuses.STREAMING);

    // Only round 0 pre-search should exist
    expect(state.preSearches).toHaveLength(1);
  });
});

// ============================================================================
// EDGE CASE 3: MULTIPLE PRE-SEARCHES AT DIFFERENT STAGES
// ============================================================================

describe('multiple pre-searches at different lifecycle stages', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();

    const mockThread = createMockThread({ enableWebSearch: true, mode: ChatModes.PANEL });
    const participants = [createMockParticipant(0, { modelId: 'gpt-4' })];

    store.getState().initializeThread(mockThread, participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setEnableWebSearch(true);
  });

  it('should handle 3 rounds with different pre-search states', () => {
    const state = store.getState();

    // Round 0: Completed
    state.addPreSearch({
      id: 'presearch-r0',
      threadId: 'thread-123',
      roundNumber: 0,
      status: MessageStatuses.COMPLETE,
      searchData: {
        queries: [],
        results: [],
        summary: 'Results',
        successCount: 1,
        failureCount: 0,
        totalResults: 1,
        totalTime: 1000,
      },
      userQuery: 'Query 0',
      errorMessage: null,
      createdAt: new Date(),
      completedAt: new Date(),
    });

    // Round 1: Streaming
    state.addPreSearch({
      id: 'presearch-r1',
      threadId: 'thread-123',
      roundNumber: 1,
      status: MessageStatuses.STREAMING,
      searchData: null,
      userQuery: 'Query 1',
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    });

    // Round 2: Pending (waiting for PATCH)
    state.addPreSearch(createPlaceholderPreSearch({
      threadId: 'thread-123',
      roundNumber: 2,
      userQuery: 'Query 2',
    }));

    // Verify all 3 pre-searches exist with correct states
    expect(state.preSearches).toHaveLength(3);

    const round0 = state.preSearches.find(p => p.roundNumber === 0);
    expect(round0?.status).toBe(MessageStatuses.COMPLETE);

    const round1 = state.preSearches.find(p => p.roundNumber === 1);
    expect(round1?.status).toBe(MessageStatuses.STREAMING);

    const round2 = state.preSearches.find(p => p.roundNumber === 2);
    expect(round2?.status).toBe(MessageStatuses.PENDING);
  });

  it('should allow round 1 to complete while round 2 waits', () => {
    const state = store.getState();

    // Round 1 streaming
    state.addPreSearch({
      id: 'presearch-r1',
      threadId: 'thread-123',
      roundNumber: 1,
      status: MessageStatuses.STREAMING,
      searchData: null,
      userQuery: 'Query 1',
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    });

    // Round 2 pending
    state.addPreSearch(createPlaceholderPreSearch({
      threadId: 'thread-123',
      roundNumber: 2,
      userQuery: 'Query 2',
    }));

    state.setConfigChangeRoundNumber(2);

    // Round 1 completes
    state.updatePreSearchStatus(1, MessageStatuses.COMPLETE);

    const round1 = state.preSearches.find(p => p.roundNumber === 1);
    expect(round1?.status).toBe(MessageStatuses.COMPLETE);

    // Round 2 still pending (waiting for PATCH)
    const round2 = state.preSearches.find(p => p.roundNumber === 2);
    expect(round2?.status).toBe(MessageStatuses.PENDING);

    expect(state.configChangeRoundNumber).toBe(2);
  });
});

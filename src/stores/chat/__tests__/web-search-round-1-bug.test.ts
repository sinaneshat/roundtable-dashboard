/**
 * WEB SEARCH ROUND 1 BUG TEST
 *
 * Critical bug: Web search works on Round 0 but doesn't trigger on Round 1
 *
 * Expected Behavior:
 * - Round 0: PENDING pre-search created → Search executes → Participant streams
 * - Round 1: PENDING pre-search created → Search executes → Participant streams
 *
 * Actual Behavior (BUG):
 * - Round 0: Works correctly ✅
 * - Round 1: No PENDING pre-search created, participant streams immediately ❌
 *
 * This test verifies store-level behavior. Backend behavior is logged via console in streaming.handler.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import { createMockPreSearch } from '@/lib/testing';
import { createChatStore } from '@/stores/chat';
import type { ChatStore } from '@/stores/chat/store';

describe('web search round 1 bug - CRITICAL', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatStore;

  beforeEach(() => {
    store = createChatStore();
    getState = store.getState;
  });

  it('should track pre-searches for multiple rounds independently', () => {
    // ========================================================================
    // SETUP: Thread with web search enabled
    // ========================================================================
    getState().initializeThread({
      id: 'test-thread',
      userId: 'test-user',
      projectId: null,
      title: 'Test Thread',
      slug: 'test-thread',
      mode: 'brainstorming',
      status: 'active',
      isFavorite: false,
      isPublic: false,
      isAiGeneratedTitle: false,
      enableWebSearch: true, // ✅ Web search enabled
      metadata: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    });

    // Verify web search is enabled
    expect(getState().thread?.enableWebSearch).toBe(true);

    // ========================================================================
    // ROUND 0: Add pre-search
    // ========================================================================
    const round0PreSearch = createMockPreSearch({
      id: 'search-round-0',
      threadId: 'test-thread',
      roundNumber: 0,
      userQuery: 'First question',
      status: AnalysisStatuses.PENDING,
    });

    getState().addPreSearch(round0PreSearch);

    expect(getState().preSearches).toHaveLength(1);
    expect(getState().preSearches[0]?.roundNumber).toBe(0);

    // Complete Round 0 search
    getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

    // ========================================================================
    // ROUND 1: Add pre-search
    // ========================================================================
    const round1PreSearch = createMockPreSearch({
      id: 'search-round-1',
      threadId: 'test-thread',
      roundNumber: 1,
      userQuery: 'Second question',
      status: AnalysisStatuses.PENDING,
    });

    getState().addPreSearch(round1PreSearch);

    // ✅ CRITICAL: Should have 2 pre-searches (one per round)
    expect(getState().preSearches).toHaveLength(2);

    // ✅ Both rounds should be tracked
    const round0 = getState().preSearches.find(ps => ps.roundNumber === 0);
    const round1 = getState().preSearches.find(ps => ps.roundNumber === 1);

    expect(round0).toBeDefined();
    expect(round0?.status).toBe(AnalysisStatuses.COMPLETE);

    expect(round1).toBeDefined();
    expect(round1?.status).toBe(AnalysisStatuses.PENDING);

    // Complete Round 1 search
    getState().updatePreSearchStatus(1, AnalysisStatuses.COMPLETE);

    // ✅ Both should now be COMPLETE
    const finalState = getState();
    expect(finalState.preSearches.every(ps => ps.status === AnalysisStatuses.COMPLETE)).toBe(true);
  });

  it('should verify web search is enabled in thread state during Round 1', () => {
    // Setup thread with web search enabled
    getState().initializeThread({
      id: 'test-thread',
      userId: 'test-user',
      projectId: null,
      title: 'Test',
      slug: 'test',
      mode: 'brainstorming',
      status: 'active',
      isFavorite: false,
      isPublic: false,
      isAiGeneratedTitle: false,
      enableWebSearch: true,
      metadata: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    });

    // Verify web search is enabled
    const state = getState();
    expect(state.thread?.enableWebSearch).toBe(true);

    // This flag should remain true throughout all rounds
    expect(state.enableWebSearch).toBe(false); // Form state is separate
    expect(state.thread?.enableWebSearch).toBe(true); // Thread state persists
  });

  it('should track triggered pre-search rounds correctly for Round 0 and Round 1', () => {
    // Mark Round 0 as triggered
    getState().markPreSearchTriggered(0);
    expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
    expect(getState().hasPreSearchBeenTriggered(1)).toBe(false);

    // Mark Round 1 as triggered
    getState().markPreSearchTriggered(1);
    expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
    expect(getState().hasPreSearchBeenTriggered(1)).toBe(true);

    // Both rounds should be tracked independently
    const triggeredRounds = getState().triggeredPreSearchRounds;
    expect(triggeredRounds.size).toBe(2);
    expect(triggeredRounds.has(0)).toBe(true);
    expect(triggeredRounds.has(1)).toBe(true);
  });

  it('should handle web search being disabled mid-conversation', () => {
    // Setup thread with web search ENABLED initially
    getState().initializeThread({
      id: 'test-thread',
      userId: 'test-user',
      projectId: null,
      title: 'Test',
      slug: 'test',
      mode: 'brainstorming',
      status: 'active',
      isFavorite: false,
      isPublic: false,
      isAiGeneratedTitle: false,
      enableWebSearch: true, // ✅ Enabled for Round 0
      metadata: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    });

    // Add Round 0 pre-search (happened when web search was enabled)
    getState().addPreSearch(
      createMockPreSearch({
        id: 'search-0',
        threadId: 'test-thread',
        roundNumber: 0,
        userQuery: 'First message',
        status: AnalysisStatuses.COMPLETE,
      }),
    );

    expect(getState().preSearches).toHaveLength(1);
    expect(getState().thread?.enableWebSearch).toBe(true);

    // User disables web search mid-conversation
    const currentThread = getState().thread;
    if (currentThread) {
      getState().setThread({
        ...currentThread,
        enableWebSearch: false,
      });
    }

    expect(getState().thread?.enableWebSearch).toBe(false);

    // For Round 1, backend should NOT create a pre-search record
    // (This is expected backend behavior when enableWebSearch=false)

    // Store should still have only Round 0 pre-search
    expect(getState().preSearches).toHaveLength(1);
    expect(getState().preSearches[0]?.roundNumber).toBe(0);
  });
});

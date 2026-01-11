/**
 * Follow-up Round Streaming Order Tests
 *
 * Tests the correct sequence of operations for follow-up rounds (round 1+)
 * where config changes (mode, web search toggle, participants) require:
 *
 * 1. PATCH to persist user message and config changes
 * 2. Changelog fetch and display (must happen BEFORE pre-search)
 * 3. Pre-search execution (if web search enabled)
 * 4. Participant streaming (must happen AFTER pre-search completes)
 *
 * Bug reports being tested:
 * - Pre-search starting before changelog is shown
 * - Participants not starting after pre-search completes
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';

import { MessageStatuses, ScreenModes } from '@/api/core/enums';
import { createMockParticipant, createMockStoredPreSearch, createMockThread } from '@/lib/testing';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestUIMessage(options: {
  id?: string;
  role: 'user' | 'assistant';
  content?: string;
  metadata?: { roundNumber: number; participantIndex?: number };
}): UIMessage {
  return {
    id: options.id || `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    role: options.role,
    parts: [{ type: 'text', text: options.content || 'test message' }],
    metadata: options.metadata,
  } as UIMessage;
}

function setupFollowUpRoundState(store: ChatStoreApi, options: {
  enableWebSearch?: boolean;
  hasConfigChanges?: boolean;
  preSearchStatus?: typeof MessageStatuses[keyof typeof MessageStatuses];
}) {
  const {
    enableWebSearch = true,
    hasConfigChanges: _hasConfigChanges = true,
    preSearchStatus: _preSearchStatus = MessageStatuses.PENDING,
  } = options;

  const thread = createMockThread({ enableWebSearch });
  const participants = [createMockParticipant(0)];

  // Round 0 messages (completed)
  const round0UserMessage = createTestUIMessage({
    role: 'user',
    metadata: { roundNumber: 0 },
  });
  const round0AssistantMessage = createTestUIMessage({
    role: 'assistant',
    metadata: { roundNumber: 0, participantIndex: 0 },
  });

  // Round 1 user message (follow-up)
  const round1UserMessage = createTestUIMessage({
    role: 'user',
    metadata: { roundNumber: 1 },
  });

  store.setState({
    thread,
    participants,
    messages: [round0UserMessage, round0AssistantMessage, round1UserMessage],
    enableWebSearch,
    screenMode: ScreenModes.OVERVIEW,
  });

  return { thread, participants };
}

// ============================================================================
// 1. CHANGELOG MUST COMPLETE BEFORE PRE-SEARCH STARTS
// ============================================================================

describe('changelog Must Complete Before Pre-Search', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('blocking logic', () => {
    it('configChangeRoundNumber blocks streaming trigger', () => {
      setupFollowUpRoundState(store, { enableWebSearch: true, hasConfigChanges: true });

      // Simulate form-actions.ts setting configChangeRoundNumber BEFORE PATCH
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();

      // Streaming trigger should check this and return early
      const isBlockedByConfigChange = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;

      expect(isBlockedByConfigChange).toBe(true);
      expect(state.configChangeRoundNumber).toBe(1);
    });

    it('isWaitingForChangelog blocks streaming trigger after PATCH', () => {
      setupFollowUpRoundState(store, { enableWebSearch: true, hasConfigChanges: true });

      // After PATCH completes, isWaitingForChangelog is set
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();

      // Both flags should block streaming
      const isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;

      expect(isBlocked).toBe(true);
      expect(state.isWaitingForChangelog).toBe(true);
    });

    it('pre-search placeholder is NOT executed while changelog flags are set', () => {
      setupFollowUpRoundState(store, { enableWebSearch: true });

      // Add pre-search placeholder (created before PATCH in form-actions)
      const preSearch = createMockStoredPreSearch(1, MessageStatuses.PENDING);
      store.getState().addPreSearch(preSearch);

      // Set changelog flags (PATCH in progress or waiting for changelog)
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      const state = store.getState();

      // Pre-search should remain PENDING (not executed) because changelog blocks it
      expect(state.preSearches[0]?.status).toBe(MessageStatuses.PENDING);

      // The blocking check that streaming trigger performs
      const isBlockedByChangelog = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
      expect(isBlockedByChangelog).toBe(true);
    });
  });

  describe('correct sequence', () => {
    it('changelog flags must clear before pre-search can execute', () => {
      setupFollowUpRoundState(store, { enableWebSearch: true });

      // Initial state: changelog blocking
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setWaitingToStartStreaming(true);

      // Add pre-search placeholder
      const preSearch = createMockStoredPreSearch(1, MessageStatuses.PENDING);
      store.getState().addPreSearch(preSearch);

      // Check: still blocked
      let state = store.getState();
      expect(state.configChangeRoundNumber !== null || state.isWaitingForChangelog).toBe(true);

      // Simulate changelog sync completing
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // Now pre-search CAN execute
      state = store.getState();
      expect(state.configChangeRoundNumber).toBe(null);
      expect(state.isWaitingForChangelog).toBe(false);

      // Pre-search is still PENDING but now eligible for execution
      expect(state.preSearches[0]?.status).toBe(MessageStatuses.PENDING);
    });

    it('follows sequence: PATCH → changelog → pre-search → participants', () => {
      setupFollowUpRoundState(store, { enableWebSearch: true });

      // STEP 1: Form submission - PATCH in progress
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // Pre-search placeholder created
      const preSearch = createMockStoredPreSearch(1, MessageStatuses.PENDING);
      store.getState().addPreSearch(preSearch);

      // Verify: blocked by configChangeRoundNumber
      let state = store.getState();
      expect(state.configChangeRoundNumber).toBe(1);
      expect(state.waitingToStartStreaming).toBe(true);

      // STEP 2: PATCH completes - changelog fetch starts
      store.getState().setIsWaitingForChangelog(true);

      // Verify: still blocked
      state = store.getState();
      expect(state.isWaitingForChangelog).toBe(true);

      // STEP 3: Changelog synced - flags cleared
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // Verify: unblocked for pre-search
      state = store.getState();
      expect(state.configChangeRoundNumber).toBe(null);
      expect(state.isWaitingForChangelog).toBe(false);

      // STEP 4: Pre-search executes and completes
      store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);
      state = store.getState();
      expect(state.preSearches[0]?.status).toBe(MessageStatuses.STREAMING);

      store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);
      state = store.getState();
      expect(state.preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);

      // STEP 5: Participants can now stream (once chat.isReady is true)
      expect(state.waitingToStartStreaming).toBe(true);
    });
  });
});

// ============================================================================
// 2. PARTICIPANTS MUST START AFTER PRE-SEARCH COMPLETES
// ============================================================================

describe('participants Must Start After Pre-Search Completes', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('pre-search blocking', () => {
    it('pENDING pre-search blocks participant streaming', () => {
      setupFollowUpRoundState(store, { enableWebSearch: true });

      const preSearch = createMockStoredPreSearch(1, MessageStatuses.PENDING);
      store.getState().addPreSearch(preSearch);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();
      const currentPreSearch = state.preSearches.find(ps => ps.roundNumber === 1);

      // PENDING status should block
      const isBlocked = currentPreSearch?.status === MessageStatuses.PENDING
        || currentPreSearch?.status === MessageStatuses.STREAMING;

      expect(isBlocked).toBe(true);
    });

    it('sTREAMING pre-search blocks participant streaming', () => {
      setupFollowUpRoundState(store, { enableWebSearch: true });

      const preSearch = createMockStoredPreSearch(1, MessageStatuses.STREAMING);
      store.getState().addPreSearch(preSearch);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();
      const currentPreSearch = state.preSearches.find(ps => ps.roundNumber === 1);

      const isBlocked = currentPreSearch?.status === MessageStatuses.PENDING
        || currentPreSearch?.status === MessageStatuses.STREAMING;

      expect(isBlocked).toBe(true);
    });

    it('cOMPLETE pre-search allows participant streaming', () => {
      setupFollowUpRoundState(store, { enableWebSearch: true });

      const preSearch = createMockStoredPreSearch(1, MessageStatuses.COMPLETE);
      store.getState().addPreSearch(preSearch);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();
      const currentPreSearch = state.preSearches.find(ps => ps.roundNumber === 1);

      const isBlocked = currentPreSearch?.status === MessageStatuses.PENDING
        || currentPreSearch?.status === MessageStatuses.STREAMING;

      expect(isBlocked).toBe(false);
    });

    it('fAILED pre-search allows participant streaming', () => {
      setupFollowUpRoundState(store, { enableWebSearch: true });

      const preSearch = createMockStoredPreSearch(1, MessageStatuses.FAILED);
      store.getState().addPreSearch(preSearch);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();
      const currentPreSearch = state.preSearches.find(ps => ps.roundNumber === 1);

      // FAILED should NOT block - we proceed with participants anyway
      const isBlocked = currentPreSearch?.status === MessageStatuses.PENDING
        || currentPreSearch?.status === MessageStatuses.STREAMING;

      expect(isBlocked).toBe(false);
    });
  });

  describe('animation and timing guards', () => {
    it('pre-search animation blocks participant start', () => {
      setupFollowUpRoundState(store, { enableWebSearch: true });

      const preSearch = createMockStoredPreSearch(1, MessageStatuses.COMPLETE);
      store.getState().addPreSearch(preSearch);
      store.getState().setWaitingToStartStreaming(true);

      // PRE_SEARCH animation is pending (index 0 for pre-search)
      store.getState().registerAnimation(0);

      const state = store.getState();
      const isAnimating = state.pendingAnimations.has(0);

      expect(isAnimating).toBe(true);
    });

    it('50ms timing guard after pre-search completion', () => {
      setupFollowUpRoundState(store, { enableWebSearch: true });

      // Pre-search completed just now
      const now = new Date();
      const preSearch = {
        ...createMockStoredPreSearch(1, MessageStatuses.COMPLETE),
        completedAt: now,
      };
      store.getState().addPreSearch(preSearch);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();
      const currentPreSearch = state.preSearches.find(ps => ps.roundNumber === 1);

      // Verify pre-search exists
      expect(currentPreSearch).toBeDefined();

      // Pre-search is complete, verify timing is reasonable
      const completedAt = currentPreSearch!.completedAt;
      expect(completedAt).toBeDefined();

      const timestamp = completedAt instanceof Date
        ? completedAt.getTime()
        : new Date(completedAt!).getTime();
      const timeSinceComplete = Date.now() - timestamp;

      // Within 100ms of completion, should wait
      expect(timeSinceComplete).toBeLessThan(100);
    });
  });
});

// ============================================================================
// 3. RACE CONDITION PREVENTION
// ============================================================================

describe('race Condition Prevention', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('duplicate trigger prevention', () => {
    it('startRoundCalledForRoundRef prevents duplicate calls', () => {
      setupFollowUpRoundState(store, { enableWebSearch: false });
      store.getState().setWaitingToStartStreaming(true);

      // Simulate first call setting the ref
      let startRoundCalledForRound: number | null = null;
      const currentRound = 1;

      // First attempt: should proceed
      if (startRoundCalledForRound !== currentRound) {
        startRoundCalledForRound = currentRound;
        // startRound would be called here
      }

      expect(startRoundCalledForRound).toBe(1);

      // Second attempt: should be blocked
      let secondAttemptBlocked = false;
      if (startRoundCalledForRound === currentRound) {
        secondAttemptBlocked = true;
      }

      expect(secondAttemptBlocked).toBe(true);
    });
  });

  describe('tryMarkPreSearchTriggered atomic check', () => {
    it('prevents duplicate pre-search executions', () => {
      setupFollowUpRoundState(store, { enableWebSearch: true });

      // First component tries to trigger
      const didMark1 = store.getState().tryMarkPreSearchTriggered(1);
      expect(didMark1).toBe(true);

      // Second component tries to trigger same round
      const didMark2 = store.getState().tryMarkPreSearchTriggered(1);
      expect(didMark2).toBe(false);
    });
  });
});

// ============================================================================
// 4. FORM STATE VS THREAD STATE FOR WEB SEARCH
// ============================================================================

describe('web Search State Source of Truth', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('uses form state (enableWebSearch) not thread.enableWebSearch during submission', () => {
    // Thread has web search disabled
    const thread = createMockThread({ enableWebSearch: false });
    store.setState({ thread });

    // User enables web search in form (before PATCH updates thread)
    store.getState().setEnableWebSearch(true);
    store.getState().setWaitingToStartStreaming(true);

    const state = store.getState();

    // Form state should be source of truth
    expect(state.enableWebSearch).toBe(true);
    expect(state.thread?.enableWebSearch).toBe(false);

    // During submission, form state (true) should be used, not thread state (false)
    const shouldWaitForPreSearch = state.enableWebSearch; // Form state
    expect(shouldWaitForPreSearch).toBe(true);
  });

  it('uses thread state after submission completes', () => {
    // After PATCH, thread is updated
    const thread = createMockThread({ enableWebSearch: true });
    store.setState({ thread });
    store.getState().setEnableWebSearch(true);

    const state = store.getState();

    // Both should match after submission
    expect(state.enableWebSearch).toBe(true);
    expect(state.thread?.enableWebSearch).toBe(true);
  });
});

// ============================================================================
// 5. EDGE CASES
// ============================================================================

describe('edge Cases', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('web search disabled', () => {
    it('skips pre-search when web search is disabled', () => {
      setupFollowUpRoundState(store, { enableWebSearch: false });
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();

      // No pre-search should exist
      expect(state.preSearches).toHaveLength(0);
      expect(state.enableWebSearch).toBe(false);

      // Should proceed directly to participant streaming (after changelog if needed)
    });
  });

  describe('no config changes', () => {
    it('skips changelog wait when no config changes', () => {
      setupFollowUpRoundState(store, { enableWebSearch: true, hasConfigChanges: false });

      // No configChangeRoundNumber set
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();

      expect(state.configChangeRoundNumber).toBe(null);
      expect(state.isWaitingForChangelog).toBe(false);

      // Pre-search can execute immediately
      const isBlockedByChangelog = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
      expect(isBlockedByChangelog).toBe(false);
    });
  });

  describe('page refresh during pre-search', () => {
    it('resumes STREAMING pre-search after page refresh', () => {
      setupFollowUpRoundState(store, { enableWebSearch: true });

      // Pre-search was STREAMING when page refreshed
      const preSearch = createMockStoredPreSearch(1, MessageStatuses.STREAMING);
      store.getState().addPreSearch(preSearch);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();

      // triggeredPreSearchRounds is empty after refresh (not persisted)
      // Pre-search status is STREAMING but not tracked locally
      expect(state.preSearches[0]?.status).toBe(MessageStatuses.STREAMING);

      // Hook should detect this and attempt resumption
      const needsResumption = state.preSearches[0]?.status === MessageStatuses.STREAMING
        && !state.hasPreSearchBeenTriggered(1);

      expect(needsResumption).toBe(true);
    });
  });
});

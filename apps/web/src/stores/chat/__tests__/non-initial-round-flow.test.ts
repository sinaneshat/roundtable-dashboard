/**
 * Non-Initial Round Flow Tests
 *
 * Tests the flow for rounds after the initial round (round 0).
 * Critical flow: message + config changes → PATCH → changelog → pre-search/streaming
 *
 * Key issues being tested:
 * 1. Config changes must trigger changelog fetch
 * 2. Changelog must be fetched BEFORE streaming starts
 * 3. nextParticipantToTrigger must use latest config
 * 4. Pre-search blocking must work with changelog blocking
 */

import { ScreenModes } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

describe('non-Initial Round Flow', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  // ============================================================================
  // FLOW SIMULATION: Mimics handleUpdateThreadAndSend behavior
  // ============================================================================
  /**
   * Simulates form-actions.ts handleUpdateThreadAndSend flow:
   * 1. Calculate hasAnyChanges
   * 2. Set configChangeRoundNumber BEFORE anything else (if changes exist)
   * 3. Add pre-search placeholder (if enabled)
   * 4. Set waitingToStartStreaming
   * 5. Set nextParticipantToTrigger
   * 6. PATCH request
   * 7. Set isWaitingForChangelog AFTER PATCH (if changes exist)
   */
  function simulateHandleUpdateThreadAndSend(
    store: ChatStoreApi,
    params: {
      nextRound: number;
      hasParticipantChanges: boolean;
      modeChanged: boolean;
      webSearchChanged: boolean;
      hasPendingConfigChanges: boolean;
      enableWebSearch: boolean;
      threadId: string;
      firstParticipantId: string;
    },
  ) {
    const {
      enableWebSearch,
      firstParticipantId,
      hasParticipantChanges,
      hasPendingConfigChanges,
      modeChanged,
      nextRound,
      threadId,
      webSearchChanged,
    } = params;

    const hasAnyChanges = hasParticipantChanges || modeChanged || webSearchChanged || hasPendingConfigChanges;

    // Step 1: Set blocking flag BEFORE anything else (if changes exist)
    if (hasAnyChanges) {
      store.getState().setConfigChangeRoundNumber(nextRound);
    }

    // Step 2: Add pre-search placeholder if enabled
    if (enableWebSearch) {
      store.getState().addPreSearch({
        id: `pre-search-${nextRound}`,
        roundNumber: nextRound,
        searchData: null,
        status: 'pending',
        threadId,
        userQuery: 'Test query',
      });
    }

    // Step 3: Set streaming flags
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setNextParticipantToTrigger({ index: 0, participantId: firstParticipantId });
    store.getState().setStreamingRoundNumber(nextRound);

    // Step 4: Simulate PATCH success - set isWaitingForChangelog AFTER PATCH
    if (hasAnyChanges) {
      store.getState().setIsWaitingForChangelog(true);
    }

    // Step 5: Clear hasPendingConfigChanges after PATCH
    store.getState().setHasPendingConfigChanges(false);
  }

  describe('changelog Blocking for Config Changes', () => {
    it('should set configChangeRoundNumber BEFORE other state when config changes', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Round 0 complete
      store.getState().setMessages([
        createTestUserMessage({ content: 'First', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({ content: 'Response', id: 'a0', participantId: 'p1', participantIndex: 0, roundNumber: 0 }),
      ]);

      // User enables web search (config change)
      store.getState().setHasPendingConfigChanges(true);

      // Simulate flow start - configChangeRoundNumber should be set FIRST
      store.getState().setConfigChangeRoundNumber(1);

      // At this point, streaming should be blocked
      const isBlocked = store.getState().configChangeRoundNumber !== null;
      expect(isBlocked).toBeTruthy();

      // Now set other state
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger({ index: 0, participantId: 'p1' });

      // Still blocked - config change round is set
      expect(store.getState().configChangeRoundNumber).toBe(1);
    });

    it('should NOT set configChangeRoundNumber when no config changes', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setHasPendingConfigChanges(false);

      // No config changes - don't set blocking flag
      const state = store.getState();
      expect(state.configChangeRoundNumber).toBeNull();
      expect(state.isWaitingForChangelog).toBeFalsy();
    });

    it('should set isWaitingForChangelog AFTER PATCH when config changes', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Before PATCH - only configChangeRoundNumber set
      store.getState().setConfigChangeRoundNumber(1);
      expect(store.getState().isWaitingForChangelog).toBeFalsy();

      // After PATCH success - set isWaitingForChangelog
      store.getState().setIsWaitingForChangelog(true);

      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
    });
  });

  describe('pre-Search + Changelog Blocking Interaction', () => {
    it('should block streaming when both pre-search pending AND changelog waiting', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      simulateHandleUpdateThreadAndSend(store, {
        enableWebSearch: true,
        firstParticipantId: 'p1',
        hasParticipantChanges: false,
        hasPendingConfigChanges: false,
        modeChanged: false,
        nextRound: 1,
        threadId: 'thread-1',
        webSearchChanged: true,
      });

      const state = store.getState();

      // Both blocking conditions should be true
      expect(state.configChangeRoundNumber).toBe(1);
      expect(state.isWaitingForChangelog).toBeTruthy();

      // Pre-search should be added
      expect(state.preSearches.find(ps => ps.roundNumber === 1)).toBeDefined();

      // Streaming blocked by changelog
      const blockedByChangelog = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
      expect(blockedByChangelog).toBeTruthy();
    });

    it('should unblock streaming only after BOTH changelog AND pre-search complete', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      simulateHandleUpdateThreadAndSend(store, {
        enableWebSearch: true,
        firstParticipantId: 'p1',
        hasParticipantChanges: false,
        hasPendingConfigChanges: false,
        modeChanged: false,
        nextRound: 1,
        threadId: 'thread-1',
        webSearchChanged: true,
      });

      // Step 1: Clear changelog flags (simulates use-changelog-sync completion)
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // Changelog unblocked, but pre-search still pending
      const blockedByChangelog = store.getState().configChangeRoundNumber !== null || store.getState().isWaitingForChangelog;
      expect(blockedByChangelog).toBeFalsy();

      // Pre-search still pending
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch?.status).toBe('pending');

      // Step 2: Complete pre-search
      store.getState().updatePreSearchStatus(1, 'complete');

      const updatedPreSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(updatedPreSearch?.status).toBe('complete');
    });
  });

  describe('participant Config Changes Between Rounds', () => {
    it('should trigger changelog when participants change', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setParticipants([
        { createdAt: new Date(), id: 'p1', isEnabled: true, modelId: 'gpt-4', priority: 0, role: null, threadId: 't1', updatedAt: new Date() },
      ]);

      simulateHandleUpdateThreadAndSend(store, {
        enableWebSearch: false,
        firstParticipantId: 'p1',
        hasParticipantChanges: true, // <-- Key difference
        hasPendingConfigChanges: false,
        modeChanged: false,
        nextRound: 1,
        threadId: 'thread-1',
        webSearchChanged: false,
      });

      // Changelog should be triggered due to participant changes
      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
    });

    it('should update nextParticipantToTrigger when participants change after PATCH', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Initial participant
      const initialParticipant = { createdAt: new Date(), id: 'p1', isEnabled: true, modelId: 'gpt-4', priority: 0, role: null, threadId: 't1', updatedAt: new Date() };
      store.getState().setParticipants([initialParticipant]);
      store.getState().setNextParticipantToTrigger({ index: 0, participantId: 'p1' });

      // PATCH response returns updated participant with NEW ID
      const updatedParticipant = { createdAt: new Date(), id: 'p1-new', isEnabled: true, modelId: 'gpt-4', priority: 0, role: null, threadId: 't1', updatedAt: new Date() };
      store.getState().setParticipants([updatedParticipant]);

      // Update nextParticipantToTrigger with new ID (as form-actions.ts does)
      store.getState().setNextParticipantToTrigger({ index: 0, participantId: 'p1-new' });

      const state = store.getState();
      expect(state.nextParticipantToTrigger?.participantId).toBe('p1-new');
    });

    it('should detect stale participantId when config changed but trigger not updated', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Set initial trigger
      store.getState().setParticipants([
        { createdAt: new Date(), id: 'p1', isEnabled: true, modelId: 'gpt-4', priority: 0, role: null, threadId: 't1', updatedAt: new Date() },
      ]);
      store.getState().setNextParticipantToTrigger({ index: 0, participantId: 'p1' });

      // Config changes - different participant at index 0
      store.getState().setParticipants([
        { createdAt: new Date(), id: 'p2', isEnabled: true, modelId: 'claude-3', priority: 0, role: null, threadId: 't1', updatedAt: new Date() },
      ]);

      // Don't update nextParticipantToTrigger (simulating bug)
      const state = store.getState();
      const trigger = state.nextParticipantToTrigger;
      const actualParticipant = state.participants[trigger?.index ?? 0];

      // Mismatch detected
      expect(trigger?.participantId).toBe('p1');
      expect(actualParticipant?.id).toBe('p2');
      expect(trigger?.participantId).not.toBe(actualParticipant?.id);
    });
  });

  describe('mode Changes Between Rounds', () => {
    it('should trigger changelog when mode changes', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setThread({
        createdAt: new Date(),
        enableWebSearch: false,
        id: 'thread-1',
        isAiGeneratedTitle: false,
        isFavorite: false,
        isPublic: false,
        lastMessageAt: new Date(),
        mode: 'panel',
        participantCount: 1,
        slug: 'test',
        status: 'active',
        title: 'Test',
        updatedAt: new Date(),
        userId: 'user-1',
      });
      store.getState().setSelectedMode('council'); // Changed from panel

      simulateHandleUpdateThreadAndSend(store, {
        enableWebSearch: false,
        firstParticipantId: 'p1',
        hasParticipantChanges: false,
        hasPendingConfigChanges: false,
        modeChanged: true, // <-- Key difference
        nextRound: 1,
        threadId: 'thread-1',
        webSearchChanged: false,
      });

      // Changelog should be triggered due to mode change
      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
    });
  });

  describe('web Search Toggle Between Rounds', () => {
    it('should trigger changelog when web search enabled mid-conversation', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setThread({
        createdAt: new Date(),
        enableWebSearch: false, // Was disabled
        id: 'thread-1',
        isAiGeneratedTitle: false,
        isFavorite: false,
        isPublic: false,
        lastMessageAt: new Date(),
        mode: 'panel',
        participantCount: 1,
        slug: 'test',
        status: 'active',
        title: 'Test',
        updatedAt: new Date(),
        userId: 'user-1',
      });
      store.getState().setEnableWebSearch(true); // Now enabled

      simulateHandleUpdateThreadAndSend(store, {
        enableWebSearch: true,
        firstParticipantId: 'p1',
        hasParticipantChanges: false,
        hasPendingConfigChanges: false,
        modeChanged: false,
        nextRound: 1,
        threadId: 'thread-1',
        webSearchChanged: true, // <-- Key difference
      });

      // Changelog AND pre-search should be triggered
      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)).toBeDefined();
    });

    it('should trigger changelog when web search disabled mid-conversation', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setThread({
        createdAt: new Date(),
        enableWebSearch: true, // Was enabled
        id: 'thread-1',
        isAiGeneratedTitle: false,
        isFavorite: false,
        isPublic: false,
        lastMessageAt: new Date(),
        mode: 'panel',
        participantCount: 1,
        slug: 'test',
        status: 'active',
        title: 'Test',
        updatedAt: new Date(),
        userId: 'user-1',
      });
      store.getState().setEnableWebSearch(false); // Now disabled

      simulateHandleUpdateThreadAndSend(store, {
        enableWebSearch: false, // <-- No pre-search added
        firstParticipantId: 'p1',
        hasParticipantChanges: false,
        hasPendingConfigChanges: false,
        modeChanged: false,
        nextRound: 1,
        threadId: 'thread-1',
        webSearchChanged: true,
      });

      // Changelog should be triggered, but no pre-search
      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)).toBeUndefined();
    });
  });

  describe('no Config Changes Between Rounds', () => {
    it('should NOT trigger changelog when no config changes', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setThread({
        createdAt: new Date(),
        enableWebSearch: false,
        id: 'thread-1',
        isAiGeneratedTitle: false,
        isFavorite: false,
        isPublic: false,
        lastMessageAt: new Date(),
        mode: 'panel',
        participantCount: 1,
        slug: 'test',
        status: 'active',
        title: 'Test',
        updatedAt: new Date(),
        userId: 'user-1',
      });
      store.getState().setEnableWebSearch(false); // Same as thread
      store.getState().setSelectedMode('panel'); // Same as thread
      store.getState().setHasPendingConfigChanges(false);

      // No changes - don't set any changelog flags
      const state = store.getState();
      expect(state.configChangeRoundNumber).toBeNull();
      expect(state.isWaitingForChangelog).toBeFalsy();

      // Streaming should NOT be blocked
      const isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
      expect(isBlocked).toBeFalsy();
    });
  });

  describe('error Recovery - PATCH Failure', () => {
    it('should clear all changelog flags on PATCH failure', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Set up state before PATCH
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger({ index: 0, participantId: 'p1' });

      // Simulate PATCH failure - need to rollback
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setNextParticipantToTrigger(null);
      store.getState().setStreamingRoundNumber(null);

      const state = store.getState();
      expect(state.configChangeRoundNumber).toBeNull();
      expect(state.isWaitingForChangelog).toBeFalsy();
      expect(state.waitingToStartStreaming).toBeFalsy();
      expect(state.nextParticipantToTrigger).toBeNull();
    });
  });

  describe('multi-Round Flow Simulation', () => {
    it('should handle Round 0 → Round 1 (no changes) → Round 2 (with changes)', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Round 0 (initial) - no changelog
      store.getState().setMessages([
        createTestUserMessage({ content: 'First', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({ content: 'Response', id: 'a0', participantId: 'p1', participantIndex: 0, roundNumber: 0 }),
      ]);
      store.getState().completeStreaming();

      // Round 1 - no config changes
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger({ index: 0, participantId: 'p1' });
      store.getState().setStreamingRoundNumber(1);

      // Should NOT be blocked
      let isBlocked = store.getState().configChangeRoundNumber !== null || store.getState().isWaitingForChangelog;
      expect(isBlocked).toBeFalsy();

      // Complete round 1
      store.getState().setMessages([
        ...store.getState().messages,
        createTestUserMessage({ content: 'Second', id: 'u1', roundNumber: 1 }),
        createTestAssistantMessage({ content: 'Response 2', id: 'a1', participantId: 'p1', participantIndex: 0, roundNumber: 1 }),
      ]);
      store.getState().completeStreaming();

      // Round 2 - WITH config changes (enable web search)
      store.getState().setEnableWebSearch(true);
      store.getState().setHasPendingConfigChanges(true);

      simulateHandleUpdateThreadAndSend(store, {
        enableWebSearch: true,
        firstParticipantId: 'p1',
        hasParticipantChanges: false,
        hasPendingConfigChanges: true,
        modeChanged: false,
        nextRound: 2,
        threadId: 'thread-1',
        webSearchChanged: true,
      });

      // Should be blocked by changelog
      isBlocked = store.getState().configChangeRoundNumber !== null || store.getState().isWaitingForChangelog;
      expect(isBlocked).toBeTruthy();
      expect(store.getState().configChangeRoundNumber).toBe(2);
    });
  });

  describe('initializeThread Preserves Active Submission State', () => {
    it('should preserve changelog flags when initializeThread called during active submission', () => {
      // Set up active submission state
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setHasPendingConfigChanges(true);

      const thread = {
        createdAt: new Date(),
        enableWebSearch: false,
        id: 'thread-1',
        isAiGeneratedTitle: false,
        isFavorite: false,
        isPublic: false,
        lastMessageAt: new Date(),
        mode: 'brainstorm' as const,
        slug: 'test',
        status: 'active' as const,
        title: 'Test',
        updatedAt: new Date(),
        userId: 'user-1',
      };

      const participants = [{
        createdAt: new Date(),
        id: 'p1',
        isEnabled: true,
        modelId: 'gpt-4',
        priority: 0,
        role: null,
        threadId: 'thread-1',
        updatedAt: new Date(),
      }];

      // Call initializeThread (happens when PATCH response updates thread)
      store.getState().initializeThread(thread, participants, []);

      // Flags should be preserved
      const state = store.getState();
      expect(state.configChangeRoundNumber).toBe(1);
      expect(state.isWaitingForChangelog).toBeTruthy();
    });

    it('should reset changelog flags when initializeThread called without active submission', () => {
      // No active submission
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      const thread = {
        createdAt: new Date(),
        enableWebSearch: false,
        id: 'thread-1',
        isAiGeneratedTitle: false,
        isFavorite: false,
        isPublic: false,
        lastMessageAt: new Date(),
        mode: 'brainstorm' as const,
        slug: 'test',
        status: 'active' as const,
        title: 'Test',
        updatedAt: new Date(),
        userId: 'user-1',
      };

      const participants = [{
        createdAt: new Date(),
        id: 'p1',
        isEnabled: true,
        modelId: 'gpt-4',
        priority: 0,
        role: null,
        threadId: 'thread-1',
        updatedAt: new Date(),
      }];

      store.getState().initializeThread(thread, participants, []);

      // Flags should remain cleared
      const state = store.getState();
      expect(state.configChangeRoundNumber).toBeNull();
      expect(state.isWaitingForChangelog).toBeFalsy();
    });
  });
});

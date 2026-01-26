/**
 * Round Flow Race Conditions Tests
 *
 * Tests for race conditions in the round flow between hooks and store.
 * These edge cases cause bugs where:
 * 1. Streaming starts before changelog is fetched
 * 2. Wrong participant is triggered after config change
 * 3. Pre-search and changelog blocking conflict
 * 4. Multiple hooks compete for streaming trigger
 */

import { ScreenModes } from '@roundtable/shared';
import { MessageStatuses } from '@roundtable/shared/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

describe('round Flow Race Conditions', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('changelog vs Streaming Race', () => {
    it('should block streaming even if waitingToStartStreaming is set before configChangeRoundNumber', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Race condition: waitingToStart set BEFORE blocking flag
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger({ index: 0, participantId: 'p1' });

      // Then blocking flag set (correct order would be reverse)
      store.getState().setConfigChangeRoundNumber(1);

      // Streaming should STILL be blocked
      const isBlocked = store.getState().configChangeRoundNumber !== null || store.getState().isWaitingForChangelog;
      expect(isBlocked).toBeTruthy();
    });

    it('should detect race when isWaitingForChangelog cleared but configChangeRoundNumber still set', () => {
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      // Race: only one flag cleared
      store.getState().setIsWaitingForChangelog(false);
      // configChangeRoundNumber still set

      // Should still be blocked by configChangeRoundNumber
      const isBlocked = store.getState().configChangeRoundNumber !== null || store.getState().isWaitingForChangelog;
      expect(isBlocked).toBeTruthy();
    });

    it('should detect inconsistent state: isWaitingForChangelog=true but configChangeRoundNumber=null', () => {
      // This inconsistent state can happen due to race conditions
      store.getState().setIsWaitingForChangelog(true);
      // configChangeRoundNumber never set

      const state = store.getState();
      const isInconsistent = state.isWaitingForChangelog && state.configChangeRoundNumber === null;

      expect(isInconsistent).toBeTruthy();

      // The shouldFetch condition would be false (won't fetch changelog)
      const shouldFetch = state.isWaitingForChangelog && state.configChangeRoundNumber !== null;
      expect(shouldFetch).toBeFalsy();
    });
  });

  describe('participant Index Race Conditions', () => {
    it('should handle rapid participant changes during streaming setup', () => {
      const p1 = { createdAt: new Date(), id: 'p1', isEnabled: true, modelId: 'gpt-4', priority: 0, role: null, threadId: 't1', updatedAt: new Date() };
      const p2 = { createdAt: new Date(), id: 'p2', isEnabled: true, modelId: 'claude-3', priority: 1, role: null, threadId: 't1', updatedAt: new Date() };

      store.getState().setParticipants([p1, p2]);
      store.getState().setNextParticipantToTrigger({ index: 0, participantId: 'p1' });

      // Simulate rapid config change while streaming is being set up
      const p3 = { createdAt: new Date(), id: 'p3', isEnabled: true, modelId: 'gemini-pro', priority: 0, role: null, threadId: 't1', updatedAt: new Date() };
      store.getState().setParticipants([p3, p2]);

      // Now index 0 has p3 but trigger expects p1
      const state = store.getState();
      const trigger = state.nextParticipantToTrigger;
      const actualParticipant = state.participants[trigger?.index ?? 0];

      expect(trigger?.participantId).toBe('p1');
      expect(actualParticipant.id).toBe('p3');
      // This would fail validation in use-multi-participant-chat.ts
    });

    it('should handle participant count decrease during streaming', () => {
      const p1 = { createdAt: new Date(), id: 'p1', isEnabled: true, modelId: 'gpt-4', priority: 0, role: null, threadId: 't1', updatedAt: new Date() };
      const p2 = { createdAt: new Date(), id: 'p2', isEnabled: true, modelId: 'claude-3', priority: 1, role: null, threadId: 't1', updatedAt: new Date() };
      const p3 = { createdAt: new Date(), id: 'p3', isEnabled: true, modelId: 'gemini-pro', priority: 2, role: null, threadId: 't1', updatedAt: new Date() };

      store.getState().setParticipants([p1, p2, p3]);
      store.getState().setCurrentParticipantIndex(2); // About to trigger p3
      store.getState().setNextParticipantToTrigger({ index: 2, participantId: 'p3' });

      // Participant removed during streaming
      store.getState().setParticipants([p1, p2]);

      // Index 2 is now out of bounds
      const state = store.getState();
      const trigger = state.nextParticipantToTrigger;
      const participantCount = state.participants.length;

      expect(trigger?.index).toBe(2);
      expect(participantCount).toBe(2);
      expect(trigger && trigger.index >= participantCount).toBeTruthy();
    });
  });

  describe('multiple Hook Trigger Race', () => {
    it('should not double-trigger when both useRoundResumption and useStreamingTrigger active', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger({ index: 0, participantId: 'p1' });

      // Both hooks would check waitingToStartStreaming
      const state = store.getState();
      expect(state.waitingToStartStreaming).toBeTruthy();
      expect(state.nextParticipantToTrigger).not.toBeNull();

      // First hook triggers
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setIsStreaming(true);

      // Second hook should see streaming already started
      const afterFirstTrigger = store.getState();
      expect(afterFirstTrigger.isStreaming).toBeTruthy();
      expect(afterFirstTrigger.waitingToStartStreaming).toBeFalsy();
    });

    it('should handle concurrent prepareForNewMessage and streaming completion', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentParticipantIndex(1);

      // prepareForNewMessage called while streaming completes
      store.getState().prepareForNewMessage('New message', ['gpt-4']);

      // State should be reset for new message
      const state = store.getState();
      expect(state.currentParticipantIndex).toBe(0);
      expect(state.pendingMessage).toBe('New message');
    });
  });

  describe('pre-Search Race Conditions', () => {
    it('should handle pre-search completion before changelog completion', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Both blocking conditions set
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().addPreSearch({
        id: 'pre-search-1',
        roundNumber: 1,
        searchData: null,
        status: 'pending',
        threadId: 'thread-1',
        userQuery: 'Test',
      });

      // Pre-search completes first
      store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

      // Should still be blocked by changelog
      const blockedByChangelog = store.getState().configChangeRoundNumber !== null || store.getState().isWaitingForChangelog;
      expect(blockedByChangelog).toBeTruthy();

      // Pre-search is complete
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);
    });

    it('should handle changelog completion before pre-search completion', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Both blocking conditions set
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().addPreSearch({
        id: 'pre-search-1',
        roundNumber: 1,
        searchData: null,
        status: 'pending',
        threadId: 'thread-1',
        userQuery: 'Test',
      });

      // Changelog completes first
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // Changelog unblocked
      const blockedByChangelog = store.getState().configChangeRoundNumber !== null || store.getState().isWaitingForChangelog;
      expect(blockedByChangelog).toBeFalsy();

      // But pre-search still blocking
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch?.status).toBe('pending');
    });
  });

  describe('initializeThread Race Conditions', () => {
    it('should not reset flags when PATCH response triggers initializeThread during submission', () => {
      // Simulate submission in progress
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setWaitingToStartStreaming(true);

      // PATCH response triggers initializeThread
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

      store.getState().initializeThread(thread, [], []);

      // Flags should be preserved because configChangeRoundNumber !== null
      const state = store.getState();
      expect(state.configChangeRoundNumber).toBe(1);
      expect(state.isWaitingForChangelog).toBeTruthy();
    });

    it('should handle multiple rapid initializeThread calls', () => {
      const thread1 = {
        createdAt: new Date(),
        enableWebSearch: false,
        id: 'thread-1',
        isAiGeneratedTitle: false,
        isFavorite: false,
        isPublic: false,
        lastMessageAt: new Date(),
        mode: 'brainstorm' as const,
        slug: 'test-1',
        status: 'active' as const,
        title: 'Test 1',
        updatedAt: new Date(),
        userId: 'user-1',
      };

      const thread2 = {
        createdAt: new Date(),
        enableWebSearch: true,
        id: 'thread-2',
        isAiGeneratedTitle: false,
        isFavorite: false,
        isPublic: false,
        lastMessageAt: new Date(),
        mode: 'panel' as const,
        slug: 'test-2',
        status: 'active' as const,
        title: 'Test 2',
        updatedAt: new Date(),
        userId: 'user-1',
      };

      // Rapid calls (can happen during navigation)
      store.getState().initializeThread(thread1, [], []);
      store.getState().initializeThread(thread2, [], []);

      // Last call should win for thread data
      const state = store.getState();
      expect(state.thread?.id).toBe('thread-2');
      // Note: selectedMode is synced from thread.mode in initializeThread
      // but it follows the thread's mode directly
      expect(state.thread?.mode).toBe('panel');
    });
  });

  describe('screen Mode Transition Race Conditions', () => {
    it('should handle OVERVIEW to THREAD transition during streaming setup', () => {
      // Start in overview mode
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setWaitingToStartStreaming(true);

      // Transition to thread mode mid-setup
      store.getState().setScreenMode(ScreenModes.THREAD);

      // State should be consistent
      const state = store.getState();
      expect(state.screenMode).toBe(ScreenModes.THREAD);
      expect(state.waitingToStartStreaming).toBeTruthy();
    });

    it('should handle THREAD to OVERVIEW transition during active streaming', () => {
      // Start in thread mode with active streaming
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(1);

      // Transition to overview (navigation)
      store.getState().resetToOverview();

      // Should reset streaming state
      const state = store.getState();
      expect(state.screenMode).toBe(ScreenModes.OVERVIEW);
      expect(state.isStreaming).toBeFalsy();
      expect(state.currentParticipantIndex).toBe(0);
    });
  });

  describe('regeneration Race Conditions', () => {
    it('should block changelog during regeneration with config changes', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setMessages([
        createTestUserMessage({ content: 'Original', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({ content: 'Response', id: 'a0', participantId: 'p1', participantIndex: 0, roundNumber: 0 }),
      ]);

      // User changes config before regeneration
      store.getState().setHasPendingConfigChanges(true);

      // Start regeneration
      store.getState().startRegeneration(0);
      store.getState().setConfigChangeRoundNumber(0);
      store.getState().setIsWaitingForChangelog(true);

      // Should be blocked
      const isBlocked = store.getState().configChangeRoundNumber !== null || store.getState().isWaitingForChangelog;
      expect(isBlocked).toBeTruthy();
      expect(store.getState().isRegenerating).toBeTruthy();
    });

    it('should handle cancel regeneration race with streaming start', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setMessages([
        createTestUserMessage({ content: 'Original', id: 'u0', roundNumber: 0 }),
      ]);

      // Start regeneration
      store.getState().startRegeneration(0);

      // Cancel regeneration while streaming about to start
      store.getState().setIsStreaming(true); // Streaming started
      store.getState().setIsRegenerating(false); // Manual cancel via setter

      // Regeneration flags should be cleared but streaming continues
      const state = store.getState();
      expect(state.isRegenerating).toBeFalsy();
      expect(state.isStreaming).toBeTruthy();
      // Note: streaming continues - it's the responsibility of the streaming code
      // to check isRegenerating before proceeding
    });
  });

  describe('completeStreaming Race Conditions', () => {
    it('should NOT clear changelog flags on completeStreaming', () => {
      // This is intentional - changelog flags persist across streaming completion
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setIsStreaming(true);

      store.getState().completeStreaming();

      // Flags should persist - they're cleared by use-changelog-sync
      const state = store.getState();
      expect(state.configChangeRoundNumber).toBe(1);
      expect(state.isWaitingForChangelog).toBeTruthy();
      expect(state.isStreaming).toBeFalsy();
    });

    it('should reset both currentParticipantIndex and nextParticipantToTrigger', () => {
      store.getState().setCurrentParticipantIndex(2);
      store.getState().setNextParticipantToTrigger({ index: 1, participantId: 'p2' });
      store.getState().setIsStreaming(true);

      store.getState().completeStreaming();

      const state = store.getState();
      expect(state.currentParticipantIndex).toBe(0); // Reset
      // ✅ FIX: nextParticipantToTrigger is now reset to prevent infinite round triggering
      expect(state.nextParticipantToTrigger).toBeNull();
    });
  });

  describe('timeout Safety Race Conditions', () => {
    it('should handle changelog timeout clearing flags during active fetch', () => {
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      // Simulate timeout (30s) - flags should be cleared
      // In real code this happens in use-changelog-sync.ts useEffect
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBeFalsy();
      expect(state.configChangeRoundNumber).toBeNull();
    });

    it('should handle resumption timeout clearing waitingToStartStreaming', () => {
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger({ index: 0, participantId: 'p1' });

      // Simulate timeout (5s) - resumption flags should be cleared
      // In real code this happens in use-round-resumption.ts
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setNextParticipantToTrigger(null);

      const state = store.getState();
      expect(state.waitingToStartStreaming).toBeFalsy();
      expect(state.nextParticipantToTrigger).toBeNull();
    });
  });
});

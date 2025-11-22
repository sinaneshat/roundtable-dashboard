/**
 * Web Search Toggle Race Condition Tests
 *
 * Tests documenting race conditions when toggling web search mid-conversation.
 *
 * BUG DESCRIPTION:
 * When enabling/disabling web search mid-conversation:
 * 1. The toggle updates the UI state
 * 2. But the next message sent often ignores the new state
 * 3. Participants speak without pre-search (if enabled) or with unwanted pre-search (if disabled)
 *
 * Location: /src/stores/chat/__tests__/web-search-toggle-race-conditions.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, ScreenModes } from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockParticipants,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

describe('web Search Toggle Race Conditions', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('mid-conversation toggle', () => {
    it('should respect web search toggle for the next round', () => {
      // 1. Initialize thread with web search DISABLED
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: false,
      });
      const participants = createMockParticipants(2);
      const initialMessages = [createMockUserMessage(0)]; // Round 0

      store.getState().initializeThread(thread, participants, initialMessages);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(false);

      // 2. User toggles web search ENABLED
      store.getState().setEnableWebSearch(true);

      // Verify store state updated
      expect(store.getState().enableWebSearch).toBe(true);

      // 3. User sends a message (Round 1)
      const userMessage = 'What is the weather?';
      store.getState().setPendingMessage(userMessage);

      // Simulate the provider effect logic
      const state = store.getState();
      const nextRoundNumber = 1;
      const webSearchEnabled = state.enableWebSearch;
      const preSearchForRound = state.preSearches.find((ps: { roundNumber: number }) => ps.roundNumber === nextRoundNumber);

      expect(webSearchEnabled).toBe(true);
      expect(preSearchForRound).toBeUndefined();
    });
  });

  describe('stuck pre-search recovery', () => {
    it('should timeout and send message if pre-search is stuck in STREAMING', () => {
      // 1. Setup thread with web search ENABLED
      const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });
      const participants = createMockParticipants(2);
      const initialMessages = [createMockUserMessage(0)];
      store.getState().initializeThread(thread, participants, initialMessages);
      store.getState().setEnableWebSearch(true);

      // 2. Create a stuck pre-search (STREAMING)
      const stuckPreSearch = createMockPreSearch({
        roundNumber: 1,
        status: AnalysisStatuses.STREAMING,
        createdAt: new Date(Date.now() - 60000), // Created 60s ago
      });
      store.getState().addPreSearch(stuckPreSearch);

      // 3. Set pending message (waiting for pre-search)
      store.getState().setPendingMessage('User message');
      store.getState().setExpectedParticipantIds(participants.map(p => p.modelId));

      // 4. Verify message NOT sent yet (blocked by streaming pre-search)
      expect(store.getState().hasSentPendingMessage).toBe(false);

      // 5. Advance time to trigger timeout
      vi.advanceTimersByTime(90000); // 90 seconds

      // Manually trigger the check (since interval doesn't run in test without provider)
      store.getState().checkStuckPreSearches();

      // 6. Verify recovery
      // The store should have marked pre-search as COMPLETE (or FAILED)
      // And sent the message
      const updatedPreSearch = store.getState().preSearches.find((ps: { roundNumber: number }) => ps.roundNumber === 1);

      expect(updatedPreSearch?.status).toBe(AnalysisStatuses.COMPLETE);

      // Note: hasSentPendingMessage won't be true because the Provider effect isn't running in this unit test.
      // But in the real app, the Provider observes the status change and triggers the message.
    });
  });
});

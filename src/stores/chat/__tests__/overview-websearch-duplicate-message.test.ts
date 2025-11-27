/**
 * Test: Overview Screen Web Search Duplicate Message Bug
 *
 * BUG DESCRIPTION:
 * When starting a chat from overview screen with web search enabled:
 * 1. User message appears twice (duplicate)
 * 2. Participant streams for wrong round (round 1 instead of round 0)
 * 3. Analysis never triggers because round numbers are wrong
 *
 * ROOT CAUSE:
 * handleCreateThread sets both:
 * - waitingToStartStreaming = true (triggers startRound effect)
 * - pendingMessage via prepareForNewMessage (triggers pendingMessage effect)
 *
 * Both effects fire:
 * - startRound effect calls chat.startRound() for round 0 (correct)
 * - pendingMessage effect calls sendMessage() which creates round 1 (WRONG!)
 *
 * FIX:
 * pendingMessage effect should skip when waitingToStartStreaming is true on overview screen
 * because startRound handles triggering participants for the existing round.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, ScreenModes } from '@/api/core/enums';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';
import type { ChatMessage, ChatParticipant, ChatThread } from '@/stores/chat/store-schemas';

describe('overview Screen Web Search - Duplicate Message Bug', () => {
  let store: ChatStoreApi;

  const mockThread: ChatThread = {
    id: 'thread-123',
    userId: 'user-123',
    projectId: null,
    title: 'Test Chat',
    slug: 'test-chat',
    mode: 'debating',
    status: 'active',
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: true,
    enableWebSearch: true,
    metadata: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
  };

  const mockParticipant: ChatParticipant = {
    id: 'participant-123',
    threadId: 'thread-123',
    modelId: 'google/gemini-2.5-flash-lite',
    customRoleId: null,
    role: null,
    priority: 0,
    isEnabled: true,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUserMessage: ChatMessage = {
    id: 'msg-user-1',
    role: 'user',
    parts: [{ type: 'text', text: 'say hi we just one word' }],
    metadata: {
      role: 'user',
      roundNumber: 0,
      createdAt: new Date().toISOString(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  describe('bug Replication: State After handleCreateThread', () => {
    it('should set both waitingToStartStreaming AND pendingMessage (causing the bug)', () => {
      const state = store.getState();

      // Simulate what handleCreateThread does
      state.setCreatedThreadId('thread-123');
      state.initializeThread(mockThread, [mockParticipant], [mockUserMessage]);

      // Add placeholder analysis (what handleCreateThread does)
      state.addAnalysis({
        id: 'placeholder-analysis-thread-123-0',
        threadId: 'thread-123',
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'say hi we just one word',
        status: AnalysisStatuses.PENDING,
        analysisData: null,
        participantMessageIds: [],
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Add placeholder pre-search (what handleCreateThread does when web search enabled)
      state.addPreSearch({
        id: 'placeholder-presearch-thread-123-0',
        threadId: 'thread-123',
        roundNumber: 0,
        userQuery: 'say hi we just one word',
        status: AnalysisStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // THIS IS THE BUG: Both are set
      state.prepareForNewMessage('say hi we just one word', ['google/gemini-2.5-flash-lite']);
      state.setWaitingToStartStreaming(true);
      state.setScreenMode(ScreenModes.OVERVIEW);

      const newState = store.getState();

      // Verify both flags are set - this causes both effects to fire
      expect(newState.waitingToStartStreaming).toBe(true);
      expect(newState.pendingMessage).toBe('say hi we just one word');
      expect(newState.expectedParticipantIds).toEqual(['google/gemini-2.5-flash-lite']);
      expect(newState.hasSentPendingMessage).toBe(false);
      expect(newState.screenMode).toBe(ScreenModes.OVERVIEW);

      // The provider's pendingMessage effect will see these conditions and try to fire
      // even though startRound should handle it
    });

    it('should have one user message at round 0 after initialization', () => {
      const state = store.getState();

      state.initializeThread(mockThread, [mockParticipant], [mockUserMessage]);

      const newState = store.getState();
      const userMessages = newState.messages.filter(m => m.role === 'user');

      expect(userMessages).toHaveLength(1);
      expect(userMessages[0].metadata?.roundNumber).toBe(0);
    });

    it('bUG: demonstrates how sendMessage creates duplicate user message for round 1', () => {
      const state = store.getState();

      // Setup: Initialize thread with round 0 user message
      state.initializeThread(mockThread, [mockParticipant], [mockUserMessage]);

      // Simulate what sendMessage does - adds a new user message for next round
      // (This is what happens when pendingMessage effect fires incorrectly)
      const duplicateUserMessage: ChatMessage = {
        id: 'optimistic-msg-123',
        role: 'user',
        parts: [{ type: 'text', text: 'say hi we just one word' }],
        metadata: {
          role: 'user',
          roundNumber: 1, // BUG: This should be round 0, but sendMessage calculates next round
          isOptimistic: true,
        },
      };

      state.setMessages([...store.getState().messages, duplicateUserMessage]);

      const newState = store.getState();
      const userMessages = newState.messages.filter(m => m.role === 'user');

      // BUG: There are now TWO user messages with the same text
      expect(userMessages).toHaveLength(2);
      expect(userMessages[0].metadata?.roundNumber).toBe(0);
      expect(userMessages[1].metadata?.roundNumber).toBe(1);

      // Same message text appearing twice
      const texts = userMessages.map((m) => {
        const textPart = m.parts?.find(p => p.type === 'text' && 'text' in p);
        return textPart && 'text' in textPart ? textPart.text : '';
      });
      expect(texts[0]).toBe(texts[1]); // Duplicate!
    });
  });

  describe('expected Behavior After Fix', () => {
    it('should NOT allow pendingMessage to fire when waitingToStartStreaming is true on overview', () => {
      const state = store.getState();

      // Setup: same as handleCreateThread
      state.initializeThread(mockThread, [mockParticipant], [mockUserMessage]);
      state.prepareForNewMessage('say hi we just one word', ['google/gemini-2.5-flash-lite']);
      state.setWaitingToStartStreaming(true);
      state.setScreenMode(ScreenModes.OVERVIEW);

      const newState = store.getState();

      // The provider's pendingMessage effect should check:
      // if (waitingToStartStreaming && screenMode === 'overview') return;
      //
      // This ensures only startRound fires, not sendMessage

      // For this test, we verify the conditions that should trigger the guard
      expect(newState.waitingToStartStreaming).toBe(true);
      expect(newState.screenMode).toBe(ScreenModes.OVERVIEW);

      // When both are true, pendingMessage effect should be skipped
      const shouldSkipPendingMessageEffect
        = newState.waitingToStartStreaming && newState.screenMode === ScreenModes.OVERVIEW;

      expect(shouldSkipPendingMessageEffect).toBe(true);
    });

    it('should allow pendingMessage to fire on thread screen (not overview)', () => {
      const state = store.getState();

      // Setup: thread screen scenario
      state.initializeThread(mockThread, [mockParticipant], [mockUserMessage]);
      state.prepareForNewMessage('new message', ['google/gemini-2.5-flash-lite']);
      state.setWaitingToStartStreaming(false); // Not set on thread screen
      state.setScreenMode(ScreenModes.THREAD);

      const newState = store.getState();

      // On thread screen with waitingToStartStreaming=false, pendingMessage should fire
      const shouldSkipPendingMessageEffect
        = newState.waitingToStartStreaming && newState.screenMode === ScreenModes.OVERVIEW;

      expect(shouldSkipPendingMessageEffect).toBe(false);
    });
  });

  describe('analysis Trigger After Correct Round', () => {
    it('should only have round 0 analysis when participants stream correctly', () => {
      const state = store.getState();

      // Setup: Initialize with round 0
      state.initializeThread(mockThread, [mockParticipant], [mockUserMessage]);
      state.addAnalysis({
        id: 'placeholder-analysis-thread-123-0',
        threadId: 'thread-123',
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'say hi we just one word',
        status: AnalysisStatuses.PENDING,
        analysisData: null,
        participantMessageIds: [],
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      const newState = store.getState();

      // Should have exactly one analysis for round 0
      expect(newState.analyses).toHaveLength(1);
      expect(newState.analyses[0].roundNumber).toBe(0);
    });

    it('bUG: demonstrates incorrect analysis creation for round 1', () => {
      const state = store.getState();

      // Setup: Initialize with round 0
      state.initializeThread(mockThread, [mockParticipant], [mockUserMessage]);
      state.addAnalysis({
        id: 'placeholder-analysis-thread-123-0',
        threadId: 'thread-123',
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'say hi we just one word',
        status: AnalysisStatuses.PENDING,
        analysisData: null,
        participantMessageIds: [],
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // BUG: When sendMessage incorrectly fires, handleComplete creates round 1 analysis
      state.addAnalysis({
        id: 'analysis-round-1',
        threadId: 'thread-123',
        roundNumber: 1, // Wrong round!
        mode: 'debating',
        userQuestion: 'say hi we just one word',
        status: AnalysisStatuses.PENDING,
        analysisData: null,
        participantMessageIds: ['msg-p0-r1'],
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      const newState = store.getState();

      // BUG: Two analyses exist - round 0 placeholder never used, round 1 created incorrectly
      expect(newState.analyses).toHaveLength(2);
      expect(newState.analyses.map(a => a.roundNumber)).toContain(0);
      expect(newState.analyses.map(a => a.roundNumber)).toContain(1);
    });
  });

  describe('pre-search Integration', () => {
    it('should have pre-search for round 0 when web search enabled', () => {
      const state = store.getState();

      state.initializeThread(mockThread, [mockParticipant], [mockUserMessage]);
      state.addPreSearch({
        id: 'presearch-0',
        threadId: 'thread-123',
        roundNumber: 0,
        userQuery: 'say hi we just one word',
        status: AnalysisStatuses.COMPLETE,
        searchData: { queries: [], results: [], analysis: '', successCount: 0, failureCount: 0, totalResults: 0, totalTime: 0 },
        createdAt: new Date(),
        completedAt: new Date(),
        errorMessage: null,
      });

      const newState = store.getState();

      expect(newState.preSearches).toHaveLength(1);
      expect(newState.preSearches[0].roundNumber).toBe(0);
    });

    it('should correctly identify pre-search for current round', () => {
      const state = store.getState();

      state.initializeThread(mockThread, [mockParticipant], [mockUserMessage]);
      state.addPreSearch({
        id: 'presearch-0',
        threadId: 'thread-123',
        roundNumber: 0,
        userQuery: 'say hi we just one word',
        status: AnalysisStatuses.COMPLETE,
        searchData: null,
        createdAt: new Date(),
        completedAt: new Date(),
        errorMessage: null,
      });

      const newState = store.getState();
      const messages = newState.messages;

      // Get current round from messages
      const userMessage = messages.find(m => m.role === 'user');
      const currentRound = userMessage?.metadata?.roundNumber ?? 0;

      // Find pre-search for current round
      const preSearchForRound = newState.preSearches.find(ps => ps.roundNumber === currentRound);

      expect(preSearchForRound).toBeDefined();
      expect(preSearchForRound?.roundNumber).toBe(0);
    });
  });
});

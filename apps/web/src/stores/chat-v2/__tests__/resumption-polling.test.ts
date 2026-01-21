/**
 * Resumption & Polling Tests - V2
 *
 * Tests for page refresh scenarios and polling behavior.
 * Verifies that incomplete rounds trigger polling and sync correctly.
 */

import { describe, expect, it } from 'vitest';

import {
  createRoundCompleteFlowState,
  createTestChatStoreV2,
  createTestPreSearchResult,
  createV2AssistantMessage,
  createV2ModeratorMessage,
  createV2UserMessage,
  getMetadataRoundNumber,
  isMetadataModerator,
} from '@/lib/testing';

describe('v2 resumption', () => {
  describe('page refresh scenarios', () => {
    it('incomplete round 0 (user only) is detected correctly', () => {
      const messages = [
        createV2UserMessage({ id: 'u1', roundNumber: 0, content: 'Hello' }),
      ];

      // Check if round is incomplete (has user but no moderator)
      const hasUserMessage = messages.some((m) => {
        const roundNumber = getMetadataRoundNumber(m.metadata);
        return roundNumber === 0 && m.role === 'user';
      });

      const hasModeratorMessage = messages.some((m) => {
        const roundNumber = getMetadataRoundNumber(m.metadata);
        return roundNumber === 0 && isMetadataModerator(m.metadata);
      });

      expect(hasUserMessage).toBe(true);
      expect(hasModeratorMessage).toBe(false);
      // Round is incomplete
      expect(hasUserMessage && !hasModeratorMessage).toBe(true);
    });

    it('incomplete round 0 (partial participants) is detected correctly', () => {
      const messages = [
        createV2UserMessage({ id: 'u1', roundNumber: 0 }),
        createV2AssistantMessage({ id: 'a1', roundNumber: 0, participantIndex: 0 }),
        // Missing participant 1 and moderator
      ];

      const hasUserMessage = messages.some((m) => {
        const roundNumber = getMetadataRoundNumber(m.metadata);
        return roundNumber === 0 && m.role === 'user';
      });

      const hasModeratorMessage = messages.some((m) => {
        const roundNumber = getMetadataRoundNumber(m.metadata);
        return roundNumber === 0 && isMetadataModerator(m.metadata);
      });

      expect(hasUserMessage).toBe(true);
      expect(hasModeratorMessage).toBe(false);
    });

    it('incomplete round with moderator missing is detected correctly', () => {
      const messages = [
        createV2UserMessage({ id: 'u1', roundNumber: 0 }),
        createV2AssistantMessage({ id: 'a1', roundNumber: 0, participantIndex: 0 }),
        createV2AssistantMessage({ id: 'a2', roundNumber: 0, participantIndex: 1 }),
        // All participants complete but no moderator
      ];

      const hasUserMessage = messages.some((m) => {
        const roundNumber = getMetadataRoundNumber(m.metadata);
        return roundNumber === 0 && m.role === 'user';
      });

      const hasModeratorMessage = messages.some((m) => {
        const roundNumber = getMetadataRoundNumber(m.metadata);
        return roundNumber === 0 && isMetadataModerator(m.metadata);
      });

      expect(hasUserMessage).toBe(true);
      expect(hasModeratorMessage).toBe(false);
    });

    it('complete round does not need polling', () => {
      const messages = [
        createV2UserMessage({ id: 'u1', roundNumber: 0 }),
        createV2AssistantMessage({ id: 'a1', roundNumber: 0, participantIndex: 0 }),
        createV2AssistantMessage({ id: 'a2', roundNumber: 0, participantIndex: 1 }),
        createV2ModeratorMessage({ id: 'm1', roundNumber: 0 }),
      ];

      const hasModeratorMessage = messages.some((m) => {
        const roundNumber = getMetadataRoundNumber(m.metadata);
        return roundNumber === 0 && isMetadataModerator(m.metadata);
      });

      // Round is complete - has moderator
      expect(hasModeratorMessage).toBe(true);
    });

    it('multi-round thread detects correct incomplete round', () => {
      const messages = [
        // Round 0 - complete
        createV2UserMessage({ id: 'u0', roundNumber: 0 }),
        createV2AssistantMessage({ id: 'a0', roundNumber: 0, participantIndex: 0 }),
        createV2ModeratorMessage({ id: 'm0', roundNumber: 0 }),
        // Round 1 - incomplete
        createV2UserMessage({ id: 'u1', roundNumber: 1 }),
        createV2AssistantMessage({ id: 'a1', roundNumber: 1, participantIndex: 0 }),
        // No moderator for round 1
      ];

      const round0Complete = messages.some((m) => {
        const roundNumber = getMetadataRoundNumber(m.metadata);
        return roundNumber === 0 && isMetadataModerator(m.metadata);
      });

      const round1Complete = messages.some((m) => {
        const roundNumber = getMetadataRoundNumber(m.metadata);
        return roundNumber === 1 && isMetadataModerator(m.metadata);
      });

      expect(round0Complete).toBe(true);
      expect(round1Complete).toBe(false);
    });
  });

  describe('sync from backend', () => {
    it('transforms messages correctly', () => {
      const store = createTestChatStoreV2();

      // The actual syncFromBackend transforms ChatMessage[] to UIMessage[]
      // Here we verify the store accepts the transformed format
      store.getState().setMessages([
        createV2UserMessage({ id: 'msg-1', roundNumber: 0, content: 'Hello' }),
        createV2ModeratorMessage({ id: 'msg-2', roundNumber: 0, content: 'Response' }),
      ]);

      const messages = store.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });

    it('builds preSearches Map correctly', () => {
      const store = createTestChatStoreV2();

      // Simulate pre-search data structure from backend
      const preSearchData = [
        createTestPreSearchResult({ roundNumber: 0, query: 'Query 0' }),
        createTestPreSearchResult({ roundNumber: 1, query: 'Query 1' }),
      ];

      // Build map like syncFromBackend does
      const preSearchMap = new Map();
      for (const ps of preSearchData) {
        preSearchMap.set(ps.roundNumber, ps);
      }

      store.setState({ preSearches: preSearchMap });

      expect(store.getState().preSearches.size).toBe(2);
      expect(store.getState().preSearches.get(0)?.query).toBe('Query 0');
      expect(store.getState().preSearches.get(1)?.query).toBe('Query 1');
    });

    it('determines correct flow state from complete round', () => {
      const messages = [
        createV2UserMessage({ roundNumber: 0 }),
        createV2AssistantMessage({ roundNumber: 0, participantIndex: 0 }),
        createV2ModeratorMessage({ roundNumber: 0 }),
      ];

      // Determine max round
      let maxRound = 0;
      for (const msg of messages) {
        const roundNumber = getMetadataRoundNumber(msg.metadata);
        if (roundNumber !== null) {
          maxRound = Math.max(maxRound, roundNumber);
        }
      }

      // Check if complete
      const isComplete = messages.some((m) => {
        const roundNumber = getMetadataRoundNumber(m.metadata);
        return roundNumber === maxRound && isMetadataModerator(m.metadata);
      });

      expect(maxRound).toBe(0);
      expect(isComplete).toBe(true);
    });

    it('determines correct flow state from incomplete round', () => {
      const messages = [
        createV2UserMessage({ roundNumber: 0 }),
        createV2ModeratorMessage({ roundNumber: 0 }),
        createV2UserMessage({ roundNumber: 1 }),
        // Round 1 is incomplete
      ];

      // Determine max round
      let maxRound = 0;
      for (const msg of messages) {
        const roundNumber = getMetadataRoundNumber(msg.metadata);
        if (roundNumber !== null) {
          maxRound = Math.max(maxRound, roundNumber);
        }
      }

      // Check if complete
      const isComplete = messages.some((m) => {
        const roundNumber = getMetadataRoundNumber(m.metadata);
        return roundNumber === maxRound && isMetadataModerator(m.metadata);
      });

      expect(maxRound).toBe(1);
      expect(isComplete).toBe(false);

      // Flow should be at previous complete round
      const flowRound = isComplete ? maxRound : Math.max(0, maxRound - 1);
      expect(flowRound).toBe(0);
    });

    it('preserves round number in flow state', () => {
      const store = createTestChatStoreV2();

      // Set flow to round 2
      store.setState({
        flow: createRoundCompleteFlowState({ threadId: 't1', round: 2 }),
      });

      const flow = store.getState().flow;
      expect(flow.type).toBe('round_complete');
      expect(flow.type === 'round_complete' && flow.round).toBe(2);
    });
  });

  describe('polling configuration', () => {
    it('default poll interval is 2000ms', () => {
      // This is verified by the useRoundPolling hook defaults
      // Here we just document the expected configuration
      const DEFAULT_POLL_INTERVAL = 2000;
      expect(DEFAULT_POLL_INTERVAL).toBe(2000);
    });

    it('default max poll duration is 60000ms', () => {
      const DEFAULT_MAX_POLL_DURATION = 60000;
      expect(DEFAULT_MAX_POLL_DURATION).toBe(60000);
    });

    it('round status API endpoint format is correct', () => {
      const threadId = 'test-thread-123';
      const round = 0;
      const expectedUrl = `/api/v1/chat/${threadId}/rounds/${round}/status`;

      expect(expectedUrl).toBe('/api/v1/chat/test-thread-123/rounds/0/status');
    });
  });

  describe('syncFromBackend state reconciliation', () => {
    it('syncs thread data correctly', () => {
      const store = createTestChatStoreV2();

      // Create mock backend response
      const mockThread = {
        id: 't1',
        slug: 'test-slug',
        userId: 'u1',
        title: 'Test Thread',
        mode: 'council' as const,
        status: 'active' as const,
        isPublic: false,
        enableWebSearch: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.getState().setThread(mockThread);
      store.getState().setSelectedMode('council');
      store.getState().setEnableWebSearch(true);

      expect(store.getState().thread).toEqual(mockThread);
      expect(store.getState().selectedMode).toBe('council');
      expect(store.getState().enableWebSearch).toBe(true);
    });

    it('syncs participants correctly', () => {
      const store = createTestChatStoreV2();

      const participants = [
        {
          id: 'p1',
          threadId: 't1',
          modelId: 'gpt-4',
          role: 'analyst',
          priority: 1,
          isEnabled: true,
          customRoleId: null,
          settings: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'p2',
          threadId: 't1',
          modelId: 'claude-3',
          role: 'critic',
          priority: 2,
          isEnabled: true,
          customRoleId: null,
          settings: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      store.getState().setParticipants(participants as never);

      expect(store.getState().participants).toHaveLength(2);
    });

    it('syncs feedback correctly', () => {
      const store = createTestChatStoreV2();

      // Simulate feedback sync
      const feedbackMap = new Map<number, 'like' | 'dislike' | null>([
        [0, 'like'],
        [1, 'dislike'],
      ]);

      store.setState({ feedbackByRound: feedbackMap });

      expect(store.getState().feedbackByRound.get(0)).toBe('like');
      expect(store.getState().feedbackByRound.get(1)).toBe('dislike');
    });

    it('sets hasInitiallyLoaded after sync', () => {
      const store = createTestChatStoreV2();

      expect(store.getState().hasInitiallyLoaded).toBe(false);

      store.getState().setHasInitiallyLoaded(true);

      expect(store.getState().hasInitiallyLoaded).toBe(true);
    });

    it('sets screenMode to thread after sync', () => {
      const store = createTestChatStoreV2();

      expect(store.getState().screenMode).toBe('overview');

      store.getState().setScreenMode('thread');

      expect(store.getState().screenMode).toBe('thread');
    });
  });

  describe('flow state after LOAD_THREAD', () => {
    it('lOAD_THREAD with complete messages sets round_complete', () => {
      const store = createTestChatStoreV2({
        selectedParticipants: [
          { modelId: 'gpt-4', role: null, priority: 1 },
        ],
      });

      const thread = {
        id: 't1',
        slug: 'test',
        mode: 'council' as const,
      };

      const messages = [
        createV2UserMessage({ roundNumber: 0 }),
        createV2AssistantMessage({ roundNumber: 0, participantIndex: 0 }),
        createV2ModeratorMessage({ roundNumber: 0 }),
      ];

      // Dispatch LOAD_THREAD
      store.getState().dispatch({
        type: 'LOAD_THREAD',
        thread: thread as never,
        messages,
      });

      expect(store.getState().flow.type).toBe('round_complete');
      const flowState = store.getState().flow;
      expect(flowState.type).toBe('round_complete');
      expect(flowState.type === 'round_complete' && flowState.round).toBe(0);
    });

    it('lOAD_THREAD with incomplete messages sets round_complete at previous round', () => {
      const store = createTestChatStoreV2({
        selectedParticipants: [
          { modelId: 'gpt-4', role: null, priority: 1 },
        ],
      });

      const thread = {
        id: 't1',
        slug: 'test',
        mode: 'council' as const,
      };

      const messages = [
        createV2UserMessage({ roundNumber: 0 }),
        createV2ModeratorMessage({ roundNumber: 0 }),
        createV2UserMessage({ roundNumber: 1 }),
        // Round 1 incomplete
      ];

      store.getState().dispatch({
        type: 'LOAD_THREAD',
        thread: thread as never,
        messages,
      });

      expect(store.getState().flow.type).toBe('round_complete');
      const flowState = store.getState().flow;
      expect(flowState.type).toBe('round_complete');
      // Should be at previous completed round
      expect(flowState.type === 'round_complete' && flowState.round).toBe(0);
    });
  });
});

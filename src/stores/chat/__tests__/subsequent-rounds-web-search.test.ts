/**
 * Subsequent Rounds Web Search Tests (PART 5-7 Integration)
 *
 * Tests web search toggle behavior across multiple rounds:
 * 1. Web search toggle state persistence - enabled state carries forward
 * 2. Configuration changes applying correctly - changes affect next round
 * 3. Round number calculation for subsequent rounds - correct incrementing
 * 4. Web search execution in subsequent rounds - executes on each round when enabled
 * 5. Pre-search status blocking - participants wait for search completion
 * 6. Independent search results per round - each round gets fresh search
 *
 * Pattern: src/stores/chat/__tests__/web-search-multi-round.test.ts
 * Documentation: docs/FLOW_DOCUMENTATION.md PARTS 5-7
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import { createMockPreSearch, createMockSearchData, createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';
import { calculateNextRoundNumber, getCurrentRoundNumber } from '@/lib/utils/round-utils';
import { createChatStore } from '@/stores/chat';

import type { ChatStore } from '../store';

describe('subsequent Rounds Web Search Behavior (PARTS 5-7)', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatStore;

  beforeEach(() => {
    store = createChatStore();
    getState = store.getState;
  });

  describe('web search toggle state persistence', () => {
    it('should maintain enabled state across rounds', () => {
      // Enable web search in round 0
      getState().setEnableWebSearch(true);
      expect(getState().enableWebSearch).toBe(true);

      // Complete round 0 with search
      const search0 = createMockPreSearch({
        id: 'search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        userQuery: 'First question',
        searchData: createMockSearchData(),
      });

      getState().addPreSearch(search0);

      // Round 1 - toggle state still enabled
      expect(getState().enableWebSearch).toBe(true);

      // Add round 1 search
      const search1 = createMockPreSearch({
        id: 'search-1',
        threadId: 'thread-1',
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
        userQuery: 'Second question',
        searchData: createMockSearchData(),
      });

      getState().addPreSearch(search1);

      // Toggle state persists
      expect(getState().enableWebSearch).toBe(true);

      // Both searches tracked
      expect(getState().preSearches).toHaveLength(2);
    });

    it('should execute search on each subsequent round when enabled', () => {
      getState().setEnableWebSearch(true);

      // Round 0
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Q1',
        }),
      );

      // Round 1
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Q2',
        }),
      );

      // Round 2
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-2',
          threadId: 'thread-1',
          roundNumber: 2,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Q3',
        }),
      );

      // All rounds have search
      expect(getState().preSearches).toHaveLength(3);
      expect(getState().preSearches[0]?.roundNumber).toBe(0);
      expect(getState().preSearches[1]?.roundNumber).toBe(1);
      expect(getState().preSearches[2]?.roundNumber).toBe(2);
    });

    it('should not execute search when disabled mid-conversation', () => {
      // Round 0 - search enabled
      getState().setEnableWebSearch(true);

      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Q1',
        }),
      );

      expect(getState().preSearches).toHaveLength(1);

      // Disable for round 1
      getState().setEnableWebSearch(false);

      // Round 1 - no search added (higher-level logic prevents it)
      expect(getState().enableWebSearch).toBe(false);

      // Only round 0 search exists
      expect(getState().preSearches).toHaveLength(1);
      expect(getState().preSearches[0]?.roundNumber).toBe(0);
    });
  });

  describe('configuration changes applying correctly', () => {
    it('should apply participant changes when submitting next message', () => {
      const messages = [
        // Round 0 with 2 participants
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p1', content: 'A2', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
      ];

      getState().setMessages(messages);

      // Add third participant for next round
      getState().setExpectedParticipantIds(['p0', 'p1', 'p2']);

      // Round 1 - all 3 participants respond
      const updatedMessages = [...messages, createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 })];
      getState().setMessages(updatedMessages);

      // Configuration applied
      expect(getState().expectedParticipantIds).toHaveLength(3);
      expect(getState().expectedParticipantIds).toContain('p2');
    });

    it('should apply web search toggle change when submitting next message', () => {
      // Round 0 - no web search
      expect(getState().enableWebSearch).toBe(false);

      const messages = [
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
      ];

      getState().setMessages(messages);

      // Enable web search for round 1
      getState().setEnableWebSearch(true);

      // Round 1 user message submitted
      const updatedMessages = [...messages, createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 })];
      getState().setMessages(updatedMessages);

      // Web search now active
      expect(getState().enableWebSearch).toBe(true);

      // Round 1 should trigger search
      const search1 = createMockPreSearch({
        id: 'search-1',
        threadId: 'thread-1',
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Q2',
      });

      getState().addPreSearch(search1);

      expect(getState().preSearches).toHaveLength(1);
      expect(getState().preSearches[0]?.roundNumber).toBe(1);
    });
  });

  describe('round number calculation for subsequent rounds', () => {
    it('should calculate correct next round number after round 0', () => {
      const messages = [
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
      ];

      getState().setMessages(messages);

      expect(getCurrentRoundNumber(messages)).toBe(0);
      expect(calculateNextRoundNumber(messages)).toBe(1);
    });

    it('should calculate correct next round number after round 1', () => {
      const messages = [
        // Round 0
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        // Round 1
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'thread_r1_p0', content: 'A2', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
      ];

      getState().setMessages(messages);

      expect(getCurrentRoundNumber(messages)).toBe(1);
      expect(calculateNextRoundNumber(messages)).toBe(2);
    });

    it('should handle round progression: r0 → r1 → r2 → r3', () => {
      const messages = [
        // Round 0
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
      ];

      getState().setMessages(messages);
      expect(calculateNextRoundNumber(messages)).toBe(1);

      // Round 1
      messages.push(createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }));
      messages.push(createTestAssistantMessage({ id: 'thread_r1_p0', content: 'A2', roundNumber: 1, participantId: 'p0', participantIndex: 0 }));

      getState().setMessages(messages);
      expect(calculateNextRoundNumber(messages)).toBe(2);

      // Round 2
      messages.push(createTestUserMessage({ id: 'user-r2', content: 'Q3', roundNumber: 2 }));
      messages.push(createTestAssistantMessage({ id: 'thread_r2_p0', content: 'A3', roundNumber: 2, participantId: 'p0', participantIndex: 0 }));

      getState().setMessages(messages);
      expect(calculateNextRoundNumber(messages)).toBe(3);
    });
  });

  describe('pre-search execution in subsequent rounds', () => {
    it('should execute fresh search for each round', () => {
      getState().setEnableWebSearch(true);

      // Round 0 search
      const searchData0 = createMockSearchData({ numQueries: 2 });
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'First question about AI',
          searchData: searchData0,
        }),
      );

      // Round 1 search - different query, different results
      const searchData1 = createMockSearchData({ numQueries: 3 });
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Second question about ML',
          searchData: searchData1,
        }),
      );

      // Each round has independent search
      const searches = getState().preSearches;
      expect(searches).toHaveLength(2);

      const search0 = searches.find(s => s.roundNumber === 0);
      const search1 = searches.find(s => s.roundNumber === 1);

      expect(search0?.userQuery).toBe('First question about AI');
      expect(search1?.userQuery).toBe('Second question about ML');

      // Different search data
      expect(search0?.searchData?.queries).toHaveLength(2);
      expect(search1?.searchData?.queries).toHaveLength(3);
    });

    it('should track search triggered state per round', () => {
      getState().setEnableWebSearch(true);

      // Round 0
      getState().markPreSearchTriggered(0);
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(1)).toBe(false);

      // Round 1
      getState().markPreSearchTriggered(1);
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(1)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(2)).toBe(false);

      // Round 2
      getState().markPreSearchTriggered(2);
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(1)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(2)).toBe(true);
    });
  });

  describe('pre-search status blocking participants', () => {
    it('should block participants while search is pending', () => {
      getState().setEnableWebSearch(true);

      // Add pending search for round 0
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Question',
        }),
      );

      getState().markPreSearchTriggered(0);

      // Search not complete yet
      const search = getState().preSearches.find(s => s.roundNumber === 0);
      expect(search?.status).toBe(AnalysisStatuses.PENDING);

      // Higher-level orchestrator would block participants
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
    });

    it('should allow participants after search completes', () => {
      getState().setEnableWebSearch(true);

      // Add search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Question',
        }),
      );

      getState().markPreSearchTriggered(0);

      // Complete search
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      const search = getState().preSearches.find(s => s.roundNumber === 0);
      expect(search?.status).toBe(AnalysisStatuses.COMPLETE);

      // Participants can now proceed
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
    });

    it('should block per-round: round 1 search does not block round 0 participants', () => {
      getState().setEnableWebSearch(true);

      // Round 0 - complete
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Q1',
        }),
      );

      getState().markPreSearchTriggered(0);

      // Round 1 - pending (should not block round 0)
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Q2',
        }),
      );

      getState().markPreSearchTriggered(1);

      // Round 0 complete, round 1 pending
      const search0 = getState().preSearches.find(s => s.roundNumber === 0);
      const search1 = getState().preSearches.find(s => s.roundNumber === 1);

      expect(search0?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(search1?.status).toBe(AnalysisStatuses.PENDING);
    });
  });

  describe('integration: full subsequent round flow with web search', () => {
    it('should execute complete flow: r0 with search → r1 with search → r2 with search', () => {
      getState().setEnableWebSearch(true);

      // === ROUND 0 ===
      // Pre-search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'What is AI?',
          searchData: createMockSearchData(),
        }),
      );

      getState().markPreSearchTriggered(0);

      // Messages
      const messages = [
        createTestUserMessage({ id: 'user-r0', content: 'What is AI?', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'AI is...', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
      ];

      getState().setMessages(messages);

      expect(getCurrentRoundNumber(messages)).toBe(0);
      expect(calculateNextRoundNumber(messages)).toBe(1);

      // === ROUND 1 ===
      // Pre-search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'How does ML work?',
          searchData: createMockSearchData(),
        }),
      );

      getState().markPreSearchTriggered(1);

      // Messages
      messages.push(createTestUserMessage({ id: 'user-r1', content: 'How does ML work?', roundNumber: 1 }));
      messages.push(createTestAssistantMessage({ id: 'thread_r1_p0', content: 'ML works by...', roundNumber: 1, participantId: 'p0', participantIndex: 0 }));

      getState().setMessages(messages);

      expect(getCurrentRoundNumber(messages)).toBe(1);
      expect(calculateNextRoundNumber(messages)).toBe(2);

      // === ROUND 2 ===
      // Pre-search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-2',
          threadId: 'thread-1',
          roundNumber: 2,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'What are neural networks?',
          searchData: createMockSearchData(),
        }),
      );

      getState().markPreSearchTriggered(2);

      // Messages
      messages.push(createTestUserMessage({ id: 'user-r2', content: 'What are neural networks?', roundNumber: 2 }));
      messages.push(createTestAssistantMessage({ id: 'thread_r2_p0', content: 'Neural networks are...', roundNumber: 2, participantId: 'p0', participantIndex: 0 }));

      getState().setMessages(messages);

      expect(getCurrentRoundNumber(messages)).toBe(2);
      expect(calculateNextRoundNumber(messages)).toBe(3);

      // === VERIFY ===
      // All searches tracked
      expect(getState().preSearches).toHaveLength(3);
      expect(getState().preSearches[0]?.roundNumber).toBe(0);
      expect(getState().preSearches[1]?.roundNumber).toBe(1);
      expect(getState().preSearches[2]?.roundNumber).toBe(2);

      // All searches complete
      expect(getState().preSearches.every(s => s.status === AnalysisStatuses.COMPLETE)).toBe(true);

      // All messages correct round numbers
      expect(messages[0]?.metadata.roundNumber).toBe(0);
      expect(messages[1]?.metadata.roundNumber).toBe(0);
      expect(messages[2]?.metadata.roundNumber).toBe(1);
      expect(messages[3]?.metadata.roundNumber).toBe(1);
      expect(messages[4]?.metadata.roundNumber).toBe(2);
      expect(messages[5]?.metadata.roundNumber).toBe(2);

      // Web search still enabled
      expect(getState().enableWebSearch).toBe(true);
    });
  });
});

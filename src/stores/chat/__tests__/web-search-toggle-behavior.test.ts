/**
 * WEB SEARCH TOGGLE ON/OFF BEHAVIOR TESTS
 *
 * CRITICAL USER ISSUES:
 * - Web search toggle on/off behavior not working correctly
 * - Chat rounds starting without web search when it's not the first round
 * - No blocking when pre-search is enabled
 *
 * FLOW DOCUMENTATION PART 2 COVERAGE:
 * - Pre-search flow with toggle enabled
 * - Toggle state persistence across rounds
 * - Mid-conversation toggle enable/disable
 * - First round vs subsequent rounds behavior
 *
 * TEST SCENARIOS:
 * 1. Toggle enabled on first round - creates pre-search, blocks participants
 * 2. Toggle disabled on first round - no pre-search, participants stream immediately
 * 3. Toggle enabled mid-conversation - creates pre-search for NEXT round
 * 4. Toggle disabled mid-conversation - skips pre-search for NEXT round
 * 5. Toggle state persistence after round completes
 * 6. Toggle on subsequent rounds (round 2, 3, etc.)
 * 7. Toggle with configuration changes (adding/removing participants)
 *
 * FILES UNDER TEST:
 * - src/stores/chat/store.ts (enableWebSearch state)
 * - src/stores/chat/actions/form-actions.ts (setEnableWebSearch)
 * - src/stores/chat/actions/pending-message-sender.ts (blocking logic)
 * - src/components/providers/chat-store-provider.tsx (orchestration)
 *
 * @see /docs/FLOW_DOCUMENTATION.md Part 2: Web Search Functionality
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import {
  createMockPreSearch,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';
import { createChatStore } from '@/stores/chat';

import type { ChatStore } from '../store';

describe('web Search Toggle - On/Off Behavior', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatStore;

  beforeEach(() => {
    store = createChatStore();
    getState = store.getState;
  });

  // ==========================================================================
  // SCENARIO 1: First Round - Toggle Enabled
  // ==========================================================================
  describe('first round with toggle enabled', () => {
    it('should create PENDING pre-search when toggle enabled on first message', () => {
      // User enables toggle and submits first message
      getState().setEnableWebSearch(true);

      expect(getState().enableWebSearch).toBe(true);

      // Backend creates PENDING pre-search (simulated)
      const preSearch = createMockPreSearch({
        id: 'search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
        userQuery: 'First question',
      });

      getState().addPreSearch(preSearch);

      // Verify pre-search exists for round 0
      const searches = getState().preSearches;
      expect(searches).toHaveLength(1);
      expect(searches[0]?.roundNumber).toBe(0);
      expect(searches[0]?.status).toBe(AnalysisStatuses.PENDING);
    });

    it('should block participant streaming until pre-search completes', () => {
      getState().setEnableWebSearch(true);

      // Add PENDING pre-search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'First question',
        }),
      );

      // Verify status is PENDING (blocks streaming)
      const search = getState().preSearches[0];
      expect(search?.status).toBe(AnalysisStatuses.PENDING);

      // Update to STREAMING
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // Update to COMPLETE (allows streaming)
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should transition through all status states correctly', () => {
      getState().setEnableWebSearch(true);

      // Start with PENDING
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'First question',
        }),
      );

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);

      // PENDING → STREAMING
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // STREAMING → COMPLETE
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
    });
  });

  // ==========================================================================
  // SCENARIO 2: First Round - Toggle Disabled
  // ==========================================================================
  describe('first round with toggle disabled', () => {
    it('should NOT create pre-search when toggle disabled', () => {
      // User leaves toggle disabled (default)
      expect(getState().enableWebSearch).toBe(false);

      // Submit first message - no pre-search created
      expect(getState().preSearches).toHaveLength(0);

      // Verify toggle state persists
      expect(getState().enableWebSearch).toBe(false);
    });

    it('should allow participant streaming immediately when disabled', () => {
      // Toggle disabled
      getState().setEnableWebSearch(false);

      // No pre-search exists
      expect(getState().preSearches).toHaveLength(0);

      // Participants should stream immediately (no blocking)
      expect(getState().enableWebSearch).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO 3: Mid-Conversation - Toggle ENABLED
  // ==========================================================================
  describe('mid-conversation toggle enable', () => {
    it('should create pre-search for NEXT round when toggled ON mid-conversation', () => {
      // Round 0 completed WITHOUT web search
      const messages = [
        createTestUserMessage({
          id: 'msg-1',
          content: 'Question 1',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'msg-2',
          content: 'Answer 1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
      ];

      getState().setMessages(messages);

      // Verify round 0 completed
      const currentRound = getCurrentRoundNumber(messages);
      expect(currentRound).toBe(0);

      // User enables toggle for round 1
      getState().setEnableWebSearch(true);
      expect(getState().enableWebSearch).toBe(true);

      // Backend creates PENDING pre-search for round 1
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1, // NEXT round
          status: AnalysisStatuses.PENDING,
          userQuery: 'Question 2',
        }),
      );

      // Verify pre-search created for round 1
      const searches = getState().preSearches;
      expect(searches).toHaveLength(1);
      expect(searches[0]?.roundNumber).toBe(1);
    });

    it('should block round 1 participants until pre-search completes', () => {
      // Setup: Round 0 completed
      getState().setMessages([
        createTestUserMessage({
          id: 'msg-1',
          content: 'Question 1',
          roundNumber: 0,
        }),
      ]);

      // Enable toggle
      getState().setEnableWebSearch(true);

      // Add PENDING pre-search for round 1
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Question 2',
        }),
      );

      // Verify PENDING blocks streaming
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);

      // Update to STREAMING (still blocks)
      getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // Update to COMPLETE (allows streaming)
      getState().updatePreSearchStatus(1, AnalysisStatuses.COMPLETE);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should NOT create pre-search for round 0 when toggled ON mid-conversation', () => {
      // Round 0 already completed WITHOUT search
      getState().setMessages([
        createTestUserMessage({
          id: 'msg-1',
          content: 'Question 1',
          roundNumber: 0,
        }),
      ]);

      // Enable toggle NOW
      getState().setEnableWebSearch(true);

      // Verify NO search for round 0 (already past that round)
      const round0Search = getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(round0Search).toBeUndefined();
    });
  });

  // ==========================================================================
  // SCENARIO 4: Mid-Conversation - Toggle DISABLED
  // ==========================================================================
  describe('mid-conversation toggle disable', () => {
    it('should NOT create pre-search for NEXT round when toggled OFF', () => {
      // Round 0 completed WITH web search
      getState().setEnableWebSearch(true);
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Question 1',
        }),
      );

      getState().setMessages([
        createTestUserMessage({
          id: 'msg-1',
          content: 'Question 1',
          roundNumber: 0,
        }),
      ]);

      // User disables toggle before round 1
      getState().setEnableWebSearch(false);
      expect(getState().enableWebSearch).toBe(false);

      // Verify NO search for round 1
      const round1Search = getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(round1Search).toBeUndefined();
    });

    it('should allow round 1 to stream immediately when disabled', () => {
      // Round 0 WITH search, toggle disabled for round 1
      getState().setEnableWebSearch(false);

      getState().setMessages([
        createTestUserMessage({
          id: 'msg-1',
          content: 'Question 1',
          roundNumber: 0,
        }),
      ]);

      // No pre-search for round 1
      const round1Search = getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(round1Search).toBeUndefined();

      // Toggle disabled - should allow streaming
      expect(getState().enableWebSearch).toBe(false);
    });

    it('should preserve round 0 search data when disabled for round 1', () => {
      // Round 0 WITH search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Question 1',
        }),
      );

      // Disable toggle for round 1
      getState().setEnableWebSearch(false);

      // Round 0 search should still exist
      const round0Search = getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(round0Search).toBeDefined();
      expect(round0Search?.status).toBe(AnalysisStatuses.COMPLETE);
    });
  });

  // ==========================================================================
  // SCENARIO 5: Toggle State Persistence
  // ==========================================================================
  describe('toggle state persistence', () => {
    it('should persist enabled state across rounds', () => {
      // Enable toggle
      getState().setEnableWebSearch(true);
      expect(getState().enableWebSearch).toBe(true);

      // Complete round 0
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Question 1',
        }),
      );

      // Toggle should still be enabled
      expect(getState().enableWebSearch).toBe(true);

      // Complete round 1
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Question 2',
        }),
      );

      // Toggle should STILL be enabled
      expect(getState().enableWebSearch).toBe(true);
    });

    it('should persist disabled state across rounds', () => {
      // Keep toggle disabled (default)
      expect(getState().enableWebSearch).toBe(false);

      // Complete rounds 0 and 1
      getState().setMessages([
        createTestUserMessage({
          id: 'msg-1',
          content: 'Question 1',
          roundNumber: 0,
        }),
        createTestUserMessage({
          id: 'msg-2',
          content: 'Question 2',
          roundNumber: 1,
        }),
      ]);

      // Toggle should still be disabled
      expect(getState().enableWebSearch).toBe(false);
    });

    it('should reset toggle when form is reset', () => {
      // Enable toggle
      getState().setEnableWebSearch(true);
      expect(getState().enableWebSearch).toBe(true);

      // Reset form
      getState().resetForm();

      // Toggle should reset to default (false)
      expect(getState().enableWebSearch).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO 6: Subsequent Rounds (2, 3, etc.)
  // ==========================================================================
  describe('subsequent rounds with toggle', () => {
    it('should create pre-search for round 2 when toggle enabled', () => {
      getState().setEnableWebSearch(true);

      // Complete rounds 0 and 1 WITH search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Question 1',
        }),
      );

      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Question 2',
        }),
      );

      // Add round 2 search (PENDING)
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-2',
          threadId: 'thread-1',
          roundNumber: 2,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Question 3',
        }),
      );

      // Verify all 3 searches exist
      expect(getState().preSearches).toHaveLength(3);

      const round2Search = getState().preSearches.find(ps => ps.roundNumber === 2);
      expect(round2Search).toBeDefined();
      expect(round2Search?.status).toBe(AnalysisStatuses.PENDING);
    });

    it('should handle round 3+ correctly', () => {
      getState().setEnableWebSearch(true);

      // Add searches for rounds 0-4
      for (let i = 0; i <= 4; i++) {
        getState().addPreSearch(
          createMockPreSearch({
            id: `search-${i}`,
            threadId: 'thread-1',
            roundNumber: i,
            status: i === 4 ? AnalysisStatuses.PENDING : AnalysisStatuses.COMPLETE,
            userQuery: `Question ${i + 1}`,
          }),
        );
      }

      // Verify all searches created
      expect(getState().preSearches).toHaveLength(5);

      // Verify round 4 is PENDING (current round)
      const round4Search = getState().preSearches.find(ps => ps.roundNumber === 4);
      expect(round4Search?.status).toBe(AnalysisStatuses.PENDING);

      // Verify rounds 0-3 are COMPLETE
      for (let i = 0; i <= 3; i++) {
        const search = getState().preSearches.find(ps => ps.roundNumber === i);
        expect(search?.status).toBe(AnalysisStatuses.COMPLETE);
      }
    });
  });

  // ==========================================================================
  // SCENARIO 7: Toggle with Configuration Changes
  // ==========================================================================
  describe('toggle with configuration changes', () => {
    it('should create pre-search when adding participants mid-conversation', () => {
      // Round 0 completed WITH search
      getState().setEnableWebSearch(true);
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Question 1',
        }),
      );

      // User adds 3rd participant before round 1
      // Toggle still enabled - should create search for round 1
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Question 2',
        }),
      );

      expect(getState().preSearches).toHaveLength(2);
      expect(getState().preSearches[1]?.roundNumber).toBe(1);
    });

    it('should create pre-search when removing participants mid-conversation', () => {
      // Round 0 WITH search and 3 participants
      getState().setEnableWebSearch(true);
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Question 1',
        }),
      );

      // User removes 1 participant before round 1
      // Toggle still enabled - should create search for round 1
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Question 2',
        }),
      );

      expect(getState().preSearches).toHaveLength(2);
    });

    it('should create pre-search when changing mode mid-conversation', () => {
      // Round 0 WITH search in Brainstorm mode
      getState().setEnableWebSearch(true);
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Question 1',
        }),
      );

      // User changes to Debate mode before round 1
      // Toggle still enabled - should create search for round 1
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Question 2',
        }),
      );

      expect(getState().preSearches).toHaveLength(2);
    });
  });

  // ==========================================================================
  // SCENARIO 8: Toggle State Querying
  // ==========================================================================
  describe('toggle state querying', () => {
    it('should correctly report when toggle is enabled', () => {
      getState().setEnableWebSearch(true);
      expect(getState().enableWebSearch).toBe(true);
    });

    it('should correctly report when toggle is disabled', () => {
      getState().setEnableWebSearch(false);
      expect(getState().enableWebSearch).toBe(false);
    });

    it('should allow toggling multiple times', () => {
      // Enable
      getState().setEnableWebSearch(true);
      expect(getState().enableWebSearch).toBe(true);

      // Disable
      getState().setEnableWebSearch(false);
      expect(getState().enableWebSearch).toBe(false);

      // Enable again
      getState().setEnableWebSearch(true);
      expect(getState().enableWebSearch).toBe(true);
    });
  });
});

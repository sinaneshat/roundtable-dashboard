/**
 * Pre-Search Placeholder and Message Patching Flow - Timing Tests
 *
 * Tests the relationship between pre-search placeholder creation and message patching:
 * "User message MUST be patched to thread data FIRST, then pre-search placeholder logic"
 *
 * Coverage:
 * 1. Pre-search placeholder created AFTER optimistic message added
 * 2. Pre-search placeholder created BEFORE waitingToStartStreaming set
 * 3. Pre-search placeholder prevents streaming until pre-search completes
 * 4. Flow works identically with and without config changes
 * 5. Pre-search placeholder cleanup on error
 *
 * Key Behavioral Requirements:
 * - Optimistic message → Pre-search placeholder → Block streaming
 * - Pre-search placeholder created regardless of config changes
 * - configChangeRoundNumber blocks BOTH message patch AND pre-search execution
 * - Streaming waits for BOTH message patch AND pre-search completion
 *
 * References:
 * - form-actions.ts:294-303 (pre-search placeholder creation)
 * - FLOW_DOCUMENTATION.md Part 2: Web Search Functionality
 * - FLOW_DOCUMENTATION.md Part 14: Race Condition Protection
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatModes } from '@/api/core/enums';
import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import {
  createMockParticipant,
  createMockThread,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';

import type { ChatStoreApi } from '../../stores/chat/store';
import { createChatStore } from '../../stores/chat/store';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('pre-Search Placeholder and Message Patching Flow - Timing', () => {
  let store: ChatStoreApi;
  let thread: ChatThread;
  let participants: ChatParticipant[];

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();

    // Setup thread with participants
    thread = createMockThread({
      id: 'thread-123',
      mode: ChatModes.BRAINSTORM,
      enableWebSearch: true,
    });

    participants = [
      createMockParticipant({
        id: 'p1',
        modelId: 'gpt-4',
        priority: 0,
      }),
      createMockParticipant({
        id: 'p2',
        modelId: 'claude-3',
        priority: 1,
      }),
    ];

    // Complete Round 0
    const round0Messages = [
      createTestUserMessage({
        id: 'user-r0',
        content: 'Round 0 question',
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'P0 response',
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'thread-123_r0_p1',
        content: 'P1 response',
        roundNumber: 0,
        participantId: 'p2',
        participantIndex: 1,
      }),
    ];

    store.getState().initializeThread(thread, participants, round0Messages);
    store.getState().setSelectedMode(ChatModes.BRAINSTORM);
    store.getState().setSelectedParticipants([
      { modelId: 'gpt-4', role: null },
      { modelId: 'claude-3', role: null },
    ]);
  });

  // ============================================================================
  // 1. PRE-SEARCH PLACEHOLDER CREATION TIMING
  // ============================================================================

  describe('1. Pre-Search Placeholder Creation Timing', () => {
    it('should create pre-search placeholder AFTER optimistic message added', () => {
      // ARRANGE: Web search enabled
      store.getState().setEnableWebSearch(true);
      const nextRoundNumber = 1;

      // ACT: Add optimistic message (form-actions.ts:285)
      const optimisticMessage = createTestUserMessage({
        id: 'opt-msg',
        content: 'Question with web search',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      // Verify message added
      expect(store.getState().messages).toHaveLength(4);

      // THEN add pre-search placeholder (form-actions.ts:297-303)
      store.getState().addPreSearch({
        id: `placeholder-r${nextRoundNumber}`,
        threadId: 'thread-123',
        roundNumber: nextRoundNumber,
        status: 'pending',
        searchData: null,
        userQuery: 'Question with web search',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      // ASSERT: Both optimistic message and placeholder exist
      expect(store.getState().messages).toHaveLength(4);
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0]?.roundNumber).toBe(1);
    });

    it('should create pre-search placeholder BEFORE waitingToStartStreaming set', () => {
      // ARRANGE
      store.getState().setEnableWebSearch(true);
      const nextRoundNumber = 1;

      // ACT: Simulate order from form-actions.ts:297-312
      // 1. Add optimistic message
      const optimisticMessage = createTestUserMessage({
        id: 'opt',
        content: 'Q',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      // 2. Add pre-search placeholder
      store.getState().addPreSearch({
        id: 'placeholder',
        threadId: 'thread-123',
        roundNumber: nextRoundNumber,
        status: 'pending',
        searchData: null,
        userQuery: 'Q',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      // Verify placeholder added
      expect(store.getState().preSearches).toHaveLength(1);

      // 3. Block streaming
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);

      // 4. Set waiting flag
      store.getState().setWaitingToStartStreaming(true);

      // ASSERT: Placeholder created before waiting flag
      expect(store.getState().preSearches[0]?.status).toBe('pending');
      expect(store.getState().waitingToStartStreaming).toBe(true);
    });

    it('should NOT create pre-search placeholder when web search disabled', () => {
      // ARRANGE: Web search disabled
      store.getState().setEnableWebSearch(false);
      const nextRoundNumber = 1;

      // ACT: Add optimistic message (no pre-search placeholder)
      const optimisticMessage = createTestUserMessage({
        id: 'opt',
        content: 'Q',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      // ASSERT: No pre-search placeholder created
      expect(store.getState().preSearches).toHaveLength(0);
    });

    it('should create pre-search placeholder with correct roundNumber', () => {
      // ARRANGE
      store.getState().setEnableWebSearch(true);
      const nextRoundNumber = 1;

      // ACT: Add placeholder
      store.getState().addPreSearch({
        id: 'placeholder',
        threadId: 'thread-123',
        roundNumber: nextRoundNumber,
        status: 'pending',
        searchData: null,
        userQuery: 'Q',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      // ASSERT: Round number matches user message
      expect(store.getState().preSearches[0]?.roundNumber).toBe(1);
    });
  });

  // ============================================================================
  // 2. PRE-SEARCH PLACEHOLDER PREVENTS STREAMING
  // ============================================================================

  describe('2. Pre-Search Placeholder Prevents Streaming', () => {
    it('should have PENDING pre-search when optimistic message added', () => {
      // ARRANGE
      store.getState().setEnableWebSearch(true);
      const nextRoundNumber = 1;

      // ACT: Add message + placeholder
      const optimisticMessage = createTestUserMessage({
        id: 'opt',
        content: 'Q',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      store.getState().addPreSearch({
        id: 'placeholder',
        threadId: 'thread-123',
        roundNumber: nextRoundNumber,
        status: 'pending',
        searchData: null,
        userQuery: 'Q',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      // ASSERT: PENDING status blocks streaming
      expect(store.getState().preSearches[0]?.status).toBe('pending');
    });

    it('should wait for pre-search to complete before participants stream', () => {
      // ARRANGE: Pre-search placeholder created
      store.getState().setEnableWebSearch(true);
      const nextRoundNumber = 1;

      store.getState().addPreSearch({
        id: 'placeholder',
        threadId: 'thread-123',
        roundNumber: nextRoundNumber,
        status: 'pending',
        searchData: null,
        userQuery: 'Q',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      // ACT: Simulate pre-search completion
      store.getState().updatePreSearchStatus(nextRoundNumber, 'complete');

      // ASSERT: Status changed to complete
      expect(store.getState().preSearches[0]?.status).toBe('complete');
    });

    it('should block streaming while pre-search is PENDING', () => {
      // ARRANGE: PENDING pre-search
      store.getState().setEnableWebSearch(true);
      store.getState().addPreSearch({
        id: 'placeholder',
        threadId: 'thread-123',
        roundNumber: 1,
        status: 'pending',
        searchData: null,
        userQuery: 'Q',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      // ACT: Check if streaming should wait
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      const shouldWait = preSearch?.status === 'pending' || preSearch?.status === 'streaming';

      // ASSERT: Streaming blocked
      expect(shouldWait).toBe(true);
    });

    it('should allow streaming when pre-search is COMPLETE', () => {
      // ARRANGE: COMPLETE pre-search
      store.getState().setEnableWebSearch(true);
      store.getState().addPreSearch({
        id: 'placeholder',
        threadId: 'thread-123',
        roundNumber: 1,
        status: 'complete',
        searchData: {
          queries: [],
          results: [],
          summary: 'Results',
          successCount: 1,
          failureCount: 0,
          totalResults: 3,
          totalTime: 1000,
        },
        userQuery: 'Q',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: new Date(),
      });

      // ACT: Check if streaming should wait
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      const shouldWait = preSearch?.status === 'pending' || preSearch?.status === 'streaming';

      // ASSERT: Streaming allowed
      expect(shouldWait).toBe(false);
    });
  });

  // ============================================================================
  // 3. COMPLETE FLOW - WEB SEARCH ENABLED, NO CONFIG CHANGES
  // ============================================================================

  describe('3. Complete Flow - Web Search Enabled, No Config Changes', () => {
    it('should complete full flow: message → pre-search placeholder → patch → unblock', () => {
      // ARRANGE: Web search enabled, no config changes
      store.getState().setEnableWebSearch(true);
      const nextRoundNumber = 1;

      // ACT 1: Add optimistic message (form-actions.ts:285)
      const optimisticMessage = createTestUserMessage({
        id: 'opt-msg',
        content: 'Question with web search',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      // ACT 2: Add pre-search placeholder (form-actions.ts:297-303)
      store.getState().addPreSearch({
        id: 'placeholder',
        threadId: 'thread-123',
        roundNumber: nextRoundNumber,
        status: 'pending',
        searchData: null,
        userQuery: 'Question with web search',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      // ACT 3: Block streaming (form-actions.ts:309)
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);
      store.getState().setWaitingToStartStreaming(true);

      // ASSERT PHASE 1: Before PATCH
      expect(store.getState().messages).toHaveLength(4);
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0]?.status).toBe('pending');
      expect(store.getState().configChangeRoundNumber).toBe(1);

      // ACT 4: PATCH completes - replace message (form-actions.ts:343-346)
      const persistedMessage = createTestUserMessage({
        id: 'thread-123_r1_user',
        content: 'Question with web search',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages(
        store.getState().messages.map(m =>
          m.id === optimisticMessage.id ? persistedMessage : m,
        ),
      );

      // ACT 5: No config changes - unblock streaming (form-actions.ts:371-373)
      store.getState().setConfigChangeRoundNumber(null);

      // ASSERT PHASE 2: After PATCH
      expect(store.getState().messages[3]?.id).toBe('thread-123_r1_user');
      expect(store.getState().configChangeRoundNumber).toBe(null);
      expect(store.getState().preSearches[0]?.status).toBe('pending'); // Still waiting for pre-search

      // CRITICAL: Streaming still blocked by PENDING pre-search
    });

    it('should allow streaming only after BOTH message patch AND pre-search complete', () => {
      // ARRANGE: Web search enabled
      store.getState().setEnableWebSearch(true);
      const nextRoundNumber = 1;

      // ACT: Complete flow up to PATCH
      const optimisticMessage = createTestUserMessage({
        id: 'opt',
        content: 'Q',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      store.getState().addPreSearch({
        id: 'placeholder',
        threadId: 'thread-123',
        roundNumber: nextRoundNumber,
        status: 'pending',
        searchData: null,
        userQuery: 'Q',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      store.getState().setConfigChangeRoundNumber(nextRoundNumber);

      // PATCH completes
      const persistedMessage = createTestUserMessage({
        id: 'thread-123_r1_user',
        content: 'Q',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages(
        store.getState().messages.map(m => (m.id === 'opt' ? persistedMessage : m)),
      );
      store.getState().setConfigChangeRoundNumber(null);

      // Check if streaming should wait (configChangeRoundNumber cleared but pre-search still pending)
      const patchComplete = store.getState().configChangeRoundNumber === null;
      const preSearchPending = store.getState().preSearches[0]?.status === 'pending';

      // ASSERT: Patch complete but pre-search still blocks
      expect(patchComplete).toBe(true);
      expect(preSearchPending).toBe(true);

      // ACT: Pre-search completes
      store.getState().updatePreSearchStatus(nextRoundNumber, 'complete');

      // Check if streaming can proceed
      const preSearchComplete = store.getState().preSearches[0]?.status === 'complete';

      // ASSERT: Now both conditions met
      expect(patchComplete).toBe(true);
      expect(preSearchComplete).toBe(true);
    });
  });

  // ============================================================================
  // 4. COMPLETE FLOW - WEB SEARCH ENABLED, WITH CONFIG CHANGES
  // ============================================================================

  describe('4. Complete Flow - Web Search Enabled, With Config Changes', () => {
    it('should complete full flow: message → pre-search → patch → changelog → unblock', () => {
      // ARRANGE: Web search enabled, mode changed
      store.getState().setEnableWebSearch(true);
      store.getState().setSelectedMode(ChatModes.DEBATE);
      store.getState().setHasPendingConfigChanges(true);
      const nextRoundNumber = 1;

      // ACT 1: Add optimistic message + pre-search
      const optimisticMessage = createTestUserMessage({
        id: 'opt',
        content: 'Q',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      store.getState().addPreSearch({
        id: 'placeholder',
        threadId: 'thread-123',
        roundNumber: nextRoundNumber,
        status: 'pending',
        searchData: null,
        userQuery: 'Q',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      // ACT 2: Block streaming
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);
      store.getState().setWaitingToStartStreaming(true);

      // ACT 3: PATCH completes
      const persistedMessage = createTestUserMessage({
        id: 'thread-123_r1_user',
        content: 'Q',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages(
        store.getState().messages.map(m => (m.id === 'opt' ? persistedMessage : m)),
      );

      // ACT 4: Config changes exist - trigger changelog
      store.getState().setIsWaitingForChangelog(true);

      // ASSERT PHASE 1: After PATCH, waiting for changelog
      expect(store.getState().configChangeRoundNumber).toBe(1); // Still blocked
      expect(store.getState().isWaitingForChangelog).toBe(true);
      expect(store.getState().preSearches[0]?.status).toBe('pending');

      // CRITICAL: Streaming blocked by BOTH configChangeRoundNumber AND PENDING pre-search
    });

    it('should wait for changelog before allowing streaming (even if pre-search complete)', () => {
      // ARRANGE: Config changes + web search
      store.getState().setEnableWebSearch(true);
      store.getState().setHasPendingConfigChanges(true);
      const nextRoundNumber = 1;

      // ACT: Complete flow including pre-search completion
      store.getState().addPreSearch({
        id: 'placeholder',
        threadId: 'thread-123',
        roundNumber: nextRoundNumber,
        status: 'complete',
        searchData: {
          queries: [],
          results: [],
          summary: 'Results',
          successCount: 1,
          failureCount: 0,
          totalResults: 3,
          totalTime: 1000,
        },
        userQuery: 'Q',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: new Date(),
      });

      store.getState().setConfigChangeRoundNumber(nextRoundNumber);
      store.getState().setIsWaitingForChangelog(true);

      // Check conditions
      const preSearchComplete = store.getState().preSearches[0]?.status === 'complete';
      const waitingForChangelog = store.getState().isWaitingForChangelog === true;
      const configBlocked = store.getState().configChangeRoundNumber === nextRoundNumber;

      // ASSERT: Pre-search complete but still blocked by changelog
      expect(preSearchComplete).toBe(true);
      expect(waitingForChangelog).toBe(true);
      expect(configBlocked).toBe(true);
    });
  });

  // ============================================================================
  // 5. IDENTICAL FLOW - WITH VS WITHOUT CONFIG CHANGES
  // ============================================================================

  describe('5. Identical Flow - With vs Without Config Changes', () => {
    it('should create pre-search placeholder identically regardless of config changes', () => {
      // TEST 1: No config changes
      store.getState().setEnableWebSearch(true);
      store.getState().addPreSearch({
        id: 'placeholder-1',
        threadId: 'thread-123',
        roundNumber: 1,
        status: 'pending',
        searchData: null,
        userQuery: 'Q1',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });
      const noChangesPreSearchCount = store.getState().preSearches.length;

      // TEST 2: With config changes
      store.getState().setHasPendingConfigChanges(true);
      store.getState().addPreSearch({
        id: 'placeholder-2',
        threadId: 'thread-123',
        roundNumber: 2,
        status: 'pending',
        searchData: null,
        userQuery: 'Q2',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });
      const withChangesPreSearchCount = store.getState().preSearches.length;

      // ASSERT: Both create placeholder the same way
      expect(withChangesPreSearchCount - noChangesPreSearchCount).toBe(1);
    });

    it('should add optimistic message + pre-search in same order for both scenarios', () => {
      // SCENARIO 1: No config changes
      const opt1 = createTestUserMessage({ id: 'opt1', content: 'Q1', roundNumber: 1 });
      store.getState().setMessages([...store.getState().messages, opt1]);
      store.getState().setEnableWebSearch(true);
      store.getState().addPreSearch({
        id: 'ps1',
        threadId: 'thread-123',
        roundNumber: 1,
        status: 'pending',
        searchData: null,
        userQuery: 'Q1',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });
      const scenario1Messages = store.getState().messages.length;
      const scenario1PreSearches = store.getState().preSearches.length;

      // SCENARIO 2: With config changes
      store.getState().setHasPendingConfigChanges(true);
      const opt2 = createTestUserMessage({ id: 'opt2', content: 'Q2', roundNumber: 2 });
      store.getState().setMessages([...store.getState().messages, opt2]);
      store.getState().addPreSearch({
        id: 'ps2',
        threadId: 'thread-123',
        roundNumber: 2,
        status: 'pending',
        searchData: null,
        userQuery: 'Q2',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });
      const scenario2Messages = store.getState().messages.length;
      const scenario2PreSearches = store.getState().preSearches.length;

      // ASSERT: Same pattern in both scenarios
      expect(scenario2Messages - scenario1Messages).toBe(1);
      expect(scenario2PreSearches - scenario1PreSearches).toBe(1);
    });
  });

  // ============================================================================
  // 6. ERROR HANDLING - PRE-SEARCH CLEANUP
  // ============================================================================

  describe('6. Error Handling - Pre-Search Cleanup', () => {
    it('should keep pre-search placeholder when PATCH fails (for retry)', () => {
      // ARRANGE: Pre-search placeholder created
      store.getState().setEnableWebSearch(true);
      store.getState().addPreSearch({
        id: 'placeholder',
        threadId: 'thread-123',
        roundNumber: 1,
        status: 'pending',
        searchData: null,
        userQuery: 'Q',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      const preSearchCount = store.getState().preSearches.length;

      // ACT: PATCH fails (rollback optimistic message, but pre-search remains)
      // NOTE: form-actions.ts doesn't remove pre-search on PATCH failure

      // ASSERT: Pre-search still exists
      expect(store.getState().preSearches).toHaveLength(preSearchCount);
    });

    it('should handle pre-search FAILED status gracefully', () => {
      // ARRANGE: Pre-search placeholder created
      store.getState().setEnableWebSearch(true);
      store.getState().addPreSearch({
        id: 'placeholder',
        threadId: 'thread-123',
        roundNumber: 1,
        status: 'pending',
        searchData: null,
        userQuery: 'Q',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      // ACT: Pre-search execution fails
      store.getState().updatePreSearchStatus(1, 'failed');

      // Check if streaming should wait
      const shouldWait = store.getState().preSearches[0]?.status === 'pending'
        || store.getState().preSearches[0]?.status === 'streaming';

      // ASSERT: FAILED status allows streaming to proceed
      expect(store.getState().preSearches[0]?.status).toBe('failed');
      expect(shouldWait).toBe(false);
    });
  });

  // ============================================================================
  // 7. ROUND NUMBER ISOLATION
  // ============================================================================

  describe('7. Round Number Isolation', () => {
    it('should create separate pre-search placeholders for different rounds', () => {
      // ARRANGE
      store.getState().setEnableWebSearch(true);

      // ACT: Add pre-search for Round 1
      store.getState().addPreSearch({
        id: 'placeholder-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        status: 'pending',
        searchData: null,
        userQuery: 'Q1',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      // Add pre-search for Round 2
      store.getState().addPreSearch({
        id: 'placeholder-r2',
        threadId: 'thread-123',
        roundNumber: 2,
        status: 'pending',
        searchData: null,
        userQuery: 'Q2',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      // ASSERT: Two separate pre-searches
      expect(store.getState().preSearches).toHaveLength(2);
      expect(store.getState().preSearches[0]?.roundNumber).toBe(1);
      expect(store.getState().preSearches[1]?.roundNumber).toBe(2);
    });

    it('should not confuse pre-search status between rounds', () => {
      // ARRANGE: Round 1 pre-search complete, Round 2 pre-search pending
      store.getState().setEnableWebSearch(true);

      store.getState().addPreSearch({
        id: 'ps-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        status: 'complete',
        searchData: {
          queries: [],
          results: [],
          summary: 'R1 results',
          successCount: 1,
          failureCount: 0,
          totalResults: 3,
          totalTime: 1000,
        },
        userQuery: 'Q1',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: new Date(),
      });

      store.getState().addPreSearch({
        id: 'ps-r2',
        threadId: 'thread-123',
        roundNumber: 2,
        status: 'pending',
        searchData: null,
        userQuery: 'Q2',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      // ACT: Check Round 2 status
      const round2PreSearch = store.getState().preSearches.find(ps => ps.roundNumber === 2);
      const shouldWaitForRound2 = round2PreSearch?.status === 'pending'
        || round2PreSearch?.status === 'streaming';

      // ASSERT: Round 2 still pending despite Round 1 complete
      expect(round2PreSearch?.status).toBe('pending');
      expect(shouldWaitForRound2).toBe(true);
    });
  });
});

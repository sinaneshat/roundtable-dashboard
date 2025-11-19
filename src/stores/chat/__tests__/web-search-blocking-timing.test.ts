/**
 * WEB SEARCH BLOCKING TIMING TESTS
 *
 * CRITICAL TIMING BEHAVIOR (FLOW_DOCUMENTATION.md Part 2):
 * "Pre-search MUST complete before participant streaming starts"
 * "Store subscription checks pre-search status before allowing streaming"
 * "If pre-search status is PENDING or STREAMING, participant streaming is blocked"
 * "Only when status is COMPLETED or FAILED will participant streaming proceed"
 *
 * USER ISSUES:
 * - No blocking when pre-search is enabled
 * - Participants start streaming before search completes
 * - Race conditions between search creation and participant streaming
 *
 * TEST SCENARIOS:
 * 1. PENDING status blocks participant streaming
 * 2. STREAMING status blocks participant streaming
 * 3. COMPLETE status allows participant streaming
 * 4. FAILED status allows participant streaming (non-blocking)
 * 5. Missing pre-search when enabled - blocks with optimistic wait
 * 6. Status transitions (PENDING → STREAMING → COMPLETE)
 * 7. Multiple rounds with different search statuses
 * 8. Race condition: backend creates search, orchestrator not synced yet
 *
 * FILES UNDER TEST:
 * - src/stores/chat/actions/pending-message-sender.ts (shouldWaitForPreSearch)
 * - src/components/providers/chat-store-provider.tsx (blocking logic)
 *
 * @see /docs/FLOW_DOCUMENTATION.md Part 2: Critical Timing Behavior
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import { createMockPreSearch, createTestUserMessage } from '@/lib/testing';
import { createChatStore } from '@/stores/chat';

import { shouldSendPendingMessage, shouldWaitForPreSearch } from '../actions/pending-message-sender';
import type { ChatStore } from '../store';

describe('web Search Blocking - Timing Behavior', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatStore;

  beforeEach(() => {
    store = createChatStore();
    getState = store.getState;
  });

  // ==========================================================================
  // CRITICAL: PENDING Status Blocks
  // ==========================================================================
  describe('pENDING status blocking', () => {
    it('should block participant streaming when pre-search is PENDING', () => {
      // Setup: Pre-search exists in PENDING state
      const roundNumber = 0;
      const preSearches = [
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Test question',
        }),
      ];

      // Check if should wait
      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches,
        roundNumber,
      });

      // ✅ CRITICAL: PENDING status MUST block streaming
      expect(shouldWait).toBe(true);
    });

    it('should block on PENDING in store state', () => {
      // Add PENDING pre-search to store
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Test question',
        }),
      );

      // Verify status is PENDING
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);

      // Check if should wait using store state
      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: getState().preSearches,
        roundNumber: 0,
      });

      expect(shouldWait).toBe(true);
    });

    it('should continue blocking while status remains PENDING', () => {
      const preSearch = createMockPreSearch({
        id: 'search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Test question',
      });

      getState().addPreSearch(preSearch);

      // Check multiple times while PENDING
      for (let i = 0; i < 5; i++) {
        const shouldWait = shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        });
        expect(shouldWait).toBe(true);
      }
    });
  });

  // ==========================================================================
  // CRITICAL: STREAMING Status Blocks
  // ==========================================================================
  describe('sTREAMING status blocking', () => {
    it('should block participant streaming when pre-search is STREAMING', () => {
      const roundNumber = 0;
      const preSearches = [
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Test question',
        }),
      ];

      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches,
        roundNumber,
      });

      // ✅ CRITICAL: STREAMING status MUST block streaming
      expect(shouldWait).toBe(true);
    });

    it('should block on STREAMING in store state', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Test question',
        }),
      );

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: getState().preSearches,
        roundNumber: 0,
      });

      expect(shouldWait).toBe(true);
    });

    it('should continue blocking while search is streaming', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Test question',
        }),
      );

      // Simulate multiple checks while streaming
      for (let i = 0; i < 10; i++) {
        const shouldWait = shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        });
        expect(shouldWait).toBe(true);
      }
    });
  });

  // ==========================================================================
  // CRITICAL: COMPLETE Status Allows Streaming
  // ==========================================================================
  describe('cOMPLETE status allows streaming', () => {
    it('should NOT block when pre-search is COMPLETE', () => {
      const roundNumber = 0;
      const preSearches = [
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Test question',
        }),
      ];

      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches,
        roundNumber,
      });

      // ✅ CRITICAL: COMPLETE status allows streaming
      expect(shouldWait).toBe(false);
    });

    it('should allow streaming immediately after status becomes COMPLETE', () => {
      // Start with STREAMING
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Test question',
        }),
      );

      // Should block while STREAMING
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        }),
      ).toBe(true);

      // Update to COMPLETE
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Should NOT block after COMPLETE
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        }),
      ).toBe(false);
    });
  });

  // ==========================================================================
  // CRITICAL: FAILED Status Allows Streaming
  // ==========================================================================
  describe('fAILED status allows streaming', () => {
    it('should NOT block when pre-search is FAILED', () => {
      const roundNumber = 0;
      const preSearches = [
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber,
          status: AnalysisStatuses.FAILED,
          userQuery: 'Test question',
        }),
      ];

      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches,
        roundNumber,
      });

      // ✅ CRITICAL: FAILED status does NOT block (graceful degradation)
      expect(shouldWait).toBe(false);
    });

    it('should allow streaming immediately after failure', () => {
      // Start with STREAMING
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Test question',
        }),
      );

      // Should block while STREAMING
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        }),
      ).toBe(true);

      // Update to FAILED
      getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);

      // Should NOT block after FAILED
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        }),
      ).toBe(false);
    });
  });

  // ==========================================================================
  // CRITICAL: Missing Pre-Search Blocks (Optimistic Wait)
  // ==========================================================================
  describe('missing pre-search blocking', () => {
    it('should block when web search enabled but no pre-search exists yet', () => {
      // Web search enabled, but no pre-search record synced yet
      const roundNumber = 0;
      const preSearches: ReturnType<ChatStore['getState']>['preSearches'] = [];

      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches,
        roundNumber,
      });

      // ✅ CRITICAL: Must wait for backend to create + orchestrator to sync
      expect(shouldWait).toBe(true);
    });

    it('should block via shouldSendPendingMessage when pre-search missing', () => {
      // Setup state with web search enabled but no pre-search
      getState().setMessages([
        createTestUserMessage({
          id: 'msg-1',
          content: 'Test question',
          roundNumber: 0,
        }),
      ]);

      const validation = shouldSendPendingMessage({
        pendingMessage: 'Test',
        expectedParticipantIds: ['gpt-4'],
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: 'overview',
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'gpt-4',
            customRoleId: null,
            role: null,
            priority: 0,
            isEnabled: true,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: getState().messages,
        preSearches: [], // No pre-search yet
        thread: {
          id: 'thread-1',
          userId: 'user-1',
          projectId: null,
          title: 'Test',
          slug: 'test',
          mode: 'debating',
          status: 'active',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          enableWebSearch: true, // Enabled but no pre-search
          metadata: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
        },
        enableWebSearch: true,
      });

      // Should NOT send - waiting for pre-search creation
      expect(validation.shouldSend).toBe(false);
      expect(validation.reason).toBe('waiting for pre-search creation');
    });

    it('should allow streaming when web search disabled and no pre-search', () => {
      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: false,
        preSearches: [],
        roundNumber: 0,
      });

      // Should NOT wait when web search disabled
      expect(shouldWait).toBe(false);
    });
  });

  // ==========================================================================
  // CRITICAL: Status Transitions
  // ==========================================================================
  describe('status transition blocking', () => {
    it('should block during PENDING → STREAMING transition', () => {
      // Start PENDING
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Test question',
        }),
      );

      // Blocks on PENDING
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        }),
      ).toBe(true);

      // Transition to STREAMING
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

      // Still blocks on STREAMING
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        }),
      ).toBe(true);
    });

    it('should unblock after STREAMING → COMPLETE transition', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Test question',
        }),
      );

      // Blocks on STREAMING
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        }),
      ).toBe(true);

      // Transition to COMPLETE
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Unblocks on COMPLETE
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        }),
      ).toBe(false);
    });

    it('should unblock after STREAMING → FAILED transition', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Test question',
        }),
      );

      // Blocks on STREAMING
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        }),
      ).toBe(true);

      // Transition to FAILED
      getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);

      // Unblocks on FAILED
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        }),
      ).toBe(false);
    });
  });

  // ==========================================================================
  // CRITICAL: Multiple Rounds with Different Statuses
  // ==========================================================================
  describe('multiple rounds blocking', () => {
    it('should block only on the correct round', () => {
      // Round 0 COMPLETE, Round 1 STREAMING
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
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Question 2',
        }),
      );

      // Round 0 should NOT block (COMPLETE)
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        }),
      ).toBe(false);

      // Round 1 SHOULD block (STREAMING)
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 1,
        }),
      ).toBe(true);
    });

    it('should handle 3+ rounds with mixed statuses', () => {
      // Rounds 0-2 COMPLETE, Round 3 PENDING
      for (let i = 0; i <= 2; i++) {
        getState().addPreSearch(
          createMockPreSearch({
            id: `search-${i}`,
            threadId: 'thread-1',
            roundNumber: i,
            status: AnalysisStatuses.COMPLETE,
            userQuery: `Question ${i + 1}`,
          }),
        );
      }

      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-3',
          threadId: 'thread-1',
          roundNumber: 3,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Question 4',
        }),
      );

      // Rounds 0-2 should NOT block
      for (let i = 0; i <= 2; i++) {
        expect(
          shouldWaitForPreSearch({
            webSearchEnabled: true,
            preSearches: getState().preSearches,
            roundNumber: i,
          }),
        ).toBe(false);
      }

      // Round 3 SHOULD block
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 3,
        }),
      ).toBe(true);
    });
  });

  // ==========================================================================
  // CRITICAL: Race Condition Handling
  // ==========================================================================
  describe('race condition prevention', () => {
    it('should block when backend created search but orchestrator not synced', () => {
      // Backend creates PENDING pre-search for round 0
      // But orchestrator polls every 2s, so there's 0-2s delay
      // During this window, preSearches array is empty

      const preSearches: ReturnType<ChatStore['getState']>['preSearches'] = [];

      // Should block with optimistic wait
      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches,
        roundNumber: 0,
      });

      expect(shouldWait).toBe(true);
    });

    it('should unblock after orchestrator syncs pre-search', () => {
      // Initially empty (race condition)
      expect(getState().preSearches).toHaveLength(0);

      // Orchestrator syncs PENDING pre-search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Test question',
        }),
      );

      // Still blocks on PENDING (execution not started)
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        }),
      ).toBe(true);

      // Execution starts (PENDING → STREAMING)
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

      // Still blocks on STREAMING
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        }),
      ).toBe(true);

      // Search completes (STREAMING → COMPLETE)
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Unblocks on COMPLETE
      expect(
        shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: getState().preSearches,
          roundNumber: 0,
        }),
      ).toBe(false);
    });

    it('should prevent participants from starting during race window', () => {
      // Simulate race condition scenario
      const validation = shouldSendPendingMessage({
        pendingMessage: 'Test',
        expectedParticipantIds: ['gpt-4'],
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: 'overview',
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'gpt-4',
            customRoleId: null,
            role: null,
            priority: 0,
            isEnabled: true,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: [],
        preSearches: [], // Race: backend created, orchestrator not synced
        thread: {
          id: 'thread-1',
          userId: 'user-1',
          projectId: null,
          title: 'Test',
          slug: 'test',
          mode: 'debating',
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
        },
        enableWebSearch: true,
      });

      // Must NOT send during race window
      expect(validation.shouldSend).toBe(false);
      expect(validation.reason).toBe('waiting for pre-search creation');
    });
  });
});

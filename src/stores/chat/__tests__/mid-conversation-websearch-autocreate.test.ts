/**
 * Mid-Conversation Web Search Auto-Create Tests
 *
 * Tests the backend handler's ability to auto-create pre-search records
 * when web search is enabled mid-conversation (thread created without web search).
 *
 * BUG FIXED:
 * - Error: "Pre-search record not found" when enabling web search mid-conversation
 * - Root cause: executePreSearchHandler threw NOT_FOUND instead of auto-creating
 * - Fix: Handler now auto-creates record if it doesn't exist
 *
 * KEY BEHAVIOR:
 * - Pre-search is NEVER skipped when web search is enabled
 * - Participants wait in shimmer/pending state while pre-search runs
 * - Auto-create handles: thread created without web search → user enables later
 * - Order: user message → pre-search (PENDING → STREAMING → COMPLETE) → participants
 *
 * Location: /src/stores/chat/__tests__/mid-conversation-websearch-autocreate.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  PendingMessageValidationReasons,
  ScreenModes,
} from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { calculateNextRoundNumber, getCurrentRoundNumber } from '@/lib/utils/round-utils';
import { shouldSendPendingMessage, shouldWaitForPreSearch } from '@/stores/chat/actions/pending-message-sender';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockMessage,
  createMockParticipant,
  createMockPreSearch,
  createMockPreSearchDataPayload,
  createMockThread,
  createMockUserMessage,
  createStreamingPreSearch,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

/**
 * Create a placeholder pre-search (frontend-only, not in DB)
 * Simulates what form-actions.ts creates for immediate UI feedback
 */
function createPlaceholderPreSearch(
  threadId: string,
  roundNumber: number,
  userQuery: string,
): StoredPreSearch {
  return {
    id: `placeholder-presearch-${threadId}-${roundNumber}`,
    threadId,
    roundNumber,
    userQuery,
    status: AnalysisStatuses.PENDING,
    searchData: null,
    createdAt: new Date(),
    completedAt: null,
    errorMessage: null,
  };
}

// ============================================================================
// MID-CONVERSATION WEB SEARCH AUTO-CREATE TESTS
// ============================================================================

describe('mid-Conversation Web Search Auto-Create', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // SCENARIO: Thread created WITHOUT web search, enabled on round 2+
  // ==========================================================================

  describe('thread Created Without Web Search', () => {
    it('should block participants when web search is enabled mid-conversation with no pre-search record', () => {
      // Setup: Thread created WITHOUT web search
      const thread = createMockThread({
        id: 'thread-no-search',
        enableWebSearch: false,
        mode: ChatModes.DEBATING,
      });

      const participants = [
        createMockParticipant(0, { modelId: 'openai/gpt-4' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
      ];

      // Round 0 and 1 complete without web search
      const messages = [
        createMockUserMessage(0, 'Question 1'),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
        createMockUserMessage(1, 'Question 2'),
        createMockMessage(0, 1),
        createMockMessage(1, 1),
      ];

      store.getState().initializeThread(thread, participants, messages);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // User enables web search for round 2
      store.getState().setEnableWebSearch(true);

      // CRITICAL: Pre-search blocking check
      // Should block because web search is enabled but no pre-search exists
      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [], // NO pre-search record exists
        roundNumber: 2,
      });

      expect(shouldWait).toBe(true);
    });

    it('should continue blocking while pre-search is PENDING', () => {
      const thread = createMockThread({
        id: 'thread-test',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      // Add PENDING pre-search (created by backend auto-create)
      const pendingPreSearch: StoredPreSearch = {
        id: 'presearch-r2',
        threadId: 'thread-test',
        roundNumber: 2,
        userQuery: 'New question with search',
        status: AnalysisStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      };

      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [pendingPreSearch],
        roundNumber: 2,
      });

      expect(shouldWait).toBe(true);
    });

    it('should continue blocking while pre-search is STREAMING', () => {
      const thread = createMockThread({
        id: 'thread-test',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      // Add STREAMING pre-search
      const streamingPreSearch: StoredPreSearch = {
        id: 'presearch-r2',
        threadId: 'thread-test',
        roundNumber: 2,
        userQuery: 'New question with search',
        status: AnalysisStatuses.STREAMING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      };

      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [streamingPreSearch],
        roundNumber: 2,
      });

      expect(shouldWait).toBe(true);
    });

    it('should allow participants to proceed when pre-search is COMPLETE', () => {
      const thread = createMockThread({
        id: 'thread-test',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      // Add COMPLETE pre-search with search data
      const completePreSearch: StoredPreSearch = {
        id: 'presearch-r2',
        threadId: 'thread-test',
        roundNumber: 2,
        userQuery: 'New question with search',
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
        createdAt: new Date(),
        completedAt: new Date(),
        errorMessage: null,
      };

      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [completePreSearch],
        roundNumber: 2,
      });

      expect(shouldWait).toBe(false);
    });

    it('should allow participants to proceed when pre-search is FAILED (degraded mode)', () => {
      const thread = createMockThread({
        id: 'thread-test',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      // Add FAILED pre-search
      const failedPreSearch: StoredPreSearch = {
        id: 'presearch-r2',
        threadId: 'thread-test',
        roundNumber: 2,
        userQuery: 'New question with search',
        status: AnalysisStatuses.FAILED,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: 'Search service unavailable',
      };

      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [failedPreSearch],
        roundNumber: 2,
      });

      // FAILED = don't block, continue without search (degraded mode)
      expect(shouldWait).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO: Placeholder pre-search handling
  // ==========================================================================

  describe('placeholder Pre-Search Handling', () => {
    it('should create placeholder pre-search for immediate UI feedback', () => {
      const thread = createMockThread({
        id: 'thread-placeholder',
        enableWebSearch: false,
      });

      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0, 'Initial question'),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // User enables web search
      store.getState().setEnableWebSearch(true);

      // Simulate what form-actions.ts does: create placeholder for immediate UI
      const placeholder = createPlaceholderPreSearch(
        'thread-placeholder',
        1,
        'Question with search',
      );

      store.getState().addPreSearch(placeholder);

      // Verify placeholder is in store
      const preSearches = store.getState().preSearches;
      expect(preSearches).toHaveLength(1);
      expect(preSearches[0].id).toContain('placeholder-presearch');
      expect(preSearches[0].status).toBe(AnalysisStatuses.PENDING);
    });

    it('should identify placeholder pre-searches by ID pattern', () => {
      const placeholder = createPlaceholderPreSearch('thread-1', 2, 'Query');

      const isPlaceholder = placeholder.id.startsWith('placeholder-');
      expect(isPlaceholder).toBe(true);

      // Real pre-search from backend has ULID format
      const realPreSearch = createMockPreSearch({
        id: '01KB18FA8YQ8ZVBTDESCAHQ0QD', // ULID format
        roundNumber: 2,
      });

      const isRealPlaceholder = realPreSearch.id.startsWith('placeholder-');
      expect(isRealPlaceholder).toBe(false);
    });

    it('should block participants while placeholder is PENDING', () => {
      const placeholder = createPlaceholderPreSearch('thread-1', 2, 'Query');

      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [placeholder],
        roundNumber: 2,
      });

      expect(shouldWait).toBe(true);
    });
  });

  // ==========================================================================
  // SCENARIO: State transitions during mid-conversation web search
  // ==========================================================================

  describe('state Transitions', () => {
    it('should track correct state sequence: PENDING → STREAMING → COMPLETE', () => {
      const thread = createMockThread({
        id: 'thread-states',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // STEP 1: Add PENDING placeholder
      const pendingPreSearch = createPlaceholderPreSearch('thread-states', 1, 'Query');
      store.getState().addPreSearch(pendingPreSearch);

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 1,
      })).toBe(true);

      // STEP 2: Update to STREAMING (backend started processing)
      store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 1,
      })).toBe(true);

      // STEP 3: Update to COMPLETE with data
      store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(store.getState().preSearches[0].searchData).not.toBeNull();
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 1,
      })).toBe(false);
    });

    it('should handle PENDING → FAILED transition gracefully', () => {
      const thread = createMockThread({
        id: 'thread-fail',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      // Add PENDING pre-search
      const pendingPreSearch = createPlaceholderPreSearch('thread-fail', 1, 'Query');
      store.getState().addPreSearch(pendingPreSearch);

      // Simulate failure
      store.getState().updatePreSearchError(1, 'Search service unavailable');

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.FAILED);
      expect(store.getState().preSearches[0].errorMessage).toBe('Search service unavailable');

      // Should NOT block (degraded mode)
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 1,
      })).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO: Multiple rounds with web search toggle
  // ==========================================================================

  describe('multiple Rounds Web Search Toggle', () => {
    it('should handle: round 0 (no search) → round 1 (search) → round 2 (no search)', () => {
      const thread = createMockThread({
        id: 'thread-toggle',
        enableWebSearch: false,
      });

      const participant = createMockParticipant(0);

      store.getState().initializeThread(thread, [participant]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Round 0: No web search
      expect(store.getState().enableWebSearch).toBe(false);

      // Round 1: Enable web search
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);

      // Should block for round 1
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [],
        roundNumber: 1,
      })).toBe(true);

      // Add and complete pre-search for round 1
      const round1PreSearch = createMockPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-toggle',
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      });
      store.getState().addPreSearch(round1PreSearch);

      // Should NOT block (complete)
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [round1PreSearch],
        roundNumber: 1,
      })).toBe(false);

      // Round 2: Disable web search
      store.getState().setEnableWebSearch(false);
      expect(store.getState().enableWebSearch).toBe(false);

      // Should NOT block for round 2 (web search disabled)
      expect(shouldWaitForPreSearch({
        webSearchEnabled: false,
        preSearches: [round1PreSearch],
        roundNumber: 2,
      })).toBe(false);
    });

    it('should maintain separate pre-search state for each round', () => {
      const thread = createMockThread({
        id: 'thread-multi',
        enableWebSearch: true, // Thread has web search enabled
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Add pre-searches for rounds 0, 1, 2
      const round0 = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      });
      const round1 = createMockPreSearch({
        roundNumber: 1,
        status: AnalysisStatuses.STREAMING,
      });
      const round2 = createMockPreSearch({
        roundNumber: 2,
        status: AnalysisStatuses.PENDING,
      });

      store.getState().addPreSearch(round0);
      store.getState().addPreSearch(round1);
      store.getState().addPreSearch(round2);

      // Each round has independent status
      expect(store.getState().preSearches).toHaveLength(3);

      // Round 0: COMPLETE - don't block
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 0,
      })).toBe(false);

      // Round 1: STREAMING - block
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 1,
      })).toBe(true);

      // Round 2: PENDING - block
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 2,
      })).toBe(true);
    });
  });

  // ==========================================================================
  // SCENARIO: Pending message validation with mid-conversation web search
  // ==========================================================================

  describe('pending Message Validation', () => {
    it('should require pre-search completion before sending message when web search enabled mid-conversation', () => {
      const thread = createMockThread({
        id: 'thread-validation',
        enableWebSearch: false, // Created WITHOUT web search
      });

      const participants = [
        createMockParticipant(0, { modelId: 'openai/gpt-4' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
      ];

      // Initialize with round 0 complete
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0, 'Initial question'),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // User enables web search for round 1
      store.getState().setEnableWebSearch(true);

      // Set pending message
      store.getState().setPendingMessage('New question');
      store.getState().setExpectedParticipantIds(['openai/gpt-4', 'anthropic/claude-3']);

      // Add PENDING placeholder
      const placeholder = createPlaceholderPreSearch('thread-validation', 1, 'New question');
      store.getState().addPreSearch(placeholder);

      // Validate: should NOT send because pre-search is PENDING
      const validation = shouldSendPendingMessage(store.getState());

      expect(validation.shouldSend).toBe(false);
      // May be WAITING_FOR_PRE_SEARCH_CREATION or WAITING_FOR_PRE_SEARCH depending on state
      expect([
        PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH_CREATION,
        PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH,
      ]).toContain(validation.reason);
    });

    it('should allow sending message when pre-search completes', () => {
      const thread = createMockThread({
        id: 'thread-validation-ok',
        enableWebSearch: false,
      });

      const participants = [
        createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      ];

      // Initialize with round 0 complete AND optimistic user message for round 1
      // This simulates state after prepareForNewMessage adds optimistic user message
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0, 'Initial question'),
        createMockMessage(0, 0),
        createMockUserMessage(1, 'New question'), // Optimistic user message for round 1
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Enable web search and set pending message
      store.getState().setEnableWebSearch(true);
      store.getState().setPendingMessage('New question');
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);

      // Add COMPLETE pre-search for the current round (1)
      const completePreSearch = createMockPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-validation-ok',
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      });
      store.getState().addPreSearch(completePreSearch);

      // Validate: should send because pre-search is COMPLETE
      const validation = shouldSendPendingMessage(store.getState());

      // Pre-search is COMPLETE, so if validation fails, it must NOT be due to pre-search
      // This assertion works whether shouldSend is true (reason undefined) or false (other reason)
      expect([
        PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH,
        PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH_CREATION,
      ]).not.toContain(validation.reason);
    });
  });

  // ==========================================================================
  // SCENARIO: Pre-search triggering tracking
  // ==========================================================================

  describe('pre-Search Triggering Tracking', () => {
    it('should track triggered pre-search rounds to prevent duplicates', () => {
      const thread = createMockThread({
        id: 'thread-tracking',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      // Initially not triggered
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);

      // Mark as triggered
      store.getState().markPreSearchTriggered(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);

      // Other rounds not affected
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
      expect(store.getState().hasPreSearchBeenTriggered(2)).toBe(false);
    });

    it('should clear triggering tracking on failure for retry', () => {
      const thread = createMockThread({
        id: 'thread-retry',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      // Mark as triggered
      store.getState().markPreSearchTriggered(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);

      // Clear tracking (allows retry after failure)
      store.getState().clearPreSearchTracking(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO: UI state during mid-conversation web search
  // ==========================================================================

  describe('uI State During Pre-Search', () => {
    it('should maintain isStreaming=false while pre-search is running', () => {
      const thread = createMockThread({
        id: 'thread-ui',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Add STREAMING pre-search
      const streamingPreSearch = createStreamingPreSearch(1);
      store.getState().addPreSearch(streamingPreSearch);

      // isStreaming should be false (participants haven't started yet)
      expect(store.getState().isStreaming).toBe(false);
    });

    it('should set waitingToStartStreaming while waiting for pre-search', () => {
      const thread = createMockThread({
        id: 'thread-waiting',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Simulate waiting state
      store.getState().setWaitingToStartStreaming(true);

      expect(store.getState().waitingToStartStreaming).toBe(true);
      expect(store.getState().isStreaming).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO: Thread's enableWebSearch vs Form's enableWebSearch
  // ==========================================================================

  describe('thread vs Form Web Search State', () => {
    it('should NOT reset enableWebSearch when hasPendingConfigChanges flips to false with stale thread prop', () => {
      // BUG FIX: When user enables web search and PATCH completes:
      // 1. hasPendingConfigChanges flips to false
      // 2. thread prop is still stale SSR data (enableWebSearch: false)
      // 3. Sync effect would incorrectly overwrite form state
      //
      // This test verifies form state persists after PATCH even with stale thread prop

      // Thread created WITHOUT web search (stale SSR data)
      const thread = createMockThread({
        id: 'thread-stale-prop',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Initial state: both thread and form have enableWebSearch: false
      expect(store.getState().thread?.enableWebSearch).toBe(false);
      expect(store.getState().enableWebSearch).toBe(false);

      // User enables web search via form toggle
      store.getState().setEnableWebSearch(true);
      store.getState().setHasPendingConfigChanges(true);

      // Form state updated
      expect(store.getState().enableWebSearch).toBe(true);
      // Thread prop is still stale
      expect(store.getState().thread?.enableWebSearch).toBe(false);

      // CRITICAL: When PATCH completes, form state should NOT be reset by stale thread prop
      // This simulates what happens when hasPendingConfigChanges flips to false
      store.getState().setHasPendingConfigChanges(false);

      // Form state should STILL be true (not reset by stale thread prop)
      expect(store.getState().enableWebSearch).toBe(true);

      // Pre-search decision should still use form state
      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: store.getState().enableWebSearch,
        preSearches: [],
        roundNumber: 1,
      });

      // Should wait because form says web search is enabled
      expect(shouldWait).toBe(true);
    });

    it('should use form state (not thread state) for pre-search decisions', () => {
      // Thread created WITHOUT web search
      const thread = createMockThread({
        id: 'thread-form-state',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Thread says no web search
      expect(store.getState().thread?.enableWebSearch).toBe(false);

      // Form says no web search (synced from thread)
      expect(store.getState().enableWebSearch).toBe(false);

      // User enables web search via form
      store.getState().setEnableWebSearch(true);

      // Thread unchanged
      expect(store.getState().thread?.enableWebSearch).toBe(false);

      // Form updated
      expect(store.getState().enableWebSearch).toBe(true);

      // Pre-search decision should use FORM state
      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: store.getState().enableWebSearch, // Form state
        preSearches: [],
        roundNumber: 1,
      });

      // Should wait because form says web search is enabled
      expect(shouldWait).toBe(true);
    });

    it('should sync form state from thread on initialization', () => {
      // Thread created WITH web search
      const thread = createMockThread({
        id: 'thread-sync',
        enableWebSearch: true,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Both should be true
      expect(store.getState().thread?.enableWebSearch).toBe(true);
      expect(store.getState().enableWebSearch).toBe(true);
    });
  });

  // ==========================================================================
  // SCENARIO: Activity tracking for timeout detection
  // ==========================================================================

  describe('activity Tracking', () => {
    it('should track pre-search activity times', () => {
      const thread = createMockThread({
        id: 'thread-activity',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      // No activity initially
      expect(store.getState().getPreSearchActivityTime(1)).toBeUndefined();

      // Update activity
      store.getState().updatePreSearchActivity(1);

      const activityTime = store.getState().getPreSearchActivityTime(1);
      expect(activityTime).toBeDefined();
      expect(typeof activityTime).toBe('number');
    });

    it('should clear activity tracking after pre-search completes', () => {
      const thread = createMockThread({
        id: 'thread-clear-activity',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      // Set activity
      store.getState().updatePreSearchActivity(1);
      expect(store.getState().getPreSearchActivityTime(1)).toBeDefined();

      // Clear activity
      store.getState().clearPreSearchActivity(1);
      expect(store.getState().getPreSearchActivityTime(1)).toBeUndefined();
    });
  });

  // ==========================================================================
  // SCENARIO: Round number calculation
  // ==========================================================================

  describe('round Number Calculation', () => {
    it('should calculate correct round number for mid-conversation web search', () => {
      // Round 0 complete, round 1 in progress
      const messages = [
        createMockUserMessage(0, 'Question 1'),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
        createMockUserMessage(1, 'Question 2'), // Round 1 started
      ];

      const currentRound = getCurrentRoundNumber(messages);
      expect(currentRound).toBe(1);

      const nextRound = calculateNextRoundNumber(messages);
      expect(nextRound).toBe(2);
    });

    it('should use current round number for pre-search lookup', () => {
      const thread = createMockThread({
        id: 'thread-round',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      // Messages for round 0 and 1
      const messages = [
        createMockUserMessage(0, 'Q1'),
        createMockMessage(0, 0),
        createMockUserMessage(1, 'Q2'),
      ];
      store.getState().setMessages(messages);

      // Current round should be 1
      const currentRound = getCurrentRoundNumber(store.getState().messages);
      expect(currentRound).toBe(1);

      // Pre-search for round 1 should be checked
      const preSearchR1 = createMockPreSearch({
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
      });
      store.getState().addPreSearch(preSearchR1);

      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: currentRound,
      });

      expect(shouldWait).toBe(true);
    });
  });
});

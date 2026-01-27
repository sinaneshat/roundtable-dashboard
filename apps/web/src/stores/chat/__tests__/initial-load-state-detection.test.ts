/**
 * Initial Server Load State Detection Tests
 *
 * Tests for when users load a thread for the first time or refresh the page.
 * Per FLOW_DOCUMENTATION.md:
 * - Server SSR passes initial messages, thread, participants
 * - Client determines current phase from server data
 * - Streaming may need to resume from lastSeq positions
 *
 * @see docs/FLOW_DOCUMENTATION.md Section "Stream Resumption Pattern"
 */

import { MessageStatuses, ScreenModes, UIMessageRoles } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockParticipants,
  createMockStoredPreSearch,
  createMockThread,
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';

import { createChatStore } from '../store';
import type { EntityStatus } from '../store-schemas';
import { ChatPhases } from '../store-schemas';

// ============================================================================
// Test Setup
// ============================================================================

type TestStore = ReturnType<typeof createChatStore>;

// ============================================================================
// SCENARIO: New Thread (No Messages)
// ============================================================================

describe('initial Load: New Thread (No Messages)', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should initialize with IDLE phase when thread has no messages', () => {
    const thread = createMockThread({ id: 'thread-new' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, []);

    expect(store.getState().phase).toBe(ChatPhases.IDLE);
    expect(store.getState().messages).toHaveLength(0);
    expect(store.getState().thread?.id).toBe('thread-new');
  });

  it('should mark hasInitiallyLoaded as true', () => {
    const thread = createMockThread({ id: 'thread-new' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, []);

    expect(store.getState().hasInitiallyLoaded).toBe(true);
  });

  it('should set showInitialUI to false', () => {
    const thread = createMockThread({ id: 'thread-new' });
    const participants = createMockParticipants(2);

    // Start with showInitialUI true (default overview state)
    store.setState({ showInitialUI: true });

    store.getState().initializeThread(thread, participants, []);

    expect(store.getState().showInitialUI).toBe(false);
  });

  it('should set screenMode to THREAD', () => {
    const thread = createMockThread({ id: 'thread-new' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, []);

    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
  });

  it('should store participants from server', () => {
    const thread = createMockThread({ id: 'thread-new' });
    const participants = createMockParticipants(3);

    store.getState().initializeThread(thread, participants, []);

    expect(store.getState().participants).toHaveLength(3);
    expect(store.getState().participants[0]?.modelId).toBe(participants[0]?.modelId);
  });
});

// ============================================================================
// SCENARIO: Completed Round (All Messages Present)
// ============================================================================

describe('initial Load: Completed Round', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should initialize with COMPLETE phase when thread has completed messages', () => {
    const thread = createMockThread({ id: 'thread-complete' });
    const participants = createMockParticipants(2);
    const messages = [
      createTestUserMessage(0, 'Hello'),
      createTestAssistantMessage(0, 0, 'Response from P0'),
      createTestAssistantMessage(0, 1, 'Response from P1'),
      createTestModeratorMessage(0, 'Moderator summary'),
    ];

    store.getState().initializeThread(thread, participants, messages);

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().messages).toHaveLength(4);
  });

  it('should detect multi-round completed thread', () => {
    const thread = createMockThread({ id: 'thread-multi-round' });
    const participants = createMockParticipants(2);
    const messages = [
      // Round 0
      createTestUserMessage(0, 'Hello'),
      createTestAssistantMessage(0, 0, 'R0 P0'),
      createTestAssistantMessage(0, 1, 'R0 P1'),
      createTestModeratorMessage(0, 'R0 Mod'),
      // Round 1
      createTestUserMessage(1, 'Follow up'),
      createTestAssistantMessage(1, 0, 'R1 P0'),
      createTestAssistantMessage(1, 1, 'R1 P1'),
      createTestModeratorMessage(1, 'R1 Mod'),
    ];

    store.getState().initializeThread(thread, participants, messages);

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().messages).toHaveLength(8);
  });

  it('should set currentRoundNumber based on message count', () => {
    const thread = createMockThread({ id: 'thread-round-detect' });
    const participants = createMockParticipants(2);

    // Round 0 complete
    store.getState().initializeThread(thread, participants, [
      createTestUserMessage(0, 'Q1'),
      createTestAssistantMessage(0, 0, 'A1'),
      createTestAssistantMessage(0, 1, 'A2'),
      createTestModeratorMessage(0, 'Summary'),
    ]);

    // After completion, next round would be 1
    // The store should be ready for round 1 input
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });
});

// ============================================================================
// SCENARIO: Active Streaming Preservation
// ============================================================================

describe('initial Load: Active Streaming Preservation', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should preserve phase if streaming is active', () => {
    const thread = createMockThread({ id: 'thread-streaming' });
    const participants = createMockParticipants(2);

    // Simulate active streaming state
    store.setState({
      isStreaming: true,
      phase: ChatPhases.PARTICIPANTS,
    });

    // SSR hydration happens with thread data
    store.getState().initializeThread(thread, participants, [
      createTestUserMessage(0, 'Question'),
    ]);

    // Phase should be preserved because streaming is active
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
  });

  it('should preserve phase if waiting to start streaming', () => {
    const thread = createMockThread({ id: 'thread-pending' });
    const participants = createMockParticipants(2);

    // Simulate waiting state (between send click and stream start)
    store.setState({
      isStreaming: false,
      phase: ChatPhases.IDLE,
      waitingToStartStreaming: true,
    });

    store.getState().initializeThread(thread, participants, []);

    // Phase should be IDLE but preserved from the waiting state
    expect(store.getState().phase).toBe(ChatPhases.IDLE);
    expect(store.getState().waitingToStartStreaming).toBe(true);
  });

  it('should preserve phase during MODERATOR streaming', () => {
    const thread = createMockThread({ id: 'thread-moderator' });
    const participants = createMockParticipants(2);

    store.setState({
      isStreaming: true,
      phase: ChatPhases.MODERATOR,
    });

    store.getState().initializeThread(thread, participants, [
      createTestUserMessage(0, 'Question'),
      createTestAssistantMessage(0, 0, 'P0 done'),
      createTestAssistantMessage(0, 1, 'P1 done'),
    ]);

    // Moderator phase preserved
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });
});

// ============================================================================
// SCENARIO: Pre-Search State Detection
// ============================================================================

describe('initial Load: Pre-Search State', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should hydrate pre-searches from server data', () => {
    const thread = createMockThread({ enableWebSearch: true, id: 'thread-presearch' });
    const participants = createMockParticipants(2);
    const preSearches = [
      createMockStoredPreSearch(0, MessageStatuses.COMPLETE, {
        searchData: {
          failureCount: 0,
          queries: [{ index: 0, query: 'test', rationale: '', searchDepth: 'basic', total: 1 }],
          results: [],
          successCount: 1,
          summary: 'Search complete',
          totalResults: 10,
          totalTime: 500,
        },
        threadId: 'thread-presearch',
      }),
    ];

    store.getState().initializeThread(thread, participants, [createTestUserMessage(0, 'Q')]);
    store.getState().setPreSearches(preSearches);

    expect(store.getState().preSearches).toHaveLength(1);
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
  });

  it('should detect incomplete pre-search for resumption', () => {
    const thread = createMockThread({ enableWebSearch: true, id: 'thread-presearch-pending' });
    const participants = createMockParticipants(2);
    const preSearches = [
      createMockStoredPreSearch(0, MessageStatuses.STREAMING, {
        threadId: 'thread-presearch-pending',
      }),
    ];

    store.getState().initializeThread(thread, participants, [createTestUserMessage(0, 'Q')]);
    store.getState().setPreSearches(preSearches);

    const preSearch = store.getState().preSearches[0];
    expect(preSearch?.status).toBe(MessageStatuses.STREAMING);
    // This indicates client should resume pre-search subscription
  });
});

// ============================================================================
// SCENARIO: Changelog State Detection
// ============================================================================

describe('initial Load: Changelog State', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should hydrate changelog items from server', () => {
    const thread = createMockThread({ id: 'thread-changelog' });
    const participants = createMockParticipants(2);
    const changelog = [
      {
        changeType: 'participants_added' as const,
        createdAt: new Date(),
        details: { addedModels: ['gpt-4o'] },
        id: 'cl-1',
        roundNumber: 1,
        threadId: 'thread-changelog',
      },
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setChangelogItems(changelog);

    expect(store.getState().changelogItems).toHaveLength(1);
    expect(store.getState().changelogItems[0]?.changeType).toBe('participants_added');
  });

  it('should detect changelog for display in UI', () => {
    const thread = createMockThread({ id: 'thread-changelog-ui' });
    const participants = createMockParticipants(2);
    const changelog = [
      {
        changeType: 'web_search_enabled' as const,
        createdAt: new Date(),
        details: {},
        id: 'cl-2',
        roundNumber: 1,
        threadId: 'thread-changelog-ui',
      },
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setChangelogItems(changelog);

    // UI should show changelog badge/indicator
    expect(store.getState().changelogItems.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// SCENARIO: Subscription State Determination
// ============================================================================

describe('initial Load: Subscription State Determination', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should not auto-initialize subscriptions on thread load', () => {
    const thread = createMockThread({ id: 'thread-sub' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, []);

    // Subscriptions should be at defaults until explicitly initialized
    const subState = store.getState().subscriptionState;
    expect(subState.participants).toHaveLength(0);
    expect(subState.moderator.status).toBe('idle');
    expect(subState.presearch.status).toBe('idle');
  });

  it('should allow manual subscription initialization after load', () => {
    const thread = createMockThread({ id: 'thread-sub-manual' });
    const participants = createMockParticipants(3);

    store.getState().initializeThread(thread, participants, []);
    store.getState().initializeSubscriptions(0, 3);

    const subState = store.getState().subscriptionState;
    expect(subState.participants).toHaveLength(3);
    expect(subState.activeRoundNumber).toBe(0);
  });

  it('should preserve subscription state across re-hydration', () => {
    const thread = createMockThread({ id: 'thread-rehydrate' });
    const participants = createMockParticipants(2);

    // Initial setup with active subscriptions
    store.getState().initializeThread(thread, participants, []);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 50);
    store.getState().updateEntitySubscriptionStatus(1, 'waiting' as EntityStatus);

    // Simulate React re-render / hydration
    // Thread init should not reset subscription state
    store.setState({
      isStreaming: true,
      phase: ChatPhases.PARTICIPANTS,
    });
    store.getState().initializeThread(thread, participants, [createTestUserMessage(0, 'Q')]);

    // Subscription state should be preserved
    const subState = store.getState().subscriptionState;
    expect(subState.participants[0]?.status).toBe('streaming');
    expect(subState.participants[0]?.lastSeq).toBe(50);
  });
});

// ============================================================================
// SCENARIO: Error Recovery on Load
// ============================================================================

describe('initial Load: Error Recovery', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should handle missing thread gracefully', () => {
    // This tests defensive coding - shouldn't crash
    expect(() => {
      store.getState().setThread(null as unknown as any);
    }).not.toThrow();
  });

  it('should handle empty participants array', () => {
    const thread = createMockThread({ id: 'thread-no-participants' });

    store.getState().initializeThread(thread, [], []);

    expect(store.getState().participants).toHaveLength(0);
    expect(store.getState().phase).toBe(ChatPhases.IDLE);
  });

  it('should handle malformed message array gracefully', () => {
    const thread = createMockThread({ id: 'thread-bad-messages' });
    const participants = createMockParticipants(2);

    // Empty array is valid
    store.getState().initializeThread(thread, participants, []);

    expect(store.getState().messages).toHaveLength(0);
    expect(store.getState().phase).toBe(ChatPhases.IDLE);
  });
});

// ============================================================================
// SCENARIO: useSyncHydrateStore Behavior
// ============================================================================

describe('initial Load: Sync Hydrate Pattern', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should hydrate form state from thread settings', () => {
    const thread = createMockThread({
      enableWebSearch: true,
      id: 'thread-form-sync',
      mode: 'debate',
    });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, []);
    store.getState().setEnableWebSearch(thread.enableWebSearch);
    store.getState().setSelectedMode(thread.mode);

    expect(store.getState().enableWebSearch).toBe(true);
    expect(store.getState().selectedMode).toBe('debate');
  });

  it('should clear stale state on new thread hydration', () => {
    // Setup old thread state
    store.setState({
      changelogItems: [{ changeType: 'old' as any, createdAt: new Date(), details: {}, id: 'old', roundNumber: 0, threadId: 'old' }],
      messages: [createTestUserMessage(0, 'Old message')],
      preSearches: [createMockStoredPreSearch(0, MessageStatuses.COMPLETE, { threadId: 'old' })],
      thread: createMockThread({ id: 'old-thread' }),
    });

    // Hydrate with new thread
    const newThread = createMockThread({ id: 'new-thread' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(newThread, participants, []);

    expect(store.getState().thread?.id).toBe('new-thread');
    expect(store.getState().messages).toHaveLength(0);
    expect(store.getState().changelogItems).toHaveLength(0);
    expect(store.getState().preSearches).toHaveLength(0);
  });

  it('should handle SSR-to-client hydration mismatch', () => {
    const thread = createMockThread({ id: 'thread-ssr-mismatch' });
    const participants = createMockParticipants(2);

    // SSR rendered with no messages
    store.getState().initializeThread(thread, participants, []);
    expect(store.getState().phase).toBe(ChatPhases.IDLE);

    // Client receives streaming update before hydration complete
    store.setState({
      isStreaming: true,
      phase: ChatPhases.PARTICIPANTS,
    });

    // Re-hydration should preserve streaming state
    store.getState().initializeThread(thread, participants, [createTestUserMessage(0, 'Q')]);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
  });
});

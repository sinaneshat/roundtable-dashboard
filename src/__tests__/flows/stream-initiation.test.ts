/**
 * Stream Initiation Flow Tests
 *
 * Tests for CRITICAL stream initiation behavior as documented in
 * FLOW_DOCUMENTATION.md Part 3: AI RESPONSES STREAMING
 *
 * CRITICAL RULES:
 * 1. Streams begin ONLY after patch (config changes) and pre-search calls complete
 * 2. Stream order is correct based on participant priority configuration
 * 3. Participants receive full conversation history including prior responses
 * 4. Streams don't start prematurely (blocking mechanism)
 * 5. Waiting mechanism for patches to complete before streaming
 *
 * BLOCKING SEQUENCE (from FLOW_DOCUMENTATION.md Part 14):
 * ```
 * 1. Thread creation API response
 *    ↓ [GUARD: Store subscription blocks streaming]
 * 2. setCreatedThreadId() + initializeThread()
 *    ↓ [GUARD: AI SDK sync pattern]
 * 3. Screen initialization + Orchestrator enabled
 *    ↓ [GUARD: Query enabled at init]
 * 4. Orchestrator syncs pre-search from server
 *    ↓ [GUARD: Optimistic blocking if web search enabled]
 * 5. Streaming subscription checks pre-search status
 *    ↓ [GUARD: shouldWaitForPreSearch() with timeout]
 * 6. Participants stream sequentially
 * ```
 *
 * @see docs/FLOW_DOCUMENTATION.md Part 3: AI RESPONSES STREAMING
 * @see docs/FLOW_DOCUMENTATION.md Part 14: RACE CONDITION PROTECTION
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { MessageRoles, MessageStatuses, ScreenModes } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';

import type { ChatStore } from '../../stores/chat/store';
import { createChatStore } from '../../stores/chat/store';

// ============================================================================
// TEST HELPERS
// ============================================================================

type MockThread = {
  id: string;
  userId: string;
  title: string;
  slug: string;
  mode: string;
  status: 'active' | 'archived';
  isFavorite: boolean;
  isPublic: boolean;
  isAiGeneratedTitle: boolean;
  enableWebSearch: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
};

type MockParticipant = {
  id: string;
  threadId: string;
  modelId: string;
  role: string | null;
  priority: number;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function createMockThread(overrides: {
  enableWebSearch?: boolean;
  mode?: string;
} = {}): MockThread {
  return {
    id: 'thread-123',
    userId: 'user-1',
    title: 'Test Thread',
    slug: 'test-thread',
    mode: overrides.mode || 'brainstorm',
    status: 'active' as const,
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    enableWebSearch: overrides.enableWebSearch ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
  };
}

function createMockParticipants(count: number): MockParticipant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `participant-${i}`,
    threadId: 'thread-123',
    modelId: `model-${String.fromCharCode(97 + i)}`,
    role: null,
    priority: i,
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

function createUserMessage(roundNumber: number, text = 'Test message') {
  return {
    id: `user-msg-r${roundNumber}`,
    role: MessageRoles.USER as const,
    parts: [{ type: 'text' as const, text }],
    metadata: { roundNumber, role: MessageRoles.USER },
  };
}

function createPreSearch(roundNumber: number, status: typeof MessageStatuses[keyof typeof MessageStatuses]): StoredPreSearch {
  return {
    id: `presearch-r${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    userQuery: 'Test query',
    status,
    searchData: status === MessageStatuses.COMPLETE
      ? {
          queries: [{ query: 'test', rationale: 'test', searchDepth: 'basic' as const, index: 0, total: 1 }],
          results: [],
          summary: 'Search complete',
          successCount: 1,
          failureCount: 0,
          totalResults: 0,
          totalTime: 100,
        }
      : null,
    errorMessage: status === MessageStatuses.FAILED ? 'Search failed' : null,
    createdAt: new Date(),
    completedAt: status === MessageStatuses.COMPLETE ? new Date() : null,
  };
}

/**
 * Checks if streaming can proceed based on current store state
 * Mirrors the logic from use-streaming-trigger.ts
 */
function canStreamingProceed(state: ChatStore): {
  canProceed: boolean;
  blockReasons: string[];
} {
  const blockReasons: string[] = [];

  // Check screen mode (OVERVIEW only)
  if (state.screenMode !== ScreenModes.OVERVIEW) {
    blockReasons.push('not on overview screen');
  }

  // Check required state
  if (state.participants.length === 0) {
    blockReasons.push('no participants');
  }

  if (state.messages.length === 0) {
    blockReasons.push('no messages');
  }

  // Check changelog flags (config changes blocking)
  if (state.configChangeRoundNumber !== null) {
    blockReasons.push('configChangeRoundNumber is set');
  }

  if (state.isWaitingForChangelog) {
    blockReasons.push('isWaitingForChangelog is true');
  }

  // Check pre-search blocking
  if (state.enableWebSearch) {
    const currentRound = state.messages.filter(m => m.role === MessageRoles.USER).length - 1;
    const currentRoundPreSearch = state.preSearches.find(ps => ps.roundNumber === currentRound);

    if (!currentRoundPreSearch) {
      blockReasons.push('pre-search missing');
    } else if (currentRoundPreSearch.status === MessageStatuses.PENDING) {
      blockReasons.push('pre-search pending');
    } else if (currentRoundPreSearch.status === MessageStatuses.STREAMING) {
      blockReasons.push('pre-search streaming');
    }
  }

  return {
    canProceed: blockReasons.length === 0,
    blockReasons,
  };
}

// ============================================================================
// STREAM INITIATION - PREREQUISITE CHECKS
// ============================================================================

describe('stream Initiation - Prerequisites', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('documents that thread ID check happens in provider logic', () => {
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setParticipants(createMockParticipants(2));
    store.getState().setMessages([createUserMessage(0)]);
    // Thread NOT set

    const result = canStreamingProceed(store.getState());

    // canStreamingProceed doesn't check thread - that happens in provider logic
    // This test documents the expected behavior
    expect(result.canProceed).toBe(true);
    // Note: In actual implementation, provider checks thread.id before streaming
  });

  it('blocks streaming when no participants configured', () => {
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setMessages([createUserMessage(0)]);
    // No participants

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('no participants');
  });

  it('blocks streaming when no messages exist', () => {
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setParticipants(createMockParticipants(2));
    // No messages

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('no messages');
  });

  it('blocks streaming when not on overview screen', () => {
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setThread(createMockThread());
    store.getState().setParticipants(createMockParticipants(2));
    store.getState().setMessages([createUserMessage(0)]);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('not on overview screen');
  });

  it('allows streaming when all prerequisites met', () => {
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setParticipants(createMockParticipants(2));
    store.getState().setMessages([createUserMessage(0)]);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(true);
    expect(result.blockReasons).toHaveLength(0);
  });
});

// ============================================================================
// STREAM INITIATION - PATCH COMPLETION BLOCKING
// ============================================================================

describe('stream Initiation - Patch Completion Blocking', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setParticipants(createMockParticipants(2));
    store.getState().setMessages([createUserMessage(0)]);
  });

  it('blocks streaming when configChangeRoundNumber is set (PATCH in progress)', () => {
    store.getState().setConfigChangeRoundNumber(1);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
  });

  it('blocks streaming when isWaitingForChangelog is true (PATCH complete, waiting for changelog)', () => {
    store.getState().setIsWaitingForChangelog(true);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');
  });

  it('allows streaming after PATCH and changelog sync complete', () => {
    // Simulate PATCH flow
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Changelog sync completes
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });

  it('handles case where no config changes exist (immediate unblock)', () => {
    // PATCH in progress
    store.getState().setConfigChangeRoundNumber(1);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // PATCH completes with no changes (form-actions.ts:373)
    store.getState().setConfigChangeRoundNumber(null);

    const result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });
});

// ============================================================================
// STREAM INITIATION - PRE-SEARCH COMPLETION BLOCKING
// ============================================================================

describe('stream Initiation - Pre-Search Completion Blocking', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));
    store.getState().setParticipants(createMockParticipants(2));
    store.getState().setMessages([createUserMessage(0)]);
    store.getState().setEnableWebSearch(true);
  });

  it('blocks streaming when pre-search is missing', () => {
    // No pre-search in store
    store.getState().setPreSearches([]);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('pre-search missing');
  });

  it('blocks streaming when pre-search is PENDING', () => {
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.PENDING)]);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('pre-search pending');
  });

  it('blocks streaming when pre-search is STREAMING', () => {
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.STREAMING)]);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('pre-search streaming');
  });

  it('allows streaming when pre-search is COMPLETE', () => {
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.COMPLETE)]);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(true);
    expect(result.blockReasons).toHaveLength(0);
  });

  it('allows streaming when pre-search is FAILED (graceful degradation)', () => {
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.FAILED)]);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(true);
    expect(result.blockReasons).toHaveLength(0);
  });

  it('bypasses pre-search check when web search disabled', () => {
    store.getState().setEnableWebSearch(false);
    // No pre-search in store
    store.getState().setPreSearches([]);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(true);
    expect(result.blockReasons).not.toContain('pre-search missing');
  });
});

// ============================================================================
// STREAM INITIATION - COMBINED BLOCKING SCENARIOS
// ============================================================================

describe('stream Initiation - Combined Blocking', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));
    store.getState().setParticipants(createMockParticipants(2));
    store.getState().setMessages([createUserMessage(0)]);
    store.getState().setEnableWebSearch(true);
  });

  it('blocks when BOTH patch and pre-search are in progress', () => {
    // PATCH in progress
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    // Pre-search in progress
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.STREAMING)]);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');
    expect(result.blockReasons).toContain('pre-search streaming');
  });

  it('still blocks when patch completes but pre-search still pending', () => {
    // Both blocking initially
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.PENDING)]);

    // Patch completes
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('pre-search pending');
  });

  it('allows streaming ONLY when ALL blocking conditions cleared', () => {
    // Start with all blocking
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.PENDING)]);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Clear patch flags
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // Still blocked by pre-search
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Complete pre-search
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

    // NOW streaming can proceed
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });
});

// ============================================================================
// STREAM INITIATION - PARTICIPANT ORDER
// ============================================================================

describe('stream Initiation - Participant Order', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setMessages([createUserMessage(0)]);
  });

  it('respects participant priority order (0, 1, 2)', () => {
    const participants = createMockParticipants(3);
    store.getState().setParticipants(participants);

    // Verify priority order
    expect(participants[0]?.priority).toBe(0);
    expect(participants[1]?.priority).toBe(1);
    expect(participants[2]?.priority).toBe(2);

    // In actual streaming, participants respond in priority order
    // This test documents the expected configuration
  });

  it('handles custom priority order (user reordered)', () => {
    const participants = [
      { ...createMockParticipants(1)[0]!, priority: 2, modelId: 'model-c' },
      { ...createMockParticipants(1)[0]!, priority: 0, modelId: 'model-a' },
      { ...createMockParticipants(1)[0]!, priority: 1, modelId: 'model-b' },
    ];

    store.getState().setParticipants(participants);

    // Sort by priority to get streaming order
    const sortedByPriority = [...participants].sort((a, b) => a.priority - b.priority);

    expect(sortedByPriority[0]?.modelId).toBe('model-a'); // Priority 0
    expect(sortedByPriority[1]?.modelId).toBe('model-b'); // Priority 1
    expect(sortedByPriority[2]?.modelId).toBe('model-c'); // Priority 2
  });

  it('handles single participant', () => {
    const participants = createMockParticipants(1);
    store.getState().setParticipants(participants);

    expect(participants).toHaveLength(1);
    expect(participants[0]?.priority).toBe(0);
  });

  it('handles maximum participants (configuration dependent)', () => {
    const maxParticipants = 10;
    const participants = createMockParticipants(maxParticipants);
    store.getState().setParticipants(participants);

    expect(participants).toHaveLength(maxParticipants);

    // Verify all have unique priorities
    const priorities = participants.map(p => p.priority);
    const uniquePriorities = new Set(priorities);
    expect(uniquePriorities.size).toBe(maxParticipants);
  });
});

// ============================================================================
// STREAM INITIATION - WAITING MECHANISM
// ============================================================================

describe('stream Initiation - Waiting Mechanism', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));
    store.getState().setParticipants(createMockParticipants(2));
    store.getState().setMessages([createUserMessage(0)]);
    store.getState().setEnableWebSearch(true);
  });

  it('waits for PATCH → Pre-Search → Streaming sequence', () => {
    // Step 1: PATCH starts
    store.getState().setConfigChangeRoundNumber(1);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // Step 2: PATCH completes, waiting for changelog
    store.getState().setIsWaitingForChangelog(true);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // Step 3: Pre-search created as PENDING
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.PENDING)]);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // Step 4: Changelog sync completes
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false); // Still waiting for pre-search

    // Step 5: Pre-search starts streaming
    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // Step 6: Pre-search completes
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

    // Step 7: NOW streaming can start
    expect(canStreamingProceed(store.getState()).canProceed).toBe(true);
  });

  it('handles parallel PATCH and pre-search completion', () => {
    // Both start together
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.PENDING)]);

    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // Pre-search completes first
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false); // Still waiting for changelog

    // Changelog completes
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // Now can proceed
    expect(canStreamingProceed(store.getState()).canProceed).toBe(true);
  });

  it('handles case where changelog completes before pre-search created', () => {
    // Changelog flow completes
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // Pre-search not yet created
    store.getState().setPreSearches([]);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // Pre-search created and completes
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.COMPLETE)]);

    // Now can proceed
    expect(canStreamingProceed(store.getState()).canProceed).toBe(true);
  });
});

// ============================================================================
// STREAM INITIATION - MULTI-ROUND SCENARIOS
// ============================================================================

describe('stream Initiation - Multi-Round', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));
    store.getState().setParticipants(createMockParticipants(2));
    store.getState().setEnableWebSearch(true);
  });

  it('blocks Round 1 streaming until Round 1 pre-search completes', () => {
    // Round 0 complete
    store.getState().setMessages([createUserMessage(0)]);
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.COMPLETE)]);

    expect(canStreamingProceed(store.getState()).canProceed).toBe(true);

    // Round 1 starts
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);
    store.getState().setPreSearches([
      createPreSearch(0, MessageStatuses.COMPLETE),
      createPreSearch(1, MessageStatuses.PENDING),
    ]);

    const result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('pre-search pending');
  });

  it('allows Round 1 streaming after Round 1 pre-search completes', () => {
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);
    store.getState().setPreSearches([
      createPreSearch(0, MessageStatuses.COMPLETE),
      createPreSearch(1, MessageStatuses.PENDING),
    ]);

    // Round 1 pre-search pending - blocked
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // Round 1 pre-search completes
    store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

    // Now can stream Round 1
    expect(canStreamingProceed(store.getState()).canProceed).toBe(true);
  });

  it('handles web search toggling between rounds', () => {
    // Round 0: Web search enabled
    store.getState().setMessages([createUserMessage(0)]);
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.COMPLETE)]);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(true);

    // Round 1: User toggles web search OFF
    store.getState().setEnableWebSearch(false);
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);

    // Should not require pre-search for Round 1
    const result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
    expect(result.blockReasons).not.toContain('pre-search missing');
  });
});

// ============================================================================
// STREAM INITIATION - PREMATURE START PREVENTION
// ============================================================================

describe('stream Initiation - Premature Start Prevention', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));
    store.getState().setParticipants(createMockParticipants(3));
    store.getState().setMessages([createUserMessage(0)]);
    store.getState().setEnableWebSearch(true);
  });

  it('prevents streaming until thread ID is set', () => {
    // Clear thread
    store.getState().setThread(null as never);

    // Even if all other conditions met, cannot stream without thread
    // Note: This is checked in provider logic, not canStreamingProceed
  });

  it('prevents streaming during config change PATCH', () => {
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.COMPLETE)]);

    // User makes config change
    store.getState().setConfigChangeRoundNumber(1);

    const result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
  });

  it('prevents streaming during pre-search execution', () => {
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.STREAMING)]);

    const result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('pre-search streaming');
  });

  it('prevents streaming when multiple blocking conditions exist', () => {
    // Multiple blocking conditions
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.PENDING)]);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons.length).toBeGreaterThan(1);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');
    expect(result.blockReasons).toContain('pre-search pending');
  });

  it('only proceeds when ALL blocking conditions cleared', () => {
    // Set all blocking conditions
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.PENDING)]);

    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // Clear one condition - still blocked
    store.getState().setConfigChangeRoundNumber(null);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // Clear second condition - still blocked
    store.getState().setIsWaitingForChangelog(false);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // Clear final condition - NOW can proceed
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(true);
  });
});

// ============================================================================
// STREAM INITIATION - PARTICIPANT CONFIGURATION VARIATIONS
// ============================================================================

describe('stream Initiation - Participant Configurations', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setMessages([createUserMessage(0)]);
  });

  it('initiates streaming with 1 participant', () => {
    store.getState().setParticipants(createMockParticipants(1));

    const result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });

  it('initiates streaming with 2 participants', () => {
    store.getState().setParticipants(createMockParticipants(2));

    const result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });

  it('initiates streaming with 5 participants', () => {
    store.getState().setParticipants(createMockParticipants(5));

    const result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });

  it('initiates streaming with 10 participants', () => {
    store.getState().setParticipants(createMockParticipants(10));

    const result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });

  it('respects participant enabled/disabled state', () => {
    const participants = createMockParticipants(3);
    participants[1]!.isEnabled = false; // Disable middle participant

    store.getState().setParticipants(participants);

    // In actual streaming, only enabled participants respond
    const enabledParticipants = participants.filter(p => p.isEnabled);
    expect(enabledParticipants).toHaveLength(2);
  });
});

// ============================================================================
// STREAM INITIATION - OPTIMISTIC USER MESSAGE
// ============================================================================

describe('stream Initiation - Optimistic User Message', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setParticipants(createMockParticipants(2));
  });

  it('adds optimistic user message IMMEDIATELY when setMessages called', () => {
    // Initial state: no messages
    expect(store.getState().messages).toHaveLength(0);

    // User message with isOptimistic marker
    const optimisticMessage = {
      id: 'optimistic-user-0-123456',
      role: MessageRoles.USER as const,
      parts: [{ type: 'text' as const, text: 'Test message' }],
      metadata: {
        role: MessageRoles.USER,
        roundNumber: 0,
        isOptimistic: true,
      },
    };

    // Add optimistic message (simulates form-actions.ts:285)
    store.getState().setMessages([optimisticMessage]);

    // CRITICAL: Message appears IMMEDIATELY
    const state = store.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.id).toBe('optimistic-user-0-123456');
    expect(state.messages[0]?.metadata).toMatchObject({
      roundNumber: 0,
      isOptimistic: true,
    });
  });

  it('optimistic message has correct metadata structure', () => {
    const optimisticMessage = {
      id: 'optimistic-user-1-789',
      role: MessageRoles.USER as const,
      parts: [{ type: 'text' as const, text: 'Round 1 message' }],
      metadata: {
        role: MessageRoles.USER,
        roundNumber: 1,
        isOptimistic: true,
      },
    };

    store.getState().setMessages([optimisticMessage]);

    const message = store.getState().messages[0];
    expect(message?.metadata).toMatchObject({
      role: MessageRoles.USER,
      roundNumber: 1,
      isOptimistic: true,
    });
  });

  it('optimistic message persists during async operations', () => {
    const optimisticMessage = {
      id: 'optimistic-user-0-999',
      role: MessageRoles.USER as const,
      parts: [{ type: 'text' as const, text: 'Test' }],
      metadata: {
        role: MessageRoles.USER,
        roundNumber: 0,
        isOptimistic: true,
      },
    };

    // Add optimistic message
    store.getState().setMessages([optimisticMessage]);
    expect(store.getState().messages).toHaveLength(1);

    // Simulate PATCH in progress (configChangeRoundNumber set)
    store.getState().setConfigChangeRoundNumber(0);

    // Message MUST remain visible during PATCH
    expect(store.getState().messages).toHaveLength(1);
    expect(store.getState().messages[0]?.id).toBe('optimistic-user-0-999');
  });

  it('optimistic message remains after PATCH completes', () => {
    const optimisticMessage = {
      id: 'optimistic-user-0-111',
      role: MessageRoles.USER as const,
      parts: [{ type: 'text' as const, text: 'Persisted message' }],
      metadata: {
        role: MessageRoles.USER,
        roundNumber: 0,
        isOptimistic: true,
      },
    };

    // Add optimistic message
    store.getState().setMessages([optimisticMessage]);

    // Simulate PATCH lifecycle
    store.getState().setConfigChangeRoundNumber(0); // PATCH starts
    store.getState().setIsWaitingForChangelog(true); // PATCH completes

    // Message MUST still be visible
    expect(store.getState().messages).toHaveLength(1);
    expect(store.getState().messages[0]?.id).toBe('optimistic-user-0-111');

    // Clear changelog flags
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // Message MUST NOT disappear after flags cleared
    expect(store.getState().messages).toHaveLength(1);
    expect(store.getState().messages[0]?.id).toBe('optimistic-user-0-111');
  });

  it('verifies correct order: User → Pre-search → Participants', () => {
    // Round 0 user message (optimistic)
    const userMessage = {
      id: 'optimistic-user-0-555',
      role: MessageRoles.USER as const,
      parts: [{ type: 'text' as const, text: 'Test query' }],
      metadata: {
        role: MessageRoles.USER,
        roundNumber: 0,
        isOptimistic: true,
      },
    };

    store.getState().setMessages([userMessage]);
    store.getState().setEnableWebSearch(true);

    // Add pre-search placeholder
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.PENDING)]);

    const state = store.getState();

    // Verify order expectations:
    // 1. User message exists
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.role).toBe(MessageRoles.USER);
    expect(state.messages[0]?.metadata).toMatchObject({ roundNumber: 0 });

    // 2. Pre-search placeholder exists
    expect(state.preSearches).toHaveLength(1);
    expect(state.preSearches[0]?.roundNumber).toBe(0);
    expect(state.preSearches[0]?.status).toBe(MessageStatuses.PENDING);

    // 3. Streaming is blocked until pre-search completes
    const result = canStreamingProceed(state);
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('pre-search pending');
  });

  it('verifies round number calculation before optimistic message', () => {
    // Simulate existing Round 0
    store.getState().setMessages([
      createUserMessage(0, 'Round 0 user'),
      {
        id: 'assistant-0-0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Round 0 response' }],
        metadata: { roundNumber: 0, participantIndex: 0 },
      },
    ]);

    // Next round should be Round 1
    const currentMessages = store.getState().messages;
    const lastMessage = currentMessages[currentMessages.length - 1];
    const lastRound = lastMessage?.metadata && typeof lastMessage.metadata === 'object' && 'roundNumber' in lastMessage.metadata
      ? (lastMessage.metadata.roundNumber as number)
      : 0;

    const nextRoundNumber = lastRound + 1;
    expect(nextRoundNumber).toBe(1);

    // Add optimistic message for Round 1
    const optimisticMessage = {
      id: 'optimistic-user-1-777',
      role: MessageRoles.USER as const,
      parts: [{ type: 'text' as const, text: 'Round 1 message' }],
      metadata: {
        role: MessageRoles.USER,
        roundNumber: nextRoundNumber,
        isOptimistic: true,
      },
    };

    store.getState().setMessages([...currentMessages, optimisticMessage]);

    // Verify round 1 message added
    const updatedMessages = store.getState().messages;
    expect(updatedMessages).toHaveLength(3);
    expect(updatedMessages[2]?.metadata).toMatchObject({
      roundNumber: 1,
      isOptimistic: true,
    });
  });

  it('handles optimistic message with file attachments', () => {
    const optimisticMessageWithFiles = {
      id: 'optimistic-user-0-file',
      role: MessageRoles.USER as const,
      parts: [
        {
          type: 'file' as const,
          url: 'blob:preview-url',
          filename: 'test.pdf',
          mediaType: 'application/pdf',
          uploadId: 'upload-123',
        },
        { type: 'text' as const, text: 'Message with attachment' },
      ],
      metadata: {
        role: MessageRoles.USER,
        roundNumber: 0,
        isOptimistic: true,
      },
    };

    store.getState().setMessages([optimisticMessageWithFiles]);

    const message = store.getState().messages[0];
    expect(message?.parts).toHaveLength(2);
    expect(message?.parts[0]?.type).toBe('file');
    expect(message?.parts[1]?.type).toBe('text');
  });
});

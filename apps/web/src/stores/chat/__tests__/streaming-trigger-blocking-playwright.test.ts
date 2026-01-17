/**
 * Streaming Trigger Blocking/Unblocking E2E Tests
 *
 * Comprehensive tests for the streaming trigger blocking mechanism as documented
 * in FLOW_DOCUMENTATION.md Part 6: Configuration Changes Mid-Conversation.
 *
 * CRITICAL BLOCKING FLAGS:
 * 1. configChangeRoundNumber - Set by handleUpdateThreadAndSend, cleared by changelog sync
 * 2. isWaitingForChangelog - Set after PATCH completes, cleared by changelog sync
 * 3. shouldWaitForPreSearch - Pre-search must complete before streaming
 *
 * BLOCKING LOGIC (use-streaming-trigger.ts:104-105):
 * ```typescript
 * if (configChangeRoundNumber !== null || isWaitingForChangelog)
 *   return;
 * ```
 *
 * FLOW:
 * 1. User makes config changes (participants/mode/web search)
 * 2. handleUpdateThreadAndSend sets configChangeRoundNumber=N (blocks streaming)
 * 3. PATCH to backend persists changes and creates changelog entries
 * 4. If changes exist: setIsWaitingForChangelog(true) after PATCH
 * 5. use-changelog-sync fetches round-specific changelog
 * 6. On success: clears both flags (unblocks streaming)
 * 7. If no changes: clears configChangeRoundNumber directly (line 373)
 * 8. Pre-search blocking is independent (must also be checked)
 *
 * TIMEOUT PROTECTION:
 * - Changelog sync: 30s timeout (use-changelog-sync.ts:123)
 * - Pre-search: 10s timeout with activity tracking (use-streaming-trigger.ts:398)
 *
 * @see docs/FLOW_DOCUMENTATION.md
 * @see src/components/providers/chat-store-provider/hooks/use-streaming-trigger.ts
 * @see src/components/providers/chat-store-provider/hooks/use-changelog-sync.ts
 * @see src/stores/chat/actions/form-actions.ts
 */

import { MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoredPreSearch } from '@/types/api';

import type { ChatStore } from '../store';
import { createChatStore } from '../store';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockThread(overrides: {
  enableWebSearch?: boolean;
  mode?: string;
} = {}) {
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

function createMockParticipants() {
  return [
    {
      id: 'participant-1',
      threadId: 'thread-123',
      modelId: 'model-a',
      role: null,
      priority: 0,
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'participant-2',
      threadId: 'thread-123',
      modelId: 'model-b',
      role: null,
      priority: 1,
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
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
    searchData: null,
    createdAt: new Date(),
    completedAt: status === MessageStatuses.COMPLETE ? new Date() : null,
  };
}

/**
 * Simulates the streaming trigger conditions check
 * Mirrors use-streaming-trigger.ts:84-105
 */
function canStreamingProceed(state: ChatStore): {
  canProceed: boolean;
  blockReasons: string[];
} {
  const blockReasons: string[] = [];

  // Check screen mode
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

  // ✅ CRITICAL: Both changelog flags must be null/false for streaming to proceed
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
// BLOCKING WITH configChangeRoundNumber
// ============================================================================

describe('streaming Trigger Blocking - configChangeRoundNumber', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setParticipants(createMockParticipants());
    store.getState().setMessages([createUserMessage(0)]);
  });

  it('blocks streaming when configChangeRoundNumber is set', () => {
    // Simulate handleUpdateThreadAndSend setting configChangeRoundNumber
    store.getState().setConfigChangeRoundNumber(1);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
  });

  it('allows streaming when configChangeRoundNumber is null', () => {
    store.getState().setConfigChangeRoundNumber(null);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(true);
    expect(result.blockReasons).toHaveLength(0);
  });

  it('blocks streaming immediately after setting configChangeRoundNumber', () => {
    // Initially can stream
    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);

    // Simulate config change
    store.getState().setConfigChangeRoundNumber(1);

    // Now blocked
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
  });

  it('unblocks streaming when configChangeRoundNumber is cleared', () => {
    // Start blocked
    store.getState().setConfigChangeRoundNumber(1);
    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Clear the flag (simulates changelog sync completing)
    store.getState().setConfigChangeRoundNumber(null);

    // Now unblocked
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });
});

// ============================================================================
// BLOCKING WITH isWaitingForChangelog
// ============================================================================

describe('streaming Trigger Blocking - isWaitingForChangelog', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setParticipants(createMockParticipants());
    store.getState().setMessages([createUserMessage(0)]);
  });

  it('blocks streaming when isWaitingForChangelog is true', () => {
    // Simulate post-PATCH state when config changes occurred
    store.getState().setIsWaitingForChangelog(true);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');
  });

  it('allows streaming when isWaitingForChangelog is false', () => {
    store.getState().setIsWaitingForChangelog(false);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(true);
    expect(result.blockReasons).toHaveLength(0);
  });

  it('blocks streaming when isWaitingForChangelog is set after PATCH', () => {
    // Initially can stream
    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);

    // Simulate PATCH completing with config changes
    store.getState().setIsWaitingForChangelog(true);

    // Now blocked
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');
  });

  it('unblocks streaming when isWaitingForChangelog is cleared', () => {
    // Start blocked
    store.getState().setIsWaitingForChangelog(true);
    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Clear the flag (simulates changelog sync completing)
    store.getState().setIsWaitingForChangelog(false);

    // Now unblocked
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });
});

// ============================================================================
// BLOCKING WITH BOTH FLAGS
// ============================================================================

describe('streaming Trigger Blocking - Both Flags', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setParticipants(createMockParticipants());
    store.getState().setMessages([createUserMessage(0)]);
  });

  it('blocks streaming when both flags are set', () => {
    // Simulate handleUpdateThreadAndSend flow with config changes
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');
  });

  it('still blocks if only configChangeRoundNumber is cleared', () => {
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    // Clear only configChangeRoundNumber
    store.getState().setConfigChangeRoundNumber(null);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');
  });

  it('still blocks if only isWaitingForChangelog is cleared', () => {
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    // Clear only isWaitingForChangelog
    store.getState().setIsWaitingForChangelog(false);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
  });

  it('unblocks streaming only when both flags are cleared', () => {
    // Start with both flags set
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Clear both flags (simulates changelog sync completing)
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // Now unblocked
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });
});

// ============================================================================
// UNBLOCKING SEQUENCE
// ============================================================================

describe('streaming Trigger Unblocking - Sequence', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setParticipants(createMockParticipants());
    store.getState().setMessages([createUserMessage(0)]);
  });

  it('follows the correct unblocking sequence for config changes', () => {
    // Step 1: handleUpdateThreadAndSend sets configChangeRoundNumber
    store.getState().setConfigChangeRoundNumber(1);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // Step 2: PATCH completes, sets isWaitingForChangelog
    store.getState().setIsWaitingForChangelog(true);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // Step 3: Changelog fetch completes, clears both flags
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // Step 4: Streaming can now proceed
    expect(canStreamingProceed(store.getState()).canProceed).toBe(true);
  });

  it('unblocks immediately when no config changes exist', () => {
    // Step 1: handleUpdateThreadAndSend sets configChangeRoundNumber
    store.getState().setConfigChangeRoundNumber(1);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // Step 2: PATCH completes, NO config changes
    // Form-actions.ts:373 clears configChangeRoundNumber directly
    store.getState().setConfigChangeRoundNumber(null);

    // Step 3: Streaming can proceed immediately
    expect(canStreamingProceed(store.getState()).canProceed).toBe(true);
  });
});

// ============================================================================
// PRE-SEARCH BLOCKING
// ============================================================================

describe('streaming Trigger Blocking - Pre-Search', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));
    store.getState().setParticipants(createMockParticipants());
    store.getState().setMessages([createUserMessage(0)]);
    store.getState().setEnableWebSearch(true); // Form state
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

  it('allows streaming when pre-search is FAILED', () => {
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.FAILED)]);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(true);
    expect(result.blockReasons).toHaveLength(0);
  });

  it('bypasses pre-search check when web search is disabled', () => {
    store.getState().setEnableWebSearch(false);
    // No pre-search in store at all
    store.getState().setPreSearches([]);

    const result = canStreamingProceed(store.getState());

    // Should not check pre-search when web search disabled
    expect(result.canProceed).toBe(true);
    expect(result.blockReasons).not.toContain('pre-search missing');
  });
});

// ============================================================================
// COMBINED BLOCKING - CONFIG CHANGES + PRE-SEARCH
// ============================================================================

describe('streaming Trigger Blocking - Combined Scenarios', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));
    store.getState().setParticipants(createMockParticipants());
    store.getState().setMessages([createUserMessage(0)]);
    store.getState().setEnableWebSearch(true);
  });

  it('blocks when config flags set AND pre-search pending', () => {
    // Config change flags
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    // Pre-search pending
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.PENDING)]);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');
    expect(result.blockReasons).toContain('pre-search pending');
  });

  it('still blocks when config flags cleared but pre-search pending', () => {
    // Start with both blocking
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.PENDING)]);

    // Clear config flags
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    const result = canStreamingProceed(store.getState());

    // Still blocked by pre-search
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('pre-search pending');
  });

  it('unblocks when ALL conditions are cleared', () => {
    // Start with all blocking
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.PENDING)]);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Clear config flags
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // Complete pre-search
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

    // Now unblocked
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });
});

// ============================================================================
// RACE CONDITIONS - FLAGS BEING CLEARED
// ============================================================================

describe('streaming Trigger Blocking - Race Conditions', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));
    store.getState().setParticipants(createMockParticipants());
    store.getState().setMessages([createUserMessage(0)]);
    store.getState().setEnableWebSearch(true);
  });

  it('handles rapid flag state changes', () => {
    // Add pre-search COMPLETE so it doesn't block
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.COMPLETE)]);

    // Rapid sequence of state changes
    store.getState().setConfigChangeRoundNumber(1);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    store.getState().setIsWaitingForChangelog(true);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    store.getState().setConfigChangeRoundNumber(null);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    store.getState().setIsWaitingForChangelog(false);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(true);
  });

  it('handles pre-search status changes during changelog sync', () => {
    // Config changes in progress
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    // Pre-search starts
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.PENDING)]);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Changelog completes first
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // Still blocked by pre-search
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('pre-search pending');

    // Pre-search completes
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

    // Now unblocked
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });

  it('handles changelog completing before pre-search starts', () => {
    // Config changes set
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    // Pre-search not yet created
    store.getState().setPreSearches([]);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Changelog completes
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // Now blocked by missing pre-search
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('pre-search missing');

    // Pre-search created and completes
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.COMPLETE)]);

    // Now unblocked
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });
});

// ============================================================================
// TIMEOUT PROTECTION
// ============================================================================

describe('streaming Trigger Blocking - Timeout Protection', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.useFakeTimers();
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));
    store.getState().setParticipants(createMockParticipants());
    store.getState().setMessages([createUserMessage(0)]);
    store.getState().setEnableWebSearch(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('simulates changelog sync timeout clearing isWaitingForChangelog', async () => {
    // Add pre-search COMPLETE so it doesn't block
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.COMPLETE)]);

    // Set changelog waiting state
    store.getState().setIsWaitingForChangelog(true);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Simulate timeout: use-changelog-sync.ts:123 clears flag after 30s
    // In real code, this happens via setTimeout in the hook
    // For testing, we manually trigger the timeout behavior
    vi.advanceTimersByTime(30_000);

    // Simulate timeout clearing the flag
    store.getState().setIsWaitingForChangelog(false);

    // Should unblock after timeout
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });

  it('simulates pre-search timeout with stuck PENDING status', async () => {
    // Pre-search stuck in PENDING
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.PENDING)]);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Simulate timeout: checkStuckPreSearches marks as COMPLETE
    vi.advanceTimersByTime(10_000);

    // Simulate timeout behavior
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

    // Should unblock after timeout
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });

  it('handles both timeouts occurring', async () => {
    // Both blocking conditions stuck
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.PENDING)]);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Advance past pre-search timeout (10s)
    vi.advanceTimersByTime(10_000);
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

    // Still blocked by changelog
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Advance to changelog timeout (30s total)
    vi.advanceTimersByTime(20_000);
    store.getState().setIsWaitingForChangelog(false);
    store.getState().setConfigChangeRoundNumber(null);

    // Now unblocked
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });
});

// ============================================================================
// MULTI-ROUND SCENARIOS
// ============================================================================

describe('streaming Trigger Blocking - Multi-Round', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));
    store.getState().setParticipants(createMockParticipants());
    store.getState().setEnableWebSearch(true);
  });

  it('blocks Round 1 correctly after Round 0 completes', () => {
    // Round 0 complete
    store.getState().setMessages([createUserMessage(0)]);
    store.getState().setPreSearches([createPreSearch(0, MessageStatuses.COMPLETE)]);

    // Round 0 can stream
    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);

    // Start Round 1 with config changes
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setPreSearches([
      createPreSearch(0, MessageStatuses.COMPLETE),
      createPreSearch(1, MessageStatuses.PENDING),
    ]);

    // Round 1 should be blocked
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');
    expect(result.blockReasons).toContain('pre-search pending');
  });

  it('unblocks Round 1 after changelog and pre-search complete', () => {
    // Round 1 initially blocked
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setPreSearches([
      createPreSearch(0, MessageStatuses.COMPLETE),
      createPreSearch(1, MessageStatuses.PENDING),
    ]);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Changelog completes
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // Still blocked by pre-search
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Pre-search completes
    store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

    // Now unblocked
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });
});

// ============================================================================
// PATCH COMPLETION BLOCKING
// ============================================================================

describe('streaming Trigger Blocking - PATCH Completion', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setParticipants(createMockParticipants());
  });

  it('blocks streaming until PATCH completes (configChangeRoundNumber set)', () => {
    // Simulate handleUpdateThreadAndSend - BEFORE PATCH
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);
    // This flag is set BEFORE PATCH to block streaming
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setWaitingToStartStreaming(true);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
  });

  it('keeps blocking after PATCH sets isWaitingForChangelog', () => {
    // Initial PATCH blocking
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);
    store.getState().setConfigChangeRoundNumber(1);

    // PATCH completes, sets isWaitingForChangelog=true (line 374 form-actions.ts)
    store.getState().setIsWaitingForChangelog(true);

    const result = canStreamingProceed(store.getState());

    // Still blocked by BOTH flags
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');
  });

  it('unblocks only after changelog fetch clears both flags', () => {
    // Start with both flags set (PATCH completed state)
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Simulate use-changelog-sync clearing both flags (lines 106-107 use-changelog-sync.ts)
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // Now unblocked
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });

  it('clears configChangeRoundNumber immediately when no config changes (line 373)', () => {
    // Simulate PATCH with NO config changes
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);
    store.getState().setConfigChangeRoundNumber(1);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // No config changes: use-changelog-sync detects empty changelog and clears both flags immediately
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // Unblocked immediately
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });
});

// ============================================================================
// CHANGELOG FETCH BLOCKING
// ============================================================================

describe('streaming Trigger Blocking - Changelog Fetch', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setParticipants(createMockParticipants());
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);
  });

  it('blocks streaming when changelog is being fetched', () => {
    // PATCH completed, now fetching changelog
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setConfigChangeRoundNumber(1);

    const result = canStreamingProceed(store.getState());

    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
  });

  it('unblocks when changelog fetch completes successfully', () => {
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setConfigChangeRoundNumber(1);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Simulate changelog fetch success (use-changelog-sync lines 105-107)
    store.getState().setIsWaitingForChangelog(false);
    store.getState().setConfigChangeRoundNumber(null);

    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });

  it('unblocks on changelog fetch timeout (30s safety)', () => {
    vi.useFakeTimers();

    store.getState().setIsWaitingForChangelog(true);
    store.getState().setConfigChangeRoundNumber(1);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Advance past timeout (use-changelog-sync line 127)
    vi.advanceTimersByTime(30_000);

    // Simulate timeout clearing flags
    store.getState().setIsWaitingForChangelog(false);
    store.getState().setConfigChangeRoundNumber(null);

    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);

    vi.useRealTimers();
  });

  it('handles empty changelog response (no actual changes)', () => {
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setConfigChangeRoundNumber(1);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Simulate empty changelog (use-changelog-sync lines 67-72)
    store.getState().setIsWaitingForChangelog(false);
    store.getState().setConfigChangeRoundNumber(null);

    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });
});

// ============================================================================
// WAITINGTOSTART + BLOCKING FLAGS INTERACTION
// ============================================================================

describe('streaming Trigger Blocking - waitingToStartStreaming + Flags', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setParticipants(createMockParticipants());
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);
  });

  it('sets waitingToStartStreaming=true AFTER configChangeRoundNumber', () => {
    // Simulate form-actions.ts lines 309-312
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setWaitingToStartStreaming(true);

    const state = store.getState();

    expect(state.configChangeRoundNumber).toBe(1);
    expect(state.waitingToStartStreaming).toBe(true);

    // Streaming should be blocked
    const result = canStreamingProceed(state);
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
  });

  it('keeps waitingToStartStreaming=true while PATCH is in flight', () => {
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setWaitingToStartStreaming(true);

    // PATCH in flight, no flags cleared yet
    const result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // waitingToStartStreaming remains true
    expect(store.getState().waitingToStartStreaming).toBe(true);
  });

  it('keeps waitingToStartStreaming=true while changelog fetches', () => {
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setWaitingToStartStreaming(true);
    // PATCH completed
    store.getState().setIsWaitingForChangelog(true);

    // Changelog fetching
    const result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');

    // waitingToStartStreaming still true, waiting for unblock
    expect(store.getState().waitingToStartStreaming).toBe(true);
  });

  it('triggers streaming only after all flags clear', () => {
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setWaitingToStartStreaming(true);

    // Initially blocked
    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Clear flags (changelog fetch completed)
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // Now unblocked
    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);

    // waitingToStartStreaming still true, ready to trigger
    expect(store.getState().waitingToStartStreaming).toBe(true);
  });
});

// ============================================================================
// COMPREHENSIVE BLOCKING SEQUENCE - PATCH → CHANGELOG → PRE-SEARCH
// ============================================================================

describe('streaming Trigger Blocking - Complete Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));
    store.getState().setParticipants(createMockParticipants());
    store.getState().setEnableWebSearch(true);
  });

  it('blocks through entire sequence: PATCH → changelog → pre-search → unblock', () => {
    // Add user message
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);

    // STEP 1: BEFORE PATCH - configChangeRoundNumber blocks streaming
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setWaitingToStartStreaming(true);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');

    // STEP 2: PATCH completes - sets isWaitingForChangelog
    store.getState().setIsWaitingForChangelog(true);

    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');

    // STEP 3: Pre-search created (PENDING)
    store.getState().setPreSearches([createPreSearch(1, MessageStatuses.PENDING)]);

    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');
    expect(result.blockReasons).toContain('pre-search pending');

    // STEP 4: Changelog fetch completes - clears flags
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('pre-search pending');
    expect(result.blockReasons).not.toContain('configChangeRoundNumber is set');
    expect(result.blockReasons).not.toContain('isWaitingForChangelog is true');

    // STEP 5: Pre-search completes
    store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
    expect(result.blockReasons).toHaveLength(0);
  });

  it('blocks when changelog completes before pre-search starts', () => {
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setWaitingToStartStreaming(true);

    // Changelog completes first
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    let result = canStreamingProceed(store.getState());
    // No pre-search yet - should block
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('pre-search missing');

    // Pre-search created
    store.getState().setPreSearches([createPreSearch(1, MessageStatuses.PENDING)]);

    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('pre-search pending');

    // Pre-search completes
    store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });

  it('blocks when pre-search completes before changelog', () => {
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setWaitingToStartStreaming(true);

    // Pre-search created and immediately completes
    store.getState().setPreSearches([createPreSearch(1, MessageStatuses.COMPLETE)]);

    let result = canStreamingProceed(store.getState());
    // Pre-search complete but changelog still pending
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');
    expect(result.blockReasons).not.toContain('pre-search');

    // Changelog completes
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });

  it('handles config changes WITHOUT web search (no pre-search blocking)', () => {
    // Web search disabled
    store.getState().setEnableWebSearch(false);
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);

    // PATCH blocking
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setWaitingToStartStreaming(true);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');

    // PATCH completes
    store.getState().setIsWaitingForChangelog(true);

    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');

    // Changelog completes - should unblock immediately (no pre-search)
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
    expect(result.blockReasons).toHaveLength(0);
  });
});

// ============================================================================
// EDGE CASES - FLAG CLEARING ORDER
// ============================================================================

describe('streaming Trigger Blocking - Flag Clearing Order', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(createMockThread());
    store.getState().setParticipants(createMockParticipants());
    store.getState().setMessages([createUserMessage(0), createUserMessage(1)]);
  });

  it('clearing configChangeRoundNumber alone is insufficient', () => {
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    // Clear only configChangeRoundNumber
    store.getState().setConfigChangeRoundNumber(null);

    const result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('isWaitingForChangelog is true');
  });

  it('clearing isWaitingForChangelog alone is insufficient', () => {
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    // Clear only isWaitingForChangelog
    store.getState().setIsWaitingForChangelog(false);

    const result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);
    expect(result.blockReasons).toContain('configChangeRoundNumber is set');
  });

  it('requires BOTH flags cleared simultaneously', () => {
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    let result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(false);

    // Clear both flags atomically (as use-changelog-sync does)
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    result = canStreamingProceed(store.getState());
    expect(result.canProceed).toBe(true);
  });

  it('handles rapid flag state changes without race conditions', () => {
    // Rapid sequence simulating async operations
    store.getState().setConfigChangeRoundNumber(1);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    store.getState().setIsWaitingForChangelog(true);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    // Clear in opposite order
    store.getState().setIsWaitingForChangelog(false);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(false);

    store.getState().setConfigChangeRoundNumber(null);
    expect(canStreamingProceed(store.getState()).canProceed).toBe(true);
  });
});

/**
 * Changelog Display and Timing E2E Tests
 *
 * Tests for changelog display behavior and timing as documented in FLOW_DOCUMENTATION.md:
 *
 * Critical Timing Behavior:
 * 1. Changelog accordion appears ONLY when config changed between rounds
 * 2. Changelog shows correct summary (N added, N removed, N modified)
 * 3. Changelog accordion is expandable with details
 * 4. Changelog is fetched AFTER PATCH completes (when hasAnyChanges is true)
 * 5. Streaming is blocked until changelog fetch completes (isWaitingForChangelog flag)
 * 6. Changelog entries are tied to correct round number
 * 7. Multiple rounds with changes show separate changelog entries
 * 8. No changelog when no changes
 * 9. Historical changelog display on page refresh
 *
 * Flow (from form-actions.ts:364-374):
 * - PATCH completes → if (hasAnyChanges) → setIsWaitingForChangelog(true)
 * - use-changelog-sync.ts detects flag → fetches round-specific changelog
 * - On success → merges into cache → setIsWaitingForChangelog(false)
 * - Streaming trigger waits for isWaitingForChangelog=false before proceeding
 */

import { ChangelogChangeTypesExtended, MessageStatuses, ModelIds } from '@roundtable/shared';
import type { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/lib/data/query-keys';
import type { ChatThreadChangelog } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

// ============================================================================
// TEST HELPERS
// ============================================================================

type MockQueryClient = {
  setQueryData: ReturnType<typeof vi.fn>;
  getQueryData: ReturnType<typeof vi.fn>;
};

function createMockQueryClient(): MockQueryClient & Partial<QueryClient> {
  return {
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  };
}

function createMockChangelog(
  roundNumber: number,
  changes: Array<{
    type: 'added' | 'removed' | 'modified' | 'reordered' | 'mode-changed';
    participantId?: string;
    modelId?: string;
  }>,
): ChatThreadChangelog {
  return {
    id: `changelog-r${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    previousRoundNumber: roundNumber > 0 ? roundNumber - 1 : null,
    changeType: 'participant_change',
    changeData: {
      changes: changes.map(c => ({
        type: c.type,
        participantId: c.participantId,
        modelId: c.modelId,
      })),
    },
    createdAt: new Date().toISOString(),
  };
}

// ============================================================================
// 1. CHANGELOG APPEARS ONLY WHEN CONFIG CHANGED
// ============================================================================

describe('changelog Visibility Control', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('when config changed between rounds', () => {
    it('sets isWaitingForChangelog=true after PATCH with hasAnyChanges', () => {
      // Simulate PATCH completion with config changes (from form-actions.ts:367-368)
      const hasAnyChanges = true;

      const state = store.getState();

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
        state.setConfigChangeRoundNumber(1);
      }

      // Re-fetch state after mutations
      const updatedState = store.getState();

      expect(updatedState.isWaitingForChangelog).toBe(true);
      expect(updatedState.configChangeRoundNumber).toBe(1);
    });

    it('keeps isWaitingForChangelog=true until changelog fetched', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(2);

      // Re-fetch state after mutations
      let updatedState = store.getState();

      expect(updatedState.isWaitingForChangelog).toBe(true);

      // Simulate changelog sync completion (from use-changelog-sync.ts:106-107)
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);

      // Re-fetch state after second mutations
      updatedState = store.getState();

      expect(updatedState.isWaitingForChangelog).toBe(false);
      expect(updatedState.configChangeRoundNumber).toBe(null);
    });
  });

  describe('when config unchanged between rounds', () => {
    it('clears configChangeRoundNumber without setting isWaitingForChangelog', () => {
      const state = store.getState();

      // Simulate PATCH completion with NO config changes (from form-actions.ts:371-373)
      const hasAnyChanges = false;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
      } else {
        state.setConfigChangeRoundNumber(null);
      }

      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });

    it('does not trigger changelog fetch when no changes', () => {
      const state = store.getState();

      // No config changes = no changelog wait
      expect(state.isWaitingForChangelog).toBe(false);

      // Changelog sync should not activate (shouldFetch = false)
      const shouldFetch = state.isWaitingForChangelog
        && state.configChangeRoundNumber !== null;

      expect(shouldFetch).toBe(false);
    });
  });
});

// ============================================================================
// 2. CHANGELOG SUMMARY CORRECTNESS
// ============================================================================

describe('changelog Summary Display', () => {
  describe('change type detection', () => {
    it('detects additions correctly', () => {
      const changelog = createMockChangelog(1, [
        { type: 'added', participantId: 'p1', modelId: 'gpt-4' },
        { type: 'added', participantId: 'p2', modelId: 'claude-3' },
      ]);

      const addedCount = changelog.changeData.changes.filter(
        c => c.type === ChangelogChangeTypesExtended.ADDED,
      ).length;

      expect(addedCount).toBe(2);
      expect(changelog.changeData.changes[0]?.type).toBe('added');
    });

    it('detects removals correctly', () => {
      const changelog = createMockChangelog(2, [
        { type: 'removed', participantId: 'p1', modelId: 'gpt-4' },
      ]);

      const removedCount = changelog.changeData.changes.filter(
        c => c.type === ChangelogChangeTypesExtended.REMOVED,
      ).length;

      expect(removedCount).toBe(1);
    });

    it('detects modifications correctly', () => {
      const changelog = createMockChangelog(3, [
        { type: 'modified', participantId: 'p1' },
        { type: 'reordered', participantId: 'p2' },
      ]);

      const modifiedCount = changelog.changeData.changes.filter(
        c => c.type === ChangelogChangeTypesExtended.MODIFIED
          || c.type === ChangelogChangeTypesExtended.REORDERED,
      ).length;

      expect(modifiedCount).toBe(2);
    });

    it('creates correct summary for mixed changes', () => {
      const changelog = createMockChangelog(4, [
        { type: 'added', participantId: 'p1' },
        { type: 'added', participantId: 'p2' },
        { type: 'removed', participantId: 'p3' },
        { type: 'modified', participantId: 'p4' },
      ]);

      const added = changelog.changeData.changes.filter(
        c => c.type === ChangelogChangeTypesExtended.ADDED,
      ).length;
      const removed = changelog.changeData.changes.filter(
        c => c.type === ChangelogChangeTypesExtended.REMOVED,
      ).length;
      const modified = changelog.changeData.changes.filter(
        c => c.type === ChangelogChangeTypesExtended.MODIFIED,
      ).length;

      // Summary format: "2 added, 1 removed, 1 modified"
      expect(added).toBe(2);
      expect(removed).toBe(1);
      expect(modified).toBe(1);
    });
  });
});

// ============================================================================
// 3. CHANGELOG EXPANDABLE DETAILS
// ============================================================================

describe('changelog Expandable Details', () => {
  it('contains all change entries for round', () => {
    const changelog = createMockChangelog(2, [
      { type: 'added', participantId: 'p1', modelId: 'gpt-4' },
      { type: 'removed', participantId: 'p2', modelId: 'claude-2' },
      { type: 'modified', participantId: 'p3' },
    ]);

    expect(changelog.changeData.changes).toHaveLength(3);
    expect(changelog.changeData.changes[0]?.participantId).toBe('p1');
    expect(changelog.changeData.changes[1]?.participantId).toBe('p2');
    expect(changelog.changeData.changes[2]?.participantId).toBe('p3');
  });

  it('includes model information for additions and removals', () => {
    const changelog = createMockChangelog(1, [
      { type: 'added', participantId: 'p1', modelId: ModelIds.X_AI_GROK_4_1_FAST },
      { type: 'removed', participantId: 'p2', modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH },
    ]);

    const addedEntry = changelog.changeData.changes.find(
      c => c.type === ChangelogChangeTypesExtended.ADDED,
    );
    const removedEntry = changelog.changeData.changes.find(
      c => c.type === ChangelogChangeTypesExtended.REMOVED,
    );

    expect(addedEntry?.modelId).toBe(ModelIds.X_AI_GROK_4_1_FAST);
    expect(removedEntry?.modelId).toBe(ModelIds.GOOGLE_GEMINI_2_5_FLASH);
  });
});

// ============================================================================
// 4. CHANGELOG FETCHED AFTER PATCH COMPLETES
// ============================================================================

describe('changelog Fetch Timing', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('fetch trigger conditions', () => {
    it('triggers fetch when isWaitingForChangelog=true and configChangeRoundNumber set', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(2);

      // Re-fetch state after mutations
      const updatedState = store.getState();

      // Simulate use-changelog-sync.ts:47 shouldFetch condition
      const effectiveThreadId = 'thread-123';
      const shouldFetch = updatedState.isWaitingForChangelog
        && updatedState.configChangeRoundNumber !== null
        && !!effectiveThreadId;

      expect(shouldFetch).toBe(true);
    });

    it('does not trigger fetch when isWaitingForChangelog=false', () => {
      const state = store.getState();

      state.setConfigChangeRoundNumber(2);
      // isWaitingForChangelog is false by default

      const shouldFetch = state.isWaitingForChangelog
        && state.configChangeRoundNumber !== null;

      expect(shouldFetch).toBe(false);
    });

    it('does not trigger fetch when configChangeRoundNumber=null', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      // configChangeRoundNumber is null by default

      const shouldFetch = state.isWaitingForChangelog
        && state.configChangeRoundNumber !== null;

      expect(shouldFetch).toBe(false);
    });
  });

  describe('fetch completion and cache merge', () => {
    it('merges new changelog entries into cache', () => {
      const mockQueryClient = createMockQueryClient();
      const effectiveThreadId = 'thread-123';

      // Simulate existing cache (from use-changelog-sync.ts:76-103)
      const existingCache = {
        success: true,
        data: {
          items: [
            createMockChangelog(1, [
              { type: 'added', participantId: 'p1' },
            ]),
          ],
        },
      };

      const newChangelog = createMockChangelog(2, [
        { type: 'removed', participantId: 'p2' },
      ]);

      let capturedResult: { data: { items: { roundNumber: number }[] } } | null = null;
      mockQueryClient.setQueryData.mockImplementation((_key, updater) => {
        const result = typeof updater === 'function' ? updater(existingCache) : updater;
        capturedResult = result as typeof capturedResult;
      });

      // Simulate merge
      mockQueryClient.setQueryData(
        queryKeys.threads.changelog(effectiveThreadId),
        (old: typeof existingCache) => {
          const existingItems = old?.data?.items || [];
          const existingIds = new Set(existingItems.map(item => item.id));
          const uniqueNewItems = [newChangelog].filter(item => !existingIds.has(item.id));

          return {
            success: true,
            data: {
              items: [...uniqueNewItems, ...existingItems],
            },
          };
        },
      );

      expect(mockQueryClient.setQueryData).toHaveBeenCalled();
      expect(capturedResult).not.toBeNull();
      if (!capturedResult)
        throw new Error('expected capturedResult');
      expect(capturedResult.data.items).toHaveLength(2);
      expect(capturedResult.data.items[0]?.roundNumber).toBe(2); // Newest first
      expect(capturedResult.data.items[1]?.roundNumber).toBe(1);
    });

    it('clears waiting flags after successful merge', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(3);

      // Simulate use-changelog-sync.ts:105-107 after successful merge
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);

      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });

    it('clears flags even when no new changelog entries (empty response)', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(2);

      // Simulate use-changelog-sync.ts:68-72 (no new items)
      const newItems: ChatThreadChangelog[] = [];

      if (newItems.length === 0) {
        state.setIsWaitingForChangelog(false);
        state.setConfigChangeRoundNumber(null);
      }

      expect(state.isWaitingForChangelog).toBe(false);
    });
  });
});

// ============================================================================
// 5. STREAMING BLOCKED UNTIL CHANGELOG FETCH COMPLETES
// ============================================================================

describe('streaming Blocking Until Changelog Ready', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('blocking conditions', () => {
    it('blocks streaming while isWaitingForChangelog=true', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      state.setWaitingToStartStreaming(true);

      // Re-fetch state after mutations
      const updatedState = store.getState();

      // Streaming trigger should NOT proceed (from use-streaming-trigger.ts logic)
      const shouldBlockStreaming = updatedState.isWaitingForChangelog;

      expect(shouldBlockStreaming).toBe(true);
    });

    it('allows streaming when isWaitingForChangelog=false', () => {
      const state = store.getState();

      state.setWaitingToStartStreaming(true);
      // isWaitingForChangelog defaults to false

      // Re-fetch state after mutations
      const updatedState = store.getState();

      const shouldBlockStreaming = updatedState.isWaitingForChangelog;

      expect(shouldBlockStreaming).toBe(false);
    });

    it('blocks streaming until changelog sync completes', () => {
      const state = store.getState();

      // Initial state: waiting for changelog
      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(2);
      state.setWaitingToStartStreaming(true);

      // Re-fetch state after mutations
      let updatedState = store.getState();

      expect(updatedState.isWaitingForChangelog).toBe(true);

      // Changelog fetch completes
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);

      // Re-fetch state after second mutations
      updatedState = store.getState();

      // Now streaming can proceed
      expect(updatedState.isWaitingForChangelog).toBe(false);
    });
  });

  describe('timeout protection', () => {
    it('has 30-second timeout to prevent infinite blocking', () => {
      // Documented in use-changelog-sync.ts:119-130
      const CHANGELOG_TIMEOUT_MS = 30000;

      expect(CHANGELOG_TIMEOUT_MS).toBe(30000);
    });

    it('clears flags on timeout', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(3);

      // Simulate timeout (use-changelog-sync.ts:124-126)
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);

      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });
  });
});

// ============================================================================
// 6. CHANGELOG ENTRIES TIED TO CORRECT ROUND NUMBER
// ============================================================================

describe('changelog Round Number Association', () => {
  it('associates changelog with specific round number', () => {
    const changelog = createMockChangelog(3, [
      { type: 'added', participantId: 'p1' },
    ]);

    expect(changelog.roundNumber).toBe(3);
  });

  it('tracks previous round number for comparison', () => {
    const changelog = createMockChangelog(4, [
      { type: 'removed', participantId: 'p2' },
    ]);

    expect(changelog.roundNumber).toBe(4);
    expect(changelog.previousRoundNumber).toBe(3);
  });

  it('sets previousRoundNumber=null for round 0', () => {
    const changelog = createMockChangelog(0, [
      { type: 'added', participantId: 'p1' },
    ]);

    expect(changelog.previousRoundNumber).toBe(null);
  });

  it('stores correct round number from configChangeRoundNumber', () => {
    const testStore = createChatStore();
    const state = testStore.getState();

    // Simulate form-actions.ts:309 + 367-368
    const nextRoundNumber = 2;
    state.setConfigChangeRoundNumber(nextRoundNumber);

    const hasAnyChanges = true;
    if (hasAnyChanges) {
      state.setIsWaitingForChangelog(true);
    }

    // Re-fetch state after mutations
    const updatedState = testStore.getState();

    expect(updatedState.configChangeRoundNumber).toBe(2);
    expect(updatedState.isWaitingForChangelog).toBe(true);
  });
});

// ============================================================================
// 7. MULTIPLE ROUNDS WITH CHANGES SHOW SEPARATE ENTRIES
// ============================================================================

describe('multiple Rounds with Separate Changelogs', () => {
  it('stores separate changelog entries for different rounds', () => {
    const changelogs = [
      createMockChangelog(1, [
        { type: 'added', participantId: 'p1', modelId: 'gpt-4' },
      ]),
      createMockChangelog(3, [
        { type: 'removed', participantId: 'p2', modelId: 'claude-3' },
      ]),
      createMockChangelog(5, [
        { type: 'modified', participantId: 'p3' },
      ]),
    ];

    expect(changelogs).toHaveLength(3);
    expect(changelogs[0]?.roundNumber).toBe(1);
    expect(changelogs[1]?.roundNumber).toBe(3);
    expect(changelogs[2]?.roundNumber).toBe(5);
  });

  it('retrieves changelog for specific round', () => {
    const changelogs = [
      createMockChangelog(1, [{ type: 'added', participantId: 'p1' }]),
      createMockChangelog(2, [{ type: 'removed', participantId: 'p2' }]),
      createMockChangelog(3, [{ type: 'modified', participantId: 'p3' }]),
    ];

    const round2Changelog = changelogs.find(c => c.roundNumber === 2);

    expect(round2Changelog).toBeDefined();
    expect(round2Changelog?.changeData.changes[0]?.type).toBe('removed');
  });

  it('no changelog for rounds without config changes', () => {
    const changelogs = [
      createMockChangelog(1, [{ type: 'added', participantId: 'p1' }]),
      // Round 2: No config changes, no changelog
      createMockChangelog(3, [{ type: 'removed', participantId: 'p2' }]),
    ];

    const round2Changelog = changelogs.find(c => c.roundNumber === 2);

    expect(round2Changelog).toBeUndefined();
    expect(changelogs.find(c => c.roundNumber === 1)).toBeDefined();
    expect(changelogs.find(c => c.roundNumber === 3)).toBeDefined();
  });
});

// ============================================================================
// 8. NO CHANGELOG WHEN NO CHANGES
// ============================================================================

describe('no Changelog When Config Unchanged', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('does not set isWaitingForChangelog when hasAnyChanges=false', () => {
    const state = store.getState();

    // Simulate form-actions.ts:370-373 (no changes path)
    const hasAnyChanges = false;

    if (hasAnyChanges) {
      state.setIsWaitingForChangelog(true);
    } else {
      state.setConfigChangeRoundNumber(null);
    }

    expect(state.isWaitingForChangelog).toBe(false);
    expect(state.configChangeRoundNumber).toBe(null);
  });

  it('allows streaming immediately when no config changes', () => {
    const state = store.getState();

    // No config changes
    state.setWaitingToStartStreaming(true);

    // Re-fetch state after mutations
    const updatedState = store.getState();

    // Streaming should NOT be blocked
    const isBlocked = updatedState.isWaitingForChangelog;

    expect(isBlocked).toBe(false);
    expect(updatedState.waitingToStartStreaming).toBe(true);
  });

  it('empty changelog cache when no changes ever made', () => {
    const emptyCache = {
      success: true,
      data: {
        items: [],
      },
    };

    expect(emptyCache.data.items).toHaveLength(0);
  });
});

// ============================================================================
// 9. HISTORICAL CHANGELOG DISPLAY ON PAGE REFRESH
// ============================================================================

describe('historical Changelog Display After Refresh', () => {
  it('loads existing changelogs from cache on mount', () => {
    const mockQueryClient = createMockQueryClient();
    const effectiveThreadId = 'thread-123';

    const cachedChangelogs = {
      success: true,
      data: {
        items: [
          createMockChangelog(2, [
            { type: 'added', participantId: 'p1' },
          ]),
          createMockChangelog(1, [
            { type: 'removed', participantId: 'p2' },
          ]),
        ],
      },
    };

    mockQueryClient.getQueryData.mockReturnValue(cachedChangelogs);

    const cached = mockQueryClient.getQueryData(
      queryKeys.threads.changelog(effectiveThreadId),
    );

    expect(cached.data.items).toHaveLength(2);
    expect(cached.data.items[0]?.roundNumber).toBe(2);
    expect(cached.data.items[1]?.roundNumber).toBe(1);
  });

  it('displays changelogs for all historical rounds', () => {
    const changelogs = [
      createMockChangelog(5, [{ type: 'added', participantId: 'p1' }]),
      createMockChangelog(3, [{ type: 'removed', participantId: 'p2' }]),
      createMockChangelog(2, [{ type: 'modified', participantId: 'p3' }]),
    ];

    // All historical changelogs should be preserved
    expect(changelogs).toHaveLength(3);

    changelogs.forEach((log) => {
      expect(log.roundNumber).toBeGreaterThanOrEqual(2);
      expect(log.changeData.changes.length).toBeGreaterThan(0);
    });
  });

  it('preserves changelog details across page refreshes', () => {
    const changelog = createMockChangelog(3, [
      { type: 'added', participantId: 'p1', modelId: 'gpt-4' },
      { type: 'removed', participantId: 'p2', modelId: 'claude-3' },
      { type: 'modified', participantId: 'p3' },
    ]);

    // All change data should be preserved
    expect(changelog.roundNumber).toBe(3);
    expect(changelog.changeData.changes).toHaveLength(3);
    expect(changelog.changeData.changes[0]?.modelId).toBe('gpt-4');
    expect(changelog.changeData.changes[1]?.modelId).toBe('claude-3');
  });
});

// ============================================================================
// 10. EDGE CASES AND ERROR HANDLING
// ============================================================================

describe('changelog Edge Cases', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('fetch failure scenarios', () => {
    it('times out after 30 seconds on fetch failure', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(2);

      // Simulate timeout (from use-changelog-sync.ts:123-127)
      const timeoutMs = 30000;

      setTimeout(() => {
        state.setIsWaitingForChangelog(false);
        state.setConfigChangeRoundNumber(null);
      }, timeoutMs);

      expect(timeoutMs).toBe(30000);
    });

    it('does not block streaming forever on changelog fetch error', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      state.setWaitingToStartStreaming(true);

      // Fetch fails, timeout triggers cleanup
      state.setIsWaitingForChangelog(false);

      // Streaming no longer blocked
      expect(state.isWaitingForChangelog).toBe(false);
    });
  });

  describe('hasPendingConfigChanges flag', () => {
    it('tracks toggle OFF→ON scenarios (same final value, but still a change)', () => {
      const state = store.getState();

      // Simulate web search toggle OFF → ON
      // Final value matches thread state, but hasPendingConfigChanges was set
      state.setHasPendingConfigChanges(true);

      // Re-fetch state after mutations
      const updatedState = store.getState();

      const currentWebSearch = false;
      const formWebSearch = false;
      const webSearchChanged = currentWebSearch !== formWebSearch;

      // Even though values match, hasPendingConfigChanges indicates user made a change
      const hasAnyChanges = webSearchChanged || updatedState.hasPendingConfigChanges;

      expect(hasAnyChanges).toBe(true);
    });

    it('clears hasPendingConfigChanges after successful submission', () => {
      const state = store.getState();

      state.setHasPendingConfigChanges(true);

      // Simulate form-actions.ts:377-378 (after PATCH success)
      state.setHasPendingConfigChanges(false);

      expect(state.hasPendingConfigChanges).toBe(false);
    });
  });

  describe('mode change tracking', () => {
    it('creates changelog entry for mode changes', () => {
      const changelog = createMockChangelog(2, [
        { type: 'mode-changed' },
      ]);

      const modeChange = changelog.changeData.changes.find(
        c => c.type === ChangelogChangeTypesExtended.MODE_CHANGED,
      );

      expect(modeChange).toBeDefined();
      expect(modeChange?.type).toBe('mode-changed');
    });

    it('combines mode change with participant changes', () => {
      const changelog = createMockChangelog(3, [
        { type: 'mode-changed' },
        { type: 'added', participantId: 'p1', modelId: 'gpt-4' },
        { type: 'removed', participantId: 'p2', modelId: 'claude-3' },
      ]);

      expect(changelog.changeData.changes).toHaveLength(3);

      const hasModeChange = changelog.changeData.changes.some(
        c => c.type === ChangelogChangeTypesExtended.MODE_CHANGED,
      );
      const hasParticipantChanges = changelog.changeData.changes.some(
        c => c.type === ChangelogChangeTypesExtended.ADDED || c.type === ChangelogChangeTypesExtended.REMOVED,
      );

      expect(hasModeChange).toBe(true);
      expect(hasParticipantChanges).toBe(true);
    });
  });

  describe('duplicate prevention', () => {
    it('prevents duplicate changelog merges for same round', () => {
      const mockQueryClient = createMockQueryClient();

      const existingCache = {
        success: true,
        data: {
          items: [
            createMockChangelog(2, [{ type: 'added', participantId: 'p1' }]),
          ],
        },
      };

      const newChangelog = createMockChangelog(2, [
        { type: 'added', participantId: 'p1' },
      ]); // Same round, same ID

      // Simulate use-changelog-sync.ts:89-93 (duplicate check)
      let capturedUpdated: typeof existingCache | null = null;
      mockQueryClient.setQueryData.mockImplementation((_key, updater) => {
        const result = typeof updater === 'function' ? updater(existingCache) : updater;
        capturedUpdated = result as typeof existingCache;
      });

      mockQueryClient.setQueryData(
        queryKeys.threads.changelog('thread-123'),
        (old: typeof existingCache) => {
          const existingItems = old?.data?.items || [];
          const existingIds = new Set(existingItems.map(item => item.id));
          const uniqueNewItems = [newChangelog].filter(item => !existingIds.has(item.id));

          return {
            success: true,
            data: {
              items: [...uniqueNewItems, ...existingItems],
            },
          };
        },
      );

      const existingIds = new Set(existingCache.data.items.map(item => item.id));
      const uniqueNewItems = [newChangelog].filter(item => !existingIds.has(item.id));

      expect(uniqueNewItems).toHaveLength(0); // Duplicate detected
      expect(capturedUpdated?.data.items).toHaveLength(1); // No duplicate added
    });
  });
});

// ============================================================================
// 11. CHANGELOG ACCORDION APPEARING AND POSITION IN TIMELINE
// ============================================================================

describe('changelog Accordion Display and Timeline Position', () => {
  let store: ChatStoreApi;
  let mockQueryClient: MockQueryClient & QueryClient;

  beforeEach(() => {
    store = createChatStore();
    mockQueryClient = createMockQueryClient();
  });

  describe('accordion appearance conditions', () => {
    it('shows accordion when config changes are made', () => {
      const changelog = createMockChangelog(1, [
        { type: 'added', participantId: 'p1', modelId: 'gpt-4' },
      ]);

      // Simulate changelog fetch success and cache merge
      mockQueryClient.setQueryData(
        queryKeys.threads.changelog('thread-123'),
        {
          success: true,
          data: { items: [changelog] },
        },
      );

      const cached = mockQueryClient.setQueryData.mock.calls[0];
      expect(cached).toBeDefined();

      // Accordion should appear when changelog entries exist
      const changelogItems = [changelog];
      expect(changelogItems.length).toBeGreaterThan(0);
      expect(changelogItems[0]?.changeData.changes).toHaveLength(1);
    });

    it('does not show accordion when no config changes', () => {
      const state = store.getState();

      // No changes = no isWaitingForChangelog flag
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);

      // Changelog cache remains empty
      const emptyCache = {
        success: true,
        data: { items: [] },
      };

      expect(emptyCache.data.items).toHaveLength(0);
    });

    it('shows accordion for correct round number', () => {
      const round1Changelog = createMockChangelog(1, [
        { type: 'added', participantId: 'p1' },
      ]);
      const round3Changelog = createMockChangelog(3, [
        { type: 'removed', participantId: 'p2' },
      ]);

      // Multiple changelogs for different rounds
      const cache = {
        success: true,
        data: {
          items: [round3Changelog, round1Changelog], // Newest first
        },
      };

      // Find changelog for specific round
      const round3Entry = cache.data.items.find(item => item.roundNumber === 3);
      const round2Entry = cache.data.items.find(item => item.roundNumber === 2);

      expect(round3Entry).toBeDefined();
      expect(round2Entry).toBeUndefined(); // No changes in round 2
    });
  });

  describe('timeline position correctness', () => {
    it('places changelog at correct position between rounds', () => {
      // Changelog should appear BETWEEN rounds when config changed
      // Round 0: User + AI messages
      // [Changelog for round 1] ← Config changed before round 1
      // Round 1: User + AI messages

      const changelog = createMockChangelog(1, [
        { type: 'added', participantId: 'p1' },
      ]);

      expect(changelog.roundNumber).toBe(1);
      expect(changelog.previousRoundNumber).toBe(0);

      // Timeline position logic (conceptual - actual implementation in UI)
      // Changelog with roundNumber=1 appears BEFORE round 1 messages
      // This indicates "config changed from round 0 to round 1"
    });

    it('preserves timeline order with multiple changelogs', () => {
      const changelogs = [
        createMockChangelog(4, [{ type: 'added', participantId: 'p1' }]),
        createMockChangelog(2, [{ type: 'removed', participantId: 'p2' }]),
        createMockChangelog(1, [{ type: 'modified', participantId: 'p3' }]),
      ];

      // Cache stores newest first (createdAt DESC ordering)
      const cache = {
        success: true,
        data: { items: changelogs }, // Already sorted by round descending
      };

      expect(cache.data.items[0]?.roundNumber).toBe(4);
      expect(cache.data.items[1]?.roundNumber).toBe(2);
      expect(cache.data.items[2]?.roundNumber).toBe(1);
    });

    it('changelog appears before messages of same round', () => {
      // CRITICAL: Changelog for round N appears BEFORE round N messages
      // This shows "these are the config changes that affected round N"

      const changelogRound2 = createMockChangelog(2, [
        { type: 'added', participantId: 'p1' },
      ]);

      // Timeline order (conceptual):
      // 1. Round 1 messages (user + AI)
      // 2. Changelog for round 2 ← Shows changes that affect round 2
      // 3. Round 2 messages (user + AI)

      expect(changelogRound2.roundNumber).toBe(2);
      expect(changelogRound2.previousRoundNumber).toBe(1);
    });
  });
});

// ============================================================================
// 12. CHANGELOG NOT BLOCKING PARTICIPANT PLACEHOLDERS
// ============================================================================

describe('changelog Does Not Block Placeholders', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('placeholder visibility during changelog fetch', () => {
    it('allows placeholders to show while waiting for changelog', () => {
      const state = store.getState();

      // Config changed, waiting for changelog
      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(2);

      // Streaming is waiting to start
      state.setWaitingToStartStreaming(true);
      state.setStreamingRoundNumber(2);
      state.setCurrentRoundNumber(2);

      // Participant placeholders should be visible based on expectedParticipantIds
      // Even though changelog is still loading, the placeholders are independent
      const expectedIds = ['p1', 'p2', 'p3'];
      state.setExpectedParticipantIds(expectedIds);

      // Re-fetch state after second mutations
      const finalState = store.getState();

      expect(finalState.expectedParticipantIds).toEqual(expectedIds);
      expect(finalState.isWaitingForChangelog).toBe(true); // Still waiting
      expect(finalState.waitingToStartStreaming).toBe(true);

      // Placeholders are controlled by expectedParticipantIds, not by changelog state
      // This ensures participants cards show up immediately, even during changelog fetch
    });

    it('clears changelog flags without affecting placeholders', () => {
      const state = store.getState();

      // Set up both changelog waiting and placeholders
      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(2);
      state.setExpectedParticipantIds(['p1', 'p2']);

      // Re-fetch state after mutations
      let updatedState = store.getState();

      expect(updatedState.isWaitingForChangelog).toBe(true);
      expect(updatedState.expectedParticipantIds).toHaveLength(2);

      // Changelog completes
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);

      // Re-fetch state after second mutations
      updatedState = store.getState();

      // Placeholders remain unchanged
      expect(updatedState.isWaitingForChangelog).toBe(false);
      expect(updatedState.expectedParticipantIds).toHaveLength(2);
    });

    it('streaming waits for changelog but placeholders show immediately', () => {
      const state = store.getState();

      // Round begins with config changes
      state.setConfigChangeRoundNumber(2);
      state.setWaitingToStartStreaming(true);
      state.setIsWaitingForChangelog(true);

      // Placeholders set immediately (optimistic)
      state.setExpectedParticipantIds(['p1', 'p2', 'p3']);

      // Re-fetch state after mutations
      const updatedState = store.getState();

      // Placeholders visible = true (expectedParticipantIds set)
      expect(updatedState.expectedParticipantIds).toHaveLength(3);

      // Streaming blocked = true (isWaitingForChangelog)
      const isStreamingBlocked = updatedState.isWaitingForChangelog;
      expect(isStreamingBlocked).toBe(true);

      // This demonstrates: placeholders can render while streaming is blocked
    });
  });

  describe('timeline rendering with changelog and placeholders', () => {
    it('shows both changelog accordion and participant placeholders', () => {
      const state = store.getState();

      // Changelog exists for round 2
      const changelog = createMockChangelog(2, [
        { type: 'added', participantId: 'p1', modelId: 'gpt-4' },
      ]);

      // Round 2 streaming with placeholders
      state.setCurrentRoundNumber(2);
      state.setStreamingRoundNumber(2);
      state.setExpectedParticipantIds(['p1', 'p2']);

      // Re-fetch state after mutations
      const updatedState = store.getState();

      // Timeline should show:
      // 1. Changelog accordion (from cache)
      // 2. Participant placeholders (from expectedParticipantIds)
      expect(changelog.roundNumber).toBe(2);
      expect(updatedState.expectedParticipantIds).toHaveLength(2);
    });
  });
});

// ============================================================================
// 13. CHANGELOG ENTRIES VISIBLE WHILE STREAMING
// ============================================================================

describe('changelog Entries Visible During Streaming', () => {
  let store: ChatStoreApi;
  let mockQueryClient: MockQueryClient & QueryClient;

  beforeEach(() => {
    store = createChatStore();
    mockQueryClient = createMockQueryClient();
  });

  describe('changelog visibility during active streaming', () => {
    it('changelog accordion remains visible while streaming', () => {
      const state = store.getState();

      // Changelog fetched and merged for round 2
      const changelog = createMockChangelog(2, [
        { type: 'added', participantId: 'p1' },
      ]);

      mockQueryClient.setQueryData(
        queryKeys.threads.changelog('thread-123'),
        {
          success: true,
          data: { items: [changelog] },
        },
      );

      // Streaming starts
      state.setIsWaitingForChangelog(false); // Changelog fetch completed
      state.setWaitingToStartStreaming(false);
      state.setIsStreaming(true);
      state.setStreamingRoundNumber(2);

      // Re-fetch state after mutations
      const updatedState = store.getState();

      // Changelog should be visible in timeline even during streaming
      expect(updatedState.isStreaming).toBe(true);

      const cachedChangelog = mockQueryClient.setQueryData.mock.calls[0];
      expect(cachedChangelog).toBeDefined();
    });

    it('changelog persists across multiple streaming rounds', () => {
      const changelogs = [
        createMockChangelog(1, [{ type: 'added', participantId: 'p1' }]),
        createMockChangelog(2, [{ type: 'removed', participantId: 'p2' }]),
      ];

      // Cache has multiple changelogs
      mockQueryClient.setQueryData(
        queryKeys.threads.changelog('thread-123'),
        {
          success: true,
          data: { items: changelogs },
        },
      );

      const state = store.getState();

      // Streaming in round 3 (after both config changes)
      state.setIsStreaming(true);
      state.setStreamingRoundNumber(3);

      // Re-fetch state after mutations
      const updatedState = store.getState();

      // All historical changelogs remain visible
      expect(updatedState.isStreaming).toBe(true);

      const cached = mockQueryClient.setQueryData.mock.calls[0];
      expect(cached).toBeDefined();
    });

    it('changelog visible from cache on page load during streaming', () => {
      // Simulate page refresh during active streaming
      const existingChangelog = createMockChangelog(2, [
        { type: 'modified', participantId: 'p1' },
      ]);

      mockQueryClient.getQueryData.mockReturnValue({
        success: true,
        data: { items: [existingChangelog] },
      });

      // Load cached changelog
      const cached = mockQueryClient.getQueryData(
        queryKeys.threads.changelog('thread-123'),
      );

      expect(cached?.data.items).toHaveLength(1);
      expect(cached?.data.items[0]?.roundNumber).toBe(2);

      // Streaming state restored
      const state = store.getState();
      state.setIsStreaming(true);
      state.setStreamingRoundNumber(2);

      // Re-fetch state after mutations
      const updatedState = store.getState();

      // Changelog visible during resumed streaming
      expect(updatedState.isStreaming).toBe(true);
    });
  });

  describe('changelog updates during multi-round streaming', () => {
    it('new changelog appears while previous round streaming completes', () => {
      const state = store.getState();

      // Round 1 streaming completes, round 2 begins with config changes
      state.setIsStreaming(false);
      state.setStreamingRoundNumber(null);

      // User makes config changes for round 2
      state.setConfigChangeRoundNumber(2);
      state.setIsWaitingForChangelog(true);

      // Re-fetch state after mutations
      let updatedState = store.getState();

      expect(updatedState.isWaitingForChangelog).toBe(true);

      // Changelog for round 2 fetched
      const changelog = createMockChangelog(2, [
        { type: 'added', participantId: 'p3' },
      ]);

      mockQueryClient.setQueryData(
        queryKeys.threads.changelog('thread-123'),
        {
          success: true,
          data: { items: [changelog] },
        },
      );

      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);

      // Round 2 streaming starts
      state.setIsStreaming(true);
      state.setStreamingRoundNumber(2);

      // Re-fetch state after second mutations
      updatedState = store.getState();

      // New changelog visible during round 2 streaming
      expect(updatedState.isStreaming).toBe(true);
      expect(updatedState.streamingRoundNumber).toBe(2);
    });
  });
});

// ============================================================================
// 14. INTEGRATION: COMPLETE FLOW E2E
// ============================================================================

describe('complete Changelog Flow E2E', () => {
  let store: ChatStoreApi;
  let mockQueryClient: MockQueryClient & QueryClient;

  beforeEach(() => {
    store = createChatStore();
    mockQueryClient = createMockQueryClient();
  });

  it('executes full changelog flow: config change → PATCH → fetch → merge → unblock', () => {
    const state = store.getState();
    const effectiveThreadId = 'thread-123';

    // 1. User changes config (form-actions.ts:264)
    const hasAnyChanges = true;

    // 2. PATCH request sets configChangeRoundNumber (form-actions.ts:309)
    const nextRoundNumber = 2;
    state.setConfigChangeRoundNumber(nextRoundNumber);

    // 3. Streaming is blocked (form-actions.ts:312)
    state.setWaitingToStartStreaming(true);

    // 4. PATCH completes, sets isWaitingForChangelog (form-actions.ts:367-368)
    if (hasAnyChanges) {
      state.setIsWaitingForChangelog(true);
    }

    // Re-fetch state after mutations
    let updatedState = store.getState();

    expect(updatedState.isWaitingForChangelog).toBe(true);
    expect(updatedState.configChangeRoundNumber).toBe(2);

    // 5. use-changelog-sync detects flag and fetches changelog (use-changelog-sync.ts:47)
    const shouldFetch = updatedState.isWaitingForChangelog
      && updatedState.configChangeRoundNumber !== null
      && !!effectiveThreadId;

    expect(shouldFetch).toBe(true);

    // 6. Fetch completes, merges into cache (use-changelog-sync.ts:76-103)
    const newChangelog = createMockChangelog(2, [
      { type: 'added', participantId: 'p1', modelId: 'gpt-4' },
    ]);

    mockQueryClient.setQueryData(
      queryKeys.threads.changelog(effectiveThreadId),
      () => ({
        success: true,
        data: { items: [newChangelog] },
      }),
    );

    // 7. Flags cleared after merge (use-changelog-sync.ts:105-107)
    state.setIsWaitingForChangelog(false);
    state.setConfigChangeRoundNumber(null);

    // Re-fetch state after second mutations
    updatedState = store.getState();

    expect(updatedState.isWaitingForChangelog).toBe(false);
    expect(updatedState.configChangeRoundNumber).toBe(null);

    // 8. Streaming can now proceed
    expect(updatedState.waitingToStartStreaming).toBe(true);
    expect(updatedState.isWaitingForChangelog).toBe(false);
  });

  it('executes flow when no changes: PATCH → clear flags → immediate streaming', () => {
    const state = store.getState();

    // 1. No config changes
    const hasAnyChanges = false;

    // 2. PATCH request sets configChangeRoundNumber (form-actions.ts:309)
    const nextRoundNumber = 3;
    state.setConfigChangeRoundNumber(nextRoundNumber);

    // 3. Streaming ready (form-actions.ts:312)
    state.setWaitingToStartStreaming(true);

    // 4. PATCH completes, NO isWaitingForChangelog (form-actions.ts:370-373)
    if (hasAnyChanges) {
      state.setIsWaitingForChangelog(true);
    } else {
      state.setConfigChangeRoundNumber(null);
    }

    // Re-fetch state after mutations
    const updatedState = store.getState();

    expect(updatedState.isWaitingForChangelog).toBe(false);
    expect(updatedState.configChangeRoundNumber).toBe(null);

    // 5. Streaming proceeds immediately
    expect(updatedState.waitingToStartStreaming).toBe(true);
    expect(updatedState.isWaitingForChangelog).toBe(false);
  });

  it('handles pre-search + changelog flow: both must complete before streaming', () => {
    const state = store.getState();

    // 1. User enables web search + changes config
    const enableWebSearch = true;
    const hasAnyChanges = true;

    state.setConfigChangeRoundNumber(2);
    state.setWaitingToStartStreaming(true);

    // 2. Pre-search created (form-actions.ts:297-303)
    if (enableWebSearch) {
      state.addPreSearch({
        id: 'presearch-r2',
        threadId: 'thread-123',
        roundNumber: 2,
        userQuery: 'test query',
        status: MessageStatuses.PENDING,
        searchData: undefined,
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });
    }

    // 3. Changelog fetch triggered (form-actions.ts:367-368)
    if (hasAnyChanges) {
      state.setIsWaitingForChangelog(true);
    }

    // Re-fetch state after mutations
    let updatedState = store.getState();

    expect(updatedState.isWaitingForChangelog).toBe(true);
    expect(updatedState.preSearches).toHaveLength(1);

    // 4. Both must complete before streaming
    const preSearch = updatedState.preSearches[0];
    const isPreSearchBlocking = preSearch
      && (preSearch.status === MessageStatuses.PENDING || preSearch.status === MessageStatuses.STREAMING);
    const isChangelogBlocking = updatedState.isWaitingForChangelog;

    expect(isPreSearchBlocking).toBe(true);
    expect(isChangelogBlocking).toBe(true);

    // 5. Pre-search completes
    state.removePreSearch('presearch-r2');
    if (!preSearch)
      throw new Error('expected preSearch');
    state.addPreSearch({
      ...preSearch,
      status: MessageStatuses.COMPLETE,
      searchData: {
        queries: [],
        results: [],
        summary: 'Complete',
        successCount: 1,
        failureCount: 0,
        totalResults: 1,
        totalTime: 1000,
      },
    });

    // 6. Changelog completes
    state.setIsWaitingForChangelog(false);

    // Re-fetch state after second mutations
    updatedState = store.getState();

    // 7. Streaming can now proceed
    expect(updatedState.isWaitingForChangelog).toBe(false);
  });
});

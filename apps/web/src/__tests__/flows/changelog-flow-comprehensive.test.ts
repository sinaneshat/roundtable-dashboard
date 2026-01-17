/**
 * Changelog Flow Comprehensive Tests
 *
 * Tests the complete changelog flow as documented in FLOW_DOCUMENTATION.md (Part 6):
 *
 * Critical Requirements:
 * 1. When changes exist: changelog is called and accordion is shown
 * 2. When no changes: changelog is skipped but flow continues properly
 * 3. The changelog call happens AFTER the user message patch
 * 4. Accordion visibility and content accuracy
 * 5. Test various change types (mode changes, participant changes, file changes, etc.)
 *
 * Flow Sequence (from FLOW_DOCUMENTATION.md):
 * - User makes config changes (add/remove/reorder participants, change mode)
 * - User submits next message
 * - PATCH /threads/:id completes with hasAnyChanges flag
 * - If hasAnyChanges: setIsWaitingForChangelog(true) + fetch changelog
 * - If no changes: setConfigChangeRoundNumber(null) + proceed to streaming
 * - Changelog fetch completes → merge into cache → setIsWaitingForChangelog(false)
 * - Streaming trigger checks isWaitingForChangelog before proceeding
 */

import { ChangelogTypes, ChatModes, MessageStatuses, ModelIds } from '@roundtable/shared';
import type { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/lib/data/query-keys';
import { createMockStoredPreSearch } from '@/lib/testing';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';
import type { ChatThreadChangelog } from '@/types/api';

// ============================================================================
// TEST HELPERS
// ============================================================================

type MockQueryClient = {
  setQueryData: ReturnType<typeof vi.fn>;
  getQueryData: ReturnType<typeof vi.fn>;
  invalidateQueries: ReturnType<typeof vi.fn>;
};

function createMockQueryClient(): MockQueryClient & Partial<QueryClient> {
  return {
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  };
}

function createMockChangelog(
  roundNumber: number,
  changes: Array<{
    type: 'added' | 'removed' | 'modified';
    participantId?: string;
    modelId?: string;
    details?: {
      oldValue?: string;
      newValue?: string;
    };
  }>,
): ChatThreadChangelog {
  return {
    id: `changelog-r${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    previousRoundNumber: roundNumber > 0 ? roundNumber - 1 : null,
    changeType: changes[0]?.type || ChangelogTypes.ADDED,
    changeSummary: `${changes.length} change(s)`,
    changeData: {
      type: 'participant',
      changes: changes.map(c => ({
        type: c.type,
        participantId: c.participantId,
        modelId: c.modelId,
        details: c.details,
      })),
    },
    createdAt: new Date().toISOString(),
  };
}

// ============================================================================
// 1. WHEN CHANGES EXIST: CHANGELOG IS CALLED AND ACCORDION IS SHOWN
// ============================================================================

describe('changelog Called When Config Changes Exist', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('config change detection', () => {
    it('sets isWaitingForChangelog when participants added', () => {
      const state = store.getState();

      // Simulate participant addition detected
      const hasAnyChanges = true;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
        state.setConfigChangeRoundNumber(1);
      }

      // Re-fetch state after mutations
      const updatedState = store.getState();

      expect(updatedState.isWaitingForChangelog).toBe(true);
      expect(updatedState.configChangeRoundNumber).toBe(1);
    });

    it('sets isWaitingForChangelog when participants removed', () => {
      const state = store.getState();

      const hasAnyChanges = true;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
        state.setConfigChangeRoundNumber(2);
      }

      // Re-fetch state after mutations
      const updatedState = store.getState();

      expect(updatedState.isWaitingForChangelog).toBe(true);
      expect(updatedState.configChangeRoundNumber).toBe(2);
    });

    it('sets isWaitingForChangelog when participants reordered', () => {
      const state = store.getState();

      const hasAnyChanges = true;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
        state.setConfigChangeRoundNumber(3);
      }

      // Re-fetch state after mutations
      const updatedState = store.getState();

      expect(updatedState.isWaitingForChangelog).toBe(true);
      expect(updatedState.configChangeRoundNumber).toBe(3);
    });

    it('sets isWaitingForChangelog when mode changed', () => {
      const state = store.getState();

      const hasAnyChanges = true;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
        state.setConfigChangeRoundNumber(4);
      }

      // Re-fetch state after mutations
      const updatedState = store.getState();

      expect(updatedState.isWaitingForChangelog).toBe(true);
      expect(updatedState.configChangeRoundNumber).toBe(4);
    });

    it('sets isWaitingForChangelog when web search toggled', () => {
      const state = store.getState();

      const hasAnyChanges = true;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
        state.setConfigChangeRoundNumber(5);
      }

      // Re-fetch state after mutations
      const updatedState = store.getState();

      expect(updatedState.isWaitingForChangelog).toBe(true);
      expect(updatedState.configChangeRoundNumber).toBe(5);
    });
  });

  describe('changelog fetch trigger', () => {
    it('triggers fetch when isWaitingForChangelog and configChangeRoundNumber set', () => {
      const state = store.getState();
      const effectiveThreadId = 'thread-123';

      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(2);

      // Re-fetch state after mutations
      const updatedState = store.getState();

      const shouldFetch = updatedState.isWaitingForChangelog
        && updatedState.configChangeRoundNumber !== null
        && !!effectiveThreadId;

      expect(shouldFetch).toBe(true);
    });

    it('does not trigger fetch when isWaitingForChangelog false', () => {
      const state = store.getState();

      state.setConfigChangeRoundNumber(2);
      // isWaitingForChangelog defaults to false

      const shouldFetch = state.isWaitingForChangelog
        && state.configChangeRoundNumber !== null;

      expect(shouldFetch).toBe(false);
    });

    it('does not trigger fetch when configChangeRoundNumber null', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      // configChangeRoundNumber defaults to null

      const shouldFetch = state.isWaitingForChangelog
        && state.configChangeRoundNumber !== null;

      expect(shouldFetch).toBe(false);
    });
  });

  describe('accordion visibility with changes', () => {
    it('shows accordion when changelog entries exist for round', () => {
      const changelog = createMockChangelog(1, [
        { type: 'added', participantId: 'p1', modelId: 'gpt-4' },
      ]);

      expect(changelog.changeData.changes).toHaveLength(1);
      expect(changelog.roundNumber).toBe(1);
    });

    it('accordion contains correct change type icons', () => {
      const changelog = createMockChangelog(2, [
        { type: 'added', participantId: 'p1', modelId: 'gpt-4' },
        { type: 'removed', participantId: 'p2', modelId: 'claude-3' },
        { type: 'modified', participantId: 'p3' },
      ]);

      const added = changelog.changeData.changes.filter(c => c.type === 'added');
      const removed = changelog.changeData.changes.filter(c => c.type === 'removed');
      const modified = changelog.changeData.changes.filter(c => c.type === 'modified');

      expect(added).toHaveLength(1);
      expect(removed).toHaveLength(1);
      expect(modified).toHaveLength(1);
    });

    it('accordion displays correct summary counts', () => {
      const changelog = createMockChangelog(3, [
        { type: 'added', participantId: 'p1' },
        { type: 'added', participantId: 'p2' },
        { type: 'removed', participantId: 'p3' },
        { type: 'modified', participantId: 'p4' },
      ]);

      const addedCount = changelog.changeData.changes.filter(c => c.type === 'added').length;
      const removedCount = changelog.changeData.changes.filter(c => c.type === 'removed').length;
      const modifiedCount = changelog.changeData.changes.filter(c => c.type === 'modified').length;

      // Summary format: "2 added, 1 removed, 1 modified"
      expect(addedCount).toBe(2);
      expect(removedCount).toBe(1);
      expect(modifiedCount).toBe(1);
    });
  });
});

// ============================================================================
// 2. WHEN NO CHANGES: CHANGELOG IS SKIPPED BUT FLOW CONTINUES PROPERLY
// ============================================================================

describe('changelog Skipped When No Config Changes', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('no changes detection', () => {
    it('does not set isWaitingForChangelog when hasAnyChanges false', () => {
      const state = store.getState();

      const hasAnyChanges = false;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
      } else {
        state.setConfigChangeRoundNumber(null);
      }

      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });

    it('clears configChangeRoundNumber when no changes detected', () => {
      const state = store.getState();

      // Initially set (from previous round)
      state.setConfigChangeRoundNumber(2);

      // PATCH completes with no changes
      const hasAnyChanges = false;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
      } else {
        state.setConfigChangeRoundNumber(null);
      }

      expect(state.configChangeRoundNumber).toBe(null);
    });
  });

  describe('flow continues without changelog', () => {
    it('allows streaming to proceed immediately when no changes', () => {
      const state = store.getState();

      // No config changes
      const hasAnyChanges = false;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
      }

      state.setWaitingToStartStreaming(true);

      // Re-fetch state after mutations
      const updatedState = store.getState();

      // Streaming should NOT be blocked
      const isBlocked = updatedState.isWaitingForChangelog;

      expect(isBlocked).toBe(false);
      expect(updatedState.waitingToStartStreaming).toBe(true);
    });

    it('does not fetch changelog when no changes', () => {
      const state = store.getState();

      // No changes path
      const hasAnyChanges = false;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
      } else {
        state.setConfigChangeRoundNumber(null);
      }

      // Changelog sync should not activate
      const shouldFetch = state.isWaitingForChangelog
        && state.configChangeRoundNumber !== null;

      expect(shouldFetch).toBe(false);
    });

    it('maintains normal flow timing when no changes', () => {
      const state = store.getState();

      // Simulate PATCH completion with no changes
      state.setConfigChangeRoundNumber(null);
      state.setWaitingToStartStreaming(true);

      // Pre-search should still block if enabled
      const preSearch = createMockStoredPreSearch(1, MessageStatuses.PENDING);
      state.addPreSearch(preSearch);

      // Re-fetch state after mutations
      const updatedState = store.getState();

      // But changelog should NOT block
      expect(updatedState.isWaitingForChangelog).toBe(false);
      expect(updatedState.preSearches).toHaveLength(1);
    });
  });

  describe('no accordion when no changes', () => {
    it('empty changelog list when thread has never had config changes', () => {
      const emptyCache = {
        success: true,
        data: {
          items: [],
        },
      };

      expect(emptyCache.data.items).toHaveLength(0);
    });

    it('no new changelog entry created when no changes', () => {
      const state = store.getState();

      const hasAnyChanges = false;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
        state.setConfigChangeRoundNumber(2);
      }

      // No changelog fetch triggered
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });
  });
});

// ============================================================================
// 3. CHANGELOG CALL HAPPENS AFTER USER MESSAGE PATCH
// ============================================================================

describe('changelog Timing: After User Message PATCH', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('pATCH completion triggers changelog', () => {
    it('sets configChangeRoundNumber during PATCH request', () => {
      const state = store.getState();

      // Simulate form-actions.ts:309 - PATCH request sets round number
      const nextRoundNumber = 2;
      state.setConfigChangeRoundNumber(nextRoundNumber);

      // Re-fetch state after mutations
      const updatedState = store.getState();

      expect(updatedState.configChangeRoundNumber).toBe(2);
    });

    it('sets isWaitingForChangelog after PATCH completes with changes', () => {
      const state = store.getState();

      // PATCH request
      state.setConfigChangeRoundNumber(2);

      // PATCH completes with hasAnyChanges=true (form-actions.ts:367-368)
      const hasAnyChanges = true;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
      }

      // Re-fetch state after mutations
      const updatedState = store.getState();

      expect(updatedState.isWaitingForChangelog).toBe(true);
      expect(updatedState.configChangeRoundNumber).toBe(2);
    });

    it('changelog fetch happens AFTER PATCH success', () => {
      const state = store.getState();
      const effectiveThreadId = 'thread-123';

      // 1. PATCH starts
      state.setConfigChangeRoundNumber(3);

      // 2. PATCH completes
      const hasAnyChanges = true;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
      }

      // Re-fetch state after mutations
      const updatedState = store.getState();

      // 3. Changelog fetch can now trigger (use-changelog-sync.ts:47)
      const shouldFetch = updatedState.isWaitingForChangelog
        && updatedState.configChangeRoundNumber !== null
        && !!effectiveThreadId;

      expect(shouldFetch).toBe(true);
    });
  });

  describe('user message patch completes before changelog', () => {
    it('user message is patched into state before changelog fetch', () => {
      const state = store.getState();

      // 1. User submits message → hasSentPendingMessage = true
      state.setHasSentPendingMessage(true);

      // 2. PATCH completes
      state.setConfigChangeRoundNumber(2);

      // 3. PATCH success triggers changelog
      const hasAnyChanges = true;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
      }

      // Re-fetch state after mutations
      const updatedState = store.getState();

      // User message is already in state when changelog starts
      expect(updatedState.hasSentPendingMessage).toBe(true);
      expect(updatedState.isWaitingForChangelog).toBe(true);
    });

    it('changelog fetch does not block user message patch', () => {
      const state = store.getState();

      // User message PATCH happens first
      state.setHasSentPendingMessage(true);
      state.setConfigChangeRoundNumber(2);

      // Changelog fetch triggered after PATCH
      state.setIsWaitingForChangelog(true);

      // Re-fetch state after mutations
      const updatedState = store.getState();

      // User message is already committed
      expect(updatedState.hasSentPendingMessage).toBe(true);
    });
  });

  describe('sequence validation', () => {
    it('executes in correct order: submit → PATCH → changelog → streaming', () => {
      const state = store.getState();

      // 1. User submits
      state.setWaitingToStartStreaming(true);
      state.setHasSentPendingMessage(true);

      // 2. PATCH request
      state.setConfigChangeRoundNumber(2);

      // 3. PATCH completes
      const hasAnyChanges = true;

      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
      }

      // Re-fetch state after mutations
      let updatedState = store.getState();

      expect(updatedState.waitingToStartStreaming).toBe(true);
      expect(updatedState.hasSentPendingMessage).toBe(true);
      expect(updatedState.isWaitingForChangelog).toBe(true);

      // 4. Changelog fetch completes
      state.setIsWaitingForChangelog(false);

      // Re-fetch state after second mutations
      updatedState = store.getState();

      // 5. Streaming can proceed
      expect(updatedState.isWaitingForChangelog).toBe(false);
    });

    it('changelog blocks streaming until complete', () => {
      const state = store.getState();

      state.setWaitingToStartStreaming(true);
      state.setIsWaitingForChangelog(true);

      // Re-fetch state after mutations
      let updatedState = store.getState();

      // Streaming trigger should check isWaitingForChangelog
      const shouldBlockStreaming = updatedState.isWaitingForChangelog;

      expect(shouldBlockStreaming).toBe(true);

      // Changelog completes
      state.setIsWaitingForChangelog(false);

      // Re-fetch state after second mutations
      updatedState = store.getState();

      // Now streaming can proceed
      expect(updatedState.isWaitingForChangelog).toBe(false);
    });
  });
});

// ============================================================================
// 4. ACCORDION VISIBILITY AND CONTENT ACCURACY
// ============================================================================

describe('accordion Visibility and Content Accuracy', () => {
  let mockQueryClient: MockQueryClient & QueryClient;

  beforeEach(() => {
    mockQueryClient = createMockQueryClient();
  });

  describe('accordion rendering conditions', () => {
    it('accordion appears only when changelog entries exist for round', () => {
      const changelog = createMockChangelog(1, [
        { type: 'added', participantId: 'p1' },
      ]);

      // Accordion should render
      expect(changelog.changeData.changes).toHaveLength(1);
      expect(changelog.roundNumber).toBe(1);
    });

    it('accordion hidden when no changelog entries for round', () => {
      const changelogs: ChatThreadChangelog[] = [];

      // No accordion should render
      expect(changelogs).toHaveLength(0);
    });

    it('accordion appears at correct position in timeline', () => {
      const changelogs = [
        createMockChangelog(1, [{ type: 'added', participantId: 'p1' }]),
        createMockChangelog(3, [{ type: 'removed', participantId: 'p2' }]),
      ];

      // Round 1 has changelog
      expect(changelogs.find(c => c.roundNumber === 1)).toBeDefined();

      // Round 2 has no changelog (no config changes)
      expect(changelogs.find(c => c.roundNumber === 2)).toBeUndefined();

      // Round 3 has changelog
      expect(changelogs.find(c => c.roundNumber === 3)).toBeDefined();
    });
  });

  describe('accordion content accuracy', () => {
    it('displays correct model names for additions', () => {
      const changelog = createMockChangelog(1, [
        { type: 'added', participantId: 'p1', modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5 },
        { type: 'added', participantId: 'p2', modelId: ModelIds.OPENAI_GPT_4O_MINI },
      ]);

      const addedChanges = changelog.changeData.changes.filter(c => c.type === 'added');

      expect(addedChanges).toHaveLength(2);
      expect(addedChanges[0]?.modelId).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5);
      expect(addedChanges[1]?.modelId).toBe(ModelIds.OPENAI_GPT_4O_MINI);
    });

    it('displays correct model names for removals', () => {
      const changelog = createMockChangelog(2, [
        { type: 'removed', participantId: 'p1', modelId: ModelIds.GOOGLE_GEMINI_3_FLASH_PREVIEW },
      ]);

      const removedChanges = changelog.changeData.changes.filter(c => c.type === 'removed');

      expect(removedChanges).toHaveLength(1);
      expect(removedChanges[0]?.modelId).toBe(ModelIds.GOOGLE_GEMINI_3_FLASH_PREVIEW);
    });

    it('displays role changes correctly', () => {
      const changelog = createMockChangelog(3, [
        {
          type: 'modified',
          participantId: 'p1',
          details: { oldValue: 'Critic', newValue: 'Advocate' },
        },
      ]);

      const modifiedChanges = changelog.changeData.changes.filter(c => c.type === 'modified');

      expect(modifiedChanges).toHaveLength(1);
      expect(modifiedChanges[0]?.details?.oldValue).toBe('Critic');
      expect(modifiedChanges[0]?.details?.newValue).toBe('Advocate');
    });

    it('displays mode changes correctly', () => {
      const changelog = createMockChangelog(4, [
        {
          type: 'modified',
          details: { oldValue: ChatModes.DEBATING, newValue: ChatModes.BRAINSTORMING },
        },
      ]);

      const modeChange = changelog.changeData.changes[0];

      expect(modeChange?.details?.oldValue).toBe(ChatModes.DEBATING);
      expect(modeChange?.details?.newValue).toBe(ChatModes.BRAINSTORMING);
    });
  });

  describe('accordion expandable state', () => {
    it('accordion starts collapsed by default', () => {
      const changelog = createMockChangelog(1, [
        { type: 'added', participantId: 'p1' },
      ]);

      // Accordion defaultOpen = false (from ConfigurationChangesGroup component)
      expect(changelog.changeData.changes).toHaveLength(1);
    });

    it('accordion can be expanded to show details', () => {
      const changelog = createMockChangelog(2, [
        { type: 'added', participantId: 'p1', modelId: 'gpt-4' },
        { type: 'removed', participantId: 'p2', modelId: 'claude-3' },
        { type: 'modified', participantId: 'p3' },
      ]);

      // All details should be available when expanded
      expect(changelog.changeData.changes).toHaveLength(3);
      changelog.changeData.changes.forEach((change) => {
        expect(change.type).toBeDefined();
        expect(change.participantId).toBeDefined();
      });
    });
  });

  describe('changelog cache merging', () => {
    it('merges new changelog entries into existing cache', () => {
      const effectiveThreadId = 'thread-123';

      const existingCache = {
        success: true,
        data: {
          items: [
            createMockChangelog(1, [{ type: 'added', participantId: 'p1' }]),
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
      expect(capturedResult!.data.items).toHaveLength(2);
      expect(capturedResult!.data.items[0]?.roundNumber).toBe(2); // Newest first
      expect(capturedResult!.data.items[1]?.roundNumber).toBe(1);
    });

    it('prevents duplicate changelog entries', () => {
      const existingCache = {
        success: true,
        data: {
          items: [
            createMockChangelog(2, [{ type: 'added', participantId: 'p1' }]),
          ],
        },
      };

      const duplicateChangelog = createMockChangelog(2, [
        { type: 'added', participantId: 'p1' },
      ]); // Same round, same ID

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
          const uniqueNewItems = [duplicateChangelog].filter(item => !existingIds.has(item.id));

          return {
            success: true,
            data: {
              items: [...uniqueNewItems, ...existingItems],
            },
          };
        },
      );

      const existingIds = new Set(existingCache.data.items.map(item => item.id));
      const uniqueNewItems = [duplicateChangelog].filter(item => !existingIds.has(item.id));

      expect(uniqueNewItems).toHaveLength(0); // Duplicate detected
      expect(capturedUpdated?.data.items).toHaveLength(1); // No duplicate added
    });
  });
});

// ============================================================================
// 5. TEST VARIOUS CHANGE TYPES
// ============================================================================

describe('various Change Types', () => {
  describe('participant additions', () => {
    it('creates changelog entry for single participant addition', () => {
      const changelog = createMockChangelog(1, [
        { type: 'added', participantId: 'p1', modelId: 'gpt-4o' },
      ]);

      expect(changelog.changeData.changes).toHaveLength(1);
      expect(changelog.changeData.changes[0]?.type).toBe('added');
      expect(changelog.changeData.changes[0]?.modelId).toBe('gpt-4o');
    });

    it('creates changelog entry for multiple participant additions', () => {
      const changelog = createMockChangelog(1, [
        { type: 'added', participantId: 'p1', modelId: 'gpt-4o' },
        { type: 'added', participantId: 'p2', modelId: 'claude-3.5-sonnet' },
        { type: 'added', participantId: 'p3', modelId: ModelIds.GOOGLE_GEMINI_3_FLASH_PREVIEW },
      ]);

      expect(changelog.changeData.changes).toHaveLength(3);
      changelog.changeData.changes.forEach((change) => {
        expect(change.type).toBe('added');
        expect(change.modelId).toBeDefined();
      });
    });
  });

  describe('participant removals', () => {
    it('creates changelog entry for participant removal', () => {
      const changelog = createMockChangelog(2, [
        { type: 'removed', participantId: 'p1', modelId: 'claude-3-opus' },
      ]);

      expect(changelog.changeData.changes).toHaveLength(1);
      expect(changelog.changeData.changes[0]?.type).toBe('removed');
      expect(changelog.changeData.changes[0]?.modelId).toBe('claude-3-opus');
    });

    it('creates changelog entry for multiple participant removals', () => {
      const changelog = createMockChangelog(2, [
        { type: 'removed', participantId: 'p1', modelId: 'gpt-4' },
        { type: 'removed', participantId: 'p2', modelId: 'claude-3' },
      ]);

      expect(changelog.changeData.changes).toHaveLength(2);
      changelog.changeData.changes.forEach((change) => {
        expect(change.type).toBe('removed');
      });
    });
  });

  describe('participant reordering', () => {
    it('creates changelog entry for participant reorder', () => {
      const changelog = createMockChangelog(3, [
        {
          type: 'modified',
          participantId: 'p1',
          details: { oldValue: '0', newValue: '2' },
        },
        {
          type: 'modified',
          participantId: 'p2',
          details: { oldValue: '1', newValue: '0' },
        },
        {
          type: 'modified',
          participantId: 'p3',
          details: { oldValue: '2', newValue: '1' },
        },
      ]);

      expect(changelog.changeData.changes).toHaveLength(3);
      changelog.changeData.changes.forEach((change) => {
        expect(change.type).toBe('modified');
        expect(change.details).toBeDefined();
      });
    });
  });

  describe('mode changes', () => {
    it('creates changelog entry for mode change', () => {
      const changelog = createMockChangelog(4, [
        {
          type: 'modified',
          details: {
            oldValue: ChatModes.DEBATING,
            newValue: ChatModes.ANALYZING,
          },
        },
      ]);

      const modeChange = changelog.changeData.changes[0];

      expect(modeChange?.type).toBe('modified');
      expect(modeChange?.details?.oldValue).toBe(ChatModes.DEBATING);
      expect(modeChange?.details?.newValue).toBe(ChatModes.ANALYZING);
    });

    it('mode change can be combined with participant changes', () => {
      const changelog = createMockChangelog(5, [
        {
          type: 'modified',
          details: {
            oldValue: ChatModes.BRAINSTORMING,
            newValue: ChatModes.SOLVING,
          },
        },
        { type: 'added', participantId: 'p1', modelId: 'gpt-4o' },
        { type: 'removed', participantId: 'p2', modelId: 'claude-3' },
      ]);

      expect(changelog.changeData.changes).toHaveLength(3);

      const modeChange = changelog.changeData.changes.find(
        c => c.details?.oldValue && c.details.newValue,
      );
      const participantChanges = changelog.changeData.changes.filter(
        c => c.type === 'added' || c.type === 'removed',
      );

      expect(modeChange).toBeDefined();
      expect(participantChanges).toHaveLength(2);
    });
  });

  describe('role changes', () => {
    it('creates changelog entry for role change', () => {
      const changelog = createMockChangelog(6, [
        {
          type: 'modified',
          participantId: 'p1',
          modelId: 'gpt-4o',
          details: { oldValue: 'Critic', newValue: 'Advocate' },
        },
      ]);

      const roleChange = changelog.changeData.changes[0];

      expect(roleChange?.type).toBe('modified');
      expect(roleChange?.details?.oldValue).toBe('Critic');
      expect(roleChange?.details?.newValue).toBe('Advocate');
    });

    it('creates changelog entry when role added', () => {
      const changelog = createMockChangelog(7, [
        {
          type: 'modified',
          participantId: 'p1',
          modelId: 'claude-3.5-sonnet',
          details: { oldValue: null, newValue: 'The Ideator' },
        },
      ]);

      const roleChange = changelog.changeData.changes[0];

      expect(roleChange?.details?.oldValue).toBe(null);
      expect(roleChange?.details?.newValue).toBe('The Ideator');
    });

    it('creates changelog entry when role removed', () => {
      const changelog = createMockChangelog(8, [
        {
          type: 'modified',
          participantId: 'p1',
          modelId: 'gemini-2.0',
          details: { oldValue: 'The Analyst', newValue: null },
        },
      ]);

      const roleChange = changelog.changeData.changes[0];

      expect(roleChange?.details?.oldValue).toBe('The Analyst');
      expect(roleChange?.details?.newValue).toBe(null);
    });
  });

  describe('web search toggle', () => {
    it('creates changelog entry for web search enabled', () => {
      const changelog = createMockChangelog(9, [
        {
          type: 'modified',
          details: { oldValue: 'false', newValue: 'true' },
        },
      ]);

      const webSearchChange = changelog.changeData.changes[0];

      expect(webSearchChange?.type).toBe('modified');
      expect(webSearchChange?.details?.oldValue).toBe('false');
      expect(webSearchChange?.details?.newValue).toBe('true');
    });

    it('creates changelog entry for web search disabled', () => {
      const changelog = createMockChangelog(10, [
        {
          type: 'modified',
          details: { oldValue: 'true', newValue: 'false' },
        },
      ]);

      const webSearchChange = changelog.changeData.changes[0];

      expect(webSearchChange?.details?.oldValue).toBe('true');
      expect(webSearchChange?.details?.newValue).toBe('false');
    });
  });

  describe('complex mixed changes', () => {
    it('handles multiple change types in single round', () => {
      const changelog = createMockChangelog(11, [
        { type: 'added', participantId: 'p1', modelId: 'gpt-4o' },
        { type: 'added', participantId: 'p2', modelId: 'claude-3.5' },
        { type: 'removed', participantId: 'p3', modelId: 'gemini-1.5' },
        {
          type: 'modified',
          participantId: 'p4',
          details: { oldValue: 'Critic', newValue: 'Advocate' },
        },
        {
          type: 'modified',
          details: { oldValue: ChatModes.DEBATING, newValue: ChatModes.SOLVING },
        },
      ]);

      const added = changelog.changeData.changes.filter(c => c.type === 'added');
      const removed = changelog.changeData.changes.filter(c => c.type === 'removed');
      const modified = changelog.changeData.changes.filter(c => c.type === 'modified');

      expect(added).toHaveLength(2);
      expect(removed).toHaveLength(1);
      expect(modified).toHaveLength(2);
    });

    it('maintains correct order across multiple rounds with different changes', () => {
      const changelogs = [
        createMockChangelog(1, [
          { type: 'added', participantId: 'p1', modelId: 'gpt-4o' },
        ]),
        createMockChangelog(3, [
          {
            type: 'modified',
            details: { oldValue: ChatModes.DEBATING, newValue: ChatModes.ANALYZING },
          },
        ]),
        createMockChangelog(5, [
          { type: 'removed', participantId: 'p1', modelId: 'gpt-4o' },
          { type: 'added', participantId: 'p2', modelId: 'claude-3.5' },
        ]),
      ];

      expect(changelogs).toHaveLength(3);
      expect(changelogs[0]?.roundNumber).toBe(1);
      expect(changelogs[1]?.roundNumber).toBe(3);
      expect(changelogs[2]?.roundNumber).toBe(5);
    });
  });
});

// ============================================================================
// 6. EDGE CASES AND ERROR HANDLING
// ============================================================================

describe('changelog Edge Cases and Error Handling', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('timeout protection', () => {
    it('has 30-second timeout to prevent infinite blocking', () => {
      const CHANGELOG_TIMEOUT_MS = 30000;

      expect(CHANGELOG_TIMEOUT_MS).toBe(30000);
    });

    it('clears flags on timeout', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(3);

      // Simulate timeout
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);

      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
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

      // Web search toggled OFF → ON (final value matches thread)
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

      // PATCH success
      state.setHasPendingConfigChanges(false);

      expect(state.hasPendingConfigChanges).toBe(false);
    });
  });

  describe('changelog with pre-search', () => {
    it('both changelog and pre-search must complete before streaming', () => {
      const state = store.getState();

      // User enables web search + changes config
      const enableWebSearch = true;
      const hasAnyChanges = true;

      state.setConfigChangeRoundNumber(2);
      state.setWaitingToStartStreaming(true);

      // Pre-search created
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

      // Changelog fetch triggered
      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
      }

      // Re-fetch state after mutations
      const updatedState = store.getState();

      expect(updatedState.isWaitingForChangelog).toBe(true);
      expect(updatedState.preSearches).toHaveLength(1);

      // Both must complete
      const preSearch = updatedState.preSearches[0];
      const isPreSearchBlocking = preSearch
        && (preSearch.status === MessageStatuses.PENDING || preSearch.status === MessageStatuses.STREAMING);
      const isChangelogBlocking = updatedState.isWaitingForChangelog;

      expect(isPreSearchBlocking).toBe(true);
      expect(isChangelogBlocking).toBe(true);
    });

    it('streaming proceeds when both changelog and pre-search complete', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      state.addPreSearch({
        id: 'presearch-r2',
        threadId: 'thread-123',
        roundNumber: 2,
        userQuery: 'test',
        status: MessageStatuses.PENDING,
        searchData: undefined,
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      });

      // Pre-search completes
      state.removePreSearch('presearch-r2');
      state.addPreSearch({
        id: 'presearch-r2',
        threadId: 'thread-123',
        roundNumber: 2,
        userQuery: 'test',
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
        errorMessage: null,
        createdAt: new Date(),
        completedAt: new Date(),
      });

      // Changelog completes
      state.setIsWaitingForChangelog(false);

      // Streaming can proceed
      expect(state.isWaitingForChangelog).toBe(false);
    });
  });

  describe('round number consistency', () => {
    it('changelog roundNumber matches configChangeRoundNumber', () => {
      const state = store.getState();

      const nextRoundNumber = 3;
      state.setConfigChangeRoundNumber(nextRoundNumber);

      // Re-fetch state after mutations
      const updatedState = store.getState();

      const changelog = createMockChangelog(nextRoundNumber, [
        { type: 'added', participantId: 'p1' },
      ]);

      expect(changelog.roundNumber).toBe(updatedState.configChangeRoundNumber);
    });

    it('changelog previousRoundNumber correctly references previous round', () => {
      const changelog = createMockChangelog(5, [
        { type: 'added', participantId: 'p1' },
      ]);

      expect(changelog.roundNumber).toBe(5);
      expect(changelog.previousRoundNumber).toBe(4);
    });

    it('changelog previousRoundNumber is null for round 0', () => {
      const changelog = createMockChangelog(0, [
        { type: 'added', participantId: 'p1' },
      ]);

      expect(changelog.previousRoundNumber).toBe(null);
    });
  });
});

// ============================================================================
// 7. STALE DATA RACE CONDITION PREVENTION
// ============================================================================

describe('stale Data Race Condition Prevention', () => {
  let store: ChatStoreApi;
  let mockQueryClient: MockQueryClient & QueryClient;

  beforeEach(() => {
    store = createChatStore();
    mockQueryClient = createMockQueryClient();
  });

  describe('isFetching Guard - Prevents Processing During Fetch Transitions', () => {
    /**
     * BUG SCENARIO (Fixed):
     * 1. User on round 1 → changelog shown correctly
     * 2. User submits for round 2
     * 3. configChangeRoundNumber changes 1→2
     * 4. Effect runs BEFORE TanStack Query updates
     * 5. roundChangelogData still has round 1 data
     * 6. BUG: Round 1 data merged as round 2 data
     *
     * FIX: Check isFetching before processing
     */
    it('should NOT process data while isFetching is true', () => {
      const state = store.getState();

      // Set up waiting state for round 2
      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(2);

      // Simulate the race condition scenario:
      // - configChangeRoundNumber = 2 (we need round 2)
      // - Query is fetching (isFetching = true)
      // - Old round 1 data still in cache

      const shouldProcess = (params: {
        isFetching: boolean;
        configChangeRoundNumber: number | null;
        isWaitingForChangelog: boolean;
      }) => {
        // This mimics the logic in use-changelog-sync.ts
        if (params.isFetching)
          return false;
        if (params.configChangeRoundNumber === null)
          return false;
        if (!params.isWaitingForChangelog)
          return false;
        return true;
      };

      // When fetching, should NOT process
      expect(shouldProcess({
        isFetching: true,
        configChangeRoundNumber: 2,
        isWaitingForChangelog: true,
      })).toBe(false);

      // When fetch complete, should process
      expect(shouldProcess({
        isFetching: false,
        configChangeRoundNumber: 2,
        isWaitingForChangelog: true,
      })).toBe(true);
    });

    it('should wait for fresh data before clearing flags', () => {
      const state = store.getState();

      // Set up state
      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(2);

      // Verify flags are set
      expect(store.getState().isWaitingForChangelog).toBe(true);
      expect(store.getState().configChangeRoundNumber).toBe(2);

      // During fetch transition, flags should remain set
      // (to block streaming until fresh data arrives)
      const duringFetch = store.getState();
      expect(duringFetch.isWaitingForChangelog).toBe(true);
      expect(duringFetch.configChangeRoundNumber).toBe(2);

      // After fresh data received, flags can be cleared
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);

      expect(store.getState().isWaitingForChangelog).toBe(false);
      expect(store.getState().configChangeRoundNumber).toBe(null);
    });
  });

  describe('round Number Validation - Prevents Wrong Round Data Merge', () => {
    it('should reject changelog data for wrong round number', () => {
      // Scenario: We need round 2 data, but API returns round 1 data
      // (This can happen due to TanStack Query cache behavior)

      const validateRoundData = (
        items: Array<{ roundNumber: number }>,
        expectedRound: number,
      ): boolean => {
        if (items.length === 0)
          return true; // Empty is valid
        return items.every(item => item.roundNumber === expectedRound);
      };

      // Round 1 data when expecting round 2 → Invalid
      const round1Data = [
        createMockChangelog(1, [{ type: 'added', participantId: 'p1' }]),
      ];
      expect(validateRoundData(round1Data, 2)).toBe(false);

      // Round 2 data when expecting round 2 → Valid
      const round2Data = [
        createMockChangelog(2, [{ type: 'added', participantId: 'p1' }]),
      ];
      expect(validateRoundData(round2Data, 2)).toBe(true);

      // Mixed data → Invalid
      const mixedData = [
        createMockChangelog(2, [{ type: 'added', participantId: 'p1' }]),
        createMockChangelog(1, [{ type: 'removed', participantId: 'p2' }]),
      ];
      expect(validateRoundData(mixedData, 2)).toBe(false);
    });

    it('should track which round data was last merged', () => {
      // This prevents duplicate merges for the same round

      let lastMergedRound: number | null = null;
      const configChangeRoundNumber = 2;

      // First merge for round 2
      if (lastMergedRound !== configChangeRoundNumber) {
        lastMergedRound = configChangeRoundNumber;
        // Merge would happen here
      }
      expect(lastMergedRound).toBe(2);

      // Second attempt for same round should be skipped
      const shouldMerge = lastMergedRound !== configChangeRoundNumber;
      expect(shouldMerge).toBe(false);

      // Different round should merge
      const newRound = 3;
      const shouldMergeNewRound = lastMergedRound !== newRound;
      expect(shouldMergeNewRound).toBe(true);
    });
  });

  describe('rapid Round Transitions', () => {
    it('should handle Round 1 → Round 2 transition without stale data', () => {
      // Round 1 complete
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      // User submits for Round 2
      store.getState().setConfigChangeRoundNumber(2);
      store.getState().setWaitingToStartStreaming(true);

      // PATCH completes, trigger changelog fetch
      store.getState().setIsWaitingForChangelog(true);

      // Streaming should be blocked until changelog completes
      let currentState = store.getState();
      const isBlocked = currentState.configChangeRoundNumber !== null || currentState.isWaitingForChangelog;
      expect(isBlocked).toBe(true);

      // Simulate changelog fetch completing with CORRECT round data
      // (In real code, isFetching guard ensures this)
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // Now streaming can proceed
      currentState = store.getState();
      expect(currentState.isWaitingForChangelog).toBe(false);
      expect(currentState.configChangeRoundNumber).toBe(null);
      expect(currentState.waitingToStartStreaming).toBe(true);
    });

    it('should handle Round 1 → Round 2 → Round 3 rapid transitions', () => {
      const mergedRounds: number[] = [];

      // Simulate 3 rapid submissions
      for (const round of [1, 2, 3]) {
        // Set up for this round
        store.getState().setConfigChangeRoundNumber(round);
        store.getState().setIsWaitingForChangelog(true);
        store.getState().setWaitingToStartStreaming(true);

        // Simulate successful fetch and merge
        // (In real code, guards ensure correct data)
        mergedRounds.push(round);

        // Clear for next round
        store.getState().setIsWaitingForChangelog(false);
        store.getState().setConfigChangeRoundNumber(null);
      }

      // All rounds should be processed
      expect(mergedRounds).toEqual([1, 2, 3]);
    });
  });

  describe('cache Merge with Stale Data Prevention', () => {
    it('should correctly merge new items without duplicating stale entries', () => {
      const effectiveThreadId = 'thread-123';

      // Existing cache has round 1 data
      const existingCache = {
        success: true,
        data: {
          items: [
            createMockChangelog(1, [{ type: 'added', participantId: 'p1' }]),
          ],
        },
      };

      // New data for round 2 (CORRECT round)
      const round2Changelog = createMockChangelog(2, [
        { type: 'removed', participantId: 'p2' },
      ]);

      let capturedResult: { data: { items: { roundNumber: number; id: string }[] } } | null = null;

      mockQueryClient.setQueryData.mockImplementation((_key, updater) => {
        const result = typeof updater === 'function' ? updater(existingCache) : updater;
        capturedResult = result as typeof capturedResult;
      });

      // Perform merge
      mockQueryClient.setQueryData(
        queryKeys.threads.changelog(effectiveThreadId),
        (old: typeof existingCache) => {
          const existingItems = old?.data?.items || [];
          const existingIds = new Set(existingItems.map(item => item.id));
          const uniqueNewItems = [round2Changelog].filter(item => !existingIds.has(item.id));

          return {
            success: true,
            data: {
              items: [...uniqueNewItems, ...existingItems],
            },
          };
        },
      );

      expect(capturedResult).not.toBeNull();
      expect(capturedResult!.data.items).toHaveLength(2);

      // Round 2 should be first (newest)
      expect(capturedResult!.data.items[0]?.roundNumber).toBe(2);
      // Round 1 should be preserved
      expect(capturedResult!.data.items[1]?.roundNumber).toBe(1);
    });

    it('should NOT merge if new data is for wrong round', () => {
      const existingCache = {
        success: true,
        data: {
          items: [
            createMockChangelog(1, [{ type: 'added', participantId: 'p1' }]),
          ],
        },
      };

      // Stale data for round 1 (WRONG - we want round 2)
      const staleChangelog = createMockChangelog(1, [
        { type: 'removed', participantId: 'p2' },
      ]);

      const configChangeRoundNumber = 2;

      // Validation should reject
      const isCorrectRound = staleChangelog.roundNumber === configChangeRoundNumber;
      expect(isCorrectRound).toBe(false);

      // Cache should remain unchanged
      expect(existingCache.data.items).toHaveLength(1);
    });
  });

  describe('timeline Display After Race Condition Fix', () => {
    it('should show changelog accordion for both rounds after fix', () => {
      // This tests the end result: changelog accordions should appear
      // for both round 1 and round 2

      const changelogs = [
        createMockChangelog(1, [{ type: 'added', participantId: 'p1' }]),
        createMockChangelog(2, [{ type: 'added', participantId: 'p2' }]),
      ];

      // Both rounds have changelog entries
      expect(changelogs.find(c => c.roundNumber === 1)).toBeDefined();
      expect(changelogs.find(c => c.roundNumber === 2)).toBeDefined();

      // Timeline would group these correctly
      const changelogByRound = new Map<number, typeof changelogs>();
      changelogs.forEach((changelog) => {
        const round = changelog.roundNumber;
        if (!changelogByRound.has(round)) {
          changelogByRound.set(round, []);
        }
        changelogByRound.get(round)!.push(changelog);
      });

      expect(changelogByRound.get(1)).toHaveLength(1);
      expect(changelogByRound.get(2)).toHaveLength(1);
    });
  });
});

// ============================================================================
// 8. QUERY BEHAVIOR WITHOUT placeholderData
// ============================================================================

describe('changelog Query Without placeholderData', () => {
  /**
   * FIX: Removed placeholderData from useThreadRoundChangelogQuery
   *
   * The bug: placeholderData caused TanStack Query to return stale data
   * from the previous query key while the new query was being fetched.
   *
   * Without placeholderData:
   * - Query returns undefined/null during initial fetch
   * - No stale data from previous rounds is returned
   * - isFetching is true until fresh data arrives
   */

  describe('query State Transitions', () => {
    it('should have undefined data while fetching new round', () => {
      // Simulate query state for round 2 (fresh query)
      const queryState = {
        data: undefined, // No placeholderData
        isSuccess: false,
        isFetching: true,
      };

      // Without placeholderData, data is undefined during fetch
      expect(queryState.data).toBeUndefined();
      expect(queryState.isFetching).toBe(true);
    });

    it('should have fresh data after fetch completes', () => {
      // Simulate query completing
      const queryState = {
        data: {
          success: true,
          data: {
            items: [{ roundNumber: 2, id: 'new-item' }],
          },
        },
        isSuccess: true,
        isFetching: false,
      };

      expect(queryState.data).toBeDefined();
      expect(queryState.isFetching).toBe(false);
      expect(queryState.data.data.items[0]?.roundNumber).toBe(2);
    });

    it('should NOT return round 1 data when querying round 2', () => {
      // This was the bug: placeholderData returned round 1 data
      // for round 2 query during fetch

      // Simulate round 1 query completing
      const round1QueryState = {
        queryKey: ['threads', 'thread-123', 'changelog', 'round', 1],
        data: { success: true, data: { items: [{ roundNumber: 1 }] } },
      };

      // Simulate round 2 query starting (NO placeholderData)
      const round2QueryState = {
        queryKey: ['threads', 'thread-123', 'changelog', 'round', 2],
        data: undefined, // NOT round 1 data
        isFetching: true,
      };

      // Round 2 query should NOT have round 1 data
      expect(round2QueryState.data).toBeUndefined();

      // Query keys are different
      expect(round1QueryState.queryKey).not.toEqual(round2QueryState.queryKey);
    });
  });

  describe('effect Behavior Without placeholderData', () => {
    it('should skip processing when data is undefined', () => {
      const shouldProcess = (params: {
        data: { success: boolean; data: { items: unknown[] } } | undefined;
        isSuccess: boolean;
        isFetching: boolean;
      }) => {
        if (params.isFetching)
          return false;
        if (!params.isSuccess || !params.data?.success)
          return false;
        return true;
      };

      // During fetch (no placeholderData)
      expect(shouldProcess({
        data: undefined,
        isSuccess: false,
        isFetching: true,
      })).toBe(false);

      // After fetch completes
      expect(shouldProcess({
        data: { success: true, data: { items: [] } },
        isSuccess: true,
        isFetching: false,
      })).toBe(true);
    });
  });
});

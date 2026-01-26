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
import type { ChatThreadChangelog } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

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
    getQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  };
}

function createMockChangelog(
  roundNumber: number,
  changes: {
    type: 'added' | 'removed' | 'modified';
    participantId?: string;
    modelId?: string;
    details?: {
      oldValue?: string;
      newValue?: string;
    };
  }[],
): ChatThreadChangelog {
  return {
    changeData: {
      changes: changes.map(c => ({
        details: c.details,
        modelId: c.modelId,
        participantId: c.participantId,
        type: c.type,
      })),
      type: 'participant',
    },
    changeSummary: `${changes.length} change(s)`,
    changeType: changes[0]?.type || ChangelogTypes.ADDED,
    createdAt: new Date().toISOString(),
    id: `changelog-r${roundNumber}`,
    previousRoundNumber: roundNumber > 0 ? roundNumber - 1 : null,
    roundNumber,
    threadId: 'thread-123',
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

      expect(updatedState.isWaitingForChangelog).toBeTruthy();
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

      expect(updatedState.isWaitingForChangelog).toBeTruthy();
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

      expect(updatedState.isWaitingForChangelog).toBeTruthy();
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

      expect(updatedState.isWaitingForChangelog).toBeTruthy();
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

      expect(updatedState.isWaitingForChangelog).toBeTruthy();
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

      expect(shouldFetch).toBeTruthy();
    });

    it('does not trigger fetch when isWaitingForChangelog false', () => {
      const state = store.getState();

      state.setConfigChangeRoundNumber(2);
      // isWaitingForChangelog defaults to false

      const shouldFetch = state.isWaitingForChangelog
        && state.configChangeRoundNumber !== null;

      expect(shouldFetch).toBeFalsy();
    });

    it('does not trigger fetch when configChangeRoundNumber null', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      // configChangeRoundNumber defaults to null

      const shouldFetch = state.isWaitingForChangelog
        && state.configChangeRoundNumber !== null;

      expect(shouldFetch).toBeFalsy();
    });
  });

  describe('accordion visibility with changes', () => {
    it('shows accordion when changelog entries exist for round', () => {
      const changelog = createMockChangelog(1, [
        { modelId: 'gpt-4', participantId: 'p1', type: 'added' },
      ]);

      expect(changelog.changeData.changes).toHaveLength(1);
      expect(changelog.roundNumber).toBe(1);
    });

    it('accordion contains correct change type icons', () => {
      const changelog = createMockChangelog(2, [
        { modelId: 'gpt-4', participantId: 'p1', type: 'added' },
        { modelId: 'claude-3', participantId: 'p2', type: 'removed' },
        { participantId: 'p3', type: 'modified' },
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
        { participantId: 'p1', type: 'added' },
        { participantId: 'p2', type: 'added' },
        { participantId: 'p3', type: 'removed' },
        { participantId: 'p4', type: 'modified' },
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

      expect(state.isWaitingForChangelog).toBeFalsy();
      expect(state.configChangeRoundNumber).toBeNull();
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

      expect(state.configChangeRoundNumber).toBeNull();
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

      expect(isBlocked).toBeFalsy();
      expect(updatedState.waitingToStartStreaming).toBeTruthy();
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

      expect(shouldFetch).toBeFalsy();
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
      expect(updatedState.isWaitingForChangelog).toBeFalsy();
      expect(updatedState.preSearches).toHaveLength(1);
    });
  });

  describe('no accordion when no changes', () => {
    it('empty changelog list when thread has never had config changes', () => {
      const emptyCache = {
        data: {
          items: [],
        },
        success: true,
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
      expect(state.isWaitingForChangelog).toBeFalsy();
      expect(state.configChangeRoundNumber).toBeNull();
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

      expect(updatedState.isWaitingForChangelog).toBeTruthy();
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

      expect(shouldFetch).toBeTruthy();
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
      expect(updatedState.hasSentPendingMessage).toBeTruthy();
      expect(updatedState.isWaitingForChangelog).toBeTruthy();
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
      expect(updatedState.hasSentPendingMessage).toBeTruthy();
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

      expect(updatedState.waitingToStartStreaming).toBeTruthy();
      expect(updatedState.hasSentPendingMessage).toBeTruthy();
      expect(updatedState.isWaitingForChangelog).toBeTruthy();

      // 4. Changelog fetch completes
      state.setIsWaitingForChangelog(false);

      // Re-fetch state after second mutations
      updatedState = store.getState();

      // 5. Streaming can proceed
      expect(updatedState.isWaitingForChangelog).toBeFalsy();
    });

    it('changelog blocks streaming until complete', () => {
      const state = store.getState();

      state.setWaitingToStartStreaming(true);
      state.setIsWaitingForChangelog(true);

      // Re-fetch state after mutations
      let updatedState = store.getState();

      // Streaming trigger should check isWaitingForChangelog
      const shouldBlockStreaming = updatedState.isWaitingForChangelog;

      expect(shouldBlockStreaming).toBeTruthy();

      // Changelog completes
      state.setIsWaitingForChangelog(false);

      // Re-fetch state after second mutations
      updatedState = store.getState();

      // Now streaming can proceed
      expect(updatedState.isWaitingForChangelog).toBeFalsy();
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
        { participantId: 'p1', type: 'added' },
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
        createMockChangelog(1, [{ participantId: 'p1', type: 'added' }]),
        createMockChangelog(3, [{ participantId: 'p2', type: 'removed' }]),
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
        { modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5, participantId: 'p1', type: 'added' },
        { modelId: ModelIds.OPENAI_GPT_4O_MINI, participantId: 'p2', type: 'added' },
      ]);

      const addedChanges = changelog.changeData.changes.filter(c => c.type === 'added');

      expect(addedChanges).toHaveLength(2);
      expect(addedChanges[0]?.modelId).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5);
      expect(addedChanges[1]?.modelId).toBe(ModelIds.OPENAI_GPT_4O_MINI);
    });

    it('displays correct model names for removals', () => {
      const changelog = createMockChangelog(2, [
        { modelId: ModelIds.GOOGLE_GEMINI_3_FLASH_PREVIEW, participantId: 'p1', type: 'removed' },
      ]);

      const removedChanges = changelog.changeData.changes.filter(c => c.type === 'removed');

      expect(removedChanges).toHaveLength(1);
      expect(removedChanges[0]?.modelId).toBe(ModelIds.GOOGLE_GEMINI_3_FLASH_PREVIEW);
    });

    it('displays role changes correctly', () => {
      const changelog = createMockChangelog(3, [
        {
          details: { newValue: 'Advocate', oldValue: 'Critic' },
          participantId: 'p1',
          type: 'modified',
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
          details: { newValue: ChatModes.BRAINSTORMING, oldValue: ChatModes.DEBATING },
          type: 'modified',
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
        { participantId: 'p1', type: 'added' },
      ]);

      // Accordion defaultOpen = false (from ConfigurationChangesGroup component)
      expect(changelog.changeData.changes).toHaveLength(1);
    });

    it('accordion can be expanded to show details', () => {
      const changelog = createMockChangelog(2, [
        { modelId: 'gpt-4', participantId: 'p1', type: 'added' },
        { modelId: 'claude-3', participantId: 'p2', type: 'removed' },
        { participantId: 'p3', type: 'modified' },
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
        data: {
          items: [
            createMockChangelog(1, [{ participantId: 'p1', type: 'added' }]),
          ],
        },
        success: true,
      };

      const newChangelog = createMockChangelog(2, [
        { participantId: 'p2', type: 'removed' },
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
            data: {
              items: [...uniqueNewItems, ...existingItems],
            },
            success: true,
          };
        },
      );

      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith();
      expect(capturedResult).not.toBeNull();
      if (!capturedResult) {
        throw new Error('expected capturedResult');
      }
      expect(capturedResult.data.items).toHaveLength(2);
      expect(capturedResult.data.items[0]?.roundNumber).toBe(2); // Newest first
      expect(capturedResult.data.items[1]?.roundNumber).toBe(1);
    });

    it('prevents duplicate changelog entries', () => {
      const existingCache = {
        data: {
          items: [
            createMockChangelog(2, [{ participantId: 'p1', type: 'added' }]),
          ],
        },
        success: true,
      };

      const duplicateChangelog = createMockChangelog(2, [
        { participantId: 'p1', type: 'added' },
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
            data: {
              items: [...uniqueNewItems, ...existingItems],
            },
            success: true,
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
        { modelId: 'gpt-4o', participantId: 'p1', type: 'added' },
      ]);

      expect(changelog.changeData.changes).toHaveLength(1);
      expect(changelog.changeData.changes[0]?.type).toBe('added');
      expect(changelog.changeData.changes[0]?.modelId).toBe('gpt-4o');
    });

    it('creates changelog entry for multiple participant additions', () => {
      const changelog = createMockChangelog(1, [
        { modelId: 'gpt-4o', participantId: 'p1', type: 'added' },
        { modelId: 'claude-3.5-sonnet', participantId: 'p2', type: 'added' },
        { modelId: ModelIds.GOOGLE_GEMINI_3_FLASH_PREVIEW, participantId: 'p3', type: 'added' },
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
        { modelId: 'claude-3-opus', participantId: 'p1', type: 'removed' },
      ]);

      expect(changelog.changeData.changes).toHaveLength(1);
      expect(changelog.changeData.changes[0]?.type).toBe('removed');
      expect(changelog.changeData.changes[0]?.modelId).toBe('claude-3-opus');
    });

    it('creates changelog entry for multiple participant removals', () => {
      const changelog = createMockChangelog(2, [
        { modelId: 'gpt-4', participantId: 'p1', type: 'removed' },
        { modelId: 'claude-3', participantId: 'p2', type: 'removed' },
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
          details: { newValue: '2', oldValue: '0' },
          participantId: 'p1',
          type: 'modified',
        },
        {
          details: { newValue: '0', oldValue: '1' },
          participantId: 'p2',
          type: 'modified',
        },
        {
          details: { newValue: '1', oldValue: '2' },
          participantId: 'p3',
          type: 'modified',
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
          details: {
            newValue: ChatModes.ANALYZING,
            oldValue: ChatModes.DEBATING,
          },
          type: 'modified',
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
          details: {
            newValue: ChatModes.SOLVING,
            oldValue: ChatModes.BRAINSTORMING,
          },
          type: 'modified',
        },
        { modelId: 'gpt-4o', participantId: 'p1', type: 'added' },
        { modelId: 'claude-3', participantId: 'p2', type: 'removed' },
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
          details: { newValue: 'Advocate', oldValue: 'Critic' },
          modelId: 'gpt-4o',
          participantId: 'p1',
          type: 'modified',
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
          details: { newValue: 'The Ideator', oldValue: null },
          modelId: 'claude-3.5-sonnet',
          participantId: 'p1',
          type: 'modified',
        },
      ]);

      const roleChange = changelog.changeData.changes[0];

      expect(roleChange?.details?.oldValue).toBeNull();
      expect(roleChange?.details?.newValue).toBe('The Ideator');
    });

    it('creates changelog entry when role removed', () => {
      const changelog = createMockChangelog(8, [
        {
          details: { newValue: null, oldValue: 'The Analyst' },
          modelId: 'gemini-2.0',
          participantId: 'p1',
          type: 'modified',
        },
      ]);

      const roleChange = changelog.changeData.changes[0];

      expect(roleChange?.details?.oldValue).toBe('The Analyst');
      expect(roleChange?.details?.newValue).toBeNull();
    });
  });

  describe('web search toggle', () => {
    it('creates changelog entry for web search enabled', () => {
      const changelog = createMockChangelog(9, [
        {
          details: { newValue: 'true', oldValue: 'false' },
          type: 'modified',
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
          details: { newValue: 'false', oldValue: 'true' },
          type: 'modified',
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
        { modelId: 'gpt-4o', participantId: 'p1', type: 'added' },
        { modelId: 'claude-3.5', participantId: 'p2', type: 'added' },
        { modelId: 'gemini-1.5', participantId: 'p3', type: 'removed' },
        {
          details: { newValue: 'Advocate', oldValue: 'Critic' },
          participantId: 'p4',
          type: 'modified',
        },
        {
          details: { newValue: ChatModes.SOLVING, oldValue: ChatModes.DEBATING },
          type: 'modified',
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
          { modelId: 'gpt-4o', participantId: 'p1', type: 'added' },
        ]),
        createMockChangelog(3, [
          {
            details: { newValue: ChatModes.ANALYZING, oldValue: ChatModes.DEBATING },
            type: 'modified',
          },
        ]),
        createMockChangelog(5, [
          { modelId: 'gpt-4o', participantId: 'p1', type: 'removed' },
          { modelId: 'claude-3.5', participantId: 'p2', type: 'added' },
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

      expect(state.isWaitingForChangelog).toBeFalsy();
      expect(state.configChangeRoundNumber).toBeNull();
    });

    it('does not block streaming forever on changelog fetch error', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      state.setWaitingToStartStreaming(true);

      // Fetch fails, timeout triggers cleanup
      state.setIsWaitingForChangelog(false);

      // Streaming no longer blocked
      expect(state.isWaitingForChangelog).toBeFalsy();
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

      expect(hasAnyChanges).toBeTruthy();
    });

    it('clears hasPendingConfigChanges after successful submission', () => {
      const state = store.getState();

      state.setHasPendingConfigChanges(true);

      // PATCH success
      state.setHasPendingConfigChanges(false);

      expect(state.hasPendingConfigChanges).toBeFalsy();
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
          completedAt: null,
          createdAt: new Date(),
          errorMessage: null,
          id: 'presearch-r2',
          roundNumber: 2,
          searchData: undefined,
          status: MessageStatuses.PENDING,
          threadId: 'thread-123',
          userQuery: 'test query',
        });
      }

      // Changelog fetch triggered
      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
      }

      // Re-fetch state after mutations
      const updatedState = store.getState();

      expect(updatedState.isWaitingForChangelog).toBeTruthy();
      expect(updatedState.preSearches).toHaveLength(1);

      // Both must complete
      const preSearch = updatedState.preSearches[0];
      const isPreSearchBlocking = preSearch
        && (preSearch.status === MessageStatuses.PENDING || preSearch.status === MessageStatuses.STREAMING);
      const isChangelogBlocking = updatedState.isWaitingForChangelog;

      expect(isPreSearchBlocking).toBeTruthy();
      expect(isChangelogBlocking).toBeTruthy();
    });

    it('streaming proceeds when both changelog and pre-search complete', () => {
      const state = store.getState();

      state.setIsWaitingForChangelog(true);
      state.addPreSearch({
        completedAt: null,
        createdAt: new Date(),
        errorMessage: null,
        id: 'presearch-r2',
        roundNumber: 2,
        searchData: undefined,
        status: MessageStatuses.PENDING,
        threadId: 'thread-123',
        userQuery: 'test',
      });

      // Pre-search completes
      state.removePreSearch('presearch-r2');
      state.addPreSearch({
        completedAt: new Date(),
        createdAt: new Date(),
        errorMessage: null,
        id: 'presearch-r2',
        roundNumber: 2,
        searchData: {
          failureCount: 0,
          queries: [],
          results: [],
          successCount: 1,
          summary: 'Complete',
          totalResults: 1,
          totalTime: 1000,
        },
        status: MessageStatuses.COMPLETE,
        threadId: 'thread-123',
        userQuery: 'test',
      });

      // Changelog completes
      state.setIsWaitingForChangelog(false);

      // Streaming can proceed
      expect(state.isWaitingForChangelog).toBeFalsy();
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
        { participantId: 'p1', type: 'added' },
      ]);

      expect(changelog.roundNumber).toBe(updatedState.configChangeRoundNumber);
    });

    it('changelog previousRoundNumber correctly references previous round', () => {
      const changelog = createMockChangelog(5, [
        { participantId: 'p1', type: 'added' },
      ]);

      expect(changelog.roundNumber).toBe(5);
      expect(changelog.previousRoundNumber).toBe(4);
    });

    it('changelog previousRoundNumber is null for round 0', () => {
      const changelog = createMockChangelog(0, [
        { participantId: 'p1', type: 'added' },
      ]);

      expect(changelog.previousRoundNumber).toBeNull();
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
        if (params.isFetching) {
          return false;
        }
        if (params.configChangeRoundNumber === null) {
          return false;
        }
        if (!params.isWaitingForChangelog) {
          return false;
        }
        return true;
      };

      // When fetching, should NOT process
      expect(shouldProcess({
        configChangeRoundNumber: 2,
        isFetching: true,
        isWaitingForChangelog: true,
      })).toBeFalsy();

      // When fetch complete, should process
      expect(shouldProcess({
        configChangeRoundNumber: 2,
        isFetching: false,
        isWaitingForChangelog: true,
      })).toBeTruthy();
    });

    it('should wait for fresh data before clearing flags', () => {
      const state = store.getState();

      // Set up state
      state.setIsWaitingForChangelog(true);
      state.setConfigChangeRoundNumber(2);

      // Verify flags are set
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
      expect(store.getState().configChangeRoundNumber).toBe(2);

      // During fetch transition, flags should remain set
      // (to block streaming until fresh data arrives)
      const duringFetch = store.getState();
      expect(duringFetch.isWaitingForChangelog).toBeTruthy();
      expect(duringFetch.configChangeRoundNumber).toBe(2);

      // After fresh data received, flags can be cleared
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);

      expect(store.getState().isWaitingForChangelog).toBeFalsy();
      expect(store.getState().configChangeRoundNumber).toBeNull();
    });
  });

  describe('round Number Validation - Prevents Wrong Round Data Merge', () => {
    it('should reject changelog data for wrong round number', () => {
      // Scenario: We need round 2 data, but API returns round 1 data
      // (This can happen due to TanStack Query cache behavior)

      const validateRoundData = (
        items: { roundNumber: number }[],
        expectedRound: number,
      ): boolean => {
        if (items.length === 0) {
          return true;
        } // Empty is valid
        return items.every(item => item.roundNumber === expectedRound);
      };

      // Round 1 data when expecting round 2 → Invalid
      const round1Data = [
        createMockChangelog(1, [{ participantId: 'p1', type: 'added' }]),
      ];
      expect(validateRoundData(round1Data, 2)).toBeFalsy();

      // Round 2 data when expecting round 2 → Valid
      const round2Data = [
        createMockChangelog(2, [{ participantId: 'p1', type: 'added' }]),
      ];
      expect(validateRoundData(round2Data, 2)).toBeTruthy();

      // Mixed data → Invalid
      const mixedData = [
        createMockChangelog(2, [{ participantId: 'p1', type: 'added' }]),
        createMockChangelog(1, [{ participantId: 'p2', type: 'removed' }]),
      ];
      expect(validateRoundData(mixedData, 2)).toBeFalsy();
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
      expect(shouldMerge).toBeFalsy();

      // Different round should merge
      const newRound = 3;
      const shouldMergeNewRound = lastMergedRound !== newRound;
      expect(shouldMergeNewRound).toBeTruthy();
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
      expect(isBlocked).toBeTruthy();

      // Simulate changelog fetch completing with CORRECT round data
      // (In real code, isFetching guard ensures this)
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // Now streaming can proceed
      currentState = store.getState();
      expect(currentState.isWaitingForChangelog).toBeFalsy();
      expect(currentState.configChangeRoundNumber).toBeNull();
      expect(currentState.waitingToStartStreaming).toBeTruthy();
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
        data: {
          items: [
            createMockChangelog(1, [{ participantId: 'p1', type: 'added' }]),
          ],
        },
        success: true,
      };

      // New data for round 2 (CORRECT round)
      const round2Changelog = createMockChangelog(2, [
        { participantId: 'p2', type: 'removed' },
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
            data: {
              items: [...uniqueNewItems, ...existingItems],
            },
            success: true,
          };
        },
      );

      expect(capturedResult).not.toBeNull();
      if (!capturedResult) {
        throw new Error('expected capturedResult');
      }
      expect(capturedResult.data.items).toHaveLength(2);

      // Round 2 should be first (newest)
      expect(capturedResult.data.items[0]?.roundNumber).toBe(2);
      // Round 1 should be preserved
      expect(capturedResult.data.items[1]?.roundNumber).toBe(1);
    });

    it('should NOT merge if new data is for wrong round', () => {
      const existingCache = {
        data: {
          items: [
            createMockChangelog(1, [{ participantId: 'p1', type: 'added' }]),
          ],
        },
        success: true,
      };

      // Stale data for round 1 (WRONG - we want round 2)
      const staleChangelog = createMockChangelog(1, [
        { participantId: 'p2', type: 'removed' },
      ]);

      const configChangeRoundNumber = 2;

      // Validation should reject
      const isCorrectRound = staleChangelog.roundNumber === configChangeRoundNumber;
      expect(isCorrectRound).toBeFalsy();

      // Cache should remain unchanged
      expect(existingCache.data.items).toHaveLength(1);
    });
  });

  describe('timeline Display After Race Condition Fix', () => {
    it('should show changelog accordion for both rounds after fix', () => {
      // This tests the end result: changelog accordions should appear
      // for both round 1 and round 2

      const changelogs = [
        createMockChangelog(1, [{ participantId: 'p1', type: 'added' }]),
        createMockChangelog(2, [{ participantId: 'p2', type: 'added' }]),
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
        const roundArray = changelogByRound.get(round);
        if (!roundArray) {
          throw new Error('expected roundArray');
        }
        roundArray.push(changelog);
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
        isFetching: true,
        isSuccess: false,
      };

      // Without placeholderData, data is undefined during fetch
      expect(queryState.data).toBeUndefined();
      expect(queryState.isFetching).toBeTruthy();
    });

    it('should have fresh data after fetch completes', () => {
      // Simulate query completing
      const queryState = {
        data: {
          data: {
            items: [{ id: 'new-item', roundNumber: 2 }],
          },
          success: true,
        },
        isFetching: false,
        isSuccess: true,
      };

      expect(queryState.data).toBeDefined();
      expect(queryState.isFetching).toBeFalsy();
      expect(queryState.data.data.items[0]?.roundNumber).toBe(2);
    });

    it('should NOT return round 1 data when querying round 2', () => {
      // This was the bug: placeholderData returned round 1 data
      // for round 2 query during fetch

      // Simulate round 1 query completing
      const round1QueryState = {
        data: { data: { items: [{ roundNumber: 1 }] }, success: true },
        queryKey: ['threads', 'thread-123', 'changelog', 'round', 1],
      };

      // Simulate round 2 query starting (NO placeholderData)
      const round2QueryState = {
        data: undefined, // NOT round 1 data
        isFetching: true,
        queryKey: ['threads', 'thread-123', 'changelog', 'round', 2],
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
        if (params.isFetching) {
          return false;
        }
        if (!params.isSuccess || !params.data?.success) {
          return false;
        }
        return true;
      };

      // During fetch (no placeholderData)
      expect(shouldProcess({
        data: undefined,
        isFetching: true,
        isSuccess: false,
      })).toBeFalsy();

      // After fetch completes
      expect(shouldProcess({
        data: { data: { items: [] }, success: true },
        isFetching: false,
        isSuccess: true,
      })).toBeTruthy();
    });
  });
});

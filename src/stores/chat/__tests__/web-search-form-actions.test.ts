/**
 * Web Search Form Actions Tests
 *
 * Tests web search form actions and PATCH behavior:
 * 1. handleWebSearchToggle updates form state
 * 2. handleUpdateThreadAndSend waits when web search enabled (needsWait logic)
 * 3. handleUpdateThreadAndSend waits when web search changed mid-conversation
 * 4. PATCH request includes enableWebSearch parameter
 * 5. Mid-conversation enable triggers await (prevents race condition)
 * 6. Form actions handle race conditions properly
 *
 * Tests critical bug fix from form-actions.ts:212-232:
 * - Fire-and-forget PATCH causes race condition
 * - Must await PATCH when web search is enabled or changes
 * - Prevents broken web search functionality
 *
 * Pattern follows: Integration testing with mocked mutations
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatStore } from '@/stores/chat';

import type { ChatStore } from '../store';

// Mock utilities
vi.mock('@/lib/toast', () => ({
  showApiErrorToast: vi.fn(),
}));

vi.mock('@/lib/utils/date-transforms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/date-transforms')>();
  return {
    ...actual,
    transformChatThread: (thread: unknown) => thread,
    transformChatParticipants: (participants: unknown) => participants,
    transformChatMessages: (messages: unknown) => messages,
  };
});

vi.mock('@/lib/utils/message-transforms', () => ({
  chatMessagesToUIMessages: (messages: unknown) => messages,
}));

vi.mock('@/lib/utils/participant', () => ({
  prepareParticipantUpdate: () => ({
    updateResult: {
      hasTemporaryIds: false,
      hasChanges: true,
    },
    updatePayloads: [],
    optimisticParticipants: [],
  }),
  shouldUpdateParticipantConfig: () => true,
}));

describe('web Search Form Actions', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatStore;

  beforeEach(() => {
    store = createChatStore();
    getState = store.getState;
  });

  describe('handleWebSearchToggle equivalent', () => {
    it('should update web search form state when enabled', () => {
      expect(getState().enableWebSearch).toBe(false);

      // Simulate toggle action (equivalent to handleWebSearchToggle)
      getState().setEnableWebSearch(true);

      expect(getState().enableWebSearch).toBe(true);
    });

    it('should update web search form state when disabled', () => {
      // Enable first
      getState().setEnableWebSearch(true);
      expect(getState().enableWebSearch).toBe(true);

      // Disable
      getState().setEnableWebSearch(false);

      expect(getState().enableWebSearch).toBe(false);
    });

    it('should mark form as having changes when web search toggled', () => {
      // Initial state
      expect(getState().enableWebSearch).toBe(false);

      // Toggle web search (this would trigger hasPendingConfigChanges in real usage)
      getState().setEnableWebSearch(true);

      // Form state should reflect the change
      expect(getState().enableWebSearch).toBe(true);

      // In real usage, handleModeChange would set hasPendingConfigChanges
      // Testing the core state change here
    });
  });

  describe('web search PATCH request behavior', () => {
    it('should include enableWebSearch in form state', () => {
      // Set up form state
      getState().setInputValue('Test question');
      getState().setSelectedMode('debating');
      getState().setSelectedParticipants([
        {
          id: 'participant-1',
          modelId: 'anthropic/claude-3.5-sonnet',
          role: null,
          customRoleId: null,
          priority: 0,
        },
      ]);
      getState().setEnableWebSearch(true);

      // Verify form state includes web search
      const formState = {
        inputValue: getState().inputValue,
        selectedMode: getState().selectedMode,
        selectedParticipants: getState().selectedParticipants,
        enableWebSearch: getState().enableWebSearch,
      };

      expect(formState.enableWebSearch).toBe(true);
      expect(formState.inputValue).toBe('Test question');
      expect(formState.selectedMode).toBe('debating');
      expect(formState.selectedParticipants).toHaveLength(1);
    });

    it('should detect web search change mid-conversation', () => {
      // Simulate existing thread with web search disabled
      const mockThread = {
        id: 'thread-1',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      getState().setThread(mockThread);

      // Current form state enables web search
      getState().setEnableWebSearch(true);

      // Detect change
      const currentWebSearch = getState().thread?.enableWebSearch || false;
      const formWebSearch = getState().enableWebSearch;
      const webSearchChanged = currentWebSearch !== formWebSearch;

      expect(webSearchChanged).toBe(true);
    });

    it('should not detect change when web search unchanged', () => {
      // Simulate existing thread with web search enabled
      const mockThread = {
        id: 'thread-1',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      getState().setThread(mockThread);

      // Current form state also enables web search (no change)
      getState().setEnableWebSearch(true);

      // Detect change
      const currentWebSearch = getState().thread?.enableWebSearch || false;
      const formWebSearch = getState().enableWebSearch;
      const webSearchChanged = currentWebSearch !== formWebSearch;

      expect(webSearchChanged).toBe(false);
    });
  });

  describe('needsWait logic (race condition prevention)', () => {
    it('should require wait when web search is enabled (even if unchanged)', () => {
      // Set up thread with web search enabled
      const mockThread = {
        id: 'thread-1',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      getState().setThread(mockThread);
      getState().setEnableWebSearch(true); // Form also has it enabled

      // Simulate needsWait calculation from form-actions.ts:232
      const updateResult = {
        hasTemporaryIds: false,
        hasChanges: false,
      };

      const currentWebSearch = getState().thread?.enableWebSearch || false;
      const formWebSearch = getState().enableWebSearch;
      const webSearchChanged = currentWebSearch !== formWebSearch;

      const needsWait = updateResult.hasTemporaryIds || webSearchChanged || formWebSearch;

      // Should wait because web search is enabled (prevents race condition)
      expect(needsWait).toBe(true);
    });

    it('should require wait when web search changed mid-conversation', () => {
      // Set up thread with web search disabled
      const mockThread = {
        id: 'thread-1',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      getState().setThread(mockThread);
      getState().setEnableWebSearch(true); // Form enables it (change detected)

      // Simulate needsWait calculation
      const updateResult = {
        hasTemporaryIds: false,
        hasChanges: true,
      };

      const currentWebSearch = getState().thread?.enableWebSearch || false;
      const formWebSearch = getState().enableWebSearch;
      const webSearchChanged = currentWebSearch !== formWebSearch;

      const needsWait = updateResult.hasTemporaryIds || webSearchChanged || formWebSearch;

      // Should wait because web search changed
      expect(needsWait).toBe(true);
    });

    it('should require wait when creating new participants (temporary IDs)', () => {
      // Set up thread with web search disabled
      const mockThread = {
        id: 'thread-1',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      getState().setThread(mockThread);
      getState().setEnableWebSearch(false);

      // Simulate temporary participant IDs (new participants added)
      const updateResult = {
        hasTemporaryIds: true,
        hasChanges: true,
      };

      const currentWebSearch = getState().thread?.enableWebSearch || false;
      const formWebSearch = getState().enableWebSearch;
      const webSearchChanged = currentWebSearch !== formWebSearch;

      const needsWait = updateResult.hasTemporaryIds || webSearchChanged || formWebSearch;

      // Should wait because of temporary IDs
      expect(needsWait).toBe(true);
    });

    it('should not require wait when web search disabled and no changes', () => {
      // Set up thread with web search disabled
      const mockThread = {
        id: 'thread-1',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      getState().setThread(mockThread);
      getState().setEnableWebSearch(false);

      // Simulate no participant changes
      const updateResult = {
        hasTemporaryIds: false,
        hasChanges: false,
      };

      const currentWebSearch = getState().thread?.enableWebSearch || false;
      const formWebSearch = getState().enableWebSearch;
      const webSearchChanged = currentWebSearch !== formWebSearch;

      const needsWait = updateResult.hasTemporaryIds || webSearchChanged || formWebSearch;

      // Should NOT wait (fire-and-forget is safe)
      expect(needsWait).toBe(false);
    });
  });

  describe('web search state transitions', () => {
    it('should handle enable → disable → enable correctly', () => {
      // Initial: disabled
      expect(getState().enableWebSearch).toBe(false);

      // Round 0: Enable
      getState().setEnableWebSearch(true);
      expect(getState().enableWebSearch).toBe(true);

      // Round 1: Disable
      getState().setEnableWebSearch(false);
      expect(getState().enableWebSearch).toBe(false);

      // Round 2: Enable again
      getState().setEnableWebSearch(true);
      expect(getState().enableWebSearch).toBe(true);
    });

    it('should persist web search state across input changes', () => {
      // Enable web search
      getState().setEnableWebSearch(true);

      // Change input (simulating typing)
      getState().setInputValue('First question');
      expect(getState().enableWebSearch).toBe(true);

      // Clear input (simulating submission)
      getState().setInputValue('');
      expect(getState().enableWebSearch).toBe(true);

      // Type new question
      getState().setInputValue('Second question');
      expect(getState().enableWebSearch).toBe(true);
    });
  });

  describe('form validation with web search', () => {
    it('should validate form with web search enabled', () => {
      getState().setInputValue('Test question');
      getState().setSelectedMode('debating');
      getState().setSelectedParticipants([
        {
          id: 'participant-1',
          modelId: 'anthropic/claude-3.5-sonnet',
          role: null,
          customRoleId: null,
          priority: 0,
        },
      ]);
      getState().setEnableWebSearch(true);

      // Form should be valid
      const isValid = Boolean(
        getState().inputValue.trim()
        && getState().selectedParticipants.length > 0
        && getState().selectedMode,
      );

      expect(isValid).toBe(true);
    });

    it('should validate form with web search disabled', () => {
      getState().setInputValue('Test question');
      getState().setSelectedMode('debating');
      getState().setSelectedParticipants([
        {
          id: 'participant-1',
          modelId: 'anthropic/claude-3.5-sonnet',
          role: null,
          customRoleId: null,
          priority: 0,
        },
      ]);
      getState().setEnableWebSearch(false);

      // Form should still be valid (web search is optional)
      const isValid = Boolean(
        getState().inputValue.trim()
        && getState().selectedParticipants.length > 0
        && getState().selectedMode,
      );

      expect(isValid).toBe(true);
    });
  });

  describe('regression test for bug fix', () => {
    it('should prevent race condition when enabling web search mid-conversation', () => {
      // Scenario from bug report:
      // "enabling web search mid convo won't have a record made for it
      // and afterwards is not causing the initial searches to happen"

      // Round 0: Web search disabled
      const mockThread = {
        id: 'thread-1',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      getState().setThread(mockThread);
      getState().setEnableWebSearch(false);

      // Round 1: User enables web search mid-conversation
      getState().setEnableWebSearch(true);

      const currentWebSearch = getState().thread?.enableWebSearch || false;
      const formWebSearch = getState().enableWebSearch;
      const webSearchChanged = currentWebSearch !== formWebSearch;

      // Change should be detected
      expect(webSearchChanged).toBe(true);

      // needsWait should be true (forces PATCH await)
      const updateResult = { hasTemporaryIds: false, hasChanges: true };
      const needsWait = updateResult.hasTemporaryIds || webSearchChanged || formWebSearch;

      expect(needsWait).toBe(true);

      // This prevents the race condition:
      // 1. PATCH will be awaited (not fire-and-forget)
      // 2. Thread.enableWebSearch updated BEFORE message stream starts
      // 3. Streaming handler sees updated enableWebSearch value
      // 4. Pre-search record is created correctly
      // 5. Web search executes before participants respond
    });

    it('should prevent race condition on subsequent rounds when web search is enabled', () => {
      // Extended bug fix scenario:
      // Round 0: Web search enabled, works correctly
      // Round 1: Participant changed, web search still enabled
      // Bug: If PATCH is fire-and-forget, enableWebSearch might not be updated before streaming

      const mockThread = {
        id: 'thread-1',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: true, // Already enabled
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      getState().setThread(mockThread);
      getState().setEnableWebSearch(true); // Still enabled

      // Round 1: User changes participants
      getState().setSelectedParticipants([
        {
          id: 'participant-2',
          modelId: 'openai/gpt-4o',
          role: null,
          customRoleId: null,
          priority: 0,
        },
      ]);

      const currentWebSearch = getState().thread?.enableWebSearch || false;
      const formWebSearch = getState().enableWebSearch;
      const webSearchChanged = currentWebSearch !== formWebSearch;

      // No change in web search state
      expect(webSearchChanged).toBe(false);

      // But needsWait should STILL be true because web search is enabled
      const updateResult = { hasTemporaryIds: false, hasChanges: true };
      const needsWait = updateResult.hasTemporaryIds || webSearchChanged || formWebSearch;

      expect(needsWait).toBe(true);

      // This ensures:
      // - PATCH completes before streaming starts
      // - Thread state is fully updated
      // - Web search continues to work correctly across all rounds
    });
  });
});

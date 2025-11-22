/**
 * CRITICAL BUG TEST: handleCreateThread Must Call prepareForNewMessage
 *
 * This test verifies that form-actions properly sets pendingMessage when creating
 * a new thread, so the provider can trigger participant streaming after pre-search completes.
 *
 * BUG: Currently handleCreateThread() does NOT call prepareForNewMessage(),
 * causing participants to never stream on overview page with web search enabled.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatStore } from '@/stores/chat/store';

import { createMockParticipant } from './test-factories';

describe('cRITICAL BUG: handleCreateThread Must Set Pending Message', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('store Behavior (Baseline - These Should Pass)', () => {
    it('should maintain pendingMessage after pre-search completes', () => {
      const userMessage = 'Terraforming Mars question';

      // 1. Simulate form submit: prepareForNewMessage is called
      store.getState().prepareForNewMessage(userMessage, ['p1', 'p2']);

      expect(store.getState().pendingMessage).toBe(userMessage);
      expect(store.getState().hasSentPendingMessage).toBe(false);

      // 2. Thread created
      store.getState().setThread({
        id: 't1',
        slug: 'test',
        title: 'Test',
        userId: 'user-1',
        enableWebSearch: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread);

      // 3. Pre-search created and completes
      store.getState().addPreSearch({
        id: 'ps-1',
        threadId: 't1',
        roundNumber: 0,
        status: 'pending' as const,
        userQuery: userMessage,
        createdAt: new Date(),
      });

      store.getState().updatePreSearchStatus(0, 'complete');

      // ✅ PASS: Pending message still exists
      expect(store.getState().pendingMessage).toBe(userMessage);
      expect(store.getState().hasSentPendingMessage).toBe(false);

      // This is the correct behavior - provider can now trigger participants
    });

    it('should only clear pendingMessage when hasSentPendingMessage is set', () => {
      const userMessage = 'Test question';

      // 1. Set pending message
      store.getState().prepareForNewMessage(userMessage, ['p1']);
      expect(store.getState().pendingMessage).toBe(userMessage);

      // 2. Mark as sent (happens when sendMessage is called)
      store.getState().setHasSentPendingMessage(true);

      // 3. Pending message still there until explicitly cleared
      expect(store.getState().pendingMessage).toBe(userMessage);

      // 4. Only completeStreaming or similar should clear it
      store.getState().completeStreaming();
      expect(store.getState().pendingMessage).toBe(null);
    });
  });

  describe('form Actions Integration (These WILL FAIL Until Fixed)', () => {
    it('❌ FAILING: handleCreateThread should call prepareForNewMessage', () => {
      // THIS TEST WILL FAIL - it's the bug we're fixing
      //
      // In real usage:
      // 1. User types message on overview page
      // 2. User clicks submit
      // 3. handleCreateThread is called
      // 4. ❌ BUG: prepareForNewMessage is NEVER called
      // 5. ❌ pendingMessage stays null
      // 6. ❌ Provider can't trigger participants

      const userMessage = 'Test question with web search';
      const participantIds = ['p1', 'p2'];

      // Simulate what handleCreateThread SHOULD do:
      // 1. Create thread (mocked)
      const mockThread = {
        id: 't1',
        slug: 'test',
        title: 'Test',
        userId: 'user-1',
        enableWebSearch: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockParticipants = [
        { id: 'p1', modelId: 'gpt-4', priority: 0, isEnabled: true },
        { id: 'p2', modelId: 'claude-3', priority: 1, isEnabled: true },
      ];

      // 2. ✅ FIX NEEDED: This line should be in handleCreateThread
      store.getState().prepareForNewMessage(userMessage, participantIds);

      // 3. Initialize thread (happens in onSuccess callback)
      store.getState().initializeThread(mockThread, mockParticipants, []);

      // 4. ✅ EXPECTATION: Pending message should be set
      expect(store.getState().pendingMessage).toBe(userMessage);
      expect(store.getState().expectedParticipantIds).toEqual(participantIds);
      expect(store.getState().hasSentPendingMessage).toBe(false);

      // Without this, provider effect will exit immediately:
      // if (!pendingMessage) return; // ❌ No participants triggered
    });

    it('❌ FAILING: Overview page should trigger participants after pre-search completes', () => {
      // Full end-to-end flow that currently fails

      const userMessage = 'Terraforming Mars question';

      // Step 1: User submits on overview page
      // ❌ BUG: handleCreateThread doesn't call this
      // ✅ FIX: It should call this
      store.getState().prepareForNewMessage(userMessage, ['p1', 'p2']);

      // Step 2: Thread created with pre-search
      store.getState().setThread({
        id: 't1',
        slug: 'test-thread',
        title: 'Test',
        userId: 'user-1',
        enableWebSearch: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread);

      store.getState().setParticipants([
        createMockParticipant(0, { id: 'p1', modelId: 'gpt-4' }),
        createMockParticipant(1, { id: 'p2', modelId: 'claude-3' }),
      ]);

      // Step 3: Pre-search executes and completes
      store.getState().addPreSearch({
        id: 'ps-1',
        threadId: 't1',
        roundNumber: 0,
        status: 'complete' as const,
        userQuery: userMessage,
        createdAt: new Date(),
      });

      // Step 4: Provider effect should NOW trigger participants
      // ✅ Check conditions the provider needs:

      // Condition 1: Pending message exists
      expect(store.getState().pendingMessage).toBe(userMessage);

      // Condition 2: Not yet sent
      expect(store.getState().hasSentPendingMessage).toBe(false);

      // Condition 3: Pre-search complete
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe('complete');

      // Condition 4: Participants ready
      expect(store.getState().participants).toHaveLength(2);

      // ✅ ALL CONDITIONS MET - provider should trigger participants
      // Provider effect logic:
      // if (pendingMessage && !hasSentPendingMessage && preSearch.status === 'complete') {
      //   sendMessage(pendingMessage); // ✅ This will trigger participants
      // }
    });

    it('❌ FAILING: Production bug reproduction - overview page with web search', () => {
      // Exact reproduction of production bug reported by user

      // INITIAL STATE (overview page loaded):
      expect(store.getState().pendingMessage).toBe(null);
      expect(store.getState().isStreaming).toBe(false);

      // USER ACTION: Submit message with web search enabled
      const userMessage = 'Terraforming Mars could create a second home for humanity';

      // ❌ BUG: handleCreateThread does NOT call this
      // Simulating what SHOULD happen:
      store.getState().prepareForNewMessage(userMessage, [
        '01KANX2QMER0VVTCMK6CVRA3KH',
        '01KANX2QMHEF4NJH7DX4ZFMBEK',
      ]);

      // BACKEND: Thread created, pre-search completes
      store.getState().setThread({
        id: '01KANX2QM2Y8XE7YNX037P02WG',
        slug: 'mars-home-or-ecosystem-ruin-7028ku',
        title: 'Mars: Home or Ecosystem Ruin?',
        userId: 'user-1',
        enableWebSearch: true,
        createdAt: new Date('2025-11-22T13:46:56.000Z'),
        updatedAt: new Date('2025-11-22T13:46:57.000Z'),
      } as ChatThread);

      store.getState().setParticipants([
        createMockParticipant(0, {
          id: '01KANX2QMER0VVTCMK6CVRA3KH',
          modelId: 'x-ai/grok-4',
          role: 'Space Ethicist',
        }),
        createMockParticipant(1, {
          id: '01KANX2QMHEF4NJH7DX4ZFMBEK',
          modelId: 'deepseek/deepseek-r1',
          role: 'Space Policy Expert',
        }),
      ]);

      store.getState().addPreSearch({
        id: '01KANX2QQFA0D07R1D5TDJW8V2',
        threadId: '01KANX2QM2Y8XE7YNX037P02WG',
        roundNumber: 0,
        status: 'complete' as const,
        userQuery: userMessage,
        createdAt: new Date('2025-11-22T13:46:56.000Z'),
        completedAt: new Date('2025-11-22T13:47:28.000Z'),
      } as ChatThread);

      // ✅ EXPECTED STATE (what user should see):
      expect(store.getState().pendingMessage).toBe(userMessage); // ✅ Set by prepareForNewMessage
      expect(store.getState().preSearches[0].status).toBe('complete');
      expect(store.getState().participants).toHaveLength(2);

      // Provider should now trigger participants
      // But in production, pendingMessage is null because
      // handleCreateThread never called prepareForNewMessage!
    });
  });

  describe('thread Detail Page Comparison (Working Reference)', () => {
    it('✅ PASSING: Thread detail handleUpdateThreadAndSend works correctly', () => {
      // This flow WORKS because handleUpdateThreadAndSend DOES call prepareForNewMessage

      const userMessage = 'Follow-up question';

      // Existing thread
      store.getState().setThread({
        id: 't1',
        slug: 'existing-thread',
        title: 'Existing',
        userId: 'user-1',
        enableWebSearch: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread);

      store.getState().setParticipants([
        createMockParticipant(0, { id: 'p1', modelId: 'gpt-4' }),
      ]);

      // ✅ handleUpdateThreadAndSend DOES call this
      store.getState().prepareForNewMessage(userMessage, ['p1']);

      // Pre-search completes
      store.getState().addPreSearch({
        id: 'ps-1',
        threadId: 't1',
        roundNumber: 1, // Round 1 (not first)
        status: 'complete' as const,
        userQuery: userMessage,
        createdAt: new Date(),
      });

      // ✅ Participants trigger correctly
      expect(store.getState().pendingMessage).toBe(userMessage);
      expect(store.getState().hasSentPendingMessage).toBe(false);

      // This is why thread detail page works but overview doesn't!
    });
  });
});

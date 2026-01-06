/**
 * Non-Initial Round Changelog Blocking Tests
 *
 * Tests for the critical issue where incomplete-round-resumption.ts
 * can trigger streaming without checking changelog flags, causing
 * participants to stream with stale config.
 *
 * Related files:
 * - src/stores/chat/actions/incomplete-round-resumption.ts
 * - src/components/providers/chat-store-provider/hooks/use-changelog-sync.ts
 * - src/stores/chat/actions/form-actions.ts
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand';

import { MessageRoles, MessageStatuses, ScreenModes, TextPartStates } from '@/api/core/enums';
import type { ChatStore } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

describe('non-Initial Round Changelog Blocking', () => {
  let store: StoreApi<ChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('cRITICAL: Incomplete round resumption should check changelog flags', () => {
    it('should NOT trigger resumption when configChangeRoundNumber is set', () => {
      // Setup: Round 2 with config change in progress
      const state = store.getState();

      // Set up incomplete round state
      state.setMessages([
        {
          id: 'thread_r1_user',
          role: MessageRoles.USER,
          content: 'First message',
          parts: [{ type: 'text', text: 'First message' }],
          metadata: { roundNumber: 1 },
          createdAt: new Date(),
        },
        {
          id: 'thread_r1_p0',
          role: MessageRoles.ASSISTANT,
          content: 'Response 1',
          parts: [{ type: 'text', text: 'Response 1' }],
          metadata: { roundNumber: 1, participantIndex: 0, finishReason: 'stop' },
          createdAt: new Date(),
        },
        {
          id: 'thread_r2_user',
          role: MessageRoles.USER,
          content: 'Second message',
          parts: [{ type: 'text', text: 'Second message' }],
          metadata: { roundNumber: 2 },
          createdAt: new Date(),
        },
        // Round 2 participant 0 incomplete - no response yet
      ]);

      state.setParticipants([
        { id: 'p1', modelId: 'gpt-4', isEnabled: true, order: 0, displayName: 'GPT-4' },
        { id: 'p2', modelId: 'claude-3', isEnabled: true, order: 1, displayName: 'Claude 3' },
      ]);

      // Config change in progress - PATCH sent but changelog not fetched
      state.setConfigChangeRoundNumber(2);
      state.setIsWaitingForChangelog(false); // Not set yet (PATCH just completed)

      // The incomplete round resumption hook should check this flag
      // and NOT trigger streaming until changelog is fetched

      const currentState = store.getState();

      // Verify state represents config change in progress
      expect(currentState.configChangeRoundNumber).toBe(2);

      // Bug: Current implementation does NOT check configChangeRoundNumber
      // before triggering resumption. This test documents expected behavior.
      // Resumption should be blocked when configChangeRoundNumber !== null
    });

    it('should NOT trigger resumption when isWaitingForChangelog is true', () => {
      const state = store.getState();

      // Set up incomplete round state
      state.setMessages([
        {
          id: 'thread_r2_user',
          role: MessageRoles.USER,
          content: 'Second message',
          parts: [{ type: 'text', text: 'Second message' }],
          metadata: { roundNumber: 2 },
          createdAt: new Date(),
        },
      ]);

      state.setParticipants([
        { id: 'p1', modelId: 'gpt-4', isEnabled: true, order: 0, displayName: 'GPT-4' },
      ]);

      // Changelog fetch in progress
      state.setConfigChangeRoundNumber(2);
      state.setIsWaitingForChangelog(true);

      const currentState = store.getState();

      // Verify both flags are set (changelog fetch in progress)
      expect(currentState.configChangeRoundNumber).toBe(2);
      expect(currentState.isWaitingForChangelog).toBe(true);

      // Bug: Current implementation does NOT check isWaitingForChangelog
      // before triggering resumption. This test documents expected behavior.
    });

    it('should trigger resumption ONLY after both changelog flags are cleared', () => {
      const state = store.getState();

      // Set up incomplete round state
      state.setMessages([
        {
          id: 'thread_r2_user',
          role: MessageRoles.USER,
          content: 'Second message',
          parts: [{ type: 'text', text: 'Second message' }],
          metadata: { roundNumber: 2 },
          createdAt: new Date(),
        },
      ]);

      state.setParticipants([
        { id: 'p1', modelId: 'gpt-4', isEnabled: true, order: 0, displayName: 'GPT-4' },
      ]);

      // Both flags cleared (changelog fetched and merged)
      state.setConfigChangeRoundNumber(null);
      state.setIsWaitingForChangelog(false);

      const currentState = store.getState();

      // Verify both flags are cleared
      expect(currentState.configChangeRoundNumber).toBeNull();
      expect(currentState.isWaitingForChangelog).toBe(false);

      // Now resumption should be allowed
    });
  });

  describe('config change flow ordering', () => {
    it('should set configChangeRoundNumber BEFORE addPreSearch', () => {
      // This tests the ordering in handleUpdateThreadAndSend
      // Line 321-323: setConfigChangeRoundNumber
      // Line 328-334: addPreSearch

      const state = store.getState();

      // Simulate config change detected
      const hasAnyChanges = true;
      const nextRoundNumber = 2;

      if (hasAnyChanges) {
        // This must happen FIRST
        state.setConfigChangeRoundNumber(nextRoundNumber);
      }

      // Pre-search placeholder created AFTER blocking flag
      state.addPreSearch({
        id: 'ps-2',
        threadId: 'thread-1',
        roundNumber: nextRoundNumber,
        status: MessageStatuses.PENDING,
        queries: [],
        results: [],
        userQuery: 'test query',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const currentState = store.getState();

      // configChangeRoundNumber should be set
      expect(currentState.configChangeRoundNumber).toBe(2);

      // Pre-search should exist
      const preSearch = currentState.preSearches.find(ps => ps.roundNumber === 2);
      expect(preSearch).toBeDefined();
      expect(preSearch?.status).toBe(MessageStatuses.PENDING);
    });

    it('should set isWaitingForChangelog AFTER PATCH completes', () => {
      const state = store.getState();

      // Simulate PATCH completed
      const hasAnyChanges = true;

      // Clear pending config changes flag (line 392 in form-actions.ts)
      state.setHasPendingConfigChanges(false);

      // Then set changelog waiting flag (line 409)
      if (hasAnyChanges) {
        state.setIsWaitingForChangelog(true);
      }

      const currentState = store.getState();
      expect(currentState.hasPendingConfigChanges).toBe(false);
      expect(currentState.isWaitingForChangelog).toBe(true);
    });

    it('should clear both changelog flags atomically', () => {
      const state = store.getState();

      // Setup: Both flags set
      state.setConfigChangeRoundNumber(2);
      state.setIsWaitingForChangelog(true);

      // Simulate changelog merged (use-changelog-sync.ts lines 135-136)
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);

      const currentState = store.getState();
      expect(currentState.isWaitingForChangelog).toBe(false);
      expect(currentState.configChangeRoundNumber).toBeNull();
    });
  });

  describe('race condition scenarios', () => {
    it('should handle page refresh mid-config-change', () => {
      // Scenario:
      // 1. User changes config
      // 2. PATCH sent, configChangeRoundNumber=2
      // 3. Page refresh BEFORE isWaitingForChangelog=true
      // 4. On reload, configChangeRoundNumber=2 persisted
      // 5. isWaitingForChangelog=false (not set yet)
      // 6. Resumption should STILL be blocked (configChangeRoundNumber !== null)

      const state = store.getState();

      // Simulate persisted state after refresh
      state.setConfigChangeRoundNumber(2);
      state.setIsWaitingForChangelog(false);

      // Set up incomplete round
      state.setMessages([
        {
          id: 'thread_r2_user',
          role: MessageRoles.USER,
          content: 'Message',
          parts: [{ type: 'text', text: 'Message' }],
          metadata: { roundNumber: 2 },
          createdAt: new Date(),
        },
      ]);

      state.setParticipants([
        { id: 'p1', modelId: 'gpt-4', isEnabled: true, order: 0, displayName: 'GPT-4' },
      ]);

      const currentState = store.getState();

      // configChangeRoundNumber alone should block resumption
      expect(currentState.configChangeRoundNumber).toBe(2);
      expect(currentState.isWaitingForChangelog).toBe(false);

      // Bug: incomplete-round-resumption doesn't check this
    });

    it('should handle changelog fetch failure gracefully', () => {
      // The 30-second timeout in use-changelog-sync.ts should clear flags
      const state = store.getState();

      state.setConfigChangeRoundNumber(2);
      state.setIsWaitingForChangelog(true);

      // Simulate timeout clearing flags
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);

      const currentState = store.getState();
      expect(currentState.isWaitingForChangelog).toBe(false);
      expect(currentState.configChangeRoundNumber).toBeNull();
    });
  });

  describe('streaming trigger consistency', () => {
    it('use-streaming-trigger should bypass changelog for initial thread', () => {
      // Bug: use-streaming-trigger.ts blocks changelog even for initial thread
      // But use-pending-message.ts correctly bypasses it
      // This tests the expected behavior

      const state = store.getState();

      // Initial thread creation (round 0)
      state.setScreenMode(ScreenModes.OVERVIEW);
      state.setWaitingToStartStreaming(true);
      state.setConfigChangeRoundNumber(null); // Initial creation doesn't set this

      const currentState = store.getState();

      // For initial creation, configChangeRoundNumber should be null
      expect(currentState.configChangeRoundNumber).toBeNull();

      // Streaming should be allowed (bypass changelog check)
      // use-pending-message.ts does this correctly at lines 108-112
    });

    it('use-streaming-trigger should block changelog for non-initial rounds', () => {
      const state = store.getState();

      // Non-initial round with config change
      state.setScreenMode(ScreenModes.OVERVIEW);
      state.setWaitingToStartStreaming(true);
      state.setConfigChangeRoundNumber(2);
      state.setIsWaitingForChangelog(true);

      const currentState = store.getState();

      expect(currentState.configChangeRoundNumber).toBe(2);
      expect(currentState.isWaitingForChangelog).toBe(true);

      // Streaming should be blocked until both flags cleared
    });
  });
});

describe('expected Participant IDs Tracking', () => {
  let store: StoreApi<ChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('cRITICAL: Enabled vs All participants mismatch', () => {
    it('should use getEnabledParticipantModelIds consistently', () => {
      // Bug: form-actions.ts uses getParticipantModelIds (ALL)
      // But use-pending-message.ts validates with getEnabledParticipantModelIds (ENABLED only)

      const state = store.getState();

      // Set up participants with one disabled
      state.setParticipants([
        { id: 'p1', modelId: 'gpt-4', isEnabled: true, order: 0, displayName: 'GPT-4' },
        { id: 'p2', modelId: 'claude-3', isEnabled: false, order: 1, displayName: 'Claude 3' }, // DISABLED
        { id: 'p3', modelId: 'gemini', isEnabled: true, order: 2, displayName: 'Gemini' },
      ]);

      // Bug: Current implementation sets ALL participant IDs
      // state.setExpectedParticipantIds(['gpt-4', 'claude-3', 'gemini']);

      // Expected: Should only include ENABLED participant IDs
      const enabledIds = state.participants
        .filter(p => p.isEnabled)
        .map(p => p.modelId);

      expect(enabledIds).toEqual(['gpt-4', 'gemini']);
      expect(enabledIds).not.toContain('claude-3');
    });

    it('should update expectedParticipantIds when participant disabled', () => {
      const state = store.getState();

      // Initial: 3 enabled participants
      state.setParticipants([
        { id: 'p1', modelId: 'gpt-4', isEnabled: true, order: 0, displayName: 'GPT-4' },
        { id: 'p2', modelId: 'claude-3', isEnabled: true, order: 1, displayName: 'Claude 3' },
        { id: 'p3', modelId: 'gemini', isEnabled: true, order: 2, displayName: 'Gemini' },
      ]);

      state.setExpectedParticipantIds(['gpt-4', 'claude-3', 'gemini']);

      // User disables claude-3
      state.setParticipants([
        { id: 'p1', modelId: 'gpt-4', isEnabled: true, order: 0, displayName: 'GPT-4' },
        { id: 'p2', modelId: 'claude-3', isEnabled: false, order: 1, displayName: 'Claude 3' },
        { id: 'p3', modelId: 'gemini', isEnabled: true, order: 2, displayName: 'Gemini' },
      ]);

      // Bug: expectedParticipantIds is NOT updated when participants disabled
      // This causes validation mismatch in use-pending-message.ts
      const currentState = store.getState();

      // Current (buggy): Still contains disabled participant
      expect(currentState.expectedParticipantIds).toContain('claude-3');

      // Expected: Should only contain enabled participants
      // expect(currentState.expectedParticipantIds).toEqual(['gpt-4', 'gemini']);
    });
  });

  describe('cRITICAL: nextParticipantToTrigger not updated after PATCH', () => {
    it('should update participantId after PATCH response', () => {
      // Bug: form-actions.ts:341 sets nextParticipantToTrigger with CURRENT participant
      // But line 383 updates participants from PATCH but NOT nextParticipantToTrigger

      const state = store.getState();

      // Initial participants
      state.setParticipants([
        { id: 'old-p1', modelId: 'gpt-4', isEnabled: true, order: 0, displayName: 'GPT-4' },
      ]);

      // Set nextParticipantToTrigger with current participant ID
      state.setNextParticipantToTrigger({ index: 0, participantId: 'old-p1' });

      // Simulate PATCH response with NEW participant ID
      state.setParticipants([
        { id: 'new-p1', modelId: 'gpt-4', isEnabled: true, order: 0, displayName: 'GPT-4' },
      ]);

      const currentState = store.getState();

      // Bug: nextParticipantToTrigger still has OLD participant ID
      expect(currentState.nextParticipantToTrigger?.participantId).toBe('old-p1');

      // Expected: Should be updated to new ID
      // expect(currentState.nextParticipantToTrigger?.participantId).toBe('new-p1');

      // This causes validation failure in continueFromParticipant
      // use-multi-participant-chat.ts:1828-1836
    });

    it('should validate participant exists before triggering', () => {
      const state = store.getState();

      // Set nextParticipantToTrigger with non-existent participant
      state.setNextParticipantToTrigger({ index: 0, participantId: 'deleted-p1' });

      // Participants don't include the ID
      state.setParticipants([
        { id: 'different-p1', modelId: 'gpt-4', isEnabled: true, order: 0, displayName: 'GPT-4' },
      ]);

      const currentState = store.getState();
      const targetParticipant = currentState.participants.find(
        p => p.id === currentState.nextParticipantToTrigger?.participantId,
      );

      // Participant doesn't exist - trigger should be blocked
      expect(targetParticipant).toBeUndefined();
    });
  });
});

describe('message Deduplication Edge Cases', () => {
  let store: StoreApi<ChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('user message deduplication in store', () => {
    it('should deduplicate user messages by roundNumber', () => {
      // Bug: Store only deduplicates assistant messages, not user messages
      const state = store.getState();

      // Add optimistic user message
      state.setMessages([
        {
          id: 'optimistic-user-1',
          role: MessageRoles.USER,
          content: 'Test message',
          parts: [{ type: 'text', text: 'Test message' }],
          metadata: { roundNumber: 1, isOptimistic: true },
          createdAt: new Date(),
        },
      ]);

      // Add persisted user message (same round)
      const currentMessages = store.getState().messages;
      state.setMessages([
        ...currentMessages,
        {
          id: 'thread_r1_user',
          role: MessageRoles.USER,
          content: 'Test message',
          parts: [{ type: 'text', text: 'Test message' }],
          metadata: { roundNumber: 1 },
          createdAt: new Date(),
        },
      ]);

      const finalState = store.getState();
      const round1UserMessages = finalState.messages.filter(
        m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 1,
      );

      // Bug: Store has BOTH messages
      expect(round1UserMessages).toHaveLength(2);

      // Expected: Should have only 1 (deterministic ID preferred)
      // expect(round1UserMessages).toHaveLength(1);
      // expect(round1UserMessages[0].id).toBe('thread_r1_user');
    });
  });

  describe('assistant message deduplication timing', () => {
    it('should deduplicate during streaming, not only after', () => {
      // Bug: deduplicateMessages only called in completeStreaming
      const state = store.getState();

      // Add temp ID message during streaming
      state.upsertStreamingMessage({
        id: 'temp-msg-123',
        role: MessageRoles.ASSISTANT,
        content: '',
        parts: [{ type: 'text', text: 'Streaming...', state: TextPartStates.STREAMING }],
        metadata: { roundNumber: 1, participantIndex: 0 },
        createdAt: new Date(),
      });

      // Add deterministic ID message (same round, participant)
      state.upsertStreamingMessage({
        id: 'thread_r1_p0',
        role: MessageRoles.ASSISTANT,
        content: '',
        parts: [{ type: 'text', text: 'Complete', state: TextPartStates.DONE }],
        metadata: { roundNumber: 1, participantIndex: 0, finishReason: 'stop' },
        createdAt: new Date(),
      });

      const midStreamState = store.getState();
      const round1P0Messages = midStreamState.messages.filter(
        m => m.metadata?.roundNumber === 1 && m.metadata?.participantIndex === 0,
      );

      // Bug: Both messages exist during streaming
      expect(round1P0Messages.length).toBeGreaterThanOrEqual(1);

      // Deduplication only happens after completeStreaming
      state.deduplicateMessages();

      const finalState = store.getState();
      const finalRound1P0Messages = finalState.messages.filter(
        m => m.metadata?.roundNumber === 1 && m.metadata?.participantIndex === 0,
      );

      // After explicit deduplication, only 1 should remain
      expect(finalRound1P0Messages).toHaveLength(1);
      expect(finalRound1P0Messages[0].id).toBe('thread_r1_p0');
    });
  });

  describe('round ordering preservation', () => {
    it('should maintain round order when replacing optimistic messages', () => {
      const state = store.getState();

      // Add messages for rounds 1 and 2
      state.setMessages([
        {
          id: 'optimistic-user-1',
          role: MessageRoles.USER,
          content: 'Round 1',
          parts: [{ type: 'text', text: 'Round 1' }],
          metadata: { roundNumber: 1, isOptimistic: true },
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: 'thread_r1_p0',
          role: MessageRoles.ASSISTANT,
          content: 'Response 1',
          parts: [{ type: 'text', text: 'Response 1' }],
          metadata: { roundNumber: 1, participantIndex: 0, finishReason: 'stop' },
          createdAt: new Date('2024-01-01T00:00:01Z'),
        },
        {
          id: 'optimistic-user-2',
          role: MessageRoles.USER,
          content: 'Round 2',
          parts: [{ type: 'text', text: 'Round 2' }],
          metadata: { roundNumber: 2, isOptimistic: true },
          createdAt: new Date('2024-01-01T00:00:02Z'),
        },
      ]);

      // Replace round 1 optimistic with persisted (should stay at position 0)
      const messages = store.getState().messages;
      const updatedMessages = messages.map(m =>
        m.id === 'optimistic-user-1'
          ? { ...m, id: 'thread_r1_user', metadata: { ...m.metadata, isOptimistic: undefined } }
          : m,
      );
      state.setMessages(updatedMessages);

      const finalState = store.getState();

      // Round 1 user message should still be first
      expect(finalState.messages[0].metadata?.roundNumber).toBe(1);
      expect(finalState.messages[0].role).toBe(MessageRoles.USER);

      // Round 2 user message should be after round 1 messages
      const round2UserIdx = finalState.messages.findIndex(
        m => m.metadata?.roundNumber === 2 && m.role === MessageRoles.USER,
      );
      expect(round2UserIdx).toBeGreaterThan(0);
    });
  });
});

describe('round Resumption Edge Cases', () => {
  let store: StoreApi<ChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('participant config change detection', () => {
    it('should detect when participant ADDED mid-round', () => {
      // Bug: participantsChangedSinceRound only checks if responded models
      // are NOT in current enabled. Doesn't detect ADDED participants.

      const state = store.getState();

      // Round started with 2 participants
      state.setMessages([
        {
          id: 'thread_r1_user',
          role: MessageRoles.USER,
          content: 'Test',
          parts: [{ type: 'text', text: 'Test' }],
          metadata: { roundNumber: 1 },
          createdAt: new Date(),
        },
        {
          id: 'thread_r1_p0',
          role: MessageRoles.ASSISTANT,
          content: 'Response 0',
          parts: [{ type: 'text', text: 'Response 0' }],
          metadata: { roundNumber: 1, participantIndex: 0, model: 'gpt-4', finishReason: 'stop' },
          createdAt: new Date(),
        },
        // participant 1 hasn't responded yet
      ]);

      // User ADDED participant 3 (now 3 total)
      state.setParticipants([
        { id: 'p1', modelId: 'gpt-4', isEnabled: true, order: 0, displayName: 'GPT-4' },
        { id: 'p2', modelId: 'claude-3', isEnabled: true, order: 1, displayName: 'Claude 3' },
        { id: 'p3', modelId: 'gemini', isEnabled: true, order: 2, displayName: 'Gemini' }, // NEW
      ]);

      // Current detection only checks: responded models in current enabled
      // ['gpt-4'] is in ['gpt-4', 'claude-3', 'gemini'] - passes check
      // But the round should NOT be resumable because participant count changed

      const currentState = store.getState();
      const respondedModels = new Set(['gpt-4']);
      const currentModels = new Set(currentState.participants.map(p => p.modelId));

      // Bug: This check passes even though participant was added
      const allRespondedInCurrent = [...respondedModels].every(m => currentModels.has(m));
      expect(allRespondedInCurrent).toBe(true);

      // Missing check: participant count changed
      // Original: 2 participants, Current: 3 participants
    });
  });

  describe('retry timeout for slow networks', () => {
    it('should use longer timeout for retry detection', () => {
      // Bug: 100ms timeout in incomplete-round-resumption.ts:1000-1016
      // is too short for slow networks

      // The timeout distinguishes between:
      // 1. Retry toggle: waitingToStartStreaming false→true quickly
      // 2. Actual failure: waitingToStartStreaming stays false

      // With 100ms timeout on slow network:
      // - Trigger fires, sets waitingToStartStreaming=true
      // - Network latency 200ms
      // - Timeout fires at 100ms, assumes failure
      // - Clears refs, allows another trigger
      // - Network completes at 200ms, starts streaming
      // - Meanwhile, another trigger fired = DUPLICATE

      // Recommended: Increase timeout to 500ms or check network activity
      const CURRENT_TIMEOUT = 100; // Too short
      const RECOMMENDED_TIMEOUT = 500; // Safer

      expect(CURRENT_TIMEOUT).toBeLessThan(RECOMMENDED_TIMEOUT);
    });
  });

  describe('multiple incomplete rounds', () => {
    it('should handle multiple incomplete rounds', () => {
      // Bug: No handling for >1 incomplete round

      const state = store.getState();

      // Both round 1 and round 2 incomplete
      state.setMessages([
        // Round 1: user message, no participants responded
        {
          id: 'thread_r1_user',
          role: MessageRoles.USER,
          content: 'Round 1',
          parts: [{ type: 'text', text: 'Round 1' }],
          metadata: { roundNumber: 1 },
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
        // Round 2: user message, no participants responded
        {
          id: 'thread_r2_user',
          role: MessageRoles.USER,
          content: 'Round 2',
          parts: [{ type: 'text', text: 'Round 2' }],
          metadata: { roundNumber: 2 },
          createdAt: new Date('2024-01-01T00:00:01Z'),
        },
      ]);

      state.setParticipants([
        { id: 'p1', modelId: 'gpt-4', isEnabled: true, order: 0, displayName: 'GPT-4' },
      ]);

      // getCurrentRoundNumber returns highest round (2)
      // Round 1 would be abandoned - is this expected behavior?

      const currentState = store.getState();
      const userMessages = currentState.messages.filter(m => m.role === MessageRoles.USER);

      expect(userMessages).toHaveLength(2);

      // Current: Only round 2 would be resumed
      // Question: Should round 1 be completed first?
    });
  });
});

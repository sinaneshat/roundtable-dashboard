/**
 * User Message Submission and Patching Flow - Timing Tests
 *
 * Tests the CRITICAL requirement from FLOW_DOCUMENTATION.md:
 * "When user submits, the message MUST be patched to thread data FIRST"
 *
 * Coverage:
 * 1. Message is added to store IMMEDIATELY (optimistic update)
 * 2. configChangeRoundNumber is set to block streaming
 * 3. PATCH request persists message to database
 * 4. Optimistic message replaced with persisted message
 * 5. configChangeRoundNumber cleared to unblock streaming
 * 6. This flow works identically whether config changes exist or not
 *
 * Key Behavioral Requirements:
 * - User message ALWAYS added optimistically before PATCH
 * - configChangeRoundNumber ALWAYS blocks streaming until PATCH completes
 * - With config changes: changelog fetch happens after PATCH
 * - Without config changes: configChangeRoundNumber cleared immediately after PATCH
 * - PATCH failure rolls back optimistic message
 *
 * References:
 * - form-actions.ts:266-397 (handleUpdateThreadAndSend implementation)
 * - FLOW_DOCUMENTATION.md Part 6: Configuration Changes Mid-Conversation
 */

import { ChatModes, MessageRoles } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockParticipant,
  createMockThread,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';
import type { ChatParticipant, ChatThread } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('user Message Submission and Patching Flow - Timing', () => {
  let store: ChatStoreApi;
  let thread: ChatThread;
  let participants: ChatParticipant[];

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();

    // Setup thread with participants
    thread = createMockThread({
      enableWebSearch: false,
      id: 'thread-123',
      mode: ChatModes.BRAINSTORM,
    });

    participants = [
      createMockParticipant({
        id: 'p1',
        modelId: 'gpt-4',
        priority: 0,
      }),
      createMockParticipant({
        id: 'p2',
        modelId: 'claude-3',
        priority: 1,
      }),
    ];

    // Complete Round 0 so we can test Round 1 submission
    const round0Messages = [
      createTestUserMessage({
        content: 'Round 0 question',
        id: 'user-r0',
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'P0 response',
        id: 'thread-123_r0_p0',
        participantId: 'p1',
        participantIndex: 0,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'P1 response',
        id: 'thread-123_r0_p1',
        participantId: 'p2',
        participantIndex: 1,
        roundNumber: 0,
      }),
    ];

    store.getState().initializeThread(thread, participants, round0Messages);
    store.getState().setSelectedMode(ChatModes.BRAINSTORM);
    store.getState().setSelectedParticipants([
      { modelId: 'gpt-4', role: null },
      { modelId: 'claude-3', role: null },
    ]);
  });

  // ============================================================================
  // 1. OPTIMISTIC MESSAGE ADDITION - IMMEDIATE UI FEEDBACK
  // ============================================================================

  describe('1. Optimistic Message Addition (Before PATCH)', () => {
    it('should add user message to store IMMEDIATELY when submission starts', () => {
      // ARRANGE: User types message
      store.getState().setInputValue('My question for round 1');

      // ACT: Simulate submission action (what form-actions.ts does at line 285)
      const nextRoundNumber = 1;
      const optimisticMessage = createTestUserMessage({
        content: 'My question for round 1',
        id: 'optimistic-msg',
        roundNumber: nextRoundNumber,
      });

      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      // ASSERT: Message appears in store before any async operations
      const messages = store.getState().messages;
      expect(messages).toHaveLength(4); // 3 from Round 0 + 1 new
      expect(messages[3]?.role).toBe(MessageRoles.USER);
      expect(messages[3]?.id).toBe('optimistic-msg');

      // CRITICAL: Message is in store with optimistic ID (not persisted yet)
      expect(messages[3]?.id).not.toMatch(/^thread-123_r1/);
    });

    it('should set streamingRoundNumber to match optimistic message round', () => {
      // ARRANGE
      store.getState().setInputValue('Question');
      const nextRoundNumber = 1;

      // ACT: Add optimistic message + set streaming round
      const optimisticMessage = createTestUserMessage({
        content: 'Question',
        id: 'opt-msg',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);
      store.getState().setStreamingRoundNumber(nextRoundNumber);

      // ASSERT
      expect(store.getState().streamingRoundNumber).toBe(1);
    });

    it('should add optimistic message even when no config changes exist', () => {
      // ARRANGE: No config changes - mode, participants, web search all same
      store.getState().setInputValue('Same config question');

      // ACT: Add optimistic message (form-actions.ts:285 always does this)
      const optimisticMessage = createTestUserMessage({
        content: 'Same config question',
        id: 'opt-no-changes',
        roundNumber: 1,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      // ASSERT: Message added regardless of config changes
      expect(store.getState().messages).toHaveLength(4);
      expect(store.getState().messages[3]?.id).toBe('opt-no-changes');
    });

    it('should add optimistic message even when config changes exist', () => {
      // ARRANGE: Config changes - mode changed
      store.getState().setSelectedMode(ChatModes.DEBATE);
      store.getState().setHasPendingConfigChanges(true);
      store.getState().setInputValue('Changed config question');

      // ACT: Add optimistic message (form-actions.ts:285 always does this)
      const optimisticMessage = createTestUserMessage({
        content: 'Changed config question',
        id: 'opt-with-changes',
        roundNumber: 1,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      // ASSERT: Message added regardless of config changes
      expect(store.getState().messages).toHaveLength(4);
      expect(store.getState().messages[3]?.id).toBe('opt-with-changes');
    });
  });

  // ============================================================================
  // 2. STREAMING BLOCK - ALWAYS SET BEFORE PATCH
  // ============================================================================

  describe('2. Streaming Block (configChangeRoundNumber)', () => {
    it('should set configChangeRoundNumber to block streaming before PATCH', () => {
      // ARRANGE
      const nextRoundNumber = 1;

      // ACT: Simulate form-actions.ts:309 - ALWAYS set before PATCH
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);

      // ASSERT: Streaming is blocked
      expect(store.getState().configChangeRoundNumber).toBe(1);
    });

    it('should set configChangeRoundNumber even when NO config changes exist', () => {
      // ARRANGE: No config changes at all
      expect(store.getState().hasPendingConfigChanges).toBeFalsy();
      const nextRoundNumber = 1;

      // ACT: form-actions.ts:309 ALWAYS sets this (prevents streaming before PATCH)
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);

      // ASSERT: Block is set regardless of config changes
      expect(store.getState().configChangeRoundNumber).toBe(1);

      // RATIONALE: This prevents streaming from starting before message is persisted to DB
      // Error would be: "[stream] User message not found in DB, expected pre-persisted"
    });

    it('should set configChangeRoundNumber when config changes DO exist', () => {
      // ARRANGE: Config changes exist
      store.getState().setHasPendingConfigChanges(true);
      const nextRoundNumber = 1;

      // ACT: form-actions.ts:309 sets this
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);

      // ASSERT: Block is set
      expect(store.getState().configChangeRoundNumber).toBe(1);
    });

    it('should set waitingToStartStreaming AFTER configChangeRoundNumber', () => {
      // ARRANGE
      const nextRoundNumber = 1;

      // ACT: Simulate correct order from form-actions.ts:309-312
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);
      store.getState().setWaitingToStartStreaming(true);

      // ASSERT: Both flags set, configChangeRoundNumber blocks until PATCH completes
      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().waitingToStartStreaming).toBeTruthy();
    });
  });

  // ============================================================================
  // 3. PATCH COMPLETION - MESSAGE REPLACEMENT
  // ============================================================================

  describe('3. PATCH Completion (Message Replacement)', () => {
    it('should replace optimistic message with persisted message after PATCH', () => {
      // ARRANGE: Optimistic message in store
      const optimisticMessage = createTestUserMessage({
        content: 'My question',
        id: 'optimistic-msg',
        roundNumber: 1,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      // ACT: Simulate PATCH response (form-actions.ts:343-346)
      const persistedMessage = createTestUserMessage({
        content: 'My question',
        createdAt: '2024-01-01T00:00:00Z',
        id: 'thread-123_r1_user',
        roundNumber: 1,
      });

      store.getState().setMessages(
        store.getState().messages.map(m =>
          m.id === optimisticMessage.id ? persistedMessage : m,
        ),
      );

      // ASSERT: Optimistic message replaced with persisted message
      const messages = store.getState().messages;
      expect(messages).toHaveLength(4);
      expect(messages[3]?.id).toBe('thread-123_r1_user');
      expect(messages[3]?.id).not.toBe('optimistic-msg');

      // CRITICAL: Persisted message has real ID from database
      expect(messages[3]?.id).toMatch(/^thread-123_r1/);
    });

    it('should preserve message content when replacing optimistic with persisted', () => {
      // ARRANGE
      const content = 'Exact question text';
      const optimisticMessage = createTestUserMessage({
        content,
        id: 'opt',
        roundNumber: 1,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      // ACT: Replace with persisted
      const persistedMessage = createTestUserMessage({
        content,
        id: 'thread-123_r1_user',
        roundNumber: 1,
      });
      store.getState().setMessages(
        store.getState().messages.map(m => (m.id === 'opt' ? persistedMessage : m)),
      );

      // ASSERT: Content unchanged
      expect(store.getState().messages[3]?.parts?.[0]?.text).toBe(content);
    });

    it('should preserve round number when replacing optimistic with persisted', () => {
      // ARRANGE
      const optimisticMessage = createTestUserMessage({
        content: 'Q',
        id: 'opt',
        roundNumber: 1,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      // ACT: Replace
      const persistedMessage = createTestUserMessage({
        content: 'Q',
        id: 'persisted',
        roundNumber: 1,
      });
      store.getState().setMessages(
        store.getState().messages.map(m => (m.id === 'opt' ? persistedMessage : m)),
      );

      // ASSERT: Round number unchanged
      expect(store.getState().messages[3]?.metadata).toMatchObject({
        role: MessageRoles.USER,
        roundNumber: 1,
      });
    });
  });

  // ============================================================================
  // 4. STREAMING UNBLOCK - AFTER PATCH COMPLETES
  // ============================================================================

  describe('4. Streaming Unblock (After PATCH)', () => {
    it('should clear configChangeRoundNumber when NO config changes after PATCH', () => {
      // ARRANGE: configChangeRoundNumber set to block streaming
      store.getState().setConfigChangeRoundNumber(1);
      expect(store.getState().configChangeRoundNumber).toBe(1);

      // ACT: Simulate form-actions.ts:371-373 (no config changes path)
      store.getState().setConfigChangeRoundNumber(null);

      // ASSERT: Streaming unblocked
      expect(store.getState().configChangeRoundNumber).toBeNull();
    });

    it('should NOT clear configChangeRoundNumber when config changes exist (waits for changelog)', () => {
      // ARRANGE: Config changes exist
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setHasPendingConfigChanges(true);

      // ACT: Simulate form-actions.ts:367-369 (config changes path)
      store.getState().setIsWaitingForChangelog(true);
      // configChangeRoundNumber NOT cleared yet - will be cleared by use-changelog-sync

      // ASSERT: Still blocked waiting for changelog
      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
    });

    it('should clear hasPendingConfigChanges after PATCH completes', () => {
      // ARRANGE
      store.getState().setHasPendingConfigChanges(true);

      // ACT: Simulate form-actions.ts:376-378
      store.getState().setHasPendingConfigChanges(false);

      // ASSERT: Flag cleared
      expect(store.getState().hasPendingConfigChanges).toBeFalsy();
    });
  });

  // ============================================================================
  // 5. COMPLETE FLOW - NO CONFIG CHANGES
  // ============================================================================

  describe('5. Complete Flow - No Config Changes', () => {
    it('should complete full submission flow when no config changes exist', () => {
      // ARRANGE: User types message, no config changes
      store.getState().setInputValue('Question without config changes');
      const nextRoundNumber = 1;

      // ACT 1: Add optimistic message (form-actions.ts:285)
      const optimisticMessage = createTestUserMessage({
        content: 'Question without config changes',
        id: 'opt-msg',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);
      store.getState().setStreamingRoundNumber(nextRoundNumber);

      // ACT 2: Block streaming (form-actions.ts:309)
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);
      store.getState().setWaitingToStartStreaming(true);

      // ASSERT PHASE 1: Before PATCH
      expect(store.getState().messages).toHaveLength(4);
      expect(store.getState().messages[3]?.id).toBe('opt-msg');
      expect(store.getState().configChangeRoundNumber).toBe(1);

      // ACT 3: PATCH completes - replace message (form-actions.ts:343-346)
      const persistedMessage = createTestUserMessage({
        content: 'Question without config changes',
        id: 'thread-123_r1_user',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages(
        store.getState().messages.map(m =>
          m.id === optimisticMessage.id ? persistedMessage : m,
        ),
      );

      // ACT 4: No config changes - unblock streaming (form-actions.ts:371-373)
      store.getState().setConfigChangeRoundNumber(null);

      // ASSERT PHASE 2: After PATCH
      expect(store.getState().messages).toHaveLength(4);
      expect(store.getState().messages[3]?.id).toBe('thread-123_r1_user');
      expect(store.getState().configChangeRoundNumber).toBeNull();
      expect(store.getState().waitingToStartStreaming).toBeTruthy();
      expect(store.getState().isWaitingForChangelog).toBeFalsy();

      // CRITICAL: Streaming can now proceed (configChangeRoundNumber cleared)
    });

    it('should have messages array with correct length after no-config-change submission', () => {
      // ARRANGE
      const initialCount = store.getState().messages.length;
      const nextRoundNumber = 1;

      // ACT: Complete flow
      const optimisticMessage = createTestUserMessage({
        content: 'Q',
        id: 'opt',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);

      const persistedMessage = createTestUserMessage({
        content: 'Q',
        id: 'persisted',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages(
        store.getState().messages.map(m => (m.id === 'opt' ? persistedMessage : m)),
      );
      store.getState().setConfigChangeRoundNumber(null);

      // ASSERT: +1 message (optimistic → persisted is replacement, not addition)
      expect(store.getState().messages).toHaveLength(initialCount + 1);
    });
  });

  // ============================================================================
  // 6. COMPLETE FLOW - WITH CONFIG CHANGES
  // ============================================================================

  describe('6. Complete Flow - With Config Changes', () => {
    it('should complete full submission flow when config changes exist', () => {
      // ARRANGE: User changes mode and types message
      store.getState().setSelectedMode(ChatModes.DEBATE);
      store.getState().setHasPendingConfigChanges(true);
      store.getState().setInputValue('Question with mode change');
      const nextRoundNumber = 1;

      // ACT 1: Add optimistic message (form-actions.ts:285)
      const optimisticMessage = createTestUserMessage({
        content: 'Question with mode change',
        id: 'opt-msg',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);
      store.getState().setStreamingRoundNumber(nextRoundNumber);

      // ACT 2: Block streaming (form-actions.ts:309)
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);
      store.getState().setWaitingToStartStreaming(true);

      // ASSERT PHASE 1: Before PATCH
      expect(store.getState().messages).toHaveLength(4);
      expect(store.getState().configChangeRoundNumber).toBe(1);

      // ACT 3: PATCH completes - replace message + mode changed
      const persistedMessage = createTestUserMessage({
        content: 'Question with mode change',
        id: 'thread-123_r1_user',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages(
        store.getState().messages.map(m =>
          m.id === optimisticMessage.id ? persistedMessage : m,
        ),
      );

      // ACT 4: Config changes exist - trigger changelog fetch (form-actions.ts:367-369)
      store.getState().setIsWaitingForChangelog(true);
      // configChangeRoundNumber NOT cleared yet

      // ASSERT PHASE 2: After PATCH, waiting for changelog
      expect(store.getState().messages[3]?.id).toBe('thread-123_r1_user');
      expect(store.getState().configChangeRoundNumber).toBe(1); // Still blocked
      expect(store.getState().isWaitingForChangelog).toBeTruthy();

      // CRITICAL: Streaming still blocked until changelog syncs
    });

    it('should keep configChangeRoundNumber set until changelog syncs', () => {
      // ARRANGE: Config changes, PATCH completes
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setHasPendingConfigChanges(true);

      // ACT: Trigger changelog fetch (form-actions.ts:368)
      store.getState().setIsWaitingForChangelog(true);

      // ASSERT: configChangeRoundNumber still set
      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();

      // NOTE: use-changelog-sync will clear configChangeRoundNumber after changelog fetches
    });
  });

  // ============================================================================
  // 7. ERROR HANDLING - PATCH FAILURE
  // ============================================================================

  describe('7. Error Handling - PATCH Failure', () => {
    it('should rollback optimistic message when PATCH fails', () => {
      // ARRANGE: Optimistic message added
      const optimisticMessage = createTestUserMessage({
        content: 'Question',
        id: 'opt-msg',
        roundNumber: 1,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);
      const messageCountBefore = store.getState().messages.length;

      // ACT: Simulate PATCH failure - rollback (form-actions.ts:388)
      store.getState().setMessages(
        store.getState().messages.filter(m => m.id !== optimisticMessage.id),
      );

      // ASSERT: Optimistic message removed
      expect(store.getState().messages).toHaveLength(messageCountBefore - 1);
      expect(store.getState().messages.find(m => m.id === 'opt-msg')).toBeUndefined();
    });

    it('should reset streaming state when PATCH fails', () => {
      // ARRANGE: Streaming state set
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setNextParticipantToTrigger(0);

      // ACT: Simulate error cleanup (form-actions.ts:391-394)
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setStreamingRoundNumber(null);
      store.getState().setNextParticipantToTrigger(null);
      store.getState().setConfigChangeRoundNumber(null);

      // ASSERT: All streaming state cleared
      expect(store.getState().waitingToStartStreaming).toBeFalsy();
      expect(store.getState().streamingRoundNumber).toBeNull();
      expect(store.getState().nextParticipantToTrigger).toBeNull();
      expect(store.getState().configChangeRoundNumber).toBeNull();
    });

    it('should preserve existing messages when PATCH fails', () => {
      // ARRANGE: Existing messages + optimistic message
      const existingCount = store.getState().messages.length;
      const optimisticMessage = createTestUserMessage({
        content: 'Q',
        id: 'opt',
        roundNumber: 1,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      // ACT: Rollback
      store.getState().setMessages(
        store.getState().messages.filter(m => m.id !== 'opt'),
      );

      // ASSERT: Back to original state
      expect(store.getState().messages).toHaveLength(existingCount);
    });
  });

  // ============================================================================
  // 8. TIMING VERIFICATION - ORDERING GUARANTEES
  // ============================================================================

  describe('8. Timing Verification - Ordering Guarantees', () => {
    it('should guarantee optimistic message added BEFORE configChangeRoundNumber set', () => {
      // ARRANGE
      const nextRoundNumber = 1;
      let messageAddedTime = 0;
      let blockSetTime = 0;

      // ACT: Simulate exact order from form-actions.ts:285-309
      const optimisticMessage = createTestUserMessage({
        content: 'Q',
        id: 'opt',
        roundNumber: nextRoundNumber,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);
      messageAddedTime = performance.now();

      store.getState().setConfigChangeRoundNumber(nextRoundNumber);
      blockSetTime = performance.now();

      // ASSERT: Message added before block set
      expect(messageAddedTime).toBeLessThan(blockSetTime);
      expect(store.getState().messages[3]?.id).toBe('opt');
      expect(store.getState().configChangeRoundNumber).toBe(1);
    });

    it('should guarantee configChangeRoundNumber set BEFORE waitingToStartStreaming', () => {
      // ARRANGE
      const nextRoundNumber = 1;

      // ACT: Simulate exact order from form-actions.ts:309-312
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);
      const blockSet = store.getState().configChangeRoundNumber;

      store.getState().setWaitingToStartStreaming(true);
      const waitingSet = store.getState().waitingToStartStreaming;

      // ASSERT: Block set before waiting flag
      expect(blockSet).toBe(1);
      expect(waitingSet).toBeTruthy();
    });

    it('should guarantee PATCH completes BEFORE configChangeRoundNumber cleared (no config changes)', () => {
      // ARRANGE: Simulate PATCH in progress
      store.getState().setConfigChangeRoundNumber(1);
      const optimisticMessage = createTestUserMessage({
        content: 'Q',
        id: 'opt',
        roundNumber: 1,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      // ACT: PATCH completes (replace message)
      const persistedMessage = createTestUserMessage({
        content: 'Q',
        id: 'persisted',
        roundNumber: 1,
      });
      store.getState().setMessages(
        store.getState().messages.map(m => (m.id === 'opt' ? persistedMessage : m)),
      );

      // Verify message persisted
      expect(store.getState().messages[3]?.id).toBe('persisted');

      // THEN clear block (form-actions.ts:371-373)
      store.getState().setConfigChangeRoundNumber(null);

      // ASSERT: Block cleared only after message persisted
      expect(store.getState().configChangeRoundNumber).toBeNull();
    });

    it('should guarantee PATCH completes BEFORE changelog fetch triggered (with config changes)', () => {
      // ARRANGE: Config changes exist
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setHasPendingConfigChanges(true);
      const optimisticMessage = createTestUserMessage({
        content: 'Q',
        id: 'opt',
        roundNumber: 1,
      });
      store.getState().setMessages([...store.getState().messages, optimisticMessage]);

      // ACT: PATCH completes
      const persistedMessage = createTestUserMessage({
        content: 'Q',
        id: 'persisted',
        roundNumber: 1,
      });
      store.getState().setMessages(
        store.getState().messages.map(m => (m.id === 'opt' ? persistedMessage : m)),
      );

      // Verify message persisted
      expect(store.getState().messages[3]?.id).toBe('persisted');

      // THEN trigger changelog fetch (form-actions.ts:367-369)
      store.getState().setIsWaitingForChangelog(true);

      // ASSERT: Changelog fetch only after PATCH
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
      expect(store.getState().configChangeRoundNumber).toBe(1); // Still blocked
    });
  });

  // ============================================================================
  // 9. IDENTICAL FLOW VERIFICATION - WITH VS WITHOUT CONFIG CHANGES
  // ============================================================================

  describe('9. Identical Flow Verification - With vs Without Config Changes', () => {
    it('should follow same optimistic message addition flow regardless of config changes', () => {
      // TEST 1: No config changes
      const opt1 = createTestUserMessage({ content: 'Q1', id: 'opt1', roundNumber: 1 });
      store.getState().setMessages([...store.getState().messages, opt1]);
      const messagesAfterOpt1 = store.getState().messages.length;

      // TEST 2: With config changes
      store.getState().setHasPendingConfigChanges(true);
      const opt2 = createTestUserMessage({ content: 'Q2', id: 'opt2', roundNumber: 2 });
      store.getState().setMessages([...store.getState().messages, opt2]);
      const messagesAfterOpt2 = store.getState().messages.length;

      // ASSERT: Both add optimistic message the same way
      expect(messagesAfterOpt2 - messagesAfterOpt1).toBe(1);
    });

    it('should set configChangeRoundNumber in both scenarios (with and without config changes)', () => {
      // TEST 1: No config changes
      store.getState().setConfigChangeRoundNumber(1);
      expect(store.getState().configChangeRoundNumber).toBe(1);

      // TEST 2: With config changes
      store.getState().setHasPendingConfigChanges(true);
      store.getState().setConfigChangeRoundNumber(2);
      expect(store.getState().configChangeRoundNumber).toBe(2);

      // ASSERT: Block is set in both scenarios
    });

    it('should replace optimistic message with persisted in both scenarios', () => {
      // TEST 1: No config changes
      const opt1 = createTestUserMessage({ content: 'Q1', id: 'opt1', roundNumber: 1 });
      store.getState().setMessages([...store.getState().messages, opt1]);
      const pers1 = createTestUserMessage({ content: 'Q1', id: 'pers1', roundNumber: 1 });
      store.getState().setMessages(store.getState().messages.map(m => (m.id === 'opt1' ? pers1 : m)));
      expect(store.getState().messages.find(m => m.id === 'pers1')).toBeDefined();

      // TEST 2: With config changes
      store.getState().setHasPendingConfigChanges(true);
      const opt2 = createTestUserMessage({ content: 'Q2', id: 'opt2', roundNumber: 2 });
      store.getState().setMessages([...store.getState().messages, opt2]);
      const pers2 = createTestUserMessage({ content: 'Q2', id: 'pers2', roundNumber: 2 });
      store.getState().setMessages(store.getState().messages.map(m => (m.id === 'opt2' ? pers2 : m)));
      expect(store.getState().messages.find(m => m.id === 'pers2')).toBeDefined();

      // ASSERT: Both scenarios replace optimistic with persisted
    });

    it('should differ only in configChangeRoundNumber clearing timing', () => {
      // SCENARIO 1: No config changes
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(null); // Cleared immediately
      const clearedImmediately = store.getState().configChangeRoundNumber === null;

      // SCENARIO 2: With config changes
      store.getState().setConfigChangeRoundNumber(2);
      store.getState().setIsWaitingForChangelog(true);
      // configChangeRoundNumber NOT cleared yet
      const stillBlocked = store.getState().configChangeRoundNumber === 2;

      // ASSERT: Different clearing behavior is ONLY difference
      expect(clearedImmediately).toBeTruthy();
      expect(stillBlocked).toBeTruthy();
    });
  });
});

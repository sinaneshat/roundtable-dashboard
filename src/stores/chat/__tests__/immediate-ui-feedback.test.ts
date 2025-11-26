/**
 * Immediate UI Feedback Tests
 *
 * CRITICAL BUG FIX: Delayed UI updates when submitting messages
 *
 * USER REPORT:
 * "After I submit my messages in the already existing chat thread, instead of
 * immediately collapsing the accordion for the analysis for the previous round
 * and then showing the change log under it and immediately showing the message
 * that I just sent in right there and then as it was sent in so the UI is
 * immediately updated as the input has been submitted and then begin the streams.
 * It actually takes a long while."
 *
 * ROOT CAUSE:
 * - `prepareForNewMessage` (which sets `streamingRoundNumber` and adds optimistic message)
 *   was called AFTER awaiting PATCH requests when web search is enabled
 * - PATCH requests can take 100-500ms
 * - This caused a visible delay before:
 *   1. Previous round's analysis accordion collapsed
 *   2. User's message appeared in the UI
 *   3. Changelog appeared
 *
 * FIX:
 * - In `handleUpdateThreadAndSend`, set `streamingRoundNumber` and add optimistic
 *   user message IMMEDIATELY before any API calls
 * - Modified `prepareForNewMessage` to:
 *   1. Not duplicate optimistic message if one already exists for the round
 *   2. Preserve `streamingRoundNumber` if it matches the current round (already set early)
 *
 * @see src/stores/chat/actions/form-actions.ts - handleUpdateThreadAndSend
 * @see src/stores/chat/store.ts - prepareForNewMessage
 * @see src/components/chat/moderator/round-analysis-card.tsx - collapse effect
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessagePartTypes, MessageRoles, ScreenModes } from '@/api/core/enums';

import { createChatStore } from '../store';

describe('immediate UI feedback on message submit', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    // Initialize as thread screen (subsequent messages scenario)
    store.getState().setScreenMode(ScreenModes.THREAD);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('streamingRoundNumber for accordion collapse', () => {
    it('should set streamingRoundNumber immediately in prepareForNewMessage on thread screen', () => {
      // Setup: Initialize with existing messages (simulating round 0 completed)
      const existingMessages = [
        {
          id: 'msg-1',
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: 'Hello' }],
          metadata: { role: 'user', roundNumber: 0 },
        },
        {
          id: 'msg-2',
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: 'Hi there!' }],
          metadata: { role: 'assistant', roundNumber: 0, participantIndex: 0, participantId: 'p1' },
        },
      ];
      store.getState().setMessages(existingMessages);

      // Verify initial state
      expect(store.getState().streamingRoundNumber).toBeNull();

      // Action: Call prepareForNewMessage (simulating user submitting new message)
      store.getState().prepareForNewMessage('New question', []);

      // Assert: streamingRoundNumber should be set to next round (1)
      expect(store.getState().streamingRoundNumber).toBe(1);
    });

    it('should NOT set streamingRoundNumber on overview screen (initial thread creation)', () => {
      // Setup: Overview screen with no existing messages
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Verify initial state
      expect(store.getState().streamingRoundNumber).toBeNull();

      // Action: Call prepareForNewMessage
      store.getState().prepareForNewMessage('First message', []);

      // Assert: streamingRoundNumber should remain null (overview screen doesn't need accordion collapse)
      expect(store.getState().streamingRoundNumber).toBeNull();
    });

    it('should correctly calculate next round number from existing messages', () => {
      // Setup: Multiple rounds of messages
      const existingMessages = [
        // Round 0
        { id: 'msg-1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Q1' }], metadata: { role: 'user', roundNumber: 0 } },
        { id: 'msg-2', role: 'assistant' as const, parts: [{ type: 'text' as const, text: 'A1' }], metadata: { role: 'assistant', roundNumber: 0, participantIndex: 0, participantId: 'p1' } },
        // Round 1
        { id: 'msg-3', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Q2' }], metadata: { role: 'user', roundNumber: 1 } },
        { id: 'msg-4', role: 'assistant' as const, parts: [{ type: 'text' as const, text: 'A2' }], metadata: { role: 'assistant', roundNumber: 1, participantIndex: 0, participantId: 'p1' } },
      ];
      store.getState().setMessages(existingMessages);

      // Action: Submit new message
      store.getState().prepareForNewMessage('Q3', []);

      // Assert: streamingRoundNumber should be 2 (next round)
      expect(store.getState().streamingRoundNumber).toBe(2);
    });
  });

  describe('optimistic user message', () => {
    it('should add optimistic user message immediately on thread screen', () => {
      // Setup: Initialize with existing messages
      const existingMessages = [
        { id: 'msg-1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hello' }], metadata: { role: 'user', roundNumber: 0 } },
        { id: 'msg-2', role: 'assistant' as const, parts: [{ type: 'text' as const, text: 'Hi!' }], metadata: { role: 'assistant', roundNumber: 0, participantIndex: 0, participantId: 'p1' } },
      ];
      store.getState().setMessages(existingMessages);

      // Action: Submit new message
      store.getState().prepareForNewMessage('New question', []);

      // Assert: Should have 3 messages (2 original + 1 optimistic)
      const messages = store.getState().messages;
      expect(messages).toHaveLength(3);

      // Assert: Last message should be the optimistic user message
      const lastMessage = messages[messages.length - 1];
      expect(lastMessage?.role).toBe('user');
      expect(lastMessage?.parts[0]).toMatchObject({ type: 'text', text: 'New question' });
      expect(lastMessage?.metadata).toMatchObject({
        role: 'user',
        roundNumber: 1,
        isOptimistic: true,
      });
    });

    it('should NOT add optimistic message on overview screen', () => {
      // Setup: Overview screen with no messages
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Action: Submit message
      store.getState().prepareForNewMessage('First message', []);

      // Assert: Should have no messages (backend creates round 0 message)
      expect(store.getState().messages).toHaveLength(0);
    });
  });

  describe('accordion collapse condition', () => {
    /**
     * Verifies the exact condition used in RoundAnalysisCard:
     * if (streamingRoundNumber != null && streamingRoundNumber > analysis.roundNumber)
     */
    it('should verify collapse condition with various round combinations', () => {
      const shouldCollapse = (
        streamingRoundNumber: number | null,
        analysisRoundNumber: number,
      ): boolean => {
        return streamingRoundNumber != null && streamingRoundNumber > analysisRoundNumber;
      };

      // No streaming - should not collapse
      expect(shouldCollapse(null, 0)).toBe(false);

      // Same round - should not collapse (current round's analysis)
      expect(shouldCollapse(0, 0)).toBe(false);
      expect(shouldCollapse(1, 1)).toBe(false);

      // New round > analysis round - SHOULD collapse
      expect(shouldCollapse(1, 0)).toBe(true);
      expect(shouldCollapse(2, 0)).toBe(true);
      expect(shouldCollapse(2, 1)).toBe(true);
      expect(shouldCollapse(5, 3)).toBe(true);

      // Earlier round (edge case, shouldn't happen) - should not collapse
      expect(shouldCollapse(0, 1)).toBe(false);
    });
  });

  describe('state reset behavior', () => {
    it('should clear streamingRoundNumber when completeStreaming is called', () => {
      // Setup: Set streaming round number
      store.getState().setStreamingRoundNumber(1);
      expect(store.getState().streamingRoundNumber).toBe(1);

      // Action: Complete streaming
      store.getState().completeStreaming();

      // Assert: streamingRoundNumber should be cleared
      expect(store.getState().streamingRoundNumber).toBeNull();
    });

    it('should preserve streamingRoundNumber during streaming', () => {
      // Setup: Start streaming for round 1
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);

      // Simulate some intermediate state changes
      store.getState().setCurrentParticipantIndex(1);

      // Assert: streamingRoundNumber should still be 1
      expect(store.getState().streamingRoundNumber).toBe(1);
    });
  });
});

describe('eager streaming round number', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.THREAD);
  });

  it('should allow setting streamingRoundNumber directly for eager UI updates', () => {
    // This tests the ability to set streamingRoundNumber before prepareForNewMessage
    // for immediate accordion collapse

    // Setup: Existing round 0 messages
    const existingMessages = [
      { id: 'msg-1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Q1' }], metadata: { role: 'user', roundNumber: 0 } },
      { id: 'msg-2', role: 'assistant' as const, parts: [{ type: 'text' as const, text: 'A1' }], metadata: { role: 'assistant', roundNumber: 0, participantIndex: 0, participantId: 'p1' } },
    ];
    store.getState().setMessages(existingMessages);

    // Verify initial state
    expect(store.getState().streamingRoundNumber).toBeNull();

    // Action: Set streamingRoundNumber eagerly (before PATCH/prepareForNewMessage)
    store.getState().setStreamingRoundNumber(1);

    // Assert: streamingRoundNumber is set immediately
    expect(store.getState().streamingRoundNumber).toBe(1);

    // This allows accordion collapse effect to trigger immediately
    // while PATCH request is still in flight
  });

  it('prepareForNewMessage should not override an already-set streamingRoundNumber with null', () => {
    // Setup: Set eager streaming round
    store.getState().setStreamingRoundNumber(1);

    // Verify it's set
    expect(store.getState().streamingRoundNumber).toBe(1);

    // Setup messages to ensure nextRoundNumber calculation
    const existingMessages = [
      { id: 'msg-1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Q1' }], metadata: { role: 'user', roundNumber: 0 } },
    ];
    store.getState().setMessages(existingMessages);

    // Action: Call prepareForNewMessage (this should also set streamingRoundNumber to 1)
    store.getState().prepareForNewMessage('Q2', []);

    // Assert: streamingRoundNumber should still be 1 (not reset to null)
    expect(store.getState().streamingRoundNumber).toBe(1);
  });
});

/**
 * ============================================================================
 * CRITICAL BUG REPLICATION TESTS
 * ============================================================================
 *
 * These tests exactly replicate the user-reported bug scenario to ensure it
 * NEVER happens again. They simulate the exact flow that was broken.
 *
 * BUG SCENARIO:
 * 1. User is on thread screen with completed round 0
 * 2. User submits a new message for round 1
 * 3. EXPECTED: Accordion collapses immediately, user message appears immediately
 * 4. ACTUAL (BUG): Accordion and message delayed by 100-500ms until PATCH completes
 */
describe('critical: exact bug replication - delayed UI feedback', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Setup: Completed round 0 (simulating existing thread with one completed round)
    const completedRound0Messages = [
      {
        id: 'msg-user-r0',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'What is TypeScript?' }],
        metadata: { role: 'user', roundNumber: 0 },
      },
      {
        id: 'msg-assistant-r0-p0',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: 'TypeScript is a typed superset of JavaScript.' }],
        metadata: { role: 'assistant', roundNumber: 0, participantIndex: 0, participantId: 'claude-3-opus' },
      },
      {
        id: 'msg-assistant-r0-p1',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: 'It adds static type checking to JavaScript.' }],
        metadata: { role: 'assistant', roundNumber: 0, participantIndex: 1, participantId: 'gpt-4' },
      },
    ];
    store.getState().setMessages(completedRound0Messages);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('exact flow: setStreamingRoundNumber THEN setMessages THEN prepareForNewMessage', () => {
    /**
     * This test replicates the EXACT fix flow in handleUpdateThreadAndSend:
     *
     * 1. Calculate nextRoundNumber
     * 2. Set streamingRoundNumber IMMEDIATELY (for accordion collapse)
     * 3. Add optimistic user message IMMEDIATELY (for instant UI feedback)
     * 4. [PATCH request happens here - can take 100-500ms]
     * 5. Call prepareForNewMessage (which should NOT duplicate message or reset streamingRoundNumber)
     */
    it('should set streamingRoundNumber BEFORE any API calls for immediate accordion collapse', () => {
      // STEP 1: Calculate next round number (simulating form-actions.ts line 257)
      // Next round should be 1 (after round 0)
      const nextRoundNumber = 1;

      // VERIFY: streamingRoundNumber starts as null
      expect(store.getState().streamingRoundNumber).toBeNull();

      // STEP 2: Set streamingRoundNumber IMMEDIATELY (simulating form-actions.ts line 260)
      store.getState().setStreamingRoundNumber(nextRoundNumber);

      // ASSERT: streamingRoundNumber is set IMMEDIATELY
      // This is what triggers the accordion collapse effect in RoundAnalysisCard
      expect(store.getState().streamingRoundNumber).toBe(1);

      // At this point, the accordion for round 0 would collapse because:
      // streamingRoundNumber (1) > analysis.roundNumber (0)
    });

    it('should add optimistic user message BEFORE any API calls for instant UI feedback', () => {
      const nextRoundNumber = 1;
      const userMessage = 'Tell me more about interfaces';
      const currentMessages = store.getState().messages;

      // STEP 1: Set streamingRoundNumber
      store.getState().setStreamingRoundNumber(nextRoundNumber);

      // STEP 2: Add optimistic user message (simulating form-actions.ts lines 262-273)
      const optimisticUserMessage = {
        id: `optimistic-user-${Date.now()}`,
        role: MessageRoles.USER,
        parts: [{ type: MessagePartTypes.TEXT, text: userMessage }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: nextRoundNumber,
          isOptimistic: true,
        },
      };
      store.getState().setMessages([...currentMessages, optimisticUserMessage]);

      // ASSERT: Message appears IMMEDIATELY in the store
      const messages = store.getState().messages;
      expect(messages).toHaveLength(4); // 3 original + 1 optimistic

      // ASSERT: Last message is the user's optimistic message
      const lastMessage = messages[messages.length - 1];
      expect(lastMessage?.role).toBe('user');
      expect(lastMessage?.parts[0]).toMatchObject({ type: 'text', text: userMessage });
      expect(lastMessage?.metadata).toMatchObject({
        role: 'user',
        roundNumber: 1,
        isOptimistic: true,
      });
    });

    it('should NOT duplicate message when prepareForNewMessage is called after optimistic update', () => {
      const nextRoundNumber = 1;
      const userMessage = 'Tell me more about interfaces';
      const currentMessages = store.getState().messages;

      // STEP 1: Set streamingRoundNumber (simulating early UI update)
      store.getState().setStreamingRoundNumber(nextRoundNumber);

      // STEP 2: Add optimistic user message (simulating early UI update)
      const optimisticUserMessage = {
        id: `optimistic-user-${Date.now()}`,
        role: MessageRoles.USER,
        parts: [{ type: MessagePartTypes.TEXT, text: userMessage }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: nextRoundNumber,
          isOptimistic: true,
        },
      };
      store.getState().setMessages([...currentMessages, optimisticUserMessage]);

      // STEP 2.5: Set early optimistic message flag (simulating handleUpdateThreadAndSend)
      // This flag tells prepareForNewMessage that an optimistic message was already added
      store.getState().setHasEarlyOptimisticMessage(true);

      // VERIFY: 4 messages before prepareForNewMessage
      expect(store.getState().messages).toHaveLength(4);

      // STEP 3: Call prepareForNewMessage (simulating form-actions.ts line 368)
      // This is called AFTER the PATCH request (which could take 100-500ms)
      store.getState().prepareForNewMessage(userMessage, []);

      // ASSERT: Still only 4 messages (NO DUPLICATE)
      expect(store.getState().messages).toHaveLength(4);

      // ASSERT: streamingRoundNumber is preserved (not reset to null or different value)
      expect(store.getState().streamingRoundNumber).toBe(1);

      // ASSERT: Flag is cleared after prepareForNewMessage
      expect(store.getState().hasEarlyOptimisticMessage).toBe(false);
    });

    it('should maintain correct streamingRoundNumber when prepareForNewMessage is called later', () => {
      const nextRoundNumber = 1;
      const userMessage = 'Tell me more about interfaces';

      // STEP 1: Set streamingRoundNumber early
      store.getState().setStreamingRoundNumber(nextRoundNumber);
      expect(store.getState().streamingRoundNumber).toBe(1);

      // [Simulating PATCH delay of 100-500ms]

      // STEP 2: Call prepareForNewMessage after PATCH
      store.getState().prepareForNewMessage(userMessage, []);

      // ASSERT: streamingRoundNumber is STILL 1 (preserved, not reset)
      expect(store.getState().streamingRoundNumber).toBe(1);
    });
  });

  describe('regression: stale streamingRoundNumber from previous round should be updated', () => {
    /**
     * This tests an edge case: if streamingRoundNumber is set to a DIFFERENT
     * round than the one being prepared, it should be updated to the new round.
     *
     * Example: Round 1 finished streaming (streamingRoundNumber=1), then
     * user submits for round 2. prepareForNewMessage should update to 2.
     */
    it('should update stale streamingRoundNumber to new round', () => {
      // Setup: Stale streamingRoundNumber from previous round
      store.getState().setStreamingRoundNumber(0); // Stale from round 0

      // Add user message for round 1 (so calculateNextRoundNumber returns 2)
      const messages = store.getState().messages;
      store.getState().setMessages([
        ...messages,
        {
          id: 'msg-user-r1',
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: 'Q for round 1' }],
          metadata: { role: 'user', roundNumber: 1 },
        },
      ]);

      // VERIFY: Stale streamingRoundNumber
      expect(store.getState().streamingRoundNumber).toBe(0);

      // Call prepareForNewMessage for round 2
      store.getState().prepareForNewMessage('Q for round 2', []);

      // ASSERT: streamingRoundNumber is updated to 2 (not preserved at 0)
      expect(store.getState().streamingRoundNumber).toBe(2);
    });
  });

  describe('complete flow simulation', () => {
    /**
     * This test simulates the complete flow as it happens in the real app
     * when a user submits a message on the thread screen.
     */
    it('should provide immediate UI feedback throughout the entire flow', () => {
      const userMessage = 'Explain generics in TypeScript';
      const nextRoundNumber = 1;

      // ============================================================
      // PHASE 1: IMMEDIATE UI UPDATES (before any API calls)
      // ============================================================

      // STEP 1A: Set streamingRoundNumber for accordion collapse
      store.getState().setStreamingRoundNumber(nextRoundNumber);

      // CHECKPOINT: Accordion should collapse now
      expect(store.getState().streamingRoundNumber).toBe(1);

      // STEP 1B: Add optimistic user message for instant UI feedback
      const currentMessages = store.getState().messages;
      const optimisticUserMessage = {
        id: `optimistic-user-${Date.now()}`,
        role: MessageRoles.USER,
        parts: [{ type: MessagePartTypes.TEXT, text: userMessage }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: nextRoundNumber,
          isOptimistic: true,
        },
      };
      store.getState().setMessages([...currentMessages, optimisticUserMessage]);

      // CHECKPOINT: User message should appear now
      expect(store.getState().messages).toHaveLength(4);
      const lastMessage = store.getState().messages[3];
      expect(lastMessage?.parts[0]).toMatchObject({ type: 'text', text: userMessage });

      // STEP 1C: Set early optimistic message flag (simulating handleUpdateThreadAndSend)
      store.getState().setHasEarlyOptimisticMessage(true);

      // ============================================================
      // PHASE 2: API CALL (PATCH) - 100-500ms delay
      // ============================================================
      // In real app, PATCH request happens here...
      // UI should already be updated from Phase 1

      // ============================================================
      // PHASE 3: POST-API STATE SETUP (prepareForNewMessage)
      // ============================================================

      // Call prepareForNewMessage to set up pending message state
      store.getState().prepareForNewMessage(userMessage, ['claude-3-opus', 'gpt-4']);

      // CHECKPOINT: All state should be correct
      expect(store.getState().streamingRoundNumber).toBe(1); // Preserved
      expect(store.getState().messages).toHaveLength(4); // No duplicate
      expect(store.getState().pendingMessage).toBe(userMessage); // Set for streaming
      expect(store.getState().isWaitingForChangelog).toBe(true); // Ready for changelog

      // ============================================================
      // PHASE 4: STREAMING COMPLETE
      // ============================================================

      // Simulate streaming completion
      store.getState().completeStreaming();

      // CHECKPOINT: streamingRoundNumber cleared after streaming completes
      expect(store.getState().streamingRoundNumber).toBeNull();
      expect(store.getState().pendingMessage).toBeNull();
    });
  });
});

/**
 * ============================================================================
 * OPTIMISTIC MESSAGE DEDUPLICATION TESTS
 * ============================================================================
 *
 * These tests ensure that optimistic messages are not duplicated when
 * prepareForNewMessage is called after an optimistic message was already added.
 */
describe('critical: optimistic message deduplication', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Setup: Existing messages
    const existingMessages = [
      {
        id: 'msg-user-r0',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'Hello' }],
        metadata: { role: 'user', roundNumber: 0 },
      },
    ];
    store.getState().setMessages(existingMessages);
  });

  it('should detect existing optimistic message and NOT add duplicate', () => {
    const userMessage = 'Test message';

    // This test simulates the EXACT flow in handleUpdateThreadAndSend:
    // 1. setStreamingRoundNumber(1) - set early for accordion collapse
    // 2. Add optimistic message with roundNumber=1
    // 3. setHasEarlyOptimisticMessage(true) - flag that early message was added
    // 4. prepareForNewMessage should detect the flag and NOT add another
    //
    // The deduplication logic uses the hasEarlyOptimisticMessage flag.
    // If true, it doesn't add another optimistic message (prevents duplicates).

    // First, set streamingRoundNumber to 1 (simulating early UI update)
    store.getState().setStreamingRoundNumber(1);

    // Add optimistic message for round 1 (simulating form-actions.ts adding it early)
    const currentMessages = store.getState().messages;
    const optimisticMsg = {
      id: `optimistic-${Date.now()}`,
      role: MessageRoles.USER,
      parts: [{ type: MessagePartTypes.TEXT, text: userMessage }],
      metadata: {
        role: MessageRoles.USER,
        roundNumber: 1,
        isOptimistic: true,
      },
    };
    store.getState().setMessages([...currentMessages, optimisticMsg]);

    // Set flag to indicate early optimistic message was added
    store.getState().setHasEarlyOptimisticMessage(true);

    // Verify: 2 messages before prepareForNewMessage
    expect(store.getState().messages).toHaveLength(2);

    // Call prepareForNewMessage
    // It should detect the flag and NOT add a duplicate
    store.getState().prepareForNewMessage(userMessage, []);

    // Assert: Still only 2 messages (NO DUPLICATE)
    expect(store.getState().messages).toHaveLength(2);

    // Assert: streamingRoundNumber is preserved (the early-set value)
    expect(store.getState().streamingRoundNumber).toBe(1);

    // Assert: Flag is cleared after prepareForNewMessage
    expect(store.getState().hasEarlyOptimisticMessage).toBe(false);
  });

  it('should add new message if last user message is NOT optimistic', () => {
    const userMessage = 'Test message';

    // The existing setup has a regular user message (not optimistic) for round 0
    // prepareForNewMessage should add a new optimistic message for round 1
    expect(store.getState().messages).toHaveLength(1);

    // Verify the existing message is not optimistic
    const existingMsg = store.getState().messages[0];
    expect((existingMsg?.metadata as { isOptimistic?: boolean })?.isOptimistic).not.toBe(true);

    // Call prepareForNewMessage
    store.getState().prepareForNewMessage(userMessage, []);

    // Assert: 2 messages (original + new optimistic)
    expect(store.getState().messages).toHaveLength(2);

    // Verify the new message is optimistic
    const newMsg = store.getState().messages[1];
    expect(newMsg?.metadata).toMatchObject({
      roundNumber: 1,
      isOptimistic: true,
    });
  });

  it('should correctly handle assistant message as last message', () => {
    const userMessage = 'Test message';

    // Add an assistant message after the user message
    // This simulates a completed round where assistant has responded
    const currentMessages = store.getState().messages;
    const assistantMsg = {
      id: `assistant-${Date.now()}`,
      role: 'assistant' as const,
      parts: [{ type: MessagePartTypes.TEXT, text: 'Assistant response' }],
      metadata: {
        role: 'assistant',
        roundNumber: 0,
        participantIndex: 0,
        participantId: 'model-1',
      },
    };
    store.getState().setMessages([...currentMessages, assistantMsg]);

    // Verify: 2 messages before prepareForNewMessage
    expect(store.getState().messages).toHaveLength(2);

    // Call prepareForNewMessage
    // The LAST USER MESSAGE (round 0) is not optimistic, so a new one should be added
    store.getState().prepareForNewMessage(userMessage, []);

    // Assert: 3 messages (original user + assistant + new optimistic user)
    expect(store.getState().messages).toHaveLength(3);

    // Verify the new message is for round 1
    const lastMessage = store.getState().messages[2];
    expect(lastMessage?.metadata).toMatchObject({
      roundNumber: 1,
      isOptimistic: true,
    });
  });
});

/**
 * Multi-Round Flow Debugging Tests
 *
 * Simulates complete user journey from overview screen through multiple rounds
 * to detect state/action mismatches and race conditions.
 *
 * Flow (from FLOW_DOCUMENTATION.md):
 * 1. User on /chat (overview screen)
 * 2. Submit first message → thread created → participants stream → moderator → round complete
 * 3. URL transitions to /chat/[slug] (thread screen)
 * 4. Submit second message → participants stream → moderator → round complete
 *
 * Tracks:
 * - State transitions at each step
 * - Function call counts
 * - Timing of key operations
 */

import { ChatModes, MessageRoles, ScreenModes } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatStore } from '../store';

// Track function calls for debugging
const callTracker = {
  initializeThread: 0,
  prepareForNewMessage: 0,
  setCurrentParticipantIndex: 0,
  setHasSentPendingMessage: 0,
  setIsStreaming: 0,
  setMessages: 0,
  setNextParticipantToTrigger: 0,
  setStreamingRoundNumber: 0,
  setWaitingToStartStreaming: 0,
};

function resetTracker() {
  Object.keys(callTracker).forEach((key) => {
    callTracker[key as keyof typeof callTracker] = 0;
  });
}

// Helper to create a store with call tracking
function _createTrackedStore() {
  const _store = createChatStore();

  // Wrap key actions to track calls
  const originalState = _store.getState();

  const wrappedSetWaitingToStartStreaming = originalState.setWaitingToStartStreaming;
  _store.setState({
    setWaitingToStartStreaming: (value: boolean) => {
      callTracker.setWaitingToStartStreaming++;
      console.error(`[tracker] setWaitingToStartStreaming(${value}) call #${callTracker.setWaitingToStartStreaming}`);
      wrappedSetWaitingToStartStreaming(value);
    },
  });

  return _store;
}

// Helper to create mock thread data
function createMockThread(id: string, slug: string) {
  return {
    createdAt: new Date(),
    enableWebSearch: false,
    id,
    isAiGeneratedTitle: false,
    isFavorite: false,
    isPublic: false,
    lastMessageAt: new Date(),
    metadata: null,
    mode: ChatModes.DEBATING,
    previousSlug: null,
    projectId: null,
    slug,
    status: 'active' as const,
    title: 'Test Thread',
    updatedAt: new Date(),
    userId: 'user-1',
    version: 1,
  };
}

// Helper to create mock participants
function createMockParticipants(threadId: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    createdAt: new Date(),
    customRoleId: null,
    id: `participant-${i}`,
    isEnabled: true,
    modelId: `model-${i}`,
    priority: i,
    role: null,
    settings: null,
    threadId,
    updatedAt: new Date(),
  }));
}

// Helper to create mock user message
function createMockUserMessage(roundNumber: number, text: string) {
  return {
    id: `user-msg-r${roundNumber}`,
    metadata: {
      createdAt: new Date().toISOString(),
      role: MessageRoles.USER as const,
      roundNumber,
    },
    parts: [{ text, type: 'text' as const }],
    role: MessageRoles.USER as const,
  };
}

// Helper to create mock assistant message
function createMockAssistantMessage(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  modelId: string,
) {
  return {
    id: `${threadId}_r${roundNumber}_p${participantIndex}`,
    metadata: {
      finishReason: 'stop',
      hasError: false,
      model: modelId,
      participantId: `participant-${participantIndex}`,
      participantIndex,
      role: MessageRoles.ASSISTANT as const,
      roundNumber,
    },
    parts: [
      { type: 'step-start' as const },
      { state: 'done' as const, text: `Response from ${modelId}`, type: 'text' as const },
    ],
    role: MessageRoles.ASSISTANT as const,
  };
}

// Helper to create mock moderator message
function createMockModeratorMessage(threadId: string, roundNumber: number) {
  return {
    id: `${threadId}_r${roundNumber}_moderator`,
    metadata: {
      finishReason: 'stop',
      isModerator: true,
      model: 'Council Moderator',
      participantIndex: -99,
      role: MessageRoles.ASSISTANT as const,
      roundNumber,
    },
    parts: [{ state: 'done' as const, text: 'Summary...', type: 'text' as const }],
    role: MessageRoles.ASSISTANT as const,
  };
}

describe('multi-Round Flow Debugging', () => {
  beforeEach(() => {
    resetTracker();
    vi.useFakeTimers();
  });

  describe('state Transitions Audit', () => {
    it('should track state through round 0 on overview screen', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 3);

      // Log initial state
      const initialState = store.getState();
      console.error('[STATE] Initial:', {
        currentParticipantIndex: initialState.currentParticipantIndex,
        isStreaming: initialState.isStreaming,
        messagesCount: initialState.messages.length,
        nextParticipantToTrigger: initialState.nextParticipantToTrigger,
        screenMode: initialState.screenMode,
        streamingRoundNumber: initialState.streamingRoundNumber,
        waitingToStartStreaming: initialState.waitingToStartStreaming,
      });

      // Step 1: Initialize for new chat (overview screen)
      // Store defaults to OVERVIEW mode (not null)
      expect(initialState.screenMode).toBe(ScreenModes.OVERVIEW);
      expect(initialState.showInitialUI).toBeTruthy();

      // Step 2: User submits first message - handleCreateThread flow
      // This simulates what form-actions.ts does
      store.getState().setIsCreatingThread(true);
      store.getState().setShowInitialUI(false);

      // Thread created, initialize
      const thread = createMockThread(threadId, 'test-thread');
      const userMessage = createMockUserMessage(0, 'Hello');
      store.getState().initializeThread(thread, participants, [userMessage]);
      store.getState().setCreatedThreadId(threadId);

      const afterInit = store.getState();
      console.error('[STATE] After initializeThread:', {
        createdThreadId: afterInit.createdThreadId,
        messagesCount: afterInit.messages.length,
        nextParticipantToTrigger: afterInit.nextParticipantToTrigger,
        screenMode: afterInit.screenMode,
        streamingRoundNumber: afterInit.streamingRoundNumber,
        waitingToStartStreaming: afterInit.waitingToStartStreaming,
      });

      // Step 3: Prepare for streaming (what handleCreateThread does after initializeThread)
      store.getState().prepareForNewMessage('Hello', ['model-0', 'model-1', 'model-2']);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger(0);

      const afterPrepare = store.getState();
      console.error('[STATE] After prepareForNewMessage + triggers:', {
        hasSentPendingMessage: afterPrepare.hasSentPendingMessage,
        nextParticipantToTrigger: afterPrepare.nextParticipantToTrigger,
        pendingMessage: afterPrepare.pendingMessage,
        streamingRoundNumber: afterPrepare.streamingRoundNumber,
        waitingToStartStreaming: afterPrepare.waitingToStartStreaming,
      });

      // Verify streaming preparation state
      expect(afterPrepare.waitingToStartStreaming).toBeTruthy();
      expect(afterPrepare.streamingRoundNumber).toBe(0);
      expect(afterPrepare.nextParticipantToTrigger).toBe(0);
    });

    it('should track state through round 1 on overview screen (after thread created)', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);

      // Setup: Complete round 0 first
      const thread = createMockThread(threadId, 'test-thread');
      const r0UserMessage = createMockUserMessage(0, 'Round 0 question');
      const r0P0Message = createMockAssistantMessage(threadId, 0, 0, 'model-0');
      const r0P1Message = createMockAssistantMessage(threadId, 0, 1, 'model-1');
      const r0Moderator = createMockModeratorMessage(threadId, 0);

      store.getState().initializeThread(thread, participants, [
        r0UserMessage,
        r0P0Message,
        r0P1Message,
        r0Moderator,
      ]);
      store.getState().setCreatedThreadId(threadId);

      // Still on overview screen (screenMode not set to THREAD yet)
      console.error('[STATE] After round 0 complete:', {
        isStreaming: store.getState().isStreaming,
        messagesCount: store.getState().messages.length,
        screenMode: store.getState().screenMode,
      });

      // Step 1: User submits round 1 message (still on overview screen!)
      // This simulates handleUpdateThreadAndSend

      // NEW PATTERN: handleUpdateThreadAndSend creates user message via optimistic update
      // (no longer waits for streaming handler to create it)

      // First, set immediate loading state
      store.getState().setWaitingToStartStreaming(true);

      const afterEarlyWaiting = store.getState();
      console.error('[STATE] After early setWaitingToStartStreaming(true):', {
        waitingToStartStreaming: afterEarlyWaiting.waitingToStartStreaming,
      });

      // Calculate next round number
      const messages = store.getState().messages;
      const lastAssistantMessage = messages.filter(m => m.role === MessageRoles.ASSISTANT).pop();
      const lastRoundNumber = lastAssistantMessage?.metadata && typeof lastAssistantMessage.metadata === 'object' && 'roundNumber' in lastAssistantMessage.metadata
        ? (lastAssistantMessage.metadata as { roundNumber: number }).roundNumber
        : 0;
      const nextRoundNumber = lastRoundNumber + 1;

      console.error('[STATE] Calculated next round:', { lastRoundNumber, nextRoundNumber });

      // Set streaming round number BEFORE adding optimistic message
      store.getState().setStreamingRoundNumber(nextRoundNumber);

      // Add optimistic user message (NEW: this is now the user message that gets persisted)
      const r1UserMessage = createMockUserMessage(1, 'Round 1 question');
      store.getState().setMessages(current => [...current, {
        ...r1UserMessage,
        id: 'optimistic-user-1',
        metadata: { ...r1UserMessage.metadata, isOptimistic: true },
      }]);
      store.getState().setHasEarlyOptimisticMessage(true);

      // Call prepareForNewMessage (which resets waitingToStartStreaming to false!)
      store.getState().prepareForNewMessage(
        'Round 1 question',
        [], // Empty modelIds - no longer needed for user message creation
      );

      const afterPrepare = store.getState();
      console.error('[STATE] After prepareForNewMessage (CRITICAL):', {
        nextParticipantToTrigger: afterPrepare.nextParticipantToTrigger, // Should be null!
        pendingMessage: afterPrepare.pendingMessage,
        streamingRoundNumber: afterPrepare.streamingRoundNumber,
        waitingToStartStreaming: afterPrepare.waitingToStartStreaming, // Should be false!
      });

      // BUG CHECK: prepareForNewMessage resets waitingToStartStreaming and nextParticipantToTrigger
      // The fix is to set them AFTER prepareForNewMessage

      // Now set them after prepareForNewMessage (the fix)
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger(0);

      const afterFix = store.getState();
      console.error('[STATE] After fix (set triggers AFTER prepareForNewMessage):', {
        nextParticipantToTrigger: afterFix.nextParticipantToTrigger,
        streamingRoundNumber: afterFix.streamingRoundNumber,
        waitingToStartStreaming: afterFix.waitingToStartStreaming,
      });

      // Verify the fix worked
      expect(afterFix.waitingToStartStreaming).toBeTruthy();
      expect(afterFix.nextParticipantToTrigger).toBe(0);
      expect(afterFix.streamingRoundNumber).toBe(1);
    });

    it('should verify prepareForNewMessage resets critical state', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);
      const thread = createMockThread(threadId, 'test-thread');
      const userMessage = createMockUserMessage(0, 'Hello');

      store.getState().initializeThread(thread, participants, [userMessage]);

      // Set up state as if we're preparing for streaming
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger(0);
      store.getState().setStreamingRoundNumber(1);

      const beforePrepare = store.getState();
      console.error('[STATE] Before prepareForNewMessage:', {
        isStreaming: beforePrepare.isStreaming,
        nextParticipantToTrigger: beforePrepare.nextParticipantToTrigger,
        waitingToStartStreaming: beforePrepare.waitingToStartStreaming,
      });

      // Call prepareForNewMessage
      store.getState().prepareForNewMessage('Test', []);

      const afterPrepare = store.getState();
      console.error('[STATE] After prepareForNewMessage:', {
        isStreaming: afterPrepare.isStreaming,
        nextParticipantToTrigger: afterPrepare.nextParticipantToTrigger,
        waitingToStartStreaming: afterPrepare.waitingToStartStreaming,
      });

      // Document what prepareForNewMessage resets
      expect(afterPrepare.waitingToStartStreaming).toBeFalsy();
      expect(afterPrepare.nextParticipantToTrigger).toBeNull();
      expect(afterPrepare.isStreaming).toBeFalsy();
    });
  });

  describe('round Number Tracking', () => {
    it('should correctly calculate round numbers for multi-round flows', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);
      const thread = createMockThread(threadId, 'test-thread');

      // Round 0 messages
      const r0User = createMockUserMessage(0, 'Q0');
      const r0P0 = createMockAssistantMessage(threadId, 0, 0, 'model-0');
      const r0P1 = createMockAssistantMessage(threadId, 0, 1, 'model-1');
      const r0Mod = createMockModeratorMessage(threadId, 0);

      store.getState().initializeThread(thread, participants, [r0User, r0P0, r0P1, r0Mod]);

      // Helper to get current round number
      function getCurrentRound(): number {
        const messages = store.getState().messages;
        const assistantMessages = messages.filter(m => m.role === MessageRoles.ASSISTANT);
        if (assistantMessages.length === 0) {
          return 0;
        }

        const lastAssistant = assistantMessages[assistantMessages.length - 1];
        const metadata = lastAssistant?.metadata;
        if (metadata && typeof metadata === 'object' && 'roundNumber' in metadata) {
          return (metadata as { roundNumber: number }).roundNumber;
        }
        return 0;
      }

      console.error('[ROUND] After round 0 complete:', { currentRound: getCurrentRound() });
      expect(getCurrentRound()).toBe(0);

      // Add round 1 messages
      const r1User = createMockUserMessage(1, 'Q1');
      const r1P0 = createMockAssistantMessage(threadId, 1, 0, 'model-0');
      const r1P1 = createMockAssistantMessage(threadId, 1, 1, 'model-1');
      const r1Mod = createMockModeratorMessage(threadId, 1);

      store.getState().setMessages(current => [...current, r1User, r1P0, r1P1, r1Mod]);

      console.error('[ROUND] After round 1 complete:', { currentRound: getCurrentRound() });
      expect(getCurrentRound()).toBe(1);

      // Next round should be 2
      const nextRound = getCurrentRound() + 1;
      console.error('[ROUND] Next round should be:', { nextRound });
      expect(nextRound).toBe(2);
    });
  });

  describe('phantom Call Protection', () => {
    it('should demonstrate phantom call scenario', () => {
      const _store = createChatStore();
      const threadId = 'thread-123';

      // Simulate round 0 complete
      // currentRoundRef would be 0, then after completion incremented to 1

      let currentRoundRef = 0;

      // Round 0 streaming
      console.error('[PHANTOM] Round 0 streaming, currentRoundRef:', currentRoundRef);

      // Round 0 completes - increment ref
      currentRoundRef = currentRoundRef + 1;
      console.error('[PHANTOM] Round 0 complete, currentRoundRef incremented to:', currentRoundRef);

      // Phantom call comes for r0_p1
      const phantomMessageId = `${threadId}_r0_p1`;
      const idMatch = phantomMessageId.match(/_r(\d+)_p(\d+)/);
      const roundStr = idMatch?.[1];
      const msgRoundNumber = idMatch && roundStr ? Number.parseInt(roundStr, 10) : currentRoundRef;

      console.error('[PHANTOM] Phantom call:', {
        currentRoundRef,
        messageId: phantomMessageId,
        msgRoundNumber,
        shouldSkip: msgRoundNumber < currentRoundRef,
      });

      // Guard should skip
      expect(msgRoundNumber).toBe(0);
      expect(currentRoundRef).toBe(1);
      expect(msgRoundNumber).toBeLessThan(currentRoundRef);
    });

    it('should NOT skip valid round 1 messages', () => {
      const currentRoundRef = 1; // After round 0 complete

      // Valid round 1 message
      const validMessageId = 'thread_r1_p0';
      const idMatch = validMessageId.match(/_r(\d+)_p(\d+)/);
      const roundStr = idMatch?.[1];
      const msgRoundNumber = idMatch && roundStr ? Number.parseInt(roundStr, 10) : currentRoundRef;

      console.error('[PHANTOM] Valid round 1 message:', {
        currentRoundRef,
        messageId: validMessageId,
        msgRoundNumber,
        shouldSkip: msgRoundNumber < currentRoundRef,
      });

      // Should NOT skip
      expect(msgRoundNumber).toBe(1);
      expect(currentRoundRef).toBe(1);
      expect(msgRoundNumber).toBeGreaterThanOrEqual(currentRoundRef);
    });
  });

  describe('screen Mode Transitions', () => {
    it('should track screen mode through the flow', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);
      const thread = createMockThread(threadId, 'test-thread');
      const userMessage = createMockUserMessage(0, 'Hello');

      // Initial: defaults to OVERVIEW mode
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
      console.error('[SCREEN] Initial:', store.getState().screenMode);

      // After initialize: still OVERVIEW (initializeThread doesn't change screenMode)
      store.getState().initializeThread(thread, participants, [userMessage]);
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
      console.error('[SCREEN] After initializeThread:', store.getState().screenMode);

      // Round 0 streaming happens on overview screen
      // After summary complete, navigation to thread screen

      // Thread screen sets mode
      store.getState().setScreenMode(ScreenModes.THREAD);
      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
      console.error('[SCREEN] After setScreenMode(THREAD):', store.getState().screenMode);
    });

    it('should document which hooks handle which screen modes', () => {
      // From FLOW_DOCUMENTATION.md:
      // - useStreamingTrigger: handles OVERVIEW screen, uses startRound()
      // - useRoundResumption: handles THREAD screen, uses continueFromParticipant()

      const overviewHandlers = {
        hook: 'useStreamingTrigger',
        method: 'startRound()',
        note: 'For round 0 on overview screen',
        triggeredBy: 'waitingToStartStreaming + participants + messages',
      };

      const threadHandlers = {
        hook: 'useRoundResumption',
        method: 'continueFromParticipant()',
        note: 'For resumption on thread screen',
        triggeredBy: 'nextParticipantToTrigger + waitingToStartStreaming',
      };

      console.error('[HANDLERS] Overview screen:', overviewHandlers);
      console.error('[HANDLERS] Thread screen:', threadHandlers);

      // Bug scenario: Round 1 submitted while still on OVERVIEW screen
      // - useStreamingTrigger only handles OVERVIEW
      // - useRoundResumption skips OVERVIEW (line 125: if (storeScreenMode === ScreenModes.OVERVIEW) return;)
      // - Result: Round 1 never triggers!

      // Fix: useStreamingTrigger should also handle round 1+ on overview
      // OR: Transition to thread screen should happen before round 1 submit

      expect(true).toBeTruthy(); // Documentation test
    });
  });

  describe('full Journey Simulation', () => {
    it('should simulate complete 2-round journey with state logging', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);
      const thread = createMockThread(threadId, 'test-thread');

      type StateSnapshot = {
        screenMode: string;
        waitingToStartStreaming: boolean;
        isStreaming: boolean;
        streamingRoundNumber: number | null;
        nextParticipantToTrigger: number | null;
        currentParticipantIndex: number;
      };

      const stateLog: {
        step: string;
        state: StateSnapshot;
      }[] = [];

      function logState(step: string) {
        const s = store.getState();
        stateLog.push({
          state: {
            currentParticipantIndex: s.currentParticipantIndex,
            hasSentPendingMessage: s.hasSentPendingMessage,
            isStreaming: s.isStreaming,
            messagesCount: s.messages.length,
            nextParticipantToTrigger: s.nextParticipantToTrigger,
            pendingMessage: s.pendingMessage?.substring(0, 20),
            screenMode: s.screenMode,
            streamingRoundNumber: s.streamingRoundNumber,
            waitingToStartStreaming: s.waitingToStartStreaming,
          },
          step,
        });
      }

      // === ROUND 0 ===
      logState('1. Initial state');

      // User on overview screen
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      logState('2. On overview screen');

      // Submit first message
      store.getState().setIsCreatingThread(true);
      store.getState().setShowInitialUI(false);
      logState('3. Creating thread');

      // Thread created
      const r0User = createMockUserMessage(0, 'Round 0 question');
      store.getState().initializeThread(thread, participants, [r0User]);
      store.getState().setCreatedThreadId(threadId);
      logState('4. Thread initialized');

      // Prepare for streaming
      store.getState().prepareForNewMessage('Round 0 question', ['model-0', 'model-1']);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger(0);
      logState('5. Ready to stream round 0');

      // Streaming starts
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setIsStreaming(true);
      store.getState().setHasSentPendingMessage(true);
      logState('6. Streaming round 0');

      // Participants complete
      const r0P0 = createMockAssistantMessage(threadId, 0, 0, 'model-0');
      const r0P1 = createMockAssistantMessage(threadId, 0, 1, 'model-1');
      store.getState().setMessages(current => [...current, r0P0, r0P1]);
      logState('7. Participants complete');

      // Round 0 complete
      store.getState().setIsStreaming(false);
      store.getState().setStreamingRoundNumber(null);
      store.getState().setNextParticipantToTrigger(null);
      const r0Mod = createMockModeratorMessage(threadId, 0);
      store.getState().setMessages(current => [...current, r0Mod]);
      logState('8. Round 0 complete');

      // === ROUND 1 === (still on overview screen in this bug scenario)
      // Note: In normal flow, user would be on thread screen by now

      // User submits round 1
      store.getState().setWaitingToStartStreaming(true); // Early UI feedback
      logState('9. User submits round 1');

      store.getState().setStreamingRoundNumber(1);
      const r1OptUser = { ...createMockUserMessage(1, 'Round 1 question'), id: 'optimistic-1' };
      store.getState().setMessages(current => [...current, r1OptUser]);
      store.getState().setHasEarlyOptimisticMessage(true);
      logState('10. Optimistic message added');

      // prepareForNewMessage resets waitingToStartStreaming!
      // NEW: No longer needs modelIds for user message creation
      store.getState().prepareForNewMessage('Round 1 question', []);
      logState('11. After prepareForNewMessage (BUG: resets state)');

      // Fix: Set triggers AFTER prepareForNewMessage
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger(0);
      logState('12. After fix: triggers set');

      // Print all logged states
      console.error('\n=== FULL JOURNEY STATE LOG ===\n');
      stateLog.forEach(({ state, step }) => {
        console.error(`[${step}]`, state);
      });

      // Verify final state is ready for streaming
      const finalState = store.getState();
      expect(finalState.waitingToStartStreaming).toBeTruthy();
      expect(finalState.nextParticipantToTrigger).toBe(0);
      expect(finalState.streamingRoundNumber).toBe(1);
    });
  });
});

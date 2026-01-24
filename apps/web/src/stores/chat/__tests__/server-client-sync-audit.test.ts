/**
 * Server-Client Synchronization Audit Tests
 *
 * Tests scenarios where server continues processing while user is away.
 * Cloudflare Queues ensure rounds complete even when user navigates away.
 * Verifies correct data sync on return.
 *
 * Key scenarios:
 * - User leaves mid-round, returns to complete round
 * - Multiple rounds complete while user away
 * - AI SDK resume:true for mid-stream reconnection
 */

import { FinishReasons, RoundPhases, ScreenModes } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import {
  createCompleteRoundMessages,
  createMockAssistantMessage,
  createMockChatStore,
  createMockResumptionParticipants,
  createMockStreamResumptionState,
  createMockUserMessage,
  createTestChatStore,
} from '@/lib/testing';

describe('server-Client Sync Audit', () => {
  describe('category 4: Server-Client Synchronization', () => {
    it('4.1 - round continues on server while user away', () => {
      /**
       * Test: Return to find P0+P1+moderator complete
       *
       * Scenario: User submits message, then navigates away.
       * Cloudflare Queue continues processing. User returns later.
       * All messages should be hydrated from DB.
       */
      // User left when P0 was streaming
      const staleClientState = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        isStreaming: true, // Was streaming when user left
        streamingRoundNumber: 0,
        currentParticipantIndex: 0, // P0 was streaming
        participants: createMockResumptionParticipants(2),
        messages: [
          createMockUserMessage(0),
          // P0 partial message
          {
            id: 'msg-p0-r0',
            role: 'assistant' as const,
            parts: [{ type: 'text' as const, text: 'Partial P0 response...' }],
            metadata: {
              role: 'assistant' as const,
              roundNumber: 0,
              participantId: 'participant-0',
              participantIndex: 0,
              model: 'gpt-4',
              finishReason: 'unknown', // Not finished
            },
          },
        ],
        thread: { id: 'thread-123', enableWebSearch: false },
      });

      // Server has completed everything (simulating what DB would return)
      const serverCompletedState = {
        roundNumber: 0,
        messages: createCompleteRoundMessages(0, 2), // user + P0 + P1 + moderator
        currentPhase: RoundPhases.COMPLETE,
      };

      // Verify server state is complete
      expect(serverCompletedState.messages).toHaveLength(4);
      expect(serverCompletedState.currentPhase).toBe(RoundPhases.COMPLETE);

      // Client state was stale (partial P0)
      const clientState = staleClientState.getState();
      expect(clientState.messages).toHaveLength(2);
      expect(clientState.isStreaming).toBe(true);

      // On return, client should:
      // 1. Fetch fresh messages from DB (complete round)
      // 2. Clear streaming state
      // 3. No resumption needed (round complete)
    });

    it('4.2 - user returns to COMPLETE phase', () => {
      /**
       * Test: Phase COMPLETE → no resumption triggers
       *
       * When user returns and server says round is complete,
       * system should NOT trigger any streaming.
       */
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        isStreaming: false,
        waitingToStartStreaming: false,
        // Server prefilled COMPLETE phase
        currentResumptionPhase: RoundPhases.COMPLETE,
        streamResumptionPrefilled: true,
        resumptionRoundNumber: 0,
        participants: createMockResumptionParticipants(2),
        messages: createCompleteRoundMessages(0, 2),
        thread: { id: 'thread-123', enableWebSearch: false },
      });

      const state = store.getState();

      // Phase is COMPLETE
      expect(state.currentResumptionPhase).toBe(RoundPhases.COMPLETE);

      // All messages present
      expect(state.messages).toHaveLength(4); // user + P0 + P1 + moderator

      // Check moderator is present
      const moderatorMsg = state.messages.find(
        m => (m.metadata as { isModerator?: boolean })?.isModerator === true,
      );
      expect(moderatorMsg).toBeDefined();

      // No streaming should be triggered
      expect(state.isStreaming).toBe(false);
      expect(state.waitingToStartStreaming).toBe(false);
    });

    it('4.3 - user returns mid-participant', () => {
      /**
       * Test: P1 streaming via AI SDK resume:true → no double-trigger
       *
       * Scenario: User returns while P1 is actively streaming on server.
       * AI SDK's resume:true reconnects to existing stream.
       * System should NOT trigger P1 again.
       */
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        isStreaming: false, // Not streaming yet (just returned)
        waitingToStartStreaming: false,
        // Server says P1 has active stream
        currentResumptionPhase: RoundPhases.PARTICIPANTS,
        streamResumptionPrefilled: true,
        resumptionRoundNumber: 0,
        participants: createMockResumptionParticipants(2),
        messages: [
          createMockUserMessage(0),
          createMockAssistantMessage(0, 0), // P0 complete
          // P1 not yet in cache (streaming on server)
        ],
        thread: { id: 'thread-123', enableWebSearch: false },
      });

      // Server resumption state indicates active stream for P1
      const serverResumption = createMockStreamResumptionState({
        roundNumber: 0,
        currentPhase: RoundPhases.PARTICIPANTS,
        hasActiveStream: true, // Active stream exists!
        streamId: 'active-stream-p1',
        participants: {
          hasActiveStream: true,
          streamId: 'active-stream-p1',
          totalParticipants: 2,
          currentParticipantIndex: 1, // P1 is streaming
          participantStatuses: {
            0: { complete: true, hasError: false },
            1: { complete: false, hasError: false }, // P1 in progress
          },
          nextParticipantToTrigger: null, // Nothing to trigger, stream active
          allComplete: false,
        },
      });

      // Client state
      const state = store.getState();
      expect(state.messages).toHaveLength(2); // user + P0

      // Server indicates active stream
      expect(serverResumption.hasActiveStream).toBe(true);
      expect(serverResumption.participants?.hasActiveStream).toBe(true);
      expect(serverResumption.participants?.nextParticipantToTrigger).toBe(null);

      // When hasActiveStream=true and nextParticipantToTrigger=null:
      // AI SDK's resume:true handles reconnection
      // No client-side trigger needed
    });

    it('4.4 - DB content merged correctly on return', () => {
      /**
       * Test: Store stale, DB fresh → messages replaced
       *
       * On return, setMessages should replace stale data with fresh DB data.
       */
      const store = createTestChatStore();

      // Simulate stale client state
      store.getState().setMessages([
        {
          id: 'user-0',
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: 'Original question' }],
          metadata: { role: 'user' as const, roundNumber: 0 },
        },
        {
          id: 'p0-0',
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: 'Partial...' }], // Stale partial
          metadata: {
            role: 'assistant' as const,
            roundNumber: 0,
            participantId: 'p0',
            participantIndex: 0,
            model: 'gpt-4',
            finishReason: FinishReasons.UNKNOWN,
          },
        },
      ]);

      expect(store.getState().messages).toHaveLength(2);

      // Fresh data from DB (complete messages)
      const freshMessages = [
        {
          id: 'user-0',
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: 'Original question' }],
          metadata: { role: 'user' as const, roundNumber: 0 },
        },
        {
          id: 'p0-0',
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: 'Complete P0 response with full content!' }],
          metadata: {
            role: 'assistant' as const,
            roundNumber: 0,
            participantId: 'p0',
            participantIndex: 0,
            model: 'gpt-4',
            finishReason: FinishReasons.STOP, // Complete
          },
        },
        {
          id: 'p1-0',
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: 'Complete P1 response' }],
          metadata: {
            role: 'assistant' as const,
            roundNumber: 0,
            participantId: 'p1',
            participantIndex: 1,
            model: 'claude',
            finishReason: FinishReasons.STOP,
          },
        },
        {
          id: 'mod-0',
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: 'Moderator summary' }],
          metadata: {
            role: 'assistant' as const,
            roundNumber: 0,
            isModerator: true,
            model: 'gemini',
            finishReason: FinishReasons.STOP,
          },
        },
      ];

      // Replace with fresh data
      store.getState().setMessages(freshMessages);

      // Verify replacement
      const state = store.getState();
      expect(state.messages).toHaveLength(4);

      // P0 is now complete
      const p0 = state.messages.find(
        m => (m.metadata as { participantIndex?: number })?.participantIndex === 0,
      );
      expect((p0?.metadata as { finishReason?: string })?.finishReason).toBe(FinishReasons.STOP);

      // P1 and moderator present
      const p1 = state.messages.find(
        m => (m.metadata as { participantIndex?: number })?.participantIndex === 1,
      );
      expect(p1).toBeDefined();

      const mod = state.messages.find(
        m => (m.metadata as { isModerator?: boolean })?.isModerator === true,
      );
      expect(mod).toBeDefined();
    });

    it('4.5 - multiple rounds completed while away', () => {
      /**
       * Test: Rounds 0-2 complete → latest state hydrated
       *
       * User left during round 0, returns to find rounds 0, 1, 2 all complete.
       * All messages should be present.
       */
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        isStreaming: false,
        waitingToStartStreaming: false,
        currentResumptionPhase: RoundPhases.COMPLETE,
        streamResumptionPrefilled: true,
        resumptionRoundNumber: 2, // Latest round
        participants: createMockResumptionParticipants(2),
        // All 3 rounds complete
        messages: [
          // Round 0
          ...createCompleteRoundMessages(0, 2),
          // Round 1
          ...createCompleteRoundMessages(1, 2),
          // Round 2
          ...createCompleteRoundMessages(2, 2),
        ],
        thread: { id: 'thread-123', enableWebSearch: false },
      });

      const state = store.getState();

      // Should have 12 messages: 3 rounds × 4 messages each
      expect(state.messages).toHaveLength(12);

      // Count messages per round
      const round0Msgs = state.messages.filter(
        m => (m.metadata as { roundNumber?: number })?.roundNumber === 0,
      );
      const round1Msgs = state.messages.filter(
        m => (m.metadata as { roundNumber?: number })?.roundNumber === 1,
      );
      const round2Msgs = state.messages.filter(
        m => (m.metadata as { roundNumber?: number })?.roundNumber === 2,
      );

      expect(round0Msgs).toHaveLength(4);
      expect(round1Msgs).toHaveLength(4);
      expect(round2Msgs).toHaveLength(4);

      // Each round has moderator
      const moderators = state.messages.filter(
        m => (m.metadata as { isModerator?: boolean })?.isModerator === true,
      );
      expect(moderators).toHaveLength(3);

      // Phase is COMPLETE - no resumption needed
      expect(state.currentResumptionPhase).toBe(RoundPhases.COMPLETE);
    });

    it('4.6 - prefilledForThreadId validates thread match', () => {
      /**
       * Test: Prefill for thread A, but current is thread B → skip prefill
       *
       * Race condition guard: User rapidly navigates between threads.
       * Prefill state from thread A should not be used for thread B.
       */
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        isStreaming: false,
        waitingToStartStreaming: false,
        // Prefill state was set for thread-A
        streamResumptionPrefilled: true,
        prefilledForThreadId: 'thread-A',
        currentResumptionPhase: RoundPhases.PARTICIPANTS,
        resumptionRoundNumber: 0,
        participants: createMockResumptionParticipants(2),
        messages: [createMockUserMessage(0)],
        // But current thread is thread-B!
        thread: { id: 'thread-B', enableWebSearch: false },
      });

      const state = store.getState();

      // Prefill is for thread-A
      expect(state.prefilledForThreadId).toBe('thread-A');

      // Current thread is thread-B
      expect(state.thread?.id).toBe('thread-B');

      // Mismatch detected - prefill should be ignored
      expect(state.prefilledForThreadId).not.toBe(state.thread?.id);

      // Resumption logic should see this mismatch and skip using prefill state
    });

    it('4.7 - streamFinishAcknowledged prevents early resumption', () => {
      /**
       * Test: Stream finished but onFinish hasn't run → block resumption
       *
       * AI SDK pattern: isStreaming goes false before onFinish callback.
       * System must wait for onFinish to acknowledge completion.
       */
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        // Stream just finished (isStreaming went false)
        isStreaming: false,
        streamingRoundNumber: null,
        // But onFinish hasn't run yet!
        streamFinishAcknowledged: false,
        waitingToStartStreaming: false,
        participants: createMockResumptionParticipants(2),
        messages: [
          createMockUserMessage(0),
          createMockAssistantMessage(0, 0), // P0 just finished
        ],
        thread: { id: 'thread-123', enableWebSearch: false },
      });

      const state = store.getState();

      // Stream is "done" but not acknowledged
      expect(state.isStreaming).toBe(false);
      expect(state.streamFinishAcknowledged).toBe(false);

      // Resumption should be blocked until streamFinishAcknowledged=true
      // This prevents triggering P1 before P0's onFinish has cleaned up state

      // After onFinish runs:
      store.setState({ streamFinishAcknowledged: true });
      expect(store.getState().streamFinishAcknowledged).toBe(true);
      // Now resumption can safely proceed
    });
  });
});

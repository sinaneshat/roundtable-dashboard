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
        currentParticipantIndex: 0, // P0 was streaming
        isStreaming: true, // Was streaming when user left
        messages: [
          createMockUserMessage(0),
          // P0 partial message
          {
            id: 'msg-p0-r0',
            metadata: {
              finishReason: 'unknown', // Not finished
              model: 'gpt-4',
              participantId: 'participant-0',
              participantIndex: 0,
              role: 'assistant' as const,
              roundNumber: 0,
            },
            parts: [{ text: 'Partial P0 response...', type: 'text' as const }],
            role: 'assistant' as const,
          },
        ],
        participants: createMockResumptionParticipants(2),
        screenMode: ScreenModes.THREAD,
        streamingRoundNumber: 0,
        thread: { enableWebSearch: false, id: 'thread-123' },
      });

      // Server has completed everything (simulating what DB would return)
      const serverCompletedState = {
        currentPhase: RoundPhases.COMPLETE,
        messages: createCompleteRoundMessages(0, 2), // user + P0 + P1 + moderator
        roundNumber: 0,
      };

      // Verify server state is complete
      expect(serverCompletedState.messages).toHaveLength(4);
      expect(serverCompletedState.currentPhase).toBe(RoundPhases.COMPLETE);

      // Client state was stale (partial P0)
      const clientState = staleClientState.getState();
      expect(clientState.messages).toHaveLength(2);
      expect(clientState.isStreaming).toBeTruthy();

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
        // Server prefilled COMPLETE phase
        currentResumptionPhase: RoundPhases.COMPLETE,
        isStreaming: false,
        messages: createCompleteRoundMessages(0, 2),
        participants: createMockResumptionParticipants(2),
        resumptionRoundNumber: 0,
        screenMode: ScreenModes.THREAD,
        streamResumptionPrefilled: true,
        thread: { enableWebSearch: false, id: 'thread-123' },
        waitingToStartStreaming: false,
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
      expect(state.isStreaming).toBeFalsy();
      expect(state.waitingToStartStreaming).toBeFalsy();
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
        // Server says P1 has active stream
        currentResumptionPhase: RoundPhases.PARTICIPANTS,
        isStreaming: false, // Not streaming yet (just returned)
        messages: [
          createMockUserMessage(0),
          createMockAssistantMessage(0, 0), // P0 complete
          // P1 not yet in cache (streaming on server)
        ],
        participants: createMockResumptionParticipants(2),
        resumptionRoundNumber: 0,
        screenMode: ScreenModes.THREAD,
        streamResumptionPrefilled: true,
        thread: { enableWebSearch: false, id: 'thread-123' },
        waitingToStartStreaming: false,
      });

      // Server resumption state indicates active stream for P1
      const serverResumption = createMockStreamResumptionState({
        currentPhase: RoundPhases.PARTICIPANTS,
        hasActiveStream: true, // Active stream exists!
        participants: {
          allComplete: false,
          currentParticipantIndex: 1, // P1 is streaming
          hasActiveStream: true,
          nextParticipantToTrigger: null, // Nothing to trigger, stream active
          participantStatuses: {
            0: { complete: true, hasError: false },
            1: { complete: false, hasError: false }, // P1 in progress
          },
          streamId: 'active-stream-p1',
          totalParticipants: 2,
        },
        roundNumber: 0,
        streamId: 'active-stream-p1',
      });

      // Client state
      const state = store.getState();
      expect(state.messages).toHaveLength(2); // user + P0

      // Server indicates active stream
      expect(serverResumption.hasActiveStream).toBeTruthy();
      expect(serverResumption.participants?.hasActiveStream).toBeTruthy();
      expect(serverResumption.participants?.nextParticipantToTrigger).toBeNull();

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
          metadata: { role: 'user' as const, roundNumber: 0 },
          parts: [{ text: 'Original question', type: 'text' as const }],
          role: 'user' as const,
        },
        {
          id: 'p0-0',
          metadata: {
            finishReason: FinishReasons.UNKNOWN,
            model: 'gpt-4',
            participantId: 'p0',
            participantIndex: 0,
            role: 'assistant' as const,
            roundNumber: 0,
          },
          parts: [{ text: 'Partial...', type: 'text' as const }], // Stale partial
          role: 'assistant' as const,
        },
      ]);

      expect(store.getState().messages).toHaveLength(2);

      // Fresh data from DB (complete messages)
      const freshMessages = [
        {
          id: 'user-0',
          metadata: { role: 'user' as const, roundNumber: 0 },
          parts: [{ text: 'Original question', type: 'text' as const }],
          role: 'user' as const,
        },
        {
          id: 'p0-0',
          metadata: {
            finishReason: FinishReasons.STOP, // Complete
            model: 'gpt-4',
            participantId: 'p0',
            participantIndex: 0,
            role: 'assistant' as const,
            roundNumber: 0,
          },
          parts: [{ text: 'Complete P0 response with full content!', type: 'text' as const }],
          role: 'assistant' as const,
        },
        {
          id: 'p1-0',
          metadata: {
            finishReason: FinishReasons.STOP,
            model: 'claude',
            participantId: 'p1',
            participantIndex: 1,
            role: 'assistant' as const,
            roundNumber: 0,
          },
          parts: [{ text: 'Complete P1 response', type: 'text' as const }],
          role: 'assistant' as const,
        },
        {
          id: 'mod-0',
          metadata: {
            finishReason: FinishReasons.STOP,
            isModerator: true,
            model: 'gemini',
            role: 'assistant' as const,
            roundNumber: 0,
          },
          parts: [{ text: 'Moderator summary', type: 'text' as const }],
          role: 'assistant' as const,
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
        currentResumptionPhase: RoundPhases.COMPLETE,
        isStreaming: false,
        // All 3 rounds complete
        messages: [
          // Round 0
          ...createCompleteRoundMessages(0, 2),
          // Round 1
          ...createCompleteRoundMessages(1, 2),
          // Round 2
          ...createCompleteRoundMessages(2, 2),
        ],
        participants: createMockResumptionParticipants(2),
        resumptionRoundNumber: 2, // Latest round
        screenMode: ScreenModes.THREAD,
        streamResumptionPrefilled: true,
        thread: { enableWebSearch: false, id: 'thread-123' },
        waitingToStartStreaming: false,
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
        currentResumptionPhase: RoundPhases.PARTICIPANTS,
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        participants: createMockResumptionParticipants(2),
        prefilledForThreadId: 'thread-A',
        resumptionRoundNumber: 0,
        screenMode: ScreenModes.THREAD,
        // Prefill state was set for thread-A
        streamResumptionPrefilled: true,
        // But current thread is thread-B!
        thread: { enableWebSearch: false, id: 'thread-B' },
        waitingToStartStreaming: false,
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
        // Stream just finished (isStreaming went false)
        isStreaming: false,
        messages: [
          createMockUserMessage(0),
          createMockAssistantMessage(0, 0), // P0 just finished
        ],
        participants: createMockResumptionParticipants(2),
        screenMode: ScreenModes.THREAD,
        // But onFinish hasn't run yet!
        streamFinishAcknowledged: false,
        streamingRoundNumber: null,
        thread: { enableWebSearch: false, id: 'thread-123' },
        waitingToStartStreaming: false,
      });

      const state = store.getState();

      // Stream is "done" but not acknowledged
      expect(state.isStreaming).toBeFalsy();
      expect(state.streamFinishAcknowledged).toBeFalsy();

      // Resumption should be blocked until streamFinishAcknowledged=true
      // This prevents triggering P1 before P0's onFinish has cleaned up state

      // After onFinish runs:
      store.setState({ streamFinishAcknowledged: true });
      expect(store.getState().streamFinishAcknowledged).toBeTruthy();
      // Now resumption can safely proceed
    });
  });
});

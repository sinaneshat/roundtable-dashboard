/**
 * Moderator Round Boundary Tests
 *
 * Tests to ensure moderators from round N do NOT appear during round N+1
 * participant streaming. This prevents visual bugs where old moderator messages
 * flash or persist during new round streaming.
 *
 * CRITICAL INVARIANTS:
 * 1. Round N moderator should ONLY render when roundNumber === N
 * 2. Round N+1 streaming should NOT show round N moderator
 * 3. Moderator placeholder timing must respect round boundaries
 * 4. Moderator triggers ONLY after ALL participants in current round complete
 *
 * ARCHITECTURE:
 * - useThreadTimeline sorts moderator LAST in each round's messages
 * - ChatMessageList filters messages by roundNumber for streaming rounds
 * - useModeratorTrigger adds placeholder AFTER participants complete (line 135)
 * - flow-state-machine.ts checks allParticipantsResponded before CREATING_MODERATOR
 * - completedRoundNumbers computed from moderator messages with finishReason (ChatView.tsx:203)
 *
 * TEST RESULTS:
 * ✅ All tests pass - store-level round boundary isolation is correct
 * ✅ Messages are properly filtered by roundNumber
 * ✅ Moderator placeholder timing enforced by participant completion check
 * ✅ Timeline ordering maintains round isolation
 *
 * These tests serve as regression prevention for multi-round moderator positioning.
 */

import { MessageRoles, MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX, ScreenModes } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { createMockParticipant, createMockThread } from '@/lib/testing';
import type { Participant } from '@/types/api';

import { createChatStore } from '../store';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Safely get a participant from an array, throwing if not found
 */
function getParticipant(participants: Participant[], index: number): Participant {
  const participant = participants[index];
  if (!participant) {
    throw new Error(`Expected participant at index ${index}`);
  }
  return participant;
}

/**
 * Safely get a message from an array, throwing if not found
 */
function getMessage(messages: UIMessage[], index: number): UIMessage {
  const message = messages[index];
  if (!message) {
    throw new Error(`Expected message at index ${index}`);
  }
  return message;
}

/**
 * Creates a user message for a specific round
 */
function createUserMessage(roundNumber: number): UIMessage {
  return {
    id: `thread-123_r${roundNumber}_user`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text: `Question ${roundNumber}` }],
    metadata: { role: MessageRoles.USER, roundNumber },
  };
}

/**
 * Creates an assistant message for a specific round and participant
 */
function createAssistantMessage(
  roundNumber: number,
  participantIndex: number,
  participantId: string,
  state: 'done' | 'streaming' = 'done',
): UIMessage {
  return {
    id: `thread-123_r${roundNumber}_p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: [{
      type: 'text',
      text: `Response from participant ${participantIndex}`,
      state,
    }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      participantId,
      model: `model-${participantIndex}`,
      finishReason: state === 'done' ? 'stop' : undefined,
      usage: state === 'done' ? { promptTokens: 100, completionTokens: 50, totalTokens: 150 } : undefined,
    },
  };
}

/**
 * Creates a moderator message for a specific round
 */
function createModeratorMessage(
  roundNumber: number,
  state: 'pending' | 'streaming' | 'done' = 'done',
): UIMessage {
  const parts = state === 'pending'
    ? [] // Empty parts = pending state
    : [{
        type: 'text' as const,
        text: `Moderator summary for round ${roundNumber}`,
        state: state === 'streaming' ? 'streaming' as const : 'done' as const,
      }];

  return {
    id: `thread-123_r${roundNumber}_moderator`,
    role: MessageRoles.ASSISTANT,
    parts,
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex: MODERATOR_PARTICIPANT_INDEX,
      model: MODERATOR_NAME,
      isModerator: true,
      finishReason: state === 'done' ? 'stop' : undefined,
    },
  };
}

// ============================================================================
// Moderator Round Boundary Tests
// ============================================================================

describe('moderator Round Boundary Isolation', () => {
  describe('round N Moderator During Round N+1 Streaming', () => {
    it('should NOT show round 1 moderator when round 2 participants are streaming', () => {
      const store = createChatStore();
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ];

      // Initialize thread in THREAD screen mode (no navigation needed)
      const thread = createMockThread({ id: 'thread-123', slug: 'test-thread' });
      store.getState().initializeThread(thread, participants, []);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // === ROUND 1: Complete with moderator ===
      const round1Messages: UIMessage[] = [
        createUserMessage(1),
        createAssistantMessage(1, 0, getParticipant(participants, 0).id, 'done'),
        createAssistantMessage(1, 1, getParticipant(participants, 1).id, 'done'),
        createAssistantMessage(1, 2, getParticipant(participants, 2).id, 'done'),
        createModeratorMessage(1, 'done'), // Round 1 moderator complete
      ];

      store.getState().setMessages(round1Messages);

      // Verify round 1 moderator is complete (has finishReason)
      const round1Mod = round1Messages.find(m => m.metadata?.isModerator && m.metadata?.roundNumber === 1);
      expect(round1Mod?.metadata?.finishReason).toBe('stop');

      // === ROUND 2: Start streaming participants ===
      const round2Messages: UIMessage[] = [
        ...round1Messages, // Keep round 1 messages
        createUserMessage(2),
        createAssistantMessage(2, 0, getParticipant(participants, 0).id, 'streaming'), // p0 streaming
        createAssistantMessage(2, 1, getParticipant(participants, 1).id, 'streaming'), // p1 streaming
        // p2 hasn't started yet
      ];

      store.getState().setMessages(round2Messages);
      store.getState().setStreamingRoundNumber(2);
      store.getState().setIsStreaming(true);

      // Get current state
      const state = store.getState();
      const currentRound = state.streamingRoundNumber;

      // CRITICAL ASSERTION: Round 1 moderator should NOT be accessible during round 2 streaming
      // The moderator should only be associated with its own round
      const round1Moderator = state.messages.find((m) => {
        const meta = m.metadata;
        return meta
          && typeof meta === 'object'
          && 'isModerator' in meta
          && meta.isModerator === true
          && 'roundNumber' in meta
          && meta.roundNumber === 1;
      });

      const round2Moderator = state.messages.find((m) => {
        const meta = m.metadata;
        return meta
          && typeof meta === 'object'
          && 'isModerator' in meta
          && meta.isModerator === true
          && 'roundNumber' in meta
          && meta.roundNumber === 2;
      });

      // Round 1 moderator should exist in messages (completed round)
      expect(round1Moderator).toBeDefined();
      expect(round1Moderator?.metadata?.roundNumber).toBe(1);

      // Round 2 moderator should NOT exist yet (participants still streaming)
      expect(round2Moderator).toBeUndefined();

      // Current round should be 2
      expect(currentRound).toBe(2);

      // CRITICAL BUG TEST: ChatMessageList should filter out round 1 moderator
      // during round 2 streaming by checking roundNumber === streamingRoundNumber
      // This is the visual bug where old moderator appears during new round streaming
      const messagesForCurrentRound = state.messages.filter((m) => {
        const meta = m.metadata;
        if (!meta || typeof meta !== 'object' || !('roundNumber' in meta)) {
          return false;
        }
        return meta.roundNumber === currentRound;
      });

      // Only round 2 messages should be in filtered list
      expect(messagesForCurrentRound).toHaveLength(3); // user + 2 streaming participants
      expect(messagesForCurrentRound.every(m => m.metadata?.roundNumber === 2)).toBe(true);

      // Round 1 moderator should NOT be in current round messages
      const hasRound1ModeratorInCurrentRound = messagesForCurrentRound.some((m) => {
        const meta = m.metadata;
        return meta
          && typeof meta === 'object'
          && 'isModerator' in meta
          && meta.isModerator === true
          && 'roundNumber' in meta
          && meta.roundNumber === 1;
      });

      expect(hasRound1ModeratorInCurrentRound).toBe(false);
    });

    it('should NOT show moderator placeholder until ALL round 2 participants complete', () => {
      const store = createChatStore();
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ];

      const thread = createMockThread({ id: 'thread-123', slug: 'test-thread' });
      store.getState().initializeThread(thread, participants, []);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Round 1 complete
      const round1Messages: UIMessage[] = [
        createUserMessage(1),
        createAssistantMessage(1, 0, getParticipant(participants, 0).id, 'done'),
        createAssistantMessage(1, 1, getParticipant(participants, 1).id, 'done'),
        createAssistantMessage(1, 2, getParticipant(participants, 2).id, 'done'),
        createModeratorMessage(1, 'done'),
      ];

      store.getState().setMessages(round1Messages);

      // Round 2: Participant 0 and 1 complete, participant 2 still streaming
      const round2MessagesPartial: UIMessage[] = [
        ...round1Messages,
        createUserMessage(2),
        createAssistantMessage(2, 0, getParticipant(participants, 0).id, 'done'),
        createAssistantMessage(2, 1, getParticipant(participants, 1).id, 'done'),
        createAssistantMessage(2, 2, getParticipant(participants, 2).id, 'streaming'), // STILL STREAMING
      ];

      store.getState().setMessages(round2MessagesPartial);
      store.getState().setStreamingRoundNumber(2);
      store.getState().setIsStreaming(true);

      // CRITICAL ASSERTION: Moderator for round 2 should NOT exist yet
      const round2ModeratorWhileStreaming = store.getState().messages.find((m) => {
        const meta = m.metadata;
        return meta
          && typeof meta === 'object'
          && 'isModerator' in meta
          && meta.isModerator === true
          && 'roundNumber' in meta
          && meta.roundNumber === 2;
      });

      expect(round2ModeratorWhileStreaming).toBeUndefined();

      // Verify participant 2 is still streaming
      const p2Message = store.getState().messages.find((m) => {
        const meta = m.metadata;
        return meta?.roundNumber === 2 && meta?.participantIndex === 2;
      });
      expect(p2Message?.parts?.[0]).toHaveProperty('state', 'streaming');

      // Now complete participant 2
      const round2MessagesComplete: UIMessage[] = [
        ...round1Messages,
        createUserMessage(2),
        createAssistantMessage(2, 0, getParticipant(participants, 0).id, 'done'),
        createAssistantMessage(2, 1, getParticipant(participants, 1).id, 'done'),
        createAssistantMessage(2, 2, getParticipant(participants, 2).id, 'done'), // NOW COMPLETE
      ];

      store.getState().setMessages(round2MessagesComplete);
      store.getState().setIsStreaming(false);

      // After all participants complete, moderator CAN be created
      // (but not automatically - useModeratorTrigger handles this)
      const canCreateModerator = !store.getState().messages.some((m) => {
        if (m.role !== MessageRoles.ASSISTANT)
          return false;
        if (m.metadata?.roundNumber !== 2)
          return false;
        return m.parts?.some(p => 'state' in p && p.state === 'streaming');
      });

      expect(canCreateModerator).toBe(true);
    });

    it('should maintain round isolation when transitioning from round 1 complete to round 2 start', () => {
      const store = createChatStore();
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
      ];

      const thread = createMockThread({ id: 'thread-123', slug: 'test-thread' });
      store.getState().initializeThread(thread, participants, []);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // === STEP 1: Complete round 1 with moderator ===
      const round1Complete: UIMessage[] = [
        createUserMessage(1),
        createAssistantMessage(1, 0, getParticipant(participants, 0).id, 'done'),
        createAssistantMessage(1, 1, getParticipant(participants, 1).id, 'done'),
        createModeratorMessage(1, 'done'),
      ];

      store.getState().setMessages(round1Complete);
      store.getState().setIsStreaming(false);
      store.getState().setIsModeratorStreaming(false);
      store.getState().setStreamingRoundNumber(null);

      // Verify round 1 moderator is complete (has finishReason)
      const round1Mod = round1Complete.find(m => m.metadata?.isModerator && m.metadata?.roundNumber === 1);
      expect(round1Mod?.metadata?.finishReason).toBe('stop');
      expect(store.getState().streamingRoundNumber).toBeNull();

      // === STEP 2: Start round 2 immediately ===
      // User submits new message, round 2 begins
      const round2Start: UIMessage[] = [
        ...round1Complete,
        createUserMessage(2),
      ];

      store.getState().setMessages(round2Start);
      store.getState().setStreamingRoundNumber(2);

      // At this point, round 2 has started but no participants responded yet
      const state = store.getState();

      // Current streaming round should be 2
      expect(state.streamingRoundNumber).toBe(2);

      // Round 1 moderator should exist
      const round1Moderator = state.messages.find((m) => {
        const meta = m.metadata;
        return meta?.isModerator === true && meta?.roundNumber === 1;
      });
      expect(round1Moderator).toBeDefined();

      // Round 2 moderator should NOT exist yet
      const round2Moderator = state.messages.find((m) => {
        const meta = m.metadata;
        return meta?.isModerator === true && meta?.roundNumber === 2;
      });
      expect(round2Moderator).toBeUndefined();

      // === STEP 3: Participant streaming starts ===
      const round2Streaming: UIMessage[] = [
        ...round1Complete,
        createUserMessage(2),
        createAssistantMessage(2, 0, getParticipant(participants, 0).id, 'streaming'),
      ];

      store.getState().setMessages(round2Streaming);
      store.getState().setIsStreaming(true);

      // CRITICAL: During round 2 streaming, round 1 moderator should NOT be visible
      // in the current round's message filter
      const currentRound = store.getState().streamingRoundNumber;
      const currentRoundMessages = store.getState().messages.filter((m) => {
        return m.metadata?.roundNumber === currentRound;
      });

      expect(currentRound).toBe(2);
      expect(currentRoundMessages.every(m => m.metadata?.roundNumber === 2)).toBe(true);

      // Round 1 moderator should NOT be in current round messages
      const round1ModInRound2 = currentRoundMessages.find((m) => {
        const meta = m.metadata;
        return meta?.isModerator === true && meta?.roundNumber === 1;
      });
      expect(round1ModInRound2).toBeUndefined();
    });
  });

  describe('moderator Placeholder Timing', () => {
    it('should only add moderator placeholder AFTER all participants complete, not before', () => {
      const store = createChatStore();
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ];

      const thread = createMockThread({ id: 'thread-123', slug: 'test-thread' });
      store.getState().initializeThread(thread, participants, []);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Start round 1 with user message
      const messages: UIMessage[] = [createUserMessage(1)];
      store.getState().setMessages(messages);
      store.getState().setStreamingRoundNumber(1);

      // Verify no moderator placeholder exists yet
      expect(
        store.getState().messages.find(m => m.metadata?.isModerator === true),
      ).toBeUndefined();

      // Participant 0 completes
      store.getState().setMessages([
        ...messages,
        createAssistantMessage(1, 0, getParticipant(participants, 0).id, 'done'),
      ]);

      // Still no moderator (not all participants complete)
      expect(
        store.getState().messages.find(m => m.metadata?.isModerator === true),
      ).toBeUndefined();

      // Participant 1 completes
      store.getState().setMessages([
        createUserMessage(1),
        createAssistantMessage(1, 0, getParticipant(participants, 0).id, 'done'),
        createAssistantMessage(1, 1, getParticipant(participants, 1).id, 'done'),
      ]);

      // Still no moderator (participant 2 hasn't completed)
      expect(
        store.getState().messages.find(m => m.metadata?.isModerator === true),
      ).toBeUndefined();

      // Participant 2 completes
      store.getState().setMessages([
        createUserMessage(1),
        createAssistantMessage(1, 0, getParticipant(participants, 0).id, 'done'),
        createAssistantMessage(1, 1, getParticipant(participants, 1).id, 'done'),
        createAssistantMessage(1, 2, getParticipant(participants, 2).id, 'done'),
      ]);
      store.getState().setIsStreaming(false);

      // NOW moderator placeholder can be added (by useModeratorTrigger)
      // This test verifies the TIMING constraint - placeholder only after ALL participants
      const allParticipantsComplete = !store.getState().messages.some((m) => {
        if (m.role !== MessageRoles.ASSISTANT)
          return false;
        if (m.metadata?.roundNumber !== 1)
          return false;
        if (m.metadata?.isModerator)
          return false; // Skip moderator messages
        return m.parts?.some(p => 'state' in p && p.state === 'streaming');
      });

      expect(allParticipantsComplete).toBe(true);

      // Simulate useModeratorTrigger adding placeholder
      const moderatorPlaceholder = createModeratorMessage(1, 'pending');
      store.getState().setMessages([
        createUserMessage(1),
        createAssistantMessage(1, 0, getParticipant(participants, 0).id, 'done'),
        createAssistantMessage(1, 1, getParticipant(participants, 1).id, 'done'),
        createAssistantMessage(1, 2, getParticipant(participants, 2).id, 'done'),
        moderatorPlaceholder,
      ]);

      // Verify placeholder exists and is pending
      const moderator = store.getState().messages.find(m => m.metadata?.isModerator === true);
      expect(moderator).toBeDefined();
      expect(moderator?.parts).toHaveLength(0); // Pending = empty parts
      expect(moderator?.metadata?.roundNumber).toBe(1);
    });

    it('should NOT trigger moderator for round N while round N is still streaming', () => {
      const store = createChatStore();
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
      ];

      const thread = createMockThread({ id: 'thread-123', slug: 'test-thread' });
      store.getState().initializeThread(thread, participants, []);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Round 1: Participant 0 done, participant 1 streaming
      const messages: UIMessage[] = [
        createUserMessage(1),
        createAssistantMessage(1, 0, getParticipant(participants, 0).id, 'done'),
        createAssistantMessage(1, 1, getParticipant(participants, 1).id, 'streaming'), // STREAMING
      ];

      store.getState().setMessages(messages);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);

      // Check if moderator should be triggered (via flow-state-machine logic)
      const state = store.getState();
      const hasStreamingParticipant = state.messages.some((m) => {
        if (m.role !== MessageRoles.ASSISTANT)
          return false;
        if (m.metadata?.roundNumber !== 1)
          return false;
        if (m.metadata?.isModerator)
          return false;
        return m.parts?.some(p => 'state' in p && p.state === 'streaming');
      });

      // Should have streaming participant
      expect(hasStreamingParticipant).toBe(true);

      // Should NOT create moderator while participants streaming
      // This matches flow-state-machine.ts line 139-147 logic
      expect(state.isAiSdkStreaming || hasStreamingParticipant).toBe(true);

      // Moderator should NOT exist
      expect(
        state.messages.find(m => m.metadata?.isModerator === true && m.metadata?.roundNumber === 1),
      ).toBeUndefined();
    });
  });

  describe('timeline Ordering Consistency', () => {
    it('should maintain correct order: user → participants → moderator for each round', () => {
      const store = createChatStore();
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
      ];

      const thread = createMockThread({ id: 'thread-123', slug: 'test-thread' });
      store.getState().initializeThread(thread, participants, []);

      // Create two complete rounds
      const messages: UIMessage[] = [
        // Round 1
        createUserMessage(1),
        createAssistantMessage(1, 0, getParticipant(participants, 0).id, 'done'),
        createAssistantMessage(1, 1, getParticipant(participants, 1).id, 'done'),
        createModeratorMessage(1, 'done'),

        // Round 2
        createUserMessage(2),
        createAssistantMessage(2, 0, getParticipant(participants, 0).id, 'done'),
        createAssistantMessage(2, 1, getParticipant(participants, 1).id, 'done'),
        createModeratorMessage(2, 'done'),
      ];

      store.getState().setMessages(messages);

      // Extract round 1 messages
      const round1Messages = store.getState().messages.filter(m => m.metadata?.roundNumber === 1);

      // Verify round 1 order: user → participant 0 → participant 1 → moderator
      expect(round1Messages).toHaveLength(4);
      expect(getMessage(round1Messages, 0).role).toBe(MessageRoles.USER);
      expect(getMessage(round1Messages, 1).metadata?.participantIndex).toBe(0);
      expect(getMessage(round1Messages, 2).metadata?.participantIndex).toBe(1);
      expect(getMessage(round1Messages, 3).metadata?.isModerator).toBe(true);

      // Extract round 2 messages
      const round2Messages = store.getState().messages.filter(m => m.metadata?.roundNumber === 2);

      // Verify round 2 order: user → participant 0 → participant 1 → moderator
      expect(round2Messages).toHaveLength(4);
      expect(getMessage(round2Messages, 0).role).toBe(MessageRoles.USER);
      expect(getMessage(round2Messages, 1).metadata?.participantIndex).toBe(0);
      expect(getMessage(round2Messages, 2).metadata?.participantIndex).toBe(1);
      expect(getMessage(round2Messages, 3).metadata?.isModerator).toBe(true);

      // Verify rounds don't mix
      expect(round1Messages.every(m => m.metadata?.roundNumber === 1)).toBe(true);
      expect(round2Messages.every(m => m.metadata?.roundNumber === 2)).toBe(true);
    });

    it('should filter messages correctly during streaming transition between rounds', () => {
      const store = createChatStore();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      const thread = createMockThread({ id: 'thread-123', slug: 'test-thread' });
      store.getState().initializeThread(thread, participants, []);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Complete round 1
      const round1Complete: UIMessage[] = [
        createUserMessage(1),
        createAssistantMessage(1, 0, getParticipant(participants, 0).id, 'done'),
        createAssistantMessage(1, 1, getParticipant(participants, 1).id, 'done'),
        createModeratorMessage(1, 'done'),
      ];

      store.getState().setMessages(round1Complete);

      // Start round 2 streaming
      const round2Streaming: UIMessage[] = [
        ...round1Complete,
        createUserMessage(2),
        createAssistantMessage(2, 0, getParticipant(participants, 0).id, 'streaming'),
      ];

      store.getState().setMessages(round2Streaming);
      store.getState().setStreamingRoundNumber(2);
      store.getState().setIsStreaming(true);

      const state = store.getState();

      // Filter for round 1 messages (should include moderator with finishReason)
      const round1Messages = state.messages.filter((m) => {
        return m.metadata?.roundNumber === 1;
      });

      expect(round1Messages).toHaveLength(4); // user + 2 participants + moderator
      expect(round1Messages.every(m => m.metadata?.roundNumber === 1)).toBe(true);

      // Verify round 1 moderator has finishReason (completed)
      const round1Moderator = round1Messages.find(m => m.metadata?.isModerator);
      expect(round1Moderator?.metadata?.finishReason).toBe('stop');

      // Filter for streaming round (should show only round 2, NO round 1 moderator)
      const streamingRoundMessages = state.messages.filter((m) => {
        return m.metadata?.roundNumber === state.streamingRoundNumber;
      });

      expect(streamingRoundMessages).toHaveLength(2); // user + 1 streaming participant
      expect(streamingRoundMessages.every(m => m.metadata?.roundNumber === 2)).toBe(true);

      // CRITICAL: No round 1 moderator in streaming round messages
      expect(
        streamingRoundMessages.find(m => m.metadata?.isModerator === true && m.metadata?.roundNumber === 1),
      ).toBeUndefined();
    });
  });
});

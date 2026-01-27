/**
 * Stream Resumption Navigation Tests
 *
 * Tests combining stream resumption with navigation flows to catch:
 * 1. Resume P1 stream after refresh during P1 streaming
 * 2. Load P0 from D1, resume P1 from KV on refresh
 * 3. Resume moderator stream after refresh
 * 4. Handle refresh when round is complete
 * 5. Resume with correct lastSeq after tab backgrounded
 *
 * @see /Users/avabagherzadeh/Desktop/projects/deadpixel/billing-dashboard/docs/FLOW_DOCUMENTATION.md
 */

import { MessageStatuses } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockParticipants,
  createMockStoredPreSearch,
  createMockThread,
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { createChatStore } from '@/stores/chat';
import { ChatPhases } from '@/stores/chat/store-schemas';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Simulate loading D1 data (completed messages from database)
 */
function loadD1Data(
  store: ReturnType<typeof createChatStore>,
  options: {
    thread: ReturnType<typeof createMockThread>;
    participants: ReturnType<typeof createMockParticipants>;
    messages: UIMessage[];
    preSearches?: ReturnType<typeof createMockStoredPreSearch>[];
  },
) {
  const { messages, participants, preSearches, thread } = options;

  store.getState().initializeThread(thread, participants, messages);

  if (preSearches) {
    store.getState().setPreSearches(preSearches);
  }

  store.getState().setHasInitiallyLoaded(true);
}

/**
 * Simulate KV resumption state (tells us where streaming left off)
 */
type KVResumptionState = {
  roundNumber: number;
  currentPhase: 'presearch' | 'participants' | 'moderator' | 'complete';
  nextParticipantToTrigger: number | null;
  participantStatuses: ('complete' | 'streaming' | 'pending')[];
  presearchStatus: 'complete' | 'streaming' | 'pending' | null;
  moderatorStatus: 'complete' | 'streaming' | 'pending' | null;
  lastSeqValues: {
    presearch: number;
    participants: number[];
    moderator: number;
  };
};

/**
 * Apply KV resumption state to store
 */
function applyKVResumption(
  store: ReturnType<typeof createChatStore>,
  kvState: KVResumptionState,
) {
  const { currentPhase, lastSeqValues, moderatorStatus, nextParticipantToTrigger, participantStatuses, presearchStatus, roundNumber } = kvState;

  // Set round number
  store.getState().setCurrentRoundNumber(roundNumber);
  store.getState().setStreamingRoundNumber(roundNumber);

  // Initialize subscription state
  store.getState().initializeSubscriptions(roundNumber, participantStatuses.length);

  // Apply presearch status
  if (presearchStatus) {
    const status = presearchStatus === 'complete' ? 'complete'
      : presearchStatus === 'streaming' ? 'streaming'
        : 'idle';
    store.getState().updateEntitySubscriptionStatus('presearch', status, lastSeqValues.presearch);
  }

  // Apply participant statuses
  participantStatuses.forEach((pStatus, index) => {
    const status = pStatus === 'complete' ? 'complete'
      : pStatus === 'streaming' ? 'streaming'
        : 'idle';
    store.getState().updateEntitySubscriptionStatus(index, status, lastSeqValues.participants[index] ?? 0);
  });

  // Apply moderator status
  if (moderatorStatus) {
    const status = moderatorStatus === 'complete' ? 'complete'
      : moderatorStatus === 'streaming' ? 'streaming'
        : 'idle';
    store.getState().updateEntitySubscriptionStatus('moderator', status, lastSeqValues.moderator);
  }

  // Set phase
  const phaseMap: Record<string, typeof ChatPhases[keyof typeof ChatPhases]> = {
    'complete': ChatPhases.COMPLETE,
    'moderator': ChatPhases.MODERATOR,
    'participants': ChatPhases.PARTICIPANTS,
    'presearch': ChatPhases.PARTICIPANTS, // presearch happens during PARTICIPANTS phase
  };

  store.setState({
    currentParticipantIndex: nextParticipantToTrigger ?? 0,
    isModeratorStreaming: moderatorStatus === 'streaming',
    isStreaming: currentPhase !== 'complete',
    phase: phaseMap[currentPhase] ?? ChatPhases.IDLE,
  });
}

/**
 * Create messages for partially completed round
 */
function createPartialRoundMessages(
  threadId: string,
  roundNumber: number,
  completedParticipantCount: number,
  includeUserMessage = true,
): UIMessage[] {
  const messages: UIMessage[] = [];

  if (includeUserMessage) {
    messages.push(createTestUserMessage({
      content: `User question round ${roundNumber}`,
      id: `${threadId}_r${roundNumber}_user`,
      roundNumber,
    }));
  }

  for (let i = 0; i < completedParticipantCount; i++) {
    messages.push(createTestAssistantMessage({
      content: `Participant ${i} complete response`,
      id: `${threadId}_r${roundNumber}_p${i}`,
      participantId: `participant-${i}`,
      participantIndex: i,
      roundNumber,
    }));
  }

  return messages;
}

// ============================================================================
// Test Suite: Stream Resumption with Navigation
// ============================================================================

describe('stream Resumption Navigation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('resume P1 stream after refresh during P1 streaming', () => {
    it('should load P0 from D1 and set up P1 resumption from KV', () => {
      const thread = createMockThread({ id: 'thread-123', slug: 'thread-123' });
      const participants = createMockParticipants(3, 'thread-123');

      // D1 has: user message + P0 complete
      const d1Messages = createPartialRoundMessages('thread-123', 0, 1);

      // Load D1 data
      loadD1Data(store, { messages: d1Messages, participants, thread });

      // KV says: P0 complete, P1 streaming at seq 75, P2 pending
      const kvState: KVResumptionState = {
        currentPhase: 'participants',
        lastSeqValues: {
          moderator: 0,
          participants: [100, 75, 0],
          presearch: 0,
        },
        moderatorStatus: null,
        nextParticipantToTrigger: 2, // After P1 completes, trigger P2
        participantStatuses: ['complete', 'streaming', 'pending'],
        presearchStatus: null,
        roundNumber: 0,
      };

      applyKVResumption(store, kvState);

      const state = store.getState();

      // Verify D1 data loaded
      expect(state.messages).toHaveLength(2); // user + P0
      expect(state.messages.some(m => m.id === 'thread-123_r0_p0')).toBe(true);

      // Verify KV state applied
      expect(state.subscriptionState.participants[0]?.status).toBe('complete');
      expect(state.subscriptionState.participants[0]?.lastSeq).toBe(100);
      expect(state.subscriptionState.participants[1]?.status).toBe('streaming');
      expect(state.subscriptionState.participants[1]?.lastSeq).toBe(75);
      expect(state.subscriptionState.participants[2]?.status).toBe('idle');
    });

    it('should be able to continue P1 streaming from lastSeq', () => {
      const thread = createMockThread({ id: 'thread-123', slug: 'thread-123' });
      const participants = createMockParticipants(3, 'thread-123');

      const d1Messages = createPartialRoundMessages('thread-123', 0, 1);
      loadD1Data(store, { messages: d1Messages, participants, thread });

      const kvState: KVResumptionState = {
        currentPhase: 'participants',
        lastSeqValues: {
          moderator: 0,
          participants: [100, 75, 0],
          presearch: 0,
        },
        moderatorStatus: null,
        nextParticipantToTrigger: 2,
        participantStatuses: ['complete', 'streaming', 'pending'],
        presearchStatus: null,
        roundNumber: 0,
      };
      applyKVResumption(store, kvState);

      // Now simulate P1 continuing to stream
      store.getState().appendEntityStreamingText(1, 'Resumed content...', 0);
      store.getState().updateEntitySubscriptionStatus(1, 'streaming', 80);

      const state = store.getState();
      expect(state.subscriptionState.participants[1]?.lastSeq).toBe(80);

      // Verify streaming placeholder exists
      const p1Streaming = state.messages.find(m => m.id === 'streaming_p1_r0');
      expect(p1Streaming).toBeDefined();
    });
  });

  describe('load P0 from D1, resume P1 from KV on refresh', () => {
    it('should correctly merge D1 data with KV resumption state', () => {
      const thread = createMockThread({ id: 'thread-123', slug: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      // D1: P0 complete
      const d1Messages = createPartialRoundMessages('thread-123', 0, 1);

      loadD1Data(store, { messages: d1Messages, participants, thread });

      // KV: P0 complete, P1 mid-stream
      applyKVResumption(store, {
        currentPhase: 'participants',
        lastSeqValues: {
          moderator: 0,
          participants: [100, 50],
          presearch: 0,
        },
        moderatorStatus: null,
        nextParticipantToTrigger: null,
        participantStatuses: ['complete', 'streaming'],
        presearchStatus: null,
        roundNumber: 0,
      });

      const state = store.getState();

      // P0 from D1
      expect(state.messages.some(m => m.id === 'thread-123_r0_p0')).toBe(true);

      // P1 resumption state from KV
      expect(state.subscriptionState.participants[1]?.status).toBe('streaming');
      expect(state.subscriptionState.participants[1]?.lastSeq).toBe(50);

      // Phase should be PARTICIPANTS
      expect(state.phase).toBe(ChatPhases.PARTICIPANTS);
      expect(state.isStreaming).toBe(true);
    });
  });

  describe('resume moderator stream after refresh during moderator', () => {
    it('should load all participant messages and resume moderator streaming', () => {
      const thread = createMockThread({ id: 'thread-123', slug: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      // D1: All participants complete
      const d1Messages = [
        createTestUserMessage({
          content: 'Question',
          id: 'thread-123_r0_user',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P0 response',
          id: 'thread-123_r0_p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P1 response',
          id: 'thread-123_r0_p1',
          participantId: 'participant-1',
          participantIndex: 1,
          roundNumber: 0,
        }),
      ];

      loadD1Data(store, { messages: d1Messages, participants, thread });

      // KV: Moderator streaming
      applyKVResumption(store, {
        currentPhase: 'moderator',
        lastSeqValues: {
          moderator: 30,
          participants: [100, 100],
          presearch: 0,
        },
        moderatorStatus: 'streaming',
        nextParticipantToTrigger: null,
        participantStatuses: ['complete', 'complete'],
        presearchStatus: null,
        roundNumber: 0,
      });

      const state = store.getState();

      // All participant messages loaded
      expect(state.messages).toHaveLength(3);

      // Moderator streaming state
      expect(state.phase).toBe(ChatPhases.MODERATOR);
      expect(state.isModeratorStreaming).toBe(true);
      expect(state.subscriptionState.moderator.status).toBe('streaming');
      expect(state.subscriptionState.moderator.lastSeq).toBe(30);
    });

    it('should continue moderator streaming from lastSeq', () => {
      const thread = createMockThread({ id: 'thread-123', slug: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      const d1Messages = createPartialRoundMessages('thread-123', 0, 2);
      loadD1Data(store, { messages: d1Messages, participants, thread });

      applyKVResumption(store, {
        currentPhase: 'moderator',
        lastSeqValues: {
          moderator: 30,
          participants: [100, 100],
          presearch: 0,
        },
        moderatorStatus: 'streaming',
        nextParticipantToTrigger: null,
        participantStatuses: ['complete', 'complete'],
        presearchStatus: null,
        roundNumber: 0,
      });

      // Continue moderator streaming
      store.getState().appendModeratorStreamingText('Resumed moderator content...', 0);
      store.getState().updateEntitySubscriptionStatus('moderator', 'streaming', 50);

      const state = store.getState();
      expect(state.subscriptionState.moderator.lastSeq).toBe(50);
    });
  });

  describe('handle refresh when round is complete (all from D1)', () => {
    it('should load complete round from D1 with no streaming needed', () => {
      const thread = createMockThread({ id: 'thread-123', slug: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      // D1: Complete round
      const d1Messages = [
        createTestUserMessage({
          content: 'Question',
          id: 'thread-123_r0_user',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P0 response',
          id: 'thread-123_r0_p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P1 response',
          id: 'thread-123_r0_p1',
          participantId: 'participant-1',
          participantIndex: 1,
          roundNumber: 0,
        }),
        createTestModeratorMessage({
          content: 'Moderator summary',
          id: 'thread-123_r0_moderator',
          roundNumber: 0,
        }),
      ];

      loadD1Data(store, { messages: d1Messages, participants, thread });

      // KV: Round complete
      applyKVResumption(store, {
        currentPhase: 'complete',
        lastSeqValues: {
          moderator: 100,
          participants: [100, 100],
          presearch: 0,
        },
        moderatorStatus: 'complete',
        nextParticipantToTrigger: null,
        participantStatuses: ['complete', 'complete'],
        presearchStatus: null,
        roundNumber: 0,
      });

      const state = store.getState();

      // All messages loaded
      expect(state.messages).toHaveLength(4);

      // Phase is COMPLETE
      expect(state.phase).toBe(ChatPhases.COMPLETE);
      expect(state.isStreaming).toBe(false);
    });
  });

  describe('resume with correct lastSeq after tab backgrounded', () => {
    it('should preserve lastSeq values when store state is maintained', () => {
      const thread = createMockThread({ id: 'thread-123', slug: 'thread-123' });
      const participants = createMockParticipants(3, 'thread-123');

      const d1Messages = createPartialRoundMessages('thread-123', 0, 0);
      loadD1Data(store, { messages: d1Messages, participants, thread });

      // Set up streaming state
      store.getState().initializeSubscriptions(0, 3);
      store.getState().updateEntitySubscriptionStatus(0, 'streaming', 50);

      // Simulate tab being backgrounded (state persists in memory)
      const lastSeqBefore = store.getState().subscriptionState.participants[0]?.lastSeq;

      // Tab comes back - state should be preserved
      const lastSeqAfter = store.getState().subscriptionState.participants[0]?.lastSeq;

      expect(lastSeqAfter).toBe(lastSeqBefore);
      expect(lastSeqAfter).toBe(50);
    });

    it('should use lastSeq for resumption after reconnection', () => {
      const thread = createMockThread({ id: 'thread-123', slug: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      loadD1Data(store, {
        messages: createPartialRoundMessages('thread-123', 0, 0),
        participants,
        thread,
      });

      applyKVResumption(store, {
        currentPhase: 'participants',
        lastSeqValues: {
          moderator: 0,
          participants: [75, 0],
          presearch: 0,
        },
        moderatorStatus: null,
        nextParticipantToTrigger: 1,
        participantStatuses: ['streaming', 'pending'],
        presearchStatus: null,
        roundNumber: 0,
      });

      // After reconnection, new chunks should increment from lastSeq
      store.getState().updateEntitySubscriptionStatus(0, 'streaming', 80);
      store.getState().updateEntitySubscriptionStatus(0, 'streaming', 85);
      store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);

      const state = store.getState();
      expect(state.subscriptionState.participants[0]?.lastSeq).toBe(100);
      expect(state.subscriptionState.participants[0]?.status).toBe('complete');
    });
  });

  describe('handle resume when presearch was in progress', () => {
    it('should resume presearch streaming from lastSeq', () => {
      const thread = createMockThread({
        enableWebSearch: true,
        id: 'thread-123',
        slug: 'thread-123',
      });
      const participants = createMockParticipants(2, 'thread-123');

      // D1: Only user message (presearch still running)
      const d1Messages = [
        createTestUserMessage({
          content: 'Research topic',
          id: 'thread-123_r0_user',
          roundNumber: 0,
        }),
      ];

      // Add presearch record
      const preSearches = [createMockStoredPreSearch(0, MessageStatuses.STREAMING)];

      loadD1Data(store, { messages: d1Messages, participants, preSearches, thread });

      // KV: Presearch mid-stream
      applyKVResumption(store, {
        currentPhase: 'presearch',
        lastSeqValues: {
          moderator: 0,
          participants: [0, 0],
          presearch: 40,
        },
        moderatorStatus: null,
        nextParticipantToTrigger: 0,
        participantStatuses: ['pending', 'pending'],
        presearchStatus: 'streaming',
        roundNumber: 0,
      });

      const state = store.getState();

      expect(state.subscriptionState.presearch.status).toBe('streaming');
      expect(state.subscriptionState.presearch.lastSeq).toBe(40);
      expect(state.preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
    });

    it('should block participants until presearch completes after resume', () => {
      const thread = createMockThread({
        enableWebSearch: true,
        id: 'thread-123',
        slug: 'thread-123',
      });
      const participants = createMockParticipants(2, 'thread-123');

      loadD1Data(store, {
        messages: createPartialRoundMessages('thread-123', 0, 0),
        participants,
        preSearches: [createMockStoredPreSearch(0, MessageStatuses.STREAMING)],
        thread,
      });

      applyKVResumption(store, {
        currentPhase: 'presearch',
        lastSeqValues: {
          moderator: 0,
          participants: [0, 0],
          presearch: 40,
        },
        moderatorStatus: null,
        nextParticipantToTrigger: 0,
        participantStatuses: ['pending', 'pending'],
        presearchStatus: 'streaming',
        roundNumber: 0,
      });

      // Participants should still be pending
      const state = store.getState();
      expect(state.subscriptionState.participants[0]?.status).toBe('idle');
      expect(state.subscriptionState.participants[1]?.status).toBe('idle');
    });
  });

  describe('not duplicate messages on rapid refresh', () => {
    it('should not create duplicate messages when loading same D1 data twice', () => {
      const thread = createMockThread({ id: 'thread-123', slug: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');
      const d1Messages = createPartialRoundMessages('thread-123', 0, 2);

      // First load
      loadD1Data(store, { messages: d1Messages, participants, thread });
      expect(store.getState().messages).toHaveLength(3);

      // Second load (rapid refresh)
      loadD1Data(store, { messages: d1Messages, participants, thread });
      expect(store.getState().messages).toHaveLength(3);

      // Verify no duplicates
      const ids = store.getState().messages.map(m => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should replace messages on hydration, not append', () => {
      const thread = createMockThread({ id: 'thread-123', slug: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      // First load with 1 complete participant
      const d1Messages1 = createPartialRoundMessages('thread-123', 0, 1);
      loadD1Data(store, { messages: d1Messages1, participants, thread });
      expect(store.getState().messages).toHaveLength(2);

      // Second load with 2 complete participants
      const d1Messages2 = createPartialRoundMessages('thread-123', 0, 2);
      loadD1Data(store, { messages: d1Messages2, participants, thread });
      expect(store.getState().messages).toHaveLength(3);

      // Should have exactly the messages from second load
      expect(store.getState().messages.map(m => m.id)).toEqual(d1Messages2.map(m => m.id));
    });
  });

  describe('maintain participant order on resume', () => {
    it('should preserve participant priority order from D1', () => {
      const thread = createMockThread({ id: 'thread-123', slug: 'thread-123' });
      const participants = [
        { ...createMockParticipants(1, 'thread-123')[0]!, id: 'p0', modelId: 'gpt-4', priority: 0 },
        { ...createMockParticipants(1, 'thread-123')[0]!, id: 'p1', modelId: 'claude-3', priority: 1 },
        { ...createMockParticipants(1, 'thread-123')[0]!, id: 'p2', modelId: 'gemini', priority: 2 },
      ];

      const d1Messages = createPartialRoundMessages('thread-123', 0, 2);
      loadD1Data(store, { messages: d1Messages, participants, thread });

      const state = store.getState();

      // Participants should be in priority order
      expect(state.participants.map(p => p.id)).toEqual(['p0', 'p1', 'p2']);
      expect(state.participants.map(p => p.priority)).toEqual([0, 1, 2]);
    });

    it('should maintain message order matching participant priority', () => {
      const thread = createMockThread({ id: 'thread-123', slug: 'thread-123' });
      const participants = createMockParticipants(3, 'thread-123');

      const d1Messages = [
        createTestUserMessage({
          content: 'Question',
          id: 'thread-123_r0_user',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P0',
          id: 'thread-123_r0_p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P1',
          id: 'thread-123_r0_p1',
          participantId: 'participant-1',
          participantIndex: 1,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P2',
          id: 'thread-123_r0_p2',
          participantId: 'participant-2',
          participantIndex: 2,
          roundNumber: 0,
        }),
      ];

      loadD1Data(store, { messages: d1Messages, participants, thread });

      const state = store.getState();
      const assistantMessages = state.messages.filter(m => m.role === 'assistant');

      // Messages should be in order by participantIndex
      const participantIndices = assistantMessages.map((m) => {
        const meta = m.metadata as Record<string, unknown>;
        return meta?.participantIndex;
      });
      expect(participantIndices).toEqual([0, 1, 2]);
    });
  });

  describe('multi-round resumption', () => {
    it('should handle resumption in round 2 with round 1 complete', () => {
      const thread = createMockThread({ id: 'thread-123', slug: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      // D1: Round 0 complete, Round 1 has user + P0
      const d1Messages = [
        // Round 0 complete
        createTestUserMessage({ content: 'R0 Q', id: 'thread-123_r0_user', roundNumber: 0 }),
        createTestAssistantMessage({ content: 'R0 P0', id: 'thread-123_r0_p0', participantId: 'p0', participantIndex: 0, roundNumber: 0 }),
        createTestAssistantMessage({ content: 'R0 P1', id: 'thread-123_r0_p1', participantId: 'p1', participantIndex: 1, roundNumber: 0 }),
        createTestModeratorMessage({ content: 'R0 Mod', id: 'thread-123_r0_mod', roundNumber: 0 }),
        // Round 1 partial
        createTestUserMessage({ content: 'R1 Q', id: 'thread-123_r1_user', roundNumber: 1 }),
        createTestAssistantMessage({ content: 'R1 P0', id: 'thread-123_r1_p0', participantId: 'p0', participantIndex: 0, roundNumber: 1 }),
      ];

      loadD1Data(store, { messages: d1Messages, participants, thread });

      // KV: Round 1, P0 complete, P1 streaming
      applyKVResumption(store, {
        currentPhase: 'participants',
        lastSeqValues: {
          moderator: 0,
          participants: [100, 50],
          presearch: 0,
        },
        moderatorStatus: null,
        nextParticipantToTrigger: null,
        participantStatuses: ['complete', 'streaming'],
        presearchStatus: null,
        roundNumber: 1,
      });

      const state = store.getState();

      expect(state.messages).toHaveLength(6);
      expect(state.currentRoundNumber).toBe(1);
      expect(state.subscriptionState.activeRoundNumber).toBe(1);
      expect(state.subscriptionState.participants[0]?.status).toBe('complete');
      expect(state.subscriptionState.participants[1]?.status).toBe('streaming');
    });
  });
});

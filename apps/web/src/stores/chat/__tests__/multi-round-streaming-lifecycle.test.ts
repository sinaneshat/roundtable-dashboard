import type { UIMessageRole } from '@roundtable/shared';
import { UIMessageRoles } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

/**
 * Multi-Round Streaming Lifecycle Tests
 *
 * Comprehensive tests covering the complete conversation journey:
 * - Round initialization and completion
 * - Sequential participant streaming within rounds
 * - Round-to-round transitions
 * - State consistency across multiple rounds
 * - Configuration changes between rounds
 *
 * Based on FLOW_DOCUMENTATION.md patterns and AI SDK v6 streaming behavior
 */

// Types matching the actual implementation
type Participant = {
  id: string;
  modelId: string;
  role: string | null;
  priority: number;
  isEnabled: boolean;
};

type MessageStatus = 'pending' | 'streaming' | 'complete' | 'error';

type Message = {
  id: string;
  role: UIMessageRole;
  content: string;
  roundNumber: number;
  participantId?: string;
  participantIndex?: number;
  createdAt: Date;
  status: MessageStatus;
};

type PreSearchStatus = {
  roundNumber: number;
  status: 'pending' | 'streaming' | 'complete' | 'failed';
  searchData?: {
    query: string;
    results: unknown[];
  };
};

type ModeratorStatus = {
  roundNumber: number;
  status: 'pending' | 'streaming' | 'complete' | 'failed';
  data?: {
    leaderboard: unknown[];
    moderator: string;
  };
};

type RoundState = {
  roundNumber: number;
  status: 'pending' | 'pre_search' | 'streaming' | 'moderator' | 'complete' | 'error';
  userMessage?: Message;
  participantMessages: Message[];
  preSearch?: PreSearchStatus;
  moderator?: ModeratorStatus;
  startedAt: Date;
  completedAt?: Date;
};

type ConversationState = {
  threadId: string;
  currentRoundNumber: number;
  rounds: Map<number, RoundState>;
  participants: Participant[];
  isStreaming: boolean;
  currentParticipantIndex: number;
  enableWebSearch: boolean;
};

// Helper functions for simulating conversation flow
function createInitialState(threadId: string, participants: Participant[]): ConversationState {
  return {
    threadId,
    currentRoundNumber: 0,
    rounds: new Map(),
    participants,
    isStreaming: false,
    currentParticipantIndex: 0,
    enableWebSearch: false,
  };
}

function initializeRound(state: ConversationState, userMessage: Message): ConversationState {
  const roundNumber = state.currentRoundNumber;
  const round: RoundState = {
    roundNumber,
    status: 'pending',
    userMessage,
    participantMessages: [],
    startedAt: new Date(),
  };

  state.rounds.set(roundNumber, round);
  return state;
}

function startPreSearch(state: ConversationState, roundNumber: number): ConversationState {
  const round = state.rounds.get(roundNumber);
  if (!round)
    return state;

  round.status = 'pre_search';
  round.preSearch = {
    roundNumber,
    status: 'streaming',
  };

  return state;
}

function completePreSearch(
  state: ConversationState,
  roundNumber: number,
  searchData: PreSearchStatus['searchData'],
): ConversationState {
  const round = state.rounds.get(roundNumber);
  if (!round || !round.preSearch)
    return state;

  round.preSearch.status = 'complete';
  round.preSearch.searchData = searchData;

  return state;
}

function startParticipantStreaming(state: ConversationState, roundNumber: number): ConversationState {
  const round = state.rounds.get(roundNumber);
  if (!round)
    return state;

  round.status = 'streaming';
  state.isStreaming = true;
  state.currentParticipantIndex = 0;

  return state;
}

function addStreamingMessage(
  state: ConversationState,
  roundNumber: number,
  participantIndex: number,
  messageId: string,
): ConversationState {
  const round = state.rounds.get(roundNumber);
  const participant = state.participants[participantIndex];
  if (!round || !participant)
    return state;

  const message: Message = {
    id: messageId,
    role: UIMessageRoles.ASSISTANT,
    content: '',
    roundNumber,
    participantId: participant.id,
    participantIndex,
    createdAt: new Date(),
    status: 'streaming',
  };

  round.participantMessages.push(message);
  return state;
}

function appendToMessage(
  state: ConversationState,
  messageId: string,
  chunk: string,
): ConversationState {
  for (const round of state.rounds.values()) {
    const message = round.participantMessages.find(m => m.id === messageId);
    if (message) {
      message.content += chunk;
      break;
    }
  }
  return state;
}

function completeMessage(state: ConversationState, messageId: string): ConversationState {
  for (const round of state.rounds.values()) {
    const message = round.participantMessages.find(m => m.id === messageId);
    if (message) {
      message.status = 'complete';
      break;
    }
  }
  return state;
}

function advanceToNextParticipant(state: ConversationState): ConversationState {
  state.currentParticipantIndex++;
  return state;
}

function startModerator(state: ConversationState, roundNumber: number): ConversationState {
  const round = state.rounds.get(roundNumber);
  if (!round)
    return state;

  round.status = 'moderator';
  round.moderator = {
    roundNumber,
    status: 'streaming',
  };

  return state;
}

function completeModerator(
  state: ConversationState,
  roundNumber: number,
  data: ModeratorStatus['data'],
): ConversationState {
  const round = state.rounds.get(roundNumber);
  if (!round || !round.moderator)
    return state;

  round.moderator.status = 'complete';
  round.moderator.data = data;

  return state;
}

function completeRound(state: ConversationState, roundNumber: number): ConversationState {
  const round = state.rounds.get(roundNumber);
  if (!round)
    return state;

  round.status = 'complete';
  round.completedAt = new Date();
  state.isStreaming = false;
  state.currentRoundNumber++;

  return state;
}

function generateMessageId(threadId: string, roundNumber: number, participantIndex: number): string {
  return `${threadId}_r${roundNumber}_p${participantIndex}`;
}

describe('multi-Round Streaming Lifecycle', () => {
  const defaultParticipants: Participant[] = [
    { id: 'p1', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
    { id: 'p2', modelId: 'claude-3-opus', role: 'Critic', priority: 1, isEnabled: true },
    { id: 'p3', modelId: 'gemini-pro', role: 'Ideator', priority: 2, isEnabled: true },
  ];

  describe('round Initialization', () => {
    it('should initialize first round with correct state', () => {
      let state = createInitialState('thread-123', defaultParticipants);
      const userMessage: Message = {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'What is AI?',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      };

      state = initializeRound(state, userMessage);

      const round = state.rounds.get(0);
      expect(round).toBeDefined();
      expect(round?.roundNumber).toBe(0);
      expect(round?.status).toBe('pending');
      expect(round?.userMessage).toEqual(userMessage);
      expect(round?.participantMessages).toHaveLength(0);
    });

    it('should increment round number for subsequent rounds', () => {
      let state = createInitialState('thread-123', defaultParticipants);

      // Round 0
      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'First question',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });
      state = completeRound(state, 0);

      // Round 1
      state = initializeRound(state, {
        id: 'user-msg-2',
        role: UIMessageRoles.USER,
        content: 'Second question',
        roundNumber: 1,
        createdAt: new Date(),
        status: 'complete',
      });

      expect(state.currentRoundNumber).toBe(1);
      expect(state.rounds.size).toBe(2);
    });
  });

  describe('pre-Search Flow', () => {
    it('should block participant streaming until pre-search completes', () => {
      let state = createInitialState('thread-123', defaultParticipants);
      state.enableWebSearch = true;

      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'Search query',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });

      state = startPreSearch(state, 0);

      const round = state.rounds.get(0);
      expect(round?.status).toBe('pre_search');
      expect(round?.preSearch?.status).toBe('streaming');

      // Should not start streaming yet
      expect(state.isStreaming).toBe(false);
    });

    it('should allow participant streaming after pre-search completes', () => {
      let state = createInitialState('thread-123', defaultParticipants);
      state.enableWebSearch = true;

      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'Search query',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });

      state = startPreSearch(state, 0);
      state = completePreSearch(state, 0, {
        query: 'AI overview',
        results: [{ title: 'AI Article', url: 'https://example.com' }],
      });

      state = startParticipantStreaming(state, 0);

      const round = state.rounds.get(0);
      expect(round?.preSearch?.status).toBe('complete');
      expect(round?.status).toBe('streaming');
      expect(state.isStreaming).toBe(true);
    });

    it('should proceed without pre-search when web search disabled', () => {
      let state = createInitialState('thread-123', defaultParticipants);
      state.enableWebSearch = false;

      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'Question',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });

      // Skip pre-search, go directly to streaming
      state = startParticipantStreaming(state, 0);

      const round = state.rounds.get(0);
      expect(round?.preSearch).toBeUndefined();
      expect(round?.status).toBe('streaming');
    });
  });

  describe('sequential Participant Streaming', () => {
    it('should stream participants in priority order', () => {
      let state = createInitialState('thread-123', defaultParticipants);

      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'Question',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });

      state = startParticipantStreaming(state, 0);

      // First participant (index 0)
      expect(state.currentParticipantIndex).toBe(0);

      const msgId0 = generateMessageId('thread-123', 0, 0);
      state = addStreamingMessage(state, 0, 0, msgId0);
      state = appendToMessage(state, msgId0, 'Response from participant 0');
      state = completeMessage(state, msgId0);

      // Advance to second participant
      state = advanceToNextParticipant(state);
      expect(state.currentParticipantIndex).toBe(1);

      const msgId1 = generateMessageId('thread-123', 0, 1);
      state = addStreamingMessage(state, 0, 1, msgId1);
      state = appendToMessage(state, msgId1, 'Response from participant 1');
      state = completeMessage(state, msgId1);

      // Advance to third participant
      state = advanceToNextParticipant(state);
      expect(state.currentParticipantIndex).toBe(2);

      const msgId2 = generateMessageId('thread-123', 0, 2);
      state = addStreamingMessage(state, 0, 2, msgId2);
      state = appendToMessage(state, msgId2, 'Response from participant 2');
      state = completeMessage(state, msgId2);

      const round = state.rounds.get(0);
      expect(round?.participantMessages).toHaveLength(3);
      expect(round?.participantMessages[0].participantIndex).toBe(0);
      expect(round?.participantMessages[1].participantIndex).toBe(1);
      expect(round?.participantMessages[2].participantIndex).toBe(2);
    });

    it('should maintain correct message IDs for each participant', () => {
      let state = createInitialState('thread-abc', defaultParticipants);

      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'Question',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });

      state = startParticipantStreaming(state, 0);

      // Add all participants
      for (let i = 0; i < 3; i++) {
        const msgId = generateMessageId('thread-abc', 0, i);
        state = addStreamingMessage(state, 0, i, msgId);
        state = completeMessage(state, msgId);
        if (i < 2)
          state = advanceToNextParticipant(state);
      }

      const round = state.rounds.get(0);
      expect(round?.participantMessages[0].id).toBe('thread-abc_r0_p0');
      expect(round?.participantMessages[1].id).toBe('thread-abc_r0_p1');
      expect(round?.participantMessages[2].id).toBe('thread-abc_r0_p2');
    });

    it('should accumulate content during streaming', () => {
      let state = createInitialState('thread-123', defaultParticipants);

      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'Question',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });

      state = startParticipantStreaming(state, 0);

      const msgId = generateMessageId('thread-123', 0, 0);
      state = addStreamingMessage(state, 0, 0, msgId);

      // Simulate chunk-by-chunk streaming
      state = appendToMessage(state, msgId, 'Hello ');
      state = appendToMessage(state, msgId, 'world ');
      state = appendToMessage(state, msgId, 'from AI!');

      const round = state.rounds.get(0);
      const message = round?.participantMessages[0];
      expect(message?.content).toBe('Hello world from AI!');
      expect(message?.status).toBe('streaming');

      state = completeMessage(state, msgId);
      expect(round?.participantMessages[0].status).toBe('complete');
    });
  });

  describe('moderator Phase', () => {
    it('should trigger moderator after all participants complete', () => {
      let state = createInitialState('thread-123', defaultParticipants);

      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'Question',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });

      state = startParticipantStreaming(state, 0);

      // Complete all participants
      for (let i = 0; i < 3; i++) {
        const msgId = generateMessageId('thread-123', 0, i);
        state = addStreamingMessage(state, 0, i, msgId);
        state = appendToMessage(state, msgId, `Response ${i}`);
        state = completeMessage(state, msgId);
        if (i < 2)
          state = advanceToNextParticipant(state);
      }

      // Start moderator
      state = startModerator(state, 0);

      const round = state.rounds.get(0);
      expect(round?.status).toBe('moderator');
      expect(round?.moderator?.status).toBe('streaming');
    });

    it('should complete round after moderator finishes', () => {
      let state = createInitialState('thread-123', defaultParticipants);

      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'Question',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });

      state = startParticipantStreaming(state, 0);

      // Complete all participants
      for (let i = 0; i < 3; i++) {
        const msgId = generateMessageId('thread-123', 0, i);
        state = addStreamingMessage(state, 0, i, msgId);
        state = completeMessage(state, msgId);
        if (i < 2)
          state = advanceToNextParticipant(state);
      }

      state = startModerator(state, 0);
      state = completeModerator(state, 0, {
        leaderboard: [{ participantId: 'p1', score: 9 }],
        moderator: 'Great discussion',
      });
      state = completeRound(state, 0);

      const round = state.rounds.get(0);
      expect(round?.status).toBe('complete');
      expect(round?.moderator?.status).toBe('complete');
      expect(round?.completedAt).toBeDefined();
      expect(state.isStreaming).toBe(false);
    });
  });

  describe('multi-Round Transitions', () => {
    it('should maintain state across multiple rounds', () => {
      let state = createInitialState('thread-123', defaultParticipants);

      // Complete Round 0
      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'First question',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });
      state = startParticipantStreaming(state, 0);
      for (let i = 0; i < 3; i++) {
        const msgId = generateMessageId('thread-123', 0, i);
        state = addStreamingMessage(state, 0, i, msgId);
        state = completeMessage(state, msgId);
        if (i < 2)
          state = advanceToNextParticipant(state);
      }
      state = startModerator(state, 0);
      state = completeModerator(state, 0, { leaderboard: [], moderator: 'R0' });
      state = completeRound(state, 0);

      // Complete Round 1
      state = initializeRound(state, {
        id: 'user-msg-2',
        role: UIMessageRoles.USER,
        content: 'Second question',
        roundNumber: 1,
        createdAt: new Date(),
        status: 'complete',
      });
      state = startParticipantStreaming(state, 1);
      for (let i = 0; i < 3; i++) {
        const msgId = generateMessageId('thread-123', 1, i);
        state = addStreamingMessage(state, 1, i, msgId);
        state = completeMessage(state, msgId);
        if (i < 2)
          state = advanceToNextParticipant(state);
      }
      state = startModerator(state, 1);
      state = completeModerator(state, 1, { leaderboard: [], moderator: 'R1' });
      state = completeRound(state, 1);

      // Complete Round 2
      state = initializeRound(state, {
        id: 'user-msg-3',
        role: UIMessageRoles.USER,
        content: 'Third question',
        roundNumber: 2,
        createdAt: new Date(),
        status: 'complete',
      });
      state = startParticipantStreaming(state, 2);
      for (let i = 0; i < 3; i++) {
        const msgId = generateMessageId('thread-123', 2, i);
        state = addStreamingMessage(state, 2, i, msgId);
        state = completeMessage(state, msgId);
        if (i < 2)
          state = advanceToNextParticipant(state);
      }
      state = startModerator(state, 2);
      state = completeModerator(state, 2, { leaderboard: [], moderator: 'R2' });
      state = completeRound(state, 2);

      // Verify all rounds exist and are complete
      expect(state.rounds.size).toBe(3);
      expect(state.currentRoundNumber).toBe(3);

      for (let r = 0; r < 3; r++) {
        const round = state.rounds.get(r);
        expect(round?.status).toBe('complete');
        expect(round?.participantMessages).toHaveLength(3);
        expect(round?.moderator?.status).toBe('complete');
      }
    });

    it('should preserve previous round data when starting new round', () => {
      let state = createInitialState('thread-123', defaultParticipants);

      // Complete Round 0 with specific content
      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'What is machine learning?',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });
      state = startParticipantStreaming(state, 0);

      const msgId0 = generateMessageId('thread-123', 0, 0);
      state = addStreamingMessage(state, 0, 0, msgId0);
      state = appendToMessage(state, msgId0, 'ML is a subset of AI...');
      state = completeMessage(state, msgId0);
      state = advanceToNextParticipant(state);

      const msgId1 = generateMessageId('thread-123', 0, 1);
      state = addStreamingMessage(state, 0, 1, msgId1);
      state = appendToMessage(state, msgId1, 'ML enables computers...');
      state = completeMessage(state, msgId1);
      state = advanceToNextParticipant(state);

      const msgId2 = generateMessageId('thread-123', 0, 2);
      state = addStreamingMessage(state, 0, 2, msgId2);
      state = appendToMessage(state, msgId2, 'Key concepts include...');
      state = completeMessage(state, msgId2);

      state = startModerator(state, 0);
      state = completeModerator(state, 0, { leaderboard: [], moderator: 'Good overview' });
      state = completeRound(state, 0);

      // Start Round 1
      state = initializeRound(state, {
        id: 'user-msg-2',
        role: UIMessageRoles.USER,
        content: 'What about deep learning?',
        roundNumber: 1,
        createdAt: new Date(),
        status: 'complete',
      });

      // Verify Round 0 data is preserved
      const round0 = state.rounds.get(0);
      expect(round0?.userMessage?.content).toBe('What is machine learning?');
      expect(round0?.participantMessages[0].content).toBe('ML is a subset of AI...');
      expect(round0?.participantMessages[1].content).toBe('ML enables computers...');
      expect(round0?.participantMessages[2].content).toBe('Key concepts include...');
    });

    it('should correctly number messages across rounds', () => {
      let state = createInitialState('thread-123', defaultParticipants);

      // Round 0
      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'Q1',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });
      state = startParticipantStreaming(state, 0);
      for (let i = 0; i < 3; i++) {
        const msgId = generateMessageId('thread-123', 0, i);
        state = addStreamingMessage(state, 0, i, msgId);
        state = completeMessage(state, msgId);
        if (i < 2)
          state = advanceToNextParticipant(state);
      }
      state = completeRound(state, 0);

      // Round 1
      state = initializeRound(state, {
        id: 'user-msg-2',
        role: UIMessageRoles.USER,
        content: 'Q2',
        roundNumber: 1,
        createdAt: new Date(),
        status: 'complete',
      });
      state = startParticipantStreaming(state, 1);
      for (let i = 0; i < 3; i++) {
        const msgId = generateMessageId('thread-123', 1, i);
        state = addStreamingMessage(state, 1, i, msgId);
        state = completeMessage(state, msgId);
        if (i < 2)
          state = advanceToNextParticipant(state);
      }

      // Verify message IDs follow round pattern
      const round0 = state.rounds.get(0);
      const round1 = state.rounds.get(1);

      expect(round0?.participantMessages.map(m => m.id)).toEqual([
        'thread-123_r0_p0',
        'thread-123_r0_p1',
        'thread-123_r0_p2',
      ]);
      expect(round1?.participantMessages.map(m => m.id)).toEqual([
        'thread-123_r1_p0',
        'thread-123_r1_p1',
        'thread-123_r1_p2',
      ]);
    });
  });

  describe('error Handling', () => {
    it('should handle participant failure mid-round', () => {
      let state = createInitialState('thread-123', defaultParticipants);

      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'Question',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });

      state = startParticipantStreaming(state, 0);

      // First participant succeeds
      const msgId0 = generateMessageId('thread-123', 0, 0);
      state = addStreamingMessage(state, 0, 0, msgId0);
      state = appendToMessage(state, msgId0, 'Success');
      state = completeMessage(state, msgId0);
      state = advanceToNextParticipant(state);

      // Second participant fails
      const msgId1 = generateMessageId('thread-123', 0, 1);
      state = addStreamingMessage(state, 0, 1, msgId1);
      const round = state.rounds.get(0);
      const failedMsg = round?.participantMessages.find(m => m.id === msgId1);
      if (failedMsg) {
        failedMsg.status = 'error';
        failedMsg.content = 'Error: Rate limit exceeded';
      }

      // Verify state
      expect(round?.participantMessages[0].status).toBe('complete');
      expect(round?.participantMessages[1].status).toBe('error');
    });

    it('should allow round completion with partial results', () => {
      let state = createInitialState('thread-123', defaultParticipants);

      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'Question',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });

      state = startParticipantStreaming(state, 0);

      // Only first two participants respond
      for (let i = 0; i < 2; i++) {
        const msgId = generateMessageId('thread-123', 0, i);
        state = addStreamingMessage(state, 0, i, msgId);
        state = completeMessage(state, msgId);
        state = advanceToNextParticipant(state);
      }

      // Third participant fails, round still completes
      state = startModerator(state, 0);
      state = completeModerator(state, 0, { leaderboard: [], moderator: 'Partial' });
      state = completeRound(state, 0);

      const round = state.rounds.get(0);
      expect(round?.status).toBe('complete');
      expect(round?.participantMessages).toHaveLength(2);
    });
  });

  describe('stop Button Behavior', () => {
    function stopStreaming(state: ConversationState, roundNumber: number): ConversationState {
      state.isStreaming = false;
      const round = state.rounds.get(roundNumber);
      if (round) {
        // Mark any streaming messages as complete with current content
        round.participantMessages.forEach((msg) => {
          if (msg.status === 'streaming') {
            msg.status = 'complete';
          }
        });
      }
      return state;
    }

    it('should stop streaming immediately when stop button clicked', () => {
      let state = createInitialState('thread-123', defaultParticipants);

      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'Question',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });

      state = startParticipantStreaming(state, 0);

      // First participant starts streaming
      const msgId0 = generateMessageId('thread-123', 0, 0);
      state = addStreamingMessage(state, 0, 0, msgId0);
      state = appendToMessage(state, msgId0, 'Partial response...');

      expect(state.isStreaming).toBe(true);

      // User clicks stop
      state = stopStreaming(state, 0);

      expect(state.isStreaming).toBe(false);
      const round = state.rounds.get(0);
      expect(round?.participantMessages[0].status).toBe('complete');
      expect(round?.participantMessages[0].content).toBe('Partial response...');
    });

    it('should prevent remaining participants from streaming after stop', () => {
      let state = createInitialState('thread-123', defaultParticipants);

      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'Question',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });

      state = startParticipantStreaming(state, 0);

      // First participant completes
      const msgId0 = generateMessageId('thread-123', 0, 0);
      state = addStreamingMessage(state, 0, 0, msgId0);
      state = completeMessage(state, msgId0);
      state = advanceToNextParticipant(state);

      // Stop during second participant
      state = stopStreaming(state, 0);

      const round = state.rounds.get(0);
      // Only first participant's message exists
      expect(round?.participantMessages).toHaveLength(1);
      expect(state.currentParticipantIndex).toBe(1);
      expect(state.isStreaming).toBe(false);
    });
  });

  describe('web Search Toggle Between Rounds', () => {
    it('should handle enabling web search mid-conversation', () => {
      let state = createInitialState('thread-123', defaultParticipants);
      state.enableWebSearch = false;

      // Round 0 without web search
      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'First question',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });
      state = startParticipantStreaming(state, 0);
      const msgId0 = generateMessageId('thread-123', 0, 0);
      state = addStreamingMessage(state, 0, 0, msgId0);
      state = completeMessage(state, msgId0);
      state = completeRound(state, 0);

      const round0 = state.rounds.get(0);
      expect(round0?.preSearch).toBeUndefined();

      // Enable web search before Round 1
      state.enableWebSearch = true;

      // Round 1 with web search
      state = initializeRound(state, {
        id: 'user-msg-2',
        role: UIMessageRoles.USER,
        content: 'Search-enabled question',
        roundNumber: 1,
        createdAt: new Date(),
        status: 'complete',
      });
      state = startPreSearch(state, 1);
      state = completePreSearch(state, 1, {
        query: 'search query',
        results: [],
      });
      state = startParticipantStreaming(state, 1);

      const round1 = state.rounds.get(1);
      expect(round1?.preSearch).toBeDefined();
      expect(round1?.preSearch?.status).toBe('complete');
    });

    it('should handle disabling web search mid-conversation', () => {
      let state = createInitialState('thread-123', defaultParticipants);
      state.enableWebSearch = true;

      // Round 0 with web search
      state = initializeRound(state, {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        content: 'First question',
        roundNumber: 0,
        createdAt: new Date(),
        status: 'complete',
      });
      state = startPreSearch(state, 0);
      state = completePreSearch(state, 0, { query: 'q', results: [] });
      state = startParticipantStreaming(state, 0);
      const msgId0 = generateMessageId('thread-123', 0, 0);
      state = addStreamingMessage(state, 0, 0, msgId0);
      state = completeMessage(state, msgId0);
      state = completeRound(state, 0);

      const round0 = state.rounds.get(0);
      expect(round0?.preSearch).toBeDefined();

      // Disable web search before Round 1
      state.enableWebSearch = false;

      // Round 1 without web search
      state = initializeRound(state, {
        id: 'user-msg-2',
        role: UIMessageRoles.USER,
        content: 'No search question',
        roundNumber: 1,
        createdAt: new Date(),
        status: 'complete',
      });
      state = startParticipantStreaming(state, 1);

      const round1 = state.rounds.get(1);
      expect(round1?.preSearch).toBeUndefined();
    });
  });

  describe('deterministic Message ID Generation', () => {
    it('should generate consistent message IDs', () => {
      const threadId = 'thread-xyz-123';
      const roundNumber = 5;
      const participantIndex = 2;

      const messageId = generateMessageId(threadId, roundNumber, participantIndex);

      expect(messageId).toBe('thread-xyz-123_r5_p2');
    });

    it('should guarantee uniqueness across thread/round/participant', () => {
      const ids = new Set<string>();

      for (let thread = 0; thread < 3; thread++) {
        for (let round = 0; round < 5; round++) {
          for (let participant = 0; participant < 4; participant++) {
            const id = generateMessageId(`thread-${thread}`, round, participant);
            ids.add(id);
          }
        }
      }

      // 3 threads * 5 rounds * 4 participants = 60 unique IDs
      expect(ids.size).toBe(60);
    });

    it('should allow parsing message ID back to components', () => {
      const messageId = 'thread-abc_r3_p1';
      const match = messageId.match(/^(.+)_r(\d+)_p(\d+)$/);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('thread-abc');
      expect(Number.parseInt(match![2])).toBe(3);
      expect(Number.parseInt(match![3])).toBe(1);
    });
  });
});

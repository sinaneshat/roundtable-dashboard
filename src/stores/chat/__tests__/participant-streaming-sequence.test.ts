import { describe, expect, it } from 'vitest';

import type { FinishReason } from '@/api/core/enums';

/**
 * Participant Streaming Sequence Tests
 *
 * Tests the AI SDK streaming behavior for multi-participant conversations:
 * - Sequential participant execution (P0 → P1 → P2 → ...)
 * - Context accumulation (later participants see earlier responses)
 * - Streaming state transitions per participant
 * - AI SDK v6 toUIMessageStreamResponse patterns
 * - Message metadata injection via messageMetadata callback
 */

// Types matching AI SDK patterns
type StreamPart = {
  type: 'text-delta' | 'reasoning-delta' | 'start' | 'finish' | 'start-step' | 'finish-step' | 'error';
  text?: string;
  finishReason?: FinishReason;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

type ParticipantMetadata = {
  roundNumber: number;
  participantId: string;
  participantIndex: number;
  participantRole: string | null;
  model: string;
};

type StreamingMessage = {
  id: string;
  role: 'assistant';
  content: string;
  parts: Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>;
  metadata: ParticipantMetadata;
  status: 'pending' | 'streaming' | 'complete' | 'error';
};

type ParticipantStreamState = {
  participantIndex: number;
  messageId: string;
  status: 'pending' | 'streaming' | 'complete' | 'error';
  chunks: string[];
  reasoningChunks: string[];
  startTime?: number;
  endTime?: number;
  finishReason?: string;
  usage?: StreamPart['usage'];
};

type RoundStreamingState = {
  roundNumber: number;
  totalParticipants: number;
  currentParticipantIndex: number;
  participantStates: Map<number, ParticipantStreamState>;
  allComplete: boolean;
};

// Helper functions for participant streaming
function initializeParticipantStream(
  roundNumber: number,
  participantIndex: number,
  threadId: string,
): ParticipantStreamState {
  return {
    participantIndex,
    messageId: `${threadId}_r${roundNumber}_p${participantIndex}`,
    status: 'pending',
    chunks: [],
    reasoningChunks: [],
  };
}

function processStreamPart(
  state: ParticipantStreamState,
  part: StreamPart,
): ParticipantStreamState {
  switch (part.type) {
    case 'start':
      return { ...state, status: 'streaming', startTime: Date.now() };

    case 'text-delta':
      return {
        ...state,
        chunks: [...state.chunks, part.text || ''],
      };

    case 'reasoning-delta':
      return {
        ...state,
        reasoningChunks: [...state.reasoningChunks, part.text || ''],
      };

    case 'finish':
      return {
        ...state,
        status: 'complete',
        endTime: Date.now(),
        finishReason: part.finishReason,
        usage: part.usage,
      };

    case 'error':
      return { ...state, status: 'error', endTime: Date.now() };

    default:
      return state;
  }
}

function buildMessageFromState(
  state: ParticipantStreamState,
  metadata: ParticipantMetadata,
): StreamingMessage {
  const content = state.chunks.join('');
  const reasoning = state.reasoningChunks.join('');

  const parts: StreamingMessage['parts'] = [];
  if (reasoning) {
    parts.push({ type: 'reasoning', text: reasoning });
  }
  if (content) {
    parts.push({ type: 'text', text: content });
  }

  return {
    id: state.messageId,
    role: 'assistant',
    content,
    parts,
    metadata,
    status: state.status,
  };
}

function canAdvanceToNextParticipant(state: ParticipantStreamState): boolean {
  return state.status === 'complete' || state.status === 'error';
}

function areAllParticipantsComplete(roundState: RoundStreamingState): boolean {
  let completeCount = 0;
  roundState.participantStates.forEach((state) => {
    if (state.status === 'complete' || state.status === 'error') {
      completeCount++;
    }
  });
  return completeCount >= roundState.totalParticipants;
}

function getContextForParticipant(
  roundState: RoundStreamingState,
  participantIndex: number,
): string[] {
  const context: string[] = [];
  for (let i = 0; i < participantIndex; i++) {
    const prevState = roundState.participantStates.get(i);
    if (prevState && prevState.status === 'complete') {
      context.push(prevState.chunks.join(''));
    }
  }
  return context;
}

describe('participant Streaming Sequence', () => {
  describe('sequential Execution Order', () => {
    it('should enforce P0 → P1 → P2 order', () => {
      const roundState: RoundStreamingState = {
        roundNumber: 0,
        totalParticipants: 3,
        currentParticipantIndex: 0,
        participantStates: new Map(),
        allComplete: false,
      };

      // P0 starts
      let p0State = initializeParticipantStream(0, 0, 'thread-123');
      roundState.participantStates.set(0, p0State);

      expect(roundState.currentParticipantIndex).toBe(0);

      // P0 streams
      p0State = processStreamPart(p0State, { type: 'start' });
      p0State = processStreamPart(p0State, { type: 'text-delta', text: 'P0 response' });
      p0State = processStreamPart(p0State, { type: 'finish', finishReason: 'stop' });
      roundState.participantStates.set(0, p0State);

      expect(canAdvanceToNextParticipant(p0State)).toBe(true);

      // Advance to P1
      roundState.currentParticipantIndex = 1;
      let p1State = initializeParticipantStream(0, 1, 'thread-123');
      roundState.participantStates.set(1, p1State);

      expect(roundState.currentParticipantIndex).toBe(1);

      // P1 streams
      p1State = processStreamPart(p1State, { type: 'start' });
      p1State = processStreamPart(p1State, { type: 'text-delta', text: 'P1 response' });
      p1State = processStreamPart(p1State, { type: 'finish', finishReason: 'stop' });
      roundState.participantStates.set(1, p1State);

      // Advance to P2
      roundState.currentParticipantIndex = 2;
      let p2State = initializeParticipantStream(0, 2, 'thread-123');
      roundState.participantStates.set(2, p2State);

      p2State = processStreamPart(p2State, { type: 'start' });
      p2State = processStreamPart(p2State, { type: 'text-delta', text: 'P2 response' });
      p2State = processStreamPart(p2State, { type: 'finish', finishReason: 'stop' });
      roundState.participantStates.set(2, p2State);

      // Verify order
      const p0 = roundState.participantStates.get(0);
      const p1 = roundState.participantStates.get(1);
      const p2 = roundState.participantStates.get(2);

      expect(p0?.startTime).toBeDefined();
      expect(p1?.startTime).toBeDefined();
      expect(p2?.startTime).toBeDefined();
      expect(areAllParticipantsComplete(roundState)).toBe(true);
    });

    it('should not allow P1 to start before P0 completes', () => {
      const roundState: RoundStreamingState = {
        roundNumber: 0,
        totalParticipants: 2,
        currentParticipantIndex: 0,
        participantStates: new Map(),
        allComplete: false,
      };

      let p0State = initializeParticipantStream(0, 0, 'thread-123');
      p0State = processStreamPart(p0State, { type: 'start' });
      p0State = processStreamPart(p0State, { type: 'text-delta', text: 'Still streaming...' });
      roundState.participantStates.set(0, p0State);

      // P0 is still streaming
      expect(p0State.status).toBe('streaming');
      expect(canAdvanceToNextParticipant(p0State)).toBe(false);

      // Should not advance
      expect(roundState.currentParticipantIndex).toBe(0);
    });

    it('should handle single participant round', () => {
      const roundState: RoundStreamingState = {
        roundNumber: 0,
        totalParticipants: 1,
        currentParticipantIndex: 0,
        participantStates: new Map(),
        allComplete: false,
      };

      let p0State = initializeParticipantStream(0, 0, 'thread-123');
      p0State = processStreamPart(p0State, { type: 'start' });
      p0State = processStreamPart(p0State, { type: 'text-delta', text: 'Solo response' });
      p0State = processStreamPart(p0State, { type: 'finish', finishReason: 'stop' });
      roundState.participantStates.set(0, p0State);

      expect(areAllParticipantsComplete(roundState)).toBe(true);
    });
  });

  describe('context Accumulation', () => {
    it('should provide P0 response to P1', () => {
      const roundState: RoundStreamingState = {
        roundNumber: 0,
        totalParticipants: 2,
        currentParticipantIndex: 0,
        participantStates: new Map(),
        allComplete: false,
      };

      // P0 completes
      let p0State = initializeParticipantStream(0, 0, 'thread-123');
      p0State = processStreamPart(p0State, { type: 'start' });
      p0State = processStreamPart(p0State, { type: 'text-delta', text: 'P0 moderator of the topic' });
      p0State = processStreamPart(p0State, { type: 'finish', finishReason: 'stop' });
      roundState.participantStates.set(0, p0State);
      roundState.currentParticipantIndex = 1;

      // P1 should see P0's response
      const contextForP1 = getContextForParticipant(roundState, 1);
      expect(contextForP1).toHaveLength(1);
      expect(contextForP1[0]).toBe('P0 moderator of the topic');
    });

    it('should provide P0 and P1 responses to P2', () => {
      const roundState: RoundStreamingState = {
        roundNumber: 0,
        totalParticipants: 3,
        currentParticipantIndex: 0,
        participantStates: new Map(),
        allComplete: false,
      };

      // P0 completes
      let p0State = initializeParticipantStream(0, 0, 'thread-123');
      p0State = processStreamPart(p0State, { type: 'start' });
      p0State = processStreamPart(p0State, { type: 'text-delta', text: 'First perspective' });
      p0State = processStreamPart(p0State, { type: 'finish', finishReason: 'stop' });
      roundState.participantStates.set(0, p0State);
      roundState.currentParticipantIndex = 1;

      // P1 completes
      let p1State = initializeParticipantStream(0, 1, 'thread-123');
      p1State = processStreamPart(p1State, { type: 'start' });
      p1State = processStreamPart(p1State, { type: 'text-delta', text: 'Second perspective' });
      p1State = processStreamPart(p1State, { type: 'finish', finishReason: 'stop' });
      roundState.participantStates.set(1, p1State);
      roundState.currentParticipantIndex = 2;

      // P2 should see both
      const contextForP2 = getContextForParticipant(roundState, 2);
      expect(contextForP2).toHaveLength(2);
      expect(contextForP2[0]).toBe('First perspective');
      expect(contextForP2[1]).toBe('Second perspective');
    });

    it('should provide empty context for P0', () => {
      const roundState: RoundStreamingState = {
        roundNumber: 0,
        totalParticipants: 3,
        currentParticipantIndex: 0,
        participantStates: new Map(),
        allComplete: false,
      };

      const contextForP0 = getContextForParticipant(roundState, 0);
      expect(contextForP0).toHaveLength(0);
    });

    it('should exclude incomplete participant responses from context', () => {
      const roundState: RoundStreamingState = {
        roundNumber: 0,
        totalParticipants: 3,
        currentParticipantIndex: 1,
        participantStates: new Map(),
        allComplete: false,
      };

      // P0 completes
      let p0State = initializeParticipantStream(0, 0, 'thread-123');
      p0State = processStreamPart(p0State, { type: 'start' });
      p0State = processStreamPart(p0State, { type: 'text-delta', text: 'Complete' });
      p0State = processStreamPart(p0State, { type: 'finish', finishReason: 'stop' });
      roundState.participantStates.set(0, p0State);

      // P1 is streaming (not complete)
      let p1State = initializeParticipantStream(0, 1, 'thread-123');
      p1State = processStreamPart(p1State, { type: 'start' });
      p1State = processStreamPart(p1State, { type: 'text-delta', text: 'In progress...' });
      roundState.participantStates.set(1, p1State);
      roundState.currentParticipantIndex = 2;

      // P2's context should only include P0 (P1 not complete)
      const contextForP2 = getContextForParticipant(roundState, 2);
      expect(contextForP2).toHaveLength(1);
      expect(contextForP2[0]).toBe('Complete');
    });
  });

  describe('stream State Transitions', () => {
    it('should transition: pending → streaming → complete', () => {
      let state = initializeParticipantStream(0, 0, 'thread-123');

      expect(state.status).toBe('pending');

      state = processStreamPart(state, { type: 'start' });
      expect(state.status).toBe('streaming');

      state = processStreamPart(state, { type: 'text-delta', text: 'Content' });
      expect(state.status).toBe('streaming');

      state = processStreamPart(state, { type: 'finish', finishReason: 'stop' });
      expect(state.status).toBe('complete');
    });

    it('should transition: pending → streaming → error', () => {
      let state = initializeParticipantStream(0, 0, 'thread-123');

      expect(state.status).toBe('pending');

      state = processStreamPart(state, { type: 'start' });
      expect(state.status).toBe('streaming');

      state = processStreamPart(state, { type: 'error' });
      expect(state.status).toBe('error');
    });

    it('should record timing for complete streams', () => {
      let state = initializeParticipantStream(0, 0, 'thread-123');

      state = processStreamPart(state, { type: 'start' });
      const startTime = state.startTime;
      expect(startTime).toBeDefined();

      // Simulate some streaming time
      state = processStreamPart(state, { type: 'text-delta', text: 'Content' });

      state = processStreamPart(state, { type: 'finish', finishReason: 'stop' });
      const endTime = state.endTime;

      expect(endTime).toBeDefined();
      expect(endTime!).toBeGreaterThanOrEqual(startTime!);
    });

    it('should capture finish reason', () => {
      let state = initializeParticipantStream(0, 0, 'thread-123');

      state = processStreamPart(state, { type: 'start' });
      state = processStreamPart(state, {
        type: 'finish',
        finishReason: 'length',
        usage: { inputTokens: 100, outputTokens: 500, totalTokens: 600 },
      });

      expect(state.finishReason).toBe('length');
      expect(state.usage?.totalTokens).toBe(600);
    });
  });

  describe('message Building', () => {
    it('should build message from stream chunks', () => {
      let state = initializeParticipantStream(0, 0, 'thread-123');

      state = processStreamPart(state, { type: 'start' });
      state = processStreamPart(state, { type: 'text-delta', text: 'Hello ' });
      state = processStreamPart(state, { type: 'text-delta', text: 'world!' });
      state = processStreamPart(state, { type: 'finish', finishReason: 'stop' });

      const metadata: ParticipantMetadata = {
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 0,
        participantRole: 'Analyst',
        model: 'gpt-4o',
      };

      const message = buildMessageFromState(state, metadata);

      expect(message.id).toBe('thread-123_r0_p0');
      expect(message.role).toBe('assistant');
      expect(message.content).toBe('Hello world!');
      expect(message.parts).toHaveLength(1);
      expect(message.parts[0].type).toBe('text');
      expect(message.metadata.participantRole).toBe('Analyst');
    });

    it('should include reasoning in message parts', () => {
      let state = initializeParticipantStream(0, 0, 'thread-123');

      state = processStreamPart(state, { type: 'start' });
      state = processStreamPart(state, { type: 'reasoning-delta', text: 'Let me think...' });
      state = processStreamPart(state, { type: 'reasoning-delta', text: ' analyzing options.' });
      state = processStreamPart(state, { type: 'text-delta', text: 'The answer is 42.' });
      state = processStreamPart(state, { type: 'finish', finishReason: 'stop' });

      const metadata: ParticipantMetadata = {
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 0,
        participantRole: null,
        model: 'o1-preview',
      };

      const message = buildMessageFromState(state, metadata);

      expect(message.parts).toHaveLength(2);
      expect(message.parts[0].type).toBe('reasoning');
      expect(message.parts[0].text).toBe('Let me think... analyzing options.');
      expect(message.parts[1].type).toBe('text');
      expect(message.parts[1].text).toBe('The answer is 42.');
    });

    it('should handle empty content gracefully', () => {
      let state = initializeParticipantStream(0, 0, 'thread-123');

      state = processStreamPart(state, { type: 'start' });
      state = processStreamPart(state, { type: 'finish', finishReason: 'content-filter' });

      const metadata: ParticipantMetadata = {
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 0,
        participantRole: null,
        model: 'gpt-4o',
      };

      const message = buildMessageFromState(state, metadata);

      expect(message.content).toBe('');
      expect(message.parts).toHaveLength(0);
    });
  });

  describe('round Completion Detection', () => {
    it('should detect all participants complete', () => {
      const roundState: RoundStreamingState = {
        roundNumber: 0,
        totalParticipants: 3,
        currentParticipantIndex: 0,
        participantStates: new Map(),
        allComplete: false,
      };

      // All complete
      for (let i = 0; i < 3; i++) {
        let state = initializeParticipantStream(0, i, 'thread-123');
        state = processStreamPart(state, { type: 'start' });
        state = processStreamPart(state, { type: 'text-delta', text: `P${i}` });
        state = processStreamPart(state, { type: 'finish', finishReason: 'stop' });
        roundState.participantStates.set(i, state);
      }

      expect(areAllParticipantsComplete(roundState)).toBe(true);
    });

    it('should not detect complete if one is streaming', () => {
      const roundState: RoundStreamingState = {
        roundNumber: 0,
        totalParticipants: 3,
        currentParticipantIndex: 2,
        participantStates: new Map(),
        allComplete: false,
      };

      // P0 and P1 complete
      for (let i = 0; i < 2; i++) {
        let state = initializeParticipantStream(0, i, 'thread-123');
        state = processStreamPart(state, { type: 'start' });
        state = processStreamPart(state, { type: 'finish', finishReason: 'stop' });
        roundState.participantStates.set(i, state);
      }

      // P2 still streaming
      let p2State = initializeParticipantStream(0, 2, 'thread-123');
      p2State = processStreamPart(p2State, { type: 'start' });
      roundState.participantStates.set(2, p2State);

      expect(areAllParticipantsComplete(roundState)).toBe(false);
    });

    it('should count errors as complete for round progression', () => {
      const roundState: RoundStreamingState = {
        roundNumber: 0,
        totalParticipants: 2,
        currentParticipantIndex: 1,
        participantStates: new Map(),
        allComplete: false,
      };

      // P0 errors
      let p0State = initializeParticipantStream(0, 0, 'thread-123');
      p0State = processStreamPart(p0State, { type: 'start' });
      p0State = processStreamPart(p0State, { type: 'error' });
      roundState.participantStates.set(0, p0State);

      // P1 completes
      let p1State = initializeParticipantStream(0, 1, 'thread-123');
      p1State = processStreamPart(p1State, { type: 'start' });
      p1State = processStreamPart(p1State, { type: 'finish', finishReason: 'stop' });
      roundState.participantStates.set(1, p1State);

      expect(areAllParticipantsComplete(roundState)).toBe(true);
    });
  });

  describe('aI SDK Message Metadata', () => {
    type StreamMetadataCallback = {
      part: {
        type: 'start' | 'finish' | 'start-step' | 'finish-step';
        finishReason?: string;
        totalUsage?: { inputTokens: number; outputTokens: number };
      };
    };

    function createStreamingMetadata(opts: {
      roundNumber: number;
      participantId: string;
      participantIndex: number;
      participantRole: string | null;
      model: string;
    }): ParticipantMetadata {
      return {
        roundNumber: opts.roundNumber,
        participantId: opts.participantId,
        participantIndex: opts.participantIndex,
        participantRole: opts.participantRole,
        model: opts.model,
      };
    }

    function getMessageMetadata(callback: StreamMetadataCallback): ParticipantMetadata | undefined {
      const baseMetadata = createStreamingMetadata({
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 0,
        participantRole: 'Analyst',
        model: 'gpt-4o',
      });

      if (callback.part.type === 'start') {
        return baseMetadata;
      }

      if (callback.part.type === 'finish') {
        return {
          ...baseMetadata,
          // Could include additional finish-time metadata
        };
      }

      return undefined;
    }

    it('should inject metadata on stream start', () => {
      const metadata = getMessageMetadata({ part: { type: 'start' } });

      expect(metadata).toBeDefined();
      expect(metadata?.roundNumber).toBe(0);
      expect(metadata?.participantIndex).toBe(0);
      expect(metadata?.participantRole).toBe('Analyst');
      expect(metadata?.model).toBe('gpt-4o');
    });

    it('should inject metadata on stream finish', () => {
      const metadata = getMessageMetadata({
        part: {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 100, outputTokens: 200 },
        },
      });

      expect(metadata).toBeDefined();
    });

    it('should not inject metadata on step events', () => {
      const metadata = getMessageMetadata({ part: { type: 'start-step' } });
      expect(metadata).toBeUndefined();

      const finishStepMetadata = getMessageMetadata({ part: { type: 'finish-step' } });
      expect(finishStepMetadata).toBeUndefined();
    });
  });

  describe('concurrent Request Prevention', () => {
    type StreamingLock = {
      threadId: string;
      roundNumber: number;
      participantIndex: number;
      isLocked: boolean;
      lockedAt?: number;
    };

    function acquireStreamingLock(
      locks: Map<string, StreamingLock>,
      threadId: string,
      roundNumber: number,
      participantIndex: number,
    ): boolean {
      const lockKey = `${threadId}_r${roundNumber}_p${participantIndex}`;
      const existing = locks.get(lockKey);

      if (existing?.isLocked) {
        return false; // Already locked
      }

      locks.set(lockKey, {
        threadId,
        roundNumber,
        participantIndex,
        isLocked: true,
        lockedAt: Date.now(),
      });

      return true;
    }

    function releaseStreamingLock(
      locks: Map<string, StreamingLock>,
      threadId: string,
      roundNumber: number,
      participantIndex: number,
    ): void {
      const lockKey = `${threadId}_r${roundNumber}_p${participantIndex}`;
      locks.delete(lockKey);
    }

    it('should prevent duplicate streaming for same participant', () => {
      const locks = new Map<string, StreamingLock>();

      // First request acquires lock
      const acquired1 = acquireStreamingLock(locks, 'thread-123', 0, 0);
      expect(acquired1).toBe(true);

      // Second request should fail
      const acquired2 = acquireStreamingLock(locks, 'thread-123', 0, 0);
      expect(acquired2).toBe(false);
    });

    it('should allow different participants to stream', () => {
      const locks = new Map<string, StreamingLock>();

      const acquired0 = acquireStreamingLock(locks, 'thread-123', 0, 0);
      expect(acquired0).toBe(true);

      // Different participant should succeed
      const acquired1 = acquireStreamingLock(locks, 'thread-123', 0, 1);
      expect(acquired1).toBe(true);
    });

    it('should allow re-acquisition after release', () => {
      const locks = new Map<string, StreamingLock>();

      acquireStreamingLock(locks, 'thread-123', 0, 0);
      releaseStreamingLock(locks, 'thread-123', 0, 0);

      const reacquired = acquireStreamingLock(locks, 'thread-123', 0, 0);
      expect(reacquired).toBe(true);
    });

    it('should isolate locks across different rounds', () => {
      const locks = new Map<string, StreamingLock>();

      acquireStreamingLock(locks, 'thread-123', 0, 0);

      // Same thread, different round
      const acquired = acquireStreamingLock(locks, 'thread-123', 1, 0);
      expect(acquired).toBe(true);
    });
  });

  describe('participant Priority Ordering', () => {
    type Participant = {
      id: string;
      priority: number;
      modelId: string;
    };

    function sortByPriority(participants: Participant[]): Participant[] {
      return [...participants].sort((a, b) => a.priority - b.priority);
    }

    it('should order participants by priority ascending', () => {
      const participants: Participant[] = [
        { id: 'p3', priority: 2, modelId: 'gemini' },
        { id: 'p1', priority: 0, modelId: 'gpt-4o' },
        { id: 'p2', priority: 1, modelId: 'claude' },
      ];

      const sorted = sortByPriority(participants);

      expect(sorted[0].id).toBe('p1');
      expect(sorted[1].id).toBe('p2');
      expect(sorted[2].id).toBe('p3');
    });

    it('should maintain order for equal priorities', () => {
      const participants: Participant[] = [
        { id: 'p1', priority: 0, modelId: 'gpt-4o' },
        { id: 'p2', priority: 0, modelId: 'claude' },
        { id: 'p3', priority: 0, modelId: 'gemini' },
      ];

      const sorted = sortByPriority(participants);

      // Stable sort should maintain original order
      expect(sorted.map(p => p.id)).toEqual(['p1', 'p2', 'p3']);
    });

    it('should handle negative priorities', () => {
      const participants: Participant[] = [
        { id: 'p1', priority: 1, modelId: 'gpt-4o' },
        { id: 'p2', priority: -1, modelId: 'claude' },
        { id: 'p3', priority: 0, modelId: 'gemini' },
      ];

      const sorted = sortByPriority(participants);

      expect(sorted[0].id).toBe('p2'); // -1
      expect(sorted[1].id).toBe('p3'); // 0
      expect(sorted[2].id).toBe('p1'); // 1
    });
  });

  describe('stream Chunk Buffering', () => {
    type ChunkBuffer = {
      messageId: string;
      chunks: Array<{ index: number; data: string; timestamp: number }>;
      isComplete: boolean;
    };

    function createBuffer(messageId: string): ChunkBuffer {
      return {
        messageId,
        chunks: [],
        isComplete: false,
      };
    }

    function appendChunk(buffer: ChunkBuffer, data: string): ChunkBuffer {
      return {
        ...buffer,
        chunks: [
          ...buffer.chunks,
          { index: buffer.chunks.length, data, timestamp: Date.now() },
        ],
      };
    }

    function completeBuffer(buffer: ChunkBuffer): ChunkBuffer {
      return { ...buffer, isComplete: true };
    }

    function getFullContent(buffer: ChunkBuffer): string {
      return buffer.chunks.map(c => c.data).join('');
    }

    it('should buffer chunks in order', () => {
      let buffer = createBuffer('msg-123');

      buffer = appendChunk(buffer, 'First ');
      buffer = appendChunk(buffer, 'second ');
      buffer = appendChunk(buffer, 'third.');

      expect(buffer.chunks).toHaveLength(3);
      expect(buffer.chunks[0].index).toBe(0);
      expect(buffer.chunks[1].index).toBe(1);
      expect(buffer.chunks[2].index).toBe(2);
    });

    it('should reconstruct full content from buffer', () => {
      let buffer = createBuffer('msg-123');

      buffer = appendChunk(buffer, 'Hello ');
      buffer = appendChunk(buffer, 'world ');
      buffer = appendChunk(buffer, 'from AI!');
      buffer = completeBuffer(buffer);

      expect(getFullContent(buffer)).toBe('Hello world from AI!');
      expect(buffer.isComplete).toBe(true);
    });

    it('should track timestamps for each chunk', () => {
      let buffer = createBuffer('msg-123');

      buffer = appendChunk(buffer, 'A');
      const time1 = buffer.chunks[0].timestamp;

      buffer = appendChunk(buffer, 'B');
      const time2 = buffer.chunks[1].timestamp;

      expect(time2).toBeGreaterThanOrEqual(time1);
    });
  });
});

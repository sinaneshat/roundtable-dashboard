import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Stream Resume and Recovery E2E Tests
 *
 * Tests the AI SDK stream resumption patterns:
 * - Stream ID generation and parsing
 * - KV state persistence and retrieval
 * - Page refresh recovery scenarios
 * - Incomplete round detection
 * - Participant completion tracking
 * - Resume endpoint behavior
 */

// Stream ID format: {threadId}_r{roundNumber}_p{participantIndex}
type StreamId = `${string}_r${number}_p${number}`;

type StreamStatus = 'active' | 'completed' | 'failed';

type ParticipantStreamMetadata = {
  streamId: StreamId;
  threadId: string;
  roundNumber: number;
  participantIndex: number;
  status: StreamStatus;
  messageId?: string;
  createdAt: number;
  completedAt?: number;
  errorMessage?: string;
};

type ThreadActiveStream = {
  streamId: StreamId;
  threadId: string;
  roundNumber: number;
  participantIndex: number;
  totalParticipants: number;
  participantStatuses: Record<number, StreamStatus>;
};

type StreamResumptionState = {
  hasActiveStream: boolean;
  streamId: StreamId | null;
  roundNumber: number | null;
  totalParticipants: number | null;
  participantStatuses: Record<string, StreamStatus> | null;
  nextParticipantToTrigger: number | null;
  roundComplete: boolean;
};

// Stream ID helpers
function generateStreamId(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
): StreamId {
  return `${threadId}_r${roundNumber}_p${participantIndex}` as StreamId;
}

function parseStreamId(streamId: string): {
  threadId: string;
  roundNumber: number;
  participantIndex: number;
} | null {
  const match = streamId.match(/^(.+)_r(\d+)_p(\d+)$/);
  if (!match)
    return null;

  return {
    threadId: match[1],
    roundNumber: Number.parseInt(match[2], 10),
    participantIndex: Number.parseInt(match[3], 10),
  };
}

function isValidStreamId(streamId: string): streamId is StreamId {
  return /^.+_r\d+_p\d+$/.test(streamId);
}

// KV simulation
class MockKVStore {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T) ?? null;
  }

  async set<T>(key: string, value: T, _options?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// Stream tracking functions
function setStreamActive(
  kv: MockKVStore,
  streamId: StreamId,
  metadata: ParticipantStreamMetadata,
): Promise<void> {
  return kv.set(`stream:${streamId}`, metadata);
}

function setStreamCompleted(
  kv: MockKVStore,
  streamId: StreamId,
  messageId: string,
): Promise<void> {
  return kv.set(`stream:${streamId}`, {
    status: 'completed',
    messageId,
    completedAt: Date.now(),
  });
}

function setStreamFailed(
  kv: MockKVStore,
  streamId: StreamId,
  errorMessage: string,
): Promise<void> {
  return kv.set(`stream:${streamId}`, {
    status: 'failed',
    errorMessage,
    completedAt: Date.now(),
  });
}

async function getStreamMetadata(
  kv: MockKVStore,
  streamId: StreamId,
): Promise<ParticipantStreamMetadata | null> {
  return kv.get<ParticipantStreamMetadata>(`stream:${streamId}`);
}

function setThreadActiveStream(
  kv: MockKVStore,
  threadId: string,
  activeStream: ThreadActiveStream,
): Promise<void> {
  return kv.set(`thread:${threadId}:active`, activeStream);
}

async function getThreadActiveStream(
  kv: MockKVStore,
  threadId: string,
): Promise<ThreadActiveStream | null> {
  return kv.get<ThreadActiveStream>(`thread:${threadId}:active`);
}

async function clearThreadActiveStream(
  kv: MockKVStore,
  threadId: string,
): Promise<void> {
  return kv.delete(`thread:${threadId}:active`);
}

async function getNextParticipantToStream(
  kv: MockKVStore,
  threadId: string,
): Promise<{ participantIndex: number } | null> {
  const activeStream = await getThreadActiveStream(kv, threadId);
  if (!activeStream)
    return null;

  // Find first participant that hasn't completed
  for (let i = 0; i < activeStream.totalParticipants; i++) {
    const status = activeStream.participantStatuses[i];
    if (!status || status === 'active') {
      return { participantIndex: i };
    }
  }

  return null; // All participants complete
}

function buildResumptionState(
  activeStream: ThreadActiveStream | null,
  nextParticipant: { participantIndex: number } | null,
): StreamResumptionState {
  if (!activeStream) {
    return {
      hasActiveStream: false,
      streamId: null,
      roundNumber: null,
      totalParticipants: null,
      participantStatuses: null,
      nextParticipantToTrigger: null,
      roundComplete: true,
    };
  }

  const roundComplete = !nextParticipant;
  const participantStatusesStringKeyed = Object.fromEntries(
    Object.entries(activeStream.participantStatuses).map(([k, v]) => [String(k), v]),
  );

  return {
    hasActiveStream: true,
    streamId: activeStream.streamId,
    roundNumber: activeStream.roundNumber,
    totalParticipants: activeStream.totalParticipants,
    participantStatuses: participantStatusesStringKeyed,
    nextParticipantToTrigger: nextParticipant?.participantIndex ?? null,
    roundComplete,
  };
}

describe('stream Resume and Recovery E2E', () => {
  let kv: MockKVStore;

  beforeEach(() => {
    kv = new MockKVStore();
  });

  describe('stream ID Generation and Parsing', () => {
    it('should generate valid stream ID', () => {
      const streamId = generateStreamId('thread-abc123', 0, 0);

      expect(streamId).toBe('thread-abc123_r0_p0');
      expect(isValidStreamId(streamId)).toBe(true);
    });

    it('should generate unique stream IDs for different participants', () => {
      const id0 = generateStreamId('thread-123', 0, 0);
      const id1 = generateStreamId('thread-123', 0, 1);
      const id2 = generateStreamId('thread-123', 0, 2);

      expect(id0).not.toBe(id1);
      expect(id1).not.toBe(id2);
      expect(id0).not.toBe(id2);
    });

    it('should generate unique stream IDs for different rounds', () => {
      const r0p0 = generateStreamId('thread-123', 0, 0);
      const r1p0 = generateStreamId('thread-123', 1, 0);
      const r2p0 = generateStreamId('thread-123', 2, 0);

      expect(r0p0).not.toBe(r1p0);
      expect(r1p0).not.toBe(r2p0);
    });

    it('should parse stream ID correctly', () => {
      const streamId = 'thread-xyz_r5_p2';
      const parsed = parseStreamId(streamId);

      expect(parsed).not.toBeNull();
      expect(parsed?.threadId).toBe('thread-xyz');
      expect(parsed?.roundNumber).toBe(5);
      expect(parsed?.participantIndex).toBe(2);
    });

    it('should return null for invalid stream ID', () => {
      expect(parseStreamId('invalid')).toBeNull();
      expect(parseStreamId('thread-123_p0')).toBeNull();
      expect(parseStreamId('thread-123_r0')).toBeNull();
      expect(parseStreamId('')).toBeNull();
    });

    it('should handle thread IDs with special characters', () => {
      const streamId = generateStreamId('thread_with-special.chars', 0, 0);
      const parsed = parseStreamId(streamId);

      expect(parsed?.threadId).toBe('thread_with-special.chars');
    });

    it('should validate stream ID format', () => {
      expect(isValidStreamId('thread-123_r0_p0')).toBe(true);
      expect(isValidStreamId('thread-123_r10_p5')).toBe(true);
      expect(isValidStreamId('invalid')).toBe(false);
      expect(isValidStreamId('thread_r_p')).toBe(false);
    });
  });

  describe('stream Status Tracking', () => {
    it('should set stream as active', async () => {
      const streamId = generateStreamId('thread-123', 0, 0);
      const metadata: ParticipantStreamMetadata = {
        streamId,
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 0,
        status: 'active',
        createdAt: Date.now(),
      };

      await setStreamActive(kv, streamId, metadata);
      const retrieved = await getStreamMetadata(kv, streamId);

      expect(retrieved?.status).toBe('active');
      expect(retrieved?.streamId).toBe(streamId);
    });

    it('should update stream to completed', async () => {
      const streamId = generateStreamId('thread-123', 0, 0);
      await setStreamActive(kv, streamId, {
        streamId,
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 0,
        status: 'active',
        createdAt: Date.now(),
      });

      await setStreamCompleted(kv, streamId, 'msg-final-123');
      const retrieved = await getStreamMetadata(kv, streamId);

      expect(retrieved?.status).toBe('completed');
      expect(retrieved?.messageId).toBe('msg-final-123');
      expect(retrieved?.completedAt).toBeDefined();
    });

    it('should update stream to failed', async () => {
      const streamId = generateStreamId('thread-123', 0, 0);
      await setStreamActive(kv, streamId, {
        streamId,
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 0,
        status: 'active',
        createdAt: Date.now(),
      });

      await setStreamFailed(kv, streamId, 'Rate limit exceeded');
      const retrieved = await getStreamMetadata(kv, streamId);

      expect(retrieved?.status).toBe('failed');
      expect(retrieved?.errorMessage).toBe('Rate limit exceeded');
    });

    it('should return null for non-existent stream', async () => {
      const streamId = generateStreamId('non-existent', 0, 0);
      const retrieved = await getStreamMetadata(kv, streamId);

      expect(retrieved).toBeNull();
    });
  });

  describe('thread Active Stream Management', () => {
    it('should set and get thread active stream', async () => {
      const threadId = 'thread-123';
      const activeStream: ThreadActiveStream = {
        streamId: generateStreamId(threadId, 0, 1),
        threadId,
        roundNumber: 0,
        participantIndex: 1,
        totalParticipants: 3,
        participantStatuses: { 0: 'completed', 1: 'active', 2: 'active' },
      };

      await setThreadActiveStream(kv, threadId, activeStream);
      const retrieved = await getThreadActiveStream(kv, threadId);

      expect(retrieved?.roundNumber).toBe(0);
      expect(retrieved?.participantIndex).toBe(1);
      expect(retrieved?.totalParticipants).toBe(3);
    });

    it('should clear thread active stream', async () => {
      const threadId = 'thread-123';
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 0),
        threadId,
        roundNumber: 0,
        participantIndex: 0,
        totalParticipants: 1,
        participantStatuses: { 0: 'active' },
      });

      await clearThreadActiveStream(kv, threadId);
      const retrieved = await getThreadActiveStream(kv, threadId);

      expect(retrieved).toBeNull();
    });
  });

  describe('next Participant Detection', () => {
    it('should find first incomplete participant', async () => {
      const threadId = 'thread-123';
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 1),
        threadId,
        roundNumber: 0,
        participantIndex: 1,
        totalParticipants: 3,
        participantStatuses: { 0: 'completed', 1: 'completed' },
      });

      const next = await getNextParticipantToStream(kv, threadId);

      expect(next?.participantIndex).toBe(2);
    });

    it('should return null when all participants complete', async () => {
      const threadId = 'thread-123';
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 2),
        threadId,
        roundNumber: 0,
        participantIndex: 2,
        totalParticipants: 3,
        participantStatuses: { 0: 'completed', 1: 'completed', 2: 'completed' },
      });

      const next = await getNextParticipantToStream(kv, threadId);

      expect(next).toBeNull();
    });

    it('should find active participant', async () => {
      const threadId = 'thread-123';
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 1),
        threadId,
        roundNumber: 0,
        participantIndex: 1,
        totalParticipants: 3,
        participantStatuses: { 0: 'completed', 1: 'active' },
      });

      const next = await getNextParticipantToStream(kv, threadId);

      expect(next?.participantIndex).toBe(1);
    });

    it('should return null when no active stream', async () => {
      const next = await getNextParticipantToStream(kv, 'non-existent');

      expect(next).toBeNull();
    });
  });

  describe('resumption State Building', () => {
    it('should build state for no active stream', () => {
      const state = buildResumptionState(null, null);

      expect(state.hasActiveStream).toBe(false);
      expect(state.streamId).toBeNull();
      expect(state.roundComplete).toBe(true);
    });

    it('should build state for active stream with next participant', () => {
      const activeStream: ThreadActiveStream = {
        streamId: generateStreamId('thread-123', 0, 1),
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 1,
        totalParticipants: 3,
        participantStatuses: { 0: 'completed', 1: 'active' },
      };

      const state = buildResumptionState(activeStream, { participantIndex: 2 });

      expect(state.hasActiveStream).toBe(true);
      expect(state.roundNumber).toBe(0);
      expect(state.nextParticipantToTrigger).toBe(2);
      expect(state.roundComplete).toBe(false);
    });

    it('should build state for complete round', () => {
      const activeStream: ThreadActiveStream = {
        streamId: generateStreamId('thread-123', 0, 2),
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 2,
        totalParticipants: 3,
        participantStatuses: { 0: 'completed', 1: 'completed', 2: 'completed' },
      };

      const state = buildResumptionState(activeStream, null);

      expect(state.hasActiveStream).toBe(true);
      expect(state.roundComplete).toBe(true);
      expect(state.nextParticipantToTrigger).toBeNull();
    });

    it('should convert participant statuses to string keys', () => {
      const activeStream: ThreadActiveStream = {
        streamId: generateStreamId('thread-123', 0, 0),
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 0,
        totalParticipants: 2,
        participantStatuses: { 0: 'completed', 1: 'active' },
      };

      const state = buildResumptionState(activeStream, { participantIndex: 1 });

      expect(state.participantStatuses?.['0']).toBe('completed');
      expect(state.participantStatuses?.['1']).toBe('active');
    });
  });

  describe('page Refresh Recovery Scenarios', () => {
    it('should recover when refresh happens during P0 streaming', async () => {
      const threadId = 'thread-refresh-p0';

      // State before refresh: P0 was streaming
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 0),
        threadId,
        roundNumber: 0,
        participantIndex: 0,
        totalParticipants: 3,
        participantStatuses: { 0: 'active' },
      });

      // After refresh: get resumption state
      const activeStream = await getThreadActiveStream(kv, threadId);
      const nextParticipant = await getNextParticipantToStream(kv, threadId);
      const state = buildResumptionState(activeStream, nextParticipant);

      expect(state.hasActiveStream).toBe(true);
      expect(state.nextParticipantToTrigger).toBe(0); // Resume P0
      expect(state.roundComplete).toBe(false);
    });

    it('should recover when refresh happens during P1 streaming', async () => {
      const threadId = 'thread-refresh-p1';

      // State before refresh: P0 complete, P1 streaming
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 1),
        threadId,
        roundNumber: 0,
        participantIndex: 1,
        totalParticipants: 3,
        participantStatuses: { 0: 'completed', 1: 'active' },
      });

      const activeStream = await getThreadActiveStream(kv, threadId);
      const nextParticipant = await getNextParticipantToStream(kv, threadId);
      const state = buildResumptionState(activeStream, nextParticipant);

      expect(state.nextParticipantToTrigger).toBe(1); // Resume P1
    });

    it('should recover when refresh happens between participants', async () => {
      const threadId = 'thread-refresh-between';

      // P0 and P1 complete, P2 not started yet
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 1),
        threadId,
        roundNumber: 0,
        participantIndex: 1,
        totalParticipants: 3,
        participantStatuses: { 0: 'completed', 1: 'completed' },
      });

      const activeStream = await getThreadActiveStream(kv, threadId);
      const nextParticipant = await getNextParticipantToStream(kv, threadId);
      const state = buildResumptionState(activeStream, nextParticipant);

      expect(state.nextParticipantToTrigger).toBe(2); // Start P2
    });

    it('should detect complete round after refresh', async () => {
      const threadId = 'thread-refresh-complete';

      // All participants complete
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 2),
        threadId,
        roundNumber: 0,
        participantIndex: 2,
        totalParticipants: 3,
        participantStatuses: { 0: 'completed', 1: 'completed', 2: 'completed' },
      });

      const activeStream = await getThreadActiveStream(kv, threadId);
      const nextParticipant = await getNextParticipantToStream(kv, threadId);
      const state = buildResumptionState(activeStream, nextParticipant);

      expect(state.roundComplete).toBe(true);
      expect(state.nextParticipantToTrigger).toBeNull();
    });
  });

  describe('multi-Round Resume Scenarios', () => {
    it('should track round number in resumption state', async () => {
      const threadId = 'thread-multi-round';

      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 2, 0),
        threadId,
        roundNumber: 2, // Third round
        participantIndex: 0,
        totalParticipants: 2,
        participantStatuses: { 0: 'active' },
      });

      const activeStream = await getThreadActiveStream(kv, threadId);
      const state = buildResumptionState(activeStream, { participantIndex: 0 });

      expect(state.roundNumber).toBe(2);
    });

    it('should handle round transition correctly', async () => {
      const threadId = 'thread-round-transition';

      // Round 0 complete, round 1 starting
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 1, 0),
        threadId,
        roundNumber: 1,
        participantIndex: 0,
        totalParticipants: 3,
        participantStatuses: { 0: 'active' },
      });

      const activeStream = await getThreadActiveStream(kv, threadId);
      const state = buildResumptionState(activeStream, { participantIndex: 0 });

      expect(state.roundNumber).toBe(1);
      expect(state.totalParticipants).toBe(3);
    });
  });

  describe('error Recovery Scenarios', () => {
    it('should handle failed participant gracefully', async () => {
      const threadId = 'thread-error-recovery';

      // P0 failed, need to trigger P1
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 0),
        threadId,
        roundNumber: 0,
        participantIndex: 0,
        totalParticipants: 3,
        participantStatuses: { 0: 'failed' },
      });

      const nextParticipant = await getNextParticipantToStream(kv, threadId);

      // Should skip failed P0 and go to P1
      expect(nextParticipant?.participantIndex).toBe(1);
    });

    it('should detect multiple failed participants', async () => {
      const threadId = 'thread-multi-fail';

      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 1),
        threadId,
        roundNumber: 0,
        participantIndex: 1,
        totalParticipants: 3,
        participantStatuses: { 0: 'failed', 1: 'failed' },
      });

      const nextParticipant = await getNextParticipantToStream(kv, threadId);

      expect(nextParticipant?.participantIndex).toBe(2);
    });
  });

  describe('stream ID Validation in Resume', () => {
    function validateStreamIdForResume(
      streamId: string,
      expectedRound: number,
      expectedParticipant: number,
    ): boolean {
      const parsed = parseStreamId(streamId);
      if (!parsed)
        return false;

      return (
        parsed.roundNumber === expectedRound
        && parsed.participantIndex === expectedParticipant
      );
    }

    it('should validate matching stream ID', () => {
      const streamId = 'thread-123_r0_p1';

      expect(validateStreamIdForResume(streamId, 0, 1)).toBe(true);
    });

    it('should reject mismatched round', () => {
      const streamId = 'thread-123_r0_p1';

      expect(validateStreamIdForResume(streamId, 1, 1)).toBe(false);
    });

    it('should reject mismatched participant', () => {
      const streamId = 'thread-123_r0_p1';

      expect(validateStreamIdForResume(streamId, 0, 2)).toBe(false);
    });
  });

  describe('stale Stream Detection', () => {
    function isStreamStale(lastChunkTime: number, thresholdMs: number = 15000): boolean {
      if (lastChunkTime === 0)
        return false;
      return Date.now() - lastChunkTime > thresholdMs;
    }

    it('should detect stale stream', () => {
      const oldTime = Date.now() - 20000; // 20 seconds ago

      expect(isStreamStale(oldTime, 15000)).toBe(true);
    });

    it('should not flag fresh stream as stale', () => {
      const recentTime = Date.now() - 5000; // 5 seconds ago

      expect(isStreamStale(recentTime, 15000)).toBe(false);
    });

    it('should not flag zero timestamp as stale', () => {
      expect(isStreamStale(0)).toBe(false);
    });
  });

  describe('complete E2E Flow', () => {
    it('should handle full round with refresh mid-stream', async () => {
      const threadId = 'thread-e2e-flow';
      const totalParticipants = 3;

      // === Phase 1: P0 starts streaming ===
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 0),
        threadId,
        roundNumber: 0,
        participantIndex: 0,
        totalParticipants,
        participantStatuses: { 0: 'active' },
      });

      // === Phase 2: P0 completes ===
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 0),
        threadId,
        roundNumber: 0,
        participantIndex: 0,
        totalParticipants,
        participantStatuses: { 0: 'completed' },
      });

      // === Phase 3: P1 starts streaming ===
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 1),
        threadId,
        roundNumber: 0,
        participantIndex: 1,
        totalParticipants,
        participantStatuses: { 0: 'completed', 1: 'active' },
      });

      // === REFRESH HAPPENS HERE ===

      // === Phase 4: Check resumption state ===
      const activeStream = await getThreadActiveStream(kv, threadId);
      const nextParticipant = await getNextParticipantToStream(kv, threadId);
      const state = buildResumptionState(activeStream, nextParticipant);

      expect(state.hasActiveStream).toBe(true);
      expect(state.roundNumber).toBe(0);
      expect(state.nextParticipantToTrigger).toBe(1); // Resume P1
      expect(state.participantStatuses?.['0']).toBe('completed');
      expect(state.participantStatuses?.['1']).toBe('active');

      // === Phase 5: P1 completes after resume ===
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 1),
        threadId,
        roundNumber: 0,
        participantIndex: 1,
        totalParticipants,
        participantStatuses: { 0: 'completed', 1: 'completed' },
      });

      // === Phase 6: P2 streams and completes ===
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 2),
        threadId,
        roundNumber: 0,
        participantIndex: 2,
        totalParticipants,
        participantStatuses: { 0: 'completed', 1: 'completed', 2: 'completed' },
      });

      // === Phase 7: Verify round complete ===
      const finalStream = await getThreadActiveStream(kv, threadId);
      const finalNext = await getNextParticipantToStream(kv, threadId);
      const finalState = buildResumptionState(finalStream, finalNext);

      expect(finalState.roundComplete).toBe(true);
      expect(finalState.nextParticipantToTrigger).toBeNull();
    });

    it('should handle multi-round conversation with refreshes', async () => {
      const threadId = 'thread-multi-round-e2e';

      // === Round 0 completes normally ===
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 0, 1),
        threadId,
        roundNumber: 0,
        participantIndex: 1,
        totalParticipants: 2,
        participantStatuses: { 0: 'completed', 1: 'completed' },
      });

      // Clear after round 0 completes
      await clearThreadActiveStream(kv, threadId);

      // === Round 1 starts ===
      await setThreadActiveStream(kv, threadId, {
        streamId: generateStreamId(threadId, 1, 0),
        threadId,
        roundNumber: 1,
        participantIndex: 0,
        totalParticipants: 2,
        participantStatuses: { 0: 'active' },
      });

      // === REFRESH during Round 1 ===
      const r1State = await getThreadActiveStream(kv, threadId);
      const r1Next = await getNextParticipantToStream(kv, threadId);
      const resumeState = buildResumptionState(r1State, r1Next);

      expect(resumeState.roundNumber).toBe(1);
      expect(resumeState.nextParticipantToTrigger).toBe(0);
    });
  });
});

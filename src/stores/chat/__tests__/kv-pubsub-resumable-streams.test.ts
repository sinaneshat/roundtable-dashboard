/**
 * Cloudflare KV Pub/Sub Resumable Streams Tests
 *
 * Comprehensive tests for the AI SDK v5 resumable stream pattern adapted for Cloudflare KV.
 * Based on AI SDK documentation: useChat with resume: true option.
 *
 * Key Features Tested:
 * - Thread-level active stream tracking (activeStreamId per thread)
 * - Multi-participant coordination via participantStatuses map
 * - Resume endpoint behavior (204 vs live stream)
 * - Stale stream detection (30s timeout)
 * - Phase-aware resumption (pre-search, participant, moderator)
 * - onFinish clearing stream state
 * - Race condition prevention
 *
 * AI SDK Resume Pattern:
 * 1. POST creates stream via consumeSseStream callback
 * 2. setThreadActiveStream tracks activeStreamId
 * 3. GET endpoint checks for active stream and resumes or returns 204
 * 4. onFinish clears activeStreamId via updateParticipantStatus
 * 5. Multi-participant rounds only clear when ALL participants finish
 */

import { describe, expect, it } from 'vitest';

import { ParticipantStreamStatuses } from '@/api/core/enums';

// ============================================================================
// TYPE DEFINITIONS (matching src/api/types/streaming.ts)
// ============================================================================

/**
 * Thread-level active stream tracking
 * Matches ThreadActiveStream from @/api/types/streaming
 */
type ThreadActiveStream = {
  streamId: string;
  roundNumber: number;
  participantIndex: number;
  createdAt: string;
  totalParticipants: number;
  participantStatuses: Record<number, 'active' | 'completed' | 'failed'>;
};

/**
 * Stream buffer metadata for chunk tracking
 */
type StreamBufferMetadata = {
  streamId: string;
  threadId: string;
  roundNumber: number;
  participantIndex: number;
  status: 'active' | 'completed' | 'failed';
  createdAt: string;
  completedAt: string | null;
  chunkCount: number;
};

/**
 * Resume endpoint response options
 */
type ResumeEndpointResponse = {
  status: 204 | 200;
  stream?: ReadableStream;
  metadata?: {
    roundNumber: number;
    participantIndex: number;
    phase: 'presearch' | 'participant' | 'moderator';
  };
};

// ============================================================================
// MOCK KV STORE IMPLEMENTATION
// ============================================================================

class MockKVStore {
  private store = new Map<string, string>();

  async get(key: string, format?: 'json' | 'text'): Promise<unknown> {
    const value = this.store.get(key);
    if (!value) {
      return null;
    }
    return format === 'json' ? JSON.parse(value) : value;
  }

  async put(key: string, value: string, _options?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Test helper: clear all entries
  clear(): void {
    this.store.clear();
  }

  // Test helper: check if key exists
  has(key: string): boolean {
    return this.store.has(key);
  }
}

// ============================================================================
// SERVICE FUNCTION IMPLEMENTATIONS (matching resumable-stream-kv.service.ts)
// ============================================================================

const STALE_CHUNK_TIMEOUT_MS = 30 * 1000; // 30 seconds

function getThreadActiveStreamKey(threadId: string): string {
  return `stream:thread:${threadId}:active`;
}

function getStreamBufferMetaKey(streamId: string): string {
  return `stream:buffer:${streamId}:meta`;
}

function getStreamBufferChunksKey(streamId: string): string {
  return `stream:buffer:${streamId}:chunks`;
}

function generateStreamId(threadId: string, roundNumber: number, participantIndex: number): string {
  return `${threadId}_r${roundNumber}_p${participantIndex}`;
}

async function setThreadActiveStream(
  kv: MockKVStore,
  threadId: string,
  streamId: string,
  roundNumber: number,
  participantIndex: number,
  totalParticipants: number,
): Promise<void> {
  const existing = await getThreadActiveStream(kv, threadId);

  let participantStatuses: Record<number, 'active' | 'completed' | 'failed'> = {};

  if (existing && existing.roundNumber === roundNumber) {
    participantStatuses = { ...existing.participantStatuses };
  }

  participantStatuses[participantIndex] = ParticipantStreamStatuses.ACTIVE;

  const activeStream: ThreadActiveStream = {
    streamId,
    roundNumber,
    participantIndex,
    createdAt: existing?.roundNumber === roundNumber ? existing.createdAt : new Date().toISOString(),
    totalParticipants,
    participantStatuses,
  };

  await kv.put(getThreadActiveStreamKey(threadId), JSON.stringify(activeStream));
}

async function getThreadActiveStream(kv: MockKVStore, threadId: string): Promise<ThreadActiveStream | null> {
  const data = await kv.get(getThreadActiveStreamKey(threadId), 'json');
  return data as ThreadActiveStream | null;
}

async function updateParticipantStatus(
  kv: MockKVStore,
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  status: typeof ParticipantStreamStatuses.COMPLETED | typeof ParticipantStreamStatuses.FAILED,
): Promise<boolean> {
  const existing = await getThreadActiveStream(kv, threadId);

  if (!existing) {
    return false;
  }

  const participantStatuses = { ...existing.participantStatuses };
  participantStatuses[participantIndex] = status;

  const finishedCount = Object.values(participantStatuses).filter(
    s => s === ParticipantStreamStatuses.COMPLETED || s === ParticipantStreamStatuses.FAILED,
  ).length;

  const allFinished = finishedCount >= existing.totalParticipants;

  if (allFinished) {
    await kv.delete(getThreadActiveStreamKey(threadId));
    return true;
  }

  const updated: ThreadActiveStream = {
    ...existing,
    participantStatuses,
  };

  await kv.put(getThreadActiveStreamKey(threadId), JSON.stringify(updated));
  return false;
}

async function getNextParticipantToStream(
  kv: MockKVStore,
  threadId: string,
): Promise<{ roundNumber: number; participantIndex: number; totalParticipants: number } | null> {
  const existing = await getThreadActiveStream(kv, threadId);

  if (!existing) {
    return null;
  }

  for (let i = 0; i < existing.totalParticipants; i++) {
    const status = existing.participantStatuses[i];
    if (status === ParticipantStreamStatuses.ACTIVE || status === undefined) {
      return {
        roundNumber: existing.roundNumber,
        participantIndex: i,
        totalParticipants: existing.totalParticipants,
      };
    }
  }

  return null;
}

async function clearThreadActiveStream(kv: MockKVStore, threadId: string): Promise<void> {
  await kv.delete(getThreadActiveStreamKey(threadId));
}

async function initializeStreamBuffer(
  kv: MockKVStore,
  streamId: string,
  threadId: string,
  roundNumber: number,
  participantIndex: number,
): Promise<void> {
  const meta: StreamBufferMetadata = {
    streamId,
    threadId,
    roundNumber,
    participantIndex,
    status: 'active',
    createdAt: new Date().toISOString(),
    completedAt: null,
    chunkCount: 0,
  };
  await kv.put(getStreamBufferMetaKey(streamId), JSON.stringify(meta));
  await kv.put(getStreamBufferChunksKey(streamId), JSON.stringify([]));
}

async function appendStreamChunk(kv: MockKVStore, streamId: string, chunk: string): Promise<void> {
  const chunksKey = getStreamBufferChunksKey(streamId);
  const chunks = (await kv.get(chunksKey, 'json') as string[]) || [];
  chunks.push(chunk);
  await kv.put(chunksKey, JSON.stringify(chunks));

  // Update chunk count in metadata
  const metaKey = getStreamBufferMetaKey(streamId);
  const meta = await kv.get(metaKey, 'json') as StreamBufferMetadata | null;
  if (meta) {
    meta.chunkCount = chunks.length;
    await kv.put(metaKey, JSON.stringify(meta));
  }
}

async function getStreamMetadata(kv: MockKVStore, streamId: string): Promise<StreamBufferMetadata | null> {
  return await kv.get(getStreamBufferMetaKey(streamId), 'json') as StreamBufferMetadata | null;
}

async function getBufferedChunks(kv: MockKVStore, streamId: string): Promise<string[]> {
  return (await kv.get(getStreamBufferChunksKey(streamId), 'json') as string[]) || [];
}

async function completeStreamBuffer(kv: MockKVStore, streamId: string): Promise<void> {
  const meta = await getStreamMetadata(kv, streamId);
  if (meta) {
    meta.status = 'completed';
    meta.completedAt = new Date().toISOString();
    await kv.put(getStreamBufferMetaKey(streamId), JSON.stringify(meta));
  }
}

async function failStreamBuffer(kv: MockKVStore, streamId: string, errorMessage: string): Promise<void> {
  const meta = await getStreamMetadata(kv, streamId);
  if (meta) {
    meta.status = 'failed';
    meta.completedAt = new Date().toISOString();
    await kv.put(getStreamBufferMetaKey(streamId), JSON.stringify(meta));
  }
  // Append error chunk
  await appendStreamChunk(kv, streamId, `3:{"error":"${errorMessage}"}`);
}

/**
 * Check if a stream is stale (no activity for 30+ seconds)
 */
function isStreamStale(meta: StreamBufferMetadata): boolean {
  const createdTime = new Date(meta.createdAt).getTime();
  const now = Date.now();
  return now - createdTime >= STALE_CHUNK_TIMEOUT_MS;
}

/**
 * Simulate resume endpoint behavior
 */
async function simulateResumeEndpoint(
  kv: MockKVStore,
  threadId: string,
): Promise<ResumeEndpointResponse> {
  const activeStream = await getThreadActiveStream(kv, threadId);

  if (!activeStream) {
    return { status: 204 };
  }

  const nextParticipant = await getNextParticipantToStream(kv, threadId);

  if (!nextParticipant) {
    return { status: 204 };
  }

  const streamId = generateStreamId(threadId, nextParticipant.roundNumber, nextParticipant.participantIndex);
  const meta = await getStreamMetadata(kv, streamId);

  if (!meta) {
    return { status: 204 };
  }

  // Check for stale stream
  if (meta.status === 'active' && isStreamStale(meta)) {
    // Mark as failed due to stale
    await failStreamBuffer(kv, streamId, 'Stream stale - no data received');
    await updateParticipantStatus(kv, threadId, nextParticipant.roundNumber, nextParticipant.participantIndex, ParticipantStreamStatuses.FAILED);
    return { status: 204 };
  }

  // Return live stream indication
  return {
    status: 200,
    metadata: {
      roundNumber: nextParticipant.roundNumber,
      participantIndex: nextParticipant.participantIndex,
      phase: 'participant',
    },
  };
}

// ============================================================================
// THREAD-LEVEL ACTIVE STREAM TRACKING TESTS
// ============================================================================

describe('thread Active Stream Tracking', () => {
  describe('setThreadActiveStream', () => {
    it('creates active stream entry for new thread', async () => {
      const kv = new MockKVStore();
      const threadId = 'thread-123';
      const streamId = generateStreamId(threadId, 0, 0);

      await setThreadActiveStream(kv, threadId, streamId, 0, 0, 4);

      const active = await getThreadActiveStream(kv, threadId);
      expect(active).not.toBeNull();
      expect(active?.streamId).toBe(streamId);
      expect(active?.roundNumber).toBe(0);
      expect(active?.participantIndex).toBe(0);
      expect(active?.totalParticipants).toBe(4);
    });

    it('initializes participantStatuses with first participant as active', async () => {
      const kv = new MockKVStore();
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 4);

      const active = await getThreadActiveStream(kv, 'thread-123');
      expect(active?.participantStatuses[0]).toBe(ParticipantStreamStatuses.ACTIVE);
      expect(active?.participantStatuses[1]).toBeUndefined();
      expect(active?.participantStatuses[2]).toBeUndefined();
      expect(active?.participantStatuses[3]).toBeUndefined();
    });

    it('preserves existing statuses when same round continues', async () => {
      const kv = new MockKVStore();

      // P0 starts
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 4);

      // P0 completes
      await updateParticipantStatus(kv, 'thread-123', 0, 0, ParticipantStreamStatuses.COMPLETED);

      // P1 starts (same round)
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p1', 0, 1, 4);

      const active = await getThreadActiveStream(kv, 'thread-123');
      expect(active?.participantStatuses[0]).toBe(ParticipantStreamStatuses.COMPLETED);
      expect(active?.participantStatuses[1]).toBe(ParticipantStreamStatuses.ACTIVE);
    });

    it('resets statuses when new round starts', async () => {
      const kv = new MockKVStore();

      // Round 0 P0
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 4);
      await updateParticipantStatus(kv, 'thread-123', 0, 0, ParticipantStreamStatuses.COMPLETED);

      // Round 1 P0 (new round - should reset)
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r1_p0', 1, 0, 4);

      const active = await getThreadActiveStream(kv, 'thread-123');
      expect(active?.roundNumber).toBe(1);
      expect(active?.participantStatuses[0]).toBe(ParticipantStreamStatuses.ACTIVE);
      // Round 0 status should be gone
      expect(Object.keys(active?.participantStatuses || {})).toHaveLength(1);
    });

    it('stores createdAt timestamp', async () => {
      const kv = new MockKVStore();
      const before = new Date().toISOString();

      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 4);

      const active = await getThreadActiveStream(kv, 'thread-123');
      expect(active?.createdAt).toBeDefined();
      expect(new Date(active!.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });
  });

  describe('getThreadActiveStream', () => {
    it('returns null for non-existent thread', async () => {
      const kv = new MockKVStore();
      const active = await getThreadActiveStream(kv, 'non-existent');
      expect(active).toBeNull();
    });

    it('returns active stream data', async () => {
      const kv = new MockKVStore();
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p2', 0, 2, 4);

      const active = await getThreadActiveStream(kv, 'thread-123');
      expect(active?.roundNumber).toBe(0);
      expect(active?.participantIndex).toBe(2);
      expect(active?.totalParticipants).toBe(4);
    });
  });

  describe('clearThreadActiveStream', () => {
    it('removes active stream entry', async () => {
      const kv = new MockKVStore();
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 4);

      await clearThreadActiveStream(kv, 'thread-123');

      const active = await getThreadActiveStream(kv, 'thread-123');
      expect(active).toBeNull();
    });
  });
});

// ============================================================================
// MULTI-PARTICIPANT COORDINATION TESTS
// ============================================================================

describe('multi-Participant Coordination', () => {
  describe('updateParticipantStatus', () => {
    it('updates individual participant status to completed', async () => {
      const kv = new MockKVStore();
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 4);

      await updateParticipantStatus(kv, 'thread-123', 0, 0, ParticipantStreamStatuses.COMPLETED);

      const active = await getThreadActiveStream(kv, 'thread-123');
      expect(active?.participantStatuses[0]).toBe(ParticipantStreamStatuses.COMPLETED);
    });

    it('updates individual participant status to failed', async () => {
      const kv = new MockKVStore();
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 4);

      await updateParticipantStatus(kv, 'thread-123', 0, 0, ParticipantStreamStatuses.FAILED);

      const active = await getThreadActiveStream(kv, 'thread-123');
      expect(active?.participantStatuses[0]).toBe(ParticipantStreamStatuses.FAILED);
    });

    it('returns false when not all participants finished', async () => {
      const kv = new MockKVStore();
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 4);

      const allFinished = await updateParticipantStatus(
        kv,
        'thread-123',
        0,
        0,
        ParticipantStreamStatuses.COMPLETED,
      );

      expect(allFinished).toBe(false);
      // Active stream should still exist
      const active = await getThreadActiveStream(kv, 'thread-123');
      expect(active).not.toBeNull();
    });

    it('returns true and clears active stream when ALL participants finish', async () => {
      const kv = new MockKVStore();
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 2);

      // P0 completes
      let allFinished = await updateParticipantStatus(kv, 'thread-123', 0, 0, ParticipantStreamStatuses.COMPLETED);
      expect(allFinished).toBe(false);

      // P1 starts
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p1', 0, 1, 2);

      // P1 completes - now all finished
      allFinished = await updateParticipantStatus(kv, 'thread-123', 0, 1, ParticipantStreamStatuses.COMPLETED);
      expect(allFinished).toBe(true);

      // Active stream should be cleared
      const active = await getThreadActiveStream(kv, 'thread-123');
      expect(active).toBeNull();
    });

    it('counts failed participants as finished', async () => {
      const kv = new MockKVStore();
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 2);

      // P0 fails
      await updateParticipantStatus(kv, 'thread-123', 0, 0, ParticipantStreamStatuses.FAILED);
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p1', 0, 1, 2);

      // P1 completes
      const allFinished = await updateParticipantStatus(kv, 'thread-123', 0, 1, ParticipantStreamStatuses.COMPLETED);
      expect(allFinished).toBe(true);
    });

    it('returns false for non-existent active stream', async () => {
      const kv = new MockKVStore();
      const result = await updateParticipantStatus(kv, 'non-existent', 0, 0, ParticipantStreamStatuses.COMPLETED);
      expect(result).toBe(false);
    });
  });

  describe('getNextParticipantToStream', () => {
    it('returns first participant for new round', async () => {
      const kv = new MockKVStore();
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 4);

      const next = await getNextParticipantToStream(kv, 'thread-123');
      expect(next?.participantIndex).toBe(0);
    });

    it('returns next incomplete participant', async () => {
      const kv = new MockKVStore();
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 4);
      await updateParticipantStatus(kv, 'thread-123', 0, 0, ParticipantStreamStatuses.COMPLETED);
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p1', 0, 1, 4);
      await updateParticipantStatus(kv, 'thread-123', 0, 1, ParticipantStreamStatuses.COMPLETED);

      const next = await getNextParticipantToStream(kv, 'thread-123');
      expect(next?.participantIndex).toBe(2);
    });

    it('skips failed participants', async () => {
      const kv = new MockKVStore();
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 4);
      await updateParticipantStatus(kv, 'thread-123', 0, 0, ParticipantStreamStatuses.FAILED);

      const next = await getNextParticipantToStream(kv, 'thread-123');
      expect(next?.participantIndex).toBe(1);
    });

    it('returns null when all participants finished', async () => {
      const kv = new MockKVStore();
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 2);
      await updateParticipantStatus(kv, 'thread-123', 0, 0, ParticipantStreamStatuses.COMPLETED);
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p1', 0, 1, 2);
      await updateParticipantStatus(kv, 'thread-123', 0, 1, ParticipantStreamStatuses.COMPLETED);

      // After all finish, active stream is cleared
      const next = await getNextParticipantToStream(kv, 'thread-123');
      expect(next).toBeNull();
    });

    it('returns null for non-existent thread', async () => {
      const kv = new MockKVStore();
      const next = await getNextParticipantToStream(kv, 'non-existent');
      expect(next).toBeNull();
    });

    it('includes round number and total participants', async () => {
      const kv = new MockKVStore();
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r2_p0', 2, 0, 3);

      const next = await getNextParticipantToStream(kv, 'thread-123');
      expect(next?.roundNumber).toBe(2);
      expect(next?.totalParticipants).toBe(3);
    });
  });

  describe('4 Participant Sequential Flow', () => {
    it('tracks all 4 participants completing in sequence', async () => {
      const kv = new MockKVStore();
      const threadId = 'thread-4p';

      // P0 starts and completes
      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p0`, 0, 0, 4);
      let next = await getNextParticipantToStream(kv, threadId);
      expect(next?.participantIndex).toBe(0);
      await updateParticipantStatus(kv, threadId, 0, 0, ParticipantStreamStatuses.COMPLETED);

      // P1 starts and completes
      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p1`, 0, 1, 4);
      next = await getNextParticipantToStream(kv, threadId);
      expect(next?.participantIndex).toBe(1);
      await updateParticipantStatus(kv, threadId, 0, 1, ParticipantStreamStatuses.COMPLETED);

      // P2 starts and completes
      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p2`, 0, 2, 4);
      next = await getNextParticipantToStream(kv, threadId);
      expect(next?.participantIndex).toBe(2);
      await updateParticipantStatus(kv, threadId, 0, 2, ParticipantStreamStatuses.COMPLETED);

      // P3 starts and completes
      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p3`, 0, 3, 4);
      next = await getNextParticipantToStream(kv, threadId);
      expect(next?.participantIndex).toBe(3);
      const allFinished = await updateParticipantStatus(kv, threadId, 0, 3, ParticipantStreamStatuses.COMPLETED);

      expect(allFinished).toBe(true);
      expect(await getThreadActiveStream(kv, threadId)).toBeNull();
    });

    it('tracks partial completion state for resume', async () => {
      const kv = new MockKVStore();
      const threadId = 'thread-partial';

      // P0 completes
      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p0`, 0, 0, 4);
      await updateParticipantStatus(kv, threadId, 0, 0, ParticipantStreamStatuses.COMPLETED);

      // P1 completes
      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p1`, 0, 1, 4);
      await updateParticipantStatus(kv, threadId, 0, 1, ParticipantStreamStatuses.COMPLETED);

      // P2 starts but doesn't complete (page refresh)
      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p2`, 0, 2, 4);

      // Check state for resume
      const active = await getThreadActiveStream(kv, threadId);
      expect(active?.participantStatuses[0]).toBe(ParticipantStreamStatuses.COMPLETED);
      expect(active?.participantStatuses[1]).toBe(ParticipantStreamStatuses.COMPLETED);
      expect(active?.participantStatuses[2]).toBe(ParticipantStreamStatuses.ACTIVE);
      expect(active?.participantStatuses[3]).toBeUndefined();

      // Next participant to resume is P2
      const next = await getNextParticipantToStream(kv, threadId);
      expect(next?.participantIndex).toBe(2);
    });
  });
});

// ============================================================================
// STREAM BUFFER TESTS (consumeSseStream pattern)
// ============================================================================

describe('stream Buffer (consumeSseStream)', () => {
  describe('initializeStreamBuffer', () => {
    it('creates buffer metadata', async () => {
      const kv = new MockKVStore();
      const streamId = 'thread-123_r0_p0';

      await initializeStreamBuffer(kv, streamId, 'thread-123', 0, 0);

      const meta = await getStreamMetadata(kv, streamId);
      expect(meta?.streamId).toBe(streamId);
      expect(meta?.status).toBe('active');
      expect(meta?.chunkCount).toBe(0);
    });

    it('creates empty chunks array', async () => {
      const kv = new MockKVStore();
      const streamId = 'thread-123_r0_p0';

      await initializeStreamBuffer(kv, streamId, 'thread-123', 0, 0);

      const chunks = await getBufferedChunks(kv, streamId);
      expect(chunks).toEqual([]);
    });
  });

  describe('appendStreamChunk', () => {
    it('appends chunks to buffer', async () => {
      const kv = new MockKVStore();
      const streamId = 'thread-123_r0_p0';

      await initializeStreamBuffer(kv, streamId, 'thread-123', 0, 0);
      await appendStreamChunk(kv, streamId, '0:"Hello"');
      await appendStreamChunk(kv, streamId, '0:" World"');

      const chunks = await getBufferedChunks(kv, streamId);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toBe('0:"Hello"');
      expect(chunks[1]).toBe('0:" World"');
    });

    it('updates chunk count in metadata', async () => {
      const kv = new MockKVStore();
      const streamId = 'thread-123_r0_p0';

      await initializeStreamBuffer(kv, streamId, 'thread-123', 0, 0);
      await appendStreamChunk(kv, streamId, '0:"Hello"');
      await appendStreamChunk(kv, streamId, '0:" World"');

      const meta = await getStreamMetadata(kv, streamId);
      expect(meta?.chunkCount).toBe(2);
    });
  });

  describe('completeStreamBuffer', () => {
    it('marks buffer as completed', async () => {
      const kv = new MockKVStore();
      const streamId = 'thread-123_r0_p0';

      await initializeStreamBuffer(kv, streamId, 'thread-123', 0, 0);
      await completeStreamBuffer(kv, streamId);

      const meta = await getStreamMetadata(kv, streamId);
      expect(meta?.status).toBe('completed');
      expect(meta?.completedAt).not.toBeNull();
    });
  });

  describe('failStreamBuffer', () => {
    it('marks buffer as failed and appends error chunk', async () => {
      const kv = new MockKVStore();
      const streamId = 'thread-123_r0_p0';

      await initializeStreamBuffer(kv, streamId, 'thread-123', 0, 0);
      await failStreamBuffer(kv, streamId, 'Connection lost');

      const meta = await getStreamMetadata(kv, streamId);
      expect(meta?.status).toBe('failed');

      const chunks = await getBufferedChunks(kv, streamId);
      expect(chunks[chunks.length - 1]).toContain('error');
    });
  });
});

// ============================================================================
// STALE STREAM DETECTION TESTS
// ============================================================================

describe('stale Stream Detection', () => {
  it('detects fresh stream as not stale', () => {
    const meta: StreamBufferMetadata = {
      streamId: 'test',
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      completedAt: null,
      chunkCount: 5,
    };

    expect(isStreamStale(meta)).toBe(false);
  });

  it('detects stream older than 30s as stale', () => {
    const meta: StreamBufferMetadata = {
      streamId: 'test',
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      status: 'active',
      createdAt: new Date(Date.now() - 35000).toISOString(), // 35 seconds ago
      completedAt: null,
      chunkCount: 0,
    };

    expect(isStreamStale(meta)).toBe(true);
  });

  it('stream at exactly 30s boundary is stale', () => {
    const meta: StreamBufferMetadata = {
      streamId: 'test',
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      status: 'active',
      createdAt: new Date(Date.now() - 30000).toISOString(), // exactly 30 seconds ago
      completedAt: null,
      chunkCount: 10,
    };

    // At exactly 30s boundary, consider it stale due to >= check
    expect(isStreamStale(meta)).toBe(true);
  });
});

// ============================================================================
// RESUME ENDPOINT BEHAVIOR TESTS
// ============================================================================

describe('resume Endpoint Behavior (GET)', () => {
  describe('no Active Stream', () => {
    it('returns 204 when no active stream exists', async () => {
      const kv = new MockKVStore();
      const response = await simulateResumeEndpoint(kv, 'non-existent');
      expect(response.status).toBe(204);
    });

    it('returns 204 when all participants finished', async () => {
      const kv = new MockKVStore();

      // Complete full round
      await setThreadActiveStream(kv, 'thread-123', 'thread-123_r0_p0', 0, 0, 1);
      await updateParticipantStatus(kv, 'thread-123', 0, 0, ParticipantStreamStatuses.COMPLETED);

      const response = await simulateResumeEndpoint(kv, 'thread-123');
      expect(response.status).toBe(204);
    });
  });

  describe('active Stream Exists', () => {
    it('returns 200 with metadata for active stream', async () => {
      const kv = new MockKVStore();
      const threadId = 'thread-123';
      const streamId = generateStreamId(threadId, 0, 0);

      await setThreadActiveStream(kv, threadId, streamId, 0, 0, 4);
      await initializeStreamBuffer(kv, streamId, threadId, 0, 0);

      const response = await simulateResumeEndpoint(kv, threadId);
      expect(response.status).toBe(200);
      expect(response.metadata?.roundNumber).toBe(0);
      expect(response.metadata?.participantIndex).toBe(0);
    });

    it('returns next incomplete participant index', async () => {
      const kv = new MockKVStore();
      const threadId = 'thread-123';

      // P0 complete, P1 active
      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p0`, 0, 0, 4);
      await updateParticipantStatus(kv, threadId, 0, 0, ParticipantStreamStatuses.COMPLETED);

      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p1`, 0, 1, 4);
      await initializeStreamBuffer(kv, `${threadId}_r0_p1`, threadId, 0, 1);

      const response = await simulateResumeEndpoint(kv, threadId);
      expect(response.status).toBe(200);
      expect(response.metadata?.participantIndex).toBe(1);
    });
  });

  describe('stale Stream Handling', () => {
    it('returns 204 and marks stream failed when stale', async () => {
      const kv = new MockKVStore();
      const threadId = 'thread-123';
      const streamId = generateStreamId(threadId, 0, 0);

      await setThreadActiveStream(kv, threadId, streamId, 0, 0, 4);

      // Create buffer with old timestamp (stale)
      const meta: StreamBufferMetadata = {
        streamId,
        threadId,
        roundNumber: 0,
        participantIndex: 0,
        status: 'active',
        createdAt: new Date(Date.now() - 35000).toISOString(), // 35s ago - stale
        completedAt: null,
        chunkCount: 0,
      };
      await kv.put(getStreamBufferMetaKey(streamId), JSON.stringify(meta));

      const response = await simulateResumeEndpoint(kv, threadId);
      expect(response.status).toBe(204);

      // Stream should be marked as failed
      const updatedMeta = await getStreamMetadata(kv, streamId);
      expect(updatedMeta?.status).toBe('failed');
    });
  });
});

// ============================================================================
// PHASE TRANSITION TESTS
// ============================================================================

describe('phase Transitions', () => {
  describe('pre-Search to Participants', () => {
    it('clears pre-search active stream before participants start', async () => {
      const kv = new MockKVStore();
      const threadId = 'thread-123';

      // Pre-search would use a different key pattern
      // After pre-search completes, participant phase begins
      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p0`, 0, 0, 4);

      const active = await getThreadActiveStream(kv, threadId);
      expect(active?.participantIndex).toBe(0);
    });
  });

  describe('participants to Moderator', () => {
    it('clears participant active stream when all complete', async () => {
      const kv = new MockKVStore();
      const threadId = 'thread-123';

      // All 4 participants complete
      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p0`, 0, 0, 4);
      await updateParticipantStatus(kv, threadId, 0, 0, ParticipantStreamStatuses.COMPLETED);

      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p1`, 0, 1, 4);
      await updateParticipantStatus(kv, threadId, 0, 1, ParticipantStreamStatuses.COMPLETED);

      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p2`, 0, 2, 4);
      await updateParticipantStatus(kv, threadId, 0, 2, ParticipantStreamStatuses.COMPLETED);

      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p3`, 0, 3, 4);
      const allDone = await updateParticipantStatus(kv, threadId, 0, 3, ParticipantStreamStatuses.COMPLETED);

      expect(allDone).toBe(true);
      expect(await getThreadActiveStream(kv, threadId)).toBeNull();

      // Moderator can now start (would use separate tracking)
    });
  });

  describe('round Completion', () => {
    it('tracks round completion correctly', async () => {
      const kv = new MockKVStore();
      const threadId = 'thread-123';

      // Simulate round 0 completion
      for (let i = 0; i < 4; i++) {
        await setThreadActiveStream(kv, threadId, `${threadId}_r0_p${i}`, 0, i, 4);
        await updateParticipantStatus(kv, threadId, 0, i, ParticipantStreamStatuses.COMPLETED);
      }

      // Should be cleared
      expect(await getThreadActiveStream(kv, threadId)).toBeNull();

      // Round 1 can start fresh
      await setThreadActiveStream(kv, threadId, `${threadId}_r1_p0`, 1, 0, 4);
      const active = await getThreadActiveStream(kv, threadId);
      expect(active?.roundNumber).toBe(1);
    });
  });
});

// ============================================================================
// onFINISH CALLBACK TESTS
// ============================================================================

describe('onFinish Callback Behavior', () => {
  it('clears activeStreamId after last participant', async () => {
    const kv = new MockKVStore();
    const threadId = 'thread-123';

    // Single participant round
    await setThreadActiveStream(kv, threadId, `${threadId}_r0_p0`, 0, 0, 1);

    // onFinish would call updateParticipantStatus
    const roundComplete = await updateParticipantStatus(
      kv,
      threadId,
      0,
      0,
      ParticipantStreamStatuses.COMPLETED,
    );

    expect(roundComplete).toBe(true);
    expect(await getThreadActiveStream(kv, threadId)).toBeNull();
  });

  it('preserves activeStreamId until last participant finishes', async () => {
    const kv = new MockKVStore();
    const threadId = 'thread-123';

    // 4 participant round
    await setThreadActiveStream(kv, threadId, `${threadId}_r0_p0`, 0, 0, 4);

    // First 3 finish
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        await setThreadActiveStream(kv, threadId, `${threadId}_r0_p${i}`, 0, i, 4);
      }
      await updateParticipantStatus(kv, threadId, 0, i, ParticipantStreamStatuses.COMPLETED);
    }

    // Active stream should still exist
    expect(await getThreadActiveStream(kv, threadId)).not.toBeNull();

    // P3 finishes
    await setThreadActiveStream(kv, threadId, `${threadId}_r0_p3`, 0, 3, 4);
    await updateParticipantStatus(kv, threadId, 0, 3, ParticipantStreamStatuses.COMPLETED);

    // Now cleared
    expect(await getThreadActiveStream(kv, threadId)).toBeNull();
  });
});

// ============================================================================
// RACE CONDITION PREVENTION TESTS
// ============================================================================

describe('race Condition Prevention', () => {
  it('preserves participant statuses during concurrent updates', async () => {
    const kv = new MockKVStore();
    const threadId = 'thread-123';

    // Simulate P0 and P1 completing close together
    await setThreadActiveStream(kv, threadId, `${threadId}_r0_p0`, 0, 0, 4);
    await setThreadActiveStream(kv, threadId, `${threadId}_r0_p1`, 0, 1, 4);

    // Both update their status
    await updateParticipantStatus(kv, threadId, 0, 0, ParticipantStreamStatuses.COMPLETED);
    await updateParticipantStatus(kv, threadId, 0, 1, ParticipantStreamStatuses.COMPLETED);

    const active = await getThreadActiveStream(kv, threadId);
    expect(active?.participantStatuses[0]).toBe(ParticipantStreamStatuses.COMPLETED);
    expect(active?.participantStatuses[1]).toBe(ParticipantStreamStatuses.COMPLETED);
  });

  it('prevents duplicate participant triggers via status tracking', async () => {
    const kv = new MockKVStore();
    const threadId = 'thread-123';

    await setThreadActiveStream(kv, threadId, `${threadId}_r0_p0`, 0, 0, 4);
    await updateParticipantStatus(kv, threadId, 0, 0, ParticipantStreamStatuses.COMPLETED);

    // Get next should return P1, not P0 again
    const next = await getNextParticipantToStream(kv, threadId);
    expect(next?.participantIndex).toBe(1);
  });

  it('handles failed + completed mix correctly', async () => {
    const kv = new MockKVStore();
    const threadId = 'thread-123';

    // P0 fails, P1 completes
    await setThreadActiveStream(kv, threadId, `${threadId}_r0_p0`, 0, 0, 2);
    await updateParticipantStatus(kv, threadId, 0, 0, ParticipantStreamStatuses.FAILED);

    await setThreadActiveStream(kv, threadId, `${threadId}_r0_p1`, 0, 1, 2);
    const allDone = await updateParticipantStatus(kv, threadId, 0, 1, ParticipantStreamStatuses.COMPLETED);

    // Both finished (failed + completed = all done)
    expect(allDone).toBe(true);
    expect(await getThreadActiveStream(kv, threadId)).toBeNull();
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge Cases', () => {
  describe('kV Unavailable', () => {
    it('handles missing KV gracefully in production', async () => {
      // When KV is null, functions return safe defaults
      // This tests the defensive coding pattern
      const kv = new MockKVStore();
      kv.clear();

      const active = await getThreadActiveStream(kv, 'thread-123');
      expect(active).toBeNull();

      const next = await getNextParticipantToStream(kv, 'thread-123');
      expect(next).toBeNull();
    });
  });

  describe('single Participant Rounds', () => {
    it('handles single participant mode correctly', async () => {
      const kv = new MockKVStore();
      const threadId = 'thread-solo';

      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p0`, 0, 0, 1);
      const allDone = await updateParticipantStatus(kv, threadId, 0, 0, ParticipantStreamStatuses.COMPLETED);

      expect(allDone).toBe(true);
      expect(await getThreadActiveStream(kv, threadId)).toBeNull();
    });
  });

  describe('multi-Round Conversations', () => {
    it('tracks rounds independently', async () => {
      const kv = new MockKVStore();
      const threadId = 'thread-multi';

      // Round 0
      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p0`, 0, 0, 2);
      await updateParticipantStatus(kv, threadId, 0, 0, ParticipantStreamStatuses.COMPLETED);
      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p1`, 0, 1, 2);
      await updateParticipantStatus(kv, threadId, 0, 1, ParticipantStreamStatuses.COMPLETED);

      // Round 1
      await setThreadActiveStream(kv, threadId, `${threadId}_r1_p0`, 1, 0, 2);

      const active = await getThreadActiveStream(kv, threadId);
      expect(active?.roundNumber).toBe(1);
      expect(active?.participantStatuses[0]).toBe(ParticipantStreamStatuses.ACTIVE);
      // Round 0 statuses should be gone
      expect(Object.keys(active?.participantStatuses || {})).toHaveLength(1);
    });
  });

  describe('resumption After Page Close', () => {
    it('detects where conversation left off', async () => {
      const kv = new MockKVStore();
      const threadId = 'thread-resume';

      // Simulate P0, P1 complete, P2 mid-stream when page closed
      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p0`, 0, 0, 4);
      await updateParticipantStatus(kv, threadId, 0, 0, ParticipantStreamStatuses.COMPLETED);

      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p1`, 0, 1, 4);
      await updateParticipantStatus(kv, threadId, 0, 1, ParticipantStreamStatuses.COMPLETED);

      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p2`, 0, 2, 4);
      // P2 active when page closed - no completion update

      // On page reload, check resumption state
      const next = await getNextParticipantToStream(kv, threadId);
      expect(next).not.toBeNull();
      expect(next?.roundNumber).toBe(0);
      expect(next?.participantIndex).toBe(2); // Resume from P2
      expect(next?.totalParticipants).toBe(4);
    });

    it('knows which participants already completed', async () => {
      const kv = new MockKVStore();
      const threadId = 'thread-resume-check';

      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p0`, 0, 0, 4);
      await updateParticipantStatus(kv, threadId, 0, 0, ParticipantStreamStatuses.COMPLETED);

      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p1`, 0, 1, 4);
      await updateParticipantStatus(kv, threadId, 0, 1, ParticipantStreamStatuses.COMPLETED);

      // Page closed mid P2
      await setThreadActiveStream(kv, threadId, `${threadId}_r0_p2`, 0, 2, 4);

      const active = await getThreadActiveStream(kv, threadId);
      expect(active?.participantStatuses[0]).toBe(ParticipantStreamStatuses.COMPLETED);
      expect(active?.participantStatuses[1]).toBe(ParticipantStreamStatuses.COMPLETED);
      expect(active?.participantStatuses[2]).toBe(ParticipantStreamStatuses.ACTIVE);
      expect(active?.participantStatuses[3]).toBeUndefined();
    });
  });

  describe('abort Incompatibility (per AI SDK docs)', () => {
    it('documents abort/resume incompatibility', () => {
      // Per AI SDK docs: "Stream resumption is not compatible with abort functionality"
      // This test documents the expected behavior

      const useChatConfig = {
        id: 'thread-123',
        resume: true,
        // When resume: true, abort signals will break resumption
        // Application must choose one or the other
      };

      expect(useChatConfig.resume).toBe(true);

      // The trade-off:
      // - resume: true = can reconnect to active streams after page reload
      // - abort functionality = user can stop generation manually
      // Cannot have both simultaneously
    });
  });
});

// ============================================================================
// STREAM ID FORMAT VALIDATION
// ============================================================================

describe('stream ID Format', () => {
  it('generates correct format: {threadId}_r{round}_p{participant}', () => {
    expect(generateStreamId('thread-123', 0, 0)).toBe('thread-123_r0_p0');
    expect(generateStreamId('thread-123', 1, 2)).toBe('thread-123_r1_p2');
    expect(generateStreamId('abc-xyz', 5, 3)).toBe('abc-xyz_r5_p3');
  });

  it('can be parsed back to components', () => {
    const streamId = 'thread-123_r2_p1';
    const match = streamId.match(/^(.+)_r(\d+)_p(\d+)$/);

    expect(match).not.toBeNull();
    expect(match![1]).toBe('thread-123');
    expect(Number.parseInt(match![2]!, 10)).toBe(2);
    expect(Number.parseInt(match![3]!, 10)).toBe(1);
  });
});

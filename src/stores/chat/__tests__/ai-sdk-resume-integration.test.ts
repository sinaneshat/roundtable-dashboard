import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AI SDK Resume Integration Tests
 *
 * Tests the AI SDK `resume: true` functionality with:
 * - Valid thread ID guards (resume only when useChatId exists)
 * - Multi-phase resumption (pre-search, participants, summarizer)
 * - Stale stream timeout (30s for reasoning models)
 * - Navigation away/return scenarios
 * - KV buffer integration
 *
 * Following AI SDK documentation:
 * https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-resume-streams
 */

// ============================================================================
// Type Definitions
// ============================================================================

type StreamPhase = 'idle' | 'presearch' | 'participant' | 'summarizer' | 'complete';
type StreamStatus = 'active' | 'streaming' | 'completed' | 'failed';
type _MessageStatus = 'pending' | 'streaming' | 'complete' | 'failed';

type ResumeResponse = {
  status: 200 | 204;
  phase?: StreamPhase;
  streamId?: string;
  roundNumber?: number;
  participantIndex?: number;
  totalParticipants?: number;
  participantStatuses?: Record<string, StreamStatus>;
  nextParticipantIndex?: number;
  moderatorId?: string;
  stream?: ReadableStream<Uint8Array>;
};

type StreamBufferMetadata = {
  streamId: string;
  threadId: string;
  roundNumber: number;
  participantIndex: number;
  status: StreamStatus;
  chunkCount: number;
  createdAt: number;
  completedAt: number | null;
  errorMessage: string | null;
};

type PreSearchStreamMetadata = {
  streamId: string;
  threadId: string;
  roundNumber: number;
  preSearchId: string;
  status: StreamStatus;
  chunkCount: number;
  createdAt: number;
  completedAt?: number;
};

type ModeratorStreamMetadata = {
  streamId: string;
  threadId: string;
  roundNumber: number;
  moderatorId: string;
  status: StreamStatus;
  chunkCount: number;
  createdAt: number;
  completedAt: number | null;
};

type ThreadActiveStream = {
  streamId: string;
  roundNumber: number;
  participantIndex: number;
  createdAt: string;
  totalParticipants: number;
  participantStatuses: Record<string, StreamStatus>;
};

type StreamChunk = {
  data: string;
  timestamp: number;
};

// ============================================================================
// Mock KV Store
// ============================================================================

class MockKVStore {
  private store = new Map<string, { value: unknown; expiresAt?: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry)
      return null;

    // Check TTL expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async put<T>(key: string, value: T, options?: { expirationTtl?: number }): Promise<void> {
    const expiresAt = options?.expirationTtl
      ? Date.now() + options.expirationTtl * 1000
      : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  // Test helper: simulate time passing for TTL expiration
  simulateTimePassing(seconds: number): void {
    const entries = [...this.store.entries()];
    for (const [key, entry] of entries) {
      if (entry.expiresAt) {
        entry.expiresAt -= seconds * 1000;
        if (entry.expiresAt < Date.now()) {
          this.store.delete(key);
        }
      }
    }
  }
}

// ============================================================================
// Stream ID Utilities
// ============================================================================

function generatePreSearchStreamId(threadId: string, roundNumber: number): string {
  return `${threadId}_r${roundNumber}_presearch`;
}

function _generateParticipantStreamId(threadId: string, roundNumber: number, participantIndex: number): string {
  return `${threadId}_r${roundNumber}_participant_${participantIndex}`;
}

function generateModeratorStreamId(threadId: string, roundNumber: number): string {
  return `${threadId}_r${roundNumber}_moderator`;
}

function generateLegacyParticipantStreamId(threadId: string, roundNumber: number, participantIndex: number): string {
  return `${threadId}_r${roundNumber}_p${participantIndex}`;
}

function parseStreamId(streamId: string): {
  threadId: string;
  roundNumber: number;
  phase: StreamPhase;
  participantIndex?: number;
} | null {
  // Pre-search: {threadId}_r{roundNumber}_presearch
  const presearchMatch = streamId.match(/^(.+)_r(\d+)_presearch$/);
  if (presearchMatch) {
    return {
      threadId: presearchMatch[1]!,
      roundNumber: Number.parseInt(presearchMatch[2]!, 10),
      phase: 'presearch',
    };
  }

  // Participant: {threadId}_r{roundNumber}_participant_{index}
  const participantMatch = streamId.match(/^(.+)_r(\d+)_participant_(\d+)$/);
  if (participantMatch) {
    return {
      threadId: participantMatch[1]!,
      roundNumber: Number.parseInt(participantMatch[2]!, 10),
      phase: 'participant',
      participantIndex: Number.parseInt(participantMatch[3]!, 10),
    };
  }

  // Participant format: {threadId}_r{roundNumber}_p{index}
  const legacyMatch = streamId.match(/^(.+)_r(\d+)_p(\d+)$/);
  if (legacyMatch) {
    return {
      threadId: legacyMatch[1]!,
      roundNumber: Number.parseInt(legacyMatch[2]!, 10),
      phase: 'participant',
      participantIndex: Number.parseInt(legacyMatch[3]!, 10),
    };
  }

  // Summarizer: {threadId}_r{roundNumber}_summarizer
  const summarizerMatch = streamId.match(/^(.+)_r(\d+)_summarizer$/);
  if (summarizerMatch) {
    return {
      threadId: summarizerMatch[1]!,
      roundNumber: Number.parseInt(summarizerMatch[2]!, 10),
      phase: 'summarizer',
    };
  }

  return null;
}

// ============================================================================
// Stale Stream Detection (30s timeout for reasoning models)
// ============================================================================

const STALE_CHUNK_TIMEOUT_MS = 30 * 1000; // 30 seconds for reasoning models

function isStreamStale(
  lastChunkTime: number,
  createdTime: number,
  hasChunks: boolean,
  staleTimeoutMs = STALE_CHUNK_TIMEOUT_MS,
): boolean {
  if (hasChunks && lastChunkTime > 0) {
    return Date.now() - lastChunkTime > staleTimeoutMs;
  }
  // No chunks but stream exists - check creation time
  if (!hasChunks && createdTime > 0) {
    return Date.now() - createdTime > staleTimeoutMs;
  }
  return false;
}

// ============================================================================
// Mock Resume Endpoint Simulation
// ============================================================================

async function simulateResumeEndpoint(
  threadId: string,
  currentRound: number,
  kv: MockKVStore,
): Promise<ResumeResponse> {
  // Phase 1: Check for active pre-search
  const preSearchStreamId = generatePreSearchStreamId(threadId, currentRound);
  const preSearchMetadata = await kv.get<PreSearchStreamMetadata>(`presearch:meta:${preSearchStreamId}`);
  const preSearchChunks = await kv.get<StreamChunk[]>(`presearch:chunks:${preSearchStreamId}`);

  if (preSearchMetadata && (preSearchMetadata.status === 'active' || preSearchMetadata.status === 'streaming')) {
    const lastChunkTime = preSearchChunks && preSearchChunks.length > 0
      ? Math.max(...preSearchChunks.map(c => c.timestamp))
      : 0;

    if (!isStreamStale(lastChunkTime, preSearchMetadata.createdAt, (preSearchChunks?.length ?? 0) > 0)) {
      // Return 204 with phase metadata for pre-search (AI SDK ignores, custom handler takes over)
      return {
        status: 204,
        phase: 'presearch',
        roundNumber: currentRound,
        streamId: preSearchStreamId,
      };
    }
  }

  // Phase 2: Check for active participant stream
  const activeStream = await kv.get<ThreadActiveStream>(`thread:${threadId}:active`);

  if (activeStream && activeStream.roundNumber === currentRound) {
    const participantStreamId = activeStream.streamId;
    const _metadata = await kv.get<StreamBufferMetadata>(`stream:meta:${participantStreamId}`);
    const chunks = await kv.get<StreamChunk[]>(`stream:chunks:${participantStreamId}`);

    const lastChunkTime = chunks && chunks.length > 0
      ? Math.max(...chunks.map(c => c.timestamp))
      : 0;
    const streamCreatedTime = activeStream.createdAt
      ? new Date(activeStream.createdAt).getTime()
      : 0;
    const hasChunks = (chunks?.length ?? 0) > 0;

    if (isStreamStale(lastChunkTime, streamCreatedTime, hasChunks)) {
      // Stream is stale - return 204 with next participant info
      return {
        status: 204,
        phase: 'participant',
        roundNumber: activeStream.roundNumber,
        totalParticipants: activeStream.totalParticipants,
        participantStatuses: activeStream.participantStatuses,
        nextParticipantIndex: findNextParticipant(activeStream),
      };
    }

    // Return SSE stream for active participant (AI SDK handles)
    return {
      status: 200,
      phase: 'participant',
      streamId: participantStreamId,
      roundNumber: activeStream.roundNumber,
      participantIndex: activeStream.participantIndex,
      totalParticipants: activeStream.totalParticipants,
      participantStatuses: activeStream.participantStatuses,
      nextParticipantIndex: findNextParticipant(activeStream),
      stream: createMockSSEStream(chunks ?? []),
    };
  }

  // Phase 3: Check for active moderator stream
  const moderatorStreamId = generateModeratorStreamId(threadId, currentRound);
  const moderatorMetadata = await kv.get<ModeratorStreamMetadata>(`moderator:meta:${moderatorStreamId}`);
  const moderatorChunks = await kv.get<StreamChunk[]>(`moderator:chunks:${moderatorStreamId}`);

  if (moderatorMetadata && (moderatorMetadata.status === 'active' || moderatorMetadata.status === 'streaming')) {
    const lastChunkTime = moderatorChunks && moderatorChunks.length > 0
      ? Math.max(...moderatorChunks.map(c => c.timestamp))
      : 0;

    if (!isStreamStale(lastChunkTime, moderatorMetadata.createdAt, (moderatorChunks?.length ?? 0) > 0)) {
      // Return 204 with phase metadata for moderator (AI SDK ignores, custom handler takes over)
      return {
        status: 204,
        phase: 'moderator',
        roundNumber: currentRound,
        streamId: moderatorStreamId,
        moderatorId: moderatorMetadata.moderatorId,
      };
    }
  }

  // No active stream found
  return { status: 204 };
}

function findNextParticipant(activeStream: ThreadActiveStream): number | undefined {
  for (let i = 0; i < activeStream.totalParticipants; i++) {
    const status = activeStream.participantStatuses[String(i)];
    if (!status || status === 'active') {
      return i;
    }
  }
  return undefined;
}

function createMockSSEStream(chunks: StreamChunk[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]!.data));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

// ============================================================================
// Test Helpers
// ============================================================================

async function setupActiveParticipantStream(
  kv: MockKVStore,
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  totalParticipants: number,
  chunks: StreamChunk[] = [],
): Promise<void> {
  const streamId = generateLegacyParticipantStreamId(threadId, roundNumber, participantIndex);

  const participantStatuses: Record<string, StreamStatus> = {};
  for (let i = 0; i < participantIndex; i++) {
    participantStatuses[String(i)] = 'completed';
  }
  participantStatuses[String(participantIndex)] = 'active';

  await kv.put(`thread:${threadId}:active`, {
    streamId,
    roundNumber,
    participantIndex,
    createdAt: new Date().toISOString(),
    totalParticipants,
    participantStatuses,
  } as ThreadActiveStream);

  await kv.put(`stream:meta:${streamId}`, {
    streamId,
    threadId,
    roundNumber,
    participantIndex,
    status: 'active' as StreamStatus,
    chunkCount: chunks.length,
    createdAt: Date.now(),
    completedAt: null,
    errorMessage: null,
  } as StreamBufferMetadata);

  if (chunks.length > 0) {
    await kv.put(`stream:chunks:${streamId}`, chunks);
  }
}

async function setupActivePreSearchStream(
  kv: MockKVStore,
  threadId: string,
  roundNumber: number,
  preSearchId: string,
  chunks: StreamChunk[] = [],
): Promise<void> {
  const streamId = generatePreSearchStreamId(threadId, roundNumber);

  await kv.put(`presearch:meta:${streamId}`, {
    streamId,
    threadId,
    roundNumber,
    preSearchId,
    status: 'streaming' as StreamStatus,
    chunkCount: chunks.length,
    createdAt: Date.now(),
  } as PreSearchStreamMetadata);

  if (chunks.length > 0) {
    await kv.put(`presearch:chunks:${streamId}`, chunks);
  }
}

async function setupActiveModeratorStream(
  kv: MockKVStore,
  threadId: string,
  roundNumber: number,
  moderatorId: string,
  chunks: StreamChunk[] = [],
): Promise<void> {
  const streamId = generateModeratorStreamId(threadId, roundNumber);

  await kv.put(`moderator:meta:${streamId}`, {
    streamId,
    threadId,
    roundNumber,
    moderatorId,
    status: 'streaming' as StreamStatus,
    chunkCount: chunks.length,
    createdAt: Date.now(),
    completedAt: null,
  } as ModeratorStreamMetadata);

  if (chunks.length > 0) {
    await kv.put(`moderator:chunks:${streamId}`, chunks);
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('aI SDK Resume Integration', () => {
  let kv: MockKVStore;

  beforeEach(() => {
    kv = new MockKVStore();
    vi.useFakeTimers();
  });

  describe('resume Flag Guard', () => {
    it('should enable resume only when threadId is valid', () => {
      // Simulating: resume: !!useChatId
      const cases = [
        { threadId: 'thread-123', expected: true },
        { threadId: 'abc', expected: true },
        { threadId: '', expected: false },
        { threadId: undefined, expected: false },
        { threadId: null, expected: false },
        { threadId: '   ', expected: false }, // trimmed becomes empty
      ];

      for (const { threadId, expected } of cases) {
        const useChatId = threadId && typeof threadId === 'string' && threadId.trim() !== ''
          ? threadId
          : undefined;
        const resume = !!useChatId;
        expect(resume, `threadId: "${threadId}"`).toBe(expected);
      }
    });

    it('should prevent state corruption on new threads', () => {
      // New thread: no ID yet, resume should be false
      const newThreadId = undefined;
      const useChatId = newThreadId && String(newThreadId).trim() !== '' ? newThreadId : undefined;
      const resume = !!useChatId;

      expect(resume).toBe(false);
    });

    it('should enable resume on existing threads', () => {
      // Existing thread: has ID, resume should be true
      const existingThreadId = 'thread-abc123';
      const useChatId = existingThreadId && existingThreadId.trim() !== '' ? existingThreadId : undefined;
      const resume = !!useChatId;

      expect(resume).toBe(true);
    });
  });

  describe('stale Stream Detection (30s Timeout)', () => {
    it('should detect stale stream after 30 seconds', () => {
      const now = Date.now();
      const oldTime = now - 35 * 1000; // 35 seconds ago

      expect(isStreamStale(oldTime, 0, true, STALE_CHUNK_TIMEOUT_MS)).toBe(true);
    });

    it('should not flag fresh stream as stale within 30 seconds', () => {
      const now = Date.now();
      const recentTime = now - 25 * 1000; // 25 seconds ago

      expect(isStreamStale(recentTime, 0, true, STALE_CHUNK_TIMEOUT_MS)).toBe(false);
    });

    it('should handle reasoning models with longer pauses (up to 30s)', () => {
      const now = Date.now();
      // Reasoning models may pause for thinking - 25s pause is acceptable
      const reasoningPause = now - 25 * 1000;

      expect(isStreamStale(reasoningPause, 0, true, STALE_CHUNK_TIMEOUT_MS)).toBe(false);
    });

    it('should detect stale stream with no chunks based on creation time', () => {
      const now = Date.now();
      const oldCreationTime = now - 35 * 1000;

      expect(isStreamStale(0, oldCreationTime, false, STALE_CHUNK_TIMEOUT_MS)).toBe(true);
    });

    it('should not flag new stream with no chunks as stale', () => {
      const now = Date.now();
      const recentCreationTime = now - 5 * 1000;

      expect(isStreamStale(0, recentCreationTime, false, STALE_CHUNK_TIMEOUT_MS)).toBe(false);
    });
  });

  describe('multi-Phase Resumption', () => {
    it('should return 204 with presearch phase when pre-search is active', async () => {
      const threadId = 'thread-presearch-active';
      vi.setSystemTime(new Date());

      await setupActivePreSearchStream(kv, threadId, 0, 'presearch-123', [
        { data: 'event: search_start\ndata: {}\n\n', timestamp: Date.now() },
      ]);

      const response = await simulateResumeEndpoint(threadId, 0, kv);

      expect(response.status).toBe(204);
      expect(response.phase).toBe('presearch');
      expect(response.roundNumber).toBe(0);
      expect(response.stream).toBeUndefined();
    });

    it('should return SSE stream when participant stream is active', async () => {
      const threadId = 'thread-participant-active';
      vi.setSystemTime(new Date());

      const chunks: StreamChunk[] = [
        { data: '0:"Hello"\n', timestamp: Date.now() },
        { data: '0:" world"\n', timestamp: Date.now() + 100 },
      ];

      await setupActiveParticipantStream(kv, threadId, 0, 0, 3, chunks);

      const response = await simulateResumeEndpoint(threadId, 0, kv);

      expect(response.status).toBe(200);
      expect(response.phase).toBe('participant');
      expect(response.stream).toBeDefined();
      expect(response.roundNumber).toBe(0);
      expect(response.participantIndex).toBe(0);
    });

    it('should return 204 with moderator phase when moderator is active', async () => {
      const threadId = 'thread-moderator-active';
      vi.setSystemTime(new Date());

      await setupActiveModeratorStream(kv, threadId, 0, 'moderator-123', [
        { data: '{"status":"analyzing"}', timestamp: Date.now() },
      ]);

      const response = await simulateResumeEndpoint(threadId, 0, kv);

      expect(response.status).toBe(204);
      expect(response.phase).toBe('moderator');
      expect(response.roundNumber).toBe(0);
      expect(response.moderatorId).toBe('moderator-123');
    });

    it('should return 204 with no phase when no active stream', async () => {
      const threadId = 'thread-no-active';

      const response = await simulateResumeEndpoint(threadId, 0, kv);

      expect(response.status).toBe(204);
      expect(response.phase).toBeUndefined();
    });

    it('should prioritize pre-search over participant phase', async () => {
      const threadId = 'thread-both-phases';
      vi.setSystemTime(new Date());

      // Setup both pre-search and participant streams
      await setupActivePreSearchStream(kv, threadId, 0, 'presearch-123', [
        { data: 'event: search\ndata: {}\n\n', timestamp: Date.now() },
      ]);
      await setupActiveParticipantStream(kv, threadId, 0, 0, 3, [
        { data: '0:"text"\n', timestamp: Date.now() },
      ]);

      const response = await simulateResumeEndpoint(threadId, 0, kv);

      // Pre-search phase should be detected first
      expect(response.phase).toBe('presearch');
    });
  });

  describe('navigation Away/Return Scenarios', () => {
    it('should resume participant stream when returning to page', async () => {
      const threadId = 'thread-nav-participant';
      vi.setSystemTime(new Date());

      // Simulate: user navigated away mid-stream, buffered chunks in KV
      const chunks: StreamChunk[] = [
        { data: '0:"Part"\n', timestamp: Date.now() - 5000 },
        { data: '0:"ial "\n', timestamp: Date.now() - 4000 },
        { data: '0:"conte"\n', timestamp: Date.now() - 3000 },
      ];

      await setupActiveParticipantStream(kv, threadId, 0, 1, 3, chunks);

      // User returns - AI SDK calls GET /stream with resume:true
      const response = await simulateResumeEndpoint(threadId, 0, kv);

      expect(response.status).toBe(200);
      expect(response.participantIndex).toBe(1);
      expect(response.stream).toBeDefined();
    });

    it('should detect stale stream when returning after long absence', async () => {
      const threadId = 'thread-nav-stale';

      // Simulate: user navigated away, stream became stale
      const oldTime = Date.now() - 60 * 1000; // 60 seconds ago
      const chunks: StreamChunk[] = [
        { data: '0:"Old"\n', timestamp: oldTime },
      ];

      await kv.put(`thread:${threadId}:active`, {
        streamId: generateLegacyParticipantStreamId(threadId, 0, 0),
        roundNumber: 0,
        participantIndex: 0,
        createdAt: new Date(oldTime).toISOString(),
        totalParticipants: 2,
        participantStatuses: { 0: 'active' },
      } as ThreadActiveStream);

      await kv.put(`stream:meta:${generateLegacyParticipantStreamId(threadId, 0, 0)}`, {
        streamId: generateLegacyParticipantStreamId(threadId, 0, 0),
        threadId,
        roundNumber: 0,
        participantIndex: 0,
        status: 'active' as StreamStatus,
        chunkCount: 1,
        createdAt: oldTime,
        completedAt: null,
        errorMessage: null,
      } as StreamBufferMetadata);

      await kv.put(`stream:chunks:${generateLegacyParticipantStreamId(threadId, 0, 0)}`, chunks);

      const response = await simulateResumeEndpoint(threadId, 0, kv);

      // Stale stream should return 204 with next participant info
      expect(response.status).toBe(204);
      expect(response.nextParticipantIndex).toBeDefined();
    });

    it('should handle refresh during pre-search phase', async () => {
      const threadId = 'thread-nav-presearch';
      vi.setSystemTime(new Date());

      // User refreshed during pre-search
      await setupActivePreSearchStream(kv, threadId, 0, 'presearch-456', [
        { data: 'event: analyzing\ndata: {}\n\n', timestamp: Date.now() - 2000 },
        { data: 'event: results\ndata: {"count":5}\n\n', timestamp: Date.now() - 1000 },
      ]);

      const response = await simulateResumeEndpoint(threadId, 0, kv);

      // Should return 204 with presearch phase - frontend handles resumption
      expect(response.status).toBe(204);
      expect(response.phase).toBe('presearch');
    });

    it('should handle refresh during moderator phase', async () => {
      const threadId = 'thread-nav-moderator';
      vi.setSystemTime(new Date());

      // User refreshed during moderator
      await setupActiveModeratorStream(kv, threadId, 0, 'moderator-789', [
        { data: '{"themes":["a"]}', timestamp: Date.now() - 1000 },
      ]);

      const response = await simulateResumeEndpoint(threadId, 0, kv);

      // Should return 204 with moderator phase - frontend handles resumption
      expect(response.status).toBe(204);
      expect(response.phase).toBe('moderator');
      expect(response.moderatorId).toBe('moderator-789');
    });
  });

  describe('incomplete Round Detection', () => {
    it('should detect next participant when some completed', async () => {
      const threadId = 'thread-incomplete';
      vi.setSystemTime(new Date());

      // P0 completed, P1 active, P2 not started
      await kv.put(`thread:${threadId}:active`, {
        streamId: generateLegacyParticipantStreamId(threadId, 0, 1),
        roundNumber: 0,
        participantIndex: 1,
        createdAt: new Date().toISOString(),
        totalParticipants: 3,
        participantStatuses: { 0: 'completed', 1: 'active' },
      } as ThreadActiveStream);

      await kv.put(`stream:meta:${generateLegacyParticipantStreamId(threadId, 0, 1)}`, {
        streamId: generateLegacyParticipantStreamId(threadId, 0, 1),
        threadId,
        roundNumber: 0,
        participantIndex: 1,
        status: 'active' as StreamStatus,
        chunkCount: 0,
        createdAt: Date.now(),
        completedAt: null,
        errorMessage: null,
      } as StreamBufferMetadata);

      const response = await simulateResumeEndpoint(threadId, 0, kv);

      expect(response.participantStatuses?.['0']).toBe('completed');
      expect(response.participantStatuses?.['1']).toBe('active');
      expect(response.nextParticipantIndex).toBe(1);
    });

    it('should detect round complete when all finished', async () => {
      const threadId = 'thread-complete';
      vi.setSystemTime(new Date());

      await kv.put(`thread:${threadId}:active`, {
        streamId: generateLegacyParticipantStreamId(threadId, 0, 2),
        roundNumber: 0,
        participantIndex: 2,
        createdAt: new Date().toISOString(),
        totalParticipants: 3,
        participantStatuses: { 0: 'completed', 1: 'completed', 2: 'completed' },
      } as ThreadActiveStream);

      const activeStream = await kv.get<ThreadActiveStream>(`thread:${threadId}:active`);
      const nextParticipant = findNextParticipant(activeStream!);

      expect(nextParticipant).toBeUndefined();
    });
  });

  describe('stream ID Parsing', () => {
    it('should parse pre-search stream ID', () => {
      const streamId = 'thread-abc_r0_presearch';
      const parsed = parseStreamId(streamId);

      expect(parsed?.threadId).toBe('thread-abc');
      expect(parsed?.roundNumber).toBe(0);
      expect(parsed?.phase).toBe('presearch');
    });

    it('should parse participant stream ID', () => {
      const streamId = 'thread-abc_r1_participant_2';
      const parsed = parseStreamId(streamId);

      expect(parsed?.threadId).toBe('thread-abc');
      expect(parsed?.roundNumber).toBe(1);
      expect(parsed?.phase).toBe('participant');
      expect(parsed?.participantIndex).toBe(2);
    });

    it('should parse participant stream ID with short format', () => {
      const streamId = 'thread-abc_r0_p1';
      const parsed = parseStreamId(streamId);

      expect(parsed?.threadId).toBe('thread-abc');
      expect(parsed?.roundNumber).toBe(0);
      expect(parsed?.phase).toBe('participant');
      expect(parsed?.participantIndex).toBe(1);
    });

    it('should parse summarizer stream ID', () => {
      const streamId = 'thread-abc_r2_summarizer';
      const parsed = parseStreamId(streamId);

      expect(parsed?.threadId).toBe('thread-abc');
      expect(parsed?.roundNumber).toBe(2);
      expect(parsed?.phase).toBe('summarizer');
    });

    it('should return null for invalid stream ID', () => {
      expect(parseStreamId('invalid')).toBeNull();
      expect(parseStreamId('')).toBeNull();
      expect(parseStreamId('thread_r_p')).toBeNull();
    });
  });

  describe('kV TTL Expiration', () => {
    it('should auto-expire streams after TTL (1 hour)', async () => {
      const threadId = 'thread-ttl';
      vi.setSystemTime(new Date());

      // Setup stream with 1-hour TTL
      await kv.put(`stream:test:${threadId}`, { data: 'test' }, { expirationTtl: 3600 });

      // Verify stream exists
      const beforeExpiry = await kv.get(`stream:test:${threadId}`);
      expect(beforeExpiry).not.toBeNull();

      // Simulate time passing beyond TTL
      vi.advanceTimersByTime(3601 * 1000); // 1 hour + 1 second

      // Stream should be expired
      const afterExpiry = await kv.get(`stream:test:${threadId}`);
      expect(afterExpiry).toBeNull();
    });

    it('should maintain stream within TTL window', async () => {
      const threadId = 'thread-ttl-within';
      vi.setSystemTime(new Date());

      await kv.put(`stream:test:${threadId}`, { data: 'test' }, { expirationTtl: 3600 });

      // Simulate 30 minutes passing
      vi.advanceTimersByTime(30 * 60 * 1000);

      // Stream should still exist
      const result = await kv.get(`stream:test:${threadId}`);
      expect(result).not.toBeNull();
    });
  });

  describe('complete Resumption Flow', () => {
    it('should handle full round resumption after refresh mid-P1', async () => {
      const threadId = 'thread-full-flow';
      vi.setSystemTime(new Date());

      // === Phase 1: P0 completed, P1 was streaming when refresh happened ===
      const p1Chunks: StreamChunk[] = [
        { data: '0:"Hello"\n', timestamp: Date.now() - 3000 },
        { data: '0:" from"\n', timestamp: Date.now() - 2000 },
        { data: '0:" P1"\n', timestamp: Date.now() - 1000 },
      ];

      await setupActiveParticipantStream(kv, threadId, 0, 1, 3, p1Chunks);

      // Update P0 to completed
      const activeStream = await kv.get<ThreadActiveStream>(`thread:${threadId}:active`);
      if (activeStream) {
        activeStream.participantStatuses['0'] = 'completed';
        await kv.put(`thread:${threadId}:active`, activeStream);
      }

      // === Phase 2: User returns, AI SDK resume:true triggers GET /stream ===
      const response = await simulateResumeEndpoint(threadId, 0, kv);

      // Should return SSE stream for P1 resumption
      expect(response.status).toBe(200);
      expect(response.phase).toBe('participant');
      expect(response.participantIndex).toBe(1);
      expect(response.stream).toBeDefined();
      expect(response.participantStatuses?.['0']).toBe('completed');
      expect(response.participantStatuses?.['1']).toBe('active');

      // === Phase 3: Read buffered chunks from resumed stream ===
      const reader = response.stream!.getReader();
      const chunks: string[] = [];

      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (!done && result.value) {
          chunks.push(new TextDecoder().decode(result.value));
        }
      }

      expect(chunks).toHaveLength(3);
      expect(chunks.join('')).toContain('Hello');
      expect(chunks.join('')).toContain('from');
      expect(chunks.join('')).toContain('P1');
    });

    it('should handle pre-search → participant phase transition after refresh', async () => {
      const threadId = 'thread-phase-transition';
      vi.setSystemTime(new Date());

      // === Initially: Pre-search is active ===
      await setupActivePreSearchStream(kv, threadId, 0, 'presearch-transition', [
        { data: 'event: start\ndata: {}\n\n', timestamp: Date.now() },
      ]);

      let response = await simulateResumeEndpoint(threadId, 0, kv);
      expect(response.phase).toBe('presearch');

      // === Pre-search completes, participants should start ===
      // Clear pre-search stream, setup participant stream
      await kv.delete(`presearch:meta:${generatePreSearchStreamId(threadId, 0)}`);
      await kv.delete(`presearch:chunks:${generatePreSearchStreamId(threadId, 0)}`);

      await setupActiveParticipantStream(kv, threadId, 0, 0, 2, [
        { data: '0:"Starting"\n', timestamp: Date.now() },
      ]);

      response = await simulateResumeEndpoint(threadId, 0, kv);
      expect(response.phase).toBe('participant');
      expect(response.status).toBe(200);
    });

    it('should handle multi-round conversation with refresh in round 2', async () => {
      const threadId = 'thread-multi-round';
      vi.setSystemTime(new Date());

      // Round 1 is complete, Round 2 P0 is streaming
      await setupActiveParticipantStream(kv, threadId, 1, 0, 2, [
        { data: '0:"Round 2"\n', timestamp: Date.now() },
      ]);

      const response = await simulateResumeEndpoint(threadId, 1, kv);

      expect(response.status).toBe(200);
      expect(response.roundNumber).toBe(1);
      expect(response.participantIndex).toBe(0);
    });
  });
});

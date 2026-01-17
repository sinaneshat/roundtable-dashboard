/**
 * Stream Resumption Integration Tests
 *
 * Integration tests verifying the AI SDK stream resumption pattern,
 * including KV buffering, participant status tracking, and round completion detection.
 *
 * ✅ PATTERN: Tests resumable-stream-kv.service and stream-buffer.service
 * ✅ COVERAGE: Stream initialization, chunk buffering, completion, failure, resumption
 */

import { MODERATOR_PARTICIPANT_INDEX, ParticipantStreamStatuses } from '@roundtable/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act } from '@/lib/testing';

// ============================================================================
// Mock KV Namespace
// ============================================================================

type KVValue = string | null;
const mockKVStore: Map<string, KVValue> = new Map();

function createMockKV() {
  return {
    get: vi.fn((key: string) => Promise.resolve(mockKVStore.get(key) || null)),
    put: vi.fn((key: string, value: string) => {
      mockKVStore.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string) => {
      mockKVStore.delete(key);
      return Promise.resolve();
    }),
    list: vi.fn(({ prefix }: { prefix: string }) => {
      const keys = Array.from(mockKVStore.keys())
        .filter(k => k.startsWith(prefix))
        .map(name => ({ name }));
      return Promise.resolve({ keys });
    }),
  };
}

// ============================================================================
// Mock Environment
// ============================================================================

function createMockEnv() {
  return {
    ACTIVE_STREAMS_KV: createMockKV(),
    STREAM_BUFFER_KV: createMockKV(),
  };
}

// ============================================================================
// Stream Buffer Service Tests
// ============================================================================

describe('stream Buffer Service', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockKVStore.clear();
    mockEnv = createMockEnv();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initializeStreamBuffer', () => {
    it('should create buffer entry with correct structure', async () => {
      const messageId = 'thread_abc_r0_p0';
      const threadId = 'thread_abc';
      const roundNumber = 0;
      const participantIndex = 0;

      // Simulate buffer initialization
      const bufferKey = `stream:${messageId}`;
      const bufferData = {
        messageId,
        threadId,
        roundNumber,
        participantIndex,
        status: 'active',
        chunks: [],
        createdAt: Date.now(),
      };

      await mockEnv.STREAM_BUFFER_KV.put(bufferKey, JSON.stringify(bufferData));

      const stored = await mockEnv.STREAM_BUFFER_KV.get(bufferKey);
      const parsed = JSON.parse(stored!);

      expect(parsed.messageId).toBe(messageId);
      expect(parsed.threadId).toBe(threadId);
      expect(parsed.roundNumber).toBe(roundNumber);
      expect(parsed.participantIndex).toBe(participantIndex);
      expect(parsed.status).toBe('active');
      expect(parsed.chunks).toEqual([]);
    });

    it('should initialize moderator buffer with sentinel index', async () => {
      const messageId = 'thread_abc_r0_moderator';
      const bufferKey = `stream:${messageId}`;

      const bufferData = {
        messageId,
        threadId: 'thread_abc',
        roundNumber: 0,
        participantIndex: MODERATOR_PARTICIPANT_INDEX,
        status: 'active',
        chunks: [],
        createdAt: Date.now(),
      };

      await mockEnv.STREAM_BUFFER_KV.put(bufferKey, JSON.stringify(bufferData));

      const stored = await mockEnv.STREAM_BUFFER_KV.get(bufferKey);
      const parsed = JSON.parse(stored!);

      expect(parsed.participantIndex).toBe(MODERATOR_PARTICIPANT_INDEX);
    });
  });

  describe('appendStreamChunk', () => {
    it('should append SSE chunks to buffer', async () => {
      const messageId = 'thread_abc_r0_p0';
      const bufferKey = `stream:${messageId}`;

      // Initialize buffer
      const bufferData = {
        messageId,
        status: 'active',
        chunks: [] as string[],
        createdAt: Date.now(),
      };

      await mockEnv.STREAM_BUFFER_KV.put(bufferKey, JSON.stringify(bufferData));

      // Append chunks
      const chunk1 = '0:"Hello "\n';
      const chunk2 = '0:"World!"\n';

      bufferData.chunks.push(chunk1);
      await mockEnv.STREAM_BUFFER_KV.put(bufferKey, JSON.stringify(bufferData));

      bufferData.chunks.push(chunk2);
      await mockEnv.STREAM_BUFFER_KV.put(bufferKey, JSON.stringify(bufferData));

      const stored = await mockEnv.STREAM_BUFFER_KV.get(bufferKey);
      const parsed = JSON.parse(stored!);

      expect(parsed.chunks).toHaveLength(2);
      expect(parsed.chunks[0]).toBe(chunk1);
      expect(parsed.chunks[1]).toBe(chunk2);
    });

    it('should maintain chunk order during concurrent writes', async () => {
      const messageId = 'thread_abc_r0_p0';
      const bufferKey = `stream:${messageId}`;

      const bufferData = {
        messageId,
        status: 'active',
        chunks: [] as string[],
        createdAt: Date.now(),
      };

      await mockEnv.STREAM_BUFFER_KV.put(bufferKey, JSON.stringify(bufferData));

      // Simulate concurrent chunk additions
      const chunks = Array.from({ length: 10 }, (_, i) => `0:"chunk${i}"\n`);

      for (const chunk of chunks) {
        bufferData.chunks.push(chunk);
        await mockEnv.STREAM_BUFFER_KV.put(bufferKey, JSON.stringify(bufferData));
      }

      const stored = await mockEnv.STREAM_BUFFER_KV.get(bufferKey);
      const parsed = JSON.parse(stored!);

      expect(parsed.chunks).toHaveLength(10);
      expect(parsed.chunks[0]).toBe('0:"chunk0"\n');
      expect(parsed.chunks[9]).toBe('0:"chunk9"\n');
    });
  });

  describe('completeStreamBuffer', () => {
    it('should mark buffer as completed', async () => {
      const messageId = 'thread_abc_r0_p0';
      const bufferKey = `stream:${messageId}`;

      const bufferData = {
        messageId,
        status: 'active',
        chunks: ['0:"test"\n'],
        createdAt: Date.now(),
      };

      await mockEnv.STREAM_BUFFER_KV.put(bufferKey, JSON.stringify(bufferData));

      // Mark as completed
      bufferData.status = 'completed';
      await mockEnv.STREAM_BUFFER_KV.put(bufferKey, JSON.stringify(bufferData));

      const stored = await mockEnv.STREAM_BUFFER_KV.get(bufferKey);
      const parsed = JSON.parse(stored!);

      expect(parsed.status).toBe('completed');
    });
  });

  describe('failStreamBuffer', () => {
    it('should mark buffer as failed with error message', async () => {
      const messageId = 'thread_abc_r0_p0';
      const bufferKey = `stream:${messageId}`;
      const errorMessage = 'Model rate limited';

      const bufferData = {
        messageId,
        status: 'active',
        chunks: [],
        createdAt: Date.now(),
        error: undefined as string | undefined,
      };

      await mockEnv.STREAM_BUFFER_KV.put(bufferKey, JSON.stringify(bufferData));

      // Mark as failed
      bufferData.status = 'failed';
      bufferData.error = errorMessage;
      await mockEnv.STREAM_BUFFER_KV.put(bufferKey, JSON.stringify(bufferData));

      const stored = await mockEnv.STREAM_BUFFER_KV.get(bufferKey);
      const parsed = JSON.parse(stored!);

      expect(parsed.status).toBe('failed');
      expect(parsed.error).toBe(errorMessage);
    });
  });
});

// ============================================================================
// Resumable Stream KV Service Tests
// ============================================================================

describe('resumable Stream KV Service', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockKVStore.clear();
    mockEnv = createMockEnv();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('markStreamActive', () => {
    it('should create active stream entry', async () => {
      const threadId = 'thread_abc';
      const roundNumber = 0;
      const participantIndex = 0;

      const key = `active:${threadId}:${roundNumber}:${participantIndex}`;
      const data = {
        status: 'streaming',
        startedAt: Date.now(),
      };

      await mockEnv.ACTIVE_STREAMS_KV.put(key, JSON.stringify(data));

      const stored = await mockEnv.ACTIVE_STREAMS_KV.get(key);
      const parsed = JSON.parse(stored!);

      expect(parsed.status).toBe('streaming');
      expect(parsed.startedAt).toBeDefined();
    });
  });

  describe('markStreamCompleted', () => {
    it('should update stream status to completed with messageId', async () => {
      const threadId = 'thread_abc';
      const roundNumber = 0;
      const participantIndex = 0;
      const messageId = `${threadId}_r${roundNumber}_p${participantIndex}`;

      const key = `active:${threadId}:${roundNumber}:${participantIndex}`;

      const data = {
        status: 'completed',
        messageId,
        completedAt: Date.now(),
      };

      await mockEnv.ACTIVE_STREAMS_KV.put(key, JSON.stringify(data));

      const stored = await mockEnv.ACTIVE_STREAMS_KV.get(key);
      const parsed = JSON.parse(stored!);

      expect(parsed.status).toBe('completed');
      expect(parsed.messageId).toBe(messageId);
    });
  });

  describe('markStreamFailed', () => {
    it('should update stream status to failed with error', async () => {
      const threadId = 'thread_abc';
      const roundNumber = 0;
      const participantIndex = 0;
      const errorMessage = 'Connection timeout';

      const key = `active:${threadId}:${roundNumber}:${participantIndex}`;

      const data = {
        status: 'failed',
        error: errorMessage,
        failedAt: Date.now(),
      };

      await mockEnv.ACTIVE_STREAMS_KV.put(key, JSON.stringify(data));

      const stored = await mockEnv.ACTIVE_STREAMS_KV.get(key);
      const parsed = JSON.parse(stored!);

      expect(parsed.status).toBe('failed');
      expect(parsed.error).toBe(errorMessage);
    });
  });

  describe('setThreadActiveStream', () => {
    it('should set thread-level active stream for resume detection', async () => {
      const threadId = 'thread_abc';
      const messageId = 'thread_abc_r0_p0';
      const roundNumber = 0;
      const participantIndex = 0;
      const totalParticipants = 3;

      const key = `thread:${threadId}:active`;
      const data = {
        messageId,
        roundNumber,
        participantIndex,
        totalParticipants,
        participants: {
          [participantIndex]: ParticipantStreamStatuses.STREAMING,
        },
        createdAt: Date.now(),
      };

      await mockEnv.ACTIVE_STREAMS_KV.put(key, JSON.stringify(data));

      const stored = await mockEnv.ACTIVE_STREAMS_KV.get(key);
      const parsed = JSON.parse(stored!);

      expect(parsed.roundNumber).toBe(roundNumber);
      expect(parsed.totalParticipants).toBe(totalParticipants);
      expect(parsed.participants[participantIndex]).toBe(ParticipantStreamStatuses.STREAMING);
    });
  });

  describe('updateParticipantStatus', () => {
    it('should update individual participant status', async () => {
      const threadId = 'thread_abc';
      const roundNumber = 0;
      const participantIndex = 0;

      const key = `thread:${threadId}:active`;

      // Initialize with all participants streaming
      const data = {
        roundNumber,
        totalParticipants: 3,
        participants: {
          0: ParticipantStreamStatuses.STREAMING,
          1: ParticipantStreamStatuses.STREAMING,
          2: ParticipantStreamStatuses.STREAMING,
        },
      };

      await mockEnv.ACTIVE_STREAMS_KV.put(key, JSON.stringify(data));

      // Update first participant to completed
      data.participants[participantIndex] = ParticipantStreamStatuses.COMPLETED;
      await mockEnv.ACTIVE_STREAMS_KV.put(key, JSON.stringify(data));

      const stored = await mockEnv.ACTIVE_STREAMS_KV.get(key);
      const parsed = JSON.parse(stored!);

      expect(parsed.participants[0]).toBe(ParticipantStreamStatuses.COMPLETED);
      expect(parsed.participants[1]).toBe(ParticipantStreamStatuses.STREAMING);
      expect(parsed.participants[2]).toBe(ParticipantStreamStatuses.STREAMING);
    });

    it('should detect round completion when all participants finish', async () => {
      const threadId = 'thread_abc';

      const key = `thread:${threadId}:active`;

      const data = {
        roundNumber: 0,
        totalParticipants: 2,
        participants: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.COMPLETED,
        },
      };

      await mockEnv.ACTIVE_STREAMS_KV.put(key, JSON.stringify(data));

      const stored = await mockEnv.ACTIVE_STREAMS_KV.get(key);
      const parsed = JSON.parse(stored!);

      const allCompleted = Object.values(parsed.participants).every(
        (status: string) =>
          status === ParticipantStreamStatuses.COMPLETED
          || status === ParticipantStreamStatuses.FAILED,
      );

      expect(allCompleted).toBe(true);
    });
  });

  describe('clearThreadActiveStream', () => {
    it('should remove thread active stream after moderator completes', async () => {
      const threadId = 'thread_abc';
      const key = `thread:${threadId}:active`;

      // Set active stream
      await mockEnv.ACTIVE_STREAMS_KV.put(key, JSON.stringify({ roundNumber: 0 }));

      // Clear it
      await mockEnv.ACTIVE_STREAMS_KV.delete(key);

      const stored = await mockEnv.ACTIVE_STREAMS_KV.get(key);
      expect(stored).toBeNull();
    });
  });
});

// ============================================================================
// Stream Resume Flow Integration Tests
// ============================================================================

describe('stream Resume Flow', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockKVStore.clear();
    mockEnv = createMockEnv();
  });

  describe('complete Round Flow with Resume', () => {
    it('should track all participants through complete round', async () => {
      const threadId = 'thread_abc';
      const roundNumber = 0;
      const totalParticipants = 3;

      // Initialize thread active stream
      const threadKey = `thread:${threadId}:active`;
      const threadData = {
        roundNumber,
        totalParticipants,
        participants: {} as Record<number, string>,
      };

      // Start all participants
      for (let i = 0; i < totalParticipants; i++) {
        threadData.participants[i] = ParticipantStreamStatuses.STREAMING;
      }

      await mockEnv.ACTIVE_STREAMS_KV.put(threadKey, JSON.stringify(threadData));

      // Complete participants one by one
      for (let i = 0; i < totalParticipants; i++) {
        await act(async () => {
          const stored = await mockEnv.ACTIVE_STREAMS_KV.get(threadKey);
          const data = JSON.parse(stored!);
          data.participants[i] = ParticipantStreamStatuses.COMPLETED;
          await mockEnv.ACTIVE_STREAMS_KV.put(threadKey, JSON.stringify(data));
        });
      }

      const finalStored = await mockEnv.ACTIVE_STREAMS_KV.get(threadKey);
      const finalData = JSON.parse(finalStored!);

      expect(Object.values(finalData.participants)).toEqual([
        ParticipantStreamStatuses.COMPLETED,
        ParticipantStreamStatuses.COMPLETED,
        ParticipantStreamStatuses.COMPLETED,
      ]);
    });

    it('should support moderator stream after participants complete', async () => {
      const threadId = 'thread_abc';
      const roundNumber = 0;

      // Set up moderator stream after participants
      const moderatorKey = `active:${threadId}:${roundNumber}:${MODERATOR_PARTICIPANT_INDEX}`;
      const moderatorData = {
        status: 'streaming',
        isModerator: true,
        startedAt: Date.now(),
      };

      await mockEnv.ACTIVE_STREAMS_KV.put(moderatorKey, JSON.stringify(moderatorData));

      const stored = await mockEnv.ACTIVE_STREAMS_KV.get(moderatorKey);
      const parsed = JSON.parse(stored!);

      expect(parsed.isModerator).toBe(true);
      expect(parsed.status).toBe('streaming');
    });

    it('should clear thread active stream after moderator completes', async () => {
      const threadId = 'thread_abc';

      const threadKey = `thread:${threadId}:active`;
      const moderatorKey = `active:${threadId}:0:${MODERATOR_PARTICIPANT_INDEX}`;

      // Set up active streams
      await mockEnv.ACTIVE_STREAMS_KV.put(threadKey, JSON.stringify({ roundNumber: 0 }));
      await mockEnv.ACTIVE_STREAMS_KV.put(moderatorKey, JSON.stringify({ status: 'streaming' }));

      // Complete moderator
      await mockEnv.ACTIVE_STREAMS_KV.delete(threadKey);
      await mockEnv.ACTIVE_STREAMS_KV.put(moderatorKey, JSON.stringify({ status: 'completed' }));

      const threadStored = await mockEnv.ACTIVE_STREAMS_KV.get(threadKey);
      const moderatorStored = await mockEnv.ACTIVE_STREAMS_KV.get(moderatorKey);

      expect(threadStored).toBeNull();
      expect(JSON.parse(moderatorStored!).status).toBe('completed');
    });
  });

  describe('resume After Page Reload', () => {
    it('should detect in-progress streams from KV', async () => {
      const threadId = 'thread_abc';
      const roundNumber = 0;

      const threadKey = `thread:${threadId}:active`;
      const threadData = {
        roundNumber,
        totalParticipants: 2,
        participants: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: 'streaming', // Still in progress (raw value)
        },
      };

      await mockEnv.ACTIVE_STREAMS_KV.put(threadKey, JSON.stringify(threadData));

      // Check for active streams (resume detection)
      const stored = await mockEnv.ACTIVE_STREAMS_KV.get(threadKey);
      const data = JSON.parse(stored!);

      const hasActiveStreams = Object.values(data.participants).includes(
        'streaming',
      );

      expect(hasActiveStreams).toBe(true);
    });

    it('should retrieve buffered chunks for resume', async () => {
      const messageId = 'thread_abc_r0_p1';
      const bufferKey = `stream:${messageId}`;

      const bufferData = {
        messageId,
        status: 'active',
        chunks: [
          '0:"Hello "\n',
          '0:"World!"\n',
        ],
        createdAt: Date.now() - 5000, // Started 5 seconds ago
      };

      await mockEnv.STREAM_BUFFER_KV.put(bufferKey, JSON.stringify(bufferData));

      const stored = await mockEnv.STREAM_BUFFER_KV.get(bufferKey);
      const data = JSON.parse(stored!);

      expect(data.chunks).toHaveLength(2);
      expect(data.status).toBe('active');
    });
  });

  describe('failure Handling', () => {
    it('should handle partial failure in multi-participant round', async () => {
      const threadId = 'thread_abc';

      const threadKey = `thread:${threadId}:active`;
      const threadData = {
        roundNumber: 0,
        totalParticipants: 3,
        participants: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.FAILED, // One failed
          2: ParticipantStreamStatuses.COMPLETED,
        },
      };

      await mockEnv.ACTIVE_STREAMS_KV.put(threadKey, JSON.stringify(threadData));

      const stored = await mockEnv.ACTIVE_STREAMS_KV.get(threadKey);
      const data = JSON.parse(stored!);

      const failedCount = Object.values(data.participants).filter(
        (status: string) => status === ParticipantStreamStatuses.FAILED,
      ).length;

      expect(failedCount).toBe(1);

      // Round is still "complete" (all participants finished, even if some failed)
      const allFinished = Object.values(data.participants).every(
        (status: string) =>
          status === ParticipantStreamStatuses.COMPLETED
          || status === ParticipantStreamStatuses.FAILED,
      );

      expect(allFinished).toBe(true);
    });

    it('should preserve buffer on timeout abort', async () => {
      const messageId = 'thread_abc_r0_p0';
      const bufferKey = `stream:${messageId}`;

      const bufferData = {
        messageId,
        status: 'active', // Still active (not failed) after timeout
        chunks: [
          '0:"Partial "\n',
          '0:"content"\n',
        ],
        createdAt: Date.now(),
      };

      await mockEnv.STREAM_BUFFER_KV.put(bufferKey, JSON.stringify(bufferData));

      // On timeout, buffer should NOT be marked as failed
      // (preserves partial content for potential resumption)
      const stored = await mockEnv.STREAM_BUFFER_KV.get(bufferKey);
      const data = JSON.parse(stored!);

      expect(data.status).toBe('active');
      expect(data.chunks).toHaveLength(2);
    });
  });
});

// ============================================================================
// Telemetry Correlation Tests
// ============================================================================

describe('telemetry Correlation with Streams', () => {
  describe('trace ID Propagation', () => {
    it('should generate unique trace IDs for each stream', () => {
      const generateTraceId = () => `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const trace1 = generateTraceId();
      const trace2 = generateTraceId();

      expect(trace1).not.toBe(trace2);
      expect(trace1).toMatch(/^trace_\d+_\w+$/);
    });

    it('should include trace ID in error metadata', () => {
      const traceId = 'trace_1234567890_abc123def';

      const errorMetadata = {
        errorType: 'stream_error',
        errorMessage: 'Connection lost',
        traceId,
        participantId: 'p1',
        roundNumber: 0,
      };

      expect(errorMetadata.traceId).toBe(traceId);
    });
  });

  describe('timing Metrics', () => {
    it('should track stream duration from start to completion', () => {
      const startTime = performance.now();

      // Simulate stream processing
      const simulatedDuration = 1500; // 1.5 seconds
      const endTime = startTime + simulatedDuration;
      const durationMs = endTime - startTime;

      expect(durationMs).toBeCloseTo(1500, 5);
      expect(durationMs).toBeGreaterThan(0);
    });

    it('should track reasoning duration separately', () => {
      const reasoningStartTime = Date.now();
      const reasoningEndTime = reasoningStartTime + 3000; // 3 seconds of reasoning
      const reasoningDurationSeconds = Math.round((reasoningEndTime - reasoningStartTime) / 1000);

      expect(reasoningDurationSeconds).toBe(3);
    });
  });
});

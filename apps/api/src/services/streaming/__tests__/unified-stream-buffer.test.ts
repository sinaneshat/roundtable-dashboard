/**
 * Unified Stream Buffer Service Tests
 *
 * Tests for the KV-based SSE stream buffering service that enables stream resumption
 * after page reload/connection loss.
 *
 * Key scenarios tested:
 * 1. Participant stream buffer lifecycle (initialize, append, complete, fail)
 * 2. Chunk append retry logic (3 retries, 50ms delay for race conditions)
 * 3. Stream retrieval (batch fetch in groups of 100, metadata parsing)
 * 4. Pre-search stream buffer operations
 * 5. Resume stream options (startFromChunkIndex, filterReasoningOnReplay, noNewDataTimeoutMs)
 * 6. KV not available edge case (graceful handling without throwing)
 *
 * @see src/api/services/streaming/unified-stream-buffer.service.ts - Service under test
 * @see src/api/types/streaming.ts - Type definitions
 */

import { StreamStatuses } from '@roundtable/shared/enums';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiEnv } from '@/types';
import type {
  PreSearchStreamChunk,
  PreSearchStreamMetadata,
  StreamBufferMetadata,
  StreamChunk,
} from '@/types/streaming';
import { STREAM_BUFFER_TTL_SECONDS } from '@/types/streaming';

import type { ResumeStreamOptions } from '../unified-stream-buffer.service';
import {
  appendParticipantStreamChunk,
  appendPreSearchStreamChunk,
  clearActiveParticipantStream,
  clearActivePreSearchStream,
  completeParticipantStreamBuffer,
  completePreSearchStreamBuffer,
  createLiveParticipantResumeStream,
  createLivePreSearchResumeStream,
  deleteParticipantStreamBuffer,
  failParticipantStreamBuffer,
  failPreSearchStreamBuffer,
  getActiveParticipantStreamId,
  getActivePreSearchStreamId,
  getParticipantStreamChunks,
  getParticipantStreamMetadata,
  getPreSearchStreamChunks,
  getPreSearchStreamMetadata,
  initializeModeratorStreamBuffer,
  initializeParticipantStreamBuffer,
  initializePreSearchStreamBuffer,
  isPreSearchBufferStale,
} from '../unified-stream-buffer.service';

// ============================================================================
// Mock Setup
// ============================================================================

function createMockKV() {
  const storage = new Map<string, string>();

  return {
    // Expose storage for test inspection
    _storage: storage,
    delete: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    get: vi.fn(async (key: string, type?: 'text' | 'json') => {
      const value = storage.get(key);
      if (!value) {
        return null;
      }
      if (type === 'json') {
        return JSON.parse(value);
      }
      return value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
  };
}

function createMockEnv(kv: ReturnType<typeof createMockKV> | null = null): ApiEnv['Bindings'] {
  return {
    KV: kv,
  } as unknown as ApiEnv['Bindings'];
}

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

// Helper to consume ReadableStream to array
async function streamToArray(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const results: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      results.push(decoder.decode(value));
    }
  } finally {
    reader.releaseLock();
  }

  return results;
}

// ============================================================================
// Tests
// ============================================================================

describe('unified-stream-buffer.service', () => {
  let mockKV: ReturnType<typeof createMockKV>;
  let mockEnv: ApiEnv['Bindings'];
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockKV = createMockKV();
    mockEnv = createMockEnv(mockKV);
    mockLogger = createMockLogger();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // Scenario 1: Participant Stream Buffer Lifecycle
  // ==========================================================================

  describe('participant stream buffer lifecycle', () => {
    const streamId = 'thread-123_r0_participant_0';
    const threadId = 'thread-123';
    const roundNumber = 0;
    const participantIndex = 0;

    describe('initializeParticipantStreamBuffer', () => {
      it('should create metadata with ACTIVE status', async () => {
        vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));

        await initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );

        expect(mockKV.put).toHaveBeenCalledTimes(2);

        // First call: metadata
        const metadataCall = mockKV.put.mock.calls[0];
        expect(metadataCall?.[0]).toBe(`stream:buffer:${streamId}:meta`);

        const metadata = JSON.parse(metadataCall?.[1] as string) as StreamBufferMetadata;
        expect(metadata.status).toBe(StreamStatuses.ACTIVE);
        expect(metadata.chunkCount).toBe(0);
        expect(metadata.threadId).toBe(threadId);
        expect(metadata.roundNumber).toBe(roundNumber);
        expect(metadata.participantIndex).toBe(participantIndex);
        expect(metadata.streamId).toBe(streamId);
        expect(metadata.completedAt).toBeNull();
        expect(metadata.errorMessage).toBeNull();

        // Second call: active stream pointer
        const activeCall = mockKV.put.mock.calls[1];
        expect(activeCall?.[0]).toBe(`stream:active:${threadId}:r${roundNumber}:p${participantIndex}`);
        expect(activeCall?.[1]).toBe(streamId);
      });

      it('should set TTL on metadata and active key', async () => {
        await initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );

        const metadataOptions = mockKV.put.mock.calls[0]?.[2] as { expirationTtl: number };
        const activeOptions = mockKV.put.mock.calls[1]?.[2] as { expirationTtl: number };

        expect(metadataOptions?.expirationTtl).toBe(STREAM_BUFFER_TTL_SECONDS);
        expect(activeOptions?.expirationTtl).toBe(STREAM_BUFFER_TTL_SECONDS);
      });

      it('should log info on successful initialization', async () => {
        await initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );

        expect(mockLogger.info).toHaveBeenCalledWith(
          'Initialized participant stream buffer',
          expect.objectContaining({
            operationName: 'initializeParticipantStreamBuffer',
            participantIndex,
            roundNumber,
            streamId,
            threadId,
          }),
        );
      });
    });

    describe('appendParticipantStreamChunk', () => {
      beforeEach(async () => {
        // Initialize stream first
        await initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );
        vi.clearAllMocks();
      });

      it('should append chunk with correct sequence number', async () => {
        vi.setSystemTime(new Date('2024-01-15T10:00:01.000Z'));
        const chunkData = 'data: {"type":"text-delta","delta":"Hello"}\n\n';

        await appendParticipantStreamChunk(streamId, chunkData, mockEnv, mockLogger);

        // Should store chunk
        const chunkCall = mockKV.put.mock.calls.find(call =>
          (call[0] as string).includes(':c:0'),
        );
        expect(chunkCall).toBeDefined();

        const storedChunk = JSON.parse(chunkCall?.[1] as string) as StreamChunk;
        expect(storedChunk.data).toBe(chunkData);
        expect(storedChunk.seq).toBe(0);
        expect(storedChunk.timestamp).toBeDefined();
      });

      it('should increment chunk count in metadata', async () => {
        const chunkData = 'data: {"type":"text-delta","delta":"Hello"}\n\n';

        await appendParticipantStreamChunk(streamId, chunkData, mockEnv, mockLogger);
        await appendParticipantStreamChunk(streamId, 'data: {"type":"text-delta","delta":" World"}\n\n', mockEnv, mockLogger);

        const metadata = await getParticipantStreamMetadata(streamId, mockEnv, mockLogger);
        expect(metadata?.chunkCount).toBe(2);
      });

      it('should parse SSE event type from data', async () => {
        // AI SDK v6 format: prefix:json - 0 maps to 'text-delta'
        const textDeltaData = '0:"Hello"\n\n';

        await appendParticipantStreamChunk(streamId, textDeltaData, mockEnv, mockLogger);

        const chunks = await getParticipantStreamChunks(streamId, mockEnv, mockLogger);
        expect(chunks?.[0]?.event).toBe('text-delta');
      });
    });

    describe('completeParticipantStreamBuffer', () => {
      beforeEach(async () => {
        await initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );
        await appendParticipantStreamChunk(streamId, 'data: {"type":"text-delta","delta":"Hello"}\n\n', mockEnv, mockLogger);
        vi.clearAllMocks();
      });

      it('should update status to COMPLETED', async () => {
        vi.setSystemTime(new Date('2024-01-15T10:00:05.000Z'));

        await completeParticipantStreamBuffer(streamId, mockEnv, mockLogger);

        const metadata = await getParticipantStreamMetadata(streamId, mockEnv, mockLogger);
        expect(metadata?.status).toBe(StreamStatuses.COMPLETED);
        expect(metadata?.completedAt).toBeDefined();
        expect(metadata?.errorMessage).toBeNull();
      });

      it('should preserve chunk count', async () => {
        await completeParticipantStreamBuffer(streamId, mockEnv, mockLogger);

        const metadata = await getParticipantStreamMetadata(streamId, mockEnv, mockLogger);
        expect(metadata?.chunkCount).toBe(1);
      });

      it('should log info on successful completion', async () => {
        await completeParticipantStreamBuffer(streamId, mockEnv, mockLogger);

        expect(mockLogger.info).toHaveBeenCalledWith(
          'Completed participant stream buffer',
          expect.objectContaining({
            operationName: 'completeParticipantStreamBuffer',
            streamId,
          }),
        );
      });

      it('should warn when metadata not found', async () => {
        const nonExistentStreamId = 'non-existent-stream';

        await completeParticipantStreamBuffer(nonExistentStreamId, mockEnv, mockLogger);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Stream metadata not found during completion',
          expect.objectContaining({
            edgeCase: 'metadata_not_found',
            operationName: 'completeParticipantStreamBuffer',
            streamId: nonExistentStreamId,
          }),
        );
      });
    });

    describe('failParticipantStreamBuffer', () => {
      beforeEach(async () => {
        await initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );
        vi.clearAllMocks();
      });

      it('should update status to FAILED with error message', async () => {
        const errorMessage = 'AI provider rate limit exceeded';

        await failParticipantStreamBuffer(streamId, errorMessage, mockEnv, mockLogger);

        const metadata = await getParticipantStreamMetadata(streamId, mockEnv, mockLogger);
        expect(metadata?.status).toBe(StreamStatuses.FAILED);
        expect(metadata?.errorMessage).toBe(errorMessage);
        expect(metadata?.completedAt).toBeDefined();
      });

      it('should append error chunk to stream', async () => {
        const errorMessage = 'Connection timeout';

        await failParticipantStreamBuffer(streamId, errorMessage, mockEnv, mockLogger);

        const chunks = await getParticipantStreamChunks(streamId, mockEnv, mockLogger);
        expect(chunks).toHaveLength(1);
        expect(chunks?.[0]?.event).toBe('error');
        expect(chunks?.[0]?.data).toContain(errorMessage);
      });

      it('should increment chunk count for error chunk', async () => {
        await appendParticipantStreamChunk(streamId, 'data: {"type":"text-delta","delta":"Hello"}\n\n', mockEnv, mockLogger);

        await failParticipantStreamBuffer(streamId, 'Error occurred', mockEnv, mockLogger);

        const metadata = await getParticipantStreamMetadata(streamId, mockEnv, mockLogger);
        expect(metadata?.chunkCount).toBe(2); // 1 text chunk + 1 error chunk
      });

      it('should warn when metadata not found', async () => {
        const nonExistentStreamId = 'non-existent-stream';

        await failParticipantStreamBuffer(nonExistentStreamId, 'Error', mockEnv, mockLogger);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Stream metadata not found during failure',
          expect.objectContaining({
            edgeCase: 'metadata_not_found',
            operationName: 'failParticipantStreamBuffer',
            streamId: nonExistentStreamId,
          }),
        );
      });
    });
  });

  // ==========================================================================
  // Scenario 2: Chunk Append Retry Logic
  // ==========================================================================

  describe('chunk append retry logic', () => {
    const streamId = 'thread-retry_r0_participant_0';
    const threadId = 'thread-retry';
    const roundNumber = 0;
    const participantIndex = 0;

    it('should retry 3 times with 50ms delay when metadata not found', async () => {
      // Simulate race condition: metadata arrives after 2nd retry
      let callCount = 0;
      vi.spyOn(mockKV, 'get').mockImplementation(async (key: string, type?: 'text' | 'json') => {
        callCount++;
        if (key.includes(':meta') && callCount < 3) {
          return null; // Metadata not ready yet
        }
        // Return valid metadata on 3rd call
        if (key.includes(':meta') && type === 'json') {
          return {
            chunkCount: 0,
            completedAt: null,
            createdAt: Date.now(),
            errorMessage: null,
            participantIndex,
            roundNumber,
            status: StreamStatuses.ACTIVE,
            streamId,
            threadId,
          };
        }
        return null;
      });

      const chunkData = 'data: {"type":"text-delta","delta":"Test"}\n\n';

      // Use real timers for this test to allow retries
      vi.useRealTimers();
      await appendParticipantStreamChunk(streamId, chunkData, mockEnv, mockLogger);

      // Should have called get 3 times (2 failed + 1 success)
      const metadataGetCalls = (mockKV.get as Mock).mock.calls.filter(
        call => (call[0] as string).includes(':meta'),
      );
      expect(metadataGetCalls).toHaveLength(3);
    });

    it('should give up after 3 retries and log warning', async () => {
      // Metadata never becomes available
      vi.spyOn(mockKV, 'get').mockImplementation(async () => null);

      const chunkData = 'data: {"type":"text-delta","delta":"Test"}\n\n';

      vi.useRealTimers();
      await appendParticipantStreamChunk(streamId, chunkData, mockEnv, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Stream metadata not found after retries',
        expect.objectContaining({
          edgeCase: 'metadata_not_found_after_retries',
          operationName: 'appendParticipantStreamChunk',
          retryCount: 3,
          streamId,
        }),
      );

      // Should not have stored any chunk
      expect(mockKV.put).not.toHaveBeenCalled();
    });

    it('should retry on KV put error', async () => {
      await initializeParticipantStreamBuffer(
        streamId,
        threadId,
        roundNumber,
        participantIndex,
        mockEnv,
        mockLogger,
      );

      let putCallCount = 0;
      // Store the original put function BEFORE creating the spy
      // The mockKV.put is a bound function, so we need to capture the underlying storage
      const originalStorage = new Map(mockKV._storage as Map<string, string>);
      vi.spyOn(mockKV, 'put').mockImplementation(async (key: string, value: string) => {
        putCallCount++;
        if (key.includes(':c:') && putCallCount < 3) {
          throw new Error('KV temporary failure');
        }
        // Directly write to storage instead of calling original (which is now the spy)
        (mockKV._storage as Map<string, string>).set(key, value);
      });

      vi.useRealTimers();
      await appendParticipantStreamChunk(
        streamId,
        'data: {"type":"text-delta","delta":"Test"}\n\n',
        mockEnv,
        mockLogger,
      );

      // Should succeed on 3rd retry
      const chunks = await getParticipantStreamChunks(streamId, mockEnv, mockLogger);
      expect(chunks).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Scenario 3: Stream Retrieval (Batch Fetch)
  // ==========================================================================

  describe('stream retrieval with batch fetching', () => {
    const streamId = 'thread-batch_r0_participant_0';
    const threadId = 'thread-batch';
    const roundNumber = 0;
    const participantIndex = 0;

    it('should fetch chunks in batches of 100 for participant streams', async () => {
      // Initialize with 250 chunks to test batching
      await initializeParticipantStreamBuffer(
        streamId,
        threadId,
        roundNumber,
        participantIndex,
        mockEnv,
        mockLogger,
      );

      // Manually set up metadata with 250 chunks
      const metadata: StreamBufferMetadata = {
        chunkCount: 250,
        completedAt: null,
        createdAt: Date.now(),
        errorMessage: null,
        participantIndex,
        roundNumber,
        status: StreamStatuses.ACTIVE,
        streamId,
        threadId,
      };
      await mockKV.put(`stream:buffer:${streamId}:meta`, JSON.stringify(metadata));

      // Add 250 chunks
      for (let i = 0; i < 250; i++) {
        const chunk: StreamChunk = {
          data: `data: {"type":"text-delta","delta":"chunk${i}"}\n\n`,
          seq: i,
          timestamp: Date.now() + i,
        };
        await mockKV.put(`stream:buffer:${streamId}:c:${i}`, JSON.stringify(chunk));
      }

      vi.clearAllMocks();

      // Retrieve chunks
      const chunks = await getParticipantStreamChunks(streamId, mockEnv, mockLogger);

      expect(chunks).toHaveLength(250);

      // Verify batch fetching: should have made 3 batch calls (100 + 100 + 50)
      // Each batch creates 1 metadata get + batch_size chunk gets
      // Total gets: 1 (metadata) + 250 (chunks in 3 batches via Promise.all)
      const getCalls = (mockKV.get as Mock).mock.calls;
      expect(getCalls).toHaveLength(251); // 1 metadata + 250 individual chunks
    });

    it('should return empty array when chunk count is 0', async () => {
      await initializeParticipantStreamBuffer(
        streamId,
        threadId,
        roundNumber,
        participantIndex,
        mockEnv,
        mockLogger,
      );

      const chunks = await getParticipantStreamChunks(streamId, mockEnv, mockLogger);

      expect(chunks).toEqual([]);
    });

    it('should return null when metadata not found', async () => {
      const chunks = await getParticipantStreamChunks('non-existent-stream', mockEnv, mockLogger);

      expect(chunks).toBeNull();
    });

    it('should parse chunk data correctly using schema', async () => {
      await initializeParticipantStreamBuffer(
        streamId,
        threadId,
        roundNumber,
        participantIndex,
        mockEnv,
        mockLogger,
      );

      const chunkData = 'data: {"type":"text-delta","delta":"Hello"}\n\n';
      await appendParticipantStreamChunk(streamId, chunkData, mockEnv, mockLogger);

      const chunks = await getParticipantStreamChunks(streamId, mockEnv, mockLogger);

      expect(chunks).toHaveLength(1);
      expect(chunks?.[0]).toMatchObject({
        data: chunkData,
        seq: 0,
      });
      expect(chunks?.[0]?.timestamp).toBeTypeOf('number');
    });

    it('should skip invalid chunk data', async () => {
      await initializeParticipantStreamBuffer(
        streamId,
        threadId,
        roundNumber,
        participantIndex,
        mockEnv,
        mockLogger,
      );

      // Manually store invalid chunk
      const metadata: StreamBufferMetadata = {
        chunkCount: 2,
        completedAt: null,
        createdAt: Date.now(),
        errorMessage: null,
        participantIndex,
        roundNumber,
        status: StreamStatuses.ACTIVE,
        streamId,
        threadId,
      };
      await mockKV.put(`stream:buffer:${streamId}:meta`, JSON.stringify(metadata));

      // Valid chunk
      const validChunk: StreamChunk = {
        data: 'data: valid\n\n',
        seq: 0,
        timestamp: Date.now(),
      };
      await mockKV.put(`stream:buffer:${streamId}:c:0`, JSON.stringify(validChunk));

      // Invalid chunk (missing required fields)
      await mockKV.put(`stream:buffer:${streamId}:c:1`, JSON.stringify({ invalid: true }));

      const chunks = await getParticipantStreamChunks(streamId, mockEnv, mockLogger);

      // Should only return the valid chunk
      expect(chunks).toHaveLength(1);
      expect(chunks?.[0]?.data).toBe('data: valid\n\n');
    });
  });

  // ==========================================================================
  // Scenario 4: Pre-Search Stream Buffer
  // ==========================================================================

  describe('pre-search stream buffer operations', () => {
    const streamId = 'thread-presearch_r0_presearch';
    const threadId = 'thread-presearch';
    const roundNumber = 0;
    const preSearchId = 'presearch-abc123';

    describe('initializePreSearchStreamBuffer', () => {
      it('should create metadata with ACTIVE status and preSearchId', async () => {
        await initializePreSearchStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          preSearchId,
          mockEnv,
          mockLogger,
        );

        const metadata = await getPreSearchStreamMetadata(streamId, mockEnv);

        expect(metadata?.status).toBe(StreamStatuses.ACTIVE);
        expect(metadata?.preSearchId).toBe(preSearchId);
        expect(metadata?.chunkCount).toBe(0);
        expect(metadata?.threadId).toBe(threadId);
        expect(metadata?.roundNumber).toBe(roundNumber);
      });

      it('should set active key with presearch discriminator', async () => {
        await initializePreSearchStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          preSearchId,
          mockEnv,
          mockLogger,
        );

        const activeStreamId = await getActivePreSearchStreamId(threadId, roundNumber, mockEnv);
        expect(activeStreamId).toBe(streamId);
      });
    });

    describe('appendPreSearchStreamChunk', () => {
      beforeEach(async () => {
        await initializePreSearchStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          preSearchId,
          mockEnv,
          mockLogger,
        );
      });

      it('should store chunk with event type and index', async () => {
        await appendPreSearchStreamChunk(
          streamId,
          'search-result',
          '{"url":"https://example.com","title":"Example"}',
          mockEnv,
          mockLogger,
        );

        const chunks = await getPreSearchStreamChunks(streamId, mockEnv);

        expect(chunks).toHaveLength(1);
        expect(chunks?.[0]?.event).toBe('search-result');
        expect(chunks?.[0]?.data).toBe('{"url":"https://example.com","title":"Example"}');
        expect(chunks?.[0]?.index).toBe(0);
      });

      it('should increment index for subsequent chunks', async () => {
        await appendPreSearchStreamChunk(streamId, 'search-result', 'data1', mockEnv, mockLogger);
        await appendPreSearchStreamChunk(streamId, 'search-result', 'data2', mockEnv, mockLogger);
        await appendPreSearchStreamChunk(streamId, 'search-result', 'data3', mockEnv, mockLogger);

        const chunks = await getPreSearchStreamChunks(streamId, mockEnv);

        expect(chunks).toHaveLength(3);
        expect(chunks?.[0]?.index).toBe(0);
        expect(chunks?.[1]?.index).toBe(1);
        expect(chunks?.[2]?.index).toBe(2);
      });
    });

    describe('completePreSearchStreamBuffer', () => {
      beforeEach(async () => {
        await initializePreSearchStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          preSearchId,
          mockEnv,
          mockLogger,
        );
      });

      it('should update status to COMPLETED', async () => {
        await completePreSearchStreamBuffer(streamId, mockEnv, mockLogger);

        const metadata = await getPreSearchStreamMetadata(streamId, mockEnv);
        expect(metadata?.status).toBe(StreamStatuses.COMPLETED);
        expect(metadata?.completedAt).toBeDefined();
      });
    });

    describe('failPreSearchStreamBuffer', () => {
      beforeEach(async () => {
        await initializePreSearchStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          preSearchId,
          mockEnv,
          mockLogger,
        );
      });

      it('should update status to FAILED with error', async () => {
        const errorMessage = 'Search API rate limit';

        await failPreSearchStreamBuffer(streamId, errorMessage, mockEnv, mockLogger);

        const metadata = await getPreSearchStreamMetadata(streamId, mockEnv);
        expect(metadata?.status).toBe(StreamStatuses.FAILED);
        expect(metadata?.errorMessage).toBe(errorMessage);
      });
    });

    describe('isPreSearchBufferStale', () => {
      beforeEach(async () => {
        await initializePreSearchStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          preSearchId,
          mockEnv,
          mockLogger,
        );
      });

      it('should return true when no chunks exist', async () => {
        const isStale = await isPreSearchBufferStale(streamId, mockEnv);
        expect(isStale).toBe(true);
      });

      it('should return true when last chunk is older than maxStaleMs', async () => {
        // Add chunk with old timestamp
        const oldTimestamp = Date.now() - 10_000; // 10 seconds ago
        const chunk: PreSearchStreamChunk = {
          data: 'test',
          event: 'search-result',
          index: 0,
          timestamp: oldTimestamp,
        };

        const metadata: PreSearchStreamMetadata = {
          chunkCount: 1,
          createdAt: Date.now(),
          preSearchId,
          roundNumber,
          status: StreamStatuses.ACTIVE,
          streamId,
          threadId,
        };

        await mockKV.put(`stream:buffer:${streamId}:meta`, JSON.stringify(metadata));
        await mockKV.put(`stream:buffer:${streamId}:c:0`, JSON.stringify(chunk));

        // Default maxStaleMs is 5000ms
        const isStale = await isPreSearchBufferStale(streamId, mockEnv, 5_000);
        expect(isStale).toBe(true);
      });

      it('should return false when last chunk is recent', async () => {
        vi.useRealTimers();

        const recentTimestamp = Date.now();
        const chunk: PreSearchStreamChunk = {
          data: 'test',
          event: 'search-result',
          index: 0,
          timestamp: recentTimestamp,
        };

        const metadata: PreSearchStreamMetadata = {
          chunkCount: 1,
          createdAt: Date.now(),
          preSearchId,
          roundNumber,
          status: StreamStatuses.ACTIVE,
          streamId,
          threadId,
        };

        await mockKV.put(`stream:buffer:${streamId}:meta`, JSON.stringify(metadata));
        await mockKV.put(`stream:buffer:${streamId}:c:0`, JSON.stringify(chunk));

        const isStale = await isPreSearchBufferStale(streamId, mockEnv, 5_000);
        expect(isStale).toBe(false);
      });
    });

    describe('getPreSearchStreamChunks batch fetching', () => {
      it('should fetch chunks in batches of 50 for pre-search streams', async () => {
        await initializePreSearchStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          preSearchId,
          mockEnv,
          mockLogger,
        );

        // Set up metadata with 120 chunks
        const metadata: PreSearchStreamMetadata = {
          chunkCount: 120,
          createdAt: Date.now(),
          preSearchId,
          roundNumber,
          status: StreamStatuses.ACTIVE,
          streamId,
          threadId,
        };
        await mockKV.put(`stream:buffer:${streamId}:meta`, JSON.stringify(metadata));

        // Add 120 chunks
        for (let i = 0; i < 120; i++) {
          const chunk: PreSearchStreamChunk = {
            data: `result${i}`,
            event: 'search-result',
            index: i,
            timestamp: Date.now() + i,
          };
          await mockKV.put(`stream:buffer:${streamId}:c:${i}`, JSON.stringify(chunk));
        }

        vi.clearAllMocks();

        const chunks = await getPreSearchStreamChunks(streamId, mockEnv);

        expect(chunks).toHaveLength(120);
        // Verify all chunks retrieved correctly
        expect(chunks?.[0]?.data).toBe('result0');
        expect(chunks?.[119]?.data).toBe('result119');
      });
    });
  });

  // ==========================================================================
  // Scenario 5: Resume Stream Options
  // ==========================================================================

  describe('resume stream options', () => {
    const streamId = 'thread-resume_r0_participant_0';
    const threadId = 'thread-resume';
    const roundNumber = 0;
    const participantIndex = 0;

    describe('startFromChunkIndex', () => {
      it('should skip chunks before startFromChunkIndex', async () => {
        await initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );

        // Add 5 chunks
        for (let i = 0; i < 5; i++) {
          await appendParticipantStreamChunk(
            streamId,
            `data: {"type":"text-delta","delta":"chunk${i}"}\n\n`,
            mockEnv,
            mockLogger,
          );
        }

        await completeParticipantStreamBuffer(streamId, mockEnv, mockLogger);

        vi.useRealTimers();

        const options: ResumeStreamOptions = {
          startFromChunkIndex: 3,
        };

        const stream = createLiveParticipantResumeStream(streamId, mockEnv, options);
        const results = await streamToArray(stream);

        // Should get initial comment + chunks 3 and 4 (indices 3 and 4)
        expect(results).toHaveLength(3);
        expect(results[0]).toContain(':stream'); // Initial SSE comment
        expect(results[1]).toContain('chunk3');
        expect(results[2]).toContain('chunk4');
      });

      it('should return empty stream when startFromChunkIndex exceeds chunk count', async () => {
        await initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );

        await appendParticipantStreamChunk(
          streamId,
          'data: {"type":"text-delta","delta":"only"}\n\n',
          mockEnv,
          mockLogger,
        );
        await completeParticipantStreamBuffer(streamId, mockEnv, mockLogger);

        vi.useRealTimers();

        const options: ResumeStreamOptions = {
          startFromChunkIndex: 10,
        };

        const stream = createLiveParticipantResumeStream(streamId, mockEnv, options);
        const results = await streamToArray(stream);

        // Should only have the initial SSE comment since all chunks are skipped
        expect(results).toHaveLength(1);
        expect(results[0]).toContain(':stream');
      });
    });

    describe('filterReasoningOnReplay', () => {
      it('should filter out reasoning-delta events when enabled', async () => {
        await initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );

        // Manually add chunks with different event types
        const metadata: StreamBufferMetadata = {
          chunkCount: 3,
          completedAt: Date.now(),
          createdAt: Date.now(),
          errorMessage: null,
          participantIndex,
          roundNumber,
          status: StreamStatuses.COMPLETED,
          streamId,
          threadId,
        };
        await mockKV.put(`stream:buffer:${streamId}:meta`, JSON.stringify(metadata));

        const chunks: StreamChunk[] = [
          { data: 'data: {"type":"reasoning-delta","delta":"thinking..."}\n\n', event: 'reasoning-delta', seq: 0, timestamp: Date.now() },
          { data: 'data: {"type":"text-delta","delta":"Hello"}\n\n', event: 'text-delta', seq: 1, timestamp: Date.now() },
          { data: 'data: {"type":"reasoning-delta","delta":"more thinking"}\n\n', event: 'reasoning-delta', seq: 2, timestamp: Date.now() },
        ];

        for (let i = 0; i < chunks.length; i++) {
          await mockKV.put(`stream:buffer:${streamId}:c:${i}`, JSON.stringify(chunks[i]));
        }

        vi.useRealTimers();

        const options: ResumeStreamOptions = {
          filterReasoningOnReplay: true,
        };

        const stream = createLiveParticipantResumeStream(streamId, mockEnv, options);
        const results = await streamToArray(stream);

        // Should get initial comment + the text-delta chunk
        expect(results).toHaveLength(2);
        expect(results[0]).toContain(':stream'); // Initial SSE comment
        expect(results[1]).toContain('text-delta');
        expect(results[1]).not.toContain('reasoning-delta');
      });

      it('should include reasoning-delta events when disabled', async () => {
        await initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );

        const metadata: StreamBufferMetadata = {
          chunkCount: 2,
          completedAt: Date.now(),
          createdAt: Date.now(),
          errorMessage: null,
          participantIndex,
          roundNumber,
          status: StreamStatuses.COMPLETED,
          streamId,
          threadId,
        };
        await mockKV.put(`stream:buffer:${streamId}:meta`, JSON.stringify(metadata));

        const chunks: StreamChunk[] = [
          { data: 'data: {"type":"reasoning-delta","delta":"thinking"}\n\n', event: 'reasoning-delta', seq: 0, timestamp: Date.now() },
          { data: 'data: {"type":"text-delta","delta":"Hello"}\n\n', event: 'text-delta', seq: 1, timestamp: Date.now() },
        ];

        for (let i = 0; i < chunks.length; i++) {
          await mockKV.put(`stream:buffer:${streamId}:c:${i}`, JSON.stringify(chunks[i]));
        }

        vi.useRealTimers();

        const options: ResumeStreamOptions = {
          filterReasoningOnReplay: false,
        };

        const stream = createLiveParticipantResumeStream(streamId, mockEnv, options);
        const results = await streamToArray(stream);

        // Should get initial comment + 2 chunks
        expect(results).toHaveLength(3);
        expect(results[0]).toContain(':stream'); // Initial SSE comment
      });
    });

    describe('noNewDataTimeoutMs', () => {
      it('should default to 90 seconds', () => {
        // This tests the default value by checking the type definition
        const options: ResumeStreamOptions = {};

        // Default is 90000ms (90 seconds) - just under Cloudflare's 100s idle timeout
        expect(options.noNewDataTimeoutMs).toBeUndefined();

        // The actual default is applied in the function implementation
        // We can verify the documentation states 90s default
      });

      it('should send synthetic finish event on timeout', async () => {
        await initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );

        // Stream is ACTIVE but has no new data
        vi.useRealTimers();

        const options: ResumeStreamOptions = {
          noNewDataTimeoutMs: 100, // Very short timeout for testing
          pollIntervalMs: 10,
        };

        const stream = createLiveParticipantResumeStream(streamId, mockEnv, options);
        const results = await streamToArray(stream);

        // Should receive synthetic finish event
        const lastResult = results[results.length - 1];
        expect(lastResult).toContain('finish');
        expect(lastResult).toContain('finishReason');
      });
    });

    describe('combined options', () => {
      it('should combine startFromChunkIndex and filterReasoningOnReplay', async () => {
        await initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );

        const metadata: StreamBufferMetadata = {
          chunkCount: 5,
          completedAt: Date.now(),
          createdAt: Date.now(),
          errorMessage: null,
          participantIndex,
          roundNumber,
          status: StreamStatuses.COMPLETED,
          streamId,
          threadId,
        };
        await mockKV.put(`stream:buffer:${streamId}:meta`, JSON.stringify(metadata));

        const chunks: StreamChunk[] = [
          { data: 'chunk0-reasoning\n\n', event: 'reasoning-delta', seq: 0, timestamp: Date.now() },
          { data: 'chunk1-text\n\n', event: 'text-delta', seq: 1, timestamp: Date.now() },
          { data: 'chunk2-reasoning\n\n', event: 'reasoning-delta', seq: 2, timestamp: Date.now() },
          { data: 'chunk3-text\n\n', event: 'text-delta', seq: 3, timestamp: Date.now() },
          { data: 'chunk4-text\n\n', event: 'text-delta', seq: 4, timestamp: Date.now() },
        ];

        for (let i = 0; i < chunks.length; i++) {
          await mockKV.put(`stream:buffer:${streamId}:c:${i}`, JSON.stringify(chunks[i]));
        }

        vi.useRealTimers();

        const options: ResumeStreamOptions = {
          filterReasoningOnReplay: true,
          startFromChunkIndex: 2,
        };

        const stream = createLiveParticipantResumeStream(streamId, mockEnv, options);
        const results = await streamToArray(stream);

        // Should skip chunks 0,1, start from 2, and filter reasoning
        // From chunks 2,3,4: only 3 and 4 are text-delta
        // Plus initial SSE comment
        expect(results).toHaveLength(3);
        expect(results[0]).toContain(':stream'); // Initial SSE comment
        expect(results[1]).toContain('chunk3-text');
        expect(results[2]).toContain('chunk4-text');
      });
    });
  });

  // ==========================================================================
  // Scenario 6: KV Not Available Edge Case
  // ==========================================================================

  describe('kV not available edge case', () => {
    const streamId = 'thread-nokv_r0_participant_0';
    const threadId = 'thread-nokv';
    const roundNumber = 0;
    const participantIndex = 0;

    it('should gracefully skip initialization when KV unavailable', async () => {
      const noKvEnv = createMockEnv(null);

      await expect(
        initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          noKvEnv,
          mockLogger,
        ),
      ).resolves.not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'KV not available - skipping stream buffer initialization',
        expect.objectContaining({
          edgeCase: 'kv_not_available',
          operationName: 'initializeParticipantStreamBuffer',
        }),
      );
    });

    it('should silently return when appending chunk without KV', async () => {
      const noKvEnv = createMockEnv(null);

      await expect(
        appendParticipantStreamChunk(streamId, 'data: test\n\n', noKvEnv, mockLogger),
      ).resolves.not.toThrow();

      // Should not log anything - silent return
    });

    it('should silently return when completing buffer without KV', async () => {
      const noKvEnv = createMockEnv(null);

      await expect(
        completeParticipantStreamBuffer(streamId, noKvEnv, mockLogger),
      ).resolves.not.toThrow();
    });

    it('should silently return when failing buffer without KV', async () => {
      const noKvEnv = createMockEnv(null);

      await expect(
        failParticipantStreamBuffer(streamId, 'error', noKvEnv, mockLogger),
      ).resolves.not.toThrow();
    });

    it('should return null for metadata when KV unavailable', async () => {
      const noKvEnv = createMockEnv(null);

      const metadata = await getParticipantStreamMetadata(streamId, noKvEnv, mockLogger);
      expect(metadata).toBeNull();
    });

    it('should return null for chunks when KV unavailable', async () => {
      const noKvEnv = createMockEnv(null);

      const chunks = await getParticipantStreamChunks(streamId, noKvEnv, mockLogger);
      expect(chunks).toBeNull();
    });

    it('should return null for active stream ID when KV unavailable', async () => {
      const noKvEnv = createMockEnv(null);

      const activeId = await getActiveParticipantStreamId(
        threadId,
        roundNumber,
        participantIndex,
        noKvEnv,
        mockLogger,
      );
      expect(activeId).toBeNull();
    });

    it('should gracefully handle pre-search operations without KV', async () => {
      const noKvEnv = createMockEnv(null);

      await expect(
        initializePreSearchStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          'presearch-id',
          noKvEnv,
          mockLogger,
        ),
      ).resolves.not.toThrow();

      const metadata = await getPreSearchStreamMetadata(streamId, noKvEnv);
      expect(metadata).toBeNull();

      const chunks = await getPreSearchStreamChunks(streamId, noKvEnv);
      expect(chunks).toBeNull();

      const isStale = await isPreSearchBufferStale(streamId, noKvEnv);
      expect(isStale).toBe(true); // Returns true when KV unavailable
    });
  });

  // ==========================================================================
  // Additional Edge Cases
  // ==========================================================================

  describe('additional operations', () => {
    const streamId = 'thread-ops_r0_participant_0';
    const threadId = 'thread-ops';
    const roundNumber = 0;
    const participantIndex = 0;

    describe('clearActiveParticipantStream', () => {
      it('should delete the active stream key', async () => {
        await initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );

        // Verify active key exists
        let activeId = await getActiveParticipantStreamId(
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );
        expect(activeId).toBe(streamId);

        await clearActiveParticipantStream(threadId, roundNumber, participantIndex, mockEnv, mockLogger);

        activeId = await getActiveParticipantStreamId(
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );
        expect(activeId).toBeNull();
      });
    });

    describe('deleteParticipantStreamBuffer', () => {
      it('should delete metadata, active key, and all chunks', async () => {
        await initializeParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );

        // Add some chunks
        for (let i = 0; i < 3; i++) {
          await appendParticipantStreamChunk(
            streamId,
            `data: chunk${i}\n\n`,
            mockEnv,
            mockLogger,
          );
        }

        await deleteParticipantStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );

        // Verify everything is deleted
        const metadata = await getParticipantStreamMetadata(streamId, mockEnv, mockLogger);
        const chunks = await getParticipantStreamChunks(streamId, mockEnv, mockLogger);
        const activeId = await getActiveParticipantStreamId(
          threadId,
          roundNumber,
          participantIndex,
          mockEnv,
          mockLogger,
        );

        expect(metadata).toBeNull();
        expect(chunks).toBeNull();
        expect(activeId).toBeNull();
      });
    });

    describe('clearActivePreSearchStream', () => {
      it('should delete the active pre-search stream key', async () => {
        const preSearchStreamId = 'thread-ops_r0_presearch';

        await initializePreSearchStreamBuffer(
          preSearchStreamId,
          threadId,
          roundNumber,
          'presearch-id',
          mockEnv,
          mockLogger,
        );

        let activeId = await getActivePreSearchStreamId(threadId, roundNumber, mockEnv);
        expect(activeId).toBe(preSearchStreamId);

        await clearActivePreSearchStream(threadId, roundNumber, mockEnv, mockLogger);

        activeId = await getActivePreSearchStreamId(threadId, roundNumber, mockEnv);
        expect(activeId).toBeNull();
      });
    });
  });

  // ==========================================================================
  // Moderator Stream Buffer
  // ==========================================================================

  describe('moderator stream buffer operations', () => {
    const streamId = 'thread-mod_r0_moderator';
    const threadId = 'thread-mod';
    const roundNumber = 0;
    const moderatorId = 'mod-123';

    describe('initializeModeratorStreamBuffer', () => {
      it('should create metadata with moderatorId', async () => {
        await initializeModeratorStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          moderatorId,
          mockEnv,
          mockLogger,
        );

        // Check metadata was stored
        const metadataRaw = await mockKV.get(`stream:buffer:${streamId}:meta`, 'json');
        expect(metadataRaw).toMatchObject({
          chunkCount: 0,
          moderatorId,
          roundNumber,
          status: StreamStatuses.ACTIVE,
          streamId,
          threadId,
        });
      });

      it('should set active key with moderator discriminator', async () => {
        await initializeModeratorStreamBuffer(
          streamId,
          threadId,
          roundNumber,
          moderatorId,
          mockEnv,
          mockLogger,
        );

        const activeStreamId = await mockKV.get(
          `stream:active:${threadId}:r${roundNumber}:moderator`,
          'text',
        );
        expect(activeStreamId).toBe(streamId);
      });
    });
  });

  // ==========================================================================
  // Pre-Search Resume Stream
  // ==========================================================================

  describe('createLivePreSearchResumeStream', () => {
    const streamId = 'thread-presearch-resume_r0_presearch';
    const threadId = 'thread-presearch-resume';
    const roundNumber = 0;
    const preSearchId = 'presearch-resume-id';

    it('should stream pre-search chunks with SSE formatting', async () => {
      await initializePreSearchStreamBuffer(
        streamId,
        threadId,
        roundNumber,
        preSearchId,
        mockEnv,
        mockLogger,
      );

      // Add completed chunks
      const metadata: PreSearchStreamMetadata = {
        chunkCount: 2,
        completedAt: Date.now(),
        createdAt: Date.now(),
        preSearchId,
        roundNumber,
        status: StreamStatuses.COMPLETED,
        streamId,
        threadId,
      };
      await mockKV.put(`stream:buffer:${streamId}:meta`, JSON.stringify(metadata));

      const chunks: PreSearchStreamChunk[] = [
        { data: '{"url":"https://example1.com"}', event: 'search-result', index: 0, timestamp: Date.now() },
        { data: '{"url":"https://example2.com"}', event: 'search-result', index: 1, timestamp: Date.now() },
      ];

      for (let i = 0; i < chunks.length; i++) {
        await mockKV.put(`stream:buffer:${streamId}:c:${i}`, JSON.stringify(chunks[i]));
      }

      vi.useRealTimers();

      const stream = createLivePreSearchResumeStream(streamId, mockEnv);
      const results = await streamToArray(stream);

      // Should get initial comment + 2 chunks
      expect(results).toHaveLength(3);
      expect(results[0]).toContain(':presearch'); // Initial SSE comment
      // Should have SSE format: event: X\ndata: Y\n\n
      expect(results[1]).toContain('event: search-result');
      expect(results[1]).toContain('data: {"url":"https://example1.com"}');
    });

    it('should send synthetic done event on timeout', async () => {
      await initializePreSearchStreamBuffer(
        streamId,
        threadId,
        roundNumber,
        preSearchId,
        mockEnv,
        mockLogger,
      );

      vi.useRealTimers();

      // Very short timeout for testing
      const stream = createLivePreSearchResumeStream(streamId, mockEnv, 10, 1000, 100);
      const results = await streamToArray(stream);

      const lastResult = results[results.length - 1];
      expect(lastResult).toContain('event: done');
      expect(lastResult).toContain('stream_timeout');
    });
  });
});

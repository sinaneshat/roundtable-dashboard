import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StreamStatuses } from '@/api/core/enums';
import type { ApiEnv } from '@/api/core/env';

import {
  appendStreamChunk,
  chunksToSSEStream,
  completeStreamBuffer,
  failStreamBuffer,
  initializeStreamBuffer,
} from '../stream-buffer.service';

// Mock KV
function createMockKV() {
  const store = new Map<string, string>();
  return {
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    get: vi.fn(async (key: string, type: 'text' | 'json') => {
      const value = store.get(key);
      if (!value)
        return null;
      if (type === 'json')
        return JSON.parse(value);
      return value;
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
}

describe('stream Buffer Service', () => {
  const mockKV = createMockKV();
  const mockEnv = { KV: mockKV } as Pick<ApiEnv['Bindings'], 'KV'>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the internal map of the mock
    // (We can't easily clear the closure map, so we'll just rely on unique IDs or create new mock per test if needed)
    // Actually, let's just recreate the mock per test to be safe
  });

  it('should initialize stream buffer correctly', async () => {
    const streamId = 'stream-123';
    const threadId = 'thread-1';

    await initializeStreamBuffer(streamId, threadId, 1, 0, mockEnv);

    // Verify metadata
    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('meta'),
      expect.stringContaining('"status":"active"'),
      expect.any(Object),
    );

    // Verify chunks initialized
    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('chunks'),
      '[]',
      expect.any(Object),
    );

    // Verify active tracking
    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('active'),
      streamId,
      expect.any(Object),
    );
  });

  it('should append chunks to buffer', async () => {
    const streamId = 'stream-123';
    // Setup initial state
    const initialChunks = [{ data: 'chunk1', timestamp: 100 }];
    mockKV.get.mockImplementation(async (key) => {
      if (key.includes('chunks'))
        return initialChunks;
      if (key.includes('meta'))
        return { chunkCount: 1 };
      return null;
    });

    await appendStreamChunk(streamId, 'chunk2', mockEnv);

    // Verify chunks updated
    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('chunks'),
      expect.stringContaining('chunk2'),
      expect.any(Object),
    );

    // Verify metadata updated
    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('meta'),
      expect.stringContaining('"chunkCount":2'),
      expect.any(Object),
    );
  });

  it('should complete stream buffer', async () => {
    const streamId = 'stream-123';
    // Setup initial state
    mockKV.get.mockImplementation(async (key) => {
      if (key.includes('meta'))
        return { status: StreamStatuses.ACTIVE, chunkCount: 5 };
      return null;
    });

    await completeStreamBuffer(streamId, mockEnv);

    // Verify metadata updated to completed
    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('meta'),
      expect.stringContaining(`"status":"${StreamStatuses.COMPLETED}"`),
      expect.any(Object),
    );
  });

  it('should fail stream buffer', async () => {
    const streamId = 'stream-123';
    // Setup initial state
    mockKV.get.mockImplementation(async (key) => {
      if (key.includes('meta'))
        return { status: StreamStatuses.ACTIVE };
      if (key.includes('chunks'))
        return [];
      return null;
    });

    await failStreamBuffer(streamId, 'Error message', mockEnv);

    // Verify metadata updated to failed
    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('meta'),
      expect.stringContaining(`"status":"${StreamStatuses.FAILED}"`),
      expect.any(Object),
    );
    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('meta'),
      expect.stringContaining('Error message'),
      expect.any(Object),
    );

    // Verify error chunk appended
    // AI SDK v5 error format: 3:{"error":"..."}
    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('chunks'),
      expect.stringContaining('Error message'),
      expect.any(Object),
    );
    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('chunks'),
      expect.stringContaining('3:{'),
      expect.any(Object),
    );
  });

  it('should convert chunks to SSE stream', async () => {
    const chunks = [
      { data: 'data: 0:"Hello"\n\n', timestamp: 100 },
      { data: 'data: 0:" World"\n\n', timestamp: 200 },
    ];

    const stream = chunksToSSEStream(chunks);
    const reader = stream.getReader();

    let result = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        break;
      result += new TextDecoder().decode(value);
    }

    expect(result).toBe('data: 0:"Hello"\n\ndata: 0:" World"\n\n');
  });
});

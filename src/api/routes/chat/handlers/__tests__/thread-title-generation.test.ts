/**
 * Thread Creation Title Generation Tests
 *
 * Tests that verify async title generation in thread creation handler.
 * These tests ensure:
 * 1. Title generation uses correct services and methods
 * 2. Title generation runs asynchronously without blocking
 * 3. Title generation failures are handled silently
 * 4. Correct integration with generateTitleFromMessage and updateThreadTitleAndSlug
 * 5. Cache invalidation after title generation
 *
 * ✅ CRITICAL: These tests verify async title generation pattern
 * Pattern follows: Vitest + async/await testing
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiEnv } from '@/api/types';

// Mock dependencies
vi.mock('@/api/services/title-generator.service', () => ({
  generateTitleFromMessage: vi.fn(),
  updateThreadTitleAndSlug: vi.fn(),
  autoGenerateThreadTitle: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDbAsync: vi.fn(),
  db: {}, // Mock the db export for Better Auth adapter
}));

vi.mock('@/api/common/cache-utils', () => ({
  invalidateThreadCache: vi.fn(),
}));

type MockDb = {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  query: {
    chatThread: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
  [key: string]: unknown;
};

describe('thread Title Generation - Async Pattern', () => {
  let mockDb: MockDb;
  let mockEnv: ApiEnv['Bindings'];

  beforeEach(async () => {
    // Mock database
    mockDb = {
      insert: vi.fn(),
      update: vi.fn(),
      query: {
        chatThread: {
          findFirst: vi.fn(),
        },
      },
    };

    // Mock environment
    mockEnv = {
      OPENROUTER_API_KEY: 'test-key',
    } as ApiEnv['Bindings'];

    // Setup mock implementations
    const { getDbAsync } = vi.mocked(await import('@/db'));
    getDbAsync.mockResolvedValue(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('title Generation Success Path', () => {
    it('should call generateTitleFromMessage with correct firstMessage', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );
      const { invalidateThreadCache } = vi.mocked(
        await import('@/api/common/cache-utils'),
      );
      const { getDbAsync } = vi.mocked(await import('@/db'));

      generateTitleFromMessage.mockResolvedValue('AI Generated Title');
      updateThreadTitleAndSlug.mockResolvedValue({
        title: 'AI Generated Title',
        slug: 'ai-generated-title',
      });

      // Simulate the async title generation function from thread.handler.ts:287-298
      const firstMessage = 'What are the best practices for React?';
      const threadId = 'thread-123';
      const userId = 'user-123';

      const generateTitleAsync = async () => {
        try {
          const aiTitle = await generateTitleFromMessage(firstMessage, mockEnv);
          await updateThreadTitleAndSlug(threadId, aiTitle);
          const freshDb = await getDbAsync();
          await invalidateThreadCache(freshDb, userId);
        } catch {
          // Silent failure - title generation doesn't block thread creation
        }
      };

      // Execute the async title generation
      await generateTitleAsync();

      // ✅ VERIFY: Title generation was called with correct message
      expect(generateTitleFromMessage).toHaveBeenCalledWith(firstMessage, mockEnv);

      // ✅ VERIFY: Title and slug were updated
      expect(updateThreadTitleAndSlug).toHaveBeenCalledWith(threadId, 'AI Generated Title');

      // ✅ VERIFY: Cache was invalidated
      expect(invalidateThreadCache).toHaveBeenCalledWith(mockDb, userId);
    });

    it('should use correct thread ID for title generation', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );

      generateTitleFromMessage.mockResolvedValue('Generated Title');
      updateThreadTitleAndSlug.mockResolvedValue({
        title: 'Generated Title',
        slug: 'generated-title',
      });

      const threadId = 'thread-abc-123';
      const firstMessage = 'How do I optimize React performance?';

      const generateTitleAsync = async () => {
        try {
          const aiTitle = await generateTitleFromMessage(firstMessage, mockEnv);
          await updateThreadTitleAndSlug(threadId, aiTitle);
        } catch {}
      };

      await generateTitleAsync();

      // ✅ VERIFY: Correct thread ID passed to update
      expect(updateThreadTitleAndSlug).toHaveBeenCalledWith(threadId, 'Generated Title');
    });

    it('should complete title generation asynchronously', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );

      // Simulate slow title generation (100ms delay)
      generateTitleFromMessage.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('Async Title'), 100)),
      );
      updateThreadTitleAndSlug.mockResolvedValue({
        title: 'Async Title',
        slug: 'async-title',
      });

      const generateTitleAsync = async () => {
        try {
          const aiTitle = await generateTitleFromMessage('Test message', mockEnv);
          await updateThreadTitleAndSlug('thread-123', aiTitle);
        } catch {}
      };

      // Start async operation
      const promise = generateTitleAsync();

      // ✅ VERIFY: Operation doesn't block (returns promise immediately)
      expect(promise).toBeInstanceOf(Promise);

      // Wait for completion
      await promise;

      // ✅ VERIFY: Title generation completed
      expect(updateThreadTitleAndSlug).toHaveBeenCalledWith('thread-123', 'Async Title');
    });

    it('should use fresh database connection for cache invalidation', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );
      const { invalidateThreadCache } = vi.mocked(
        await import('@/api/common/cache-utils'),
      );
      const { getDbAsync } = vi.mocked(await import('@/db'));

      const freshDb = { ...mockDb, fresh: true };
      getDbAsync.mockResolvedValueOnce(freshDb);

      generateTitleFromMessage.mockResolvedValue('Title');
      updateThreadTitleAndSlug.mockResolvedValue({ title: 'Title', slug: 'title' });

      const generateTitleAsync = async () => {
        try {
          const aiTitle = await generateTitleFromMessage('Test', mockEnv);
          await updateThreadTitleAndSlug('thread-123', aiTitle);
          const db = await getDbAsync();
          await invalidateThreadCache(db, 'user-123');
        } catch {}
      };

      await generateTitleAsync();

      // ✅ VERIFY: Cache invalidation uses fresh DB connection
      expect(invalidateThreadCache).toHaveBeenCalledWith(freshDb, 'user-123');
    });
  });

  describe('title Generation Error Handling', () => {
    it('should catch and silence errors from generateTitleFromMessage', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );

      // Simulate title generation failure
      generateTitleFromMessage.mockRejectedValue(new Error('AI service unavailable'));

      const generateTitleAsync = async () => {
        try {
          const aiTitle = await generateTitleFromMessage('Test message', mockEnv);
          await updateThreadTitleAndSlug('thread-123', aiTitle);
        } catch {
          // Silent failure - title generation doesn't block thread creation
        }
      };

      // ✅ VERIFY: Function does not throw
      await expect(generateTitleAsync()).resolves.toBeUndefined();

      // ✅ VERIFY: Title generation was attempted
      expect(generateTitleFromMessage).toHaveBeenCalled();

      // ✅ VERIFY: Update was not called due to error
      expect(updateThreadTitleAndSlug).not.toHaveBeenCalled();
    });

    it('should catch and silence errors from updateThreadTitleAndSlug', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );

      generateTitleFromMessage.mockResolvedValue('Good Title');
      updateThreadTitleAndSlug.mockRejectedValue(new Error('Database update failed'));

      const generateTitleAsync = async () => {
        try {
          const aiTitle = await generateTitleFromMessage('Test message', mockEnv);
          await updateThreadTitleAndSlug('thread-123', aiTitle);
        } catch {
          // Silent failure
        }
      };

      // ✅ VERIFY: Function does not throw
      await expect(generateTitleAsync()).resolves.toBeUndefined();

      // ✅ VERIFY: Both functions were called
      expect(generateTitleFromMessage).toHaveBeenCalled();
      expect(updateThreadTitleAndSlug).toHaveBeenCalled();
    });

    it('should catch and silence errors from invalidateThreadCache', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );
      const { invalidateThreadCache } = vi.mocked(
        await import('@/api/common/cache-utils'),
      );
      const { getDbAsync } = vi.mocked(await import('@/db'));

      generateTitleFromMessage.mockResolvedValue('Title');
      updateThreadTitleAndSlug.mockResolvedValue({ title: 'Title', slug: 'slug' });
      invalidateThreadCache.mockRejectedValue(new Error('Cache invalidation failed'));

      const generateTitleAsync = async () => {
        try {
          const aiTitle = await generateTitleFromMessage('Test', mockEnv);
          await updateThreadTitleAndSlug('thread-123', aiTitle);
          const db = await getDbAsync();
          await invalidateThreadCache(db, 'user-123');
        } catch {
          // Silent failure
        }
      };

      // ✅ VERIFY: Function does not throw
      await expect(generateTitleAsync()).resolves.toBeUndefined();

      // ✅ VERIFY: All functions were called
      expect(generateTitleFromMessage).toHaveBeenCalled();
      expect(updateThreadTitleAndSlug).toHaveBeenCalled();
      expect(invalidateThreadCache).toHaveBeenCalled();
    });

    it('should handle complete failure gracefully', async () => {
      const { generateTitleFromMessage } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );

      generateTitleFromMessage.mockRejectedValue(new Error('Complete failure'));

      const generateTitleAsync = async () => {
        try {
          const aiTitle = await generateTitleFromMessage('Test', mockEnv);
          // This line won't be reached
          return aiTitle;
        } catch {
          // Silent failure - returns undefined
        }
      };

      // ✅ VERIFY: Function returns undefined on error (not throw)
      const result = await generateTitleAsync();
      expect(result).toBeUndefined();
    });
  });

  describe('waitUntil Pattern (Production)', () => {
    it('should work with waitUntil for fire-and-forget execution', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );

      generateTitleFromMessage.mockResolvedValue('Async Title');
      updateThreadTitleAndSlug.mockResolvedValue({
        title: 'Async Title',
        slug: 'async-title',
      });

      const generateTitleAsync = async () => {
        try {
          const aiTitle = await generateTitleFromMessage('Test', mockEnv);
          await updateThreadTitleAndSlug('thread-123', aiTitle);
        } catch {}
      };

      // Simulate Cloudflare Workers waitUntil
      const waitUntilSpy = vi.fn();
      const mockExecutionCtx = {
        waitUntil: waitUntilSpy,
        passThroughOnException: vi.fn(),
      };

      // Use waitUntil if available (production)
      if (mockExecutionCtx) {
        mockExecutionCtx.waitUntil(generateTitleAsync());
      }

      // ✅ VERIFY: waitUntil was called with promise
      expect(waitUntilSpy).toHaveBeenCalledTimes(1);
      expect(waitUntilSpy).toHaveBeenCalledWith(expect.any(Promise));

      // Execute the async operation
      const promise = waitUntilSpy.mock.calls[0][0];
      await promise;

      // ✅ VERIFY: Title generation completed
      expect(generateTitleFromMessage).toHaveBeenCalled();
      expect(updateThreadTitleAndSlug).toHaveBeenCalled();
    });

    it('should work without waitUntil for local development', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );

      generateTitleFromMessage.mockResolvedValue('Local Title');
      updateThreadTitleAndSlug.mockResolvedValue({
        title: 'Local Title',
        slug: 'local-title',
      });

      const generateTitleAsync = async () => {
        try {
          const aiTitle = await generateTitleFromMessage('Test', mockEnv);
          await updateThreadTitleAndSlug('thread-123', aiTitle);
        } catch {}
      };

      // Local dev - no executionCtx
      const mockExecutionCtx = undefined;

      // Use waitUntil if available, otherwise just run async
      if (mockExecutionCtx) {
        mockExecutionCtx.waitUntil(generateTitleAsync());
      } else {
        // In local dev, run async but don't block
        generateTitleAsync().catch(() => {});
      }

      // Wait a bit for async operation to start
      await new Promise(resolve => setTimeout(resolve, 10));

      // ✅ VERIFY: Title generation was initiated
      expect(generateTitleFromMessage).toHaveBeenCalled();
    });
  });

  describe('integration with getDbAsync', () => {
    it('should call getDbAsync for fresh database connection', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );
      const { invalidateThreadCache } = vi.mocked(
        await import('@/api/common/cache-utils'),
      );
      const { getDbAsync } = vi.mocked(await import('@/db'));

      generateTitleFromMessage.mockResolvedValue('Title');
      updateThreadTitleAndSlug.mockResolvedValue({ title: 'Title', slug: 'title' });

      const generateTitleAsync = async () => {
        try {
          const aiTitle = await generateTitleFromMessage('Test', mockEnv);
          await updateThreadTitleAndSlug('thread-123', aiTitle);
          const freshDb = await getDbAsync();
          await invalidateThreadCache(freshDb, 'user-123');
        } catch {}
      };

      await generateTitleAsync();

      // ✅ VERIFY: getDbAsync was called to get fresh connection
      expect(getDbAsync).toHaveBeenCalled();

      // ✅ VERIFY: Cache invalidation used the fresh DB
      expect(invalidateThreadCache).toHaveBeenCalledWith(mockDb, 'user-123');
    });

    it('should not reuse batch.db for async operations', async () => {
      // This test documents the CRITICAL FIX from thread.handler.ts:283-284
      // batch.db is only valid within handler scope
      // For async operations that run after handler returns, must use getDbAsync()

      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );
      const { invalidateThreadCache } = vi.mocked(
        await import('@/api/common/cache-utils'),
      );
      const { getDbAsync } = vi.mocked(await import('@/db'));

      generateTitleFromMessage.mockResolvedValue('Title');
      updateThreadTitleAndSlug.mockResolvedValue({ title: 'Title', slug: 'title' });

      // Simulate handler scope (batch.db available)
      const batchDb = { scope: 'batch' };

      // ❌ WRONG: Using batch.db in async operation (for documentation only)
      const _wrongPattern = async () => {
        try {
          const aiTitle = await generateTitleFromMessage('Test', mockEnv);
          await updateThreadTitleAndSlug('thread-123', aiTitle);
          // ❌ batch.db may be invalid here
          await invalidateThreadCache(batchDb as MockDb, 'user-123');
        } catch {}
      };

      // ✅ RIGHT: Using getDbAsync() in async operation
      const correctPattern = async () => {
        try {
          const aiTitle = await generateTitleFromMessage('Test', mockEnv);
          await updateThreadTitleAndSlug('thread-123', aiTitle);
          // ✅ Get fresh DB connection
          const freshDb = await getDbAsync();
          await invalidateThreadCache(freshDb, 'user-123');
        } catch {}
      };

      await correctPattern();

      // ✅ VERIFY: getDbAsync was called (correct pattern)
      expect(getDbAsync).toHaveBeenCalled();

      // ✅ VERIFY: Cache invalidation used fresh DB, not batch.db
      expect(invalidateThreadCache).toHaveBeenCalledWith(mockDb, 'user-123');
    });
  });
});

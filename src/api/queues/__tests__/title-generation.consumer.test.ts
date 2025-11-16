/**
 * Title Generation Queue Consumer Tests
 *
 * Tests that verify title generation queue consumer behavior.
 * These tests ensure:
 * 1. Messages are processed correctly
 * 2. Title generation service is called with correct parameters
 * 3. Thread title and slug are updated properly
 * 4. Cache is invalidated after updates
 * 5. Error handling with retries works correctly
 * 6. Batch processing completes successfully
 *
 * ✅ PATTERN: Following established Vitest + async/await testing patterns
 * Reference: src/api/routes/chat/handlers/__tests__/thread-title-generation.test.ts
 */

import type { Message, MessageBatch } from '@cloudflare/workers-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TitleGenerationQueueMessage } from '@/api/types/queue';

type QueueMessage<T> = Message<T>;
// Mock dependencies
vi.mock('@/api/services/title-generator.service', () => ({
  generateTitleFromMessage: vi.fn(),
  updateThreadTitleAndSlug: vi.fn(),
}));

vi.mock('@/api/common/cache-utils', () => ({
  invalidateThreadCache: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDbAsync: vi.fn(),
  db: {},
}));

describe('title Generation Queue Consumer', () => {
  let mockEnv: CloudflareEnv;
  let mockDb: unknown;

  beforeEach(async () => {
    // Mock environment bindings
    mockEnv = {
      OPENROUTER_API_KEY: 'test-key',
    } as CloudflareEnv;

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

    // Setup mock implementations
    const { getDbAsync } = vi.mocked(await import('@/db'));
    getDbAsync.mockResolvedValue(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('message Processing Success', () => {
    it('should process single message successfully', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );
      const { invalidateThreadCache } = vi.mocked(await import('@/api/common/cache-utils'));
      const { handleTitleGenerationQueue } = await import('../title-generation.consumer');

      // Mock successful title generation
      generateTitleFromMessage.mockResolvedValue('AI Generated Title');
      updateThreadTitleAndSlug.mockResolvedValue({
        title: 'AI Generated Title',
        slug: 'ai-generated-title',
      });

      // Create mock message
      const mockMessage: TitleGenerationQueueMessage = {
        threadId: 'thread-123',
        userId: 'user-123',
        firstMessage: 'What are the best practices for React?',
        queuedAt: new Date().toISOString(),
      };

      const queueMessage: Partial<QueueMessage<TitleGenerationQueueMessage>> = {
        id: 'msg-1',
        timestamp: new Date(),
        body: mockMessage,
        attempts: 0,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch: MessageBatch<TitleGenerationQueueMessage> = {
        queue: 'title-generation-queue',
        messages: [queueMessage as QueueMessage<TitleGenerationQueueMessage>],
      };

      // Process the batch
      await handleTitleGenerationQueue(batch, mockEnv);

      // ✅ VERIFY: Title generation was called with correct parameters
      expect(generateTitleFromMessage).toHaveBeenCalledWith(
        'What are the best practices for React?',
        mockEnv,
      );

      // ✅ VERIFY: Title and slug were updated
      expect(updateThreadTitleAndSlug).toHaveBeenCalledWith('thread-123', 'AI Generated Title');

      // ✅ VERIFY: Cache was invalidated
      expect(invalidateThreadCache).toHaveBeenCalledWith(mockDb, 'user-123');

      // ✅ VERIFY: Message was acknowledged
      expect(queueMessage.ack).toHaveBeenCalled();
    });

    it('should process multiple messages in batch', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );
      const { handleTitleGenerationQueue } = await import('../title-generation.consumer');

      generateTitleFromMessage.mockResolvedValue('Generated Title');
      updateThreadTitleAndSlug.mockResolvedValue({
        title: 'Generated Title',
        slug: 'generated-title',
      });

      // Create multiple mock messages
      const messages: Array<Partial<QueueMessage<TitleGenerationQueueMessage>>> = [
        {
          id: 'msg-1',
          timestamp: new Date(),
          body: {
            threadId: 'thread-1',
            userId: 'user-1',
            firstMessage: 'Message 1',
            queuedAt: new Date().toISOString(),
          },
          attempts: 0,
          ack: vi.fn(),
          retry: vi.fn(),
        },
        {
          id: 'msg-2',
          timestamp: new Date(),
          body: {
            threadId: 'thread-2',
            userId: 'user-2',
            firstMessage: 'Message 2',
            queuedAt: new Date().toISOString(),
          },
          attempts: 0,
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ];

      const batch: MessageBatch<TitleGenerationQueueMessage> = {
        queue: 'title-generation-queue',
        messages: messages as Array<QueueMessage<TitleGenerationQueueMessage>>,
      };

      await handleTitleGenerationQueue(batch, mockEnv);

      // ✅ VERIFY: Both messages were processed
      expect(generateTitleFromMessage).toHaveBeenCalledTimes(2);
      expect(updateThreadTitleAndSlug).toHaveBeenCalledTimes(2);

      // ✅ VERIFY: Both messages were acknowledged
      expect(messages[0].ack).toHaveBeenCalled();
      expect(messages[1].ack).toHaveBeenCalled();
    });
  });

  describe('error Handling and Retries', () => {
    it('should retry on title generation failure', async () => {
      const { generateTitleFromMessage } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );
      const { handleTitleGenerationQueue } = await import('../title-generation.consumer');

      // Mock title generation failure
      generateTitleFromMessage.mockRejectedValue(new Error('AI service unavailable'));

      const queueMessage: Partial<QueueMessage<TitleGenerationQueueMessage>> = {
        id: 'msg-1',
        timestamp: new Date(),
        body: {
          threadId: 'thread-123',
          userId: 'user-123',
          firstMessage: 'Test message',
          queuedAt: new Date().toISOString(),
        },
        attempts: 0,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch: MessageBatch<TitleGenerationQueueMessage> = {
        queue: 'title-generation-queue',
        messages: [queueMessage as QueueMessage<TitleGenerationQueueMessage>],
      };

      await handleTitleGenerationQueue(batch, mockEnv);

      // ✅ VERIFY: Message was NOT acknowledged
      expect(queueMessage.ack).not.toHaveBeenCalled();

      // ✅ VERIFY: Message was scheduled for retry
      expect(queueMessage.retry).toHaveBeenCalled();

      // ✅ VERIFY: Retry delay is correct (60s for first attempt)
      expect(queueMessage.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    });

    it('should use exponential backoff for retries', async () => {
      const { generateTitleFromMessage } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );
      const { handleTitleGenerationQueue } = await import('../title-generation.consumer');

      generateTitleFromMessage.mockRejectedValue(new Error('Failed'));

      // Test different attempt numbers
      const testCases = [
        { attempts: 0, expectedDelay: 60 }, // 60 * 2^0 = 60
        { attempts: 1, expectedDelay: 120 }, // 60 * 2^1 = 120
        { attempts: 2, expectedDelay: 240 }, // 60 * 2^2 = 240
        { attempts: 3, expectedDelay: 300 }, // 60 * 2^3 = 480, capped at 300
      ];

      for (const testCase of testCases) {
        const queueMessage: Partial<QueueMessage<TitleGenerationQueueMessage>> = {
          id: `msg-${testCase.attempts}`,
          timestamp: new Date(),
          body: {
            threadId: 'thread-123',
            userId: 'user-123',
            firstMessage: 'Test',
            queuedAt: new Date().toISOString(),
          },
          attempts: testCase.attempts,
          ack: vi.fn(),
          retry: vi.fn(),
        };

        const batch: MessageBatch<TitleGenerationQueueMessage> = {
          queue: 'title-generation-queue',
          messages: [queueMessage as QueueMessage<TitleGenerationQueueMessage>],
        };

        await handleTitleGenerationQueue(batch, mockEnv);

        // ✅ VERIFY: Correct exponential backoff delay
        expect(queueMessage.retry).toHaveBeenCalledWith({
          delaySeconds: testCase.expectedDelay,
        });

        vi.clearAllMocks();
      }
    });

    it('should handle database update failures', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );
      const { handleTitleGenerationQueue } = await import('../title-generation.consumer');

      generateTitleFromMessage.mockResolvedValue('Title');
      updateThreadTitleAndSlug.mockRejectedValue(new Error('DB update failed'));

      const queueMessage: Partial<QueueMessage<TitleGenerationQueueMessage>> = {
        id: 'msg-1',
        timestamp: new Date(),
        body: {
          threadId: 'thread-123',
          userId: 'user-123',
          firstMessage: 'Test',
          queuedAt: new Date().toISOString(),
        },
        attempts: 0,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch: MessageBatch<TitleGenerationQueueMessage> = {
        queue: 'title-generation-queue',
        messages: [queueMessage as QueueMessage<TitleGenerationQueueMessage>],
      };

      await handleTitleGenerationQueue(batch, mockEnv);

      // ✅ VERIFY: Title generation was attempted
      expect(generateTitleFromMessage).toHaveBeenCalled();

      // ✅ VERIFY: Message was scheduled for retry (not acknowledged)
      expect(queueMessage.ack).not.toHaveBeenCalled();
      expect(queueMessage.retry).toHaveBeenCalled();
    });

    it('should handle cache invalidation failures gracefully', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );
      const { invalidateThreadCache } = vi.mocked(await import('@/api/common/cache-utils'));
      const { handleTitleGenerationQueue } = await import('../title-generation.consumer');

      generateTitleFromMessage.mockResolvedValue('Title');
      updateThreadTitleAndSlug.mockResolvedValue({ title: 'Title', slug: 'title' });
      invalidateThreadCache.mockRejectedValue(new Error('Cache error'));

      const queueMessage: Partial<QueueMessage<TitleGenerationQueueMessage>> = {
        id: 'msg-1',
        timestamp: new Date(),
        body: {
          threadId: 'thread-123',
          userId: 'user-123',
          firstMessage: 'Test',
          queuedAt: new Date().toISOString(),
        },
        attempts: 0,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch: MessageBatch<TitleGenerationQueueMessage> = {
        queue: 'title-generation-queue',
        messages: [queueMessage as QueueMessage<TitleGenerationQueueMessage>],
      };

      await handleTitleGenerationQueue(batch, mockEnv);

      // ✅ VERIFY: Message was scheduled for retry
      expect(queueMessage.retry).toHaveBeenCalled();
    });
  });

  describe('batch Processing', () => {
    it('should process mixed success and failure messages', async () => {
      const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
        await import('@/api/services/title-generator.service'),
      );
      const { invalidateThreadCache } = vi.mocked(await import('@/api/common/cache-utils'));
      const { handleTitleGenerationQueue } = await import('../title-generation.consumer');

      // First call succeeds, second fails
      generateTitleFromMessage
        .mockResolvedValueOnce('Success Title')
        .mockRejectedValueOnce(new Error('Failed'));

      updateThreadTitleAndSlug.mockResolvedValue({ title: 'Title', slug: 'slug' });
      invalidateThreadCache.mockResolvedValue(undefined); // Ensure cache invalidation succeeds

      const messages: Array<Partial<QueueMessage<TitleGenerationQueueMessage>>> = [
        {
          id: 'msg-success',
          timestamp: new Date(),
          body: {
            threadId: 'thread-1',
            userId: 'user-1',
            firstMessage: 'Success message',
            queuedAt: new Date().toISOString(),
          },
          attempts: 0,
          ack: vi.fn(),
          retry: vi.fn(),
        },
        {
          id: 'msg-fail',
          timestamp: new Date(),
          body: {
            threadId: 'thread-2',
            userId: 'user-2',
            firstMessage: 'Fail message',
            queuedAt: new Date().toISOString(),
          },
          attempts: 0,
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ];

      const batch: MessageBatch<TitleGenerationQueueMessage> = {
        queue: 'title-generation-queue',
        messages: messages as Array<QueueMessage<TitleGenerationQueueMessage>>,
      };

      await handleTitleGenerationQueue(batch, mockEnv);

      // ✅ VERIFY: Success message was acknowledged
      expect(messages[0].ack).toHaveBeenCalled();
      expect(messages[0].retry).not.toHaveBeenCalled();

      // ✅ VERIFY: Failed message was retried
      expect(messages[1].ack).not.toHaveBeenCalled();
      expect(messages[1].retry).toHaveBeenCalled();
    });
  });
});

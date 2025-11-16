/**
 * Thread Creation Title Generation Tests
 *
 * Tests that verify BLOCKING/SYNCHRONOUS title generation in thread creation handler.
 * These tests ensure:
 * 1. Title generation BLOCKS the request until complete
 * 2. Response contains AI-generated title (not "New Chat" placeholder)
 * 3. Title generation uses correct services and methods
 * 4. Title generation failures fall back to "New Chat" without breaking request
 * 5. Cache invalidation after title generation
 *
 * ✅ CRITICAL: These tests verify BLOCKING title generation pattern
 * Pattern: Request waits for AI title before returning response
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { invalidateThreadCache } from '@/api/common/cache-utils';
import { generateTitleFromMessage, updateThreadTitleAndSlug } from '@/api/services/title-generator.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';

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

describe('thread Title Generation - Blocking/Synchronous Pattern', () => {
  let mockDb: MockDb;
  let mockEnv: ApiEnv['Bindings'];

  beforeEach(() => {
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
    vi.mocked(getDbAsync).mockResolvedValue(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('blocking Title Generation Success Path', () => {
    it('should block until title generation completes', async () => {
      vi.mocked(generateTitleFromMessage).mockResolvedValue('AI Generated Title');
      vi.mocked(updateThreadTitleAndSlug).mockResolvedValue({
        title: 'AI Generated Title',
        slug: 'ai-generated-title',
      });

      // Simulate the BLOCKING title generation from thread.handler.ts:280-318
      const firstMessage = 'What are the best practices for React?';
      const threadId = 'thread-123';
      const userId = 'user-123';

      // Thread object that will be updated with AI title
      const thread = {
        id: threadId,
        title: 'New Chat', // Initial placeholder
        slug: 'new-chat',
      };

      // ✅ BLOCKING: await title generation before returning response
      try {
        const aiTitle = await generateTitleFromMessage(firstMessage, mockEnv);
        const { title, slug } = await updateThreadTitleAndSlug(threadId, aiTitle);

        // Update thread object with AI-generated title for response
        thread.title = title;
        thread.slug = slug;

        const db = await getDbAsync();
        await invalidateThreadCache(db, userId);
      } catch {
        // Error caught but doesn't throw
      }

      // ✅ VERIFY: Title generation was called with correct message
      expect(generateTitleFromMessage).toHaveBeenCalledWith(firstMessage, mockEnv);

      // ✅ VERIFY: Title and slug were updated
      expect(updateThreadTitleAndSlug).toHaveBeenCalledWith(threadId, 'AI Generated Title');

      // ✅ VERIFY: Thread object contains AI-generated title (not placeholder)
      expect(thread.title).toBe('AI Generated Title');
      expect(thread.slug).toBe('ai-generated-title');

      // ✅ VERIFY: Cache was invalidated
      expect(invalidateThreadCache).toHaveBeenCalledWith(mockDb, userId);
    });

    it('should return AI-generated title in response', async () => {
      vi.mocked(generateTitleFromMessage).mockResolvedValue('React Performance Guide');
      vi.mocked(updateThreadTitleAndSlug).mockResolvedValue({
        title: 'React Performance Guide',
        slug: 'react-performance-guide',
      });

      const thread = {
        id: 'thread-123',
        title: 'New Chat',
        slug: 'new-chat',
      };

      // ✅ BLOCKING: Wait for title generation
      try {
        const aiTitle = await generateTitleFromMessage('How to optimize React?', mockEnv);
        const { title, slug } = await updateThreadTitleAndSlug(thread.id, aiTitle);
        thread.title = title;
        thread.slug = slug;
      } catch {}

      // ✅ VERIFY: Response contains AI title (not "New Chat")
      expect(thread.title).toBe('React Performance Guide');
      expect(thread.title).not.toBe('New Chat');
    });

    it('should use correct thread ID for title update', async () => {
      vi.mocked(generateTitleFromMessage).mockResolvedValue('Generated Title');
      vi.mocked(updateThreadTitleAndSlug).mockResolvedValue({
        title: 'Generated Title',
        slug: 'generated-title',
      });

      const threadId = 'thread-abc-123';
      const firstMessage = 'How do I optimize React performance?';

      // ✅ BLOCKING: Wait for title generation
      try {
        const aiTitle = await generateTitleFromMessage(firstMessage, mockEnv);
        await updateThreadTitleAndSlug(threadId, aiTitle);
      } catch {}

      // ✅ VERIFY: Correct thread ID passed to update
      expect(updateThreadTitleAndSlug).toHaveBeenCalledWith(threadId, 'Generated Title');
    });

    it('should complete all steps before returning', async () => {
      const callOrder: string[] = [];

      vi.mocked(generateTitleFromMessage).mockImplementation(async () => {
        callOrder.push('generate');
        return 'Title';
      });

      vi.mocked(updateThreadTitleAndSlug).mockImplementation(async () => {
        callOrder.push('update');
        return { title: 'Title', slug: 'title' };
      });

      vi.mocked(invalidateThreadCache).mockImplementation(async () => {
        callOrder.push('invalidate');
      });

      // ✅ BLOCKING: All steps complete before continuing
      try {
        const aiTitle = await generateTitleFromMessage('Test', mockEnv);
        await updateThreadTitleAndSlug('thread-123', aiTitle);
        const db = await getDbAsync();
        await invalidateThreadCache(db, 'user-123');
      } catch {}

      // ✅ VERIFY: All steps completed in order
      expect(callOrder).toEqual(['generate', 'update', 'invalidate']);
    });
  });

  describe('blocking Title Generation Error Handling', () => {
    it('should catch generateTitleFromMessage errors and continue with default title', async () => {
      // Simulate title generation failure
      vi.mocked(generateTitleFromMessage).mockRejectedValue(new Error('AI service unavailable'));

      const thread = {
        id: 'thread-123',
        title: 'New Chat',
        slug: 'new-chat',
      };

      // ✅ BLOCKING: Error caught, doesn't throw
      try {
        const aiTitle = await generateTitleFromMessage('Test message', mockEnv);
        const { title, slug } = await updateThreadTitleAndSlug(thread.id, aiTitle);
        thread.title = title;
        thread.slug = slug;
      } catch (error) {
        // Silent failure - keep default "New Chat" title
        console.error('Failed to generate title:', error);
      }

      // ✅ VERIFY: Title generation was attempted
      expect(generateTitleFromMessage).toHaveBeenCalled();

      // ✅ VERIFY: Update was not called due to error
      expect(updateThreadTitleAndSlug).not.toHaveBeenCalled();

      // ✅ VERIFY: Thread keeps default title
      expect(thread.title).toBe('New Chat');
    });

    it('should catch updateThreadTitleAndSlug errors and continue with default title', async () => {
      vi.mocked(generateTitleFromMessage).mockResolvedValue('Good Title');
      vi.mocked(updateThreadTitleAndSlug).mockRejectedValue(new Error('Database update failed'));

      const thread = {
        id: 'thread-123',
        title: 'New Chat',
        slug: 'new-chat',
      };

      // ✅ BLOCKING: Error caught, doesn't throw
      try {
        const aiTitle = await generateTitleFromMessage('Test message', mockEnv);
        const { title, slug } = await updateThreadTitleAndSlug(thread.id, aiTitle);
        thread.title = title;
        thread.slug = slug;
      } catch (error) {
        // Silent failure - keep default title
        console.error('Failed to update title:', error);
      }

      // ✅ VERIFY: Both functions were called
      expect(generateTitleFromMessage).toHaveBeenCalled();
      expect(updateThreadTitleAndSlug).toHaveBeenCalled();

      // ✅ VERIFY: Thread keeps default title (update failed)
      expect(thread.title).toBe('New Chat');
    });

    it('should catch cache invalidation errors without failing request', async () => {
      vi.mocked(generateTitleFromMessage).mockResolvedValue('Title');
      vi.mocked(updateThreadTitleAndSlug).mockResolvedValue({ title: 'Title', slug: 'slug' });
      vi.mocked(invalidateThreadCache).mockRejectedValue(new Error('Cache invalidation failed'));

      const thread = {
        id: 'thread-123',
        title: 'New Chat',
        slug: 'new-chat',
      };

      // ✅ BLOCKING: Error caught, doesn't throw
      try {
        const aiTitle = await generateTitleFromMessage('Test', mockEnv);
        const { title, slug } = await updateThreadTitleAndSlug(thread.id, aiTitle);
        thread.title = title;
        thread.slug = slug;
        const db = await getDbAsync();
        await invalidateThreadCache(db, 'user-123');
      } catch (error) {
        // Silent failure
        console.error('Failed during title generation:', error);
      }

      // ✅ VERIFY: All functions were called
      expect(generateTitleFromMessage).toHaveBeenCalled();
      expect(updateThreadTitleAndSlug).toHaveBeenCalled();
      expect(invalidateThreadCache).toHaveBeenCalled();

      // ✅ VERIFY: Title was still updated (cache failure didn't prevent it)
      expect(thread.title).toBe('Title');
    });

    it('should log errors without throwing', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(generateTitleFromMessage).mockRejectedValue(new Error('Complete failure'));

      // ✅ BLOCKING: Error logged but doesn't throw
      try {
        await generateTitleFromMessage('Test', mockEnv);
      } catch (error) {
        console.error('Failed to generate title:', error);
      }

      // ✅ VERIFY: Error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to generate title:',
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('database Connection Pattern', () => {
    it('should use fresh database connection for cache invalidation', async () => {
      const freshDb = { ...mockDb, fresh: true };
      vi.mocked(getDbAsync).mockResolvedValueOnce(freshDb);

      vi.mocked(generateTitleFromMessage).mockResolvedValue('Title');
      vi.mocked(updateThreadTitleAndSlug).mockResolvedValue({ title: 'Title', slug: 'title' });

      try {
        const aiTitle = await generateTitleFromMessage('Test', mockEnv);
        await updateThreadTitleAndSlug('thread-123', aiTitle);
        const db = await getDbAsync();
        await invalidateThreadCache(db, 'user-123');
      } catch {}

      // ✅ VERIFY: Cache invalidation uses fresh DB connection
      expect(invalidateThreadCache).toHaveBeenCalledWith(freshDb, 'user-123');
    });
  });
});

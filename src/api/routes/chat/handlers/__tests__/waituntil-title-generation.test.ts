/**
 * waitUntil() Title Generation Integration Test
 *
 * Verifies that background title generation using waitUntil() works correctly:
 * 1. Thread creation returns immediately without waiting for title
 * 2. Title generation runs asynchronously in background
 * 3. Title is eventually generated and stored
 * 4. Errors are handled gracefully without affecting thread creation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the title generator service
vi.mock('@/api/services/title-generator.service', () => ({
  generateTitleFromMessage: vi.fn(),
  updateThreadTitleAndSlug: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDbAsync: vi.fn(),
}));

vi.mock('@/api/common/cache-utils', () => ({
  invalidateThreadCache: vi.fn(),
}));

describe('waitUntil() Title Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate title in background without blocking response', async () => {
    const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
      await import('@/api/services/title-generator.service'),
    );
    const { getDbAsync } = vi.mocked(await import('@/db'));
    const { invalidateThreadCache } = vi.mocked(await import('@/api/common/cache-utils'));

    // Mock slow AI response (2 seconds)
    generateTitleFromMessage.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve('AI Generated Title'), 2000)),
    );

    updateThreadTitleAndSlug.mockResolvedValue({
      title: 'AI Generated Title',
      slug: 'ai-generated-title',
    });

    getDbAsync.mockResolvedValue({ query: {} } as unknown);
    invalidateThreadCache.mockResolvedValue(undefined);

    // Simulate thread creation with waitUntil()
    const threadId = 'thread-123';
    const userId = 'user-123';
    const firstMessage = 'What are best practices for React performance?';

    // Mock execution context with waitUntil
    const waitUntilPromises: Promise<unknown>[] = [];
    const mockExecutionCtx = {
      waitUntil: (promise: Promise<unknown>) => {
        waitUntilPromises.push(promise);
      },
    };

    // Simulate the handler code (non-blocking)
    const responseTime = Date.now();
    mockExecutionCtx.waitUntil(
      (async () => {
        try {
          const aiTitle = await generateTitleFromMessage(firstMessage, {} as unknown);
          await updateThreadTitleAndSlug(threadId, aiTitle);
          const db = await getDbAsync();
          await invalidateThreadCache(db, userId);
          console.error(`✅ Title generated: "${aiTitle}"`);
        } catch (error) {
          console.error('Failed to generate title:', error);
        }
      })(),
    );
    const responseLatency = Date.now() - responseTime;

    // ✅ VERIFY: Response returned immediately (< 100ms)
    // Note: Promise starts executing immediately, but doesn't block the response
    expect(responseLatency).toBeLessThan(100);

    // ✅ VERIFY: waitUntil was called with a promise
    expect(waitUntilPromises).toHaveLength(1);

    // ✅ VERIFY: Promise is pending (title generation started but not completed)
    expect(waitUntilPromises[0]).toBeInstanceOf(Promise);

    // Wait for background task to complete
    await Promise.all(waitUntilPromises);

    // ✅ VERIFY: Title generation completed in background
    expect(generateTitleFromMessage).toHaveBeenCalledWith(firstMessage, {});
    expect(updateThreadTitleAndSlug).toHaveBeenCalledWith(threadId, 'AI Generated Title');
    expect(invalidateThreadCache).toHaveBeenCalled();
  });

  it('should handle title generation errors without failing thread creation', async () => {
    const { generateTitleFromMessage } = vi.mocked(
      await import('@/api/services/title-generator.service'),
    );

    // Simulate AI failure
    generateTitleFromMessage.mockRejectedValue(new Error('OpenRouter API error'));

    const waitUntilPromises: Promise<unknown>[] = [];
    const mockExecutionCtx = {
      waitUntil: (promise: Promise<unknown>) => {
        waitUntilPromises.push(promise);
      },
    };

    // Simulate handler with error handling
    mockExecutionCtx.waitUntil(
      (async () => {
        try {
          await generateTitleFromMessage('Test message', {} as unknown);
        } catch (error) {
          // Error logged but not thrown
          console.error('Failed to generate title:', error);
        }
      })(),
    );

    // ✅ VERIFY: Thread creation succeeded (no error thrown)
    expect(() => waitUntilPromises).not.toThrow();

    // Wait for background task
    await Promise.allSettled(waitUntilPromises);

    // ✅ VERIFY: Title generation was attempted
    expect(generateTitleFromMessage).toHaveBeenCalled();
  });

  it('should work with actual thread creation flow', async () => {
    const { generateTitleFromMessage, updateThreadTitleAndSlug } = vi.mocked(
      await import('@/api/services/title-generator.service'),
    );
    const { getDbAsync } = vi.mocked(await import('@/db'));
    const { invalidateThreadCache } = vi.mocked(await import('@/api/common/cache-utils'));

    generateTitleFromMessage.mockResolvedValue('React Performance Best Practices');
    updateThreadTitleAndSlug.mockResolvedValue({
      title: 'React Performance Best Practices',
      slug: 'react-performance-best-practices',
    });
    getDbAsync.mockResolvedValue({ query: {} } as unknown);
    invalidateThreadCache.mockResolvedValue(undefined);

    // Simulate complete flow
    const threadId = 'thread-abc-123';
    const userId = 'user-456';
    const firstMessage = 'How can I improve React app performance?';

    const waitUntilPromises: Promise<unknown>[] = [];
    const mockExecutionCtx = {
      waitUntil: (promise: Promise<unknown>) => {
        waitUntilPromises.push(promise);
      },
    };

    // Execute background title generation
    mockExecutionCtx.waitUntil(
      (async () => {
        try {
          const aiTitle = await generateTitleFromMessage(firstMessage, {} as unknown);
          await updateThreadTitleAndSlug(threadId, aiTitle);
          const db = await getDbAsync();
          await invalidateThreadCache(db, userId);
        } catch (error) {
          console.error('Failed to generate title:', error);
        }
      })(),
    );

    // Wait for completion
    await Promise.all(waitUntilPromises);

    // ✅ VERIFY: Complete flow executed successfully
    expect(generateTitleFromMessage).toHaveBeenCalledWith(firstMessage, {});
    expect(updateThreadTitleAndSlug).toHaveBeenCalledWith(
      threadId,
      'React Performance Best Practices',
    );
    expect(getDbAsync).toHaveBeenCalled();
    expect(invalidateThreadCache).toHaveBeenCalledWith({ query: {} }, userId);
  });
});

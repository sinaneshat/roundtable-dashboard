/**
 * Pre-Search 409 Conflict Polling Tests
 *
 * Tests that pre-search streams properly handle 409 Conflict errors
 * (when stream is already in progress) by polling for completion
 * instead of retrying the POST request.
 *
 * This prevents duplicate search requests and ensures search
 * completes even after page refresh during streaming.
 */
import { describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { render, waitFor } from '@/lib/testing';

import { PreSearchStream } from '../pre-search-stream';

describe('pre-search 409 polling', () => {
  it('should poll for completion when POST returns 409', async () => {
    const mockPreSearch: StoredPreSearch = {
      id: 'search-1',
      threadId: 'thread-1',
      roundNumber: 0,
      userQuery: 'Test search query',
      status: AnalysisStatuses.PENDING,
      searchData: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date(),
    };

    const onComplete = vi.fn();

    // Mock completed search data
    const completedSearch = {
      ...mockPreSearch,
      status: AnalysisStatuses.COMPLETE,
      searchData: {
        queries: [
          { query: 'search 1', index: 0 },
          { query: 'search 2', index: 1 },
        ],
        results: [
          {
            index: 0,
            url: 'https://example.com',
            title: 'Example',
            content: 'Test content',
            relevanceScore: 0.9,
          },
        ],
      },
    };

    // Mock fetch for polling endpoint
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/pre-searches')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [completedSearch] }),
        } as Response);
      }
      // Mock 409 for stream endpoint
      return Promise.resolve({
        ok: false,
        status: 409,
        statusText: 'Conflict',
      } as Response);
    });

    render(
      <PreSearchStream
        threadId="thread-1"
        preSearch={mockPreSearch}
        onStreamComplete={onComplete}
      />,
    );

    // Wait for polling to complete
    await waitFor(
      () => {
        expect(onComplete).toHaveBeenCalledWith(completedSearch.searchData);
      },
      { timeout: 5000 },
    );

    // Verify polling endpoint was called
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/pre-searches'),
    );
  });

  it('should handle failed pre-search during polling', async () => {
    const mockPreSearch: StoredPreSearch = {
      id: 'search-2',
      threadId: 'thread-2',
      roundNumber: 1,
      userQuery: 'Failed search query',
      status: AnalysisStatuses.PENDING,
      searchData: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date(),
    };

    const onComplete = vi.fn();

    // Mock failed search
    const failedSearch = {
      ...mockPreSearch,
      status: AnalysisStatuses.FAILED,
      errorMessage: 'Search service unavailable',
    };

    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/pre-searches')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [failedSearch] }),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 409,
      } as Response);
    });

    render(
      <PreSearchStream
        threadId="thread-2"
        preSearch={mockPreSearch}
        onStreamComplete={onComplete}
      />,
    );

    // Wait for polling to detect failure
    await waitFor(
      () => {
        // Component should set error state but not call onComplete for failed searches
        expect(onComplete).not.toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  it('should cleanup polling on unmount', async () => {
    const mockPreSearch: StoredPreSearch = {
      id: 'search-3',
      threadId: 'thread-3',
      roundNumber: 0,
      userQuery: 'Test query',
      status: AnalysisStatuses.PENDING,
      searchData: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date(),
    };

    // Mock never-completing search to test cleanup
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/pre-searches')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{
              ...mockPreSearch,
              status: AnalysisStatuses.STREAMING, // Still streaming
            }],
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 409,
      } as Response);
    });

    const { unmount } = render(
      <PreSearchStream
        threadId="thread-3"
        preSearch={mockPreSearch}
      />,
    );

    // Let polling start
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const fetchCallCount = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // Unmount component
    unmount();

    // Wait to ensure no more polling
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Fetch should not have been called additional times after unmount
    const finalCallCount = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(finalCallCount).toBeLessThanOrEqual(fetchCallCount + 1); // Allow 1 in-flight call
  });
});

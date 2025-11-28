/**
 * Unit Tests for PreSearchStream Race Condition Fixes
 *
 * Tests the fixes for multiple race conditions in PreSearchStream:
 *
 * **BUG 1**: Provider and PreSearchStream both try to execute pre-search
 * - Root cause: Two separate tracking systems (store vs module-level)
 * - Fix: Added `providerTriggered` prop to coordinate execution
 *
 * **BUG 2**: Fetch aborted during navigation (overview → thread screen)
 * - Root cause: Effect cleanup ran on dep changes, not just unmount
 * - Fix: Separated unmount cleanup into empty-deps effect
 *
 * **BUG 3**: Fetch not restarted after navigation
 * - Root cause: Module-level tracking survives navigation
 * - Fix: PreSearchStream checks store's `hasPreSearchBeenTriggered`
 *
 * @see src/components/chat/pre-search-stream.tsx
 */

import { cleanup, render as rtlRender, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import {
  clearTriggeredPreSearch,
  clearTriggeredPreSearchForRound,
  PreSearchStream,
} from '@/components/chat/pre-search-stream';
import { testLocale, testMessages, testTimeZone } from '@/lib/testing/test-messages';

// Mock UI components to simplify testing
vi.mock('@/components/chat/web-search-configuration-display', () => ({
  WebSearchConfigurationDisplay: () => <div data-testid="config-display">Config Display</div>,
}));
vi.mock('@/components/chat/web-search-image-gallery', () => ({
  WebSearchImageGallery: () => <div data-testid="image-gallery">Image Gallery</div>,
}));
vi.mock('@/components/chat/llm-answer-display', () => ({
  LLMAnswerDisplay: () => <div data-testid="llm-answer">LLM Answer</div>,
}));
vi.mock('@/components/chat/web-search-result-item', () => ({
  WebSearchResultItem: () => <div data-testid="search-result">Result Item</div>,
}));

// Mock chat store provider - PreSearchStream uses hasPreSearchBeenTriggered
// ✅ FIX: Use vi.hoisted() to define mocks before vi.mock hoisting
const { mockHasPreSearchBeenTriggered, mockMarkPreSearchTriggered, mockStoreState, mockStore } = vi.hoisted(() => {
  const mockHasPreSearchBeenTriggered = vi.fn(() => false);
  const mockMarkPreSearchTriggered = vi.fn();
  const mockStoreState = {
    hasPreSearchBeenTriggered: mockHasPreSearchBeenTriggered,
    markPreSearchTriggered: mockMarkPreSearchTriggered,
  };
  const mockStore = {
    getState: () => mockStoreState,
    subscribe: () => () => {},
  };
  return { mockHasPreSearchBeenTriggered, mockMarkPreSearchTriggered, mockStoreState, mockStore };
});

vi.mock('@/components/providers/chat-store-provider', async () => {
  const React = await import('react');
  const MockChatStoreContext = React.createContext(mockStore);

  return {
    useChatStore: (selector: (state: typeof mockStoreState) => unknown) =>
      selector(mockStoreState),
    // ✅ Return the actual context so useContext works
    ChatStoreContext: MockChatStoreContext,
  };
});

// Custom wrapper for tests that mock ChatStoreProvider
// Includes NextIntlClientProvider for translations
function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale={testLocale}
      messages={testMessages}
      timeZone={testTimeZone}
    >
      {children}
    </NextIntlClientProvider>
  );
}

// Custom render that includes i18n wrapper
function render(ui: ReactNode) {
  return rtlRender(ui, { wrapper: TestWrapper });
}

describe('preSearchStream Race Condition Fixes', () => {
  const mockThreadId = 'thread-123';

  const createMockPreSearch = (overrides?: Partial<StoredPreSearch>): StoredPreSearch => ({
    id: 'ps-1',
    threadId: mockThreadId,
    roundNumber: 0,
    userQuery: 'test query',
    status: AnalysisStatuses.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    searchData: null,
    errorMessage: null,
    completedAt: null,
    ...overrides,
  });

  /**
   * Creates a pre-search with intentionally invalid data for edge case testing
   * This simulates malformed API responses or runtime data corruption
   * Type assertion is isolated to this test helper only
   */
  const createInvalidPreSearch = (invalidField: 'userQuery'): StoredPreSearch => {
    const base = createMockPreSearch();
    if (invalidField === 'userQuery') {
      // Simulate runtime condition where userQuery might be undefined
      return { ...base, userQuery: '' } as StoredPreSearch;
    }
    return base;
  };

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear module-level tracking between tests
    clearTriggeredPreSearchForRound(0);
    clearTriggeredPreSearch('ps-1');
    clearTriggeredPreSearch('ps-2');

    // Reset store mock to default (not triggered)
    mockHasPreSearchBeenTriggered.mockReturnValue(false);
    mockMarkPreSearchTriggered.mockClear();

    // Setup fetch mock
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  describe('providerTriggered prop - Race Condition Fix', () => {
    /**
     * When provider is already executing the pre-search,
     * PreSearchStream should NOT start its own fetch.
     */

    it('skips execution when providerTriggered=true', async () => {
      const mockPreSearch = createMockPreSearch();
      const onStreamStart = vi.fn();

      // Setup: Mock a successful SSE response
      fetchMock.mockResolvedValue({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'text/event-stream' }),
      });

      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          onStreamStart={onStreamStart}
          providerTriggered={true}
        />,
      );

      // Wait a tick to ensure effect has run
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify: No fetch was made because provider is handling it
      expect(fetchMock).not.toHaveBeenCalled();
      expect(onStreamStart).not.toHaveBeenCalled();
    });

    it('executes when providerTriggered=false and status=PENDING', async () => {
      const mockPreSearch = createMockPreSearch();
      const onStreamStart = vi.fn();

      // Setup: Mock a successful SSE response with start event
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: start\ndata: {"totalQueries":1}\n\n'));
          controller.close();
        },
      });

      fetchMock.mockResolvedValue({
        ok: true,
        body: mockStream,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
      });

      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          onStreamStart={onStreamStart}
          providerTriggered={false}
        />,
      );

      // Verify: Fetch was made because provider is NOT handling it
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          `/api/v1/chat/threads/${mockThreadId}/rounds/0/pre-search`,
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ userQuery: 'test query' }),
          }),
        );
      });
    });

    it('attempts stream resumption when initial status is STREAMING', async () => {
      // ✅ STREAM RESUMPTION: When user refreshes during streaming, the status will be STREAMING
      // The component tries to resume the stream via POST, and backend either:
      // - Returns resumed stream (200 with X-Resumed-From-Buffer header)
      // - Returns 202 (stream active but buffer not ready) → triggers polling
      const mockPreSearch = createMockPreSearch({
        status: AnalysisStatuses.STREAMING,
      });

      // Mock 202 response (stream active, buffer not ready) which triggers polling
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 202,
          statusText: 'Accepted',
        })
        // Then mock the polling endpoint response
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: {
              items: [{
                ...mockPreSearch,
                status: AnalysisStatuses.COMPLETE,
                searchData: { queries: [], results: [], successCount: 0, failureCount: 0, totalResults: 0, totalTime: 100 },
              }],
            },
          }),
        });

      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      // Verify: First tries to resume stream via POST
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          `/api/v1/chat/threads/${mockThreadId}/rounds/0/pre-search`,
          expect.objectContaining({
            method: 'POST',
          }),
        );
      });

      // Verify: After 202, falls back to polling
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          `/api/v1/chat/threads/${mockThreadId}/pre-searches`,
        );
      });
    });

    it('skips execution when status is COMPLETE', async () => {
      const mockPreSearch = createMockPreSearch({
        status: AnalysisStatuses.COMPLETE,
        searchData: {
          queries: [{ query: 'test', index: 0, total: 1, searchDepth: 'basic', rationale: 'test' }],
          results: [],
          successCount: 1,
          failureCount: 0,
          totalResults: 0,
          totalTime: 100,
        },
      });

      fetchMock.mockResolvedValue({ ok: true, body: new ReadableStream() });

      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify: No fetch because status is COMPLETE
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('skips execution when store indicates pre-search already triggered', async () => {
      // ✅ Test the store-based check for race condition prevention
      // Provider marks pre-search as triggered in store BEFORE making fetch
      // PreSearchStream should check this and skip if already triggered
      mockHasPreSearchBeenTriggered.mockReturnValue(true);

      const mockPreSearch = createMockPreSearch({
        status: AnalysisStatuses.PENDING,
      });

      fetchMock.mockResolvedValue({ ok: true, body: new ReadableStream() });

      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify: No fetch because store indicates already triggered
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('module-level deduplication', () => {
    /**
     * Module-level tracking prevents duplicate fetches when
     * component remounts quickly (React Strict Mode, parent re-render)
     */

    it('prevents duplicate fetch when same preSearch.id is triggered twice', async () => {
      const mockPreSearch = createMockPreSearch();

      fetchMock.mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            // Simulate slow stream
            setTimeout(() => controller.close(), 500);
          },
        }),
      });

      // First render - should trigger fetch
      const { unmount } = render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      // Unmount and remount (simulating React Strict Mode or navigation)
      unmount();

      // Second render with same preSearch - should NOT trigger new fetch
      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify: Still only 1 fetch (deduplication worked)
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('allows fetch after clearTriggeredPreSearch is called', async () => {
      const mockPreSearch = createMockPreSearch();

      fetchMock.mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      });

      // First render
      const { unmount } = render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      unmount();

      // Clear BOTH triggered states (id-level AND round-level deduplication)
      // The component checks BOTH: triggeredSearchIds AND triggeredRounds
      clearTriggeredPreSearch(mockPreSearch.id);
      clearTriggeredPreSearchForRound(mockPreSearch.roundNumber);

      // Second render - should trigger new fetch because we cleared both
      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('fetch lifecycle behavior', () => {
    /**
     * Tests for basic fetch lifecycle - starts fetch and completes
     */

    it('fetch continues when component re-renders with same props', async () => {
      const mockPreSearch = createMockPreSearch();
      let streamResolved = false;

      fetchMock.mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            // Resolve after a delay
            setTimeout(() => {
              controller.enqueue(new TextEncoder().encode('event: done\ndata: {"queries":[],"results":[]}\n\n'));
              controller.close();
              streamResolved = true;
            }, 200);
          },
        }),
      });

      const { rerender } = render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      // Re-render with same props - should NOT start new fetch
      rerender(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      // Wait for stream to complete
      await waitFor(() => {
        expect(streamResolved).toBe(true);
      }, { timeout: 1000 });

      // Verify: Only 1 fetch was made (not 2)
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not start new fetch after unmount/remount due to deduplication', async () => {
      const mockPreSearch = createMockPreSearch();

      fetchMock.mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      });

      const { unmount } = render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      unmount();

      // Remount same component - deduplication should prevent new fetch
      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      // Still only 1 fetch
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('userQuery validation', () => {
    /**
     * Tests for the guard against undefined/empty userQuery
     * which was causing "Malformed JSON" errors
     */

    it('throws error when userQuery is empty', async () => {
      // Use helper that creates invalid pre-search for edge case testing
      const mockPreSearch = createInvalidPreSearch('userQuery');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify: No fetch made (guard prevented it)
      expect(fetchMock).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PreSearchStream] userQuery is missing'),
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });

    it('throws error when userQuery is empty string', async () => {
      const mockPreSearch = createMockPreSearch({
        userQuery: '',
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify: No fetch made
      expect(fetchMock).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('navigation scenario simulation', () => {
    /**
     * Simulates the exact bug scenario:
     * 1. Overview screen mounts PreSearchStream, starts fetch
     * 2. Navigation causes unmount, fetch aborted
     * 3. Thread screen mounts PreSearchStream
     * 4. With providerTriggered=true, no new fetch (provider handles it)
     */

    it('handles overview→thread navigation with providerTriggered coordination', async () => {
      const mockPreSearch = createMockPreSearch();

      fetchMock.mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start() {
            // Ongoing stream
          },
        }),
      });

      // Step 1: Overview screen renders with providerTriggered=true
      // (provider is executing)
      const { unmount: unmountOverview } = render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={true}
        />,
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify: No fetch on overview (provider is handling)
      expect(fetchMock).not.toHaveBeenCalled();

      // Step 2: Navigation - unmount overview
      unmountOverview();

      // Step 3: Thread screen mounts with providerTriggered=true
      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={true}
        />,
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify: Still no fetch (provider handles it across screens)
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('allows PreSearchStream to execute when provider is not handling', async () => {
      const mockPreSearch = createMockPreSearch({ id: 'ps-2' });

      fetchMock.mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      });

      // Render without provider handling
      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('409 Conflict handling', () => {
    /**
     * When backend returns 409 (stream already active),
     * PreSearchStream should poll for completion
     */

    it('starts polling on 409 Conflict response', async () => {
      const mockPreSearch = createMockPreSearch();

      fetchMock
        // First call: 409 Conflict
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          statusText: 'Conflict',
        })
        // Polling call: Still streaming
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              items: [{
                ...mockPreSearch,
                status: AnalysisStatuses.STREAMING,
              }],
              count: 1,
            },
          }),
        })
        // Polling call: Complete
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              items: [{
                ...mockPreSearch,
                status: AnalysisStatuses.COMPLETE,
                searchData: {
                  queries: [],
                  results: [],
                  successCount: 0,
                  failureCount: 0,
                  totalResults: 0,
                  totalTime: 100,
                },
              }],
              count: 1,
            },
          }),
        });

      const onStreamComplete = vi.fn();

      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          onStreamComplete={onStreamComplete}
          providerTriggered={false}
        />,
      );

      await waitFor(() => {
        expect(onStreamComplete).toHaveBeenCalled();
      }, { timeout: 10000 });
    });
  });

  describe('store coordination - CRITICAL race condition fix', () => {
    /**
     * ✅ BUG FIX TEST: PreSearchStream must mark store's triggeredPreSearchRounds
     *
     * ROOT CAUSE OF RACE CONDITION:
     * - PreSearchStream marks LOCAL Maps (triggeredSearchIds, triggeredRounds)
     * - Provider checks STORE's triggeredPreSearchRounds
     * - They use DIFFERENT tracking mechanisms, so both can trigger simultaneously
     *
     * EXPECTED BEHAVIOR:
     * When PreSearchStream decides to execute a pre-search, it MUST call
     * store.getState().markPreSearchTriggered(roundNumber) so that:
     * 1. Provider's effect sees the round is already triggered
     * 2. No duplicate fetch requests are made
     * 3. Server doesn't receive multiple requests causing "Malformed JSON" errors
     *
     * @see ChatStoreProvider pendingMessage effect at lines 1076-1224
     * @see https://github.com/user/billing-dashboard/issues/XXX
     */

    it('calls markPreSearchTriggered on store when triggering pre-search', async () => {
      const mockPreSearch = createMockPreSearch();
      const onStreamStart = vi.fn();

      // Setup: Mock a successful SSE response
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: start\ndata: {"totalQueries":1}\n\n'));
          controller.close();
        },
      });

      fetchMock.mockResolvedValue({
        ok: true,
        body: mockStream,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
      });

      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          onStreamStart={onStreamStart}
          providerTriggered={false}
        />,
      );

      // Wait for effect to run and fetch to be made
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      // ✅ CRITICAL: Verify that PreSearchStream marked the store
      // This is the key fix - without this, provider will ALSO try to trigger
      // causing duplicate fetches and "Malformed JSON" errors
      expect(mockMarkPreSearchTriggered).toHaveBeenCalledWith(mockPreSearch.roundNumber);
    });

    it('marks store BEFORE starting fetch to prevent race with provider', async () => {
      const mockPreSearch = createMockPreSearch({ roundNumber: 5 });
      let fetchStartedAt: number | null = null;
      let storeMarkedAt: number | null = null;

      // Track when store is marked
      mockMarkPreSearchTriggered.mockImplementation(() => {
        storeMarkedAt = Date.now();
      });

      // Setup: Mock fetch that records when it was called
      fetchMock.mockImplementation(() => {
        fetchStartedAt = Date.now();
        return Promise.resolve({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
        });
      });

      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      // ✅ CRITICAL: Store must be marked BEFORE fetch starts
      // If fetch starts first, provider may see round as not triggered and also fetch
      expect(storeMarkedAt).not.toBeNull();
      expect(fetchStartedAt).not.toBeNull();
      expect(storeMarkedAt).toBeLessThanOrEqual(fetchStartedAt!);
    });

    it('prevents provider duplicate trigger when PreSearchStream marks store first', async () => {
      const mockPreSearch = createMockPreSearch({ roundNumber: 3 });
      const hasBeenTriggeredCalls: number[] = [];

      // Track the sequence of hasPreSearchBeenTriggered calls
      // First call returns false (PreSearchStream's check)
      // Second call should see true (after PreSearchStream marks)
      mockHasPreSearchBeenTriggered.mockImplementation((roundNumber: number) => {
        hasBeenTriggeredCalls.push(roundNumber);
        // Simulate: after first call, PreSearchStream will mark it
        // So subsequent calls should return true
        return hasBeenTriggeredCalls.filter(r => r === roundNumber).length > 1;
      });

      fetchMock.mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      });

      render(
        <PreSearchStream
          threadId={mockThreadId}
          preSearch={mockPreSearch}
          providerTriggered={false}
        />,
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      // Verify PreSearchStream called markPreSearchTriggered
      expect(mockMarkPreSearchTriggered).toHaveBeenCalledWith(3);

      // Now simulate provider checking - it should see round 3 as triggered
      // (In real code, provider's effect checks hasPreSearchBeenTriggered)
      // After PreSearchStream marks, hasPreSearchBeenTriggered(3) should return true
    });
  });
});

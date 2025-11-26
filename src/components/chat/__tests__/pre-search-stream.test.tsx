import { render as rtlRender, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import { PreSearchStream } from '@/components/chat/pre-search-stream';
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

// Mock chat store provider - PreSearchStream uses hasPreSearchBeenTriggered and markPreSearchTriggered
// ✅ FIX: Use vi.hoisted() to define mocks before vi.mock hoisting
const { mockStoreState, mockStore } = vi.hoisted(() => {
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
  return { mockStoreState, mockStore };
});

vi.mock('@/components/providers/chat-store-provider', async () => {
  const React = await import('react');
  const MockChatStoreContext = React.createContext(mockStore);

  return {
    useChatStore: (selector: (state: typeof mockStoreState) => unknown) =>
      selector(mockStoreState),
    ChatStoreContext: MockChatStoreContext,
  };
});

// Custom wrapper for tests that mock ChatStoreProvider
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

describe('preSearchStream Component', () => {
  const mockThreadId = 'thread-123';
  const mockPreSearch = {
    id: 'ps-1',
    threadId: mockThreadId,
    roundNumber: 1,
    userQuery: 'test query',
    status: AnalysisStatuses.PENDING,
    createdAt: new Date(),
    searchData: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should handle 409 Conflict by polling for completion', async () => {
    // 1. Mock 409 response for the stream request
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: 'Conflict',
      })
      // 2. Mock polling response (first poll: still streaming)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            ...mockPreSearch,
            status: AnalysisStatuses.STREAMING,
          }],
        }),
      })
      // 3. Mock polling response (second poll: complete)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            ...mockPreSearch,
            status: AnalysisStatuses.COMPLETE,
            searchData: {
              queries: [{ query: 'test', index: 0 }],
              results: [{ query: 'test', results: [{ title: 'Result 1' }] }],
              totalResults: 1,
            },
          }],
        }),
      });

    const onStreamComplete = vi.fn();

    render(
      <PreSearchStream
        threadId={mockThreadId}
        preSearch={mockPreSearch}
        onStreamComplete={onStreamComplete}
      />,
    );

    // Should eventually call onStreamComplete when polling succeeds
    await waitFor(() => {
      expect(onStreamComplete).toHaveBeenCalled();
    }, { timeout: 5000 });
  });
});

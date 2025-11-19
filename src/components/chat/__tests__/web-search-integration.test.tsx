/**
 * Web Search UI Components Integration Tests
 *
 * Tests the web search UI components and their interactions:
 * 1. WebSearchToggle renders correctly (enabled/disabled states)
 * 2. WebSearchToggle calls onToggle when clicked
 * 3. PreSearchCard renders for PENDING status (shows loading)
 * 4. PreSearchCard renders for STREAMING status (shows stream component)
 * 5. PreSearchCard renders for COMPLETED status (shows results via PreSearchStream)
 * 6. PreSearchCard renders for FAILED status (shows error)
 * 7. PreSearchStream displays search results correctly for COMPLETE status
 *
 * Pattern follows: Testing Library best practices
 */

import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import { createMockMessages, createMockPreSearch, createMockSearchData, render, screen } from '@/lib/testing';

import { PreSearchCard } from '../pre-search-card';
import { PreSearchStream } from '../pre-search-stream';
import { WebSearchToggle } from '../web-search-toggle';

// ✅ REMOVED: Mock next-intl - TestProviders already provides NextIntlClientProvider with real messages
// The mock was redundant and could cause conflicts

// ✅ REMOVED: Mock chat store provider - TestProviders already provides real ChatStoreProvider
// The test was failing because vi.mock didn't export ChatStoreProvider, causing TestProviders to fail
// Since these tests don't interact with store actions, the real provider works fine

// Mock query client
vi.mock('@/lib/data/query-client', () => ({
  getQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

describe('web Search UI Components', () => {
  describe('webSearchToggle', () => {
    it('should render toggle button in disabled state', () => {
      render(
        <WebSearchToggle enabled={false} onToggle={vi.fn()} />,
        { messages: createMockMessages() },
      );

      const toggle = screen.getByRole('button', { name: /web search/i });
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });

    it('should render toggle button in enabled state', () => {
      render(
        <WebSearchToggle enabled onToggle={vi.fn()} />,
        { messages: createMockMessages() },
      );

      const toggle = screen.getByRole('button', { name: /web search/i });
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
    });

    it('should call onToggle when clicked (enable)', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();

      render(
        <WebSearchToggle enabled={false} onToggle={onToggle} />,
        { messages: createMockMessages() },
      );

      const toggle = screen.getByRole('button', { name: /web search/i });
      await user.click(toggle);

      expect(onToggle).toHaveBeenCalledWith(true);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('should call onToggle when clicked (disable)', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();

      render(
        <WebSearchToggle enabled onToggle={onToggle} />,
        { messages: createMockMessages() },
      );

      const toggle = screen.getByRole('button', { name: /web search/i });
      await user.click(toggle);

      expect(onToggle).toHaveBeenCalledWith(false);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('should not call onToggle when disabled', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();

      render(
        <WebSearchToggle enabled={false} onToggle={onToggle} disabled />,
        { messages: createMockMessages() },
      );

      const toggle = screen.getByRole('button', { name: /web search/i });
      expect(toggle).toBeDisabled();

      await user.click(toggle);
      expect(onToggle).not.toHaveBeenCalled();
    });
  });

  describe('preSearchCard - Status States', () => {
    it('should show loading state for PENDING search', () => {
      const preSearch = createMockPreSearch({
        id: 'test-1',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
        userQuery: 'test query',
      });

      render(
        <PreSearchCard threadId="thread-1" preSearch={preSearch} />,
        { messages: createMockMessages() },
      );

      // Should show "Web Research" heading (actual translation from chat.preSearch.title)
      expect(screen.getByText(/web research/i)).toBeInTheDocument();

      // Should show "Searching" badge (actual translation from chat.preSearch.searching)
      expect(screen.getByText(/searching/i)).toBeInTheDocument();
    });

    it('should show streaming state for STREAMING search', () => {
      const preSearch = createMockPreSearch({
        id: 'test-1',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
        userQuery: 'test query',
      });

      render(
        <PreSearchCard threadId="thread-1" preSearch={preSearch} />,
        { messages: createMockMessages() },
      );

      expect(screen.getByText(/web research/i)).toBeInTheDocument();
      expect(screen.getByText(/searching/i)).toBeInTheDocument();
    });

    it('should show completed state for COMPLETED search', () => {
      const searchData = createMockSearchData({ numQueries: 2 });
      const preSearch = createMockPreSearch({
        id: 'test-1',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        userQuery: 'test query',
        searchData,
      });

      render(
        <PreSearchCard threadId="thread-1" preSearch={preSearch} isLatest />,
        { messages: createMockMessages() },
      );

      expect(screen.getByText(/web research/i)).toBeInTheDocument();

      // Should show search queries
      expect(screen.getByText('Test query 1')).toBeInTheDocument();
      expect(screen.getByText('Test query 2')).toBeInTheDocument();
    });

    it('should show error state for FAILED search', () => {
      const preSearch = createMockPreSearch({
        id: 'test-1',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        userQuery: 'test query',
      });

      render(
        <PreSearchCard threadId="thread-1" preSearch={preSearch} />,
        { messages: createMockMessages() },
      );

      expect(screen.getByText(/web research/i)).toBeInTheDocument();
      // Error badge shows "Error" text (from chat.preSearch.error)
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });

  describe('preSearchStream - Results Display (COMPLETE status)', () => {
    it('should display search results correctly', () => {
      const searchData = createMockSearchData({ numQueries: 2, includeResults: true });
      const preSearch = createMockPreSearch({
        status: AnalysisStatuses.COMPLETE,
        searchData,
      });

      render(
        <PreSearchStream threadId="thread-1" preSearch={preSearch} />,
        { messages: createMockMessages() },
      );

      // Should show both queries
      expect(screen.getByText('Test query 1')).toBeInTheDocument();
      expect(screen.getByText('Test query 2')).toBeInTheDocument();

      // Should show search results
      expect(screen.getByText('Result 1 - Article 1')).toBeInTheDocument();
      expect(screen.getByText('Result 2 - Article 1')).toBeInTheDocument();

      // Should show summaries
      expect(screen.getByText('Summary answer for Test query 1')).toBeInTheDocument();
      expect(screen.getByText('Summary answer for Test query 2')).toBeInTheDocument();
    });

    it('should show result count for each query', () => {
      const searchData = createMockSearchData({ numQueries: 1, includeResults: true });
      const preSearch = createMockPreSearch({
        status: AnalysisStatuses.COMPLETE,
        searchData,
      });

      render(
        <PreSearchStream threadId="thread-1" preSearch={preSearch} />,
        { messages: createMockMessages() },
      );

      // Each mock search has 2 results
      expect(screen.getByText(/2 sources/i)).toBeInTheDocument();
    });

    it('should show response time badges', () => {
      const searchData = createMockSearchData({ numQueries: 1, includeResults: true });
      const preSearch = createMockPreSearch({
        status: AnalysisStatuses.COMPLETE,
        searchData,
      });

      render(
        <PreSearchStream threadId="thread-1" preSearch={preSearch} />,
        { messages: createMockMessages() },
      );

      // Response time should be displayed (1200ms for first query)
      expect(screen.getByText(/1200ms/i)).toBeInTheDocument();
    });

    it('should render nothing when no results', () => {
      const searchData = { queries: [], results: [] };
      const preSearch = createMockPreSearch({
        status: AnalysisStatuses.COMPLETE,
        searchData,
      });

      const { container } = render(
        <PreSearchStream threadId="thread-1" preSearch={preSearch} />,
        { messages: createMockMessages() },
      );

      expect(container.firstChild).toBeNull();
    });

    it('should show search depth badges (basic/advanced)', () => {
      const searchData = createMockSearchData({ numQueries: 2, includeResults: true });
      const preSearch = createMockPreSearch({
        status: AnalysisStatuses.COMPLETE,
        searchData,
      });

      render(
        <PreSearchStream threadId="thread-1" preSearch={preSearch} />,
        { messages: createMockMessages() },
      );

      // First query is basic (index 0), second is advanced (index 1)
      expect(screen.getByText('Simple')).toBeInTheDocument();
      expect(screen.getByText('Advanced')).toBeInTheDocument();
    });
  });

  describe('preSearchStream - Edge Cases', () => {
    it('should handle empty results array gracefully', () => {
      const searchData = {
        queries: [
          {
            query: 'Test query',
            rationale: 'Test rationale',
            searchDepth: 'basic' as const,
            index: 0,
            total: 1,
          },
        ],
        results: [],
      };
      const preSearch = createMockPreSearch({
        status: AnalysisStatuses.COMPLETE,
        searchData,
      });

      const { container } = render(
        <PreSearchStream threadId="thread-1" preSearch={preSearch} />,
        { messages: createMockMessages() },
      );

      // Should render nothing when results are empty
      expect(container.firstChild).toBeNull();
    });

    it('should handle result without answer field', () => {
      const searchData = {
        queries: [
          {
            query: 'Test query',
            rationale: 'Test rationale',
            searchDepth: 'basic' as const,
            index: 0,
            total: 1,
          },
        ],
        results: [
          {
            query: 'Test query',
            answer: '', // Empty answer
            results: [
              {
                title: 'Test Article',
                url: 'https://example.com',
                content: 'Test content',
                score: 0.9,
              },
            ],
            responseTime: 1200,
          },
        ],
      };
      const preSearch = createMockPreSearch({
        status: AnalysisStatuses.COMPLETE,
        searchData,
      });

      render(
        <PreSearchStream threadId="thread-1" preSearch={preSearch} />,
        { messages: createMockMessages() },
      );

      // Should show query and results
      expect(screen.getByText('Test query')).toBeInTheDocument();
      expect(screen.getByText('Test Article')).toBeInTheDocument();

      // Should not show empty summary section
      expect(screen.queryByText('Summary')).not.toBeInTheDocument();
    });
  });

  describe('preSearchStream - Multiple Searches Separator', () => {
    it('should show separators between multiple searches', () => {
      const searchData = createMockSearchData({ numQueries: 3, includeResults: true });
      const preSearch = createMockPreSearch({
        status: AnalysisStatuses.COMPLETE,
        searchData,
      });

      render(
        <PreSearchStream threadId="thread-1" preSearch={preSearch} />,
        { messages: createMockMessages() },
      );

      // Should have separators between searches (3 queries = 2 separators)
      // The Separator component from shadcn/ui renders as <div role="separator">
      const separators = screen.queryAllByRole('separator');
      expect(separators).toHaveLength(2); // n-1 separators for n searches
    });
  });
});

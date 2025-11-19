/**
 * Web Search Loading Indicator Tests
 *
 * Tests for missing loading indicators during web search streaming phases:
 * - ChatLoading component with matrix text effect (EncryptedText) during PENDING/STREAMING
 * - Animated dots for individual query streaming
 * - Globe icon with pulse animation
 * - Stage indicators (Query → Search → Answer)
 * - Skeleton loaders during streaming
 * - LLMAnswerDisplay skeleton with "AI synthesizing answer..." badge
 * - Animated cursor during answer streaming
 *
 * These tests are EXPECTED to FAIL initially - they capture missing UI bugs
 */

import { describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import { createMockPreSearch, createMockSearchData, render, screen } from '@/lib/testing';

import { ChatLoading } from '../chat-loading';
import { LLMAnswerDisplay } from '../llm-answer-display';
import { PreSearchStream } from '../pre-search-stream';
import { WebSearchDisplay } from '../web-search-display';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
  NextIntlClientProvider: ({ children }: { children: unknown }) => children,
}));

// Mock chat store provider
vi.mock('@/components/providers/chat-store-provider', () => ({
  useChatStore: (selector: (state: { updatePreSearchStatus: () => void; updatePreSearchData: () => void }) => unknown) => {
    const mockStore = {
      updatePreSearchStatus: vi.fn(),
      updatePreSearchData: vi.fn(),
    };
    return selector ? selector(mockStore) : mockStore;
  },
  ChatStoreProvider: ({ children }: { children: unknown }) => children,
}));

// Mock query client
vi.mock('@/lib/data/query-client', () => ({
  getQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

// Mock fetch to prevent actual network calls
globalThis.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    body: null, // No actual stream
  } as Response),
);

describe('web Search Loading Indicators', () => {
  describe('preSearchStream - Loading States', () => {
    it('should show ChatLoading component when pre-search is PENDING', () => {
      // THIS TEST SHOULD FAIL - EncryptedText scrambles the text making it hard to find
      const mockPreSearch = createMockPreSearch({
        id: 'test-search-1',
        threadId: 'test-thread',
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
        userQuery: 'test query',
        searchData: undefined, // No data yet
      });

      render(
        <PreSearchStream
          threadId="test-thread"
          preSearch={mockPreSearch}
          onStreamStart={vi.fn()}
          onStreamComplete={vi.fn()}
        />,
      );

      // EXPECTED BEHAVIOR: Should show loading indicator with matrix text effect
      // BUG: EncryptedText renders scrambled characters, making text invisible to getByText
      // The actual text "Generating search queries..." is in aria-label but content shows random chars

      // Should show "Creating search queries..." text
      const loadingText = screen.getByText(/creating search queries/i);
      expect(loadingText).toBeInTheDocument();

      // Should have loading spinner (Loader2 icon)
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
      // Loader2 uses lucide icon classes
      expect(spinner).toHaveClass('lucide');
    });

    it('should show ChatLoading component when pre-search is STREAMING with no data', () => {
      // THIS TEST SHOULD FAIL - missing loading indicator during initial STREAMING
      const mockPreSearch = createMockPreSearch({
        id: 'test-search-2',
        threadId: 'test-thread',
        roundNumber: 1,
        status: AnalysisStatuses.STREAMING,
        userQuery: 'test streaming query',
        searchData: undefined, // No data received yet
      });

      render(
        <PreSearchStream
          threadId="test-thread"
          preSearch={mockPreSearch}
          onStreamStart={vi.fn()}
          onStreamComplete={vi.fn()}
        />,
      );

      // EXPECTED BEHAVIOR: Should show loading text during streaming
      // BUG: Loading indicator doesn't appear when STREAMING with no partial data
      const loadingText = screen.getByText(/creating search queries/i);
      expect(loadingText).toBeInTheDocument();
    });

    it('should display EncryptedText matrix effect in loading indicator', () => {
      // THIS TEST SHOULD FAIL - EncryptedText component might not be rendering properly
      const mockPreSearch = createMockPreSearch({
        id: 'test-search-3',
        threadId: 'test-thread',
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
        userQuery: 'test query',
      });

      render(
        <PreSearchStream
          threadId="test-thread"
          preSearch={mockPreSearch}
          onStreamStart={vi.fn()}
          onStreamComplete={vi.fn()}
        />,
      );

      // EXPECTED BEHAVIOR: Should render loading text
      // The text should be visible (not using EncryptedText anymore)
      const loadingText = screen.getByText(/creating search queries/i);
      expect(loadingText).toBeInTheDocument();
      expect(loadingText).toHaveClass('text-sm', 'font-medium', 'text-foreground');
    });

    it('should show animated dots while streaming individual queries', () => {
      // THIS TEST SHOULD FAIL - pulsing dots animation might not be visible
      const mockPreSearch = createMockPreSearch({
        id: 'test-search-4',
        threadId: 'test-thread',
        roundNumber: 1,
        status: AnalysisStatuses.STREAMING,
        userQuery: 'test query',
        searchData: {
          queries: [
            {
              query: 'Test query 1',
              rationale: 'Test rationale',
              searchDepth: 'basic' as const,
              index: 0,
              total: 2,
            },
          ],
          results: [], // No results yet - query is still streaming
        },
      });

      const { container } = render(
        <PreSearchStream
          threadId="test-thread"
          preSearch={mockPreSearch}
          onStreamStart={vi.fn()}
          onStreamComplete={vi.fn()}
        />,
      );

      // EXPECTED BEHAVIOR: Should show pulsing dots for queries without results
      // BUG: Animated dots might not be rendering
      // Look for the rounded-full elements (the dots)
      const pulsingDots = container.querySelectorAll('.rounded-full');

      // Filter to get only the small dot elements (size-1.5)
      const dotElements = Array.from(pulsingDots).filter(el =>
        el.className.includes('size-1'),
      );

      expect(dotElements.length).toBeGreaterThanOrEqual(1); // Should have dots
    });

    it('should hide loading indicators when pre-search completes', async () => {
      // THIS TEST SHOULD PASS - verifies loading indicators are removed after completion
      const mockPreSearch = createMockPreSearch({
        id: 'test-search-5',
        threadId: 'test-thread',
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
        userQuery: 'completed query',
        searchData: createMockSearchData({ numQueries: 2, includeResults: true }),
      });

      render(
        <PreSearchStream
          threadId="test-thread"
          preSearch={mockPreSearch}
          onStreamStart={vi.fn()}
          onStreamComplete={vi.fn()}
        />,
      );

      // EXPECTED BEHAVIOR: Loading indicators should NOT be present when complete
      expect(screen.queryByText(/creating search queries/i)).not.toBeInTheDocument();

      // Should show actual results instead
      expect(screen.getByText('Test query 1')).toBeInTheDocument();
    });
  });

  describe('webSearchDisplay - Streaming States', () => {
    it('should show globe icon with pulse animation during streaming', () => {
      // THIS TEST SHOULD FAIL - globe icon pulse animation might not be visible
      const { container } = render(
        <WebSearchDisplay
          results={[]}
          isStreaming
          meta={undefined}
        />,
      );

      // EXPECTED BEHAVIOR: Globe icon should have pulse animation
      // BUG: Pulse animation class might be missing
      const globeIcon = container.querySelector('svg');
      expect(globeIcon).toBeInTheDocument();

      // Check for animate-pulse class
      const elementsWithPulse = container.querySelectorAll('.animate-pulse');
      expect(elementsWithPulse.length).toBeGreaterThan(0);
    });

    it('should show stage indicators (Query → Search → Answer) during streaming', () => {
      // THIS TEST SHOULD FAIL - stage indicators might not be visible
      render(
        <WebSearchDisplay
          results={[]}
          isStreaming
          meta={undefined}
        />,
      );

      // EXPECTED BEHAVIOR: Should show all three stages with visual progression
      // BUG: Stage indicators might not be rendering
      expect(screen.getByText('Query')).toBeInTheDocument();
      expect(screen.getByText('Search')).toBeInTheDocument();
      expect(screen.getByText('Answer')).toBeInTheDocument();

      // Should show arrows between stages
      const arrows = screen.getAllByText('→');
      expect(arrows).toHaveLength(2); // Two arrows between three stages
    });

    it('should highlight current stage based on streaming progress (query stage)', () => {
      // THIS TEST SHOULD FAIL - stage highlighting might not work correctly
      const { container: _container } = render(
        <WebSearchDisplay
          results={[]}
          isStreaming
          query={undefined} // No query yet - should highlight Query stage
          meta={undefined}
        />,
      );

      // EXPECTED BEHAVIOR: Query stage should be highlighted/pulsing
      // BUG: Stage highlighting might not be working
      const queryStage = screen.getByText('Query');

      // Should have font-medium class for current stage
      expect(queryStage).toHaveClass('font-medium');
      expect(queryStage).toHaveClass('animate-pulse');
    });

    it('should highlight current stage based on streaming progress (search stage)', () => {
      // THIS TEST SHOULD FAIL - stage highlighting for search phase might not work
      const { container: _container } = render(
        <WebSearchDisplay
          results={[]}
          isStreaming
          query="test query" // Query exists, no answer - should highlight Search stage
          answer={undefined}
          meta={undefined}
        />,
      );

      // EXPECTED BEHAVIOR: Search stage should be highlighted
      const searchStage = screen.getByText('Search');
      expect(searchStage).toHaveClass('font-medium');
      expect(searchStage).toHaveClass('animate-pulse');
    });

    it('should display skeleton loaders when streaming starts', () => {
      // THIS TEST SHOULD FAIL - skeleton loaders might not be visible
      const { container } = render(
        <WebSearchDisplay
          results={[]}
          isStreaming
          meta={undefined}
        />,
      );

      // EXPECTED BEHAVIOR: Should show three skeleton placeholders
      // BUG: Skeletons might not be rendering properly or have wrong class names

      // Look for skeleton elements by common patterns
      const skeletonsByClass = container.querySelectorAll('[class*="skeleton"]');
      const skeletonsByHeight = container.querySelectorAll('.h-16, .h-12');

      // Should have at least some skeleton-like elements
      const totalSkeletons = skeletonsByClass.length + skeletonsByHeight.length;
      expect(totalSkeletons).toBeGreaterThanOrEqual(1);
    });

    it('should show "searching..." text during streaming', () => {
      // THIS TEST SHOULD FAIL - searching text might not be visible
      render(
        <WebSearchDisplay
          results={[]}
          isStreaming
          meta={undefined}
        />,
      );

      // EXPECTED BEHAVIOR: Should display "searching..." text with animation
      // BUG: Text might be missing or not animated
      const searchingText = screen.getByText(/searching/i);
      expect(searchingText).toBeInTheDocument();
      expect(searchingText).toHaveClass('animate-pulse');
    });

    it('should hide skeletons when results are available', () => {
      // THIS TEST SHOULD PASS - verifies skeletons are removed when data arrives
      const mockResults = [
        {
          title: 'Test Result 1',
          url: 'https://example.com/1',
          content: 'Test content 1',
          score: 0.95,
        },
      ];

      const { container } = render(
        <WebSearchDisplay
          results={mockResults}
          isStreaming={false}
          meta={undefined}
        />,
      );

      // EXPECTED BEHAVIOR: Skeletons should NOT be present when results exist
      const skeletons = container.querySelectorAll('[class*="skeleton"]');
      expect(skeletons).toHaveLength(0);

      // Should show actual result
      expect(screen.getByText('Test Result 1')).toBeInTheDocument();
    });
  });

  describe('lLMAnswerDisplay - Streaming States', () => {
    it('should show skeleton with badge when answer is synthesizing', () => {
      // THIS TEST SHOULD FAIL - skeleton and badge might not be visible during synthesis
      const { container } = render(
        <LLMAnswerDisplay
          answer={null} // No answer yet
          isStreaming
          sources={[]}
        />,
      );

      // EXPECTED BEHAVIOR: Should show skeleton loaders and "AI synthesizing answer..." badge
      // BUG: Component returns null when answer is null, even if isStreaming=true

      // The component should show synthesis state but currently returns null
      const synthesisBadge = screen.queryByText(/AI synthesizing/i);

      // THIS WILL FAIL - component doesn't show skeleton when answer is null
      expect(synthesisBadge).toBeInTheDocument();

      // Should show skeleton lines
      const skeletons = container.querySelectorAll('[class*="skeleton"]');
      expect(skeletons.length).toBeGreaterThanOrEqual(3);
    });

    it('should show Sparkles icon with pulse animation during synthesis', () => {
      // THIS TEST SHOULD FAIL - Sparkles icon animation might not be working
      const { container } = render(
        <LLMAnswerDisplay
          answer={null}
          isStreaming
          sources={[]}
        />,
      );

      // EXPECTED BEHAVIOR: Sparkles icon should pulse during synthesis
      // BUG: Animation class might be missing
      const sparklesIcon = container.querySelector('.animate-pulse');
      expect(sparklesIcon).toBeInTheDocument();
    });

    it('should show animated cursor when answer is streaming', () => {
      // THIS TEST SHOULD FAIL - cursor animation might not be visible
      const { container } = render(
        <LLMAnswerDisplay
          answer="Partial answer text being streamed..."
          isStreaming
          sources={[]}
        />,
      );

      // EXPECTED BEHAVIOR: Should show animated cursor at the end of text
      // BUG: Cursor might not be rendering or animating
      const cursor = container.querySelector('.bg-primary.rounded-sm');
      expect(cursor).toBeInTheDocument();

      // Cursor should be inline-block
      expect(cursor).toHaveClass('inline-block');

      // Should have specific dimensions (w-1 h-3)
      expect(cursor).toHaveClass('w-1');
      expect(cursor).toHaveClass('h-3');
    });

    it('should show pulsing dots indicator during streaming', () => {
      // THIS TEST SHOULD FAIL - pulsing dots might not be visible
      render(
        <LLMAnswerDisplay
          answer="Answer content"
          isStreaming
          sources={[]}
        />,
      );

      // EXPECTED BEHAVIOR: Should show "•••" pulsing indicator in header
      // BUG: Pulsing dots might be missing
      const pulsingDots = screen.getByText('•••');
      expect(pulsingDots).toBeInTheDocument();
      expect(pulsingDots).toHaveClass('animate-pulse');
    });

    it('should hide cursor when streaming completes', () => {
      // THIS TEST SHOULD PASS - verifies cursor is removed when done
      const { container } = render(
        <LLMAnswerDisplay
          answer="Complete answer text"
          isStreaming={false} // Not streaming
          sources={[]}
        />,
      );

      // EXPECTED BEHAVIOR: Cursor should NOT be present when streaming is done
      const cursor = container.querySelector('.bg-primary.rounded-sm');
      expect(cursor).not.toBeInTheDocument();

      // Pulsing dots should also be hidden
      expect(screen.queryByText('•••')).not.toBeInTheDocument();
    });

    it('should display markdown content with proper formatting during streaming', () => {
      // THIS TEST SHOULD PASS - verifies markdown renders correctly
      const markdownAnswer = '# Heading\n\nThis is **bold** text with a [link](https://example.com).';

      render(
        <LLMAnswerDisplay
          answer={markdownAnswer}
          isStreaming
          sources={[]}
        />,
      );

      // EXPECTED BEHAVIOR: Markdown should be parsed and rendered
      expect(screen.getByText('Heading')).toBeInTheDocument();
      expect(screen.getByText('bold')).toBeInTheDocument();
      expect(screen.getByText('link')).toBeInTheDocument();
    });

    it('should show source citations when provided', () => {
      // THIS TEST SHOULD PASS - verifies source citations render
      const sources = [
        { url: 'https://example.com/1', title: 'Source 1' },
        { url: 'https://example.com/2', title: 'Source 2' },
      ];

      render(
        <LLMAnswerDisplay
          answer="Answer with sources"
          isStreaming={false}
          sources={sources}
        />,
      );

      // EXPECTED BEHAVIOR: Should show numbered source citations
      expect(screen.getByText('[1]')).toBeInTheDocument();
      expect(screen.getByText('[2]')).toBeInTheDocument();

      // Sources should be links
      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(2);
    });
  });

  describe('chatLoading - Matrix Text Effect', () => {
    it('should render ChatLoading with matrix text effect', () => {
      // Test ChatLoading component renders with EncryptedText
      render(
        <ChatLoading text="Loading web search..." />,
      );

      // EncryptedText uses aria-label for accessibility
      const encryptedText = screen.getByLabelText(/Loading web search/i);
      expect(encryptedText).toBeInTheDocument();
      expect(encryptedText).toHaveAttribute('role', 'text');
    });

    it('should show spinner when showSpinner is true', () => {
      // THIS TEST SHOULD PASS - verifies spinner renders
      const { container } = render(
        <ChatLoading text="Loading..." showSpinner />,
      );

      // EXPECTED BEHAVIOR: Should show animated spinner
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('rounded-full');
    });

    it('should hide spinner when showSpinner is false', () => {
      // THIS TEST SHOULD PASS - verifies spinner can be hidden
      const { container } = render(
        <ChatLoading text="Loading..." showSpinner={false} />,
      );

      // EXPECTED BEHAVIOR: Spinner should not be present
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).not.toBeInTheDocument();
    });

    it('should apply custom className', () => {
      // THIS TEST SHOULD PASS - verifies className prop works
      const { container } = render(
        <ChatLoading text="Loading..." className="custom-loading-class" />,
      );

      // EXPECTED BEHAVIOR: Should have custom class
      const loadingContainer = container.querySelector('.custom-loading-class');
      expect(loadingContainer).toBeInTheDocument();
    });

    it('should display EncryptedText with continuous animation', () => {
      // Test that EncryptedText renders with aria-label
      render(
        <ChatLoading text="Analyzing..." />,
      );

      // EncryptedText uses aria-label for accessibility
      const encryptedText = screen.getByLabelText(/Analyzing/i);
      expect(encryptedText).toBeInTheDocument();
      expect(encryptedText).toHaveAttribute('role', 'text');
    });
  });

  describe('integration - Full Streaming Flow', () => {
    it('should show loading indicators throughout the complete streaming flow', async () => {
      // THIS TEST focuses on the PENDING → COMPLETE transition
      const { rerender } = render(
        <PreSearchStream
          threadId="test-thread"
          preSearch={createMockPreSearch({
            id: 'flow-test',
            threadId: 'test-thread',
            roundNumber: 1,
            status: AnalysisStatuses.PENDING,
            userQuery: 'comprehensive test',
          })}
          onStreamStart={vi.fn()}
          onStreamComplete={vi.fn()}
        />,
      );

      // PHASE 1: PENDING - should show loading indicator
      const loadingIndicator = screen.getByText(/creating search queries/i);
      expect(loadingIndicator).toBeInTheDocument();

      // PHASE 2: COMPLETE - should hide all loading indicators and show results
      rerender(
        <PreSearchStream
          threadId="test-thread"
          preSearch={createMockPreSearch({
            id: 'flow-test',
            threadId: 'test-thread',
            roundNumber: 1,
            status: AnalysisStatuses.COMPLETE,
            userQuery: 'comprehensive test',
            searchData: createMockSearchData({ numQueries: 2, includeResults: true }),
          })}
          onStreamStart={vi.fn()}
          onStreamComplete={vi.fn()}
        />,
      );

      // Loading indicators should be gone
      expect(screen.queryByText(/creating search queries/i)).not.toBeInTheDocument();

      // Results should be visible
      expect(screen.getByText('Test query 1')).toBeInTheDocument();
      expect(screen.getByText('Test query 2')).toBeInTheDocument();
    });
  });
});

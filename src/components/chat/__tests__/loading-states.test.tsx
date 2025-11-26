/**
 * Loading States Unit Tests
 *
 * Tests for LoaderFive component usage across chat components:
 * - model-message-card.tsx: Participant pending states
 * - pre-search-stream.tsx: Web search pending/streaming states
 * - moderator-analysis-stream.tsx: Analysis pending/streaming states
 *
 * Verifies:
 * 1. LoaderFive shimmer effect is shown when pending with no content
 * 2. LoaderFive is hidden when content is available
 * 3. Text dynamically reflects what is being loaded
 * 4. Different rounds show appropriate loading text
 */

import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, MessageStatuses } from '@/api/core/enums';
import type { StoredModeratorAnalysis, StoredPreSearch } from '@/api/routes/chat/schema';
import { testLocale, testMessages, testTimeZone } from '@/lib/testing/test-messages';
import {
  createMockAnalysis,
  createMockPreSearch,
  createMockPreSearchDataPayload,
} from '@/stores/chat/__tests__/test-factories';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock LoaderFive to render plain text for easier testing
vi.mock('@/components/ui/loader', () => ({
  LoaderFive: ({ text }: { text: string }) => (
    <div data-testid="loader-five">{text}</div>
  ),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('motion/react', () => ({
  motion: {
    span: ({ children, ...props }: { children: ReactNode }) => <span {...props}>{children}</span>,
    div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  LayoutGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Mock animated streaming components
vi.mock('@/components/ui/motion', () => ({
  AnimatedStreamingList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AnimatedStreamingItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// Mock UI components to simplify testing
vi.mock('@/components/chat/web-search-configuration-display', () => ({
  WebSearchConfigurationDisplay: () => <div data-testid="config-display">Config Display</div>,
}));
vi.mock('@/components/chat/web-search-result-item', () => ({
  WebSearchResultItem: () => <div data-testid="search-result">Result Item</div>,
}));

// Mock chat store provider
const { mockStoreState } = vi.hoisted(() => {
  const mockStoreState = {
    hasPreSearchBeenTriggered: vi.fn(() => false),
    markPreSearchTriggered: vi.fn(),
    registerAnimation: vi.fn(),
    completeAnimation: vi.fn(),
  };
  return { mockStoreState };
});

vi.mock('@/components/providers/chat-store-provider', async () => {
  const React = await import('react');
  const mockStore = {
    getState: () => mockStoreState,
    subscribe: () => () => {},
  };
  const MockChatStoreContext = React.createContext(mockStore);

  return {
    useChatStore: (selector: (state: typeof mockStoreState) => unknown) =>
      selector(mockStoreState),
    ChatStoreContext: MockChatStoreContext,
  };
});

// Mock auto-scroll hook
vi.mock('@/hooks/utils', () => ({
  useBoolean: () => ({
    value: false,
    setTrue: vi.fn(),
    setFalse: vi.fn(),
    toggle: vi.fn(),
  }),
  useAutoScroll: () => ({
    containerRef: { current: null },
    scrollToBottom: vi.fn(),
  }),
}));

// ============================================================================
// Test Wrapper
// ============================================================================

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

function render(ui: ReactNode) {
  return rtlRender(ui, { wrapper: TestWrapper });
}

// ============================================================================
// ModelMessageCard Loading State Tests
// ============================================================================

describe('modelMessageCard Loading States', () => {
  // Import component dynamically to avoid hoisting issues
  let ModelMessageCard: typeof import('@/components/chat/model-message-card').ModelMessageCard;

  beforeEach(async () => {
    vi.clearAllMocks();
    const importedModule = await import('@/components/chat/model-message-card');
    ModelMessageCard = importedModule.ModelMessageCard;
  }, 30000); // Increased timeout for dynamic import

  it('shows LoaderFive with model name when pending with no parts', () => {
    const modelName = 'Claude 3.5 Sonnet';

    render(
      <ModelMessageCard
        model={{
          id: 'anthropic/claude-3.5-sonnet',
          name: modelName,
          is_accessible_to_user: true,
        } as never}
        participantIndex={0}
        status={MessageStatuses.PENDING}
        parts={[]}
        avatarSrc="/avatar.png"
        avatarName="Claude"
      />,
    );

    // Should show LoaderFive with model name in text
    const loader = screen.getByTestId('loader-five');
    expect(loader).toBeInTheDocument();
    expect(loader.textContent).toContain('Generating response from');
    expect(loader.textContent).toContain(modelName);
  });

  it('shows LoaderFive with fallback name when model is undefined', () => {
    render(
      <ModelMessageCard
        model={undefined}
        participantIndex={0}
        status={MessageStatuses.PENDING}
        parts={[]}
        avatarSrc="/avatar.png"
        avatarName="AI"
      />,
    );

    // Should show LoaderFive with fallback "AI Assistant"
    const loader = screen.getByTestId('loader-five');
    expect(loader).toBeInTheDocument();
    expect(loader.textContent).toContain('Generating response from');
    expect(loader.textContent).toContain('AI Assistant');
  });

  it('hides LoaderFive when parts are available', () => {
    render(
      <ModelMessageCard
        model={{
          id: 'anthropic/claude-3.5-sonnet',
          name: 'Claude 3.5 Sonnet',
          is_accessible_to_user: true,
        } as never}
        participantIndex={0}
        status={MessageStatuses.STREAMING}
        parts={[{ type: 'text', text: 'Hello world' }]}
        avatarSrc="/avatar.png"
        avatarName="Claude"
      />,
    );

    // Should NOT show LoaderFive when content is available
    expect(screen.queryByTestId('loader-five')).not.toBeInTheDocument();
  });

  it('hides LoaderFive when status is COMPLETE', () => {
    render(
      <ModelMessageCard
        model={{
          id: 'anthropic/claude-3.5-sonnet',
          name: 'Claude 3.5 Sonnet',
          is_accessible_to_user: true,
        } as never}
        participantIndex={0}
        status={MessageStatuses.COMPLETE}
        parts={[{ type: 'text', text: 'Complete response' }]}
        avatarSrc="/avatar.png"
        avatarName="Claude"
      />,
    );

    // Should NOT show LoaderFive when complete
    expect(screen.queryByTestId('loader-five')).not.toBeInTheDocument();
  });

  it('shows different model names for different participants', () => {
    const { rerender } = render(
      <ModelMessageCard
        model={{
          id: 'openai/gpt-4',
          name: 'GPT-4',
          is_accessible_to_user: true,
        } as never}
        participantIndex={0}
        status={MessageStatuses.PENDING}
        parts={[]}
        avatarSrc="/avatar.png"
        avatarName="GPT"
      />,
    );

    let loader = screen.getByTestId('loader-five');
    expect(loader.textContent).toContain('GPT-4');

    rerender(
      <TestWrapper>
        <ModelMessageCard
          model={{
            id: 'google/gemini-pro',
            name: 'Gemini Pro',
            is_accessible_to_user: true,
          } as never}
          participantIndex={1}
          status={MessageStatuses.PENDING}
          parts={[]}
          avatarSrc="/avatar.png"
          avatarName="Gemini"
        />
      </TestWrapper>,
    );

    loader = screen.getByTestId('loader-five');
    expect(loader.textContent).toContain('Gemini Pro');
  });
});

// ============================================================================
// PreSearchStream Loading State Tests
// ============================================================================

describe('preSearchStream Loading States', () => {
  let PreSearchStream: typeof import('@/components/chat/pre-search-stream').PreSearchStream;

  beforeEach(async () => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
    const importedModule = await import('@/components/chat/pre-search-stream');
    PreSearchStream = importedModule.PreSearchStream;
  });

  it('shows LoaderFive when PENDING with no data', () => {
    const preSearch: StoredPreSearch = createMockPreSearch({
      status: AnalysisStatuses.PENDING,
      searchData: null,
    });

    render(
      <PreSearchStream
        threadId="thread-123"
        preSearch={preSearch}
      />,
    );

    // Should show LoaderFive with web search loading text
    const loader = screen.getByTestId('loader-five');
    expect(loader).toBeInTheDocument();
    expect(loader.textContent).toContain('Searching the web');
  });

  it('shows LoaderFive when STREAMING with no data', () => {
    const preSearch: StoredPreSearch = createMockPreSearch({
      status: AnalysisStatuses.STREAMING,
      searchData: null,
    });

    render(
      <PreSearchStream
        threadId="thread-123"
        preSearch={preSearch}
      />,
    );

    // Should show LoaderFive with web search loading text
    const loader = screen.getByTestId('loader-five');
    expect(loader).toBeInTheDocument();
    expect(loader.textContent).toContain('Searching the web');
  });

  it('hides LoaderFive when search data is available', async () => {
    const searchData = createMockPreSearchDataPayload();
    const preSearch: StoredPreSearch = createMockPreSearch({
      status: AnalysisStatuses.STREAMING,
      searchData,
    });

    render(
      <PreSearchStream
        threadId="thread-123"
        preSearch={preSearch}
      />,
    );

    // Should NOT show LoaderFive when data is available
    await waitFor(() => {
      expect(screen.queryByTestId('loader-five')).not.toBeInTheDocument();
    });
  });

  it('hides LoaderFive when status is COMPLETE with results', async () => {
    const searchData = createMockPreSearchDataPayload();
    const preSearch: StoredPreSearch = createMockPreSearch({
      status: AnalysisStatuses.COMPLETE,
      searchData,
    });

    render(
      <PreSearchStream
        threadId="thread-123"
        preSearch={preSearch}
      />,
    );

    // Should NOT show LoaderFive when complete
    await waitFor(() => {
      expect(screen.queryByTestId('loader-five')).not.toBeInTheDocument();
    });
  });

  it('handles different rounds independently', () => {
    const preSearchRound1: StoredPreSearch = createMockPreSearch({
      roundNumber: 1,
      status: AnalysisStatuses.PENDING,
      searchData: null,
    });

    const { rerender } = render(
      <PreSearchStream
        threadId="thread-123"
        preSearch={preSearchRound1}
      />,
    );

    // Round 1 should show LoaderFive
    expect(screen.getByTestId('loader-five')).toBeInTheDocument();

    // Update to round 2 with different status
    const preSearchRound2: StoredPreSearch = createMockPreSearch({
      roundNumber: 2,
      status: AnalysisStatuses.COMPLETE,
      searchData: createMockPreSearchDataPayload(),
    });

    rerender(
      <TestWrapper>
        <PreSearchStream
          threadId="thread-123"
          preSearch={preSearchRound2}
        />
      </TestWrapper>,
    );

    // Round 2 should NOT show LoaderFive (has data)
    expect(screen.queryByTestId('loader-five')).not.toBeInTheDocument();
  });
});

// ============================================================================
// ModeratorAnalysisStream Loading State Tests
// ============================================================================

describe('moderatorAnalysisStream Loading States', () => {
  let ModeratorAnalysisStream: typeof import('@/components/chat/moderator/moderator-analysis-stream').ModeratorAnalysisStream;

  beforeEach(async () => {
    vi.clearAllMocks();
    const importedModule = await import('@/components/chat/moderator/moderator-analysis-stream');
    ModeratorAnalysisStream = importedModule.ModeratorAnalysisStream;
  });

  it('shows LoaderFive when PENDING with no data', () => {
    const analysis: StoredModeratorAnalysis = createMockAnalysis({
      status: AnalysisStatuses.PENDING,
      analysisData: null,
    });

    render(
      <ModeratorAnalysisStream
        threadId="thread-123"
        analysis={analysis}
      />,
    );

    // Should show LoaderFive with analysis loading text
    const loader = screen.getByTestId('loader-five');
    expect(loader).toBeInTheDocument();
    expect(loader.textContent).toContain('Analyzing participant responses');
  });

  it('shows LoaderFive when STREAMING with no data', () => {
    const analysis: StoredModeratorAnalysis = createMockAnalysis({
      status: AnalysisStatuses.STREAMING,
      analysisData: null,
    });

    render(
      <ModeratorAnalysisStream
        threadId="thread-123"
        analysis={analysis}
      />,
    );

    // Should show LoaderFive with analysis loading text
    const loader = screen.getByTestId('loader-five');
    expect(loader).toBeInTheDocument();
    expect(loader.textContent).toContain('Analyzing participant responses');
  });

  it('hides LoaderFive when analysis is COMPLETE with data', async () => {
    // For COMPLETE status, the component uses analysis.analysisData
    // Must provide valid analysis data that passes hasAnalysisData check
    const analysis: StoredModeratorAnalysis = createMockAnalysis({
      status: AnalysisStatuses.COMPLETE,
      analysisData: {
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'Test question',
        roundConfidence: 75, // Required by hasAnalysisData
        summary: 'Test summary with enough content',
      },
    });

    render(
      <ModeratorAnalysisStream
        threadId="thread-123"
        analysis={analysis}
      />,
    );

    // Should NOT show LoaderFive when valid data is available
    await waitFor(() => {
      expect(screen.queryByTestId('loader-five')).not.toBeInTheDocument();
    });
  });

  it('handles different rounds with appropriate loading states', () => {
    // Round 1: Pending
    const analysisRound1: StoredModeratorAnalysis = createMockAnalysis({
      id: 'analysis-1',
      roundNumber: 1,
      status: AnalysisStatuses.PENDING,
      analysisData: null,
    });

    const { rerender } = render(
      <ModeratorAnalysisStream
        threadId="thread-123"
        analysis={analysisRound1}
      />,
    );

    expect(screen.getByTestId('loader-five')).toBeInTheDocument();

    // Round 2: Complete with valid data
    const analysisRound2: StoredModeratorAnalysis = createMockAnalysis({
      id: 'analysis-2',
      roundNumber: 2,
      status: AnalysisStatuses.COMPLETE,
      analysisData: {
        roundNumber: 2,
        mode: 'debating',
        userQuestion: 'Test question',
        roundConfidence: 80, // Required by hasAnalysisData
        summary: 'Complete analysis with content',
      },
    });

    rerender(
      <TestWrapper>
        <ModeratorAnalysisStream
          threadId="thread-123"
          analysis={analysisRound2}
        />
      </TestWrapper>,
    );

    // Round 2 should NOT show LoaderFive
    expect(screen.queryByTestId('loader-five')).not.toBeInTheDocument();
  });
});

// ============================================================================
// LoaderFive Mock Integration Tests
// ============================================================================

describe('encryptedText Mock Integration', () => {
  it('renders with correct text via mock', () => {
    // The LoaderFive is mocked at the top of this file
    // This tests that the mock works correctly
    const MockedLoader = ({ text }: { text: string }) => (
      <div data-testid="loader-five">{text}</div>
    );

    render(<MockedLoader text="Test loading text" />);

    expect(screen.getByTestId('loader-five')).toBeInTheDocument();
    expect(screen.getByText('Test loading text')).toBeInTheDocument();
  });

  it('updates text dynamically', () => {
    const MockedLoader = ({ text }: { text: string }) => (
      <div data-testid="loader-five">{text}</div>
    );

    const { rerender } = render(<MockedLoader text="First text" />);
    expect(screen.getByText('First text')).toBeInTheDocument();

    rerender(<MockedLoader text="Second text" />);
    expect(screen.getByText('Second text')).toBeInTheDocument();
  });

  it('handles empty text gracefully', () => {
    const MockedLoader = ({ text }: { text: string }) => (
      <div data-testid="loader-five">{text}</div>
    );

    render(<MockedLoader text="" />);
    expect(screen.getByTestId('loader-five')).toBeInTheDocument();
  });
});

// ============================================================================
// Integration: Loading State Transitions
// ============================================================================

describe('loading State Transitions', () => {
  it('participant transitions from pending to streaming to complete', async () => {
    const importedModule = await import('@/components/chat/model-message-card');
    const ModelMessageCard = importedModule.ModelMessageCard;

    const model = {
      id: 'anthropic/claude-3.5-sonnet',
      name: 'Claude',
      is_accessible_to_user: true,
    } as never;

    // Initial: PENDING with no parts
    const { rerender } = render(
      <ModelMessageCard
        model={model}
        participantIndex={0}
        status={MessageStatuses.PENDING}
        parts={[]}
        avatarSrc="/avatar.png"
        avatarName="Claude"
      />,
    );

    expect(screen.getByTestId('loader-five')).toBeInTheDocument();

    // Transition: STREAMING with parts
    rerender(
      <TestWrapper>
        <ModelMessageCard
          model={model}
          participantIndex={0}
          status={MessageStatuses.STREAMING}
          parts={[{ type: 'text', text: 'Starting response...' }]}
          avatarSrc="/avatar.png"
          avatarName="Claude"
        />
      </TestWrapper>,
    );

    // LoaderFive should be hidden, content should be visible
    expect(screen.queryByTestId('loader-five')).not.toBeInTheDocument();

    // Transition: COMPLETE with full content
    rerender(
      <TestWrapper>
        <ModelMessageCard
          model={model}
          participantIndex={0}
          status={MessageStatuses.COMPLETE}
          parts={[{ type: 'text', text: 'Complete response with all content.' }]}
          avatarSrc="/avatar.png"
          avatarName="Claude"
        />
      </TestWrapper>,
    );

    // LoaderFive should still be hidden
    expect(screen.queryByTestId('loader-five')).not.toBeInTheDocument();
  });

  it('pre-search transitions from pending to complete', async () => {
    const importedModule = await import('@/components/chat/pre-search-stream');
    const PreSearchStream = importedModule.PreSearchStream;

    // Initial: PENDING
    const pendingPreSearch: StoredPreSearch = createMockPreSearch({
      status: AnalysisStatuses.PENDING,
      searchData: null,
    });

    const { rerender } = render(
      <PreSearchStream
        threadId="thread-123"
        preSearch={pendingPreSearch}
      />,
    );

    expect(screen.getByTestId('loader-five')).toBeInTheDocument();

    // Transition: COMPLETE with data
    const completePreSearch: StoredPreSearch = createMockPreSearch({
      status: AnalysisStatuses.COMPLETE,
      searchData: createMockPreSearchDataPayload(),
    });

    rerender(
      <TestWrapper>
        <PreSearchStream
          threadId="thread-123"
          preSearch={completePreSearch}
        />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('loader-five')).not.toBeInTheDocument();
    });
  });
});

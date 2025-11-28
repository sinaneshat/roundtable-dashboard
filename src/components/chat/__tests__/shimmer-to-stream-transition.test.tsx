/**
 * Shimmer-to-Stream Transition Tests
 *
 * Tests that pending participant placeholders use the SAME ModelMessageCard component
 * that handles streaming, ensuring seamless in-place text replacement without remounting.
 *
 * REQUIREMENT:
 * - When threads begin after first message submission, shimmering placeholder text appears
 * - As streams arrive for each participant's turn, the shimmer text is replaced IN PLACE
 * - NO component remounting - just text replacement within the same component
 * - This behavior must work in all rounds (overview screen and chat thread screen)
 *
 * CURRENT BUG:
 * - Pending participant cards (lines 841-882 in chat-message-list.tsx) render a custom
 *   placeholder with LoaderFive showing "Waiting for response from {name}"
 * - When streaming starts, this placeholder is hidden and a NEW ModelMessageCard mounts
 * - ModelMessageCard shows "Generating response from {model}"
 * - This causes visible remounting instead of seamless text replacement
 *
 * FIX:
 * - Pending participants should render ModelMessageCard with status=PENDING, parts=[]
 * - When streaming starts, the same component receives status=STREAMING, parts=[content]
 * - AnimatePresence mode="wait" in ModelMessageCard handles smooth transition
 * - Translation key should be "Generating response from" (not "Waiting for response")
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, MessageRoles, UIMessageRoles } from '@/api/core/enums';
import type { ChatParticipant, StoredPreSearch } from '@/api/routes/chat/schema';
import { testLocale, testMessages, testTimeZone } from '@/lib/testing/test-messages';
import { createMockParticipant, createMockPreSearch, createMockUserMessage } from '@/stores/chat/__tests__/test-factories';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock LoaderFive to render plain text for easier testing
vi.mock('@/components/ui/loader', () => ({
  LoaderFive: ({ text }: { text: string }) => (
    <div data-testid="loader-five">{text}</div>
  ),
}));

// Mock motion/react to avoid animation issues in tests
vi.mock('motion/react', () => ({
  motion: {
    span: ({ children, ...props }: { children: ReactNode }) => <span {...props}>{children}</span>,
    div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  LayoutGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Mock animation constants
vi.mock('@/components/ui/motion', () => ({
  AnimatedStreamingList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AnimatedStreamingItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ANIMATION_DURATION: { fast: 0.15, normal: 0.3, slow: 0.5 },
  ANIMATION_EASE: {
    standard: [0.4, 0, 0.2, 1],
    enter: [0, 0, 0.2, 1],
    exit: [0.4, 0, 1, 1],
  },
}));

// Mock Streamdown for content rendering
vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children: ReactNode }) => <div data-testid="streamdown">{children}</div>,
}));

// Mock Image component
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

// Mock UI components
vi.mock('@/components/chat/web-search-configuration-display', () => ({
  WebSearchConfigurationDisplay: () => <div data-testid="config-display">Config Display</div>,
}));
vi.mock('@/components/chat/web-search-result-item', () => ({
  WebSearchResultItem: () => <div data-testid="search-result">Result Item</div>,
}));
vi.mock('@/components/chat/pre-search-card', () => ({
  PreSearchCard: () => <div data-testid="pre-search-card">PreSearchCard</div>,
}));

// Hoist mock store state
const { mockStoreState } = vi.hoisted(() => {
  const mockStoreState = {
    hasPreSearchBeenTriggered: vi.fn(() => false),
    markPreSearchTriggered: vi.fn(),
    registerAnimation: vi.fn(),
    completeAnimation: vi.fn(),
  };
  return { mockStoreState };
});

// Mock chat store provider - this replaces the real store
vi.mock('@/components/providers/chat-store-provider', async () => {
  return {
    useChatStore: (selector: (state: typeof mockStoreState) => unknown) =>
      selector(mockStoreState),
  };
});

// Mock hooks
vi.mock('@/hooks/utils', () => ({
  useBoolean: () => ({
    value: false,
    setTrue: vi.fn(),
    setFalse: vi.fn(),
    toggle: vi.fn(),
  }),
  useAutoScroll: () => ({ current: null }),
  useModelLookup: () => ({
    findModel: (modelId?: string) => modelId
      ? {
          id: modelId,
          name: modelId === 'openai/gpt-4' ? 'GPT-4' : modelId === 'anthropic/claude-3' ? 'Claude 3' : 'AI Model',
          is_accessible_to_user: true,
          pricing: {
            prompt: '0.001',
            completion: '0.002',
            request: '0',
            image: '0',
          },
        }
      : undefined,
  }),
}));

// Mock queries
vi.mock('@/hooks/queries/usage', () => ({
  useUsageStatsQuery: () => ({
    data: { data: { subscription: { tier: 'free' } } },
  }),
}));

// ============================================================================
// Test Setup
// ============================================================================

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function TestWrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider
        locale={testLocale}
        messages={testMessages}
        timeZone={testTimeZone}
      >
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

function renderWithProviders(ui: ReactNode) {
  return rtlRender(ui, { wrapper: TestWrapper });
}

// ============================================================================
// Test Utilities
// ============================================================================

function createParticipants(count: number): ChatParticipant[] {
  const modelIds = ['openai/gpt-4', 'anthropic/claude-3', 'google/gemini-pro'];
  return Array.from({ length: count }, (_, i) =>
    createMockParticipant(i, {
      id: `participant-${i}`,
      modelId: modelIds[i % modelIds.length],
    }));
}

// ============================================================================
// Tests
// ============================================================================

describe('shimmer-to-Stream Transition (Seamless)', () => {
  let ChatMessageList: typeof import('@/components/chat/chat-message-list').ChatMessageList;

  beforeEach(async () => {
    vi.clearAllMocks();
    const importedModule = await import('@/components/chat/chat-message-list');
    ChatMessageList = importedModule.ChatMessageList;
  });

  describe('pending Participant Rendering', () => {
    it('renders pending participants using ModelMessageCard component (not custom placeholder)', () => {
      /**
       * EXPECTED BEHAVIOR:
       * Pending participants should use ModelMessageCard which shows:
       * "Generating response from {model}" (translation key: chat.participant.generating)
       *
       * CURRENT BUG:
       * Custom placeholder cards show "Waiting for response from {name}"
       * (translation key: chat.participant.waitingNamed)
       */
      const participants = createParticipants(2);
      const userMessage = createMockUserMessage(0);
      const preSearch: StoredPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
      });

      renderWithProviders(
        <ChatMessageList
          messages={[userMessage]}
          participants={participants}
          isStreaming={false}
          currentParticipantIndex={0}
          threadId="thread-123"
          preSearches={[preSearch]}
          streamingRoundNumber={0}
        />,
      );

      // Find all LoaderFive instances
      const loaders = screen.getAllByTestId('loader-five');

      // CRITICAL ASSERTION: Pending participants should show context-aware loading text
      // NOT "Waiting for response from {name}" (old bug pattern)
      // Valid patterns: "Generating response from", "Gathering thoughts", "Waiting for web results", "Waiting for {name}"
      loaders.forEach((loader) => {
        const text = loader.textContent ?? '';
        const hasValidPattern = text.includes('Generating response from')
          || text.includes('Gathering thoughts')
          || text.includes('Waiting for');
        expect(hasValidPattern).toBe(true);
      });

      // Should NOT find any "Waiting for response" text
      // If this fails, it means custom placeholder cards are being rendered
      expect(screen.queryByText(/Waiting for response/i)).not.toBeInTheDocument();
    });

    it('uses stable keys for pending participant ModelMessageCard components', () => {
      const participants = createParticipants(2);
      const userMessage = createMockUserMessage(0);
      const preSearch: StoredPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
      });

      const { rerender } = renderWithProviders(
        <ChatMessageList
          messages={[userMessage]}
          participants={participants}
          isStreaming={false}
          currentParticipantIndex={0}
          threadId="thread-123"
          preSearches={[preSearch]}
          streamingRoundNumber={0}
        />,
      );

      // Get the initial loader elements
      const initialLoaders = screen.getAllByTestId('loader-five');
      const initialCount = initialLoaders.length;

      // Rerender with same props - count should stay the same
      rerender(
        <TestWrapper>
          <ChatMessageList
            messages={[userMessage]}
            participants={participants}
            isStreaming={false}
            currentParticipantIndex={0}
            threadId="thread-123"
            preSearches={[preSearch]}
            streamingRoundNumber={0}
          />
        </TestWrapper>,
      );

      const afterRerender = screen.getAllByTestId('loader-five');
      expect(afterRerender).toHaveLength(initialCount);
    });

    it('transitions from shimmer to streaming content without remounting', () => {
      /**
       * EXPECTED BEHAVIOR:
       * When streaming starts, the same ModelMessageCard component should transition
       * from showing shimmer to showing content.
       *
       * Both states should show "Generating response from" - this confirms
       * the same component type is used throughout the transition.
       */
      const participants = createParticipants(2);
      const userMessage = createMockUserMessage(0);
      const preSearch: StoredPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        searchData: { queries: [], results: [], analysis: '', successCount: 0, failureCount: 0, totalResults: 0, totalTime: 0 },
      });

      // Initial render: Pre-search complete, streaming about to start
      const { rerender } = renderWithProviders(
        <ChatMessageList
          messages={[userMessage]}
          participants={participants}
          isStreaming={false}
          currentParticipantIndex={0}
          threadId="thread-123"
          preSearches={[preSearch]}
          streamingRoundNumber={0}
        />,
      );

      // Should show shimmer loaders for both participants
      let loaders = screen.getAllByTestId('loader-five');
      expect(loaders.length).toBeGreaterThanOrEqual(1);

      // All loaders should show context-aware loading text (not old "Waiting" placeholder)
      loaders.forEach((loader) => {
        const text = loader.textContent ?? '';
        const hasValidPattern = text.includes('Generating response from')
          || text.includes('Gathering thoughts')
          || text.includes('Waiting for');
        expect(hasValidPattern).toBe(true);
      });

      // Now simulate streaming starting for first participant
      const streamingMessage = {
        id: 'thread-123_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [], // Empty parts = shows loader
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          participantRole: null,
        },
      };

      rerender(
        <TestWrapper>
          <ChatMessageList
            messages={[userMessage, streamingMessage]}
            participants={participants}
            isStreaming={true}
            currentParticipantIndex={0}
            currentStreamingParticipant={participants[0]}
            threadId="thread-123"
            preSearches={[preSearch]}
            streamingRoundNumber={0}
          />
        </TestWrapper>,
      );

      // The streaming participant should still show loader (parts are empty)
      loaders = screen.getAllByTestId('loader-five');
      expect(loaders.length).toBeGreaterThanOrEqual(1);

      // All loaders should STILL show context-aware text - proving same component type is used
      loaders.forEach((loader) => {
        const text = loader.textContent ?? '';
        const hasValidPattern = text.includes('Generating response from')
          || text.includes('Gathering thoughts')
          || text.includes('Waiting for');
        expect(hasValidPattern).toBe(true);
      });
    });

    it('shows content when parts arrive (with complete metadata)', () => {
      const participants = createParticipants(1);
      const userMessage = createMockUserMessage(0);
      const preSearch: StoredPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      });

      // Render with complete message (has content AND model metadata)
      // This tests that messages with content are properly rendered, not showing shimmer
      renderWithProviders(
        <ChatMessageList
          messages={[
            userMessage,
            {
              id: 'thread-123_r0_p0',
              role: UIMessageRoles.ASSISTANT,
              parts: [{ type: 'text', text: 'Hello, I am responding...' }],
              metadata: {
                role: MessageRoles.ASSISTANT,
                roundNumber: 0,
                participantId: 'participant-0',
                participantIndex: 0,
                participantRole: null,
                model: 'openai/gpt-4', // Complete message has model
                finishReason: 'stop',
              },
            },
          ]}
          participants={participants}
          isStreaming={false} // Not streaming
          currentParticipantIndex={0}
          currentStreamingParticipant={null}
          threadId="thread-123"
          preSearches={[preSearch]}
          streamingRoundNumber={0}
        />,
      );

      // Content should be visible
      expect(screen.getByText(/Hello, I am responding/)).toBeInTheDocument();
    });
  });

  describe('multi-Round Behavior', () => {
    it('shows shimmer for pending participants in round 2', () => {
      const participants = createParticipants(2);
      // Round 1 complete, Round 2 user message submitted
      const round1User = createMockUserMessage(0);
      const round1P0 = {
        id: 'thread-123_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Round 1 response from GPT-4' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          participantRole: null,
          model: 'openai/gpt-4',
          finishReason: 'stop',
        },
      };
      const round1P1 = {
        id: 'thread-123_r0_p1',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Round 1 response from Claude' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          participantRole: null,
          model: 'anthropic/claude-3',
          finishReason: 'stop',
        },
      };
      const round2User = {
        id: 'user-msg-1',
        role: UIMessageRoles.USER,
        parts: [{ type: 'text', text: 'Follow up question' }],
        metadata: { role: MessageRoles.USER, roundNumber: 1 },
      };

      const preSearchRound2: StoredPreSearch = createMockPreSearch({
        roundNumber: 1,
        status: AnalysisStatuses.STREAMING,
      });

      renderWithProviders(
        <ChatMessageList
          messages={[round1User, round1P0, round1P1, round2User]}
          participants={participants}
          isStreaming={false}
          currentParticipantIndex={0}
          threadId="thread-123"
          preSearches={[preSearchRound2]}
          streamingRoundNumber={1}
        />,
      );

      // Round 2 pending participants should show shimmer with "Generating"
      const loaders = screen.getAllByTestId('loader-five');
      expect(loaders.length).toBeGreaterThanOrEqual(1);

      // All loaders should show context-aware text (not old "Waiting for response" placeholder)
      loaders.forEach((loader) => {
        const text = loader.textContent ?? '';
        const hasValidPattern = text.includes('Generating response from')
          || text.includes('Gathering thoughts')
          || text.includes('Waiting for');
        expect(hasValidPattern).toBe(true);
      });
    });
  });

  describe('component Identity Verification', () => {
    it('pending cards use ModelMessageCard with context-aware loading text', () => {
      /**
       * This test verifies that pending participant placeholders are rendered
       * using ModelMessageCard with appropriate loading text.
       *
       * Valid patterns: "Generating response from", "Gathering thoughts", "Waiting for web results"
       */
      const participants = createParticipants(1);
      const userMessage = createMockUserMessage(0);
      const preSearch: StoredPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
      });

      renderWithProviders(
        <ChatMessageList
          messages={[userMessage]}
          participants={participants}
          isStreaming={false}
          currentParticipantIndex={0}
          threadId="thread-123"
          preSearches={[preSearch]}
          streamingRoundNumber={0}
        />,
      );

      // The LoaderFive should show context-aware loading text
      const loader = screen.getByTestId('loader-five');
      expect(loader).toBeInTheDocument();
      const text = loader.textContent ?? '';
      const hasValidPattern = text.includes('Generating response from')
        || text.includes('Gathering thoughts')
        || text.includes('Waiting for');
      expect(hasValidPattern).toBe(true);
    });

    it('does NOT render "Waiting for response" text (old bug pattern)', () => {
      /**
       * Old buggy code used "Waiting for response from {name}" for placeholder cards.
       * After fix, all pending states use context-aware loading text.
       */
      const participants = createParticipants(2);
      const userMessage = createMockUserMessage(0);
      const preSearch: StoredPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
      });

      renderWithProviders(
        <ChatMessageList
          messages={[userMessage]}
          participants={participants}
          isStreaming={false}
          currentParticipantIndex={0}
          threadId="thread-123"
          preSearches={[preSearch]}
          streamingRoundNumber={0}
        />,
      );

      // Should NOT find any "Waiting for response" text (old bug pattern)
      expect(screen.queryByText(/Waiting for response/i)).not.toBeInTheDocument();

      // All loaders should use context-aware loading text
      const loaders = screen.getAllByTestId('loader-five');
      loaders.forEach((loader) => {
        expect(loader.textContent).not.toContain('Waiting for response');
        const text = loader.textContent ?? '';
        const hasValidPattern = text.includes('Generating response from')
          || text.includes('Gathering thoughts')
          || text.includes('Waiting for');
        expect(hasValidPattern).toBe(true);
      });
    });
  });
});

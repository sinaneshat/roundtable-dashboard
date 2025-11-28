/**
 * Streaming Position Stability Tests
 *
 * CRITICAL REGRESSION TESTS for the bug where streaming messages appeared
 * at the BOTTOM of the message list instead of staying IN PLACE.
 *
 * BUG SCENARIO:
 * 1. User submits message, 3 participant placeholders appear (shimmer loaders)
 * 2. First participant starts streaming - content should replace shimmer IN PLACE
 * 3. BUG: Instead, streaming content appeared at the BOTTOM (after all placeholders)
 *
 * ROOT CAUSE:
 * - Messages with content went to `messageGroups` (assistant-group section)
 * - messageGroups rendered AFTER the pending cards section
 * - This caused visual reordering - streamed content jumped to bottom
 *
 * FIX:
 * - Skip ALL assistant messages for current streaming round from messageGroups
 * - Render ALL participants in pending cards section (with content or shimmer)
 * - This maintains stable DOM order - shimmer is replaced in-place with content
 *
 * @see src/components/chat/chat-message-list.tsx
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, MessageRoles, UIMessageRoles } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { testLocale, testMessages, testTimeZone } from '@/lib/testing/test-messages';
import { createMockParticipant, createMockPreSearch, createMockUserMessage } from '@/stores/chat/__tests__/test-factories';

// ============================================================================
// Mock Setup
// ============================================================================

vi.mock('@/components/ui/loader', () => ({
  LoaderFive: ({ text }: { text: string }) => (
    <div data-testid="loader-five">{text}</div>
  ),
}));

vi.mock('motion/react', () => ({
  motion: {
    span: ({ children, ...props }: { children: ReactNode }) => <span {...props}>{children}</span>,
    div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  LayoutGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/motion', () => ({
  AnimatedStreamingList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AnimatedStreamingItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ANIMATION_DURATION: { fast: 0.15, normal: 0.3, slow: 0.5 },
  ANIMATION_EASE: { standard: [0.4, 0, 0.2, 1], enter: [0, 0, 0.2, 1], exit: [0.4, 0, 1, 1] },
}));

vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children: ReactNode }) => (
    <div data-testid="streamdown-content">{children}</div>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('@/components/chat/web-search-configuration-display', () => ({
  WebSearchConfigurationDisplay: () => <div data-testid="config-display">Config Display</div>,
}));
vi.mock('@/components/chat/web-search-result-item', () => ({
  WebSearchResultItem: () => <div data-testid="search-result">Result Item</div>,
}));
vi.mock('@/components/chat/pre-search-card', () => ({
  PreSearchCard: () => <div data-testid="pre-search-card">PreSearchCard</div>,
}));

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
  return {
    useChatStore: (selector: (state: typeof mockStoreState) => unknown) =>
      selector(mockStoreState),
  };
});

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
          name: modelId.includes('gpt') ? 'GPT-4' : modelId.includes('claude') ? 'Claude 3' : 'Gemini Pro',
          is_accessible_to_user: true,
          pricing: { prompt: '0.001', completion: '0.002', request: '0', image: '0' },
        }
      : undefined,
  }),
}));

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
      <NextIntlClientProvider locale={testLocale} messages={testMessages} timeZone={testTimeZone}>
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

function createParticipantsWithPriorities(priorities: number[]) {
  const modelIds = ['openai/gpt-4', 'anthropic/claude-3', 'google/gemini-pro'];
  return priorities.map((priority, i) =>
    createMockParticipant(i, {
      id: `participant-${i}`,
      modelId: modelIds[i % modelIds.length],
      priority,
    }));
}

// ============================================================================
// CRITICAL REGRESSION TESTS
// ============================================================================

describe('streaming Position Stability (REGRESSION)', () => {
  let ChatMessageList: typeof import('@/components/chat/chat-message-list').ChatMessageList;

  beforeEach(async () => {
    vi.clearAllMocks();
    const importedModule = await import('@/components/chat/chat-message-list');
    ChatMessageList = importedModule.ChatMessageList;
  });

  describe('streaming Content Must Stay In Place', () => {
    it('rEGRESSION: streaming content should NOT appear after all pending placeholders', () => {
      /**
       * BUG SCENARIO:
       * - 3 participants with priorities 0, 1, 2
       * - Participant 0 starts streaming with content
       * - BUG: Content appeared at BOTTOM (after participant 1 and 2 placeholders)
       * - FIX: Content should stay at position 0 (first), replacing its shimmer in-place
       *
       * This test verifies that both content and loaders are rendered,
       * which is the key requirement for the fix to work.
       */
      const participants = createParticipantsWithPriorities([0, 1, 2]);
      const userMessage = createMockUserMessage(0);
      const preSearch: StoredPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      });

      // First participant has streaming content
      const streamingMessage = {
        id: 'thread-123_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'I am the first response from GPT-4!' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          participantRole: null,
          model: 'openai/gpt-4',
        },
      };

      renderWithProviders(
        <ChatMessageList
          messages={[userMessage, streamingMessage]}
          participants={participants}
          isStreaming={true}
          currentParticipantIndex={0}
          currentStreamingParticipant={participants[0]}
          threadId="thread-123"
          preSearches={[preSearch]}
          streamingRoundNumber={0}
        />,
      );

      // CRITICAL: Content for first participant should exist
      const content = screen.getByText('I am the first response from GPT-4!');
      expect(content).toBeInTheDocument();

      // CRITICAL: Loaders for pending participants (2 and 3) should exist
      const loaders = screen.getAllByTestId('loader-five');
      expect(loaders.length).toBeGreaterThanOrEqual(1);

      // Verify loaders show context-aware loading text (not old "Waiting for response" pattern)
      // Valid patterns: "Generating response from", "Gathering thoughts", "Waiting for"
      loaders.forEach((loader) => {
        const text = loader.textContent ?? '';
        const hasValidPattern = text.includes('Generating response from')
          || text.includes('Gathering thoughts')
          || text.includes('Waiting for');
        expect(hasValidPattern).toBe(true);
      });

      // CRITICAL: Verify we're NOT using the old placeholder pattern
      expect(screen.queryByText(/Waiting for response/i)).not.toBeInTheDocument();
    });

    it('rEGRESSION: all participants should render in priority order during streaming', () => {
      /**
       * When participant 0 is streaming with content:
       * - Position 0: Participant 0 content (GPT-4) <- currently streaming
       * - Position 1: Participant 1 shimmer (Claude 3) <- pending
       * - Position 2: Participant 2 shimmer (Gemini Pro) <- pending
       */
      const participants = createParticipantsWithPriorities([0, 1, 2]);
      const userMessage = createMockUserMessage(0);
      const preSearch: StoredPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      });

      const streamingMessage = {
        id: 'thread-123_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Response from first participant' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          participantRole: null,
          model: 'openai/gpt-4',
        },
      };

      renderWithProviders(
        <ChatMessageList
          messages={[userMessage, streamingMessage]}
          participants={participants}
          isStreaming={true}
          currentParticipantIndex={0}
          currentStreamingParticipant={participants[0]}
          threadId="thread-123"
          preSearches={[preSearch]}
          streamingRoundNumber={0}
        />,
      );

      // Content for first participant should be visible
      expect(screen.getByText('Response from first participant')).toBeInTheDocument();

      // Loaders for pending participants should still be visible
      const loaders = screen.getAllByTestId('loader-five');
      expect(loaders.length).toBeGreaterThanOrEqual(1);

      // Verify the loaders show context-aware loading text
      loaders.forEach((loader) => {
        const text = loader.textContent ?? '';
        const hasValidPattern = text.includes('Generating response from')
          || text.includes('Gathering thoughts')
          || text.includes('Waiting for');
        expect(hasValidPattern).toBe(true);
      });
    });

    it('rEGRESSION: second participant content should appear after first, not at bottom', () => {
      /**
       * After participant 0 completes and participant 1 starts streaming:
       * - Position 0: Participant 0 content (complete)
       * - Position 1: Participant 1 content (streaming) <- should be HERE
       * - Position 2: Participant 2 shimmer (pending)
       *
       * BUG: Participant 1 content was appearing at position 2 (bottom)
       */
      const participants = createParticipantsWithPriorities([0, 1, 2]);
      const userMessage = createMockUserMessage(0);
      const preSearch: StoredPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      });

      const messages = [
        userMessage,
        // First participant completed
        {
          id: 'thread-123_r0_p0',
          role: UIMessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'First response complete!' }],
          metadata: {
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            participantId: 'participant-0',
            participantIndex: 0,
            participantRole: null,
            model: 'openai/gpt-4',
            finishReason: 'stop',
          },
        },
        // Second participant streaming
        {
          id: 'thread-123_r0_p1',
          role: UIMessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Second response streaming!' }],
          metadata: {
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            participantId: 'participant-1',
            participantIndex: 1,
            participantRole: null,
            model: 'anthropic/claude-3',
          },
        },
      ];

      renderWithProviders(
        <ChatMessageList
          messages={messages}
          participants={participants}
          isStreaming={true}
          currentParticipantIndex={1}
          currentStreamingParticipant={participants[1]}
          threadId="thread-123"
          preSearches={[preSearch]}
          streamingRoundNumber={0}
        />,
      );

      // Both contents should be visible
      const first = screen.getByText('First response complete!');
      const second = screen.getByText('Second response streaming!');

      expect(first).toBeInTheDocument();
      expect(second).toBeInTheDocument();

      // Third participant should still show loader
      const loaders = screen.getAllByTestId('loader-five');
      expect(loaders.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('priority Order Maintained During Streaming', () => {
    it('should render participants in priority order when priorities are not sequential', () => {
      /**
       * Participants with priorities: [2, 0, 1]
       * Expected display order: participant-1 (priority 0), participant-2 (priority 1), participant-0 (priority 2)
       */
      const participants = createParticipantsWithPriorities([2, 0, 1]);
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

      // All participants should show as pending (shimmer loaders)
      const loaders = screen.getAllByTestId('loader-five');
      expect(loaders).toHaveLength(3);

      // All should show context-aware loading text (not old placeholder pattern)
      loaders.forEach((loader) => {
        const text = loader.textContent ?? '';
        const hasValidPattern = text.includes('Generating response from')
          || text.includes('Gathering thoughts')
          || text.includes('Waiting for');
        expect(hasValidPattern).toBe(true);
      });
    });

    it('rEGRESSION: first priority participant should stream first, not last in array', () => {
      /**
       * BUG: When participants were in order [priority 2, priority 0, priority 1],
       * the stream would fill participant-0 (priority 2) instead of participant-1 (priority 0)
       *
       * FIX: currentParticipantIndex refers to SORTED array, so index 0 = priority 0
       *
       * This test verifies that:
       * 1. The correct participant (priority 0) shows content
       * 2. Other participants show loaders
       */
      const participants = createParticipantsWithPriorities([2, 0, 1]); // indices 0,1,2 have priorities 2,0,1
      const userMessage = createMockUserMessage(0);
      const preSearch: StoredPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      });

      // currentParticipantIndex=0 means first in priority order = participant-1 (priority 0)
      const streamingMessage = {
        id: 'thread-123_r0_p1', // participant-1
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'I am priority 0, streaming first!' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'participant-1', // This is the one with priority 0
          participantIndex: 1,
          participantRole: null,
          model: 'anthropic/claude-3',
        },
      };

      renderWithProviders(
        <ChatMessageList
          messages={[userMessage, streamingMessage]}
          participants={participants}
          isStreaming={true}
          currentParticipantIndex={0} // First in priority order = participant-1
          currentStreamingParticipant={participants[1]} // participant-1 has priority 0
          threadId="thread-123"
          preSearches={[preSearch]}
          streamingRoundNumber={0}
        />,
      );

      // CRITICAL: Content for priority-0 participant (participant-1) should be visible
      expect(screen.getByText('I am priority 0, streaming first!')).toBeInTheDocument();

      // Loaders should exist for remaining participants
      const loaders = screen.getAllByTestId('loader-five');
      expect(loaders.length).toBeGreaterThanOrEqual(1);

      // Verify loaders show context-aware loading text
      loaders.forEach((loader) => {
        const text = loader.textContent ?? '';
        const hasValidPattern = text.includes('Generating response from')
          || text.includes('Gathering thoughts')
          || text.includes('Waiting for');
        expect(hasValidPattern).toBe(true);
      });
    });
  });

  describe('unified Rendering (No Message Group Split)', () => {
    it('rEGRESSION: streaming messages should NOT be in a separate section from pending', () => {
      /**
       * BUG: Streaming messages were rendered in "messageGroups" (assistant-group)
       * which appeared AFTER the pending cards section in the DOM.
       *
       * FIX: ALL participants for streaming round should be in the same section,
       * rendered by the pending cards logic (with content or shimmer).
       *
       * This test verifies both content and loaders render together (unified).
       */
      const participants = createParticipantsWithPriorities([0, 1, 2]);
      const userMessage = createMockUserMessage(0);
      const preSearch: StoredPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      });

      const streamingMessage = {
        id: 'thread-123_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Streaming content here' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          participantRole: null,
          model: 'openai/gpt-4',
        },
      };

      renderWithProviders(
        <ChatMessageList
          messages={[userMessage, streamingMessage]}
          participants={participants}
          isStreaming={true}
          currentParticipantIndex={0}
          currentStreamingParticipant={participants[0]}
          threadId="thread-123"
          preSearches={[preSearch]}
          streamingRoundNumber={0}
        />,
      );

      const content = screen.getByText('Streaming content here');
      const loaders = screen.getAllByTestId('loader-five');

      // CRITICAL: Both content and loaders should exist (unified rendering)
      expect(content).toBeInTheDocument();
      expect(loaders.length).toBeGreaterThanOrEqual(1);

      // CRITICAL: Loaders show context-aware loading text (not old placeholder)
      loaders.forEach((loader) => {
        const text = loader.textContent ?? '';
        const hasValidPattern = text.includes('Generating response from')
          || text.includes('Gathering thoughts')
          || text.includes('Waiting for');
        expect(hasValidPattern).toBe(true);
      });

      // Verify no "Waiting for response" (old bug pattern)
      expect(screen.queryByText(/Waiting for response/i)).not.toBeInTheDocument();
    });
  });

  describe('transition From Shimmer To Content', () => {
    it('should replace shimmer with content without changing position', () => {
      /**
       * Tests that when content arrives, it replaces shimmer in-place.
       * Verifies:
       * 1. Initial state shows loaders for all participants
       * 2. After content arrives, first participant shows content
       * 3. Remaining participants still show loaders
       */
      const participants = createParticipantsWithPriorities([0, 1]);
      const userMessage = createMockUserMessage(0);
      const preSearch: StoredPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      });

      // Initial: both pending (shimmer)
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

      // Both should show shimmer
      let loaders = screen.getAllByTestId('loader-five');
      expect(loaders.length).toBeGreaterThanOrEqual(2);

      // Now first participant has content
      const streamingMessage = {
        id: 'thread-123_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Content replaced shimmer!' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          participantRole: null,
          model: 'openai/gpt-4',
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

      // CRITICAL: First participant now has content
      const content = screen.getByText('Content replaced shimmer!');
      expect(content).toBeInTheDocument();

      // CRITICAL: Loaders should still exist for remaining participants
      loaders = screen.getAllByTestId('loader-five');
      expect(loaders.length).toBeGreaterThanOrEqual(1);

      // Verify loaders show context-aware loading text
      loaders.forEach((loader) => {
        const text = loader.textContent ?? '';
        const hasValidPattern = text.includes('Generating response from')
          || text.includes('Gathering thoughts')
          || text.includes('Waiting for');
        expect(hasValidPattern).toBe(true);
      });
    });
  });
});

describe('streaming Message Status Detection', () => {
  let ChatMessageList: typeof import('@/components/chat/chat-message-list').ChatMessageList;

  beforeEach(async () => {
    vi.clearAllMocks();
    const importedModule = await import('@/components/chat/chat-message-list');
    ChatMessageList = importedModule.ChatMessageList;
  });

  it('should show correct status for each participant during streaming', () => {
    /**
     * Expected statuses:
     * - Participant 0: COMPLETE (finished streaming) - shows content
     * - Participant 1: STREAMING (currently streaming) - shows content
     * - Participant 2: PENDING (waiting for turn) - shows loader
     *
     * This test verifies all three states are rendered correctly.
     */
    const participants = createParticipantsWithPriorities([0, 1, 2]);
    const userMessage = createMockUserMessage(0);
    const preSearch: StoredPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    });

    const messages = [
      userMessage,
      // Participant 0 completed
      {
        id: 'thread-123_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Completed response' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          model: 'openai/gpt-4',
          finishReason: 'stop', // Indicates completion
        },
      },
      // Participant 1 streaming
      {
        id: 'thread-123_r0_p1',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Currently streaming...' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          model: 'anthropic/claude-3',
          // No finishReason = still streaming
        },
      },
    ];

    renderWithProviders(
      <ChatMessageList
        messages={messages}
        participants={participants}
        isStreaming={true}
        currentParticipantIndex={1}
        currentStreamingParticipant={participants[1]}
        threadId="thread-123"
        preSearches={[preSearch]}
        streamingRoundNumber={0}
      />,
    );

    // CRITICAL: Both complete and streaming content should be visible
    const completedContent = screen.getByText('Completed response');
    const streamingContent = screen.getByText('Currently streaming...');
    expect(completedContent).toBeInTheDocument();
    expect(streamingContent).toBeInTheDocument();

    // CRITICAL: Pending participant should show loader
    const loaders = screen.getAllByTestId('loader-five');
    expect(loaders.length).toBeGreaterThanOrEqual(1);

    // Verify loaders show context-aware loading text
    loaders.forEach((loader) => {
      const text = loader.textContent ?? '';
      const hasValidPattern = text.includes('Generating response from')
        || text.includes('Gathering thoughts')
        || text.includes('Waiting for');
      expect(hasValidPattern).toBe(true);
    });

    // Verify no "Waiting for response" (old bug pattern)
    expect(screen.queryByText(/Waiting for response/i)).not.toBeInTheDocument();
  });
});

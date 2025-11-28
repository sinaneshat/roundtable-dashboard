/**
 * ThreadTimeline Feedback Visibility Tests
 *
 * CRITICAL BUG FIX TEST SUITE
 *
 * Bug: Like/dislike buttons appeared immediately in round 2+ when participants
 * finished streaming, but BEFORE the analysis completed. This was inconsistent
 * with round 1 behavior where buttons only appeared after the full round (including
 * analysis) was complete.
 *
 * Root Cause: The feedback visibility check only checked `!isStreaming` but didn't
 * verify that the round's analysis was COMPLETE.
 *
 * Fix: Added check for analysis status - feedback buttons only appear when
 * the round's analysis has status === AnalysisStatuses.COMPLETE.
 *
 * SCENARIOS TESTED:
 * 1. Exact bug reproduction: Round 2 feedback hidden during PENDING analysis
 * 2. Exact bug reproduction: Round 2 feedback hidden during STREAMING analysis
 * 3. Feedback shown when analysis is COMPLETE
 * 4. First round vs subsequent rounds: identical behavior
 * 5. Multi-round: each round's feedback depends on its own analysis status
 * 6. Edge cases: FAILED analysis, missing analysis, empty timeline
 * 7. Streaming protection: feedback hidden when isStreaming=true
 * 8. Read-only mode: feedback hidden regardless of analysis status
 *
 * Location: /src/components/chat/__tests__/thread-timeline-feedback-visibility.test.tsx
 */

import { render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeedbackTypes } from '@/api/core/enums';
import { AnalysisStatuses, ChatModes } from '@/api/core/enums';
import type { TimelineItem } from '@/hooks/utils';
import { testLocale, testMessages, testTimeZone } from '@/lib/testing/test-messages';
import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockUserMessage,
} from '@/stores/chat/__tests__/test-factories';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock motion/react to avoid animation issues in tests
vi.mock('motion/react', () => ({
  motion: {
    span: ({ children, ...props }: { children: ReactNode }) => <span {...props}>{children}</span>,
    div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  LayoutGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Mock animated components
vi.mock('@/components/ui/motion', () => ({
  AnimatedStreamingList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AnimatedStreamingItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ANIMATION_DURATION: { fast: 0.15, normal: 0.3, slow: 0.5 },
  ANIMATION_EASE: { standard: [0.4, 0, 0.2, 1], enter: [0, 0, 0.2, 1], exit: [0.4, 0, 1, 1] },
}));

// Mock RoundFeedback component to make it easily testable
vi.mock('@/components/chat/round-feedback', () => ({
  RoundFeedback: ({ roundNumber, disabled }: { roundNumber: number; disabled: boolean }) => (
    <div data-testid={`feedback-buttons-round-${roundNumber}`} data-disabled={disabled}>
      <button type="button" data-testid={`like-button-round-${roundNumber}`}>Like</button>
      <button type="button" data-testid={`dislike-button-round-${roundNumber}`}>Dislike</button>
    </div>
  ),
}));

// Mock RoundAnalysisCard
vi.mock('@/components/chat/moderator/round-analysis-card', () => ({
  RoundAnalysisCard: ({ analysis }: { analysis: { roundNumber: number; status: string } }) => (
    <div data-testid={`analysis-card-round-${analysis.roundNumber}`} data-status={analysis.status}>
      Analysis Card Round
      {' '}
      {analysis.roundNumber}
    </div>
  ),
}));

// Mock ChatMessageList
vi.mock('@/components/chat/chat-message-list', () => ({
  ChatMessageList: ({ messages }: { messages: Array<{ id: string }> }) => (
    <div data-testid="chat-message-list">
      {messages.map(m => <div key={m.id}>{m.id}</div>)}
    </div>
  ),
}));

// Mock ConfigurationChangesGroup
vi.mock('@/components/chat/configuration-changes-group', () => ({
  ConfigurationChangesGroup: () => <div data-testid="config-changes">Config Changes</div>,
}));

// Mock UnifiedErrorBoundary
vi.mock('@/components/chat/unified-error-boundary', () => ({
  UnifiedErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Mock virtualization hook to return all items (no virtualization in tests)
vi.mock('@/hooks/utils', async () => {
  const actual = await vi.importActual('@/hooks/utils');
  return {
    ...actual,
    useVirtualizedTimeline: ({ timelineItems }: { timelineItems: TimelineItem[] }) => ({
      virtualItems: timelineItems.map((item, index) => ({
        key: `item-${index}`,
        index,
        start: index * 100,
      })),
      totalSize: timelineItems.length * 100,
      scrollMargin: 0,
      measureElement: () => {},
    }),
  };
});

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
// Test Factories
// ============================================================================

/**
 * Create a messages timeline item for a specific round
 */
function createMessagesTimelineItem(roundNumber: number, participantCount = 2): TimelineItem {
  const messages = [
    createMockUserMessage(roundNumber, `Question for round ${roundNumber}`),
    ...Array.from({ length: participantCount }, (_, i) =>
      createMockMessage(i, roundNumber)),
  ];

  return {
    type: 'messages',
    data: messages,
  };
}

/**
 * Create an analysis timeline item for a specific round with given status
 */
function createAnalysisTimelineItem(
  roundNumber: number,
  status: typeof AnalysisStatuses[keyof typeof AnalysisStatuses],
): TimelineItem {
  return {
    type: 'analysis',
    data: createMockAnalysis({
      id: `analysis-${roundNumber}`,
      threadId: 'thread-123',
      roundNumber,
      status,
      mode: ChatModes.DEBATING,
      analysisData: status === AnalysisStatuses.COMPLETE
        ? { roundNumber, mode: 'debating', userQuestion: 'Test', roundConfidence: 75 }
        : null,
    }),
  };
}

/**
 * Create default props for ThreadTimeline
 */
function createDefaultProps(overrides?: Partial<Parameters<typeof ThreadTimeline>[0]>) {
  return {
    timelineItems: [],
    scrollContainerId: 'test-scroll-container',
    user: { name: 'Test User', image: null },
    participants: [createMockParticipant(0), createMockParticipant(1)],
    threadId: 'thread-123',
    isStreaming: false,
    currentParticipantIndex: 0,
    currentStreamingParticipant: null,
    streamingRoundNumber: null,
    feedbackByRound: new Map<number, typeof FeedbackTypes[keyof typeof FeedbackTypes]>(),
    pendingFeedback: null,
    getFeedbackHandler: () => () => {},
    onAnalysisStreamStart: () => {},
    onAnalysisStreamComplete: () => {},
    onActionClick: () => {},
    onRetry: () => {},
    isReadOnly: false,
    preSearches: [],
    ...overrides,
  };
}

// ============================================================================
// Import component after mocks
// ============================================================================

let ThreadTimeline: typeof import('@/components/chat/thread-timeline').ThreadTimeline;

// ============================================================================
// CRITICAL BUG FIX TESTS
// ============================================================================

describe('threadTimeline Feedback Visibility - Critical Bug Fix', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const importedModule = await import('@/components/chat/thread-timeline');
    ThreadTimeline = importedModule.ThreadTimeline;
  });

  // ==========================================================================
  // EXACT BUG REPRODUCTION: Round 2 feedback appearing before analysis completes
  // ==========================================================================

  describe('exact Bug Reproduction: Round 2 Feedback Before Analysis Completes', () => {
    it('should NOT show feedback buttons when round 2 analysis is PENDING (exact bug scenario)', () => {
      // This is the EXACT bug scenario:
      // 1. Round 1 completes fully (analysis COMPLETE)
      // 2. User sends message for round 2
      // 3. Participants finish streaming for round 2 (isStreaming = false)
      // 4. Analysis is created with PENDING status
      // 5. BUG: Feedback buttons appeared immediately
      // 6. FIX: Feedback buttons should be hidden until analysis is COMPLETE

      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0), // Round 0 messages
        createAnalysisTimelineItem(0, AnalysisStatuses.COMPLETE), // Round 0 analysis complete
        createMessagesTimelineItem(1), // Round 1 messages (just finished streaming)
        createAnalysisTimelineItem(1, AnalysisStatuses.PENDING), // Round 1 analysis PENDING
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false, // Participants finished streaming
      });

      render(<ThreadTimeline {...props} />);

      // Round 0: Should show feedback (analysis is COMPLETE)
      expect(screen.getByTestId('feedback-buttons-round-0')).toBeInTheDocument();

      // Round 1: Should NOT show feedback (analysis is still PENDING)
      // THIS IS THE BUG FIX - previously this would have been shown
      expect(screen.queryByTestId('feedback-buttons-round-1')).not.toBeInTheDocument();
    });

    it('should NOT show feedback buttons when round 2 analysis is STREAMING (exact bug scenario)', () => {
      // Same scenario but analysis has started streaming

      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, AnalysisStatuses.COMPLETE),
        createMessagesTimelineItem(1),
        createAnalysisTimelineItem(1, AnalysisStatuses.STREAMING), // Now streaming
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      // Round 0: Should show feedback
      expect(screen.getByTestId('feedback-buttons-round-0')).toBeInTheDocument();

      // Round 1: Should NOT show feedback (analysis still streaming)
      expect(screen.queryByTestId('feedback-buttons-round-1')).not.toBeInTheDocument();
    });

    it('should show feedback buttons only when round 2 analysis is COMPLETE', () => {
      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, AnalysisStatuses.COMPLETE),
        createMessagesTimelineItem(1),
        createAnalysisTimelineItem(1, AnalysisStatuses.COMPLETE), // Now complete
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      // Both rounds should show feedback
      expect(screen.getByTestId('feedback-buttons-round-0')).toBeInTheDocument();
      expect(screen.getByTestId('feedback-buttons-round-1')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // FIRST ROUND VS SUBSEQUENT ROUNDS: Identical Behavior
  // ==========================================================================

  describe('first Round vs Subsequent Rounds: Identical Behavior', () => {
    it('should hide feedback in round 0 when analysis is PENDING (same as round 2+)', () => {
      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, AnalysisStatuses.PENDING),
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      // Round 0: Should NOT show feedback (analysis is PENDING)
      expect(screen.queryByTestId('feedback-buttons-round-0')).not.toBeInTheDocument();
    });

    it('should hide feedback in round 0 when analysis is STREAMING (same as round 2+)', () => {
      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, AnalysisStatuses.STREAMING),
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      // Round 0: Should NOT show feedback (analysis is STREAMING)
      expect(screen.queryByTestId('feedback-buttons-round-0')).not.toBeInTheDocument();
    });

    it('should show feedback in round 0 only when analysis is COMPLETE (same as round 2+)', () => {
      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, AnalysisStatuses.COMPLETE),
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      // Round 0: Should show feedback (analysis is COMPLETE)
      expect(screen.getByTestId('feedback-buttons-round-0')).toBeInTheDocument();
    });

    it('should have identical behavior across rounds 0, 1, 2, 3', () => {
      // Create 4 rounds with different analysis statuses
      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, AnalysisStatuses.COMPLETE), // Show feedback
        createMessagesTimelineItem(1),
        createAnalysisTimelineItem(1, AnalysisStatuses.PENDING), // Hide feedback
        createMessagesTimelineItem(2),
        createAnalysisTimelineItem(2, AnalysisStatuses.STREAMING), // Hide feedback
        createMessagesTimelineItem(3),
        createAnalysisTimelineItem(3, AnalysisStatuses.COMPLETE), // Show feedback
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      // Round 0: COMPLETE -> Show
      expect(screen.getByTestId('feedback-buttons-round-0')).toBeInTheDocument();

      // Round 1: PENDING -> Hide
      expect(screen.queryByTestId('feedback-buttons-round-1')).not.toBeInTheDocument();

      // Round 2: STREAMING -> Hide
      expect(screen.queryByTestId('feedback-buttons-round-2')).not.toBeInTheDocument();

      // Round 3: COMPLETE -> Show
      expect(screen.getByTestId('feedback-buttons-round-3')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // ANALYSIS STATUS STATES
  // ==========================================================================

  describe('analysis Status States', () => {
    // Test statuses that should SHOW feedback
    it.each([
      [AnalysisStatuses.COMPLETE, 'COMPLETE'],
    ])('should show feedback when analysis status is %s', (status) => {
      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, status),
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      expect(screen.getByTestId('feedback-buttons-round-0')).toBeInTheDocument();
    });

    // Test statuses that should HIDE feedback
    it.each([
      [AnalysisStatuses.PENDING, 'PENDING'],
      [AnalysisStatuses.STREAMING, 'STREAMING'],
      [AnalysisStatuses.FAILED, 'FAILED'], // Failed analysis should also hide feedback
    ])('should hide feedback when analysis status is %s', (status) => {
      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, status),
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      expect(screen.queryByTestId('feedback-buttons-round-0')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // STREAMING PROTECTION
  // ==========================================================================

  describe('streaming Protection', () => {
    it('should hide feedback when isStreaming is true regardless of analysis status', () => {
      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, AnalysisStatuses.COMPLETE),
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: true, // Currently streaming
      });

      render(<ThreadTimeline {...props} />);

      // Even though analysis is COMPLETE, feedback should be hidden during streaming
      expect(screen.queryByTestId('feedback-buttons-round-0')).not.toBeInTheDocument();
    });

    it('should show feedback when streaming completes AND analysis is COMPLETE', () => {
      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, AnalysisStatuses.COMPLETE),
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false, // Streaming complete
      });

      render(<ThreadTimeline {...props} />);

      expect(screen.getByTestId('feedback-buttons-round-0')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // READ-ONLY MODE
  // ==========================================================================

  describe('read-Only Mode', () => {
    it('should hide feedback in read-only mode regardless of analysis status', () => {
      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, AnalysisStatuses.COMPLETE),
        createMessagesTimelineItem(1),
        createAnalysisTimelineItem(1, AnalysisStatuses.COMPLETE),
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
        isReadOnly: true, // Read-only mode
      });

      render(<ThreadTimeline {...props} />);

      // No feedback buttons should be visible in read-only mode
      expect(screen.queryByTestId('feedback-buttons-round-0')).not.toBeInTheDocument();
      expect(screen.queryByTestId('feedback-buttons-round-1')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('edge Cases', () => {
    it('should hide feedback when analysis is missing for the round', () => {
      // Messages without corresponding analysis
      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        // No analysis for round 0
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      // No feedback should be shown without analysis
      expect(screen.queryByTestId('feedback-buttons-round-0')).not.toBeInTheDocument();
    });

    it('should handle empty timeline gracefully', () => {
      const props = createDefaultProps({
        timelineItems: [],
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      // Should not crash and no feedback buttons should be visible
      expect(screen.queryByTestId(/feedback-buttons-round/)).not.toBeInTheDocument();
    });

    it('should only check analysis for the correct round', () => {
      // Round 0 has PENDING analysis, Round 1 has COMPLETE analysis
      // Feedback for round 0 should be hidden, round 1 should be shown
      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, AnalysisStatuses.PENDING),
        createMessagesTimelineItem(1),
        createAnalysisTimelineItem(1, AnalysisStatuses.COMPLETE),
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      // Round 0: PENDING -> Hide
      expect(screen.queryByTestId('feedback-buttons-round-0')).not.toBeInTheDocument();

      // Round 1: COMPLETE -> Show
      expect(screen.getByTestId('feedback-buttons-round-1')).toBeInTheDocument();
    });

    it('should handle analysis appearing later in timeline (out of order)', () => {
      // Analysis items might be out of order in timeline
      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createMessagesTimelineItem(1),
        createAnalysisTimelineItem(1, AnalysisStatuses.COMPLETE), // Round 1 analysis first
        createAnalysisTimelineItem(0, AnalysisStatuses.COMPLETE), // Round 0 analysis second
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      // Both should show feedback - analysis lookup should work regardless of order
      expect(screen.getByTestId('feedback-buttons-round-0')).toBeInTheDocument();
      expect(screen.getByTestId('feedback-buttons-round-1')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // MULTI-ROUND SCENARIOS
  // ==========================================================================

  describe('multi-Round Scenarios', () => {
    it('should handle 5 rounds with mixed analysis statuses', () => {
      const timelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, AnalysisStatuses.COMPLETE),
        createMessagesTimelineItem(1),
        createAnalysisTimelineItem(1, AnalysisStatuses.COMPLETE),
        createMessagesTimelineItem(2),
        createAnalysisTimelineItem(2, AnalysisStatuses.COMPLETE),
        createMessagesTimelineItem(3),
        createAnalysisTimelineItem(3, AnalysisStatuses.PENDING),
        createMessagesTimelineItem(4),
        createAnalysisTimelineItem(4, AnalysisStatuses.STREAMING),
      ];

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      // Rounds 0, 1, 2: COMPLETE -> Show
      expect(screen.getByTestId('feedback-buttons-round-0')).toBeInTheDocument();
      expect(screen.getByTestId('feedback-buttons-round-1')).toBeInTheDocument();
      expect(screen.getByTestId('feedback-buttons-round-2')).toBeInTheDocument();

      // Rounds 3, 4: PENDING/STREAMING -> Hide
      expect(screen.queryByTestId('feedback-buttons-round-3')).not.toBeInTheDocument();
      expect(screen.queryByTestId('feedback-buttons-round-4')).not.toBeInTheDocument();
    });

    it('should update feedback visibility when analysis status changes', () => {
      // Initial: Round 1 analysis PENDING
      const initialTimelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, AnalysisStatuses.COMPLETE),
        createMessagesTimelineItem(1),
        createAnalysisTimelineItem(1, AnalysisStatuses.PENDING),
      ];

      const initialProps = createDefaultProps({
        timelineItems: initialTimelineItems,
        isStreaming: false,
      });

      const { rerender } = render(<ThreadTimeline {...initialProps} />);

      // Round 1 feedback should be hidden
      expect(screen.queryByTestId('feedback-buttons-round-1')).not.toBeInTheDocument();

      // Update: Round 1 analysis now COMPLETE
      const updatedTimelineItems: TimelineItem[] = [
        createMessagesTimelineItem(0),
        createAnalysisTimelineItem(0, AnalysisStatuses.COMPLETE),
        createMessagesTimelineItem(1),
        createAnalysisTimelineItem(1, AnalysisStatuses.COMPLETE),
      ];

      const updatedProps = createDefaultProps({
        timelineItems: updatedTimelineItems,
        isStreaming: false,
      });

      rerender(
        <TestWrapper>
          <ThreadTimeline {...updatedProps} />
        </TestWrapper>,
      );

      // Round 1 feedback should now be visible
      expect(screen.getByTestId('feedback-buttons-round-1')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // REGRESSION PREVENTION
  // ==========================================================================

  describe('regression Prevention', () => {
    it('should never show feedback buttons before analysis is COMPLETE - stress test', () => {
      // Create many rounds to stress test the fix
      const rounds = 10;
      const timelineItems: TimelineItem[] = [];

      for (let i = 0; i < rounds; i++) {
        timelineItems.push(createMessagesTimelineItem(i));
        // Alternate between PENDING and STREAMING for all rounds
        const status = i % 2 === 0 ? AnalysisStatuses.PENDING : AnalysisStatuses.STREAMING;
        timelineItems.push(createAnalysisTimelineItem(i, status));
      }

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      // NO feedback buttons should be visible for ANY round
      for (let i = 0; i < rounds; i++) {
        expect(screen.queryByTestId(`feedback-buttons-round-${i}`)).not.toBeInTheDocument();
      }
    });

    it('should show feedback buttons for all complete rounds - stress test', () => {
      // Create many rounds with all COMPLETE
      const rounds = 10;
      const timelineItems: TimelineItem[] = [];

      for (let i = 0; i < rounds; i++) {
        timelineItems.push(createMessagesTimelineItem(i));
        timelineItems.push(createAnalysisTimelineItem(i, AnalysisStatuses.COMPLETE));
      }

      const props = createDefaultProps({
        timelineItems,
        isStreaming: false,
      });

      render(<ThreadTimeline {...props} />);

      // ALL feedback buttons should be visible
      for (let i = 0; i < rounds; i++) {
        expect(screen.getByTestId(`feedback-buttons-round-${i}`)).toBeInTheDocument();
      }
    });
  });
});

// ============================================================================
// CONCURRENT ROUND SCENARIOS
// ============================================================================

describe('threadTimeline Feedback - Concurrent Round Scenarios', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const importedModule = await import('@/components/chat/thread-timeline');
    ThreadTimeline = importedModule.ThreadTimeline;
  });

  it('should handle rapid round transitions correctly', () => {
    // Simulates rapid user interactions where multiple rounds are created quickly
    // Each round should independently track its analysis status

    const timelineItems: TimelineItem[] = [
      createMessagesTimelineItem(0),
      createAnalysisTimelineItem(0, AnalysisStatuses.COMPLETE),
      createMessagesTimelineItem(1),
      createAnalysisTimelineItem(1, AnalysisStatuses.COMPLETE),
      createMessagesTimelineItem(2),
      createAnalysisTimelineItem(2, AnalysisStatuses.STREAMING), // Currently streaming
      createMessagesTimelineItem(3),
      createAnalysisTimelineItem(3, AnalysisStatuses.PENDING), // Just created
    ];

    const props = createDefaultProps({
      timelineItems,
      isStreaming: false,
    });

    render(<ThreadTimeline {...props} />);

    // Only rounds 0 and 1 should show feedback
    expect(screen.getByTestId('feedback-buttons-round-0')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-buttons-round-1')).toBeInTheDocument();
    expect(screen.queryByTestId('feedback-buttons-round-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feedback-buttons-round-3')).not.toBeInTheDocument();
  });
});

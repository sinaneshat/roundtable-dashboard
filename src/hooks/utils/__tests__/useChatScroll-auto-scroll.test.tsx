/**
 * Auto-Scroll Tests for useChatScroll Hook
 *
 * Tests auto-scrolling behavior during streaming for:
 * - Chat message streaming
 * - Object streaming (analyses, pre-searches)
 * - Near-bottom detection
 * - Mobile vs desktop behavior
 * - Screen size variations
 */

import { render, waitFor } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, MessageRoles } from '@/api/core/enums';
import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { useChatScroll } from '@/hooks/utils';

// Test component to wrap the hook
function TestComponent({
  messages,
  analyses,
  isStreaming,
  scrollContainerId,
  enableNearBottomDetection = true,
  currentParticipantIndex,
}: {
  messages: UIMessage[];
  analyses: StoredModeratorAnalysis[];
  isStreaming: boolean;
  scrollContainerId?: string;
  enableNearBottomDetection?: boolean;
  currentParticipantIndex?: number;
}) {
  useChatScroll({
    messages,
    analyses,
    isStreaming,
    scrollContainerId,
    enableNearBottomDetection,
    currentParticipantIndex,
  });

  return (
    <div>
      <div id={scrollContainerId || 'chat-scroll-container'} data-testid="scroll-container">
        {messages.map((msg, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} data-testid={`message-${i}`}>{msg.content}</div>
        ))}
        {analyses.map((analysis, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} data-testid={`analysis-${i}`}>{analysis.status}</div>
        ))}
      </div>
    </div>
  );
}

describe('useChatScroll - Auto-scroll during streaming', () => {
  // Mock window.scrollTo
  const mockScrollTo = vi.fn();
  const originalScrollTo = window.scrollTo;

  // Mock scroll position properties
  let mockScrollTop = 0;
  let mockScrollHeight = 2000;
  let mockClientHeight = 800;

  beforeEach(() => {
    window.scrollTo = mockScrollTo;

    // Mock document scroll properties
    Object.defineProperties(document.documentElement, {
      scrollTop: {
        get: () => mockScrollTop,
        set: (value: number) => {
          mockScrollTop = value;
        },
        configurable: true,
      },
      scrollHeight: {
        get: () => mockScrollHeight,
        configurable: true,
      },
      clientHeight: {
        get: () => mockClientHeight,
        configurable: true,
      },
    });

    // Mock window properties
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: mockClientHeight,
    });

    // Reset scroll position to bottom (user at bottom initially)
    mockScrollTop = mockScrollHeight - mockClientHeight;
  });

  afterEach(() => {
    window.scrollTo = originalScrollTo;
    mockScrollTo.mockClear();
    vi.clearAllMocks();
  });

  describe('chat message streaming', () => {
    it('should auto-scroll when new message arrives during streaming (user at bottom)', async () => {
      const initialMessages: UIMessage[] = [
        {
          id: '1',
          role: MessageRoles.USER,
          content: 'Hello',
          metadata: { roundNumber: 1 },
        },
      ];

      const { rerender } = render(
        <TestComponent
          messages={initialMessages}
          analyses={[]}
          isStreaming={true}
        />,
      );

      // Clear initial scroll calls
      mockScrollTo.mockClear();

      // Simulate new message arriving
      const updatedMessages: UIMessage[] = [
        ...initialMessages,
        {
          id: '2',
          role: MessageRoles.ASSISTANT,
          content: 'Hello back!',
          metadata: { roundNumber: 1, participantIndex: 0 },
        },
      ];

      rerender(
        <TestComponent
          messages={updatedMessages}
          analyses={[]}
          isStreaming={true}
        />,
      );

      // Wait for auto-scroll to trigger
      await waitFor(() => {
        expect(mockScrollTo).toHaveBeenCalled();
      });

      // Verify smooth scroll was used
      const lastCall = mockScrollTo.mock.calls[mockScrollTo.mock.calls.length - 1];
      expect(lastCall[0]).toHaveProperty('behavior', 'smooth');
    });

    it('should NOT auto-scroll when user scrolled up (NOT near bottom)', async () => {
      // User scrolled up - not near bottom
      mockScrollTop = 100; // Far from bottom

      const initialMessages: UIMessage[] = [
        {
          id: '1',
          role: MessageRoles.USER,
          content: 'Hello',
          metadata: { roundNumber: 1 },
        },
      ];

      const { rerender } = render(
        <TestComponent
          messages={initialMessages}
          analyses={[]}
          isStreaming={true}
        />,
      );

      // Clear initial scroll calls
      mockScrollTo.mockClear();

      // Trigger scroll event to update near-bottom detection
      window.dispatchEvent(new Event('scroll'));

      // Wait for scroll handler to process
      await waitFor(() => {
        // Wait a bit for scroll handler throttle
      }, { timeout: 200 });

      // Simulate new message arriving
      const updatedMessages: UIMessage[] = [
        ...initialMessages,
        {
          id: '2',
          role: MessageRoles.ASSISTANT,
          content: 'Hello back!',
          metadata: { roundNumber: 1, participantIndex: 0 },
        },
      ];

      rerender(
        <TestComponent
          messages={updatedMessages}
          analyses={[]}
          isStreaming={true}
        />,
      );

      // Wait to ensure no scroll happens
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify NO auto-scroll occurred (user opted out by scrolling up)
      expect(mockScrollTo).not.toHaveBeenCalled();
    });

    it('should auto-scroll on mobile devices during streaming', async () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 667, // iPhone height
      });

      mockClientHeight = 667;
      mockScrollHeight = 2000;
      mockScrollTop = mockScrollHeight - mockClientHeight; // User at bottom

      const messages: UIMessage[] = [
        {
          id: '1',
          role: MessageRoles.USER,
          content: 'Mobile test',
          metadata: { roundNumber: 1 },
        },
      ];

      const { rerender } = render(
        <TestComponent
          messages={messages}
          analyses={[]}
          isStreaming={true}
        />,
      );

      mockScrollTo.mockClear();

      // Add new message
      const updated = [
        ...messages,
        {
          id: '2',
          role: MessageRoles.ASSISTANT,
          content: 'Response',
          metadata: { roundNumber: 1, participantIndex: 0 },
        },
      ];

      rerender(
        <TestComponent
          messages={updated}
          analyses={[]}
          isStreaming={true}
        />,
      );

      await waitFor(() => {
        expect(mockScrollTo).toHaveBeenCalled();
      });
    });
  });

  describe('object streaming (analyses)', () => {
    it('should auto-scroll when analysis appears (user at bottom)', async () => {
      const messages: UIMessage[] = [
        {
          id: '1',
          role: MessageRoles.USER,
          content: 'Test',
          metadata: { roundNumber: 1 },
        },
      ];

      const { rerender } = render(
        <TestComponent
          messages={messages}
          analyses={[]}
          isStreaming={false}
        />,
      );

      mockScrollTo.mockClear();

      // Add new analysis
      const analyses: StoredModeratorAnalysis[] = [
        {
          id: 'analysis-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.COMPLETE,
          data: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      rerender(
        <TestComponent
          messages={messages}
          analyses={analyses}
          isStreaming={false}
        />,
      );

      await waitFor(() => {
        expect(mockScrollTo).toHaveBeenCalled();
      });

      // Verify auto scroll was used for analysis
      const lastCall = mockScrollTo.mock.calls[mockScrollTo.mock.calls.length - 1];
      expect(lastCall[0]).toHaveProperty('behavior', 'auto');
    });

    it('should NOT auto-scroll when analysis appears but user scrolled up', async () => {
      // User scrolled up
      mockScrollTop = 50;

      const messages: UIMessage[] = [
        {
          id: '1',
          role: MessageRoles.USER,
          content: 'Test',
          metadata: { roundNumber: 1 },
        },
      ];

      const { rerender } = render(
        <TestComponent
          messages={messages}
          analyses={[]}
          isStreaming={false}
        />,
      );

      // Trigger scroll event to update detection
      window.dispatchEvent(new Event('scroll'));
      await new Promise(resolve => setTimeout(resolve, 200));

      mockScrollTo.mockClear();

      // Add analysis
      const analyses: StoredModeratorAnalysis[] = [
        {
          id: 'analysis-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.COMPLETE,
          data: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      rerender(
        <TestComponent
          messages={messages}
          analyses={analyses}
          isStreaming={false}
        />,
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // Should NOT scroll (user opted out)
      expect(mockScrollTo).not.toHaveBeenCalled();
    });
  });

  describe('near-bottom detection threshold', () => {
    it('should auto-scroll when within 200px of bottom (default threshold)', async () => {
      // Set scroll position to be 150px from bottom (within threshold)
      mockScrollTop = mockScrollHeight - mockClientHeight - 150;

      const messages: UIMessage[] = [
        {
          id: '1',
          role: MessageRoles.USER,
          content: 'Test',
          metadata: { roundNumber: 1 },
        },
      ];

      const { rerender } = render(
        <TestComponent
          messages={messages}
          analyses={[]}
          isStreaming={true}
        />,
      );

      // Trigger scroll event
      window.dispatchEvent(new Event('scroll'));
      await new Promise(resolve => setTimeout(resolve, 200));

      mockScrollTo.mockClear();

      // Add message
      const updated = [
        ...messages,
        {
          id: '2',
          role: MessageRoles.ASSISTANT,
          content: 'Response',
          metadata: { roundNumber: 1, participantIndex: 0 },
        },
      ];

      rerender(
        <TestComponent
          messages={updated}
          analyses={[]}
          isStreaming={true}
        />,
      );

      await waitFor(() => {
        expect(mockScrollTo).toHaveBeenCalled();
      });
    });

    it('should NOT auto-scroll when beyond 200px threshold', async () => {
      // Set scroll position 250px from bottom (beyond threshold)
      mockScrollTop = mockScrollHeight - mockClientHeight - 250;

      const messages: UIMessage[] = [
        {
          id: '1',
          role: MessageRoles.USER,
          content: 'Test',
          metadata: { roundNumber: 1 },
        },
      ];

      const { rerender } = render(
        <TestComponent
          messages={messages}
          analyses={[]}
          isStreaming={true}
        />,
      );

      // Trigger scroll event
      window.dispatchEvent(new Event('scroll'));
      await new Promise(resolve => setTimeout(resolve, 200));

      mockScrollTo.mockClear();

      // Add message
      const updated = [
        ...messages,
        {
          id: '2',
          role: MessageRoles.ASSISTANT,
          content: 'Response',
          metadata: { roundNumber: 1, participantIndex: 0 },
        },
      ];

      rerender(
        <TestComponent
          messages={updated}
          analyses={[]}
          isStreaming={true}
        />,
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      expect(mockScrollTo).not.toHaveBeenCalled();
    });
  });

  describe('disabled near-bottom detection', () => {
    it('should always auto-scroll when detection is disabled', async () => {
      // User far from bottom
      mockScrollTop = 50;

      const messages: UIMessage[] = [
        {
          id: '1',
          role: MessageRoles.USER,
          content: 'Test',
          metadata: { roundNumber: 1 },
        },
      ];

      const { rerender } = render(
        <TestComponent
          messages={messages}
          analyses={[]}
          isStreaming={true}
          enableNearBottomDetection={false}
        />,
      );

      mockScrollTo.mockClear();

      // Add message
      const updated = [
        ...messages,
        {
          id: '2',
          role: MessageRoles.ASSISTANT,
          content: 'Response',
          metadata: { roundNumber: 1, participantIndex: 0 },
        },
      ];

      rerender(
        <TestComponent
          messages={updated}
          analyses={[]}
          isStreaming={true}
          enableNearBottomDetection={false}
        />,
      );

      await waitFor(() => {
        expect(mockScrollTo).toHaveBeenCalled();
      });
    });
  });

  describe('different screen sizes', () => {
    const testScreenSize = async (width: number, height: number, description: string) => {
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: height,
      });

      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: width,
      });

      mockClientHeight = height;
      mockScrollHeight = height * 2;
      mockScrollTop = mockScrollHeight - mockClientHeight;

      const messages: UIMessage[] = [
        {
          id: '1',
          role: MessageRoles.USER,
          content: `Test ${description}`,
          metadata: { roundNumber: 1 },
        },
      ];

      const { rerender, unmount } = render(
        <TestComponent
          messages={messages}
          analyses={[]}
          isStreaming={true}
        />,
      );

      mockScrollTo.mockClear();

      const updated = [
        ...messages,
        {
          id: '2',
          role: MessageRoles.ASSISTANT,
          content: 'Response',
          metadata: { roundNumber: 1, participantIndex: 0 },
        },
      ];

      rerender(
        <TestComponent
          messages={updated}
          analyses={[]}
          isStreaming={true}
        />,
      );

      await waitFor(() => {
        expect(mockScrollTo).toHaveBeenCalled();
      }, { timeout: 1000 });

      unmount();
    };

    it('should auto-scroll on small mobile (375x667)', async () => {
      await testScreenSize(375, 667, 'small mobile');
    });

    it('should auto-scroll on large mobile (428x926)', async () => {
      await testScreenSize(428, 926, 'large mobile');
    });

    it('should auto-scroll on tablet (768x1024)', async () => {
      await testScreenSize(768, 1024, 'tablet');
    });

    it('should auto-scroll on desktop (1920x1080)', async () => {
      await testScreenSize(1920, 1080, 'desktop');
    });
  });

  describe('participant turn-taking', () => {
    it('should auto-scroll when currentParticipantIndex changes during streaming', async () => {
      const messages: UIMessage[] = [
        {
          id: '1',
          role: MessageRoles.USER,
          content: 'User message',
          metadata: { roundNumber: 1 },
        },
        {
          id: '2',
          role: MessageRoles.ASSISTANT,
          content: 'Participant 1 response',
          metadata: { roundNumber: 1, participantIndex: 0 },
        },
      ];

      const { rerender } = render(
        <TestComponent
          messages={messages}
          analyses={[]}
          isStreaming={true}
          currentParticipantIndex={0}
        />,
      );

      mockScrollTo.mockClear();

      // Participant switches from index 0 to index 1
      rerender(
        <TestComponent
          messages={messages}
          analyses={[]}
          isStreaming={true}
          currentParticipantIndex={1}
        />,
      );

      await waitFor(() => {
        expect(mockScrollTo).toHaveBeenCalled();
      });
    });

    it('should NOT auto-scroll when participant switches but user scrolled up', async () => {
      // User scrolled up
      mockScrollTop = 50;

      const messages: UIMessage[] = [
        {
          id: '1',
          role: MessageRoles.USER,
          content: 'User message',
          metadata: { roundNumber: 1 },
        },
        {
          id: '2',
          role: MessageRoles.ASSISTANT,
          content: 'Participant 1 response',
          metadata: { roundNumber: 1, participantIndex: 0 },
        },
      ];

      const { rerender } = render(
        <TestComponent
          messages={messages}
          analyses={[]}
          isStreaming={true}
          currentParticipantIndex={0}
        />,
      );

      // Trigger scroll event to update detection
      window.dispatchEvent(new Event('scroll'));
      await new Promise(resolve => setTimeout(resolve, 200));

      mockScrollTo.mockClear();

      // Participant switches from index 0 to index 1
      rerender(
        <TestComponent
          messages={messages}
          analyses={[]}
          isStreaming={true}
          currentParticipantIndex={1}
        />,
      );

      // Wait a bit to ensure no scroll happens
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(mockScrollTo).not.toHaveBeenCalled();
    });
  });
});

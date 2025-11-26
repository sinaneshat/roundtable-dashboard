import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChatShowcaseLive } from '../chat-showcase-live';

// Capture ThreadTimeline props for assertions
let capturedProps: Record<string, unknown> | null = null;

// Mock dependencies before importing component
vi.mock('@/components/providers/chat-store-provider', () => ({
  useChatStore: vi.fn(() => vi.fn()),
  ChatStoreContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));

vi.mock('@/lib/data/query-client', () => ({
  getQueryClient: vi.fn(),
}));

vi.mock('@/lib/data/query-keys', () => ({
  queryKeys: {
    threads: {
      preSearches: vi.fn(),
    },
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock ThreadTimeline to capture props
vi.mock('@/components/chat/thread-timeline', () => ({
  ThreadTimeline: (props: Record<string, unknown>) => {
    capturedProps = props;
    return <div data-testid="thread-timeline">ThreadTimeline</div>;
  },
}));

// Mock StreamingParticipantsLoader
vi.mock('@/components/chat/streaming-participants-loader', () => ({
  StreamingParticipantsLoader: () => <div data-testid="loader">Loading...</div>,
}));

describe('chatShowcaseLive', () => {
  beforeEach(() => {
    capturedProps = null;
  });

  it('should render ThreadTimeline component', () => {
    render(<ChatShowcaseLive />);
    expect(screen.getByTestId('thread-timeline')).toBeInTheDocument();
  });

  it('should pass unique participant IDs with demo prefix', () => {
    render(<ChatShowcaseLive />);

    expect(capturedProps).not.toBeNull();
    const participants = capturedProps?.participants as Array<{ id: string }>;
    expect(participants).toBeDefined();
    expect(participants.length).toBeGreaterThan(0);
    participants.forEach((p, idx) => {
      expect(p.id).toBe(`participant-demo-${idx}`);
    });
  });

  it('should use unique demo thread ID', () => {
    render(<ChatShowcaseLive />);

    expect(capturedProps).not.toBeNull();
    expect(capturedProps?.threadId).toBe('demo-thread');
  });

  it('should set isReadOnly to true for demo mode', () => {
    render(<ChatShowcaseLive />);

    expect(capturedProps).not.toBeNull();
    expect(capturedProps?.isReadOnly).toBe(true);
  });

  it('should initially have demoPreSearchOpen as false in idle state', () => {
    render(<ChatShowcaseLive />);

    expect(capturedProps).not.toBeNull();
    // In idle stage (initial render), pre-search should not be open
    expect(capturedProps?.demoPreSearchOpen).toBe(false);
  });

  it('should initially have demoAnalysisOpen as false in idle state', () => {
    render(<ChatShowcaseLive />);

    expect(capturedProps).not.toBeNull();
    // In idle stage (initial render), analysis should not be open
    expect(capturedProps?.demoAnalysisOpen).toBe(false);
  });

  it('should pass feedbackByRound as empty Map', () => {
    render(<ChatShowcaseLive />);

    expect(capturedProps).not.toBeNull();
    expect(capturedProps?.feedbackByRound).toBeInstanceOf(Map);
    expect((capturedProps?.feedbackByRound as Map<unknown, unknown>).size).toBe(0);
  });

  it('should pass streamingRoundNumber as 1', () => {
    render(<ChatShowcaseLive />);

    expect(capturedProps).not.toBeNull();
    expect(capturedProps?.streamingRoundNumber).toBe(1);
  });
});

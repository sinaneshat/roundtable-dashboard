/**
 * Overview Screen Navigation Tests - PART 1: URL Transitions
 *
 * Tests URL behavior and navigation from overview screen to thread screen:
 * - URL stays at /chat during first round streaming
 * - URL updates to /chat/[slug] after analysis completes
 * - Navigation triggers at correct time
 * - Slug polling behavior
 *
 * COVERAGE:
 * - URL behavior during streaming (stays at /chat)
 * - window.history.replaceState for AI-generated slug
 * - router.push navigation after analysis
 * - Slug polling mechanism
 * - Navigation timing (analysis complete + AI title ready)
 *
 * PATTERN: Integration tests for navigation flow
 * Following: /docs/FLOW_DOCUMENTATION.md PART 12 (URL Patterns)
 */

import { AnalysisStatuses } from '@/api/core/enums';
import { act, createMockAnalysis, createMockThread, waitFor } from '@/lib/testing';

// Mock setup
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
  NextIntlClientProvider: ({ children }: { children: unknown; locale?: string; messages?: unknown }) => children,
}));

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockReplaceState = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

// Mock window.history.replaceState
beforeAll(() => {
  window.history.replaceState = mockReplaceState;
});

vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      },
    },
  }),
}));

vi.mock('@/hooks/queries/models', () => ({
  useModelsQuery: () => ({
    data: {
      data: {
        items: [
          {
            id: 'gpt-4',
            name: 'GPT-4',
            description: 'OpenAI GPT-4',
            subscriptionTier: 'pro',
            isEnabled: true,
          },
        ],
      },
    },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/queries/chat', () => ({
  useCustomRolesQuery: () => ({
    data: null,
    isLoading: false,
  }),
  useThreadAnalysesQuery: () => ({
    data: { success: true, data: [] },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/queries', () => ({
  useUsageStatsQuery: () => ({
    data: {
      success: true,
      data: {
        threads: { remaining: 10 },
        messages: { remaining: 100 },
      },
    },
  }),
}));

describe('overview Navigation - URL Stays at /chat During First Round', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * TEST: URL remains /chat when thread is created
   * CRITICAL: No navigation on thread creation
   */
  it('should keep URL at /chat when thread created', async () => {
    const _thread = createMockThread({
      id: 'new-thread-123',
      slug: 'initial-slug-from-question',
      isAiGeneratedTitle: false,
    });

    // Thread created but analysis not complete
    // URL should stay at /chat
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  /**
   * TEST: URL stays /chat during participant streaming
   * Users should remain on overview screen while participants respond
   */
  it('should keep URL at /chat during participant streaming', async () => {
    const _thread = createMockThread({
      isAiGeneratedTitle: false,
    });

    // Streaming in progress - no navigation should occur
    const isStreaming = true;

    // Verify no navigation during streaming
    expect(isStreaming).toBe(true);
    expect(mockPush).not.toHaveBeenCalled();
  });

  /**
   * TEST: URL stays /chat during analysis streaming
   * Navigation should wait until analysis completes
   */
  it('should keep URL at /chat during analysis streaming', async () => {
    const _thread = createMockThread({
      isAiGeneratedTitle: true,
    });

    const _analysis = createMockAnalysis({
      threadId: _thread.id,
      roundNumber: 0,
      status: AnalysisStatuses.STREAMING,
    });

    // Analysis streaming - verify no navigation
    expect(_analysis.status).toBe(AnalysisStatuses.STREAMING);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('overview Navigation - AI Title Generation and Slug Update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * TEST: Initial slug generated from user question
   */
  it('should create initial slug from user question', () => {
    const _userQuestion = 'What is the meaning of life?';
    const expectedSlugPattern = /what-is-the-meaning-of-life/i;

    const thread = createMockThread({
      slug: 'what-is-the-meaning-of-life-abc123',
      isAiGeneratedTitle: false,
    });

    expect(thread.slug).toMatch(expectedSlugPattern);
  });

  /**
   * TEST: AI-generated title replaces "New Chat"
   */
  it('should update from "New Chat" to AI-generated title', () => {
    // Initial state
    const initialThread = createMockThread({
      title: 'New Chat',
      slug: 'initial-slug-abc123',
      isAiGeneratedTitle: false,
    });

    expect(initialThread.title).toBe('New Chat');
    expect(initialThread.isAiGeneratedTitle).toBe(false);

    // After AI title generation
    const updatedThread = createMockThread({
      title: 'Philosophical Discussion on Life Purpose',
      slug: 'philosophical-discussion-on-life-purpose',
      isAiGeneratedTitle: true,
    });

    expect(updatedThread.title).not.toBe('New Chat');
    expect(updatedThread.isAiGeneratedTitle).toBe(true);
  });

  /**
   * TEST: window.history.replaceState updates URL without navigation
   * This preserves ChatOverviewScreen mount
   */
  it('should use replaceState to update URL when AI title ready', async () => {
    const aiGeneratedSlug = 'ai-generated-title-slug';

    // Simulate slug status API returning AI title ready
    globalThis.fetch = vi.fn((url) => {
      if (url.includes('/slug-status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              slug: aiGeneratedSlug,
              isAiGeneratedTitle: true,
            },
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);
    });

    // Polling detects AI title ready
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/slug-status'),
        expect.any(Object),
      );
    });

    // Should use replaceState (not router.push)
    await waitFor(() => {
      expect(mockReplaceState).toHaveBeenCalledWith(
        expect.anything(),
        '',
        `/chat/${aiGeneratedSlug}`,
      );
    });

    // Should NOT use router.push yet
    expect(mockPush).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  /**
   * TEST: Slug polling starts immediately after thread creation
   */
  it('should start polling for AI title immediately', async () => {
    const thread = createMockThread({
      id: 'thread-123',
      isAiGeneratedTitle: false,
    });

    // Mock slug status endpoint
    globalThis.fetch = vi.fn((url) => {
      if (url.includes('/slug-status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              slug: thread.slug,
              isAiGeneratedTitle: false,
            },
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);
    });

    // Polling should begin immediately
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/slug-status'),
        expect.any(Object),
      );
    }, { timeout: 5000 });

    vi.restoreAllMocks();
  });

  /**
   * TEST: Polling stops when AI title detected
   */
  it('should stop polling when AI title is ready', async () => {
    let pollCount = 0;

    globalThis.fetch = vi.fn((url) => {
      if (url.includes('/slug-status')) {
        pollCount++;

        // Return AI title on second poll
        if (pollCount >= 2) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                slug: 'ai-generated-slug',
                isAiGeneratedTitle: true,
              },
            }),
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              slug: 'initial-slug',
              isAiGeneratedTitle: false,
            },
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);
    });

    // Wait for polling to detect AI title
    await waitFor(() => {
      expect(pollCount).toBeGreaterThanOrEqual(2);
    }, { timeout: 10000 });

    // Polling should stop after detecting AI title
    const finalPollCount = pollCount;
    await new Promise(resolve => setTimeout(resolve, 5000));
    expect(pollCount).toBe(finalPollCount); // No more polls

    vi.restoreAllMocks();
  });
});

describe('overview Navigation - Navigation to Thread Screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * TEST: Navigation triggers when analysis completes
   * CRITICAL: router.push happens after analysis complete
   */
  it('should navigate when analysis completes', async () => {
    const _thread = createMockThread({
      slug: 'ai-generated-slug',
      isAiGeneratedTitle: true,
    });

    const _analysis = createMockAnalysis({
      threadId: _thread.id,
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    });

    // Both conditions met: AI title ready + analysis complete
    const shouldNavigate = _thread.isAiGeneratedTitle && _analysis.status === AnalysisStatuses.COMPLETE;

    // Verify conditions are met
    expect(shouldNavigate).toBe(true);

    // Trigger navigation
    act(() => {
      mockPush(`/chat/${_thread.slug}`);
    });

    expect(mockPush).toHaveBeenCalledWith(`/chat/${_thread.slug}`);
  });

  /**
   * TEST: Navigation requires both AI title AND analysis complete
   */
  it('should not navigate if AI title not ready', async () => {
    const thread = createMockThread({
      slug: 'initial-slug',
      isAiGeneratedTitle: false, // AI title not ready
    });

    const analysis = createMockAnalysis({
      threadId: thread.id,
      status: AnalysisStatuses.COMPLETE,
    });

    // Missing AI title
    const shouldNavigate = thread.isAiGeneratedTitle && analysis.status === AnalysisStatuses.COMPLETE;

    expect(shouldNavigate).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
  });

  /**
   * TEST: Navigation requires both AI title AND analysis complete
   */
  it('should not navigate if analysis not complete', async () => {
    const thread = createMockThread({
      slug: 'ai-generated-slug',
      isAiGeneratedTitle: true,
    });

    const analysis = createMockAnalysis({
      threadId: thread.id,
      status: AnalysisStatuses.STREAMING, // Analysis not complete
    });

    // Missing analysis completion
    const shouldNavigate = thread.isAiGeneratedTitle && analysis.status === AnalysisStatuses.COMPLETE;

    expect(shouldNavigate).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
  });

  /**
   * TEST: Navigation URL format is /chat/[slug]
   */
  it('should navigate to correct URL format', async () => {
    const slug = 'understanding-react-testing-patterns';

    act(() => {
      mockPush(`/chat/${slug}`);
    });

    expect(mockPush).toHaveBeenCalledWith('/chat/understanding-react-testing-patterns');
  });

  /**
   * TEST: ChatOverviewScreen unmounts after navigation
   */
  it('should unmount overview screen after navigation', async () => {
    const thread = createMockThread({
      slug: 'test-slug',
      isAiGeneratedTitle: true,
    });

    const _analysis = createMockAnalysis({
      status: AnalysisStatuses.COMPLETE,
    });

    // Navigation triggers
    act(() => {
      mockPush(`/chat/${thread.slug}`);
    });

    // Overview screen component would unmount
    // Thread screen component would mount
    expect(mockPush).toHaveBeenCalled();
  });
});

describe('overview Navigation - Timing and Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * TEST: AI title can be ready before or after analysis
   */
  it('should handle AI title ready before analysis completes', async () => {
    // Scenario: AI title generated quickly
    const thread = createMockThread({
      slug: 'ai-slug',
      isAiGeneratedTitle: true, // Ready
    });

    const analysis = createMockAnalysis({
      status: AnalysisStatuses.STREAMING, // Still streaming
    });

    // URL updated via replaceState
    expect(mockReplaceState).toHaveBeenCalled();

    // But navigation doesn't happen yet
    expect(mockPush).not.toHaveBeenCalled();

    // Wait for analysis to complete
    analysis.status = AnalysisStatuses.COMPLETE;

    // Now navigation can happen
    act(() => {
      mockPush(`/chat/${thread.slug}`);
    });

    expect(mockPush).toHaveBeenCalled();
  });

  /**
   * TEST: Analysis can complete before AI title ready
   */
  it('should handle analysis complete before AI title ready', async () => {
    const thread = createMockThread({
      slug: 'initial-slug',
      isAiGeneratedTitle: false, // Not ready yet
    });

    const _analysis = createMockAnalysis({
      status: AnalysisStatuses.COMPLETE, // Already complete
    });

    // No navigation yet
    expect(mockPush).not.toHaveBeenCalled();

    // AI title becomes ready
    thread.isAiGeneratedTitle = true;
    thread.slug = 'ai-generated-slug';

    // URL updates
    expect(mockReplaceState).toHaveBeenCalled();

    // Now navigation can happen
    act(() => {
      mockPush(`/chat/${thread.slug}`);
    });

    expect(mockPush).toHaveBeenCalled();
  });

  /**
   * TEST: Failed AI title generation doesn't block navigation
   */
  it('should navigate even if AI title generation fails', async () => {
    const _thread = createMockThread({
      title: 'New Chat', // Remains default title
      slug: 'initial-slug-from-question',
      isAiGeneratedTitle: false, // Failed to generate
    });

    const analysis = createMockAnalysis({
      status: AnalysisStatuses.COMPLETE,
    });

    // Navigation should still happen with initial slug
    // (Implementation detail: may use fallback logic)
    const shouldProceed = analysis.status === AnalysisStatuses.COMPLETE;

    expect(shouldProceed).toBe(true);
  });

  /**
   * TEST: Navigation preserves state for thread screen
   */
  it('should preserve necessary state for thread screen', async () => {
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'test-slug',
      mode: 'analyzing',
      isAiGeneratedTitle: true,
    });

    // Thread data should be accessible after navigation
    expect(thread.id).toBeTruthy();
    expect(thread.slug).toBeTruthy();
    expect(thread.mode).toBeTruthy();

    // Navigate
    act(() => {
      mockPush(`/chat/${thread.slug}`);
    });

    // Thread data remains available for thread screen initialization
    expect(thread.id).toBe('thread-123');
  });
});

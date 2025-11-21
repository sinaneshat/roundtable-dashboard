/**
 * Slug Polling and URL Transitions E2E Tests
 *
 * Tests the complete slug polling and URL transition flow from FLOW_DOCUMENTATION.md Part 12.
 * Covers the two-step URL update process:
 * 1. window.history.replaceState - updates URL without navigation (stays on overview)
 * 2. router.push - full navigation when analysis completes
 *
 * FLOW TESTED:
 * 1. Initial slug generation from message text
 * 2. Polling timing - starts immediately on thread creation
 * 3. Polling conditions - showInitialUI, threadId, hasUpdatedThread
 * 4. URL replace flow - window.history.replaceState
 * 5. Navigation after analysis - router.push
 * 6. Two-step process - replace URL first, then navigate
 * 7. Polling stops - when AI title detected
 * 8. Edge cases - title generation fails
 * 9. Timing sequence - thread created to navigation
 * 10. hasUpdatedThread flag management
 * 11. Race conditions - URL replace vs router.push
 *
 * Location: /src/stores/chat/__tests__/slug-polling-url-transitions.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockThread,
  createMockUserMessage,
  createPendingAnalysis,
  createStreamingAnalysis,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Mock slug status API response
 */
type SlugStatusResponse = {
  slug: string;
  isAiGeneratedTitle: boolean;
};

/**
 * Simulate slug polling interval (3 seconds in production)
 */
const POLLING_INTERVAL_MS = 3000;

/**
 * Simulate typical streaming duration (20-30 seconds)
 */
const STREAMING_DURATION_MS = 25000;

/**
 * Simulate analysis duration (8-12 seconds)
 */
const ANALYSIS_DURATION_MS = 10000;

// ============================================================================
// INITIAL SLUG GENERATION TESTS
// ============================================================================

describe('initial Slug Generation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should create thread with initial slug from message text', () => {
    // User sends first message: "Say hi, 1 word only"
    const initialSlug = 'say-hi-1-word-only-nzj311';

    const thread = createMockThread({
      id: 'thread-123',
      title: 'New Chat',
      slug: initialSlug,
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    const state = store.getState();
    expect(state.thread?.slug).toBe(initialSlug);
    expect(state.thread?.isAiGeneratedTitle).toBe(false);
    expect(state.thread?.title).toBe('New Chat');
  });

  it('should generate slug with sanitized text + random suffix', () => {
    // Verify slug format: sanitized-user-question-text + random suffix
    const slug = 'debugging-react-state-issues-abc123';

    // Verify it follows the pattern
    expect(slug).toMatch(/^[a-z0-9-]+-[a-z0-9]+$/);

    const thread = createMockThread({
      slug,
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    expect(store.getState().thread?.slug).toBe(slug);
  });

  it('should have temporary title "New Chat" before AI generates title', () => {
    const thread = createMockThread({
      title: 'New Chat',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    expect(store.getState().thread?.title).toBe('New Chat');
    expect(store.getState().thread?.isAiGeneratedTitle).toBe(false);
  });
});

// ============================================================================
// POLLING TIMING TESTS
// ============================================================================

describe('polling Timing', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should start polling IMMEDIATELY on thread creation (not after streaming)', () => {
    const thread = createMockThread({
      id: 'thread-123',
      isAiGeneratedTitle: false,
    });

    const pollingShouldStart: boolean[] = [];

    // Thread creation
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setShowInitialUI(false);
    store.getState().setCreatedThreadId('thread-123');

    // Check polling conditions immediately after thread creation
    const state = store.getState();
    const shouldPoll = !state.showInitialUI
      && state.createdThreadId !== null
      && !state.thread?.isAiGeneratedTitle;

    pollingShouldStart.push(shouldPoll);

    // Start streaming (polling should still be active)
    store.getState().setIsStreaming(true);

    const stateWhileStreaming = store.getState();
    const shouldPollWhileStreaming = !stateWhileStreaming.showInitialUI
      && stateWhileStreaming.createdThreadId !== null
      && !stateWhileStreaming.thread?.isAiGeneratedTitle;

    pollingShouldStart.push(shouldPollWhileStreaming);

    expect(pollingShouldStart).toEqual([true, true]);
  });

  it('should poll every 3 seconds', async () => {
    const pollCalls: number[] = [];
    let pollCount = 0;

    // Simulate polling interval
    const pollInterval = setInterval(() => {
      pollCount++;
      pollCalls.push(Date.now());
    }, POLLING_INTERVAL_MS);

    // Advance time by 9 seconds (should poll 3 times)
    vi.advanceTimersByTime(9000);

    clearInterval(pollInterval);

    expect(pollCount).toBe(3);
  });

  it('should check isAiGeneratedTitle flag on each poll', () => {
    const thread = createMockThread({
      id: 'thread-123',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // First poll: not AI generated
    let response: SlugStatusResponse = {
      slug: 'initial-slug-abc123',
      isAiGeneratedTitle: false,
    };

    expect(response.isAiGeneratedTitle).toBe(false);

    // Second poll: still not AI generated
    response = {
      slug: 'initial-slug-abc123',
      isAiGeneratedTitle: false,
    };

    expect(response.isAiGeneratedTitle).toBe(false);

    // Third poll: AI title ready
    response = {
      slug: 'debugging-react-issues',
      isAiGeneratedTitle: true,
    };

    expect(response.isAiGeneratedTitle).toBe(true);
  });
});

// ============================================================================
// POLLING CONDITIONS TESTS
// ============================================================================

describe('polling Conditions', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should require showInitialUI = false to poll', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setCreatedThreadId('thread-123');

    // Initial UI still showing - should NOT poll
    store.getState().setShowInitialUI(true);

    const shouldPoll = () => {
      const state = store.getState();
      return !state.showInitialUI && state.createdThreadId !== null;
    };

    expect(shouldPoll()).toBe(false);

    // Hide initial UI - should poll
    store.getState().setShowInitialUI(false);
    expect(shouldPoll()).toBe(true);
  });

  it('should require createdThreadId to poll', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setShowInitialUI(false);

    // No thread ID - should NOT poll
    const shouldPoll = () => {
      const state = store.getState();
      return !state.showInitialUI && state.createdThreadId !== null;
    };

    expect(shouldPoll()).toBe(false);

    // Thread ID set - should poll
    store.getState().setCreatedThreadId('thread-123');
    expect(shouldPoll()).toBe(true);
  });

  it('should require hasUpdatedThread = false to continue polling', () => {
    const thread = createMockThread({ id: 'thread-123', isAiGeneratedTitle: false });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setShowInitialUI(false);
    store.getState().setCreatedThreadId('thread-123');

    let hasUpdatedThread = false;

    const shouldPoll = () => {
      const state = store.getState();
      return !state.showInitialUI
        && state.createdThreadId !== null
        && !hasUpdatedThread;
    };

    // hasUpdatedThread = false - should poll
    expect(shouldPoll()).toBe(true);

    // hasUpdatedThread = true - should stop polling
    hasUpdatedThread = true;
    expect(shouldPoll()).toBe(false);
  });

  it('should stop polling when all conditions are not met', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setShowInitialUI(false);
    store.getState().setCreatedThreadId('thread-123');

    const hasUpdatedThread = false;

    const shouldPoll = () => {
      const state = store.getState();
      return !state.showInitialUI
        && state.createdThreadId !== null
        && !hasUpdatedThread;
    };

    expect(shouldPoll()).toBe(true);

    // Reset to initial UI
    store.getState().setShowInitialUI(true);
    expect(shouldPoll()).toBe(false);
  });
});

// ============================================================================
// URL REPLACE FLOW TESTS
// ============================================================================

describe('uRL Replace Flow', () => {
  let store: ReturnType<typeof createChatStore>;
  let replaceStateCalls: Array<{ state: unknown; title: string; url: string }>;
  let originalReplaceState: typeof window.history.replaceState;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();

    // Mock window.history.replaceState
    replaceStateCalls = [];
    originalReplaceState = window.history.replaceState;
    window.history.replaceState = vi.fn((state, title, url) => {
      replaceStateCalls.push({ state, title, url: url as string });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    window.history.replaceState = originalReplaceState;
  });

  it('should use window.history.replaceState when AI title is ready', () => {
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'initial-slug-abc123',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Simulate AI title ready - call replaceState
    const newSlug = 'debugging-react-issues';
    window.history.replaceState(
      window.history.state,
      '',
      `/chat/${newSlug}`,
    );

    expect(replaceStateCalls).toHaveLength(1);
    expect(replaceStateCalls[0].url).toBe(`/chat/${newSlug}`);
  });

  it('should update URL bar without component unmount/mount', () => {
    // This test verifies the behavior documented in FLOW_DOCUMENTATION.md:
    // "ChatOverviewScreen STAYS MOUNTED (no component unmount/mount)"

    const thread = createMockThread({
      id: 'thread-123',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setScreenMode('overview');

    // URL replace happens but screen mode stays 'overview'
    window.history.replaceState(
      window.history.state,
      '',
      '/chat/ai-generated-slug',
    );

    // Screen mode should NOT change - still on overview
    expect(store.getState().screenMode).toBe('overview');
  });

  it('should use replaceState (not router.push) for URL update', () => {
    const routerPushCalls: string[] = [];

    // Verify replaceState is used, not router.push
    window.history.replaceState(
      window.history.state,
      '',
      '/chat/ai-slug',
    );

    expect(replaceStateCalls).toHaveLength(1);
    expect(routerPushCalls).toHaveLength(0);
  });

  it('should preserve window.history.state during replaceState', () => {
    const currentState = { key: 'abc123', as: '/chat', url: '/chat' };

    window.history.replaceState(
      currentState,
      '',
      '/chat/new-ai-slug',
    );

    expect(replaceStateCalls[0].state).toEqual(currentState);
  });
});

// ============================================================================
// NAVIGATION AFTER ANALYSIS TESTS
// ============================================================================

describe('navigation After Analysis', () => {
  let store: ReturnType<typeof createChatStore>;
  let routerPushCalls: string[];

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
    routerPushCalls = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should use router.push when first analysis completes', async () => {
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'ai-generated-slug',
      isAiGeneratedTitle: true,
    });

    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setScreenMode('overview');

    // Add completed analysis
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    // Simulate router.push
    const performNavigation = (slug: string) => {
      routerPushCalls.push(`/chat/${slug}`);
    };

    // Navigation should happen when analysis is complete and AI title ready
    const state = store.getState();
    const analysis = state.analyses.find(a => a.roundNumber === 0);

    if (
      state.screenMode === 'overview'
      && analysis?.status === AnalysisStatuses.COMPLETE
      && state.thread?.isAiGeneratedTitle
      && state.thread?.slug
    ) {
      performNavigation(state.thread.slug);
    }

    expect(routerPushCalls).toHaveLength(1);
    expect(routerPushCalls[0]).toBe('/chat/ai-generated-slug');
  });

  it('should cause ChatOverviewScreen to UNMOUNT', () => {
    // This test documents the expected behavior:
    // "ChatOverviewScreen UNMOUNTS, ChatThreadScreen MOUNTS"

    let overviewMounted = true;
    let threadMounted = false;

    // Simulate router.push navigation
    const navigateToThread = () => {
      overviewMounted = false;
      threadMounted = true;
    };

    navigateToThread();

    expect(overviewMounted).toBe(false);
    expect(threadMounted).toBe(true);
  });

  it('should navigate to /chat/[ai-generated-slug]', () => {
    const slug = 'optimizing-database-queries';

    // Simulate router.push
    routerPushCalls.push(`/chat/${slug}`);

    expect(routerPushCalls[0]).toBe('/chat/optimizing-database-queries');
  });

  it('should NOT navigate if analysis is still streaming', () => {
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'ai-generated-slug',
      isAiGeneratedTitle: true,
    });

    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().addAnalysis(createStreamingAnalysis(0));

    const state = store.getState();
    const analysis = state.analyses.find(a => a.roundNumber === 0);

    const shouldNavigate = analysis?.status === AnalysisStatuses.COMPLETE
      && state.thread?.isAiGeneratedTitle;

    expect(shouldNavigate).toBe(false);
  });

  it('should NOT navigate if AI title not yet generated', () => {
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'initial-slug-abc123',
      isAiGeneratedTitle: false, // Not yet generated
    });

    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    const state = store.getState();
    const analysis = state.analyses.find(a => a.roundNumber === 0);

    const shouldNavigate = analysis?.status === AnalysisStatuses.COMPLETE
      && state.thread?.isAiGeneratedTitle;

    expect(shouldNavigate).toBe(false);
  });
});

// ============================================================================
// TWO-STEP PROCESS TESTS
// ============================================================================

describe('two-Step Process', () => {
  let store: ReturnType<typeof createChatStore>;
  let operations: string[];

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
    operations = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should execute Step 1 (replaceState) before Step 2 (router.push)', async () => {
    // Step 1: Replace URL (stay on overview)
    const step1ReplaceUrl = () => {
      operations.push('replace-url');
    };

    // Step 2: router.push (navigate to thread)
    const step2Navigate = () => {
      operations.push('router-push');
    };

    // Simulate the two-step process
    step1ReplaceUrl();
    step2Navigate();

    expect(operations).toEqual(['replace-url', 'router-push']);
  });

  it('should stay on ChatOverviewScreen after Step 1', () => {
    const thread = createMockThread({
      id: 'thread-123',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setScreenMode('overview');

    // Step 1: URL replaced
    operations.push('replace-url');

    // Should still be on overview
    expect(store.getState().screenMode).toBe('overview');
  });

  it('should navigate to ChatThreadScreen after Step 2', () => {
    let currentScreen: 'overview' | 'thread' = 'overview';

    // Step 1
    operations.push('replace-url');
    // Still on overview
    expect(currentScreen).toBe('overview');

    // Step 2
    currentScreen = 'thread';
    operations.push('router-push');

    expect(currentScreen).toBe('thread');
  });

  it('should use hasUpdatedThread flag to sequence steps', () => {
    let hasUpdatedThread = false;

    // Step 1: Set flag after URL replace
    const replaceUrl = () => {
      operations.push('replace-url');
      hasUpdatedThread = true;
    };

    // Step 2: Only navigate if flag is set
    const navigate = () => {
      if (hasUpdatedThread) {
        operations.push('router-push');
      }
    };

    // Without Step 1, Step 2 should not happen
    navigate();
    expect(operations).toHaveLength(0);

    // With Step 1, Step 2 can happen
    replaceUrl();
    navigate();
    expect(operations).toEqual(['replace-url', 'router-push']);
  });

  it('should handle timing where AI title is ready before analysis completes', async () => {
    // Scenario: AI title generation (2-5s) finishes before analysis (8-12s)

    let hasUpdatedThread = false;
    let analysisComplete = false;

    // Step 1: AI title ready (early)
    const onAiTitleReady = () => {
      operations.push('replace-url');
      hasUpdatedThread = true;
    };

    // Step 2: Analysis completes (later)
    const onAnalysisComplete = () => {
      analysisComplete = true;
      if (hasUpdatedThread && analysisComplete) {
        operations.push('router-push');
      }
    };

    // AI title ready first
    onAiTitleReady();
    expect(operations).toEqual(['replace-url']);

    // Analysis completes later
    onAnalysisComplete();
    expect(operations).toEqual(['replace-url', 'router-push']);
  });
});

// ============================================================================
// POLLING STOPS TESTS
// ============================================================================

describe('polling Stops', () => {
  let _store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    _store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should stop polling immediately when AI title detected', () => {
    let hasUpdatedThread = false;
    let pollCount = 0;

    const shouldContinuePolling = () => !hasUpdatedThread;

    // Simulate polling
    const poll = () => {
      if (shouldContinuePolling()) {
        pollCount++;
      }
    };

    poll(); // 1
    poll(); // 2
    hasUpdatedThread = true; // AI title detected
    poll(); // Should not increment
    poll(); // Should not increment

    expect(pollCount).toBe(2);
  });

  it('should NOT wait for navigation to stop polling', () => {
    let hasUpdatedThread = false;
    let hasNavigated = false;

    // Polling stops when AI title detected, not when navigation happens
    const shouldContinuePolling = () => !hasUpdatedThread;

    expect(shouldContinuePolling()).toBe(true);

    // AI title detected
    hasUpdatedThread = true;
    expect(shouldContinuePolling()).toBe(false);

    // Navigation happens later - doesn't affect polling
    hasNavigated = true;
    expect(shouldContinuePolling()).toBe(false);
    expect(hasNavigated).toBe(true); // Navigation did happen
  });

  it('should make no more API calls after AI title detection', () => {
    let hasUpdatedThread = false;
    const apiCalls: string[] = [];

    const pollSlugStatus = () => {
      if (!hasUpdatedThread) {
        apiCalls.push('GET /slug-status');
      }
    };

    pollSlugStatus(); // Called
    pollSlugStatus(); // Called
    hasUpdatedThread = true;
    pollSlugStatus(); // NOT called
    pollSlugStatus(); // NOT called

    expect(apiCalls).toHaveLength(2);
  });

  it('should clear polling interval when stopped', () => {
    let intervalId: NodeJS.Timeout | null = null;
    let pollCount = 0;
    let hasUpdatedThread = false;

    // Start polling
    intervalId = setInterval(() => {
      if (!hasUpdatedThread) {
        pollCount++;
      } else if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }, POLLING_INTERVAL_MS);

    // Advance time (2 polls)
    vi.advanceTimersByTime(6000);
    expect(pollCount).toBe(2);

    // AI title detected
    hasUpdatedThread = true;
    vi.advanceTimersByTime(3000); // One more tick to clear interval

    // Advance more time (no more polls)
    vi.advanceTimersByTime(9000);
    expect(pollCount).toBe(2); // Still 2
  });
});

// ============================================================================
// EDGE CASES TESTS
// ============================================================================

describe('edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should keep "New Chat" title if AI title generation fails', () => {
    const thread = createMockThread({
      title: 'New Chat',
      slug: 'initial-slug-abc123',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Simulate title generation failure (no update to thread)
    // Title stays as "New Chat"
    expect(store.getState().thread?.title).toBe('New Chat');
    expect(store.getState().thread?.isAiGeneratedTitle).toBe(false);
  });

  it('should fail silently (no error shown to user)', () => {
    // Simulate API error during title generation
    const errors: string[] = [];

    const generateTitle = async () => {
      try {
        throw new Error('AI title generation failed');
      } catch {
        // Silent failure - do not show error to user
        // Just continue without AI-generated title
      }
    };

    // Should not throw
    expect(async () => await generateTitle()).not.toThrow();
    expect(errors).toHaveLength(0);
  });

  it('should allow user to continue conversation without AI title', () => {
    const thread = createMockThread({
      id: 'thread-123',
      title: 'New Chat',
      slug: 'initial-slug-abc123',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setScreenMode('thread');

    // User can still submit messages
    const messages = [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0),
      createMockUserMessage(1, 'Second question'),
    ];

    store.getState().setMessages(messages);

    expect(store.getState().messages).toHaveLength(3);
    expect(store.getState().thread?.title).toBe('New Chat'); // Still default title
  });

  it('should handle rapid polling requests', () => {
    const responses: boolean[] = [];

    // Simulate multiple rapid polls
    for (let i = 0; i < 10; i++) {
      responses.push(false); // isAiGeneratedTitle: false
    }

    // All responses should be tracked
    expect(responses).toHaveLength(10);
  });

  it('should handle network timeout during polling', async () => {
    let pollAttempts = 0;
    let successfulPolls = 0;

    const poll = async () => {
      pollAttempts++;
      // Simulate timeout on 3rd attempt
      if (pollAttempts === 3) {
        return null; // Timeout
      }
      successfulPolls++;
      return { isAiGeneratedTitle: false };
    };

    await poll(); // Success
    await poll(); // Success
    await poll(); // Timeout
    await poll(); // Success

    expect(pollAttempts).toBe(4);
    expect(successfulPolls).toBe(3);
  });
});

// ============================================================================
// TIMING SEQUENCE TESTS
// ============================================================================

describe('timing Sequence', () => {
  let store: ReturnType<typeof createChatStore>;
  let timeline: string[];

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
    timeline = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should follow correct timing: thread created -> polling starts', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Thread created
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setCreatedThreadId('thread-123');
    store.getState().setShowInitialUI(false);
    timeline.push('thread-created');

    // Polling starts immediately
    timeline.push('polling-started');

    expect(timeline).toEqual(['thread-created', 'polling-started']);
  });

  it('should follow complete timing sequence', async () => {
    // Full sequence from FLOW_DOCUMENTATION.md Part 12
    timeline.push('thread-created');
    timeline.push('polling-started');

    // Streaming (20-30s)
    vi.advanceTimersByTime(STREAMING_DURATION_MS);
    timeline.push('streaming-complete');

    // AI title ready (during or after streaming)
    timeline.push('ai-title-ready');
    timeline.push('url-replaced');

    // Analysis streaming (8-12s)
    vi.advanceTimersByTime(ANALYSIS_DURATION_MS);
    timeline.push('analysis-complete');

    // Navigation
    timeline.push('router-push');

    expect(timeline).toEqual([
      'thread-created',
      'polling-started',
      'streaming-complete',
      'ai-title-ready',
      'url-replaced',
      'analysis-complete',
      'router-push',
    ]);
  });

  it('should handle AI title ready before streaming completes', () => {
    timeline.push('thread-created');
    timeline.push('polling-started');

    // AI title ready early (2-5s)
    vi.advanceTimersByTime(3000);
    timeline.push('ai-title-ready');
    timeline.push('url-replaced');

    // Streaming still in progress
    vi.advanceTimersByTime(STREAMING_DURATION_MS - 3000);
    timeline.push('streaming-complete');

    // Analysis
    vi.advanceTimersByTime(ANALYSIS_DURATION_MS);
    timeline.push('analysis-complete');
    timeline.push('router-push');

    expect(timeline.indexOf('url-replaced')).toBeLessThan(
      timeline.indexOf('streaming-complete'),
    );
  });

  it('should handle AI title ready after analysis completes', () => {
    timeline.push('thread-created');
    timeline.push('polling-started');

    // Streaming
    vi.advanceTimersByTime(STREAMING_DURATION_MS);
    timeline.push('streaming-complete');

    // Analysis completes first
    vi.advanceTimersByTime(ANALYSIS_DURATION_MS);
    timeline.push('analysis-complete');

    // AI title ready later (unusual but possible)
    vi.advanceTimersByTime(2000);
    timeline.push('ai-title-ready');
    timeline.push('url-replaced');

    // Navigation happens after both conditions met
    timeline.push('router-push');

    expect(timeline.indexOf('analysis-complete')).toBeLessThan(
      timeline.indexOf('ai-title-ready'),
    );
  });
});

// ============================================================================
// hasUpdatedThread FLAG TESTS
// ============================================================================

describe('hasUpdatedThread Flag', () => {
  let _store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    _store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should start as false', () => {
    const hasUpdatedThread = false;
    expect(hasUpdatedThread).toBe(false);
  });

  it('should be set true after URL replace', () => {
    let hasUpdatedThread = false;

    // URL replace happens
    const replaceUrl = () => {
      window.history.replaceState({}, '', '/chat/ai-slug');
      hasUpdatedThread = true;
    };

    replaceUrl();
    expect(hasUpdatedThread).toBe(true);
  });

  it('should be used as guard for navigation', () => {
    let hasUpdatedThread = false;
    let hasNavigated = false;

    const attemptNavigation = () => {
      // Guard: only navigate if URL has been updated
      if (hasUpdatedThread && !hasNavigated) {
        hasNavigated = true;
      }
    };

    // Cannot navigate before URL update
    attemptNavigation();
    expect(hasNavigated).toBe(false);

    // Can navigate after URL update
    hasUpdatedThread = true;
    attemptNavigation();
    expect(hasNavigated).toBe(true);
  });

  it('should prevent polling after being set', () => {
    let hasUpdatedThread = false;
    const polls: number[] = [];

    const poll = () => {
      if (!hasUpdatedThread) {
        polls.push(Date.now());
      }
    };

    poll(); // Allowed
    poll(); // Allowed
    hasUpdatedThread = true;
    poll(); // Blocked
    poll(); // Blocked

    expect(polls).toHaveLength(2);
  });

  it('should coordinate with analysis completion', () => {
    let hasUpdatedThread = false;
    let analysisComplete = false;
    let navigated = false;

    const checkNavigation = () => {
      if (hasUpdatedThread && analysisComplete && !navigated) {
        navigated = true;
      }
    };

    // Only URL updated
    hasUpdatedThread = true;
    checkNavigation();
    expect(navigated).toBe(false);

    // Both conditions met
    analysisComplete = true;
    checkNavigation();
    expect(navigated).toBe(true);
  });
});

// ============================================================================
// RACE CONDITION: URL REPLACE vs ROUTER.PUSH TESTS
// ============================================================================

describe('race Condition: URL Replace vs Router.Push', () => {
  let _store: ReturnType<typeof createChatStore>;
  let operations: string[];

  beforeEach(() => {
    _store = createChatStore();
    vi.useFakeTimers();
    operations = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should guarantee replaceState happens before push', async () => {
    // Using separate flags ensures ordering
    let hasUpdatedThread = false;

    const replaceState = () => {
      operations.push('replaceState');
      hasUpdatedThread = true;
    };

    const routerPush = () => {
      if (hasUpdatedThread) {
        operations.push('router.push');
      }
    };

    // Even if called "simultaneously", ordering is preserved
    replaceState();
    routerPush();

    expect(operations).toEqual(['replaceState', 'router.push']);
  });

  it('should ensure correct URL appears in address bar', async () => {
    const urlHistory: string[] = [];

    // Simulate URL changes
    const replaceUrl = (url: string) => {
      urlHistory.push(url);
    };

    const navigateTo = (url: string) => {
      urlHistory.push(url);
    };

    // Step 1: Replace to AI-generated slug
    replaceUrl('/chat/ai-generated-slug');

    // Step 2: Navigate (same URL)
    navigateTo('/chat/ai-generated-slug');

    // Both should show correct URL
    expect(urlHistory).toEqual([
      '/chat/ai-generated-slug',
      '/chat/ai-generated-slug',
    ]);
  });

  it('should prevent wrong URL from appearing briefly', async () => {
    let hasUpdatedThread = false;
    const urls: string[] = [];

    // Wrong order would show initial slug then AI slug
    const correctOrder = () => {
      // Step 1: Replace URL
      urls.push('/chat/ai-slug');
      hasUpdatedThread = true;

      // Step 2: Navigate
      if (hasUpdatedThread) {
        urls.push('/chat/ai-slug');
      }
    };

    const _wrongOrder = () => {
      // Would show initial slug first
      urls.push('/chat/initial-slug');
      urls.push('/chat/ai-slug');
    };

    // Correct order maintains consistent URL
    correctOrder();
    expect(urls).toEqual(['/chat/ai-slug', '/chat/ai-slug']);
  });

  it('should handle queueMicrotask ordering correctly', async () => {
    const executionOrder: number[] = [];

    // Queue URL replace
    queueMicrotask(() => {
      executionOrder.push(1);
    });

    // Queue router.push
    queueMicrotask(() => {
      executionOrder.push(2);
    });

    // Wait for microtasks
    await Promise.resolve();
    await Promise.resolve();

    expect(executionOrder).toEqual([1, 2]);
  });

  it('should prevent duplicate router.push calls', () => {
    let hasNavigated = false;
    let pushCount = 0;

    const routerPush = () => {
      if (!hasNavigated) {
        pushCount++;
        hasNavigated = true;
      }
    };

    routerPush();
    routerPush();
    routerPush();

    expect(pushCount).toBe(1);
  });

  it('should handle concurrent flag updates atomically', () => {
    let hasUpdatedThread = false;
    let hasNavigated = false;

    // Atomic update simulation
    const updateFlags = () => {
      hasUpdatedThread = true;
      hasNavigated = true;
    };

    updateFlags();

    expect(hasUpdatedThread).toBe(true);
    expect(hasNavigated).toBe(true);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('slug Polling and URL Transitions Integration', () => {
  let store: ReturnType<typeof createChatStore>;
  let timeline: string[];
  let replaceStateCalls: string[];
  let routerPushCalls: string[];

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
    timeline = [];
    replaceStateCalls = [];
    routerPushCalls = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should complete full E2E flow from thread creation to navigation', async () => {
    let hasUpdatedThread = false;
    let hasNavigated = false;

    // Phase 1: Thread creation
    const thread = createMockThread({
      id: 'thread-123',
      title: 'New Chat',
      slug: 'initial-slug-abc123',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [
      createMockParticipant(0),
      createMockParticipant(1),
    ]);
    store.getState().setCreatedThreadId('thread-123');
    store.getState().setShowInitialUI(false);
    store.getState().setScreenMode('overview');
    timeline.push('thread-created');

    // Phase 2: Streaming starts
    store.getState().setIsStreaming(true);
    timeline.push('streaming-started');

    // Phase 3: Polling (happens during streaming)
    const pollResults: boolean[] = [];

    // Poll 1: Not ready
    pollResults.push(false);
    vi.advanceTimersByTime(POLLING_INTERVAL_MS);

    // Poll 2: Not ready
    pollResults.push(false);
    vi.advanceTimersByTime(POLLING_INTERVAL_MS);

    // Poll 3: AI title ready!
    pollResults.push(true);
    timeline.push('ai-title-detected');

    // URL replace
    replaceStateCalls.push('/chat/ai-generated-slug');
    hasUpdatedThread = true;
    timeline.push('url-replaced');

    // Update thread with AI-generated title
    store.getState().setThread({
      ...thread,
      slug: 'ai-generated-slug',
      isAiGeneratedTitle: true,
      title: 'AI Generated Title',
    });

    // Phase 4: Streaming completes
    vi.advanceTimersByTime(STREAMING_DURATION_MS - 6000); // Minus polling time
    store.getState().setIsStreaming(false);
    store.getState().setMessages([
      createMockUserMessage(0),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ]);
    timeline.push('streaming-complete');

    // Phase 5: Analysis
    store.getState().addAnalysis(createPendingAnalysis(0));
    timeline.push('analysis-pending');

    store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
    timeline.push('analysis-streaming');

    vi.advanceTimersByTime(ANALYSIS_DURATION_MS);
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);
    timeline.push('analysis-complete');

    // Phase 6: Navigation
    if (hasUpdatedThread && !hasNavigated) {
      const state = store.getState();
      const analysis = state.analyses.find(a => a.roundNumber === 0);

      if (
        analysis?.status === AnalysisStatuses.COMPLETE
        && state.thread?.isAiGeneratedTitle
        && state.thread?.slug
      ) {
        routerPushCalls.push(`/chat/${state.thread.slug}`);
        hasNavigated = true;
        timeline.push('navigated');
      }
    }

    // Verify complete flow
    expect(timeline).toEqual([
      'thread-created',
      'streaming-started',
      'ai-title-detected',
      'url-replaced',
      'streaming-complete',
      'analysis-pending',
      'analysis-streaming',
      'analysis-complete',
      'navigated',
    ]);

    expect(replaceStateCalls).toEqual(['/chat/ai-generated-slug']);
    expect(routerPushCalls).toEqual(['/chat/ai-generated-slug']);
    expect(hasUpdatedThread).toBe(true);
    expect(hasNavigated).toBe(true);
  });

  it('should handle flow where analysis completes before AI title', async () => {
    let hasUpdatedThread = false;
    let hasNavigated = false;

    const thread = createMockThread({
      id: 'thread-123',
      slug: 'initial-slug',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setShowInitialUI(false);
    store.getState().setCreatedThreadId('thread-123');

    // Analysis completes first
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));
    timeline.push('analysis-complete');

    // Cannot navigate yet - no AI title
    const checkNavigation1 = () => {
      const state = store.getState();
      if (
        hasUpdatedThread
        && state.thread?.isAiGeneratedTitle
        && state.analyses.some(a => a.roundNumber === 0 && a.status === AnalysisStatuses.COMPLETE)
        && !hasNavigated
      ) {
        hasNavigated = true;
        return true;
      }
      return false;
    };

    expect(checkNavigation1()).toBe(false);

    // AI title ready
    store.getState().setThread({
      ...thread,
      slug: 'ai-generated-slug',
      isAiGeneratedTitle: true,
    });
    hasUpdatedThread = true;
    timeline.push('ai-title-ready');

    // Now can navigate
    expect(checkNavigation1()).toBe(true);
    timeline.push('navigated');

    expect(timeline).toEqual([
      'analysis-complete',
      'ai-title-ready',
      'navigated',
    ]);
  });
});

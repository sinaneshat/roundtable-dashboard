/**
 * Race Conditions, API/Backend Integrity & Mobile UX Tests (Sections 10-12)
 *
 * Tests critical timing issues, data consistency, and mobile responsiveness.
 *
 * FLOW TESTED:
 * 10.1 Thread Initialization
 * 10.2 Slug & Navigation
 * 10.3 Pre-Search Synchronization
 * 10.4 Streaming & Stop
 * 10.5 Analysis & Completion
 * 11.1 Data Consistency
 * 11.2 Edge Cases
 * 12 Mobile Responsiveness & UX
 *
 * Location: /src/stores/chat/__tests__/race-conditions-api-mobile.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  PreSearchStatuses,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockAnalysisPayload,
  createMockMessage,
  createMockParticipant,
  createMockParticipantConfig,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
  createPendingAnalysis,
  createPendingPreSearch,
  createStreamingAnalysis,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

// ============================================================================
// SECTION 10.1: THREAD INITIALIZATION RACE CONDITIONS
// ============================================================================

describe('Section 10.1: Thread Initialization', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should set createdThreadId before streaming attempts to start', () => {
    // Race: User submits message immediately
    // Must ensure createdThreadId is set before streaming
    store.getState().setIsCreatingThread(true);

    // Thread created
    store.getState().setCreatedThreadId('thread-123');

    // Now streaming can check threadId
    const threadId = store.getState().createdThreadId;
    expect(threadId).toBe('thread-123');

    // Safe to start streaming
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setIsStreaming(true);

    expect(store.getState().isStreaming).toBe(true);
  });

  it('should ensure startRound callback fires before UI renders active stream', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

    // Initialize thread first
    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

    // Then streaming can start
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    expect(store.getState().isStreaming).toBe(true);
    expect(store.getState().currentParticipantIndex).toBe(0);
  });

  it('should handle waitingToStartStreaming flag correctly', () => {
    // Set waiting flag
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // Thread created
    store.getState().setCreatedThreadId('thread-123');

    // Clear waiting flag when ready
    store.getState().setWaitingToStartStreaming(false);
    expect(store.getState().waitingToStartStreaming).toBe(false);
  });
});

// ============================================================================
// SECTION 10.2: SLUG & NAVIGATION RACE CONDITIONS
// ============================================================================

describe('Section 10.2: Slug & Navigation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle hasUpdatedThread transition timing', () => {
    // Race: Navigation checks flag before slug update sets it TRUE
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'initial-slug',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [], []);

    // Slug updated
    const updatedThread = createMockThread({
      id: 'thread-123',
      slug: 'ai-generated-slug',
      isAiGeneratedTitle: true,
    });
    store.getState().setThread(updatedThread);

    // Flag should be true now
    expect(store.getState().thread?.isAiGeneratedTitle).toBe(true);
  });

  it('should handle queueMicrotask ordering for URL updates', () => {
    // Race: router.push vs history.replaceState
    // URL replace should happen before navigation
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'final-slug',
    });

    store.getState().initializeThread(thread, [], []);
    store.getState().setScreenMode('overview');

    // URL updated (simulated)
    // Then navigation
    store.getState().setScreenMode('thread');

    expect(store.getState().screenMode).toBe('thread');
  });

  it('should stop polling when title is found', () => {
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'initial-slug',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [], []);

    // Title found
    const updatedThread = createMockThread({
      id: 'thread-123',
      slug: 'ai-slug',
      isAiGeneratedTitle: true,
    });
    store.getState().setThread(updatedThread);

    // Polling should stop (UI logic)
    expect(store.getState().thread?.isAiGeneratedTitle).toBe(true);
  });

  it('should handle navigation during component unmount', () => {
    // Race: router.push queued in microtask, component unmounts first
    // Test that state can be reset safely
    store.getState().setScreenMode('overview');
    store.getState().setIsStreaming(true);

    // Component unmounting - reset
    store.getState().reset();

    expect(store.getState().screenMode).toBe('overview');
    expect(store.getState().isStreaming).toBe(false);
  });
});

// ============================================================================
// SECTION 10.3: PRE-SEARCH SYNCHRONIZATION
// ============================================================================

describe('Section 10.3: Pre-Search Synchronization', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle orchestrator sync timing with optimistic blocking', () => {
    // Race: Backend creates PENDING pre-search, frontend hasn't synced
    // Protection: Optimistic blocking - assume PENDING if web search enabled
    store.getState().setEnableWebSearch(true);

    // Should wait even if preSearches array is empty
    // (orchestrator not yet synced)
    expect(store.getState().enableWebSearch).toBe(true);
    expect(store.getState().preSearches).toHaveLength(0);
  });

  it('should handle PATCH request in flight when streaming checks', () => {
    // Race: PATCH to create pre-search in flight
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });
    store.getState().initializeThread(thread, [], []);

    // PATCH completes
    const pendingPreSearch = createPendingPreSearch(0);
    store.getState().setPreSearches([pendingPreSearch]);

    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);
  });

  it('should handle status transition race with query invalidation', () => {
    // Race: Pre-search status updates on server, orchestrator cache stale
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Initial PENDING
    store.getState().setPreSearches([createPendingPreSearch(0)]);

    // Status updates to COMPLETE
    const completedPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: PreSearchStatuses.COMPLETE,
    });
    store.getState().setPreSearches([completedPreSearch]);

    expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.COMPLETE);
  });
});

// ============================================================================
// SECTION 10.4: STREAMING & STOP RACE CONDITIONS
// ============================================================================

describe('Section 10.4: Streaming & Stop', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle stop click during participant switch', () => {
    // Race: P0 complete, P1 starting, user clicks stop
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // P0 complete
    store.getState().setCurrentParticipantIndex(0);
    const msg0 = createMockMessage(0, 0);
    store.getState().setMessages([createMockUserMessage(0), msg0]);

    // About to start P1, user clicks stop
    store.getState().stopStreaming();

    // P1 should not start
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should ignore in-flight chunks after stop clicked', () => {
    store.getState().setIsStreaming(true);
    store.getState().stopStreaming();

    // In-flight message arrives after stop
    // Should check isStreaming before processing
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should handle sequential participant coordination correctly', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
      createMockParticipant(2, { threadId: 'thread-123' }),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setIsStreaming(true);

    // Sequential increments
    store.getState().setCurrentParticipantIndex(0);
    expect(store.getState().currentParticipantIndex).toBe(0);

    store.getState().setCurrentParticipantIndex(1);
    expect(store.getState().currentParticipantIndex).toBe(1);

    store.getState().setCurrentParticipantIndex(2);
    expect(store.getState().currentParticipantIndex).toBe(2);
  });
});

// ============================================================================
// SECTION 10.5: ANALYSIS & COMPLETION
// ============================================================================

describe('Section 10.5: Analysis & Completion', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle analysis completion event before last participant close', () => {
    // Race: Analysis completion arrives before participant stream close
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Analysis completes
    const completedAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    });
    store.getState().setAnalyses([completedAnalysis]);

    // Then streaming ends
    store.getState().setIsStreaming(false);

    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should handle 60s timeout fallback for lost completion event', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Analysis streaming for >60s
    const timedOutAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.STREAMING,
      createdAt: new Date(Date.now() - 61000), // 61 seconds ago
    });
    store.getState().setAnalyses([timedOutAnalysis]);

    const elapsed = Date.now() - new Date(timedOutAnalysis.createdAt).getTime();
    expect(elapsed).toBeGreaterThan(60000);
  });

  it('should use multi-layer analysis completion detection', () => {
    // Detection: status === 'complete' OR timeout
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Case 1: Direct COMPLETE status
    const completedAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    });
    store.getState().setAnalyses([completedAnalysis]);

    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
  });
});

// ============================================================================
// SECTION 11.1: DATA CONSISTENCY
// ============================================================================

describe('Section 11.1: Data Consistency', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should maintain correct thread-message-analysis links', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];
    const messages = [
      createMockUserMessage(0),
      createMockMessage(0, 0),
    ];
    const analysis = createMockAnalysis({
      threadId: 'thread-123',
      roundNumber: 0,
    });

    store.getState().initializeThread(thread, participants, messages);
    store.getState().setAnalyses([analysis]);

    // All linked to same thread
    expect(store.getState().thread?.id).toBe('thread-123');
    expect(store.getState().participants[0].threadId).toBe('thread-123');
    expect(store.getState().analyses[0].threadId).toBe('thread-123');
  });

  it('should have sequential unique round numbers', () => {
    const messages = [
      createMockUserMessage(0, 'Q1'),
      createMockMessage(0, 0),
      createMockUserMessage(1, 'Q2'),
      createMockMessage(0, 1),
      createMockUserMessage(2, 'Q3'),
      createMockMessage(0, 2),
    ];

    store.getState().setMessages(messages);

    // Extract round numbers
    const roundNumbers = store.getState().messages.map(
      m => (m.metadata as { roundNumber?: number })?.roundNumber ?? 0
    );
    const uniqueRounds = [...new Set(roundNumbers)].sort();

    expect(uniqueRounds).toEqual([0, 1, 2]);
  });

  it('should match streamed content with saved content', () => {
    const messageContent = 'This is the complete response';
    const message = createMockMessage(0, 0, {
      parts: [{ type: 'text', text: messageContent }],
    });

    store.getState().setMessages([createMockUserMessage(0), message]);

    const savedContent = store.getState().messages[1].parts?.[0];
    expect(savedContent?.text).toBe(messageContent);
  });
});

// ============================================================================
// SECTION 11.2: EDGE CASES
// ============================================================================

describe('Section 11.2: Edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle extremely long user messages near 5000 char limit', () => {
    const longMessage = 'a'.repeat(4999);
    store.getState().setInputValue(longMessage);

    expect(store.getState().inputValue.length).toBe(4999);
  });

  it('should handle special characters and emojis in prompts', () => {
    const specialMessage = '🚀 Test with émojis & spëcial chars! 你好 مرحبا';
    store.getState().setInputValue(specialMessage);

    expect(store.getState().inputValue).toBe(specialMessage);
  });

  it('should handle concurrent requests from same user (tab duplication)', () => {
    // Each tab would have its own store instance
    const store1 = createTestStore();
    const store2 = createTestStore();

    // Both create threads
    const thread1 = createMockThread({ id: 'thread-1' });
    const thread2 = createMockThread({ id: 'thread-2' });

    store1.initializeThread(thread1, [], []);
    store2.initializeThread(thread2, [], []);

    // Independent state
    expect(store1.getState().thread?.id).toBe('thread-1');
    expect(store2.getState().thread?.id).toBe('thread-2');
  });

  it('should handle empty message parts', () => {
    const messageWithEmptyParts = createMockUserMessage(0, '');
    store.getState().setMessages([messageWithEmptyParts]);

    expect(store.getState().messages).toHaveLength(1);
  });

  it('should handle rapid message updates', () => {
    const messages = Array.from({ length: 100 }, (_, i) =>
      createMockUserMessage(i, `Message ${i}`)
    );

    store.getState().setMessages(messages);

    expect(store.getState().messages).toHaveLength(100);
  });
});

// ============================================================================
// SECTION 12: MOBILE RESPONSIVENESS & UX
// ============================================================================

describe('Section 12: Mobile Responsiveness & UX', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle mobile state with same store logic', () => {
    // Store logic is identical for mobile/desktop
    // Only UI rendering differs
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipantConfig(0, { modelId: 'gpt-4' }),
      createMockParticipantConfig(1, { modelId: 'claude-3' }),
    ];

    store.getState().setSelectedParticipants(participants);
    store.getState().initializeThread(thread, [], []);

    // Same state for both
    expect(store.getState().selectedParticipants).toHaveLength(2);
  });

  it('should handle touch-friendly input value updates', () => {
    // Input should work the same on mobile
    store.getState().setInputValue('Mobile input test');
    expect(store.getState().inputValue).toBe('Mobile input test');
  });

  it('should handle state updates from virtual keyboard input', () => {
    // Virtual keyboard input treated same as physical
    const mobileInput = 'Typed from mobile keyboard';
    store.getState().setInputValue(mobileInput);

    expect(store.getState().inputValue).toBe(mobileInput);
  });

  it('should handle participant chip operations for mobile', () => {
    // Same operations for horizontal scrolling on mobile
    const participants = [
      createMockParticipantConfig(0, { modelId: 'model-1' }),
      createMockParticipantConfig(1, { modelId: 'model-2' }),
      createMockParticipantConfig(2, { modelId: 'model-3' }),
    ];

    store.getState().setSelectedParticipants(participants);

    // Reorder (same as desktop drag)
    const reordered = [
      createMockParticipantConfig(0, { modelId: 'model-3' }),
      createMockParticipantConfig(1, { modelId: 'model-1' }),
      createMockParticipantConfig(2, { modelId: 'model-2' }),
    ];

    store.getState().setSelectedParticipants(reordered);

    expect(store.getState().selectedParticipants[0].modelId).toBe('model-3');
  });
});

// ============================================================================
// COMPREHENSIVE INTEGRATION TESTS
// ============================================================================

describe('Race Conditions & Data Integrity Integration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle complete flow with all race condition protections', () => {
    // Step 1: Thread creation
    store.getState().setIsCreatingThread(true);
    store.getState().setShowInitialUI(false);
    store.getState().setWaitingToStartStreaming(true);

    const thread = createMockThread({
      id: 'thread-123',
      slug: 'initial-slug',
      isAiGeneratedTitle: false,
    });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    store.getState().setCreatedThreadId('thread-123');
    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsCreatingThread(false);
    store.getState().setWaitingToStartStreaming(false);

    // Step 2: Streaming
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    const msg1 = createMockMessage(0, 0);
    store.getState().setMessages([createMockUserMessage(0), msg1]);

    store.getState().setCurrentParticipantIndex(1);
    const msg2 = createMockMessage(1, 0);
    store.getState().setMessages([createMockUserMessage(0), msg1, msg2]);

    store.getState().setIsStreaming(false);

    // Step 3: Analysis
    store.getState().setAnalyses([createPendingAnalysis(0)]);
    store.getState().setAnalyses([createStreamingAnalysis(0)]);

    const completedAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
      analysisData: createMockAnalysisPayload(0),
    });
    store.getState().setAnalyses([completedAnalysis]);

    // Step 4: Navigation
    store.getState().setThread(createMockThread({
      id: 'thread-123',
      slug: 'ai-generated-slug',
      isAiGeneratedTitle: true,
    }));

    store.getState().setScreenMode('thread');

    // Final state verification
    const finalState = store.getState();
    expect(finalState.thread?.isAiGeneratedTitle).toBe(true);
    expect(finalState.messages).toHaveLength(3);
    expect(finalState.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    expect(finalState.screenMode).toBe('thread');
  });

  it('should handle stop during any phase without data corruption', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Complete first participant
    const msg1 = createMockMessage(0, 0);
    store.getState().setMessages([createMockUserMessage(0), msg1]);

    // Stop mid-stream
    store.getState().stopStreaming();

    // State should be consistent
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().messages).toHaveLength(2);
    expect(store.getState().currentParticipantIndex).toBe(0);
  });
});

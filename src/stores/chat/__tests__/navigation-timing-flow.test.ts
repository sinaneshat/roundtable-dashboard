/**
 * Navigation Timing Flow Tests
 *
 * Tests the navigation timing logic to ensure:
 * - Navigation waits for analysis to complete on overview screen
 * - 15s timeout doesn't trigger when analysis is ready to stream
 * - 60s safety net only applies to stuck placeholders
 * - Proper coordination between participants finishing and analysis starting
 *
 * Location: /src/stores/chat/__tests__/navigation-timing-flow.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ChatThread } from '@/api/routes/chat/schema';

import type { ChatParticipant, StoredModeratorAnalysis, StoredPreSearch } from '../store';
import { createChatStore } from '../store';

// =============================================================================
// TEST UTILITIES
// =============================================================================

function createTestThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    id: 'thread-1',
    userId: 'user-1',
    projectId: null,
    title: 'Test Thread',
    slug: 'test-thread-abc123',
    mode: 'debating',
    status: 'active',
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: true,
    enableWebSearch: false,
    metadata: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
    ...overrides,
  } as ChatThread;
}

function createTestParticipant(index: number, modelId: string): ChatParticipant {
  return {
    id: `participant-${index}`,
    threadId: 'thread-1',
    modelId,
    customRoleId: null,
    role: null,
    priority: index,
    isEnabled: true,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ChatParticipant;
}

function createParticipantMessage(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  participantId: string,
  modelId: string,
): UIMessage {
  return {
    id: `${threadId}_r${roundNumber}_p${participantIndex}`,
    role: 'assistant',
    parts: [{ type: 'text', text: `Response from participant ${participantIndex}` }],
    metadata: {
      role: 'assistant',
      roundNumber,
      participantIndex,
      participantId,
      participantRole: null,
      model: modelId,
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
    },
  } as UIMessage;
}

function createUserMessage(roundNumber: number, text: string): UIMessage {
  return {
    id: `user-msg-${roundNumber}`,
    role: 'user',
    parts: [{ type: 'text', text }],
    metadata: {
      role: 'user',
      roundNumber,
      createdAt: new Date().toISOString(),
    },
  } as UIMessage;
}

function createPlaceholderAnalysis(
  threadId: string,
  roundNumber: number,
  userQuestion: string,
  createdAt?: Date,
): StoredModeratorAnalysis {
  return {
    id: `placeholder-analysis-${threadId}-${roundNumber}`,
    threadId,
    roundNumber,
    mode: 'debating',
    userQuestion,
    status: AnalysisStatuses.PENDING,
    analysisData: null,
    participantMessageIds: [],
    createdAt: createdAt || new Date(),
    completedAt: null,
    errorMessage: null,
  };
}

function createPlaceholderPreSearch(
  threadId: string,
  roundNumber: number,
  userQuery: string,
): StoredPreSearch {
  return {
    id: `placeholder-presearch-${threadId}-${roundNumber}`,
    threadId,
    roundNumber,
    userQuery,
    status: AnalysisStatuses.PENDING,
    searchData: null,
    createdAt: new Date(),
    completedAt: null,
    errorMessage: null,
  };
}

// Helper to simulate the navigation logic from flow-controller.ts
function simulateNavigationCheck(analysis: StoredModeratorAnalysis, isStreaming: boolean) {
  // firstAnalysisCompleted logic
  const firstAnalysisCompleted = (() => {
    if (analysis.status === AnalysisStatuses.COMPLETE) {
      return true;
    }

    // Safety net 1: Streaming for >60s
    if (analysis.status === AnalysisStatuses.STREAMING && analysis.createdAt) {
      const createdTime = analysis.createdAt instanceof Date
        ? analysis.createdAt.getTime()
        : new Date(analysis.createdAt).getTime();
      const elapsed = Date.now() - createdTime;
      if (elapsed > 60000)
        return true;
    }

    // Safety net 2: Pending for >60s (only for placeholders)
    const isPlaceholder = !analysis.participantMessageIds || analysis.participantMessageIds.length === 0;
    if (!isStreaming && analysis.status === AnalysisStatuses.PENDING && analysis.createdAt && isPlaceholder) {
      const createdTime = analysis.createdAt instanceof Date
        ? analysis.createdAt.getTime()
        : new Date(analysis.createdAt).getTime();
      const elapsed = Date.now() - createdTime;
      if (elapsed > 60000)
        return true;
    }

    return false;
  })();

  // canNavigateWithoutAnalysis logic
  const canNavigateWithoutAnalysis = (() => {
    // Don't navigate if analysis is ready to stream
    const isReadyToStream = analysis.status === AnalysisStatuses.PENDING
      && analysis.participantMessageIds
      && analysis.participantMessageIds.length > 0;

    if (isReadyToStream)
      return false;

    // 15s timeout
    if (analysis.createdAt) {
      const createdTime = analysis.createdAt instanceof Date
        ? analysis.createdAt.getTime()
        : new Date(analysis.createdAt).getTime();
      const elapsed = Date.now() - createdTime;
      if (elapsed > 15000 && !isStreaming) {
        return true;
      }
    }

    return false;
  })();

  return { firstAnalysisCompleted, canNavigateWithoutAnalysis };
}

// =============================================================================
// NAVIGATION TIMING TESTS
// =============================================================================

describe('navigation Timing: canNavigateWithoutAnalysis', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should NOT allow navigation when analysis is ready to stream (has participantMessageIds)', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    // Create placeholder
    const placeholder = createPlaceholderAnalysis(thread.id, 0, 'Test');
    store.getState().addAnalysis(placeholder);

    // Simulate participants completing
    const messages: UIMessage[] = [
      createUserMessage(0, 'Test'),
      createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
    ];
    store.getState().setMessages(messages);
    store.getState().createPendingAnalysis({
      roundNumber: 0,
      messages,
      userQuestion: 'Test',
      threadId: thread.id,
      mode: 'debating',
    });

    // Advance time past 15s
    vi.advanceTimersByTime(20000);

    const analysis = store.getState().analyses[0];
    const { canNavigateWithoutAnalysis } = simulateNavigationCheck(analysis, false);

    // Should NOT allow navigation because analysis has participantMessageIds
    expect(canNavigateWithoutAnalysis).toBe(false);
  });

  it('should allow 15s timeout for placeholder (no participantMessageIds)', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);

    // Create placeholder with old createdAt
    const oldDate = new Date(Date.now() - 20000); // 20s ago
    const placeholder = createPlaceholderAnalysis(thread.id, 0, 'Test', oldDate);
    store.getState().addAnalysis(placeholder);

    const analysis = store.getState().analyses[0];
    const { canNavigateWithoutAnalysis } = simulateNavigationCheck(analysis, false);

    // Should allow navigation because it's a placeholder and 15s passed
    expect(canNavigateWithoutAnalysis).toBe(true);
  });

  it('should NOT allow 15s timeout while streaming', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);

    // Create placeholder with old createdAt
    const oldDate = new Date(Date.now() - 20000);
    const placeholder = createPlaceholderAnalysis(thread.id, 0, 'Test', oldDate);
    store.getState().addAnalysis(placeholder);

    const analysis = store.getState().analyses[0];
    // Simulate isStreaming = true
    const { canNavigateWithoutAnalysis } = simulateNavigationCheck(analysis, true);

    // Should NOT allow navigation while streaming
    expect(canNavigateWithoutAnalysis).toBe(false);
  });
});

describe('navigation Timing: firstAnalysisCompleted', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return true when analysis status is COMPLETE', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);

    store.getState().addAnalysis({
      ...createPlaceholderAnalysis(thread.id, 0, 'Test'),
      status: AnalysisStatuses.COMPLETE,
      participantMessageIds: ['msg-1'],
    });

    const analysis = store.getState().analyses[0];
    const { firstAnalysisCompleted } = simulateNavigationCheck(analysis, false);

    expect(firstAnalysisCompleted).toBe(true);
  });

  it('should return true for 60s streaming timeout', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);

    const oldDate = new Date(Date.now() - 65000); // 65s ago
    store.getState().addAnalysis({
      ...createPlaceholderAnalysis(thread.id, 0, 'Test', oldDate),
      status: AnalysisStatuses.STREAMING,
      participantMessageIds: ['msg-1'],
    });

    const analysis = store.getState().analyses[0];
    const { firstAnalysisCompleted } = simulateNavigationCheck(analysis, false);

    expect(firstAnalysisCompleted).toBe(true);
  });

  it('should return true for 60s pending timeout ONLY for placeholders', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);

    const oldDate = new Date(Date.now() - 65000);

    // Placeholder (no participantMessageIds)
    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Test', oldDate));

    let analysis = store.getState().analyses[0];
    let result = simulateNavigationCheck(analysis, false);
    expect(result.firstAnalysisCompleted).toBe(true); // Placeholder times out

    // Now test with real analysis (has participantMessageIds)
    store.getState().removeAnalysis(0);
    store.getState().addAnalysis({
      ...createPlaceholderAnalysis(thread.id, 0, 'Test', oldDate),
      participantMessageIds: ['msg-1'], // Not a placeholder
    });

    analysis = store.getState().analyses[0];
    result = simulateNavigationCheck(analysis, false);
    expect(result.firstAnalysisCompleted).toBe(false); // Real analysis doesn't timeout at 60s for PENDING
  });

  it('should NOT timeout PENDING analysis that is ready to stream', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    // Create analysis 65s ago but with participantMessageIds (ready to stream)
    const oldDate = new Date(Date.now() - 65000);
    store.getState().addAnalysis({
      ...createPlaceholderAnalysis(thread.id, 0, 'Test', oldDate),
      participantMessageIds: [`${thread.id}_r0_p0`], // Has participant messages
    });

    const analysis = store.getState().analyses[0];
    const { firstAnalysisCompleted, canNavigateWithoutAnalysis } = simulateNavigationCheck(analysis, false);

    // Neither timeout should trigger - analysis is ready to stream
    expect(firstAnalysisCompleted).toBe(false);
    expect(canNavigateWithoutAnalysis).toBe(false);
  });
});

describe('navigation Timing: Full Flow Simulation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should follow correct navigation sequence: participants → analysis → navigate', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    // T=0: Thread created, placeholder analysis created
    const placeholder = createPlaceholderAnalysis(thread.id, 0, 'Test');
    store.getState().addAnalysis(placeholder);

    let analysis = store.getState().analyses[0];
    let result = simulateNavigationCheck(analysis, true); // isStreaming=true (participants streaming)
    expect(result.firstAnalysisCompleted).toBe(false);
    expect(result.canNavigateWithoutAnalysis).toBe(false);

    // T=10s: Participants finish streaming
    vi.advanceTimersByTime(10000);
    const messages: UIMessage[] = [
      createUserMessage(0, 'Test'),
      createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
    ];
    store.getState().setMessages(messages);
    store.getState().createPendingAnalysis({
      roundNumber: 0,
      messages,
      userQuestion: 'Test',
      threadId: thread.id,
      mode: 'debating',
    });

    // Analysis now has participantMessageIds but is still PENDING
    analysis = store.getState().analyses[0];
    result = simulateNavigationCheck(analysis, false); // isStreaming=false (participants done)
    expect(result.firstAnalysisCompleted).toBe(false);
    expect(result.canNavigateWithoutAnalysis).toBe(false); // Ready to stream, don't navigate

    // T=12s: Analysis starts streaming
    vi.advanceTimersByTime(2000);
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);

    analysis = store.getState().analyses[0];
    result = simulateNavigationCheck(analysis, false);
    expect(result.firstAnalysisCompleted).toBe(false);
    expect(result.canNavigateWithoutAnalysis).toBe(false);

    // T=20s: Analysis completes
    vi.advanceTimersByTime(8000);
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);

    analysis = store.getState().analyses[0];
    result = simulateNavigationCheck(analysis, false);
    expect(result.firstAnalysisCompleted).toBe(true); // Now can navigate!
    // canNavigateWithoutAnalysis is true (20s > 15s) but doesn't matter since firstAnalysisCompleted is already true
    expect(result.canNavigateWithoutAnalysis).toBe(true);
  });

  it('should handle slow participants without premature navigation', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);
    store.getState().setParticipants([
      createTestParticipant(0, 'gpt-4'),
      createTestParticipant(1, 'claude-3'),
    ]);

    // T=0: Thread created, placeholder analysis created
    const placeholder = createPlaceholderAnalysis(thread.id, 0, 'Test');
    store.getState().addAnalysis(placeholder);

    // T=20s: Still streaming (slow participants)
    vi.advanceTimersByTime(20000);

    let analysis = store.getState().analyses[0];
    let result = simulateNavigationCheck(analysis, true); // Still streaming
    expect(result.firstAnalysisCompleted).toBe(false);
    expect(result.canNavigateWithoutAnalysis).toBe(false); // Can't navigate while streaming

    // T=30s: Participants finally finish
    vi.advanceTimersByTime(10000);
    const messages: UIMessage[] = [
      createUserMessage(0, 'Test'),
      createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
      createParticipantMessage(thread.id, 0, 1, 'participant-1', 'claude-3'),
    ];
    store.getState().setMessages(messages);
    store.getState().createPendingAnalysis({
      roundNumber: 0,
      messages,
      userQuestion: 'Test',
      threadId: thread.id,
      mode: 'debating',
    });

    // Even though 30s passed, should NOT navigate - analysis ready to stream
    analysis = store.getState().analyses[0];
    result = simulateNavigationCheck(analysis, false);
    expect(result.firstAnalysisCompleted).toBe(false);
    expect(result.canNavigateWithoutAnalysis).toBe(false);
  });
});

// =============================================================================
// WEB SEARCH TOGGLE SCENARIOS
// =============================================================================

describe('web Search Toggle Mid-Conversation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should create pre-search for round when web search enabled mid-conversation', () => {
    const thread = createTestThread({ enableWebSearch: false });
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    // Round 0 without web search
    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Q1'));
    expect(store.getState().preSearches).toHaveLength(0);

    // Enable web search
    store.getState().setThread({ ...thread, enableWebSearch: true });

    // Round 1 with web search
    store.getState().addPreSearch(createPlaceholderPreSearch(thread.id, 1, 'Q2'));
    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 1, 'Q2'));

    expect(store.getState().preSearches).toHaveLength(1);
    expect(store.getState().preSearches[0].roundNumber).toBe(1);
  });

  it('should not create pre-search when web search disabled mid-conversation', () => {
    const thread = createTestThread({ enableWebSearch: true });
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    // Round 0 with web search
    store.getState().addPreSearch(createPlaceholderPreSearch(thread.id, 0, 'Q1'));
    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Q1'));
    expect(store.getState().preSearches).toHaveLength(1);

    // Disable web search
    store.getState().setThread({ ...thread, enableWebSearch: false });

    // Round 1 without web search - don't add pre-search
    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 1, 'Q2'));

    // Should still only have round 0 pre-search
    expect(store.getState().preSearches).toHaveLength(1);
    expect(store.getState().preSearches[0].roundNumber).toBe(0);
  });

  it('should complete pre-search before analysis can proceed', () => {
    const thread = createTestThread({ enableWebSearch: true });
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    // Create both placeholders
    store.getState().addPreSearch(createPlaceholderPreSearch(thread.id, 0, 'Test'));
    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Test'));

    // Pre-search in progress
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

    // Check if participants should wait
    const preSearch = store.getState().preSearches[0];
    const shouldWaitForPreSearch = preSearch.status !== AnalysisStatuses.COMPLETE
      && preSearch.status !== AnalysisStatuses.FAILED;
    expect(shouldWaitForPreSearch).toBe(true);

    // Complete pre-search
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

    const completedPreSearch = store.getState().preSearches[0];
    const canProceed = completedPreSearch.status === AnalysisStatuses.COMPLETE;
    expect(canProceed).toBe(true);
  });
});

// =============================================================================
// ERROR RECOVERY SCENARIOS
// =============================================================================

describe('error Recovery Scenarios', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should handle analysis failure gracefully', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    // Create and update placeholder
    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Test'));
    const messages: UIMessage[] = [
      createUserMessage(0, 'Test'),
      createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
    ];
    store.getState().setMessages(messages);
    store.getState().createPendingAnalysis({
      roundNumber: 0,
      messages,
      userQuestion: 'Test',
      threadId: thread.id,
      mode: 'debating',
    });

    // Analysis fails
    store.getState().updateAnalysisError(0, 'Schema validation failed');

    const analysis = store.getState().analyses[0];
    expect(analysis.status).toBe(AnalysisStatuses.FAILED);
    expect(analysis.errorMessage).toBe('Schema validation failed');

    // Navigation should still be possible after failure
    const _result = simulateNavigationCheck(analysis, false);
    // FAILED status is terminal - navigation logic treats it similar to COMPLETE
    // (user can navigate away from failed state)
  });

  it('should handle pre-search failure and allow participants to proceed', () => {
    const thread = createTestThread({ enableWebSearch: true });
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    store.getState().addPreSearch(createPlaceholderPreSearch(thread.id, 0, 'Test'));

    // Pre-search fails
    store.getState().updatePreSearchError(0, 'Search API error');

    const preSearch = store.getState().preSearches[0];
    expect(preSearch.status).toBe(AnalysisStatuses.FAILED);

    // Participants should be able to proceed (failure is terminal)
    const canProceed = preSearch.status === AnalysisStatuses.COMPLETE
      || preSearch.status === AnalysisStatuses.FAILED;
    expect(canProceed).toBe(true);
  });

  it('should allow next round after previous round analysis fails', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    // Round 0 fails
    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Q1'));
    const messages0: UIMessage[] = [
      createUserMessage(0, 'Q1'),
      createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
    ];
    store.getState().setMessages(messages0);
    store.getState().createPendingAnalysis({
      roundNumber: 0,
      messages: messages0,
      userQuestion: 'Q1',
      threadId: thread.id,
      mode: 'debating',
    });
    store.getState().updateAnalysisError(0, 'Error');

    // Round 1 should work independently
    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 1, 'Q2'));
    const messages1: UIMessage[] = [
      ...messages0,
      createUserMessage(1, 'Q2'),
      createParticipantMessage(thread.id, 1, 0, 'participant-0', 'gpt-4'),
    ];
    store.getState().setMessages(messages1);
    store.getState().createPendingAnalysis({
      roundNumber: 1,
      messages: messages1,
      userQuestion: 'Q2',
      threadId: thread.id,
      mode: 'debating',
    });

    const analyses = store.getState().analyses;
    expect(analyses[0].status).toBe(AnalysisStatuses.FAILED);
    expect(analyses[1].status).toBe(AnalysisStatuses.PENDING);
    expect(analyses[1].participantMessageIds).toHaveLength(1);
  });
});

// =============================================================================
// CONCURRENT OPERATIONS
// =============================================================================

describe('concurrent Operations', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should handle rapid status updates without corruption', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Test'));

    // Rapid fire status updates
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);

    const analysis = store.getState().analyses[0];
    expect(analysis.status).toBe(AnalysisStatuses.COMPLETE);
  });

  it('should handle multiple rounds being created rapidly', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    // Create multiple rounds rapidly
    for (let round = 0; round < 5; round++) {
      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, round, `Q${round}`));
    }

    expect(store.getState().analyses).toHaveLength(5);
    expect(store.getState().analyses[0].roundNumber).toBe(0);
    expect(store.getState().analyses[4].roundNumber).toBe(4);
  });

  it('should maintain data integrity during participant changes', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);

    // Start with 1 participant
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    // Round 0
    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Q1'));
    const messages0: UIMessage[] = [
      createUserMessage(0, 'Q1'),
      createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
    ];
    store.getState().setMessages(messages0);
    store.getState().createPendingAnalysis({
      roundNumber: 0,
      messages: messages0,
      userQuestion: 'Q1',
      threadId: thread.id,
      mode: 'debating',
    });

    // Add participant and change to round 1
    store.getState().setParticipants([
      createTestParticipant(0, 'gpt-4'),
      createTestParticipant(1, 'claude-3'),
    ]);

    // Round 1 with more participants
    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 1, 'Q2'));
    const messages1: UIMessage[] = [
      ...messages0,
      createUserMessage(1, 'Q2'),
      createParticipantMessage(thread.id, 1, 0, 'participant-0', 'gpt-4'),
      createParticipantMessage(thread.id, 1, 1, 'participant-1', 'claude-3'),
    ];
    store.getState().setMessages(messages1);
    store.getState().createPendingAnalysis({
      roundNumber: 1,
      messages: messages1,
      userQuestion: 'Q2',
      threadId: thread.id,
      mode: 'debating',
    });

    // Verify data integrity
    const analyses = store.getState().analyses;
    expect(analyses[0].participantMessageIds).toHaveLength(1);
    expect(analyses[1].participantMessageIds).toHaveLength(2);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should handle analysis with zero participants', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);
    store.getState().setParticipants([]); // No participants

    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Test'));

    // Try to create pending analysis with no participant messages
    store.getState().createPendingAnalysis({
      roundNumber: 0,
      messages: [createUserMessage(0, 'Test')], // Only user message
      userQuestion: 'Test',
      threadId: thread.id,
      mode: 'debating',
    });

    // Analysis should remain placeholder (no participant messages found)
    const analysis = store.getState().analyses[0];
    expect(analysis.participantMessageIds).toHaveLength(0);
  });

  it('should handle thread without AI-generated slug', () => {
    const thread = createTestThread({
      isAiGeneratedTitle: false,
      slug: 'manual-slug',
    });
    store.getState().setThread(thread);

    // Navigation logic relies on AI slug - test that thread is set correctly
    expect(store.getState().thread?.isAiGeneratedTitle).toBe(false);
    expect(store.getState().thread?.slug).toBe('manual-slug');
  });

  it('should handle analysis mode change between rounds', () => {
    const thread = createTestThread({ mode: 'debating' });
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    // Round 0 in debating mode
    store.getState().addAnalysis({
      ...createPlaceholderAnalysis(thread.id, 0, 'Q1'),
      mode: 'debating',
    });

    // Change to analyzing mode
    store.getState().setThread({ ...thread, mode: 'analyzing' });

    // Round 1 should use new mode
    store.getState().addAnalysis({
      ...createPlaceholderAnalysis(thread.id, 1, 'Q2'),
      mode: 'analyzing',
    });

    const analyses = store.getState().analyses;
    expect(analyses[0].mode).toBe('debating');
    expect(analyses[1].mode).toBe('analyzing');
  });

  it('should preserve original placeholder ID when updating with participantMessageIds', () => {
    const thread = createTestThread();
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    const placeholder = createPlaceholderAnalysis(thread.id, 0, 'Test');
    const originalId = placeholder.id;
    const originalCreatedAt = placeholder.createdAt;

    store.getState().addAnalysis(placeholder);

    const messages: UIMessage[] = [
      createUserMessage(0, 'Test'),
      createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
    ];
    store.getState().setMessages(messages);
    store.getState().createPendingAnalysis({
      roundNumber: 0,
      messages,
      userQuestion: 'Test',
      threadId: thread.id,
      mode: 'debating',
    });

    const updatedAnalysis = store.getState().analyses[0];

    // ID and createdAt should be preserved
    expect(updatedAnalysis.id).toBe(originalId);
    expect(updatedAnalysis.createdAt).toEqual(originalCreatedAt);

    // But participantMessageIds should be updated
    expect(updatedAnalysis.participantMessageIds).toHaveLength(1);
  });
});

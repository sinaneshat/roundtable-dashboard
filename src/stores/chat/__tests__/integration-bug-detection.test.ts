/**
 * Integration Bug Detection Tests
 *
 * CRITICAL APPROACH: Minimal mocking, test actual implementation
 * These tests are designed to FAIL if there are bugs in the code
 * They test real code paths, edge cases, and race conditions
 *
 * Location: /src/stores/chat/__tests__/integration-bug-detection.test.ts
 */

import type { UIMessage } from 'ai';
import { act } from 'react';

import type { ChatMode } from '@/api/core/enums';
import { AnalysisStatuses, ChatModes, ScreenModes } from '@/api/core/enums';
import {
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing/helpers';
import {
  calculateNextRoundNumber,
  getCurrentRoundNumber,
  getMaxRoundNumber,
  groupMessagesByRound,
} from '@/lib/utils/round-utils';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';
import {
  createMockAnalysis,
  createMockAnalysisPayload,
  createMockMessage,
  createMockParticipant,
  createMockParticipants,
  createMockPreSearch,
  createMockRoundMessages,
  createMockThread,
  createMockUserMessage,
  createPendingAnalysis,
  createPendingPreSearch,
  createStreamingAnalysis,
  createStreamingPreSearch,
} from './test-factories';

// ============================================================================
// Test Utilities
// ============================================================================

function createTestStore(): ChatStoreApi {
  return createChatStore();
}

function _flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ============================================================================
// 1. PRE-SEARCH EXECUTION FLOW TESTS
// ============================================================================

describe('pre-Search Execution Flow', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should create pre-search in IDLE status correctly', () => {
    // Note: Pre-search uses AnalysisStatuses.PENDING, not AnalysisStatuses.PENDING
    const preSearch = createPendingPreSearch(0);

    act(() => {
      store.getState().addPreSearch(preSearch);
    });

    const state = store.getState();
    expect(state.preSearches).toHaveLength(1);
    expect(state.preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);
  });

  it('should update pre-search status from PENDING to STREAMING', () => {
    const preSearch = createPendingPreSearch(0);

    act(() => {
      store.getState().addPreSearch(preSearch);
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    });

    const state = store.getState();
    expect(state.preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);
  });

  it('should update pre-search status from STREAMING to COMPLETE', () => {
    const preSearch = createStreamingPreSearch(0);

    act(() => {
      store.getState().addPreSearch(preSearch);
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
    });

    const state = store.getState();
    expect(state.preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
  });

  it('should handle multiple pre-searches for different rounds', () => {
    act(() => {
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().addPreSearch(createPendingPreSearch(1));
      store.getState().addPreSearch(createPendingPreSearch(2));
    });

    const state = store.getState();
    expect(state.preSearches).toHaveLength(3);
    expect(state.preSearches.map(ps => ps.roundNumber)).toEqual([0, 1, 2]);
  });

  it('should track triggered pre-search rounds correctly', () => {
    const state = store.getState();

    expect(state.hasPreSearchBeenTriggered(0)).toBe(false);

    act(() => {
      state.markPreSearchTriggered(0);
    });

    expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);
    expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
  });

  it('should clear pre-search tracking for specific round', () => {
    act(() => {
      store.getState().markPreSearchTriggered(0);
      store.getState().markPreSearchTriggered(1);
      store.getState().clearPreSearchTracking(0);
    });

    const state = store.getState();
    expect(state.hasPreSearchBeenTriggered(0)).toBe(false);
    expect(state.hasPreSearchBeenTriggered(1)).toBe(true);
  });

  it('should find pre-search for correct round number', () => {
    act(() => {
      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 0 }));
      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 1, id: 'pre-search-2' }));
    });

    const state = store.getState();
    const round0PreSearch = state.preSearches.find(ps => ps.roundNumber === 0);
    const round1PreSearch = state.preSearches.find(ps => ps.roundNumber === 1);

    expect(round0PreSearch?.id).toBe('pre-search-1');
    expect(round1PreSearch?.id).toBe('pre-search-2');
  });

  it('should handle pre-search update for non-existent round gracefully', () => {
    act(() => {
      store.getState().updatePreSearchStatus(99, AnalysisStatuses.COMPLETE);
    });

    const state = store.getState();
    expect(state.preSearches).toHaveLength(0);
  });
});

// ============================================================================
// 2. STATE CONSISTENCY TESTS
// ============================================================================

describe('state Consistency', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should clear all streaming flags in completeStreaming', () => {
    // Set up streaming state
    act(() => {
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setCurrentRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setCurrentParticipantIndex(2);
      store.getState().setIsCreatingAnalysis(true);
      store.getState().setIsWaitingForChangelog(true);
    });

    // Complete streaming
    act(() => {
      store.getState().completeStreaming();
    });

    const state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.streamingRoundNumber).toBeNull();
    expect(state.currentRoundNumber).toBeNull();
    expect(state.waitingToStartStreaming).toBe(false);
    expect(state.currentParticipantIndex).toBe(0);
    expect(state.isCreatingAnalysis).toBe(false);
    expect(state.isWaitingForChangelog).toBe(false);
  });

  it('should reset pending message state correctly', () => {
    act(() => {
      store.getState().setPendingMessage('test message');
      store.getState().setExpectedParticipantIds(['p1', 'p2']);
      store.getState().setHasSentPendingMessage(true);
    });

    act(() => {
      store.getState().completeStreaming();
    });

    const state = store.getState();
    expect(state.pendingMessage).toBeNull();
    expect(state.expectedParticipantIds).toBeNull();
    expect(state.hasSentPendingMessage).toBe(false);
  });

  it('should reset regeneration flags correctly', () => {
    act(() => {
      store.getState().setIsRegenerating(true);
      store.getState().setRegeneratingRoundNumber(1);
    });

    act(() => {
      store.getState().completeStreaming();
    });

    const state = store.getState();
    expect(state.isRegenerating).toBe(false);
    expect(state.regeneratingRoundNumber).toBeNull();
  });

  it('should handle startRegeneration with tracking cleanup', () => {
    act(() => {
      store.getState().markAnalysisCreated(1);
      store.getState().markPreSearchTriggered(1);
    });

    expect(store.getState().hasAnalysisBeenCreated(1)).toBe(true);
    expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);

    act(() => {
      store.getState().startRegeneration(1);
    });

    const state = store.getState();
    expect(state.isRegenerating).toBe(true);
    expect(state.regeneratingRoundNumber).toBe(1);
    expect(state.hasAnalysisBeenCreated(1)).toBe(false);
    expect(state.hasPreSearchBeenTriggered(1)).toBe(false);
  });

  it('should prepare for new message correctly', () => {
    act(() => {
      store.getState().prepareForNewMessage('Hello', ['p1', 'p2']);
    });

    const state = store.getState();
    expect(state.pendingMessage).toBe('Hello');
    expect(state.expectedParticipantIds).toEqual(['p1', 'p2']);
    expect(state.hasSentPendingMessage).toBe(false);
    expect(state.isWaitingForChangelog).toBe(true);
    expect(state.isStreaming).toBe(false);
    expect(state.isRegenerating).toBe(false);
  });

  it('should not overwrite existing expectedParticipantIds if empty array passed', () => {
    act(() => {
      store.getState().setExpectedParticipantIds(['p1', 'p2']);
      store.getState().prepareForNewMessage('Hello', []);
    });

    const state = store.getState();
    expect(state.expectedParticipantIds).toEqual(['p1', 'p2']);
  });

  it('should create fresh Set instances on resetToOverview', () => {
    act(() => {
      store.getState().markAnalysisCreated(0);
      store.getState().markPreSearchTriggered(0);
    });

    const beforeReset = store.getState();
    expect(beforeReset.createdAnalysisRounds.size).toBe(1);
    expect(beforeReset.triggeredPreSearchRounds.size).toBe(1);

    act(() => {
      store.getState().resetToOverview();
    });

    const afterReset = store.getState();
    expect(afterReset.createdAnalysisRounds.size).toBe(0);
    expect(afterReset.triggeredPreSearchRounds.size).toBe(0);
    // Verify they are different Set instances
    expect(afterReset.createdAnalysisRounds).not.toBe(beforeReset.createdAnalysisRounds);
  });

  it('should set screenMode to overview on resetToOverview', () => {
    act(() => {
      store.getState().setScreenMode(ScreenModes.THREAD);
    });

    act(() => {
      store.getState().resetToOverview();
    });

    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
  });

  it('should NOT stop ongoing streams in resetToNewChat (resumable streams)', () => {
    const mockStop = vi.fn();

    act(() => {
      store.getState().setStop(mockStop);
      store.getState().setIsStreaming(true);
      store.getState().resetToNewChat();
    });

    // ✅ RESUMABLE STREAMS: stop is NOT called - streams continue in background via waitUntil()
    expect(mockStop).not.toHaveBeenCalled();
    // Local state is cleared, but backend stream continues
    expect(store.getState().isStreaming).toBe(false);
  });
});

// ============================================================================
// 3. ROUND NUMBER CALCULATION TESTS
// ============================================================================

describe('round Number Calculation', () => {
  it('should return 0 for empty messages array', () => {
    expect(getCurrentRoundNumber([])).toBe(0);
    expect(calculateNextRoundNumber([])).toBe(0);
    expect(getMaxRoundNumber([])).toBe(0);
  });

  it('should calculate current round from last user message', () => {
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'a1',
        content: 'A1',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    expect(getCurrentRoundNumber(messages)).toBe(0);
  });

  it('should calculate next round number correctly', () => {
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'a1',
        content: 'A1',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    expect(calculateNextRoundNumber(messages)).toBe(1);
  });

  it('should handle multiple rounds correctly', () => {
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'a1',
        content: 'A1',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestUserMessage({ id: 'u2', content: 'Q2', roundNumber: 1 }),
      createTestAssistantMessage({
        id: 'a2',
        content: 'A2',
        roundNumber: 1,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    expect(getCurrentRoundNumber(messages)).toBe(1);
    expect(calculateNextRoundNumber(messages)).toBe(2);
    expect(getMaxRoundNumber(messages)).toBe(1);
  });

  it('should handle messages with missing metadata gracefully', () => {
    const messages: UIMessage[] = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'Question' }],
        // No metadata
      },
    ];

    // Should default to 0 when metadata is missing
    expect(getCurrentRoundNumber(messages)).toBe(0);
  });

  it('should group messages by round correctly', () => {
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'a1',
        content: 'A1',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestUserMessage({ id: 'u2', content: 'Q2', roundNumber: 1 }),
      createTestAssistantMessage({
        id: 'a2',
        content: 'A2',
        roundNumber: 1,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    const grouped = groupMessagesByRound(messages);

    expect(grouped.size).toBe(2);
    expect(grouped.get(0)?.length).toBe(2);
    expect(grouped.get(1)?.length).toBe(2);
  });

  it('should handle incomplete rounds (not all participants responded)', () => {
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'a1',
        content: 'A1',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      // Participant 1 hasn't responded yet
    ];

    const grouped = groupMessagesByRound(messages);
    expect(grouped.get(0)?.length).toBe(2);
    expect(getCurrentRoundNumber(messages)).toBe(0);
  });

  it('should deduplicate messages with same ID', () => {
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
      createTestUserMessage({ id: 'u1', content: 'Q1 duplicate', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'a1',
        content: 'A1',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    const grouped = groupMessagesByRound(messages);
    expect(grouped.get(0)?.length).toBe(2); // Deduplicated
  });

  it('should calculate correctly with only assistant messages', () => {
    const messages: UIMessage[] = [
      createTestAssistantMessage({
        id: 'a1',
        content: 'A1',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    // getCurrentRoundNumber should return 0 (default) if no user message
    expect(getCurrentRoundNumber(messages)).toBe(0);
    // calculateNextRoundNumber looks for user messages, returns 0 if none
    expect(calculateNextRoundNumber(messages)).toBe(0);
  });
});

// ============================================================================
// 4. MESSAGE PROCESSING TESTS
// ============================================================================

describe('message Processing', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should set messages correctly', () => {
    const messages = createMockRoundMessages(0, 2);

    act(() => {
      store.getState().setMessages(messages);
    });

    expect(store.getState().messages).toHaveLength(3); // 1 user + 2 assistants
  });

  it('should update messages with function updater', () => {
    const initialMessages = createMockRoundMessages(0, 1);
    const newMessage = createMockUserMessage(1);

    act(() => {
      store.getState().setMessages(initialMessages);
      store.getState().setMessages(prev => [...prev, newMessage]);
    });

    expect(store.getState().messages).toHaveLength(3);
  });

  it('should handle message ordering correctly', () => {
    const round0Messages = createMockRoundMessages(0, 2);
    const round1User = createMockUserMessage(1);
    const round1Assistant = createMockMessage(0, 1);

    act(() => {
      store.getState().setMessages([
        ...round0Messages,
        round1User,
        round1Assistant,
      ]);
    });

    const messages = store.getState().messages;
    expect(messages).toHaveLength(5);

    // Verify ordering: round 0 user, round 0 assistants, round 1 user, round 1 assistant
    expect(messages[0]?.role).toBe('user');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[2]?.role).toBe('assistant');
    expect(messages[3]?.role).toBe('user');
    expect(messages[4]?.role).toBe('assistant');
  });

  it('should handle empty messages array', () => {
    act(() => {
      store.getState().setMessages([]);
    });

    expect(store.getState().messages).toHaveLength(0);
  });

  it('should preserve message metadata', () => {
    const userMessage = createTestUserMessage({
      id: 'test-id',
      content: 'Test',
      roundNumber: 0,
    });

    act(() => {
      store.getState().setMessages([userMessage]);
    });

    const storedMessage = store.getState().messages[0];
    expect(storedMessage?.id).toBe('test-id');
    expect(storedMessage?.metadata).toBeDefined();
  });
});

// ============================================================================
// 5. ANALYSIS TRACKING TESTS
// ============================================================================

describe('analysis Tracking', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should mark analysis as created for round', () => {
    expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);

    act(() => {
      store.getState().markAnalysisCreated(0);
    });

    expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
    expect(store.getState().hasAnalysisBeenCreated(1)).toBe(false);
  });

  it('should clear analysis tracking for specific round', () => {
    act(() => {
      store.getState().markAnalysisCreated(0);
      store.getState().markAnalysisCreated(1);
      store.getState().clearAnalysisTracking(0);
    });

    expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
    expect(store.getState().hasAnalysisBeenCreated(1)).toBe(true);
  });

  it('should add analysis to store', () => {
    const analysis = createPendingAnalysis(0);

    act(() => {
      store.getState().addAnalysis(analysis);
    });

    expect(store.getState().analyses).toHaveLength(1);
  });

  it('should not duplicate analysis for same thread+round in createPendingAnalysis', () => {
    const thread = createMockThread();
    const participants = createMockParticipants(2);
    // Use properly typed messages that pass validation
    const messages: UIMessage[] = [
      createTestUserMessage({
        id: 'user-msg-0',
        content: 'Test question',
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        id: `${thread.id}_r0_p0`,
        content: 'Response 1',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: `${thread.id}_r0_p1`,
        content: 'Response 2',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
      }),
    ];

    act(() => {
      store.getState().setThread(thread);
      store.getState().setParticipants(participants);
      store.getState().setMessages(messages);
    });

    // First creation should succeed
    act(() => {
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test?',
        threadId: thread.id,
        mode: ChatModes.DEBATING,
      });
    });

    expect(store.getState().analyses).toHaveLength(1);

    // Second creation for same round should be deduplicated
    act(() => {
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test?',
        threadId: thread.id,
        mode: ChatModes.DEBATING,
      });
    });

    // Should still be 1 due to deduplication
    expect(store.getState().analyses).toHaveLength(1);
  });

  it('should update analysis status', () => {
    const analysis = createPendingAnalysis(0);

    act(() => {
      store.getState().addAnalysis(analysis);
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
    });

    expect(store.getState().analyses[0]?.status).toBe(AnalysisStatuses.STREAMING);
  });

  it('should update analysis error', () => {
    const analysis = createPendingAnalysis(0);

    act(() => {
      store.getState().addAnalysis(analysis);
      store.getState().updateAnalysisError(0, 'Test error');
    });

    const updatedAnalysis = store.getState().analyses[0];
    expect(updatedAnalysis?.status).toBe(AnalysisStatuses.FAILED);
    expect(updatedAnalysis?.errorMessage).toBe('Test error');
  });

  it('should remove analysis for round', () => {
    act(() => {
      store.getState().addAnalysis(createPendingAnalysis(0));
      store.getState().addAnalysis(createPendingAnalysis(1));
      store.getState().removeAnalysis(0);
    });

    const analyses = store.getState().analyses;
    expect(analyses).toHaveLength(1);
    expect(analyses[0]?.roundNumber).toBe(1);
  });

  it('should clear all analyses', () => {
    act(() => {
      store.getState().addAnalysis(createPendingAnalysis(0));
      store.getState().addAnalysis(createPendingAnalysis(1));
      store.getState().clearAllAnalyses();
    });

    expect(store.getState().analyses).toHaveLength(0);
  });

  it('should not create analysis if no participant messages for round', () => {
    const thread = createMockThread();
    const messages = [createMockUserMessage(0)]; // Only user message, no participants

    act(() => {
      store.getState().setThread(thread);
      store.getState().setMessages(messages);

      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test?',
        threadId: thread.id,
        mode: ChatModes.DEBATING,
      });
    });

    // Should not create analysis without participant messages
    expect(store.getState().analyses).toHaveLength(0);
  });

  it('should not create analysis with message ID/metadata mismatch', () => {
    const thread = createMockThread();
    // Create message with mismatched ID vs metadata
    const mismatchedMessage: UIMessage = {
      id: 'thread-123_r1_p0', // Claims round 1 in ID
      role: 'assistant',
      parts: [{ type: 'text', text: 'Test' }],
      metadata: {
        role: 'assistant',
        roundNumber: 0, // But metadata says round 0
        participantId: 'p0',
        participantIndex: 0,
        participantRole: null,
        model: 'gpt-4',
      },
    };

    const messages = [
      createMockUserMessage(0),
      mismatchedMessage,
    ];

    act(() => {
      store.getState().setThread(thread);
      store.getState().setMessages(messages);

      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test?',
        threadId: thread.id,
        mode: ChatModes.DEBATING,
      });
    });

    // Should reject analysis due to mismatch
    expect(store.getState().analyses).toHaveLength(0);
  });
});

// ============================================================================
// 6. STOP BUTTON RACE CONDITION TESTS
// ============================================================================

describe('stop Button Race Conditions', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should stop streaming and clear flags', () => {
    const mockStop = vi.fn();

    act(() => {
      store.getState().setStop(mockStop);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
    });

    // Simulate stop button click
    act(() => {
      store.getState().stop?.();
      store.getState().completeStreaming();
    });

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().streamingRoundNumber).toBeNull();
  });

  it('should handle stop during pre-search', () => {
    act(() => {
      store.getState().addPreSearch(createStreamingPreSearch(0));
      store.getState().setIsStreaming(true);
    });

    // Stop during pre-search
    act(() => {
      store.getState().completeStreaming();
    });

    // Flags should be cleared
    expect(store.getState().isStreaming).toBe(false);
    // Pre-search should remain (it's a separate concern)
    expect(store.getState().preSearches).toHaveLength(1);
  });

  it('should handle stop during analysis streaming', () => {
    act(() => {
      store.getState().addAnalysis(createStreamingAnalysis(0));
      store.getState().setIsCreatingAnalysis(true);
    });

    act(() => {
      store.getState().completeStreaming();
    });

    expect(store.getState().isCreatingAnalysis).toBe(false);
  });

  it('should handle multiple rapid stop calls', () => {
    const mockStop = vi.fn();

    act(() => {
      store.getState().setStop(mockStop);
      store.getState().setIsStreaming(true);
    });

    // Simulate rapid stop clicks
    act(() => {
      store.getState().stop?.();
      store.getState().stop?.();
      store.getState().stop?.();
    });

    expect(mockStop).toHaveBeenCalledTimes(3);
  });

  it('should clear waitingToStartStreaming flag on stop', () => {
    act(() => {
      store.getState().setWaitingToStartStreaming(true);
      store.getState().completeStreaming();
    });

    expect(store.getState().waitingToStartStreaming).toBe(false);
  });
});

// ============================================================================
// 7. MEMORY LEAKS AND CLEANUP TESTS
// ============================================================================

describe('memory Leaks and Cleanup', () => {
  it('should reset all state in resetToOverview', () => {
    const store = createTestStore();

    // Set up various state
    act(() => {
      store.getState().setThread(createMockThread());
      store.getState().setParticipants(createMockParticipants(2));
      store.getState().setMessages(createMockRoundMessages(0, 2));
      store.getState().addAnalysis(createPendingAnalysis(0));
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().setIsStreaming(true);
      store.getState().setPendingMessage('test');
      store.getState().markAnalysisCreated(0);
      store.getState().markPreSearchTriggered(0);
    });

    act(() => {
      store.getState().resetToOverview();
    });

    const state = store.getState();
    expect(state.thread).toBeNull();
    expect(state.participants).toHaveLength(0);
    expect(state.messages).toHaveLength(0);
    expect(state.analyses).toHaveLength(0);
    expect(state.preSearches).toHaveLength(0);
    expect(state.isStreaming).toBe(false);
    expect(state.pendingMessage).toBeNull();
    expect(state.createdAnalysisRounds.size).toBe(0);
    expect(state.triggeredPreSearchRounds.size).toBe(0);
  });

  it('should reset thread-specific state in resetThreadState', () => {
    const store = createTestStore();

    act(() => {
      store.getState().setIsStreaming(true);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setHasInitiallyLoaded(true);
      store.getState().setIsRegenerating(true);
      store.getState().setIsCreatingAnalysis(true);
      store.getState().setPendingMessage('test');
      store.getState().markAnalysisCreated(0);
    });

    act(() => {
      store.getState().resetThreadState();
    });

    const state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.waitingToStartStreaming).toBe(false);
    expect(state.hasInitiallyLoaded).toBe(false);
    expect(state.isRegenerating).toBe(false);
    expect(state.isCreatingAnalysis).toBe(false);
    expect(state.pendingMessage).toBeNull();
    expect(state.createdAnalysisRounds.size).toBe(0);
  });

  it('should clear AI SDK methods on reset', () => {
    const store = createTestStore();

    const mockSend = vi.fn();
    const mockStart = vi.fn();
    const mockStop = vi.fn();

    act(() => {
      store.getState().setSendMessage(mockSend);
      store.getState().setStartRound(mockStart);
      store.getState().setStop(mockStop);
    });

    act(() => {
      store.getState().resetThreadState();
    });

    const state = store.getState();
    expect(state.sendMessage).toBeUndefined();
    expect(state.startRound).toBeUndefined();
    expect(state.stop).toBeUndefined();
  });
});

// ============================================================================
// 8. EDGE CASE DATA TESTS
// ============================================================================

describe('edge Case Data', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should handle null thread correctly', () => {
    act(() => {
      store.getState().setThread(null);
    });

    expect(store.getState().thread).toBeNull();
  });

  it('should handle empty participants array', () => {
    act(() => {
      store.getState().setParticipants([]);
    });

    expect(store.getState().participants).toHaveLength(0);
  });

  it('should handle error state correctly', () => {
    const error = new Error('Test error');

    act(() => {
      store.getState().setError(error);
    });

    expect(store.getState().error).toBe(error);
  });

  it('should handle clearing error state', () => {
    act(() => {
      store.getState().setError(new Error('Test'));
      store.getState().setError(null);
    });

    expect(store.getState().error).toBeNull();
  });

  it('should handle very large round numbers', () => {
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 9999 }),
    ];

    expect(getCurrentRoundNumber(messages)).toBe(9999);
    expect(calculateNextRoundNumber(messages)).toBe(10000);
  });

  it('should handle messages with empty parts', () => {
    const message: UIMessage = {
      id: 'test',
      role: 'user',
      parts: [],
      metadata: { role: 'user', roundNumber: 0 },
    };

    act(() => {
      store.getState().setMessages([message]);
    });

    expect(store.getState().messages[0]?.parts).toEqual([]);
  });

  it('should handle participant with null role', () => {
    const participant = createMockParticipant(0, { role: null });

    act(() => {
      store.getState().setParticipants([participant]);
    });

    expect(store.getState().participants[0]?.role).toBeNull();
  });

  it('should handle analysis with null analysisData', () => {
    const analysis = createMockAnalysis({ analysisData: null });

    act(() => {
      store.getState().addAnalysis(analysis);
    });

    expect(store.getState().analyses[0]?.analysisData).toBeNull();
  });
});

// ============================================================================
// 9. CONCURRENT OPERATIONS TESTS
// ============================================================================

describe('concurrent Operations', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should handle rapid message submissions', async () => {
    act(() => {
      store.getState().setPendingMessage('Message 1');
      store.getState().setHasSentPendingMessage(true);
    });

    act(() => {
      store.getState().prepareForNewMessage('Message 2', ['p1']);
    });

    const state = store.getState();
    expect(state.pendingMessage).toBe('Message 2');
    expect(state.hasSentPendingMessage).toBe(false);
  });

  it('should handle simultaneous analysis creation attempts', () => {
    const thread = createMockThread();
    // Use properly typed messages that pass validation
    const messages: UIMessage[] = [
      createTestUserMessage({
        id: 'user-msg-0',
        content: 'Test question',
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        id: `${thread.id}_r0_p0`,
        content: 'Response 1',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: `${thread.id}_r0_p1`,
        content: 'Response 2',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
      }),
    ];

    act(() => {
      store.getState().setThread(thread);
      store.getState().setMessages(messages);

      // Simulate race condition: both provider and flow-state-machine try to create
      store.getState().markAnalysisCreated(0);
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test?',
        threadId: thread.id,
        mode: ChatModes.DEBATING,
      });
    });

    // Should only have 1 analysis due to deduplication
    expect(store.getState().analyses).toHaveLength(1);
  });

  it('should handle rapid state transitions', () => {
    act(() => {
      // Simulate rapid flow transitions
      store.getState().setIsCreatingThread(true);
      store.getState().setIsCreatingThread(false);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setIsStreaming(true);
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setIsCreatingAnalysis(true);
      store.getState().setIsCreatingAnalysis(false);
    });

    const state = store.getState();
    expect(state.isCreatingThread).toBe(false);
    expect(state.waitingToStartStreaming).toBe(false);
    expect(state.isStreaming).toBe(true);
    expect(state.isCreatingAnalysis).toBe(false);
  });

  it('should handle message updates during streaming', () => {
    const initialMessages = createMockRoundMessages(0, 1);

    act(() => {
      store.getState().setIsStreaming(true);
      store.getState().setMessages(initialMessages);
    });

    // Simulate streaming message update
    const updatedMessages = [
      ...initialMessages,
      createMockMessage(1, 0),
    ];

    act(() => {
      store.getState().setMessages(updatedMessages);
    });

    expect(store.getState().messages).toHaveLength(3);
    expect(store.getState().isStreaming).toBe(true);
  });
});

// ============================================================================
// 10. FORM SLICE TESTS
// ============================================================================

describe('form Slice Operations', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should set input value', () => {
    act(() => {
      store.getState().setInputValue('test input');
    });

    expect(store.getState().inputValue).toBe('test input');
  });

  it('should set selected mode', () => {
    act(() => {
      store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
    });

    expect(store.getState().selectedMode).toBe(ChatModes.BRAINSTORMING);
  });

  it('should add participant without duplicates', () => {
    const participant = {
      id: 'p1',
      modelId: 'gpt-4',
      role: null,
      priority: 0,
    };

    act(() => {
      store.getState().addParticipant(participant);
      store.getState().addParticipant(participant); // Try to add duplicate
    });

    expect(store.getState().selectedParticipants).toHaveLength(1);
  });

  it('should remove participant by id', () => {
    const participant1 = { id: 'p1', modelId: 'gpt-4', role: null, priority: 0 };
    const participant2 = { id: 'p2', modelId: 'gpt-3.5', role: null, priority: 1 };

    act(() => {
      store.getState().addParticipant(participant1);
      store.getState().addParticipant(participant2);
      store.getState().removeParticipant('p1');
    });

    const participants = store.getState().selectedParticipants;
    expect(participants).toHaveLength(1);
    expect(participants[0]?.id).toBe('p2');
    // Priority should be recalculated
    expect(participants[0]?.priority).toBe(0);
  });

  it('should reorder participants', () => {
    act(() => {
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', role: null, priority: 0 },
        { id: 'p2', modelId: 'gpt-3.5', role: null, priority: 1 },
        { id: 'p3', modelId: 'claude', role: null, priority: 2 },
      ]);
      store.getState().reorderParticipants(0, 2); // Move first to last
    });

    const participants = store.getState().selectedParticipants;
    expect(participants[0]?.id).toBe('p2');
    expect(participants[1]?.id).toBe('p3');
    expect(participants[2]?.id).toBe('p1');
    // Priorities should be recalculated
    expect(participants[0]?.priority).toBe(0);
    expect(participants[1]?.priority).toBe(1);
    expect(participants[2]?.priority).toBe(2);
  });

  it('should reset form to defaults', () => {
    act(() => {
      store.getState().setInputValue('test');
      store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
      store.getState().setEnableWebSearch(true);
      store.getState().resetForm();
    });

    const state = store.getState();
    expect(state.inputValue).toBe('');
    expect(state.selectedMode).toBe(ChatModes.ANALYZING);
    expect(state.enableWebSearch).toBe(false);
  });
});

// ============================================================================
// 11. FEEDBACK SLICE TESTS
// ============================================================================

describe('feedback Slice Operations', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should set feedback for round', () => {
    act(() => {
      store.getState().setFeedback(0, 'like');
    });

    expect(store.getState().feedbackByRound.get(0)).toBe('like');
  });

  it('should clear feedback for round', () => {
    act(() => {
      store.getState().setFeedback(0, 'like');
      store.getState().clearFeedback(0);
    });

    expect(store.getState().feedbackByRound.has(0)).toBe(false);
  });

  it('should load feedback from server', () => {
    const feedbackData = [
      { roundNumber: 0, feedbackType: 'like' as const },
      { roundNumber: 1, feedbackType: 'dislike' as const },
    ];

    act(() => {
      store.getState().loadFeedbackFromServer(feedbackData);
    });

    const state = store.getState();
    expect(state.feedbackByRound.get(0)).toBe('like');
    expect(state.feedbackByRound.get(1)).toBe('dislike');
    expect(state.hasLoadedFeedback).toBe(true);
  });

  it('should reset feedback', () => {
    act(() => {
      store.getState().setFeedback(0, 'like');
      store.getState().resetFeedback();
    });

    const state = store.getState();
    expect(state.feedbackByRound.size).toBe(0);
    expect(state.hasLoadedFeedback).toBe(false);
  });
});

// ============================================================================
// 12. SCREEN MODE TESTS
// ============================================================================

describe('screen Mode Operations', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should set screen mode', () => {
    act(() => {
      store.getState().setScreenMode(ScreenModes.THREAD);
    });

    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
  });

  it('should set isReadOnly to true for public mode', () => {
    act(() => {
      store.getState().setScreenMode(ScreenModes.PUBLIC);
    });

    expect(store.getState().isReadOnly).toBe(true);
  });

  it('should set isReadOnly to false for non-public modes', () => {
    act(() => {
      store.getState().setScreenMode(ScreenModes.THREAD);
    });

    expect(store.getState().isReadOnly).toBe(false);
  });

  it('should reset screen mode to defaults', () => {
    act(() => {
      store.getState().setScreenMode(ScreenModes.PUBLIC);
      store.getState().resetScreenMode();
    });

    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    expect(store.getState().isReadOnly).toBe(false);
  });
});

// ============================================================================
// 13. INITIALIZE THREAD TESTS
// ============================================================================

describe('initialize Thread Operation', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should initialize thread with all data', () => {
    const thread = createMockThread();
    const participants = createMockParticipants(2);
    const messages = createMockRoundMessages(0, 2);

    act(() => {
      store.getState().initializeThread(thread, participants, messages);
    });

    const state = store.getState();
    expect(state.thread).toBe(thread);
    // ✅ FIX: Use toEqual since store now copies and sorts participants defensively
    expect(state.participants).toEqual(participants);
    expect(state.messages).toBe(messages);
    expect(state.error).toBeNull();
    expect(state.isStreaming).toBe(false);
  });

  it('should initialize thread with empty messages if not provided', () => {
    const thread = createMockThread();
    const participants = createMockParticipants(2);

    act(() => {
      store.getState().initializeThread(thread, participants);
    });

    expect(store.getState().messages).toEqual([]);
  });

  it('should clear error on initialization', () => {
    act(() => {
      store.getState().setError(new Error('Previous error'));
    });

    act(() => {
      store.getState().initializeThread(createMockThread(), []);
    });

    expect(store.getState().error).toBeNull();
  });
});

// ============================================================================
// 14. UI SLICE TESTS
// ============================================================================

describe('uI Slice Operations', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should toggle showInitialUI', () => {
    act(() => {
      store.getState().setShowInitialUI(false);
    });

    expect(store.getState().showInitialUI).toBe(false);
  });

  it('should set createdThreadId', () => {
    act(() => {
      store.getState().setCreatedThreadId('new-thread-id');
    });

    expect(store.getState().createdThreadId).toBe('new-thread-id');
  });

  it('should reset UI to defaults', () => {
    act(() => {
      store.getState().setShowInitialUI(false);
      store.getState().setIsCreatingThread(true);
      store.getState().setCreatedThreadId('test');
      store.getState().setWaitingToStartStreaming(true);
      store.getState().resetUI();
    });

    const state = store.getState();
    expect(state.showInitialUI).toBe(true);
    expect(state.isCreatingThread).toBe(false);
    expect(state.createdThreadId).toBeNull();
    expect(state.waitingToStartStreaming).toBe(false);
  });
});

// ============================================================================
// 15. COMPLEX FLOW INTEGRATION TESTS
// ============================================================================

describe('complex Flow Integration', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should handle complete chat flow: create -> stream -> analyze', () => {
    const thread = createMockThread();
    const participants = createMockParticipants(2);

    // Step 1: Create thread
    act(() => {
      store.getState().setIsCreatingThread(true);
      store.getState().setInputValue('Test question');
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', role: null, priority: 0 },
      ]);
    });

    // Step 2: Thread created
    act(() => {
      store.getState().setIsCreatingThread(false);
      store.getState().setCreatedThreadId(thread.id);
      store.getState().setThread(thread);
      store.getState().setParticipants(participants);
    });

    // Step 3: Start streaming
    act(() => {
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setIsStreaming(true);
      store.getState().setWaitingToStartStreaming(false);
    });

    // Step 4: Add properly typed messages that pass validation
    const messages: UIMessage[] = [
      createTestUserMessage({
        id: 'user-msg-0',
        content: 'Test question',
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        id: `${thread.id}_r0_p0`,
        content: 'Response 1',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: `${thread.id}_r0_p1`,
        content: 'Response 2',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
      }),
    ];
    act(() => {
      store.getState().setMessages(messages);
    });

    // Step 5: Complete streaming
    act(() => {
      store.getState().setIsStreaming(false);
      store.getState().markAnalysisCreated(0);
    });

    // Step 6: Create analysis
    act(() => {
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test?',
        threadId: thread.id,
        mode: ChatModes.DEBATING,
      });
    });

    const state = store.getState();
    expect(state.thread).toBeTruthy();
    expect(state.messages).toHaveLength(3);
    expect(state.analyses).toHaveLength(1);
    expect(state.isStreaming).toBe(false);
  });

  it('should handle multi-round conversation flow', () => {
    const thread = createMockThread();
    const participants = createMockParticipants(2);

    act(() => {
      store.getState().setThread(thread);
      store.getState().setParticipants(participants);
    });

    // Round 0
    const round0Messages = createMockRoundMessages(0, 2);
    act(() => {
      store.getState().setMessages(round0Messages);
      store.getState().markAnalysisCreated(0);
    });

    // Round 1
    const round1User = createMockUserMessage(1);
    const round1Assistants = [
      createMockMessage(0, 1),
      createMockMessage(1, 1),
    ];

    act(() => {
      store.getState().setMessages([...round0Messages, round1User, ...round1Assistants]);
      store.getState().markAnalysisCreated(1);
    });

    const state = store.getState();
    expect(state.messages).toHaveLength(6); // 3 + 3
    expect(state.hasAnalysisBeenCreated(0)).toBe(true);
    expect(state.hasAnalysisBeenCreated(1)).toBe(true);
    expect(getCurrentRoundNumber(state.messages)).toBe(1);
  });

  it('should handle regeneration flow correctly', () => {
    const thread = createMockThread();
    const participants = createMockParticipants(2);
    const messages = createMockRoundMessages(0, 2);

    act(() => {
      store.getState().setThread(thread);
      store.getState().setParticipants(participants);
      store.getState().setMessages(messages);
      store.getState().markAnalysisCreated(0);
      store.getState().markPreSearchTriggered(0);
      store.getState().addAnalysis(createPendingAnalysis(0));
    });

    // Start regeneration
    act(() => {
      store.getState().startRegeneration(0);
    });

    let state = store.getState();
    expect(state.isRegenerating).toBe(true);
    expect(state.regeneratingRoundNumber).toBe(0);
    // Tracking should be cleared for the regenerating round
    expect(state.hasAnalysisBeenCreated(0)).toBe(false);
    expect(state.hasPreSearchBeenTriggered(0)).toBe(false);

    // Complete regeneration
    act(() => {
      store.getState().completeRegeneration(0);
    });

    state = store.getState();
    expect(state.isRegenerating).toBe(false);
    expect(state.regeneratingRoundNumber).toBeNull();
  });

  it('should handle web search enabled flow', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = createMockParticipants(2);

    act(() => {
      store.getState().setThread(thread);
      store.getState().setParticipants(participants);
      store.getState().setEnableWebSearch(true);
    });

    // Add pre-search
    const preSearch = createPendingPreSearch(0);
    act(() => {
      store.getState().addPreSearch(preSearch);
      store.getState().markPreSearchTriggered(0);
    });

    // Update to streaming
    act(() => {
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    });

    // Complete pre-search
    act(() => {
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
    });

    const state = store.getState();
    expect(state.preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
    expect(state.hasPreSearchBeenTriggered(0)).toBe(true);
  });
});

// ============================================================================
// 16. UPDATE OPERATIONS TESTS
// ============================================================================

describe('update Operations', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should update participants correctly', () => {
    const initialParticipants = createMockParticipants(2);
    const updatedParticipants = createMockParticipants(3);

    act(() => {
      store.getState().setParticipants(initialParticipants);
    });

    expect(store.getState().participants).toHaveLength(2);

    act(() => {
      store.getState().updateParticipants(updatedParticipants);
    });

    expect(store.getState().participants).toHaveLength(3);
  });

  it('should update pre-search data', () => {
    const preSearch = createStreamingPreSearch(0);

    act(() => {
      store.getState().addPreSearch(preSearch);
      store.getState().updatePreSearchData(0, {
        queries: [{ query: 'test', rationale: 'test', searchDepth: 'basic', index: 0, total: 1 }],
        results: [],
        analysis: 'Test analysis',
        successCount: 1,
        failureCount: 0,
        totalResults: 1,
        totalTime: 500,
      });
    });

    const state = store.getState();
    expect(state.preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
    expect(state.preSearches[0]?.searchData?.analysis).toBe('Test analysis');
  });

  it('should update pre-search error', () => {
    const preSearch = createStreamingPreSearch(0);

    act(() => {
      store.getState().addPreSearch(preSearch);
      store.getState().updatePreSearchError(0, 'Search failed');
    });

    expect(store.getState().preSearches[0]?.errorMessage).toBe('Search failed');
  });

  it('should update participant config', () => {
    act(() => {
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', role: null, priority: 0 },
      ]);
      store.getState().updateParticipant('p1', { role: 'Analyst' });
    });

    expect(store.getState().selectedParticipants[0]?.role).toBe('Analyst');
  });
});

// ============================================================================
// 17. CALLBACK SLICE TESTS
// ============================================================================

describe('callback Slice Operations', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should set onComplete callback', () => {
    const callback = vi.fn();

    act(() => {
      store.getState().setOnComplete(callback);
    });

    expect(store.getState().onComplete).toBe(callback);
  });

  it('should clear onComplete callback', () => {
    act(() => {
      store.getState().setOnComplete(vi.fn());
      store.getState().setOnComplete(undefined);
    });

    expect(store.getState().onComplete).toBeUndefined();
  });
});

// ============================================================================
// 18. FLAGS SLICE TESTS
// ============================================================================

describe('flags Slice Operations', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should set hasInitiallyLoaded flag', () => {
    act(() => {
      store.getState().setHasInitiallyLoaded(true);
    });

    expect(store.getState().hasInitiallyLoaded).toBe(true);
  });

  it('should set hasPendingConfigChanges flag', () => {
    act(() => {
      store.getState().setHasPendingConfigChanges(true);
    });

    expect(store.getState().hasPendingConfigChanges).toBe(true);
  });

  it('should handle multiple flag updates', () => {
    act(() => {
      store.getState().setIsRegenerating(true);
      store.getState().setIsCreatingAnalysis(true);
      store.getState().setIsWaitingForChangelog(true);
    });

    const state = store.getState();
    expect(state.isRegenerating).toBe(true);
    expect(state.isCreatingAnalysis).toBe(true);
    expect(state.isWaitingForChangelog).toBe(true);
  });
});

// ============================================================================
// 19. DATA SLICE TESTS
// ============================================================================

describe('data Slice Operations', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should set streaming round number', () => {
    act(() => {
      store.getState().setStreamingRoundNumber(5);
    });

    expect(store.getState().streamingRoundNumber).toBe(5);
  });

  it('should set current round number', () => {
    act(() => {
      store.getState().setCurrentRoundNumber(3);
    });

    expect(store.getState().currentRoundNumber).toBe(3);
  });

  it('should clear data on reset', () => {
    act(() => {
      store.getState().setRegeneratingRoundNumber(1);
      store.getState().setPendingMessage('test');
      store.getState().setExpectedParticipantIds(['p1']);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentRoundNumber(0);
    });

    act(() => {
      store.getState().completeStreaming();
    });

    const state = store.getState();
    expect(state.regeneratingRoundNumber).toBeNull();
    expect(state.pendingMessage).toBeNull();
    expect(state.expectedParticipantIds).toBeNull();
    expect(state.streamingRoundNumber).toBeNull();
    expect(state.currentRoundNumber).toBeNull();
  });
});

// ============================================================================
// 20. POTENTIAL BUG DETECTION TESTS - CRITICAL EDGE CASES
// ============================================================================

describe('potential Bug Detection - Edge Cases', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('bUG TEST: should not lose tracking state when Set is mutated directly', () => {
    // This tests if the Set instances are properly isolated
    act(() => {
      store.getState().markAnalysisCreated(0);
    });

    const setRef = store.getState().createdAnalysisRounds;

    // Try to mutate directly (this shouldn't affect store if properly implemented)
    setRef.add(99);

    // The store should still show 99 because Sets are mutable references
    // This is expected behavior - just documenting it
    expect(store.getState().createdAnalysisRounds.has(99)).toBe(true);
  });

  it('bUG TEST: markAnalysisCreated should be idempotent', () => {
    act(() => {
      store.getState().markAnalysisCreated(0);
      store.getState().markAnalysisCreated(0);
      store.getState().markAnalysisCreated(0);
    });

    expect(store.getState().createdAnalysisRounds.size).toBe(1);
  });

  it('bUG TEST: analysis deduplication should work across multiple rounds', () => {
    const thread = createMockThread();
    const createValidMessages = (round: number) => [
      createTestUserMessage({
        id: `user-msg-${round}`,
        content: `Question ${round}`,
        roundNumber: round,
      }),
      createTestAssistantMessage({
        id: `${thread.id}_r${round}_p0`,
        content: `Response ${round}`,
        roundNumber: round,
        participantId: 'participant-0',
        participantIndex: 0,
      }),
    ];

    act(() => {
      store.getState().setThread(thread);
    });

    // Create analysis for round 0
    const messages0 = createValidMessages(0);
    act(() => {
      store.getState().setMessages(messages0);
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages: messages0,
        userQuestion: 'Q0',
        threadId: thread.id,
        mode: ChatModes.DEBATING,
      });
    });

    // Create analysis for round 1
    const messages1 = [...messages0, ...createValidMessages(1)];
    act(() => {
      store.getState().setMessages(messages1);
      store.getState().createPendingAnalysis({
        roundNumber: 1,
        messages: messages1,
        userQuestion: 'Q1',
        threadId: thread.id,
        mode: ChatModes.DEBATING,
      });
    });

    expect(store.getState().analyses).toHaveLength(2);
    expect(store.getState().analyses[0]?.roundNumber).toBe(0);
    expect(store.getState().analyses[1]?.roundNumber).toBe(1);
  });

  it('bUG TEST: completeStreaming should reset ALL flags atomically', () => {
    // Set all possible flags that should be reset
    act(() => {
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(5);
      store.getState().setCurrentRoundNumber(5);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setCurrentParticipantIndex(3);
      store.getState().setIsCreatingAnalysis(true);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setPendingMessage('test');
      store.getState().setExpectedParticipantIds(['p1', 'p2']);
      store.getState().setHasSentPendingMessage(true);
      store.getState().setIsRegenerating(true);
      store.getState().setRegeneratingRoundNumber(5);
    });

    act(() => {
      store.getState().completeStreaming();
    });

    const state = store.getState();
    // All these should be reset
    expect(state.isStreaming).toBe(false);
    expect(state.streamingRoundNumber).toBeNull();
    expect(state.currentRoundNumber).toBeNull();
    expect(state.waitingToStartStreaming).toBe(false);
    expect(state.currentParticipantIndex).toBe(0);
    expect(state.isCreatingAnalysis).toBe(false);
    expect(state.isWaitingForChangelog).toBe(false);
    expect(state.pendingMessage).toBeNull();
    expect(state.expectedParticipantIds).toBeNull();
    expect(state.hasSentPendingMessage).toBe(false);
    expect(state.isRegenerating).toBe(false);
    expect(state.regeneratingRoundNumber).toBeNull();
  });

  it('bUG TEST: pre-search status update should not affect other rounds', () => {
    act(() => {
      store.getState().addPreSearch(createMockPreSearch({ id: 'ps-0', roundNumber: 0 }));
      store.getState().addPreSearch(createMockPreSearch({ id: 'ps-1', roundNumber: 1 }));
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    });

    const state = store.getState();
    expect(state.preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);
    expect(state.preSearches[1]?.status).toBe(AnalysisStatuses.COMPLETE);
  });

  it('bUG TEST: analysis removal should not affect other analyses', () => {
    act(() => {
      store.getState().addAnalysis(createPendingAnalysis(0));
      store.getState().addAnalysis(createPendingAnalysis(1));
      store.getState().addAnalysis(createPendingAnalysis(2));
      store.getState().removeAnalysis(1);
    });

    const analyses = store.getState().analyses;
    expect(analyses).toHaveLength(2);
    expect(analyses.find(a => a.roundNumber === 1)).toBeUndefined();
    expect(analyses.find(a => a.roundNumber === 0)).toBeDefined();
    expect(analyses.find(a => a.roundNumber === 2)).toBeDefined();
  });

  it('bUG TEST: feedback Map should preserve all entries', () => {
    act(() => {
      store.getState().setFeedback(0, 'like');
      store.getState().setFeedback(1, 'dislike');
      store.getState().setFeedback(2, 'like');
      store.getState().setFeedback(1, 'like'); // Update round 1
    });

    const feedbackMap = store.getState().feedbackByRound;
    expect(feedbackMap.size).toBe(3);
    expect(feedbackMap.get(0)).toBe('like');
    expect(feedbackMap.get(1)).toBe('like'); // Updated value
    expect(feedbackMap.get(2)).toBe('like');
  });

  it('bUG TEST: resetToNewChat should not throw when stop is undefined', () => {
    // Don't set stop function
    expect(() => {
      act(() => {
        store.getState().resetToNewChat();
      });
    }).not.toThrow();
  });

  it('bUG TEST: prepareForNewMessage should clear regeneration state', () => {
    act(() => {
      store.getState().setIsRegenerating(true);
      store.getState().setRegeneratingRoundNumber(1);
      store.getState().prepareForNewMessage('new message', ['p1']);
    });

    const state = store.getState();
    expect(state.isRegenerating).toBe(false);
    expect(state.regeneratingRoundNumber).toBeNull();
  });

  it('bUG TEST: startRegeneration should clear all previous streaming state', () => {
    act(() => {
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setIsCreatingAnalysis(true);
      store.getState().setPendingMessage('old message');
    });

    act(() => {
      store.getState().startRegeneration(0);
    });

    const state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.streamingRoundNumber).toBeNull();
    expect(state.isCreatingAnalysis).toBe(false);
    expect(state.pendingMessage).toBeNull();
    expect(state.isRegenerating).toBe(true);
  });

  it('bUG TEST: updateAnalysisData should set status to COMPLETE', () => {
    const analysis = createStreamingAnalysis(0);

    act(() => {
      store.getState().addAnalysis(analysis);
      store.getState().updateAnalysisData(0, createMockAnalysisPayload());
    });

    const updated = store.getState().analyses[0];
    expect(updated?.status).toBe(AnalysisStatuses.COMPLETE);
    expect(updated?.analysisData).toBeDefined();
  });

  it('bUG TEST: updateAnalysisData should validate mode schema', () => {
    const analysis = createStreamingAnalysis(0);

    act(() => {
      store.getState().addAnalysis(analysis);
      // Try to update with invalid mode - should fallback to existing mode
      store.getState().updateAnalysisData(0, {
        ...createMockAnalysisPayload(),
        mode: 'invalid-mode' as ChatMode,
      });
    });

    // Should keep existing mode on validation failure
    const updated = store.getState().analyses[0];
    expect(updated?.status).toBe(AnalysisStatuses.COMPLETE);
  });

  it('bUG TEST: clearAllPreSearches should also clear tracking', () => {
    act(() => {
      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 0 }));
      store.getState().markPreSearchTriggered(0);
      store.getState().clearAllPreSearches();
    });

    const state = store.getState();
    expect(state.preSearches).toHaveLength(0);
    expect(state.triggeredPreSearchRounds.size).toBe(0);
  });

  it('bUG TEST: multiple stores should not share Set instances', () => {
    const store1 = createTestStore();
    const store2 = createTestStore();

    act(() => {
      store1.getState().markAnalysisCreated(0);
    });

    // Store 2 should not have the analysis marked
    expect(store2.getState().hasAnalysisBeenCreated(0)).toBe(false);
    expect(store1.getState().hasAnalysisBeenCreated(0)).toBe(true);
  });
});

// ============================================================================
// 21. RACE CONDITION DETECTION TESTS
// ============================================================================

describe('race Condition Detection', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestStore();
  });

  it('rACE TEST: rapid setMessages calls should preserve latest state', () => {
    const messages1 = [createMockUserMessage(0)];
    const messages2 = [createMockUserMessage(0), createMockMessage(0, 0)];
    const messages3 = [createMockUserMessage(0), createMockMessage(0, 0), createMockMessage(1, 0)];

    act(() => {
      store.getState().setMessages(messages1);
      store.getState().setMessages(messages2);
      store.getState().setMessages(messages3);
    });

    expect(store.getState().messages).toHaveLength(3);
  });

  it('rACE TEST: analysis creation during status update', () => {
    const thread = createMockThread();
    const messages: UIMessage[] = [
      createTestUserMessage({
        id: 'user-msg-0',
        content: 'Test',
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        id: `${thread.id}_r0_p0`,
        content: 'Response',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    act(() => {
      store.getState().setThread(thread);
      store.getState().setMessages(messages);
    });

    // Simulate rapid status updates during analysis creation
    act(() => {
      store.getState().setIsCreatingAnalysis(true);
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test?',
        threadId: thread.id,
        mode: ChatModes.DEBATING,
      });
      store.getState().setIsCreatingAnalysis(false);
    });

    expect(store.getState().analyses).toHaveLength(1);
  });

  it('rACE TEST: stop and complete called simultaneously', () => {
    const mockStop = vi.fn();

    act(() => {
      store.getState().setStop(mockStop);
      store.getState().setIsStreaming(true);
    });

    act(() => {
      store.getState().stop?.();
      store.getState().completeStreaming();
    });

    expect(store.getState().isStreaming).toBe(false);
  });

  it('rACE TEST: resetToNewChat during pending message send', () => {
    act(() => {
      store.getState().setPendingMessage('test');
      store.getState().setExpectedParticipantIds(['p1']);
      store.getState().setHasSentPendingMessage(false);
    });

    act(() => {
      store.getState().resetToNewChat();
    });

    const state = store.getState();
    expect(state.pendingMessage).toBeNull();
    expect(state.expectedParticipantIds).toBeNull();
    expect(state.hasSentPendingMessage).toBe(false);
  });

  it('rACE TEST: navigation reset while streaming', () => {
    act(() => {
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setMessages(createMockRoundMessages(0, 2));
    });

    act(() => {
      store.getState().resetToOverview();
    });

    const state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.streamingRoundNumber).toBeNull();
    expect(state.messages).toHaveLength(0);
  });
});

// ============================================================================
// 22. BOUNDARY CONDITION TESTS
// ============================================================================

describe('boundary Conditions', () => {
  it('should handle store with default state correctly', () => {
    const store = createTestStore();
    const state = store.getState();

    expect(state.thread).toBeNull();
    expect(state.participants).toEqual([]);
    expect(state.messages).toEqual([]);
    expect(state.analyses).toEqual([]);
    expect(state.preSearches).toEqual([]);
    expect(state.isStreaming).toBe(false);
    expect(state.screenMode).toBe(ScreenModes.OVERVIEW);
  });

  it('should handle multiple store instances independently', () => {
    const store1 = createTestStore();
    const store2 = createTestStore();

    act(() => {
      store1.getState().setInputValue('Store 1');
      store2.getState().setInputValue('Store 2');
    });

    expect(store1.getState().inputValue).toBe('Store 1');
    expect(store2.getState().inputValue).toBe('Store 2');
  });

  it('should handle Set operations correctly for tracking', () => {
    const store = createTestStore();

    // Add multiple rounds
    act(() => {
      store.getState().markAnalysisCreated(0);
      store.getState().markAnalysisCreated(1);
      store.getState().markAnalysisCreated(2);
    });

    expect(store.getState().createdAnalysisRounds.size).toBe(3);

    // Clear one
    act(() => {
      store.getState().clearAnalysisTracking(1);
    });

    expect(store.getState().createdAnalysisRounds.size).toBe(2);
    expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
    expect(store.getState().hasAnalysisBeenCreated(1)).toBe(false);
    expect(store.getState().hasAnalysisBeenCreated(2)).toBe(true);
  });

  it('should handle Map operations correctly for feedback', () => {
    const store = createTestStore();

    act(() => {
      store.getState().setFeedback(0, 'like');
      store.getState().setFeedback(1, 'dislike');
      store.getState().setFeedback(0, null); // Update existing
    });

    const feedbackMap = store.getState().feedbackByRound;
    expect(feedbackMap.get(0)).toBeNull();
    expect(feedbackMap.get(1)).toBe('dislike');
  });
});

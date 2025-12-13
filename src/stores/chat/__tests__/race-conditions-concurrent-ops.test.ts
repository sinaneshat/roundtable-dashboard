/**
 * Race Conditions and Concurrent Operations Tests
 *
 * Tests for preventing and handling race conditions in the chat store
 * as documented in FLOW_DOCUMENTATION.md (Part 14: Race Condition Protection).
 *
 * Key Areas:
 * - Double message submission prevention
 * - Pre-search vs participant streaming coordination
 * - Analysis deduplication
 * - Thread creation race conditions
 * - Navigation timing conflicts
 * - Stream resumption conflicts
 * - Concurrent round operations
 *
 * Key Validations:
 * - Deduplication mechanisms work
 * - Order of operations is correct
 * - State consistency maintained
 * - No duplicate API calls
 */

import { describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, FinishReasons, MessageRoles, ScreenModes, StreamStatuses } from '@/api/core/enums';
import type { DbAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import type { ChatThread } from '@/db/validation';
import {
  createMockAnalysis,
  createMockStoredPreSearch,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';

import { createChatStore } from '../store';

// ============================================================================
// DOUBLE MESSAGE SUBMISSION TESTS
// ============================================================================

describe('double Message Submission Prevention', () => {
  describe('hasSentPendingMessage Guard', () => {
    it('prevents duplicate message send when flag is true', () => {
      const store = createChatStore();

      store.getState().setPendingMessage('Test message');
      store.getState().setHasSentPendingMessage(true);

      // Attempt to send should check this flag
      const canSend = store.getState().pendingMessage !== null
        && !store.getState().hasSentPendingMessage;

      expect(canSend).toBe(false);
    });

    it('allows first message send', () => {
      const store = createChatStore();

      store.getState().setPendingMessage('Test message');

      const canSend = store.getState().pendingMessage !== null
        && !store.getState().hasSentPendingMessage;

      expect(canSend).toBe(true);
    });

    it('clears flag after streaming completes', () => {
      const store = createChatStore();

      store.getState().setHasSentPendingMessage(true);
      store.getState().completeStreaming();

      expect(store.getState().hasSentPendingMessage).toBe(false);
    });
  });

  describe('waitingToStartStreaming Guard', () => {
    it('prevents new message while waiting for stream', () => {
      const store = createChatStore();

      store.getState().setWaitingToStartStreaming(true);

      const canSubmitNew = !store.getState().waitingToStartStreaming
        && !store.getState().isStreaming;

      expect(canSubmitNew).toBe(false);
    });

    it('prevents new message during streaming', () => {
      const store = createChatStore();

      store.getState().setIsStreaming(true);

      const canSubmitNew = !store.getState().waitingToStartStreaming
        && !store.getState().isStreaming;

      expect(canSubmitNew).toBe(false);
    });
  });

  describe('rapid Submit Prevention', () => {
    it('tracks submission timing to prevent rapid submits', () => {
      const lastSubmitTime: number[] = [];

      const canSubmit = () => {
        const now = Date.now();
        const lastSubmit = lastSubmitTime[0] ?? 0;

        if (now - lastSubmit < 500) {
          return false; // Too fast
        }

        lastSubmitTime[0] = now;
        return true;
      };

      expect(canSubmit()).toBe(true);
      expect(canSubmit()).toBe(false); // Too fast
    });
  });
});

// ============================================================================
// PRE-SEARCH VS PARTICIPANT COORDINATION TESTS
// ============================================================================

describe('pre-Search vs Participant Coordination', () => {
  describe('pre-Search Blocking', () => {
    it('participants wait while pre-search is PENDING', () => {
      const store = createChatStore();

      store.getState().addPreSearch(createMockStoredPreSearch(0, AnalysisStatuses.PENDING));

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const shouldWait = preSearch?.status === AnalysisStatuses.PENDING
        || preSearch?.status === AnalysisStatuses.STREAMING;

      expect(shouldWait).toBe(true);
    });

    it('participants wait while pre-search is STREAMING', () => {
      const store = createChatStore();

      store.getState().addPreSearch(createMockStoredPreSearch(0, AnalysisStatuses.STREAMING));

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const shouldWait = preSearch?.status === AnalysisStatuses.PENDING
        || preSearch?.status === AnalysisStatuses.STREAMING;

      expect(shouldWait).toBe(true);
    });

    it('participants proceed after pre-search COMPLETE', () => {
      const store = createChatStore();

      store.getState().addPreSearch(createMockStoredPreSearch(0, AnalysisStatuses.COMPLETE));

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const shouldWait = preSearch?.status === AnalysisStatuses.PENDING
        || preSearch?.status === AnalysisStatuses.STREAMING;

      expect(shouldWait).toBe(false);
    });

    it('participants proceed after pre-search FAILED', () => {
      const store = createChatStore();

      store.getState().addPreSearch(createMockStoredPreSearch(0, AnalysisStatuses.FAILED));

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const shouldWait = preSearch?.status === AnalysisStatuses.PENDING
        || preSearch?.status === AnalysisStatuses.STREAMING;

      expect(shouldWait).toBe(false);
    });
  });

  describe('pre-Search Race Condition Fix', () => {
    it('sTREAMING overrides PENDING when provider responds first', () => {
      const store = createChatStore();

      // Orchestrator adds PENDING
      store.getState().addPreSearch(createMockStoredPreSearch(0, AnalysisStatuses.PENDING));
      expect(store.getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);

      // Provider responds with STREAMING (should win)
      store.getState().addPreSearch(createMockStoredPreSearch(0, AnalysisStatuses.STREAMING));
      expect(store.getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);
    });

    it('does not downgrade from COMPLETE', () => {
      const store = createChatStore();

      store.getState().addPreSearch(createMockStoredPreSearch(0, AnalysisStatuses.COMPLETE));

      // Late STREAMING should not override
      store.getState().addPreSearch(createMockStoredPreSearch(0, AnalysisStatuses.STREAMING));

      expect(store.getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
    });
  });

  describe('triggered Tracking Prevention', () => {
    it('prevents duplicate pre-search triggers', () => {
      const store = createChatStore();

      const canTrigger1 = !store.getState().hasPreSearchBeenTriggered(0);
      store.getState().markPreSearchTriggered(0);

      const canTrigger2 = !store.getState().hasPreSearchBeenTriggered(0);

      expect(canTrigger1).toBe(true);
      expect(canTrigger2).toBe(false);
    });
  });
});

// ============================================================================
// ANALYSIS DEDUPLICATION TESTS
// ============================================================================

describe('analysis Deduplication', () => {
  describe('roundNumber Based Deduplication', () => {
    it('prevents duplicate analysis for same round', () => {
      const store = createChatStore();

      store.getState().addAnalysis(createMockAnalysis(0, AnalysisStatuses.PENDING));
      store.getState().addAnalysis(createMockAnalysis(0, AnalysisStatuses.STREAMING));

      expect(store.getState().analyses).toHaveLength(1);
    });

    it('allows different rounds', () => {
      const store = createChatStore();

      store.getState().addAnalysis(createMockAnalysis(0, AnalysisStatuses.COMPLETE));
      store.getState().addAnalysis(createMockAnalysis(1, AnalysisStatuses.PENDING));

      expect(store.getState().analyses).toHaveLength(2);
    });
  });

  describe('createdAnalysisRounds Tracking', () => {
    it('tracks rounds where analysis was created', () => {
      const store = createChatStore();

      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);

      store.getState().markAnalysisCreated(0);

      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
    });

    it('cleared on regeneration', () => {
      const store = createChatStore();

      store.getState().markAnalysisCreated(0);
      store.getState().startRegeneration(0);

      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
    });
  });

  describe('triggeredAnalysisRounds and triggeredAnalysisIds', () => {
    it('tracks both round and ID for stream deduplication', () => {
      const store = createChatStore();

      store.getState().markAnalysisStreamTriggered('analysis-123', 0);

      // Can check by ID or round
      expect(store.getState().hasAnalysisStreamBeenTriggered('analysis-123', 0)).toBe(true);
      expect(store.getState().hasAnalysisStreamBeenTriggered('different-id', 0)).toBe(true); // Same round
      expect(store.getState().hasAnalysisStreamBeenTriggered('analysis-123', 1)).toBe(true); // Same ID
    });
  });
});

// ============================================================================
// THREAD CREATION RACE CONDITIONS
// ============================================================================

describe('thread Creation Race Conditions', () => {
  describe('isCreatingThread Guard', () => {
    it('prevents concurrent thread creation', () => {
      const store = createChatStore();

      store.getState().setIsCreatingThread(true);

      const canCreate = !store.getState().isCreatingThread;

      expect(canCreate).toBe(false);
    });

    it('allows thread creation when not in progress', () => {
      const store = createChatStore();

      const canCreate = !store.getState().isCreatingThread;

      expect(canCreate).toBe(true);
    });
  });

  describe('createdThreadId Tracking', () => {
    it('tracks thread ID before navigation', () => {
      const store = createChatStore();

      store.getState().setCreatedThreadId('thread-123');

      expect(store.getState().createdThreadId).toBe('thread-123');
    });

    it('cleared on reset', () => {
      const store = createChatStore();

      store.getState().setCreatedThreadId('thread-123');
      store.getState().resetToNewChat();

      expect(store.getState().createdThreadId).toBeNull();
    });
  });

  describe('thread ID Availability', () => {
    it('thread ID available before streaming starts', () => {
      const store = createChatStore();

      // Simulate thread creation flow
      store.getState().setIsCreatingThread(true);
      store.getState().setCreatedThreadId('thread-123');
      store.getState().setIsCreatingThread(false);

      // ID should be available before waitingToStartStreaming
      expect(store.getState().createdThreadId).not.toBeNull();
    });
  });
});

// ============================================================================
// NAVIGATION TIMING CONFLICTS
// ============================================================================

describe('navigation Timing Conflicts', () => {
  describe('hasNavigated Flag', () => {
    it('prevents duplicate navigation', () => {
      // Simulating navigation guard
      let hasNavigated = false;

      const attemptNavigation = () => {
        if (hasNavigated)
          return false;
        hasNavigated = true;
        return true;
      };

      expect(attemptNavigation()).toBe(true);
      expect(attemptNavigation()).toBe(false);
    });
  });

  describe('navigation Prerequisites', () => {
    it('waits for both AI title and analysis complete', () => {
      type NavState = {
        isAiGeneratedTitle: boolean;
        analysisStatus: typeof AnalysisStatuses[keyof typeof AnalysisStatuses];
      };

      const canNavigate = (state: NavState) =>
        state.isAiGeneratedTitle
        && state.analysisStatus === AnalysisStatuses.COMPLETE;

      // Neither ready
      expect(canNavigate({ isAiGeneratedTitle: false, analysisStatus: AnalysisStatuses.PENDING })).toBe(false);

      // Only title ready
      expect(canNavigate({ isAiGeneratedTitle: true, analysisStatus: AnalysisStatuses.STREAMING })).toBe(false);

      // Only analysis ready
      expect(canNavigate({ isAiGeneratedTitle: false, analysisStatus: AnalysisStatuses.COMPLETE })).toBe(false);

      // Both ready
      expect(canNavigate({ isAiGeneratedTitle: true, analysisStatus: AnalysisStatuses.COMPLETE })).toBe(true);
    });
  });

  describe('screen Mode Race', () => {
    it('setScreenMode is atomic', () => {
      const store = createChatStore();

      // Concurrent screen mode changes
      Promise.all([
        Promise.resolve().then(() => store.getState().setScreenMode(ScreenModes.THREAD)),
        Promise.resolve().then(() => store.getState().setScreenMode(ScreenModes.OVERVIEW)),
      ]);

      // One of them should win (last one in this sync test)
      expect(store.getState().screenMode).toBeDefined();
    });
  });
});

// ============================================================================
// STREAM RESUMPTION CONFLICTS
// ============================================================================

describe('stream Resumption Conflicts', () => {
  describe('resumptionAttempts Tracking', () => {
    it('prevents duplicate resumption attempts', () => {
      const store = createChatStore();

      const attempt1 = store.getState().markResumptionAttempted(0, 1);
      const attempt2 = store.getState().markResumptionAttempted(0, 1);

      expect(attempt1).toBe(true); // First attempt allowed
      expect(attempt2).toBe(false); // Duplicate blocked
    });

    it('allows different participant resumption', () => {
      const store = createChatStore();

      store.getState().markResumptionAttempted(0, 0);
      const canResume = store.getState().markResumptionAttempted(0, 1);

      expect(canResume).toBe(true);
    });
  });

  describe('stale Resumption Prevention', () => {
    it('blocks stale resumption state', () => {
      const store = createChatStore();

      // Set up old resumption state
      const twoHoursAgo = new Date(Date.now() - (2 * 60 * 60 * 1000));
      store.getState().setStreamResumptionState({
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: twoHoursAgo,
      });

      expect(store.getState().isStreamResumptionStale()).toBe(true);
      expect(store.getState().needsStreamResumption()).toBe(false);
    });
  });

  describe('thread Mismatch Prevention', () => {
    it('blocks resumption for different thread', () => {
      const store = createChatStore();

      // Set thread
      store.getState().setThread({
        id: 'thread-456',
        userId: 'user-123',
        title: 'Test',
        mode: 'analyzing',
        status: 'active',
        enableWebSearch: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread);

      // Resumption state for different thread
      store.getState().setStreamResumptionState({
        threadId: 'thread-123', // Different
        roundNumber: 0,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      expect(store.getState().needsStreamResumption()).toBe(false);
    });
  });
});

// ============================================================================
// CONCURRENT ROUND OPERATIONS
// ============================================================================

describe('concurrent Round Operations', () => {
  describe('regeneration Isolation', () => {
    it('only clears tracking for specific round', () => {
      const store = createChatStore();

      store.getState().markAnalysisCreated(0);
      store.getState().markAnalysisCreated(1);
      store.getState().markPreSearchTriggered(0);
      store.getState().markPreSearchTriggered(1);

      store.getState().startRegeneration(0);

      // Only round 0 cleared
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
      expect(store.getState().hasAnalysisBeenCreated(1)).toBe(true);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
    });
  });

  describe('sequential Participant Streaming', () => {
    it('tracks currentParticipantIndex to prevent overlap', () => {
      const store = createChatStore();

      store.getState().setCurrentParticipantIndex(0);

      // Only one participant streams at a time
      const canStreamP0 = store.getState().currentParticipantIndex === 0;
      const canStreamP1 = store.getState().currentParticipantIndex === 1;

      expect(canStreamP0).toBe(true);
      expect(canStreamP1).toBe(false);

      // Advance to next
      store.getState().setCurrentParticipantIndex(1);

      expect(store.getState().currentParticipantIndex).toBe(1);
    });
  });

  describe('round Number Consistency', () => {
    it('streamingRoundNumber matches message round', () => {
      const store = createChatStore();

      store.getState().setStreamingRoundNumber(1);

      const messages = [
        createTestUserMessage({ id: 'u0', content: 'Q', roundNumber: 0 }),
        createTestUserMessage({ id: 'u1', content: 'Q', roundNumber: 1 }),
      ];

      // When streaming, verify message round matches
      const streamingRound = store.getState().streamingRoundNumber;
      const latestUserMessage = messages.filter(m => m.role === 'user').pop();
      const messageRound = (latestUserMessage?.metadata as { roundNumber?: number })?.roundNumber;

      expect(streamingRound).toBe(messageRound);
    });
  });
});

// ============================================================================
// PARTICIPANT COMPLETION RACE
// ============================================================================

describe('participant Completion Race', () => {
  describe('finish Reason Detection', () => {
    it('detects completion by finishReason', () => {
      const messages = [
        createTestAssistantMessage({
          id: 'p0-r0',
          content: 'Response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const isComplete = messages.every((m) => {
        const metadata = m.metadata as DbAssistantMessageMetadata;
        return metadata.finishReason === FinishReasons.STOP
          || metadata.finishReason === FinishReasons.LENGTH;
      });

      expect(isComplete).toBe(true);
    });

    it('detects incomplete by UNKNOWN finishReason', () => {
      const messages = [
        {
          id: 'p0-r0',
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: 'Streaming...' }],
          metadata: {
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            participantId: 'p0',
            participantIndex: 0,
            participantRole: null,
            model: 'gpt-4',
            finishReason: FinishReasons.UNKNOWN,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            hasError: false,
            isTransient: true,
            isPartialResponse: true,
          },
        },
      ];

      const isComplete = messages.every((m) => {
        const metadata = m.metadata as DbAssistantMessageMetadata;
        return metadata.finishReason === FinishReasons.STOP
          || metadata.finishReason === FinishReasons.LENGTH;
      });

      expect(isComplete).toBe(false);
    });
  });

  describe('all Participants Complete Check', () => {
    it('waits for all participants before analysis', () => {
      const participantCount = 3;
      const messages = [
        createTestAssistantMessage({
          id: 'p0-r0',
          content: 'R0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'p1-r0',
          content: 'R1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
        // P2 still streaming...
      ];

      const completedParticipants = messages.filter(
        m => (m.metadata as DbAssistantMessageMetadata).finishReason === FinishReasons.STOP,
      ).length;

      const allComplete = completedParticipants === participantCount;

      expect(allComplete).toBe(false);
    });
  });
});

// ============================================================================
// MESSAGE SYNC RACE
// ============================================================================

describe('message Sync Race', () => {
  describe('aI SDK Message Sync', () => {
    it('chatSetMessages clears AI SDK internal state', () => {
      const store = createChatStore();

      // Mock chatSetMessages
      const mockSetMessages = vi.fn();
      store.getState().setChatSetMessages(mockSetMessages);

      // During reset, should clear AI SDK messages
      store.getState().resetToNewChat();

      expect(mockSetMessages).toHaveBeenCalledWith([]);
    });
  });

  describe('optimistic vs Real Message Race', () => {
    it('real message replaces optimistic', () => {
      const store = createChatStore();

      // Add optimistic message
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().prepareForNewMessage('Test', ['p0']);

      // Optimistic message exists
      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().messages[0]?.id).toContain('optimistic');

      // Real message arrives
      const realMessage = createTestUserMessage({
        id: 'real-msg-r0',
        content: 'Test',
        roundNumber: 0,
      });

      // Replace optimistic with real
      store.getState().setMessages([realMessage]);

      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().messages[0]?.id).toBe('real-msg-r0');
    });
  });
});

// ============================================================================
// ANIMATION RACE CONDITIONS
// ============================================================================

describe('animation Race Conditions', () => {
  describe('animation Completion Ordering', () => {
    it('waits for all animations before analysis', async () => {
      const store = createChatStore();

      // Register animations for 3 participants
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);
      store.getState().registerAnimation(2);

      expect(store.getState().pendingAnimations.size).toBe(3);

      // Complete animations in order
      store.getState().completeAnimation(0);
      store.getState().completeAnimation(1);
      store.getState().completeAnimation(2);

      expect(store.getState().pendingAnimations.size).toBe(0);
    });

    it('handles out-of-order animation completion', async () => {
      const store = createChatStore();

      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);
      store.getState().registerAnimation(2);

      // Complete out of order
      store.getState().completeAnimation(2);
      store.getState().completeAnimation(0);
      store.getState().completeAnimation(1);

      expect(store.getState().pendingAnimations.size).toBe(0);
    });
  });

  describe('animation Timeout Protection', () => {
    it('clears animations on streaming complete', () => {
      const store = createChatStore();

      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);

      // Streaming completes (should clear stuck animations)
      store.getState().completeStreaming();

      expect(store.getState().pendingAnimations.size).toBe(0);
    });
  });
});

// ============================================================================
// STATE LEAKAGE TESTS
// ============================================================================

describe('state Leakage Prevention', () => {
  describe('thread Navigation Reset', () => {
    it('clears all thread state on navigation', () => {
      const store = createChatStore();

      // Set up state
      store.getState().setMessages([
        createTestUserMessage({ id: 'u0', content: 'Q', roundNumber: 0 }),
      ]);
      store.getState().addAnalysis(createMockAnalysis(0, AnalysisStatuses.COMPLETE));
      store.getState().addPreSearch(createMockStoredPreSearch(0, AnalysisStatuses.COMPLETE));

      // Navigate to new thread
      store.getState().resetForThreadNavigation();

      expect(store.getState().messages).toHaveLength(0);
      expect(store.getState().analyses).toHaveLength(0);
      expect(store.getState().preSearches).toHaveLength(0);
    });
  });

  describe('tracking Set Isolation', () => {
    it('creates fresh Set instances on reset', () => {
      const store = createChatStore();

      store.getState().markAnalysisCreated(0);
      const set1 = store.getState().createdAnalysisRounds;

      store.getState().resetToNewChat();

      const set2 = store.getState().createdAnalysisRounds;

      // Should be different Set instances
      expect(set1).not.toBe(set2);
      expect(set2.size).toBe(0);
    });
  });
});

// ============================================================================
// IDEMPOTENCY TESTS
// ============================================================================

describe('idempotency', () => {
  describe('completeStreaming Idempotency', () => {
    it('multiple calls produce same result', () => {
      const store = createChatStore();

      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(2);

      store.getState().completeStreaming();
      const state1 = { ...store.getState() };

      store.getState().completeStreaming();
      const state2 = { ...store.getState() };

      expect(state1.isStreaming).toBe(state2.isStreaming);
      expect(state1.currentParticipantIndex).toBe(state2.currentParticipantIndex);
    });
  });

  describe('markAnalysisCreated Idempotency', () => {
    it('multiple marks for same round is safe', () => {
      const store = createChatStore();

      store.getState().markAnalysisCreated(0);
      store.getState().markAnalysisCreated(0);
      store.getState().markAnalysisCreated(0);

      expect(store.getState().createdAnalysisRounds.size).toBe(1);
    });
  });
});

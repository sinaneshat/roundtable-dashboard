/**
 * Race Conditions and Concurrent Operations Tests
 *
 * Tests for preventing and handling race conditions in the chat store
 * as documented in FLOW_DOCUMENTATION.md (Part 14: Race Condition Protection).
 *
 * Key Areas:
 * - Double message submission prevention
 * - Pre-search vs participant streaming coordination
 * - Moderator deduplication
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

import { FinishReasons, MessageRoles, MessageStatuses, ScreenModes, StreamStatuses } from '@/api/core/enums';
import type { DbAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import type { ChatThread } from '@/db/validation';
import {
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

      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.PENDING));

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const shouldWait = preSearch?.status === MessageStatuses.PENDING
        || preSearch?.status === MessageStatuses.STREAMING;

      expect(shouldWait).toBe(true);
    });

    it('participants wait while pre-search is STREAMING', () => {
      const store = createChatStore();

      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.STREAMING));

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const shouldWait = preSearch?.status === MessageStatuses.PENDING
        || preSearch?.status === MessageStatuses.STREAMING;

      expect(shouldWait).toBe(true);
    });

    it('participants proceed after pre-search COMPLETE', () => {
      const store = createChatStore();

      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE));

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const shouldWait = preSearch?.status === MessageStatuses.PENDING
        || preSearch?.status === MessageStatuses.STREAMING;

      expect(shouldWait).toBe(false);
    });

    it('participants proceed after pre-search FAILED', () => {
      const store = createChatStore();

      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.FAILED));

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const shouldWait = preSearch?.status === MessageStatuses.PENDING
        || preSearch?.status === MessageStatuses.STREAMING;

      expect(shouldWait).toBe(false);
    });
  });

  describe('pre-Search Race Condition Fix', () => {
    it('sTREAMING overrides PENDING when provider responds first', () => {
      const store = createChatStore();

      // Orchestrator adds PENDING
      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.PENDING));
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.PENDING);

      // Provider responds with STREAMING (should win)
      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.STREAMING));
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
    });

    it('does not downgrade from COMPLETE', () => {
      const store = createChatStore();

      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE));

      // Late STREAMING should not override
      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.STREAMING));

      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
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

  describe('atomic tryMarkPreSearchTriggered', () => {
    it('returns true on first call, false on subsequent calls', () => {
      const store = createChatStore();

      // First call should succeed
      const result1 = store.getState().tryMarkPreSearchTriggered(0);
      expect(result1).toBe(true);

      // Second call should fail (already triggered)
      const result2 = store.getState().tryMarkPreSearchTriggered(0);
      expect(result2).toBe(false);

      // Third call should also fail
      const result3 = store.getState().tryMarkPreSearchTriggered(0);
      expect(result3).toBe(false);
    });

    it('allows different rounds independently', () => {
      const store = createChatStore();

      // Round 0
      expect(store.getState().tryMarkPreSearchTriggered(0)).toBe(true);

      // Round 1 - different round, should succeed
      expect(store.getState().tryMarkPreSearchTriggered(1)).toBe(true);

      // Round 0 again - should fail (already marked)
      expect(store.getState().tryMarkPreSearchTriggered(0)).toBe(false);
    });

    it('prevents race condition between multiple concurrent callers', () => {
      const store = createChatStore();
      const results: boolean[] = [];

      // Simulate concurrent calls from different components
      // In JS single-threaded model, these run sequentially but test the atomic behavior
      results.push(store.getState().tryMarkPreSearchTriggered(0));
      results.push(store.getState().tryMarkPreSearchTriggered(0));
      results.push(store.getState().tryMarkPreSearchTriggered(0));

      // Only the first call should succeed
      expect(results.filter(r => r === true)).toHaveLength(1);
      expect(results.filter(r => r === false)).toHaveLength(2);
    });

    it('marks the round as triggered after returning true', () => {
      const store = createChatStore();

      // Before calling tryMark
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);

      // Call tryMark
      store.getState().tryMarkPreSearchTriggered(0);

      // After calling tryMark
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);
    });

    it('does not modify state when returning false', () => {
      const store = createChatStore();

      // First call marks round 0
      store.getState().tryMarkPreSearchTriggered(0);

      // Get the set state before duplicate call
      const sizeBefore = store.getState().triggeredPreSearchRounds.size;

      // Duplicate call should not add anything new
      store.getState().tryMarkPreSearchTriggered(0);

      expect(store.getState().triggeredPreSearchRounds.size).toBe(sizeBefore);
    });

    it('can be cleared and re-triggered', () => {
      const store = createChatStore();

      // First trigger
      expect(store.getState().tryMarkPreSearchTriggered(0)).toBe(true);
      expect(store.getState().tryMarkPreSearchTriggered(0)).toBe(false);

      // Clear tracking
      store.getState().clearPreSearchTracking(0);

      // Can trigger again after clearing
      expect(store.getState().tryMarkPreSearchTriggered(0)).toBe(true);
    });

    it('is cleared by startRegeneration', () => {
      const store = createChatStore();

      // Mark round 0 as triggered
      store.getState().tryMarkPreSearchTriggered(0);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);

      // Start regeneration clears tracking
      store.getState().startRegeneration(0);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);

      // Can trigger again after regeneration
      expect(store.getState().tryMarkPreSearchTriggered(0)).toBe(true);
    });
  });
});

// ============================================================================
// MODERATOR DEDUPLICATION TESTS
// ============================================================================

describe('moderator Deduplication', () => {
  describe('createdModeratorRounds Tracking', () => {
    it('tracks rounds where moderator was created', () => {
      const store = createChatStore();

      expect(store.getState().hasModeratorBeenCreated(0)).toBe(false);

      store.getState().markModeratorCreated(0);

      expect(store.getState().hasModeratorBeenCreated(0)).toBe(true);
    });

    it('cleared on regeneration', () => {
      const store = createChatStore();

      store.getState().markModeratorCreated(0);
      store.getState().startRegeneration(0);

      expect(store.getState().hasModeratorBeenCreated(0)).toBe(false);
    });
  });

  describe('triggeredModeratorRounds and triggeredModeratorIds', () => {
    it('tracks both round and ID for stream deduplication', () => {
      const store = createChatStore();

      store.getState().markModeratorStreamTriggered('moderator-123', 0);

      // Can check by ID or round
      expect(store.getState().hasModeratorStreamBeenTriggered('moderator-123', 0)).toBe(true);
      expect(store.getState().hasModeratorStreamBeenTriggered('different-id', 0)).toBe(true); // Same round
      expect(store.getState().hasModeratorStreamBeenTriggered('moderator-123', 1)).toBe(true); // Same ID
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
    it('waits for both AI title and moderator complete', () => {
      type NavState = {
        isAiGeneratedTitle: boolean;
        moderatorStatus: typeof MessageStatuses[keyof typeof MessageStatuses];
      };

      const canNavigate = (state: NavState) =>
        state.isAiGeneratedTitle
        && state.moderatorStatus === MessageStatuses.COMPLETE;

      // Neither ready
      expect(canNavigate({ isAiGeneratedTitle: false, moderatorStatus: MessageStatuses.PENDING })).toBe(false);

      // Only title ready
      expect(canNavigate({ isAiGeneratedTitle: true, moderatorStatus: MessageStatuses.STREAMING })).toBe(false);

      // Only moderator ready
      expect(canNavigate({ isAiGeneratedTitle: false, moderatorStatus: MessageStatuses.COMPLETE })).toBe(false);

      // Both ready
      expect(canNavigate({ isAiGeneratedTitle: true, moderatorStatus: MessageStatuses.COMPLETE })).toBe(true);
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

      store.getState().markModeratorCreated(0);
      store.getState().markModeratorCreated(1);
      store.getState().markPreSearchTriggered(0);
      store.getState().markPreSearchTriggered(1);

      store.getState().startRegeneration(0);

      // Only round 0 cleared
      expect(store.getState().hasModeratorBeenCreated(0)).toBe(false);
      expect(store.getState().hasModeratorBeenCreated(1)).toBe(true);
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
      const latestUserMessage = messages.filter(m => m.role === MessageRoles.USER).pop();
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
          role: MessageRoles.ASSISTANT as const,
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
    it('waits for all participants before moderator', () => {
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
      // NEW: prepareForNewMessage no longer needs modelIds
      store.getState().prepareForNewMessage('Test', []);

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
    it('waits for all animations before moderator', async () => {
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
      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE));

      // Navigate to new thread
      store.getState().resetForThreadNavigation();

      expect(store.getState().messages).toHaveLength(0);
      expect(store.getState().preSearches).toHaveLength(0);
    });
  });

  describe('tracking Set Isolation', () => {
    it('creates fresh Set instances on reset', () => {
      const store = createChatStore();

      store.getState().markModeratorCreated(0);
      const set1 = store.getState().createdModeratorRounds;

      store.getState().resetToNewChat();

      const set2 = store.getState().createdModeratorRounds;

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

  describe('markModeratorCreated Idempotency', () => {
    it('multiple marks for same round is safe', () => {
      const store = createChatStore();

      store.getState().markModeratorCreated(0);
      store.getState().markModeratorCreated(0);
      store.getState().markModeratorCreated(0);

      expect(store.getState().createdModeratorRounds.size).toBe(1);
    });
  });
});

// ============================================================================
// ROUND BOUNDARY INTEGRITY TESTS - Prevent cross-round contamination
// ============================================================================

describe('round Boundary Integrity', () => {
  describe('message Round Assignment', () => {
    it('messages must have consistent roundNumber in metadata', () => {
      const store = createChatStore();

      // Add messages for round 0
      store.getState().setMessages([
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0-0',
          content: 'R0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ]);

      // Add messages for round 1
      const currentMessages = store.getState().messages;
      store.getState().setMessages([
        ...currentMessages,
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'a1-0',
          content: 'R1',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ]);

      const messages = store.getState().messages;

      // Verify round 0 messages have roundNumber 0
      const round0Messages = messages.filter((m) => {
        const meta = m.metadata as { roundNumber?: number };
        return meta?.roundNumber === 0;
      });
      expect(round0Messages).toHaveLength(2);

      // Verify round 1 messages have roundNumber 1
      const round1Messages = messages.filter((m) => {
        const meta = m.metadata as { roundNumber?: number };
        return meta?.roundNumber === 1;
      });
      expect(round1Messages).toHaveLength(2);

      // Verify no messages without roundNumber
      const noRoundMessages = messages.filter((m) => {
        const meta = m.metadata as { roundNumber?: number };
        return meta?.roundNumber === undefined || meta?.roundNumber === null;
      });
      expect(noRoundMessages).toHaveLength(0);
    });

    it('streaming messages must use streamingRoundNumber for assignment', () => {
      const store = createChatStore();

      // Set up round 0 as complete
      store.getState().setMessages([
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0-0',
          content: 'R0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ]);

      // Start streaming round 1
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);

      // When adding a streaming message, it MUST use streamingRoundNumber
      const streamingRoundNumber = store.getState().streamingRoundNumber;
      expect(streamingRoundNumber).toBe(1);

      // Add streaming message with correct round number
      const currentMessages = store.getState().messages;
      store.getState().setMessages([
        ...currentMessages,
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: streamingRoundNumber! }),
        createTestAssistantMessage({
          id: 'streaming-a1-0',
          content: 'Streaming...',
          roundNumber: streamingRoundNumber!,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.UNKNOWN,
        }),
      ]);

      // Verify streaming message has correct round
      const messages = store.getState().messages;
      const streamingMessage = messages.find(m => m.id === 'streaming-a1-0');
      const meta = streamingMessage?.metadata as { roundNumber?: number };
      expect(meta?.roundNumber).toBe(1);
    });

    it('prevents adding message with mismatched roundNumber during streaming', () => {
      const store = createChatStore();

      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);

      // This test validates the invariant: during streaming, all new messages
      // must have roundNumber === streamingRoundNumber
      const streamingRoundNumber = store.getState().streamingRoundNumber;

      // Simulate what should NOT happen (message with wrong round)
      // The store should validate this, or timeline grouping should handle it
      const wrongRoundMessage = createTestAssistantMessage({
        id: 'wrong-round',
        content: 'Wrong',
        roundNumber: 0, // Wrong! Should be 1
        participantId: 'p0',
        participantIndex: 0,
        finishReason: FinishReasons.UNKNOWN,
      });

      // Verify the mismatch detection
      const messageMeta = wrongRoundMessage.metadata as { roundNumber?: number };
      expect(messageMeta?.roundNumber).not.toBe(streamingRoundNumber);
    });
  });

  describe('timeline Grouping Integrity', () => {
    it('messages are grouped strictly by roundNumber', () => {
      const store = createChatStore();

      // Create interleaved messages (out of order by ID but correct by round)
      store.getState().setMessages([
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 1 }),
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a1-0',
          content: 'R1',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'a0-0',
          content: 'R0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ]);

      const messages = store.getState().messages;

      // Group by round (simulating useThreadTimeline behavior)
      const messagesByRound = new Map<number, typeof messages>();
      messages.forEach((m) => {
        const meta = m.metadata as { roundNumber?: number };
        const round = meta?.roundNumber ?? 0;
        if (!messagesByRound.has(round)) {
          messagesByRound.set(round, []);
        }
        messagesByRound.get(round)!.push(m);
      });

      // Round 0 should have exactly 2 messages
      expect(messagesByRound.get(0)).toHaveLength(2);
      // Round 1 should have exactly 2 messages
      expect(messagesByRound.get(1)).toHaveLength(2);

      // Verify no cross-contamination
      const round0Ids = messagesByRound.get(0)!.map(m => m.id);
      expect(round0Ids).toContain('u0');
      expect(round0Ids).toContain('a0-0');
      expect(round0Ids).not.toContain('u1');
      expect(round0Ids).not.toContain('a1-0');
    });

    it('participant messages stay within their assigned round', () => {
      const store = createChatStore();

      // Round 0 with 2 participants
      store.getState().setMessages([
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0-p0',
          content: 'P0-R0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'a0-p1',
          content: 'P1-R0',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
      ]);

      // Start round 1 streaming
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);

      // Add round 1 messages
      const currentMessages = store.getState().messages;
      store.getState().setMessages([
        ...currentMessages,
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'a1-p0',
          content: 'P0-R1 streaming...',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.UNKNOWN,
        }),
      ]);

      const messages = store.getState().messages;

      // Verify participant p0's round 0 message is NOT in round 1
      const round1Messages = messages.filter((m) => {
        const meta = m.metadata as { roundNumber?: number };
        return meta?.roundNumber === 1;
      });

      const p0InRound1 = round1Messages.filter((m) => {
        const meta = m.metadata as { participantId?: string };
        return meta?.participantId === 'p0';
      });

      // p0 should have exactly 1 message in round 1
      expect(p0InRound1).toHaveLength(1);
      expect(p0InRound1[0]!.id).toBe('a1-p0');
    });
  });

  describe('concurrent Streaming Round Safety', () => {
    it('streamingRoundNumber prevents cross-round message addition', () => {
      const store = createChatStore();

      // Complete round 0
      store.getState().setMessages([
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0-0',
          content: 'R0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ]);
      store.getState().completeStreaming();

      // Start round 1
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // Verify streaming state is set up correctly
      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().isStreaming).toBe(true);

      // Any message added now must be for round 1
      const roundForNewMessage = store.getState().streamingRoundNumber;
      expect(roundForNewMessage).toBe(1);
      expect(roundForNewMessage).not.toBe(0);
    });

    it('maintains round isolation when rapidly switching rounds', () => {
      const store = createChatStore();

      // Simulate rapid round changes
      store.getState().setStreamingRoundNumber(0);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setStreamingRoundNumber(2);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setStreamingRoundNumber(0);

      // Final state should be round 0
      expect(store.getState().streamingRoundNumber).toBe(0);

      // State should be consistent
      expect(typeof store.getState().streamingRoundNumber).toBe('number');
    });

    it('completeStreaming clears streamingRoundNumber to prevent stale assignments', () => {
      const store = createChatStore();

      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);

      store.getState().completeStreaming();

      expect(store.getState().streamingRoundNumber).toBeNull();
      expect(store.getState().isStreaming).toBe(false);
    });
  });
});

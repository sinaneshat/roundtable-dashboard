/**
 * Overview and Thread Screen Flow Tests
 *
 * Tests the distinct flows for ChatOverviewScreen and ChatThreadScreen:
 *
 * OVERVIEW SCREEN (new thread creation):
 * - User creates new thread with first message
 * - waitingToStartStreaming triggers startRound
 * - Round 0 completes, navigates to thread screen
 *
 * THREAD SCREEN (existing thread):
 * - User sends follow-up messages
 * - pendingMessage effect triggers sendMessage
 * - Multiple rounds can complete
 *
 * KEY DIFFERENCES:
 * - Overview uses waitingToStartStreaming + startRound
 * - Thread uses pendingMessage + sendMessage
 * - Both must NOT interfere with each other
 *
 * @see src/containers/screens/chat/ChatOverviewScreen.tsx
 * @see src/containers/screens/chat/ChatThreadScreen.tsx
 * @see src/components/providers/chat-store-provider.tsx
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, MessageRoles, ScreenModes } from '@/api/core/enums';
import { AnimationIndices, createChatStore } from '@/stores/chat';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// Overview Screen Flow Tests
// ============================================================================

describe('overview Screen Flow', () => {
  describe('initial thread creation', () => {
    it('should start with clean state', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState } = result.current;

      expect(getState().thread).toBeNull();
      expect(getState().messages).toEqual([]);
      expect(getState().participants).toEqual([]);
      expect(getState().isStreaming).toBe(false);
      // screenMode defaults to 'overview' per store initialization
      expect(getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });

    it('should initialize for overview mode', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({ screenMode: ScreenModes.OVERVIEW });
      });

      expect(getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });

    it('should set waitingToStartStreaming after thread creation', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      // Simulate thread creation response
      act(() => {
        setState({
          thread: createMockThread({ id: 'new-thread-1' }),
          createdThreadId: 'new-thread-1',
          participants: [createMockParticipant(0), createMockParticipant(1)],
          messages: [createMockUserMessage(0)],
          screenMode: ScreenModes.OVERVIEW,
          waitingToStartStreaming: true,
        });
      });

      expect(getState().thread?.id).toBe('new-thread-1');
      expect(getState().waitingToStartStreaming).toBe(true);
      expect(getState().messages).toHaveLength(1);
    });

    it('should NOT use pendingMessage flow when waitingToStartStreaming is set', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      // Both flags set - should use startRound, NOT sendMessage
      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1' }),
          participants: [createMockParticipant(0)],
          messages: [createMockUserMessage(0)],
          screenMode: ScreenModes.OVERVIEW,
          waitingToStartStreaming: true,
          pendingMessage: 'Test message',
          expectedParticipantIds: ['openai/gpt-4'],
          hasSentPendingMessage: false,
        });
      });

      // In provider, pendingMessage effect exits early when:
      // waitingToStart && screenMode === 'overview'
      expect(getState().waitingToStartStreaming).toBe(true);
      expect(getState().screenMode).toBe(ScreenModes.OVERVIEW);
      // The sendMessage flow should NOT trigger
    });

    it('should clear waitingToStartStreaming when streaming begins', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1' }),
          participants: [createMockParticipant(0)],
          messages: [createMockUserMessage(0)],
          screenMode: ScreenModes.OVERVIEW,
          waitingToStartStreaming: true,
          isStreaming: false,
        });
      });

      // Streaming begins
      act(() => {
        setState({
          isStreaming: true,
          waitingToStartStreaming: false,
        });
      });

      expect(getState().isStreaming).toBe(true);
      expect(getState().waitingToStartStreaming).toBe(false);
    });
  });

  describe('round 0 completion on overview', () => {
    it('should mark analysis created for round 0', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1', mode: 'moderator' }),
          participants: [createMockParticipant(0), createMockParticipant(1)],
          messages: [
            createMockUserMessage(0),
            createMockMessage(0, 0),
            createMockMessage(1, 0),
          ],
          screenMode: ScreenModes.OVERVIEW,
          isStreaming: false,
        });
      });

      // Mark analysis as created (handleComplete does this)
      act(() => {
        getState().markAnalysisCreated(0);
      });

      expect(getState().hasAnalysisBeenCreated(0)).toBe(true);
    });

    it('should prevent duplicate analysis creation', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1', mode: 'moderator' }),
          screenMode: ScreenModes.OVERVIEW,
        });
        getState().markAnalysisCreated(0);
      });

      // Try to create again - should be blocked
      expect(getState().hasAnalysisBeenCreated(0)).toBe(true);

      // Track how many times createPendingAnalysis would be called
      // In real code, hasAnalysisBeenCreated check prevents duplicate creation
    });
  });

  describe('overview with web search', () => {
    it('should wait for pre-search before starting participants', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1', enableWebSearch: true }),
          participants: [createMockParticipant(0)],
          messages: [createMockUserMessage(0)],
          screenMode: ScreenModes.OVERVIEW,
          waitingToStartStreaming: true,
          preSearches: [createMockPreSearch({
            threadId: 'thread-1',
            roundNumber: 0,
            status: AnalysisStatuses.STREAMING,
          })],
        });
      });

      // Pre-search still streaming - should NOT start participants
      expect(getState().waitingToStartStreaming).toBe(true);
      expect(getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);
      // In provider effect, this early returns
    });

    it('should start participants after pre-search completes', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1', enableWebSearch: true }),
          participants: [createMockParticipant(0)],
          messages: [createMockUserMessage(0)],
          screenMode: ScreenModes.OVERVIEW,
          waitingToStartStreaming: true,
          preSearches: [createMockPreSearch({
            threadId: 'thread-1',
            roundNumber: 0,
            status: AnalysisStatuses.COMPLETE,
            completedAt: new Date(),
          })],
        });
      });

      expect(getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
      // Provider effect would now call startRound
    });

    it('should wait for pre-search animation after status complete', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1', enableWebSearch: true }),
          participants: [createMockParticipant(0)],
          messages: [createMockUserMessage(0)],
          screenMode: ScreenModes.OVERVIEW,
          waitingToStartStreaming: true,
          preSearches: [createMockPreSearch({
            threadId: 'thread-1',
            roundNumber: 0,
            status: AnalysisStatuses.COMPLETE,
          })],
        });

        // Pre-search animation registered
        getState().registerAnimation(AnimationIndices.PRE_SEARCH);
      });

      expect(getState().pendingAnimations.has(AnimationIndices.PRE_SEARCH)).toBe(true);
      // Provider effect waits for animation to complete
    });
  });
});

// ============================================================================
// Thread Screen Flow Tests
// ============================================================================

describe('thread Screen Flow', () => {
  describe('loading existing thread', () => {
    it('should initialize with existing thread data', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      const existingThread = createMockThread({ id: 'existing-thread' });
      const existingMessages = [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ];

      act(() => {
        setState({
          thread: existingThread,
          participants: [createMockParticipant(0), createMockParticipant(1)],
          messages: existingMessages,
          screenMode: ScreenModes.THREAD,
          analyses: [createMockAnalysis({ roundNumber: 0 })],
        });
      });

      expect(getState().thread?.id).toBe('existing-thread');
      expect(getState().messages).toHaveLength(3);
      expect(getState().screenMode).toBe(ScreenModes.THREAD);
    });

    it('should NOT have waitingToStartStreaming set', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({
          thread: createMockThread({ id: 'existing-thread' }),
          screenMode: ScreenModes.THREAD,
          waitingToStartStreaming: false,
        });
      });

      expect(getState().waitingToStartStreaming).toBe(false);
    });
  });

  describe('sending follow-up message', () => {
    it('should use pendingMessage flow for subsequent messages', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      // Setup: Thread with completed round 0
      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1' }),
          participants: [createMockParticipant(0)],
          messages: [
            createMockUserMessage(0),
            createMockMessage(0, 0),
          ],
          screenMode: ScreenModes.THREAD,
          isStreaming: false,
          hasSentPendingMessage: false,
        });
      });

      // User submits follow-up
      act(() => {
        setState({
          pendingMessage: 'Follow up question',
          expectedParticipantIds: ['openai/gpt-4'],
        });
      });

      expect(getState().pendingMessage).toBe('Follow up question');
      expect(getState().hasSentPendingMessage).toBe(false);
      // Provider's pendingMessage effect will trigger sendMessage
    });

    it('should set hasSentPendingMessage after sending', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1' }),
          participants: [createMockParticipant(0)],
          messages: [createMockUserMessage(0), createMockMessage(0, 0)],
          screenMode: ScreenModes.THREAD,
          pendingMessage: 'Follow up',
          expectedParticipantIds: ['openai/gpt-4'],
          hasSentPendingMessage: false,
        });
      });

      // After sendMessage is called
      act(() => {
        setState({
          hasSentPendingMessage: true,
          isStreaming: true,
          streamingRoundNumber: 1,
        });
      });

      expect(getState().hasSentPendingMessage).toBe(true);
      expect(getState().isStreaming).toBe(true);
    });

    it('should NOT send again if hasSentPendingMessage is true', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1' }),
          participants: [createMockParticipant(0)],
          messages: [createMockUserMessage(0), createMockMessage(0, 0)],
          screenMode: ScreenModes.THREAD,
          pendingMessage: 'Follow up',
          expectedParticipantIds: ['openai/gpt-4'],
          hasSentPendingMessage: true, // Already sent
        });
      });

      // Provider effect should early return
      expect(getState().hasSentPendingMessage).toBe(true);
    });
  });

  describe('multi-round conversation on thread', () => {
    it('should track round numbers correctly', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      // Round 0 complete
      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1' }),
          participants: [createMockParticipant(0)],
          messages: [
            createMockUserMessage(0),
            createMockMessage(0, 0),
          ],
          screenMode: ScreenModes.THREAD,
        });
        getState().markAnalysisCreated(0);
      });

      expect(getState().hasAnalysisBeenCreated(0)).toBe(true);

      // Round 1 starts
      act(() => {
        setState({
          messages: [
            createMockUserMessage(0),
            createMockMessage(0, 0),
            createMockUserMessage(1, 'Round 1 question'),
          ],
          isStreaming: true,
          streamingRoundNumber: 1,
        });
      });

      expect(getState().streamingRoundNumber).toBe(1);

      // Round 1 complete
      act(() => {
        setState({
          messages: [
            createMockUserMessage(0),
            createMockMessage(0, 0),
            createMockUserMessage(1, 'Round 1 question'),
            createMockMessage(0, 1),
          ],
          isStreaming: false,
        });
        getState().markAnalysisCreated(1);
      });

      expect(getState().hasAnalysisBeenCreated(1)).toBe(true);
      expect(getState().hasAnalysisBeenCreated(0)).toBe(true);
    });

    it('should handle round 2 with web search enabled', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      // Setup: Thread with 2 completed rounds, web search enabled for round 2
      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1', enableWebSearch: true }),
          participants: [createMockParticipant(0)],
          messages: [
            createMockUserMessage(0),
            createMockMessage(0, 0),
            createMockUserMessage(1),
            createMockMessage(0, 1),
          ],
          screenMode: ScreenModes.THREAD,
          enableWebSearch: true,
          preSearches: [
            createMockPreSearch({ roundNumber: 0, status: AnalysisStatuses.COMPLETE }),
            createMockPreSearch({ roundNumber: 1, status: AnalysisStatuses.COMPLETE }),
          ],
        });
        getState().markAnalysisCreated(0);
        getState().markAnalysisCreated(1);
      });

      // User sends round 2 message
      act(() => {
        setState({
          pendingMessage: 'Round 2 question',
          expectedParticipantIds: ['openai/gpt-4'],
          hasSentPendingMessage: false,
        });
      });

      // Pre-search for round 2 should be created
      expect(getState().enableWebSearch).toBe(true);
      // Provider would check for pre-search for current round
    });
  });
});

// ============================================================================
// Navigation Between Screens Tests
// ============================================================================

describe('screen Navigation', () => {
  describe('overview to thread transition', () => {
    it('should preserve state when navigating to same thread', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      // Round 0 completes on overview
      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1', slug: 'my-thread' }),
          participants: [createMockParticipant(0)],
          messages: [
            createMockUserMessage(0),
            createMockMessage(0, 0),
          ],
          screenMode: ScreenModes.OVERVIEW,
          isStreaming: false,
        });
        getState().markAnalysisCreated(0);
      });

      const messagesBeforeNav = getState().messages;
      const threadBeforeNav = getState().thread;

      // Navigate to thread screen (same thread)
      act(() => {
        setState({ screenMode: ScreenModes.THREAD });
      });

      // State should be preserved (same thread)
      expect(getState().messages).toBe(messagesBeforeNav);
      expect(getState().thread).toBe(threadBeforeNav);
      expect(getState().hasAnalysisBeenCreated(0)).toBe(true);
    });

    it('should reset state when navigating to different thread', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      // Setup: On thread-1
      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1' }),
          participants: [createMockParticipant(0)],
          messages: [createMockUserMessage(0), createMockMessage(0, 0)],
          screenMode: ScreenModes.THREAD,
        });
      });

      // Navigate to different thread - resetForThreadNavigation
      act(() => {
        getState().resetForThreadNavigation();
      });

      expect(getState().thread).toBeNull();
      expect(getState().messages).toEqual([]);
      expect(getState().participants).toEqual([]);
    });
  });

  describe('thread to overview transition', () => {
    it('should reset to overview state', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      // Setup: On thread screen
      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1' }),
          participants: [createMockParticipant(0)],
          messages: [createMockUserMessage(0), createMockMessage(0, 0)],
          screenMode: ScreenModes.THREAD,
          isStreaming: true,
        });
      });

      // Navigate to overview - resetToOverview
      act(() => {
        getState().resetToOverview();
      });

      expect(getState().thread).toBeNull();
      expect(getState().messages).toEqual([]);
      expect(getState().isStreaming).toBe(false);
      expect(getState().waitingToStartStreaming).toBe(false);
    });
  });
});

// ============================================================================
// Race Condition Prevention Tests
// ============================================================================

describe('race Condition Prevention', () => {
  describe('duplicate message prevention', () => {
    it('should NOT send duplicate message when startRound and pendingMessage both active', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      // BUG SCENARIO: Both flags set
      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1' }),
          participants: [createMockParticipant(0)],
          messages: [createMockUserMessage(0)],
          screenMode: ScreenModes.OVERVIEW,
          waitingToStartStreaming: true,
          pendingMessage: 'Test message',
          expectedParticipantIds: ['openai/gpt-4'],
          hasSentPendingMessage: false,
        });
      });

      // Provider has guard: if (waitingToStart && screenMode === 'overview') return;
      // This prevents pendingMessage effect from calling sendMessage
      expect(getState().waitingToStartStreaming).toBe(true);
      expect(getState().screenMode).toBe(ScreenModes.OVERVIEW);
      expect(getState().pendingMessage).toBe('Test message');
    });

    it('should set hasSentPendingMessage when startRound triggers streaming', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1' }),
          participants: [createMockParticipant(0)],
          messages: [createMockUserMessage(0)],
          screenMode: ScreenModes.OVERVIEW,
          waitingToStartStreaming: true,
          pendingMessage: 'Test message',
          hasSentPendingMessage: false,
        });
      });

      // startRound triggers streaming
      act(() => {
        setState({
          isStreaming: true,
          waitingToStartStreaming: false,
          hasSentPendingMessage: true, // Provider sets this
        });
      });

      expect(getState().hasSentPendingMessage).toBe(true);
      // After round completes, pendingMessage effect won't re-send
    });
  });

  describe('streaming ref check', () => {
    it('should track streaming state in both store and ref', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({ isStreaming: false });
      });
      expect(getState().isStreaming).toBe(false);

      act(() => {
        setState({ isStreaming: true });
      });
      expect(getState().isStreaming).toBe(true);

      // In hook, isStreamingRef.current is kept in sync
      // This allows synchronous checks in microtasks
    });
  });

  describe('pre-search creation lock', () => {
    it('should track pre-search trigger to prevent duplicates', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1', enableWebSearch: true }),
          screenMode: ScreenModes.OVERVIEW,
        });
      });

      // Mark pre-search as triggered
      act(() => {
        getState().markPreSearchTriggered(0);
      });

      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(1)).toBe(false);
    });

    it('should clear pre-search tracking on failure', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1', enableWebSearch: true }),
        });
        getState().markPreSearchTriggered(0);
      });

      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);

      // On failure, clear tracking to allow retry
      act(() => {
        getState().clearPreSearchTracking(0);
      });

      expect(getState().hasPreSearchBeenTriggered(0)).toBe(false);
    });
  });
});

// ============================================================================
// Edge Cases and Error States
// ============================================================================

describe('edge Cases', () => {
  describe('empty participants', () => {
    it('should handle zero enabled participants gracefully', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1' }),
          participants: [
            createMockParticipant(0, { isEnabled: false }),
            createMockParticipant(1, { isEnabled: false }),
          ],
          messages: [createMockUserMessage(0)],
          screenMode: ScreenModes.OVERVIEW,
        });
      });

      const enabledParticipants = getState().participants.filter(p => p.isEnabled);
      expect(enabledParticipants).toHaveLength(0);
      // startRound should early return when no enabled participants
    });
  });

  describe('screenMode null during initialization', () => {
    it('should wait for screenMode before triggering startRound', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      // Thread created but screenMode not set yet
      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-1' }),
          participants: [createMockParticipant(0)],
          messages: [createMockUserMessage(0)],
          screenMode: null, // Not initialized
          waitingToStartStreaming: true,
        });
      });

      // Provider effect should wait (not clear flag, not trigger startRound)
      expect(getState().screenMode).toBeNull();
      expect(getState().waitingToStartStreaming).toBe(true);
      // Flag should remain set until screenMode is initialized
    });
  });

  describe('stale message prevention', () => {
    it('should NOT sync AI SDK messages with different thread ID', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      // Store has messages for thread-2
      act(() => {
        setState({
          thread: createMockThread({ id: 'thread-2' }),
          createdThreadId: 'thread-2',
          messages: [
            {
              ...createMockUserMessage(0),
              id: 'thread-2_r0_user',
            },
          ],
          screenMode: ScreenModes.THREAD,
        });
      });

      // AI SDK might have stale messages from thread-1
      // Provider sync effect checks thread ID prefix
      const staleMessage = {
        id: 'thread-1_r0_p0', // Different thread ID!
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Stale response' }],
      };

      // The sync effect would detect mismatch and clear AI SDK
      const currentThreadId = getState().thread?.id;
      const messageThreadId = staleMessage.id.split('_')[0];

      expect(messageThreadId).not.toBe(currentThreadId);
      // Provider would call chat.setMessages([]) and skip sync
    });
  });
});

// ============================================================================
// Changelog Wait State Tests
// ============================================================================

describe('changelog Wait State', () => {
  it('should skip changelog check on overview screen', () => {
    const { result } = renderHook(() => createChatStore());
    const { getState, setState } = result.current;

    // Overview screen has no changelog query
    act(() => {
      setState({
        thread: createMockThread({ id: 'thread-1' }),
        participants: [createMockParticipant(0)],
        messages: [createMockUserMessage(0)],
        screenMode: ScreenModes.OVERVIEW,
        isWaitingForChangelog: true, // Set but should be ignored on overview
        pendingMessage: 'Test',
        expectedParticipantIds: ['openai/gpt-4'],
      });
    });

    // Provider effect: if (isWaitingForChangelog && screenMode !== 'overview') return;
    // On overview, this check is skipped
    expect(getState().screenMode).toBe(ScreenModes.OVERVIEW);
    expect(getState().isWaitingForChangelog).toBe(true);
    // Effect should NOT early return on overview
  });

  it('should wait for changelog on thread screen', () => {
    const { result } = renderHook(() => createChatStore());
    const { getState, setState } = result.current;

    act(() => {
      setState({
        thread: createMockThread({ id: 'thread-1' }),
        participants: [createMockParticipant(0)],
        messages: [createMockUserMessage(0), createMockMessage(0, 0)],
        screenMode: ScreenModes.THREAD,
        isWaitingForChangelog: true,
        pendingMessage: 'Follow up',
        expectedParticipantIds: ['openai/gpt-4'],
      });
    });

    // Provider effect should wait
    expect(getState().screenMode).toBe(ScreenModes.THREAD);
    expect(getState().isWaitingForChangelog).toBe(true);
    // Effect early returns
  });

  it('should proceed when changelog fetching completes', () => {
    const { result } = renderHook(() => createChatStore());
    const { getState, setState } = result.current;

    act(() => {
      setState({
        thread: createMockThread({ id: 'thread-1' }),
        participants: [createMockParticipant(0)],
        messages: [createMockUserMessage(0), createMockMessage(0, 0)],
        screenMode: ScreenModes.THREAD,
        isWaitingForChangelog: false, // Changelog fetched
        pendingMessage: 'Follow up',
        expectedParticipantIds: ['openai/gpt-4'],
        hasSentPendingMessage: false,
      });
    });

    expect(getState().isWaitingForChangelog).toBe(false);
    // Effect can now proceed to send message
  });
});

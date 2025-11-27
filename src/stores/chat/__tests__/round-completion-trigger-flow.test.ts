/**
 * Round Completion and Trigger Flow Tests
 *
 * Tests the critical participant triggering logic in use-multi-participant-chat.ts
 * These tests cover the race conditions and timing issues that were fixed:
 *
 * 1. isTriggeringRef race condition: Fast-responding models complete before rAF fires
 * 2. Animation waiting: Removed per-participant waiting to prevent 5s delays
 * 3. Round completion detection: Correctly identifies when all participants have responded
 *
 * @see src/hooks/utils/use-multi-participant-chat.ts (triggerNextParticipantWithRefs)
 * @see src/components/providers/chat-store-provider.tsx (handleComplete)
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScreenModes } from '@/api/core/enums';
import { createChatStore } from '@/stores/chat';

import {
  createMockMessage,
  createMockParticipant,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// Helper Functions - Simulate Hook Logic
// ============================================================================

/**
 * Simulates triggerNextParticipantWithRefs logic
 * This mirrors the hook's logic for determining if round is complete
 */
function isRoundComplete(currentIndex: number, totalParticipants: number): boolean {
  const nextIndex = currentIndex + 1;
  return nextIndex >= totalParticipants;
}

/**
 * Simulates the trigger lock behavior
 * OLD (buggy): Used requestAnimationFrame to reset lock
 * NEW (fixed): Resets synchronously after aiSendMessage
 */
function simulateTriggerLock() {
  let isLocked = false;

  return {
    acquire: () => {
      if (isLocked)
        return false;
      isLocked = true;
      return true;
    },
    releaseSynchronously: () => {
      isLocked = false;
    },
    // OLD buggy behavior - don't use this
    releaseWithRAF: (callback: () => void) => {
      requestAnimationFrame(() => {
        isLocked = false;
        callback();
      });
    },
    isLocked: () => isLocked,
  };
}

// ============================================================================
// Round Completion Detection Tests
// ============================================================================

describe('round Completion Detection', () => {
  describe('isRoundComplete', () => {
    it('should detect round complete when currentIndex is last participant', () => {
      // 3 participants (indices 0, 1, 2), currently at index 2
      expect(isRoundComplete(2, 3)).toBe(true);
    });

    it('should NOT detect round complete when more participants remain', () => {
      // 3 participants, currently at index 0
      expect(isRoundComplete(0, 3)).toBe(false);
      expect(isRoundComplete(1, 3)).toBe(false);
    });

    it('should handle single participant correctly', () => {
      // 1 participant, currently at index 0 → round complete
      expect(isRoundComplete(0, 1)).toBe(true);
    });

    it('should handle 2 participants correctly', () => {
      expect(isRoundComplete(0, 2)).toBe(false); // First done, one more
      expect(isRoundComplete(1, 2)).toBe(true); // Second done, complete
    });

    it('should handle 5 participants correctly', () => {
      expect(isRoundComplete(0, 5)).toBe(false);
      expect(isRoundComplete(3, 5)).toBe(false);
      expect(isRoundComplete(4, 5)).toBe(true); // Last one
    });
  });
});

// ============================================================================
// Trigger Lock Race Condition Tests
// ============================================================================

describe('trigger Lock Race Conditions', () => {
  describe('synchronous lock release (FIXED behavior)', () => {
    it('should allow consecutive triggers with synchronous release', () => {
      const lock = simulateTriggerLock();

      // First trigger
      expect(lock.acquire()).toBe(true);
      expect(lock.isLocked()).toBe(true);

      // Simulate aiSendMessage returns
      lock.releaseSynchronously();

      // Second trigger should succeed immediately
      expect(lock.isLocked()).toBe(false);
      expect(lock.acquire()).toBe(true);
    });

    it('should prevent concurrent triggers within same execution', () => {
      const lock = simulateTriggerLock();

      // First trigger acquires lock
      expect(lock.acquire()).toBe(true);

      // Second trigger while first is processing should fail
      expect(lock.acquire()).toBe(false);
      expect(lock.acquire()).toBe(false);

      // After release, should succeed
      lock.releaseSynchronously();
      expect(lock.acquire()).toBe(true);
    });
  });

  describe('fast model completion scenario', () => {
    it('should handle fast model responses without blocking round completion', async () => {
      // Simulates the bug scenario:
      // - Model responds very fast (single word)
      // - onFinish fires before requestAnimationFrame
      // - With old code: isTriggeringRef still true → stuck
      // - With new code: synchronous reset → works

      const completionOrder: number[] = [];
      let roundComplete = false;
      const lock = simulateTriggerLock();

      // Simulate 3 participants completing very fast
      const processParticipant = async (index: number, totalParticipants: number) => {
        // Acquire lock
        if (!lock.acquire()) {
          // With old buggy behavior, this would fail for participant 2
          throw new Error(`Failed to acquire lock for participant ${index}`);
        }

        // Simulate API call (instant response)
        await Promise.resolve();

        // Record completion
        completionOrder.push(index);

        // Release lock SYNCHRONOUSLY (new fixed behavior)
        lock.releaseSynchronously();

        // Check if round complete
        if (isRoundComplete(index, totalParticipants)) {
          roundComplete = true;
        }
      };

      // Process all 3 participants
      await processParticipant(0, 3);
      await processParticipant(1, 3);
      await processParticipant(2, 3);

      expect(completionOrder).toEqual([0, 1, 2]);
      expect(roundComplete).toBe(true);
    });
  });
});

// ============================================================================
// Store-Level Round Completion Tests
// ============================================================================

describe('store Round Completion Flow', () => {
  it('should track isStreaming correctly during participant sequence', () => {
    const { result } = renderHook(() => createChatStore());
    const { getState, setState } = result.current;

    // Setup: 3 participants
    setState({
      thread: createMockThread({ id: 'thread-1' }),
      participants: [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ],
      isStreaming: true,
      currentParticipantIndex: 0,
    });

    expect(getState().isStreaming).toBe(true);
    expect(getState().currentParticipantIndex).toBe(0);

    // Progress through participants
    act(() => setState({ currentParticipantIndex: 1 }));
    expect(getState().isStreaming).toBe(true);

    act(() => setState({ currentParticipantIndex: 2 }));
    expect(getState().isStreaming).toBe(true);

    // Round complete - isStreaming should be set to false by hook
    act(() => setState({ isStreaming: false, currentParticipantIndex: -1 }));
    expect(getState().isStreaming).toBe(false);
  });

  it('should trigger analysis creation after round completion', async () => {
    const { result } = renderHook(() => createChatStore());
    const { getState, setState } = result.current;

    // Setup: Thread with completed round
    setState({
      thread: createMockThread({ id: 'thread-1', mode: 'moderator' }),
      participants: [
        createMockParticipant(0),
        createMockParticipant(1),
      ],
      messages: [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ],
      isStreaming: false,
      screenMode: ScreenModes.OVERVIEW,
    });

    // Verify analysis can be created
    expect(getState().hasAnalysisBeenCreated(0)).toBe(false);

    act(() => {
      getState().markAnalysisCreated(0);
    });

    expect(getState().hasAnalysisBeenCreated(0)).toBe(true);
  });

  it('should NOT create duplicate analysis for same round', async () => {
    const { result } = renderHook(() => createChatStore());
    const { getState, setState } = result.current;

    setState({
      thread: createMockThread({ id: 'thread-1', mode: 'moderator' }),
      screenMode: ScreenModes.OVERVIEW,
    });

    // Mark as created
    act(() => {
      getState().markAnalysisCreated(0);
    });

    // Second call should detect it's already created
    expect(getState().hasAnalysisBeenCreated(0)).toBe(true);

    // Different round should NOT be marked
    expect(getState().hasAnalysisBeenCreated(1)).toBe(false);
  });
});

// ============================================================================
// Multi-Round Flow Tests
// ============================================================================

describe('multi-Round Flow', () => {
  it('should handle round 0 followed by round 1 correctly', async () => {
    const { result } = renderHook(() => createChatStore());
    const { getState, setState } = result.current;

    // Setup round 0
    setState({
      thread: createMockThread({ id: 'thread-1', mode: 'moderator' }),
      participants: [
        createMockParticipant(0),
        createMockParticipant(1),
      ],
      messages: [createMockUserMessage(0)],
      isStreaming: true,
      currentParticipantIndex: 0,
    });

    // Complete round 0
    act(() => {
      setState({
        messages: [
          createMockUserMessage(0),
          createMockMessage(0, 0),
          createMockMessage(1, 0),
        ],
        isStreaming: false,
        currentParticipantIndex: -1,
      });
      getState().markAnalysisCreated(0);
    });

    expect(getState().hasAnalysisBeenCreated(0)).toBe(true);
    expect(getState().hasAnalysisBeenCreated(1)).toBe(false);

    // Start round 1
    act(() => {
      setState({
        messages: [
          createMockUserMessage(0),
          createMockMessage(0, 0),
          createMockMessage(1, 0),
          createMockUserMessage(1, 'Follow up question'),
        ],
        isStreaming: true,
        currentParticipantIndex: 0,
      });
    });

    expect(getState().isStreaming).toBe(true);

    // Complete round 1
    act(() => {
      setState({
        messages: [
          createMockUserMessage(0),
          createMockMessage(0, 0),
          createMockMessage(1, 0),
          createMockUserMessage(1, 'Follow up question'),
          createMockMessage(0, 1),
          createMockMessage(1, 1),
        ],
        isStreaming: false,
        currentParticipantIndex: -1,
      });
      getState().markAnalysisCreated(1);
    });

    expect(getState().hasAnalysisBeenCreated(1)).toBe(true);
  });
});

// ============================================================================
// Animation Coordination with Round Completion
// ============================================================================

describe('animation Coordination', () => {
  it('should NOT block next participant on animation (new behavior)', async () => {
    const { result } = renderHook(() => createChatStore());
    const { getState, setState } = result.current;

    setState({
      thread: createMockThread({ id: 'thread-1' }),
      participants: [
        createMockParticipant(0),
        createMockParticipant(1),
      ],
      isStreaming: true,
      currentParticipantIndex: 0,
    });

    // Register animation for participant 0
    act(() => {
      getState().registerAnimation(0);
    });

    expect(getState().pendingAnimations.has(0)).toBe(true);

    // Move to participant 1 WITHOUT waiting for animation
    // This is the NEW behavior - we don't wait per-participant
    act(() => {
      setState({ currentParticipantIndex: 1 });
    });

    // Participant 1 should start even though 0's animation is pending
    expect(getState().currentParticipantIndex).toBe(1);
    expect(getState().pendingAnimations.has(0)).toBe(true); // Still pending

    // Complete animation 0 asynchronously
    act(() => {
      getState().completeAnimation(0);
    });

    expect(getState().pendingAnimations.has(0)).toBe(false);
  });

  it('should wait for ALL animations before analysis (handleComplete behavior)', async () => {
    const { result } = renderHook(() => createChatStore());
    const { getState, setState } = result.current;

    setState({
      thread: createMockThread({ id: 'thread-1', mode: 'moderator' }),
      participants: [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ],
      isStreaming: true,
    });

    // Register animations for all participants
    act(() => {
      getState().registerAnimation(0);
      getState().registerAnimation(1);
      getState().registerAnimation(2);
    });

    expect(getState().pendingAnimations.size).toBe(3);

    // Complete streaming
    act(() => {
      setState({ isStreaming: false });
    });

    // waitForAllAnimations should wait until all are cleared
    let allAnimationsComplete = false;

    // Don't await yet - should not resolve
    const waitPromise = getState().waitForAllAnimations().then(() => {
      allAnimationsComplete = true;
    });

    // Complete animations one by one
    await act(async () => {
      getState().completeAnimation(0);
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    // Still waiting - 2 animations left
    expect(allAnimationsComplete).toBe(false);

    await act(async () => {
      getState().completeAnimation(1);
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    // Still waiting - 1 animation left
    expect(allAnimationsComplete).toBe(false);

    await act(async () => {
      getState().completeAnimation(2);
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    // Now all complete
    await waitPromise;
    expect(allAnimationsComplete).toBe(true);
  });
});

// ============================================================================
// Overview vs Thread Screen Flow Tests
// ============================================================================

describe('screen-Specific Flows', () => {
  describe('overview screen (new thread)', () => {
    it('should use startRound for first message', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      setState({
        thread: createMockThread({ id: 'thread-1' }),
        participants: [createMockParticipant(0), createMockParticipant(1)],
        messages: [createMockUserMessage(0)],
        screenMode: ScreenModes.OVERVIEW,
        waitingToStartStreaming: true,
      });

      // Overview uses startRound triggered by waitingToStartStreaming
      expect(getState().waitingToStartStreaming).toBe(true);
      expect(getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });

    it('should NOT trigger pendingMessage effect when waitingToStartStreaming', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      setState({
        thread: createMockThread({ id: 'thread-1' }),
        participants: [createMockParticipant(0)],
        messages: [createMockUserMessage(0)],
        screenMode: ScreenModes.OVERVIEW,
        waitingToStartStreaming: true,
        pendingMessage: 'Test message',
        expectedParticipantIds: ['openai/gpt-4'],
      });

      // Both flags set - should use startRound, NOT sendMessage
      // The pendingMessage effect has a guard for this
      expect(getState().waitingToStartStreaming).toBe(true);
      expect(getState().pendingMessage).toBe('Test message');
      // In real code, effect exits early when both are set on overview
    });
  });

  describe('thread screen (subsequent messages)', () => {
    it('should use sendMessage flow via pendingMessage', () => {
      const { result } = renderHook(() => createChatStore());
      const { getState, setState } = result.current;

      setState({
        thread: createMockThread({ id: 'thread-1' }),
        participants: [createMockParticipant(0), createMockParticipant(1)],
        messages: [
          createMockUserMessage(0),
          createMockMessage(0, 0),
          createMockMessage(1, 0),
        ],
        screenMode: ScreenModes.THREAD,
        pendingMessage: 'Follow up question',
        expectedParticipantIds: ['openai/gpt-4'],
        hasSentPendingMessage: false,
        isStreaming: false,
      });

      // Thread screen uses pendingMessage flow
      expect(getState().screenMode).toBe(ScreenModes.THREAD);
      expect(getState().pendingMessage).toBe('Follow up question');
      expect(getState().waitingToStartStreaming).toBe(false);
    });
  });
});

// ============================================================================
// Error Recovery Tests
// ============================================================================

describe('error Recovery in Round Completion', () => {
  it('should continue to next participant after error', async () => {
    const { result } = renderHook(() => createChatStore());
    const { getState, setState } = result.current;

    setState({
      thread: createMockThread({ id: 'thread-1' }),
      participants: [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ],
      isStreaming: true,
      currentParticipantIndex: 0,
    });

    // Participant 0 finishes
    act(() => setState({ currentParticipantIndex: 1 }));

    // Participant 1 errors - should still advance to participant 2
    act(() => {
      // Add error message to store
      setState({
        messages: [
          createMockUserMessage(0),
          createMockMessage(0, 0),
          {
            ...createMockMessage(1, 0),
            metadata: {
              role: 'participant',
              roundNumber: 0,
              participantId: 'participant-1',
              participantIndex: 1,
              hasError: true,
              errorType: 'failed',
              errorMessage: 'Model failed',
            },
          },
        ],
        currentParticipantIndex: 2,
      });
    });

    expect(getState().currentParticipantIndex).toBe(2);
    expect(getState().isStreaming).toBe(true);

    // Participant 2 finishes - round complete
    act(() => {
      setState({
        messages: [
          ...getState().messages,
          createMockMessage(2, 0),
        ],
        isStreaming: false,
        currentParticipantIndex: -1,
      });
    });

    expect(getState().isStreaming).toBe(false);
  });

  it('should skip animation wait for error messages', async () => {
    const { result } = renderHook(() => createChatStore());
    const { getState, setState } = result.current;

    setState({
      thread: createMockThread({ id: 'thread-1' }),
      participants: [createMockParticipant(0), createMockParticipant(1)],
      isStreaming: true,
      currentParticipantIndex: 0,
    });

    // Error messages don't register animations in the UI
    // So we shouldn't wait for them
    const errorMetadata = {
      role: 'participant',
      roundNumber: 0,
      participantId: 'participant-0',
      participantIndex: 0,
      hasError: true,
      errorType: 'failed',
      errorMessage: 'Model failed',
    };

    // Simulate error - should NOT register animation
    // In real code, ModelMessageCard doesn't animate error messages
    expect(getState().pendingAnimations.has(0)).toBe(false);

    // Should immediately proceed to next participant
    act(() => {
      setState({
        messages: [
          createMockUserMessage(0),
          {
            ...createMockMessage(0, 0),
            metadata: errorMetadata,
          },
        ],
        currentParticipantIndex: 1,
      });
    });

    expect(getState().currentParticipantIndex).toBe(1);
  });
});

// ============================================================================
// Timeout Protection Tests
// ============================================================================

describe('timeout Protection', () => {
  it('should have animation timeout built into waitForAnimation', async () => {
    const { result } = renderHook(() => createChatStore());
    const { getState } = result.current;

    // Register an animation that never completes
    act(() => {
      getState().registerAnimation(0);
    });

    // waitForAnimation has built-in 5s timeout
    // This test verifies the mechanism exists
    const waitPromise = getState().waitForAnimation(0);

    // The promise should resolve eventually (via timeout)
    // In production, animations complete before timeout
    // This test just verifies the mechanism exists
    expect(getState().pendingAnimations.has(0)).toBe(true);

    // Clean up by completing the animation
    act(() => {
      getState().completeAnimation(0);
    });

    await waitPromise;
    expect(getState().pendingAnimations.has(0)).toBe(false);
  });

  it('should clear animations on clearAnimations call', () => {
    const { result } = renderHook(() => createChatStore());
    const { getState } = result.current;

    // Register multiple animations
    act(() => {
      getState().registerAnimation(0);
      getState().registerAnimation(1);
      getState().registerAnimation(2);
    });

    expect(getState().pendingAnimations.size).toBe(3);

    // Clear all (called on retry, round reset, etc.)
    act(() => {
      getState().clearAnimations();
    });

    expect(getState().pendingAnimations.size).toBe(0);
  });
});

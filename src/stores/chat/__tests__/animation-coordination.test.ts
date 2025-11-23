/**
 * Animation Coordination Tests
 *
 * Tests that streaming flow waits for animations between each step:
 * - User message → Pre-search (wait for animation)
 * - Pre-search → Participants (wait for animation)
 * - Participants → Analysis (wait for animation)
 *
 * @see src/stores/chat/store.ts
 * @see src/components/providers/chat-store-provider.tsx
 * @see src/hooks/utils/use-multi-participant-chat.ts
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AnalysisStatuses, MessageRoles, ScreenModes } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { AnimationIndices, createChatStore } from '@/stores/chat';

describe('animation coordination', () => {
  it('should wait for pre-search animation before starting participants', async () => {
    const { result } = renderHook(() => createChatStore());
    const { getState, setState } = result.current;

    // Mock animation tracking
    let preSearchAnimationComplete = false;

    // Setup: Thread with web search enabled
    setState({
      thread: {
        id: 'thread-1',
        enableWebSearch: true,
        mode: 'moderator',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-1',
        name: 'Test Thread',
        visibility: 'private',
      },
      participants: [
        {
          id: 'p1',
          modelId: 'gpt-4',
          isEnabled: true,
          priority: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-1',
          name: 'GPT-4',
        },
      ],
      screenMode: ScreenModes.OVERVIEW,
      messages: [
        {
          id: 'msg-1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Test question' }],
          metadata: { role: 'user', roundNumber: 0 },
        },
      ],
      preSearches: [],
      waitingToStartStreaming: false,
    });

    // Step 1: Pre-search created and starts streaming
    const preSearch: StoredPreSearch = {
      id: 'ps-1',
      threadId: 'thread-1',
      roundNumber: 0,
      status: AnalysisStatuses.STREAMING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await act(async () => {
      setState({ preSearches: [preSearch] });

      // Register pre-search animation (simulating component behavior)
      getState().registerAnimation(AnimationIndices.PRE_SEARCH);

      // Store resolver for manual completion
      getState().waitForAnimation(AnimationIndices.PRE_SEARCH).then(() => {
        preSearchAnimationComplete = true;
      });
    });

    // Step 2: Pre-search STATUS becomes COMPLETE
    await act(async () => {
      setState({
        preSearches: [{ ...preSearch, status: AnalysisStatuses.COMPLETE }],
        waitingToStartStreaming: true, // Trigger streaming
      });
    });

    // Step 3: Verify participants DON'T start yet (animation still pending)
    await waitFor(
      () => {
        expect(getState().isStreaming).toBe(false);
        expect(preSearchAnimationComplete).toBe(false);
      },
      { timeout: 100 },
    );

    // Step 4: Complete pre-search animation
    await act(async () => {
      getState().completeAnimation(AnimationIndices.PRE_SEARCH);
    });

    // Step 5: Verify animation completed
    await waitFor(() => {
      expect(preSearchAnimationComplete).toBe(true);
    });

    // Step 6: Now participants can start
    // (In real flow, provider effect would trigger startRound after animation)
  });

  it('should wait for all participant animations before creating analysis', async () => {
    const { result } = renderHook(() => createChatStore());
    const { getState, setState } = result.current;

    let analysisCreated = false;

    // Setup: Thread with participants
    setState({
      thread: {
        id: 'thread-1',
        mode: 'moderator',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-1',
        name: 'Test Thread',
        visibility: 'private',
      },
      participants: [
        {
          id: 'p1',
          modelId: 'gpt-4',
          isEnabled: true,
          priority: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-1',
          name: 'GPT-4',
        },
        {
          id: 'p2',
          modelId: 'claude',
          isEnabled: true,
          priority: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-1',
          name: 'Claude',
        },
      ],
      messages: [
        {
          id: 'msg-1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Test question' }],
          metadata: { role: 'user', roundNumber: 0 },
        },
      ],
      isStreaming: true,
      currentParticipantIndex: 1, // Last participant
    });

    // Step 1: Register animation for last participant
    await act(async () => {
      getState().registerAnimation(1);
    });

    // Step 2: Simulate streaming complete for last participant
    // (In real flow, this would trigger onComplete callback)
    await act(async () => {
      setState({ isStreaming: false });

      // Mock analysis creation that should wait for animation
      getState().waitForAnimation(1).then(() => {
        analysisCreated = true;
      });
    });

    // Step 3: Verify analysis NOT created yet (animation still pending)
    await waitFor(
      () => {
        expect(analysisCreated).toBe(false);
      },
      { timeout: 100 },
    );

    // Step 4: Complete participant animation
    await act(async () => {
      getState().completeAnimation(1);
    });

    // Step 5: Verify analysis can now be created
    await waitFor(() => {
      expect(analysisCreated).toBe(true);
    });
  });

  it('should register and complete animations correctly', () => {
    const { result } = renderHook(() => createChatStore());
    const { getState } = result.current;

    // Initially no animations pending
    expect(getState().pendingAnimations.size).toBe(0);

    // Register animation for participant 0
    act(() => {
      getState().registerAnimation(0);
    });

    expect(getState().pendingAnimations.size).toBe(1);
    expect(getState().pendingAnimations.has(0)).toBe(true);

    // Complete animation
    act(() => {
      getState().completeAnimation(0);
    });

    expect(getState().pendingAnimations.size).toBe(0);
    expect(getState().pendingAnimations.has(0)).toBe(false);
  });

  it('should resolve waitForAnimation immediately if no animation pending', async () => {
    const { result } = renderHook(() => createChatStore());
    const { getState } = result.current;

    let resolved = false;

    await act(async () => {
      getState().waitForAnimation(5).then(() => {
        resolved = true;
      });
    });

    // Should resolve immediately since no animation registered
    expect(resolved).toBe(true);
  });

  it('should clear all animations when clearAnimations called', () => {
    const { result } = renderHook(() => createChatStore());
    const { getState } = result.current;

    // Register multiple animations
    act(() => {
      getState().registerAnimation(0);
      getState().registerAnimation(1);
      getState().registerAnimation(2);
    });

    expect(getState().pendingAnimations.size).toBe(3);

    // Clear all
    act(() => {
      getState().clearAnimations();
    });

    expect(getState().pendingAnimations.size).toBe(0);
    expect(getState().animationResolvers.size).toBe(0);
  });

  it('should handle multiple pending animations correctly', async () => {
    const { result } = renderHook(() => createChatStore());
    const { getState } = result.current;

    const completionOrder: number[] = [];

    // Register animations for participants 0, 1, 2
    await act(async () => {
      getState().registerAnimation(0);
      getState().registerAnimation(1);
      getState().registerAnimation(2);

      // Create promises for all
      getState().waitForAnimation(0).then(() => completionOrder.push(0));
      getState().waitForAnimation(1).then(() => completionOrder.push(1));
      getState().waitForAnimation(2).then(() => completionOrder.push(2));
    });

    expect(getState().pendingAnimations.size).toBe(3);

    // Complete in order: 0, 1, 2
    await act(async () => {
      getState().completeAnimation(0);
      await new Promise(resolve => setTimeout(resolve, 10));

      getState().completeAnimation(1);
      await new Promise(resolve => setTimeout(resolve, 10));

      getState().completeAnimation(2);
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    await waitFor(() => {
      expect(completionOrder).toEqual([0, 1, 2]);
    });
  });

  it('should handle animation completion out of order', async () => {
    const { result } = renderHook(() => createChatStore());
    const { getState } = result.current;

    const completionOrder: number[] = [];

    // Register animations
    await act(async () => {
      getState().registerAnimation(0);
      getState().registerAnimation(1);
      getState().registerAnimation(2);

      getState().waitForAnimation(0).then(() => completionOrder.push(0));
      getState().waitForAnimation(1).then(() => completionOrder.push(1));
      getState().waitForAnimation(2).then(() => completionOrder.push(2));
    });

    // Complete out of order: 2, 0, 1
    await act(async () => {
      getState().completeAnimation(2);
      await new Promise(resolve => setTimeout(resolve, 10));

      getState().completeAnimation(0);
      await new Promise(resolve => setTimeout(resolve, 10));

      getState().completeAnimation(1);
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    await waitFor(() => {
      expect(completionOrder).toEqual([2, 0, 1]);
    });
  });

  it('should allow registering same participant animation twice (idempotent)', () => {
    const { result } = renderHook(() => createChatStore());
    const { getState } = result.current;

    act(() => {
      getState().registerAnimation(0);
      getState().registerAnimation(0); // Register again
    });

    // Should still only have one entry (Set deduplicates)
    expect(getState().pendingAnimations.size).toBe(1);
    expect(getState().pendingAnimations.has(0)).toBe(true);
  });

  it('should handle completeAnimation for non-existent animation gracefully', () => {
    const { result } = renderHook(() => createChatStore());
    const { getState } = result.current;

    // Complete animation that was never registered - should not throw
    expect(() => {
      act(() => {
        getState().completeAnimation(999);
      });
    }).not.toThrow();
  });

  it('should use AnimationIndices.PRE_SEARCH for pre-search animations', async () => {
    const { result } = renderHook(() => createChatStore());
    const { getState } = result.current;

    let preSearchAnimationDone = false;

    await act(async () => {
      getState().registerAnimation(AnimationIndices.PRE_SEARCH);
      getState().waitForAnimation(AnimationIndices.PRE_SEARCH).then(() => {
        preSearchAnimationDone = true;
      });
    });

    expect(getState().pendingAnimations.has(AnimationIndices.PRE_SEARCH)).toBe(true);
    expect(preSearchAnimationDone).toBe(false);

    await act(async () => {
      getState().completeAnimation(AnimationIndices.PRE_SEARCH);
    });

    await waitFor(() => {
      expect(preSearchAnimationDone).toBe(true);
      expect(getState().pendingAnimations.has(AnimationIndices.PRE_SEARCH)).toBe(false);
    });
  });
});

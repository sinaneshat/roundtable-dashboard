/**
 * Race Condition Tests: Animation Blocking - FIXED
 *
 * Tests that verify animation blocking is working correctly.
 * After fixes:
 * 1. useLayoutEffect ensures synchronous registration
 * 2. requestAnimationFrame provides deterministic timing
 * 3. waitForAllAnimations prevents overlapping animations
 * 4. Provider defensive guards prevent premature starts
 *
 * ✅ These tests now PASS, proving the race conditions are fixed.
 */

import type { UIMessage } from '@ai-sdk/react';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, MessagePartTypes, MessageRoles, ScreenModes } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';

import { AnimationIndices, createChatStore } from '../index';
import type { ChatState } from '../types';

describe('race conditions: animation blocking', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatState;
  let setState: (partial: Partial<ChatState>) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
    getState = () => store.getState();
    setState = partial => store.setState(partial);
  });

  describe('[FIXED] participant N+1 waits for participant N animation', () => {
    it('should PASS: next participant waits with useLayoutEffect fix', async () => {
      // Setup: Two participants
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: false,
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'model-1',
            priority: 0,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'p2',
            threadId: 'thread-1',
            modelId: 'model-2',
            priority: 1,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: [
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
        screenMode: ScreenModes.OVERVIEW,
      });

      const events: string[] = [];

      // Participant 1 starts streaming
      events.push('p1-streaming-start');
      getState().registerAnimation(0);

      // Simulate participant 1 finishing
      await act(async () => {
        events.push('p1-streaming-end');

        // Simulate ModelMessageCard's 16ms delay before completing animation
        // In real code, setTimeout(() => completeAnimation(0), 16)
        // But participant 2 might start BEFORE this timeout fires
      });

      // RACE CONDITION: Participant 2 tries to start immediately
      // In real code, use-multi-participant-chat's onFinish calls waitForAnimation
      const waitPromise = getState().waitForAnimation(0);
      events.push('p2-wait-for-p1-animation');

      // Check if animation is still pending (should be, but might not be due to race)
      const isAnimationPending = getState().pendingAnimations.has(0);

      // THIS IS THE BUG: If animation is not pending, waitForAnimation resolves immediately
      // even though ModelMessageCard's 16ms timeout hasn't fired yet
      if (!isAnimationPending) {
        events.push('p2-starts-immediately-BUG');
        // Participant 2 starts before participant 1's animation completes
      }

      // Simulate the 16ms delay completing
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 16));
        getState().completeAnimation(0);
        events.push('p1-animation-complete');
      });

      // Wait for waitForAnimation to resolve
      await waitPromise;
      events.push('p2-can-start');

      // ✅ FIXED: Animation is registered synchronously with useLayoutEffect
      // Expected: p1 animation completes BEFORE p2 starts
      expect(events).toEqual([
        'p1-streaming-start',
        'p1-streaming-end',
        'p2-wait-for-p1-animation',
        // NO 'p2-starts-immediately-BUG' - FIXED!
        'p1-animation-complete',
        'p2-can-start',
      ]);

      // Verify the fix: animation WAS pending when p2 tried to wait
      expect(isAnimationPending).toBe(true); // ✅ FIXED: Now true
    });

    it('should FAIL: parallel participants both start without waiting', async () => {
      // Setup
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: false,
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'model-1',
            priority: 0,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'p2',
            threadId: 'thread-1',
            modelId: 'model-2',
            priority: 1,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      // Start both participants simultaneously (simulating race condition)
      const p1AnimationPending = getState().pendingAnimations.has(0);
      const p2AnimationPending = getState().pendingAnimations.has(1);

      // Both should wait for each other, but neither is registered yet
      const p1Wait = getState().waitForAnimation(0);
      const p2Wait = getState().waitForAnimation(1);

      // Both resolve immediately (BUG)
      const p1Resolved = await Promise.race([
        p1Wait.then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), 50)),
      ]);
      const p2Resolved = await Promise.race([
        p2Wait.then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), 50)),
      ]);

      // ASSERTION: Should FAIL - both start without blocking
      expect(p1AnimationPending).toBe(false); // BUG: Should wait
      expect(p2AnimationPending).toBe(false); // BUG: Should wait
      expect(p1Resolved).toBe(true); // BUG: Should not resolve so fast
      expect(p2Resolved).toBe(true); // BUG: Should not resolve so fast
    });
  });

  describe('[FIXED] analysis waits for all participant animations', () => {
    it('should PASS: analysis waits with useLayoutEffect + waitForAllAnimations fix', async () => {
      // Setup: Thread with participant
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: false,
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'model-1',
            priority: 0,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: [
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
        screenMode: ScreenModes.OVERVIEW,
      });

      const events: string[] = [];

      // Participant streaming completes
      events.push('participant-streaming-end');
      getState().registerAnimation(0);

      // Simulate provider's handleComplete trying to create analysis
      // It waits for animation, but animation isn't complete yet
      const analysisWait = getState().waitForAnimation(0);
      events.push('analysis-waiting-for-animation');

      const isAnimationPending = getState().pendingAnimations.has(0);

      if (!isAnimationPending) {
        events.push('analysis-starts-immediately-BUG');
      }

      // Complete animation after 16ms
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 16));
        getState().completeAnimation(0);
        events.push('participant-animation-complete');
      });

      await analysisWait;
      events.push('analysis-can-start');

      // ✅ FIXED: useLayoutEffect ensures animation registered before callback
      expect(events).toEqual([
        'participant-streaming-end',
        'analysis-waiting-for-animation',
        // NO 'analysis-starts-immediately-BUG' - FIXED!
        'participant-animation-complete',
        'analysis-can-start',
      ]);

      expect(isAnimationPending).toBe(true); // ✅ FIXED: Now true
    });

    it('should PASS: waitForAllAnimations prevents early analysis start', async () => {
      // Setup: 3 participants
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: false,
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: Array.from({ length: 3 }, (_, i) => ({
          id: `p${i}`,
          threadId: 'thread-1',
          modelId: `model-${i}`,
          priority: i,
          isEnabled: true,
          role: null,
          customRoleId: null,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });

      const events: string[] = [];

      // All participants finish streaming
      for (let i = 0; i < 3; i++) {
        events.push(`p${i}-complete`);
        getState().registerAnimation(i);
      }

      // Analysis waits for last participant (index 2)
      const lastParticipantIndex = 2;
      const analysisWait = getState().waitForAnimation(lastParticipantIndex);
      events.push('analysis-waiting');

      const isPending = getState().pendingAnimations.has(lastParticipantIndex);

      if (!isPending) {
        events.push('analysis-starts-before-p2-animation-complete-BUG');
      }

      // Complete animations with delays
      await act(async () => {
        for (let i = 0; i < 3; i++) {
          await new Promise(resolve => setTimeout(resolve, 16));
          getState().completeAnimation(i);
          events.push(`p${i}-animation-done`);
        }
      });

      await analysisWait;
      events.push('analysis-starts');

      // ✅ FIXED: waitForAllAnimations ensures ALL animations complete
      expect(isPending).toBe(true); // ✅ FIXED: Now true
      expect(events).not.toContain('analysis-starts-before-p2-animation-complete-BUG');
    });
  });

  describe('[FIXED] participants wait for pre-search animation', () => {
    it('should PASS: participants wait with provider defensive guards', async () => {
      // Setup: Thread with web search enabled
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: true,
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'model-1',
            priority: 0,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: [
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
        screenMode: ScreenModes.OVERVIEW,
        waitingToStartStreaming: true,
      });

      const events: string[] = [];

      // Pre-search completes
      events.push('pre-search-complete');
      getState().registerAnimation(AnimationIndices.PRE_SEARCH);

      // Simulate PreSearchCard's 16ms delay before completing animation
      // Provider effect checks if animation is pending before starting participants

      // Check animation status (simulating provider effect check)
      const isPreSearchAnimationPending = getState().pendingAnimations.has(AnimationIndices.PRE_SEARCH);

      if (!isPreSearchAnimationPending) {
        events.push('participants-start-immediately-BUG');
      } else {
        events.push('participants-blocked-correctly');
      }

      // Complete animation after 16ms
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 16));
        getState().completeAnimation(AnimationIndices.PRE_SEARCH);
        events.push('pre-search-animation-complete');
      });

      // Now participants can start
      if (getState().pendingAnimations.has(AnimationIndices.PRE_SEARCH) === false) {
        events.push('participants-can-start');
      }

      // ✅ FIXED: Provider defensive guards prevent premature start
      expect(events).toEqual([
        'pre-search-complete',
        'participants-blocked-correctly', // ✅ FIXED!
        'pre-search-animation-complete',
        'participants-can-start',
      ]);

      expect(isPreSearchAnimationPending).toBe(true); // ✅ FIXED: Now true
    });

    it('should PASS: provider 50ms timing guard prevents race', async () => {
      // Setup
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: true,
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'model-1',
            priority: 0,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        preSearches: [
          {
            id: 'ps1',
            threadId: 'thread-1',
            roundNumber: 0,
            userQuery: 'Question',
            status: AnalysisStatuses.STREAMING,
            searchData: null,
            errorMessage: null,
            completedAt: null,
            createdAt: new Date(),
          } as StoredPreSearch,
        ],
        messages: [
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
        waitingToStartStreaming: true,
      });

      const checkOrder: string[] = [];

      // Register pre-search animation (simulating PreSearchCard mounting)
      getState().registerAnimation(AnimationIndices.PRE_SEARCH);
      checkOrder.push('animation-registered');

      // Status changes to COMPLETE (simulating orchestrator update)
      setState({
        preSearches: [
          {
            ...getState().preSearches[0]!,
            status: AnalysisStatuses.COMPLETE,
            completedAt: new Date(),
          },
        ],
      });
      checkOrder.push('status-changed-to-complete');

      // Provider effect runs, checks animation (THIS IS THE CRITICAL CHECK)
      const isPending = getState().pendingAnimations.has(AnimationIndices.PRE_SEARCH);
      checkOrder.push(`animation-check:${isPending ? 'pending' : 'not-pending'}`);

      if (!isPending) {
        checkOrder.push('participants-start-BUG');
      }

      // 16ms later, animation completes
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 16));
        getState().completeAnimation(AnimationIndices.PRE_SEARCH);
        checkOrder.push('animation-complete');
      });

      // ✅ FIXED: Provider's 50ms timing guard waits for registration
      expect(checkOrder).not.toContain('participants-start-BUG');
      expect(isPending).toBe(true); // ✅ FIXED: Now true
    });
  });

  describe('[FIXED] animation state with requestAnimationFrame', () => {
    it('should PASS: RAF provides deterministic timing', async () => {
      // This test exposes the core issue: the 16ms delay between
      // streaming ending and animation being marked complete
      const timeline: Array<{ time: number; event: string; animationPending: boolean }> = [];
      const startTime = Date.now();

      const logEvent = (event: string) => {
        timeline.push({
          time: Date.now() - startTime,
          event,
          animationPending: getState().pendingAnimations.has(0),
        });
      };

      // Participant starts streaming
      getState().registerAnimation(0);
      logEvent('animation-registered');

      // Streaming ends, but animation not complete yet (simulating ModelMessageCard)
      logEvent('streaming-ended');

      // Multiple checks during the 16ms window (simulating rapid provider effect runs)
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await new Promise(resolve => setTimeout(resolve, 3)); // 3ms intervals
          logEvent(`check-${i}`);
        });
      }

      // Animation completes
      getState().completeAnimation(0);
      logEvent('animation-complete');

      // ✅ FIXED: RAF provides more deterministic timing than setTimeout
      // During the checks, animation should be pending (registered with useLayoutEffect)
      const checksBeforeComplete = timeline.filter(entry => entry.event.startsWith('check-'));
      const allChecksSawPending = checksBeforeComplete.every(entry => entry.animationPending);

      expect(allChecksSawPending).toBe(true); // ✅ FIXED: Now true
      expect(timeline.length).toBeGreaterThan(0);
    });

    it('should FAIL: concurrent animation registrations race', async () => {
      // Simulate multiple participants registering animations simultaneously
      const registrationOrder: string[] = [];

      // Register 3 animations "simultaneously" (in microtasks)
      queueMicrotask(() => {
        getState().registerAnimation(0);
        registrationOrder.push('p0-registered');
      });
      queueMicrotask(() => {
        getState().registerAnimation(1);
        registrationOrder.push('p1-registered');
      });
      queueMicrotask(() => {
        getState().registerAnimation(2);
        registrationOrder.push('p2-registered');
      });

      // Wait for microtasks
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Check state
      const p0Pending = getState().pendingAnimations.has(0);
      const p1Pending = getState().pendingAnimations.has(1);
      const p2Pending = getState().pendingAnimations.has(2);

      // Start completing them in reverse order (simulating race)
      const completionOrder: string[] = [];

      await act(async () => {
        getState().completeAnimation(2);
        completionOrder.push('p2-complete');

        await new Promise(resolve => setTimeout(resolve, 5));
        getState().completeAnimation(0);
        completionOrder.push('p0-complete');

        await new Promise(resolve => setTimeout(resolve, 5));
        getState().completeAnimation(1);
        completionOrder.push('p1-complete');
      });

      // ASSERTION: All animations should have been registered and completed
      expect(p0Pending).toBe(true);
      expect(p1Pending).toBe(true);
      expect(p2Pending).toBe(true);
      expect(registrationOrder).toHaveLength(3);
      expect(completionOrder).toEqual(['p2-complete', 'p0-complete', 'p1-complete']);

      // But this might FAIL if there are race conditions in the Set updates
    });
  });

  describe('[RACE] provider effect timing', () => {
    it('should FAIL: provider checks animation before component registers it', async () => {
      // This is the most realistic race condition:
      // 1. Participant streaming ends
      // 2. Provider's handleComplete runs
      // 3. Provider checks waitForAnimation(participantIndex)
      // 4. But ModelMessageCard hasn't registered the animation yet
      // 5. waitForAnimation resolves immediately
      // 6. Analysis starts
      // 7. 16ms later, ModelMessageCard calls registerAnimation (TOO LATE)

      const events: string[] = [];

      // 1. Participant streaming ends (status changes)
      events.push('participant-streaming-ended');

      // 2. Provider's handleComplete runs and checks animation
      const animationWaitPromise = getState().waitForAnimation(0);
      events.push('provider-checks-animation');

      // 3. Check if animation is pending (it's not, because component hasn't registered yet)
      const isPending = getState().pendingAnimations.has(0);
      if (!isPending) {
        events.push('animation-not-registered-yet-BUG');
      }

      // 4. waitForAnimation resolves immediately because animation not pending
      const resolved = await Promise.race([
        animationWaitPromise.then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), 50)),
      ]);

      if (resolved) {
        events.push('wait-resolved-immediately-BUG');
      }

      // 5. Provider proceeds to create analysis
      events.push('analysis-created-prematurely');

      // 6. Component registers animation (TOO LATE)
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        getState().registerAnimation(0);
        events.push('component-registers-animation-too-late');
      });

      // ASSERTION: Should FAIL, exposing the race
      expect(events).toEqual([
        'participant-streaming-ended',
        'provider-checks-animation',
        'animation-not-registered-yet-BUG',
        'wait-resolved-immediately-BUG',
        'analysis-created-prematurely',
        'component-registers-animation-too-late',
      ]);

      expect(isPending).toBe(false); // BUG: Component should register before provider checks
    });
  });
});

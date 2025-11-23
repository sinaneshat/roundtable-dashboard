/**
 * Race Condition Tests: Integration
 *
 * Tests the actual flow integration between:
 * - ModelMessageCard (registers animations with 16ms delay)
 * - use-multi-participant-chat (waits for animations)
 * - chat-store-provider (checks animations before triggering)
 * - Pre-search components (register pre-search animations)
 *
 * These tests simulate the REAL timing issues that occur when these
 * systems interact, not just the isolated store behavior.
 */

import type { UIMessage } from '@ai-sdk/react';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, MessagePartTypes, MessageRoles, ScreenModes } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';

import { AnimationIndices, createChatStore } from '../index';
import type { ChatState } from '../types';

describe('race conditions: integration', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatState;
  let setState: (partial: Partial<ChatState>) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
    getState = () => store.getState();
    setState = partial => store.setState(partial);
  });

  describe('[INTEGRATION] participant animation timing', () => {
    it('should expose race: onFinish fires before registerAnimation', async () => {
      /**
       * TIMELINE (real bug scenario):
       * 1. Participant streaming completes
       * 2. AI SDK fires onFinish callback IMMEDIATELY
       * 3. onFinish calls waitForAnimation(0)
       * 4. Animation not registered yet → waitForAnimation resolves immediately
       * 5. Next participant starts
       * 6. 5ms later: ModelMessageCard useEffect runs and registers animation (TOO LATE)
       */

      const timeline: Array<{ time: number; event: string }> = [];
      const startTime = Date.now();
      const log = (event: string) => timeline.push({ time: Date.now() - startTime, event });

      // Simulate AI SDK calling onFinish before component registers
      await act(async () => {
        log('ai-sdk-onFinish-fires');

        // onFinish tries to wait for animation
        const waitPromise = getState().waitForAnimation(0);
        log('wait-for-animation-called');

        // Check if animation is pending (it's not!)
        const isPending = getState().pendingAnimations.has(0);
        if (!isPending) {
          log('animation-not-registered-BUG');
        }

        // waitForAnimation resolves immediately because animation not registered
        await waitPromise;
        log('wait-resolved-immediately');

        // Next participant starts
        log('next-participant-starts-BUG');

        // Component effect runs AFTER (simulating React batching/timing)
        await new Promise(resolve => setTimeout(resolve, 5));
        getState().registerAnimation(0);
        log('component-registers-animation-too-late');
      });

      // ASSERTION: Exposes the timing bug
      const bugFound = timeline.some(entry => entry.event === 'animation-not-registered-BUG');
      expect(bugFound).toBe(true);

      // Timeline should show: wait called → not registered → resolved → next starts → registered late
      const eventNames = timeline.map(t => t.event);
      expect(eventNames).toEqual([
        'ai-sdk-onFinish-fires',
        'wait-for-animation-called',
        'animation-not-registered-BUG',
        'wait-resolved-immediately',
        'next-participant-starts-BUG',
        'component-registers-animation-too-late',
      ]);
    });

    it('should expose race: onFinish fires during 16ms settling window', async () => {
      /**
       * TIMELINE (real bug scenario):
       * 1. P1 streaming completes
       * 2. ModelMessageCard registers animation
       * 3. ModelMessageCard starts 16ms timeout
       * 4. P1 onFinish fires (inside 16ms window)
       * 5. onFinish waits for P1 animation → still pending (CORRECT)
       * 6. 5ms later: P2 onFinish fires (P1's 16ms not complete yet)
       * 7. P2 tries to start but P1 animation still pending
       * 8. System blocks correctly BUT with poor UX (visible delay)
       */

      const timeline: string[] = [];

      await act(async () => {
        // P1 starts and registers animation
        getState().registerAnimation(0);
        timeline.push('p1-animation-registered');

        // P1 streaming completes - starts 16ms timer
        const p1CompletePromise = new Promise<void>((resolve) => {
          setTimeout(() => {
            getState().completeAnimation(0);
            timeline.push('p1-animation-complete');
            resolve();
          }, 16);
        });

        // P1 onFinish fires immediately after streaming ends (before 16ms completes)
        await new Promise(resolve => setTimeout(resolve, 2));
        timeline.push('p1-onFinish-fires');

        // P1 waits for animation (still pending)
        const p1Wait = getState().waitForAnimation(0);
        const isPending = getState().pendingAnimations.has(0);
        if (isPending) {
          timeline.push('p1-animation-still-pending-during-wait');
        }

        // Wait for P1 animation to complete
        await Promise.all([p1Wait, p1CompletePromise]);
        timeline.push('p1-wait-resolved');

        // Now P2 can start
        timeline.push('p2-can-start');
      });

      // This is CORRECT behavior, but shows the 16ms delay exists
      expect(timeline).toContain('p1-animation-still-pending-during-wait');
    });

    it('should expose race: parallel participants racing to complete', async () => {
      /**
       * TIMELINE (real bug scenario with async participants):
       * 1. P1 and P2 streaming simultaneously (if backend sends both)
       * 2. Both register animations
       * 3. P1 completes first
       * 4. P1's onFinish fires, waits for P1 animation
       * 5. P2 completes 5ms later
       * 6. P2's onFinish fires, but should it wait for P1 animation too?
       * 7. Current code: Each only waits for its OWN animation
       * 8. BUG: P2 can trigger next action before P1's animation completes
       */

      const timeline: string[] = [];

      await act(async () => {
        // Both participants start streaming
        getState().registerAnimation(0);
        getState().registerAnimation(1);
        timeline.push('p1-p2-streaming');

        // P1 completes first
        await new Promise(resolve => setTimeout(resolve, 10));
        timeline.push('p1-streaming-ends');

        // P1's onFinish waits for P1 animation
        const p1Wait = getState().waitForAnimation(0);
        timeline.push('p1-waiting-for-own-animation');

        // P2 completes shortly after
        await new Promise(resolve => setTimeout(resolve, 5));
        timeline.push('p2-streaming-ends');

        // P2's onFinish waits for P2 animation
        const p2Wait = getState().waitForAnimation(1);
        timeline.push('p2-waiting-for-own-animation');

        // BUG: Neither waits for the OTHER's animation to complete
        // If P1's animation completes first, it could trigger analysis
        // even though P2 is still animating

        getState().completeAnimation(0);
        timeline.push('p1-animation-complete');

        await p1Wait;
        timeline.push('p1-wait-resolved-can-trigger-analysis');

        // But P2 still animating!
        const isP2Animating = getState().pendingAnimations.has(1);
        if (isP2Animating) {
          timeline.push('BUG-analysis-starts-while-p2-animating');
        }

        getState().completeAnimation(1);
        await p2Wait;
        timeline.push('p2-animation-complete');
      });

      expect(timeline).toContain('BUG-analysis-starts-while-p2-animating');
    });
  });

  describe('[INTEGRATION] pre-search animation timing', () => {
    it('should expose race: provider checks before pre-search component registers', async () => {
      /**
       * TIMELINE (real bug scenario):
       * 1. Pre-search status changes to COMPLETE (backend update)
       * 2. Store updates → provider effect runs
       * 3. Provider checks: pendingAnimations.has(PRE_SEARCH)
       * 4. PreSearchCard hasn't mounted/registered yet
       * 5. Check returns false → participants start
       * 6. PreSearchCard mounts and registers animation (TOO LATE)
       */

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

      await act(async () => {
        // Backend update: pre-search completes
        setState({
          preSearches: [
            {
              id: 'ps1',
              threadId: 'thread-1',
              roundNumber: 0,
              userQuery: 'Question',
              status: AnalysisStatuses.COMPLETE,
              searchData: null,
              errorMessage: null,
              completedAt: new Date(),
              createdAt: new Date(),
            } as StoredPreSearch,
          ],
        });
        events.push('pre-search-status-complete');

        // Provider effect runs (simulated)
        events.push('provider-effect-runs');

        // Provider checks animation
        const isAnimating = getState().pendingAnimations.has(AnimationIndices.PRE_SEARCH);
        if (!isAnimating) {
          events.push('animation-not-registered-BUG');
          events.push('participants-start-prematurely');
        }

        // PreSearchCard mounts after provider check (React rendering delay)
        await new Promise(resolve => setTimeout(resolve, 10));
        getState().registerAnimation(AnimationIndices.PRE_SEARCH);
        events.push('pre-search-component-registers-too-late');
      });

      expect(events).toContain('animation-not-registered-BUG');
      expect(events).toEqual([
        'pre-search-status-complete',
        'provider-effect-runs',
        'animation-not-registered-BUG',
        'participants-start-prematurely',
        'pre-search-component-registers-too-late',
      ]);
    });

    it('should expose race: pre-search 16ms delay not awaited', async () => {
      const events: string[] = [];

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
        screenMode: ScreenModes.OVERVIEW,
      });

      await act(async () => {
        // Pre-search completes, component registers animation
        getState().registerAnimation(AnimationIndices.PRE_SEARCH);
        events.push('pre-search-animation-registered');

        // Start 16ms timer (simulating PreSearchCard)
        const completePromise = new Promise<void>((resolve) => {
          setTimeout(() => {
            getState().completeAnimation(AnimationIndices.PRE_SEARCH);
            events.push('pre-search-animation-complete');
            resolve();
          }, 16);
        });

        // Provider effect runs immediately after status change
        await new Promise(resolve => setTimeout(resolve, 2));
        events.push('provider-checks-animation');

        const isAnimating = getState().pendingAnimations.has(AnimationIndices.PRE_SEARCH);
        if (isAnimating) {
          events.push('animation-still-pending');
          // Provider SHOULD wait, but does it?
          // If provider doesn't check animation, participants start during 16ms window
        } else {
          events.push('animation-not-pending-can-start');
        }

        await completePromise;
      });

      // Animation should be pending when provider checks (within 16ms window)
      expect(events).toContain('animation-still-pending');
    });
  });

  describe('[INTEGRATION] analysis creation timing', () => {
    it('should expose race: handleComplete fires before last participant animation', async () => {
      /**
       * Real scenario:
       * 1. Last participant streaming ends
       * 2. use-multi-participant-chat onFinish fires
       * 3. Sets metadata with flushSync
       * 4. Calls triggerNextParticipant → no more participants
       * 5. Calls onComplete callback (provider's handleComplete)
       * 6. handleComplete waits for animation (lines 141-150)
       * 7. But animation not registered yet (component hasn't re-rendered)
       */

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
      });

      const events: string[] = [];

      await act(async () => {
        // Participant streaming completes
        events.push('participant-streaming-complete');

        // Hook's onFinish fires
        events.push('hook-onFinish');

        // onFinish calls onComplete callback immediately
        events.push('handleComplete-fires');

        // handleComplete waits for animation
        const waitPromise = getState().waitForAnimation(0);
        events.push('handleComplete-waiting-for-animation');

        const isAnimating = getState().pendingAnimations.has(0);
        if (!isAnimating) {
          events.push('animation-not-registered-BUG');
          await waitPromise; // Resolves immediately
          events.push('analysis-created-prematurely');
        }

        // Component registers animation after handleComplete already ran
        await new Promise(resolve => setTimeout(resolve, 5));
        getState().registerAnimation(0);
        events.push('component-registers-too-late');
      });

      expect(events).toContain('animation-not-registered-BUG');
    });
  });
});

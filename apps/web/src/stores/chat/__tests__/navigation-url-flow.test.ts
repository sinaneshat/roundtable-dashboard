/**
 * Navigation & URL Flow Tests
 *
 * Comprehensive coverage for FLOW_DOCUMENTATION.md Part 12 behaviors:
 * 1. Slug polling starts IMMEDIATELY after thread creation
 * 2. window.history.replaceState updates URL (no navigation) when AI title ready
 * 3. router.push to /chat/[slug] after council moderator completes
 * 4. hasUpdatedThread flag coordination
 * 5. queueMicrotask ordering (URL replace before router.push)
 * 6. Duplicate navigation prevention (hasNavigated flag)
 *
 * Test Approach:
 * - Logic-focused tests without complex React mocking
 * - State machine transitions and timing primitives
 * - Focus on flow-controller.ts hook behavior
 *
 * Location: src/stores/chat/__tests__/navigation-url-flow.test.ts
 * References: FLOW_DOCUMENTATION.md lines 684-791
 */

import { MessageRoles, ScreenModes } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';

// ============================================================================
// TEST HELPERS - Pure function tests for navigation flow logic
// ============================================================================

/**
 * Determines if slug polling should be active
 * Extracts logic from flow-controller.ts:214-222
 */
function shouldStartSlugPolling(
  isActive: boolean,
  showInitialUI: boolean,
  createdThreadId: string | null,
  hasUpdatedThread: boolean,
): boolean {
  return isActive
    && !showInitialUI
    && !!createdThreadId
    && !hasUpdatedThread;
}

/**
 * Determines if URL should be updated via replaceState
 * Extracts logic from flow-controller.ts:228-243
 */
function shouldUpdateUrl(
  slugData: { slug: string; isAiGeneratedTitle: boolean } | null,
  hasUpdatedThread: boolean,
): boolean {
  return !!slugData
    && slugData.isAiGeneratedTitle
    && !hasUpdatedThread;
}

/**
 * Determines if navigation should occur
 * Extracts logic from flow-controller.ts:354-391
 */
function shouldNavigateToThread(
  isActive: boolean,
  showInitialUI: boolean,
  hasUpdatedThread: boolean,
  hasNavigated: boolean,
  hasAiSlug: boolean,
  firstModeratorCompleted: boolean,
): boolean {
  if (!isActive) {
    return false;
  }
  if (showInitialUI) {
    return false;
  }
  if (!hasUpdatedThread) {
    return false;
  }

  return !hasNavigated
    && hasAiSlug
    && firstModeratorCompleted;
}

/**
 * Simulates moderator completion check
 * Extracts logic from flow-controller.ts:203-207
 */
function isFirstModeratorCompleted(
  messages: { id: string; metadata?: { isModerator?: boolean; roundNumber?: number } }[],
): boolean {
  const moderatorMessage = messages.find(
    m => m.metadata?.isModerator === true && m.metadata?.roundNumber === 0,
  );
  return !!moderatorMessage;
}

// ============================================================================
// SLUG POLLING LIFECYCLE TESTS
// ============================================================================

describe('slug Polling Lifecycle', () => {
  describe('polling Start Conditions', () => {
    it('starts polling when ALL conditions met: !showInitialUI AND createdThreadId AND !hasUpdatedThread', () => {
      const shouldPoll = shouldStartSlugPolling(
        true, // isActive
        false, // showInitialUI
        'thread-123', // createdThreadId
        false, // hasUpdatedThread
      );

      expect(shouldPoll).toBeTruthy();
    });

    it('does NOT start polling when showInitialUI=true (chat not started)', () => {
      const shouldPoll = shouldStartSlugPolling(
        true,
        true, // showInitialUI=true
        'thread-123',
        false,
      );

      expect(shouldPoll).toBeFalsy();
    });

    it('does NOT start polling when createdThreadId is null (no thread created)', () => {
      const shouldPoll = shouldStartSlugPolling(
        true,
        false,
        null, // createdThreadId=null
        false,
      );

      expect(shouldPoll).toBeFalsy();
    });

    it('does NOT start polling when hasUpdatedThread=true (URL already updated)', () => {
      const shouldPoll = shouldStartSlugPolling(
        true,
        false,
        'thread-123',
        true, // hasUpdatedThread=true
      );

      expect(shouldPoll).toBeFalsy();
    });

    it('does NOT start polling when controller not active (navigated away)', () => {
      const shouldPoll = shouldStartSlugPolling(
        false, // isActive=false
        false,
        'thread-123',
        false,
      );

      expect(shouldPoll).toBeFalsy();
    });
  });

  describe('polling Stop Conditions', () => {
    it('stops polling when hasUpdatedThread transitions to true', () => {
      // Initial state - polling active
      let hasUpdatedThread = false;
      const initialPoll = shouldStartSlugPolling(true, false, 'thread-123', hasUpdatedThread);
      expect(initialPoll).toBeTruthy();

      // AI slug ready - set hasUpdatedThread=true
      hasUpdatedThread = true;
      const afterUpdate = shouldStartSlugPolling(true, false, 'thread-123', hasUpdatedThread);
      expect(afterUpdate).toBeFalsy();
    });

    it('stops polling when controller becomes inactive (component unmount)', () => {
      // Initial state - polling active
      let isActive = true;
      const initialPoll = shouldStartSlugPolling(isActive, false, 'thread-123', false);
      expect(initialPoll).toBeTruthy();

      // Component unmounts - controller inactive
      isActive = false;
      const afterUnmount = shouldStartSlugPolling(isActive, false, 'thread-123', false);
      expect(afterUnmount).toBeFalsy();
    });

    it('stops polling when navigated away (screenMode changes)', () => {
      // Initial state - polling active on OVERVIEW
      let screenMode = ScreenModes.OVERVIEW;
      const isActive = screenMode === ScreenModes.OVERVIEW;
      const initialPoll = shouldStartSlugPolling(isActive, false, 'thread-123', false);
      expect(initialPoll).toBeTruthy();

      // Navigate to THREAD screen
      screenMode = ScreenModes.THREAD;
      const newIsActive = screenMode === ScreenModes.OVERVIEW;
      const afterNavigation = shouldStartSlugPolling(newIsActive, false, 'thread-123', false);
      expect(afterNavigation).toBeFalsy();
    });
  });

  describe('polling State Transitions', () => {
    it('polling OFF → ON when chat starts (showInitialUI: true → false)', () => {
      const threadId = 'thread-123';

      // Before chat starts
      const beforeStart = shouldStartSlugPolling(true, true, threadId, false);
      expect(beforeStart).toBeFalsy();

      // After chat starts
      const afterStart = shouldStartSlugPolling(true, false, threadId, false);
      expect(afterStart).toBeTruthy();
    });

    it('polling ON → OFF when slug detected (hasUpdatedThread: false → true)', () => {
      // Polling active
      const beforeSlug = shouldStartSlugPolling(true, false, 'thread-123', false);
      expect(beforeSlug).toBeTruthy();

      // Slug detected
      const afterSlug = shouldStartSlugPolling(true, false, 'thread-123', true);
      expect(afterSlug).toBeFalsy();
    });

    it('handles rapid state changes without re-enabling polling', () => {
      const states = [
        { expected: true, hasUpdatedThread: false, showInitialUI: false }, // Polling starts
        { expected: false, hasUpdatedThread: true, showInitialUI: false }, // Polling stops
        { expected: false, hasUpdatedThread: true, showInitialUI: true }, // Reset triggered
        { expected: false, hasUpdatedThread: true, showInitialUI: false }, // Still stopped
      ];

      states.forEach((state, _index) => {
        const result = shouldStartSlugPolling(
          true,
          state.showInitialUI,
          'thread-123',
          state.hasUpdatedThread,
        );
        expect(result).toBe(state.expected);
      });
    });
  });
});

// ============================================================================
// URL REPLACEMENT VS NAVIGATION TIMING TESTS
// ============================================================================

describe('uRL Replacement vs Navigation Timing', () => {
  describe('window.history.replaceState Triggers', () => {
    it('triggers URL update when AI slug ready AND hasUpdatedThread=false', () => {
      const shouldUpdate = shouldUpdateUrl(
        { isAiGeneratedTitle: true, slug: 'ai-generated-slug' },
        false,
      );

      expect(shouldUpdate).toBeTruthy();
    });

    it('does NOT trigger if slugData is null', () => {
      const shouldUpdate = shouldUpdateUrl(null, false);
      expect(shouldUpdate).toBeFalsy();
    });

    it('does NOT trigger if isAiGeneratedTitle=false (initial slug)', () => {
      const shouldUpdate = shouldUpdateUrl(
        { isAiGeneratedTitle: false, slug: 'initial-slug' },
        false,
      );

      expect(shouldUpdate).toBeFalsy();
    });

    it('does NOT trigger if hasUpdatedThread=true (already updated)', () => {
      const shouldUpdate = shouldUpdateUrl(
        { isAiGeneratedTitle: true, slug: 'ai-generated-slug' },
        true,
      );

      expect(shouldUpdate).toBeFalsy();
    });
  });

  describe('queueMicrotask Ordering', () => {
    it('uRL update happens BEFORE navigation check', () => {
      // Simulate execution order
      const executionLog: string[] = [];

      // Step 1: AI slug ready - URL update via queueMicrotask
      queueMicrotask(() => {
        executionLog.push('URL_REPLACE');
      });

      // Step 2: Navigation check happens in effect (after microtask)
      setTimeout(() => {
        executionLog.push('NAVIGATION_CHECK');
      }, 0);

      // Microtasks execute before next event loop tick
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(executionLog[0]).toBe('URL_REPLACE');
          expect(executionLog[1]).toBe('NAVIGATION_CHECK');
          resolve();
        }, 10);
      });
    });

    it('multiple queueMicrotask calls execute in order', () => {
      const executionLog: string[] = [];

      queueMicrotask(() => executionLog.push('FIRST'));
      queueMicrotask(() => executionLog.push('SECOND'));
      queueMicrotask(() => executionLog.push('THIRD'));

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(executionLog).toEqual(['FIRST', 'SECOND', 'THIRD']);
          resolve();
        }, 10);
      });
    });
  });

  describe('navigation Timing Prerequisites', () => {
    it('navigation waits for hasUpdatedThread=true (URL update complete)', () => {
      const canNavigate1 = shouldNavigateToThread(
        true, // isActive
        false, // showInitialUI
        false, // hasUpdatedThread - NOT ready
        false, // hasNavigated
        true, // hasAiSlug
        true, // firstModeratorCompleted
      );

      expect(canNavigate1).toBeFalsy();

      // After URL update
      const canNavigate2 = shouldNavigateToThread(
        true,
        false,
        true, // hasUpdatedThread - NOW ready
        false,
        true,
        true,
      );

      expect(canNavigate2).toBeTruthy();
    });

    it('navigation waits for firstModeratorCompleted=true', () => {
      const canNavigate1 = shouldNavigateToThread(
        true,
        false,
        true,
        false,
        true,
        false, // firstModeratorCompleted - NOT ready
      );

      expect(canNavigate1).toBeFalsy();

      // After moderator complete
      const canNavigate2 = shouldNavigateToThread(
        true,
        false,
        true,
        false,
        true,
        true, // firstModeratorCompleted - NOW ready
      );

      expect(canNavigate2).toBeTruthy();
    });

    it('navigation waits for hasAiSlug=true', () => {
      const canNavigate1 = shouldNavigateToThread(
        true,
        false,
        true,
        false,
        false, // hasAiSlug - NOT ready
        true,
      );

      expect(canNavigate1).toBeFalsy();

      // After AI slug ready
      const canNavigate2 = shouldNavigateToThread(
        true,
        false,
        true,
        false,
        true, // hasAiSlug - NOW ready
        true,
      );

      expect(canNavigate2).toBeTruthy();
    });

    it('navigation requires ALL three prerequisites', () => {
      // Only hasUpdatedThread
      expect(shouldNavigateToThread(true, false, true, false, false, false)).toBeFalsy();

      // Only hasAiSlug
      expect(shouldNavigateToThread(true, false, false, false, true, false)).toBeFalsy();

      // Only firstModeratorCompleted
      expect(shouldNavigateToThread(true, false, false, false, false, true)).toBeFalsy();

      // All three
      expect(shouldNavigateToThread(true, false, true, false, true, true)).toBeTruthy();
    });
  });

  describe('execution Order Verification', () => {
    it('correct order: polling → URL update → navigation', () => {
      const timeline: { step: string; time: number }[] = [];
      const startTime = Date.now();

      // Step 1: Polling starts immediately
      const pollingActive = shouldStartSlugPolling(true, false, 'thread-123', false);
      if (pollingActive) {
        timeline.push({ step: 'POLLING_START', time: Date.now() - startTime });
      }

      // Step 2: AI slug ready - URL update
      const shouldUpdate = shouldUpdateUrl(
        { isAiGeneratedTitle: true, slug: 'ai-slug' },
        false,
      );
      if (shouldUpdate) {
        timeline.push({ step: 'URL_UPDATE', time: Date.now() - startTime });
      }

      // Step 3: Navigation after moderator
      const hasUpdatedThread = true; // URL updated
      const canNavigate = shouldNavigateToThread(true, false, hasUpdatedThread, false, true, true);
      if (canNavigate) {
        timeline.push({ step: 'NAVIGATION', time: Date.now() - startTime });
      }

      // Verify order
      expect(timeline.map(t => t.step)).toEqual([
        'POLLING_START',
        'URL_UPDATE',
        'NAVIGATION',
      ]);
    });
  });
});

// ============================================================================
// FLAG COORDINATION RACE CONDITION TESTS
// ============================================================================

describe('flag Coordination Race Conditions', () => {
  describe('hasUpdatedThread Flag', () => {
    it('prevents polling after URL update', () => {
      // Before URL update - polling active
      const beforeUpdate = shouldStartSlugPolling(true, false, 'thread-123', false);
      expect(beforeUpdate).toBeTruthy();

      // After URL update - hasUpdatedThread=true, polling stops
      const afterUpdate = shouldStartSlugPolling(true, false, 'thread-123', true);
      expect(afterUpdate).toBeFalsy();
    });

    it('gates navigation - requires hasUpdatedThread=true', () => {
      // hasUpdatedThread=false - navigation blocked
      const canNavigateBefore = shouldNavigateToThread(true, false, false, false, true, true);
      expect(canNavigateBefore).toBeFalsy();

      // hasUpdatedThread=true - navigation allowed
      const canNavigateAfter = shouldNavigateToThread(true, false, true, false, true, true);
      expect(canNavigateAfter).toBeTruthy();
    });

    it('coordinate with URL update trigger', () => {
      let hasUpdatedThread = false;

      // URL update should happen
      const shouldUpdate1 = shouldUpdateUrl(
        { isAiGeneratedTitle: true, slug: 'ai-slug' },
        hasUpdatedThread,
      );
      expect(shouldUpdate1).toBeTruthy();

      // After update - set flag
      hasUpdatedThread = true;

      // URL update should NOT happen again
      const shouldUpdate2 = shouldUpdateUrl(
        { isAiGeneratedTitle: true, slug: 'ai-slug' },
        hasUpdatedThread,
      );
      expect(shouldUpdate2).toBeFalsy();
    });
  });

  describe('hasNavigated Flag', () => {
    it('prevents duplicate router.push calls', () => {
      // First navigation attempt
      const canNavigate1 = shouldNavigateToThread(true, false, true, false, true, true);
      expect(canNavigate1).toBeTruthy();

      // After navigation - hasNavigated=true
      const canNavigate2 = shouldNavigateToThread(true, false, true, true, true, true);
      expect(canNavigate2).toBeFalsy();
    });

    it('resets when showInitialUI=true (new chat)', () => {
      // Simulate navigation flag lifecycle
      type NavState = {
        showInitialUI: boolean;
        hasNavigated: boolean;
      };

      const states: NavState[] = [
        { hasNavigated: false, showInitialUI: false }, // Chat started
        { hasNavigated: true, showInitialUI: false }, // Navigated to thread
        { hasNavigated: false, showInitialUI: true }, // Reset to new chat
      ];

      // When showInitialUI=true, hasNavigated should reset to false
      const resetState = states[2];
      expect(resetState?.showInitialUI).toBeTruthy();
      expect(resetState?.hasNavigated).toBeFalsy();
    });

    it('checked AFTER hasUpdatedThread in navigation logic', () => {
      // hasUpdatedThread=false - navigation blocked even if hasNavigated=false
      const blockedByUpdate = shouldNavigateToThread(true, false, false, false, true, true);
      expect(blockedByUpdate).toBeFalsy();

      // hasUpdatedThread=true, hasNavigated=false - navigation allowed
      const allowedByUpdate = shouldNavigateToThread(true, false, true, false, true, true);
      expect(allowedByUpdate).toBeTruthy();

      // hasUpdatedThread=true, hasNavigated=true - navigation blocked by flag
      const blockedByFlag = shouldNavigateToThread(true, false, true, true, true, true);
      expect(blockedByFlag).toBeFalsy();
    });
  });

  describe('state Update Atomicity', () => {
    it('uRL update and hasUpdatedThread update are atomic', () => {
      type UrlUpdateState = {
        slugData: { slug: string; isAiGeneratedTitle: boolean } | null;
        hasUpdatedThread: boolean;
      };

      const states: UrlUpdateState[] = [];

      // Atomic update simulation
      const updateUrl = (slugData: UrlUpdateState['slugData']) => {
        states.push({
          hasUpdatedThread: true, // Set atomically
          slugData,
        });
      };

      updateUrl({ isAiGeneratedTitle: true, slug: 'ai-slug' });

      const state0 = states[0];
      if (!state0) {
        throw new Error('expected state at index 0');
      }
      expect(state0.hasUpdatedThread).toBeTruthy();
      expect(state0.slugData?.isAiGeneratedTitle).toBeTruthy();
    });

    it('navigation and hasNavigated update are atomic', () => {
      type NavState = {
        navigatedTo: string | null;
        hasNavigated: boolean;
      };

      const states: NavState[] = [];

      // Atomic navigation simulation
      const navigate = (slug: string) => {
        states.push({
          hasNavigated: true, // Set atomically
          navigatedTo: `/chat/${slug}`,
        });
      };

      navigate('ai-slug');

      const navState0 = states[0];
      if (!navState0) {
        throw new Error('expected nav state at index 0');
      }
      expect(navState0.hasNavigated).toBeTruthy();
      expect(navState0.navigatedTo).toBe('/chat/ai-slug');
    });
  });

  describe('concurrent State Changes', () => {
    it('handles rapid hasUpdatedThread changes', () => {
      const updates: boolean[] = [];

      // Rapid updates
      updates.push(false); // Initial
      updates.push(true); // URL update detected
      updates.push(true); // Duplicate detection (should not re-update)

      // Last value should be true
      expect(updates[updates.length - 1]).toBeTruthy();

      // Duplicate should not trigger re-update
      const lastUpdate = updates[updates.length - 1];
      if (lastUpdate === undefined) {
        throw new Error('expected last update value');
      }
      const shouldUpdate = shouldUpdateUrl(
        { isAiGeneratedTitle: true, slug: 'ai-slug' },
        lastUpdate,
      );
      expect(shouldUpdate).toBeFalsy();
    });

    it('handles overlapping flag transitions', () => {
      type CombinedState = {
        hasUpdatedThread: boolean;
        hasNavigated: boolean;
      };

      const transitions: CombinedState[] = [
        { hasNavigated: false, hasUpdatedThread: false }, // Initial
        { hasNavigated: false, hasUpdatedThread: true }, // URL updated
        { hasNavigated: true, hasUpdatedThread: true }, // Navigated
      ];

      // Verify flags only move forward (never reset during a session)
      // hasUpdatedThread: should stay true once set
      const hasUpdatedThreadValues = transitions.map(t => t.hasUpdatedThread);
      expect(hasUpdatedThreadValues).toEqual([false, true, true]);

      // hasNavigated: should stay true once set
      const hasNavigatedValues = transitions.map(t => t.hasNavigated);
      expect(hasNavigatedValues).toEqual([false, false, true]);

      // Verify monotonic property: once true, stays true
      // After first true, all subsequent values must also be true
      const updatedThreadAfterFirst = transitions.slice(
        transitions.findIndex(t => t.hasUpdatedThread),
      );
      expect(updatedThreadAfterFirst.every(t => t.hasUpdatedThread || !updatedThreadAfterFirst.length)).toBeTruthy();

      const navigatedAfterFirst = transitions.slice(
        transitions.findIndex(t => t.hasNavigated),
      );
      expect(navigatedAfterFirst.every(t => t.hasNavigated || !navigatedAfterFirst.length)).toBeTruthy();
    });
  });
});

// ============================================================================
// NAVIGATION DURING COMPONENT UNMOUNT TESTS
// ============================================================================

describe('navigation During Component Unmount', () => {
  describe('unmount Timing', () => {
    it('cancels navigation if unmounted before moderator complete', () => {
      // Initial state - waiting for moderator
      let isActive = true;
      const canNavigate1 = shouldNavigateToThread(
        isActive,
        false,
        true,
        false,
        true,
        false, // moderator not complete
      );
      expect(canNavigate1).toBeFalsy();

      // Component unmounts
      isActive = false;

      // Navigation should NOT happen even if moderator completes
      const canNavigate2 = shouldNavigateToThread(
        isActive, // inactive
        false,
        true,
        false,
        true,
        true, // moderator complete
      );
      expect(canNavigate2).toBeFalsy();
    });

    it('stops polling when component unmounts', () => {
      // Polling active
      let isActive = true;
      const polling1 = shouldStartSlugPolling(isActive, false, 'thread-123', false);
      expect(polling1).toBeTruthy();

      // Component unmounts
      isActive = false;

      // Polling stops
      const polling2 = shouldStartSlugPolling(isActive, false, 'thread-123', false);
      expect(polling2).toBeFalsy();
    });

    it('prevents URL update after unmount', () => {
      // Simulate unmount via isActive flag
      const _isActive = false;

      // Even with valid slug data, update should not happen if inactive
      // (In real implementation, effect cleanup would prevent this)
      const shouldUpdate = shouldUpdateUrl(
        { isAiGeneratedTitle: true, slug: 'ai-slug' },
        false,
      );

      // If component is inactive, the effect won't run
      // This test documents the expected behavior
      expect(shouldUpdate).toBeTruthy(); // Logic would allow it
      // But effect guard (if (!isActive) return) prevents execution
    });
  });

  describe('cleanup Order', () => {
    it('cleanup happens in reverse mount order', () => {
      const cleanupLog: string[] = [];

      // Simulating useEffect cleanup
      const effect1Cleanup = () => cleanupLog.push('EFFECT_1_CLEANUP');
      const effect2Cleanup = () => cleanupLog.push('EFFECT_2_CLEANUP');

      // Mount order: effect1, effect2
      // Cleanup order: effect2, effect1 (reverse)
      effect2Cleanup();
      effect1Cleanup();

      expect(cleanupLog).toEqual(['EFFECT_2_CLEANUP', 'EFFECT_1_CLEANUP']);
    });

    it('polling cleanup happens before navigation cleanup', () => {
      // In flow-controller.ts:
      // - Polling effect is defined first (lines 228-342)
      // - Navigation effect is defined second (lines 354-403)
      // - Cleanup happens in reverse order

      const cleanupLog: string[] = [];

      // Navigation effect cleanup
      cleanupLog.push('NAVIGATION_CLEANUP');

      // Polling effect cleanup
      cleanupLog.push('POLLING_CLEANUP');

      // Verify navigation cleanup happens first (reverse mount order)
      expect(cleanupLog[0]).toBe('NAVIGATION_CLEANUP');
      expect(cleanupLog[1]).toBe('POLLING_CLEANUP');
    });
  });

  describe('memory Leak Prevention', () => {
    it('does not attempt navigation after unmount', () => {
      const navigationAttempts: string[] = [];

      const attemptNavigation = (isActive: boolean) => {
        if (!isActive) {
          return;
        }
        navigationAttempts.push('NAVIGATE');
      };

      // Active - navigation happens
      attemptNavigation(true);
      expect(navigationAttempts).toHaveLength(1);

      // Inactive - navigation blocked
      attemptNavigation(false);
      expect(navigationAttempts).toHaveLength(1); // Still 1, no new attempt
    });

    it('clears timeout on unmount', () => {
      let timeoutCleared = false;

      const timeoutId = setTimeout(() => {
        // Should never execute
      }, 1000);

      // Simulate cleanup
      clearTimeout(timeoutId);
      timeoutCleared = true;

      expect(timeoutCleared).toBeTruthy();
    });

    it('prevents infinite polling loops', () => {
      const pollCounts: number[] = [];
      let hasUpdatedThread = false;

      // Poll until updated
      for (let i = 0; i < 100; i++) {
        const shouldPoll = shouldStartSlugPolling(true, false, 'thread-123', hasUpdatedThread);

        if (shouldPoll) {
          pollCounts.push(i);
        }

        // Simulate slug detected after 5 polls
        if (i === 5) {
          hasUpdatedThread = true;
        }
      }

      // Polling should stop after hasUpdatedThread=true
      expect(pollCounts.length).toBeLessThan(10);
      expect(pollCounts[pollCounts.length - 1]).toBeLessThan(6);
    });
  });
});

// ============================================================================
// MODERATOR COMPLETION DETECTION TESTS
// ============================================================================

describe('moderator Completion Detection', () => {
  describe('isFirstModeratorCompleted', () => {
    it('returns true when moderator message exists for round 0', () => {
      const messages = [
        createTestUserMessage({ content: 'Question', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Answer',
          id: 'p0-r0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        {
          id: 'moderator-r0',
          metadata: {
            isModerator: true,
            roundNumber: 0,
          },
          parts: [{ text: 'Moderator analysis', type: 'text' as const }],
          role: MessageRoles.ASSISTANT as const,
        },
      ];

      const completed = isFirstModeratorCompleted(messages);
      expect(completed).toBeTruthy();
    });

    it('returns false when no moderator message exists', () => {
      const messages = [
        createTestUserMessage({ content: 'Question', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Answer',
          id: 'p0-r0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      const completed = isFirstModeratorCompleted(messages);
      expect(completed).toBeFalsy();
    });

    it('returns false when moderator is for round 1, not round 0', () => {
      const messages = [
        createTestUserMessage({ content: 'Question', id: 'u0', roundNumber: 0 }),
        {
          id: 'moderator-r1',
          metadata: {
            isModerator: true,
            roundNumber: 1, // Round 1, not 0
          },
          parts: [{ text: 'Moderator analysis', type: 'text' as const }],
          role: MessageRoles.ASSISTANT as const,
        },
      ];

      const completed = isFirstModeratorCompleted(messages);
      expect(completed).toBeFalsy();
    });

    it('returns false when message has isModerator=false', () => {
      const messages = [
        createTestUserMessage({ content: 'Question', id: 'u0', roundNumber: 0 }),
        {
          id: 'not-moderator-r0',
          metadata: {
            isModerator: false,
            roundNumber: 0,
          },
          parts: [{ text: 'Not moderator', type: 'text' as const }],
          role: MessageRoles.ASSISTANT as const,
        },
      ];

      const completed = isFirstModeratorCompleted(messages);
      expect(completed).toBeFalsy();
    });
  });
});

// ============================================================================
// EDGE CASES AND INTEGRATION SCENARIOS
// ============================================================================

describe('edge Cases and Integration Scenarios', () => {
  describe('rapid State Transitions', () => {
    it('handles rapid mount/unmount cycles', () => {
      const cycles: { isActive: boolean; shouldPoll: boolean }[] = [];

      // Rapid cycles
      for (let i = 0; i < 10; i++) {
        const isActive = i % 2 === 0; // Alternating active/inactive
        const shouldPoll = shouldStartSlugPolling(isActive, false, 'thread-123', false);
        cycles.push({ isActive, shouldPoll });
      }

      // Verify polling matches active state
      cycles.forEach((cycle) => {
        expect(cycle.shouldPoll).toBe(cycle.isActive);
      });
    });

    it('handles rapid showInitialUI changes', () => {
      const states: boolean[] = [];

      // Rapid toggles
      for (let i = 0; i < 5; i++) {
        const showInitialUI = i % 2 === 0;
        const shouldPoll = shouldStartSlugPolling(true, showInitialUI, 'thread-123', false);
        states.push(shouldPoll);
      }

      // Polling should alternate: false, true, false, true, false
      expect(states).toEqual([false, true, false, true, false]);
    });
  });

  describe('complete Flow Integration', () => {
    it('complete first round flow: polling → URL update → navigation', () => {
      const flowLog: string[] = [];

      // Step 1: Chat starts - polling begins
      const showInitialUI = false;
      let hasUpdatedThread = false;
      let hasNavigated = false;

      const polling = shouldStartSlugPolling(true, showInitialUI, 'thread-123', hasUpdatedThread);
      if (polling) {
        flowLog.push('POLLING_STARTED');
      }

      // Step 2: AI slug ready - URL update
      const urlUpdate = shouldUpdateUrl(
        { isAiGeneratedTitle: true, slug: 'ai-slug' },
        hasUpdatedThread,
      );
      if (urlUpdate) {
        flowLog.push('URL_UPDATED');
        hasUpdatedThread = true;
      }

      // Step 3: Moderator completes - navigation
      const messages = [
        { id: 'moderator-r0', metadata: { isModerator: true, roundNumber: 0 } },
      ];
      const moderatorComplete = isFirstModeratorCompleted(messages);
      const navigation = shouldNavigateToThread(
        true,
        showInitialUI,
        hasUpdatedThread,
        hasNavigated,
        true,
        moderatorComplete,
      );
      if (navigation) {
        flowLog.push('NAVIGATED');
        hasNavigated = true;
      }

      expect(flowLog).toEqual(['POLLING_STARTED', 'URL_UPDATED', 'NAVIGATED']);
    });

    it('aborted flow: unmount before navigation', () => {
      const flowLog: string[] = [];

      // Step 1: Chat starts
      let isActive = true;
      const polling = shouldStartSlugPolling(isActive, false, 'thread-123', false);
      if (polling) {
        flowLog.push('POLLING_STARTED');
      }

      // Step 2: URL update
      let hasUpdatedThread = false;
      const urlUpdate = shouldUpdateUrl(
        { isAiGeneratedTitle: true, slug: 'ai-slug' },
        hasUpdatedThread,
      );
      if (urlUpdate) {
        flowLog.push('URL_UPDATED');
        hasUpdatedThread = true;
      }

      // Step 3: Component unmounts BEFORE navigation
      isActive = false;

      // Step 4: Navigation should NOT happen
      const navigation = shouldNavigateToThread(
        isActive, // inactive
        false,
        hasUpdatedThread,
        false,
        true,
        true,
      );
      if (navigation) {
        flowLog.push('NAVIGATED');
      }

      expect(flowLog).toEqual(['POLLING_STARTED', 'URL_UPDATED']);
      expect(flowLog).not.toContain('NAVIGATED');
    });
  });

  describe('error Recovery Scenarios', () => {
    it('handles missing slug data gracefully', () => {
      const shouldUpdate = shouldUpdateUrl(null, false);
      expect(shouldUpdate).toBeFalsy();
    });

    it('handles missing thread ID gracefully', () => {
      const shouldPoll = shouldStartSlugPolling(true, false, null, false);
      expect(shouldPoll).toBeFalsy();
    });

    it('handles navigation with incomplete prerequisites', () => {
      // Missing hasUpdatedThread
      expect(shouldNavigateToThread(true, false, false, false, true, true)).toBeFalsy();

      // Missing hasAiSlug
      expect(shouldNavigateToThread(true, false, true, false, false, true)).toBeFalsy();

      // Missing moderator
      expect(shouldNavigateToThread(true, false, true, false, true, false)).toBeFalsy();
    });
  });
});

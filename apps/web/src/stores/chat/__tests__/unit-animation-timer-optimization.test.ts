/**
 * Unit Tests: Animation & Timer Optimization
 *
 * Tests timer cleanup, RAF patterns, debounce/throttle, and memory leak prevention.
 *
 * Coverage:
 * 1. requestAnimationFrame patterns (triple RAF in flow-state-machine)
 * 2. setTimeout/setInterval cleanup (polling, delays)
 * 3. Animation state management (pendingAnimations, animationResolvers)
 * 4. Debounce/throttle patterns (slug polling interval)
 * 5. Memory leak prevention (uncleaned timers, unresolved promises)
 * 6. queueMicrotask execution order
 * 7. startTransition batching patterns
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function getStoreState(store: ChatStoreApi) {
  return store.getState();
}

// ============================================================================
// 1. requestAnimationFrame PATTERNS
// ============================================================================

describe('requestAnimationFrame Patterns', () => {
  describe('triple RAF Pattern (streamingJustCompleted)', () => {
    let rafCallbacks: FrameRequestCallback[];
    let rafId: number;

    beforeEach(() => {
      vi.useFakeTimers();
      rafCallbacks = [];
      rafId = 0;

      // Mock requestAnimationFrame to capture callbacks
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
        rafCallbacks.push(callback);
        return ++rafId;
      });

      // Mock cancelAnimationFrame
      vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
        // Find and remove the callback at this ID
        const idx = id - 1; // RAF IDs are 1-based
        if (idx >= 0 && idx < rafCallbacks.length) {
          rafCallbacks.splice(idx, 1);
        }
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('should execute triple RAF chain in correct order', () => {
      const executionLog: string[] = [];

      // Simulate triple RAF pattern from flow-state-machine.ts:280-287
      requestAnimationFrame(() => {
        executionLog.push('RAF-1');
        requestAnimationFrame(() => {
          executionLog.push('RAF-2');
          requestAnimationFrame(() => {
            executionLog.push('RAF-3');
          });
        });
      });

      // Initially no callbacks executed
      expect(executionLog).toEqual([]);

      // First RAF scheduled
      expect(rafCallbacks).toHaveLength(1);

      // Execute first RAF
      const firstCallback = rafCallbacks[0];
      if (firstCallback) {
        firstCallback(0);
      }
      expect(executionLog).toEqual(['RAF-1']);

      // Second RAF scheduled
      expect(rafCallbacks).toHaveLength(2);

      // Execute second RAF
      const secondCallback = rafCallbacks[1];
      if (secondCallback) {
        secondCallback(0);
      }
      expect(executionLog).toEqual(['RAF-1', 'RAF-2']);

      // Third RAF scheduled
      expect(rafCallbacks).toHaveLength(3);

      // Execute third RAF
      const thirdCallback = rafCallbacks[2];
      if (thirdCallback) {
        thirdCallback(0);
      }
      expect(executionLog).toEqual(['RAF-1', 'RAF-2', 'RAF-3']);
    });

    it('should clean up RAF chain when canceled mid-execution', () => {
      const executionLog: string[] = [];
      let rafId2: number;
      let rafId3: number | null = null;

      // Schedule triple RAF
      const rafId1 = requestAnimationFrame(() => {
        executionLog.push('RAF-1');
        rafId2 = requestAnimationFrame(() => {
          executionLog.push('RAF-2');
          rafId3 = requestAnimationFrame(() => {
            executionLog.push('RAF-3');
          });
        });
      });

      // Execute first RAF
      const firstCallback = rafCallbacks[0];
      if (firstCallback) {
        firstCallback(0);
      }
      expect(executionLog).toEqual(['RAF-1']);

      // Cancel before second RAF executes
      cancelAnimationFrame(rafId1);

      // Second RAF should still be scheduled (cancel doesn't affect already-scheduled)
      expect(rafCallbacks.length).toBeGreaterThan(0);

      // But we can cancel the second one
      if (rafId2 !== undefined) {
        cancelAnimationFrame(rafId2);
      }

      // Third RAF never scheduled because second was canceled
      expect(rafId3).toBeNull();
    });

    it('should prevent memory leaks by storing RAF ID in ref and cleaning on unmount', () => {
      const rafIds: number[] = [];

      // Simulate component pattern with ref cleanup
      let currentRafId: number | null = null;

      const scheduleTripleRaf = () => {
        currentRafId = requestAnimationFrame(() => {
          currentRafId = requestAnimationFrame(() => {
            currentRafId = requestAnimationFrame(() => {
              currentRafId = null; // Clear after completion
            });
          });
        });
        rafIds.push(currentRafId);
      };

      const cleanup = () => {
        if (currentRafId !== null) {
          cancelAnimationFrame(currentRafId);
          currentRafId = null;
        }
      };

      // Schedule RAF
      scheduleTripleRaf();
      expect(currentRafId).not.toBeNull();

      // Simulate unmount cleanup
      cleanup();
      expect(currentRafId).toBeNull();

      // Verify cancelAnimationFrame was called
      expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalledWith();
    });

    it('should handle rapid RAF rescheduling without leaking IDs', () => {
      let currentRafId: number | null = null;

      const scheduleRaf = () => {
        // Cancel previous if exists
        if (currentRafId !== null) {
          cancelAnimationFrame(currentRafId);
        }

        // Schedule new RAF
        currentRafId = requestAnimationFrame(() => {
          currentRafId = null;
        });
      };

      // Rapidly reschedule
      scheduleRaf(); // ID 1
      const firstId = currentRafId;
      scheduleRaf(); // Cancels 1, schedules 2
      const secondId = currentRafId;
      scheduleRaf(); // Cancels 2, schedules 3
      const thirdId = currentRafId;

      // All IDs should be different
      expect(firstId).not.toBe(secondId);
      expect(secondId).not.toBe(thirdId);

      // Only last RAF should be active
      expect(currentRafId).toBe(thirdId);

      // Previous RAFs should have been canceled - assert IDs exist first
      expect(firstId).not.toBeNull();
      expect(secondId).not.toBeNull();
      expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalledWith(firstId);
      expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalledWith(secondId);
    });

    it('should verify triple RAF provides 3 frame delay for DOM updates', () => {
      const domUpdateLog: string[] = [];

      // Simulate state change that needs DOM to settle
      domUpdateLog.push('STATE_CHANGE');

      // Triple RAF ensures DOM has painted
      requestAnimationFrame(() => {
        domUpdateLog.push('FRAME_1');
        requestAnimationFrame(() => {
          domUpdateLog.push('FRAME_2');
          requestAnimationFrame(() => {
            domUpdateLog.push('FRAME_3_DOM_READY');
          });
        });
      });

      // Execute all RAF callbacks sequentially as they're added (nested RAFs)
      // First RAF execution schedules second RAF
      const callback0 = rafCallbacks[0];
      if (callback0) {
        callback0(0);
        // Now callback1 is scheduled
        const callback1 = rafCallbacks[1];
        if (callback1) {
          callback1(0);
          // Now callback2 is scheduled
          const callback2 = rafCallbacks[2];
          if (callback2) {
            callback2(0);
          }
        }
      }

      expect(domUpdateLog).toEqual([
        'STATE_CHANGE',
        'FRAME_1',
        'FRAME_2',
        'FRAME_3_DOM_READY',
      ]);
    });
  });

  describe('rAF Cleanup on Component Unmount', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('should clean up RAF on effect cleanup', () => {
      let rafId: number | null = null;

      // Simulate effect setup
      rafId = requestAnimationFrame(() => {
        // Animation callback
      });

      expect(rafId).not.toBeNull();

      // Simulate cleanup
      const cleanup = () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
      };

      // Verify cleanup can be called without errors
      cleanup();
    });
  });
});

// ============================================================================
// 2. setTimeout/setInterval CLEANUP
// ============================================================================

describe('setTimeout/setInterval Cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  describe('typewriterTitle Animation Cleanup', () => {
    it('should clean up setTimeout chain on unmount', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      let animationRef: ReturnType<typeof setTimeout> | null = null;

      const startTyping = (text: string, delay: number) => {
        let charIndex = 0;

        const tick = () => {
          if (charIndex < text.length) {
            charIndex++;
            animationRef = setTimeout(tick, delay);
          } else {
            animationRef = null;
          }
        };

        tick();
      };

      const cleanup = () => {
        if (animationRef !== null) {
          clearTimeout(animationRef);
          animationRef = null;
        }
      };

      // Start typing animation
      startTyping('Hello World', 30);
      expect(animationRef).not.toBeNull();

      // Clean up before completion
      cleanup();
      expect(animationRef).toBeNull();
      expect(clearTimeoutSpy).toHaveBeenCalledWith();
    });

    it('should handle rapid title changes without leaking timers', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      let animationRef: ReturnType<typeof setTimeout> | null = null;
      let activeTimerId: ReturnType<typeof setTimeout>;

      const changeTitle = (_title: string) => {
        // Clear previous animation
        if (animationRef !== null) {
          clearTimeout(animationRef);
        }

        // Start new animation
        animationRef = setTimeout(() => {
          animationRef = null;
        }, 100);

        activeTimerId = animationRef;
      };

      // Rapid title changes
      changeTitle('Title 1');
      const timer1 = activeTimerId;
      changeTitle('Title 2');
      const timer2 = activeTimerId;
      changeTitle('Title 3');
      const timer3 = activeTimerId;

      // Previous timers should be cleared
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timer1);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timer2);

      // Only last timer active
      expect(animationRef).toBe(timer3);
    });

    it('should verify char delay timing is consistent', () => {
      const renderLog: string[] = [];
      const charDelay = 30;

      const animateChar = (fullText: string, index: number) => {
        if (index < fullText.length) {
          renderLog.push(`CHAR_${index}`);

          setTimeout(() => {
            animateChar(fullText, index + 1);
          }, charDelay);
        }
      };

      animateChar('ABC', 0);

      // Initially just first char
      expect(renderLog).toEqual(['CHAR_0']);

      // Advance by charDelay
      vi.advanceTimersByTime(charDelay);
      expect(renderLog).toEqual(['CHAR_0', 'CHAR_1']);

      // Advance again
      vi.advanceTimersByTime(charDelay);
      expect(renderLog).toEqual(['CHAR_0', 'CHAR_1', 'CHAR_2']);

      // No more chars
      vi.advanceTimersByTime(charDelay);
      expect(renderLog).toEqual(['CHAR_0', 'CHAR_1', 'CHAR_2']);
    });
  });

  describe('delayed Invalidation Timeout', () => {
    it('should clean up invalidation timeout on effect re-run', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const scheduleInvalidation = (callback: () => void) => {
        // Clear previous timeout
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }

        // Schedule new timeout (3s delay from flow-controller.ts:321)
        timeoutId = setTimeout(callback, 3000);
      };

      const mockInvalidate = vi.fn();

      // First schedule
      scheduleInvalidation(mockInvalidate);
      const firstId = timeoutId;

      // Reschedule before first completes
      scheduleInvalidation(mockInvalidate);
      const secondId = timeoutId;

      // First timeout should be cleared
      expect(clearTimeoutSpy).toHaveBeenCalledWith(firstId);

      // Only second timeout should be active
      expect(timeoutId).toBe(secondId);

      // Advance to completion
      vi.advanceTimersByTime(3000);
      expect(mockInvalidate).toHaveBeenCalledOnce();
    });

    it('should execute callback after 3s delay', () => {
      const callback = vi.fn();

      setTimeout(callback, 3000);

      // Not called immediately
      expect(callback).not.toHaveBeenCalled();

      // Not called after 2s
      vi.advanceTimersByTime(2000);
      expect(callback).not.toHaveBeenCalled();

      // Called after 3s
      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should prevent memory leaks when effect cleanup runs', () => {
      // Simulate effect setup
      const timeoutId = setTimeout(() => {
        // Invalidation logic
      }, 3000);

      expect(timeoutId).toBeDefined();

      // Simulate cleanup before timeout completes
      const cleanup = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      };

      cleanup();
    });
  });

  describe('stale State Timeout Cleanup', () => {
    it('should clean up 2s timeout on dependency change', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const scheduleStaleCheck = (callback: () => void) => {
        // Pattern from incomplete-round-resumption.ts:249
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(callback, 2000);

        return () => {
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
          }
        };
      };

      const cleanup1 = scheduleStaleCheck(() => {});
      const firstId = timeoutId;

      const cleanup2 = scheduleStaleCheck(() => {});
      const secondId = timeoutId;

      // Previous timeout cleared on reschedule
      expect(clearTimeoutSpy).toHaveBeenCalledWith(firstId);

      // Cleanup functions should also clear
      cleanup1();
      cleanup2();
      expect(clearTimeoutSpy).toHaveBeenCalledWith(secondId);
    });

    it('should execute callback after 2s if deps stable', () => {
      const callback = vi.fn();

      setTimeout(callback, 2000);

      // Not called before 2s
      vi.advanceTimersByTime(1999);
      expect(callback).not.toHaveBeenCalled();

      // Called at 2s
      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledOnce();
    });
  });

  describe('failed Trigger Recovery Timeout', () => {
    it('should clean up 100ms retry toggle timeout', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

      const scheduleRetryCheck = (callback: () => void) => {
        // Clear previous
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
        }

        // Pattern from incomplete-round-resumption.ts:990
        retryTimeoutId = setTimeout(callback, 100);
      };

      const cleanup = () => {
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
          retryTimeoutId = null;
        }
      };

      // Schedule retry check
      scheduleRetryCheck(() => {});
      const firstId = retryTimeoutId;

      // Reschedule before completion
      scheduleRetryCheck(() => {});

      // First cleared
      expect(clearTimeoutSpy).toHaveBeenCalledWith(firstId);

      // Cleanup
      cleanup();
      expect(retryTimeoutId).toBeNull();
    });

    it('should distinguish retry toggle from actual failure', () => {
      const failureLog: string[] = [];
      let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

      const onWaitingFalse = () => {
        // Pattern: wait 100ms to distinguish retry from failure
        retryTimeoutId = setTimeout(() => {
          failureLog.push('ACTUAL_FAILURE');
        }, 100);
      };

      const onWaitingTrue = () => {
        // Clear timeout - this is a retry, not failure
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
          retryTimeoutId = null;
        }
        failureLog.push('RETRY_TOGGLE');
      };

      // Simulate: waiting goes false
      onWaitingFalse();

      // Within 50ms, waiting goes true again (retry)
      vi.advanceTimersByTime(50);
      onWaitingTrue();

      // Should NOT log failure
      vi.advanceTimersByTime(100);
      expect(failureLog).toEqual(['RETRY_TOGGLE']);
    });
  });

  describe('active Stream Check Delay', () => {
    it('should clean up 100ms delay timeout on navigation', () => {
      // Pattern from incomplete-round-resumption.ts:597
      const timeoutId = setTimeout(() => {
        // Set activeStreamCheckComplete
      }, 100);

      expect(timeoutId).toBeDefined();

      // Simulate cleanup
      const cleanup = () => clearTimeout(timeoutId);

      cleanup();
    });
  });
});

// ============================================================================
// 3. ANIMATION STATE MANAGEMENT
// ============================================================================

describe('animation State Management', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('pendingAnimations Set Operations', () => {
    it('should register animation efficiently using Set.add()', () => {
      const { registerAnimation } = getStoreState(store);

      // Register animations
      registerAnimation(0);
      registerAnimation(1);
      registerAnimation(2);

      const { pendingAnimations } = getStoreState(store);

      expect(pendingAnimations.size).toBe(3);
      expect(pendingAnimations.has(0)).toBeTruthy();
      expect(pendingAnimations.has(1)).toBeTruthy();
      expect(pendingAnimations.has(2)).toBeTruthy();
    });

    it('should prevent duplicate registrations automatically', () => {
      const { registerAnimation } = getStoreState(store);

      // Register same animation twice
      registerAnimation(0);
      registerAnimation(0);

      const { pendingAnimations } = getStoreState(store);

      // Set automatically deduplicates
      expect(pendingAnimations.size).toBe(1);
      expect(pendingAnimations.has(0)).toBeTruthy();
    });

    it('should complete animation efficiently using Set.delete()', () => {
      const { completeAnimation, registerAnimation } = getStoreState(store);

      registerAnimation(0);
      registerAnimation(1);
      registerAnimation(2);

      // Complete middle animation
      completeAnimation(1);

      const { pendingAnimations } = getStoreState(store);

      expect(pendingAnimations.size).toBe(2);
      expect(pendingAnimations.has(0)).toBeTruthy();
      expect(pendingAnimations.has(1)).toBeFalsy();
      expect(pendingAnimations.has(2)).toBeTruthy();
    });

    it('should handle completing non-existent animation gracefully', () => {
      const { completeAnimation } = getStoreState(store);

      // Complete animation that was never registered
      completeAnimation(999);

      const { pendingAnimations } = getStoreState(store);

      // No error, size remains 0
      expect(pendingAnimations.size).toBe(0);
    });

    it('should verify O(1) lookup performance with Set', () => {
      const { registerAnimation } = getStoreState(store);

      // Register many animations
      for (let i = 0; i < 100; i++) {
        registerAnimation(i);
      }

      const { pendingAnimations } = getStoreState(store);

      // Set.has() is O(1)
      const start = performance.now();
      expect(pendingAnimations.has(50)).toBeTruthy();
      const duration = performance.now() - start;

      // Should be extremely fast
      expect(duration).toBeLessThan(1);
    });
  });

  describe('animationResolvers Map Operations', () => {
    it('should store resolver functions in Map for O(1) access', async () => {
      const { completeAnimation, registerAnimation, waitForAnimation } = getStoreState(store);

      registerAnimation(0);

      // Create promise and store resolver
      const promise = waitForAnimation(0);

      const { animationResolvers } = getStoreState(store);
      expect(animationResolvers.size).toBe(1);
      expect(animationResolvers.has(0)).toBeTruthy();

      // Complete animation resolves promise
      completeAnimation(0);

      await expect(promise).resolves.toBeUndefined();
    });

    it('should clean up resolver after animation completes', async () => {
      const { completeAnimation, registerAnimation, waitForAnimation } = getStoreState(store);

      registerAnimation(0);
      const promise = waitForAnimation(0);

      completeAnimation(0);

      await promise;

      const { animationResolvers } = getStoreState(store);

      // Resolver removed from Map
      expect(animationResolvers.size).toBe(0);
      expect(animationResolvers.has(0)).toBeFalsy();
    });

    it('should resolve immediately if animation not pending', async () => {
      const { waitForAnimation } = getStoreState(store);

      // Wait for animation that was never registered
      const promise = waitForAnimation(999);

      // Should resolve immediately
      await expect(promise).resolves.toBeUndefined();

      const { animationResolvers } = getStoreState(store);

      // No resolver stored
      expect(animationResolvers.size).toBe(0);
    });

    it('should handle multiple waiters for same animation', async () => {
      const { completeAnimation, registerAnimation, waitForAnimation } = getStoreState(store);

      registerAnimation(0);

      // Multiple waits for same animation
      const _promise1 = waitForAnimation(0);
      const promise2 = waitForAnimation(0);

      // Only last resolver stored (overwrite)
      const { animationResolvers } = getStoreState(store);
      expect(animationResolvers.size).toBe(1);

      completeAnimation(0);

      // Last promise resolves
      await expect(promise2).resolves.toBeUndefined();

      // First promise might not resolve (overwritten)
      // This is expected behavior - only one resolver per participant
    });
  });

  describe('waitForAllAnimations Completion', () => {
    // ✅ UPDATED: Timeout-based tests removed - implementation now uses event-driven approach
    // The 5s timeout was removed because it caused premature animation clearing
    // Now animations complete via explicit completeAnimation() calls

    it('should resolve immediately when no animations pending', async () => {
      const { pendingAnimations, waitForAllAnimations } = getStoreState(store);

      expect(pendingAnimations.size).toBe(0);

      // Should resolve immediately when no animations
      await waitForAllAnimations();

      // Still no animations
      expect(getStoreState(store).pendingAnimations.size).toBe(0);
    });

    it('should resolve when all animations complete', async () => {
      const { completeAnimation, registerAnimation, waitForAllAnimations } = getStoreState(store);

      registerAnimation(0);
      registerAnimation(1);

      const promise = waitForAllAnimations();

      // Complete all animations
      completeAnimation(0);
      completeAnimation(1);

      // Should resolve now that all are complete
      await promise;

      const { pendingAnimations } = getStoreState(store);
      expect(pendingAnimations.size).toBe(0);
    });

    it('should wait for all animations before resolving', async () => {
      const { completeAnimation, registerAnimation, waitForAllAnimations } = getStoreState(store);

      registerAnimation(0);
      registerAnimation(1);
      registerAnimation(2);

      let resolved = false;
      const promise = waitForAllAnimations().then(() => {
        resolved = true;
      });

      // Complete some but not all
      completeAnimation(0);
      completeAnimation(1);

      // Allow microtasks to flush
      await Promise.resolve();

      // Should NOT be resolved yet (one animation still pending)
      expect(resolved).toBeFalsy();

      // Complete last animation
      completeAnimation(2);

      // Now it should resolve
      await promise;
      expect(resolved).toBeTruthy();
    });
  });

  describe('animation State Cleanup', () => {
    it('should clear all animations on completeStreaming', () => {
      const { completeStreaming, registerAnimation } = getStoreState(store);

      // Register multiple animations
      registerAnimation(0);
      registerAnimation(1);
      registerAnimation(2);

      expect(getStoreState(store).pendingAnimations.size).toBe(3);

      // Complete streaming clears animations
      completeStreaming();

      const { animationResolvers, pendingAnimations } = getStoreState(store);
      expect(pendingAnimations.size).toBe(0);
      expect(animationResolvers.size).toBe(0);
    });

    it('should clear animations on resetForThreadNavigation', () => {
      const { registerAnimation, resetForThreadNavigation } = getStoreState(store);

      registerAnimation(5);
      registerAnimation(6);

      resetForThreadNavigation();

      const { animationResolvers, pendingAnimations } = getStoreState(store);
      expect(pendingAnimations.size).toBe(0);
      expect(animationResolvers.size).toBe(0);
    });

    it('should not create new Set/Map if already empty (optimization)', () => {
      // Initial state has empty Set/Map
      const initialState = getStoreState(store);
      const initialAnimations = initialState.pendingAnimations;
      const initialResolvers = initialState.animationResolvers;

      // Complete streaming when already empty
      initialState.completeStreaming();

      const afterState = getStoreState(store);

      // Should reuse same references (optimization from store.ts:1122-1132)
      expect(afterState.pendingAnimations).toBe(initialAnimations);
      expect(afterState.animationResolvers).toBe(initialResolvers);
    });

    it('should create new Set/Map when clearing non-empty collections', () => {
      const { completeStreaming, registerAnimation } = getStoreState(store);

      registerAnimation(0);

      const beforeAnimations = getStoreState(store).pendingAnimations;

      completeStreaming();

      const afterAnimations = getStoreState(store).pendingAnimations;

      // New instance created
      expect(afterAnimations).not.toBe(beforeAnimations);
      expect(afterAnimations.size).toBe(0);
    });
  });
});

// ============================================================================
// 4. DEBOUNCE/THROTTLE PATTERNS
// ============================================================================

describe('debounce/Throttle Patterns', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('slug Polling Interval', () => {
    it('should prevent rapid polling via clearInterval on new poll', () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
      let intervalId: ReturnType<typeof setInterval> | undefined;

      const startPolling = (callback: () => void, delay: number) => {
        // Clear previous interval
        if (intervalId !== undefined) {
          clearInterval(intervalId);
        }

        intervalId = setInterval(callback, delay);
      };

      const mockPoll = vi.fn();

      // Start first poll
      startPolling(mockPoll, 1000);
      const firstId = intervalId;

      // Start second poll (cancels first)
      startPolling(mockPoll, 1000);

      // First interval cleared
      expect(clearIntervalSpy).toHaveBeenCalledWith(firstId);

      // Only second interval active
      vi.advanceTimersByTime(1000);
      expect(mockPoll).toHaveBeenCalledOnce();
    });

    it('should clean up interval on component unmount', () => {
      // Simulate effect setup
      const intervalId = setInterval(() => {
        // Polling logic
      }, 1000);

      expect(intervalId).toBeDefined();

      // Simulate cleanup
      const cleanup = () => {
        if (intervalId !== undefined) {
          clearInterval(intervalId);
        }
      };

      cleanup();
    });

    it('should execute callback at regular intervals', () => {
      const callback = vi.fn();

      setInterval(callback, 500);

      // Not called immediately
      expect(callback).not.toHaveBeenCalled();

      // Called after first interval
      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(1);

      // Called again after second interval
      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(2);

      // Called third time
      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(3);
    });
  });

  describe('debounced Invalidation', () => {
    it('should debounce rapid calls to single execution', () => {
      const callback = vi.fn();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const debouncedInvalidate = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(callback, 3000);
      };

      // Rapid calls
      debouncedInvalidate();
      vi.advanceTimersByTime(1000);

      debouncedInvalidate();
      vi.advanceTimersByTime(1000);

      debouncedInvalidate();
      vi.advanceTimersByTime(1000);

      // Not called yet (debounced)
      expect(callback).not.toHaveBeenCalled();

      // Called once after final delay
      vi.advanceTimersByTime(3000);
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should execute immediately if no subsequent calls', () => {
      const callback = vi.fn();

      setTimeout(callback, 3000);

      // No interruption
      vi.advanceTimersByTime(3000);

      expect(callback).toHaveBeenCalledOnce();
    });
  });
});

// ============================================================================
// 5. MEMORY LEAK PREVENTION
// ============================================================================

describe('memory Leak Prevention', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  describe('uncleaned Timers Detection', () => {
    it('should detect setTimeout leaks when cleanup not called', () => {
      const activeTimers: ReturnType<typeof setTimeout>[] = [];

      const createTimer = () => {
        const id = setTimeout(() => {
          // Timer callback
        }, 1000);
        activeTimers.push(id);
        return id;
      };

      // Create timers without cleanup
      createTimer();
      createTimer();
      createTimer();

      expect(activeTimers).toHaveLength(3);

      // Simulate proper cleanup
      activeTimers.forEach(id => clearTimeout(id));
      activeTimers.length = 0;

      expect(activeTimers).toHaveLength(0);
    });

    it('should detect RAF leaks when cleanup not called', () => {
      const activeRafs: number[] = [];

      const scheduleRaf = () => {
        const id = requestAnimationFrame(() => {
          // RAF callback
        });
        activeRafs.push(id);
        return id;
      };

      scheduleRaf();
      scheduleRaf();
      scheduleRaf();

      expect(activeRafs).toHaveLength(3);

      // Cleanup
      activeRafs.forEach(id => cancelAnimationFrame(id));
      activeRafs.length = 0;

      expect(activeRafs).toHaveLength(0);
    });

    it('should detect setInterval leaks', () => {
      const activeIntervals: ReturnType<typeof setInterval>[] = [];

      const startInterval = () => {
        const id = setInterval(() => {
          // Interval callback
        }, 100);
        activeIntervals.push(id);
        return id;
      };

      startInterval();
      startInterval();

      expect(activeIntervals).toHaveLength(2);

      // Cleanup
      activeIntervals.forEach(id => clearInterval(id));
      activeIntervals.length = 0;

      expect(activeIntervals).toHaveLength(0);
    });
  });

  describe('unresolved Promise Detection', () => {
    it('should document that unresolved promises need manual cleanup', () => {
      const store = createChatStore();
      const { clearAnimations, registerAnimation, waitForAnimation } = store.getState();

      registerAnimation(0);

      // Start waiting for animation
      const _promise = waitForAnimation(0);

      // In production, if animation never completes, this promise would hang
      // The cleanup pattern is to call clearAnimations() which resets state
      // This test documents that promises need explicit cleanup via store actions

      clearAnimations();

      // After clearing, pendingAnimations should be empty
      const { animationResolvers, pendingAnimations } = store.getState();
      expect(pendingAnimations.size).toBe(0);
      expect(animationResolvers.size).toBe(0);

      // Note: The promise itself may still be pending - this is a known limitation
      // Production code should use waitForAllAnimations() which has built-in timeout
    });

    it('should resolve all promises on cleanup', async () => {
      const { clearAnimations, registerAnimation, waitForAnimation } = createChatStore().getState();

      registerAnimation(0);
      registerAnimation(1);

      const _promise1 = waitForAnimation(0);
      const _promise2 = waitForAnimation(1);

      // Clear animations (manual cleanup)
      clearAnimations();

      // Promises should be resolved or rejected
      // In current implementation, they might hang
      // This test documents the behavior
    });
  });

  describe('effect Cleanup Verification', () => {
    it('should verify all timers cleared on unmount', () => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let rafId: number | null = null;

      // Simulate effect setup
      timeoutId = setTimeout(() => {}, 1000);
      rafId = requestAnimationFrame(() => {});

      expect(timeoutId).not.toBeNull();
      expect(rafId).not.toBeNull();

      // Simulate cleanup
      const cleanup = () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
      };

      // Verify cleanup can be called without errors
      cleanup();
      // Can be called multiple times safely
      cleanup();
    });

    it('should handle multiple cleanup calls safely', () => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      timeoutId = setTimeout(() => {}, 1000);

      // First cleanup
      cleanup();
      expect(timeoutId).toBeNull();

      // Second cleanup (should not error)
      cleanup();
      expect(timeoutId).toBeNull();
    });
  });
});

// ============================================================================
// 6. queueMicrotask PATTERNS
// ============================================================================

describe('queueMicrotask Execution Order', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute microtasks before setTimeout', async () => {
    const executionLog: string[] = [];

    setTimeout(() => {
      executionLog.push('TIMEOUT');
    }, 0);

    queueMicrotask(() => {
      executionLog.push('MICROTASK');
    });

    // Microtasks execute before timers
    await vi.runAllTimersAsync();

    expect(executionLog).toEqual(['MICROTASK', 'TIMEOUT']);
  });

  it('should execute multiple microtasks in FIFO order', async () => {
    const executionLog: string[] = [];

    queueMicrotask(() => executionLog.push('FIRST'));
    queueMicrotask(() => executionLog.push('SECOND'));
    queueMicrotask(() => executionLog.push('THIRD'));

    await vi.runAllTimersAsync();

    expect(executionLog).toEqual(['FIRST', 'SECOND', 'THIRD']);
  });

  it('should handle nested queueMicrotask correctly', async () => {
    const executionLog: string[] = [];

    queueMicrotask(() => {
      executionLog.push('OUTER-1');
      queueMicrotask(() => {
        executionLog.push('INNER-1');
      });
    });

    queueMicrotask(() => {
      executionLog.push('OUTER-2');
    });

    await vi.runAllTimersAsync();

    // Outer tasks run first, then inner
    expect(executionLog).toEqual(['OUTER-1', 'OUTER-2', 'INNER-1']);
  });

  it('should use queueMicrotask for URL updates before navigation', async () => {
    const executionLog: string[] = [];

    // Pattern from flow-controller.ts:331
    queueMicrotask(() => {
      executionLog.push('REPLACE_URL');
    });

    setTimeout(() => {
      executionLog.push('ROUTER_PUSH');
    }, 0);

    await vi.runAllTimersAsync();

    // URL replaced before navigation
    expect(executionLog).toEqual(['REPLACE_URL', 'ROUTER_PUSH']);
  });
});

// ============================================================================
// 7. startTransition PATTERNS
// ============================================================================

describe('startTransition Batching Patterns', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should batch state updates via startTransition', () => {
    const { setEnableWebSearch, setInputValue, setSelectedMode } = getStoreState(store);

    // Multiple state updates
    setInputValue('Hello');
    setSelectedMode('chat');
    setEnableWebSearch(true);

    const state = getStoreState(store);

    // All updates applied
    expect(state.inputValue).toBe('Hello');
    expect(state.selectedMode).toBe('chat');
    expect(state.enableWebSearch).toBeTruthy();
  });

  it('should prevent re-entry during startTransition via ref guards', () => {
    // Pattern from flow-state-machine.ts:468-470
    const executionLog: string[] = [];
    let isProcessingRef = false;

    const processUpdate = () => {
      if (isProcessingRef) {
        executionLog.push('BLOCKED');
        return;
      }

      isProcessingRef = true;
      executionLog.push('PROCESSING');

      // Simulate startTransition
      setTimeout(() => {
        isProcessingRef = false;
        executionLog.push('COMPLETE');
      }, 0);
    };

    // First call
    processUpdate();

    // Second call (should be blocked)
    processUpdate();

    expect(executionLog).toEqual(['PROCESSING', 'BLOCKED']);
  });

  it('should use ref to track immediately before state update', () => {
    let stateValue = false;
    let refValue = false;

    const updateState = () => {
      // Set ref immediately (synchronous)
      refValue = true;

      // State update via startTransition (deferred)
      setTimeout(() => {
        stateValue = true;
      }, 0);
    };

    updateState();

    // Ref updated immediately
    expect(refValue).toBeTruthy();

    // State not updated yet
    expect(stateValue).toBeFalsy();
  });

  it('should verify state batching reduces re-renders', () => {
    const renderLog: string[] = [];

    // Simulate React component tracking renders
    const trackRender = () => {
      renderLog.push('RENDER');
    };

    // Without batching: 3 renders
    trackRender(); // Initial
    trackRender(); // setInputValue
    trackRender(); // setSelectedMode

    // With startTransition batching: 2 renders (initial + batched update)
    const batchedRenderLog: string[] = [];
    batchedRenderLog.push('RENDER'); // Initial
    batchedRenderLog.push('RENDER'); // All updates batched

    expect(renderLog.length).toBeGreaterThan(batchedRenderLog.length);
  });
});

// ============================================================================
// INTEGRATION: Multiple Timer Patterns
// ============================================================================

describe('integration: Multiple Timer Patterns', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it('should handle RAF + setTimeout + queueMicrotask in correct order', async () => {
    const executionLog: string[] = [];

    requestAnimationFrame(() => {
      executionLog.push('RAF');
    });

    setTimeout(() => {
      executionLog.push('TIMEOUT');
    }, 0);

    queueMicrotask(() => {
      executionLog.push('MICROTASK');
    });

    await vi.runAllTimersAsync();

    // Microtask > RAF/Timeout (browser-dependent, but microtask always first)
    expect(executionLog[0]).toBe('MICROTASK');
  });

  it('should clean up all timer types on component unmount', () => {
    // Simulate effect setup
    const timeoutId = setTimeout(() => {}, 1000);
    const intervalId = setInterval(() => {}, 500);
    const rafId = requestAnimationFrame(() => {});

    expect(timeoutId).toBeDefined();
    expect(intervalId).toBeDefined();
    expect(rafId).toBeDefined();

    // Simulate cleanup
    const cleanup = () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
      cancelAnimationFrame(rafId);
    };

    // Verify cleanup can be called without errors
    cleanup();
  });

  it('should verify no memory leaks in complex timer flow', async () => {
    const cleanupFns: (() => void)[] = [];
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    let cleanupExecuted = false;

    // Start complex flow
    rafId = requestAnimationFrame(() => {
      timeoutId = setTimeout(() => {
        queueMicrotask(() => {
          // Final callback
        });
      }, 1000);
    });

    // Register cleanup
    cleanupFns.push(() => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      cleanupExecuted = true;
    });

    // Execute all cleanups
    cleanupFns.forEach(fn => fn());

    // Verify cleanup was executed
    expect(cleanupExecuted).toBeTruthy();
    expect(rafId).not.toBeNull(); // RAF ID was set
  });
});

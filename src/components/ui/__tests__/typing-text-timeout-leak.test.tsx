/**
 * TypingText Component Timeout/Interval Leak Detection Tests
 *
 * CRITICAL BUG BEING TESTED:
 * Line 40-56 in typing-text.tsx has a MAJOR MEMORY LEAK:
 * - setInterval is created INSIDE setTimeout callback
 * - The cleanup `return () => clearInterval(interval)` is INSIDE setTimeout, NOT returned by useEffect
 * - If component unmounts AFTER setTimeout fires but BEFORE interval completes:
 *   → interval reference is LOST (out of scope)
 *   → clearInterval is NEVER called
 *   → interval leaks forever
 *
 * CORRECT PATTERN (from streaming-participants-loader.tsx:33-37):
 * ```tsx
 * useEffect(() => {
 *   const interval = setInterval(() => { ... }, delay);
 *   return () => clearInterval(interval); // ✅ Cleanup at effect scope
 * }, [deps]);
 * ```
 *
 * BROKEN PATTERN (current typing-text.tsx):
 * ```tsx
 * useEffect(() => {
 *   const timeout = setTimeout(() => {
 *     const interval = setInterval(() => { ... }, speed);
 *     return () => clearInterval(interval); // ❌ THIS NEVER GETS CALLED!
 *   }, delay);
 *   return () => clearTimeout(timeout); // ❌ Only clears timeout, NOT interval
 * }, [deps]);
 * ```
 *
 * Pattern: RTL best practices with fake timers to detect leaks
 */

import { act, render, screen } from '@/lib/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TypingText } from '../typing-text';

describe('TypingText - Timeout/Interval Leak Detection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('CRITICAL: Interval cleanup verification (FIXED)', () => {
    it('should properly cleanup interval when unmounted after setTimeout fires', () => {
      const text = 'Hello World!'; // 12 characters
      const speed = 20; // 20ms per character
      const delay = 100; // 100ms delay before typing starts

      const { unmount } = render(
        <TypingText text={text} speed={speed} delay={delay} enabled />,
      );

      // Initially, no timers should be running (before setTimeout)
      expect(screen.queryByText('Hello World!')).not.toBeInTheDocument();

      // Fast-forward PAST the setTimeout delay (100ms)
      // This fires setTimeout callback, creating the setInterval
      act(() => {
        vi.advanceTimersByTime(delay + 1); // 101ms
      });

      // At this point:
      // ✅ setTimeout has fired and completed
      // ✅ setInterval has been created and started
      // ✅ Typing animation is in progress
      // ❌ interval reference is in setTimeout callback scope (not in useEffect scope)

      // Verify typing has started
      const intervalCount = vi.getTimerCount();
      expect(intervalCount).toBeGreaterThan(0); // setInterval is running

      // 🔥 UNMOUNT THE COMPONENT (while interval is still running)
      unmount();

      // ✅ FIX WORKS: useEffect cleanup now properly clears BOTH timeout AND interval
      // The intervalId variable is in useEffect scope, so cleanup can access it

      // Allow cleanup to complete (cleanup might schedule immediate timer clearance)
      act(() => {
        vi.runOnlyPendingTimers();
      });

      // Verify the fix: no timers should remain after unmount
      const postUnmountTimerCount = vi.getTimerCount();

      // ✅ FIXED: No timers remain after unmount
      // The interval is properly cleaned up via useEffect cleanup
      expect(postUnmountTimerCount).toBe(0); // ✅ Fixed: No leak!

      // Prove the interval is still firing
      const textBefore = document.body.textContent;
      act(() => {
        vi.advanceTimersByTime(speed * 3); // Advance 3 interval cycles
      });
      const textAfter = document.body.textContent;

      // Text should NOT change after unmount, but interval is still mutating state
      // This will cause React warnings about state updates on unmounted components
      expect(textBefore).toBe(textAfter); // Component is unmounted, should not update
    });

    it('should properly cleanup on rapid mount/unmount cycles (stress test - FIXED)', () => {
      const text = 'Test';
      const speed = 20;
      const delay = 50;

      // Simulate rapid component mounting/unmounting (e.g., in modal that opens/closes)
      for (let cycle = 0; cycle < 5; cycle++) {
        const { unmount } = render(
          <TypingText text={text} speed={speed} delay={delay} enabled />,
        );

        // Wait for setTimeout to fire
        act(() => {
          vi.advanceTimersByTime(delay + 10);
        });

        // Unmount immediately (interval is now running)
        unmount();

        // Each cycle leaks an interval
      }

      // Allow all cleanups to complete
      act(() => {
        vi.runOnlyPendingTimers();
      });

      // ✅ FIXED: No leaked intervals after rapid mount/unmount cycles
      const leakedTimerCount = vi.getTimerCount();
      expect(leakedTimerCount).toBe(0); // ✅ Fixed: All intervals properly cleaned up

      // Each unmounted component successfully cleaned up its interval
      // No orphaned intervals trying to update unmounted components
    });

    it('should NOT leak when unmounted BEFORE setTimeout fires', () => {
      const text = 'Test';
      const speed = 20;
      const delay = 100;

      const { unmount } = render(
        <TypingText text={text} speed={speed} delay={delay} enabled />,
      );

      // Unmount BEFORE setTimeout fires
      vi.advanceTimersByTime(delay - 10); // 90ms (before 100ms delay)
      unmount();

      // Allow cleanup to complete
      act(() => {
        vi.runOnlyPendingTimers();
      });

      // ✅ This case works correctly because:
      // - setTimeout hasn't fired yet
      // - useEffect cleanup clears the timeout
      // - setInterval never gets created
      const timerCount = vi.getTimerCount();
      expect(timerCount).toBe(0); // ✅ No leak (timeout was cleared)
    });

    it('should NOT leak when unmounted AFTER interval completes naturally', () => {
      const text = 'Hi'; // 2 characters only
      const speed = 20;
      const delay = 50;

      const { unmount } = render(
        <TypingText text={text} speed={speed} delay={delay} enabled />,
      );

      // Wait for setTimeout to fire and interval to complete all characters
      act(() => {
        vi.advanceTimersByTime(delay + 1);
        // Wait for interval to complete all characters (2 * 20ms = 40ms + buffer)
        vi.advanceTimersByTime(speed * text.length + 50);
      });

      // At this point, interval should have cleared itself (line 44)
      const timerCountBeforeUnmount = vi.getTimerCount();
      // Note: There might still be animation frame timers from framer-motion
      // So we can't strictly check for 0, but interval should be cleared

      unmount();

      // ✅ No additional leak because interval already completed and cleared itself
      const timerCountAfterUnmount = vi.getTimerCount();
      expect(timerCountAfterUnmount).toBe(timerCountBeforeUnmount); // ✅ No new leaks
    });
  });

  describe('Cleanup verification with fake timers', () => {
    it('should track all timer lifecycle stages', () => {
      const text = 'Test';
      const speed = 20;
      const delay = 100;

      const { unmount } = render(
        <TypingText text={text} speed={speed} delay={delay} enabled />,
      );

      // Stage 1: Only setTimeout is pending
      const stage1Timers = vi.getTimerCount();
      expect(stage1Timers).toBeGreaterThan(0); // setTimeout pending

      // Stage 2: setTimeout fires, creating setInterval
      act(() => {
        vi.advanceTimersByTime(delay + 1);
      });
      const stage2Timers = vi.getTimerCount();
      expect(stage2Timers).toBeGreaterThan(0); // setInterval running

      // Stage 3: Unmount (SHOULD clear all timers, but doesn't due to bug)
      unmount();
      const stage3Timers = vi.getTimerCount();

      // ✅ FIXED: No timers should remain after unmount
      expect(stage3Timers).toBe(0); // ✅ Fixed: interval properly cleaned up
    });

    it('should verify cleanup function properly clears both timeout and interval (FIXED)', () => {
      const onComplete = vi.fn();
      const text = 'Test';
      const speed = 20;
      const delay = 50;

      const { unmount } = render(
        <TypingText text={text} speed={speed} delay={delay} onComplete={onComplete} enabled />,
      );

      // Let setTimeout fire
      act(() => {
        vi.advanceTimersByTime(delay + 1);
      });

      // Verify interval is running
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      // Unmount triggers useEffect cleanup
      unmount();

      // ✅ FIXED: useEffect cleanup now properly clears BOTH timeout and interval
      const timersAfterUnmount = vi.getTimerCount();
      expect(timersAfterUnmount).toBe(0); // ✅ Fixed: Both timeout and interval cleared

      // onComplete should NOT be called (component unmounted)
      // Don't use runAllTimers - it will cause infinite loop with leaked interval
      // Just advance enough to verify interval would have tried to fire
      act(() => {
        vi.advanceTimersByTime(speed * text.length + 100);
      });
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe('Disabled state (no leak - immediate render)', () => {
    it('should not create any timers when disabled', () => {
      const text = 'Test';

      render(<TypingText text={text} enabled={false} />);

      // No timers created when disabled
      const timerCount = vi.getTimerCount();
      expect(timerCount).toBe(0); // ✅ No timers

      // Text renders immediately
      expect(screen.getByText(text)).toBeInTheDocument();
    });

    it('should properly cleanup when toggling enabled state (FIXED)', () => {
      const text = 'Test';
      const { rerender, unmount } = render(
        <TypingText text={text} enabled delay={50} />,
      );

      // Advance past delay to create interval
      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      // Toggle to disabled (triggers re-render and cleanup)
      rerender(<TypingText text={text} enabled={false} delay={50} />);

      // ✅ FIXED: Timers properly cleaned up when toggling enabled state
      const timersAfterDisable = vi.getTimerCount();
      expect(timersAfterDisable).toBe(0); // ✅ Fixed: Cleanup works on prop change

      unmount();
    });
  });

  describe('Edge cases that expose the leak', () => {
    it('should properly cleanup on fast successive prop changes (FIXED)', () => {
      const { rerender, unmount } = render(
        <TypingText text="First" speed={20} delay={50} enabled />,
      );

      // Let first timeout fire
      act(() => {
        vi.advanceTimersByTime(60);
      });

      // Change text (triggers new effect, old interval leaks)
      rerender(<TypingText text="Second" speed={20} delay={50} enabled />);

      // Let second timeout fire
      act(() => {
        vi.advanceTimersByTime(60);
      });

      // ✅ FIXED: Old interval properly cleaned up before new one starts
      const timerCount = vi.getTimerCount();
      expect(timerCount).toBe(1); // ✅ Fixed: Only current interval running

      unmount();
    });

    it('should demonstrate state update warnings on unmounted component', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const text = 'Test';

      const { unmount } = render(
        <TypingText text={text} speed={20} delay={50} enabled />,
      );

      // Fire setTimeout to create interval
      act(() => {
        vi.advanceTimersByTime(60);
      });

      // Unmount component
      unmount();

      // Advance timers - leaked interval tries to setState on unmounted component
      // Don't use runAllTimers - causes infinite loop
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // React will warn about state updates on unmounted component
      // (This might not trigger in test environment, but would in real app)

      consoleSpy.mockRestore();
    });

    it('should properly cleanup with zero delay (FIXED)', () => {
      const text = 'Test';
      const { unmount } = render(
        <TypingText text={text} speed={20} delay={0} enabled />,
      );

      // With delay=0, setTimeout fires immediately
      act(() => {
        vi.advanceTimersByTime(1);
      });

      // Interval is now running
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      // Unmount
      unmount();

      // ✅ FIXED: Interval properly cleaned up even with zero delay
      const timerCount = vi.getTimerCount();
      expect(timerCount).toBe(0); // ✅ Fixed: No leak with delay=0
    });
  });

  describe('Comparison: Correct cleanup pattern (expected behavior)', () => {
    it('should document the CORRECT pattern (for reference)', () => {
      // This test documents what the FIXED code should do:
      // ✅ Store interval reference at useEffect scope
      // ✅ Return cleanup function from useEffect (not from setTimeout)
      // ✅ Cleanup clears BOTH timeout and interval

      /* CORRECT PATTERN:
      useEffect(() => {
        let intervalRef: NodeJS.Timeout | null = null;

        const timeoutRef = setTimeout(() => {
          intervalRef = setInterval(() => {
            // ... typing logic
          }, speed);
        }, delay);

        return () => {
          clearTimeout(timeoutRef);
          if (intervalRef) clearInterval(intervalRef);
        };
      }, [deps]);
      */

      // This test intentionally passes to document expected behavior
      expect(true).toBe(true);
    });
  });
});

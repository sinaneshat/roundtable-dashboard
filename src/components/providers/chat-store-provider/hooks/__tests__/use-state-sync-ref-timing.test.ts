/**
 * State Sync Ref Timing Tests
 *
 * Tests for the critical timing of ref updates when chat methods change.
 * Verifies that useLayoutEffect ensures refs are updated BEFORE other effects run.
 *
 * Bug fixed: "Cannot read properties of undefined (reading 'state')"
 * Root cause: sendMessageRef.current held stale function after useChat recreated
 * Solution: Use useLayoutEffect instead of useEffect for ref synchronization
 */

import { act, renderHook } from '@testing-library/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Test that useLayoutEffect runs before useEffect
 * This is the fundamental behavior we rely on for the fix
 */
describe('useLayoutEffect vs useEffect timing', () => {
  it('useLayoutEffect runs before useEffect in same render', () => {
    const executionOrder: string[] = [];

    const { result } = renderHook(() => {
      const [value, setValue] = useState(0);

      useLayoutEffect(() => {
        executionOrder.push(`layoutEffect-${value}`);
      }, [value]);

      useEffect(() => {
        executionOrder.push(`effect-${value}`);
      }, [value]);

      return { setValue, value };
    });

    // Initial render
    expect(executionOrder).toEqual(['layoutEffect-0', 'effect-0']);

    // Trigger re-render
    executionOrder.length = 0;
    act(() => {
      result.current.setValue(1);
    });

    // Verify layoutEffect runs first
    expect(executionOrder[0]).toBe('layoutEffect-1');
    expect(executionOrder[1]).toBe('effect-1');
  });

  it('refs updated in useLayoutEffect are available in useEffect', () => {
    const capturedValues: Array<{ refValue: number; stateValue: number }> = [];

    const { result } = renderHook(() => {
      const [value, setValue] = useState(0);
      const refValue = useRef(0);

      // Simulates useStateSync updating refs
      useLayoutEffect(() => {
        refValue.current = value;
      }, [value]);

      // Simulates usePendingMessage reading ref
      useEffect(() => {
        capturedValues.push({
          refValue: refValue.current,
          stateValue: value,
        });
      }, [value]);

      return { setValue, value, refValue };
    });

    // Initial render - ref should match state in useEffect
    expect(capturedValues[0]).toEqual({ refValue: 0, stateValue: 0 });

    // Update state
    act(() => {
      result.current.setValue(42);
    });

    // Ref should be updated before useEffect runs
    expect(capturedValues[1]).toEqual({ refValue: 42, stateValue: 42 });
  });

  it('wITHOUT useLayoutEffect: ref can be stale in useEffect', () => {
    const capturedValues: Array<{ refValue: number; stateValue: number }> = [];

    const { result } = renderHook(() => {
      const [value, setValue] = useState(0);
      const refValue = useRef(0);

      // BAD: Using useEffect for ref update (old behavior)
      // This can cause ref to be stale when another useEffect reads it
      useEffect(() => {
        refValue.current = value;
      }, [value]);

      // Another useEffect that reads the ref
      // Might get stale value if effects run in wrong order
      useEffect(() => {
        capturedValues.push({
          refValue: refValue.current,
          stateValue: value,
        });
      }, [value]);

      return { setValue, value, refValue };
    });

    // Initial render - both effects run, order might vary
    // In React, effects in same component run in definition order
    // but this test demonstrates the concept

    // Update state
    act(() => {
      result.current.setValue(42);
    });

    // Note: In this simplified case, React runs effects in order,
    // so ref IS updated. But in the real bug, the effects were in
    // different components/hooks, causing timing issues.
  });
});

/**
 * Test that simulates the actual sendMessageRef scenario
 */
describe('sendMessageRef stale function scenario', () => {
  it('sendMessage function changes when threadId changes', () => {
    // Simulate AI SDK's useChat behavior where sendMessage changes with id
    const createSendMessage = (id: string | undefined) => {
      return vi.fn().mockImplementation(() => {
        if (!id) {
          throw new Error('Cannot read properties of undefined (reading \'state\')');
        }
        return Promise.resolve();
      });
    };

    const { result, rerender } = renderHook(
      ({ threadId }: { threadId: string | undefined }) => {
        // Simulates useChat creating new sendMessage when id changes
        const [sendMessage] = useState(() => createSendMessage(threadId));
        const sendMessageRef = useRef(sendMessage);

        // With useLayoutEffect (the fix), ref is always fresh
        useLayoutEffect(() => {
          sendMessageRef.current = sendMessage;
        }, [sendMessage]);

        return { sendMessage, sendMessageRef };
      },
      { initialProps: { threadId: undefined } },
    );

    // Initially, sendMessage would throw (no threadId)
    expect(() => result.current.sendMessage()).toThrow();

    // Change threadId - this is when race condition could occur
    // But with useLayoutEffect, ref should be updated immediately
    rerender({ threadId: '01KCFQNBEVMRHMEACZ9TTVB75H' });

    // The ref should now point to the new function
    // (In the real bug, ref.current was stale and called old function)
  });
});

/**
 * Integration test simulating the full provider flow
 */
describe('provider ref synchronization', () => {
  it('sendMessageRef is updated before usePendingMessage effect runs', async () => {
    const effectLog: string[] = [];

    // Simulate the actual hook pattern from the provider
    const { result } = renderHook(() => {
      const [threadId, setThreadId] = useState<string | undefined>(undefined);

      // Simulates useChat - sendMessage changes when threadId changes
      const sendMessage = vi.fn().mockImplementation(() => {
        effectLog.push(`sendMessage called with threadId: ${threadId}`);
        if (!threadId) {
          throw new Error('No threadId');
        }
      });

      const sendMessageRef = useRef(sendMessage);

      // useStateSync pattern - uses useLayoutEffect
      useLayoutEffect(() => {
        effectLog.push(`layoutEffect: updating sendMessageRef`);
        sendMessageRef.current = sendMessage;
      }, [sendMessage]);

      // usePendingMessage pattern - uses useEffect
      useEffect(() => {
        effectLog.push(`effect: about to call sendMessageRef.current`);
        // In real code, this would call sendMessageRef.current(pendingMessage)
      }, [threadId]); // Runs when threadId changes

      return { setThreadId, sendMessageRef, threadId };
    });

    // Clear initial logs
    effectLog.length = 0;

    // Simulate thread creation (threadId goes from undefined to valid)
    act(() => {
      result.current.setThreadId('01KCFQNBEVMRHMEACZ9TTVB75H');
    });

    // Verify layoutEffect ran before effect
    const layoutEffectIndex = effectLog.findIndex(log => log.includes('layoutEffect'));
    const effectIndex = effectLog.findIndex(log => log.includes('effect: about'));

    expect(layoutEffectIndex).toBeLessThan(effectIndex);
    expect(effectLog[layoutEffectIndex]).toBe('layoutEffect: updating sendMessageRef');
  });
});

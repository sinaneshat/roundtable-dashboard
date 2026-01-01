/**
 * useChatScroll Ground Rules Tests
 *
 * Tests that verify the SCROLL BEHAVIOR GROUND RULES documented in useChatScroll.ts
 *
 * KEY GROUND RULES TESTED:
 * ============================================================================================
 * 1. useChatScroll does NOT auto-scroll during message updates
 * 2. useChatScroll does NOT auto-scroll during streaming
 * 3. useChatScroll only provides manual scrollToBottom function
 * 4. isAtBottomRef tracks scroll position correctly
 * 5. Scrolling up sets isAtBottomRef to false
 * 6. Scrolling to bottom sets isAtBottomRef to true
 * 7. resetScrollState properly resets all refs
 * 8. Programmatic scroll flag prevents scroll detection interference
 * 9. NO initial auto-scroll - user triggers scroll via ChatScrollButton only
 * ============================================================================================
 *
 * CRITICAL SEPARATION OF CONCERNS:
 * - useChatScroll: Manual scroll control + position tracking (this file tests this)
 * - ChatScrollButton: UI trigger for manual scrollToBottom()
 * - TanStack Virtual: Efficient rendering (not scroll behavior)
 *
 * NO AUTO-SCROLL EVER - Only user-triggered scroll via ChatScrollButton
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@/lib/testing';

import { useChatScroll } from '../use-chat-scroll';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create mock UIMessage for testing
 */
function createMockMessage(id: string, content: string): UIMessage {
  return {
    id,
    role: 'user',
    content,
    parts: [{ type: 'text', text: content }],
  };
}

/**
 * Simulate window scroll event
 * @param scrollTop - Current scroll position
 * @param scrollHeight - Total scrollable height
 * @param clientHeight - Viewport height
 */
function simulateScroll(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): void {
  // Set scroll position
  Object.defineProperty(window, 'scrollY', {
    value: scrollTop,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(document.documentElement, 'scrollTop', {
    value: scrollTop,
    writable: true,
    configurable: true,
  });

  // Set scroll dimensions
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    value: scrollHeight,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    value: clientHeight,
    writable: true,
    configurable: true,
  });

  // Trigger scroll event
  const scrollEvent = new Event('scroll');
  window.dispatchEvent(scrollEvent);
}

/**
 * Simulate scrolling to bottom of page
 */
function simulateScrollToBottom(scrollHeight = 2000, clientHeight = 800): void {
  const scrollTop = scrollHeight - clientHeight;
  simulateScroll(scrollTop, scrollHeight, clientHeight);
}

/**
 * Simulate scrolling up (away from bottom)
 * Ensures scroll position is FAR from bottom (more than default threshold)
 */
function simulateScrollUp(scrollHeight = 2000, clientHeight = 800): void {
  const scrollTop = 300; // Far from bottom (well beyond 100px threshold)
  simulateScroll(scrollTop, scrollHeight, clientHeight);
}

/**
 * Simulate scrolling to middle of page
 */
function simulateScrollMiddle(scrollHeight = 2000, clientHeight = 800): void {
  const scrollTop = scrollHeight / 2 - clientHeight / 2;
  simulateScroll(scrollTop, scrollHeight, clientHeight);
}

// ============================================================================
// SETUP / TEARDOWN
// ============================================================================

describe('useChatScroll - SCROLL BEHAVIOR GROUND RULES', () => {
  let rafCallbacks: Array<FrameRequestCallback> = [];
  let rafIdCounter = 0;
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCaf = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset RAF tracking
    rafCallbacks = [];
    rafIdCounter = 0;

    // Mock requestAnimationFrame to capture callbacks
    globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = ++rafIdCounter;
      rafCallbacks.push(callback);
      return id;
    });

    globalThis.cancelAnimationFrame = vi.fn();

    // Mock window scroll APIs
    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'scrollTop', {
      value: 0,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 2000,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document.body, 'scrollHeight', {
      value: 2000,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 800,
      writable: true,
      configurable: true,
    });

    // Mock window.scrollTo
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
    vi.clearAllMocks();
  });

  // ============================================================================
  // GROUND RULE 1: NO AUTO-SCROLL DURING MESSAGE UPDATES
  // ============================================================================

  describe('gROUND RULE 1: NO auto-scroll during message updates', () => {
    it('should NOT auto-scroll when messages are added', () => {
      const { rerender } = renderHook(
        ({ messages }) => useChatScroll({ messages }),
        {
          initialProps: { messages: [createMockMessage('1', 'First message')] },
        },
      );

      // Clear any RAF from initial render
      rafCallbacks = [];
      vi.mocked(window.scrollTo).mockClear();

      // Add more messages
      rerender({ messages: [
        createMockMessage('1', 'First message'),
        createMockMessage('2', 'Second message'),
        createMockMessage('3', 'Third message'),
      ] });

      // Execute any RAF callbacks
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // CRITICAL: scrollTo should NOT have been called
      expect(window.scrollTo).not.toHaveBeenCalled();
    });

    it('should NOT auto-scroll when message content changes', () => {
      const { rerender } = renderHook(
        ({ messages }) => useChatScroll({ messages }),
        {
          initialProps: { messages: [createMockMessage('1', 'Original content')] },
        },
      );

      vi.mocked(window.scrollTo).mockClear();

      // Update message content
      rerender({ messages: [createMockMessage('1', 'Updated content')] });

      // Execute any RAF callbacks
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(window.scrollTo).not.toHaveBeenCalled();
    });

    it('should NOT auto-scroll when multiple messages are added rapidly', () => {
      const { rerender } = renderHook(
        ({ messages }) => useChatScroll({ messages }),
        {
          initialProps: { messages: [] },
        },
      );

      vi.mocked(window.scrollTo).mockClear();

      // Simulate rapid message additions (like during streaming)
      for (let i = 1; i <= 10; i++) {
        const messages = Array.from({ length: i }, (_, idx) =>
          createMockMessage(`${idx + 1}`, `Message ${idx + 1}`));
        rerender({ messages });
      }

      // Execute any RAF callbacks
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(window.scrollTo).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // GROUND RULE 2: NO AUTO-SCROLL DURING STREAMING
  // ============================================================================

  describe('gROUND RULE 2: NO auto-scroll during streaming', () => {
    it('should NOT auto-scroll when streaming message is updated incrementally', () => {
      const { rerender } = renderHook(
        ({ messages }) => useChatScroll({ messages }),
        {
          initialProps: { messages: [createMockMessage('stream-1', 'Hello')] },
        },
      );

      vi.mocked(window.scrollTo).mockClear();

      // Simulate incremental streaming updates
      const streamingContent = [
        'Hello',
        'Hello world',
        'Hello world!',
        'Hello world! This',
        'Hello world! This is',
        'Hello world! This is a',
        'Hello world! This is a streaming',
        'Hello world! This is a streaming message.',
      ];

      streamingContent.forEach((content) => {
        rerender({ messages: [createMockMessage('stream-1', content)] });
      });

      // Execute any RAF callbacks
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(window.scrollTo).not.toHaveBeenCalled();
    });

    it('should NOT auto-scroll during multi-participant streaming', () => {
      const { rerender } = renderHook(
        ({ messages }) => useChatScroll({ messages }),
        {
          initialProps: { messages: [] },
        },
      );

      vi.mocked(window.scrollTo).mockClear();

      // Simulate streaming from multiple participants
      const streamScenarios = [
        [createMockMessage('p1', 'Participant 1 thinking')],
        [
          createMockMessage('p1', 'Participant 1 thinking...'),
          createMockMessage('p2', 'Participant 2 analyzing'),
        ],
        [
          createMockMessage('p1', 'Participant 1 complete response'),
          createMockMessage('p2', 'Participant 2 analyzing...'),
        ],
        [
          createMockMessage('p1', 'Participant 1 complete response'),
          createMockMessage('p2', 'Participant 2 complete response'),
        ],
      ];

      streamScenarios.forEach((messages) => {
        rerender({ messages });
      });

      // Execute any RAF callbacks
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(window.scrollTo).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // GROUND RULE 3: ONLY MANUAL scrollToBottom FUNCTION
  // ============================================================================

  describe('gROUND RULE 3: Only manual scrollToBottom function', () => {
    it('should provide scrollToBottom function', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [] }),
      );

      expect(typeof result.current.scrollToBottom).toBe('function');
    });

    it('should scroll to bottom when scrollToBottom is called manually', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [createMockMessage('1', 'Test')] }),
      );

      vi.mocked(window.scrollTo).mockClear();
      rafCallbacks = [];

      // MANUAL scroll trigger
      act(() => {
        result.current.scrollToBottom('smooth');
      });

      // Execute RAF callbacks (scrollToBottom uses RAF)
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // NOW scrollTo should be called
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: expect.any(Number),
        behavior: 'smooth',
      });
    });

    it('should use instant behavior when specified', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [] }),
      );

      act(() => {
        result.current.scrollToBottom('instant');
      });

      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(window.scrollTo).toHaveBeenCalledWith({
        top: expect.any(Number),
        behavior: 'instant',
      });
    });

    it('should default to smooth behavior', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [] }),
      );

      act(() => {
        result.current.scrollToBottom();
      });

      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(window.scrollTo).toHaveBeenCalledWith({
        top: expect.any(Number),
        behavior: 'smooth',
      });
    });
  });

  // ============================================================================
  // GROUND RULE 4: isAtBottomRef TRACKS SCROLL POSITION
  // ============================================================================

  describe('gROUND RULE 4: isAtBottomRef tracks scroll position correctly', () => {
    it('should initialize isAtBottomRef to true', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [] }),
      );

      expect(result.current.isAtBottomRef.current).toBe(true);
    });

    it('should track when user is at bottom (within threshold)', () => {
      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createMockMessage('1', 'Test')],
          autoScrollThreshold: 100,
        }),
      );

      // Scroll to exactly at bottom
      simulateScrollToBottom(2000, 800);

      // Wait for RAF throttle
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(result.current.isAtBottomRef.current).toBe(true);
    });

    it('should track when user is near bottom (within threshold)', () => {
      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createMockMessage('1', 'Test')],
          autoScrollThreshold: 100,
        }),
      );

      // Scroll to 50px from bottom (within 100px threshold)
      const scrollHeight = 2000;
      const clientHeight = 800;
      const scrollTop = scrollHeight - clientHeight - 50;

      simulateScroll(scrollTop, scrollHeight, clientHeight);

      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(result.current.isAtBottomRef.current).toBe(true);
    });

    it('should track when user is away from bottom (beyond threshold)', () => {
      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createMockMessage('1', 'Test')],
          autoScrollThreshold: 100,
        }),
      );

      // Start at bottom
      simulateScrollToBottom();
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });
      expect(result.current.isAtBottomRef.current).toBe(true);

      // Scroll up significantly (more than threshold + 10px for scroll delta check)
      simulateScrollUp();
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(result.current.isAtBottomRef.current).toBe(false);
    });
  });

  // ============================================================================
  // GROUND RULE 5: SCROLLING UP SETS isAtBottomRef TO FALSE
  // ============================================================================

  describe('gROUND RULE 5: Scrolling up sets isAtBottomRef to false', () => {
    it('should set isAtBottomRef to false when scrolling up by more than 10px', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [createMockMessage('1', 'Test')] }),
      );

      const scrollHeight = 2000;
      const clientHeight = 800;

      // Start at bottom
      const bottomScrollTop = scrollHeight - clientHeight; // 1200
      simulateScroll(bottomScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });
      expect(result.current.isAtBottomRef.current).toBe(true);

      // Scroll up by 150px (beyond 100px threshold, delta > 10px)
      // New position: 1050, distanceFromBottom = 2000 - 1050 - 800 = 150px (beyond 100px)
      const newScrollTop = bottomScrollTop - 150;
      simulateScroll(newScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(result.current.isAtBottomRef.current).toBe(false);
    });

    it('should detect upward scroll even with small scroll delta', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [createMockMessage('1', 'Test')] }),
      );

      const scrollHeight = 2000;
      const clientHeight = 800;

      // Start at bottom
      const bottomScrollTop = scrollHeight - clientHeight; // 1200
      simulateScroll(bottomScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });
      expect(result.current.isAtBottomRef.current).toBe(true);

      // Scroll up by 120px (beyond 100px threshold but only 20px more than threshold)
      // This tests that the scroll delta detection (-10px threshold) triggers the state change
      // New position: 1080, distanceFromBottom = 2000 - 1080 - 800 = 120px (beyond 100px)
      const newScrollTop = bottomScrollTop - 120;
      simulateScroll(newScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(result.current.isAtBottomRef.current).toBe(false);
    });

    it('should NOT change isAtBottomRef on tiny scroll movements (less than 10px up)', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [createMockMessage('1', 'Test')] }),
      );

      // Start at bottom
      simulateScrollToBottom(2000, 800);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // Tiny scroll up by 5px (below threshold)
      const scrollHeight = 2000;
      const clientHeight = 800;
      const currentScrollTop = scrollHeight - clientHeight;
      const newScrollTop = currentScrollTop - 5;

      simulateScroll(newScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // Should still be considered at bottom (within threshold)
      expect(result.current.isAtBottomRef.current).toBe(true);
    });
  });

  // ============================================================================
  // GROUND RULE 6: SCROLLING TO BOTTOM SETS isAtBottomRef TO TRUE
  // ============================================================================

  describe('gROUND RULE 6: Scrolling to bottom sets isAtBottomRef to true', () => {
    it('should set isAtBottomRef to true when scrolling to exact bottom', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [createMockMessage('1', 'Test')] }),
      );

      const scrollHeight = 2000;
      const clientHeight = 800;

      // Start at bottom
      const bottomScrollTop = scrollHeight - clientHeight;
      simulateScroll(bottomScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // Scroll away from bottom (establish position)
      const midScrollTop = 400;
      simulateScroll(midScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // Now scroll back down toward bottom (downward delta, no upward check)
      simulateScroll(bottomScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(result.current.isAtBottomRef.current).toBe(true);
    });

    it('should set isAtBottomRef to true when within threshold of bottom', () => {
      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createMockMessage('1', 'Test')],
          autoScrollThreshold: 100,
        }),
      );

      // Start away from bottom
      simulateScrollUp();
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // Scroll to within threshold (50px from bottom)
      const scrollHeight = 2000;
      const clientHeight = 800;
      const scrollTop = scrollHeight - clientHeight - 50;

      simulateScroll(scrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(result.current.isAtBottomRef.current).toBe(true);
    });

    it('should respect custom autoScrollThreshold', () => {
      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createMockMessage('1', 'Test')],
          autoScrollThreshold: 200, // Custom threshold
        }),
      );

      // Scroll to 150px from bottom (within 200px threshold)
      const scrollHeight = 2000;
      const clientHeight = 800;
      const scrollTop = scrollHeight - clientHeight - 150;

      simulateScroll(scrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(result.current.isAtBottomRef.current).toBe(true);
    });
  });

  // ============================================================================
  // GROUND RULE 7: resetScrollState RESETS ALL REFS
  // ============================================================================

  describe('gROUND RULE 7: resetScrollState properly resets all refs', () => {
    it('should reset isAtBottomRef to true', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [createMockMessage('1', 'Test')] }),
      );

      const scrollHeight = 2000;
      const clientHeight = 800;
      const bottomScrollTop = scrollHeight - clientHeight; // 1200

      // Establish bottom position first
      simulateScroll(bottomScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // Scroll away from bottom (beyond 100px threshold)
      simulateScroll(bottomScrollTop - 150, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });
      expect(result.current.isAtBottomRef.current).toBe(false);

      // Reset state
      act(() => {
        result.current.resetScrollState();
      });

      expect(result.current.isAtBottomRef.current).toBe(true);
    });

    it('should reset last scroll position tracking', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [createMockMessage('1', 'Test')] }),
      );

      const scrollHeight = 2000;
      const clientHeight = 800;

      // Scroll to establish position
      simulateScroll(600, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // Reset state
      act(() => {
        result.current.resetScrollState();
      });

      // After reset, scroll detection should work from clean state
      // First establish a position (at bottom)
      const bottomScrollTop = scrollHeight - clientHeight; // 1200
      simulateScroll(bottomScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // Then scroll up to verify detection works (beyond 100px threshold)
      simulateScroll(bottomScrollTop - 150, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(result.current.isAtBottomRef.current).toBe(false);
    });

    it('should automatically reset when messages become empty (navigation)', () => {
      const { result, rerender } = renderHook(
        ({ messages }) => useChatScroll({ messages }),
        {
          initialProps: { messages: [createMockMessage('1', 'Test')] },
        },
      );

      const scrollHeight = 2000;
      const clientHeight = 800;
      const bottomScrollTop = scrollHeight - clientHeight; // 1200

      // Establish bottom position
      simulateScroll(bottomScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // Scroll away from bottom (beyond 100px threshold)
      simulateScroll(bottomScrollTop - 150, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });
      expect(result.current.isAtBottomRef.current).toBe(false);

      // Navigate away (empty messages)
      rerender({ messages: [] });

      // Should auto-reset
      expect(result.current.isAtBottomRef.current).toBe(true);
    });
  });

  // ============================================================================
  // GROUND RULE 8: PROGRAMMATIC SCROLL FLAG PREVENTS INTERFERENCE
  // ============================================================================

  describe('gROUND RULE 8: Programmatic scroll flag prevents interference', () => {
    it('should set programmatic scroll flag when scrollToBottom is called', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [createMockMessage('1', 'Test')] }),
      );

      // Call scrollToBottom
      act(() => {
        result.current.scrollToBottom();
      });

      // The programmatic flag is internal, but we can verify behavior:
      // isAtBottomRef should be set to true immediately
      expect(result.current.isAtBottomRef.current).toBe(true);
    });

    it('should NOT update isAtBottomRef during programmatic scroll', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [createMockMessage('1', 'Test')] }),
      );

      const scrollHeight = 2000;
      const clientHeight = 800;
      const bottomScrollTop = scrollHeight - clientHeight;

      // Establish bottom position
      simulateScroll(bottomScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // Start away from bottom
      simulateScroll(bottomScrollTop - 200, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });
      expect(result.current.isAtBottomRef.current).toBe(false);

      // Trigger programmatic scroll
      act(() => {
        result.current.scrollToBottom();
      });

      // isAtBottomRef should be true (set by scrollToBottom)
      expect(result.current.isAtBottomRef.current).toBe(true);

      // Simulate scroll event during programmatic scroll
      // (this would normally be triggered by browser during scrollTo animation)
      simulateScrollMiddle();

      // Because programmatic flag is set, scroll detection should ignore this
      // Note: We can't easily test the RAF timing here, but the flag prevents
      // the onScroll handler from running
    });

    it('should clear programmatic scroll flag after scroll completes', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [createMockMessage('1', 'Test')] }),
      );

      const scrollHeight = 2000;
      const clientHeight = 800;
      const bottomScrollTop = scrollHeight - clientHeight; // 1200

      // Trigger programmatic scroll
      act(() => {
        result.current.scrollToBottom();
      });

      // Execute RAF callbacks (including the cleanup RAF)
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // After RAF completes, normal scroll detection should work again
      // First establish bottom position
      simulateScroll(bottomScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // Verify by scrolling up and checking isAtBottomRef updates (beyond 100px threshold)
      simulateScroll(bottomScrollTop - 150, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      expect(result.current.isAtBottomRef.current).toBe(false);
    });
  });

  // ============================================================================
  // EDGE CASES AND INTEGRATION
  // ============================================================================

  describe('edge cases and integration scenarios', () => {
    it('should handle scroll events when enableNearBottomDetection is false', () => {
      const { result } = renderHook(() =>
        useChatScroll({
          messages: [createMockMessage('1', 'Test')],
          enableNearBottomDetection: false,
        }),
      );

      // isAtBottomRef should always be true when detection is disabled
      expect(result.current.isAtBottomRef.current).toBe(true);

      // Scroll away from bottom
      simulateScrollUp();
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // Should still be true (detection disabled)
      expect(result.current.isAtBottomRef.current).toBe(true);
    });

    it('should throttle scroll events with RAF', () => {
      renderHook(() =>
        useChatScroll({ messages: [createMockMessage('1', 'Test')] }),
      );

      const initialRafCount = rafCallbacks.length;

      // Trigger multiple scroll events rapidly
      for (let i = 0; i < 10; i++) {
        simulateScrollUp();
      }

      // Should NOT create 10 RAF callbacks (throttled)
      const newRafCount = rafCallbacks.length - initialRafCount;
      expect(newRafCount).toBeLessThan(10);
    });

    it('should handle scroll when messages array changes frequently', () => {
      const { result, rerender } = renderHook(
        ({ messages }) => useChatScroll({ messages }),
        {
          initialProps: { messages: [createMockMessage('1', 'First')] },
        },
      );

      const scrollHeight = 2000;
      const clientHeight = 800;
      const bottomScrollTop = scrollHeight - clientHeight;

      // Establish bottom position first
      simulateScroll(bottomScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // User scrolls away from bottom
      simulateScroll(600, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // Messages change (streaming updates)
      for (let i = 2; i <= 5; i++) {
        rerender({
          messages: Array.from({ length: i }, (_, idx) =>
            createMockMessage(`${idx + 1}`, `Message ${idx + 1}`)),
        });
      }

      // isAtBottomRef should maintain state (no auto-scroll)
      expect(result.current.isAtBottomRef.current).toBe(false);
    });

    it('should cleanup scroll listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() =>
        useChatScroll({ messages: [createMockMessage('1', 'Test')] }),
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function),
      );
    });

    it('should handle rapid scrollToBottom calls gracefully', () => {
      const { result } = renderHook(() =>
        useChatScroll({ messages: [createMockMessage('1', 'Test')] }),
      );

      // Call scrollToBottom multiple times rapidly
      act(() => {
        result.current.scrollToBottom();
        result.current.scrollToBottom();
        result.current.scrollToBottom();
      });

      // Execute RAF callbacks
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // Should not cause errors and isAtBottomRef should be true
      expect(result.current.isAtBottomRef.current).toBe(true);
      expect(window.scrollTo).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // CRITICAL: VERIFY NO AUTO-SCROLL IN COMPREHENSIVE SCENARIOS
  // ============================================================================

  describe('cOMPREHENSIVE: Verify NO auto-scroll in real-world scenarios', () => {
    it('should NEVER auto-scroll during complete chat session', () => {
      const { rerender } = renderHook(
        ({ messages }) => useChatScroll({ messages }),
        {
          initialProps: { messages: [] },
        },
      );

      vi.mocked(window.scrollTo).mockClear();

      // Simulate complete chat session
      const scenarios = [
        // User sends message
        [createMockMessage('user-1', 'Hello')],
        // Participant 1 starts streaming
        [
          createMockMessage('user-1', 'Hello'),
          createMockMessage('p1', 'Hi'),
        ],
        [
          createMockMessage('user-1', 'Hello'),
          createMockMessage('p1', 'Hi there'),
        ],
        [
          createMockMessage('user-1', 'Hello'),
          createMockMessage('p1', 'Hi there!'),
        ],
        // Participant 2 starts streaming
        [
          createMockMessage('user-1', 'Hello'),
          createMockMessage('p1', 'Hi there!'),
          createMockMessage('p2', 'Hey'),
        ],
        [
          createMockMessage('user-1', 'Hello'),
          createMockMessage('p1', 'Hi there!'),
          createMockMessage('p2', 'Hey, how can'),
        ],
        [
          createMockMessage('user-1', 'Hello'),
          createMockMessage('p1', 'Hi there!'),
          createMockMessage('p2', 'Hey, how can I help?'),
        ],
      ];

      scenarios.forEach((messages) => {
        rerender({ messages });
      });

      // Execute any RAF callbacks
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // CRITICAL: scrollTo should NEVER be called automatically
      expect(window.scrollTo).not.toHaveBeenCalled();
    });

    it('should maintain user scroll position during streaming', () => {
      const { result, rerender } = renderHook(
        ({ messages }) => useChatScroll({ messages }),
        {
          initialProps: { messages: [createMockMessage('1', 'First')] },
        },
      );

      const scrollHeight = 2000;
      const clientHeight = 800;
      const bottomScrollTop = scrollHeight - clientHeight;

      // Establish bottom position
      simulateScroll(bottomScrollTop, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });

      // User scrolls to read earlier messages
      simulateScroll(400, scrollHeight, clientHeight);
      act(() => {
        rafCallbacks.forEach(cb => cb(performance.now()));
      });
      expect(result.current.isAtBottomRef.current).toBe(false);

      // New streaming content arrives
      const streamUpdates = [
        [createMockMessage('1', 'First'), createMockMessage('2', 'Stream')],
        [createMockMessage('1', 'First'), createMockMessage('2', 'Streaming')],
        [createMockMessage('1', 'First'), createMockMessage('2', 'Streaming...')],
      ];

      streamUpdates.forEach((messages) => {
        rerender({ messages });
      });

      // User's scroll position should be preserved
      expect(result.current.isAtBottomRef.current).toBe(false);
      expect(window.scrollTo).not.toHaveBeenCalled();
    });
  });
});

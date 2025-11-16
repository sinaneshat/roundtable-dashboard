/**
 * Navigation Reset Tests - Always Reset Behavior
 *
 * Validates that useNavigationReset ALWAYS resets state when called,
 * regardless of current pathname (/chat or thread screen).
 *
 * **CRITICAL REQUIREMENT**:
 * - Clicking "New Chat" or logo should ALWAYS reset state
 * - Should work from /chat (overview) or /chat/[slug] (thread)
 * - Should immediately navigate to /chat
 */

import { renderHook } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

import { useChatStore } from '@/components/providers/chat-store-provider';

import { useNavigationReset } from '../use-navigation-reset';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

// Mock chat store provider
vi.mock('@/components/providers/chat-store-provider', () => ({
  useChatStore: vi.fn(),
}));

describe('useNavigationReset - Always Reset Behavior', () => {
  const mockResetToNewChat = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useChatStore).mockReturnValue(mockResetToNewChat);
  });

  it('should reset state when called from /chat (overview screen)', () => {
    // Simulate being on /chat (overview screen)
    vi.mocked(usePathname).mockReturnValue('/chat');

    const { result } = renderHook(() => useNavigationReset());

    // Call the reset handler
    result.current();

    // ✅ CRITICAL: Should ALWAYS reset, even when already on /chat
    expect(mockResetToNewChat).toHaveBeenCalledTimes(1);
  });

  it('should reset state when called from thread screen', () => {
    // Simulate being on thread screen
    vi.mocked(usePathname).mockReturnValue('/chat/some-thread-slug');

    const { result } = renderHook(() => useNavigationReset());

    // Call the reset handler
    result.current();

    // ✅ Should reset when navigating from thread to overview
    expect(mockResetToNewChat).toHaveBeenCalledTimes(1);
  });

  it('should reset state when called multiple times from same location', () => {
    // Simulate being on /chat
    vi.mocked(usePathname).mockReturnValue('/chat');

    const { result } = renderHook(() => useNavigationReset());

    // Call multiple times (user clicking "New Chat" repeatedly)
    result.current();
    result.current();
    result.current();

    // ✅ CRITICAL: Each click should trigger reset
    expect(mockResetToNewChat).toHaveBeenCalledTimes(3);
  });

  it('should reset state regardless of pathname', () => {
    const testPaths = [
      '/chat',
      '/chat/thread-1',
      '/chat/thread-2',
      '/chat/some-long-slug',
      '/chat/pricing', // Different /chat/* route
    ];

    for (const path of testPaths) {
      mockResetToNewChat.mockClear();
      vi.mocked(usePathname).mockReturnValue(path);

      const { result } = renderHook(() => useNavigationReset());
      result.current();

      // ✅ Should reset from ANY path
      expect(mockResetToNewChat).toHaveBeenCalledTimes(1);
    }
  });

  it('should return stable callback reference', () => {
    vi.mocked(usePathname).mockReturnValue('/chat');

    const { result, rerender } = renderHook(() => useNavigationReset());

    const firstCallback = result.current;
    rerender();
    const secondCallback = result.current;

    // Callback should be stable (same reference)
    expect(firstCallback).toBe(secondCallback);
  });

  describe('useEffect path change detection', () => {
    it('should auto-reset when pathname changes TO /chat', () => {
      // Start on thread screen
      const { rerender } = renderHook(
        ({ pathname }) => {
          vi.mocked(usePathname).mockReturnValue(pathname);
          return useNavigationReset();
        },
        { initialProps: { pathname: '/chat/thread-1' } },
      );

      mockResetToNewChat.mockClear();

      // Navigate to /chat
      rerender({ pathname: '/chat' });

      // ✅ Should auto-reset when navigating to /chat
      expect(mockResetToNewChat).toHaveBeenCalledTimes(1);
    });

    it('should NOT auto-reset when staying on /chat', () => {
      // Start on /chat
      const { rerender } = renderHook(
        ({ pathname }) => {
          vi.mocked(usePathname).mockReturnValue(pathname);
          return useNavigationReset();
        },
        { initialProps: { pathname: '/chat' } },
      );

      mockResetToNewChat.mockClear();

      // Re-render with same pathname
      rerender({ pathname: '/chat' });

      // Should NOT auto-reset (pathname didn't change)
      expect(mockResetToNewChat).not.toHaveBeenCalled();
    });

    it('should NOT auto-reset when navigating between threads', () => {
      // Start on thread 1
      const { rerender } = renderHook(
        ({ pathname }) => {
          vi.mocked(usePathname).mockReturnValue(pathname);
          return useNavigationReset();
        },
        { initialProps: { pathname: '/chat/thread-1' } },
      );

      mockResetToNewChat.mockClear();

      // Navigate to thread 2
      rerender({ pathname: '/chat/thread-2' });

      // Should NOT auto-reset (not navigating TO /chat)
      expect(mockResetToNewChat).not.toHaveBeenCalled();
    });
  });
});

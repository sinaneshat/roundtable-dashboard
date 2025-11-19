/**
 * Navigation Reset Hook Tests
 *
 * Tests for useNavigationReset hook that manages store cleanup during navigation.
 * Ensures proper reset behavior for:
 * - Logo clicks
 * - New Chat button clicks
 * - Route changes to /chat
 * - Browser back/forward navigation
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatStore } from '@/components/providers/chat-store-provider';
import { createTestChatStore } from '@/lib/testing/chat-store-helpers';
import type { ChatStore } from '@/stores/chat/store-schemas';

import { useNavigationReset } from '../use-navigation-reset';

// Mock Next.js navigation hooks
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}));

// Mock ChatStoreProvider
const mockResetToNewChat = vi.fn();
vi.mock('@/components/providers/chat-store-provider', () => ({
  useChatStore: vi.fn(),
}));

describe('useNavigationReset Hook', () => {
  let mockRouterPush: ReturnType<typeof vi.fn>;
  let mockPathnameValue: string;
  let queryClient: QueryClient;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create fresh QueryClient for each test
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Setup router mock
    mockRouterPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: mockRouterPush,
      refresh: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    } as unknown as AppRouterInstance);

    // Setup pathname mock (default to /chat/some-thread)
    mockPathnameValue = '/chat/some-thread';
    vi.mocked(usePathname).mockImplementation(() => mockPathnameValue);

    // Setup store mock
    vi.mocked(useChatStore).mockImplementation(<T,>(selector: (state: ChatStore) => T): T => {
      const mockState = {
        resetToNewChat: mockResetToNewChat,
        thread: null,
        createdThreadId: null,
      } as unknown as ChatStore;
      return selector(mockState);
    });
  });

  // Wrapper component to provide QueryClient
  const createWrapper = () => {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
  };

  describe('manual Reset Callback', () => {
    it('should return a callback function', () => {
      const { result } = renderHook(() => useNavigationReset(), { wrapper: createWrapper() });

      expect(typeof result.current).toBe('function');
    });

    it('should call resetToNewChat when navigating from thread to /chat', () => {
      // Start on thread screen
      mockPathnameValue = '/chat/existing-thread';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);

      const { result } = renderHook(() => useNavigationReset(), { wrapper: createWrapper() });

      // Call the callback (simulating link click)
      result.current();

      // Should reset because we're NOT on /chat
      expect(mockResetToNewChat).toHaveBeenCalledTimes(1);
    });

    it('should call resetToNewChat even when already on /chat', () => {
      // Already on /chat route
      mockPathnameValue = '/chat';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);

      const { result } = renderHook(() => useNavigationReset(), { wrapper: createWrapper() });

      // Call the callback (simulating link click on /chat)
      result.current();

      // ✅ SHOULD reset even when already on /chat to ensure fresh start
      // User clicking "New Chat" or logo should ALWAYS reset state,
      // even if already on /chat (e.g., to clear form input, reset flags)
      expect(mockResetToNewChat).toHaveBeenCalledTimes(1);
    });

    it('should be stable across renders', () => {
      const { result, rerender } = renderHook(() => useNavigationReset(), { wrapper: createWrapper() });

      const firstCallback = result.current;
      rerender();
      const secondCallback = result.current;

      // Callback should be memoized
      expect(firstCallback).toBe(secondCallback);
    });
  });

  describe('automatic Route Change Detection', () => {
    it('should reset when pathname changes FROM thread TO /chat', () => {
      // Start on thread screen
      mockPathnameValue = '/chat/some-thread';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);

      const { rerender } = renderHook(() => useNavigationReset(), { wrapper: createWrapper() });

      // Initially no reset
      expect(mockResetToNewChat).not.toHaveBeenCalled();

      // Change pathname to /chat (simulating navigation)
      mockPathnameValue = '/chat';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);

      rerender();

      // Should reset due to route change
      expect(mockResetToNewChat).toHaveBeenCalledTimes(1);
    });

    it('should NOT reset when staying on /chat', () => {
      // Start on /chat
      mockPathnameValue = '/chat';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);

      const { rerender } = renderHook(() => useNavigationReset(), { wrapper: createWrapper() });

      // Navigate again (still /chat)
      rerender();

      // Should NOT reset (already on /chat)
      expect(mockResetToNewChat).not.toHaveBeenCalled();
    });

    it('should NOT reset when navigating between thread screens', () => {
      // Start on thread 1
      mockPathnameValue = '/chat/thread-1';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);

      const { rerender } = renderHook(() => useNavigationReset(), { wrapper: createWrapper() });

      // Navigate to thread 2
      mockPathnameValue = '/chat/thread-2';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);

      rerender();

      // Should NOT reset (not navigating to /chat)
      expect(mockResetToNewChat).not.toHaveBeenCalled();
    });

    it('should handle browser back navigation to /chat', () => {
      // Simulate navigation history: /chat -> /chat/thread -> (back) /chat

      // Start on thread
      mockPathnameValue = '/chat/some-thread';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);

      const { rerender } = renderHook(() => useNavigationReset(), { wrapper: createWrapper() });

      // Browser back to /chat
      mockPathnameValue = '/chat';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);

      rerender();

      // Should reset (navigated back to /chat)
      expect(mockResetToNewChat).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge Cases', () => {
    it('should handle initial render on /chat without resetting', () => {
      // Initial render already on /chat
      mockPathnameValue = '/chat';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);

      renderHook(() => useNavigationReset(), { wrapper: createWrapper() });

      // Should NOT reset on initial render when already on /chat
      expect(mockResetToNewChat).not.toHaveBeenCalled();
    });

    it('should handle rapid pathname changes', () => {
      // Start elsewhere
      mockPathnameValue = '/pricing';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);

      const { rerender } = renderHook(() => useNavigationReset(), { wrapper: createWrapper() });

      // Rapid navigation: pricing -> thread -> /chat
      mockPathnameValue = '/chat/thread';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);
      rerender();

      mockPathnameValue = '/chat';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);
      rerender();

      // Should reset only when landing on /chat
      expect(mockResetToNewChat).toHaveBeenCalledTimes(1);
    });

    it('should handle unmount without errors', () => {
      mockPathnameValue = '/chat/thread';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);

      const { unmount } = renderHook(() => useNavigationReset(), { wrapper: createWrapper() });

      // Should not throw on unmount
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('integration with Chat Navigation', () => {
    it('should reset store state when callback is called', () => {
      // Use real store instead of mock for this test
      const store = createTestChatStore({
        thread: { id: 'test-123', slug: 'test', isAiGeneratedTitle: false, mode: 'analyzing' },
        isStreaming: true,
        messages: [{ id: 'm1', role: 'user', parts: [], metadata: { role: 'user', roundNumber: 0 } }],
      });

      // Mock useChatStore to return actual store methods
      vi.mocked(useChatStore).mockImplementation(<T,>(selector: (state: ChatStore) => T): T => {
        return selector(store.getState());
      });

      mockPathnameValue = '/chat/test-thread';
      vi.mocked(usePathname).mockReturnValue(mockPathnameValue);

      const { result } = renderHook(() => useNavigationReset(), { wrapper: createWrapper() });

      // Verify initial state
      expect(store.getState().thread).toBeDefined();
      expect(store.getState().isStreaming).toBe(true);
      expect(store.getState().messages.length).toBeGreaterThan(0);

      // Call the reset callback
      result.current();

      // Verify state was reset
      expect(store.getState().thread).toBeNull();
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().messages).toHaveLength(0);
    });
  });
});

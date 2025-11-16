/**
 * Navigation Reset Hook
 *
 * Automatically resets chat store when navigating to new chat.
 * Handles cleanup for:
 * - Logo clicks
 * - "New Chat" button clicks
 * - Direct /chat route navigation
 *
 * Ensures:
 * - Ongoing streams are cancelled
 * - Query cache is invalidated for thread-specific data
 * - Store state is reset to defaults
 * - No memory leaks from lingering state
 *
 * Usage:
 * ```tsx
 * const handleNewChat = useNavigationReset();
 * <Link href="/chat" onClick={handleNewChat}>New Chat</Link>
 * ```
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

import { useChatStore } from '@/components/providers/chat-store-provider';
import { queryKeys } from '@/lib/data/query-keys';

/**
 * Hook that provides a callback to reset store when navigating to new chat
 *
 * @returns Callback function to call before navigating to /chat
 *
 * @example
 * ```tsx
 * const handleNewChat = useNavigationReset();
 *
 * <Link href="/chat" onClick={handleNewChat}>
 *   <Plus /> New Chat
 * </Link>
 * ```
 */
export function useNavigationReset() {
  const resetToNewChat = useChatStore(s => s.resetToNewChat);
  const thread = useChatStore(s => s.thread);
  const createdThreadId = useChatStore(s => s.createdThreadId);
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);
  const queryClient = useQueryClient();

  // ✅ CRITICAL: Reset store when navigating FROM thread screen TO /chat
  // This handles:
  // 1. Logo clicks from thread screen
  // 2. "New Chat" button from thread screen
  // 3. Browser back/forward to /chat
  useEffect(() => {
    const isNavigatingToChat = pathname === '/chat' && previousPathnameRef.current !== '/chat';

    if (isNavigatingToChat) {
      // ✅ CRITICAL FIX: Invalidate thread-specific queries before reset
      const effectiveThreadId = thread?.id || createdThreadId;
      if (effectiveThreadId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.threads.messages(effectiveThreadId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.threads.analyses(effectiveThreadId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.threads.preSearches(effectiveThreadId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.threads.feedback(effectiveThreadId),
        });
      }

      // ✅ User navigated to /chat route - reset store
      resetToNewChat();
    }

    // Update previous pathname for next comparison
    previousPathnameRef.current = pathname;
  }, [pathname, resetToNewChat, thread, createdThreadId, queryClient]);

  // ✅ Return callback for manual reset (when clicking links)
  // This provides immediate reset before navigation completes
  const handleNavigationReset = useCallback(() => {
    // ✅ CRITICAL FIX: Invalidate thread-specific queries BEFORE resetting store
    // This ensures cached data is cleared and prevents:
    // - Memory leaks from stale cached queries
    // - Stale data appearing in new threads
    // - Incorrect UI state from residual cache
    const effectiveThreadId = thread?.id || createdThreadId;
    if (effectiveThreadId) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.messages(effectiveThreadId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.analyses(effectiveThreadId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.preSearches(effectiveThreadId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.feedback(effectiveThreadId),
      });
    }

    // ✅ CRITICAL: ALWAYS reset state, regardless of current path
    // User wants clicking "New Chat" or logo to ALWAYS:
    // 1. Invalidate cached thread data (above)
    // 2. Stop any ongoing streams
    // 3. Reset all store state to defaults
    // 4. Navigate to /chat immediately
    // Even if already on /chat, this ensures a fresh start
    resetToNewChat();
  }, [resetToNewChat, thread, createdThreadId, queryClient]);

  return handleNavigationReset;
}

/**
 * Hook that resets store when component unmounts
 * Useful for cleanup when navigating away from chat screens
 *
 * @example
 * ```tsx
 * function ChatScreen() {
 *   useResetOnUnmount();
 *   return <div>Chat content</div>;
 * }
 * ```
 */
export function useResetOnUnmount() {
  const resetToNewChat = useChatStore(s => s.resetToNewChat);
  const thread = useChatStore(s => s.thread);
  const createdThreadId = useChatStore(s => s.createdThreadId);
  const queryClient = useQueryClient();

  useEffect(() => {
    return () => {
      // ✅ Cleanup on unmount: Invalidate queries then reset store
      const effectiveThreadId = thread?.id || createdThreadId;
      if (effectiveThreadId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.threads.messages(effectiveThreadId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.threads.analyses(effectiveThreadId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.threads.preSearches(effectiveThreadId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.threads.feedback(effectiveThreadId),
        });
      }

      resetToNewChat();
    };
  }, [resetToNewChat, thread, createdThreadId, queryClient]);
}

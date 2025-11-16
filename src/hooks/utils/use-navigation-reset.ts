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

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

import { useChatStore } from '@/components/providers/chat-store-provider';

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
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);

  // ✅ CRITICAL: Reset store when navigating FROM thread screen TO /chat
  // This handles:
  // 1. Logo clicks from thread screen
  // 2. "New Chat" button from thread screen
  // 3. Browser back/forward to /chat
  useEffect(() => {
    const isNavigatingToChat = pathname === '/chat' && previousPathnameRef.current !== '/chat';

    if (isNavigatingToChat) {
      // ✅ User navigated to /chat route - reset store
      resetToNewChat();
    }

    // Update previous pathname for next comparison
    previousPathnameRef.current = pathname;
  }, [pathname, resetToNewChat]);

  // ✅ Return callback for manual reset (when clicking links)
  // This provides immediate reset before navigation completes
  const handleNavigationReset = useCallback(() => {
    // ✅ CRITICAL: ALWAYS reset state, regardless of current path
    // User wants clicking "New Chat" or logo to ALWAYS:
    // 1. Stop any ongoing streams
    // 2. Reset all state to defaults
    // 3. Navigate to /chat immediately
    // Even if already on /chat, this ensures a fresh start
    resetToNewChat();
  }, [resetToNewChat]);

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

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      resetToNewChat();
    };
  }, [resetToNewChat]);
}

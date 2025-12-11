/**
 * Navigation Reset Hook
 *
 * Zustand v5 Pattern: Store-specific action hook co-located with store
 * Automatically resets chat store when navigating to new chat.
 *
 * Handles cleanup for:
 * - Logo clicks
 * - "New Chat" button clicks
 * - Direct /chat route navigation
 *
 * Ensures:
 * - Ongoing streams are cancelled
 * - Query cache is invalidated for thread-specific data
 * - Store state is reset with preserved user preferences
 * - No memory leaks from lingering state
 *
 * Location: /src/stores/chat/actions/navigation-reset.ts
 * Used by: ChatNav component
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore } from '@/components/providers/chat-store-provider';
import { queryKeys } from '@/lib/data/query-keys';
import { useModelPreferencesStore } from '@/stores/preferences';

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

  // Read from cookie-persisted model preferences store
  const preferences = useModelPreferencesStore(useShallow(s => ({
    selectedModelIds: s.selectedModelIds,
    modelOrder: s.modelOrder,
    selectedMode: s.selectedMode,
    enableWebSearch: s.enableWebSearch,
  })));

  // Reset store when navigating FROM thread screen TO /chat
  // This handles:
  // 1. Logo clicks from thread screen
  // 2. "New Chat" button from thread screen
  // 3. Browser back/forward to /chat
  useEffect(() => {
    const isNavigatingToChat = pathname === '/chat' && previousPathnameRef.current !== '/chat';

    if (isNavigatingToChat) {
      // Invalidate thread-specific queries before reset
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

      // User navigated to /chat route - reset store WITH persisted preferences
      resetToNewChat(preferences);
    }

    // Update previous pathname for next comparison
    previousPathnameRef.current = pathname;
  }, [pathname, resetToNewChat, thread, createdThreadId, queryClient, preferences]);

  // Return callback for manual reset (when clicking links)
  // This provides immediate reset before navigation completes
  const handleNavigationReset = useCallback(() => {
    // Invalidate thread-specific queries BEFORE resetting store
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

    // ALWAYS reset state WITH preserved preferences
    // User wants clicking "New Chat" or logo to ALWAYS:
    // 1. Invalidate cached thread data (above)
    // 2. Stop any ongoing streams
    // 3. Reset store state to defaults with persisted preferences
    // 4. Navigate to /chat immediately
    // Even if already on /chat, this ensures a fresh start with user's preferences
    resetToNewChat(preferences);
  }, [resetToNewChat, thread, createdThreadId, queryClient, preferences]);

  return handleNavigationReset;
}

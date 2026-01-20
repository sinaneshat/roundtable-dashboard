/**
 * Minimal Message Sync Hook
 *
 * A simplified replacement for use-message-sync.ts that leverages the store's
 * built-in deduplication and smart merging capabilities.
 *
 * KEY SIMPLIFICATIONS:
 * - Store's setMessages() already handles smart merging (preserves content)
 * - Store's deduplicateMessages() runs after streaming completes
 * - This hook only needs to sync AI SDK messages → Store with throttling
 *
 * ARCHITECTURE:
 * 1. AI SDK manages streaming state and messages
 * 2. This hook watches AI SDK messages and syncs to store
 * 3. Store handles deduplication and content preservation
 * 4. Render layer reads from store (single source of truth)
 *
 * ✅ PERF FIX: Removed interval-based polling - uses stable throttle instead
 */

import { MessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef } from 'react';
import { useStore } from 'zustand';

import { getUserMetadata, isModeratorMessage } from '@/lib/utils';
import type { ChatStoreApi } from '@/stores/chat';

type UseMinimalMessageSyncParams = {
  store: ChatStoreApi;
  chat: {
    messages: UIMessage[];
    isStreaming: boolean;
  };
};

// Throttle streaming updates to reduce store churn
// ✅ FIX: Reduced throttle to 50ms for more responsive streaming UI
const STREAM_SYNC_THROTTLE_MS = 50;

// ✅ FIX: Get a content fingerprint for the last message during streaming
// This detects content changes even when array reference stays the same
function getLastMessageContentKey(messages: UIMessage[]): string {
  if (messages.length === 0)
    return '';
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg)
    return '';
  const textPart = lastMsg.parts?.find(p => p.type === 'text');
  const text = textPart && 'text' in textPart ? textPart.text : '';
  // Return a fingerprint that changes when content changes
  return `${lastMsg.id}:${text?.length || 0}`;
}

/**
 * Minimal sync from AI SDK messages → Zustand store
 *
 * Replaces the 965-line use-message-sync.ts with a simple sync that trusts
 * the store's built-in deduplication and smart merging.
 *
 * ✅ PERF FIX: Uses stable throttle with trailing edge instead of interval polling
 */
export function useMinimalMessageSync({ store, chat }: UseMinimalMessageSyncParams) {
  const lastSyncRef = useRef<number>(0);
  const prevMessagesRef = useRef<UIMessage[]>([]);
  const hasHydratedRef = useRef<string | null>(null);
  const pendingSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ PERF FIX: Use granular selectors instead of subscribing to full state
  const threadId = useStore(store, s => s.thread?.id);
  const isStreaming = useStore(store, s => s.isStreaming);

  const { messages: chatMessages, isStreaming: chatIsStreaming } = chat;

  // ✅ FIX: Keep a ref to chat for interval-based sync to avoid stale closures
  const chatRef = useRef(chat);
  chatRef.current = chat;

  // ✅ PERF FIX: Memoized sync function that reads store state directly
  const syncToStore = useCallback(() => {
    const currentStoreMessages = store.getState().messages;

    const filteredChatMessages = chatMessages.filter((m) => {
      if (m.role !== MessageRoles.USER)
        return true;
      const userMeta = getUserMetadata(m.metadata);
      return !userMeta?.isParticipantTrigger;
    });

    const chatMessageIds = new Set(filteredChatMessages.map(m => m.id));
    const storeOnlyMessages = currentStoreMessages.filter((m) => {
      if (chatMessageIds.has(m.id))
        return false;
      if (isModeratorMessage(m))
        return true;
      if (m.role === MessageRoles.USER) {
        const userMeta = getUserMetadata(m.metadata);
        if (!userMeta?.isParticipantTrigger) {
          return true;
        }
      }
      if (m.role === MessageRoles.ASSISTANT) {
        return true;
      }
      return false;
    });

    const mergedMessages = structuredClone([...filteredChatMessages, ...storeOnlyMessages]);

    // ✅ PERF FIX: Only update if messages actually changed
    const messagesNeedUpdate = mergedMessages.length !== currentStoreMessages.length
      || mergedMessages.some((m, i) => m.id !== currentStoreMessages[i]?.id);
    if (messagesNeedUpdate) {
      store.getState().setMessages(mergedMessages);
    }
  }, [chatMessages, store]);

  // Hydration: On mount or thread change
  useEffect(() => {
    if (!threadId)
      return;
    if (hasHydratedRef.current === threadId)
      return;

    const storeMessages = store.getState().messages;
    // Only hydrate if store has messages and AI SDK doesn't
    if (storeMessages.length > 0 && chatMessages.length === 0) {
      hasHydratedRef.current = threadId;
      return;
    }

    hasHydratedRef.current = threadId;
  }, [threadId, chatMessages.length, store]);

  // Reset hydration flag on thread change
  useEffect(() => {
    if (threadId !== hasHydratedRef.current) {
      hasHydratedRef.current = null;
    }
  }, [threadId]);

  // ✅ PERF FIX: Single throttled sync effect with trailing edge
  // Replaces interval polling AND separate sync effect
  useEffect(() => {
    // Skip if no messages
    if (chatMessages.length === 0) {
      prevMessagesRef.current = chatMessages;
      return;
    }

    // Detect if messages actually changed (by reference or length)
    const messagesChanged = chatMessages !== prevMessagesRef.current
      || chatMessages.length !== prevMessagesRef.current.length;

    // ✅ FIX: During streaming, also check if the last message content changed
    // AI SDK may mutate message objects in place during streaming
    let contentChanged = false;
    if (chatIsStreaming && chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      const prevLastMsg = prevMessagesRef.current[prevMessagesRef.current.length - 1];
      if (lastMsg && prevLastMsg && lastMsg.id === prevLastMsg.id) {
        // Check if text content changed
        const lastText = lastMsg.parts?.find(p => p.type === 'text')?.text || '';
        const prevText = prevLastMsg.parts?.find(p => p.type === 'text')?.text || '';
        contentChanged = lastText !== prevText;
      }
    }

    if (!messagesChanged && !contentChanged && !chatIsStreaming)
      return;

    const now = Date.now();
    const timeSinceLastSync = now - lastSyncRef.current;

    // ✅ PERF FIX: Throttle with trailing edge - schedule pending sync if throttled
    if (chatIsStreaming && timeSinceLastSync < STREAM_SYNC_THROTTLE_MS) {
      // Clear any existing pending sync
      if (pendingSyncRef.current) {
        clearTimeout(pendingSyncRef.current);
      }
      // Schedule sync at end of throttle window (trailing edge)
      pendingSyncRef.current = setTimeout(() => {
        syncToStore();
        lastSyncRef.current = Date.now();
        pendingSyncRef.current = null;
      }, STREAM_SYNC_THROTTLE_MS - timeSinceLastSync);
      return;
    }

    // Execute sync immediately
    syncToStore();
    prevMessagesRef.current = chatMessages;
    lastSyncRef.current = now;

    // Cleanup pending sync on unmount
    return () => {
      if (pendingSyncRef.current) {
        clearTimeout(pendingSyncRef.current);
        pendingSyncRef.current = null;
      }
    };
  }, [chatMessages, chatIsStreaming, syncToStore]);

  // Final sync on streaming end - ensures we capture final state
  useEffect(() => {
    if (isStreaming && !chatIsStreaming && chatMessages.length > 0) {
      // Clear any pending throttled sync
      if (pendingSyncRef.current) {
        clearTimeout(pendingSyncRef.current);
        pendingSyncRef.current = null;
      }
      // Streaming just ended - do final sync
      syncToStore();
    }
  }, [chatIsStreaming, isStreaming, chatMessages.length, syncToStore]);

  // ✅ FIX: Interval-based sync during streaming to catch all content updates
  // React effects may not re-run if array reference doesn't change
  // This ensures UI updates as chunks arrive
  // Uses chatRef to avoid stale closures - reads fresh messages each interval tick
  useEffect(() => {
    if (!chatIsStreaming)
      return;

    const intervalId = setInterval(() => {
      // Read current messages from ref to avoid stale closure
      const currentMessages = chatRef.current.messages;

      // Check if content actually changed
      const currentKey = getLastMessageContentKey(currentMessages);
      const prevKey = getLastMessageContentKey(prevMessagesRef.current);

      if (currentKey !== prevKey) {
        // Sync the fresh messages
        const currentStoreMessages = store.getState().messages;

        const filteredChatMessages = currentMessages.filter((m) => {
          if (m.role !== MessageRoles.USER)
            return true;
          const userMeta = getUserMetadata(m.metadata);
          return !userMeta?.isParticipantTrigger;
        });

        const chatMessageIds = new Set(filteredChatMessages.map(m => m.id));
        const storeOnlyMessages = currentStoreMessages.filter((m) => {
          if (chatMessageIds.has(m.id))
            return false;
          if (isModeratorMessage(m))
            return true;
          if (m.role === MessageRoles.USER) {
            const userMeta = getUserMetadata(m.metadata);
            if (!userMeta?.isParticipantTrigger) {
              return true;
            }
          }
          if (m.role === MessageRoles.ASSISTANT) {
            return true;
          }
          return false;
        });

        const mergedMessages = structuredClone([...filteredChatMessages, ...storeOnlyMessages]);
        store.getState().setMessages(mergedMessages);
        prevMessagesRef.current = currentMessages;
      }
    }, STREAM_SYNC_THROTTLE_MS);

    return () => clearInterval(intervalId);
  }, [chatIsStreaming, store]);
}

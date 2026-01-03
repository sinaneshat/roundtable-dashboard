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
 */

import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';

import { getRoundNumber } from '@/lib/utils';
import type { ChatStoreApi } from '@/stores/chat';

type UseMinimalMessageSyncParams = {
  store: ChatStoreApi;
  chat: {
    messages: UIMessage[];
    isStreaming: boolean;
  };
};

// Throttle streaming updates to reduce store churn
const STREAM_SYNC_THROTTLE_MS = 100;

/**
 * Minimal sync from AI SDK messages → Zustand store
 *
 * Replaces the 965-line use-message-sync.ts with a simple sync that trusts
 * the store's built-in deduplication and smart merging.
 */
export function useMinimalMessageSync({ store, chat }: UseMinimalMessageSyncParams) {
  const lastSyncRef = useRef<number>(0);
  const prevMessagesRef = useRef<UIMessage[]>([]);
  const hasHydratedRef = useRef<string | null>(null);

  const storeMessages = useStore(store, s => s.messages);
  const threadId = useStore(store, s => s.thread?.id);
  const isStreaming = useStore(store, s => s.isStreaming);

  const { messages: chatMessages, isStreaming: chatIsStreaming } = chat;

  // Hydration: On mount or thread change, sync store messages to AI SDK
  useEffect(() => {
    if (!threadId)
      return;
    if (hasHydratedRef.current === threadId)
      return;

    // Only hydrate if store has messages and AI SDK doesn't
    if (storeMessages.length > 0 && chatMessages.length === 0) {
      // This is handled by initial messages prop - no action needed
      hasHydratedRef.current = threadId;
      return;
    }

    hasHydratedRef.current = threadId;
  }, [threadId, storeMessages.length, chatMessages.length]);

  // Reset hydration flag on thread change
  useEffect(() => {
    if (threadId !== hasHydratedRef.current) {
      hasHydratedRef.current = null;
    }
  }, [threadId]);

  // Main sync: AI SDK messages → Store
  useEffect(() => {
    // Skip if no messages
    if (chatMessages.length === 0) {
      prevMessagesRef.current = chatMessages;
      return;
    }

    // Detect if messages actually changed (by reference or length)
    const messagesChanged = chatMessages !== prevMessagesRef.current
      || chatMessages.length !== prevMessagesRef.current.length;

    if (!messagesChanged)
      return;

    // Throttle during streaming
    const now = Date.now();
    if (chatIsStreaming && now - lastSyncRef.current < STREAM_SYNC_THROTTLE_MS) {
      return;
    }

    // Build merged messages:
    // 1. Start with chat messages (AI SDK source of truth for streaming)
    // 2. Preserve any store-only messages (e.g., moderator messages during streaming)
    const chatMessageIds = new Set(chatMessages.map(m => m.id));
    const storeOnlyMessages = storeMessages.filter((m) => {
      // Keep messages that are in store but not in AI SDK
      if (chatMessageIds.has(m.id))
        return false;

      // Special case: preserve moderator messages
      // During streaming, moderator messages might not be in AI SDK yet
      const meta = m.metadata as { isModerator?: boolean; roundNumber?: number } | undefined;
      if (meta?.isModerator)
        return true;

      // Preserve messages from different rounds (they might have been filtered by AI SDK)
      const chatRounds = new Set(chatMessages.map(cm => getRoundNumber(cm.metadata)));
      const msgRound = meta?.roundNumber;
      if (msgRound !== undefined && !chatRounds.has(msgRound))
        return true;

      return false;
    });

    // Merge: chat messages first (for correct order), then store-only
    const mergedMessages = [...chatMessages, ...storeOnlyMessages];

    // Update store (store's setMessages handles deduplication)
    store.getState().setMessages(mergedMessages);

    prevMessagesRef.current = chatMessages;
    lastSyncRef.current = now;
  }, [chatMessages, chatIsStreaming, storeMessages, store]);

  // Final sync on streaming end
  useEffect(() => {
    if (isStreaming && !chatIsStreaming && chatMessages.length > 0) {
      // Streaming just ended - do final sync
      store.getState().setMessages((prev) => {
        // Merge any remaining messages
        const prevIds = new Set(prev.map(m => m.id));
        const newMessages = chatMessages.filter(m => !prevIds.has(m.id));
        if (newMessages.length === 0)
          return prev;
        return [...prev, ...newMessages];
      });
    }
  }, [chatIsStreaming, isStreaming, chatMessages, store]);
}

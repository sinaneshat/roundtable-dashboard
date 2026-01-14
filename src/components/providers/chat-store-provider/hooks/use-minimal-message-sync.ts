'use client';

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

import { MessageRoles } from '@/api/core/enums';
import { getRoundNumber, getUserMetadata, isModeratorMessage } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
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

    // ✅ CRITICAL FIX: Filter out participant trigger messages from AI SDK
    // These are internal messages created when triggering each participant.
    // They should NOT be persisted to the store - only the original user message matters.
    // Without this filter, trigger messages accumulate and pollute the messages array.
    const filteredChatMessages = chatMessages.filter((m) => {
      if (m.role !== MessageRoles.USER)
        return true;
      const userMeta = getUserMetadata(m.metadata);
      return !userMeta?.isParticipantTrigger;
    });

    // Build merged messages:
    // 1. Start with chat messages (AI SDK source of truth for streaming)
    // 2. Preserve any store-only messages (e.g., moderator messages, persisted participants)
    const chatMessageIds = new Set(filteredChatMessages.map(m => m.id));
    const storeOnlyMessages = storeMessages.filter((m) => {
      // Keep messages that are in store but not in AI SDK
      if (chatMessageIds.has(m.id))
        return false;

      // Special case: preserve moderator messages
      // During streaming, moderator messages might not be in AI SDK yet
      if (isModeratorMessage(m))
        return true;

      // ✅ CRITICAL FIX: Preserve non-participant-trigger user messages
      // AI SDK creates its own user message (isParticipantTrigger=true) for streaming.
      // The original user message from form submission has a different ID and must be preserved.
      // Without this, the original user message gets replaced by the participant trigger,
      // which is then filtered out by deduplication, causing the user message to disappear.
      if (m.role === MessageRoles.USER) {
        const userMeta = getUserMetadata(m.metadata);
        if (!userMeta?.isParticipantTrigger) {
          return true; // Always preserve the original user message
        }
      }

      // ✅ REFRESH FIX: Preserve assistant messages from previous rounds
      // After page refresh, AI SDK may have only the SSR user message (e.g., round 0 user).
      // The store has participant messages fetched from API (e.g., round 0 participants).
      // These participant messages MUST be preserved - they represent completed work.
      //
      // Previous bug: Only preserved messages from rounds NOT in chatRounds.
      // If chatRounds={0} (from user message), round 0 participants were DROPPED.
      //
      // Fix: Preserve ALL assistant messages not in AI SDK by ID.
      // AI SDK only tracks the CURRENT streaming message. Store is source of truth
      // for completed messages from previous participants.
      if (m.role === MessageRoles.ASSISTANT) {
        return true; // Preserve all assistant messages not in AI SDK
      }

      return false;
    });

    // Merge: chat messages first (for correct order), then store-only
    // ✅ CRITICAL FIX: Deep clone messages before passing to store
    // AI SDK messages and store messages share references. When Immer freezes
    // the store state, it also freezes the AI SDK's internal message objects.
    // This causes "Cannot add property 0, object is not extensible" errors
    // when AI SDK tries to push streaming parts to a frozen parts array.
    // structuredClone breaks the reference link, ensuring only copies get frozen.
    const mergedMessages = structuredClone([...filteredChatMessages, ...storeOnlyMessages]);

    // ✅ DEBUG: Log sync details to diagnose message loss
    if (mergedMessages.length !== storeMessages.length) {
      rlog.sync('merge', `chat=${filteredChatMessages.length} storeOnly=${storeOnlyMessages.length} merged=${mergedMessages.length} store=${storeMessages.length} chatRounds=[${[...new Set(filteredChatMessages.map(m => getRoundNumber(m.metadata)))]}]`);
      // Log dropped messages
      const mergedIds = new Set(mergedMessages.map(m => m.id));
      const droppedMsgs = storeMessages.filter(m => !mergedIds.has(m.id));
      if (droppedMsgs.length > 0) {
        rlog.sync('dropped', `count=${droppedMsgs.length} ids=[${droppedMsgs.map(m => m.id.slice(-20)).join(',')}] rounds=[${droppedMsgs.map(m => getRoundNumber(m.metadata)).join(',')}]`);
      }
    }

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
        // ✅ CRITICAL FIX: Filter out participant trigger messages
        const newMessages = chatMessages.filter((m) => {
          if (prevIds.has(m.id))
            return false;
          if (m.role === MessageRoles.USER) {
            const userMeta = getUserMetadata(m.metadata);
            if (userMeta?.isParticipantTrigger)
              return false;
          }
          return true;
        });
        if (newMessages.length === 0)
          return prev;
        // ✅ CRITICAL FIX: Clone newMessages to prevent Immer from freezing AI SDK's objects
        return structuredClone([...prev, ...newMessages]);
      });
    }
  }, [chatIsStreaming, isStreaming, chatMessages, store]);
}

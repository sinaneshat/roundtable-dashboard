'use client';

/**
 * State Sync Hook
 *
 * Syncs reactive values from AI SDK hook to store.
 * Also sets up quota invalidation callbacks.
 */

import type { QueryClient } from '@tanstack/react-query';
import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useLayoutEffect } from 'react';

import { queryKeys } from '@/lib/data/query-keys';
import type { ChatStoreApi } from '@/stores/chat';
import { getEffectiveWebSearchEnabled } from '@/stores/chat';

import type { ChatHook } from '../types';

type UseStateSyncParams = {
  store: ChatStoreApi;
  chat: ChatHook;
  storeRef: MutableRefObject<ChatStoreApi | null>;
  queryClientRef: MutableRefObject<QueryClient>;
  sendMessageRef: MutableRefObject<ChatHook['sendMessage']>;
  startRoundRef: MutableRefObject<ChatHook['startRound']>;
  setMessagesRef: MutableRefObject<ChatHook['setMessages']>;
};

/**
 * Syncs reactive state between AI SDK hook and Zustand store
 */
export function useStateSync({
  store,
  chat,
  storeRef,
  queryClientRef,
  sendMessageRef,
  startRoundRef,
  setMessagesRef,
}: UseStateSyncParams) {
  // ✅ CRITICAL FIX: Use useLayoutEffect to sync refs BEFORE any effects run
  // Without this, usePendingMessage effect might call sendMessageRef.current
  // with a stale function that references a destroyed AI SDK Chat instance
  // Symptom: "Cannot read properties of undefined (reading 'state')" error
  useLayoutEffect(() => {
    sendMessageRef.current = chat.sendMessage;
    startRoundRef.current = chat.startRound;
    setMessagesRef.current = chat.setMessages;
  }, [chat.sendMessage, chat.startRound, chat.setMessages, sendMessageRef, startRoundRef, setMessagesRef]);

  // Sync isStreaming and currentParticipantIndex from hook to store
  useEffect(() => {
    const currentState = store.getState();

    if (currentState.isStreaming !== chat.isStreaming) {
      currentState.setIsStreaming(chat.isStreaming);
    }

    if (currentState.currentParticipantIndex !== chat.currentParticipantIndex) {
      currentState.setCurrentParticipantIndex(chat.currentParticipantIndex);
    }
  }, [chat.isStreaming, chat.currentParticipantIndex, store]);

  // Quota invalidation callbacks
  const sendMessageWithQuotaInvalidation = useCallback(async (content: string) => {
    queryClientRef.current.invalidateQueries({ queryKey: queryKeys.usage.stats() });

    const currentThread = storeRef.current?.getState().thread ?? null;
    const threadId = currentThread?.id || storeRef.current?.getState().createdThreadId;
    // Thread state is source of truth; form state only for new chats
    const webSearchEnabled = getEffectiveWebSearchEnabled(
      currentThread,
      storeRef.current?.getState().enableWebSearch ?? false,
    );

    if (webSearchEnabled && threadId) {
      queryClientRef.current.invalidateQueries({
        queryKey: queryKeys.threads.preSearches(threadId),
      });
    }

    return sendMessageRef.current(content);
  }, [queryClientRef, storeRef, sendMessageRef]);

  const startRoundWithQuotaInvalidation = useCallback(async () => {
    queryClientRef.current.invalidateQueries({ queryKey: queryKeys.usage.stats() });

    const currentThread = storeRef.current?.getState().thread ?? null;
    const threadId = currentThread?.id || storeRef.current?.getState().createdThreadId;
    // Thread state is source of truth; form state only for new chats
    const webSearchEnabled = getEffectiveWebSearchEnabled(
      currentThread,
      storeRef.current?.getState().enableWebSearch ?? false,
    );

    if (webSearchEnabled && threadId) {
      queryClientRef.current.invalidateQueries({
        queryKey: queryKeys.threads.preSearches(threadId),
      });
    }

    return startRoundRef.current();
  }, [queryClientRef, storeRef, startRoundRef]) as () => Promise<void>;

  // Sync callbacks to store once on mount
  useEffect(() => {
    storeRef.current?.setState({
      sendMessage: sendMessageWithQuotaInvalidation,
      startRound: startRoundWithQuotaInvalidation,
      chatSetMessages: setMessagesRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

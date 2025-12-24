'use client';

/**
 * Pending Message Hook
 *
 * Watches for pending message conditions and triggers send.
 * Adds placeholder pre-search for web search rounds (no API call - execute auto-creates).
 */

import type { MutableRefObject } from 'react';
import { useEffect } from 'react';
import { useStore } from 'zustand';

import { MessageStatuses, ScreenModes } from '@/api/core/enums';
import { getCurrentRoundNumber, getEnabledParticipantModelIds, rlog } from '@/lib/utils';
import type { ChatStoreApi } from '@/stores/chat';
import { getEffectiveWebSearchEnabled } from '@/stores/chat';

import type { ChatHook } from '../types';

type UsePendingMessageParams = {
  store: ChatStoreApi;
  chat: ChatHook;
  sendMessageRef: MutableRefObject<ChatHook['sendMessage']>;
};

/**
 * Handles pending message send with pre-search orchestration
 *
 * When web search is enabled, adds a placeholder pre-search to the store.
 * PreSearchStream component handles execution via executePreSearchStreamService,
 * which auto-creates the DB record if it doesn't exist.
 *
 * This eliminates the separate create API call - execute handles everything.
 */
export function usePendingMessage({
  store,
  chat,
  sendMessageRef,
}: UsePendingMessageParams) {
  // Subscribe to necessary store state
  const pendingMessage = useStore(store, s => s.pendingMessage);
  const expectedParticipantIds = useStore(store, s => s.expectedParticipantIds);
  const hasSentPendingMessage = useStore(store, s => s.hasSentPendingMessage);
  const isStreaming = useStore(store, s => s.isStreaming);
  const isWaitingForChangelog = useStore(store, s => s.isWaitingForChangelog);
  const screenMode = useStore(store, s => s.screenMode);
  const participants = useStore(store, s => s.participants);
  const preSearches = useStore(store, s => s.preSearches);
  const messages = useStore(store, s => s.messages);
  const thread = useStore(store, s => s.thread);
  const formEnableWebSearch = useStore(store, s => s.enableWebSearch);
  const waitingToStart = useStore(store, s => s.waitingToStartStreaming);

  useEffect(() => {
    const newRoundNumber = messages.length > 0 ? getCurrentRoundNumber(messages) : 0;

    // Guard: Only send on overview/thread screens (not public)
    if (screenMode === ScreenModes.PUBLIC) {
      return;
    }

    // Check if we should send pending message
    if (!pendingMessage || !expectedParticipantIds || hasSentPendingMessage || isStreaming) {
      return;
    }

    // Race condition guards
    if (chat.isStreamingRef.current || chat.isTriggeringRef.current) {
      return;
    }

    // ✅ FIX: Wait for AI SDK to be ready before sending
    // Without this, sendMessage may reference a destroyed Chat instance
    // causing "Cannot read properties of undefined (reading 'state')" error
    if (!chat.isReady) {
      return;
    }

    // Round 0 guard - skip when waitingToStartStreaming is true on overview
    if (waitingToStart && screenMode === ScreenModes.OVERVIEW) {
      return;
    }

    // Guard: Wait for sendMessage to be available
    if (!sendMessageRef.current) {
      return;
    }

    // Compare participant model IDs
    const currentModelIds = getEnabledParticipantModelIds(participants).sort().join(',');
    const expectedModelIds = [...expectedParticipantIds].sort().join(',');

    if (currentModelIds !== expectedModelIds) {
      return;
    }

    // Check changelog wait state
    const isInitialThreadCreation = screenMode === ScreenModes.OVERVIEW && waitingToStart;
    if (isWaitingForChangelog && !isInitialThreadCreation) {
      return;
    }

    // newRoundNumber already calculated at top of effect
    // Thread state is source of truth for existing threads; form state for new chats
    const webSearchEnabled = getEffectiveWebSearchEnabled(thread, formEnableWebSearch);
    const preSearchForRound = Array.isArray(preSearches)
      ? preSearches.find(ps => ps.roundNumber === newRoundNumber)
      : undefined;

    // Handle web search: add placeholder or wait for completion
    if (webSearchEnabled) {
      // No pre-search yet - add placeholder (execute endpoint auto-creates DB record)
      if (!preSearchForRound) {
        const currentState = store.getState();
        if (currentState.hasPreSearchBeenTriggered(newRoundNumber)) {
          return;
        }

        // Add placeholder pre-search to store - PreSearchStream will execute
        // Execute endpoint auto-creates DB record, so no separate create call needed
        const effectiveThreadId = thread?.id || currentState.createdThreadId || '';
        currentState.addPreSearch({
          id: `placeholder-presearch-${effectiveThreadId}-${newRoundNumber}`,
          threadId: effectiveThreadId,
          roundNumber: newRoundNumber,
          userQuery: pendingMessage,
          status: MessageStatuses.PENDING,
          searchData: null,
          createdAt: new Date(),
          completedAt: null,
          errorMessage: null,
        });
        return;
      }

      // Pre-search exists but not complete - wait for PreSearchStream to finish
      if (preSearchForRound.status === MessageStatuses.STREAMING
        || preSearchForRound.status === MessageStatuses.PENDING) {
        return;
      }
    }

    // Send message
    const { setHasSentPendingMessage, setStreamingRoundNumber, setHasPendingConfigChanges } = store.getState();

    setHasSentPendingMessage(true);
    setStreamingRoundNumber(newRoundNumber);
    setHasPendingConfigChanges(false);

    // ✅ RACE CONDITION FIX: Moderator placeholder is now added in useModeratorTrigger
    // AFTER all participants complete streaming. Adding it here caused the moderator
    // to appear BEFORE participants in the UI, leading to incorrect timeline ordering.
    // The old pattern: User → Moderator → Participants (wrong)
    // The new pattern: User → Participants → Moderator (correct)

    queueMicrotask(() => {
      if (chat.isStreamingRef.current) {
        store.getState().setHasSentPendingMessage(false);
        return;
      }

      try {
        const result = sendMessageRef.current?.(pendingMessage);

        if (result && typeof result.catch === 'function') {
          result.catch((error: Error) => {
            rlog.stream('end', `sendMessage failed: ${error.message}`);
          });
        }
      } catch (error) {
        rlog.stream('end', `sendMessage threw: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }, [
    store,
    chat.isReady,
    chat.isStreamingRef,
    chat.isTriggeringRef,
    pendingMessage,
    expectedParticipantIds,
    hasSentPendingMessage,
    isStreaming,
    isWaitingForChangelog,
    screenMode,
    participants,
    preSearches,
    messages,
    thread,
    formEnableWebSearch,
    waitingToStart,
    sendMessageRef,
  ]);
}

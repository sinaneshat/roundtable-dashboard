'use client';

/**
 * Chat Store Provider - Official Next.js + Zustand Pattern
 *
 * OFFICIAL PATTERN:
 * - Vanilla store factory
 * - React Context for distribution
 * - useStore hook for consumption
 * - Per-provider store instance
 *
 * BRIDGES:
 * - AI SDK hook (useMultiParticipantChat)
 * - Zustand store (vanilla pattern)
 *
 * OPTIMIZATIONS:
 * - Callbacks stored as refs (no reactivity needed)
 * - Consolidated sync effects (reduced re-renders)
 * - Error handling via callback (not store state)
 *
 * BENEFITS:
 * - Proper Next.js SSR compatibility
 * - Per-instance isolation (no singleton)
 * - Type-safe store consumption
 * - Minimal re-renders
 *
 */

import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { createContext, use, useCallback, useEffect, useRef } from 'react';
import { useStore } from 'zustand';

import { AnalysisStatuses, MessagePartTypes, MessageRoles } from '@/api/core/enums';
import { useMultiParticipantChat } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { showApiErrorToast } from '@/lib/toast';
import { calculateNextRoundNumber, getCurrentRoundNumber } from '@/lib/utils/round-utils';
import type { ChatStore, ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

// ============================================================================
// CONTEXT (Official Pattern)
// ============================================================================

const ChatStoreContext = createContext<ChatStoreApi | undefined>(undefined);

export type ChatStoreProviderProps = {
  children: ReactNode;
};

export function ChatStoreProvider({ children }: ChatStoreProviderProps) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const storeRef = useRef<ChatStoreApi | null>(null);
  const prevPathnameRef = useRef<string | null>(null);

  // Official Zustand Pattern: Initialize store once per provider
  // Store ref initialization during render is intentional and safe
  if (storeRef.current === null) {
    storeRef.current = createChatStore();
  }

  // eslint-disable-next-line react-hooks/refs -- Zustand pattern: read ref during render for initialization
  const store = storeRef.current;

  // Get current state for AI SDK hook initialization (minimal subscriptions)
  const thread = useStore(store, s => s.thread);
  const participants = useStore(store, s => s.participants);
  const messages = useStore(store, s => s.messages);
  const enableWebSearch = useStore(store, s => s.enableWebSearch);
  const createdThreadId = useStore(store, s => s.createdThreadId);

  // ✅ OPTIMIZATION: Error handling via callback (not store state)
  const handleError = useCallback((error: Error) => {
    showApiErrorToast('Chat error', error);
  }, []);

  // ✅ AI SDK v5 PATTERN: onComplete orchestration  // Called AFTER each round completes (all participants finished streaming)
  // Handles two critical tasks:
  // 1. Analysis trigger: Create pending analysis for moderator review
  // 2. Pending message check: Send next message if waiting for changelog/pre-search

  const handleComplete = useCallback((sdkMessages: UIMessage[]) => {
    const currentState = store.getState();

    // ============================================================================
    // TASK 1: ANALYSIS TRIGGER (after participant streaming)
    // ============================================================================
    // Moved from store subscription (store.ts:865-963)
    // Provider has direct access to chat hook state without stale closures

    // ✅ CRITICAL FIX: Receive messages directly from onComplete callback
    // This avoids stale ref issues - messages are passed with complete metadata
    // sdkMessages parameter has the latest messages from messagesRef.current

    if (currentState.thread || currentState.createdThreadId) {
      const { thread: storeThread, participants: storeParticipants, selectedMode, createdThreadId: storeCreatedThreadId } = currentState;
      const threadId = storeThread?.id || storeCreatedThreadId;
      const mode = storeThread?.mode || selectedMode;

      // Use SDK messages instead of store messages for freshness
      if (threadId && mode && sdkMessages.length > 0) {
        try {
          const roundNumber = getCurrentRoundNumber(sdkMessages);

          // ✅ CRITICAL FIX: Check if analysis already created before proceeding
          // Prevents duplicate analysis creation when both provider and flow-state-machine trigger
          if (currentState.hasAnalysisBeenCreated(roundNumber)) {
            return; // Analysis already created, skip
          }

          const userMessage = sdkMessages.findLast(m => m.role === MessageRoles.USER);
          const userQuestion = userMessage?.parts?.find(p => p.type === MessagePartTypes.TEXT && 'text' in p)?.text || '';

          // Mark as created first (prevents race conditions)
          currentState.markAnalysisCreated(roundNumber);

          // ✅ CRITICAL FIX: Pass SDK messages which have fresh metadata
          currentState.createPendingAnalysis({
            roundNumber,
            messages: sdkMessages,
            participants: storeParticipants,
            userQuestion,
            threadId,
            mode,
          });

          // ✅ CRITICAL FIX: Clear streaming flags after analysis creation
          // This prevents orphaned flags like streamingRoundNumber, isCreatingAnalysis
          // from remaining set and blocking navigation/loading indicators
          currentState.completeStreaming();
        } catch {
          // Silent failure - analysis creation is non-blocking
        }
      }
    }

    // ============================================================================
    // TASK 2: PENDING MESSAGE SEND (after changelog + pre-search)
    // ============================================================================
    // Moved from store subscription (store.ts:991-1072)
    // Provider can directly call sendMessage when conditions are met

    const {
      pendingMessage,
      expectedParticipantIds,
      hasSentPendingMessage,
      isStreaming,
      participants: storeParticipants,
      sendMessage,
      messages: storeMessages,
      isWaitingForChangelog,
      setHasSentPendingMessage,
      setStreamingRoundNumber,
      setHasPendingConfigChanges,
      screenMode,
      thread: storeThread,
      enableWebSearch,
      preSearches,
    } = currentState;

    // Guard: Only send on overview/thread screens (not public)
    if (screenMode === 'public') {
      return;
    }

    // Check if we should send pending message
    if (!pendingMessage || !expectedParticipantIds || hasSentPendingMessage || isStreaming) {
      return;
    }

    // Compare participant model IDs
    const currentModelIds = storeParticipants
      .filter(p => p.isEnabled)
      .map(p => p.modelId)
      .sort()
      .join(',');
    const expectedModelIds = expectedParticipantIds.sort().join(',');

    if (currentModelIds !== expectedModelIds) {
      return;
    }

    // Check changelog wait state
    if (isWaitingForChangelog) {
      return;
    }

    // Calculate next round number (using shared utility for consistency)
    // ✅ BUG FIX: Use calculateNextRoundNumber instead of getCurrentRoundNumber + 1
    // getCurrentRoundNumber returns 0 for empty messages (the current round we're in)
    // Adding 1 incorrectly makes first round = 1 instead of 0
    // calculateNextRoundNumber handles this correctly: -1 + 1 = 0 for first round
    const newRoundNumber = calculateNextRoundNumber(storeMessages);

    // Check if pre-search is needed for this round
    const webSearchEnabled = storeThread?.enableWebSearch ?? enableWebSearch;
    const preSearchForRound = preSearches.find(ps => ps.roundNumber === newRoundNumber);

    // If web search is enabled and pre-search hasn't completed, wait
    if (webSearchEnabled && (!preSearchForRound || preSearchForRound.status !== AnalysisStatuses.COMPLETE)) {
      return; // Don't send message yet - wait for pre-search to complete
    }

    // All conditions met - send the message
    setHasSentPendingMessage(true);
    setStreamingRoundNumber(newRoundNumber);
    setHasPendingConfigChanges(false);

    // Send message in next tick (prevents blocking)
    queueMicrotask(() => {
      sendMessage?.(pendingMessage);
    });
  }, [store]);

  // Initialize AI SDK hook with store state
  // ✅ CRITICAL FIX: Pass onComplete callback for immediate analysis triggering
  // ✅ CRITICAL FIX: Use createdThreadId as fallback for new threads
  // For new threads, thread object doesn't exist yet but createdThreadId is set
  // Without this, pre-search is skipped for new threads because threadId is ''
  // ✅ CRITICAL FIX: Only initialize hook when we have a valid threadId
  // This prevents hook from initializing with empty string, which causes startRound to never be available
  const effectiveThreadId = thread?.id || createdThreadId || '';
  const chat = useMultiParticipantChat({
    threadId: effectiveThreadId,
    participants,
    messages,
    mode: thread?.mode,
    enableWebSearch: (thread?.enableWebSearch ?? enableWebSearch) || false,
    onError: handleError,
    onComplete: handleComplete,
  });

  // ✅ QUOTA INVALIDATION: Use refs to capture latest functions and avoid circular deps
  const sendMessageRef = useRef(chat.sendMessage);
  const startRoundRef = useRef(chat.startRound);

  // Keep refs in sync
  useEffect(() => {
    sendMessageRef.current = chat.sendMessage;
    startRoundRef.current = chat.startRound;
  }, [chat.sendMessage, chat.startRound]);

  // ✅ ARCHITECTURAL FIX: Provider-side streaming trigger
  // Watches waitingToStartStreaming and calls FRESH startRound
  // Avoids stale closure issues from store subscription
  // ✅ PRE-SEARCH BLOCKING: Waits for pre-search completion before triggering participants
  const waitingToStart = useStore(store, s => s.waitingToStartStreaming);
  const storeParticipants = useStore(store, s => s.participants);
  const storeMessages = useStore(store, s => s.messages);
  const storePreSearches = useStore(store, s => s.preSearches);
  const storeThread = useStore(store, s => s.thread);

  useEffect(() => {
    if (!waitingToStart || !chat.startRound || storeParticipants.length === 0 || storeMessages.length === 0) {
      return;
    }

    // ✅ SINGLE SOURCE OF TRUTH: Only trigger startRound for ChatOverviewScreen
    // ChatThreadScreen uses sendMessage flow (pendingMessage effect) instead
    // This prevents duplicate message creation and ensures correct roundNumber
    const currentScreenMode = store.getState().screenMode;
    if (currentScreenMode !== 'overview') {
      // Not on overview screen - don't trigger startRound
      // Clear the flag to prevent infinite waiting
      store.getState().setWaitingToStartStreaming(false);
      return;
    }

    // ✅ CRITICAL FIX: Wait for pre-search completion before streaming participants
    // ✅ 0-BASED: Check pre-search status for round 0 (first round)
    const webSearchEnabled = storeThread?.enableWebSearch ?? false;
    if (webSearchEnabled) {
      const round0PreSearch = storePreSearches.find(ps => ps.roundNumber === 0);

      // If pre-search doesn't exist yet, wait for orchestrator to sync it
      // Backend creates PENDING pre-search during thread creation, orchestrator syncs it
      if (!round0PreSearch) {
        return; // Don't trigger participants yet - waiting for pre-search to be synced
      }

      // If pre-search exists and is still pending or streaming, wait
      if (round0PreSearch.status === AnalysisStatuses.PENDING || round0PreSearch.status === AnalysisStatuses.STREAMING) {
        return; // Don't trigger participants yet - pre-search still running
      }

      // ✅ ERROR: If pre-search failed, log error and proceed anyway
      if (round0PreSearch.status === AnalysisStatuses.FAILED) {
        // Pre-search failed - continuing with participants
        // Continue to start participants even if pre-search failed
      }
    }

    // Call fresh startRound with current participants from store
    chat.startRound(storeParticipants);
    store.getState().setWaitingToStartStreaming(false);
  }, [waitingToStart, chat, storeParticipants, storeMessages, storePreSearches, storeThread, store]);

  // ✅ QUOTA INVALIDATION: Wrap functions to invalidate quota immediately when streaming starts
  // ✅ QUOTA INVALIDATION: Invalidate usage stats when message streaming starts
  const sendMessageWithQuotaInvalidation = useCallback(async (content: string) => {
    // ✅ Invalidate usage stats immediately when message streaming starts
    queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });

    // ✅ PRE-SEARCH: Handled server-side in streaming handler
    // Backend automatically triggers pre-search if enableWebSearch is true
    // Results are saved to DB and included in participant conversation context

    return sendMessageRef.current(content);
  }, [queryClient]);

  const startRoundWithQuotaInvalidation = useCallback(async () => {
    // ✅ Invalidate usage stats immediately when round starts
    queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });

    return await startRoundRef.current();
  }, [queryClient]) as () => Promise<void>;

  // Wrap retry to match Promise<void> signature
  const retryWithPromise = useCallback(async () => {
    chat.retry();
  }, [chat]);

  useEffect(() => {
    storeRef.current?.setState({
      sendMessage: sendMessageWithQuotaInvalidation,
      startRound: startRoundWithQuotaInvalidation,
      retry: retryWithPromise,
      stop: chat.stop,
      chatSetMessages: chat.setMessages,
      messages: chat.messages,
      isStreaming: chat.isStreaming,
      currentParticipantIndex: chat.currentParticipantIndex,
    });
  }, [
    sendMessageWithQuotaInvalidation,
    startRoundWithQuotaInvalidation,
    retryWithPromise,
    chat.stop,
    chat.setMessages,
    chat.messages,
    chat.isStreaming,
    chat.currentParticipantIndex,
  ]);

  // ✅ REMOVED: Duplicate streaming trigger - store subscription (store.ts:1076-1163) handles this
  // The subscription has proper guard protection and identical pre-search waiting logic
  // Keeping this effect created race conditions where both paths could trigger startRound()

  // ✅ CRITICAL FIX: Watch for pending message conditions and trigger send
  // This replaces the removed store subscription (store.ts:991-1072)
  // handleComplete only fires after rounds complete, so we need this for new message submissions
  const pendingMessage = useStore(store, s => s.pendingMessage);
  const expectedParticipantIds = useStore(store, s => s.expectedParticipantIds);
  const hasSentPendingMessage = useStore(store, s => s.hasSentPendingMessage);
  const isStreaming = useStore(store, s => s.isStreaming);
  const isWaitingForChangelog = useStore(store, s => s.isWaitingForChangelog);
  const screenMode = useStore(store, s => s.screenMode);
  const storeParticipantsForSend = useStore(store, s => s.participants);
  const storePreSearchesForSend = useStore(store, s => s.preSearches);

  useEffect(() => {
    const currentState = store.getState();
    const {
      pendingMessage: statePendingMessage,
      expectedParticipantIds: stateExpectedParticipantIds,
      hasSentPendingMessage: stateHasSentPendingMessage,
      isStreaming: stateIsStreaming,
      participants: storeParticipants,
      sendMessage,
      messages: storeMessages,
      isWaitingForChangelog: stateIsWaitingForChangelog,
      setHasSentPendingMessage,
      setStreamingRoundNumber,
      setHasPendingConfigChanges,
      screenMode: stateScreenMode,
      thread: storeThread,
      enableWebSearch: stateEnableWebSearch,
      preSearches: statePreSearches,
    } = currentState;

    // Guard: Only send on overview/thread screens (not public)
    if (stateScreenMode === 'public') {
      return;
    }

    // Check if we should send pending message
    if (!statePendingMessage || !stateExpectedParticipantIds || stateHasSentPendingMessage || stateIsStreaming) {
      return;
    }

    // Compare participant model IDs
    const currentModelIds = storeParticipants
      .filter(p => p.isEnabled)
      .map(p => p.modelId)
      .sort()
      .join(',');
    const expectedModelIds = stateExpectedParticipantIds.sort().join(',');

    if (currentModelIds !== expectedModelIds) {
      return;
    }

    // Check changelog wait state
    if (stateIsWaitingForChangelog) {
      return;
    }

    // Calculate next round number (using shared utility for consistency)
    // ✅ BUG FIX: Use calculateNextRoundNumber instead of getCurrentRoundNumber + 1
    // getCurrentRoundNumber returns 0 for empty messages (the current round we're in)
    // Adding 1 incorrectly makes first round = 1 instead of 0
    // calculateNextRoundNumber handles this correctly: -1 + 1 = 0 for first round
    const newRoundNumber = calculateNextRoundNumber(storeMessages);

    // Check if pre-search is needed for this round
    const webSearchEnabled = storeThread?.enableWebSearch ?? stateEnableWebSearch;
    const preSearchForRound = statePreSearches.find(ps => ps.roundNumber === newRoundNumber);

    // If web search is enabled and pre-search hasn't completed, wait
    if (webSearchEnabled && (!preSearchForRound || preSearchForRound.status !== AnalysisStatuses.COMPLETE)) {
      return; // Don't send message yet - wait for pre-search to complete
    }

    // All conditions met - send the message
    setHasSentPendingMessage(true);
    setStreamingRoundNumber(newRoundNumber);
    setHasPendingConfigChanges(false);

    // Send message in next tick (prevents blocking)
    queueMicrotask(() => {
      sendMessage?.(statePendingMessage);
    });
  }, [
    store,
    pendingMessage,
    expectedParticipantIds,
    hasSentPendingMessage,
    isStreaming,
    isWaitingForChangelog,
    screenMode,
    storeParticipantsForSend,
    storePreSearchesForSend,
  ]);

  // ✅ CLEANUP: Only stop streaming on navigation, don't reset state
  // Screen components manage their own state via useScreenInitialization and thread.id changes
  useEffect(() => {
    const prevPath = prevPathnameRef.current;

    // Skip on initial mount
    if (prevPath === null) {
      prevPathnameRef.current = pathname;
      return;
    }

    // Only cleanup if pathname actually changed (navigation between different pages)
    if (prevPath === pathname) {
      return;
    }

    // Stop any ongoing streaming before navigation
    const currentState = storeRef.current?.getState();
    if (currentState?.isStreaming) {
      currentState.stop?.();
    }

    // Update previous pathname
    prevPathnameRef.current = pathname;
  }, [pathname]);

  return (
    <ChatStoreContext value={store}>
      {children}
    </ChatStoreContext>
  );
}

// ============================================================================
// CONSUMPTION HOOK (Official Pattern)
// ============================================================================

// eslint-disable-next-line react-refresh/only-export-components -- Store hook export
export function useChatStore<T>(selector: (store: ChatStore) => T): T {
  const context = use(ChatStoreContext);

  if (!context) {
    throw new Error('useChatStore must be used within ChatStoreProvider');
  }

  return useStore(context, selector);
}

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

  // Use ref for queryClient to avoid dependency loops in callbacks
  // queryClient from useQueryClient() is stable, so we only need to capture it once
  const queryClientRef = useRef(queryClient);

  // Official Zustand Pattern: Initialize store once per provider
  // Store ref initialization during render is intentional and safe
  if (storeRef.current === null) {
    storeRef.current = createChatStore();
  }

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
        } catch (error) {
          // ✅ CRITICAL FIX: Log errors instead of silent failure
          // This helps diagnose why analysis creation might fail
          console.error('[Provider:handleComplete] Analysis creation failed', {
            error,
            threadId,
            mode,
            messageCount: sdkMessages.length,
            participantCount: storeParticipants.length,
            screenMode: currentState.screenMode,
          });

          // Analysis creation is non-blocking - don't throw
          // But we now know WHY it failed
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
  const retryRef = useRef(chat.retry);
  const stopRef = useRef(chat.stop);
  const setMessagesRef = useRef(chat.setMessages);

  // Keep refs in sync with latest chat methods
  useEffect(() => {
    sendMessageRef.current = chat.sendMessage;
    startRoundRef.current = chat.startRound;
    retryRef.current = chat.retry;
    stopRef.current = chat.stop;
    setMessagesRef.current = chat.setMessages;
  }, [chat.sendMessage, chat.startRound, chat.retry, chat.stop, chat.setMessages]);

  // ✅ CRITICAL FIX: Register chat hook functions with store
  // The pending message effect (line 440) needs access to sendMessage from store state
  // Without this, messages don't send on thread screen after navigation from overview
  useEffect(() => {
    const currentState = store.getState();
    currentState.setSendMessage(chat.sendMessage);
    // Wrap startRound and retry to return Promise<void> to match store types
    currentState.setStartRound(chat.startRound
      ? async () => {
          chat.startRound();
        }
      : undefined);
    currentState.setRetry(chat.retry
      ? async () => {
          chat.retry();
        }
      : undefined);
    currentState.setStop(chat.stop);
    currentState.setChatSetMessages(chat.setMessages);
  }, [store, chat.sendMessage, chat.startRound, chat.retry, chat.stop, chat.setMessages]);

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
    if (!waitingToStart) {
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

    // ✅ CRITICAL FIX: Wait for all required conditions before attempting startRound
    // Only proceed if we have all dependencies ready
    if (!chat.startRound || storeParticipants.length === 0 || storeMessages.length === 0) {
      return; // Keep waiting, don't clear flag
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

    // ✅ CRITICAL FIX: Call startRound and let it handle AI SDK readiness
    // startRound has internal guards for AI SDK status - it will return early if not ready
    // We keep the flag set so this effect retries until streaming actually begins
    // The flag is only cleared when isStreaming becomes true (see effect below)
    chat.startRound(storeParticipants);
  }, [waitingToStart, chat, storeParticipants, storeMessages, storePreSearches, storeThread, store]);

  // ✅ CRITICAL FIX: Clear waitingToStartStreaming flag when streaming actually begins
  // This separate effect watches for successful stream start and clears the flag
  // Prevents race condition where startRound is called before AI SDK is ready
  const chatIsStreaming = useStore(store, s => s.isStreaming);
  useEffect(() => {
    if (waitingToStart && chatIsStreaming) {
      store.getState().setWaitingToStartStreaming(false);
    }
  }, [waitingToStart, chatIsStreaming, store]);

  // ✅ CRITICAL FIX: Sync AI SDK hook messages to store during streaming
  // The hook's internal messages get updated during streaming, but the store's messages don't
  // This causes the overview screen to show only the user message while streaming
  // because it reads from store.messages, not from the hook's messages
  // We sync the hook's messages to the store so components can display them during streaming
  const prevChatMessagesRef = useRef<UIMessage[]>([]);
  useEffect(() => {
    const currentStoreMessages = store.getState().messages;

    // ✅ CRITICAL: Prevent circular updates between store and hook
    // Problem: AI SDK returns new array reference on every render, even if content unchanged
    // Solution: Only sync when ACTUAL CONTENT changes, not just reference changes

    // 🚨 CRITICAL BUG FIX: Never sync if AI SDK has FEWER messages than store
    // This prevents message loss during navigation/initialization when:
    // 1. Store has messages from server (e.g., round 0 + round 1)
    // 2. AI SDK temporarily has fewer messages (e.g., only round 1 due to hydration timing)
    // 3. Sync would overwrite store, losing round 0 messages
    // INVARIANT: Message count should only increase, never decrease (messages are append-only)
    if (chat.messages.length < currentStoreMessages.length) {
      return; // Prevent message loss - AI SDK should never have fewer messages than store
    }

    // 1. Count changed → new message added or removed
    const countChanged = chat.messages.length !== currentStoreMessages.length;

    // 2. During streaming, check if last message content actually changed
    let contentChanged = false;
    if (chat.isStreaming && chat.messages.length > 0 && currentStoreMessages.length > 0) {
      const lastHookMessage = chat.messages[chat.messages.length - 1];
      const lastStoreMessage = currentStoreMessages[currentStoreMessages.length - 1];

      // Compare message IDs and text content (streaming updates content)
      contentChanged = lastHookMessage?.id !== lastStoreMessage?.id
        || JSON.stringify(lastHookMessage?.parts) !== JSON.stringify(lastStoreMessage?.parts);
    }

    const shouldSync = countChanged || contentChanged;

    if (shouldSync) {
      prevChatMessagesRef.current = chat.messages;
      store.getState().setMessages(chat.messages);
    }
  }, [chat.messages, chat.isStreaming, store]); // Store included for exhaustive deps

  // Sync other reactive values from hook to store for component access
  useEffect(() => {
    const currentState = store.getState();

    // Only update if values actually changed
    if (currentState.isStreaming !== chat.isStreaming) {
      currentState.setIsStreaming(chat.isStreaming);
    }

    if (currentState.currentParticipantIndex !== chat.currentParticipantIndex) {
      currentState.setCurrentParticipantIndex(chat.currentParticipantIndex);
    }
  }, [chat.isStreaming, chat.currentParticipantIndex, store]);

  // ✅ QUOTA INVALIDATION: Stable callbacks using refs (no dependencies)
  // All callbacks use refs for both chat methods and queryClient to avoid dependency loops
  const sendMessageWithQuotaInvalidation = useCallback(async (content: string) => {
    // Use queryClientRef to avoid dependency on queryClient
    queryClientRef.current.invalidateQueries({ queryKey: queryKeys.usage.stats() });
    return sendMessageRef.current(content);
  }, []); // Empty deps = stable reference

  const startRoundWithQuotaInvalidation = useCallback(async () => {
    // Use queryClientRef to avoid dependency on queryClient
    queryClientRef.current.invalidateQueries({ queryKey: queryKeys.usage.stats() });
    return startRoundRef.current();
  }, []) as () => Promise<void>; // Empty deps = stable reference

  const retryWithPromise = useCallback(async () => {
    retryRef.current();
  }, []); // Empty deps = stable reference

  // Sync callbacks to store ONCE on mount only
  // Callbacks have empty deps so they're stable - no need to sync on every change
  useEffect(() => {
    storeRef.current?.setState({
      sendMessage: sendMessageWithQuotaInvalidation,
      startRound: startRoundWithQuotaInvalidation,
      retry: retryWithPromise,
      stop: stopRef.current,
      chatSetMessages: setMessagesRef.current,
      // NOTE: Reactive values (messages, isStreaming, currentParticipantIndex) are synced
      // in dedicated effects above (lines 329-354) with proper change detection
      // This prevents infinite loops while keeping store and hook in sync
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = run once on mount (callbacks are stable with empty deps)

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

    // ✅ CRITICAL FIX: Guard against sendMessage being undefined
    // The sendMessage callback wrapper always exists, but the underlying ref might not be ready
    // Check the ref directly to ensure AI SDK hook has initialized
    if (!sendMessage || !sendMessageRef.current) {
      return; // Wait for sendMessage to be available
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

    // ✅ CRITICAL FIX: Set flags and send message atomically
    // Set hasSentPendingMessage BEFORE calling sendMessage to prevent duplicate sends
    // If sendMessage fails, we'll catch the error and reset the flag
    setHasSentPendingMessage(true);
    setStreamingRoundNumber(newRoundNumber);
    setHasPendingConfigChanges(false);

    // Send message in next tick (prevents blocking)
    queueMicrotask(() => {
      // Call sendMessage and handle potential errors
      // NOTE: We do NOT reset hasSentPendingMessage on error to prevent infinite retry loops
      // The flag is only reset when user submits a new message via prepareForNewMessage
      try {
        const result = sendMessage(statePendingMessage);

        // If sendMessage returns a promise, log rejection but don't reset flag
        if (result && typeof result.catch === 'function') {
          result.catch((error: Error) => {
            console.error('[Provider:pendingMessage] sendMessage failed:', error);
            // Don't reset flag - prevents infinite retry loop
          });
        }
      } catch (error) {
        console.error('[Provider:pendingMessage] sendMessage threw error:', error);
        // Don't reset flag - prevents infinite retry loop
      }
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

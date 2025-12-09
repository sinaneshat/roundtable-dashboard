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
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { createContext, use, useCallback, useEffect, useRef } from 'react';
import { useStore } from 'zustand';

import { AnalysisStatuses, MessagePartTypes, MessageRoles, ScreenModes } from '@/api/core/enums';
import { useCreatePreSearchMutation } from '@/hooks/mutations';
import { useMultiParticipantChat } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { showApiErrorToast } from '@/lib/toast';
import { transformPreSearch } from '@/lib/utils/date-transforms';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import { getRoundNumber } from '@/lib/utils/metadata';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';
import { extractFileContextForSearch, getPreSearchTimeout, shouldPreSearchTimeout, TIMEOUT_CONFIG } from '@/lib/utils/web-search-utils';
import { executePreSearchStreamService, getThreadMessagesService } from '@/services/api';
import type { ChatStore, ChatStoreApi } from '@/stores/chat';
import { AnimationIndices, createChatStore, readPreSearchStreamData, shouldWaitForPreSearch } from '@/stores/chat';

// ============================================================================
// CONTEXT (Official Pattern)
// ============================================================================

// eslint-disable-next-line react-refresh/only-export-components -- Context export required for provider pattern
export const ChatStoreContext = createContext<ChatStoreApi | undefined>(undefined);

export type ChatStoreProviderProps = {
  children: ReactNode;
};

export function ChatStoreProvider({ children }: ChatStoreProviderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const storeRef = useRef<ChatStoreApi | null>(null);
  const prevPathnameRef = useRef<string | null>(null);

  // Use ref for queryClient to avoid dependency loops in callbacks
  // queryClient from useQueryClient() is stable, so we only need to capture it once
  const queryClientRef = useRef(queryClient);

  // ✅ FIX: Track pre-search creation attempts to prevent infinite retry loops
  // When creation fails (e.g., 500 error), we don't want to keep retrying
  const preSearchCreationAttemptedRef = useRef<Set<number>>(new Set());

  // ✅ NEW: Pre-search creation mutation (fixes web search ordering)
  const createPreSearch = useCreatePreSearchMutation();

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
  // ✅ RACE CONDITION FIX: Pass to hook to prevent resumed stream detection during submission
  const hasEarlyOptimisticMessage = useStore(store, s => s.hasEarlyOptimisticMessage);

  // ✅ CRITICAL FIX: Subscribe to state needed by pending message sender effect
  // These subscriptions ensure effect re-runs when state changes
  const pendingMessage = useStore(store, s => s.pendingMessage);
  const pendingAttachmentIds = useStore(store, s => s.pendingAttachmentIds);
  const pendingFileParts = useStore(store, s => s.pendingFileParts);
  const expectedParticipantIds = useStore(store, s => s.expectedParticipantIds);
  const hasSentPendingMessage = useStore(store, s => s.hasSentPendingMessage);
  const isStreaming = useStore(store, s => s.isStreaming);
  const isWaitingForChangelog = useStore(store, s => s.isWaitingForChangelog);
  const screenMode = useStore(store, s => s.screenMode);
  const preSearches = useStore(store, s => s.preSearches);

  // ✅ OPTIMIZATION: Error handling via callback (not store state)
  const handleError = useCallback((error: Error) => {
    showApiErrorToast('Chat error', error);
  }, []);

  // ✅ AI SDK v5 PATTERN: onComplete orchestration  // Called AFTER each round completes (all participants finished streaming)
  // Handles two critical tasks:
  // 1. Analysis trigger: Create pending analysis for moderator review (after animations)
  // 2. Pending message check: Send next message if waiting for changelog/pre-search

  const handleComplete = useCallback(async (sdkMessages: UIMessage[]) => {
    const currentState = store.getState();

    // ============================================================================
    // TASK 1: ANALYSIS TRIGGER (after participant streaming AND animations)
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

          // ✅ FIX: Wait for ALL participant animations to complete
          // This ensures analysis doesn't appear while ANY participant's message is still animating
          // Previously only waited for last participant, but parallel participants could still be animating
          // waitForAllAnimations ensures sequential execution with no overlapping animations
          await currentState.waitForAllAnimations();

          // Mark as created first (prevents race conditions)
          currentState.markAnalysisCreated(roundNumber);

          // ✅ CRITICAL FIX: Pass SDK messages which have fresh metadata
          currentState.createPendingAnalysis({
            roundNumber,
            messages: sdkMessages,
            userQuestion,
            threadId,
            mode,
          });

          // ✅ CRITICAL FIX: Clear streaming flags after analysis creation
          // This prevents orphaned flags like streamingRoundNumber, isCreatingAnalysis
          // from remaining set and blocking navigation/loading indicators
          currentState.completeStreaming();

          // ✅ ATTACHMENT FIX: Fetch fresh messages to get signed URLs for attachments
          // Optimistic messages have blob URLs which become invalid after page refresh.
          // Backend stores proper signed URLs - fetching fresh replaces blob URLs with valid ones.
          // This ensures attachments display correctly after streaming completes.
          try {
            // ✅ PATTERN: Use queryClient.fetchQuery for proper cache management
            // This ensures the cache is updated and other components benefit from fresh data
            const result = await queryClientRef.current.fetchQuery({
              queryKey: queryKeys.threads.messages(threadId),
              queryFn: () => getThreadMessagesService({ param: { id: threadId } }),
              staleTime: 0, // Force fresh fetch after streaming
            });
            if (result.success && result.data?.messages) {
              // ✅ TYPE-SAFE: Transform ChatMessage[] to UIMessage[] using utility
              const uiMessages = chatMessagesToUIMessages(result.data.messages, storeParticipants);
              // Update store with fresh messages (contains proper signed URLs)
              // The sync effect will handle updating the AI SDK hook
              currentState.setMessages(uiMessages);
            }
          } catch {
            // Non-blocking - if refresh fails, UI still works with fallback icons
            // The isValidDisplayUrl check in message-attachment-preview.tsx shows icons instead of broken images
          }
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

    // NOTE: TASK 2 (pending message send with pre-search handling) was REMOVED.
    // It was duplicated in the pendingMessage effect below, causing race conditions.
    // The pendingMessage effect now handles ALL pre-search + message sending logic.
  }, [store]);

  // Initialize AI SDK hook with store state
  // ✅ CRITICAL FIX: Pass onComplete callback for immediate analysis triggering
  // ✅ CRITICAL FIX: Use createdThreadId as fallback for new threads
  // For new threads, thread object doesn't exist yet but createdThreadId is set
  // Without this, pre-search is skipped for new threads because threadId is ''
  // ✅ CRITICAL FIX: Only initialize hook when we have a valid threadId
  // This prevents hook from initializing with empty string, which causes startRound to never be available
  const effectiveThreadId = thread?.id || createdThreadId || '';

  // Animation tracking: clear all pending animations on round reset
  const clearAnimations = useStore(store, s => s.clearAnimations);
  // Animation tracking: complete animation for specific participant (used in error handler)
  const completeAnimation = useStore(store, s => s.completeAnimation);

  const chat = useMultiParticipantChat({
    threadId: effectiveThreadId,
    participants,
    messages,
    mode: thread?.mode,
    // ✅ FIX: Use form state as sole source of truth for web search enabled
    enableWebSearch,
    // ✅ ATTACHMENTS: Pass attachment IDs for message association
    pendingAttachmentIds,
    // ✅ ATTACHMENTS: Pass file parts so AI SDK creates user message with file parts
    // This ensures file attachments appear immediately in UI without full page refresh
    pendingFileParts,
    onError: handleError,
    onComplete: handleComplete,
    // Animation tracking: clear all pending animations on round reset
    clearAnimations,
    // ✅ FIX: Complete animation for errored participants to prevent timeout
    completeAnimation,
    // ✅ RACE CONDITION FIX: Prevents resumed stream detection from setting isStreaming=true
    // during form submission, which would create a deadlock state
    hasEarlyOptimisticMessage,
    // ✅ STREAM RESUMPTION: Queue next participant when participants aren't loaded yet
    // Provider effect watches nextParticipantToTrigger and calls continueFromParticipant
    onResumedStreamComplete: (roundNumber, participantIndex) => {
      store.getState().handleResumedStreamComplete(roundNumber, participantIndex);
    },
  });

  // ✅ REFS PATTERN: Capture latest chat methods for use in effects
  // NOTE: useEffectEvent would be ideal but React's rules-of-hooks linter restricts
  // it to only being called from inside effects. Since we need to call these from
  // useCallback (which can be called outside effects), we use refs + sync effect.
  const sendMessageRef = useRef(chat.sendMessage);
  const startRoundRef = useRef(chat.startRound);
  const setMessagesRef = useRef(chat.setMessages);

  // Keep refs in sync with latest chat methods
  useEffect(() => {
    sendMessageRef.current = chat.sendMessage;
    startRoundRef.current = chat.startRound;
    setMessagesRef.current = chat.setMessages;
  }, [chat.sendMessage, chat.startRound, chat.setMessages]);

  // ✅ CRITICAL FIX: Clear pre-search creation tracking when thread changes
  // BUG FIX: When clicking a recommendation from analysis card on overview screen,
  // the preSearchCreationAttemptedRef retains round 0 entry from previous thread.
  // This causes the new thread's round 0 pre-search to be skipped (ref says "already attempted").
  // SOLUTION: Clear the ref when createdThreadId changes to ensure fresh tracking per thread.
  const prevCreatedThreadIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (createdThreadId !== prevCreatedThreadIdRef.current) {
      prevCreatedThreadIdRef.current = createdThreadId;
      // Clear pre-search tracking when thread changes
      preSearchCreationAttemptedRef.current = new Set();
    }
  }, [createdThreadId]);

  // ✅ REMOVED: Old effect that stored unwrapped chat methods
  // This effect was overwriting the wrapped versions with quota/pre-search invalidation
  // The wrapped versions are now stored in the effect below (lines 500-511)
  // which runs once on mount with stable callbacks that include query invalidation logic

  // ✅ ROUND 0 ONLY: Provider-side streaming trigger for initial thread creation
  // This effect ONLY handles round 0 when handleCreateThread sets waitingToStartStreaming=true
  // All subsequent rounds (1+) use the pendingMessage effect via handleUpdateThreadAndSend
  // ✅ PRE-SEARCH BLOCKING: Waits for pre-search completion AND animation before triggering participants
  const waitingToStart = useStore(store, s => s.waitingToStartStreaming);

  // ✅ RACE CONDITION FIX: Track which rounds have had startRound called
  // Effect re-runs multiple times due to dependency changes (messages, participants)
  // This prevents calling startRound multiple times for the same round
  const startRoundCalledForRoundRef = useRef<number | null>(null);
  const storeParticipants = useStore(store, s => s.participants);
  const storeMessages = useStore(store, s => s.messages);
  const storePreSearches = useStore(store, s => s.preSearches);
  const storeThread = useStore(store, s => s.thread);
  const storeScreenMode = useStore(store, s => s.screenMode); // ✅ FIX: Subscribe to screenMode changes
  const storePendingAnimations = useStore(store, s => s.pendingAnimations); // ✅ ANIMATION COORDINATION: Subscribe to animation state

  useEffect(() => {
    if (!waitingToStart) {
      // Reset the guard when not waiting (allows next round to trigger)
      startRoundCalledForRoundRef.current = null;
      return;
    }

    // ✅ ROUND 0 ONLY: This effect only triggers for initial thread creation (round 0)
    // All subsequent rounds use the pendingMessage effect (unified flow for both screens)
    // This prevents duplicate message creation and ensures correct roundNumber
    const currentScreenMode = storeScreenMode;

    // ✅ CRITICAL FIX: Don't clear flag if screenMode is null (during initialization)
    // Also don't clear on thread screen - continueFromParticipant effect handles resumption there
    // This prevents race condition where:
    // 1. Thread created, waitingToStartStreaming set to true
    // 2. Provider effect runs BEFORE screen initialization sets screenMode
    // 3. screenMode is null, condition fails, flag gets cleared
    // 4. Screen initialization sets screenMode to ScreenModes.OVERVIEW
    // 5. But flag is already cleared → participants never start
    //
    // ✅ STREAM RESUMPTION FIX: Don't clear flag on thread screen
    // On thread screen, useIncompleteRoundResumption sets waitingToStartStreaming=true
    // The continueFromParticipant effect (below) handles thread screen resumption
    // If we clear the flag here, the continueFromParticipant effect never triggers
    if (currentScreenMode !== null && currentScreenMode !== ScreenModes.OVERVIEW) {
      // Not on overview screen - this effect only handles overview screen
      // Just return, DON'T clear the flag - continueFromParticipant effect needs it
      return;
    }

    // If screenMode is null, wait for screen initialization to set it
    if (currentScreenMode === null) {
      return; // Keep waiting, don't clear flag
    }

    // ✅ CRITICAL FIX: Wait for all required conditions before attempting startRound
    // Only proceed if we have all dependencies ready
    if (!chat.startRound || storeParticipants.length === 0 || storeMessages.length === 0) {
      return; // Keep waiting, don't clear flag
    }

    // ✅ CRITICAL FIX: Wait for CURRENT round's pre-search completion before streaming participants
    // ✅ FIXED: Use getCurrentRoundNumber to check current round's pre-search, not hardcoded round 0
    const webSearchEnabled = storeThread?.enableWebSearch ?? false;
    if (webSearchEnabled) {
      // Determine the current round from messages (0-based indexing)
      const currentRound = getCurrentRoundNumber(storeMessages);
      const currentRoundPreSearch = storePreSearches.find(ps => ps.roundNumber === currentRound);

      // If pre-search doesn't exist yet, wait for orchestrator to sync it
      // Backend creates PENDING pre-search during thread creation, orchestrator syncs it
      if (!currentRoundPreSearch) {
        return; // Don't trigger participants yet - waiting for pre-search to be synced
      }

      // If pre-search is STREAMING, wait for it to complete
      if (currentRoundPreSearch.status === AnalysisStatuses.STREAMING) {
        return; // Don't trigger participants yet - pre-search still running
      }

      // ✅ CRITICAL FIX: If pre-search is PENDING, execute it
      // On overview screen, the pendingMessage effect returns early (waitingToStart guard)
      // So we need to trigger pre-search execution here instead
      if (currentRoundPreSearch.status === AnalysisStatuses.PENDING) {
        // Check if already triggered to prevent duplicate execution
        const currentState = store.getState();
        if (currentState.hasPreSearchBeenTriggered(currentRound)) {
          return; // Already triggered - wait for it to complete
        }

        // Mark as triggered BEFORE async operation
        currentState.markPreSearchTriggered(currentRound);

        // Get user query from pending message or first user message in round
        const pendingMsg = currentState.pendingMessage;
        const userMessageForRound = storeMessages.find((msg) => {
          if (msg.role !== MessageRoles.USER)
            return false;
          const msgRound = getRoundNumber(msg.metadata);
          return msgRound === currentRound;
        });
        // ✅ TYPE-SAFE: Use extractTextFromMessage utility instead of force cast
        const userQuery = pendingMsg || (userMessageForRound ? extractTextFromMessage(userMessageForRound) : '') || '';

        if (!userQuery) {
          return; // No query to search with
        }

        const threadIdForSearch = storeThread?.id || effectiveThreadId;
        const isPlaceholder = currentRoundPreSearch.id.startsWith('placeholder-');

        // Execute pre-search
        queueMicrotask(() => {
          const executeSearch = async () => {
            try {
              // ✅ FILE CONTEXT: Extract text from uploaded files for search query generation
              const attachments = store.getState().getAttachments();
              const fileContext = await extractFileContextForSearch(attachments);

              // ✅ IMAGE ANALYSIS: Get attachment IDs for server-side image analysis
              // The backend will analyze images with a vision model to generate relevant search queries
              const attachmentIds = store.getState().pendingAttachmentIds || undefined;

              // If placeholder, create DB record first
              if (isPlaceholder) {
                const createResponse = await createPreSearch.mutateAsync({
                  param: {
                    threadId: threadIdForSearch,
                    roundNumber: currentRound.toString(),
                  },
                  json: { userQuery, fileContext: fileContext || undefined, attachmentIds },
                });

                if (createResponse?.data) {
                  const preSearchWithDates = transformPreSearch(createResponse.data);
                  store.getState().addPreSearch({
                    ...preSearchWithDates,
                    status: AnalysisStatuses.STREAMING,
                  });
                }
              } else {
                // Update status to STREAMING
                store.getState().updatePreSearchStatus(currentRound, AnalysisStatuses.STREAMING);
              }

              // ✅ TYPE-SAFE: Use service instead of direct fetch
              const response = await executePreSearchStreamService({
                param: {
                  threadId: threadIdForSearch,
                  roundNumber: String(currentRound),
                },
                json: {
                  userQuery,
                  fileContext: fileContext || undefined,
                  attachmentIds,
                },
              });

              if (!response.ok && response.status !== 409) {
                console.error('[startRound] Pre-search execution failed:', response.status);
                store.getState().updatePreSearchStatus(currentRound, AnalysisStatuses.FAILED);
                store.getState().clearPreSearchActivity(currentRound);
                return;
              }

              // Parse SSE stream
              const searchData = await readPreSearchStreamData(response, () => {
                store.getState().updatePreSearchActivity(currentRound);
              });

              // Update store with results
              if (searchData) {
                store.getState().updatePreSearchData(currentRound, searchData);
              } else {
                store.getState().updatePreSearchStatus(currentRound, AnalysisStatuses.COMPLETE);
              }

              store.getState().clearPreSearchActivity(currentRound);

              // Invalidate queries for sync
              queryClientRef.current.invalidateQueries({
                queryKey: queryKeys.threads.preSearches(threadIdForSearch),
              });
            } catch (error) {
              console.error('[startRound] Pre-search failed:', error);
              store.getState().clearPreSearchActivity(currentRound);
              store.getState().clearPreSearchTracking(currentRound);
            }
          };

          executeSearch();
        });

        return; // Wait for pre-search to complete (effect will re-run when status changes)
      }

      // ✅ FIX: Check animation status - multiple defensive layers
      // Pre-search uses AnimationIndices.PRE_SEARCH for animation tracking
      // This ensures participants don't start while pre-search UI is still animating
      const isPreSearchAnimating = storePendingAnimations.has(AnimationIndices.PRE_SEARCH);

      if (isPreSearchAnimating) {
        return; // Don't trigger participants yet - pre-search animation still running
      }

      // ✅ FIX: Defensive timing guard - if just completed, wait one cycle
      // When status changes to COMPLETE, component needs time to register animation
      // This prevents race where provider checks before component's useLayoutEffect runs
      if (currentRoundPreSearch.status === AnalysisStatuses.COMPLETE && currentRoundPreSearch.completedAt) {
        const completedTime = currentRoundPreSearch.completedAt instanceof Date
          ? currentRoundPreSearch.completedAt.getTime()
          : new Date(currentRoundPreSearch.completedAt).getTime();
        const timeSinceComplete = Date.now() - completedTime;

        // If completed less than 50ms ago, wait for component registration
        // This gives PreSearchCard's useLayoutEffect time to run
        if (timeSinceComplete < 50) {
          return; // Wait another effect cycle for animation registration
        }
      }

      // If pre-search failed, continue anyway - participants can work without it
    }

    // ✅ RACE CONDITION FIX: Prevent duplicate startRound calls for the same round
    // Effect may re-run multiple times due to dependency changes (messages array updates)
    // before isStreaming becomes true and clears the waitingToStart flag
    // ✅ CRITICAL FIX: Call startRound and let it handle AI SDK readiness
    // startRound has internal guards for AI SDK status - it will return early if not ready
    // We keep the flag set so this effect retries until streaming actually begins
    // The flag is only cleared when isStreaming becomes true (see effect below)

    // ✅ RACE CONDITION FIX: Only call startRound once per round
    // Effect re-runs multiple times, but we only want to trigger participants once
    const currentRound = getCurrentRoundNumber(storeMessages);
    if (startRoundCalledForRoundRef.current === currentRound) {
      return; // Already called startRound for this round
    }

    // ✅ RACE CONDITION FIX: Also check hook's triggering state
    // If the hook is already in the process of triggering, don't call again
    if (chat.isTriggeringRef.current || chat.isStreamingRef.current) {
      return;
    }

    // Mark as called BEFORE calling startRound (synchronous lock)
    startRoundCalledForRoundRef.current = currentRound;
    chat.startRound(storeParticipants);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only depend on chat.startRound, not entire chat object to avoid unnecessary re-renders
  }, [waitingToStart, chat.startRound, storeParticipants, storeMessages, storePreSearches, storeThread, storeScreenMode, storePendingAnimations, store, effectiveThreadId]);

  // ✅ CRITICAL FIX: Clear waitingToStartStreaming flag when streaming actually begins
  // This separate effect watches for successful stream start and clears the flag
  // Prevents race condition where startRound is called before AI SDK is ready
  const chatIsStreaming = useStore(store, s => s.isStreaming);
  useEffect(() => {
    if (waitingToStart && chatIsStreaming) {
      store.getState().setWaitingToStartStreaming(false);
      // ✅ CRITICAL FIX: Mark pending message as sent when startRound triggered streaming
      // BUG: After streaming completes (isStreaming=false), pendingMessage effect re-runs
      // If pendingMessage is still set and hasSentPendingMessage=false, it calls sendMessage()
      // This creates a DUPLICATE user message and round!
      //
      // Fix: Set hasSentPendingMessage=true here because startRound used the same prompt
      // as what's in pendingMessage. This prevents the pendingMessage effect from firing
      // after streaming completes.
      store.getState().setHasSentPendingMessage(true);
    }
  }, [waitingToStart, chatIsStreaming, store]);

  // ✅ TIMEOUT PROTECTION: Clear waitingToStartStreaming if streaming fails to start
  // Prevents system from getting stuck forever if AI SDK never becomes ready
  // ✅ ACTIVITY-BASED TIMEOUT: Checks both total time AND recent SSE activity
  // Track when we started waiting to properly calculate elapsed time
  const waitingStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!waitingToStart) {
      waitingStartTimeRef.current = null;
      return;
    }

    // Record when we started waiting
    if (waitingStartTimeRef.current === null) {
      waitingStartTimeRef.current = Date.now();
    }

    // ✅ ACTIVITY-BASED TIMEOUT: Use interval to check activity rather than fixed timeout
    // This allows pre-searches to run as long as they're making progress (receiving SSE events)
    // Timeout is triggered when:
    // 1. Total elapsed time exceeds dynamic timeout (based on query complexity), OR
    // 2. No SSE activity received within ACTIVITY_TIMEOUT_MS (data flow stopped)

    const checkInterval = setInterval(() => {
      const latestState = store.getState();

      // Only timeout if still waiting and not streaming
      if (!latestState.waitingToStartStreaming || latestState.isStreaming) {
        return;
      }

      const now = Date.now();
      const waitingStartTime = waitingStartTimeRef.current ?? now;
      const elapsedWaitingTime = now - waitingStartTime;
      const latestWebSearchEnabled = latestState.thread?.enableWebSearch ?? latestState.enableWebSearch;

      // ✅ FIX: Early return if still in initial setup phase (< 60s and no thread yet)
      // This prevents premature timeout during thread creation
      if (!latestState.createdThreadId && elapsedWaitingTime < 60_000) {
        return;
      }

      // ✅ Web search path: check pre-search timeout
      if (latestWebSearchEnabled) {
        // If no messages yet, wait for initial setup (up to 60s)
        if (latestState.messages.length === 0) {
          if (elapsedWaitingTime < 60_000) {
            return;
          }
        } else {
          const currentRound = getCurrentRoundNumber(latestState.messages);
          // ✅ DEFENSIVE GUARD: Ensure preSearches is an array before calling .find()
          const preSearchForRound = Array.isArray(latestState.preSearches)
            ? latestState.preSearches.find(ps => ps.roundNumber === currentRound)
            : undefined;

          // If pre-search doesn't exist yet, wait for creation (up to 60s from start)
          if (!preSearchForRound) {
            if (elapsedWaitingTime < 60_000) {
              return;
            }
          } else {
            const isStillRunning = preSearchForRound.status === AnalysisStatuses.PENDING
              || preSearchForRound.status === AnalysisStatuses.STREAMING;

            if (isStillRunning) {
              // ✅ ACTIVITY-BASED TIMEOUT: Check both total time AND activity
              const lastActivityTime = latestState.getPreSearchActivityTime(currentRound);

              // If still receiving SSE events (has recent activity), don't timeout
              if (!shouldPreSearchTimeout(preSearchForRound, lastActivityTime, now)) {
                return; // Pre-search is still running and has recent activity
              }

              // ✅ FIX: Return here - pre-search specific timeout should not trigger full reset
              // The checkStuckPreSearches mechanism will mark this as FAILED, allowing participants to proceed
              return;
            } else {
              // Pre-search finished (COMPLETE/FAILED) - need grace period for participants to start
              // ✅ FIX: Add grace period between pre-search completion and participant streaming
              // There's a delay between pre-search completing and participants starting streaming
              // Without this grace period, the timeout would fire during this transition
              const PARTICIPANT_START_GRACE_PERIOD_MS = 15_000; // 15s for participants to start

              const completedTime = preSearchForRound.completedAt instanceof Date
                ? preSearchForRound.completedAt.getTime()
                : preSearchForRound.completedAt
                  ? new Date(preSearchForRound.completedAt).getTime()
                  : now; // If no completedAt, use now as fallback

              const timeSinceComplete = now - completedTime;

              if (timeSinceComplete < PARTICIPANT_START_GRACE_PERIOD_MS) {
                return; // Still within grace period - participants may start soon
              }

              // Grace period exceeded but participants still haven't started - unusual state
              // Don't reset - let other mechanisms handle stuck state
              return;
            }
          }
        }
      } else {
        // ✅ Non-web-search path: use fixed timeout from when we started waiting
        if (elapsedWaitingTime < TIMEOUT_CONFIG.DEFAULT_MS) {
          return; // Still within default timeout window
        }
      }

      // ✅ FULL RESET: Clear all streaming-related state
      latestState.setWaitingToStartStreaming(false);
      latestState.setIsStreaming(false);
      latestState.setIsCreatingThread(false);

      // ✅ COMPLETE RESET: Reset entire store to overview state
      latestState.resetToOverview();

      // ✅ NAVIGATE: Push back to /chat to ensure URL matches state
      router.push('/chat');

      // Show error to user
      showApiErrorToast('Failed to start conversation', new Error('Streaming failed to start. Please try again.'));

      // Clear interval after timeout
      clearInterval(checkInterval);
    }, 5000); // Check every 5 seconds

    return () => {
      clearInterval(checkInterval);
    };
  }, [waitingToStart, store, router]);

  // ✅ INCOMPLETE ROUND RESUMPTION: Continue from specific participant when round is incomplete
  // This effect is triggered by useIncompleteRoundResumption hook when it detects an incomplete round
  // on page load. It calls continueFromParticipant to trigger the remaining participants.
  const nextParticipantToTrigger = useStore(store, s => s.nextParticipantToTrigger);

  // ✅ RACE CONDITION FIX: Clean up dangling nextParticipantToTrigger
  // If waitingToStart is false but nextParticipantToTrigger is set, this is inconsistent state
  // that can occur when stale state detection clears waitingToStart but misses other flags.
  // Clean up to prevent the system from being stuck with unprocessed trigger.
  useEffect(() => {
    // Only clean up if we have dangling state: participant set but not waiting/streaming
    if (nextParticipantToTrigger === null || waitingToStart || chatIsStreaming) {
      return; // No cleanup needed
    }

    // Give a short delay to allow normal resumption to happen first
    // This prevents clearing during the brief window between setting flags
    const timeoutId = setTimeout(() => {
      const latestState = store.getState();
      // Double-check state hasn't changed - still dangling?
      if (latestState.nextParticipantToTrigger !== null
        && !latestState.waitingToStartStreaming
        && !latestState.isStreaming
      ) {
        // Clear the dangling state
        latestState.setNextParticipantToTrigger(null);
      }
    }, 500); // 500ms grace period

    return () => clearTimeout(timeoutId);
  }, [nextParticipantToTrigger, waitingToStart, chatIsStreaming, store]);

  useEffect(() => {
    // Skip if no participant to trigger or not waiting to resume
    if (nextParticipantToTrigger === null || !waitingToStart) {
      return;
    }

    // Skip if already streaming
    if (chatIsStreaming) {
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setNextParticipantToTrigger(null);
      return;
    }

    // Skip if no participants
    if (storeParticipants.length === 0) {
      return;
    }

    // Skip if no messages (nothing to resume)
    if (storeMessages.length === 0) {
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setNextParticipantToTrigger(null);
      return;
    }

    // ✅ CRITICAL FIX: Wait for AI SDK to be ready before calling continueFromParticipant
    // AI SDK needs time to initialize and hydrate messages after page refresh.
    // Without this check, continueFromParticipant returns early silently, leaving
    // waitingToStartStreaming=true and the UI stuck in a waiting state.
    if (!chat.isReady) {
      // Effect will re-run when chat.isReady becomes true
      return;
    }

    // ✅ PRE-SEARCH BLOCKING: Wait for pre-search to complete before starting participants
    // This handles the case where thread is created on overview screen and user navigates
    // to thread screen before pre-search completes. Without this, participants would start
    // before search results are available.
    const currentRound = getCurrentRoundNumber(storeMessages);
    const webSearchEnabled = storeThread?.enableWebSearch ?? false;
    const preSearchForRound = storePreSearches.find(ps => ps.roundNumber === currentRound);
    if (shouldWaitForPreSearch(webSearchEnabled, preSearchForRound)) {
      // Effect will re-run when preSearches updates (status changes)
      return;
    }

    // ✅ CRITICAL: Call continueFromParticipant to resume from the specific participant
    // This triggers streaming for the missing participant, not from the beginning
    chat.continueFromParticipant(nextParticipantToTrigger, storeParticipants);

    // Clear the trigger flag after calling (let the effect retry if needed)
    // The flag will be cleared when streaming actually begins
  }, [nextParticipantToTrigger, waitingToStart, chatIsStreaming, storeParticipants, storeMessages, storePreSearches, storeThread, chat, store]);

  // ✅ SAFETY TIMEOUT: Clear stuck waitingToStartStreaming state on thread screen
  // In local dev without KV, stream resumption may fail (GET /stream returns 204)
  // but the incomplete round resumption hook sets waitingToStartStreaming=true.
  // If AI SDK can't continue within 10 seconds, clear the flag to allow retry.
  const resumptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only on thread screen with active resumption state
    const currentScreenMode = store.getState().screenMode;
    if (currentScreenMode !== 'thread' || !waitingToStart || nextParticipantToTrigger === null) {
      // Clear any existing timeout
      if (resumptionTimeoutRef.current) {
        clearTimeout(resumptionTimeoutRef.current);
        resumptionTimeoutRef.current = null;
      }
      return;
    }

    // Skip if streaming started
    if (chatIsStreaming) {
      if (resumptionTimeoutRef.current) {
        clearTimeout(resumptionTimeoutRef.current);
        resumptionTimeoutRef.current = null;
      }
      return;
    }

    // Set timeout to clear stuck state
    resumptionTimeoutRef.current = setTimeout(() => {
      const latestState = store.getState();

      // Check if still stuck (waitingToStart but not streaming)
      if (latestState.waitingToStartStreaming && !latestState.isStreaming) {
        // ✅ FIX: Clear the stuck state to allow user to retry
        latestState.setWaitingToStartStreaming(false);
        latestState.setNextParticipantToTrigger(null);
      }
    }, 10000); // 10 second timeout for thread screen resumption

    return () => {
      if (resumptionTimeoutRef.current) {
        clearTimeout(resumptionTimeoutRef.current);
        resumptionTimeoutRef.current = null;
      }
    };
  }, [waitingToStart, chatIsStreaming, nextParticipantToTrigger, store]);

  // ✅ SAFETY MECHANISM: Auto-complete stuck pre-searches after timeout
  // Prevents pre-searches stuck at 'streaming' or 'pending' from blocking messages
  // This handles cases where the backend fails to respond or the stream disconnects
  const stuckPreSearchIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Note: Timeout is handled internally by store.checkStuckPreSearches()
    // Clear any existing interval before creating new one
    if (stuckPreSearchIntervalRef.current) {
      clearInterval(stuckPreSearchIntervalRef.current);
      stuckPreSearchIntervalRef.current = null;
    }

    const checkStuckPreSearches = () => {
      store.getState().checkStuckPreSearches();
    };

    // Check every 5 seconds
    stuckPreSearchIntervalRef.current = setInterval(checkStuckPreSearches, 5000);

    return () => {
      if (stuckPreSearchIntervalRef.current) {
        clearInterval(stuckPreSearchIntervalRef.current);
        stuckPreSearchIntervalRef.current = null;
      }
    };
  }, [store]);

  // ✅ CRITICAL FIX: Sync AI SDK hook messages to store during streaming
  // The hook's internal messages get updated during streaming, but the store's messages don't
  // This causes the overview screen to show only the user message while streaming
  // because it reads from store.messages, not from the hook's messages
  // We sync the hook's messages to the store so components can display them during streaming
  // ✅ MEMORY LEAK FIX: Use lightweight comparison to prevent excessive re-renders
  const prevChatMessagesRef = useRef<UIMessage[]>([]);
  const prevMessageCountRef = useRef<number>(0);

  // ✅ SAFETY: Track last stream activity to detect stuck streams
  const lastStreamActivityRef = useRef<number>(Date.now());

  // ✅ STREAMING THROTTLE: Limit how often we sync during streaming to avoid race conditions
  // Too frequent syncs can interfere with onFinish orchestration between participants
  const lastStreamSyncRef = useRef<number>(0);
  const STREAM_SYNC_THROTTLE_MS = 100; // Sync at most every 100ms during streaming

  useEffect(() => {
    const currentStoreMessages = store.getState().messages;
    const currentStoreState = store.getState();
    const currentThreadId = currentStoreState.thread?.id || currentStoreState.createdThreadId;

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

    // 🚨 CRITICAL BUG FIX: Defense-in-depth - validate thread ID before syncing
    // If AI SDK messages have a different thread ID than current thread, skip syncing
    // This prevents stale messages from a previous thread being synced to a new thread
    // after navigation when AI SDK hook hasn't fully reset yet
    if (currentThreadId && chat.messages.length > 0) {
      // Check first assistant message for thread ID mismatch
      const firstAssistantMsg = chat.messages.find(m => m.role === MessageRoles.ASSISTANT);
      if (firstAssistantMsg?.id) {
        // ✅ BUG FIX: Skip validation for AI SDK-generated temporary IDs (e.g., "gen-...")
        // During streaming, AI SDK generates temporary IDs before backend sends proper IDs
        // These temporary IDs don't match the thread ID format but are NOT stale messages
        // Only validate IDs that look like our format: {threadId}_r{round}_p{participant}
        //
        // ✅ CRITICAL FIX: Use startsWith instead of split('_')[0]
        // Thread IDs may contain underscores (e.g., "abc_123"). The old code used split('_')[0]
        // which only got "abc", causing false mismatch and clearing all messages on round 2 submit.
        // Now we check if message ID starts with "{threadId}_r" which is the proper prefix format.
        const threadIdPrefix = `${currentThreadId}_r`;
        const hasOurFormat = firstAssistantMsg.id.includes('_r') && firstAssistantMsg.id.includes('_p');

        if (hasOurFormat) {
          // Message has our format: {threadId}_r{round}_p{participant}
          // Check if it starts with the current thread ID prefix
          if (!firstAssistantMsg.id.startsWith(threadIdPrefix) && !firstAssistantMsg.id.startsWith('optimistic-')) {
            // Thread ID mismatch - AI SDK has stale messages from previous thread
            // Clear AI SDK messages to prevent them from syncing
            chat.setMessages?.([]);
            return; // Skip sync - stale messages
          }
        }
        // If ID doesn't have our format (like "gen-..."), it's a streaming message - allow sync
      }
    }

    // 1. Count changed → new message added or removed (ALWAYS sync immediately)
    const countChanged = chat.messages.length !== prevMessageCountRef.current;

    // 2. During streaming, check if last message content changed (lightweight comparison)
    // ✅ MEMORY LEAK FIX: Replace JSON.stringify with simple ID + parts comparison
    // JSON.stringify on large message objects causes excessive GC pressure
    let contentChanged = false;
    let shouldThrottle = false;
    if (chat.isStreaming && chat.messages.length > 0) {
      const lastHookMessage = chat.messages[chat.messages.length - 1];
      if (!lastHookMessage) {
        return; // Guard against undefined
      }

      // ✅ CRITICAL FIX: Find corresponding message in store by ID, not by position
      // Due to optimistic message ordering, the "last" message in the hook and store
      // may be different messages (e.g., hook has streaming assistant, store has user).
      // Match by ID to ensure we're comparing the same message.
      const correspondingStoreMessage = currentStoreMessages.find(m => m.id === lastHookMessage.id);

      // ✅ STREAMING FIX: Compare actual text content, not just reference
      // AI SDK updates part.text with new tokens while array reference may stay same
      // Must compare actual text content to detect streaming changes
      if (lastHookMessage?.parts && correspondingStoreMessage?.parts) {
        for (let j = 0; j < lastHookMessage.parts.length; j++) {
          const hookPart = lastHookMessage.parts[j];
          const storePart = correspondingStoreMessage.parts[j];
          // Compare text content
          if (hookPart?.type === 'text' && storePart?.type === 'text') {
            if ('text' in hookPart && 'text' in storePart) {
              if (hookPart.text !== storePart.text) {
                contentChanged = true;
                break;
              }
            }
          }
          // Compare reasoning text
          if (hookPart?.type === 'reasoning' && storePart?.type === 'reasoning') {
            if ('text' in hookPart && 'text' in storePart) {
              if (hookPart.text !== storePart.text) {
                contentChanged = true;
                break;
              }
            }
          }
        }
        // Also check if parts count changed
        if (lastHookMessage.parts.length !== correspondingStoreMessage.parts.length) {
          contentChanged = true;
        }
      } else if (lastHookMessage?.parts && !correspondingStoreMessage) {
        // ✅ FIX: If the streaming message doesn't exist in store yet, that's a content change
        // This handles the case where AI SDK creates a new streaming message
        contentChanged = true;
      }

      // ✅ SAFETY: Update activity timestamp if content changed
      if (contentChanged) {
        lastStreamActivityRef.current = Date.now();
        // ✅ THROTTLE: During streaming content updates, throttle to prevent race conditions
        // Message count changes (new participants) are NOT throttled - they must sync immediately
        const now = Date.now();
        if (now - lastStreamSyncRef.current < STREAM_SYNC_THROTTLE_MS) {
          shouldThrottle = true;
        }
      }
    }

    // ✅ ORCHESTRATION FIX: Count changes (new participants) always sync immediately
    // Content changes during streaming are throttled to avoid interfering with onFinish
    const shouldSync = countChanged || (contentChanged && !shouldThrottle);

    if (shouldSync) {
      // ✅ CRITICAL FIX: Skip sync when form submission is in progress
      // handleUpdateThreadAndSend sets hasEarlyOptimisticMessage=true before PATCH,
      // then clears it in prepareForNewMessage. During this window, the AI SDK's
      // chat.messages don't include the optimistic message yet (it's only in store).
      // Syncing now would overwrite the optimistic message, causing UI freeze.
      const state = store.getState();
      if (state.hasEarlyOptimisticMessage) {
        // Submission in progress - skip sync to preserve optimistic message
        return;
      }

      // ✅ CRITICAL FIX: Filter out isParticipantTrigger messages before syncing
      // When startRound calls aiSendMessage to trigger participants, it adds a user message
      // with isParticipantTrigger: true. This is an internal trigger message, not a real
      // user message, and should NOT be synced to the store (it would create duplicates).
      // The actual user message already exists in the store from backend/initializeThread.
      const filteredMessages = chat.messages.filter((m) => {
        if (m.role !== MessageRoles.USER)
          return true;
        // ✅ TYPE-SAFE: Runtime check for participant trigger metadata
        // Avoids inline type assertion by using proper runtime type checking
        const metadata = m.metadata;
        if (metadata && typeof metadata === 'object' && 'isParticipantTrigger' in metadata) {
          return metadata.isParticipantTrigger !== true;
        }
        return true;
      });

      // ✅ RACE CONDITION FIX: Preserve optimistic messages from store during sync
      // When user submits a message, handleUpdateThreadAndSend adds an optimistic user message
      // directly to the store. The AI SDK doesn't know about this message yet.
      // We must preserve these optimistic messages until they're replaced by real messages.
      const optimisticMessagesFromStore = currentStoreMessages.filter((m) => {
        const metadata = m.metadata;
        return metadata && typeof metadata === 'object' && 'isOptimistic' in metadata && metadata.isOptimistic === true;
      });

      // Check if any optimistic message has a corresponding real message from AI SDK
      // (same round number). If so, the optimistic message should be replaced.
      const mergedMessages = [...filteredMessages];

      for (const optimisticMsg of optimisticMessagesFromStore) {
        // ✅ TYPE-SAFE: Use getRoundNumber utility instead of force cast
        const optimisticRound = getRoundNumber(optimisticMsg.metadata);

        // Check if there's a real user message for this round from AI SDK
        const hasRealMessage = filteredMessages.some((m) => {
          if (m.role !== MessageRoles.USER)
            return false;
          return getRoundNumber(m.metadata) === optimisticRound;
        });

        // If no real message exists for this round, preserve the optimistic message
        if (!hasRealMessage && optimisticRound !== null) {
          // ✅ CRITICAL FIX: Find correct position for user message
          // User messages must come BEFORE assistant messages of the SAME round
          // Previously: looked for msgRound > optimisticRound (wrong - placed user after assistants)
          // Now: for user messages, find first assistant of same round or any message of higher round
          const insertIndex = mergedMessages.findIndex((m) => {
            const msgRound = getRoundNumber(m.metadata);
            if (msgRound === null) {
              return false;
            }

            // Insert before any message from a higher round
            if (msgRound > optimisticRound) {
              return true;
            }

            // Insert before assistant messages of the SAME round
            // (user message must precede assistant responses)
            if (msgRound === optimisticRound && m.role === MessageRoles.ASSISTANT) {
              return true;
            }

            return false;
          });

          if (insertIndex === -1) {
            // No messages with higher round or same-round assistants - append at end
            // But check if it's not already there
            const alreadyExists = mergedMessages.some(m => m.id === optimisticMsg.id);
            if (!alreadyExists) {
              mergedMessages.push(optimisticMsg);
            }
          } else {
            // Insert before the found message (same-round assistant or higher-round message)
            const alreadyExists = mergedMessages.some(m => m.id === optimisticMsg.id);
            if (!alreadyExists) {
              mergedMessages.splice(insertIndex, 0, optimisticMsg);
            }
          }
        }
      }

      // =========================================================================
      // ✅ RACE CONDITION FIX: Deduplicate messages by ID (keep last occurrence)
      // =========================================================================
      // During streaming with multiple participants, race conditions can cause:
      // 1. Same message ID appearing multiple times (participant triggered twice)
      // 2. Stale versions of messages mixed with current versions
      //
      // Fix: Use Map to dedupe by ID, keeping the LAST occurrence (most complete)
      const messageDedupeMap = new Map<string, typeof mergedMessages[0]>();
      for (const msg of mergedMessages) {
        messageDedupeMap.set(msg.id, msg);
      }
      const messageDedupedArray = Array.from(messageDedupeMap.values());

      // =========================================================================
      // ✅ DUPLICATE PARTS FIX: Deduplicate message parts after stream resume
      // =========================================================================
      // When AI SDK resumes a stream, there's a race condition:
      // 1. Hydration sets messages from initialMessages (parts without 'state')
      // 2. Resume receives buffered chunks (parts with 'state: done')
      // 3. AI SDK appends resumed parts to hydrated message → duplicates
      //
      // Fix: Deduplicate parts within each message, keeping the most complete version
      const deduplicatedMessages = messageDedupedArray.map((msg) => {
        if (msg.role !== MessageRoles.ASSISTANT || !msg.parts || msg.parts.length <= 1) {
          return msg;
        }

        // Deduplicate parts by type + content
        const seenParts = new Map<string, typeof msg.parts[0]>();

        for (const part of msg.parts) {
          // Create a key based on type and content
          let key: string;
          if (part.type === 'text' && 'text' in part) {
            key = `text:${part.text}`;
          } else if (part.type === 'reasoning' && 'text' in part) {
            key = `reasoning:${part.text}`;
          } else if (part.type === 'step-start') {
            key = 'step-start';
          } else {
            // For other types, keep all (don't deduplicate)
            key = `other:${Math.random()}`;
          }

          const existing = seenParts.get(key);
          if (!existing) {
            seenParts.set(key, part);
          } else {
            // Prefer the part with 'state: done' (more complete from resume)
            const existingHasState = 'state' in existing && existing.state === 'done';
            const currentHasState = 'state' in part && part.state === 'done';

            if (currentHasState && !existingHasState) {
              seenParts.set(key, part);
            }
            // Otherwise keep existing (first occurrence)
          }
        }

        const uniqueParts = Array.from(seenParts.values());

        // Only create new object if parts actually changed
        if (uniqueParts.length === msg.parts.length) {
          return msg;
        }

        return { ...msg, parts: uniqueParts };
      });

      // ✅ INFINITE LOOP FIX: Only sync if messages actually changed
      // CRITICAL: structuredClone creates NEW object references, so we CANNOT compare by reference
      // Instead, compare by message ID and parts content (for streaming updates)
      // This prevents infinite loops where cloned objects never === original objects
      const isSameMessages = deduplicatedMessages.length === currentStoreMessages.length
        && deduplicatedMessages.every((m, i) => {
          const storeMsg = currentStoreMessages[i];
          // Compare by ID (stable identifier)
          if (m.id !== storeMsg?.id)
            return false;
          // Compare parts count
          if (m.parts?.length !== storeMsg?.parts?.length)
            return false;
          // ✅ STREAMING FIX: Compare text/reasoning content ONLY for LAST message DURING STREAMING
          // During streaming, only the last message is actively receiving tokens
          // Comparing all messages or when not streaming would be wasteful
          // Note: Reasoning streams first, then text - both can be actively streaming
          const isLastMessage = i === deduplicatedMessages.length - 1;
          const shouldCompareContent = isLastMessage && chat.isStreaming;
          if (shouldCompareContent && m.parts && m.parts.length > 0 && storeMsg?.parts && storeMsg.parts.length > 0) {
            for (let j = 0; j < m.parts.length; j++) {
              const hookPart = m.parts[j];
              const storePart = storeMsg.parts[j];
              // Compare text content
              if (hookPart?.type === 'text' && storePart?.type === 'text') {
                if ('text' in hookPart && 'text' in storePart) {
                  if (hookPart.text !== storePart.text) {
                    return false;
                  }
                }
              }
              // Compare reasoning text
              if (hookPart?.type === 'reasoning' && storePart?.type === 'reasoning') {
                if ('text' in hookPart && 'text' in storePart) {
                  if (hookPart.text !== storePart.text) {
                    return false;
                  }
                }
              }
            }
          }
          return true;
        });

      if (!isSameMessages) {
        prevMessageCountRef.current = chat.messages.length;
        prevChatMessagesRef.current = chat.messages;
        // ✅ CRITICAL FIX: Deep clone messages before passing to Zustand store
        // Immer middleware freezes all objects passed to the store (Object.freeze)
        // But AI SDK still holds references to the SAME message objects
        // When AI SDK tries to push parts during streaming, it fails because arrays are frozen
        // Error: "Cannot add property 0, object is not extensible"
        // structuredClone creates independent copies that Immer can safely freeze
        store.getState().setMessages(structuredClone(deduplicatedMessages));

        // Update activity on any sync
        lastStreamActivityRef.current = Date.now();
        // ✅ THROTTLE: Update last sync time to enforce throttle interval
        lastStreamSyncRef.current = Date.now();
      } else {
        // Still update the ref to prevent re-checking
        prevMessageCountRef.current = chat.messages.length;
        prevChatMessagesRef.current = chat.messages;
      }
    }
  }, [chat, store]); // ✅ INFINITE LOOP FIX: chat is now memoized in useMultiParticipantChat

  // ✅ SAFETY MECHANISM: Auto-stop stuck streams
  // Prevents system from getting stuck in isStreaming=true state if backend hangs
  // ✅ DYNAMIC TIMEOUT: Adjusts based on web search complexity
  useEffect(() => {
    if (!chatIsStreaming)
      return;

    // Reset activity timer when streaming starts
    lastStreamActivityRef.current = Date.now();

    // ✅ DYNAMIC TIMEOUT: Calculate based on pre-search configuration
    // If web search is enabled with complex queries, allow more time for processing
    const currentState = store.getState();
    const webSearchEnabled = currentState.thread?.enableWebSearch ?? currentState.enableWebSearch;

    let streamTimeoutMs = 60_000; // Default 60 seconds for non-web-search

    if (webSearchEnabled && currentState.messages.length > 0) {
      const currentRound = getCurrentRoundNumber(currentState.messages);
      // ✅ DEFENSIVE GUARD: Ensure preSearches is an array before calling .find()
      const preSearchForRound = Array.isArray(currentState.preSearches)
        ? currentState.preSearches.find(ps => ps.roundNumber === currentRound)
        : undefined;

      // If pre-search has data, increase timeout based on content complexity
      // More results = more content for AI to process = longer gaps between updates
      const preSearchTimeout = getPreSearchTimeout(preSearchForRound);
      // Stream timeout should be at least the pre-search timeout, plus extra buffer
      streamTimeoutMs = Math.max(60_000, Math.min(preSearchTimeout + 30_000, TIMEOUT_CONFIG.MAX_MS));
    }

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastStreamActivityRef.current;

      if (elapsed > streamTimeoutMs) {
        console.error('[ChatStoreProvider] Stream stuck detected - force stopping', {
          elapsed,
          timeout: streamTimeoutMs,
          webSearchEnabled,
        });

        // ✅ FULL RESET: Clear all streaming-related state
        const latestState = store.getState();
        latestState.setWaitingToStartStreaming(false);
        latestState.setIsStreaming(false);
        latestState.setIsCreatingThread(false);

        // Force stop streaming using store action
        // Note: chat.stop was removed for resumable streams compatibility
        latestState.checkStuckStreams();

        // ✅ COMPLETE RESET: Reset entire store to overview state
        latestState.resetToOverview();

        // ✅ NAVIGATE: Push back to /chat to ensure URL matches state
        router.push('/chat');

        showApiErrorToast('Stream timed out', new Error('The connection timed out. Please try again.'));

        // Clear the interval since we've reset
        clearInterval(checkInterval);
      }
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [chatIsStreaming, store, router]);

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

    // ✅ FIX: Invalidate pre-searches query to sync newly created PENDING records
    // When web search is enabled and user sends a message, backend creates a PENDING pre-search
    // But the orchestrator won't know about it unless we invalidate the query
    // This ensures pre-searches are refetched and synced to store for ALL rounds, not just round 0
    const currentThread = storeRef.current?.getState().thread;
    const threadId = currentThread?.id || storeRef.current?.getState().createdThreadId;
    const webSearchEnabled = currentThread?.enableWebSearch ?? storeRef.current?.getState().enableWebSearch;

    if (webSearchEnabled && threadId) {
      queryClientRef.current.invalidateQueries({
        queryKey: queryKeys.threads.preSearches(threadId),
      });
    }

    return sendMessageRef.current(content);
  }, []); // Empty deps = stable reference

  const startRoundWithQuotaInvalidation = useCallback(async () => {
    // Use queryClientRef to avoid dependency on queryClient
    queryClientRef.current.invalidateQueries({ queryKey: queryKeys.usage.stats() });

    // ✅ FIX: Invalidate pre-searches query to sync newly created PENDING records
    // When web search is enabled and startRound is called, backend creates a PENDING pre-search
    // This ensures pre-searches are refetched and synced to store for ALL rounds
    const currentThread = storeRef.current?.getState().thread;
    const threadId = currentThread?.id || storeRef.current?.getState().createdThreadId;
    const webSearchEnabled = currentThread?.enableWebSearch ?? storeRef.current?.getState().enableWebSearch;

    if (webSearchEnabled && threadId) {
      queryClientRef.current.invalidateQueries({
        queryKey: queryKeys.threads.preSearches(threadId),
      });
    }

    return startRoundRef.current();
  }, []) as () => Promise<void>; // Empty deps = stable reference

  // Sync callbacks to store ONCE on mount only
  // Callbacks have empty deps so they're stable - no need to sync on every change
  useEffect(() => {
    storeRef.current?.setState({
      sendMessage: sendMessageWithQuotaInvalidation,
      startRound: startRoundWithQuotaInvalidation,
      // ✅ RESUMABLE STREAMS: stop removed - incompatible with stream resumption
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
  // ✅ NOTE: Using state values from top-level useStore hooks (lines 86-92)

  useEffect(() => {
    // ✅ CRITICAL FIX: Use subscribed state from top-level useStore hooks
    // This ensures effect re-runs when state changes

    // Guard: Only send on overview/thread screens (not public)
    if (screenMode === ScreenModes.PUBLIC) {
      return;
    }

    // Check if we should send pending message
    if (!pendingMessage || !expectedParticipantIds || hasSentPendingMessage || isStreaming) {
      return;
    }

    // ✅ RACE CONDITION FIX: Check hook's streaming ref as synchronous guard
    // Store's isStreaming may lag behind hook's actual streaming state
    // This prevents duplicate triggers when startRound has already initiated streaming
    if (chat.isStreamingRef.current) {
      return;
    }

    // ✅ RACE CONDITION FIX: Check if a trigger is already in progress
    // isTriggeringRef is set synchronously at the start of startRound/sendMessage
    // This prevents pendingMessage effect from racing with the startRound effect
    if (chat.isTriggeringRef.current) {
      return;
    }

    // ✅ ROUND 0 GUARD: Skip when waitingToStartStreaming is true on overview (round 0 only)
    // handleCreateThread sets waitingToStartStreaming for round 0 - streaming trigger effect handles it
    // This effect handles ALL subsequent rounds (1+) via handleUpdateThreadAndSend on BOTH screens
    if (waitingToStart && screenMode === ScreenModes.OVERVIEW) {
      return; // streaming trigger effect handles round 0
    }

    // ✅ CRITICAL FIX: Guard against sendMessage being undefined
    // Check the ref directly to ensure AI SDK hook has initialized
    if (!sendMessageRef.current) {
      return; // Wait for sendMessage to be available
    }

    // Compare participant model IDs
    const currentModelIds = participants
      .filter(p => p.isEnabled)
      .map(p => p.modelId)
      .sort()
      .join(',');
    // ✅ FIX: Copy array before sorting to avoid mutating store state
    // .sort() mutates in place, which was destroying priority order in expectedParticipantIds
    const expectedModelIds = [...expectedParticipantIds].sort().join(',');

    if (currentModelIds !== expectedModelIds) {
      return;
    }

    // Check changelog wait state
    // ✅ UNIFIED FLOW: useThreadActions runs in ChatView (both screens) and clears this flag
    // when changelog query completes. Skip this effect while waiting for changelog to sync.
    // For round 0 on overview (initial thread creation), skip this check since there's no
    // prior changelog to wait for.
    const isInitialThreadCreation = screenMode === ScreenModes.OVERVIEW && waitingToStart;
    if (isWaitingForChangelog && !isInitialThreadCreation) {
      return;
    }

    // ✅ BUG FIX: Use getCurrentRoundNumber instead of calculateNextRoundNumber
    // After prepareForNewMessage adds an optimistic user message, the current round
    // is determined by that message's roundNumber in metadata.
    const newRoundNumber = getCurrentRoundNumber(messages);

    // ============================================================================
    // ✅ CRITICAL FIX: Create pre-search BEFORE participant streaming (SAME AS FIRST EFFECT)
    // ============================================================================
    // ✅ FIX: Use form state as sole source of truth for web search enabled
    const webSearchEnabled = enableWebSearch;
    // ✅ DEFENSIVE GUARD: Ensure preSearches is an array before calling .find()
    const preSearchForRound = Array.isArray(preSearches)
      ? preSearches.find(ps => ps.roundNumber === newRoundNumber)
      : undefined;

    // ✅ STEP 1: Create pre-search if web search enabled and doesn't exist
    if (webSearchEnabled && !preSearchForRound) {
      // ✅ RACE CONDITION FIX: Check ref FIRST as synchronous lock
      // This prevents duplicate triggers within the same effect re-render cycle
      const alreadyAttempted = preSearchCreationAttemptedRef.current.has(newRoundNumber);
      if (!alreadyAttempted) {
        // Add to ref IMMEDIATELY as synchronous lock before any other checks
        preSearchCreationAttemptedRef.current.add(newRoundNumber);
      }

      const currentState = store.getState();
      if (currentState.hasPreSearchBeenTriggered(newRoundNumber)) {
        return; // Already triggered - wait for it to complete
      }

      // ✅ FIX: If we've already attempted and it failed (not triggered in store), fall through
      if (alreadyAttempted) {
        // Already attempted and failed - fall through to send message without pre-search
        // Silently continue without pre-search
      } else {
        // Mark as triggered BEFORE async operation to prevent race conditions
        currentState.markPreSearchTriggered(newRoundNumber);

        // Create PENDING pre-search record AND immediately execute it
        // ✅ CRITICAL FIX: Execute pre-search here instead of waiting for PreSearchStream component
        // PreSearchStream only renders after user message exists, but message waits for pre-search
        // This breaks the circular dependency: create → execute → complete → send message
        const effectiveThreadId = thread?.id || '';
        queueMicrotask(async () => {
          // ✅ FILE CONTEXT: Extract text from uploaded files for search query generation
          const attachments = store.getState().getAttachments();
          const fileContext = await extractFileContextForSearch(attachments);

          // ✅ IMAGE ANALYSIS: Get attachment IDs for server-side image analysis
          // The backend will analyze images with a vision model to generate relevant search queries
          const attachmentIds = store.getState().pendingAttachmentIds || undefined;

          createPreSearch.mutateAsync({
            param: {
              threadId: effectiveThreadId,
              roundNumber: newRoundNumber.toString(),
            },
            json: {
              userQuery: pendingMessage,
              fileContext: fileContext || undefined,
              attachmentIds,
            },
          }).then((createResponse) => {
            // ✅ CRITICAL FIX: Add pre-search to store immediately after creation
            // Without this, updatePreSearchStatus operates on empty array and UI never updates
            if (createResponse && createResponse.data) {
              const preSearchWithDates = transformPreSearch(createResponse.data);
              // ✅ RACE CONDITION FIX: Set status to STREAMING to prevent PreSearchStream from also executing
              // PreSearchStream only triggers for PENDING status, so STREAMING status prevents duplicate execution
              // Without this, both provider and PreSearchStream race to execute, causing malformed JSON errors
              store.getState().addPreSearch({
                ...preSearchWithDates,
                status: AnalysisStatuses.STREAMING,
              });
            }

            // ✅ TYPE-SAFE: Use service instead of direct fetch
            return executePreSearchStreamService({
              param: {
                threadId: effectiveThreadId,
                roundNumber: String(newRoundNumber),
              },
              json: {
                userQuery: pendingMessage,
                fileContext: fileContext || undefined,
                attachmentIds,
              },
            });
          }).then(async (response) => {
            if (!response.ok && response.status !== 409) {
              // 409 = already executing, which is fine
              console.error('[ChatStoreProvider] Pre-search execution failed:', response.status);
            }
            // ✅ BUG FIX: Parse SSE events and extract searchData
            // ✅ ACTIVITY TRACKING: Update activity on each SSE chunk for dynamic timeout
            const searchData = await readPreSearchStreamData(response, () => {
              store.getState().updatePreSearchActivity(newRoundNumber);
            });

            // ✅ CRITICAL FIX: Update store with searchData AND status
            if (searchData) {
              store.getState().updatePreSearchData(newRoundNumber, searchData);
            } else {
              store.getState().updatePreSearchStatus(newRoundNumber, AnalysisStatuses.COMPLETE);
            }

            // Clear activity tracking after completion
            store.getState().clearPreSearchActivity(newRoundNumber);

            // Also invalidate query for orchestrator sync when enabled
            queryClientRef.current.invalidateQueries({
              queryKey: queryKeys.threads.preSearches(effectiveThreadId),
            });
          }).catch((error) => {
            console.error('[ChatStoreProvider] Failed to create/execute pre-search:', error);
            // Clear activity tracking on failure
            store.getState().clearPreSearchActivity(newRoundNumber);
            // Clear the trigger tracking on failure so retry is possible
            store.getState().clearPreSearchTracking(newRoundNumber);
          });
        });
        return; // Wait for pre-search to complete (direct store update will trigger effect re-run)
      }
      // If already attempted and failed, fall through to send message without pre-search
    }

    // ✅ STEP 2: Handle pre-search execution state
    if (webSearchEnabled && preSearchForRound) {
      // If pre-search is STREAMING, wait for it to complete
      if (preSearchForRound.status === AnalysisStatuses.STREAMING) {
        return; // Don't send message yet - wait for pre-search to complete
      }

      // ✅ CRITICAL FIX: If pre-search is stuck in PENDING, trigger execution
      // This handles the case where pre-search was created but never executed
      if (preSearchForRound.status === AnalysisStatuses.PENDING) {
        // ✅ RACE CONDITION FIX: Check ref FIRST as synchronous lock
        if (preSearchCreationAttemptedRef.current.has(newRoundNumber)) {
          return; // Already attempted - wait for it to complete
        }
        preSearchCreationAttemptedRef.current.add(newRoundNumber);

        const currentState = store.getState();
        if (currentState.hasPreSearchBeenTriggered(newRoundNumber)) {
          return; // Already triggered - wait for it to complete
        }

        // Mark as triggered BEFORE async operation
        currentState.markPreSearchTriggered(newRoundNumber);

        const effectiveThreadId = thread?.id || '';

        // ✅ BUG FIX: Check if this is a client-side placeholder that needs DB record creation
        // Placeholders are created by form-actions.ts for immediate UI feedback but don't exist in DB
        // Without this check, executePreSearch returns NOT_FOUND error
        const isPlaceholder = preSearchForRound.id.startsWith('placeholder-');

        queueMicrotask(async () => {
          // ✅ FILE CONTEXT: Extract text from uploaded files for search query generation
          const attachments = store.getState().getAttachments();
          const fileContext = await extractFileContextForSearch(attachments);

          // ✅ IMAGE ANALYSIS: Get attachment IDs for server-side image analysis
          // The backend will analyze images with a vision model to generate relevant search queries
          const attachmentIds = store.getState().pendingAttachmentIds || undefined;

          // ✅ TYPE-SAFE: Use service instead of direct fetch
          const executePreSearch = () => executePreSearchStreamService({
            param: {
              threadId: effectiveThreadId,
              roundNumber: String(newRoundNumber),
            },
            json: {
              userQuery: pendingMessage,
              fileContext: fileContext || undefined,
              attachmentIds,
            },
          });

          const handleResponse = async (response: Response) => {
            // ✅ BUG FIX: Don't update status to COMPLETE on error responses
            // Previously, even 404 errors would fall through and set status to COMPLETE
            if (!response.ok && response.status !== 409) {
              console.error('[ChatStoreProvider] Pre-search execution failed:', response.status);
              // Mark as FAILED, not COMPLETE, so UI shows error state
              store.getState().updatePreSearchStatus(newRoundNumber, AnalysisStatuses.FAILED);
              store.getState().clearPreSearchActivity(newRoundNumber);
              return;
            }

            // ✅ BUG FIX: Parse SSE events and extract searchData
            // ✅ ACTIVITY TRACKING: Update activity on each SSE chunk for dynamic timeout
            const searchData = await readPreSearchStreamData(response, () => {
              store.getState().updatePreSearchActivity(newRoundNumber);
            });

            // ✅ CRITICAL FIX: Update store with searchData AND status
            if (searchData) {
              store.getState().updatePreSearchData(newRoundNumber, searchData);
            } else {
              store.getState().updatePreSearchStatus(newRoundNumber, AnalysisStatuses.COMPLETE);
            }

            // Clear activity tracking after completion
            store.getState().clearPreSearchActivity(newRoundNumber);

            // Also invalidate query for orchestrator sync when enabled
            queryClientRef.current.invalidateQueries({
              queryKey: queryKeys.threads.preSearches(effectiveThreadId),
            });
          };

          if (isPlaceholder) {
            // Placeholder needs DB record created first
            createPreSearch.mutateAsync({
              param: {
                threadId: effectiveThreadId,
                roundNumber: newRoundNumber.toString(),
              },
              json: {
                userQuery: pendingMessage,
                fileContext: fileContext || undefined,
                attachmentIds,
              },
            }).then((createResponse) => {
              // Update store with real pre-search data (replace placeholder)
              if (createResponse && createResponse.data) {
                const preSearchWithDates = transformPreSearch(createResponse.data);
                store.getState().addPreSearch({
                  ...preSearchWithDates,
                  status: AnalysisStatuses.STREAMING,
                });
              }
              return executePreSearch();
            }).then(handleResponse).catch((error) => {
              console.error('[ChatStoreProvider] Failed to create/execute placeholder pre-search:', error);
              store.getState().clearPreSearchActivity(newRoundNumber);
              store.getState().clearPreSearchTracking(newRoundNumber);
            });
          } else {
            // DB record already exists, just execute
            executePreSearch().then(handleResponse).catch((error) => {
              console.error('[ChatStoreProvider] Failed to execute stuck pre-search:', error);
              store.getState().clearPreSearchActivity(newRoundNumber);
              store.getState().clearPreSearchTracking(newRoundNumber);
            });
          }
        });
        return; // Wait for pre-search to complete
      }
    }

    // ✅ CRITICAL FIX: Set flags and send message atomically
    // Set hasSentPendingMessage BEFORE calling sendMessage to prevent duplicate sends
    // If sendMessage fails, we'll catch the error and reset the flag
    const { setHasSentPendingMessage, setStreamingRoundNumber, setHasPendingConfigChanges } = store.getState();

    setHasSentPendingMessage(true);
    setStreamingRoundNumber(newRoundNumber);
    setHasPendingConfigChanges(false);

    // Send message in next tick (prevents blocking)
    queueMicrotask(() => {
      // ✅ RACE CONDITION FIX: Check streaming ref before calling sendMessage
      // The store's isStreaming might be stale, but the hook's ref is always current
      // This prevents duplicate sends when startRound and pendingMessage effects race
      if (chat.isStreamingRef.current) {
        // Reset flag since we didn't actually send
        store.getState().setHasSentPendingMessage(false);
        return;
      }

      // Call sendMessage and handle potential errors
      // NOTE: We do NOT reset hasSentPendingMessage on error to prevent infinite retry loops
      // The flag is only reset when user submits a new message via prepareForNewMessage
      try {
        // ✅ CRITICAL FIX: Use sendMessageRef.current instead of store's sendMessage
        // The store's sendMessage is never set (setSendMessage is never called)
        const result = sendMessageRef.current?.(pendingMessage);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chat.isStreamingRef is a ref and doesn't need to be in dependencies
  }, [
    // ✅ CRITICAL FIX: Include all subscribed state in dependencies
    // This ensures effect re-runs when any of these values change
    store,
    pendingMessage,
    expectedParticipantIds,
    hasSentPendingMessage,
    isStreaming,
    isWaitingForChangelog,
    screenMode,
    participants, // ← Fixed from storeParticipantsForSend
    preSearches, // ← KEY FIX: Effect re-runs when pre-searches change!
    messages,
    thread,
    enableWebSearch,
    createPreSearch,
    sendMessageRef,
  ]);

  // ✅ CLEANUP: Comprehensive navigation cleanup
  // Stops streaming, clears pending operations, and resets state when appropriate
  useEffect(() => {
    const prevPath = prevPathnameRef.current;

    // Handle initial mount - ensure clean state for /chat
    if (prevPath === null) {
      prevPathnameRef.current = pathname;
      // ✅ CRITICAL FIX: On initial mount at /chat, ensure refs are cleared
      // This handles direct navigation to /chat (e.g., page refresh, bookmark)
      if (pathname === '/chat') {
        preSearchCreationAttemptedRef.current = new Set();
      }
      return;
    }

    // Only cleanup if pathname actually changed (navigation between different pages)
    if (prevPath === pathname) {
      return;
    }

    const currentState = storeRef.current?.getState();
    if (!currentState) {
      prevPathnameRef.current = pathname;
      return;
    }

    // ✅ CRITICAL FIX: Detect specific navigation patterns
    const isLeavingThread = prevPath?.startsWith('/chat/') && prevPath !== '/chat';
    const isGoingToOverview = pathname === '/chat';
    const isNavigatingBetweenThreads = prevPath?.startsWith('/chat/') && pathname?.startsWith('/chat/') && prevPath !== pathname;
    // ✅ NEW: Detect navigation from overview to thread (when clicking pre-built conversation)
    const isGoingToThread = pathname?.startsWith('/chat/') && pathname !== '/chat';
    const isFromOverviewToThread = prevPath === '/chat' && isGoingToThread;
    // ✅ NEW: Detect navigation from non-chat pages to /chat (e.g., /dashboard → /chat)
    const isComingFromNonChatPage = prevPath && !prevPath.startsWith('/chat') && isGoingToOverview;

    // ✅ RESUMABLE STREAMS: Do NOT stop ongoing streams on navigation
    // Streams continue in background via waitUntil() regardless of navigation
    // The AI SDK v6 resumable streams pattern is incompatible with abort
    // NOTE: currentState.stop?.() was removed - streams should always complete

    // ✅ FIX 2: Clear waitingToStartStreaming to prevent deferred streaming from triggering
    if (currentState.waitingToStartStreaming) {
      currentState.setWaitingToStartStreaming(false);
    }

    // ✅ FIX 3: Clear provider-level refs when navigating to /chat
    // NOTE: Do NOT call resetToOverview() here - it causes a race condition!
    // ChatOverviewScreen's useLayoutEffect calls resetToOverview() and resets initStateRef,
    // then its useEffect re-initializes from cookies. If we call resetToOverview() here
    // (in regular useEffect which runs AFTER layoutEffect), we wipe out the initialized state.
    // The overview screen handles its own reset - we just need to clear provider-level refs.
    if (isGoingToOverview && (isLeavingThread || isComingFromNonChatPage)) {
      // ✅ CRITICAL FIX: Clear provider-level refs that aren't part of store state
      // These refs accumulate across navigations and can cause bugs
      preSearchCreationAttemptedRef.current = new Set();
    }

    // ✅ FIX 4: CRITICAL - Full reset when navigating between different threads
    // Previously used resetThreadState() which only cleared flags, NOT messages/participants
    // This caused stale messages from previous thread to leak into new thread
    // Now using resetForThreadNavigation() which clears ALL thread data including:
    // - messages, thread, participants (prevents participant ID mismatch)
    // - analyses, preSearches (prevents old content from showing)
    // - AI SDK hook's internal messages (prevents sync effect from restoring old messages)
    if (isNavigatingBetweenThreads) {
      currentState.resetForThreadNavigation();
      // ✅ CRITICAL FIX: Clear provider-level refs for thread-to-thread navigation
      preSearchCreationAttemptedRef.current = new Set();
    }

    // ✅ FIX 5: Also reset when navigating from overview to a DIFFERENT thread
    // This handles the case where user clicks a pre-built conversation or
    // navigates directly to a thread URL from the overview screen
    // Ensures clean state even if there was previous thread data in store
    //
    // ✅ CRITICAL FIX: Do NOT reset when navigating to the SAME thread we just created
    // After first round completion on overview, we navigate to /chat/{slug}
    // If the slug matches the current thread, this is normal flow - preserve state
    // The analysis and messages should continue on the thread screen without reset
    if (isFromOverviewToThread && (currentState.thread || currentState.messages.length > 0)) {
      // Extract slug from pathname (e.g., /chat/my-thread-slug -> my-thread-slug)
      const targetSlug = pathname?.replace('/chat/', '');
      const currentSlug = currentState.thread?.slug;

      // Only reset if navigating to a DIFFERENT thread, not the one we just created
      const isNavigatingToSameThread = targetSlug && currentSlug && targetSlug === currentSlug;
      if (!isNavigatingToSameThread) {
        currentState.resetForThreadNavigation();
      }
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

/**
 * Get the store API for imperative access (getState)
 *
 * ✅ REACT BEST PRACTICE: Use this for reading current state inside callbacks/effects
 * without causing re-renders or infinite loops from dependency arrays.
 *
 * @example
 * const storeApi = useChatStoreApi();
 * useEffect(() => {
 *   // Read current state imperatively - no dependency needed
 *   const { messages, participants } = storeApi.getState();
 * }, [storeApi]); // storeApi is stable
 */
// eslint-disable-next-line react-refresh/only-export-components -- Store API hook export
export function useChatStoreApi(): ChatStoreApi {
  const context = use(ChatStoreContext);

  if (!context) {
    throw new Error('useChatStoreApi must be used within ChatStoreProvider');
  }

  return context;
}

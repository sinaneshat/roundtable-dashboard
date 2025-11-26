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
import type { z } from 'zod';
import { useStore } from 'zustand';

import { AnalysisStatuses, MessagePartTypes, MessageRoles, PreSearchSseEvents, ScreenModes } from '@/api/core/enums';
import { PreSearchDataPayloadSchema } from '@/api/routes/chat/schema';
import { useCreatePreSearchMutation } from '@/hooks/mutations';
import { useMultiParticipantChat } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { showApiErrorToast } from '@/lib/toast';
import { transformPreSearch } from '@/lib/utils/date-transforms';
import { calculateNextRoundNumber, getCurrentRoundNumber } from '@/lib/utils/round-utils';
import { getPreSearchTimeout, isPreSearchTimedOut, TIMEOUT_CONFIG } from '@/lib/utils/web-search-utils';
import type { ChatStore, ChatStoreApi } from '@/stores/chat';
import { AnimationIndices, createChatStore } from '@/stores/chat';

// ============================================================================
// CONTEXT (Official Pattern)
// ============================================================================

// eslint-disable-next-line react-refresh/only-export-components -- Context export required for provider pattern
export const ChatStoreContext = createContext<ChatStoreApi | undefined>(undefined);

/** Type inferred from schema - single source of truth */
type PreSearchDataPayload = z.infer<typeof PreSearchDataPayloadSchema>;

/**
 * Safely parse and validate pre-search data using Zod schema
 * Returns validated data or null if invalid
 */
function parsePreSearchData(jsonString: string): PreSearchDataPayload | null {
  try {
    const parsed: unknown = JSON.parse(jsonString);
    const result = PreSearchDataPayloadSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Helper function to read and parse SSE stream for pre-search
 * Extracts searchData from the stream events and returns it
 *
 * ✅ BUG FIX: Previously provider read stream bytes without parsing
 * This caused searchData to be undefined when status was set to COMPLETE
 * Now we parse SSE events and return the final searchData from DONE event
 * ✅ Uses Zod schema validation instead of type assertions
 */
async function readPreSearchStreamAndExtractData(
  response: Response,
): Promise<PreSearchDataPayload | null> {
  const reader = response.body?.getReader();
  if (!reader)
    return null;

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  let currentData = '';
  let searchData: PreSearchDataPayload | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          currentData = line.slice(5).trim();
        } else if (line === '' && currentEvent && currentData) {
          // Process complete event - only care about DONE event for final data
          if (currentEvent === PreSearchSseEvents.DONE) {
            searchData = parsePreSearchData(currentData);
          }
          // Reset for next event
          currentEvent = '';
          currentData = '';
        }
      }
    }

    // Process any remaining buffered event
    if (currentEvent === PreSearchSseEvents.DONE && currentData) {
      searchData = parsePreSearchData(currentData);
    }
  } catch {
    // Stream error, return what we have
  }

  return searchData;
}

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

  // ✅ CRITICAL FIX: Subscribe to state needed by pending message sender effect
  // These subscriptions ensure effect re-runs when state changes
  const pendingMessage = useStore(store, s => s.pendingMessage);
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
    // ✅ CRITICAL FIX: Now uses subscribed state from useStore hooks above
    // This ensures effect re-runs when state changes (like pre-search status)

    // Guard: Only send on overview/thread screens (not public)
    if (screenMode === ScreenModes.PUBLIC) {
      return;
    }

    // Check if we should send pending message
    if (!pendingMessage || !expectedParticipantIds || hasSentPendingMessage || isStreaming) {
      return;
    }

    // Compare participant model IDs
    const currentModelIds = participants
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
    const newRoundNumber = calculateNextRoundNumber(messages);

    // ============================================================================
    // ✅ CRITICAL FIX: Create pre-search BEFORE participant streaming
    // ============================================================================
    // This fixes the web search ordering bug where participants speak before search executes
    //
    // OLD FLOW (Broken):
    //   User message → sendMessage() → Participant streaming → Pre-search created during streaming
    //
    // NEW FLOW (Fixed):
    //   User message → Create PENDING pre-search → Execute search → COMPLETE → sendMessage()
    //
    // STEPS:
    // 1. Check if web search enabled
    // 2. If pre-search doesn't exist, create it (this effect will re-run after creation)
    // 3. Wait for pre-search to complete (PENDING → STREAMING → COMPLETE)
    // 4. Only when COMPLETE, proceed with sendMessage()
    //
    // REFERENCE: WEB_SEARCH_ORDERING_FIX_STRATEGY.md
    // ✅ FIX: Use form state as sole source of truth for web search enabled
    // Form state is synced with thread on load, then user can toggle
    const webSearchEnabled = enableWebSearch;
    const preSearchForRound = preSearches.find(ps => ps.roundNumber === newRoundNumber);

    // ✅ STEP 1: Create pre-search if web search enabled and doesn't exist
    if (webSearchEnabled && !preSearchForRound) {
      // ✅ RACE CONDITION FIX: Check if pre-search already triggered for this round
      // This prevents duplicate triggers from both handleComplete and pendingMessage effects
      const currentState = store.getState();
      if (currentState.hasPreSearchBeenTriggered(newRoundNumber)) {
        return; // Already triggered by another effect - wait for it to complete
      }

      // Mark as triggered BEFORE async operation to prevent race conditions
      currentState.markPreSearchTriggered(newRoundNumber);

      // Create PENDING pre-search record AND immediately execute it
      // ✅ CRITICAL FIX: Execute pre-search here instead of waiting for PreSearchStream component
      // PreSearchStream only renders after user message exists, but message waits for pre-search
      // This breaks the circular dependency: create → execute → complete → send message
      const effectiveThreadId = thread?.id || '';
      queueMicrotask(() => {
        createPreSearch.mutateAsync({
          param: {
            threadId: effectiveThreadId,
            roundNumber: newRoundNumber.toString(),
          },
          json: {
            userQuery: pendingMessage,
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

          // ✅ IMMEDIATELY EXECUTE: Trigger pre-search execution after creation
          // This replaces the PreSearchStream component's POST request
          return fetch(
            `/api/v1/chat/threads/${effectiveThreadId}/rounds/${newRoundNumber}/pre-search`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
              },
              body: JSON.stringify({ userQuery: pendingMessage }),
            },
          );
        }).then(async (response) => {
          if (!response.ok && response.status !== 409) {
            // 409 = already executing, which is fine
            console.error('[ChatStoreProvider] Pre-search execution failed:', response.status);
          }
          // ✅ BUG FIX: Parse SSE events and extract searchData
          // Previously we just read bytes without parsing, leaving searchData undefined
          // Now we parse the DONE event to get the final searchData
          const searchData = await readPreSearchStreamAndExtractData(response);

          // ✅ CRITICAL FIX: Update store with searchData AND status
          // Use updatePreSearchData which sets both searchData and status to COMPLETE
          if (searchData) {
            store.getState().updatePreSearchData(newRoundNumber, searchData);
          } else {
            // Fallback: just update status if no searchData extracted
            store.getState().updatePreSearchStatus(newRoundNumber, AnalysisStatuses.COMPLETE);
          }

          // Also invalidate query for orchestrator sync when enabled
          queryClientRef.current.invalidateQueries({
            queryKey: queryKeys.threads.preSearches(effectiveThreadId),
          });
        }).catch((error) => {
          console.error('[ChatStoreProvider] Failed to create/execute pre-search:', error);
          // Clear the trigger tracking on failure so retry is possible
          store.getState().clearPreSearchTracking(newRoundNumber);
          // If pre-search creation fails, continue with message anyway (degraded UX)
          // This prevents total failure - participants will stream without search context
        });
      });

      return; // Wait for pre-search to complete (direct store update will trigger effect re-run)
    }

    // ✅ STEP 2: Handle pre-search execution state
    if (webSearchEnabled && preSearchForRound) {
      // If pre-search is STREAMING, wait for it to complete
      if (preSearchForRound.status === AnalysisStatuses.STREAMING) {
        return; // Don't send message yet - wait for pre-search to complete
      }

      // ✅ CRITICAL FIX: If pre-search is stuck in PENDING, trigger execution
      // This handles the case where pre-search was created but never executed
      // (e.g., due to component unmount, page refresh, or the circular dependency bug)
      if (preSearchForRound.status === AnalysisStatuses.PENDING) {
        // ✅ RACE CONDITION FIX: Check if pre-search already triggered for this round
        const currentState = store.getState();
        if (currentState.hasPreSearchBeenTriggered(newRoundNumber)) {
          return; // Already triggered by another effect - wait for it to complete
        }

        // Mark as triggered BEFORE async operation
        currentState.markPreSearchTriggered(newRoundNumber);

        const effectiveThreadId = thread?.id || '';
        queueMicrotask(() => {
          // Trigger pre-search execution
          fetch(
            `/api/v1/chat/threads/${effectiveThreadId}/rounds/${newRoundNumber}/pre-search`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
              },
              body: JSON.stringify({ userQuery: pendingMessage }),
            },
          ).then(async (response) => {
            if (!response.ok && response.status !== 409) {
              console.error('[ChatStoreProvider] Pre-search execution failed:', response.status);
            }
            // ✅ BUG FIX: Parse SSE events and extract searchData
            const searchData = await readPreSearchStreamAndExtractData(response);

            // ✅ CRITICAL FIX: Update store with searchData AND status
            if (searchData) {
              store.getState().updatePreSearchData(newRoundNumber, searchData);
            } else {
              store.getState().updatePreSearchStatus(newRoundNumber, AnalysisStatuses.COMPLETE);
            }

            // Also invalidate query for orchestrator sync when enabled
            queryClientRef.current.invalidateQueries({
              queryKey: queryKeys.threads.preSearches(effectiveThreadId),
            });
          }).catch((error) => {
            console.error('[ChatStoreProvider] Failed to execute stuck pre-search:', error);
            // Clear tracking on failure so retry is possible
            store.getState().clearPreSearchTracking(newRoundNumber);
          });
        });
        return; // Wait for pre-search to complete
      }

      // Pre-search is COMPLETE or FAILED - continue with sending message
    }

    // ============================================================================
    // ✅ STEP 3: All conditions met - send message (participants will start)
    // ============================================================================
    // Get setter functions from store (these don't change, so safe to call here)
    const { setHasSentPendingMessage, setStreamingRoundNumber, setHasPendingConfigChanges, sendMessage } = store.getState();

    setHasSentPendingMessage(true);
    setStreamingRoundNumber(newRoundNumber);
    setHasPendingConfigChanges(false);

    // Send message in next tick (prevents blocking)
    queueMicrotask(() => {
      sendMessage?.(pendingMessage);
    });
  }, [
    // ✅ CRITICAL FIX: Include all subscribed state in dependencies
    // This ensures effect re-runs when any of these values change
    pendingMessage,
    expectedParticipantIds,
    hasSentPendingMessage,
    isStreaming,
    participants,
    messages,
    isWaitingForChangelog,
    screenMode,
    thread,
    enableWebSearch,
    preSearches, // ← KEY FIX: Effect re-runs when pre-searches change!
    createPreSearch,
    store,
  ]);

  // Initialize AI SDK hook with store state
  // ✅ CRITICAL FIX: Pass onComplete callback for immediate analysis triggering
  // ✅ CRITICAL FIX: Use createdThreadId as fallback for new threads
  // For new threads, thread object doesn't exist yet but createdThreadId is set
  // Without this, pre-search is skipped for new threads because threadId is ''
  // ✅ CRITICAL FIX: Only initialize hook when we have a valid threadId
  // This prevents hook from initializing with empty string, which causes startRound to never be available
  const effectiveThreadId = thread?.id || createdThreadId || '';

  // Animation tracking functions from store
  const waitForAnimation = useStore(store, s => s.waitForAnimation);
  const clearAnimations = useStore(store, s => s.clearAnimations);

  const chat = useMultiParticipantChat({
    threadId: effectiveThreadId,
    participants,
    messages,
    mode: thread?.mode,
    // ✅ FIX: Use form state as sole source of truth for web search enabled
    enableWebSearch,
    onError: handleError,
    onComplete: handleComplete,
    // Animation tracking for sequential participant streaming
    waitForAnimation,
    clearAnimations,
  });

  // ✅ QUOTA INVALIDATION: Use refs to capture latest functions and avoid circular deps
  const sendMessageRef = useRef(chat.sendMessage);
  const startRoundRef = useRef(chat.startRound);
  const continueFromParticipantRef = useRef(chat.continueFromParticipant);
  const setMessagesRef = useRef(chat.setMessages);

  // Keep refs in sync with latest chat methods
  useEffect(() => {
    sendMessageRef.current = chat.sendMessage;
    startRoundRef.current = chat.startRound;
    continueFromParticipantRef.current = chat.continueFromParticipant;
    setMessagesRef.current = chat.setMessages;
  }, [chat.sendMessage, chat.startRound, chat.continueFromParticipant, chat.setMessages]);

  // ✅ REMOVED: Old effect that stored unwrapped chat methods
  // This effect was overwriting the wrapped versions with quota/pre-search invalidation
  // The wrapped versions are now stored in the effect below (lines 500-511)
  // which runs once on mount with stable callbacks that include query invalidation logic

  // ✅ ARCHITECTURAL FIX: Provider-side streaming trigger
  // Watches waitingToStartStreaming and calls FRESH startRound
  // Avoids stale closure issues from store subscription
  // ✅ PRE-SEARCH BLOCKING: Waits for pre-search completion AND animation before triggering participants
  const waitingToStart = useStore(store, s => s.waitingToStartStreaming);
  const storeParticipants = useStore(store, s => s.participants);
  const storeMessages = useStore(store, s => s.messages);
  const storePreSearches = useStore(store, s => s.preSearches);
  const storeThread = useStore(store, s => s.thread);
  const storeScreenMode = useStore(store, s => s.screenMode); // ✅ FIX: Subscribe to screenMode changes
  const storePendingAnimations = useStore(store, s => s.pendingAnimations); // ✅ ANIMATION COORDINATION: Subscribe to animation state

  useEffect(() => {
    if (!waitingToStart) {
      return;
    }

    // ✅ SINGLE SOURCE OF TRUTH: Only trigger startRound for ChatOverviewScreen
    // ChatThreadScreen uses sendMessage flow (pendingMessage effect) instead
    // This prevents duplicate message creation and ensures correct roundNumber
    const currentScreenMode = storeScreenMode; // ✅ FIX: Use subscribed value

    // ✅ CRITICAL FIX: Don't clear flag if screenMode is null (during initialization)
    // Only clear if we're explicitly on a different screen (like 'thread')
    // This prevents race condition where:
    // 1. Thread created, waitingToStartStreaming set to true
    // 2. Provider effect runs BEFORE screen initialization sets screenMode
    // 3. screenMode is null, condition fails, flag gets cleared
    // 4. Screen initialization sets screenMode to 'overview'
    // 5. But flag is already cleared → participants never start
    if (currentScreenMode !== null && currentScreenMode !== 'overview') {
      // Not on overview screen - don't trigger startRound
      // Clear the flag to prevent infinite waiting
      store.getState().setWaitingToStartStreaming(false);
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

      // If pre-search exists and is still pending or streaming, wait
      if (currentRoundPreSearch.status === AnalysisStatuses.PENDING || currentRoundPreSearch.status === AnalysisStatuses.STREAMING) {
        return; // Don't trigger participants yet - pre-search still running
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
    // NOTE: Don't mark as attempted here - let the effect retry until messages are hydrated
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
    }
  }, [waitingToStart, chatIsStreaming, store]);

  // ✅ TIMEOUT PROTECTION: Clear waitingToStartStreaming if streaming fails to start
  // Prevents system from getting stuck forever if AI SDK never becomes ready
  // ✅ DYNAMIC TIMEOUT: Adjusts based on pre-search query count and search depth
  useEffect(() => {
    if (!waitingToStart) {
      return;
    }

    // ✅ DYNAMIC TIMEOUT: Calculate based on pre-search configuration
    // If web search is enabled, use dynamic timeout based on query count/depth
    // Otherwise use default timeout for non-web-search conversations
    const currentState = store.getState();
    const webSearchEnabled = currentState.thread?.enableWebSearch ?? currentState.enableWebSearch;

    let dynamicTimeoutMs: number = TIMEOUT_CONFIG.DEFAULT_MS;

    if (webSearchEnabled && currentState.messages.length > 0) {
      const currentRound = getCurrentRoundNumber(currentState.messages);
      const preSearchForRound = currentState.preSearches.find(ps => ps.roundNumber === currentRound);

      // Calculate dynamic timeout based on pre-search data
      // If pre-search exists, use its configuration; otherwise use default
      dynamicTimeoutMs = getPreSearchTimeout(preSearchForRound);
    }

    const timeoutId = setTimeout(() => {
      const latestState = store.getState();

      // Only timeout if still waiting and not streaming
      if (latestState.waitingToStartStreaming && !latestState.isStreaming) {
        // ✅ DYNAMIC CHECK: Use dynamic timeout for pre-search status check
        const latestWebSearchEnabled = latestState.thread?.enableWebSearch ?? latestState.enableWebSearch;
        if (latestWebSearchEnabled && latestState.messages.length > 0) {
          const currentRound = getCurrentRoundNumber(latestState.messages);
          const preSearchForRound = latestState.preSearches.find(ps => ps.roundNumber === currentRound);

          // If pre-search doesn't exist yet OR hasn't timed out yet, don't error
          // The isPreSearchTimedOut uses dynamic timeout calculation
          if (!preSearchForRound) {
            // Pre-search doesn't exist yet - still waiting for creation
            return;
          }

          const isStillRunning = preSearchForRound.status === AnalysisStatuses.PENDING
            || preSearchForRound.status === AnalysisStatuses.STREAMING;
          if (isStillRunning && !isPreSearchTimedOut(preSearchForRound)) {
            // Pre-search is still running and hasn't exceeded its dynamic timeout
            return;
          }
        }

        console.error('[ChatStoreProvider] Streaming start timeout - clearing waitingToStartStreaming', {
          timeoutMs: dynamicTimeoutMs,
          webSearchEnabled: latestWebSearchEnabled,
        });

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
      }
    }, dynamicTimeoutMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [waitingToStart, store, router]);

  // ✅ INCOMPLETE ROUND RESUMPTION: Continue from specific participant when round is incomplete
  // This effect is triggered by useIncompleteRoundResumption hook when it detects an incomplete round
  // on page load. It calls continueFromParticipant to trigger the remaining participants.
  const nextParticipantToTrigger = useStore(store, s => s.nextParticipantToTrigger);

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

    // ✅ CRITICAL: Call continueFromParticipant to resume from the specific participant
    // This triggers streaming for the missing participant, not from the beginning
    chat.continueFromParticipant(nextParticipantToTrigger, storeParticipants);

    // Clear the trigger flag after calling (let the effect retry if needed)
    // The flag will be cleared when streaming actually begins
  }, [nextParticipantToTrigger, waitingToStart, chatIsStreaming, storeParticipants, storeMessages, chat, store]);

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
    const countChanged = chat.messages.length !== prevMessageCountRef.current;

    // 2. During streaming, check if last message content changed (lightweight comparison)
    // ✅ MEMORY LEAK FIX: Replace JSON.stringify with simple ID + parts comparison
    // JSON.stringify on large message objects causes excessive GC pressure
    let contentChanged = false;
    if (chat.isStreaming && chat.messages.length > 0) {
      const lastHookMessage = chat.messages[chat.messages.length - 1];
      const lastStoreMessage = currentStoreMessages[currentStoreMessages.length - 1];

      // Check if last message has different parts (content is streaming in)
      // This handles the case where the ID stays the same but content grows
      const hookParts = lastHookMessage?.parts;
      const storeParts = lastStoreMessage?.parts;

      // Simple reference check - if parts array is different, content changed
      // This is lightweight but catches all streaming updates (parts is a new array each stream chunk)
      contentChanged = hookParts !== storeParts;

      // ✅ SAFETY: Update activity timestamp if content changed
      if (contentChanged) {
        lastStreamActivityRef.current = Date.now();
      }
    }

    const shouldSync = countChanged || contentChanged;

    if (shouldSync) {
      prevMessageCountRef.current = chat.messages.length;
      prevChatMessagesRef.current = chat.messages;
      store.getState().setMessages(chat.messages);

      // Update activity on any sync
      lastStreamActivityRef.current = Date.now();
    }
  }, [chat.messages, chat.isStreaming, store]); // Store included for exhaustive deps

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
      const preSearchForRound = currentState.preSearches.find(ps => ps.roundNumber === currentRound);

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
    const expectedModelIds = expectedParticipantIds.sort().join(',');

    if (currentModelIds !== expectedModelIds) {
      return;
    }

    // Check changelog wait state
    if (isWaitingForChangelog) {
      return;
    }

    // Calculate next round number
    const newRoundNumber = calculateNextRoundNumber(messages);

    // ============================================================================
    // ✅ CRITICAL FIX: Create pre-search BEFORE participant streaming (SAME AS FIRST EFFECT)
    // ============================================================================
    // ✅ FIX: Use form state as sole source of truth for web search enabled
    const webSearchEnabled = enableWebSearch;
    const preSearchForRound = preSearches.find(ps => ps.roundNumber === newRoundNumber);

    // ✅ STEP 1: Create pre-search if web search enabled and doesn't exist
    if (webSearchEnabled && !preSearchForRound) {
      // ✅ RACE CONDITION FIX: Check if pre-search already triggered for this round
      // This prevents duplicate triggers from both handleComplete and pendingMessage effects
      const currentState = store.getState();
      if (currentState.hasPreSearchBeenTriggered(newRoundNumber)) {
        return; // Already triggered by another effect - wait for it to complete
      }

      // ✅ FIX: Check if we've already attempted to create pre-search for this round
      // This prevents infinite retry loops when creation fails (e.g., 500 error)
      if (preSearchCreationAttemptedRef.current.has(newRoundNumber)) {
        // Already attempted and failed - fall through to send message without pre-search
        // Silently continue without pre-search
      } else {
        // Mark this round as attempted BEFORE trying
        preSearchCreationAttemptedRef.current.add(newRoundNumber);

        // Mark as triggered BEFORE async operation to prevent race conditions
        currentState.markPreSearchTriggered(newRoundNumber);

        // Create PENDING pre-search record AND immediately execute it
        // ✅ CRITICAL FIX: Execute pre-search here instead of waiting for PreSearchStream component
        // PreSearchStream only renders after user message exists, but message waits for pre-search
        // This breaks the circular dependency: create → execute → complete → send message
        const effectiveThreadId = thread?.id || '';
        queueMicrotask(() => {
          createPreSearch.mutateAsync({
            param: {
              threadId: effectiveThreadId,
              roundNumber: newRoundNumber.toString(),
            },
            json: {
              userQuery: pendingMessage,
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

            // ✅ IMMEDIATELY EXECUTE: Trigger pre-search execution after creation
            // This replaces the PreSearchStream component's POST request
            return fetch(
              `/api/v1/chat/threads/${effectiveThreadId}/rounds/${newRoundNumber}/pre-search`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'text/event-stream',
                },
                body: JSON.stringify({ userQuery: pendingMessage }),
              },
            );
          }).then(async (response) => {
            if (!response.ok && response.status !== 409) {
              // 409 = already executing, which is fine
              console.error('[ChatStoreProvider] Pre-search execution failed:', response.status);
            }
            // ✅ BUG FIX: Parse SSE events and extract searchData
            const searchData = await readPreSearchStreamAndExtractData(response);

            // ✅ CRITICAL FIX: Update store with searchData AND status
            if (searchData) {
              store.getState().updatePreSearchData(newRoundNumber, searchData);
            } else {
              store.getState().updatePreSearchStatus(newRoundNumber, AnalysisStatuses.COMPLETE);
            }

            // Also invalidate query for orchestrator sync when enabled
            queryClientRef.current.invalidateQueries({
              queryKey: queryKeys.threads.preSearches(effectiveThreadId),
            });
          }).catch((error) => {
            console.error('[ChatStoreProvider] Failed to create/execute pre-search:', error);
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
        // ✅ RACE CONDITION FIX: Check if pre-search already triggered for this round
        const currentState = store.getState();
        if (currentState.hasPreSearchBeenTriggered(newRoundNumber)) {
          return; // Already triggered by another effect - wait for it to complete
        }

        // Mark as triggered BEFORE async operation
        currentState.markPreSearchTriggered(newRoundNumber);

        const effectiveThreadId = thread?.id || '';
        queueMicrotask(() => {
          // Trigger pre-search execution
          fetch(
            `/api/v1/chat/threads/${effectiveThreadId}/rounds/${newRoundNumber}/pre-search`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
              },
              body: JSON.stringify({ userQuery: pendingMessage }),
            },
          ).then(async (response) => {
            if (!response.ok && response.status !== 409) {
              console.error('[ChatStoreProvider] Pre-search execution failed:', response.status);
            }
            // ✅ BUG FIX: Parse SSE events and extract searchData
            const searchData = await readPreSearchStreamAndExtractData(response);

            // ✅ CRITICAL FIX: Update store with searchData AND status
            if (searchData) {
              store.getState().updatePreSearchData(newRoundNumber, searchData);
            } else {
              store.getState().updatePreSearchStatus(newRoundNumber, AnalysisStatuses.COMPLETE);
            }

            // Also invalidate query for orchestrator sync when enabled
            queryClientRef.current.invalidateQueries({
              queryKey: queryKeys.threads.preSearches(effectiveThreadId),
            });
          }).catch((error) => {
            console.error('[ChatStoreProvider] Failed to execute stuck pre-search:', error);
            // Clear tracking on failure so retry is possible
            store.getState().clearPreSearchTracking(newRoundNumber);
          });
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

    // Skip on initial mount
    if (prevPath === null) {
      prevPathnameRef.current = pathname;
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

    // ✅ FIX 1: Stop any ongoing streaming immediately
    if (currentState.isStreaming) {
      currentState.stop?.();
    }

    // ✅ FIX 2: Clear waitingToStartStreaming to prevent deferred streaming from triggering
    if (currentState.waitingToStartStreaming) {
      currentState.setWaitingToStartStreaming(false);
    }

    // ✅ FIX 3: Reset to overview when navigating from thread to overview
    // This ensures all state is cleared before the overview screen mounts
    // Note: Overview screen also has its own resetToOverview() call in useLayoutEffect
    // This is defensive - ensures state is clean even if screen effect doesn't run
    if (isLeavingThread && isGoingToOverview) {
      currentState.resetToOverview();
    }

    // ✅ FIX 4: Reset thread state when navigating between different threads
    // This clears flags and tracking without clearing the entire store
    // The new thread screen will initialize fresh state via useScreenInitialization
    if (isNavigatingBetweenThreads) {
      currentState.resetThreadState();
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

import { MessageRoles, MessageStatuses, TextPartStates } from '@roundtable/shared';
import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { useMultiParticipantChat } from '@/hooks/utils';
import { showApiErrorToast } from '@/lib/toast';
import { getCurrentRoundNumber, getMessageMetadata, getRoundNumber } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import { createChatStore } from '@/stores/chat';

import { ChatStoreContext } from './context';
import {
  useChangelogSync,
  useMinimalMessageSync,
  useModeratorTrigger,
  useNavigationCleanup,
  usePendingMessage,
  usePreSearchResumption,
  useRoundOrchestrator,
  useRoundResumption,
  useStaleStreamingCleanup,
  useStateSync,
  useStreamActivityTracker,
  useStreamingTrigger,
  useStuckStreamDetection,
  useTitleAnimationController,
  useTitlePolling,
  useVisibilityStreamGuard,
} from './hooks';
import type { ChatStoreProviderProps } from './types';

type TriggerModeratorFn = (roundNumber: number, participantMessageIds: string[]) => Promise<void>;

/**
 * Chat Store Provider - Zustand v5 SSR Pattern for TanStack Start
 *
 * ✅ ZUSTAND V5 BEST PRACTICES:
 * 1. Factory Pattern: createChatStore() returns vanilla store (NOT global create())
 * 2. useState Lazy Init: Store created once per provider instance (SSR isolation)
 * 3. Context Distribution: ChatStoreContext provides store to useChatStore hook
 * 4. Middleware: devtools + immer at combined level (not in individual slices)
 * 5. Action Names: All set() calls include 'slice/action' third parameter
 * 6. useShallow Batching: Object selectors use useShallow to prevent unnecessary re-renders
 *
 * ⚠️ CRITICAL SSR PATTERNS:
 * - NO global module-level stores (each request gets fresh store)
 * - Store created via useState lazy initializer (once per component instance)
 * - Multiple ChatStoreProvider instances = multiple isolated stores (correct for SSR)
 * - React Server Components CANNOT read/write store (client components only)
 *
 * Note: useState with lazy initializer is preferred over useRef for store creation
 * because it ensures the store is created during the initial render phase.
 *
 * Reference: Official Zustand docs - "Persisting store data" SSR section
 */
export function ChatStoreProvider({ children }: ChatStoreProviderProps) {
  const queryClient = useQueryClient();
  // ✅ ZUSTAND V5 SSR: Create store via useState lazy initializer for per-request isolation
  // Factory pattern ensures each provider instance gets its own store
  const [store] = useState(() => createChatStore());
  const prevPathnameRef = useRef<string | null>(null);
  const queryClientRef = useRef<QueryClient>(queryClient);
  const triggerModeratorRef = useRef<TriggerModeratorFn | null>(null);

  // ✅ PERF FIX: Split selectors to prevent unnecessary re-renders
  // CRITICAL: Do NOT include `messages` here - it changes on every stream chunk
  // Components that need messages should subscribe directly via useChatStore
  const {
    createdThreadId,
    enableWebSearch,
    hasEarlyOptimisticMessage,
    nextParticipantToTrigger,
    participants,
    pendingAttachmentIds,
    pendingFileParts,
    // ✅ SMART STALE DETECTION: Prefilled state for stream validation
    resumptionRoundNumber,
    streamResumptionPrefilled,
    thread,
  } = useStore(store, useShallow(s => ({
    createdThreadId: s.createdThreadId,
    enableWebSearch: s.enableWebSearch,
    hasEarlyOptimisticMessage: s.hasEarlyOptimisticMessage,
    nextParticipantToTrigger: typeof s.nextParticipantToTrigger === 'object' && s.nextParticipantToTrigger !== null
      ? s.nextParticipantToTrigger.index
      : s.nextParticipantToTrigger,
    participants: s.participants,
    pendingAttachmentIds: s.pendingAttachmentIds,
    pendingFileParts: s.pendingFileParts,
    // ✅ SMART STALE DETECTION: Prefilled state for stream validation
    resumptionRoundNumber: s.resumptionRoundNumber,
    streamResumptionPrefilled: s.streamResumptionPrefilled,
    thread: s.thread,
  })));

  // ✅ PERF FIX: Get stable action references separately (actions don't change)
  const clearAnimations = useStore(store, s => s.clearAnimations);
  const completeAnimation = useStore(store, s => s.completeAnimation);

  // ✅ PERF FIX: Get messages via ref to avoid re-renders during streaming
  // The AI SDK hook needs messages but we don't want provider to re-render
  const messagesRef = useRef(store.getState().messages);
  useEffect(() => {
    return store.subscribe((state) => {
      messagesRef.current = state.messages;
    });
  }, [store]);

  const effectiveThreadId = thread?.id || createdThreadId || '';

  const handleError = useCallback((error: Error) => {
    showApiErrorToast('Chat error', error);
  }, []);

  const waitForStoreSync = useCallback(async (
    sdkMessages: readonly UIMessage[],
    roundNumber: number,
    maxWaitMs = 2000,
  ): Promise<boolean> => {
    const startTime = Date.now();
    const checkInterval = 50;

    const participantMessagesFromSdk = sdkMessages.filter((m) => {
      const meta = getMessageMetadata(m.metadata);
      return (
        m.role === MessageRoles.ASSISTANT
        && meta
        && 'roundNumber' in meta
        && meta.roundNumber === roundNumber
        && !('isModerator' in meta)
      );
    });

    if (participantMessagesFromSdk.length > 0) {
      const currentStoreMessages = store.getState().messages;
      const updatedMessages = currentStoreMessages.map((storeMsg) => {
        const sdkMatch = participantMessagesFromSdk.find(sdk => sdk.id === storeMsg.id);
        if (sdkMatch) {
          // ✅ CRITICAL FIX: Clone SDK data to prevent Immer from freezing AI SDK's objects
          return {
            ...storeMsg,
            metadata: structuredClone(sdkMatch.metadata),
            parts: structuredClone(sdkMatch.parts),
          };
        }
        return storeMsg;
      });

      const storeMsgIds = new Set(currentStoreMessages.map(m => m.id));
      const missingFromStore = participantMessagesFromSdk.filter(m => !storeMsgIds.has(m.id));
      if (missingFromStore.length > 0) {
        // ✅ CRITICAL FIX: Clone SDK messages to prevent Immer from freezing AI SDK's objects
        updatedMessages.push(...structuredClone(missingFromStore));
      }

      store.getState().setMessages(updatedMessages);
    }

    while (Date.now() - startTime < maxWaitMs) {
      const storeMessages = store.getState().messages;

      const participantMessages = storeMessages.filter((m) => {
        if (m.role !== MessageRoles.ASSISTANT) {
          return false;
        }
        const meta = getMessageMetadata(m.metadata);
        if (!meta) {
          return false;
        }
        const msgRound = getRoundNumber(m.metadata);
        const isModerator = 'isModerator' in meta && meta.isModerator === true;
        return msgRound === roundNumber && !isModerator;
      });

      const allComplete = participantMessages.every((msg) => {
        const hasStreamingParts = msg.parts?.some(
          p => 'state' in p && p.state === TextPartStates.STREAMING,
        );
        return !hasStreamingParts;
      });

      if (allComplete && participantMessages.length > 0) {
        return true;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, checkInterval);
      });
    }

    rlog.sync('timeout', 'store sync timed out, proceeding');
    return false;
  }, [store]);

  const handleComplete = useCallback(async (sdkMessages: readonly UIMessage[]) => {
    const currentState = store.getState();

    const roundNumber = sdkMessages.length > 0 ? getCurrentRoundNumber(sdkMessages) : null;
    const effectiveThreadId = currentState.thread?.id || currentState.createdThreadId || '';
    const moderatorTriggered = roundNumber !== null && effectiveThreadId
      ? currentState.hasModeratorStreamBeenTriggered(`${effectiveThreadId}_r${roundNumber}_moderator`, roundNumber)
      : null;
    rlog.stream('end', `r${roundNumber} msgs=${sdkMessages.length} wait=${currentState.waitingToStartStreaming ? 1 : 0} nextP=${currentState.nextParticipantToTrigger !== null ? currentState.nextParticipantToTrigger : '-'} modTrig=${moderatorTriggered ? 1 : 0}`);

    if (currentState.thread || currentState.createdThreadId) {
      const { createdThreadId: storeCreatedThreadId, selectedMode, thread: storeThread } = currentState;
      const threadId = storeThread?.id || storeCreatedThreadId;
      const mode = storeThread?.mode || selectedMode;

      if (threadId && mode && sdkMessages.length > 0) {
        try {
          const effectiveRoundNumber = getCurrentRoundNumber(sdkMessages);

          // ✅ RACE FIX: Check if moderator stream was TRIGGERED, not just created
          // flow-state-machine.ts calls tryMarkModeratorCreated() for UI purposes (flash prevention)
          // but does NOT trigger the actual moderator stream.
          // We should only skip if the stream was actually triggered by another path.
          const moderatorId = `${threadId}_r${effectiveRoundNumber}_moderator`;
          if (currentState.hasModeratorStreamBeenTriggered(moderatorId, effectiveRoundNumber)) {
            rlog.sync('mod-skip-triggered', `r${effectiveRoundNumber} already triggered`);
            return;
          }

          // ✅ CRITICAL FIX: Before checking nextParticipantToTrigger, verify if all participants
          // actually have complete messages. If so, we should trigger moderator even if
          // nextParticipantToTrigger wasn't cleared (happens when incomplete-round-resumption
          // triggers a participant but the flag isn't cleared after completion).
          const participantCount = currentState.participants.filter(p => p.isEnabled).length;
          const assistantMsgsInRound = sdkMessages.filter((m) => {
            const meta = getMessageMetadata(m.metadata);
            return meta?.role === MessageRoles.ASSISTANT
              && 'roundNumber' in meta && meta.roundNumber === effectiveRoundNumber
              && !('isModerator' in meta);
          });
          const allParticipantsComplete = assistantMsgsInRound.length >= participantCount;
          rlog.sync('mod-check-complete', `r${effectiveRoundNumber} assistMsgs=${assistantMsgsInRound.length} pCount=${participantCount} allComplete=${allParticipantsComplete}`);

          if (!allParticipantsComplete) {
            if (currentState.waitingToStartStreaming || currentState.nextParticipantToTrigger !== null) {
              rlog.sync('mod-skip-waiting', `r${effectiveRoundNumber} waiting=${currentState.waitingToStartStreaming} nextP=${currentState.nextParticipantToTrigger}`);
              return;
            }
          }

          await waitForStoreSync(sdkMessages, effectiveRoundNumber);
          await currentState.waitForAllAnimations();

          const latestState = store.getState();

          // Re-check with latest state (but skip if all participants already complete)
          if (!allParticipantsComplete) {
            if (latestState.waitingToStartStreaming || latestState.nextParticipantToTrigger !== null) {
              rlog.sync('mod-skip-waiting2', `r${effectiveRoundNumber} recheck: waiting=${latestState.waitingToStartStreaming} nextP=${latestState.nextParticipantToTrigger}`);
              return;
            }
          }

          const storeIsStreaming = latestState.isStreaming;
          const hasAnyStreamingParts = sdkMessages.some((m) => {
            const meta = getMessageMetadata(m.metadata);
            if (!meta || meta.role !== MessageRoles.ASSISTANT || 'isModerator' in meta) {
              return false;
            }
            return m.parts?.some(p => 'state' in p && p.state === TextPartStates.STREAMING) ?? false;
          });

          if (hasAnyStreamingParts && storeIsStreaming) {
            rlog.sync('mod-skip-streaming', `r${effectiveRoundNumber} still streaming parts`);
            return;
          }

          // ✅ FIX: Form state is the source of truth for current round web search decision
          const webSearchEnabled = latestState.enableWebSearch;
          if (webSearchEnabled) {
            const preSearchForRound = latestState.preSearches.find(ps => ps.roundNumber === effectiveRoundNumber);
            if (preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE) {
              rlog.sync('mod-skip-presearch', `r${effectiveRoundNumber} presearch not complete`);
              return;
            }
          }

          rlog.sync('mod-proceed', `r${effectiveRoundNumber} all checks passed, proceeding to trigger`);
          currentState.markModeratorCreated(effectiveRoundNumber);

          const participantMessageIds = sdkMessages
            .filter((m) => {
              const meta = getMessageMetadata(m.metadata);
              if (!meta) {
                return false;
              }

              return (
                meta.role === MessageRoles.ASSISTANT
                && 'roundNumber' in meta
                && meta.roundNumber === effectiveRoundNumber
                && !('isModerator' in meta)
              );
            })
            .map(m => m.id);

          // ✅ DEBUG: Log message IDs being sent to moderator
          rlog.sync('mod-ids', `r${effectiveRoundNumber} ids=[${participantMessageIds.join(',')}] count=${participantMessageIds.length}`);

          if (participantMessageIds.length > 0) {
            rlog.sync('mod-trigger-start', `r${effectiveRoundNumber} triggering moderator with ${participantMessageIds.length} msgs`);
            currentState.setIsModeratorStreaming(true);
            triggerModeratorRef.current?.(effectiveRoundNumber, participantMessageIds);
          } else {
            rlog.sync('mod-skip', `r${effectiveRoundNumber} no participant messages found, skipping moderator`);
          }
        } catch {
        }
      }
    }
  }, [store, waitForStoreSync]);

  // ✅ PERF FIX: Use initialMessages from store snapshot to avoid re-renders
  // The AI SDK will manage its own messages array during streaming
  const [initialMessages] = useState(() => store.getState().messages);

  const chat = useMultiParticipantChat({
    // ✅ RACE CONDITION FIX: Pass acknowledgeStreamFinish to signal onFinish completion
    // This replaces the 50ms timeout workaround for stream settling
    acknowledgeStreamFinish: () => {
      store.getState().acknowledgeStreamFinish();
    },
    clearAnimations,
    completeAnimation,
    enableWebSearch,
    // ✅ PRE-SEARCH RACE FIX: Get current pre-searches from store
    // Used in continueFromParticipant as defense in depth
    getPreSearches: () => {
      return store.getState().preSearches;
    },
    hasEarlyOptimisticMessage,
    messages: initialMessages, // Use stable initial value, not live messages
    mode: thread?.mode,
    nextParticipantToTrigger,
    onComplete: handleComplete,
    onError: handleError,
    onReconcileWithActiveStream: (streamingParticipantIndex) => {
      store.getState().reconcileWithActiveStream(streamingParticipantIndex);
    },
    onResumedStreamComplete: (roundNumber, participantIndex) => {
      store.getState().handleResumedStreamComplete(roundNumber, participantIndex);
    },
    participants,
    pendingAttachmentIds,
    pendingFileParts,
    // ✅ SMART STALE DETECTION: Pass prefilled state for stream validation
    resumptionRoundNumber,
    // ✅ STREAMING BUG FIX: Mark when message actually sent to AI SDK
    // Called by startRound AFTER aiSendMessage returns (not synchronously)
    setHasSentPendingMessage: (value) => {
      store.getState().setHasSentPendingMessage(value);
    },
    // ✅ HANDOFF FIX: Pass setIsStreaming so hook can update store directly
    // This ensures cleanup sees isStreaming=true immediately during P0→P1 handoff
    setIsStreaming: (value) => {
      store.getState().setIsStreaming(value);
    },
    // ✅ HANDOFF FIX: Notify store when next participant is being triggered
    // This prevents stale-streaming-cleanup from firing during P0->P1 handoff
    setNextParticipantToTrigger: (value) => {
      store.getState().setNextParticipantToTrigger(value);
    },
    // ✅ HANDOFF FIX: Pass setParticipantHandoffInProgress to clear flag when participant starts
    // This flag is set in use-streaming-trigger.ts before clearing nextParticipantToTrigger
    setParticipantHandoffInProgress: (value) => {
      store.getState().setParticipantHandoffInProgress(value);
    },
    setPendingAttachmentIds: (value) => {
      store.getState().setPendingAttachmentIds(value);
    },
    // ✅ NAVIGATION CLEANUP: Clear pending state on navigation abort
    // Prevents stale file parts from persisting across thread navigations
    setPendingFileParts: (value) => {
      store.getState().setPendingFileParts(value);
    },
    streamResumptionPrefilled,
    threadId: effectiveThreadId,
  });

  const sendMessageRef = useRef(chat.sendMessage);
  const startRoundRef = useRef(chat.startRound);
  const setMessagesRef = useRef(chat.setMessages);

  // ============================================================================
  // FSM ORCHESTRATOR (Phase 4: Running in parallel with existing hooks)
  // ============================================================================
  // The FSM orchestrator provides explicit state machine-based round coordination.
  // Currently running alongside existing hooks; will replace them in Phase 5.
  // The orchestrator's dispatch and flowState will be used to replace existing hooks.
  const roundOrchestrator = useRoundOrchestrator({
    chat,
    effectiveThreadId,
    store,
  });
  // Mark as intentionally unused during parallel integration phase
  void roundOrchestrator;

  // ✅ NAVIGATION CLEANUP: Wire up AI SDK's stop function to the store
  // This allows reset functions to stop streaming before clearing state
  useLayoutEffect(() => {
    store.getState().setChatStop(chat.stop);
    return () => {
      // Clear on unmount to prevent stale references
      store.getState().setChatStop(undefined);
    };
  }, [store, chat.stop]);

  useStateSync({
    chat,
    queryClientRef,
    sendMessageRef,
    setMessagesRef,
    startRoundRef,
    store,
  });

  // Minimal message sync: AI SDK → Store
  // Replaces the 965-line use-message-sync.ts with a simple sync
  // Store's setMessages handles smart merging, deduplicateMessages runs on completeStreaming
  useMinimalMessageSync({ chat, store });

  // Stream activity tracking for stuck stream detection
  // This is a simplified replacement for the activity tracking in useMessageSync
  const { lastStreamActivityRef } = useStreamActivityTracker({ store });

  useStreamingTrigger({
    chat,
    effectiveThreadId,
    queryClientRef,
    store,
  });

  useRoundResumption({ chat, store });

  usePreSearchResumption({
    effectiveThreadId,
    queryClientRef,
    store,
  });

  usePendingMessage({
    chat,
    effectiveThreadId,
    queryClientRef,
    sendMessageRef,
    store,
  });

  useStuckStreamDetection({
    lastStreamActivityRef,
    store,
  });

  // ✅ VISIBILITY GUARD: Detect tab visibility changes and reconnect streams
  // Prevents streams from stopping when browser tab loses focus
  useVisibilityStreamGuard({
    chat,
    effectiveThreadId,
    store,
  });

  // ✅ STALE STATE CLEANUP: Detect and clean up stale streaming state
  // This catches edge cases where streamingRoundNumber is stuck but round is complete
  useStaleStreamingCleanup({ store });

  useNavigationCleanup({
    prevPathnameRef,
    store,
  });

  // ✅ CHANGELOG: Fetch and merge changelog when config changes between rounds
  useChangelogSync({
    effectiveThreadId,
    queryClientRef,
    store,
  });

  // ✅ TITLE ANIMATION: Poll for AI-generated title and animate typewriter effect
  useTitlePolling({ queryClientRef, store });
  useTitleAnimationController({ store });

  const { triggerModerator } = useModeratorTrigger({ store });

  useLayoutEffect(() => {
    triggerModeratorRef.current = triggerModerator;
  }, [triggerModerator]);

  return (
    <ChatStoreContext value={store}>
      {children}
    </ChatStoreContext>
  );
}

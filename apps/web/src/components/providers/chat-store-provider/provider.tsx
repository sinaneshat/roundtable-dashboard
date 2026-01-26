/**
 * Chat Store Provider - Backend-First Streaming Architecture
 *
 * Simple provider that:
 * 1. Creates the store (SSR isolated)
 * 2. Subscribes to entity streams via useRoundSubscription
 * 3. Updates store based on subscription callbacks
 *
 * Per FLOW_DOCUMENTATION.md:
 * - Frontend SUBSCRIBES and DISPLAYS only
 * - Backend ORCHESTRATES everything (P0 → P1 → ... → Moderator)
 */

import { MessageRoles } from '@roundtable/shared';
import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import type { EntityType } from '@/hooks/utils';
import { useMultiParticipantChat, useRoundSubscription } from '@/hooks/utils';
import { useModeratorStream } from '@/hooks/utils/use-moderator-stream';
import { queryKeys } from '@/lib/data/query-keys';
import { showApiErrorToast } from '@/lib/toast';
import { getCurrentRoundNumber } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import { getThreadMessagesService } from '@/services/api';
import { ChatPhases, createChatStore } from '@/stores/chat';

import { ChatStoreContext } from './context';
import {
  useNavigationCleanup,
  useTitleAnimationController,
  useTitlePolling,
  useVisibilityStreamGuard,
} from './hooks';
import type { ChatStoreProviderProps } from './types';

/**
 * Chat Store Provider - Zustand v5 SSR Pattern
 *
 * Factory pattern ensures SSR isolation - each request gets fresh store.
 */
export function ChatStoreProvider({ children }: ChatStoreProviderProps) {
  const queryClient = useQueryClient();

  // Create store via useState lazy initializer (SSR isolation)
  const [store] = useState(() => createChatStore());

  const prevPathnameRef = useRef<string | null>(null);
  const queryClientRef = useRef(queryClient);

  // Get store state for hooks
  const {
    createdThreadId,
    currentRoundNumber,
    enableWebSearch,
    participants,
    pendingAttachmentIds,
    pendingFileParts,
    phase,
    thread,
    waitingToStartStreaming,
  } = useStore(store, useShallow(s => ({
    createdThreadId: s.createdThreadId,
    currentRoundNumber: s.currentRoundNumber,
    enableWebSearch: s.enableWebSearch,
    participants: s.participants,
    pendingAttachmentIds: s.pendingAttachmentIds,
    pendingFileParts: s.pendingFileParts,
    phase: s.phase,
    thread: s.thread,
    waitingToStartStreaming: s.waitingToStartStreaming,
  })));

  const effectiveThreadId = thread?.id || createdThreadId || '';
  const enabledParticipantCount = participants.filter(p => p.isEnabled).length;

  // Determine if subscriptions should be active
  // Active when we have a thread, a round number, and are in a streaming phase
  const shouldSubscribe = useMemo(() => {
    const hasThread = Boolean(effectiveThreadId);
    const hasRound = currentRoundNumber !== null && currentRoundNumber >= 0;
    const isActivePhase = phase === ChatPhases.PARTICIPANTS || phase === ChatPhases.MODERATOR || waitingToStartStreaming;
    return hasThread && hasRound && isActivePhase;
  }, [effectiveThreadId, currentRoundNumber, phase, waitingToStartStreaming]);

  // ============================================================================
  // ROUND SUBSCRIPTION - Backend-First Pattern
  // ============================================================================

  // Subscription callbacks - track streaming progress
  const handleChunk = useCallback((entity: EntityType, _text: string, seq: number) => {
    // Only log first chunk per entity to reduce noise
    if (seq === 1) {
      rlog.stream('start', `${entity} streaming`);
    }
    // Update subscription status for UI
    if (entity === 'presearch') {
      store.getState().updateEntitySubscriptionStatus('presearch', 'streaming', seq);
    } else if (entity === 'moderator') {
      store.getState().updateEntitySubscriptionStatus('moderator', 'streaming', seq);
    } else if (entity.startsWith('participant_')) {
      const index = Number.parseInt(entity.replace('participant_', ''), 10);
      store.getState().updateEntitySubscriptionStatus(index, 'streaming', seq);
    }
  }, [store]);

  const handleEntityComplete = useCallback(async (entity: EntityType, lastSeq: number) => {
    rlog.stream('end', `${entity} complete lastSeq=${lastSeq}`);
    const state = store.getState();
    const threadId = state.thread?.id || createdThreadId;

    if (entity === 'presearch') {
      state.updateEntitySubscriptionStatus('presearch', 'complete', lastSeq);
    } else if (entity === 'moderator') {
      state.updateEntitySubscriptionStatus('moderator', 'complete', lastSeq);
      // Moderator complete means round is done
      state.onModeratorComplete();
    } else if (entity.startsWith('participant_')) {
      const index = Number.parseInt(entity.replace('participant_', ''), 10);
      state.updateEntitySubscriptionStatus(index, 'complete', lastSeq);

      // P1+ participants: fetch messages from server to get their content
      // P0 is handled by AI SDK, but for P1+ we need to fetch from server
      if (index > 0 && threadId) {
        rlog.sync('p-fetch', `P${index} complete - fetching messages from server`);
        try {
          const result = await queryClient.fetchQuery({
            queryFn: () => getThreadMessagesService({ param: { id: threadId } }),
            queryKey: queryKeys.threads.messages(threadId),
            staleTime: 0,
          });

          if (result.success && result.data.items) {
            const freshState = store.getState();
            const uiMessages = chatMessagesToUIMessages(result.data.items, freshState.participants);
            rlog.sync('p-fetch', `P${index} fetched ${uiMessages.length} messages`);
            freshState.setMessages(uiMessages);
          }
        } catch (error) {
          rlog.stuck('p-fetch', `P${index} message fetch failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Check if this was the last participant
      const subState = store.getState().subscriptionState;
      const allParticipantsDone = subState.participants.every(
        p => p.status === 'complete' || p.status === 'error',
      );

      if (allParticipantsDone) {
        rlog.phase('subscription', `All participants complete - transitioning to MODERATOR`);
        store.getState().onParticipantComplete(index);
      }
    }
  }, [store, createdThreadId, queryClient]);

  const handleRoundComplete = useCallback(() => {
    rlog.phase('subscription', `Round ${currentRoundNumber} COMPLETE`);
    store.getState().completeStreaming();
  }, [store, currentRoundNumber]);

  const handleEntityError = useCallback((entity: EntityType, error: Error) => {
    rlog.stuck('sub', `${entity} error: ${error.message}`);
    showApiErrorToast(`Stream error (${entity})`, error);

    if (entity === 'presearch') {
      store.getState().updateEntitySubscriptionStatus('presearch', 'error', undefined, error.message);
    } else if (entity === 'moderator') {
      store.getState().updateEntitySubscriptionStatus('moderator', 'error', undefined, error.message);
    } else if (entity.startsWith('participant_')) {
      const index = Number.parseInt(entity.replace('participant_', ''), 10);
      store.getState().updateEntitySubscriptionStatus(index, 'error', undefined, error.message);
    }
  }, [store]);

  // Round subscription hook
  const { abort: abortSubscriptions } = useRoundSubscription({
    enabled: shouldSubscribe,
    enablePreSearch: enableWebSearch,
    onChunk: handleChunk,
    onEntityComplete: handleEntityComplete,
    onEntityError: handleEntityError,
    onRoundComplete: handleRoundComplete,
    participantCount: enabledParticipantCount,
    roundNumber: currentRoundNumber ?? 0,
    threadId: effectiveThreadId,
  });

  // Initialize subscription state when round starts
  useEffect(() => {
    if (shouldSubscribe && currentRoundNumber !== null) {
      store.getState().initializeSubscriptions(currentRoundNumber, enabledParticipantCount);
    }
  }, [shouldSubscribe, currentRoundNumber, enabledParticipantCount, store]);

  // ============================================================================
  // AI SDK HOOK (for P0 message sending)
  // ============================================================================

  // Error handler
  const handleError = useCallback((error: Error) => {
    showApiErrorToast('Chat error', error);
    store.getState().setError(error);
  }, [store]);

  // Stable initial messages for AI SDK
  const [initialMessages] = useState(() => store.getState().messages);

  // AI SDK hook - simplified, only for P0 message sending
  const chat = useMultiParticipantChat({
    enableWebSearch,
    messages: initialMessages,
    mode: thread?.mode,
    onError: handleError,
    participants,
    pendingAttachmentIds,
    pendingFileParts,
    setIsStreaming: value => store.getState().setIsStreaming(value),
    setPendingAttachmentIds: value => store.getState().setPendingAttachmentIds(value),
    setPendingFileParts: value => store.getState().setPendingFileParts(value),
    threadId: effectiveThreadId,
  });

  // Sync AI SDK messages to store (AI SDK -> Store)
  useEffect(() => {
    if (chat.messages.length > 0) {
      // Clone to prevent Immer from freezing AI SDK's objects
      store.getState().setMessages(structuredClone(chat.messages) as UIMessage[]);
    }
  }, [chat.messages, store]);

  // Get store messages for AI SDK hydration
  const { hasInitiallyLoaded, messages: storeMessages } = useStore(
    store,
    useShallow(s => ({
      hasInitiallyLoaded: s.hasInitiallyLoaded,
      messages: s.messages,
    })),
  );

  // Sync store messages to AI SDK after thread initialization (Store -> AI SDK)
  const hasHydratedToAiSdkRef = useRef(false);
  useEffect(() => {
    if (
      !hasHydratedToAiSdkRef.current
      && hasInitiallyLoaded
      && storeMessages.length > 0
      && chat.messages.length === 0
    ) {
      rlog.trigger('hydrate-exec', `SYNCING ${storeMessages.length} msgs to AI SDK`);
      chat.setMessages(structuredClone(storeMessages) as UIMessage[]);
      hasHydratedToAiSdkRef.current = true;
    }
  }, [hasInitiallyLoaded, storeMessages, chat]);

  // P0 streaming trigger - only triggers first participant when waitingToStartStreaming is set
  const hasTriggeredRef = useRef(false);
  const lastTriggerKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Guard: Need to be waiting to start streaming
    if (!waitingToStartStreaming) {
      return;
    }

    // Guard: Need thread ID and messages
    if (!effectiveThreadId || storeMessages.length === 0) {
      return;
    }

    // Guard: AI SDK needs to be ready and not already streaming
    if (!chat.isReady || chat.isStreaming) {
      return;
    }

    // Dedupe check - prevent double-triggering for same thread
    const triggerKey = `${effectiveThreadId}_p0`;
    if (lastTriggerKeyRef.current === triggerKey && hasTriggeredRef.current) {
      return;
    }

    // Mark as triggered
    hasTriggeredRef.current = true;
    lastTriggerKeyRef.current = triggerKey;

    // Start P0 streaming
    const roundNumber = getCurrentRoundNumber(storeMessages);
    const enabledCount = participants.filter(p => p.isEnabled).length;

    rlog.phase('trigger', `START r${roundNumber} pIdx=0 phase→PARTICIPANTS enabledCount=${enabledCount}`);
    store.getState().startRound(roundNumber, enabledCount);

    chat.startRound(participants, storeMessages);
    rlog.handoff('P0-triggered', `r${roundNumber} AI SDK startRound called`);

    // Clear the waiting flag
    store.getState().setWaitingToStartStreaming(false);
  }, [
    waitingToStartStreaming,
    effectiveThreadId,
    storeMessages,
    chat,
    chat.isReady,
    chat.isStreaming,
    participants,
    store,
  ]);

  // Set chat stop callback for navigation cleanup
  useEffect(() => {
    store.getState().setChatStop(() => {
      chat.stop();
      abortSubscriptions();
    });
    return () => {
      store.getState().setChatStop(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- chat.stop is stable
  }, [store, chat.stop, abortSubscriptions]);

  // ============================================================================
  // MODERATOR STREAM (for direct moderator trigger if needed)
  // ============================================================================

  const { triggerModeratorStream } = useModeratorStream({
    enabled: true,
    store,
    threadId: effectiveThreadId,
  });

  // Moderator trigger when phase transitions (backup for subscription)
  const moderatorTriggerRoundRef = useRef<number | null>(null);

  useEffect(() => {
    if (phase !== ChatPhases.MODERATOR) {
      moderatorTriggerRoundRef.current = null;
      return;
    }

    const roundNumber = currentRoundNumber ?? getCurrentRoundNumber(storeMessages);
    if (roundNumber === null || moderatorTriggerRoundRef.current === roundNumber) {
      return;
    }

    const participantMessageIds = storeMessages
      .filter((m) => {
        if (m.role !== MessageRoles.ASSISTANT) {
          return false;
        }
        const metadata = m.metadata;
        if (!metadata || typeof metadata !== 'object') {
          return false;
        }
        const meta = metadata as Record<string, unknown>;
        return (
          'roundNumber' in meta
          && meta.roundNumber === roundNumber
          && !('isModerator' in meta && meta.isModerator === true)
        );
      })
      .map(m => m.id);

    if (participantMessageIds.length > 0) {
      moderatorTriggerRoundRef.current = roundNumber;
      rlog.handoff('moderator-auto-trigger', `r${roundNumber} triggering moderator via phase effect`);
      triggerModeratorStream(roundNumber, participantMessageIds);
    }
  }, [phase, currentRoundNumber, storeMessages, triggerModeratorStream]);

  // ============================================================================
  // OTHER HOOKS
  // ============================================================================

  // Navigation cleanup
  useNavigationCleanup({
    prevPathnameRef,
    store,
  });

  // Title animation hooks
  useTitlePolling({ queryClientRef, store });
  useTitleAnimationController({ store });

  // Visibility guard for streams
  useVisibilityStreamGuard({
    chat,
    effectiveThreadId,
    store,
  });

  return (
    <ChatStoreContext value={store}>
      {children}
    </ChatStoreContext>
  );
}

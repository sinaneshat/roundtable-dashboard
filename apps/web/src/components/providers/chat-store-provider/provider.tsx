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
import { showApiErrorToast } from '@/lib/toast';
import { getCurrentRoundNumber } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import { startRoundService } from '@/services/api/chat';
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
    // Only enable subscriptions AFTER P0 trigger sets phase to PARTICIPANTS
    const isActivePhase = phase === ChatPhases.PARTICIPANTS || phase === ChatPhases.MODERATOR;
    return hasThread && hasRound && isActivePhase;
  }, [effectiveThreadId, currentRoundNumber, phase]);

  // ============================================================================
  // ROUND SUBSCRIPTION - Backend-First Pattern
  // ============================================================================

  // Subscription callbacks - track streaming progress
  const handleChunk = useCallback((entity: EntityType, text: string, seq: number) => {
    // Only log first chunk per entity to reduce noise
    if (seq === 1) {
      rlog.stream('start', `${entity} streaming`);
    }

    // FIX: Read currentRoundNumber directly from store to avoid stale closure
    // The callback may be invoked before React re-renders with the updated round number,
    // causing streaming placeholders to be created with the wrong round number on round 2+
    const state = store.getState();
    const roundNumber = state.currentRoundNumber ?? 0;

    // Update subscription status for UI
    if (entity === 'presearch') {
      state.updateEntitySubscriptionStatus('presearch', 'streaming', seq);
    } else if (entity === 'moderator') {
      state.updateEntitySubscriptionStatus('moderator', 'streaming', seq);
      // FIX: Re-enable moderator text appending - now uses same ID as useModeratorStream
      // (${threadId}_r${roundNumber}_moderator) so it updates the existing placeholder
      // instead of creating a duplicate. This is needed for gradual streaming when
      // useModeratorStream gets 204 (another request handling) and subscription handles streaming.
      if (text) {
        rlog.moderator('chunk', `r${roundNumber} seq=${seq} +${text.length} chars`);
        state.appendModeratorStreamingText(text, roundNumber);
      }
    } else if (entity.startsWith('participant_')) {
      const index = Number.parseInt(entity.replace('participant_', ''), 10);
      state.updateEntitySubscriptionStatus(index, 'streaming', seq);

      // FIX: Only create streaming placeholders for P1+ participants
      // P0 is handled by AI SDK which manages its own rendering directly
      // Creating streaming_p0_r0 alongside AI SDK's message causes duplicates
      // P1+ need streaming placeholders because they're not handled by AI SDK
      if (text && index > 0) {
        state.appendEntityStreamingText(index, text, roundNumber);
      }
    }
  }, [store]);

  const handleEntityComplete = useCallback(async (entity: EntityType, lastSeq: number) => {
    rlog.stream('end', `${entity} complete lastSeq=${lastSeq}`);
    const state = store.getState();

    if (entity === 'presearch') {
      state.updateEntitySubscriptionStatus('presearch', 'complete', lastSeq);
    } else if (entity === 'moderator') {
      state.updateEntitySubscriptionStatus('moderator', 'complete', lastSeq);

      // ✅ FIX: Check if messages still have streaming placeholders before calling onModeratorComplete
      // In the 204 polling case, the polling will replace messages AND update streaming state atomically.
      // If we call onModeratorComplete here while streaming placeholders exist, we get an intermediate
      // render with isStreaming=false but streaming placeholders still in messages = visual jump.
      const hasStreamingPlaceholders = state.messages.some((m) => {
        const meta = m.metadata as Record<string, unknown> | null | undefined;
        return meta && 'isStreaming' in meta && meta.isStreaming === true;
      });

      if (hasStreamingPlaceholders) {
        rlog.moderator('sub-complete', `skipping onModeratorComplete - streaming placeholders still exist, polling will handle`);
      } else {
        // Moderator complete means round is done
        state.onModeratorComplete();
      }
    } else if (entity.startsWith('participant_')) {
      const index = Number.parseInt(entity.replace('participant_', ''), 10);
      state.updateEntitySubscriptionStatus(index, 'complete', lastSeq);

      // NOTE: We no longer fetch messages from server on participant completion.
      // Previously, this fetch would overwrite the gradually-streamed text,
      // causing responses to appear "all at once" instead of streaming smoothly.
      // The streamed text accumulated via appendEntityStreamingText is now preserved.
      // Server messages are synced separately after the round completes.

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
  }, [store]);

  const handleRoundComplete = useCallback(() => {
    const state = store.getState();
    rlog.phase('subscription', `Round ${state.currentRoundNumber ?? 0} COMPLETE`);

    // ✅ FIX: Check if messages still have streaming placeholders before calling completeStreaming
    // In the 204 polling case, the polling will replace messages AND update streaming state atomically.
    // If we call completeStreaming here while streaming placeholders exist, we get an intermediate
    // render with isStreaming=false but streaming placeholders still in messages = visual jump.
    const hasStreamingPlaceholders = state.messages.some((m) => {
      const meta = m.metadata as Record<string, unknown> | null | undefined;
      return meta && 'isStreaming' in meta && meta.isStreaming === true;
    });

    if (hasStreamingPlaceholders) {
      rlog.moderator('round-complete', `skipping completeStreaming - streaming placeholders still exist, polling will handle`);
    } else {
      state.completeStreaming();
    }
  }, [store]);

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

  // Presearch event accumulator ref for gradual UI updates
  const preSearchDataRef = useRef<{
    queries: Array<{ index: number; query: string; rationale: string; searchDepth: string; total: number }>;
    results: Array<{ index: number; query: string; results: unknown[]; responseTime: number; answer: string | null }>;
    summary: string;
    totalResults: number;
  }>({
    queries: [],
    results: [],
    summary: '',
    totalResults: 0,
  });

  // Handle presearch SSE events for gradual UI updates
  const handlePreSearchEvent = useCallback((eventType: string, data: unknown) => {
    const state = store.getState();
    const roundNumber = state.currentRoundNumber ?? 0;
    const eventData = data as Record<string, unknown>;

    switch (eventType) {
      case 'start':
        // Reset accumulator for new presearch
        preSearchDataRef.current = {
          queries: [],
          results: [],
          summary: (eventData.analysisRationale as string) || '',
          totalResults: 0,
        };
        break;

      case 'query': {
        const queryData = {
          index: eventData.index as number,
          query: eventData.query as string,
          rationale: (eventData.rationale as string) || '',
          searchDepth: (eventData.searchDepth as string) || 'basic',
          total: eventData.total as number,
        };
        // Update or add query at the given index
        const existingIdx = preSearchDataRef.current.queries.findIndex(q => q.index === queryData.index);
        if (existingIdx >= 0) {
          preSearchDataRef.current.queries[existingIdx] = queryData;
        } else {
          preSearchDataRef.current.queries.push(queryData);
        }
        // Update store with partial data
        state.updatePartialPreSearchData(roundNumber, { ...preSearchDataRef.current });
        break;
      }

      case 'result': {
        const resultData = {
          answer: (eventData.answer as string | null) || null,
          index: eventData.index as number,
          query: eventData.query as string,
          responseTime: (eventData.responseTime as number) || 0,
          results: (eventData.results as unknown[]) || [],
        };
        // Update or add result at the given index
        const existingIdx = preSearchDataRef.current.results.findIndex(r => r.index === resultData.index);
        if (existingIdx >= 0) {
          preSearchDataRef.current.results[existingIdx] = resultData;
        } else {
          preSearchDataRef.current.results.push(resultData);
        }
        preSearchDataRef.current.totalResults = preSearchDataRef.current.results.reduce(
          (sum, r) => sum + r.results.length,
          0,
        );
        // Update store with partial data
        state.updatePartialPreSearchData(roundNumber, { ...preSearchDataRef.current });
        break;
      }

      case 'complete':
        // Complete event has stats, update totalResults
        preSearchDataRef.current.totalResults = (eventData.totalResults as number) || 0;
        state.updatePartialPreSearchData(roundNumber, { ...preSearchDataRef.current });
        break;

      case 'done':
        // Done event contains complete searchData - update store with full payload
        state.updatePartialPreSearchData(roundNumber, eventData);
        break;
    }
  }, [store]);

  // Round subscription hook
  const { abort: abortSubscriptions } = useRoundSubscription({
    enabled: shouldSubscribe,
    enablePreSearch: enableWebSearch,
    onChunk: handleChunk,
    onEntityComplete: handleEntityComplete,
    onEntityError: handleEntityError,
    onPreSearchEvent: handlePreSearchEvent,
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
      // FIX: Preserve streaming placeholders AND optimistic user messages when syncing
      // AI SDK only handles P0 streaming - P1+ participants use streaming placeholders
      // created by appendEntityStreamingText. Without preserving these, P1+ streaming
      // is interrupted when AI SDK updates its messages (causing UI to break mid-way)
      //
      // ✅ FIX: Also preserve optimistic user messages (optimistic_*) that were added
      // to the store before AI SDK was updated. Without this, Round 2+ user messages
      // temporarily disappear when AI SDK syncs, causing a flash of empty content.
      const state = store.getState();
      const storeOnlyMessages = state.messages.filter(
        m => m.id.startsWith('streaming_p') || m.id.includes('_moderator') || m.id.startsWith('optimistic_'),
      );

      // Clone to prevent Immer from freezing AI SDK's objects
      const aiSdkMessages = structuredClone(chat.messages) as UIMessage[];

      // Merge: AI SDK messages + store-only messages (that aren't already in AI SDK messages)
      const aiSdkMessageIds = new Set(aiSdkMessages.map(m => m.id));
      const messagesToPreserve = storeOnlyMessages.filter(
        m => !aiSdkMessageIds.has(m.id),
      );

      const mergedMessages = [...aiSdkMessages, ...messagesToPreserve];

      // DEBUG: Log when we preserve optimistic or streaming messages
      if (messagesToPreserve.length > 0) {
        const optimisticCount = messagesToPreserve.filter(m => m.id.startsWith('optimistic_')).length;
        const streamingCount = messagesToPreserve.filter(m => m.id.startsWith('streaming_p')).length;
        const moderatorCount = messagesToPreserve.filter(m => m.id.includes('_moderator')).length;
        rlog.sync('aiSdk→store', `preserved: optimistic=${optimisticCount} streaming=${streamingCount} moderator=${moderatorCount} aiSdk=${aiSdkMessages.length} total=${mergedMessages.length}`);
      }

      state.setMessages(mergedMessages);
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

    // Compute round number early for dedupe key
    const roundNumber = getCurrentRoundNumber(storeMessages);

    // Dedupe check - prevent double-triggering for same thread+round
    const triggerKey = `${effectiveThreadId}_r${roundNumber}_p0`;
    if (lastTriggerKeyRef.current === triggerKey && hasTriggeredRef.current) {
      return;
    }

    // Mark as triggered
    hasTriggeredRef.current = true;
    lastTriggerKeyRef.current = triggerKey;

    // Start round - different paths for web search vs direct streaming
    const enabledCount = participants.filter(p => p.isEnabled).length;

    if (enableWebSearch) {
      // ✅ QUEUE-ORCHESTRATED FLOW: Backend handles presearch → P0 → P1 → ... → moderator
      // Get the last user message for the start round request
      const lastUserMessage = [...storeMessages].reverse().find((m): m is UIMessage => m.role === 'user');
      if (!lastUserMessage) {
        rlog.stuck('trigger', 'No user message found for start round');
        hasTriggeredRef.current = false;
        lastTriggerKeyRef.current = null;
        return;
      }

      rlog.phase('trigger', `START r${roundNumber} via QUEUE (web search enabled) enabledCount=${enabledCount}`);

      // Clear the waiting flag immediately (prevents re-triggering during async call)
      store.getState().setWaitingToStartStreaming(false);

      // Call start round service FIRST - backend will persist enableWebSearch to DB
      // Only THEN enable subscriptions by calling startRound (which sets phase to PARTICIPANTS)
      // This prevents the race condition where subscriptions check enableWebSearch before it's persisted
      startRoundService({
        attachmentIds: pendingAttachmentIds ?? undefined,
        enableWebSearch: true, // This endpoint is only called when web search is enabled
        message: lastUserMessage,
        roundNumber,
        threadId: effectiveThreadId,
      })
        .then((response) => {
          if (!response.ok) {
            rlog.stuck('trigger', `Start round failed: ${response.status}`);
            showApiErrorToast('Failed to start round', new Error(`HTTP ${response.status}`));
            // Reset trigger state so user can retry
            hasTriggeredRef.current = false;
            lastTriggerKeyRef.current = null;
          } else {
            rlog.handoff('queue-triggered', `r${roundNumber} START_ROUND queued, now enabling subscriptions`);
            // ✅ NOW enable subscriptions - DB has been updated with enableWebSearch=true
            store.getState().startRound(roundNumber, enabledCount);
          }
        })
        .catch((error) => {
          rlog.stuck('trigger', `Start round error: ${error.message}`);
          showApiErrorToast('Failed to start round', error);
          // Reset trigger state so user can retry
          hasTriggeredRef.current = false;
          lastTriggerKeyRef.current = null;
        });
    } else {
      // ✅ DIRECT P0 FLOW: No presearch needed, trigger P0 directly via AI SDK
      rlog.phase('trigger', `START r${roundNumber} pIdx=0 phase→PARTICIPANTS enabledCount=${enabledCount}`);
      store.getState().startRound(roundNumber, enabledCount);

      chat.startRound(participants, storeMessages);
      rlog.handoff('P0-triggered', `r${roundNumber} AI SDK startRound called`);

      // Clear the waiting flag
      store.getState().setWaitingToStartStreaming(false);
    }
  }, [
    waitingToStartStreaming,
    effectiveThreadId,
    storeMessages,
    chat,
    chat.isReady,
    chat.isStreaming,
    participants,
    store,
    enableWebSearch,
    pendingAttachmentIds,
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

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

import { isCompletionFinishReason, MessageStatuses } from '@roundtable/shared';
import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import type { EntityType } from '@/hooks/utils';
import { useMultiParticipantChat, useRoundSubscription, useStreamResumption } from '@/hooks/utils';
import { showApiErrorToast } from '@/lib/toast';
import { chatMessagesToUIMessages, getAssistantMetadata, getCurrentRoundNumber, getParticipantIndex, getRoundNumber, isModeratorMetadataFast, isStreamingMetadata } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import {
  areAllParticipantsComplete,
  countEnabledParticipants,
  hasStreamingPlaceholders,
  parseParticipantEntityIndex,
} from '@/lib/utils/streaming-helpers';
import { getThreadMessagesService, startRoundService } from '@/services/api/chat';
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
 *
 * @param initialState - Optional initial state for SSR hydration.
 *   When provided at the layout level (from route loader data),
 *   the store is created with data already populated,
 *   preventing the flash that occurs when hydrating an empty store.
 */
export function ChatStoreProvider({ children, initialState }: ChatStoreProviderProps) {
  const queryClient = useQueryClient();

  // Create store via useState lazy initializer (SSR isolation)
  // Pass initialState to pre-populate the store during creation
  const [store] = useState(() => createChatStore(initialState));

  const prevPathnameRef = useRef<string | null>(null);
  const queryClientRef = useRef(queryClient);

  // Get store state for hooks
  const {
    createdThreadId,
    currentRoundNumber,
    enableWebSearch,
    hasInitiallyLoaded: storeHasInitiallyLoaded,
    isResumingStream,
    isStreaming,
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
    hasInitiallyLoaded: s.hasInitiallyLoaded,
    isResumingStream: s.isResumingStream,
    isStreaming: s.isStreaming,
    participants: s.participants,
    pendingAttachmentIds: s.pendingAttachmentIds,
    pendingFileParts: s.pendingFileParts,
    phase: s.phase,
    thread: s.thread,
    waitingToStartStreaming: s.waitingToStartStreaming,
  })));

  const effectiveThreadId = thread?.id || createdThreadId || '';
  const enabledParticipantCount = countEnabledParticipants(participants);

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
  // STREAM RESUMPTION - Detect in-progress rounds on page refresh
  // ============================================================================

  // Track which thread we've already resumed to prevent duplicate resumptions
  const resumedThreadIdRef = useRef<string | null>(null);
  // Track the round number we resumed for fetching completed responses
  const resumedRoundRef = useRef<number | null>(null);
  // Track if we've already fetched completed responses for this resumption
  const hasFetchedCompletedResponsesRef = useRef(false);

  // Don't check resumption for newly created threads - they haven't had time to populate KV state
  // Per FLOW_DOCUMENTATION.md: DB-KV sync has latency, resumption only for returning users
  const resumptionEnabled = storeHasInitiallyLoaded && !isStreaming && !waitingToStartStreaming && !createdThreadId;
  rlog.resume('provider-hook-call', `tid=${effectiveThreadId?.slice(-8) ?? 'null'} enabled=${resumptionEnabled} phase=${phase} hasLoaded=${storeHasInitiallyLoaded} isStreaming=${isStreaming} waiting=${waitingToStartStreaming} created=${!!createdThreadId}`);

  const { hasInProgressRound, state: resumptionState, status: resumptionStatus } = useStreamResumption({
    currentPhase: phase,
    // Only check once store has loaded and we're not already streaming
    enabled: resumptionEnabled,
    // Skip if already in an active streaming phase (prevents double-check)
    skipIfActivePhase: true,
    threadId: effectiveThreadId || null,
  });

  // Resume in-progress round when detected by backend state
  useEffect(() => {
    rlog.resume('provider-effect', `tid=${effectiveThreadId?.slice(-8) ?? 'null'} hasInProgress=${hasInProgressRound} status=${resumptionStatus} statePhase=${resumptionState?.currentPhase ?? 'null'} storePhase=${phase}`);

    // Guard: Need an in-progress round
    if (!hasInProgressRound || !resumptionState) {
      rlog.resume('provider-guard', `tid=${effectiveThreadId?.slice(-8) ?? 'null'} SKIP: hasInProgress=${hasInProgressRound} hasState=${!!resumptionState}`);
      return;
    }

    // Guard: Need thread ID
    if (!effectiveThreadId) {
      rlog.resume('provider-guard', 'SKIP: no threadId');
      return;
    }

    // Guard: Already resumed this thread
    if (resumedThreadIdRef.current === effectiveThreadId) {
      rlog.resume('skip-duplicate', `tid=${effectiveThreadId.slice(-8)} already resumed`);
      return;
    }

    // Guard: Don't resume if user is actively starting a new round
    if (waitingToStartStreaming) {
      rlog.resume('skip-active', `tid=${effectiveThreadId.slice(-8)} user is starting new round`);
      return;
    }

    // Guard: Don't resume if already in streaming phase (could be from user action)
    if (phase === ChatPhases.PARTICIPANTS || phase === ChatPhases.MODERATOR) {
      rlog.resume('skip-phase', `tid=${effectiveThreadId.slice(-8)} already in ${phase}`);
      return;
    }

    // Extract resumption params from backend state
    // Note: Backend returns lowercase phases: 'pre_search', 'participants', 'moderator'
    // But there's no currentParticipantIndex in the schema - use nextParticipantToTrigger instead
    const { currentPhase, nextParticipantToTrigger, roundNumber, totalParticipants } = resumptionState;

    // Guard: Don't resume if round is already complete
    // This can happen if the round finishes between the hook checking backend state
    // and this effect running. The cached hasInProgressRound may be stale.
    if (phase === ChatPhases.COMPLETE && roundNumber !== null && roundNumber !== undefined) {
      // Check if store messages show the SAME or HIGHER round number as backend reports
      // Same round: round finished since check (backend state is stale)
      // Higher round: definitely stale
      const storeMessages = store.getState().messages;
      const messagesRoundNumber = getCurrentRoundNumber(storeMessages);

      if (messagesRoundNumber >= roundNumber) {
        rlog.resume('skip-stale', `tid=${effectiveThreadId.slice(-8)} backend r${roundNumber} stale - phase=COMPLETE messagesRound=${messagesRoundNumber}`);
        return;
      }
    }

    // Map backend phase (lowercase) to resumption phase
    const mappedPhase = currentPhase === 'pre_search'
      ? 'presearch'
      : currentPhase === 'participants'
        ? 'participants'
        : currentPhase === 'moderator'
          ? 'moderator'
          : null;

    if (!mappedPhase || roundNumber === null || roundNumber === undefined) {
      rlog.resume('skip-invalid', `tid=${effectiveThreadId.slice(-8)} invalid state: phase=${currentPhase} round=${roundNumber}`);
      return;
    }

    rlog.resume('trigger', `tid=${effectiveThreadId.slice(-8)} resuming r${roundNumber} phase=${mappedPhase} total=${totalParticipants} nextIdx=${nextParticipantToTrigger}`);

    // Mark as resumed BEFORE calling action to prevent race conditions
    resumedThreadIdRef.current = effectiveThreadId;
    resumedRoundRef.current = roundNumber;
    hasFetchedCompletedResponsesRef.current = false;

    // Resume the round with proper state
    // Use nextParticipantToTrigger as the current index (it's the next one to stream)
    store.getState().resumeInProgressRound({
      currentParticipantIndex: nextParticipantToTrigger ?? 0,
      phase: mappedPhase,
      roundNumber,
      totalParticipants: totalParticipants ?? enabledParticipantCount,
    });
  }, [
    hasInProgressRound,
    resumptionState,
    resumptionStatus,
    effectiveThreadId,
    waitingToStartStreaming,
    phase,
    enabledParticipantCount,
    store,
  ]);

  // Reset resumption refs when thread changes
  useEffect(() => {
    if (effectiveThreadId && effectiveThreadId !== resumedThreadIdRef.current) {
      // Only reset if we're changing to a different thread, not on initial load
      if (resumedThreadIdRef.current !== null) {
        rlog.resume('reset', `thread changed ${resumedThreadIdRef.current.slice(-8)} → ${effectiveThreadId.slice(-8)}`);
        resumedThreadIdRef.current = null;
        resumedRoundRef.current = null;
        hasFetchedCompletedResponsesRef.current = false;
      }
    }
  }, [effectiveThreadId]);

  // Log resumption status for debugging
  useEffect(() => {
    if (resumptionStatus === 'complete' && !hasInProgressRound && effectiveThreadId) {
      rlog.resume('no-active', `tid=${effectiveThreadId.slice(-8)} no in-progress round detected`);
    }
  }, [resumptionStatus, hasInProgressRound, effectiveThreadId]);

  // ✅ FIX: Handle multiple scenarios where messages may be incomplete after page refresh:
  // 1. Round was in-progress when refreshed, completed before subscriptions could stream
  // 2. Round was already complete but moderator message wasn't in initial load (race condition)
  // In both cases, fetch completed messages from server if store is missing expected data.
  useEffect(() => {
    // Only run when resumption check is complete
    if (resumptionStatus !== 'complete' || !resumptionState) {
      return;
    }

    // Only handle the case where backend reports complete
    if (resumptionState.currentPhase !== 'complete') {
      return;
    }

    // Don't fetch twice
    if (hasFetchedCompletedResponsesRef.current) {
      return;
    }

    // Need thread ID for fetch
    if (!effectiveThreadId) {
      return;
    }

    const storeState = store.getState();
    const roundNumber = resumptionState.roundNumber ?? 0;

    // Check if moderator message exists in store for this round
    const hasModeratorMessage = storeState.messages.some((m) => {
      if (m.role !== 'assistant') {
        return false;
      }
      // Use fast O(1) check for isModerator and type-safe roundNumber extraction
      return isModeratorMetadataFast(m.metadata) && getRoundNumber(m.metadata) === roundNumber;
    });

    // Check if backend reports moderator is complete with a message ID
    const backendHasModeratorMessage = resumptionState.moderator?.status === 'complete'
      && resumptionState.moderator?.moderatorMessageId;

    // Case 1: We resumed this round and it completed
    const resumedThisRound = resumedThreadIdRef.current === effectiveThreadId
      && resumedRoundRef.current === roundNumber;

    // Case 2: Backend has moderator message but store doesn't (initial load race condition)
    const missingModeratorMessage = backendHasModeratorMessage && !hasModeratorMessage;

    // Determine if we need to fetch
    const shouldFetch = resumedThisRound || missingModeratorMessage;

    if (!shouldFetch) {
      return;
    }

    // Check if store already has all expected assistant messages for this round
    const hasAssistantResponses = storeState.messages.some((m) => {
      if (m.role !== 'assistant') {
        return false;
      }
      // Use type-safe utilities for metadata access
      const msgRound = getRoundNumber(m.metadata);
      const hasContent = m.parts?.some(p => p.type === 'text' && p.text && p.text.length > 0);
      const isStreaming = isStreamingMetadata(m.metadata);
      return msgRound === roundNumber && hasContent && !isStreaming;
    });

    // Skip if we have responses AND moderator (nothing missing)
    if (hasAssistantResponses && hasModeratorMessage) {
      rlog.resume('fill-completed', `tid=${effectiveThreadId.slice(-8)} r${roundNumber} already has all responses, skipping fetch`);
      hasFetchedCompletedResponsesRef.current = true;
      return;
    }

    const reason = missingModeratorMessage ? 'missing moderator' : 'resumed round completed';
    rlog.resume('fill-completed', `tid=${effectiveThreadId.slice(-8)} r${roundNumber} ${reason} - fetching messages`);
    hasFetchedCompletedResponsesRef.current = true;

    // Fetch completed messages from server
    (async () => {
      try {
        const result = await getThreadMessagesService({ param: { id: effectiveThreadId } });
        if (result.success && result.data.items) {
          const participants = store.getState().participants;
          const serverMessages = chatMessagesToUIMessages(result.data.items, participants);
          rlog.resume('fill-completed', `fetched ${serverMessages.length} messages, replacing store`);
          store.getState().setMessages(serverMessages);
          store.getState().completeStreaming();
        } else {
          rlog.stuck('fill-completed', `failed to fetch: ${result.success ? 'no items' : 'request failed'}`);
        }
      } catch (error) {
        rlog.stuck('fill-completed', `error: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    })();
  }, [resumptionStatus, resumptionState, effectiveThreadId, store]);

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

    // NOTE: Removed subscriptionRoundRef validation - same issue as handleEntityComplete.
    // The entity subscriptions properly cleanup on round changes (useEffect cleanup aborts).
    // If a stale chunk somehow arrives, it will just be appended to a placeholder that
    // will be replaced by the real message fetch anyway.

    // Update subscription status for UI
    if (entity === 'presearch') {
      state.updateEntitySubscriptionStatus('presearch', 'streaming', seq);
    } else if (entity === 'moderator') {
      state.updateEntitySubscriptionStatus('moderator', 'streaming', seq);
      // Append moderator text chunks received via SSE subscription
      // Uses ID format ${threadId}_r${roundNumber}_moderator for placeholder updates
      if (text) {
        rlog.moderator('chunk', `r${roundNumber} seq=${seq} +${text.length} chars`);
        state.appendModeratorStreamingText(text, roundNumber);
      }
    } else {
      const index = parseParticipantEntityIndex(entity);
      if (index !== null) {
        state.updateEntitySubscriptionStatus(index, 'streaming', seq);

        // ✅ FIX Phase 5B: Accumulate text for ALL participants when web search is enabled
        // When web search is enabled, backend orchestrates ALL participants (including P0)
        // via the queue system. In this mode, AI SDK is NOT triggered, so P0 must use
        // subscription-based streaming just like P1+.
        //
        // When web search is disabled, P0 is handled by AI SDK which manages its own
        // rendering directly, so we skip P0 to avoid duplicates.
        const shouldAccumulateP0 = state.enableWebSearch;
        if (text && (index > 0 || shouldAccumulateP0)) {
          state.appendEntityStreamingText(index, text, roundNumber);
        }
      }
    }
  }, [store]);

  const handleEntityComplete = useCallback(async (entity: EntityType, lastSeq: number) => {
    const state = store.getState();
    const currentRound = state.currentRoundNumber ?? 0;

    // Log completion AFTER getting state for accurate round info
    rlog.stream('end', `${entity} r${currentRound} complete lastSeq=${lastSeq}`);

    // NOTE: Removed subscriptionRoundRef validation - it caused a race condition where:
    // 1. Old subscription from round N fires onComplete
    // 2. subscriptionRoundRef was already updated to round N+1
    // 3. Completion is silently discarded, leaving round N incomplete
    //
    // The entity subscriptions already track their own roundNumber in state,
    // and the subscription hooks properly cleanup/reset on round changes.
    // If a stale completion arrives, the store's terminal status guards will prevent
    // regression (see updateEntitySubscriptionStatus invariants).

    if (entity === 'presearch') {
      state.updateEntitySubscriptionStatus('presearch', 'complete', lastSeq);

      // ✅ FIX: Bridge presearch subscription status to preSearches array
      // Without this, preSearches[roundNumber].status stays 'pending' even though
      // subscriptionState.presearch.status is 'complete', causing UI stuck in loading
      state.updatePreSearchStatus(currentRound, MessageStatuses.COMPLETE);
      rlog.presearch('sub-complete', `r${currentRound} - bridged subscription complete to preSearches array`);
    } else if (entity === 'moderator') {
      state.updateEntitySubscriptionStatus('moderator', 'complete', lastSeq);

      // ✅ FIX: Clear isStreaming flag on moderator placeholder so hasStreamingPlaceholders returns false
      // This allows the round completion flow (handleRoundComplete) to call completeStreaming directly
      state.finalizeModeratorStreaming(currentRound);

      // Note: We don't call onModeratorComplete() here - the round completion is handled by
      // handleRoundComplete callback when isRoundComplete becomes true in useRoundSubscription.
      // This ensures all entities are properly marked complete before phase transition.
    } else {
      const index = parseParticipantEntityIndex(entity);
      if (index !== null) {
        state.updateEntitySubscriptionStatus(index, 'complete', lastSeq);

        // ✅ FIX: Clear isStreaming flag on participant placeholder
        // This allows hasStreamingPlaceholders to return false once all entities complete,
        // enabling the round completion flow to proceed normally
        state.finalizeParticipantStreaming(index, currentRound);

        // Check if this was the last participant
        const subState = store.getState().subscriptionState;
        if (areAllParticipantsComplete(subState.participants)) {
          rlog.phase('subscription', `All participants complete - transitioning to MODERATOR`);
          store.getState().onParticipantComplete(index);
        }
      }
    }
  }, [store]);

  const handleRoundComplete = useCallback(async () => {
    const state = store.getState();
    const threadId = state.thread?.id;
    rlog.phase('handleRoundComplete', `🎯 CALLED! r${state.currentRoundNumber ?? 0} phase=${state.phase} isStreaming=${state.isStreaming}`);
    rlog.phase('subscription', `Round ${state.currentRoundNumber ?? 0} COMPLETE`);

    // ✅ FIX: Check if messages still have streaming placeholders before calling completeStreaming
    // In the 204 polling case, the polling will replace messages AND update streaming state atomically.
    // If we call completeStreaming here while streaming placeholders exist, we get an intermediate
    // render with isStreaming=false but streaming placeholders still in messages = visual jump.
    const hasPlaceholders = hasStreamingPlaceholders(state.messages);
    rlog.phase('handleRoundComplete', `hasPlaceholders=${hasPlaceholders} msgCount=${state.messages.length}`);

    if (hasPlaceholders) {
      // ✅ FIX: When resuming an already-complete round, placeholders exist but no streaming
      // content will arrive. Fetch completed messages from server to fill the placeholders.
      // This handles the race condition where page refresh happens right as round completes.
      if (threadId) {
        rlog.moderator('round-complete', `streaming placeholders exist - fetching completed messages from server`);
        try {
          rlog.phase('handleRoundComplete', `📡 Fetching messages for ${threadId.slice(-8)}`);
          const result = await getThreadMessagesService({ param: { id: threadId } });
          rlog.phase('handleRoundComplete', `📡 Fetch result: success=${result.success} hasItems=${!!result.data?.items} itemCount=${result.data?.items?.length ?? 0}`);
          if (result.success && result.data.items) {
            const participants = store.getState().participants;
            const serverMessages = chatMessagesToUIMessages(result.data.items, participants);
            rlog.moderator('round-complete', `fetched ${serverMessages.length} messages, replacing placeholders`);
            rlog.phase('handleRoundComplete', `📡 Setting ${serverMessages.length} messages and calling completeStreaming`);
            store.getState().setMessages(serverMessages);
            store.getState().completeStreaming();
            rlog.phase('handleRoundComplete', `✅ completeStreaming called - phase should now be COMPLETE`);
          } else {
            rlog.stuck('round-complete', `failed to fetch messages: ${result.success ? 'no items' : 'request failed'}`);
          }
        } catch (error) {
          rlog.stuck('round-complete', `error fetching messages: ${error instanceof Error ? error.message : 'unknown'}`);
        }
      } else {
        rlog.moderator('round-complete', `skipping completeStreaming - no threadId for fetch`);
      }
    } else {
      rlog.phase('handleRoundComplete', `✅ No placeholders - calling completeStreaming directly`);
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
    } else {
      const index = parseParticipantEntityIndex(entity);
      if (index !== null) {
        store.getState().updateEntitySubscriptionStatus(index, 'error', undefined, error.message);
      }
    }
  }, [store]);

  // Pre-search event accumulator ref for gradual UI updates
  // DESIGN NOTE: Types are loosely defined here because this is a PROTOCOL BOUNDARY.
  // SSE events deliver partial data during streaming that doesn't match the complete schema.
  // Full type validation happens at API response boundaries, not during incremental streaming.
  const preSearchDataRef = useRef<{
    queries: Array<{ index: number; query: string; rationale: string; searchDepth: string; total: number }>;
    results: Array<{ index: number; query: string; results: Array<{ description: string; favicon: string; snippet: string; title: string; url: string }>; responseTime: number; answer: string | null }>;
    summary: string;
    totalResults: number;
  }>({
    queries: [],
    results: [],
    summary: '',
    totalResults: 0,
  });

  // Ref to track pending animation frame for presearch updates
  // Using requestAnimationFrame instead of flushSync for better performance with rapid SSE events
  const pendingAnimationFrameRef = useRef<number | null>(null);

  // Cleanup pending animation frame on unmount
  useEffect(() => {
    return () => {
      if (pendingAnimationFrameRef.current !== null) {
        cancelAnimationFrame(pendingAnimationFrameRef.current);
      }
    };
  }, []);

  // FIX 3: Reset presearch accumulator when round number changes
  const prevRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (currentRoundNumber !== null && currentRoundNumber !== prevRoundRef.current) {
      // Only reset if presearch subscription is not actively streaming
      const presearchStatus = store.getState().subscriptionState?.presearch?.status;
      if (presearchStatus === 'streaming') {
        rlog.presearch('reset-deferred', `r${currentRoundNumber} deferring accumulator reset - presearch still streaming`);
        return; // Don't reset while streaming
      }

      preSearchDataRef.current = {
        queries: [],
        results: [],
        summary: '',
        totalResults: 0,
      };
      prevRoundRef.current = currentRoundNumber;
      rlog.presearch('reset', `r${currentRoundNumber} accumulator reset`);
    }
  }, [currentRoundNumber, store]);

  // Handle presearch SSE events for gradual UI updates
  // CRITICAL: We must deep clone arrays before passing to Immer to avoid freezing
  // the accumulator ref's arrays, which would cause "object is not extensible" errors
  //
  // DESIGN NOTE: `data: unknown` arrives from SSE protocol boundary (see use-round-subscription.ts).
  // We cast to Record<string, unknown> to access properties based on eventType discriminant.
  // Full validation schemas exist on API side (PreSearchSSEEventSchema).
  const handlePreSearchEvent = useCallback((eventType: string, data: unknown) => {
    const state = store.getState();
    const roundNumber = state.currentRoundNumber ?? 0;
    const eventData = data as Record<string, unknown>;

    // Enhanced logging to debug pre-search event routing
    rlog.presearch('handler-received', `r${roundNumber} type=${eventType} hasData=${!!data} keys=${Object.keys(eventData).join(',').slice(0, 50)}`);

    // Helper to deep clone the accumulator data for Immer
    // This prevents Immer from freezing our mutable ref arrays
    const cloneAccumulatorForStore = () => ({
      queries: preSearchDataRef.current.queries.map(q => ({ ...q })),
      results: preSearchDataRef.current.results.map(r => ({
        ...r,
        results: [...(r.results || [])],
      })),
      summary: preSearchDataRef.current.summary,
      totalResults: preSearchDataRef.current.totalResults,
    });

    switch (eventType) {
      case 'start':
        // FIX 1: Only reset if accumulator is empty
        // This handles the case where backend sends start AFTER query events
        if (
          preSearchDataRef.current.queries.length === 0
          && preSearchDataRef.current.results.length === 0
        ) {
          preSearchDataRef.current = {
            queries: [],
            results: [],
            summary: (eventData.analysisRationale as string) || '',
            totalResults: 0,
          };
          rlog.presearch('start', `r${roundNumber} accumulator reset`);
        } else {
          // Just update summary without resetting data
          preSearchDataRef.current.summary = (eventData.analysisRationale as string) || preSearchDataRef.current.summary;
          rlog.presearch('start', `r${roundNumber} skipped reset (already has ${preSearchDataRef.current.queries.length} queries, ${preSearchDataRef.current.results.length} results)`);
        }
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
        // Schedule update on next animation frame for smooth gradual animation
        // Using requestAnimationFrame instead of flushSync to:
        // 1. Avoid bypassing React's batching which can cause performance issues with rapid SSE events
        // 2. Align updates with browser's natural paint cycle (~60fps)
        // 3. Cancel pending frames to prevent stale updates when events arrive faster than frame rate
        if (pendingAnimationFrameRef.current !== null) {
          cancelAnimationFrame(pendingAnimationFrameRef.current);
        }
        pendingAnimationFrameRef.current = requestAnimationFrame(() => {
          pendingAnimationFrameRef.current = null;
          state.updatePartialPreSearchData(roundNumber, cloneAccumulatorForStore());
        });
        break;
      }

      case 'result': {
        // Type for web search results from SSE event
        type WebSearchResult = { description: string; favicon: string; snippet: string; title: string; url: string };
        const resultData = {
          answer: (eventData.answer as string | null) || null,
          index: eventData.index as number,
          query: eventData.query as string,
          responseTime: (eventData.responseTime as number) || 0,
          results: [...((eventData.results as WebSearchResult[]) || [])], // Clone the results array
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
        // Schedule update on next animation frame for smooth gradual animation
        // Using requestAnimationFrame instead of flushSync to:
        // 1. Avoid bypassing React's batching which can cause performance issues with rapid SSE events
        // 2. Align updates with browser's natural paint cycle (~60fps)
        // 3. Cancel pending frames to prevent stale updates when events arrive faster than frame rate
        if (pendingAnimationFrameRef.current !== null) {
          cancelAnimationFrame(pendingAnimationFrameRef.current);
        }
        pendingAnimationFrameRef.current = requestAnimationFrame(() => {
          pendingAnimationFrameRef.current = null;
          state.updatePartialPreSearchData(roundNumber, cloneAccumulatorForStore());
        });
        break;
      }

      case 'complete':
        // Complete event has stats, update totalResults
        preSearchDataRef.current.totalResults = (eventData.totalResults as number) || 0;
        state.updatePartialPreSearchData(roundNumber, cloneAccumulatorForStore());
        break;

      case 'done': {
        // FIX 2: Done event may contain complete searchData OR just {interrupted: true, reason: '...'}
        // CRITICAL: Only replace accumulated data if done payload has MORE data, not less
        // This prevents data corruption where done event replaces 2 accumulated queries with 1
        const doneQueries = Array.isArray(eventData.queries) ? eventData.queries.length : 0;
        const doneResults = Array.isArray(eventData.results) ? eventData.results.length : 0;
        const accQueries = preSearchDataRef.current.queries.length;
        const accResults = preSearchDataRef.current.results.length;

        if (eventData.interrupted) {
          // Interrupted - keep accumulated data
          state.updatePartialPreSearchData(roundNumber, cloneAccumulatorForStore());
          rlog.presearch('done', `r${roundNumber} interrupted, using accumulated (q=${accQueries} r=${accResults})`);
        } else if (doneQueries >= accQueries && doneResults >= accResults && (doneQueries > 0 || doneResults > 0)) {
          // Done payload is complete (has >= accumulated data) - use it
          state.updatePartialPreSearchData(roundNumber, eventData);
          rlog.presearch('done', `r${roundNumber} full payload applied (q=${doneQueries} r=${doneResults})`);
        } else {
          // Done payload has less data than accumulated - prefer accumulated
          state.updatePartialPreSearchData(roundNumber, cloneAccumulatorForStore());
          rlog.presearch('done', `r${roundNumber} using accumulated (done q=${doneQueries}/r=${doneResults} < acc q=${accQueries}/r=${accResults})`);
        }
        break;
      }
    }
  }, [store]);

  // ✅ RESUMPTION: Build initialLastSeqs from resumption state for stream resumption
  // These values tell subscriptions where to resume from after page refresh
  const initialLastSeqs = useMemo(() => {
    if (!resumptionState) {
      return undefined;
    }
    return {
      moderator: resumptionState.moderator?.lastSeq ?? undefined,
      participants: resumptionState.participants?.lastSeqs ?? undefined,
      presearch: resumptionState.preSearch?.lastSeq ?? undefined,
    };
  }, [resumptionState]);

  // ✅ AI SDK P0 COMPLETION STATE
  // When enableWebSearch is false, P0 streams via AI SDK (not subscription).
  // This state is updated when AI SDK P0 completes, signaling the subscription
  // hook's stagger mechanism to enable P1.
  const [aiSdkP0Complete, setAiSdkP0Complete] = useState(false);
  const aiSdkP0CompleteKeyRef = useRef<string | null>(null);

  // Reset when thread/round changes
  // Using useLayoutEffect to ensure synchronous state reset before render
  useLayoutEffect(() => {
    const key = `${effectiveThreadId}_r${currentRoundNumber}`;
    if (aiSdkP0CompleteKeyRef.current !== key) {
      setAiSdkP0Complete(false);
      aiSdkP0CompleteKeyRef.current = key;
    }
  }, [effectiveThreadId, currentRoundNumber]);

  // Round subscription hook
  const { abort: abortSubscriptions } = useRoundSubscription({
    aiSdkP0Complete: !enableWebSearch && aiSdkP0Complete,
    enabled: shouldSubscribe,
    enablePreSearch: enableWebSearch,
    initialLastSeqs,
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
      // FIX: Preserve presearch messages in addition to streaming placeholders and optimistic messages
      // Presearch results were being lost during AI SDK message sync because they weren't in the filter
      const storeOnlyMessages = state.messages.filter(
        m => m.id.startsWith('streaming_p')
          || m.id.includes('_moderator')
          || m.id.startsWith('optimistic_')
          || m.id.startsWith('presearch_'),
      );

      // Clone to prevent Immer from freezing AI SDK's objects
      const aiSdkMessages = structuredClone(chat.messages) as UIMessage[];

      // Merge: AI SDK messages + store-only messages (that aren't already in AI SDK messages)
      const aiSdkMessageIds = new Set(aiSdkMessages.map(m => m.id));
      const messagesToPreserve = storeOnlyMessages.filter(
        m => !aiSdkMessageIds.has(m.id),
      );

      const mergedMessages = [...aiSdkMessages, ...messagesToPreserve];

      // DEBUG: Log when we preserve optimistic, streaming, or presearch messages
      if (messagesToPreserve.length > 0) {
        const optimisticCount = messagesToPreserve.filter(m => m.id.startsWith('optimistic_')).length;
        const streamingCount = messagesToPreserve.filter(m => m.id.startsWith('streaming_p')).length;
        const moderatorCount = messagesToPreserve.filter(m => m.id.includes('_moderator')).length;
        const presearchCount = messagesToPreserve.filter(m => m.id.startsWith('presearch_')).length;
        rlog.sync('aiSdk→store', `preserved: optimistic=${optimisticCount} streaming=${streamingCount} moderator=${moderatorCount} presearch=${presearchCount} aiSdk=${aiSdkMessages.length} total=${mergedMessages.length}`);
      }

      state.setMessages(mergedMessages);
    }
  }, [chat.messages, store]);

  // ============================================================================
  // AI SDK P0 COMPLETION BRIDGE
  // ============================================================================
  // When enableWebSearch is false, P0 streams via AI SDK directly (not through
  // KV-backed subscription). The subscription status stays 'streaming' forever
  // because no chunks are written to KV. This breaks the stagger mechanism which
  // waits for subscription status 'complete' before enabling P1.
  //
  // This effect bridges AI SDK P0 completion to subscription state, enabling
  // the stagger to proceed when P0 finishes via AI SDK.
  // Using useLayoutEffect to ensure synchronous state update for proper stagger coordination.
  // ============================================================================
  const hasMarkedP0CompleteRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    // Only needed when web search is disabled (P0 uses AI SDK path)
    if (enableWebSearch) {
      return;
    }

    // Need active subscription and round number
    if (!shouldSubscribe || currentRoundNumber === null) {
      return;
    }

    // Find P0 message for current round using type-safe metadata utilities
    const p0Message = chat.messages.find((m) => {
      if (m.role !== 'assistant') {
        return false;
      }
      const pIndex = getParticipantIndex(m.metadata);
      const roundNum = getRoundNumber(m.metadata);
      return pIndex === 0 && roundNum === currentRoundNumber;
    });

    if (!p0Message) {
      return;
    }

    // Check if P0 has completed (has valid completion finishReason)
    // NOTE: Backend sets finishReason='unknown' at stream start, then updates to actual value
    // (e.g., 'stop') at stream finish. We must check for a VALID completion reason, not just
    // any truthy value, to avoid triggering the bridge prematurely with 'unknown'.
    const p0Metadata = getAssistantMetadata(p0Message.metadata);
    const finishReason = p0Metadata?.finishReason;

    // isCompletionFinishReason returns true for: 'stop', 'length', 'tool-calls', 'content-filter'
    // Returns false for: 'unknown', 'error', 'failed', 'other', undefined
    if (!finishReason || !isCompletionFinishReason(finishReason)) {
      return;
    }

    // Prevent double-marking
    const bridgeKey = `${effectiveThreadId}_r${currentRoundNumber}_p0`;
    if (hasMarkedP0CompleteRef.current === bridgeKey) {
      return;
    }

    // Check current subscription status
    const subState = store.getState().subscriptionState;
    if (subState.participants[0]?.status === 'complete') {
      return;
    }

    // Bridge: Mark P0 subscription as complete
    rlog.handoff('ai-sdk-bridge', `r${currentRoundNumber} P0 finishReason=${finishReason} → marking subscription complete`);
    hasMarkedP0CompleteRef.current = bridgeKey;

    // ✅ Signal subscription hook's stagger mechanism
    // This is the primary mechanism - tells useRoundSubscription to treat P0 as complete
    setAiSdkP0Complete(true);

    // Also update store's subscription status for UI consistency
    store.getState().updateEntitySubscriptionStatus(0, 'complete', 0);
    store.getState().finalizeParticipantStreaming(0, currentRoundNumber);

    // Trigger participant complete callback
    store.getState().onParticipantComplete(0);
  }, [
    chat.messages,
    enableWebSearch,
    shouldSubscribe,
    currentRoundNumber,
    effectiveThreadId,
    store,
    setAiSdkP0Complete,
  ]);

  // Reset bridge ref when thread changes
  useEffect(() => {
    if (effectiveThreadId) {
      hasMarkedP0CompleteRef.current = null;
    }
  }, [effectiveThreadId]);

  // Get store messages for AI SDK hydration
  const { messages: storeMessages } = useStore(
    store,
    useShallow(s => ({
      messages: s.messages,
    })),
  );

  // Sync store messages to AI SDK after thread initialization (Store -> AI SDK)
  const hasHydratedToAiSdkRef = useRef(false);
  // Track last hydrated thread to detect thread changes
  const lastHydratedThreadIdRef = useRef<string | null>(null);

  // ✅ CRITICAL FIX: Reset hydration refs when thread changes
  // Without this, navigating overview→thread1→overview→thread2 causes:
  // 1. hasHydratedToAiSdkRef stays true from thread1
  // 2. AI SDK never gets messages for thread2
  // 3. chat.isReady stays false
  // 4. Trigger effect can't fire → streaming never starts
  useEffect(() => {
    if (effectiveThreadId && effectiveThreadId !== lastHydratedThreadIdRef.current) {
      rlog.trigger('thread-change', `Reset hydration refs: ${lastHydratedThreadIdRef.current?.slice(-8) ?? 'null'} → ${effectiveThreadId.slice(-8)}`);
      hasHydratedToAiSdkRef.current = false;
      lastHydratedThreadIdRef.current = effectiveThreadId;
    }
  }, [effectiveThreadId]);

  useEffect(() => {
    if (
      !hasHydratedToAiSdkRef.current
      && storeHasInitiallyLoaded
      && storeMessages.length > 0
      && chat.messages.length === 0
    ) {
      rlog.trigger('hydrate-exec', `SYNCING ${storeMessages.length} msgs to AI SDK`);
      chat.setMessages(structuredClone(storeMessages) as UIMessage[]);
      hasHydratedToAiSdkRef.current = true;
    }
  }, [storeHasInitiallyLoaded, storeMessages, chat]);

  // P0 streaming trigger - only triggers first participant when waitingToStartStreaming is set
  const hasTriggeredRef = useRef(false);
  const lastTriggerKeyRef = useRef<string | null>(null);

  // ✅ CRITICAL FIX: Reset trigger refs when thread changes
  // Without this, the dedupe check could block legitimate triggers for new threads
  const lastTriggeredThreadIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (effectiveThreadId && effectiveThreadId !== lastTriggeredThreadIdRef.current) {
      rlog.trigger('thread-change', `Reset trigger refs: ${lastTriggeredThreadIdRef.current?.slice(-8) ?? 'null'} → ${effectiveThreadId.slice(-8)}`);
      hasTriggeredRef.current = false;
      lastTriggerKeyRef.current = null;
      lastTriggeredThreadIdRef.current = effectiveThreadId;
    }
  }, [effectiveThreadId]);

  useEffect(() => {
    // Guard: Need to be waiting to start streaming
    if (!waitingToStartStreaming) {
      return;
    }

    // ✅ GUARD: Don't trigger if resumption is in progress
    // Resumption handles setting up the round state correctly
    if (isResumingStream) {
      rlog.trigger('skip-resuming', `blocked - resumption in progress`);
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

    // ✅ FIX: Get FRESH participants from store.getState() to avoid stale useShallow data
    // The useShallow selector `participants` may be stale due to React batched updates.
    // When auto-mode changes participants, form-actions calls updateParticipants() but
    // the selector might not have propagated yet when this effect fires.
    const freshState = store.getState();
    const freshParticipants = freshState.participants;
    const selectorEnabledCount = countEnabledParticipants(participants);
    const freshEnabledCount = countEnabledParticipants(freshParticipants);

    // Log divergence for debugging - this catches the race condition
    if (selectorEnabledCount !== freshEnabledCount) {
      rlog.trigger('stale-selector-detected', `r${roundNumber} selector=${selectorEnabledCount} fresh=${freshEnabledCount} - using fresh`);
    }

    // Use the fresh count, not the potentially stale selector count
    const enabledCount = freshEnabledCount;

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
            // ✅ FIX: Get fresh count again at callback time (state may have changed)
            const callbackState = store.getState();
            const callbackEnabledCount = countEnabledParticipants(callbackState.participants);
            rlog.handoff('queue-triggered', `r${roundNumber} START_ROUND queued, enabledCount=${callbackEnabledCount}`);
            // ✅ NOW enable subscriptions - DB has been updated with enableWebSearch=true
            store.getState().startRound(roundNumber, callbackEnabledCount);
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

      // ✅ FIX: Use fresh participants for chat.startRound, not stale selector
      chat.startRound(freshParticipants, storeMessages);
      rlog.handoff('P0-triggered', `r${roundNumber} AI SDK startRound called with ${freshParticipants.length} participants`);

      // Clear the waiting flag
      store.getState().setWaitingToStartStreaming(false);
    }
  }, [
    waitingToStartStreaming,
    isResumingStream,
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
  // MODERATOR STREAM
  // ============================================================================
  // NOTE: Moderator streaming is handled by useRoundSubscription's moderator
  // subscription (SSE-based pub/sub). Per FLOW_DOCUMENTATION.md:
  // - "Frontend NEVER decides what happens next"
  // - "Frontend ONLY subscribes and displays"
  // The backend queue (queueTriggerModerator) triggers moderator generation.
  // Frontend subscribes via GET /stream/moderator to receive chunks.
  // No POST trigger needed - that would violate the backend-first architecture.

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

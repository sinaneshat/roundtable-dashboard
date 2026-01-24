/**
 * Synchronous Store Hydration for SSR
 *
 * Uses useLayoutEffect to hydrate the store after initial render but before paint.
 * This ensures the store has data immediately available while avoiding the
 * "Cannot update a component while rendering" React error.
 *
 * Usage: Call this hook FIRST in your screen component, before any useChatStore calls.
 */

import type { ChatMode, ScreenMode } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { useLayoutEffect, useRef } from 'react';

import { useChatStoreApi } from '@/components/providers/chat-store-provider/context';
import { rlog } from '@/lib/utils/dev-logger';
import type { ApiChangelog, ChatParticipant, ChatThread, StoredPreSearch, ThreadStreamResumptionState } from '@/services/api';

export type SyncHydrateOptions = {
  mode: ScreenMode;
  thread?: ChatThread | null;
  participants?: ChatParticipant[];
  initialMessages?: UIMessage[];
  chatMode?: ChatMode | null;
  streamResumptionState?: ThreadStreamResumptionState | null;
  /** Pre-search data hydrated from server for resumption */
  initialPreSearches?: StoredPreSearch[];
  /** Changelog items hydrated from server for SSR persistence */
  initialChangelog?: ApiChangelog[];
};

/**
 * Hydrate the chat store with SSR data using useLayoutEffect.
 *
 * CRITICAL: Call this hook BEFORE any useChatStore calls in your component.
 * Uses useLayoutEffect to run hydration after render but before paint,
 * avoiding the "Cannot update a component while rendering" React error.
 *
 * The hook is idempotent - it only hydrates if:
 * 1. Store hasn't been initialized yet (hasInitiallyLoaded=false)
 * 2. OR we're navigating to a different thread
 */
export function useSyncHydrateStore(options: SyncHydrateOptions): void {
  const {
    mode,
    thread,
    participants = [],
    initialMessages = [],
    streamResumptionState,
    initialPreSearches,
    initialChangelog,
  } = options;

  const storeApi = useChatStoreApi();
  const hasHydrated = useRef(false);
  const prevThreadIdRef = useRef<string | undefined>(undefined);

  // Track thread ID to detect navigation
  const threadId = thread?.id;

  useLayoutEffect(() => {
    // Reset hydration flag when threadId changes
    if (prevThreadIdRef.current !== threadId) {
      hasHydrated.current = false;
      prevThreadIdRef.current = threadId;
    }

    const state = storeApi.getState();
    const isInitialized = state.hasInitiallyLoaded;
    const isSameThread = threadId && (state.thread?.id === threadId || state.createdThreadId === threadId);
    const storeMessages = state.messages || [];

    rlog.sync('hydrate-check', `props=${thread?.slug ?? '-'}(${initialMessages.length}msg) store=${state.thread?.slug ?? '-'}(${storeMessages.length}msg) init=${isInitialized} same=${isSameThread} hydrated=${hasHydrated.current}`);
    rlog.init('hydrate-data', `propMsgs=${initialMessages.length} propParts=${participants.length} storeMsgs=${storeMessages.length}`);

    // Skip if already initialized for this thread
    if (isInitialized && isSameThread && hasHydrated.current) {
      rlog.sync('hydrate-skip', 'already initialized for this thread');
      return;
    }

    // ✅ CRITICAL FIX: Skip if store already has MORE messages than SSR data
    // This prevents re-initialization with stale SSR data after navigation/remount
    const storeHasMoreData = isSameThread && storeMessages.length > initialMessages.length;
    if (storeHasMoreData) {
      rlog.init('sync-hydrate', `skip: store has more data (store=${storeMessages.length} > ssr=${initialMessages.length})`);
      hasHydrated.current = true;
      return;
    }

    // Skip if no thread data to hydrate
    if (!thread) {
      rlog.sync('hydrate-skip', 'no thread data');
      return;
    }

    // ✅ FIX: Skip if data is shell (empty participants/messages)
    // Prevents useThreadNavigation's cache pre-population from causing empty store
    const isShellData = participants.length === 0 && initialMessages.length === 0;
    if (isShellData) {
      rlog.sync('hydrate-skip', 'shell data (empty participants/messages)');
      return;
    }

    // Skip if a form submission is in progress (PATCH flow)
    const hasActiveFormSubmission
      = state.configChangeRoundNumber !== null
        || state.isWaitingForChangelog
        || state.isPatchInProgress
        || state.pendingMessage !== null;

    if (hasActiveFormSubmission) {
      rlog.init('sync-hydrate', `skip: active form submission t=${threadId?.slice(-8) ?? '-'}`);
      return;
    }

    // Skip if already hydrated this mount
    if (hasHydrated.current && isSameThread) {
      return;
    }

    rlog.init('sync-hydrate', `hydrating t=${threadId?.slice(-8) ?? '-'} parts=${participants.length} msgs=${initialMessages.length} phase=${streamResumptionState?.currentPhase ?? '-'}`);

    // Set screen mode first
    state.setScreenMode(mode);

    // ✅ SCOPE VERSIONING: Set resumption scope BEFORE prefilling resumption state
    // This establishes the thread context for resumption effects to validate against
    if (threadId) {
      state.setResumptionScope(threadId);
    }

    // Prefill stream resumption state if present (BEFORE initializeThread)
    if (threadId && streamResumptionState) {
      const skipPrefillDueToFormSubmission = state.isPatchInProgress
        || state.configChangeRoundNumber !== null
        || state.isWaitingForChangelog
        || state.pendingMessage !== null;

      // ✅ SCOPE VALIDATION: Verify thread context is still current before prefilling
      // This prevents stale prefill data from being applied after navigation
      const currentScope = storeApi.getState().resumptionScopeThreadId;

      rlog.resume('prefill-check', `phase=${streamResumptionState.currentPhase} round=${streamResumptionState.roundNumber} skipForm=${skipPrefillDueToFormSubmission} scopeMatch=${currentScope === threadId}`);

      if (!skipPrefillDueToFormSubmission && currentScope === threadId) {
        rlog.resume('prefill-apply', `applying resumption state phase=${streamResumptionState.currentPhase} round=${streamResumptionState.roundNumber} partIdx=${streamResumptionState.nextParticipantToTrigger}`);
        state.prefillStreamResumptionState(threadId, streamResumptionState);
      } else {
        rlog.resume('prefill-skip', `skipForm=${skipPrefillDueToFormSubmission} scopeMatch=${currentScope === threadId}`);
      }
    } else if (threadId) {
      rlog.resume('prefill-none', 'no streamResumptionState provided');
    }

    // Initialize thread with SSR data
    state.initializeThread(thread, participants, initialMessages);

    const afterState = storeApi.getState();
    rlog.sync('hydrate-done', `slug=${afterState.thread?.slug ?? '-'} msgs=${afterState.messages.length} parts=${participants.length}`);
    rlog.init('hydrate-after', `msgs=${afterState.messages.length} parts=${afterState.participants.length}`);

    // ✅ CRITICAL FIX: Set pre-searches into store for resumption
    // Without this, streaming trigger finds no pre-search for current round
    if (initialPreSearches?.length) {
      state.setPreSearches(initialPreSearches);
      rlog.init('sync-hydrate', `set ${initialPreSearches.length} pre-searches into store`);
    }

    // ✅ FIX: Hydrate changelog into store for persistence across thread navigation
    // Without this, changelog is lost when navigating away and back to a thread
    if (initialChangelog?.length) {
      state.setChangelogItems(initialChangelog);
      rlog.init('sync-hydrate', `set ${initialChangelog.length} changelog items into store`);
    }

    hasHydrated.current = true;
  }, [storeApi, mode, thread, threadId, participants, initialMessages, streamResumptionState, initialPreSearches, initialChangelog]);
}

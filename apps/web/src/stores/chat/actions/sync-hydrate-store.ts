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

  // Track thread ID to detect navigation
  const threadId = thread?.id;

  useLayoutEffect(() => {
    // Get current store state
    const state = storeApi.getState();

    const currentThreadId = state.thread?.id || state.createdThreadId;
    const isSameThread = threadId && currentThreadId === threadId;
    const isInitialized = state.hasInitiallyLoaded;
    const storeMessages = state.messages || [];

    // Skip if already initialized for this thread
    if (isInitialized && isSameThread) {
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

    // Skip if no data to hydrate
    if (!thread || participants.length === 0) {
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
      if (!skipPrefillDueToFormSubmission && currentScope === threadId) {
        state.prefillStreamResumptionState(threadId, streamResumptionState);
      }
    }

    // Initialize thread with SSR data
    state.initializeThread(thread, participants, initialMessages);

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

  // Reset hydration flag when thread changes
  useLayoutEffect(() => {
    hasHydrated.current = false;
  }, [threadId]);
}

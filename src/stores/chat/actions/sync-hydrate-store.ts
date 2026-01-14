/**
 * Synchronous Store Hydration for SSR
 *
 * Zustand v5 SSR pattern: Store must be hydrated BEFORE first render reads from it.
 * Without this, first paint shows empty/loading state, then useEffect populates store.
 *
 * This hook runs synchronously during render phase (not in useEffect) to ensure
 * the store has data before any useChatStore selectors read from it.
 *
 * Usage: Call this hook FIRST in your screen component, before any useChatStore calls.
 */

'use client';

import type { UIMessage } from 'ai';

import type { ChatMode, ScreenMode } from '@/api/core/enums';
import { ScreenModes } from '@/api/core/enums';
import type { ChatParticipant, ChatThread, ThreadStreamResumptionState } from '@/api/routes/chat/schema';
import { useChatStoreApi } from '@/components/providers/chat-store-provider/context';
import { rlog } from '@/lib/utils/dev-logger';

export type SyncHydrateOptions = {
  mode: ScreenMode;
  thread?: ChatThread | null;
  participants?: ChatParticipant[];
  initialMessages?: UIMessage[];
  chatMode?: ChatMode | null;
  streamResumptionState?: ThreadStreamResumptionState | null;
};

/**
 * Synchronously hydrate the chat store with SSR data.
 *
 * CRITICAL: Call this hook BEFORE any useChatStore calls in your component.
 * This ensures the store has data on first render, eliminating the flash.
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
  } = options;

  const storeApi = useChatStoreApi();

  // Get current store state synchronously
  const state = storeApi.getState();

  const threadId = thread?.id;
  const currentThreadId = state.thread?.id || state.createdThreadId;
  const isSameThread = threadId && currentThreadId === threadId;
  const isInitialized = state.hasInitiallyLoaded;

  // Skip if already initialized for this thread
  if (isInitialized && isSameThread) {
    return;
  }

  // Skip if no data to hydrate
  if (!thread || participants.length === 0) {
    return;
  }

  // Skip if a form submission is in progress (PATCH flow)
  // These flags indicate handleUpdateThreadAndSend is managing state
  const hasActiveFormSubmission
    = state.configChangeRoundNumber !== null
      || state.isWaitingForChangelog
      || state.isPatchInProgress
      || state.pendingMessage !== null;

  if (hasActiveFormSubmission) {
    rlog.init('sync-hydrate', `skip: active form submission t=${threadId?.slice(-8) ?? '-'}`);
    return;
  }

  rlog.init('sync-hydrate', `hydrating t=${threadId?.slice(-8) ?? '-'} parts=${participants.length} msgs=${initialMessages.length} phase=${streamResumptionState?.currentPhase ?? '-'}`);

  // Set screen mode first
  state.setScreenMode(mode);

  // Prefill stream resumption state if present (BEFORE initializeThread)
  // This ensures initializeThread sees the correct resumption state
  if (threadId && streamResumptionState) {
    const skipPrefillDueToFormSubmission = state.isPatchInProgress
      || state.configChangeRoundNumber !== null
      || state.isWaitingForChangelog
      || state.pendingMessage !== null;

    if (!skipPrefillDueToFormSubmission) {
      state.prefillStreamResumptionState(threadId, streamResumptionState);
    }
  }

  // Initialize thread with SSR data synchronously
  state.initializeThread(thread, participants, initialMessages);

  // For public/read-only mode, set the read-only flag
  if (mode === ScreenModes.PUBLIC) {
    // Already handled by setScreenMode which sets isReadOnly based on mode
  }
}

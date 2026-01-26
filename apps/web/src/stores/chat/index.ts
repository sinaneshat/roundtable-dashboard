/**
 * Chat Store Public API - Minimal Rewrite
 */

// Store
import type { UIMessage } from 'ai';
import { useLayoutEffect, useRef } from 'react';

import { useChatStoreApi } from '@/components/providers/chat-store-provider/context';
import { chatParticipantsToConfig } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import type { ApiChangelog, ChatParticipant, ChatThread, StoredPreSearch } from '@/services/api';

export type { ChatStoreApi } from './store';
export { createChatStore } from './store';

// Schemas & Types
export type {
  AttachmentsState,
  ChangelogState,
  ChatPhase,
  ChatStore,
  ChatStoreActions,
  ChatStoreState,
  EntityStatus,
  EntitySubscriptionStateType,
  FeedbackState,
  FormState,
  PreSearchState,
  SubscriptionState,
  ThreadState,
  TitleAnimationPhase,
  TitleAnimationState,
  TrackingState,
  UIState,
} from './store-schemas';
export {
  ChatPhases,
  ChatPhaseSchema,
  ChatPhaseValues,
  EntityStatusSchema,
  EntityStatusValues,
} from './store-schemas';

// Defaults
export {
  DEFAULT_PRESET_MODE,
  DEFAULT_PRESET_PARTICIPANTS,
  FORM_DEFAULTS,
  STORE_DEFAULTS,
  SUBSCRIPTION_DEFAULTS,
} from './store-defaults';

// Actions (kept files)
export type { UseAutoModeAnalysisReturn } from './actions/auto-mode-actions';
export { useAutoModeAnalysis } from './actions/auto-mode-actions';
export type { UseFeedbackActionsOptions, UseFeedbackActionsReturn } from './actions/feedback-actions';
export { useFeedbackActions } from './actions/feedback-actions';
export type { AttachmentInfo, UseChatFormActionsReturn } from './actions/form-actions';
export { useChatFormActions } from './actions/form-actions';
export { useNavigationReset } from './actions/navigation-reset';
export type { UseOverviewActionsOptions, UseOverviewActionsReturn } from './actions/overview-actions';
export { useOverviewActions } from './actions/overview-actions';
export type { UseThreadActionsOptions, UseThreadActionsReturn } from './actions/thread-actions';
export { useThreadActions } from './actions/thread-actions';

// Cache validation utilities
export type {
  InfiniteQueryCache,
  PaginatedPageCache,
  ThreadDetailCacheData,
  ThreadDetailPayloadCache,
  ThreadDetailResponseCache,
  ThreadsListCachePage,
} from './actions/types';
export {
  ChatThreadCacheSchema,
  validateInfiniteQueryCache,
  validateThreadDetailCache,
  validateThreadDetailPayloadCache,
  validateThreadDetailResponseCache,
  validateThreadsListPages,
} from './actions/types';

// ============================================================================
// UTILITY EXPORTS
// Helper functions and hooks used by screens
// ============================================================================

/** Get moderator message for round */
export function getModeratorMessageForRound<T>(
  messages: T[],
  roundNumber: number,
): T | undefined {
  if (!Array.isArray(messages)) {
    return undefined;
  }
  return messages.find((m: unknown) => {
    const msg = m as { metadata?: { isModerator?: boolean; roundNumber?: number } };
    return msg?.metadata?.isModerator === true && msg?.metadata?.roundNumber === roundNumber;
  });
}

type SyncHydrateOptions = {
  thread: ChatThread;
  participants: ChatParticipant[];
  initialMessages: UIMessage[];
  initialPreSearches?: StoredPreSearch[];
  initialChangelog?: ApiChangelog[];
};

/**
 * Sync hydrate store hook - hydrates store from server data on SSR/refresh
 * Uses useLayoutEffect to ensure data is in store BEFORE first paint
 */
export function useSyncHydrateStore(options: SyncHydrateOptions): void {
  const storeApi = useChatStoreApi();
  const hasHydratedRef = useRef(false);
  const threadIdRef = useRef<string | null>(null);

  // Use layoutEffect for synchronous hydration before paint
  useLayoutEffect(() => {
    const { initialChangelog, initialMessages, initialPreSearches, participants, thread } = options;

    const state = storeApi.getState();
    const enabledCount = participants.filter(p => p.isEnabled).length;

    rlog.init('useSyncHydrateStore', `tid=${thread.id.slice(-8)} curTid=${state.thread?.id?.slice(-8) ?? '-'} curPhase=${state.phase} r=${state.currentRoundNumber} streaming=${state.isStreaming} msgs=${initialMessages.length} pCount=${enabledCount} hydrated=${hasHydratedRef.current} prevTid=${threadIdRef.current?.slice(-8) ?? '-'}`);

    // Skip if already hydrated for this thread
    if (hasHydratedRef.current && threadIdRef.current === thread.id) {
      rlog.init('useSyncHydrateStore', 'SKIP: already hydrated for this thread');
      return;
    }

    // CRITICAL FIX: Skip hydration during active or pending streaming for same thread
    // This happens when navigating from overview to newly created thread
    // - waitingToStartStreaming=true means streaming is about to start
    // - isStreaming=true means streaming is in progress
    const isStreamingPending = state.waitingToStartStreaming;
    const isStreamingActive = state.isStreaming;
    if ((isStreamingPending || isStreamingActive) && state.thread?.id === thread.id) {
      rlog.phase('useSyncHydrateStore', `SKIP: pending=${isStreamingPending} active=${isStreamingActive} phase=${state.phase}`);
      hasHydratedRef.current = true;
      threadIdRef.current = thread.id;
      return;
    }

    rlog.init('useSyncHydrateStore', `HYDRATING tid=${thread.id.slice(-8)}`);

    // Hydrate thread, participants, and messages
    state.initializeThread(thread, participants, initialMessages);

    // Sync participant configs to form state
    const participantConfigs = chatParticipantsToConfig(participants);
    state.setSelectedParticipants(participantConfigs);
    state.setSelectedMode(thread.mode);
    state.setEnableWebSearch(thread.enableWebSearch);

    // Hydrate pre-searches if provided
    if (initialPreSearches && initialPreSearches.length > 0) {
      rlog.presearch('hydrate', `${initialPreSearches.length} pre-searches`);
      state.setPreSearches(initialPreSearches);
    }

    // Hydrate changelog if provided
    if (initialChangelog && initialChangelog.length > 0) {
      rlog.changelog('hydrate', `${initialChangelog.length} items`);
      state.setChangelogItems(initialChangelog);
    }

    // Mark as loaded
    state.setHasInitiallyLoaded(true);
    state.setShowInitialUI(false);

    hasHydratedRef.current = true;
    threadIdRef.current = thread.id;
    rlog.init('useSyncHydrateStore', `COMPLETE tid=${thread.id.slice(-8)}`);
  }, [storeApi, options]);
}

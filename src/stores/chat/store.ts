/**
 * Unified Chat Store - Zustand v5 Best Practices
 *
 * ============================================================================
 * ZUSTAND V5 PATTERN - OFFICIAL NEXT.JS BEST PRACTICES
 * ============================================================================
 * ✅ Vanilla store (createStore) for per-instance isolation
 * ✅ Factory function for SSR-safe store creation
 * ✅ Context provider for store distribution
 * ✅ Complete type inference from Zod schemas
 * ✅ StateCreator with proper middleware typing
 * ✅ Slice pattern for logical organization
 *
 * CONSOLIDATES:
 * - chat-context.tsx: AI SDK state
 * - chat-thread-state-context.tsx: UI state
 *
 * ============================================================================
 * PERFORMANCE OPTIMIZATIONS (Zustand Best Practices)
 * ============================================================================
 *
 * 1. SEPARATED FLAG SLICES:
 *    - FlagsSlice: Flags that trigger re-renders (loading states, config changes)
 *
 *    WHY: Reduces unnecessary re-renders by only subscribing to UI-relevant flags
 *    USAGE:
 *      // UI flags (triggers re-renders)
 *      const isRegenerating = useChatStore(s => s.isRegenerating)
 *
 * 2. BATCHED SELECTORS WITH useShallow:
 *    WHY: Multiple individual selectors = multiple store subscriptions
 *    BEST PRACTICE: Batch related state with useShallow to prevent object reference re-renders
 *
 *    BEFORE (causes re-renders on any state change):
 *      const inputValue = useChatStore(s => s.inputValue)
 *      const selectedMode = useChatStore(s => s.selectedMode)
 *      const selectedParticipants = useChatStore(s => s.selectedParticipants)
 *
 *    AFTER (only re-renders when these specific values change):
 *      const formState = useChatStore(useShallow(s => ({
 *        inputValue: s.inputValue,
 *        selectedMode: s.selectedMode,
 *        selectedParticipants: s.selectedParticipants,
 *      })))
 *
 * 3. SUBSCRIBE PATTERN FOR TRANSIENT UPDATES:
 *    WHY: Frequent updates that don't need UI re-renders
 *    USE: store.subscribe() for ref-based access
 *
 * ============================================================================
 * SLICE ORGANIZATION
 * ============================================================================
 * - FormSlice: Form input, mode, participants
 * - FeedbackSlice: Round feedback (like/dislike)
 * - UISlice: Initial UI, thread creation, streaming flags
 * - PreSearchSlice: Pre-search results
 * - ThreadSlice: Thread data, participants, messages, AI SDK methods
 * - FlagsSlice: Loading states that need re-renders
 * - DataSlice: Round numbers, pending messages
 * - TrackingSlice: Deduplication and tracking
 * - CallbacksSlice: Completion and retry callbacks
 * - ScreenSlice: Screen mode and readonly state
 * - OperationsActions: Composite operations
 *
 * PATTERN: Slices + Vanilla + Context (official Next.js pattern)
 * TYPES: All inferred from Zod schemas in store-schemas.ts
 */

import type { UIMessage } from 'ai';
import { castDraft, enableMapSet } from 'immer';
import type { StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createStore } from 'zustand/vanilla';

import type { ChatMode, ScreenMode } from '@/api/core/enums';
import { ChatModeSchema, DEFAULT_CHAT_MODE, MessagePartTypes, MessageRoles, MessageStatuses, RoundPhases, ScreenModes, StreamStatuses, UploadStatuses } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import type { ChatParticipant, ChatThread } from '@/db/validation';
import type { FilePreview, UploadItem } from '@/hooks/utils';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { getEnabledSortedParticipants, getRoundNumber, isObject, shouldPreSearchTimeout, sortByPriority } from '@/lib/utils';

import type { SendMessage, StartRound } from './store-action-types';
import {
  ANIMATION_DEFAULTS,
  ATTACHMENTS_DEFAULTS,
  CALLBACKS_DEFAULTS,
  COMPLETE_RESET_STATE,
  DATA_DEFAULTS,
  FEEDBACK_DEFAULTS,
  FLAGS_DEFAULTS,
  FORM_DEFAULTS,
  MODERATOR_STATE_RESET,
  PENDING_MESSAGE_STATE_RESET,
  PRESEARCH_DEFAULTS,
  REGENERATION_STATE_RESET,
  SCREEN_DEFAULTS,
  STREAM_RESUMPTION_DEFAULTS,
  STREAM_RESUMPTION_STATE_RESET,
  STREAMING_STATE_RESET,
  THREAD_DEFAULTS,
  THREAD_NAVIGATION_RESET_STATE,
  THREAD_RESET_STATE,
  TRACKING_DEFAULTS,
  UI_DEFAULTS,
} from './store-defaults';
import type {
  AnimationSlice,
  AttachmentsSlice,
  CallbacksSlice,
  ChatStore,
  DataSlice,
  FeedbackSlice,
  FlagsSlice,
  FormSlice,
  OperationsActions,
  PreSearchSlice,
  ScreenSlice,
  StreamResumptionPrefillUpdate,
  StreamResumptionSlice,
  ThreadSlice,
  TrackingSlice,
  UISlice,
} from './store-schemas';

// Enable Map/Set support for Immer (required for feedbackByRound, preSearchActivityTimes, etc.)
enableMapSet();

// ============================================================================
// TYPES FROM SCHEMAS (Single Source of Truth)
// ============================================================================

/**
 * Type alias for slice StateCreator with Zustand middleware chain
 * Reduces ~45 lines of boilerplate across 15 slices
 */
type SliceCreator<S> = StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  S
>;

// ============================================================================
// SLICE IMPLEMENTATIONS - Using Zustand v5 StateCreator Pattern
// ============================================================================

/**
 * Form Slice - Chat form state and actions
 * Handles user input, mode selection, participant management
 */
const createFormSlice: SliceCreator<FormSlice> = (set, _get) => ({
  ...FORM_DEFAULTS,

  setInputValue: (value: string) =>
    set({ inputValue: value }, false, 'form/setInputValue'),
  setSelectedMode: (mode: ChatMode | null) =>
    set({ selectedMode: mode }, false, 'form/setSelectedMode'),
  setSelectedParticipants: (participants: ParticipantConfig[]) =>
    set({ selectedParticipants: participants }, false, 'form/setSelectedParticipants'),
  setEnableWebSearch: (enabled: boolean) =>
    set({ enableWebSearch: enabled }, false, 'form/setEnableWebSearch'),
  setModelOrder: (modelIds: string[]) =>
    set({ modelOrder: modelIds }, false, 'form/setModelOrder'),
  // ✅ IMMER: Direct mutations instead of spread patterns
  addParticipant: (participant: ParticipantConfig) =>
    set((draft) => {
      if (!draft.selectedParticipants.some(p => p.modelId === participant.modelId)) {
        draft.selectedParticipants.push({ ...participant, priority: draft.selectedParticipants.length });
      }
    }, false, 'form/addParticipant'),
  removeParticipant: (participantId: string) =>
    set((draft) => {
      const idx = draft.selectedParticipants.findIndex(p => p.id === participantId || p.modelId === participantId);
      if (idx !== -1) {
        draft.selectedParticipants.splice(idx, 1);
        draft.selectedParticipants.forEach((p, i) => {
          p.priority = i;
        });
      }
    }, false, 'form/removeParticipant'),
  updateParticipant: (participantId: string, updates: Partial<ParticipantConfig>) =>
    set((draft) => {
      const p = draft.selectedParticipants.find(p => p.id === participantId || p.modelId === participantId);
      if (p)
        Object.assign(p, updates);
    }, false, 'form/updateParticipant'),
  reorderParticipants: (fromIndex: number, toIndex: number) =>
    set((draft) => {
      const [removed] = draft.selectedParticipants.splice(fromIndex, 1);
      if (removed) {
        draft.selectedParticipants.splice(toIndex, 0, removed);
        draft.selectedParticipants.forEach((p, i) => {
          p.priority = i;
        });
      }
    }, false, 'form/reorderParticipants'),
  resetForm: () =>
    set(FORM_DEFAULTS, false, 'form/resetForm'),
});

/**
 * Feedback Slice - Round feedback state
 * Manages like/dislike feedback for chat rounds
 */
const createFeedbackSlice: SliceCreator<FeedbackSlice> = set => ({
  ...FEEDBACK_DEFAULTS,

  setFeedback: (roundNumber, type) =>
    set((draft) => {
      draft.feedbackByRound.set(roundNumber, type);
    }, false, 'feedback/setFeedback'),
  setPendingFeedback: feedback =>
    set({ pendingFeedback: feedback }, false, 'feedback/setPendingFeedback'),
  loadFeedbackFromServer: data =>
    set({
      feedbackByRound: new Map(data.map(f => [f.roundNumber, f.feedbackType])),
      hasLoadedFeedback: true,
    }, false, 'feedback/loadFeedbackFromServer'),
});

/**
 * UI Slice - UI state flags
 * Controls initial UI display, thread creation, and streaming states
 */
const createUISlice: SliceCreator<UISlice> = set => ({
  ...UI_DEFAULTS,

  setShowInitialUI: (show: boolean) =>
    set({ showInitialUI: show }, false, 'ui/setShowInitialUI'),
  setWaitingToStartStreaming: (waiting: boolean) =>
    set({ waitingToStartStreaming: waiting }, false, 'ui/setWaitingToStartStreaming'),
  setIsCreatingThread: (creating: boolean) =>
    set({ isCreatingThread: creating }, false, 'ui/setIsCreatingThread'),
  setCreatedThreadId: (id: string | null) =>
    set({ createdThreadId: id }, false, 'ui/setCreatedThreadId'),
  resetUI: () =>
    set(UI_DEFAULTS, false, 'ui/resetUI'),
});

/**
 * PreSearch Slice - Pre-search state
 * Manages web search results that precede participant responses
 */
const createPreSearchSlice: SliceCreator<PreSearchSlice> = (set, get) => ({
  ...PRESEARCH_DEFAULTS,

  setPreSearches: (preSearches: StoredPreSearch[]) => {
    set({ preSearches }, false, 'preSearch/setPreSearches');
  },
  // ✅ IMMER: Direct mutations + race condition fix
  addPreSearch: (preSearch: StoredPreSearch) =>
    set((draft) => {
      const existingIndex = draft.preSearches.findIndex(
        ps => ps.threadId === preSearch.threadId && ps.roundNumber === preSearch.roundNumber,
      );

      if (existingIndex !== -1) {
        const existing = draft.preSearches[existingIndex];
        if (!existing)
          return;

        // Race condition fix: STREAMING > PENDING (provider wins over orchestrator)
        if (existing.status === MessageStatuses.PENDING && preSearch.status === MessageStatuses.STREAMING) {
          Object.assign(existing, preSearch, { status: MessageStatuses.STREAMING });
        }
        // Otherwise skip duplicate
        return;
      }

      draft.preSearches.push(preSearch);
    }, false, 'preSearch/addPreSearch'),
  updatePreSearchData: (roundNumber, data) =>
    set((draft) => {
      draft.preSearches.forEach((ps) => {
        if (ps.roundNumber === roundNumber) {
          ps.searchData = data;
          ps.status = MessageStatuses.COMPLETE;
        }
      });
    }, false, 'preSearch/updatePreSearchData'),
  /** ✅ PROGRESSIVE UI: Update searchData WITHOUT changing status (for streaming updates) */
  updatePartialPreSearchData: (roundNumber, partialData) =>
    set((draft) => {
      draft.preSearches.forEach((ps) => {
        if (ps.roundNumber === roundNumber) {
          const existingSummary = ps.searchData?.summary ?? '';
          ps.searchData = {
            queries: partialData.queries,
            results: partialData.results.map(r => ({
              query: r.query,
              answer: r.answer,
              results: r.results.map(item => ({
                title: item.title,
                url: item.url,
                content: item.content ?? '',
                excerpt: item.excerpt,
                score: 0, // Default score for streaming - replaced on completion
              })),
              responseTime: r.responseTime,
              index: r.index,
            })),
            summary: partialData.summary ?? existingSummary,
            successCount: partialData.results.length,
            failureCount: 0,
            totalResults: partialData.totalResults ?? partialData.results.length,
            totalTime: partialData.totalTime ?? 0,
          };
        }
      });
    }, false, 'preSearch/updatePartialPreSearchData'),
  updatePreSearchStatus: (roundNumber, status) =>
    set((draft) => {
      draft.preSearches.forEach((ps) => {
        if (ps.roundNumber === roundNumber)
          ps.status = status;
      });
    }, false, 'preSearch/updatePreSearchStatus'),
  removePreSearch: roundNumber =>
    set((draft) => {
      const idx = draft.preSearches.findIndex(ps => ps.roundNumber === roundNumber);
      if (idx !== -1)
        draft.preSearches.splice(idx, 1);
    }, false, 'preSearch/removePreSearch'),
  clearAllPreSearches: () =>
    set({
      ...PRESEARCH_DEFAULTS,
      triggeredPreSearchRounds: new Set<number>(),
    }, false, 'preSearch/clearAllPreSearches'),
  checkStuckPreSearches: () =>
    set((draft) => {
      const now = Date.now();
      draft.preSearches.forEach((ps) => {
        if (ps.status !== MessageStatuses.STREAMING && ps.status !== MessageStatuses.PENDING)
          return;
        const lastActivityTime = draft.preSearchActivityTimes.get(ps.roundNumber);
        if (shouldPreSearchTimeout(ps, lastActivityTime, now)) {
          ps.status = MessageStatuses.COMPLETE;
        }
      });
    }, false, 'preSearch/checkStuckPreSearches'),

  updatePreSearchActivity: roundNumber =>
    set((draft) => {
      draft.preSearchActivityTimes.set(roundNumber, Date.now());
    }, false, 'preSearch/updatePreSearchActivity'),

  getPreSearchActivityTime: roundNumber => get().preSearchActivityTimes.get(roundNumber),

  clearPreSearchActivity: roundNumber =>
    set((draft) => {
      draft.preSearchActivityTimes.delete(roundNumber);
    }, false, 'preSearch/clearPreSearchActivity'),
});

/**
 * Thread Slice - Chat thread data
 * Manages thread, participants, messages, and AI SDK method bindings
 */
const createThreadSlice: SliceCreator<ThreadSlice> = (set, get) => ({
  ...THREAD_DEFAULTS,

  setThread: (thread: ChatThread | null) =>
    set({
      thread,
      ...(thread ? { enableWebSearch: thread.enableWebSearch } : {}),
    }, false, 'thread/setThread'),
  setParticipants: (participants: ChatParticipant[]) =>
    set({ participants: sortByPriority(participants) }, false, 'thread/setParticipants'),
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => {
    const prevMessages = get().messages;
    const newMessages = typeof messages === 'function' ? messages(prevMessages) : messages;

    const mergedMessages = newMessages.map((newMsg) => {
      const existingMsg = prevMessages.find(m => m.id === newMsg.id);
      if (!existingMsg)
        return newMsg;

      const existingHasContent = existingMsg.parts?.some(
        p => p.type === MessagePartTypes.TEXT && 'text' in p && p.text,
      );
      const newHasContent = newMsg.parts?.some(
        p => p.type === MessagePartTypes.TEXT && 'text' in p && p.text,
      );

      const existingIsComplete = isObject(existingMsg.metadata) && 'finishReason' in existingMsg.metadata;
      const newIsComplete = isObject(newMsg.metadata) && 'finishReason' in newMsg.metadata;

      // Note: Moderator content leak protection and duplication detection are handled
      // in use-message-sync.ts during sync operations (page refresh, resumption).
      // Store merging should allow normal streaming updates to proceed without blocking.

      if (existingHasContent && !newHasContent) {
        return {
          ...newMsg,
          parts: existingMsg.parts,
        };
      }

      if (existingIsComplete && !newIsComplete && existingHasContent) {
        return {
          ...newMsg,
          parts: existingMsg.parts,
          metadata: existingMsg.metadata,
        };
      }

      return newMsg;
    });

    set({ messages: mergedMessages }, false, 'thread/setMessages');
  },
  setIsStreaming: (isStreaming: boolean) =>
    set({ isStreaming }, false, 'thread/setIsStreaming'),
  setCurrentParticipantIndex: (currentParticipantIndex: number) =>
    set({ currentParticipantIndex }, false, 'thread/setCurrentParticipantIndex'),
  setError: (error: Error | null) =>
    set({ error }, false, 'thread/setError'),
  setSendMessage: (fn?: SendMessage) =>
    set({ sendMessage: fn }, false, 'thread/setSendMessage'),
  setStartRound: (fn?: StartRound) =>
    set({ startRound: fn }, false, 'thread/setStartRound'),
  setChatSetMessages: (fn?: ((messages: UIMessage[]) => void)) =>
    set({ chatSetMessages: fn }, false, 'thread/setChatSetMessages'),
  checkStuckStreams: () =>
    set((state) => {
      if (!state.isStreaming)
        return state;
      return { isStreaming: false };
    }, false, 'thread/checkStuckStreams'),
});

/**
 * Flags Slice - Loading and processing flags
 * Boolean flags that trigger UI re-renders (loading states, config changes)
 */
const createFlagsSlice: SliceCreator<FlagsSlice> = set => ({
  ...FLAGS_DEFAULTS,

  setHasInitiallyLoaded: (value: boolean) =>
    set({ hasInitiallyLoaded: value }, false, 'flags/setHasInitiallyLoaded'),
  setIsRegenerating: (value: boolean) =>
    set({ isRegenerating: value }, false, 'flags/setIsRegenerating'),
  setIsModeratorStreaming: (value: boolean) =>
    set({ isModeratorStreaming: value }, false, 'flags/setIsModeratorStreaming'),
  completeModeratorStream: () =>
    set({
      isModeratorStreaming: false,
      isWaitingForChangelog: false,
    }, false, 'flags/completeModeratorStream'),
  setIsWaitingForChangelog: (value: boolean) =>
    set({ isWaitingForChangelog: value }, false, 'flags/setIsWaitingForChangelog'),
  setHasPendingConfigChanges: (value: boolean) =>
    set({ hasPendingConfigChanges: value }, false, 'flags/setHasPendingConfigChanges'),
});

/**
 * Data Slice - Transient data state
 * Round numbers, pending messages, and expected participant IDs
 */
const createDataSlice: SliceCreator<DataSlice> = (set, _get) => ({
  ...DATA_DEFAULTS,

  setRegeneratingRoundNumber: (value: number | null) =>
    set({ regeneratingRoundNumber: value }, false, 'data/setRegeneratingRoundNumber'),
  setPendingMessage: (value: string | null) =>
    set({ pendingMessage: value }, false, 'data/setPendingMessage'),
  setPendingAttachmentIds: (value: string[] | null) =>
    set({ pendingAttachmentIds: value }, false, 'data/setPendingAttachmentIds'),
  setExpectedParticipantIds: (value: string[] | null) =>
    set({ expectedParticipantIds: value }, false, 'data/setExpectedParticipantIds'),
  setStreamingRoundNumber: (value: number | null) =>
    set({ streamingRoundNumber: value }, false, 'data/setStreamingRoundNumber'),
  setCurrentRoundNumber: (value: number | null) =>
    set({ currentRoundNumber: value }, false, 'data/setCurrentRoundNumber'),
});

/**
 * Tracking Slice - Deduplication tracking
 * Tracks which rounds have had moderators/pre-searches created to prevent duplicates
 */
const createTrackingSlice: SliceCreator<TrackingSlice> = (set, get) => ({
  ...TRACKING_DEFAULTS,

  setHasSentPendingMessage: value =>
    set({ hasSentPendingMessage: value }, false, 'tracking/setHasSentPendingMessage'),
  markModeratorCreated: roundNumber =>
    set((draft) => {
      draft.createdModeratorRounds.add(roundNumber);
    }, false, 'tracking/markModeratorCreated'),
  hasModeratorBeenCreated: roundNumber =>
    get().createdModeratorRounds.has(roundNumber),
  tryMarkModeratorCreated: (roundNumber) => {
    const state = get();
    if (state.createdModeratorRounds.has(roundNumber)) {
      return false;
    }
    set((draft) => {
      draft.createdModeratorRounds.add(roundNumber);
    }, false, 'tracking/tryMarkModeratorCreated');
    return true;
  },
  clearModeratorTracking: roundNumber =>
    set((draft) => {
      draft.createdModeratorRounds.delete(roundNumber);
    }, false, 'tracking/clearModeratorTracking'),
  markPreSearchTriggered: roundNumber =>
    set((draft) => {
      draft.triggeredPreSearchRounds.add(roundNumber);
    }, false, 'tracking/markPreSearchTriggered'),
  hasPreSearchBeenTriggered: roundNumber =>
    get().triggeredPreSearchRounds.has(roundNumber),
  tryMarkPreSearchTriggered: (roundNumber) => {
    const state = get();
    if (state.triggeredPreSearchRounds.has(roundNumber)) {
      return false;
    }
    set((draft) => {
      draft.triggeredPreSearchRounds.add(roundNumber);
    }, false, 'tracking/tryMarkPreSearchTriggered');
    return true;
  },
  clearPreSearchTracking: roundNumber =>
    set((draft) => {
      draft.triggeredPreSearchRounds.delete(roundNumber);
    }, false, 'tracking/clearPreSearchTracking'),
  clearAllPreSearchTracking: () =>
    set((draft) => {
      draft.triggeredPreSearchRounds = new Set<number>();
    }, false, 'tracking/clearAllPreSearchTracking'),
  markModeratorStreamTriggered: (moderatorMessageId, roundNumber) =>
    set((draft) => {
      draft.triggeredModeratorIds.add(moderatorMessageId);
      draft.triggeredModeratorRounds.add(roundNumber);
    }, false, 'tracking/markModeratorStreamTriggered'),
  hasModeratorStreamBeenTriggered: (moderatorMessageId, roundNumber) => {
    const state = get();
    return state.triggeredModeratorIds.has(moderatorMessageId) || state.triggeredModeratorRounds.has(roundNumber);
  },
  clearModeratorStreamTracking: roundNumber =>
    set((draft) => {
      draft.triggeredModeratorRounds.delete(roundNumber);
      for (const id of draft.triggeredModeratorIds) {
        if (id.includes(`-${roundNumber}-`) || id.includes(`round-${roundNumber}`)) {
          draft.triggeredModeratorIds.delete(id);
        }
      }
    }, false, 'tracking/clearModeratorStreamTracking'),
  setHasEarlyOptimisticMessage: value =>
    set({ hasEarlyOptimisticMessage: value }, false, 'tracking/setHasEarlyOptimisticMessage'),
});

/**
 * Callbacks Slice - Event callbacks
 * Completion and retry callbacks for streaming events
 */
const createCallbacksSlice: SliceCreator<CallbacksSlice> = set => ({
  ...CALLBACKS_DEFAULTS,

  setOnComplete: (callback?: () => void) =>
    set({ onComplete: callback }, false, 'callbacks/setOnComplete'),
});

/**
 * Screen Slice - Screen mode state
 * Tracks current screen mode (overview/thread/public) and read-only state
 */
const createScreenSlice: SliceCreator<ScreenSlice> = set => ({
  ...SCREEN_DEFAULTS,

  setScreenMode: (mode: ScreenMode | null) =>
    set({
      screenMode: mode,
      isReadOnly: mode === ScreenModes.PUBLIC,
    }, false, 'screen/setScreenMode'),
  resetScreenMode: () =>
    set(SCREEN_DEFAULTS, false, 'screen/resetScreenMode'),
});

/**
 * Stream Resumption Slice - Background stream continuation
 * Manages state for resuming streams when user navigates away
 */
const createStreamResumptionSlice: SliceCreator<StreamResumptionSlice> = (set, get) => ({
  ...STREAM_RESUMPTION_DEFAULTS,

  setStreamResumptionState: state =>
    set({ streamResumptionState: state }, false, 'streamResumption/setStreamResumptionState'),

  needsStreamResumption: () => {
    const state = get();
    const resumptionState = state.streamResumptionState;

    // No resumption state
    if (!resumptionState)
      return false;

    // Stream must be ACTIVE to need resumption
    if (resumptionState.state !== StreamStatuses.ACTIVE)
      return false;

    // Must match current thread
    const currentThreadId = state.thread?.id || state.createdThreadId;
    if (!currentThreadId || resumptionState.threadId !== currentThreadId)
      return false;

    // Check if stale (>1 hour old)
    if (state.isStreamResumptionStale())
      return false;

    // Check if valid (participant index in bounds)
    if (!state.isStreamResumptionValid())
      return false;

    return true;
  },

  isStreamResumptionStale: () => {
    const resumptionState = get().streamResumptionState;
    if (!resumptionState)
      return false;

    const ONE_HOUR_MS = 60 * 60 * 1000;
    // ✅ FIX: Handle both Date and string (API returns strings, runtime may use Date)
    const createdAtTime = resumptionState.createdAt instanceof Date
      ? resumptionState.createdAt.getTime()
      : new Date(resumptionState.createdAt).getTime();
    const age = Date.now() - createdAtTime;
    return age > ONE_HOUR_MS;
  },

  isStreamResumptionValid: () => {
    const state = get();
    const resumptionState = state.streamResumptionState;
    if (!resumptionState)
      return false;

    // Check if participant index is valid
    const participantCount = state.participants.length;
    if (resumptionState.participantIndex >= participantCount)
      return false;

    // Check if thread ID matches
    const currentThreadId = state.thread?.id || state.createdThreadId;
    if (!currentThreadId || resumptionState.threadId !== currentThreadId)
      return false;

    return true;
  },

  handleResumedStreamComplete: (_roundNumber, participantIndex) => {
    const state = get();
    const participantCount = state.participants.length;
    const nextIndex = participantIndex + 1;
    const hasMoreParticipants = nextIndex < participantCount;

    // ✅ RACE CONDITION FIX: Set waitingToStartStreaming when advancing to next participant
    // Previously only set nextParticipantToTrigger, but the provider effect requires BOTH
    // nextParticipantToTrigger !== null AND waitingToStartStreaming === true to trigger.
    // Without setting waitingToStartStreaming, the next participant would never be triggered.
    set({
      streamResumptionState: null,
      nextParticipantToTrigger: hasMoreParticipants ? nextIndex : null,
      waitingToStartStreaming: hasMoreParticipants,
    }, false, 'streamResumption/handleResumedStreamComplete');
  },

  handleStreamResumptionFailure: (_error) => {
    set({
      streamResumptionState: null,
      nextParticipantToTrigger: null,
      resumptionAttempts: new Set<string>(),
    }, false, 'streamResumption/handleStreamResumptionFailure');
  },

  setNextParticipantToTrigger: (index: number | null) =>
    set({ nextParticipantToTrigger: index }, false, 'streamResumption/setNextParticipantToTrigger'),

  markResumptionAttempted: (roundNumber, participantIndex) => {
    const key = `${roundNumber}_${participantIndex}`;
    if (get().resumptionAttempts.has(key))
      return false;
    set((draft) => {
      draft.resumptionAttempts.add(key);
    }, false, 'streamResumption/markResumptionAttempted');
    return true;
  },

  needsMessageSync: () => {
    const resumptionState = get().streamResumptionState;
    if (!resumptionState)
      return false;

    // Need to sync if stream completed but we don't have the message
    return resumptionState.state === StreamStatuses.COMPLETED;
  },

  clearStreamResumption: () =>
    set({
      streamResumptionState: null,
      resumptionAttempts: new Set<string>(),
      nextParticipantToTrigger: null,
      streamResumptionPrefilled: false,
      prefilledForThreadId: null,
      // ✅ UNIFIED PHASES: Clear phase-based resumption state
      currentResumptionPhase: null,
      preSearchResumption: null,
      moderatorResumption: null,
      resumptionRoundNumber: null,
    }, false, 'streamResumption/clearStreamResumption'),

  // ✅ PHASE TRANSITION FIX: Clear pre-search state when transitioning to participants
  // This prevents stale preSearchResumption.status: 'streaming' when pre-search is actually complete
  transitionToParticipantsPhase: () =>
    set({
      currentResumptionPhase: RoundPhases.PARTICIPANTS,
      preSearchResumption: null,
    }, false, 'streamResumption/transitionToParticipantsPhase'),

  // ✅ PHASE TRANSITION FIX: Transition from participants to moderator phase
  // Called when all participants are complete but moderator hasn't started
  // This handles the case where server prefilled 'participants' phase but all are done
  transitionToModeratorPhase: (roundNumber?: number) =>
    set({
      currentResumptionPhase: RoundPhases.MODERATOR,
      // ✅ FIX: Also set isModeratorStreaming to trigger the moderator trigger hook
      // The hook requires BOTH currentResumptionPhase='moderator' AND isModeratorStreaming=true
      isModeratorStreaming: true,
      // ✅ BUG FIX: Must set resumptionRoundNumber or moderator trigger effect exits early
      // Without this, isModeratorStreaming blocks normal flow but resumption can't run either
      ...(roundNumber !== undefined && { resumptionRoundNumber: roundNumber }),
    }, false, 'streamResumption/transitionToModeratorPhase'),

  // ✅ RESUMABLE STREAMS: Pre-fill store with server-side KV state
  // Called during SSR to set up state BEFORE AI SDK resume runs
  // ✅ UNIFIED PHASES: Now handles pre-search, participants, and moderator phases
  prefillStreamResumptionState: (threadId, serverState) => {
    // If round is complete or idle, no prefill needed
    if (serverState.roundComplete || serverState.currentPhase === RoundPhases.COMPLETE || serverState.currentPhase === RoundPhases.IDLE) {
      return;
    }

    // Build the state update based on current phase
    // ✅ TYPE-SAFE: Uses explicit type instead of Record<string, unknown>
    const stateUpdate: StreamResumptionPrefillUpdate = {
      streamResumptionPrefilled: true,
      prefilledForThreadId: threadId,
      currentResumptionPhase: serverState.currentPhase,
      resumptionRoundNumber: serverState.roundNumber,
    };

    // Handle phase-specific state
    switch (serverState.currentPhase) {
      case RoundPhases.PRE_SEARCH:
        // Pre-search phase needs resumption
        if (serverState.preSearch) {
          stateUpdate.preSearchResumption = {
            enabled: serverState.preSearch.enabled,
            status: serverState.preSearch.status,
            streamId: serverState.preSearch.streamId,
            preSearchId: serverState.preSearch.preSearchId,
          };
        }
        stateUpdate.waitingToStartStreaming = true;
        break;

      case RoundPhases.PARTICIPANTS:
        // Participants phase needs resumption
        stateUpdate.nextParticipantToTrigger = serverState.participants.nextParticipantToTrigger;
        // If there's a next participant to trigger, set waitingToStartStreaming
        // This enables the provider effect to trigger the continuation
        stateUpdate.waitingToStartStreaming = serverState.participants.nextParticipantToTrigger !== null;
        break;

      case RoundPhases.MODERATOR:
        // Moderator phase needs resumption
        if (serverState.moderator) {
          stateUpdate.moderatorResumption = {
            status: serverState.moderator.status,
            streamId: serverState.moderator.streamId,
            moderatorMessageId: serverState.moderator.moderatorMessageId,
          };
        }
        stateUpdate.waitingToStartStreaming = true;
        // ✅ FIX: Set isModeratorStreaming so moderator trigger hook activates
        // The moderator trigger requires BOTH currentResumptionPhase='moderator' AND isModeratorStreaming=true
        stateUpdate.isModeratorStreaming = true;
        break;
    }

    set(stateUpdate, false, 'streamResumption/prefillStreamResumptionState');
  },
});

/**
 * Animation Slice - Animation completion tracking
 * Tracks pending animations per participant to ensure sequential completion
 */
const createAnimationSlice: SliceCreator<AnimationSlice> = (set, get) => ({
  ...ANIMATION_DEFAULTS,

  registerAnimation: participantIndex =>
    set((draft) => {
      draft.pendingAnimations.add(participantIndex);
    }, false, 'animation/registerAnimation'),

  completeAnimation: participantIndex =>
    set((draft) => {
      draft.pendingAnimations.delete(participantIndex);
      const resolver = draft.animationResolvers.get(participantIndex);
      if (resolver) {
        resolver();
        draft.animationResolvers.delete(participantIndex);
      }
    }, false, 'animation/completeAnimation'),

  waitForAnimation: (participantIndex: number) => {
    const state = get();

    // If animation is not pending, resolve immediately
    if (!state.pendingAnimations.has(participantIndex)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      set((current) => {
        const newResolvers = new Map(current.animationResolvers);
        newResolvers.set(participantIndex, resolve);
        return { animationResolvers: newResolvers };
      }, false, 'animation/waitForAnimationPromise');
    });
  },

  // ✅ FIX: Wait for ALL pending animations to complete
  // This ensures sequential execution with no overlapping animations
  // Used by provider handleComplete to wait for all participant animations before creating moderator
  waitForAllAnimations: async () => {
    const state = get();
    const pendingIndices = Array.from(state.pendingAnimations);

    if (pendingIndices.length === 0) {
      return Promise.resolve();
    }

    // Add timeout to prevent indefinite blocking.
    // If animations don't complete within 5 seconds, force-clear them and continue.
    // This prevents moderator creation from being blocked forever by stuck animations.
    const ANIMATION_TIMEOUT_MS = 5000;

    const animationPromises = pendingIndices.map(index => state.waitForAnimation(index));

    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        // Force-clear all pending animations on timeout
        set({
          pendingAnimations: new Set<number>(),
          animationResolvers: new Map<number, () => void>(),
        }, false, 'animation/waitForAllAnimations-timeout');
        resolve();
      }, ANIMATION_TIMEOUT_MS);
    });

    // Race between animation completion and timeout
    await Promise.race([
      Promise.all(animationPromises),
      timeoutPromise,
    ]);
  },

  clearAnimations: () =>
    set({
      ...ANIMATION_DEFAULTS,
    }, false, 'animation/clearAnimations'),
});

/**
 * Attachments Slice - File attachment management
 * Manages pending file attachments for chat input before message submission
 */
const createAttachmentsSlice: SliceCreator<AttachmentsSlice> = (set, get) => ({
  ...ATTACHMENTS_DEFAULTS,

  // ✅ IMMER: Direct mutations instead of spread patterns
  addAttachments: (files: File[]) =>
    set((draft) => {
      files.forEach((file) => {
        draft.pendingAttachments.push({
          id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          file,
          status: UploadStatuses.PENDING,
        });
      });
    }, false, 'attachments/addAttachments'),

  removeAttachment: (id: string) =>
    set((draft) => {
      const idx = draft.pendingAttachments.findIndex(a => a.id === id);
      if (idx !== -1)
        draft.pendingAttachments.splice(idx, 1);
    }, false, 'attachments/removeAttachment'),

  clearAttachments: () =>
    set({ pendingAttachments: [] }, false, 'attachments/clearAttachments'),

  updateAttachmentUpload: (id: string, uploadItem: UploadItem) =>
    set((draft) => {
      const attachment = draft.pendingAttachments.find(a => a.id === id);
      if (attachment)
        attachment.uploadItem = castDraft(uploadItem);
    }, false, 'attachments/updateAttachmentUpload'),

  updateAttachmentPreview: (id: string, preview: FilePreview) =>
    set((draft) => {
      const attachment = draft.pendingAttachments.find(a => a.id === id);
      if (attachment)
        attachment.preview = preview;
    }, false, 'attachments/updateAttachmentPreview'),

  getAttachments: () => get().pendingAttachments,

  hasAttachments: () => get().pendingAttachments.length > 0,
});

/**
 * Operations Slice - Composite operations
 * Complex multi-slice operations (reset, initialization, streaming lifecycle)
 */
const createOperationsSlice: SliceCreator<OperationsActions> = (set, get) => ({
  resetThreadState: () =>
    set(THREAD_RESET_STATE, false, 'operations/resetThreadState'),

  /**
   * ✅ CRITICAL FIX: Reset for thread-to-thread navigation
   *
   * Called when navigating BETWEEN threads (e.g., /chat/thread-1 → /chat/thread-2)
   * Unlike resetThreadState which only clears flags, this ALSO clears:
   * - thread, participants, messages (previous thread data)
   * - summaries, preSearches (previous thread content)
   * - createdThreadId (prevents confusion with new thread)
   *
   * This prevents the critical bug where stale messages/participants from
   * a previous thread leak into a new thread, causing participant ID mismatches.
   *
   * @see THREAD_NAVIGATION_RESET_STATE in store-defaults.ts
   */
  resetForThreadNavigation: () => {
    const state = get();

    // Clear AI SDK hook's internal messages via chatSetMessages
    // Without this, the AI SDK hook retains old messages that get synced back to store
    // This is the root cause of the state leakage bug
    state.chatSetMessages?.([]);

    // Apply the navigation reset state
    set({
      ...THREAD_NAVIGATION_RESET_STATE,
      createdModeratorRounds: new Set<number>(),
      triggeredPreSearchRounds: new Set<number>(),
      triggeredModeratorRounds: new Set<number>(),
      triggeredModeratorIds: new Set<string>(),
      resumptionAttempts: new Set<string>(),
      pendingAnimations: new Set<number>(),
      animationResolvers: new Map(),
      preSearchActivityTimes: new Map<number, number>(),
    }, false, 'operations/resetForThreadNavigation');
  },

  resetToOverview: () => {
    const state = get();

    // Clear AI SDK hook's internal messages via chatSetMessages
    // Without this, the AI SDK hook retains old messages that get synced back to store
    // after resetToOverview clears store.messages to [], causing state leakage
    state.chatSetMessages?.([]);

    set({
      ...COMPLETE_RESET_STATE,
      // Set screenMode to 'overview' instead of null.
      // This prevents race condition where provider effect waits for screenMode='overview'
      // but useScreenInitialization hasn't run yet to set it.
      screenMode: ScreenModes.OVERVIEW,
      createdModeratorRounds: new Set(),
      triggeredPreSearchRounds: new Set(),
      triggeredModeratorRounds: new Set(),
      triggeredModeratorIds: new Set(),
    }, false, 'operations/resetToOverview');
  },

  initializeThread: (thread: ChatThread, participants: ChatParticipant[], initialMessages?: UIMessage[]) => {
    const currentState = get();

    // ✅ CRITICAL FIX: Preserve existing messages during navigation
    // When navigating from overview to thread screen after round 0 completes:
    // 1. Overview screen has live messages from streaming session in store
    // 2. Thread screen receives SSR initialMessages (potentially stale)
    // 3. We must NOT overwrite live messages with stale SSR data
    //
    // RULES:
    // - If store has messages for the SAME thread, preserve them if they're more complete
    // - "More complete" means more messages OR higher max round number
    // - If different thread or empty store, use initialMessages
    //
    // BUG FIX: Previously unconditionally set messages = initialMessages,
    // which caused round 0 data to be lost when navigating from overview to thread
    const isSameThread = currentState.thread?.id === thread.id || currentState.createdThreadId === thread.id;
    const storeMessages = currentState.messages;
    const newMessages = initialMessages || [];

    let messagesToSet: UIMessage[];

    if (isSameThread && storeMessages.length > 0) {
      // Same thread - compare completeness
      // ✅ TYPE-SAFE: Use getRoundNumber utility instead of forced type casting
      const storeMaxRound = storeMessages.reduce((max, m) => {
        const round = getRoundNumber(m.metadata) ?? 0;
        return Math.max(max, round);
      }, 0);

      const newMaxRound = newMessages.reduce((max, m) => {
        const round = getRoundNumber(m.metadata) ?? 0;
        return Math.max(max, round);
      }, 0);

      // Preserve store messages if they have more rounds OR more messages in same round
      if (storeMaxRound > newMaxRound || (storeMaxRound === newMaxRound && storeMessages.length >= newMessages.length)) {
        messagesToSet = storeMessages;
      } else {
        messagesToSet = newMessages;
      }
    } else {
      // Different thread or empty store - use new messages
      messagesToSet = newMessages;
    }

    const sortedParticipants = sortByPriority(participants);

    // ✅ HYDRATION FIX: Convert thread participants to form selectedParticipants
    // This must happen atomically with thread initialization to prevent UI flash
    // where ChatInput shows "Select at least 1 model" before participants sync
    const enabledParticipants = getEnabledSortedParticipants(participants);
    const formParticipants = enabledParticipants.map((p, index) => ({
      id: p.id,
      modelId: p.modelId,
      role: p.role,
      customRoleId: p.customRoleId || undefined,
      priority: index,
    }));

    // ✅ CONSOLIDATED: All thread initialization + reset state in one place
    // Eliminates duplicate useEffects in ChatThreadScreen
    set({
      waitingToStartStreaming: false,
      isRegenerating: false,
      isModeratorStreaming: false,
      isWaitingForChangelog: false,
      hasPendingConfigChanges: false,
      regeneratingRoundNumber: null,
      pendingMessage: null,
      pendingAttachmentIds: null,
      pendingFileParts: null,
      expectedParticipantIds: null,
      streamingRoundNumber: null,
      currentRoundNumber: null,
      hasSentPendingMessage: false,
      createdModeratorRounds: new Set<number>(),
      triggeredPreSearchRounds: new Set<number>(),
      triggeredModeratorRounds: new Set<number>(),
      triggeredModeratorIds: new Set<string>(),
      preSearchActivityTimes: new Map<number, number>(),
      hasEarlyOptimisticMessage: false,
      streamResumptionState: null,
      resumptionAttempts: new Set<string>(),
      nextParticipantToTrigger: null,
      pendingAnimations: new Set<number>(),
      animationResolvers: new Map(),
      // Thread data
      thread,
      participants: sortedParticipants,
      messages: messagesToSet,
      error: null,
      isStreaming: false,
      // Form state sync - use Zod parsing for type safety
      enableWebSearch: thread.enableWebSearch,
      selectedMode: ChatModeSchema.catch(DEFAULT_CHAT_MODE).parse(thread.mode),
      // ✅ HYDRATION FIX: Set selectedParticipants atomically to prevent UI flash
      selectedParticipants: formParticipants,
      // UI state
      showInitialUI: false,
      hasInitiallyLoaded: true,
    }, false, 'operations/initializeThread');
  },

  updateParticipants: (participants: ChatParticipant[]) => {
    set({ participants: sortByPriority(participants) }, false, 'operations/updateParticipants');
  },

  // ✅ Uses ExtendedFilePart from message-schemas.ts (single source of truth for file parts with uploadId)
  prepareForNewMessage: (message: string, participantIds: string[], attachmentIds?: string[], providedFileParts?: ExtendedFilePart[]) =>
    set((draft) => {
      // ✅ TYPE-SAFE: Use helper to avoid deep type inference issues
      // Extract message count for round calculation without full type inference
      const messageCount = draft.messages.length;
      const lastMessage = messageCount > 0 ? draft.messages[messageCount - 1] : null;
      const lastRoundNum = lastMessage ? getRoundNumber(lastMessage.metadata) : null;
      const nextRoundNumber = lastRoundNum !== null ? lastRoundNum + 1 : 0;

      const isOnThreadScreen = draft.screenMode === ScreenModes.THREAD;
      const hasExistingOptimisticMessage = draft.hasEarlyOptimisticMessage;
      const fileParts = providedFileParts || [];

      // ✅ DUPLICATION FIX: Check if optimistic message exists for TARGET round
      // Use explicitly set streamingRoundNumber if available, otherwise calculated nextRoundNumber
      // This handles:
      // - Duplicate calls for same round: streamingRoundNumber is set, check against it
      // - New round after completing previous: new streamingRoundNumber, checks for that round
      const targetRound = draft.streamingRoundNumber ?? nextRoundNumber;
      const hasOptimisticForTargetRound = draft.messages.some(
        (m) => {
          // ✅ TYPE-SAFE: Use type-safe metadata extraction instead of casting
          if (m.role !== MessageRoles.USER)
            return false;
          const roundNumber = getRoundNumber(m.metadata);
          const isOptimistic = m.metadata && typeof m.metadata === 'object' && 'isOptimistic' in m.metadata
            ? m.metadata.isOptimistic
            : false;
          return roundNumber === targetRound && isOptimistic === true;
        },
      );

      draft.waitingToStartStreaming = false;
      draft.isStreaming = false;
      draft.currentParticipantIndex = 0;
      draft.error = null;

      draft.isRegenerating = false;
      draft.regeneratingRoundNumber = null;

      draft.streamResumptionState = null;
      draft.resumptionAttempts = new Set<string>();
      draft.nextParticipantToTrigger = null;

      draft.isModeratorStreaming = false;
      draft.isWaitingForChangelog = true;
      draft.pendingMessage = message;
      draft.pendingAttachmentIds = attachmentIds && attachmentIds.length > 0 ? attachmentIds : null;
      draft.pendingFileParts = fileParts.length > 0 ? fileParts : null;
      draft.expectedParticipantIds = participantIds.length > 0 ? participantIds : draft.expectedParticipantIds;
      draft.hasSentPendingMessage = false;
      draft.hasEarlyOptimisticMessage = false;

      // Preserve or calculate streamingRoundNumber
      draft.streamingRoundNumber = hasExistingOptimisticMessage
        ? draft.streamingRoundNumber
        : (isOnThreadScreen ? nextRoundNumber : null);

      if (isOnThreadScreen && !hasExistingOptimisticMessage && !hasOptimisticForTargetRound) {
        draft.messages.push({
          id: `optimistic-user-${Date.now()}-r${nextRoundNumber}`,
          role: MessageRoles.USER,
          parts: [
            ...fileParts,
            { type: MessagePartTypes.TEXT, text: message },
          ],
          metadata: {
            role: MessageRoles.USER,
            roundNumber: nextRoundNumber,
            isOptimistic: true,
          },
        });
      }
    }, false, 'operations/prepareForNewMessage'),

  completeStreaming: () => {
    const currentState = get();

    // ✅ OPTIMIZATION: Only create new Set/Map if they have items
    // This prevents unnecessary reference changes that trigger re-renders
    // when the collections are already empty
    const needsNewPendingAnimations = currentState.pendingAnimations.size > 0;
    const needsNewAnimationResolvers = currentState.animationResolvers.size > 0;

    set({
      // ✅ TYPE-SAFE: Use reset groups to ensure ALL streaming/moderator flags are cleared
      // This prevents infinite loops when both provider and flow-state-machine call completeStreaming
      ...STREAMING_STATE_RESET,
      ...MODERATOR_STATE_RESET,
      ...PENDING_MESSAGE_STATE_RESET,
      ...REGENERATION_STATE_RESET,
      // ✅ CRITICAL FIX: Clear stale resumption state to prevent blocking UI updates in next round
      // Without this, currentResumptionPhase/resumptionRoundNumber from previous round block progressive streaming
      ...STREAM_RESUMPTION_STATE_RESET,
      // ✅ CRITICAL FIX: Also clear animation state to prevent waitForAllAnimations from blocking
      // If animations are stuck pending when streaming completes, the next round's moderator
      // creation would hang forever waiting for animations that will never complete
      // ✅ OPTIMIZATION: Reuse existing empty collections to avoid unnecessary re-renders
      ...(needsNewPendingAnimations ? { pendingAnimations: new Set<number>() } : {}),
      ...(needsNewAnimationResolvers ? { animationResolvers: new Map<number, () => void>() } : {}),
    }, false, 'operations/completeStreaming');
  },

  startRegeneration: (roundNumber: number) => {
    const { clearModeratorTracking, clearPreSearchTracking, clearModeratorStreamTracking, selectedParticipants } = get();
    clearModeratorTracking(roundNumber);
    clearPreSearchTracking(roundNumber);
    clearModeratorStreamTracking(roundNumber);
    // ✅ FIX: Extract participant IDs from current config before reset
    const participantIds = selectedParticipants.map(p => p.modelId);
    set({
      // ✅ TYPE-SAFE: Clear all streaming state before starting regeneration
      ...STREAMING_STATE_RESET,
      ...MODERATOR_STATE_RESET,
      ...PENDING_MESSAGE_STATE_RESET,
      ...STREAM_RESUMPTION_DEFAULTS, // Clear any pending stream resumption
      // Then set regeneration-specific state
      isRegenerating: true,
      regeneratingRoundNumber: roundNumber,
      // ✅ FIX: Use current participant config, not null from PENDING_MESSAGE_STATE_RESET
      expectedParticipantIds: participantIds.length > 0 ? participantIds : null,
    }, false, 'operations/startRegeneration');
  },

  completeRegeneration: (_roundNumber: number) =>
    set({
      // ✅ TYPE-SAFE: Clear ALL streaming/moderator/pending/regeneration flags
      // This was CRITICAL bug - was only clearing 4 fields, blocking next round
      ...STREAMING_STATE_RESET,
      ...MODERATOR_STATE_RESET,
      ...PENDING_MESSAGE_STATE_RESET,
      ...REGENERATION_STATE_RESET,
    }, false, 'operations/completeRegeneration'),

  /**
   * ✅ NAVIGATION CLEANUP: Reset store to new chat state
   *
   * Called when:
   * - User clicks "New Chat" button
   * - User clicks logo/home link
   * - User navigates to /chat route
   *
   * Ensures complete cleanup:
   * - Clears AI SDK hook messages
   * - Resets all state to defaults
   * - Clears tracking Sets
   */
  resetToNewChat: (preferences) => {
    const state = get();

    // Clear AI SDK hook's internal messages via chatSetMessages
    // Without this, the AI SDK hook retains old messages that get synced back to store
    state.chatSetMessages?.([]);

    // ✅ PREFERENCES RESTORE: Build participants from persisted model IDs
    const selectedParticipants = preferences?.selectedModelIds?.length
      ? preferences.selectedModelIds.map((modelId, index) => ({
          id: modelId,
          modelId,
          role: '' as const,
          priority: index,
        }))
      : FORM_DEFAULTS.selectedParticipants;

    // ✅ PREFERENCES RESTORE: Use persisted mode or default
    const selectedMode = preferences?.selectedMode
      ? (ChatModeSchema.safeParse(preferences.selectedMode).success
          ? ChatModeSchema.parse(preferences.selectedMode)
          : FORM_DEFAULTS.selectedMode)
      : FORM_DEFAULTS.selectedMode;

    // ✅ RESET: Apply complete reset state WITH preserved preferences
    set({
      ...COMPLETE_RESET_STATE,
      // ✅ PREFERENCES: Override form defaults with persisted preferences
      selectedParticipants,
      selectedMode,
      enableWebSearch: preferences?.enableWebSearch ?? FORM_DEFAULTS.enableWebSearch,
      modelOrder: preferences?.modelOrder ?? FORM_DEFAULTS.modelOrder,
      // ✅ CRITICAL FIX: Set screenMode to 'overview' instead of null
      // This prevents race condition where provider effect waits for screenMode='overview'
      // but useScreenInitialization hasn't run yet to set it
      screenMode: ScreenModes.OVERVIEW,
      createdModeratorRounds: new Set(),
      triggeredPreSearchRounds: new Set(),
      triggeredModeratorRounds: new Set(),
      triggeredModeratorIds: new Set(),
    }, false, 'operations/resetToNewChat');
  },

});

// ============================================================================
// STORE FACTORY - Zustand v5 Vanilla Pattern (Official Next.js)
// ============================================================================

/**
 * Creates a new chat store instance using Zustand v5 patterns
 *
 * ✅ PATTERN: Vanilla store (createStore) for per-instance isolation
 * ✅ MIDDLEWARE: Devtools for Redux DevTools integration
 * ✅ SLICES: Logical grouping of related state and actions
 * ✅ TYPE-SAFE: Full type inference from Zod schemas
 *
 * @returns Vanilla Zustand store instance (not a React hook)
 * @see chat-store-provider.tsx - React Context provider
 */
export function createChatStore() {
  const store = createStore<ChatStore>()(
    devtools(
      immer(
        (...args) => ({
          ...createFormSlice(...args),
          ...createFeedbackSlice(...args),
          ...createUISlice(...args),
          ...createPreSearchSlice(...args),
          ...createThreadSlice(...args),
          ...createFlagsSlice(...args),
          ...createDataSlice(...args),
          ...createTrackingSlice(...args),
          ...createCallbacksSlice(...args),
          ...createScreenSlice(...args),
          ...createStreamResumptionSlice(...args),
          ...createAnimationSlice(...args),
          ...createAttachmentsSlice(...args),
          ...createOperationsSlice(...args),
        }),
      ),
      {
        name: 'ChatStore',
        enabled: true,
        anonymousActionType: 'unknown-action',
      },
    ),
  );

  return store;
}

/**
 * Type of the vanilla store instance
 * Used by ChatStoreProvider to type the context value
 */
export type ChatStoreApi = ReturnType<typeof createChatStore>;

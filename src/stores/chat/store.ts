/**
 * Unified Chat Store - Zustand v5
 *
 * Vanilla store + factory pattern for SSR isolation.
 * Types inferred from Zod schemas in store-schemas.ts.
 */

import type { UIMessage } from 'ai';
import { castDraft, enableMapSet } from 'immer';
import type { StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createStore } from 'zustand/vanilla';

import type { ChatMode, ScreenMode } from '@/api/core/enums';
import { ChatModeSchema, DEFAULT_CHAT_MODE, MessagePartTypes, MessageRoles, MessageStatuses, RoundPhases, ScreenModes, StreamStatuses, TextPartStates, UploadStatuses } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import type { ChatParticipant, ChatThread } from '@/db/validation';
import type { FilePreview, UploadItem } from '@/hooks/utils';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { getEnabledSortedParticipants, getParticipantIndex, getRoundNumber, isObject, shouldPreSearchTimeout, sortByPriority } from '@/lib/utils';

import type { SendMessage, StartRound } from './store-action-types';
import type { ResetFormPreferences } from './store-defaults';
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

// Enable immer Map/Set support lazily to avoid module initialization order issues
let immerMapSetEnabled = false;
function ensureMapSetEnabled() {
  if (!immerMapSetEnabled) {
    enableMapSet();
    immerMapSetEnabled = true;
  }
}

type SliceCreator<S> = StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  S
>;

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
  setAutoMode: (enabled: boolean) =>
    set({ autoMode: enabled }, false, 'form/setAutoMode'),
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
  setIsAnalyzingPrompt: (analyzing: boolean) =>
    set({ isAnalyzingPrompt: analyzing }, false, 'ui/setIsAnalyzingPrompt'),
  resetUI: () =>
    set(UI_DEFAULTS, false, 'ui/resetUI'),
});

const createPreSearchSlice: SliceCreator<PreSearchSlice> = (set, get) => ({
  ...PRESEARCH_DEFAULTS,

  setPreSearches: (preSearches: StoredPreSearch[]) => {
    set({ preSearches }, false, 'preSearch/setPreSearches');
  },
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
      // ✅ PERF FIX: Use findIndex + direct access instead of forEach scanning all items
      const idx = draft.preSearches.findIndex(ps => ps.roundNumber === roundNumber);
      if (idx !== -1) {
        draft.preSearches[idx]!.searchData = data;
        draft.preSearches[idx]!.status = MessageStatuses.COMPLETE;
        // ✅ FIX: Set completedAt for timing guards in streaming trigger
        draft.preSearches[idx]!.completedAt = new Date();
      }
    }, false, 'preSearch/updatePreSearchData'),
  updatePartialPreSearchData: (roundNumber, partialData) =>
    set((draft) => {
      // ✅ PERF FIX: Use findIndex + direct access instead of forEach scanning all items
      const idx = draft.preSearches.findIndex(ps => ps.roundNumber === roundNumber);
      if (idx !== -1) {
        const ps = draft.preSearches[idx]!;
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
    }, false, 'preSearch/updatePartialPreSearchData'),
  updatePreSearchStatus: (roundNumber, status) =>
    set((draft) => {
      // ✅ PERF FIX: Use findIndex + direct access instead of forEach scanning all items
      const idx = draft.preSearches.findIndex(ps => ps.roundNumber === roundNumber);
      if (idx !== -1) {
        draft.preSearches[idx]!.status = status;
        // ✅ FIX: Set completedAt when status is COMPLETE for timing guards
        if (status === MessageStatuses.COMPLETE) {
          draft.preSearches[idx]!.completedAt = new Date();
        }
        // ✅ FIX: Removed clearing waitingToStartStreaming on pre-search STREAMING
        // Pre-search streaming is NOT the same as participant streaming
        // waitingToStartStreaming should only clear when actual AI participant streams start
        // The streaming trigger handles this via separate effect watching isStreaming
      }
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

const createThreadSlice: SliceCreator<ThreadSlice> = (set, get) => ({
  ...THREAD_DEFAULTS,

  setThread: (thread: ChatThread | null) => {
    // ✅ UNIFIED FIX: Sync BOTH enableWebSearch AND selectedMode from thread
    // This ensures form state stays in sync with thread after PATCH responses
    // But preserve user's form selections if they have pending config changes
    const currentState = get();
    const shouldSyncFormValues = thread && !currentState.hasPendingConfigChanges;

    set({
      thread,
      ...(shouldSyncFormValues
        ? {
            enableWebSearch: thread.enableWebSearch,
            selectedMode: ChatModeSchema.catch(DEFAULT_CHAT_MODE).parse(thread.mode),
          }
        : {}),
    }, false, 'thread/setThread');
  },
  setParticipants: (participants: ChatParticipant[]) =>
    set({ participants: sortByPriority(participants) }, false, 'thread/setParticipants'),
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => {
    const prevMessages = get().messages;
    const newMessages = typeof messages === 'function' ? messages(prevMessages) : messages;

    // ✅ PERF FIX: Build Map for O(1) lookup instead of O(n) find per message
    // Previously O(n²) - now O(n) with single Map construction pass
    const prevMessagesById = new Map(prevMessages.map(m => [m.id, m]));
    const mergedMessages = newMessages.map((newMsg) => {
      const existingMsg = prevMessagesById.get(newMsg.id);
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

  // ============================================================================
  // STREAMING MESSAGE ACTIONS
  // ============================================================================

  upsertStreamingMessage: (optionsOrMessage) => {
    // Accepts UIMessage directly or { message, insertOnly } options object
    const isOptionsObject = optionsOrMessage !== null
      && typeof optionsOrMessage === 'object'
      && 'message' in optionsOrMessage
      && typeof optionsOrMessage.message === 'object';
    const message = (isOptionsObject
      ? optionsOrMessage.message
      : optionsOrMessage) as UIMessage;
    const insertOnly = isOptionsObject ? optionsOrMessage.insertOnly : undefined;

    set((draft) => {
      const existingIdx = draft.messages.findIndex(m => m.id === message.id);

      if (existingIdx !== -1) {
        // Message exists - update if we have more content
        if (insertOnly) {
          return; // Skip update in insertOnly mode
        }

        const existing = draft.messages[existingIdx];
        const existingHasContent = existing?.parts?.some(
          p => p.type === MessagePartTypes.TEXT && 'text' in p && p.text,
        );
        const newHasContent = message.parts?.some(
          p => p.type === MessagePartTypes.TEXT && 'text' in p && p.text,
        );

        // Only update if new message has content when existing doesn't,
        // or if new message has more content
        if (newHasContent && !existingHasContent) {
          draft.messages[existingIdx] = castDraft(message);
        } else if (newHasContent && existingHasContent) {
          // Both have content - keep newer if it has more text
          // TYPE-SAFE: extractTextFromMessage handles unknown parts via isMessagePart type guard
          const existingTextLength = extractTextFromMessage(existing).length;
          const newTextLength = extractTextFromMessage(message).length;

          if (newTextLength >= existingTextLength) {
            draft.messages[existingIdx] = castDraft(message);
          }
        }
      } else {
        // Message doesn't exist - insert in round order
        const msgRoundNumber = getRoundNumber(message.metadata);

        if (msgRoundNumber === null) {
          // No round number - append to end
          draft.messages.push(castDraft(message));
        } else {
          // Find correct position (after messages from same or earlier rounds)
          let insertIdx = draft.messages.length;
          for (let i = draft.messages.length - 1; i >= 0; i--) {
            const existingRound = getRoundNumber(draft.messages[i]?.metadata);
            if (existingRound !== null && existingRound <= msgRoundNumber) {
              insertIdx = i + 1;
              break;
            }
            if (existingRound === null) {
              insertIdx = i + 1;
              break;
            }
          }
          draft.messages.splice(insertIdx, 0, castDraft(message));
        }
      }
    }, false, 'thread/upsertStreamingMessage');
  },

  finalizeMessageId: (tempId, deterministicId, finalMessage) => {
    set((draft) => {
      const tempIdx = draft.messages.findIndex(m => m.id === tempId);
      const deterministicIdx = draft.messages.findIndex(m => m.id === deterministicId);

      if (tempIdx !== -1 && deterministicIdx === -1) {
        // Replace temp message with final message using deterministic ID
        draft.messages[tempIdx] = castDraft({
          ...finalMessage,
          id: deterministicId,
        });
      } else if (tempIdx !== -1 && deterministicIdx !== -1) {
        // Both exist - keep deterministic, remove temp
        draft.messages.splice(tempIdx, 1);
      } else if (tempIdx === -1 && deterministicIdx === -1) {
        // Neither exists - insert final message
        draft.messages.push(castDraft({
          ...finalMessage,
          id: deterministicId,
        }));
      }
      // If only deterministic exists, nothing to do
    }, false, 'thread/finalizeMessageId');
  },

  deduplicateMessages: () => {
    set((draft) => {
      const seen = new Map<string, number>(); // key -> index
      const toRemove: number[] = [];

      for (let i = 0; i < draft.messages.length; i++) {
        const msg = draft.messages[i];
        if (!msg)
          continue;

        // TYPE-SAFE: Use metadata extraction utilities instead of type casting
        const roundNum = getRoundNumber(msg.metadata);
        const pIdx = getParticipantIndex(msg.metadata);

        if (roundNum === null || pIdx === null)
          continue;
        if (msg.role !== MessageRoles.ASSISTANT)
          continue;

        const key = `r${roundNum}_p${pIdx}`;
        const existingIdx = seen.get(key);

        if (existingIdx !== undefined) {
          // Duplicate found - decide which to keep
          const existing = draft.messages[existingIdx];
          const existingIsDeterministic = existing?.id.includes('_r') && existing.id.includes('_p');
          const newIsDeterministic = msg.id.includes('_r') && msg.id.includes('_p');

          if (newIsDeterministic && !existingIsDeterministic) {
            // Keep new (deterministic), remove existing (temp)
            toRemove.push(existingIdx);
            seen.set(key, i);
          } else {
            // Keep existing, remove new
            toRemove.push(i);
          }
        } else {
          seen.set(key, i);
        }
      }

      // Remove in reverse order to preserve indices
      for (const idx of toRemove.sort((a, b) => b - a)) {
        draft.messages.splice(idx, 1);
      }
    }, false, 'thread/deduplicateMessages');
  },
});

const createFlagsSlice: SliceCreator<FlagsSlice> = set => ({
  ...FLAGS_DEFAULTS,

  setHasInitiallyLoaded: (value: boolean) =>
    set({ hasInitiallyLoaded: value }, false, 'flags/setHasInitiallyLoaded'),
  setIsRegenerating: (value: boolean) =>
    set({ isRegenerating: value }, false, 'flags/setIsRegenerating'),
  setIsModeratorStreaming: (value: boolean) =>
    set({ isModeratorStreaming: value }, false, 'flags/setIsModeratorStreaming'),
  // ⚠️ CRITICAL: Only clear isModeratorStreaming here, NOT isWaitingForChangelog!
  // The changelog blocking flag must ONLY be cleared by use-changelog-sync.ts
  // after the changelog has been fetched. Clearing it here causes pre-search
  // to execute before changelog is fetched, breaking the ordering guarantee:
  // PATCH → changelog → pre-search/streaming
  completeModeratorStream: () =>
    set({
      isModeratorStreaming: false,
    }, false, 'flags/completeModeratorStream'),
  setIsWaitingForChangelog: (value: boolean) =>
    set({ isWaitingForChangelog: value }, false, 'flags/setIsWaitingForChangelog'),
  setHasPendingConfigChanges: (value: boolean) =>
    set({ hasPendingConfigChanges: value }, false, 'flags/setHasPendingConfigChanges'),
  setIsPatchInProgress: (value: boolean) =>
    set({ isPatchInProgress: value }, false, 'flags/setIsPatchInProgress'),
});

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
  setConfigChangeRoundNumber: (value: number | null) =>
    set({ configChangeRoundNumber: value }, false, 'data/setConfigChangeRoundNumber'),
});

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

const createCallbacksSlice: SliceCreator<CallbacksSlice> = set => ({
  ...CALLBACKS_DEFAULTS,

  setOnComplete: (callback?: () => void) =>
    set({ onComplete: callback }, false, 'callbacks/setOnComplete'),
});

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
    const { participants } = state;
    const nextIndex = participantIndex + 1;
    const hasMoreParticipants = nextIndex < participants.length;

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

  setNextParticipantToTrigger: value =>
    set({ nextParticipantToTrigger: value }, false, 'streamResumption/setNextParticipantToTrigger'),

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

  transitionToParticipantsPhase: () =>
    set({
      currentResumptionPhase: RoundPhases.PARTICIPANTS,
      preSearchResumption: null,
    }, false, 'streamResumption/transitionToParticipantsPhase'),

  transitionToModeratorPhase: (roundNumber?: number) =>
    set({
      currentResumptionPhase: RoundPhases.MODERATOR,
      isModeratorStreaming: true,
      ...(roundNumber !== undefined && { resumptionRoundNumber: roundNumber }),
    }, false, 'streamResumption/transitionToModeratorPhase'),

  prefillStreamResumptionState: (threadId, serverState) => {
    // If round is complete or idle, no prefill needed
    if (serverState.roundComplete || serverState.currentPhase === RoundPhases.COMPLETE || serverState.currentPhase === RoundPhases.IDLE) {
      return;
    }

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

      case RoundPhases.PARTICIPANTS: {
        // Participants phase needs resumption
        // Convert server's index-only value to include participant ID for validation
        const serverNextIndex = serverState.participants.nextParticipantToTrigger;
        if (serverNextIndex !== null) {
          const currentParticipants = get().participants;
          const participant = currentParticipants[serverNextIndex];
          if (participant) {
            stateUpdate.nextParticipantToTrigger = {
              index: serverNextIndex,
              participantId: participant.id,
            };
          } else {
            // Participant not found (likely because prefill happens before initializeThread)
            // Store the index as a number for now; it will be validated later
            stateUpdate.nextParticipantToTrigger = serverNextIndex;
          }
        }
        // In PARTICIPANTS phase, we're always waiting to start streaming for resumption
        // Set waitingToStartStreaming regardless of whether nextParticipantToTrigger is set
        // (prefill happens before initializeThread, so participants array may be empty)
        stateUpdate.waitingToStartStreaming = true;
        break;
      }

      case RoundPhases.MODERATOR:
        if (serverState.moderator) {
          stateUpdate.moderatorResumption = {
            status: serverState.moderator.status,
            streamId: serverState.moderator.streamId,
            moderatorMessageId: serverState.moderator.moderatorMessageId,
          };
        }
        stateUpdate.waitingToStartStreaming = true;
        stateUpdate.isModeratorStreaming = true;
        break;
    }

    set(stateUpdate, false, 'streamResumption/prefillStreamResumptionState');
  },
});

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

  waitForAllAnimations: async () => {
    const state = get();
    const pendingIndices = Array.from(state.pendingAnimations);

    if (pendingIndices.length === 0) {
      return Promise.resolve();
    }

    const ANIMATION_TIMEOUT_MS = 5000;

    const animationPromises = pendingIndices.map(index => state.waitForAnimation(index));

    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        set({
          pendingAnimations: new Set<number>(),
          animationResolvers: new Map<number, () => void>(),
        }, false, 'animation/waitForAllAnimationsTimeout');
        resolve();
      }, ANIMATION_TIMEOUT_MS);
    });

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

const createAttachmentsSlice: SliceCreator<AttachmentsSlice> = (set, get) => ({
  ...ATTACHMENTS_DEFAULTS,

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

const createOperationsSlice: SliceCreator<OperationsActions> = (set, get) => ({
  resetThreadState: () =>
    set(THREAD_RESET_STATE, false, 'operations/resetThreadState'),

  resetForThreadNavigation: () => {
    const state = get();
    state.chatSetMessages?.([]);

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
    state.chatSetMessages?.([]);

    set({
      ...COMPLETE_RESET_STATE,
      screenMode: ScreenModes.OVERVIEW,
      createdModeratorRounds: new Set(),
      triggeredPreSearchRounds: new Set(),
      triggeredModeratorRounds: new Set(),
      triggeredModeratorIds: new Set(),
    }, false, 'operations/resetToOverview');
  },

  initializeThread: (thread: ChatThread, participants: ChatParticipant[], initialMessages?: UIMessage[]) => {
    const currentState = get();
    const isSameThread = currentState.thread?.id === thread.id || currentState.createdThreadId === thread.id;
    const storeMessages = currentState.messages;
    const newMessages = initialMessages || [];

    let messagesToSet: UIMessage[];

    if (isSameThread && storeMessages.length > 0) {
      // ✅ BUG FIX: Detect stale streaming parts in store messages
      // After page refresh, store messages from Zustand persist may have stale
      // `state: 'streaming'` parts from an interrupted session. These are NOT
      // actively streaming - they're artifacts of the previous session.
      // Fresh DB messages (newMessages) have complete data with finishReason.
      // If store has any stale streaming parts, ALWAYS prefer DB messages.
      const hasStaleStreamingParts = storeMessages.some(msg =>
        msg.parts?.some(p => 'state' in p && p.state === TextPartStates.STREAMING),
      );

      if (hasStaleStreamingParts && newMessages.length > 0) {
        // Store has stale streaming state - use fresh DB messages
        messagesToSet = newMessages;
      } else {
        // Original logic: Compare round numbers for active streaming scenarios
        const storeMaxRound = storeMessages.reduce((max, m) => {
          const round = getRoundNumber(m.metadata) ?? 0;
          return Math.max(max, round);
        }, 0);

        const newMaxRound = newMessages.reduce((max, m) => {
          const round = getRoundNumber(m.metadata) ?? 0;
          return Math.max(max, round);
        }, 0);

        if (storeMaxRound > newMaxRound || (storeMaxRound === newMaxRound && storeMessages.length >= newMessages.length)) {
          messagesToSet = storeMessages;
        } else {
          messagesToSet = newMessages;
        }
      }
    } else {
      messagesToSet = newMessages;
    }

    const sortedParticipants = sortByPriority(participants);
    const enabledParticipants = getEnabledSortedParticipants(participants);
    const formParticipants = enabledParticipants.map((p, index) => ({
      id: p.id,
      modelId: p.modelId,
      role: p.role,
      customRoleId: p.customRoleId || undefined,
      priority: index,
    }));

    // ✅ BUG FIX: Preserve streaming state during active operations
    // Preserve state when:
    // 1. streamResumptionPrefilled: Server detected incomplete round (resumption)
    // 2. Active form submission: handleUpdateThreadAndSend set up streaming state
    //
    // Active form submission detection (must be specific, not just waitingToStartStreaming):
    // - configChangeRoundNumber !== null: Set by handleUpdateThreadAndSend BEFORE PATCH
    //   This is the key indicator that a form submission is in progress
    // - isWaitingForChangelog: Set AFTER PATCH (always set, cleared by use-changelog-sync)
    //
    // NOTE: waitingToStartStreaming alone is NOT sufficient because it could be stale
    // state from a previous session. configChangeRoundNumber and isWaitingForChangelog
    // are only set during active form submissions and cleared after completion.
    //
    // Without this guard, PATCH response updating thread/participants can trigger
    // initializeThread which would reset all streaming state and break placeholders.
    const isResumption = currentState.streamResumptionPrefilled;
    const hasActiveFormSubmission
      = currentState.configChangeRoundNumber !== null
        || currentState.isWaitingForChangelog;
    const preserveStreamingState = isResumption || hasActiveFormSubmission;
    const resumptionRoundNumber = currentState.resumptionRoundNumber;

    set({
      // ✅ CONDITIONAL: Only reset streaming state if NOT resuming or active submission
      waitingToStartStreaming: preserveStreamingState ? currentState.waitingToStartStreaming : false,
      streamingRoundNumber: preserveStreamingState
        ? (currentState.streamingRoundNumber ?? resumptionRoundNumber)
        : null,
      nextParticipantToTrigger: preserveStreamingState ? currentState.nextParticipantToTrigger : null,
      isModeratorStreaming: preserveStreamingState ? currentState.isModeratorStreaming : false,
      // ✅ FIX: Also preserve changelog-related flags during active submission
      isWaitingForChangelog: preserveStreamingState ? currentState.isWaitingForChangelog : false,
      configChangeRoundNumber: preserveStreamingState ? currentState.configChangeRoundNumber : null,
      // These can always be reset
      isRegenerating: false,
      hasPendingConfigChanges: preserveStreamingState ? currentState.hasPendingConfigChanges : false,
      regeneratingRoundNumber: null,
      // ✅ FIX: Preserve pending message state during active submission
      pendingMessage: preserveStreamingState ? currentState.pendingMessage : null,
      pendingAttachmentIds: preserveStreamingState ? currentState.pendingAttachmentIds : null,
      pendingFileParts: preserveStreamingState ? currentState.pendingFileParts : null,
      expectedParticipantIds: preserveStreamingState ? currentState.expectedParticipantIds : null,
      currentRoundNumber: preserveStreamingState ? currentState.currentRoundNumber : null,
      hasSentPendingMessage: preserveStreamingState ? currentState.hasSentPendingMessage : false,
      // ✅ FIX: Preserve tracking sets during active submission to avoid duplicate triggers
      createdModeratorRounds: preserveStreamingState ? currentState.createdModeratorRounds : new Set<number>(),
      triggeredPreSearchRounds: preserveStreamingState ? currentState.triggeredPreSearchRounds : new Set<number>(),
      triggeredModeratorRounds: preserveStreamingState ? currentState.triggeredModeratorRounds : new Set<number>(),
      triggeredModeratorIds: preserveStreamingState ? currentState.triggeredModeratorIds : new Set<string>(),
      preSearchActivityTimes: preserveStreamingState ? currentState.preSearchActivityTimes : new Map<number, number>(),
      hasEarlyOptimisticMessage: preserveStreamingState ? currentState.hasEarlyOptimisticMessage : false,
      streamResumptionState: preserveStreamingState ? currentState.streamResumptionState : null,
      resumptionAttempts: preserveStreamingState ? currentState.resumptionAttempts : new Set<string>(),
      pendingAnimations: preserveStreamingState ? currentState.pendingAnimations : new Set<number>(),
      animationResolvers: preserveStreamingState ? currentState.animationResolvers : new Map(),
      thread,
      participants: sortedParticipants,
      messages: messagesToSet,
      error: null,
      isStreaming: false,
      // ✅ FIX: Preserve form state if user has pending config changes
      // Without this, toggling web search and then a query refetch would wipe the user's change
      // hasPendingConfigChanges is set when user toggles any config (mode, web search, participants)
      enableWebSearch: currentState.hasPendingConfigChanges ? currentState.enableWebSearch : thread.enableWebSearch,
      selectedMode: currentState.hasPendingConfigChanges
        ? currentState.selectedMode
        : ChatModeSchema.catch(DEFAULT_CHAT_MODE).parse(thread.mode),
      selectedParticipants: currentState.hasPendingConfigChanges ? currentState.selectedParticipants : formParticipants,
      showInitialUI: false,
      hasInitiallyLoaded: true,
    }, false, 'operations/initializeThread');
  },

  updateParticipants: (participants: ChatParticipant[]) => {
    set({ participants: sortByPriority(participants) }, false, 'operations/updateParticipants');
  },

  prepareForNewMessage: (message: string, participantIds: string[], attachmentIds?: string[], providedFileParts?: ExtendedFilePart[]) =>
    set((draft) => {
      const messageCount = draft.messages.length;
      const lastMessage = messageCount > 0 ? draft.messages[messageCount - 1] : null;
      const lastRoundNum = lastMessage ? getRoundNumber(lastMessage.metadata) : null;
      const nextRoundNumber = lastRoundNum !== null ? lastRoundNum + 1 : 0;

      const isOnThreadScreen = draft.screenMode === ScreenModes.THREAD;
      const hasExistingOptimisticMessage = draft.hasEarlyOptimisticMessage;
      const fileParts = providedFileParts || [];

      const targetRound = draft.streamingRoundNumber ?? nextRoundNumber;
      const hasOptimisticForTargetRound = draft.messages.some(
        (m) => {
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
      // ⚠️ NOTE: Do NOT set changelog flags here!
      // prepareForNewMessage is called for:
      // 1. Initial thread creation (via handleCreateThread) - POST doesn't create changelog
      // 2. Incomplete round resumption - changelog was handled when round originally started
      // For subsequent rounds, handleUpdateThreadAndSend sets changelog flags AFTER PATCH
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
    const needsNewPendingAnimations = currentState.pendingAnimations.size > 0;
    const needsNewAnimationResolvers = currentState.animationResolvers.size > 0;

    set({
      ...STREAMING_STATE_RESET,
      ...MODERATOR_STATE_RESET,
      ...PENDING_MESSAGE_STATE_RESET,
      ...REGENERATION_STATE_RESET,
      ...STREAM_RESUMPTION_STATE_RESET,
      ...(needsNewPendingAnimations ? { pendingAnimations: new Set<number>() } : {}),
      ...(needsNewAnimationResolvers ? { animationResolvers: new Map<number, () => void>() } : {}),
    }, false, 'operations/completeStreaming');

    // Clean up any duplicate messages after streaming completes
    // This ensures the store is always in a consistent state
    get().deduplicateMessages();
  },

  startRegeneration: (roundNumber: number) => {
    const { clearModeratorTracking, clearPreSearchTracking, clearModeratorStreamTracking, selectedParticipants } = get();
    clearModeratorTracking(roundNumber);
    clearPreSearchTracking(roundNumber);
    clearModeratorStreamTracking(roundNumber);
    const participantIds = selectedParticipants.map(p => p.modelId);
    set({
      ...STREAMING_STATE_RESET,
      ...MODERATOR_STATE_RESET,
      ...PENDING_MESSAGE_STATE_RESET,
      ...STREAM_RESUMPTION_DEFAULTS,
      isRegenerating: true,
      regeneratingRoundNumber: roundNumber,
      expectedParticipantIds: participantIds.length > 0 ? participantIds : null,
    }, false, 'operations/startRegeneration');
  },

  completeRegeneration: (_roundNumber: number) =>
    set({
      ...STREAMING_STATE_RESET,
      ...MODERATOR_STATE_RESET,
      ...PENDING_MESSAGE_STATE_RESET,
      ...REGENERATION_STATE_RESET,
    }, false, 'operations/completeRegeneration'),

  resetToNewChat: (preferences?: ResetFormPreferences) => {
    const state = get();
    state.chatSetMessages?.([]);

    const selectedParticipants = preferences?.selectedModelIds?.length
      ? preferences.selectedModelIds.map((modelId, index) => ({
          id: modelId,
          modelId,
          role: null,
          priority: index,
        }))
      : FORM_DEFAULTS.selectedParticipants;

    const selectedMode = preferences?.selectedMode
      ? (ChatModeSchema.safeParse(preferences.selectedMode).success
          ? ChatModeSchema.parse(preferences.selectedMode)
          : FORM_DEFAULTS.selectedMode)
      : FORM_DEFAULTS.selectedMode;

    set({
      ...COMPLETE_RESET_STATE,
      selectedParticipants,
      selectedMode,
      enableWebSearch: preferences?.enableWebSearch ?? FORM_DEFAULTS.enableWebSearch,
      modelOrder: preferences?.modelOrder ?? FORM_DEFAULTS.modelOrder,
      screenMode: ScreenModes.OVERVIEW,
      createdModeratorRounds: new Set(),
      triggeredPreSearchRounds: new Set(),
      triggeredModeratorRounds: new Set(),
      triggeredModeratorIds: new Set(),
    }, false, 'operations/resetToNewChat');
  },

});

export function createChatStore() {
  ensureMapSetEnabled();
  const baseStore = createStore<ChatStore>()(
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

  // Wrap getState to return a proxy that provides live access to participants
  // This enables tests to access state.participants after calling setParticipants
  // without needing to call getState() again
  const originalGetState = baseStore.getState.bind(baseStore);
  const store = {
    ...baseStore,
    getState: () => {
      const state = originalGetState();
      return new Proxy(state, {
        get(target, prop, receiver) {
          // For participants, always read from current store state
          if (prop === 'participants') {
            return originalGetState().participants;
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    },
  };

  return store as typeof baseStore;
}

/**
 * Type of the vanilla store instance
 * Used by ChatStoreProvider to type the context value
 */
export type ChatStoreApi = ReturnType<typeof createChatStore>;

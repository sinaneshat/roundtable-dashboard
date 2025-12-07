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
 * - AnalysisSlice: Moderator analyses
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
import { castDraft, current, enableMapSet } from 'immer';
import type { z } from 'zod';
import type { StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createStore } from 'zustand/vanilla';

import type { ScreenMode } from '@/api/core/enums';
import { AnalysisStatuses, ChatModeSchema, DEFAULT_CHAT_MODE, MessagePartTypes, MessageRoles, ScreenModes, StreamStatuses } from '@/api/core/enums';
import type {
  ModeratorAnalysisPayload,
  Recommendation,
  StoredModeratorAnalysis,
  StoredPreSearch,
} from '@/api/routes/chat/schema';
import type { ChatParticipant, ChatThread } from '@/db/validation';
import type { FilePreview } from '@/hooks/utils/use-file-preview';
import type { UploadItem } from '@/hooks/utils/use-file-upload';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { filterToParticipantMessages, getParticipantMessagesWithIds } from '@/lib/utils/message';
import { getParticipantId, getParticipantIndex, getRoundNumber } from '@/lib/utils/metadata';
import { sortByPriority } from '@/lib/utils/participant';
import { calculateNextRoundNumber } from '@/lib/utils/round-utils';
import { shouldPreSearchTimeout } from '@/lib/utils/web-search-utils';

import type { ApplyRecommendedActionOptions } from './actions/recommended-action-application';
import { applyRecommendedAction as applyRecommendedActionLogic } from './actions/recommended-action-application';
import type { SendMessage, StartRound } from './store-action-types';
import {
  ANALYSIS_DEFAULTS,
  ANALYSIS_STATE_RESET,
  ANIMATION_DEFAULTS,
  ATTACHMENTS_DEFAULTS,
  CALLBACKS_DEFAULTS,
  COMPLETE_RESET_STATE,
  DATA_DEFAULTS,
  FEEDBACK_DEFAULTS,
  FLAGS_DEFAULTS,
  FORM_DEFAULTS,
  PENDING_MESSAGE_STATE_RESET,
  PRESEARCH_DEFAULTS,
  REGENERATION_STATE_RESET,
  SCREEN_DEFAULTS,
  STREAM_RESUMPTION_DEFAULTS,
  STREAMING_STATE_RESET,
  THREAD_DEFAULTS,
  THREAD_NAVIGATION_RESET_STATE,
  THREAD_RESET_STATE,
  TRACKING_DEFAULTS,
  UI_DEFAULTS,
} from './store-defaults';
import type {
  AnalysisSlice,
  AnimationSlice,
  AttachmentsSlice,
  CallbacksSlice,
  ChatStore,
  DataSlice,
  FeedbackSlice,
  FlagsSlice,
  FormSlice,
  OperationsActions,
  ParticipantConfig,
  PreSearchSlice,
  ScreenSlice,
  StreamResumptionSlice,
  ThreadSlice,
  TrackingSlice,
  UISlice,
} from './store-schemas';

type ChatMode = z.infer<typeof ChatModeSchema>;

// Enable Map/Set support for Immer (required for feedbackByRound, preSearchActivityTimes, etc.)
enableMapSet();

// ============================================================================
// RE-EXPORT TYPES FROM SCHEMAS (Single Source of Truth)
// ============================================================================

export type { ChatStore } from './store-schemas';

// ============================================================================
// SLICE IMPLEMENTATIONS - Using Zustand v5 StateCreator Pattern
// ============================================================================

/**
 * Form Slice - Chat form state and actions
 * Handles user input, mode selection, participant management
 */
const createFormSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  FormSlice
> = (set, get) => ({
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
      const p = draft.selectedParticipants.find(p => p.id === participantId);
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

  applyRecommendedAction: (action: Recommendation, options?: ApplyRecommendedActionOptions) => {
    // ✅ EXTRACTED: Business logic moved to actions/recommended-action-application.ts
    // Thin wrapper applies updates returned from pure function
    const result = applyRecommendedActionLogic(action, options);

    // ✅ CRITICAL FIX: Check for active conversation at store level
    // This provides a safety net regardless of what the caller passes for preserveThreadState
    const currentState = get();
    const hasActiveConversation = currentState.messages.length > 0
      || currentState.thread !== null
      || currentState.createdThreadId !== null;

    // ✅ PRESERVE THREAD STATE: Don't reset when:
    // 1. Caller explicitly requests preservation (preserveThreadState: true)
    // 2. There's an active conversation (messages, thread, or createdThreadId exists)
    // This ensures clicking recommendations updates the chatbox without losing conversation state
    if (options?.preserveThreadState || hasActiveConversation) {
      // Just apply form updates, don't reset thread state
      set(result.updates, false, 'form/applyRecommendedAction/preserveThread');

      return {
        success: result.success,
        error: result.error,
        modelsAdded: result.modelsAdded,
        modelsSkipped: result.modelsSkipped,
      };
    }

    // No active conversation - apply form updates for new conversation setup
    set(result.updates, false, 'form/applyRecommendedAction');

    // ✅ Return result metadata (updates already applied via set() above)
    return {
      success: result.success,
      error: result.error,
      modelsAdded: result.modelsAdded,
      modelsSkipped: result.modelsSkipped,
    };
  },
});

/**
 * Feedback Slice - Round feedback state
 * Manages like/dislike feedback for chat rounds
 */
const createFeedbackSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  FeedbackSlice
> = set => ({
  ...FEEDBACK_DEFAULTS,

  setFeedback: (roundNumber, type) =>
    set((draft) => {
      draft.feedbackByRound.set(roundNumber, type);
    }, false, 'feedback/setFeedback'),
  setPendingFeedback: feedback =>
    set({ pendingFeedback: feedback }, false, 'feedback/setPendingFeedback'),
  clearFeedback: roundNumber =>
    set((draft) => {
      draft.feedbackByRound.delete(roundNumber);
    }, false, 'feedback/clearFeedback'),
  loadFeedbackFromServer: data =>
    set({
      feedbackByRound: new Map(data.map(f => [f.roundNumber, f.feedbackType])),
      hasLoadedFeedback: true,
    }, false, 'feedback/loadFeedbackFromServer'),
  resetFeedback: () =>
    set(FEEDBACK_DEFAULTS, false, 'feedback/resetFeedback'),
});

/**
 * UI Slice - UI state flags
 * Controls initial UI display, thread creation, and streaming states
 */
const createUISlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  UISlice
> = set => ({
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
 * Analysis Slice - Moderator analysis state
 * Manages pending, streaming, and completed moderator analyses
 */
const createAnalysisSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  AnalysisSlice
> = set => ({
  ...ANALYSIS_DEFAULTS,

  setAnalyses: (analyses: StoredModeratorAnalysis[]) =>
    set({ analyses }, false, 'analysis/setAnalyses'),
  // ✅ IMMER: Direct mutations
  addAnalysis: (analysis: StoredModeratorAnalysis) =>
    set((draft) => {
      // Deduplicate by roundNumber to prevent retrigger bug
      const exists = draft.analyses.some(
        a => a.threadId === analysis.threadId && a.roundNumber === analysis.roundNumber,
      );
      if (!exists) {
        draft.analyses.push(analysis);
      }
    }, false, 'analysis/addAnalysis'),
  updateAnalysisData: (roundNumber: number, data: ModeratorAnalysisPayload) =>
    set((draft) => {
      const a = draft.analyses.find(a => a.roundNumber === roundNumber);
      if (a) {
        // Update mode at analysis level
        const modeResult = ChatModeSchema.safeParse(data.mode);
        if (modeResult.success)
          a.mode = modeResult.data;
        // analysisData excludes roundNumber, mode, userQuestion (stored at analysis level)
        const { roundNumber: _, mode: __, userQuestion: ___, ...analysisContent } = data;
        a.analysisData = analysisContent;
        a.status = AnalysisStatuses.COMPLETE;
      }
    }, false, 'analysis/updateAnalysisData'),
  updateAnalysisStatus: (roundNumber, status) =>
    set((draft) => {
      draft.analyses.forEach((a) => {
        if (a.roundNumber === roundNumber)
          a.status = status;
      });
    }, false, 'analysis/updateAnalysisStatus'),
  updateAnalysisError: (roundNumber, errorMessage) =>
    set((draft) => {
      draft.analyses.forEach((a) => {
        if (a.roundNumber === roundNumber) {
          a.status = AnalysisStatuses.FAILED;
          a.errorMessage = errorMessage;
        }
      });
    }, false, 'analysis/updateAnalysisError'),
  removeAnalysis: roundNumber =>
    set((draft) => {
      const idx = draft.analyses.findIndex(a => a.roundNumber === roundNumber);
      if (idx !== -1)
        draft.analyses.splice(idx, 1);
    }, false, 'analysis/removeAnalysis'),
  clearAllAnalyses: () =>
    set(ANALYSIS_DEFAULTS, false, 'analysis/clearAllAnalyses'),
  createPendingAnalysis: (params: { roundNumber: number; messages: UIMessage[]; userQuestion: string; threadId: string; mode: ChatMode }) => {
    const { roundNumber, messages, userQuestion, threadId, mode: rawMode } = params;

    // Validate and narrow mode type to match database schema
    const modeResult = ChatModeSchema.safeParse(rawMode);
    if (!modeResult.success) {
      return;
    }
    const mode = modeResult.data;

    // ✅ TYPE-SAFE EXTRACTION: Use consolidated utility from message-transforms.ts
    // Replaces unsafe type assertions with Zod-validated filtering
    // getParticipantMessagesWithIds() uses isParticipantMessage() type guard internally
    const { ids: participantMessageIds, messages: participantMessages } = getParticipantMessagesWithIds(messages, roundNumber);

    // ✅ SAFETY CHECK: Don't create analysis if no valid participant messages
    if (participantMessageIds.length === 0) {
      return;
    }

    // ✅ CRITICAL FIX: Deduplicate message IDs and keep only unique messages
    // Backend bug can cause duplicate message IDs for different participants
    // Instead of failing, deduplicate by participantId to ensure analysis proceeds
    const uniqueIds = new Set(participantMessageIds);
    if (uniqueIds.size !== participantMessageIds.length) {
      // ✅ TYPE-SAFE: Use type guard to ensure messages have valid participant metadata
      // Deduplicate by participantId - keep last message per participant
      const validParticipantMessages = filterToParticipantMessages(participantMessages);
      const messagesByParticipant = new Map<string, string>();

      validParticipantMessages.forEach((msg) => {
        // ✅ TYPE-SAFE: Use extraction utility for consistent metadata access
        const participantId = getParticipantId(msg.metadata);
        if (participantId) {
          messagesByParticipant.set(participantId, msg.id);
        }
      });

      // Use deduplicated IDs
      const deduplicatedIds = Array.from(messagesByParticipant.values());

      // Update participantMessageIds to use deduplicated set
      participantMessageIds.length = 0;
      participantMessageIds.push(...deduplicatedIds);
    }

    // ✅ CRITICAL FIX: Verify all messages have correct round number
    // Prevents using messages from previous rounds in analysis
    // ✅ TYPE-SAFE: Use extraction utility instead of type casting
    const allMessagesFromCorrectRound = participantMessages.every((msg) => {
      const msgRound = getRoundNumber(msg.metadata);
      return msgRound === roundNumber;
    });

    if (!allMessagesFromCorrectRound) {
      return;
    }

    // ✅ VALIDATION: Check if message IDs match their metadata
    // Only flag messages that have deterministic IDs (contain _r{N}_p{M}) but wrong values
    // Skip temp IDs (like AI SDK's gen-xxxxx) - these will be updated with real IDs
    // Metadata is the source of truth, not message IDs
    const messageIdMismatches = participantMessages.filter((msg) => {
      // Extract round number from message ID pattern: {threadId}_r{roundNumber}_p{participantIndex}
      const idMatch = msg.id.match(/_r(\d+)_p(\d+)/);
      if (!idMatch) {
        // Message ID doesn't follow expected pattern (likely temp ID from AI SDK)
        // This is NOT a mismatch - temp IDs are expected during streaming
        // The real ID will be synced when streaming completes
        return false; // Skip temp IDs, they're fine
      }

      const roundFromId = Number.parseInt(idMatch[1]!);
      const participantIndexFromId = Number.parseInt(idMatch[2]!);

      // Verify ID matches metadata
      const msgRound = getRoundNumber(msg.metadata);
      const msgParticipantIndex = getParticipantIndex(msg.metadata);

      // Check if round and participant index match
      // This catches bugs where deterministic IDs have wrong values
      return roundFromId !== msgRound || participantIndexFromId !== msgParticipantIndex;
    });

    // ✅ REJECT ANALYSIS: Block analysis creation if deterministic ID/metadata mismatch detected
    // This prevents bugs where backend generates duplicate IDs or incorrect round numbers
    // Note: Temp IDs are allowed (filtered out above) - only deterministic ID mismatches block
    if (messageIdMismatches.length > 0) {
      console.error('[createPendingAnalysis] Message ID/metadata mismatch detected - rejecting analysis', {
        roundNumber,
        threadId,
        mismatches: messageIdMismatches.map(msg => ({
          id: msg.id,
          metadata: msg.metadata,
        })),
      });
      // ✅ RETURN EARLY - Do not create analysis when deterministic IDs don't match metadata
      return;
    }

    // Generate unique analysis ID
    const analysisId = `analysis_${threadId}_${roundNumber}_${Date.now()}`;

    // ✅ Set status to pending - component will update to streaming when POST starts
    // Virtualization checks for BOTH pending and streaming to prevent unmounting
    // This ensures accurate status: pending → streaming (when POST starts) → completed/failed
    const pendingAnalysis: StoredModeratorAnalysis = {
      id: analysisId,
      threadId,
      roundNumber,
      mode,
      userQuestion,
      status: AnalysisStatuses.PENDING,
      participantMessageIds,
      analysisData: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date(),
    };

    // ✅ IMMER: Direct mutation with deduplication
    set((draft) => {
      const existingIndex = draft.analyses.findIndex(
        a => a.threadId === threadId && a.roundNumber === roundNumber,
      );

      if (existingIndex >= 0) {
        const existing = draft.analyses[existingIndex]!;
        // Update placeholder (empty participantMessageIds) with real data
        if (!existing.participantMessageIds || existing.participantMessageIds.length === 0) {
          Object.assign(existing, pendingAnalysis, { id: existing.id, createdAt: existing.createdAt });
        }
        // else: Real analysis exists, skip
      } else {
        // Add new analysis
        draft.analyses.push(pendingAnalysis);
      }
    }, false, 'analysis/createPendingAnalysis');
  },
});

/**
 * PreSearch Slice - Pre-search state
 * Manages web search results that precede participant responses
 */
const createPreSearchSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  PreSearchSlice
> = (set, get) => ({
  ...PRESEARCH_DEFAULTS,

  setPreSearches: (preSearches: StoredPreSearch[]) =>
    set({ preSearches }, false, 'preSearch/setPreSearches'),
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
        if (existing.status === AnalysisStatuses.PENDING && preSearch.status === AnalysisStatuses.STREAMING) {
          Object.assign(existing, preSearch, { status: AnalysisStatuses.STREAMING });
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
          ps.status = AnalysisStatuses.COMPLETE;
        }
      });
    }, false, 'preSearch/updatePreSearchData'),
  updatePreSearchStatus: (roundNumber, status) =>
    set((draft) => {
      draft.preSearches.forEach((ps) => {
        if (ps.roundNumber === roundNumber)
          ps.status = status;
      });
    }, false, 'preSearch/updatePreSearchStatus'),
  updatePreSearchError: (roundNumber: number, errorMessage: string | null) =>
    set((draft) => {
      draft.preSearches.forEach((ps) => {
        if (ps.roundNumber === roundNumber) {
          ps.status = AnalysisStatuses.FAILED;
          ps.errorMessage = errorMessage;
        }
      });
    }, false, 'preSearch/updatePreSearchError'),
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
        if (ps.status !== AnalysisStatuses.STREAMING && ps.status !== AnalysisStatuses.PENDING)
          return;
        const lastActivityTime = draft.preSearchActivityTimes.get(ps.roundNumber);
        if (shouldPreSearchTimeout(ps, lastActivityTime, now)) {
          ps.status = AnalysisStatuses.COMPLETE;
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
const createThreadSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  ThreadSlice
> = (set, get) => ({
  ...THREAD_DEFAULTS,

  setThread: (thread: ChatThread | null) =>
    set({
      thread,
      // ✅ FIX: Sync form state when thread is set
      // Form state is the sole source of truth for web search enabled
      ...(thread ? { enableWebSearch: thread.enableWebSearch } : {}),
    }, false, 'thread/setThread'),
  setParticipants: (participants: ChatParticipant[]) =>
    // ✅ DEFENSIVE SORT: Always sort participants by priority to ensure correct streaming order
    // ✅ REFACTOR: Use sortByPriority (single source of truth for priority sorting)
    set({ participants: sortByPriority(participants) }, false, 'thread/setParticipants'),
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => {
    // Use get() to avoid Draft type issues with function callbacks
    const prevMessages = get().messages;
    const newMessages = typeof messages === 'function' ? messages(prevMessages) : messages;
    set({ messages: newMessages }, false, 'thread/setMessages');
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
      // Force stop streaming - called by Provider when timeout detected
      return { isStreaming: false };
    }, false, 'thread/checkStuckStreams'),
});

/**
 * Flags Slice - Loading and processing flags
 * Boolean flags that trigger UI re-renders (loading states, config changes)
 */
const createFlagsSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  FlagsSlice
> = set => ({
  ...FLAGS_DEFAULTS,

  setHasInitiallyLoaded: (value: boolean) =>
    set({ hasInitiallyLoaded: value }, false, 'flags/setHasInitiallyLoaded'),
  setIsRegenerating: (value: boolean) =>
    set({ isRegenerating: value }, false, 'flags/setIsRegenerating'),
  setIsCreatingAnalysis: (value: boolean) =>
    set({ isCreatingAnalysis: value }, false, 'flags/setIsCreatingAnalysis'),
  setIsWaitingForChangelog: (value: boolean) =>
    set({ isWaitingForChangelog: value }, false, 'flags/setIsWaitingForChangelog'),
  setHasPendingConfigChanges: (value: boolean) =>
    set({ hasPendingConfigChanges: value }, false, 'flags/setHasPendingConfigChanges'),
});

/**
 * Data Slice - Transient data state
 * Round numbers, pending messages, and expected participant IDs
 */
const createDataSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  DataSlice
> = set => ({
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
 * Tracks which rounds have had analyses/pre-searches created to prevent duplicates
 */
const createTrackingSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  TrackingSlice
> = (set, get) => ({
  ...TRACKING_DEFAULTS,

  setHasSentPendingMessage: value =>
    set({ hasSentPendingMessage: value }, false, 'tracking/setHasSentPendingMessage'),
  markAnalysisCreated: roundNumber =>
    set((draft) => {
      draft.createdAnalysisRounds.add(roundNumber);
    }, false, 'tracking/markAnalysisCreated'),
  hasAnalysisBeenCreated: roundNumber =>
    get().createdAnalysisRounds.has(roundNumber),
  clearAnalysisTracking: roundNumber =>
    set((draft) => {
      draft.createdAnalysisRounds.delete(roundNumber);
    }, false, 'tracking/clearAnalysisTracking'),
  markPreSearchTriggered: roundNumber =>
    set((draft) => {
      draft.triggeredPreSearchRounds.add(roundNumber);
    }, false, 'tracking/markPreSearchTriggered'),
  hasPreSearchBeenTriggered: roundNumber =>
    get().triggeredPreSearchRounds.has(roundNumber),
  clearPreSearchTracking: roundNumber =>
    set((draft) => {
      draft.triggeredPreSearchRounds.delete(roundNumber);
    }, false, 'tracking/clearPreSearchTracking'),
  // ✅ ANALYSIS STREAM TRACKING: Two-level deduplication for analysis streams
  markAnalysisStreamTriggered: (analysisId, roundNumber) =>
    set((draft) => {
      draft.triggeredAnalysisIds.add(analysisId);
      draft.triggeredAnalysisRounds.add(roundNumber);
    }, false, 'tracking/markAnalysisStreamTriggered'),
  hasAnalysisStreamBeenTriggered: (analysisId, roundNumber) => {
    const state = get();
    return state.triggeredAnalysisIds.has(analysisId) || state.triggeredAnalysisRounds.has(roundNumber);
  },
  clearAnalysisStreamTracking: roundNumber =>
    set((draft) => {
      // Clear round tracking
      draft.triggeredAnalysisRounds.delete(roundNumber);
      // Clear analysis IDs that contain this round number
      // Analysis IDs often contain round number in their format
      for (const id of draft.triggeredAnalysisIds) {
        if (id.includes(`-${roundNumber}-`) || id.includes(`round-${roundNumber}`)) {
          draft.triggeredAnalysisIds.delete(id);
        }
      }
    }, false, 'tracking/clearAnalysisStreamTracking'),
  setHasEarlyOptimisticMessage: value =>
    set({ hasEarlyOptimisticMessage: value }, false, 'tracking/setHasEarlyOptimisticMessage'),
});

/**
 * Callbacks Slice - Event callbacks
 * Completion and retry callbacks for streaming events
 */
const createCallbacksSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  CallbacksSlice
> = set => ({
  ...CALLBACKS_DEFAULTS,

  setOnComplete: (callback?: () => void) =>
    set({ onComplete: callback }, false, 'callbacks/setOnComplete'),
});

/**
 * Screen Slice - Screen mode state
 * Tracks current screen mode (overview/thread/public) and read-only state
 */
const createScreenSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  ScreenSlice
> = set => ({
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
const createStreamResumptionSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  StreamResumptionSlice
> = (set, get) => ({
  ...STREAM_RESUMPTION_DEFAULTS,

  setStreamResumptionState: state =>
    set({ streamResumptionState: state }, false, 'streamResumption/setStreamResumptionState'),

  getStreamResumptionState: () => get().streamResumptionState,

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
    const age = Date.now() - resumptionState.createdAt.getTime();
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

    // Clear resumption state
    set({
      streamResumptionState: null,
      nextParticipantToTrigger: nextIndex < participantCount ? nextIndex : null,
    }, false, 'streamResumption/handleResumedStreamComplete');
  },

  handleStreamResumptionFailure: (_error) => {
    set({
      streamResumptionState: null,
      nextParticipantToTrigger: null,
      resumptionAttempts: new Set<string>(),
    }, false, 'streamResumption/handleStreamResumptionFailure');
  },

  getNextParticipantToTrigger: () => get().nextParticipantToTrigger,

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
    }, false, 'streamResumption/clearStreamResumption'),
});

/**
 * Animation Slice - Animation completion tracking
 * Tracks pending animations per participant to ensure sequential completion
 */
const createAnimationSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  AnimationSlice
> = (set, get) => ({
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

    // Create a promise that will be resolved when completeAnimation is called
    return new Promise<void>((resolve) => {
      set((current) => {
        const newResolvers = new Map(current.animationResolvers);
        newResolvers.set(participantIndex, resolve);
        return { animationResolvers: newResolvers };
      }, false, 'animation/waitForAnimation');
    });
  },

  // ✅ FIX: Wait for ALL pending animations to complete
  // This ensures sequential execution with no overlapping animations
  // Used by provider handleComplete to wait for all participant animations before creating analysis
  waitForAllAnimations: async () => {
    const state = get();
    const pendingIndices = Array.from(state.pendingAnimations);

    if (pendingIndices.length === 0) {
      return Promise.resolve();
    }

    // ✅ CRITICAL FIX: Add timeout to prevent indefinite blocking
    // If animations don't complete within 5 seconds, force-clear them and continue
    // This prevents analysis creation from being blocked forever by stuck animations
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
const createAttachmentsSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  AttachmentsSlice
> = (set, get) => ({
  ...ATTACHMENTS_DEFAULTS,

  // ✅ IMMER: Direct mutations instead of spread patterns
  addAttachments: (files: File[]) =>
    set((draft) => {
      files.forEach((file) => {
        draft.pendingAttachments.push({
          id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          file,
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
const createOperationsSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  OperationsActions
> = (set, get) => ({
  resetThreadState: () =>
    set(THREAD_RESET_STATE, false, 'operations/resetThreadState'),

  /**
   * ✅ CRITICAL FIX: Reset for thread-to-thread navigation
   *
   * Called when navigating BETWEEN threads (e.g., /chat/thread-1 → /chat/thread-2)
   * Unlike resetThreadState which only clears flags, this ALSO clears:
   * - thread, participants, messages (previous thread data)
   * - analyses, preSearches (previous thread content)
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
      // Create fresh Set instances
      createdAnalysisRounds: new Set<number>(),
      triggeredPreSearchRounds: new Set<number>(),
      triggeredAnalysisRounds: new Set<number>(),
      triggeredAnalysisIds: new Set<string>(),
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
      // ✅ CRITICAL FIX: Set screenMode to 'overview' instead of null
      // This prevents race condition where provider effect waits for screenMode='overview'
      // but useScreenInitialization hasn't run yet to set it
      screenMode: ScreenModes.OVERVIEW,
      // ✅ Create fresh Set instances (same as resetToNewChat)
      createdAnalysisRounds: new Set(),
      triggeredPreSearchRounds: new Set(),
      triggeredAnalysisRounds: new Set(),
      triggeredAnalysisIds: new Set(),
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

    // ✅ UNIFIED PATTERN: Pre-search data is fetched by PreSearchCard component
    // Components use TanStack Query to fetch completed pre-search from DB
    // No store hydration needed

    // ✅ REFACTOR: Use sortByPriority (single source of truth for priority sorting)
    const sortedParticipants = sortByPriority(participants);

    // ✅ HYDRATION FIX: Convert thread participants to form selectedParticipants
    // This must happen atomically with thread initialization to prevent UI flash
    // where ChatInput shows "Select at least 1 model" before participants sync
    const enabledParticipants = sortedParticipants.filter(p => p.isEnabled);
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
      // Reset flags (previously in ChatThreadScreen useEffect via resetThreadState)
      waitingToStartStreaming: false,
      isRegenerating: false,
      isCreatingAnalysis: false,
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
      createdAnalysisRounds: new Set<number>(),
      triggeredPreSearchRounds: new Set<number>(),
      triggeredAnalysisRounds: new Set<number>(),
      triggeredAnalysisIds: new Set<string>(),
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

  updateParticipants: (participants: ChatParticipant[]) =>
    // ✅ REFACTOR: Use sortByPriority (single source of truth for priority sorting)
    set({ participants: sortByPriority(participants) }, false, 'operations/updateParticipants'),

  // ✅ Uses ExtendedFilePart from message-schemas.ts (single source of truth for file parts with uploadId)
  prepareForNewMessage: (message: string, participantIds: string[], attachmentIds?: string[], providedFileParts?: ExtendedFilePart[]) =>
    set((draft) => {
      // ✅ Immer: Use current() with explicit type to avoid deep type inference
      const currentMessages = current(draft.messages) as UIMessage[];
      const nextRoundNumber = calculateNextRoundNumber(currentMessages);

      const isOnThreadScreen = draft.screenMode === ScreenModes.THREAD;
      const hasExistingOptimisticMessage = draft.hasEarlyOptimisticMessage;
      const fileParts = providedFileParts || [];

      // Reset streaming state
      draft.waitingToStartStreaming = false;
      draft.isStreaming = false;
      draft.currentParticipantIndex = 0;
      draft.error = null;

      // Reset regeneration state
      draft.isRegenerating = false;
      draft.regeneratingRoundNumber = null;

      // Reset stream resumption
      draft.streamResumptionState = null;
      draft.resumptionAttempts = new Set<string>();
      draft.nextParticipantToTrigger = null;

      // Set message state
      draft.isCreatingAnalysis = false;
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

      // Add optimistic user message if needed
      if (isOnThreadScreen && !hasExistingOptimisticMessage) {
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

  completeStreaming: () =>
    set({
      // ✅ TYPE-SAFE: Use reset groups to ensure ALL streaming/analysis flags are cleared
      // This prevents infinite loops when both provider and flow-state-machine call completeStreaming
      ...STREAMING_STATE_RESET,
      ...ANALYSIS_STATE_RESET,
      ...PENDING_MESSAGE_STATE_RESET,
      ...REGENERATION_STATE_RESET,
      // ✅ CRITICAL FIX: Also clear animation state to prevent waitForAllAnimations from blocking
      // If animations are stuck pending when streaming completes, the next round's analysis
      // creation would hang forever waiting for animations that will never complete
      pendingAnimations: new Set<number>(),
      animationResolvers: new Map<number, () => void>(),
    }, false, 'operations/completeStreaming'),

  startRegeneration: (roundNumber: number) => {
    const { clearAnalysisTracking, clearPreSearchTracking, clearAnalysisStreamTracking } = get();
    clearAnalysisTracking(roundNumber);
    clearPreSearchTracking(roundNumber);
    clearAnalysisStreamTracking(roundNumber);
    set({
      // ✅ TYPE-SAFE: Clear all streaming state before starting regeneration
      ...STREAMING_STATE_RESET,
      ...ANALYSIS_STATE_RESET,
      ...PENDING_MESSAGE_STATE_RESET,
      ...STREAM_RESUMPTION_DEFAULTS, // Clear any pending stream resumption
      // Then set regeneration-specific state
      isRegenerating: true,
      regeneratingRoundNumber: roundNumber,
    }, false, 'operations/startRegeneration');
  },

  completeRegeneration: (_roundNumber: number) =>
    set({
      // ✅ TYPE-SAFE: Clear ALL streaming/analysis/pending/regeneration flags
      // This was CRITICAL bug - was only clearing 4 fields, blocking next round
      ...STREAMING_STATE_RESET,
      ...ANALYSIS_STATE_RESET,
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
  resetToNewChat: () => {
    const state = get();

    // Clear AI SDK hook's internal messages via chatSetMessages
    // Without this, the AI SDK hook retains old messages that get synced back to store
    state.chatSetMessages?.([]);

    // ✅ RESET: Apply complete reset state
    set({
      ...COMPLETE_RESET_STATE,
      // ✅ CRITICAL FIX: Set screenMode to 'overview' instead of null
      // This prevents race condition where provider effect waits for screenMode='overview'
      // but useScreenInitialization hasn't run yet to set it
      screenMode: ScreenModes.OVERVIEW,
      // ✅ CRITICAL: Reset tracking Sets (need new instances)
      createdAnalysisRounds: new Set(),
      triggeredPreSearchRounds: new Set(),
      triggeredAnalysisRounds: new Set(),
      triggeredAnalysisIds: new Set(),
    }, false, 'operations/resetToNewChat');
  },

  /**
   * Reset local streaming state (backend continues via waitUntil)
   * Used on navigation - streams complete in background for data integrity
   */
  stopStreaming: () => {
    set({
      isStreaming: false,
      currentParticipantIndex: 0,
    }, false, 'operations/stopStreaming');
  },

  /**
   * ✅ SIMPLE RESET: Alias for resetToOverview
   *
   * Convenience function for resetting to overview state.
   * Used in tests and simple reset scenarios.
   */
  reset: () => {
    get().resetToOverview();
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
          ...createAnalysisSlice(...args),
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

  // ============================================================================
  // Store Subscriptions (Removed)
  // ============================================================================
  // Analysis triggering, streaming orchestration, and message sending moved to
  // AI SDK v5 onComplete callbacks in chat-store-provider.tsx:79-198
  // This provides direct access to fresh chat hook state and eliminates stale closures.

  return store;
}

/**
 * Type of the vanilla store instance
 * Used by ChatStoreProvider to type the context value
 */
export type ChatStoreApi = ReturnType<typeof createChatStore>;

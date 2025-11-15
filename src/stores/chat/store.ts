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
 * - OperationsSlice: Composite operations
 *
 * PATTERN: Slices + Vanilla + Context (official Next.js pattern)
 * TYPES: All inferred from Zod schemas in store-schemas.ts
 */

import type { UIMessage } from 'ai';
import type { z } from 'zod';
import type { StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

import type { AnalysisStatus, FeedbackType } from '@/api/core/enums';
import { AnalysisStatuses, ChatModeSchema } from '@/api/core/enums';
import type {
  ModeratorAnalysisPayload,
  PreSearchDataPayload,
  RecommendedAction,
  RoundFeedbackData,
  StoredModeratorAnalysis,
  StoredPreSearch,
} from '@/api/routes/chat/schema';
import type { ChatParticipant, ChatThread } from '@/db/validation';
import { filterToParticipantMessages, getParticipantMessagesWithIds } from '@/lib/utils/message-filtering';
import { getParticipantId, getRoundNumber } from '@/lib/utils/metadata';

import type { ApplyRecommendedActionOptions } from './actions/recommended-action-application';
import { applyRecommendedAction as applyRecommendedActionLogic } from './actions/recommended-action-application';
import type { Retry, SendMessage, StartRound } from './store-action-types';
import {
  ANALYSIS_DEFAULTS,
  CALLBACKS_DEFAULTS,
  COMPLETE_RESET_STATE,
  DATA_DEFAULTS,
  FEEDBACK_DEFAULTS,
  FLAGS_DEFAULTS,
  FORM_DEFAULTS,
  PRESEARCH_DEFAULTS,
  SCREEN_DEFAULTS,
  THREAD_DEFAULTS,
  THREAD_RESET_STATE,
  TRACKING_DEFAULTS,
  UI_DEFAULTS,
} from './store-defaults';
import type {
  AnalysisSlice,
  CallbacksSlice,
  ChatStore,
  DataSlice,
  FeedbackSlice,
  FlagsSlice,
  FormSlice,
  OperationsSlice,
  ParticipantConfig,
  PreSearchSlice,
  ScreenModeSchema,
  ScreenSlice,
  ThreadSlice,
  TrackingSlice,
  UISlice,
} from './store-schemas';

type ScreenMode = z.infer<typeof ScreenModeSchema>;
type ChatMode = z.infer<typeof ChatModeSchema>;

// ============================================================================
// RE-EXPORT TYPES FROM SCHEMAS (Single Source of Truth)
// ============================================================================

export type { ChatStore } from './store-schemas';
export type { ScreenMode };

// ============================================================================
// SLICE IMPLEMENTATIONS - Using Zustand v5 StateCreator Pattern
// ============================================================================

/**
 * Form Slice - Chat form state and actions
 * Handles user input, mode selection, participant management
 */
const createFormSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  FormSlice
> = set => ({
  ...FORM_DEFAULTS,

  setInputValue: (value: string) =>
    set({ inputValue: value }, false, 'form/setInputValue'),
  setSelectedMode: (mode: ChatMode | null) =>
    set({ selectedMode: mode }, false, 'form/setSelectedMode'),
  setSelectedParticipants: (participants: ParticipantConfig[]) =>
    set({ selectedParticipants: participants }, false, 'form/setSelectedParticipants'),
  setEnableWebSearch: (enabled: boolean) =>
    set({ enableWebSearch: enabled }, false, 'form/setEnableWebSearch'),
  addParticipant: (participant: ParticipantConfig) =>
    set(state => ({
      selectedParticipants: state.selectedParticipants.some(p => p.modelId === participant.modelId)
        ? state.selectedParticipants
        : [...state.selectedParticipants, { ...participant, priority: state.selectedParticipants.length }],
    }), false, 'form/addParticipant'),
  removeParticipant: (participantId: string) =>
    set(state => ({
      selectedParticipants: state.selectedParticipants
        .filter(p => p.id !== participantId && p.modelId !== participantId)
        .map((p, index) => ({ ...p, priority: index })),
    }), false, 'form/removeParticipant'),
  updateParticipant: (participantId: string, updates: Partial<ParticipantConfig>) =>
    set(state => ({
      selectedParticipants: state.selectedParticipants.map(p =>
        p.id === participantId ? { ...p, ...updates } : p,
      ),
    }), false, 'form/updateParticipant'),
  reorderParticipants: (fromIndex: number, toIndex: number) =>
    set((state) => {
      const copy = [...state.selectedParticipants];
      const [removed] = copy.splice(fromIndex, 1);
      if (removed) {
        copy.splice(toIndex, 0, removed);
      }
      return {
        selectedParticipants: copy.map((p, index) => ({ ...p, priority: index })),
      };
    }, false, 'form/reorderParticipants'),
  resetForm: () =>
    set(FORM_DEFAULTS, false, 'form/resetForm'),

  applyRecommendedAction: (action: RecommendedAction, options?: ApplyRecommendedActionOptions) => {
    // ✅ EXTRACTED: Business logic moved to actions/recommended-action-application.ts
    // Thin wrapper applies updates returned from pure function
    const result = applyRecommendedActionLogic(action, options);

    set(result.updates, false, 'form/applyRecommendedAction');

    // Return result object (without updates property for backwards compatibility)
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
  [['zustand/devtools', never]],
  [],
  FeedbackSlice
> = set => ({
  ...FEEDBACK_DEFAULTS,

  setFeedback: (roundNumber: number, type: FeedbackType | null) =>
    set((state) => {
      const updated = new Map(state.feedbackByRound);
      updated.set(roundNumber, type);
      return { feedbackByRound: updated };
    }, false, 'feedback/setFeedback'),
  setPendingFeedback: (feedback: { roundNumber: number; type: FeedbackType } | null) =>
    set({ pendingFeedback: feedback }, false, 'feedback/setPendingFeedback'),
  clearFeedback: (roundNumber: number) =>
    set((state) => {
      const updated = new Map(state.feedbackByRound);
      updated.delete(roundNumber);
      return { feedbackByRound: updated };
    }, false, 'feedback/clearFeedback'),
  loadFeedbackFromServer: (data: RoundFeedbackData[]) =>
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
  [['zustand/devtools', never]],
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
  [['zustand/devtools', never]],
  [],
  AnalysisSlice
> = set => ({
  ...ANALYSIS_DEFAULTS,

  setAnalyses: (analyses: StoredModeratorAnalysis[]) =>
    set({ analyses }, false, 'analysis/setAnalyses'),
  addAnalysis: (analysis: StoredModeratorAnalysis) =>
    set(state => ({
      analyses: [...state.analyses, analysis],
    }), false, 'analysis/addAnalysis'),
  updateAnalysisData: (roundNumber: number, data: ModeratorAnalysisPayload) =>
    set(state => ({
      analyses: state.analyses.map((a) => {
        if (a.roundNumber !== roundNumber) {
          return a;
        }

        // Validate mode from analysis payload (comes as string from backend)
        const modeResult = ChatModeSchema.safeParse(data.mode);
        const mode = modeResult.success ? modeResult.data : a.mode; // Fallback to existing mode

        return {
          ...a,
          analysisData: {
            ...data,
            mode,
          },
          status: AnalysisStatuses.COMPLETE,
        };
      }),
    }), false, 'analysis/updateAnalysisData'),
  updateAnalysisStatus: (roundNumber: number, status: AnalysisStatus) =>
    set(state => ({
      analyses: state.analyses.map(a =>
        a.roundNumber === roundNumber
          ? { ...a, status }
          : a,
      ),
    }), false, 'analysis/updateAnalysisStatus'),
  removeAnalysis: (roundNumber: number) =>
    set(state => ({
      analyses: state.analyses.filter(a => a.roundNumber !== roundNumber),
    }), false, 'analysis/removeAnalysis'),
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

    // ✅ TYPE-SAFE EXTRACTION: Use consolidated utility from message-filtering.ts
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

    // ✅ VALIDATION: Check if message IDs match their metadata (warning only)
    // Logs mismatches but doesn't block analysis creation
    // Metadata is the source of truth, not message IDs
    const messageIdMismatches = participantMessages.filter((msg) => {
      // Extract round number from message ID pattern: {threadId}_r{roundNumber}_p{participantIndex}
      const idMatch = msg.id.match(/_r(\d+)_p(\d+)/);
      if (!idMatch) {
        // Message ID doesn't follow expected pattern
        return true; // This is a mismatch
      }

      const roundFromId = Number.parseInt(idMatch[1]!);
      const participantIndexFromId = Number.parseInt(idMatch[2]!);

      // Verify ID matches metadata
      const msgRound = getRoundNumber(msg.metadata);
      const msgParticipantIndex = msg.metadata && typeof msg.metadata === 'object' && msg.metadata !== null && 'participantIndex' in msg.metadata
        ? (msg.metadata.participantIndex as number | undefined)
        : undefined;

      // Check if round and participant index match
      return roundFromId !== msgRound || participantIndexFromId !== msgParticipantIndex;
    });

    // ✅ REJECT ANALYSIS: Block analysis creation if message ID/metadata mismatch detected
    // This prevents bugs where backend generates duplicate IDs or incorrect round numbers
    if (messageIdMismatches.length > 0) {
      console.error('[createPendingAnalysis] Message ID/metadata mismatch detected - rejecting analysis', {
        roundNumber,
        threadId,
        mismatches: messageIdMismatches.map(msg => ({
          id: msg.id,
          metadata: msg.metadata,
        })),
      });
      // ✅ RETURN EARLY - Do not create analysis when IDs don't match metadata
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

    // ✅ CRITICAL FIX: Add to store with deduplication
    // Check if analysis already exists before adding (defense-in-depth)
    // Even with markAnalysisCreated() called first, React state batching
    // can cause this to be called twice before state propagates
    set((state) => {
      // Check if analysis already exists for this thread+round
      const exists = state.analyses.some(
        a => a.threadId === threadId && a.roundNumber === roundNumber,
      );

      if (exists) {
        return state;
      }

      // Safe to add new analysis
      return {
        analyses: [...state.analyses, pendingAnalysis],
      };
    }, false, 'analysis/createPendingAnalysis');
  },
});

/**
 * PreSearch Slice - Pre-search state
 * Manages web search results that precede participant responses
 */
const createPreSearchSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  PreSearchSlice
> = set => ({
  ...PRESEARCH_DEFAULTS,

  setPreSearches: (preSearches: StoredPreSearch[]) =>
    set({ preSearches }, false, 'preSearch/setPreSearches'),
  addPreSearch: (preSearch: StoredPreSearch) =>
    set(state => ({
      preSearches: [...state.preSearches, preSearch],
    }), false, 'preSearch/addPreSearch'),
  updatePreSearchData: (roundNumber: number, data: PreSearchDataPayload) =>
    set(state => ({
      preSearches: state.preSearches.map(ps =>
        ps.roundNumber === roundNumber
          ? { ...ps, searchData: data, status: AnalysisStatuses.COMPLETE }
          : ps,
      ),
    }), false, 'preSearch/updatePreSearchData'),
  updatePreSearchStatus: (roundNumber: number, status: AnalysisStatus) =>
    set(state => ({
      preSearches: state.preSearches.map(ps =>
        ps.roundNumber === roundNumber
          ? { ...ps, status }
          : ps,
      ),
    }), false, 'preSearch/updatePreSearchStatus'),
  removePreSearch: (roundNumber: number) =>
    set(state => ({
      preSearches: state.preSearches.filter(ps => ps.roundNumber !== roundNumber),
    }), false, 'preSearch/removePreSearch'),
  clearAllPreSearches: () =>
    set({
      ...PRESEARCH_DEFAULTS,
      triggeredPreSearchRounds: new Set<number>(),
    }, false, 'preSearch/clearAllPreSearches'),
});

/**
 * Thread Slice - Chat thread data
 * Manages thread, participants, messages, and AI SDK method bindings
 */
const createThreadSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  ThreadSlice
> = set => ({
  ...THREAD_DEFAULTS,

  setThread: (thread: ChatThread | null) =>
    set({ thread }, false, 'thread/setThread'),
  setParticipants: (participants: ChatParticipant[]) =>
    set({ participants }, false, 'thread/setParticipants'),
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) =>
    set(state => ({
      messages: typeof messages === 'function' ? messages(state.messages) : messages,
    }), false, 'thread/setMessages'),
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
  setRetry: (fn?: Retry) =>
    set({ retry: fn }, false, 'thread/setRetry'),
  setStop: (fn?: (() => void)) =>
    set({ stop: fn }, false, 'thread/setStop'),
  setChatSetMessages: (fn?: ((messages: UIMessage[]) => void)) =>
    set({ chatSetMessages: fn }, false, 'thread/setChatSetMessages'),
});

/**
 * Flags Slice - Loading and processing flags
 * Boolean flags that trigger UI re-renders (loading states, config changes)
 */
const createFlagsSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
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
  [['zustand/devtools', never]],
  [],
  DataSlice
> = set => ({
  ...DATA_DEFAULTS,

  setRegeneratingRoundNumber: (value: number | null) =>
    set({ regeneratingRoundNumber: value }, false, 'data/setRegeneratingRoundNumber'),
  setPendingMessage: (value: string | null) =>
    set({ pendingMessage: value }, false, 'data/setPendingMessage'),
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
  [['zustand/devtools', never]],
  [],
  TrackingSlice
> = (set, get) => ({
  ...TRACKING_DEFAULTS,

  setHasSentPendingMessage: (value: boolean) =>
    set({ hasSentPendingMessage: value }, false, 'tracking/setHasSentPendingMessage'),
  markAnalysisCreated: (roundNumber: number) =>
    set((state) => {
      const newSet = new Set(state.createdAnalysisRounds);
      newSet.add(roundNumber);
      return { createdAnalysisRounds: newSet };
    }, false, 'tracking/markAnalysisCreated'),
  hasAnalysisBeenCreated: (roundNumber: number) =>
    get().createdAnalysisRounds.has(roundNumber),
  clearAnalysisTracking: (roundNumber: number) =>
    set((state) => {
      const newSet = new Set(state.createdAnalysisRounds);
      newSet.delete(roundNumber);
      return { createdAnalysisRounds: newSet };
    }, false, 'tracking/clearAnalysisTracking'),
  markPreSearchTriggered: (roundNumber: number) =>
    set((state) => {
      const newSet = new Set(state.triggeredPreSearchRounds);
      newSet.add(roundNumber);
      return { triggeredPreSearchRounds: newSet };
    }, false, 'tracking/markPreSearchTriggered'),
  hasPreSearchBeenTriggered: (roundNumber: number) =>
    get().triggeredPreSearchRounds.has(roundNumber),
  clearPreSearchTracking: (roundNumber: number) =>
    set((state) => {
      const newSet = new Set(state.triggeredPreSearchRounds);
      newSet.delete(roundNumber);
      return { triggeredPreSearchRounds: newSet };
    }, false, 'tracking/clearPreSearchTracking'),
});

/**
 * Callbacks Slice - Event callbacks
 * Completion and retry callbacks for streaming events
 */
const createCallbacksSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  CallbacksSlice
> = set => ({
  ...CALLBACKS_DEFAULTS,

  setOnComplete: (callback?: () => void) =>
    set({ onComplete: callback }, false, 'callbacks/setOnComplete'),
  setOnRetry: (callback?: (roundNumber: number) => void) =>
    set({ onRetry: callback }, false, 'callbacks/setOnRetry'),
});

/**
 * Screen Slice - Screen mode state
 * Tracks current screen mode (overview/thread/public) and read-only state
 */
const createScreenSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  ScreenSlice
> = set => ({
  ...SCREEN_DEFAULTS,

  setScreenMode: (mode: ScreenMode | null) =>
    set({
      screenMode: mode,
      isReadOnly: mode === 'public',
    }, false, 'screen/setScreenMode'),
  resetScreenMode: () =>
    set(SCREEN_DEFAULTS, false, 'screen/resetScreenMode'),
});

/**
 * Operations Slice - Composite operations
 * Complex multi-slice operations (reset, initialization, streaming lifecycle)
 */
const createOperationsSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  OperationsSlice
> = (set, get) => ({
  resetThreadState: () =>
    set(THREAD_RESET_STATE as Partial<ChatStore>, false, 'operations/resetThreadState'),

  resetToOverview: () =>
    set(COMPLETE_RESET_STATE as Partial<ChatStore>, false, 'operations/resetToOverview'),

  initializeThread: (thread: ChatThread, participants: ChatParticipant[], initialMessages?: UIMessage[]) => {
    const messagesToSet = initialMessages || [];

    // ✅ UNIFIED PATTERN: Pre-search data is fetched by PreSearchCard component
    // Components use TanStack Query to fetch completed pre-search from DB
    // No store hydration needed

    set({
      thread,
      participants,
      messages: messagesToSet,
      error: null,
      isStreaming: false,
    }, false, 'operations/initializeThread');
  },

  updateParticipants: (participants: ChatParticipant[]) =>
    set({ participants }, false, 'operations/updateParticipants'),

  prepareForNewMessage: (message: string, participantIds: string[]) =>
    set(state => ({
      // ✅ CRITICAL FIX: Clear streaming flags before preparing new message
      // If previous round's flags weren't properly cleared, this ensures clean state
      isCreatingAnalysis: false,
      isRegenerating: false,
      streamingRoundNumber: null,
      regeneratingRoundNumber: null,
      currentRoundNumber: null,
      // Prepare new message state
      isWaitingForChangelog: true,
      pendingMessage: message,
      expectedParticipantIds: participantIds.length > 0
        ? participantIds
        : state.expectedParticipantIds,
      hasSentPendingMessage: false,
    }), false, 'operations/prepareForNewMessage'),

  completeStreaming: () =>
    set({
      isCreatingAnalysis: false,
      isRegenerating: false,
      streamingRoundNumber: null,
      regeneratingRoundNumber: null,
      currentRoundNumber: null,
    }, false, 'operations/completeStreaming'),

  startRegeneration: (roundNumber: number) => {
    const { clearAnalysisTracking } = get();
    clearAnalysisTracking(roundNumber);
    set({
      isRegenerating: true,
      isCreatingAnalysis: false,
      regeneratingRoundNumber: roundNumber,
      streamingRoundNumber: null,
    }, false, 'operations/startRegeneration');
  },

  completeRegeneration: (_roundNumber: number) =>
    set({
      isRegenerating: false,
      regeneratingRoundNumber: null,
      streamingRoundNumber: null,
      currentRoundNumber: null,
    }, false, 'operations/completeRegeneration'),
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
        ...createOperationsSlice(...args),
      }),
      {
        name: 'ChatStore',
        enabled: true, // Always enable for debugging
        anonymousActionType: 'unknown-action',
      },
    ),
  );

  // Debug: Verify devtools connection
  if (typeof window !== 'undefined') {
    const hasExtension = !!(window as typeof window & { __REDUX_DEVTOOLS_EXTENSION__?: unknown }).__REDUX_DEVTOOLS_EXTENSION__;
    console.error('[ChatStore] Redux DevTools Extension available:', hasExtension);
    console.error('[ChatStore] Store created with devtools middleware');
    console.error('[ChatStore] Store has devtools property:', 'devtools' in store);

    // Trigger a test action to ensure store appears in devtools
    setTimeout(() => {
      store.setState({ showInitialUI: true }, false, 'devtools/initialization-test');
      console.error('[ChatStore] Test action dispatched to verify devtools connection');
    }, 100);
  }

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

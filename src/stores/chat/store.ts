/**
 * Unified Chat Store - Zustand Vanilla Pattern + Performance Optimizations
 *
 * ============================================================================
 * OFFICIAL NEXT.JS PATTERN
 * ============================================================================
 * - Uses createStore (vanilla) for per-instance isolation
 * - Factory function for store creation
 * - Context provider for store distribution
 * - Type-safe with full inference
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
 *    - UIFlagsSlice: Flags that trigger re-renders (loading states, config changes)
 *    - InternalFlagsSlice: Flags for orchestration logic (use with useStoreRef)
 *
 *    WHY: Reduces unnecessary re-renders by only subscribing to UI-relevant flags
 *    USAGE:
 *      // UI flags (triggers re-renders)
 *      const isRegenerating = useChatStore(s => s.isRegenerating)
 *
 *      // Internal flags (no re-renders, use refs)
 *      const store = useChatStoreApi()
 *      const hasLoadedRef = useStoreRef(store, s => s.hasInitiallyLoaded)
 *      if (hasLoadedRef.current) { ... } // Access without triggering re-render
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
 *    USE: useStoreRef utility for ref-based access
 *    SEE: /src/stores/chat/utils/use-store-ref.ts
 *
 * 4. AUTO-GENERATED SELECTORS (Future Enhancement):
 *    SEE: /src/stores/chat/utils/create-selectors.ts
 *    USAGE: const bears = useStore.use.bears() // Instead of useStore(s => s.bears)
 *
 * ============================================================================
 * SLICE ORGANIZATION
 * ============================================================================
 * - ChatFormSlice: Form input, mode, participants
 * - FeedbackSlice: Round feedback (like/dislike)
 * - UISlice: Initial UI, thread creation, streaming flags
 * - AnalysisSlice: Moderator analyses
 * - ThreadSlice: Thread data, participants, messages, AI SDK methods
 * - UIFlagsSlice: Loading states that need re-renders
 * - InternalFlagsSlice: Orchestration flags (use refs)
 * - DataSlice: Round numbers, pending messages
 * - TrackingSlice: Deduplication and tracking
 * - CallbacksSlice: Completion and retry callbacks
 * - ScreenSlice: Screen mode and readonly state
 * - OperationsSlice: Composite operations
 *
 * PATTERN: Slices + Vanilla + Context (official Next.js pattern)
 */

import type { UIMessage } from 'ai';
import type { StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

import type { ChatMode, FeedbackType } from '@/api/core/enums';
import type { ChatParticipant, ChatThread, ModeratorAnalysisPayload, RecommendedAction, RoundFeedbackData, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { getParticipantMessagesWithIds } from '@/lib/utils/message-filtering';

import type { ScreenMode } from './actions/screen-initialization';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type ChatFormSlice = {
  inputValue: string;
  selectedMode: ChatModeId | null;
  selectedParticipants: ParticipantConfig[];

  setInputValue: (value: string) => void;
  setSelectedMode: (mode: ChatModeId) => void;
  setSelectedParticipants: (participants: ParticipantConfig[]) => void;
  addParticipant: (participant: ParticipantConfig) => void;
  removeParticipant: (participantId: string) => void;
  updateParticipant: (participantId: string, updates: Partial<ParticipantConfig>) => void;
  reorderParticipants: (fromIndex: number, toIndex: number) => void;
  resetForm: () => void;
  applyRecommendedAction: (action: RecommendedAction, options?: { maxModels?: number; tierName?: string }) => { success: boolean; error?: string; modelsAdded?: number; modelsSkipped?: number };
};

type FeedbackSlice = {
  feedbackByRound: Map<number, FeedbackType | null>;
  pendingFeedback: { roundNumber: number; type: FeedbackType } | null;
  hasLoadedFeedback: boolean;

  setFeedback: (roundNumber: number, type: FeedbackType | null) => void;
  setPendingFeedback: (feedback: { roundNumber: number; type: FeedbackType } | null) => void;
  clearFeedback: (roundNumber: number) => void;
  loadFeedbackFromServer: (data: RoundFeedbackData[]) => void;
  resetFeedback: () => void;
};

type UISlice = {
  showInitialUI: boolean;
  waitingToStartStreaming: boolean;
  isCreatingThread: boolean;
  createdThreadId: string | null;

  setShowInitialUI: (show: boolean) => void;
  setWaitingToStartStreaming: (waiting: boolean) => void;
  setIsCreatingThread: (creating: boolean) => void;
  setCreatedThreadId: (id: string | null) => void;
  resetUI: () => void;
};

type AnalysisSlice = {
  analyses: StoredModeratorAnalysis[];

  setAnalyses: (analyses: StoredModeratorAnalysis[]) => void;
  addAnalysis: (analysis: StoredModeratorAnalysis) => void;
  updateAnalysisData: (roundNumber: number, data: ModeratorAnalysisPayload) => void;
  updateAnalysisStatus: (roundNumber: number, status: 'pending' | 'streaming' | 'completed' | 'failed') => void;
  removeAnalysis: (roundNumber: number) => void;
  clearAllAnalyses: () => void;
  createPendingAnalysis: (params: {
    roundNumber: number;
    messages: UIMessage[];
    participants: ChatParticipant[];
    userQuestion: string;
    threadId: string;
    mode: ChatModeId;
  }) => void;
};

type ThreadSlice = {
  thread: ChatThread | null;
  participants: ChatParticipant[];
  messages: UIMessage[];
  isStreaming: boolean;
  currentParticipantIndex: number;
  error: Error | null;

  // AI SDK methods (set by provider)
  sendMessage: ((content: string) => Promise<void>) | undefined;
  startRound: (() => void) | undefined;
  retry: (() => void) | undefined;
  stop: (() => void) | undefined;
  // ✅ FIX: Expose chat.setMessages to allow refetch to update useChat's state
  chatSetMessages: ((messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void) | undefined;

  setThread: (thread: ChatThread | null) => void;
  setParticipants: (participants: ChatParticipant[]) => void;
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;
  setIsStreaming: (streaming: boolean) => void;
  setCurrentParticipantIndex: (index: number) => void;
  setError: (error: Error | null) => void;
  setSendMessage: (fn: ((content: string) => Promise<void>) | undefined) => void;
  setStartRound: (fn: (() => void) | undefined) => void;
  setRetry: (fn: (() => void) | undefined) => void;
  setStop: (fn: (() => void) | undefined) => void;
  setChatSetMessages: (fn: ((messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void) | undefined) => void;
};

type FlagsSlice = {
  hasInitiallyLoaded: boolean;
  isRegenerating: boolean;
  isCreatingAnalysis: boolean;
  isWaitingForChangelog: boolean;
  hasPendingConfigChanges: boolean;
  hasRefetchedMessages: boolean;

  setHasInitiallyLoaded: (value: boolean) => void;
  setIsRegenerating: (value: boolean) => void;
  setIsCreatingAnalysis: (value: boolean) => void;
  setIsWaitingForChangelog: (value: boolean) => void;
  setHasPendingConfigChanges: (value: boolean) => void;
  setHasRefetchedMessages: (value: boolean) => void;
};

type DataSlice = {
  regeneratingRoundNumber: number | null;
  pendingMessage: string | null;
  expectedParticipantIds: string[] | null;
  streamingRoundNumber: number | null;
  currentRoundNumber: number | null;

  setRegeneratingRoundNumber: (value: number | null) => void;
  setPendingMessage: (value: string | null) => void;
  setExpectedParticipantIds: (value: string[] | null) => void;
  setStreamingRoundNumber: (value: number | null) => void;
  setCurrentRoundNumber: (value: number | null) => void;
};

type TrackingSlice = {
  hasSentPendingMessage: boolean;
  createdAnalysisRounds: Set<number>;

  setHasSentPendingMessage: (value: boolean) => void;
  markAnalysisCreated: (roundNumber: number) => void;
  hasAnalysisBeenCreated: (roundNumber: number) => boolean;
  clearAnalysisTracking: (roundNumber: number) => void;
};

type CallbacksSlice = {
  onComplete?: () => void;
  onRetry?: (roundNumber: number) => void;

  setOnComplete: (callback: (() => void) | undefined) => void;
  setOnRetry: (callback: ((roundNumber: number) => void) | undefined) => void;
};

/**
 * Screen Mode Type
 * Imported from screen-initialization to avoid duplication
 * @see src/stores/chat/actions/screen-initialization.ts
 */
export type { ScreenMode } from './actions/screen-initialization';

type ScreenSlice = {
  screenMode: ScreenMode | null;
  isReadOnly: boolean;

  setScreenMode: (mode: ScreenMode | null) => void;
  resetScreenMode: () => void;
};

type OperationsSlice = {
  resetThreadState: () => void;
  resetHookState: () => void;
  resetToOverview: () => void;
  initializeThread: (
    thread: ChatThread,
    participants: ChatParticipant[],
    initialMessages?: UIMessage[],
  ) => void;
  clearThread: () => void;
  updateParticipants: (participants: ChatParticipant[]) => void;
  prepareForNewMessage: (message: string, participantIds: string[]) => void;
  completeStreaming: () => void;
  startRegeneration: (roundNumber: number) => void;
  completeRegeneration: (roundNumber: number) => void;
};

export type ChatStore
  = & ChatFormSlice
    & FeedbackSlice
    & UISlice
    & AnalysisSlice
    & ThreadSlice
    & FlagsSlice
    & DataSlice
    & TrackingSlice
    & CallbacksSlice
    & ScreenSlice
    & OperationsSlice;

// ============================================================================
// SLICE IMPLEMENTATIONS
// ============================================================================

const createChatFormSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  ChatFormSlice
> = set => ({
  inputValue: '',
  selectedMode: null, // ✅ null on init, set to DEFAULT_CHAT_MODE by component
  selectedParticipants: [],

  setInputValue: value =>
    set({ inputValue: value }, false, 'form/setInputValue'),
  setSelectedMode: mode =>
    set({ selectedMode: mode }, false, 'form/setSelectedMode'),
  setSelectedParticipants: participants =>
    set({ selectedParticipants: participants }, false, 'form/setSelectedParticipants'),
  addParticipant: participant =>
    set(state => ({
      selectedParticipants: state.selectedParticipants.some(p => p.modelId === participant.modelId)
        ? state.selectedParticipants
        : [...state.selectedParticipants, { ...participant, priority: state.selectedParticipants.length }],
    }), false, 'form/addParticipant'),
  removeParticipant: participantId =>
    set(state => ({
      selectedParticipants: state.selectedParticipants
        .filter(p => p.id !== participantId && p.modelId !== participantId)
        .map((p, index) => ({ ...p, priority: index })),
    }), false, 'form/removeParticipant'),
  updateParticipant: (participantId, updates) =>
    set(state => ({
      selectedParticipants: state.selectedParticipants.map(p =>
        p.id === participantId ? { ...p, ...updates } : p,
      ),
    }), false, 'form/updateParticipant'),
  reorderParticipants: (fromIndex, toIndex) =>
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
    set({
      inputValue: '',
      selectedMode: null, // ✅ Reset to null, component will set DEFAULT_CHAT_MODE
      selectedParticipants: [],
    }, false, 'form/resetForm'),

  applyRecommendedAction: (action, options) => {
    const maxModels = options?.maxModels;
    const tierName = options?.tierName;

    // Track results for validation feedback
    let modelsAdded = 0;
    let modelsSkipped = 0;
    let error: string | undefined;

    set((state) => {
      // 1. Set input value
      const updates: Partial<ChatFormSlice> = {
        inputValue: action.action,
      };

      // 2. Apply mode suggestion if provided
      if (action.suggestedMode) {
        updates.selectedMode = action.suggestedMode as ChatModeId;
      }

      // 3. Apply participant suggestions if provided
      if (action.suggestedModels && action.suggestedModels.length > 0) {
        // Validate and deduplicate model IDs
        const existingModelIds = new Set(state.selectedParticipants.map(p => p.modelId));
        const currentCount = state.selectedParticipants.length;

        // Filter to only valid model IDs (format: provider/model) that don't already exist
        const validNewModels = action.suggestedModels.filter((modelId) => {
          const isValidFormat = modelId.includes('/');
          const isNotDuplicate = !existingModelIds.has(modelId);
          return isValidFormat && isNotDuplicate;
        });

        // Check tier limits if provided
        if (maxModels !== undefined) {
          const availableSlots = Math.max(0, maxModels - currentCount);

          if (availableSlots === 0) {
            error = `Your ${tierName || 'current'} plan allows up to ${maxModels} models per conversation. Remove a model to add another, or upgrade your plan.`;
            modelsSkipped = validNewModels.length;
          } else if (validNewModels.length > availableSlots) {
            // Partial add: only add models that fit
            const modelsToAdd = validNewModels.slice(0, availableSlots);
            modelsSkipped = validNewModels.length - availableSlots;

            const newParticipants = modelsToAdd.map((modelId, index) => {
              const originalIndex = action.suggestedModels.indexOf(modelId);
              return {
                id: `participant-${Date.now()}-${index}`,
                modelId,
                role: action.suggestedRoles?.[originalIndex] || null,
                customRoleId: undefined,
                priority: state.selectedParticipants.length + index,
              } satisfies ParticipantConfig;
            });

            updates.selectedParticipants = [...state.selectedParticipants, ...newParticipants];
            modelsAdded = modelsToAdd.length;
            error = `Only ${modelsAdded} of ${validNewModels.length} suggested models were added. Your ${tierName || 'current'} plan allows up to ${maxModels} models. Upgrade to add more.`;
          } else {
            // All models fit within limit
            const newParticipants = validNewModels.map((modelId, index) => {
              const originalIndex = action.suggestedModels.indexOf(modelId);
              return {
                id: `participant-${Date.now()}-${index}`,
                modelId,
                role: action.suggestedRoles?.[originalIndex] || null,
                customRoleId: undefined,
                priority: state.selectedParticipants.length + index,
              } satisfies ParticipantConfig;
            });

            updates.selectedParticipants = [...state.selectedParticipants, ...newParticipants];
            modelsAdded = validNewModels.length;
          }
        } else {
          // No tier limit provided, add all valid models
          if (validNewModels.length > 0) {
            const newParticipants = validNewModels.map((modelId, index) => {
              const originalIndex = action.suggestedModels.indexOf(modelId);
              return {
                id: `participant-${Date.now()}-${index}`,
                modelId,
                role: action.suggestedRoles?.[originalIndex] || null,
                customRoleId: undefined,
                priority: state.selectedParticipants.length + index,
              } satisfies ParticipantConfig;
            });

            updates.selectedParticipants = [...state.selectedParticipants, ...newParticipants];
            modelsAdded = validNewModels.length;
          }
        }
      }

      return updates;
    }, false, 'form/applyRecommendedAction');

    // Return result object
    return {
      success: error === undefined || modelsAdded > 0,
      error,
      modelsAdded,
      modelsSkipped,
    };
  },
});

const createFeedbackSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  FeedbackSlice
> = set => ({
  feedbackByRound: new Map(),
  pendingFeedback: null,
  hasLoadedFeedback: false,

  setFeedback: (roundNumber, type) =>
    set((state) => {
      const updated = new Map(state.feedbackByRound);
      updated.set(roundNumber, type);
      return { feedbackByRound: updated };
    }, false, 'feedback/setFeedback'),
  setPendingFeedback: feedback =>
    set({ pendingFeedback: feedback }, false, 'feedback/setPendingFeedback'),
  clearFeedback: roundNumber =>
    set((state) => {
      const updated = new Map(state.feedbackByRound);
      updated.delete(roundNumber);
      return { feedbackByRound: updated };
    }, false, 'feedback/clearFeedback'),
  loadFeedbackFromServer: data =>
    set({
      feedbackByRound: new Map(data.map(f => [f.roundNumber, f.feedbackType])),
      hasLoadedFeedback: true,
    }, false, 'feedback/loadFeedbackFromServer'),
  resetFeedback: () =>
    set({
      feedbackByRound: new Map(),
      pendingFeedback: null,
      hasLoadedFeedback: false,
    }, false, 'feedback/resetFeedback'),
});

const createUISlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  UISlice
> = set => ({
  showInitialUI: true,
  waitingToStartStreaming: false,
  isCreatingThread: false,
  createdThreadId: null,

  setShowInitialUI: show =>
    set({ showInitialUI: show }, false, 'ui/setShowInitialUI'),
  setWaitingToStartStreaming: waiting =>
    set({ waitingToStartStreaming: waiting }, false, 'ui/setWaitingToStartStreaming'),
  setIsCreatingThread: creating =>
    set({ isCreatingThread: creating }, false, 'ui/setIsCreatingThread'),
  setCreatedThreadId: id =>
    set({ createdThreadId: id }, false, 'ui/setCreatedThreadId'),
  resetUI: () =>
    set({
      showInitialUI: true,
      waitingToStartStreaming: false,
      isCreatingThread: false,
      createdThreadId: null,
    }, false, 'ui/resetUI'),
});

const createAnalysisSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  AnalysisSlice
> = set => ({
  analyses: [],

  setAnalyses: analyses =>
    set({ analyses }, false, 'analysis/setAnalyses'),
  addAnalysis: analysis =>
    set(state => ({
      analyses: [...state.analyses, analysis],
    }), false, 'analysis/addAnalysis'),
  updateAnalysisData: (roundNumber, data) =>
    set(state => ({
      analyses: state.analyses.map(a =>
        a.roundNumber === roundNumber
          ? {
              ...a,
              ...data,
              mode: data.mode as ChatMode,
              status: 'completed' as const,
            }
          : a,
      ),
    }), false, 'analysis/updateAnalysisData'),
  updateAnalysisStatus: (roundNumber, status) =>
    set(state => ({
      analyses: state.analyses.map(a =>
        a.roundNumber === roundNumber
          ? { ...a, status }
          : a,
      ),
    }), false, 'analysis/updateAnalysisStatus'),
  removeAnalysis: roundNumber =>
    set(state => ({
      analyses: state.analyses.filter(a => a.roundNumber !== roundNumber),
    }), false, 'analysis/removeAnalysis'),
  clearAllAnalyses: () =>
    set({ analyses: [] }, false, 'analysis/clearAllAnalyses'),
  createPendingAnalysis: (params) => {
    const { roundNumber, messages, userQuestion, threadId, mode } = params;

    // ✅ SINGLE SOURCE OF TRUTH: Use utility functions for type-safe extraction
    // Replaces unsafe type assertions with consolidated message filtering logic
    const { ids: participantMessageIds } = getParticipantMessagesWithIds(messages, roundNumber);

    // ✅ SAFETY CHECK: Don't create analysis if no valid participant messages
    if (participantMessageIds.length === 0) {
      console.warn(`[createPendingAnalysis] No participant messages with valid participantId found for round ${roundNumber}`);
      return;
    }

    // Generate unique analysis ID
    const analysisId = `analysis_${threadId}_${roundNumber}_${Date.now()}`;

    // Create pending analysis object
    const pendingAnalysis: StoredModeratorAnalysis = {
      id: analysisId,
      threadId,
      roundNumber,
      mode,
      userQuestion,
      status: 'pending',
      participantMessageIds,
      analysisData: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date(),
    };

    // Add to store
    set(state => ({
      analyses: [...state.analyses, pendingAnalysis],
    }), false, 'analysis/createPendingAnalysis');
  },
});

const createThreadSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  ThreadSlice
> = set => ({
  thread: null,
  participants: [],
  messages: [],
  isStreaming: false,
  currentParticipantIndex: 0,
  error: null,
  sendMessage: undefined,
  startRound: undefined,
  retry: undefined,
  stop: undefined,
  chatSetMessages: undefined,

  setThread: thread =>
    set({ thread }, false, 'thread/setThread'),
  setParticipants: participants =>
    set({ participants }, false, 'thread/setParticipants'),
  setMessages: messages =>
    set(state => ({
      messages: typeof messages === 'function' ? messages(state.messages) : messages,
    }), false, 'thread/setMessages'),
  setIsStreaming: isStreaming =>
    set({ isStreaming }, false, 'thread/setIsStreaming'),
  setCurrentParticipantIndex: currentParticipantIndex =>
    set({ currentParticipantIndex }, false, 'thread/setCurrentParticipantIndex'),
  setError: error =>
    set({ error }, false, 'thread/setError'),
  setSendMessage: fn =>
    set({ sendMessage: fn }, false, 'thread/setSendMessage'),
  setStartRound: fn =>
    set({ startRound: fn }, false, 'thread/setStartRound'),
  setRetry: fn =>
    set({ retry: fn }, false, 'thread/setRetry'),
  setStop: fn =>
    set({ stop: fn }, false, 'thread/setStop'),
  setChatSetMessages: fn =>
    set({ chatSetMessages: fn }, false, 'thread/setChatSetMessages'),
});

const createFlagsSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  FlagsSlice
> = set => ({
  hasInitiallyLoaded: false,
  isRegenerating: false,
  isCreatingAnalysis: false,
  isWaitingForChangelog: false,
  hasPendingConfigChanges: false,
  hasRefetchedMessages: false,

  setHasInitiallyLoaded: value =>
    set({ hasInitiallyLoaded: value }, false, 'flags/setHasInitiallyLoaded'),
  setIsRegenerating: value =>
    set({ isRegenerating: value }, false, 'flags/setIsRegenerating'),
  setIsCreatingAnalysis: value =>
    set({ isCreatingAnalysis: value }, false, 'flags/setIsCreatingAnalysis'),
  setIsWaitingForChangelog: value =>
    set({ isWaitingForChangelog: value }, false, 'flags/setIsWaitingForChangelog'),
  setHasPendingConfigChanges: value =>
    set({ hasPendingConfigChanges: value }, false, 'flags/setHasPendingConfigChanges'),
  setHasRefetchedMessages: value =>
    set({ hasRefetchedMessages: value }, false, 'flags/setHasRefetchedMessages'),
});

const createDataSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  DataSlice
> = set => ({
  regeneratingRoundNumber: null,
  pendingMessage: null,
  expectedParticipantIds: null,
  streamingRoundNumber: null,
  currentRoundNumber: null,

  setRegeneratingRoundNumber: value =>
    set({ regeneratingRoundNumber: value }, false, 'data/setRegeneratingRoundNumber'),
  setPendingMessage: value =>
    set({ pendingMessage: value }, false, 'data/setPendingMessage'),
  setExpectedParticipantIds: value =>
    set({ expectedParticipantIds: value }, false, 'data/setExpectedParticipantIds'),
  setStreamingRoundNumber: value =>
    set({ streamingRoundNumber: value }, false, 'data/setStreamingRoundNumber'),
  setCurrentRoundNumber: value =>
    set({ currentRoundNumber: value }, false, 'data/setCurrentRoundNumber'),
});

const createTrackingSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  TrackingSlice
> = (set, get) => ({
  hasSentPendingMessage: false,
  createdAnalysisRounds: new Set<number>(),

  setHasSentPendingMessage: value =>
    set({ hasSentPendingMessage: value }, false, 'tracking/setHasSentPendingMessage'),
  markAnalysisCreated: roundNumber =>
    set((state) => {
      const newSet = new Set(state.createdAnalysisRounds);
      newSet.add(roundNumber);
      return { createdAnalysisRounds: newSet };
    }, false, 'tracking/markAnalysisCreated'),
  hasAnalysisBeenCreated: roundNumber =>
    get().createdAnalysisRounds.has(roundNumber),
  clearAnalysisTracking: roundNumber =>
    set((state) => {
      const newSet = new Set(state.createdAnalysisRounds);
      newSet.delete(roundNumber);
      return { createdAnalysisRounds: newSet };
    }, false, 'tracking/clearAnalysisTracking'),
});

const createCallbacksSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  CallbacksSlice
> = set => ({
  onComplete: undefined,
  onRetry: undefined,

  setOnComplete: callback =>
    set({ onComplete: callback }, false, 'callbacks/setOnComplete'),
  setOnRetry: callback =>
    set({ onRetry: callback }, false, 'callbacks/setOnRetry'),
});

const createScreenSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  ScreenSlice
> = set => ({
  screenMode: null,
  isReadOnly: false,

  setScreenMode: mode =>
    set({
      screenMode: mode,
      isReadOnly: mode === 'public',
    }, false, 'screen/setScreenMode'),
  resetScreenMode: () =>
    set({
      screenMode: null,
      isReadOnly: false,
    }, false, 'screen/resetScreenMode'),
});

const createOperationsSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  OperationsSlice
> = (set, get) => ({
  resetThreadState: () =>
    set({
      hasInitiallyLoaded: false,
      isRegenerating: false,
      isCreatingAnalysis: false,
      isWaitingForChangelog: false,
      hasPendingConfigChanges: false,
      hasRefetchedMessages: false,
      regeneratingRoundNumber: null,
      pendingMessage: null,
      expectedParticipantIds: null,
      streamingRoundNumber: null,
      currentRoundNumber: null,
      hasSentPendingMessage: false,
      createdAnalysisRounds: new Set<number>(),
    }, false, 'operations/resetThreadState'),

  resetHookState: () =>
    set({
      error: null,
      isStreaming: false,
      currentParticipantIndex: 0,
    }, false, 'operations/resetHookState'),

  resetToOverview: () =>
    set({
      // Form state
      inputValue: '',
      selectedMode: null,
      selectedParticipants: [],
      // UI state
      showInitialUI: true,
      waitingToStartStreaming: false,
      isCreatingThread: false,
      createdThreadId: null,
      // Thread state
      thread: null,
      participants: [],
      messages: [],
      error: null,
      isStreaming: false,
      currentParticipantIndex: 0,
      // Analyses
      analyses: [],
      // Feedback
      feedbackByRound: new Map(),
      pendingFeedback: null,
      hasLoadedFeedback: false,
      // Flags
      hasInitiallyLoaded: false,
      isRegenerating: false,
      isCreatingAnalysis: false,
      isWaitingForChangelog: false,
      hasPendingConfigChanges: false,
      hasRefetchedMessages: false,
      // Data
      regeneratingRoundNumber: null,
      pendingMessage: null,
      expectedParticipantIds: null,
      streamingRoundNumber: null,
      currentRoundNumber: null,
      // Tracking
      hasSentPendingMessage: false,
      createdAnalysisRounds: new Set<number>(),
      // Callbacks
      onComplete: undefined,
      onRetry: undefined,
    }, false, 'operations/resetToOverview'),

  initializeThread: (thread, participants, initialMessages) => {
    const messagesToSet = initialMessages || [];

    set({
      thread,
      participants,
      messages: messagesToSet,
      error: null,
      isStreaming: false,
    }, false, 'operations/initializeThread');
  },

  clearThread: () =>
    set({
      thread: null,
      participants: [],
      messages: [],
      onComplete: undefined,
      onRetry: undefined,
    }, false, 'operations/clearThread'),

  updateParticipants: participants =>
    set({ participants }, false, 'operations/updateParticipants'),

  prepareForNewMessage: (message, participantIds) =>
    set(state => ({
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

  startRegeneration: (roundNumber) => {
    const { clearAnalysisTracking } = get();
    clearAnalysisTracking(roundNumber);
    set({
      isRegenerating: true,
      isCreatingAnalysis: false,
      regeneratingRoundNumber: roundNumber,
      streamingRoundNumber: null,
    }, false, 'operations/startRegeneration');
  },

  completeRegeneration: _roundNumber =>
    set({
      isRegenerating: false,
      regeneratingRoundNumber: null,
      streamingRoundNumber: null,
      currentRoundNumber: null,
    }, false, 'operations/completeRegeneration'),
});

// ============================================================================
// STORE FACTORY (Official Next.js Pattern)
// ============================================================================

export function createChatStore() {
  return createStore<ChatStore>()(
    devtools(
      (...args) => ({
        ...createChatFormSlice(...args),
        ...createFeedbackSlice(...args),
        ...createUISlice(...args),
        ...createAnalysisSlice(...args),
        ...createThreadSlice(...args),
        ...createFlagsSlice(...args),
        ...createDataSlice(...args),
        ...createTrackingSlice(...args),
        ...createCallbacksSlice(...args),
        ...createScreenSlice(...args),
        ...createOperationsSlice(...args),
      }),
      { name: 'ChatStore' },
    ),
  );
}

export type ChatStoreApi = ReturnType<typeof createChatStore>;

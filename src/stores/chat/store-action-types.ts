/**
 * Explicit TypeScript Type Definitions for Chat Store Actions
 *
 * ============================================================================
 * REPLACES z.any() WITH EXPLICIT FUNCTION SIGNATURES
 * ============================================================================
 *
 * This module provides precise type definitions for all store actions,
 * replacing the generic z.any() placeholders in store-schemas.ts.
 *
 * Pattern: Store schemas define state shape, action-types.ts defines function signatures
 * Benefits:
 * - IDE autocomplete for action parameters and return types
 * - Type-safe action dispatching throughout components
 * - Self-documenting action contracts
 * - Enables refactoring tools to track action usage
 *
 * Reference Architecture:
 * - store-schemas.ts: State shape + action function placeholders (z.any())
 * - store-action-types.ts: Explicit function type definitions (THIS FILE)
 * - store.ts: Actual action implementations + StateCreator slices
 *
 * ============================================================================
 * USAGE PATTERN
 * ============================================================================
 *
 * These types are NOT directly imported by components/hooks.
 * They serve as internal reference documentation and enable IDE intellisense
 * through the inferred ChatStore type in store-schemas.ts.
 *
 * Components access actions via the typed ChatStore:
 *   const store = useChatStore()
 *   // All actions typed via ChatStore type inference
 *   store.setInputValue('text') // ✅ Type-safe
 */

import type { UIMessage } from 'ai';

import type { AnalysisStatus, FeedbackType, ScreenMode } from '@/api/core/enums';
import type {
  ModeratorAnalysisPayload,
  PreSearchDataPayload,
  RecommendedAction,
  RoundFeedbackData,
  StoredModeratorAnalysis,
  StoredPreSearch,
} from '@/api/routes/chat/schema';
import type { ChatParticipant, ChatThread } from '@/db/validation';
import type { ChatModeId } from '@/lib/config/chat-modes';

import type { ApplyRecommendedActionOptions } from './actions/recommended-action-application';
import type { ParticipantConfig, StreamResumptionState } from './store-schemas';

// ============================================================================
// FORM ACTIONS
// ============================================================================

export type SetInputValue = (value: string) => void;
export type SetSelectedMode = (mode: ChatModeId | null) => void;
export type SetSelectedParticipants = (participants: ParticipantConfig[]) => void;
export type SetEnableWebSearch = (enabled: boolean) => void;
export type SetModelOrder = (modelIds: string[]) => void;
export type AddParticipant = (participant: ParticipantConfig) => void;
export type RemoveParticipant = (participantId: string) => void;
export type UpdateParticipant = (participantId: string, updates: Partial<ParticipantConfig>) => void;
export type ReorderParticipants = (fromIndex: number, toIndex: number) => void;
export type ResetForm = () => void;

export type ApplyRecommendedActionResult = {
  success: boolean;
  error?: string;
  modelsAdded?: number;
  modelsSkipped?: number;
};

export type ApplyRecommendedAction = (
  action: RecommendedAction,
  options?: ApplyRecommendedActionOptions,
) => ApplyRecommendedActionResult;

// ============================================================================
// FEEDBACK ACTIONS
// ============================================================================

export type SetFeedback = (roundNumber: number, type: FeedbackType | null) => void;
export type SetPendingFeedback = (feedback: { roundNumber: number; type: FeedbackType } | null) => void;
export type ClearFeedback = (roundNumber: number) => void;
export type LoadFeedbackFromServer = (data: RoundFeedbackData[]) => void;
export type ResetFeedback = () => void;

// ============================================================================
// UI ACTIONS
// ============================================================================

export type SetShowInitialUI = (show: boolean) => void;
export type SetWaitingToStartStreaming = (waiting: boolean) => void;
export type SetIsCreatingThread = (creating: boolean) => void;
export type SetCreatedThreadId = (id: string | null) => void;
export type ResetUI = () => void;

// ============================================================================
// ANALYSIS ACTIONS
// ============================================================================

export type SetAnalyses = (analyses: StoredModeratorAnalysis[]) => void;
export type AddAnalysis = (analysis: StoredModeratorAnalysis) => void;
export type UpdateAnalysisData = (roundNumber: number, data: ModeratorAnalysisPayload) => void;
export type UpdateAnalysisStatus = (roundNumber: number, status: AnalysisStatus) => void;
export type UpdateAnalysisError = (roundNumber: number, errorMessage: string) => void;
export type RemoveAnalysis = (roundNumber: number) => void;
export type ClearAllAnalyses = () => void;

export type CreatePendingAnalysisParams = {
  roundNumber: number;
  messages: UIMessage[];
  participants: ChatParticipant[];
  userQuestion: string;
  threadId: string;
  mode: ChatModeId;
};

export type CreatePendingAnalysis = (params: CreatePendingAnalysisParams) => void;

// ============================================================================
// PRE-SEARCH ACTIONS
// ============================================================================

export type SetPreSearches = (preSearches: StoredPreSearch[]) => void;
export type AddPreSearch = (preSearch: StoredPreSearch) => void;
export type UpdatePreSearchData = (roundNumber: number, data: PreSearchDataPayload) => void;
export type UpdatePreSearchStatus = (roundNumber: number, status: AnalysisStatus) => void;
export type UpdatePreSearchError = (roundNumber: number, errorMessage: string | null) => void;
export type RemovePreSearch = (roundNumber: number) => void;
export type ClearAllPreSearches = () => void;

// ============================================================================
// THREAD ACTIONS - AI SDK Method Bindings
// ============================================================================

/**
 * Send message to selected participants
 * Bound from AI SDK v5 chat hook - handles streaming and message generation
 */
export type SendMessage = (message: string) => Promise<void>;

/**
 * Start a new round with selected participants
 * Bound from AI SDK v5 chat hook - orchestrates multi-participant conversation
 */
export type StartRound = () => Promise<void>;

/**
 * Stop current streaming operation
 * Bound from AI SDK v5 chat hook - cancels in-flight requests
 */
export type Stop = () => void;

/**
 * Manually set messages (for syncing with AI SDK state)
 * Bound from AI SDK v5 setMessages function
 */
export type ChatSetMessages = (messages: UIMessage[]) => void;

// Store action setters for AI SDK methods
export type SetThread = (thread: ChatThread | null) => void;
export type SetParticipants = (participants: ChatParticipant[]) => void;
export type SetMessages = (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;
export type SetIsStreaming = (isStreaming: boolean) => void;
export type SetCurrentParticipantIndex = (currentParticipantIndex: number) => void;
export type SetError = (error: Error | null) => void;
export type SetSendMessage = (fn?: SendMessage) => void;
export type SetStartRound = (fn?: StartRound) => void;
export type SetStop = (fn?: Stop) => void;
export type SetChatSetMessages = (fn?: ChatSetMessages) => void;

// ============================================================================
// FLAGS ACTIONS (UI re-render triggers)
// ============================================================================

export type SetHasInitiallyLoaded = (value: boolean) => void;
export type SetIsRegenerating = (value: boolean) => void;
export type SetIsCreatingAnalysis = (value: boolean) => void;
export type SetIsWaitingForChangelog = (value: boolean) => void;
export type SetHasPendingConfigChanges = (value: boolean) => void;

// ============================================================================
// DATA ACTIONS (Transient state)
// ============================================================================

export type SetRegeneratingRoundNumber = (value: number | null) => void;
export type SetPendingMessage = (value: string | null) => void;
export type SetExpectedParticipantIds = (value: string[] | null) => void;
export type SetStreamingRoundNumber = (value: number | null) => void;
export type SetCurrentRoundNumber = (value: number | null) => void;

// ============================================================================
// TRACKING ACTIONS (Deduplication & state tracking)
// ============================================================================

export type SetHasSentPendingMessage = (value: boolean) => void;

/**
 * Mark a round as having analysis created (prevents duplicates)
 */
export type MarkAnalysisCreated = (roundNumber: number) => void;

/**
 * Check if analysis has been created for a round (returns boolean)
 */
export type HasAnalysisBeenCreated = (roundNumber: number) => boolean;

/**
 * Clear analysis tracking for a round (used during regeneration)
 */
export type ClearAnalysisTracking = (roundNumber: number) => void;

/**
 * Mark a round as having pre-search triggered (prevents duplicates)
 */
export type MarkPreSearchTriggered = (roundNumber: number) => void;

/**
 * Check if pre-search has been triggered for a round (returns boolean)
 */
export type HasPreSearchBeenTriggered = (roundNumber: number) => boolean;

/**
 * Clear pre-search tracking for a round (used during regeneration)
 */
export type ClearPreSearchTracking = (roundNumber: number) => void;

// ============================================================================
// CALLBACKS ACTIONS (Event handlers)
// ============================================================================

/**
 * Callback invoked when streaming completes
 */
export type OnComplete = () => void;

export type SetOnComplete = (callback?: OnComplete) => void;

// ============================================================================
// SCREEN ACTIONS (Screen mode and read-only state)
// ============================================================================

export type SetScreenMode = (mode: ScreenMode | null) => void;
export type ResetScreenMode = () => void;

// ============================================================================
// STREAM RESUMPTION ACTIONS (Background stream continuation)
// ============================================================================

// NOTE: StreamResumptionState type is defined in store-schemas.ts using Zod-first pattern
// It uses StreamStatusSchema from @/api/core/enums for the state field
// Import from store-schemas.ts directly - do NOT re-export to maintain single source of truth

/**
 * Set the stream resumption state (when active stream detected)
 */
export type SetStreamResumptionState = (state: StreamResumptionState | null) => void;

/**
 * Get the current stream resumption state
 */
export type GetStreamResumptionState = () => StreamResumptionState | null;

/**
 * Check if stream resumption is needed (active stream exists for current thread)
 */
export type NeedsStreamResumption = () => boolean;

/**
 * Check if stream resumption state is stale (too old to resume)
 */
export type IsStreamResumptionStale = () => boolean;

/**
 * Check if stream resumption state is valid (correct thread, valid participant index)
 */
export type IsStreamResumptionValid = () => boolean;

/**
 * Handle completion of a resumed stream
 * Triggers next participant or marks round complete
 */
export type HandleResumedStreamComplete = (roundNumber: number, participantIndex: number) => void;

/**
 * Handle failure of stream resumption
 * Clears resumption state and allows normal flow
 */
export type HandleStreamResumptionFailure = (error: Error) => void;

/**
 * Get the next participant index to trigger after resumption
 * Returns null if round is complete
 */
export type GetNextParticipantToTrigger = () => number | null;

/**
 * Mark a resumption attempt as started (prevents duplicates)
 * Returns true if first attempt, false if already attempted
 */
export type MarkResumptionAttempted = (roundNumber: number, participantIndex: number) => boolean;

/**
 * Check if we need to sync a completed message from the database
 * Used when stream completed but frontend missed the final message
 */
export type NeedsMessageSync = () => boolean;

/**
 * Clear stream resumption state (on navigation cleanup)
 */
export type ClearStreamResumption = () => void;

// ============================================================================
// OPERATIONS ACTIONS (Composite multi-slice operations)
// ============================================================================

/**
 * Reset only thread-related state (messages, participants, error)
 * Preserves form state and screen mode for continuing in the thread
 */
export type ResetThreadState = () => void;

/**
 * Complete reset to overview screen state
 * Clears thread, form, analysis, pre-search, feedback, callbacks, and screen mode
 * Used when navigating back to overview
 */
export type ResetToOverview = () => void;

/**
 * Initialize thread with data from server
 * Sets up thread context, participants, and optionally initial messages
 */
export type InitializeThread = (
  thread: ChatThread,
  participants: ChatParticipant[],
  initialMessages?: UIMessage[],
) => void;

/**
 * Update participants (syncs from context to store)
 * Used when participants are updated in the chat context
 */
export type UpdateParticipants = (participants: ChatParticipant[]) => void;

/**
 * Prepare for new message submission
 * Sets waitingForChangelog, pendingMessage, and expectedParticipantIds
 */
export type PrepareForNewMessage = (message: string, participantIds: string[]) => void;

/**
 * Mark streaming/analysis as complete
 * Clears streaming flags and round numbers
 */
export type CompleteStreaming = () => void;

/**
 * Start round regeneration
 * Clears analysis tracking and sets regeneration flag
 */
export type StartRegeneration = (roundNumber: number) => void;

/**
 * Complete regeneration
 * Clears regeneration flags and round numbers
 */
export type CompleteRegeneration = (roundNumber: number) => void;

/**
 * ✅ NAVIGATION CLEANUP: Reset to new chat state
 *
 * Cancels ongoing streams and resets all state to defaults.
 * Used when navigating to new chat via:
 * - "New Chat" button click
 * - Logo/home link click
 * - Direct navigation to /chat route
 */
export type ResetToNewChat = () => void;

/**
 * ✅ STREAMING CONTROL: Stop ongoing streaming
 *
 * Calls the abort controller and sets streaming to false.
 * Used when:
 * - User clicks stop button
 * - Component unmounts during streaming
 * - Navigation away from thread
 */
export type StopStreaming = () => void;

/**
 * ✅ SIMPLE RESET: Alias for resetToOverview
 *
 * Convenience function for resetting to overview state.
 * Used in tests and simple reset scenarios.
 */
export type Reset = () => void;

// ============================================================================
// AGGREGATED ACTION TYPES BY SLICE
// ============================================================================

export type FormActionsType = {
  setInputValue: SetInputValue;
  setSelectedMode: SetSelectedMode;
  setSelectedParticipants: SetSelectedParticipants;
  setEnableWebSearch: SetEnableWebSearch;
  setModelOrder: SetModelOrder;
  addParticipant: AddParticipant;
  removeParticipant: RemoveParticipant;
  updateParticipant: UpdateParticipant;
  reorderParticipants: ReorderParticipants;
  resetForm: ResetForm;
  applyRecommendedAction: ApplyRecommendedAction;
};

export type FeedbackActionsType = {
  setFeedback: SetFeedback;
  setPendingFeedback: SetPendingFeedback;
  clearFeedback: ClearFeedback;
  loadFeedbackFromServer: LoadFeedbackFromServer;
  resetFeedback: ResetFeedback;
};

export type UIActionsType = {
  setShowInitialUI: SetShowInitialUI;
  setWaitingToStartStreaming: SetWaitingToStartStreaming;
  setIsCreatingThread: SetIsCreatingThread;
  setCreatedThreadId: SetCreatedThreadId;
  resetUI: ResetUI;
};

export type AnalysisActionsType = {
  setAnalyses: SetAnalyses;
  addAnalysis: AddAnalysis;
  updateAnalysisData: UpdateAnalysisData;
  updateAnalysisStatus: UpdateAnalysisStatus;
  updateAnalysisError: UpdateAnalysisError;
  removeAnalysis: RemoveAnalysis;
  clearAllAnalyses: ClearAllAnalyses;
  createPendingAnalysis: CreatePendingAnalysis;
};

export type PreSearchActionsType = {
  setPreSearches: SetPreSearches;
  addPreSearch: AddPreSearch;
  updatePreSearchData: UpdatePreSearchData;
  updatePreSearchStatus: UpdatePreSearchStatus;
  updatePreSearchError: UpdatePreSearchError;
  removePreSearch: RemovePreSearch;
  clearAllPreSearches: ClearAllPreSearches;
};

export type ThreadActionsType = {
  setThread: SetThread;
  setParticipants: SetParticipants;
  setMessages: SetMessages;
  setIsStreaming: SetIsStreaming;
  setCurrentParticipantIndex: SetCurrentParticipantIndex;
  setError: SetError;
  setSendMessage: SetSendMessage;
  setStartRound: SetStartRound;
  setStop: SetStop;
  setChatSetMessages: SetChatSetMessages;
};

export type FlagsActionsType = {
  setHasInitiallyLoaded: SetHasInitiallyLoaded;
  setIsRegenerating: SetIsRegenerating;
  setIsCreatingAnalysis: SetIsCreatingAnalysis;
  setIsWaitingForChangelog: SetIsWaitingForChangelog;
  setHasPendingConfigChanges: SetHasPendingConfigChanges;
};

export type DataActionsType = {
  setRegeneratingRoundNumber: SetRegeneratingRoundNumber;
  setPendingMessage: SetPendingMessage;
  setExpectedParticipantIds: SetExpectedParticipantIds;
  setStreamingRoundNumber: SetStreamingRoundNumber;
  setCurrentRoundNumber: SetCurrentRoundNumber;
};

export type TrackingActionsType = {
  setHasSentPendingMessage: SetHasSentPendingMessage;
  markAnalysisCreated: MarkAnalysisCreated;
  hasAnalysisBeenCreated: HasAnalysisBeenCreated;
  clearAnalysisTracking: ClearAnalysisTracking;
  markPreSearchTriggered: MarkPreSearchTriggered;
  hasPreSearchBeenTriggered: HasPreSearchBeenTriggered;
  clearPreSearchTracking: ClearPreSearchTracking;
};

export type CallbacksActionsType = {
  setOnComplete: SetOnComplete;
};

export type ScreenActionsType = {
  setScreenMode: SetScreenMode;
  resetScreenMode: ResetScreenMode;
};

export type OperationsActionsType = {
  resetThreadState: ResetThreadState;
  resetToOverview: ResetToOverview;
  initializeThread: InitializeThread;
  updateParticipants: UpdateParticipants;
  prepareForNewMessage: PrepareForNewMessage;
  completeStreaming: CompleteStreaming;
  startRegeneration: StartRegeneration;
  completeRegeneration: CompleteRegeneration;
  stopStreaming: StopStreaming;
  reset: Reset;
};

// ============================================================================
// COMPLETE ACTIONS AGGREGATION
// ============================================================================

export type AllChatStoreActions
  = & FormActionsType
    & FeedbackActionsType
    & UIActionsType
    & AnalysisActionsType
    & PreSearchActionsType
    & ThreadActionsType
    & FlagsActionsType
    & DataActionsType
    & TrackingActionsType
    & CallbacksActionsType
    & ScreenActionsType
    & OperationsActionsType;

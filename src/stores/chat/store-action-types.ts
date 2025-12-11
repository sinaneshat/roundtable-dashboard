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

import type { AnalysisStatus, ChatMode, FeedbackType, ScreenMode } from '@/api/core/enums';
import type {
  ArticleRecommendation,
  ModeratorAnalysisPayload,
  PartialPreSearchData,
  PreSearchDataPayload,
  RoundFeedbackData,
  StoredModeratorAnalysis,
  StoredPreSearch,
} from '@/api/routes/chat/schema';
import type { ChatParticipant, ChatThread } from '@/db/validation';
import type { FilePreview } from '@/hooks/utils/use-file-preview';
import type { UploadItem } from '@/hooks/utils/use-file-upload';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';

import type { ApplyRecommendedActionOptions } from './actions/recommended-action-application';
import type { PendingAttachment, StreamResumptionState } from './store-schemas';

// ============================================================================
// FORM ACTIONS
// ============================================================================

export type SetInputValue = (value: string) => void;
export type SetSelectedMode = (mode: ChatMode | null) => void;
export type SetSelectedParticipants = (participants: ParticipantConfig[]) => void;
export type SetEnableWebSearch = (enabled: boolean) => void;
export type SetModelOrder = (modelIds: string[]) => void;
export type AddParticipant = (participant: ParticipantConfig) => void;
export type RemoveParticipant = (participantId: string) => void;
export type UpdateParticipant = (participantId: string, updates: Partial<ParticipantConfig>) => void;
export type ReorderParticipants = (fromIndex: number, toIndex: number) => void;
export type ResetForm = () => void;

/**
 * Result from store's applyRecommendedAction
 * ✅ ARTICLE-STYLE: Simplified - no model operations (recommendations are just prompts now)
 */
export type ApplyRecommendedActionResult = {
  success: boolean;
  error?: string;
};

export type ApplyRecommendedAction = (
  action: ArticleRecommendation,
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
  userQuestion: string;
  threadId: string;
  mode: ChatMode;
};

export type CreatePendingAnalysis = (params: CreatePendingAnalysisParams) => void;

// ============================================================================
// PRE-SEARCH ACTIONS
// ============================================================================

export type SetPreSearches = (preSearches: StoredPreSearch[]) => void;
export type AddPreSearch = (preSearch: StoredPreSearch) => void;
export type UpdatePreSearchData = (roundNumber: number, data: PreSearchDataPayload) => void;
/** ✅ PROGRESSIVE UI: Update searchData WITHOUT changing status (for streaming updates) */
export type UpdatePartialPreSearchData = (roundNumber: number, partialData: PartialPreSearchData) => void;
export type UpdatePreSearchStatus = (roundNumber: number, status: AnalysisStatus) => void;
export type UpdatePreSearchError = (roundNumber: number, errorMessage: string | null) => void;
export type RemovePreSearch = (roundNumber: number) => void;
export type ClearAllPreSearches = () => void;
export type CheckStuckPreSearches = () => void;
/** Update the last activity timestamp for a pre-search (for timeout tracking) */
export type UpdatePreSearchActivity = (roundNumber: number) => void;
/** Get the last activity timestamp for a pre-search */
export type GetPreSearchActivityTime = (roundNumber: number) => number | undefined;
/** Clear activity tracking for a pre-search (after completion) */
export type ClearPreSearchActivity = (roundNumber: number) => void;

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
export type SetChatSetMessages = (fn?: ChatSetMessages) => void;
export type CheckStuckStreams = () => void;

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
export type SetPendingAttachmentIds = (value: string[] | null) => void;
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

/**
 * Mark analysis stream as triggered (prevents duplicate stream submissions)
 * Takes both analysisId and roundNumber for two-level deduplication
 */
export type MarkAnalysisStreamTriggered = (analysisId: string, roundNumber: number) => void;

/**
 * Check if analysis stream has been triggered (returns boolean)
 * Can check by analysisId or roundNumber
 */
export type HasAnalysisStreamBeenTriggered = (analysisId: string, roundNumber: number) => boolean;

/**
 * Clear analysis stream tracking for a round (used during regeneration)
 * Clears both round tracking and any analysis IDs containing the round number
 */
export type ClearAnalysisStreamTracking = (roundNumber: number) => void;

/**
 * ✅ IMMEDIATE UI FEEDBACK: Set flag when early optimistic message is added
 * Used by handleUpdateThreadAndSend to indicate it already added an optimistic message
 * so prepareForNewMessage can skip adding a duplicate
 */
export type SetHasEarlyOptimisticMessage = (value: boolean) => void;

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
 * Set the next participant index to trigger for incomplete round resumption
 * Used when detecting incomplete rounds on page load
 */
export type SetNextParticipantToTrigger = (index: number | null) => void;

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

/**
 * Pre-fill stream resumption state from server-side KV check
 * Called during SSR to set up state BEFORE AI SDK resume runs
 * ✅ RESUMABLE STREAMS: Enables proper coordination between AI SDK and incomplete-round-resumption
 */
export type PrefillStreamResumptionState = (
  threadId: string,
  serverState: {
    hasActiveStream: boolean;
    streamId: string | null;
    roundNumber: number | null;
    totalParticipants: number | null;
    participantStatuses: Record<string, 'active' | 'completed' | 'failed'> | null;
    nextParticipantToTrigger: number | null;
    roundComplete: boolean;
  },
) => void;

// ============================================================================
// ANIMATION ACTIONS (Animation completion tracking)
// ============================================================================

/**
 * Animation resolver function type
 * Called to resolve a pending animation completion promise
 */
export type AnimationResolver = () => void;

/**
 * Register an animation as pending for a participant
 * Called when streaming starts for a participant
 */
export type RegisterAnimation = (participantIndex: number) => void;

/**
 * Mark an animation as complete for a participant
 * Called when streaming finishes and animation settles
 */
export type CompleteAnimation = (participantIndex: number) => void;

/**
 * Wait for an animation to complete
 * Returns a promise that resolves when the animation is done
 */
export type WaitForAnimation = (participantIndex: number) => Promise<void>;

/**
 * Clear all pending animations
 * Used when starting a new round or during cleanup
 */
export type ClearAnimations = () => void;

// ============================================================================
// ATTACHMENTS ACTIONS (File upload management)
// ============================================================================

// ✅ PendingAttachment type is defined via Zod in store-schemas.ts (single source of truth)
// Use: import { type PendingAttachment } from './store-schemas'

/**
 * Add files to pending attachments
 */
export type AddAttachments = (files: File[]) => void;

/**
 * Remove a pending attachment by ID
 */
export type RemoveAttachment = (id: string) => void;

/**
 * Clear all pending attachments
 */
export type ClearAttachments = () => void;

/**
 * Update an attachment's upload item (after upload starts/completes)
 */
export type UpdateAttachmentUpload = (id: string, uploadItem: UploadItem) => void;

/**
 * Update an attachment's preview
 */
export type UpdateAttachmentPreview = (id: string, preview: FilePreview) => void;

/**
 * Get all pending attachments
 */
export type GetAttachments = () => PendingAttachment[];

/**
 * Check if there are any pending attachments
 */
export type HasAttachments = () => boolean;

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
 * ✅ CRITICAL FIX: Reset for thread-to-thread navigation
 *
 * Called when navigating BETWEEN threads (e.g., /chat/thread-1 → /chat/thread-2)
 * Unlike ResetThreadState which only clears flags, this ALSO clears:
 * - thread, participants, messages (previous thread data)
 * - analyses, preSearches (previous thread content)
 * - AI SDK hook's internal messages (via chatSetMessages)
 *
 * This prevents the critical bug where stale messages/participants from
 * a previous thread leak into a new thread, causing participant ID mismatches.
 */
export type ResetForThreadNavigation = () => void;

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
 * Sets waitingForChangelog, pendingMessage, expectedParticipantIds, pendingAttachmentIds, and pendingFileParts
 * @param fileParts - Pre-built file parts from attachmentInfos (ExtendedFilePart includes uploadId for backend fallback)
 */
export type PrepareForNewMessage = (message: string, participantIds: string[], attachmentIds?: string[], fileParts?: ExtendedFilePart[]) => void;

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
 * Form preferences for reset - read from preferences store cookie
 * Allows resetting chat state while preserving user's model selections
 */
export type ResetFormPreferences = {
  /** Selected model IDs from preferences cookie */
  selectedModelIds?: string[];
  /** Model order from preferences cookie */
  modelOrder?: string[];
  /** Selected mode from preferences cookie */
  selectedMode?: string | null;
  /** Web search enabled from preferences cookie */
  enableWebSearch?: boolean;
};

/**
 * ✅ NAVIGATION CLEANUP: Reset to new chat state
 *
 * Cancels ongoing streams and resets state.
 * When preferences are provided, initializes form state from user's persisted preferences.
 * When no preferences, resets to empty defaults (legacy behavior).
 *
 * Used when navigating to new chat via:
 * - "New Chat" button click
 * - Logo/home link click
 * - Direct navigation to /chat route
 */
export type ResetToNewChat = (preferences?: ResetFormPreferences) => void;

/**
 * Reset local streaming state (backend continues via waitUntil)
 */
export type StopStreaming = () => void;

/**
 * Alias for resetToOverview - used in tests
 */
export type Reset = () => void;

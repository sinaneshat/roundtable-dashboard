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

import type { ChatMode, FeedbackType, MessageStatus, ScreenMode } from '@roundtable/shared';
import type { UIMessage } from 'ai';

import type { FilePreview, PendingAttachment, UploadItem } from '@/hooks/utils';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import type {
  ChatParticipant,
  ChatThread,
  PartialPreSearchData,
  PreSearchDataPayload,
  RoundFeedbackData,
  StoredPreSearch,
  ThreadStreamResumptionState,
} from '@/services/api';

import type { ResetFormPreferences } from './store-defaults';
import type { StreamResumptionState } from './store-schemas';

// ============================================================================
// FORM ACTIONS
// ============================================================================

export type SetInputValue = (value: string) => void;
export type SetSelectedMode = (mode: ChatMode | null) => void;
export type SetSelectedParticipants = (participants: ParticipantConfig[]) => void;
export type SetEnableWebSearch = (enabled: boolean) => void;
export type SetModelOrder = (modelIds: string[]) => void;
export type SetAutoMode = (enabled: boolean) => void;
export type AddParticipant = (participant: ParticipantConfig) => void;
export type RemoveParticipant = (participantId: string) => void;
export type UpdateParticipant = (participantId: string, updates: Partial<ParticipantConfig>) => void;
export type ReorderParticipants = (fromIndex: number, toIndex: number) => void;
export type ResetForm = () => void;

// ============================================================================
// FEEDBACK ACTIONS
// ============================================================================

export type SetFeedback = (roundNumber: number, type: FeedbackType | null) => void;
export type SetPendingFeedback = (feedback: { roundNumber: number; type: FeedbackType } | null) => void;
export type LoadFeedbackFromServer = (data: RoundFeedbackData[]) => void;

// ============================================================================
// UI ACTIONS
// ============================================================================

export type SetShowInitialUI = (show: boolean) => void;
export type SetWaitingToStartStreaming = (waiting: boolean) => void;
export type SetIsCreatingThread = (creating: boolean) => void;
export type SetCreatedThreadId = (id: string | null) => void;
export type SetCreatedThreadProjectId = (projectId: string | null) => void;
export type SetIsAnalyzingPrompt = (analyzing: boolean) => void;
export type ResetUI = () => void;

// ============================================================================
// PRE-SEARCH ACTIONS
// ============================================================================

export type SetPreSearches = (preSearches: StoredPreSearch[]) => void;
export type AddPreSearch = (preSearch: StoredPreSearch) => void;
/**
 * Update pre-search data after streaming completes
 */
export type UpdatePreSearchData = (roundNumber: number, data: PreSearchDataPayload) => void;
/**
 * ✅ PROGRESSIVE UI: Update searchData WITHOUT changing status (for streaming updates)
 */
export type UpdatePartialPreSearchData = (roundNumber: number, partialData: PartialPreSearchData) => void;
export type UpdatePreSearchStatus = (roundNumber: number, status: MessageStatus) => void;
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
 * Bound from AI SDK v6 chat hook - handles streaming and message generation
 */
export type SendMessage = (message: string) => Promise<void>;

/**
 * Start a new round with selected participants
 * Bound from AI SDK v6 chat hook - orchestrates multi-participant conversation
 */
export type StartRound = () => Promise<void>;

/**
 * Manually set messages (for syncing with AI SDK state)
 * Bound from AI SDK v6 setMessages function
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
// STREAMING MESSAGE ACTIONS (Direct store updates for AI SDK callbacks)
// ============================================================================

/**
 * Options for upserting a streaming message
 */
export type UpsertStreamingMessageOptions = {
  /** The message to upsert */
  message: UIMessage;
  /** If true, only update if message doesn't exist (prevents overwrites during race conditions) */
  insertOnly?: boolean;
};

/**
 * Type guard to check if input is UpsertStreamingMessageOptions (has message property)
 */
export function isUpsertOptions(
  value: UpsertStreamingMessageOptions | UIMessage,
): value is UpsertStreamingMessageOptions {
  return value !== null
    && typeof value === 'object'
    && 'message' in value
    && typeof (value as UpsertStreamingMessageOptions).message === 'object';
}

/**
 * Upsert a streaming message into the store
 *
 * If message with same ID exists:
 * - Updates parts if new message has more content
 * - Preserves existing content if new message has less
 *
 * If message doesn't exist:
 * - Appends to messages array
 * - Maintains round order (inserts after messages from earlier rounds)
 *
 * This is the primary action for use-multi-participant-chat.ts to write directly to store.
 *
 * Accepts both:
 * - Direct message: `upsertStreamingMessage(message)`
 * - Options object: `upsertStreamingMessage({ message, insertOnly })`
 */
export type UpsertStreamingMessage = (optionsOrMessage: UpsertStreamingMessageOptions | UIMessage) => void;

/**
 * Replace a temporary message ID with a deterministic ID
 *
 * Used when AI SDK initially creates a message with a temp ID (e.g., "gen-xxx")
 * but the server returns a deterministic ID (e.g., "thread-123_r0_p0").
 *
 * This action:
 * 1. Finds the message with tempId
 * 2. Updates its ID to deterministicId
 * 3. Merges any additional metadata from the finalized message
 */
export type FinalizeMessageId = (tempId: string, deterministicId: string, finalMessage: UIMessage) => void;

/**
 * Deduplicate messages by (roundNumber, participantIndex)
 *
 * When multiple messages exist for the same participant in the same round:
 * - Keeps the message with deterministic ID (contains "_r" and "_p")
 * - Removes messages with temporary IDs
 * - Preserves the one with more content if both have deterministic IDs
 *
 * This is called after streaming completes to clean up any duplicates.
 */
export type DeduplicateMessages = () => void;

// ============================================================================
// FLAGS ACTIONS (UI re-render triggers)
// ============================================================================

export type SetHasInitiallyLoaded = (value: boolean) => void;
export type SetIsRegenerating = (value: boolean) => void;
export type SetIsModeratorStreaming = (value: boolean) => void;
/** Complete moderator stream - sets isModeratorStreaming=false */
export type CompleteModeratorStream = () => void;
export type SetIsWaitingForChangelog = (value: boolean) => void;
export type SetHasPendingConfigChanges = (value: boolean) => void;
/** ✅ PATCH BLOCKING: Set while PATCH is in progress to prevent streaming race condition */
export type SetIsPatchInProgress = (value: boolean) => void;
/** ✅ HANDOFF FIX: Set during P0→P1 participant transition to prevent 10s cleanup */
export type SetParticipantHandoffInProgress = (value: boolean) => void;

// ============================================================================
// DATA ACTIONS (Transient state)
// ============================================================================

export type SetRegeneratingRoundNumber = (value: number | null) => void;
export type SetPendingMessage = (value: string | null) => void;
export type SetPendingAttachmentIds = (value: string[] | null) => void;
export type SetPendingFileParts = (value: ExtendedFilePart[] | null) => void;
export type SetExpectedParticipantIds = (value: string[] | null) => void;
export type SetStreamingRoundNumber = (value: number | null) => void;
export type SetCurrentRoundNumber = (value: number | null) => void;
/** Track round number when config changes are submitted (for incremental changelog fetch) */
export type SetConfigChangeRoundNumber = (value: number | null) => void;

// ============================================================================
// TRACKING ACTIONS (Deduplication & state tracking)
// ============================================================================

export type SetHasSentPendingMessage = (value: boolean) => void;

/**
 * Mark a round as having moderator created (prevents duplicates)
 */
export type MarkModeratorCreated = (roundNumber: number) => void;

/**
 * Check if moderator has been created for a round (returns boolean)
 */
export type HasModeratorBeenCreated = (roundNumber: number) => boolean;

/**
 * Atomic check-and-mark for moderator creation (prevents race conditions)
 * Returns true if successfully marked (was not already created)
 * Returns false if already created (another component got there first)
 */
export type TryMarkModeratorCreated = (roundNumber: number) => boolean;

/**
 * Clear moderator tracking for a round (used during regeneration)
 */
export type ClearModeratorTracking = (roundNumber: number) => void;

/**
 * Mark a round as having pre-search triggered (prevents duplicates)
 */
export type MarkPreSearchTriggered = (roundNumber: number) => void;

/**
 * Check if pre-search has been triggered for a round (returns boolean)
 */
export type HasPreSearchBeenTriggered = (roundNumber: number) => boolean;

/**
 * Atomic check-and-mark for pre-search triggering (prevents race conditions)
 * Returns true if successfully marked (was not already triggered)
 * Returns false if already triggered (another component got there first)
 */
export type TryMarkPreSearchTriggered = (roundNumber: number) => boolean;

/**
 * Clear pre-search tracking for a round (used during regeneration)
 */
export type ClearPreSearchTracking = (roundNumber: number) => void;

/**
 * Clear all pre-search tracking (used during navigation cleanup)
 */
export type ClearAllPreSearchTracking = () => void;

/**
 * Mark moderator stream as triggered (prevents duplicate stream submissions)
 * Takes both moderatorMessageId and roundNumber for two-level deduplication
 * Note: Moderator now renders inline via messages array with isModerator: true metadata
 */
export type MarkModeratorStreamTriggered = (moderatorMessageId: string, roundNumber: number) => void;

/**
 * Check if moderator stream has been triggered (returns boolean)
 * Can check by moderatorMessageId or roundNumber
 * Note: Moderator now renders inline via messages array with isModerator: true metadata
 */
export type HasModeratorStreamBeenTriggered = (moderatorMessageId: string, roundNumber: number) => boolean;

/**
 * Clear moderator stream tracking for a round (used during regeneration)
 * Clears both round tracking and any moderator message IDs containing the round number
 * Note: Moderator now renders inline via messages array with isModerator: true metadata
 */
export type ClearModeratorStreamTracking = (roundNumber: number) => void;

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
 * Set the next participant to trigger for incomplete round resumption
 * Accepts object with ID for validation, or just index when participants aren't loaded yet
 * Used when detecting incomplete rounds on page load
 */
export type SetNextParticipantToTrigger = (
  value: { index: number; participantId: string } | number | null,
) => void;

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
 * Uses RPC-inferred ThreadStreamResumptionState (single source of truth)
 */
export type PrefillStreamResumptionState = (
  threadId: string,
  serverState: ThreadStreamResumptionState,
) => void;

/**
 * Set the resumption scope thread ID for validating stale effects
 * Called when navigating to a thread to establish the current scope
 */
export type SetResumptionScope = (threadId: string) => void;

/**
 * ✅ SMART STALE DETECTION: Reconcile prefilled state with actual active stream
 * Called when AI SDK auto-resumes a valid stream that matches expected state.
 * Updates store to reflect that server already triggered this participant.
 *
 * @param streamingParticipantIndex - The participant index currently streaming
 */
export type ReconcileWithActiveStream = (streamingParticipantIndex: number) => void;

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
// SIDEBAR ANIMATION ACTIONS (AI title typewriter effect)
// ============================================================================

/**
 * Start the title animation for a thread
 * Called when AI-generated title is ready - triggers delete→type animation
 */
export type StartTitleAnimation = (threadId: string, oldTitle: string, newTitle: string) => void;

/**
 * Update the currently displayed title during animation
 * Called by animation controller during delete/type phases
 */
export type UpdateDisplayedTitle = (title: string) => void;

/**
 * Set the current animation phase
 * State machine: idle → deleting → typing → complete
 */
export type SetAnimationPhase = (phase: 'idle' | 'deleting' | 'typing' | 'complete') => void;

/**
 * Complete the title animation
 * Resets all animation state to idle
 */
export type CompleteTitleAnimation = () => void;

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
 * Clears thread, form, moderator, pre-search, feedback, callbacks, and screen mode
 * Used when navigating back to overview
 */
export type ResetToOverview = () => void;

/**
 * ✅ CRITICAL FIX: Reset for thread-to-thread navigation
 *
 * Called when navigating BETWEEN threads (e.g., /chat/thread-1 → /chat/thread-2)
 * Unlike ResetThreadState which only clears flags, this ALSO clears:
 * - thread, participants, messages (previous thread data)
 * - moderators, preSearches (previous thread content)
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
 * Mark streaming/moderator as complete
 * Clears streaming flags and round numbers
 */
export type CompleteStreaming = () => void;

/**
 * Start round regeneration
 * Clears moderator tracking and sets regeneration flag
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
 * Cancels ongoing streams and resets state.
 * When preferences are provided, initializes form state from user's persisted preferences.
 * When no preferences, resets to empty defaults.
 *
 * Used when navigating to new chat via:
 * - "New Chat" button click
 * - Logo/home link click
 * - Direct navigation to /chat route
 *
 * ✅ PATTERN: ResetFormPreferences from store-defaults.ts (Zod schema single source of truth)
 */
export type ResetToNewChat = (preferences?: ResetFormPreferences) => void;

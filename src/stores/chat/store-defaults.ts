/**
 * Centralized Store Default Values - Single Source of Truth
 *
 * All chat store default/initial values consolidated in one location.
 * Eliminates duplication and ensures consistency across reset functions.
 *
 * ✅ PATTERN: Define defaults → Use `satisfies` for type safety → Export
 * ✅ TYPE-SAFE: Types derived from store-schemas.ts via `satisfies`
 * ✅ SINGLE SOURCE: All reset functions reference these values
 * ✅ MAINTAINABLE: Add new state? Update here once, all resets inherit
 *
 * Reference pattern: /src/api/core/enums.ts, /src/stores/chat/store-schemas.ts
 */

import { DEFAULT_CHAT_MODE, ScreenModes } from '@/api/core/enums';

import type {
  AnimationState,
  AttachmentsState,
  CallbacksState,
  DataState,
  FeedbackState,
  FlagsState,
  FormState,
  PreSearchState,
  ScreenState,
  StreamResumptionSliceState,
  ThreadState,
  TrackingState,
  UIState,
} from './store-schemas';

// ============================================================================
// FORM SLICE DEFAULTS
// ============================================================================

export const FORM_DEFAULTS = {
  inputValue: '',
  selectedMode: DEFAULT_CHAT_MODE, // 'debating' - single source of truth from enums
  selectedParticipants: [],
  enableWebSearch: false, // ⚠️ NOTE: This is ONLY used for new chats - thread screen syncs from thread.enableWebSearch
  modelOrder: [], // Visual order of models for drag-and-drop
} satisfies FormState;

// ============================================================================
// FEEDBACK SLICE DEFAULTS
// ============================================================================

export const FEEDBACK_DEFAULTS = {
  feedbackByRound: new Map(),
  pendingFeedback: null,
  hasLoadedFeedback: false,
} satisfies FeedbackState;

// ============================================================================
// UI SLICE DEFAULTS
// ============================================================================

export const UI_DEFAULTS = {
  showInitialUI: true,
  waitingToStartStreaming: false,
  isCreatingThread: false,
  createdThreadId: null,
} satisfies UIState;

// ============================================================================
// PRE-SEARCH SLICE DEFAULTS
// ============================================================================

export const PRESEARCH_DEFAULTS = {
  preSearches: [],
  preSearchActivityTimes: new Map(),
} satisfies PreSearchState;

// ============================================================================
// THREAD SLICE DEFAULTS
// ============================================================================

export const THREAD_DEFAULTS = {
  thread: null,
  participants: [],
  messages: [],
  isStreaming: false,
  currentParticipantIndex: 0,
  error: null,
  // AI SDK methods
  sendMessage: undefined,
  startRound: undefined,
  chatSetMessages: undefined,
} satisfies ThreadState;

// ============================================================================
// FLAGS SLICE DEFAULTS
// ============================================================================

export const FLAGS_DEFAULTS = {
  hasInitiallyLoaded: false,
  isRegenerating: false,
  isModeratorStreaming: false,
  isWaitingForChangelog: false,
  hasPendingConfigChanges: false,
} satisfies FlagsState;

// ============================================================================
// DATA SLICE DEFAULTS
// ============================================================================

export const DATA_DEFAULTS = {
  regeneratingRoundNumber: null,
  pendingMessage: null,
  pendingAttachmentIds: null,
  /** File parts for AI SDK message creation - set before clearAttachments() */
  // ✅ Uses ExtendedFilePart schema which includes uploadId for backend fallback loading
  pendingFileParts: null,
  expectedParticipantIds: null,
  streamingRoundNumber: null,
  currentRoundNumber: null,
} satisfies DataState;

// ============================================================================
// TRACKING SLICE DEFAULTS
// ============================================================================

// Using satisfies instead of as const to allow fresh Set instances on each reset.
// This prevents reusing the same Set instances created at module load,
// which would cause state pollution across thread navigations.
export const TRACKING_DEFAULTS = {
  hasSentPendingMessage: false,
  createdModeratorRounds: new Set<number>(),
  triggeredPreSearchRounds: new Set<number>(),
  /** Moderator stream tracking: Prevents duplicate stream submissions by round number */
  triggeredModeratorRounds: new Set<number>(),
  /** Moderator stream tracking: Prevents duplicate stream submissions by moderator ID */
  triggeredModeratorIds: new Set<string>(),
  /** ✅ IMMEDIATE UI FEEDBACK: Track when early optimistic message added by handleUpdateThreadAndSend */
  hasEarlyOptimisticMessage: false,
} satisfies TrackingState;

// ============================================================================
// CALLBACKS SLICE DEFAULTS
// ============================================================================

export const CALLBACKS_DEFAULTS = {
  onComplete: undefined,
} satisfies CallbacksState;

// ============================================================================
// SCREEN SLICE DEFAULTS
// ============================================================================

export const SCREEN_DEFAULTS = {
  screenMode: ScreenModes.OVERVIEW,
  isReadOnly: false,
} satisfies ScreenState;

// ============================================================================
// STREAM RESUMPTION SLICE DEFAULTS
// ============================================================================

export const STREAM_RESUMPTION_DEFAULTS = {
  streamResumptionState: null,
  resumptionAttempts: new Set<string>(),
  nextParticipantToTrigger: null,
  /** Flag set when server-side prefilled resumption state - guards AI SDK phantom resume */
  streamResumptionPrefilled: false,
  /** Thread ID that the prefilled state is for - ensures state matches current thread */
  prefilledForThreadId: null,
  /** ✅ UNIFIED PHASES: Current phase for resumption logic */
  currentResumptionPhase: null,
  /** Pre-search resumption state (null if web search not enabled) */
  preSearchResumption: null,
  /** Moderator resumption state */
  moderatorResumption: null,
  /** Current round number for resumption */
  resumptionRoundNumber: null,
} satisfies StreamResumptionSliceState;

// ============================================================================
// ANIMATION SLICE DEFAULTS
// ============================================================================

export const ANIMATION_DEFAULTS = {
  pendingAnimations: new Set<number>(), // Set of participant indices with pending animations
  animationResolvers: new Map(), // Resolve functions for animation completion promises
} satisfies AnimationState;

// ============================================================================
// ATTACHMENTS SLICE DEFAULTS
// ============================================================================

export const ATTACHMENTS_DEFAULTS = {
  pendingAttachments: [],
} satisfies AttachmentsState;

// ============================================================================
// TYPE-SAFE STATE RESET GROUPS
// ============================================================================
// These groups ensure that when resetting related state, ALL fields are included.
// Using these groups prevents bugs where individual fields are forgotten.
// TypeScript will error if these don't match the store schema.

/**
 * All streaming-related flags that must be cleared together
 * Used when streaming completes (participants or moderator)
 */
export const STREAMING_STATE_RESET = {
  isStreaming: false,
  streamingRoundNumber: null,
  currentRoundNumber: null,
  waitingToStartStreaming: false,
  currentParticipantIndex: 0,
} satisfies Pick<ThreadState & UIState & DataState, 'isStreaming' | 'currentParticipantIndex'> & Pick<DataState, 'streamingRoundNumber' | 'currentRoundNumber'> & Pick<UIState, 'waitingToStartStreaming'>;

/**
 * Moderator creation flags
 * Used when moderator creation/streaming completes
 * Note: Moderator now renders inline via messages array with isModerator: true metadata
 */
export const MODERATOR_STATE_RESET = {
  isModeratorStreaming: false,
  isWaitingForChangelog: false,
} satisfies Pick<FlagsState, 'isModeratorStreaming' | 'isWaitingForChangelog'>;

/**
 * Pending message state that must be cleared after message is sent
 * Used when a message is fully processed
 */
export const PENDING_MESSAGE_STATE_RESET = {
  pendingMessage: null,
  pendingAttachmentIds: null,
  // ✅ Uses ExtendedFilePart schema which includes uploadId for backend fallback loading
  pendingFileParts: null,
  expectedParticipantIds: null,
  hasSentPendingMessage: false,
} satisfies Pick<DataState, 'pendingMessage' | 'pendingAttachmentIds' | 'pendingFileParts' | 'expectedParticipantIds'> & Pick<TrackingState, 'hasSentPendingMessage'>;

/**
 * Regeneration-specific flags
 * Used when regeneration completes
 */
export const REGENERATION_STATE_RESET = {
  isRegenerating: false,
  regeneratingRoundNumber: null,
} satisfies Pick<FlagsState, 'isRegenerating'> & Pick<DataState, 'regeneratingRoundNumber'>;

/**
 * Stream resumption state that must be cleared when round completes
 * Prevents stale resumption phase from blocking UI updates in subsequent rounds
 */
export const STREAM_RESUMPTION_STATE_RESET = {
  currentResumptionPhase: null,
  resumptionRoundNumber: null,
  preSearchResumption: null,
  moderatorResumption: null,
  streamResumptionPrefilled: false,
} satisfies Pick<StreamResumptionSliceState, 'currentResumptionPhase' | 'resumptionRoundNumber' | 'preSearchResumption' | 'moderatorResumption' | 'streamResumptionPrefilled'>;

// ============================================================================
// AGGREGATED DEFAULT STATES FOR RESET OPERATIONS
// ============================================================================

/**
 * Complete default state for full store reset
 * 🚨 STATE ONLY: Only includes state properties, not action methods
 * Store.set() expects state only - action methods are not passed to set()
 * Used by: resetToOverview
 */
export const COMPLETE_RESET_STATE = {
  // Form state
  inputValue: FORM_DEFAULTS.inputValue,
  selectedMode: FORM_DEFAULTS.selectedMode,
  selectedParticipants: FORM_DEFAULTS.selectedParticipants,
  enableWebSearch: FORM_DEFAULTS.enableWebSearch,
  modelOrder: FORM_DEFAULTS.modelOrder,
  // Feedback state - create fresh Map instance to prevent state pollution
  feedbackByRound: new Map(),
  pendingFeedback: FEEDBACK_DEFAULTS.pendingFeedback,
  hasLoadedFeedback: FEEDBACK_DEFAULTS.hasLoadedFeedback,
  // UI state
  showInitialUI: UI_DEFAULTS.showInitialUI,
  waitingToStartStreaming: UI_DEFAULTS.waitingToStartStreaming,
  isCreatingThread: UI_DEFAULTS.isCreatingThread,
  createdThreadId: UI_DEFAULTS.createdThreadId,
  // Pre-search state
  preSearches: PRESEARCH_DEFAULTS.preSearches,
  preSearchActivityTimes: new Map<number, number>(),
  // Thread state
  thread: THREAD_DEFAULTS.thread,
  participants: THREAD_DEFAULTS.participants,
  messages: THREAD_DEFAULTS.messages,
  isStreaming: THREAD_DEFAULTS.isStreaming,
  currentParticipantIndex: THREAD_DEFAULTS.currentParticipantIndex,
  error: THREAD_DEFAULTS.error,
  sendMessage: THREAD_DEFAULTS.sendMessage,
  startRound: THREAD_DEFAULTS.startRound,
  chatSetMessages: THREAD_DEFAULTS.chatSetMessages,
  // Flags state
  hasInitiallyLoaded: FLAGS_DEFAULTS.hasInitiallyLoaded,
  isRegenerating: FLAGS_DEFAULTS.isRegenerating,
  isModeratorStreaming: FLAGS_DEFAULTS.isModeratorStreaming,
  isWaitingForChangelog: FLAGS_DEFAULTS.isWaitingForChangelog,
  hasPendingConfigChanges: FLAGS_DEFAULTS.hasPendingConfigChanges,
  // Data state
  regeneratingRoundNumber: DATA_DEFAULTS.regeneratingRoundNumber,
  pendingMessage: DATA_DEFAULTS.pendingMessage,
  pendingAttachmentIds: DATA_DEFAULTS.pendingAttachmentIds,
  pendingFileParts: DATA_DEFAULTS.pendingFileParts,
  expectedParticipantIds: DATA_DEFAULTS.expectedParticipantIds,
  streamingRoundNumber: DATA_DEFAULTS.streamingRoundNumber,
  currentRoundNumber: DATA_DEFAULTS.currentRoundNumber,
  // Tracking state
  hasSentPendingMessage: TRACKING_DEFAULTS.hasSentPendingMessage,
  // Create fresh Set instances for each complete reset
  createdModeratorRounds: new Set<number>(),
  triggeredPreSearchRounds: new Set<number>(),
  triggeredModeratorRounds: new Set<number>(),
  triggeredModeratorIds: new Set<string>(),
  hasEarlyOptimisticMessage: TRACKING_DEFAULTS.hasEarlyOptimisticMessage,
  // Callbacks state
  onComplete: CALLBACKS_DEFAULTS.onComplete,
  // Screen state
  screenMode: SCREEN_DEFAULTS.screenMode,
  isReadOnly: SCREEN_DEFAULTS.isReadOnly,
  // Stream resumption state
  streamResumptionState: STREAM_RESUMPTION_DEFAULTS.streamResumptionState,
  resumptionAttempts: new Set<string>(),
  nextParticipantToTrigger: STREAM_RESUMPTION_DEFAULTS.nextParticipantToTrigger,
  streamResumptionPrefilled: STREAM_RESUMPTION_DEFAULTS.streamResumptionPrefilled,
  prefilledForThreadId: STREAM_RESUMPTION_DEFAULTS.prefilledForThreadId,
  currentResumptionPhase: STREAM_RESUMPTION_DEFAULTS.currentResumptionPhase,
  preSearchResumption: STREAM_RESUMPTION_DEFAULTS.preSearchResumption,
  moderatorResumption: STREAM_RESUMPTION_DEFAULTS.moderatorResumption,
  resumptionRoundNumber: STREAM_RESUMPTION_DEFAULTS.resumptionRoundNumber,
  // Animation state
  pendingAnimations: new Set<number>(),
  animationResolvers: new Map(),
  // Attachments state
  pendingAttachments: ATTACHMENTS_DEFAULTS.pendingAttachments,
};

/**
 * Thread-specific reset state
 * 🚨 STATE ONLY: Only includes state properties, not action methods
 * Store.set() expects state only - action methods are not passed to set()
 * Used by: resetThreadState (when unmounting thread screen)
 */
export const THREAD_RESET_STATE = {
  // UI state - includes streaming state properties
  waitingToStartStreaming: UI_DEFAULTS.waitingToStartStreaming,
  isStreaming: THREAD_DEFAULTS.isStreaming,
  // Flags state
  hasInitiallyLoaded: FLAGS_DEFAULTS.hasInitiallyLoaded,
  isRegenerating: FLAGS_DEFAULTS.isRegenerating,
  isModeratorStreaming: FLAGS_DEFAULTS.isModeratorStreaming,
  isWaitingForChangelog: FLAGS_DEFAULTS.isWaitingForChangelog,
  hasPendingConfigChanges: FLAGS_DEFAULTS.hasPendingConfigChanges,
  // Data state
  regeneratingRoundNumber: DATA_DEFAULTS.regeneratingRoundNumber,
  pendingMessage: DATA_DEFAULTS.pendingMessage,
  pendingAttachmentIds: DATA_DEFAULTS.pendingAttachmentIds,
  pendingFileParts: DATA_DEFAULTS.pendingFileParts,
  expectedParticipantIds: DATA_DEFAULTS.expectedParticipantIds,
  streamingRoundNumber: DATA_DEFAULTS.streamingRoundNumber,
  currentRoundNumber: DATA_DEFAULTS.currentRoundNumber,
  // Tracking state
  hasSentPendingMessage: TRACKING_DEFAULTS.hasSentPendingMessage,
  // Create fresh Set/Map instances for each thread reset
  createdModeratorRounds: new Set<number>(),
  triggeredPreSearchRounds: new Set<number>(),
  triggeredModeratorRounds: new Set<number>(),
  triggeredModeratorIds: new Set<string>(),
  preSearchActivityTimes: new Map<number, number>(),
  hasEarlyOptimisticMessage: TRACKING_DEFAULTS.hasEarlyOptimisticMessage,
  // AI SDK methods (thread-related)
  sendMessage: THREAD_DEFAULTS.sendMessage,
  startRound: THREAD_DEFAULTS.startRound,
  chatSetMessages: THREAD_DEFAULTS.chatSetMessages,
  // Callbacks (included in thread reset)
  onComplete: CALLBACKS_DEFAULTS.onComplete,
  // Stream resumption state
  streamResumptionState: STREAM_RESUMPTION_DEFAULTS.streamResumptionState,
  resumptionAttempts: new Set<string>(),
  nextParticipantToTrigger: STREAM_RESUMPTION_DEFAULTS.nextParticipantToTrigger,
  streamResumptionPrefilled: STREAM_RESUMPTION_DEFAULTS.streamResumptionPrefilled,
  prefilledForThreadId: STREAM_RESUMPTION_DEFAULTS.prefilledForThreadId,
  currentResumptionPhase: STREAM_RESUMPTION_DEFAULTS.currentResumptionPhase,
  preSearchResumption: STREAM_RESUMPTION_DEFAULTS.preSearchResumption,
  moderatorResumption: STREAM_RESUMPTION_DEFAULTS.moderatorResumption,
  resumptionRoundNumber: STREAM_RESUMPTION_DEFAULTS.resumptionRoundNumber,
  // Animation state
  pendingAnimations: new Set<number>(),
  animationResolvers: new Map(),
  // ✅ FIX: Removed pendingAttachments from reset state
  // Attachments should ONLY be cleared via clearAttachments() after the message is created
  // This prevents attachments from being cleared prematurely during navigation
};

/**
 * Full thread navigation reset state
 * 🚨 CRITICAL: Used when navigating BETWEEN threads (e.g., /chat/thread-1 → /chat/thread-2)
 * Unlike THREAD_RESET_STATE, this ALSO clears thread data (messages, participants, moderator)
 * This prevents stale data from previous thread leaking into new thread
 * Used by: resetForThreadNavigation
 */
export const THREAD_NAVIGATION_RESET_STATE = {
  // Include all from THREAD_RESET_STATE
  ...THREAD_RESET_STATE,
  // 🚨 CRITICAL: Also clear thread data to prevent state leakage
  thread: THREAD_DEFAULTS.thread,
  participants: THREAD_DEFAULTS.participants,
  messages: THREAD_DEFAULTS.messages,
  error: THREAD_DEFAULTS.error,
  currentParticipantIndex: THREAD_DEFAULTS.currentParticipantIndex,
  // 🚨 CRITICAL: Clear pre-searches from previous thread
  preSearches: PRESEARCH_DEFAULTS.preSearches,
  // Reset UI flags related to thread creation
  createdThreadId: UI_DEFAULTS.createdThreadId,
  isCreatingThread: UI_DEFAULTS.isCreatingThread,
  // Clear feedback state on thread navigation (thread-specific data)
  feedbackByRound: new Map(),
  pendingFeedback: FEEDBACK_DEFAULTS.pendingFeedback,
  hasLoadedFeedback: FEEDBACK_DEFAULTS.hasLoadedFeedback,
};

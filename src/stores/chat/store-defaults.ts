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

import { ChatModes, ScreenModes } from '@/api/core/enums';

import type {
  AnalysisState,
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
  selectedMode: ChatModes.ANALYZING, // Default to 'analyzing' mode
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
// ANALYSIS SLICE DEFAULTS
// ============================================================================

export const ANALYSIS_DEFAULTS = {
  analyses: [],
} satisfies AnalysisState;

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
  isCreatingAnalysis: false,
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

// 🚨 BUG FIX: Using satisfies instead of as const to allow fresh Set instances on each reset
// Without this fix, all resets reuse the same Set instances created at module load,
// causing state pollution across thread navigations
export const TRACKING_DEFAULTS = {
  hasSentPendingMessage: false,
  createdAnalysisRounds: new Set<number>(),
  triggeredPreSearchRounds: new Set<number>(),
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
 * Used when streaming completes (participants or analysis)
 */
export const STREAMING_STATE_RESET = {
  isStreaming: false,
  streamingRoundNumber: null,
  currentRoundNumber: null,
  waitingToStartStreaming: false,
  currentParticipantIndex: 0,
} satisfies Pick<ThreadState & UIState & DataState, 'isStreaming' | 'currentParticipantIndex'> & Pick<DataState, 'streamingRoundNumber' | 'currentRoundNumber'> & Pick<UIState, 'waitingToStartStreaming'>;

/**
 * Analysis creation flags
 * Used when analysis creation/streaming completes
 */
export const ANALYSIS_STATE_RESET = {
  isCreatingAnalysis: false,
  isWaitingForChangelog: false,
} satisfies Pick<FlagsState, 'isCreatingAnalysis' | 'isWaitingForChangelog'>;

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
  // Feedback state
  feedbackByRound: FEEDBACK_DEFAULTS.feedbackByRound,
  pendingFeedback: FEEDBACK_DEFAULTS.pendingFeedback,
  hasLoadedFeedback: FEEDBACK_DEFAULTS.hasLoadedFeedback,
  // UI state
  showInitialUI: UI_DEFAULTS.showInitialUI,
  waitingToStartStreaming: UI_DEFAULTS.waitingToStartStreaming,
  isCreatingThread: UI_DEFAULTS.isCreatingThread,
  createdThreadId: UI_DEFAULTS.createdThreadId,
  // Analysis state
  analyses: ANALYSIS_DEFAULTS.analyses,
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
  isCreatingAnalysis: FLAGS_DEFAULTS.isCreatingAnalysis,
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
  // 🚨 BUG FIX: Create fresh Set instances for each complete reset
  createdAnalysisRounds: new Set<number>(),
  triggeredPreSearchRounds: new Set<number>(),
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
  // UI state - 🚨 BUG FIX: Added missing streaming state properties
  waitingToStartStreaming: UI_DEFAULTS.waitingToStartStreaming,
  isStreaming: THREAD_DEFAULTS.isStreaming,
  // Flags state
  hasInitiallyLoaded: FLAGS_DEFAULTS.hasInitiallyLoaded,
  isRegenerating: FLAGS_DEFAULTS.isRegenerating,
  isCreatingAnalysis: FLAGS_DEFAULTS.isCreatingAnalysis,
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
  // 🚨 BUG FIX: Create fresh Set/Map instances for each thread reset
  createdAnalysisRounds: new Set<number>(),
  triggeredPreSearchRounds: new Set<number>(),
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
 * Unlike THREAD_RESET_STATE, this ALSO clears thread data (messages, participants, analyses)
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
  // 🚨 CRITICAL: Clear analyses and pre-searches from previous thread
  analyses: ANALYSIS_DEFAULTS.analyses,
  preSearches: PRESEARCH_DEFAULTS.preSearches,
  // 🚨 CRITICAL: Reset UI flags related to thread creation
  createdThreadId: UI_DEFAULTS.createdThreadId,
  isCreatingThread: UI_DEFAULTS.isCreatingThread,
};

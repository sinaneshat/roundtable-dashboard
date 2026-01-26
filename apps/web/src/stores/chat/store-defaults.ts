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

import { ChatModes, DEFAULT_CHAT_MODE, ModelIds, RoundFlowStates, ScreenModes } from '@roundtable/shared';
import { z } from 'zod';

import type {
  AnimationState,
  AttachmentsState,
  CallbacksState,
  ChangelogState,
  DataState,
  FeedbackState,
  FlagsState,
  FormState,
  PreSearchState,
  RoundFlowState,
  ScreenState,
  SidebarAnimationState,
  StreamResumptionSliceState,
  ThreadState,
  TrackingState,
  UIState,
} from './store-schemas';

// ============================================================================
// RESET STATE TYPES - Extracted complex Pick<> expressions
// ============================================================================

/**
 * Type for streaming state reset - all streaming-related flags
 * Extracted from STREAMING_STATE_RESET satisfies clause
 */
type StreamingStateResetType = Pick<ThreadState & UIState & DataState, 'isStreaming' | 'currentParticipantIndex'> & Pick<DataState, 'streamingRoundNumber' | 'currentRoundNumber'> & Pick<UIState, 'waitingToStartStreaming'> & Pick<FlagsState, 'participantHandoffInProgress'> & Pick<ThreadState, 'streamFinishAcknowledged'>;

/**
 * Type for pending message state reset - all pending message-related flags
 * Extracted from PENDING_MESSAGE_STATE_RESET satisfies clause
 */
type PendingMessageStateResetType = Pick<DataState, 'pendingMessage' | 'pendingAttachmentIds' | 'pendingFileParts' | 'expectedParticipantIds'> & Pick<TrackingState, 'hasSentPendingMessage'>;

/**
 * Type for regeneration state reset - all regeneration-related flags
 * Extracted from REGENERATION_STATE_RESET satisfies clause
 */
type RegenerationStateResetType = Pick<FlagsState, 'isRegenerating'> & Pick<DataState, 'regeneratingRoundNumber'>;

// ============================================================================
// FORM SLICE DEFAULTS
// ============================================================================

/**
 * Default preset configuration from first FREE preset (Quick Perspectives)
 * ✅ SINGLE SOURCE OF TRUTH: Matches MODEL_PRESETS[0] in model-presets.ts
 * This ensures new users see the first preset's config pre-selected
 */
export const DEFAULT_PRESET_MODE = ChatModes.ANALYZING; // Matches Quick Perspectives preset

export const DEFAULT_PRESET_PARTICIPANTS = [
  { id: ModelIds.OPENAI_GPT_4O_MINI, modelId: ModelIds.OPENAI_GPT_4O_MINI, priority: 0, role: 'Analyst' },
  { id: ModelIds.GOOGLE_GEMINI_2_5_FLASH, modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH, priority: 1, role: 'Challenger' },
  { id: ModelIds.DEEPSEEK_DEEPSEEK_CHAT_V3_0324, modelId: ModelIds.DEEPSEEK_DEEPSEEK_CHAT_V3_0324, priority: 2, role: 'Synthesizer' },
];

export const FORM_DEFAULTS = {
  animatedMessageIds: new Set<string>(), // Set of message IDs that have been animated
  animationStartIndex: 0, // Starting index for message animations
  autoMode: true, // ✅ Auto mode ON by default - AI selects models/roles/mode based on prompt
  enableWebSearch: false, // ⚠️ NOTE: This is ONLY used for new chats - thread screen syncs from thread.enableWebSearch
  inputValue: '',
  modelOrder: [], // Visual order of models for drag-and-drop
  selectedMode: DEFAULT_PRESET_MODE, // ✅ Matches first preset (Quick Perspectives)
  selectedParticipants: DEFAULT_PRESET_PARTICIPANTS, // ✅ First preset models pre-selected
  shouldSkipAnimation: false, // Whether to skip entrance animations
} satisfies FormState;

// ============================================================================
// AUTO MODE FALLBACK CONFIG - Single Source of Truth
// ============================================================================
// Used by both client (useAnalyzePromptStream) and server (analyze.handler.ts)
// when AI analysis fails. Uses 2 participants to match MIN_PARTICIPANTS_REQUIRED
// from @/lib/config (backend minimum for multi-perspective analysis).

export const AUTO_MODE_FALLBACK_CONFIG: {
  participants: { modelId: string; role: string | null }[];
  mode: typeof DEFAULT_CHAT_MODE;
  enableWebSearch: boolean;
} = {
  enableWebSearch: false,
  mode: DEFAULT_CHAT_MODE,
  participants: [
    { modelId: ModelIds.OPENAI_GPT_4O_MINI, role: null },
    { modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH, role: null },
  ],
};

// ============================================================================
// FEEDBACK SLICE DEFAULTS
// ============================================================================

export const FEEDBACK_DEFAULTS = {
  feedbackByRound: new Map(),
  hasLoadedFeedback: false,
  pendingFeedback: null,
} satisfies FeedbackState;

// ============================================================================
// UI SLICE DEFAULTS
// ============================================================================

export const UI_DEFAULTS = {
  createdThreadId: null,
  createdThreadProjectId: null, // Project ID for created thread - used for cache updates
  isAnalyzingPrompt: false, // ✅ True when AI is analyzing prompt for auto mode
  isCreatingThread: false,
  showInitialUI: true,
  waitingToStartStreaming: false,
} satisfies UIState;

// ============================================================================
// PRE-SEARCH SLICE DEFAULTS
// ============================================================================

export const PRESEARCH_DEFAULTS = {
  preSearchActivityTimes: new Map(),
  preSearches: [],
} satisfies PreSearchState;

// ============================================================================
// CHANGELOG SLICE DEFAULTS
// ============================================================================

/**
 * Changelog state defaults
 *
 * JUSTIFIED EMPTY ARRAY TYPE: The empty array literal `[]` infers as `never[]` by default.
 * The type annotation `ApiChangelog[]` is required to match the ChangelogState interface.
 * This is not a type cast - it's a type annotation on the initial value.
 */
export const CHANGELOG_DEFAULTS: ChangelogState = {
  changelogItems: [],
};

// ============================================================================
// THREAD SLICE DEFAULTS
// ============================================================================

export const THREAD_DEFAULTS = {
  chatSetMessages: undefined,
  // ✅ NAVIGATION CLEANUP: Stop function to abort in-flight streaming
  chatStop: undefined,
  currentParticipantIndex: 0,
  error: null,
  isStreaming: false,
  messages: [],
  participants: [],
  // AI SDK methods
  sendMessage: undefined,
  startRound: undefined,
  // ✅ RACE CONDITION FIX: Explicit completion signal for stream settling
  streamFinishAcknowledged: false,
  thread: null,
} satisfies ThreadState;

// ============================================================================
// NAVIGATION SLICE DEFAULTS
// ============================================================================

export const NAVIGATION_DEFAULTS = {
  /** Target slug for pending navigation - set when navigating between threads */
  pendingNavigationTargetSlug: null as string | null,
};

// ============================================================================
// FLAGS SLICE DEFAULTS
// ============================================================================

export const FLAGS_DEFAULTS = {
  hasInitiallyLoaded: false,
  hasPendingConfigChanges: false,
  isModeratorStreaming: false,
  /** ✅ PATCH BLOCKING: Prevents streaming from starting during PATCH */
  isPatchInProgress: false,
  isRegenerating: false,
  isWaitingForChangelog: false,
  /** ✅ HANDOFF FIX: True during P0→P1 participant transition to prevent 10s cleanup */
  participantHandoffInProgress: false,
} satisfies FlagsState;

// ============================================================================
// DATA SLICE DEFAULTS
// ============================================================================

export const DATA_DEFAULTS = {
  /** Track round number when config changes submitted (for incremental changelog fetch) */
  configChangeRoundNumber: null,
  currentRoundNumber: null,
  expectedParticipantIds: null,
  pendingAttachmentIds: null,
  /** File parts for AI SDK message creation - set before clearAttachments() */
  // ✅ Uses ExtendedFilePart schema which includes uploadId for backend fallback loading
  pendingFileParts: null,
  pendingMessage: null,
  regeneratingRoundNumber: null,
  /**
   * ✅ RACE CONDITION FIX: Round epoch counter
   * Increments each time a new round starts. Used to detect stale operations.
   */
  roundEpoch: 0,
  streamingRoundNumber: null,
} satisfies DataState;

// ============================================================================
// TRACKING SLICE DEFAULTS
// ============================================================================

// Using satisfies instead of as const to allow fresh Set instances on each reset.
// This prevents reusing the same Set instances created at module load,
// which would cause state pollution across thread navigations.
export const TRACKING_DEFAULTS = {
  createdModeratorRounds: new Set<number>(),
  /** ✅ IMMEDIATE UI FEEDBACK: Track when early optimistic message added by handleUpdateThreadAndSend */
  hasEarlyOptimisticMessage: false,
  hasSentPendingMessage: false,
  /** Moderator stream tracking: Prevents duplicate stream submissions by moderator ID */
  triggeredModeratorIds: new Set<string>(),
  /** Moderator stream tracking: Prevents duplicate stream submissions by round number */
  triggeredModeratorRounds: new Set<number>(),
  triggeredPreSearchRounds: new Set<number>(),
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
  isReadOnly: false,
  screenMode: ScreenModes.OVERVIEW,
} satisfies ScreenState;

// ============================================================================
// STREAM RESUMPTION SLICE DEFAULTS
// ============================================================================

export const STREAM_RESUMPTION_DEFAULTS = {
  /** ✅ UNIFIED PHASES: Current phase for resumption logic */
  currentResumptionPhase: null,
  /** Moderator resumption state */
  moderatorResumption: null,
  nextParticipantToTrigger: null,
  /** Thread ID that the prefilled state is for - ensures state matches current thread */
  prefilledForThreadId: null,
  /** Pre-search resumption state (null if web search not enabled) */
  preSearchResumption: null,
  resumptionAttempts: new Set<string>(),
  /** Current round number for resumption */
  resumptionRoundNumber: null,
  /** ✅ SCOPE VERSIONING: Thread ID for current resumption scope */
  resumptionScopeThreadId: null as string | null,
  /** ✅ SCOPE VERSIONING: Version counter - increments on each navigation to invalidate stale effects */
  resumptionScopeVersion: 0,
  /** Flag set when server-side prefilled resumption state - guards AI SDK phantom resume */
  streamResumptionPrefilled: false,
  streamResumptionState: null,
} satisfies StreamResumptionSliceState;

// ============================================================================
// ROUND FLOW SLICE DEFAULTS (FSM-based orchestration)
// ============================================================================

export const ROUND_FLOW_DEFAULTS = {
  /** Event history for debugging (dev mode only) */
  flowEventHistory: [],
  /** Last error that occurred */
  flowLastError: null,
  /** Total enabled participants for current round */
  flowParticipantCount: 0,
  /** Current participant index within round */
  flowParticipantIndex: 0,
  /** Round number being orchestrated */
  flowRoundNumber: null,
  /** Current FSM state - starts in IDLE */
  flowState: RoundFlowStates.IDLE,
} satisfies RoundFlowState;

/**
 * Round flow state reset - clears FSM state when round completes or navigation occurs
 */
export const ROUND_FLOW_STATE_RESET = {
  flowEventHistory: [],
  flowLastError: null,
  flowParticipantCount: 0,
  flowParticipantIndex: 0,
  flowRoundNumber: null,
  flowState: RoundFlowStates.IDLE,
} satisfies RoundFlowState;

// ============================================================================
// ANIMATION SLICE DEFAULTS
// ============================================================================

export const ANIMATION_DEFAULTS = {
  animationResolvers: new Map(), // Resolve functions for animation completion promises
  pendingAnimations: new Set<number>(), // Set of participant indices with pending animations
} satisfies AnimationState;

// ============================================================================
// ATTACHMENTS SLICE DEFAULTS
// ============================================================================

export const ATTACHMENTS_DEFAULTS = {
  pendingAttachments: [],
} satisfies AttachmentsState;

// ============================================================================
// SIDEBAR ANIMATION SLICE DEFAULTS (AI title typewriter effect)
// ============================================================================

export const SIDEBAR_ANIMATION_DEFAULTS = {
  animatingThreadId: null,
  animationPhase: 'idle' as const,
  displayedTitle: null,
  newTitle: null,
  oldTitle: null,
} satisfies SidebarAnimationState;

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
  currentParticipantIndex: 0,
  currentRoundNumber: null,
  isStreaming: false,
  /** ✅ HANDOFF FIX: Clear handoff flag when streaming completes */
  participantHandoffInProgress: false,
  /** ✅ RACE CONDITION FIX: Reset stream finish acknowledgment */
  streamFinishAcknowledged: false,
  streamingRoundNumber: null,
  waitingToStartStreaming: false,
} satisfies StreamingStateResetType;

/**
 * Moderator creation flags
 * Used when moderator creation/streaming completes
 * Note: Moderator now renders inline via messages array with isModerator: true metadata
 *
 * ⚠️ CRITICAL: Do NOT include isWaitingForChangelog or configChangeRoundNumber here!
 * These changelog blocking flags must ONLY be cleared by use-changelog-sync.ts
 * after the changelog has been fetched. Clearing them here causes pre-search
 * to execute before changelog is fetched, breaking the ordering guarantee:
 * PATCH → changelog → pre-search/streaming
 */
export const MODERATOR_STATE_RESET = {
  isModeratorStreaming: false,
} satisfies Pick<FlagsState, 'isModeratorStreaming'>;

/**
 * Pending message state that must be cleared after message is sent
 * Used when a message is fully processed
 */
export const PENDING_MESSAGE_STATE_RESET = {
  expectedParticipantIds: null,
  hasSentPendingMessage: false,
  pendingAttachmentIds: null,
  // ✅ Uses ExtendedFilePart schema which includes uploadId for backend fallback loading
  pendingFileParts: null,
  pendingMessage: null,
} satisfies PendingMessageStateResetType;

/**
 * Regeneration-specific flags
 * Used when regeneration completes
 */
export const REGENERATION_STATE_RESET = {
  isRegenerating: false,
  regeneratingRoundNumber: null,
} satisfies RegenerationStateResetType;

/**
 * Stream resumption state that must be cleared when round completes
 * Prevents stale resumption phase from blocking UI updates in subsequent rounds
 * ✅ FIX: Include nextParticipantToTrigger to prevent infinite round triggering
 */
export const STREAM_RESUMPTION_STATE_RESET = {
  currentResumptionPhase: null,
  moderatorResumption: null,
  nextParticipantToTrigger: null,
  preSearchResumption: null,
  resumptionRoundNumber: null,
  streamResumptionPrefilled: false,
} satisfies Pick<StreamResumptionSliceState, 'currentResumptionPhase' | 'resumptionRoundNumber' | 'preSearchResumption' | 'moderatorResumption' | 'streamResumptionPrefilled' | 'nextParticipantToTrigger'>;

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
  animatedMessageIds: new Set<string>(),
  // Sidebar animation state
  animatingThreadId: SIDEBAR_ANIMATION_DEFAULTS.animatingThreadId,
  animationPhase: SIDEBAR_ANIMATION_DEFAULTS.animationPhase,
  animationResolvers: new Map(),
  animationStartIndex: FORM_DEFAULTS.animationStartIndex,
  autoMode: FORM_DEFAULTS.autoMode,
  // Changelog state
  changelogItems: CHANGELOG_DEFAULTS.changelogItems,
  chatSetMessages: THREAD_DEFAULTS.chatSetMessages,
  chatStop: THREAD_DEFAULTS.chatStop,
  configChangeRoundNumber: DATA_DEFAULTS.configChangeRoundNumber,
  // Create fresh Set instances for each complete reset
  createdModeratorRounds: new Set<number>(),
  createdThreadId: UI_DEFAULTS.createdThreadId,
  createdThreadProjectId: UI_DEFAULTS.createdThreadProjectId,
  currentParticipantIndex: THREAD_DEFAULTS.currentParticipantIndex,
  currentResumptionPhase: STREAM_RESUMPTION_DEFAULTS.currentResumptionPhase,
  currentRoundNumber: DATA_DEFAULTS.currentRoundNumber,
  displayedTitle: SIDEBAR_ANIMATION_DEFAULTS.displayedTitle,
  enableWebSearch: FORM_DEFAULTS.enableWebSearch,
  error: THREAD_DEFAULTS.error,
  expectedParticipantIds: DATA_DEFAULTS.expectedParticipantIds,
  // Feedback state - create fresh Map instance to prevent state pollution
  feedbackByRound: new Map(),
  flowEventHistory: [],
  flowLastError: ROUND_FLOW_DEFAULTS.flowLastError,
  flowParticipantCount: ROUND_FLOW_DEFAULTS.flowParticipantCount,
  flowParticipantIndex: ROUND_FLOW_DEFAULTS.flowParticipantIndex,
  flowRoundNumber: ROUND_FLOW_DEFAULTS.flowRoundNumber,
  // Round flow state (FSM orchestration)
  flowState: ROUND_FLOW_DEFAULTS.flowState,
  hasEarlyOptimisticMessage: TRACKING_DEFAULTS.hasEarlyOptimisticMessage,
  // Flags state
  hasInitiallyLoaded: FLAGS_DEFAULTS.hasInitiallyLoaded,
  hasLoadedFeedback: FEEDBACK_DEFAULTS.hasLoadedFeedback,
  hasPendingConfigChanges: FLAGS_DEFAULTS.hasPendingConfigChanges,
  // Tracking state
  hasSentPendingMessage: TRACKING_DEFAULTS.hasSentPendingMessage,
  // Form state
  inputValue: FORM_DEFAULTS.inputValue,
  isAnalyzingPrompt: UI_DEFAULTS.isAnalyzingPrompt,
  isCreatingThread: UI_DEFAULTS.isCreatingThread,
  isModeratorStreaming: FLAGS_DEFAULTS.isModeratorStreaming,
  isPatchInProgress: FLAGS_DEFAULTS.isPatchInProgress,
  isReadOnly: SCREEN_DEFAULTS.isReadOnly,
  isRegenerating: FLAGS_DEFAULTS.isRegenerating,
  isStreaming: THREAD_DEFAULTS.isStreaming,
  isWaitingForChangelog: FLAGS_DEFAULTS.isWaitingForChangelog,
  messages: THREAD_DEFAULTS.messages,
  modelOrder: FORM_DEFAULTS.modelOrder,
  moderatorResumption: STREAM_RESUMPTION_DEFAULTS.moderatorResumption,
  newTitle: SIDEBAR_ANIMATION_DEFAULTS.newTitle,
  nextParticipantToTrigger: STREAM_RESUMPTION_DEFAULTS.nextParticipantToTrigger,
  oldTitle: SIDEBAR_ANIMATION_DEFAULTS.oldTitle,
  // Callbacks state
  onComplete: CALLBACKS_DEFAULTS.onComplete,
  participantHandoffInProgress: FLAGS_DEFAULTS.participantHandoffInProgress,
  participants: THREAD_DEFAULTS.participants,
  // Animation state
  pendingAnimations: new Set<number>(),
  pendingAttachmentIds: DATA_DEFAULTS.pendingAttachmentIds,
  // Attachments state
  pendingAttachments: ATTACHMENTS_DEFAULTS.pendingAttachments,
  pendingFeedback: FEEDBACK_DEFAULTS.pendingFeedback,
  pendingFileParts: DATA_DEFAULTS.pendingFileParts,
  pendingMessage: DATA_DEFAULTS.pendingMessage,
  // Navigation state
  pendingNavigationTargetSlug: NAVIGATION_DEFAULTS.pendingNavigationTargetSlug,
  prefilledForThreadId: STREAM_RESUMPTION_DEFAULTS.prefilledForThreadId,
  preSearchActivityTimes: new Map<number, number>(),
  // Pre-search state
  preSearches: PRESEARCH_DEFAULTS.preSearches,
  preSearchResumption: STREAM_RESUMPTION_DEFAULTS.preSearchResumption,
  // Data state
  regeneratingRoundNumber: DATA_DEFAULTS.regeneratingRoundNumber,
  resumptionAttempts: new Set<string>(),
  resumptionRoundNumber: STREAM_RESUMPTION_DEFAULTS.resumptionRoundNumber,
  // ✅ RACE CONDITION FIX: Round epoch for stale operation detection
  roundEpoch: DATA_DEFAULTS.roundEpoch,
  // Screen state
  screenMode: SCREEN_DEFAULTS.screenMode,
  selectedMode: FORM_DEFAULTS.selectedMode,
  selectedParticipants: FORM_DEFAULTS.selectedParticipants,
  sendMessage: THREAD_DEFAULTS.sendMessage,
  shouldSkipAnimation: FORM_DEFAULTS.shouldSkipAnimation,
  // UI state
  showInitialUI: UI_DEFAULTS.showInitialUI,
  startRound: THREAD_DEFAULTS.startRound,
  // ✅ RACE CONDITION FIX: Explicit stream completion signal
  streamFinishAcknowledged: THREAD_DEFAULTS.streamFinishAcknowledged,
  streamingRoundNumber: DATA_DEFAULTS.streamingRoundNumber,
  streamResumptionPrefilled: STREAM_RESUMPTION_DEFAULTS.streamResumptionPrefilled,
  // Stream resumption state
  streamResumptionState: STREAM_RESUMPTION_DEFAULTS.streamResumptionState,
  // Thread state
  thread: THREAD_DEFAULTS.thread,
  triggeredModeratorIds: new Set<string>(),
  triggeredModeratorRounds: new Set<number>(),
  triggeredPreSearchRounds: new Set<number>(),
  waitingToStartStreaming: UI_DEFAULTS.waitingToStartStreaming,
};

/**
 * Thread-specific reset state
 * 🚨 STATE ONLY: Only includes state properties, not action methods
 * Store.set() expects state only - action methods are not passed to set()
 * Used by: resetThreadState (when unmounting thread screen)
 */
export const THREAD_RESET_STATE = {
  animationResolvers: new Map(),
  chatSetMessages: THREAD_DEFAULTS.chatSetMessages,
  chatStop: THREAD_DEFAULTS.chatStop,
  configChangeRoundNumber: DATA_DEFAULTS.configChangeRoundNumber,
  // Create fresh Set/Map instances for each thread reset
  createdModeratorRounds: new Set<number>(),
  currentResumptionPhase: STREAM_RESUMPTION_DEFAULTS.currentResumptionPhase,
  currentRoundNumber: DATA_DEFAULTS.currentRoundNumber,
  expectedParticipantIds: DATA_DEFAULTS.expectedParticipantIds,
  flowEventHistory: [],
  flowLastError: ROUND_FLOW_DEFAULTS.flowLastError,
  flowParticipantCount: ROUND_FLOW_DEFAULTS.flowParticipantCount,
  flowParticipantIndex: ROUND_FLOW_DEFAULTS.flowParticipantIndex,
  flowRoundNumber: ROUND_FLOW_DEFAULTS.flowRoundNumber,
  // Round flow state (FSM orchestration)
  flowState: ROUND_FLOW_DEFAULTS.flowState,
  hasEarlyOptimisticMessage: TRACKING_DEFAULTS.hasEarlyOptimisticMessage,
  // Flags state
  hasInitiallyLoaded: FLAGS_DEFAULTS.hasInitiallyLoaded,
  hasPendingConfigChanges: FLAGS_DEFAULTS.hasPendingConfigChanges,
  // Tracking state
  hasSentPendingMessage: TRACKING_DEFAULTS.hasSentPendingMessage,
  isModeratorStreaming: FLAGS_DEFAULTS.isModeratorStreaming,
  isPatchInProgress: FLAGS_DEFAULTS.isPatchInProgress,
  isRegenerating: FLAGS_DEFAULTS.isRegenerating,
  isStreaming: THREAD_DEFAULTS.isStreaming,
  isWaitingForChangelog: FLAGS_DEFAULTS.isWaitingForChangelog,
  moderatorResumption: STREAM_RESUMPTION_DEFAULTS.moderatorResumption,
  nextParticipantToTrigger: STREAM_RESUMPTION_DEFAULTS.nextParticipantToTrigger,
  // Callbacks (included in thread reset)
  onComplete: CALLBACKS_DEFAULTS.onComplete,
  participantHandoffInProgress: FLAGS_DEFAULTS.participantHandoffInProgress,
  // Animation state
  pendingAnimations: new Set<number>(),
  pendingAttachmentIds: DATA_DEFAULTS.pendingAttachmentIds,
  pendingFileParts: DATA_DEFAULTS.pendingFileParts,
  pendingMessage: DATA_DEFAULTS.pendingMessage,
  prefilledForThreadId: STREAM_RESUMPTION_DEFAULTS.prefilledForThreadId,
  preSearchActivityTimes: new Map<number, number>(),
  preSearchResumption: STREAM_RESUMPTION_DEFAULTS.preSearchResumption,
  // Data state
  regeneratingRoundNumber: DATA_DEFAULTS.regeneratingRoundNumber,
  resumptionAttempts: new Set<string>(),
  resumptionRoundNumber: STREAM_RESUMPTION_DEFAULTS.resumptionRoundNumber,
  // ✅ RACE CONDITION FIX: Round epoch for stale operation detection
  roundEpoch: DATA_DEFAULTS.roundEpoch,
  // AI SDK methods (thread-related)
  sendMessage: THREAD_DEFAULTS.sendMessage,
  // UI state - includes streaming state properties
  // ✅ FIX: Include showInitialUI to reset form visibility after thread unmount
  showInitialUI: UI_DEFAULTS.showInitialUI,
  startRound: THREAD_DEFAULTS.startRound,
  // ✅ RACE CONDITION FIX: Explicit stream completion signal
  streamFinishAcknowledged: THREAD_DEFAULTS.streamFinishAcknowledged,
  streamingRoundNumber: DATA_DEFAULTS.streamingRoundNumber,
  streamResumptionPrefilled: STREAM_RESUMPTION_DEFAULTS.streamResumptionPrefilled,
  // Stream resumption state
  streamResumptionState: STREAM_RESUMPTION_DEFAULTS.streamResumptionState,
  triggeredModeratorIds: new Set<string>(),
  triggeredModeratorRounds: new Set<number>(),
  triggeredPreSearchRounds: new Set<number>(),
  waitingToStartStreaming: UI_DEFAULTS.waitingToStartStreaming,
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
  // ✅ FIX: Do NOT clear changelogItems here - changelog should persist across navigation
  // Previously clearing changelogItems caused it to disappear when navigating back to thread
  // because useSyncHydrateStore guard skips re-hydration for same thread (isInitialized && isSameThread)
  // Reset UI flags related to thread creation
  createdThreadId: UI_DEFAULTS.createdThreadId,
  createdThreadProjectId: UI_DEFAULTS.createdThreadProjectId,
  currentParticipantIndex: THREAD_DEFAULTS.currentParticipantIndex,
  error: THREAD_DEFAULTS.error,
  // Clear feedback state on thread navigation (thread-specific data)
  feedbackByRound: new Map(),
  hasLoadedFeedback: FEEDBACK_DEFAULTS.hasLoadedFeedback,
  isCreatingThread: UI_DEFAULTS.isCreatingThread,
  messages: THREAD_DEFAULTS.messages,
  participants: THREAD_DEFAULTS.participants,
  pendingFeedback: FEEDBACK_DEFAULTS.pendingFeedback,
  // ✅ ATOMIC SWITCH: Clear pending navigation target
  pendingNavigationTargetSlug: null,
  // 🚨 CRITICAL: Clear pre-searches from previous thread
  preSearches: PRESEARCH_DEFAULTS.preSearches,
  // 🚨 CRITICAL: Also clear thread data to prevent state leakage
  thread: THREAD_DEFAULTS.thread,
};

// ============================================================================
// FORM PREFERENCES SCHEMA (Zod-first pattern)
// ============================================================================

/**
 * Form preferences schema for reset operations
 * Zod-first pattern: Schema defines shape, type inferred via z.infer
 *
 * Used when resetting chat state while preserving user's model selections
 * from preferences cookie
 */
export const ResetFormPreferencesSchema = z.object({
  /** Web search enabled from preferences cookie */
  enableWebSearch: z.boolean().optional(),
  /** Model order from preferences cookie */
  modelOrder: z.array(z.string()).optional(),
  /** Selected mode from preferences cookie */
  selectedMode: z.string().nullable().optional(),
  /** Selected model IDs from preferences cookie */
  selectedModelIds: z.array(z.string()).optional(),
});

export type ResetFormPreferences = z.infer<typeof ResetFormPreferencesSchema>;

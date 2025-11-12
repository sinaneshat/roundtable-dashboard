/**
 * Centralized Store Default Values - Single Source of Truth
 *
 * All chat store default/initial values consolidated in one location.
 * Eliminates duplication and ensures consistency across reset functions.
 *
 * ✅ PATTERN: Define defaults → Export typed constants → Use in slices & resets
 * ✅ TYPE-SAFE: Full TypeScript inference with const assertions
 * ✅ SINGLE SOURCE: All reset functions reference these values
 * ✅ MAINTAINABLE: Add new state? Update here once, all resets inherit
 *
 * Reference pattern: /src/api/core/enums.ts
 */

import type { UIMessage } from 'ai';

import type { FeedbackType } from '@/api/core/enums';
import type { ChatParticipant, ChatThread, StoredModeratorAnalysis, StoredPreSearch } from '@/api/routes/chat/schema';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import type { ChatModeId } from '@/lib/config/chat-modes';

import type { ScreenMode } from './actions/screen-initialization';

// ============================================================================
// FORM SLICE DEFAULTS
// ============================================================================

export const FORM_DEFAULTS = {
  inputValue: '',
  selectedMode: null as ChatModeId | null,
  selectedParticipants: [] as ParticipantConfig[],
  enableWebSearch: false,
} as const;

// ============================================================================
// FEEDBACK SLICE DEFAULTS
// ============================================================================

export const FEEDBACK_DEFAULTS = {
  feedbackByRound: new Map<number, FeedbackType | null>(),
  pendingFeedback: null as { roundNumber: number; type: FeedbackType } | null,
  hasLoadedFeedback: false,
} as const;

// ============================================================================
// UI SLICE DEFAULTS
// ============================================================================

export const UI_DEFAULTS = {
  showInitialUI: true,
  waitingToStartStreaming: false,
  isCreatingThread: false,
  createdThreadId: null as string | null,
} as const;

// ============================================================================
// ANALYSIS SLICE DEFAULTS
// ============================================================================

export const ANALYSIS_DEFAULTS = {
  analyses: [] as StoredModeratorAnalysis[],
} as const;

// ============================================================================
// PRE-SEARCH SLICE DEFAULTS
// ============================================================================

export const PRESEARCH_DEFAULTS = {
  preSearches: [] as StoredPreSearch[],
} as const;

// ============================================================================
// THREAD SLICE DEFAULTS
// ============================================================================

export const THREAD_DEFAULTS = {
  thread: null as ChatThread | null,
  participants: [] as ChatParticipant[],
  messages: [] as UIMessage[],
  isStreaming: false,
  currentParticipantIndex: 0,
  error: null as Error | null,
  // AI SDK methods
  sendMessage: undefined as ((content: string) => Promise<void>) | undefined,
  startRound: undefined as (() => Promise<void>) | undefined,
  retry: undefined as (() => Promise<void>) | undefined,
  stop: undefined as (() => void) | undefined,
  chatSetMessages: undefined as ((messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void) | undefined,
} as const;

// ============================================================================
// FLAGS SLICE DEFAULTS
// ============================================================================

export const FLAGS_DEFAULTS = {
  hasInitiallyLoaded: false,
  isRegenerating: false,
  isCreatingAnalysis: false,
  isWaitingForChangelog: false,
  hasPendingConfigChanges: false,
} as const;

// ============================================================================
// DATA SLICE DEFAULTS
// ============================================================================

export const DATA_DEFAULTS = {
  regeneratingRoundNumber: null as number | null,
  pendingMessage: null as string | null,
  expectedParticipantIds: null as string[] | null,
  streamingRoundNumber: null as number | null,
  currentRoundNumber: null as number | null,
} as const;

// ============================================================================
// TRACKING SLICE DEFAULTS
// ============================================================================

export const TRACKING_DEFAULTS = {
  hasSentPendingMessage: false,
  createdAnalysisRounds: new Set<number>(),
  triggeredPreSearchRounds: new Set<number>(),
} as const;

// ============================================================================
// CALLBACKS SLICE DEFAULTS
// ============================================================================

export const CALLBACKS_DEFAULTS = {
  onComplete: undefined as (() => void) | undefined,
  onRetry: undefined as ((roundNumber: number) => void) | undefined,
} as const;

// ============================================================================
// SCREEN SLICE DEFAULTS
// ============================================================================

export const SCREEN_DEFAULTS = {
  screenMode: null as ScreenMode | null,
  isReadOnly: false,
} as const;

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
  // Thread state
  thread: THREAD_DEFAULTS.thread,
  participants: THREAD_DEFAULTS.participants,
  messages: THREAD_DEFAULTS.messages,
  isStreaming: THREAD_DEFAULTS.isStreaming,
  currentParticipantIndex: THREAD_DEFAULTS.currentParticipantIndex,
  error: THREAD_DEFAULTS.error,
  sendMessage: THREAD_DEFAULTS.sendMessage,
  startRound: THREAD_DEFAULTS.startRound,
  retry: THREAD_DEFAULTS.retry,
  stop: THREAD_DEFAULTS.stop,
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
  expectedParticipantIds: DATA_DEFAULTS.expectedParticipantIds,
  streamingRoundNumber: DATA_DEFAULTS.streamingRoundNumber,
  currentRoundNumber: DATA_DEFAULTS.currentRoundNumber,
  // Tracking state
  hasSentPendingMessage: TRACKING_DEFAULTS.hasSentPendingMessage,
  createdAnalysisRounds: TRACKING_DEFAULTS.createdAnalysisRounds,
  triggeredPreSearchRounds: TRACKING_DEFAULTS.triggeredPreSearchRounds,
  // Callbacks state
  onComplete: CALLBACKS_DEFAULTS.onComplete,
  onRetry: CALLBACKS_DEFAULTS.onRetry,
  // Screen state
  screenMode: SCREEN_DEFAULTS.screenMode,
  isReadOnly: SCREEN_DEFAULTS.isReadOnly,
} as const;

/**
 * Thread-specific reset state
 * 🚨 STATE ONLY: Only includes state properties, not action methods
 * Store.set() expects state only - action methods are not passed to set()
 * Used by: resetThreadState (when unmounting thread screen)
 */
export const THREAD_RESET_STATE = {
  // Flags state
  hasInitiallyLoaded: FLAGS_DEFAULTS.hasInitiallyLoaded,
  isRegenerating: FLAGS_DEFAULTS.isRegenerating,
  isCreatingAnalysis: FLAGS_DEFAULTS.isCreatingAnalysis,
  isWaitingForChangelog: FLAGS_DEFAULTS.isWaitingForChangelog,
  hasPendingConfigChanges: FLAGS_DEFAULTS.hasPendingConfigChanges,
  // Data state
  regeneratingRoundNumber: DATA_DEFAULTS.regeneratingRoundNumber,
  pendingMessage: DATA_DEFAULTS.pendingMessage,
  expectedParticipantIds: DATA_DEFAULTS.expectedParticipantIds,
  streamingRoundNumber: DATA_DEFAULTS.streamingRoundNumber,
  currentRoundNumber: DATA_DEFAULTS.currentRoundNumber,
  // Tracking state
  hasSentPendingMessage: TRACKING_DEFAULTS.hasSentPendingMessage,
  createdAnalysisRounds: TRACKING_DEFAULTS.createdAnalysisRounds,
  triggeredPreSearchRounds: TRACKING_DEFAULTS.triggeredPreSearchRounds,
  // AI SDK methods (thread-related)
  sendMessage: THREAD_DEFAULTS.sendMessage,
  startRound: THREAD_DEFAULTS.startRound,
  retry: THREAD_DEFAULTS.retry,
  stop: THREAD_DEFAULTS.stop,
  chatSetMessages: THREAD_DEFAULTS.chatSetMessages,
  // Callbacks (included in thread reset)
  onComplete: CALLBACKS_DEFAULTS.onComplete,
  onRetry: CALLBACKS_DEFAULTS.onRetry,
} as const;

/**
 * Type exports for store slices
 */
export type FormDefaults = typeof FORM_DEFAULTS;
export type FeedbackDefaults = typeof FEEDBACK_DEFAULTS;
export type UIDefaults = typeof UI_DEFAULTS;
export type AnalysisDefaults = typeof ANALYSIS_DEFAULTS;
export type PreSearchDefaults = typeof PRESEARCH_DEFAULTS;
export type ThreadDefaults = typeof THREAD_DEFAULTS;
export type FlagsDefaults = typeof FLAGS_DEFAULTS;
export type DataDefaults = typeof DATA_DEFAULTS;
export type TrackingDefaults = typeof TRACKING_DEFAULTS;
export type CallbacksDefaults = typeof CALLBACKS_DEFAULTS;
export type ScreenDefaults = typeof SCREEN_DEFAULTS;
export type CompleteResetState = typeof COMPLETE_RESET_STATE;
export type ThreadResetState = typeof THREAD_RESET_STATE;

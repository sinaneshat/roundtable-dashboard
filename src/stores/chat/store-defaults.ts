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
  startRound: undefined as (() => void) | undefined,
  retry: undefined as (() => void) | undefined,
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
 * Used by: resetToOverview
 */
export const COMPLETE_RESET_STATE = {
  ...FORM_DEFAULTS,
  ...FEEDBACK_DEFAULTS,
  ...UI_DEFAULTS,
  ...ANALYSIS_DEFAULTS,
  ...PRESEARCH_DEFAULTS,
  ...THREAD_DEFAULTS,
  ...FLAGS_DEFAULTS,
  ...DATA_DEFAULTS,
  ...TRACKING_DEFAULTS,
  ...CALLBACKS_DEFAULTS,
  ...SCREEN_DEFAULTS,
} as const;

/**
 * Thread-specific reset state
 * Used by: resetThreadState (when unmounting thread screen)
 */
export const THREAD_RESET_STATE = {
  ...FLAGS_DEFAULTS,
  ...DATA_DEFAULTS,
  ...TRACKING_DEFAULTS,
  // Include AI SDK methods and callbacks that were missing
  sendMessage: undefined as ((content: string) => Promise<void>) | undefined,
  startRound: undefined as (() => void) | undefined,
  retry: undefined as (() => void) | undefined,
  stop: undefined as (() => void) | undefined,
  chatSetMessages: undefined as ((messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void) | undefined,
  onComplete: undefined as (() => void) | undefined,
  onRetry: undefined as ((roundNumber: number) => void) | undefined,
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

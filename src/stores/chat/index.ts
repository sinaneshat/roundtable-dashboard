/**
 * Chat Store - Public API
 *
 * Zustand v5 Pattern: Centralized exports for chat store
 * Following Next.js App Router best practices for state management
 *
 * EXPORTED FOR SCREENS:
 * - useScreenInitialization: Unified initialization for all screen modes
 * - useChatFormActions: Form submission and management
 * - useFeedbackActions: Round feedback management
 *
 * INTERNAL (not exported):
 * - useModeratorOrchestrator, usePreSearchOrchestrator
 * These are used internally by useScreenInitialization and other composed hooks
 *
 * STORE SUBSCRIPTIONS (automatic):
 * - Moderator triggering: Monitors isStreaming → false (all participants done)
 * - Streaming trigger: Monitors waitingToStartStreaming → true (thread ready)
 * - Pending message send: Monitors participant match + changelog ready
 */

// Primary Screen Hooks
export type { UseFeedbackActionsOptions, UseFeedbackActionsReturn } from './actions/feedback-actions';
export { useFeedbackActions } from './actions/feedback-actions';
export type { UseFlowControllerOptions } from './actions/flow-controller';
export { useFlowController } from './actions/flow-controller';
export type { UseFlowLoadingOptions, UseFlowLoadingReturn } from './actions/flow-loading';
export { useFlowLoading } from './actions/flow-loading';
export { useFlowStateMachine } from './actions/flow-state-machine';
export type { AttachmentInfo, UseChatFormActionsReturn } from './actions/form-actions';
export { useChatFormActions } from './actions/form-actions';
export { useNavigationReset } from './actions/navigation-reset';
export type { UseOverviewActionsReturn } from './actions/overview-actions';
export { useOverviewActions } from './actions/overview-actions';
export type { UseScreenInitializationOptions } from './actions/screen-initialization';
export { useScreenInitialization } from './actions/screen-initialization';
export type { UseThreadActionsOptions } from './actions/thread-actions';
export { useThreadActions } from './actions/thread-actions';
export type {
  InfiniteQueryCache,
  ThreadDetailCacheData,
  ThreadDetailPayloadCache,
  ThreadDetailResponseCache,
  ThreadsListCachePage,
  UsageStatsData,
} from './actions/types';
export {
  validateInfiniteQueryCache,
  validateThreadDetailCache,
  validateThreadDetailPayloadCache,
  validateThreadDetailResponseCache,
  validateThreadsListPages,
  validateUsageStatsCache,
} from './actions/types';
// Cache validation types
export type { ChangelogListCache } from './actions/types';
export { validateChangelogListCache } from './actions/types';
export type { ChatStoreApi } from './store';
export { createChatStore } from './store';
// Store Constants
export {
  AnimationIndices,
  getStatusPriority,
  ModeratorTimeouts,
} from './store-constants';
// Store
export type { ChatStore } from './store-schemas';
// Participant completion gate utilities
export type { ParticipantCompletionStatus, ParticipantDebugInfo } from './utils/participant-completion-gate';
export {
  areAllParticipantsCompleteForRound,
  getModeratorMessageForRound,
  getParticipantCompletionStatus,
  isMessageComplete,
  isRoundComplete,
  ParticipantCompletionStatusSchema,
  ParticipantDebugInfoSchema,
} from './utils/participant-completion-gate';
// Pre-search utilities
export type { ExecutePreSearchOptions } from './utils/pre-search-execution';
export {
  executePreSearch,
  getEffectiveWebSearchEnabled,
  readPreSearchStreamData,
  shouldWaitForPreSearch,
} from './utils/pre-search-execution';

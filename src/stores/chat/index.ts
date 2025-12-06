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
 * - useAnalysisDeduplication, useAnalysisOrchestrator, useChatAnalysis
 * These are used internally by useScreenInitialization and other composed hooks
 *
 * STORE SUBSCRIPTIONS (automatic):
 * - Analysis triggering: Monitors isStreaming → false (all participants done)
 * - Streaming trigger: Monitors waitingToStartStreaming → true (thread ready)
 * - Pending message send: Monitors participant match + changelog ready
 */

// Primary Screen Hooks
export type { UseFeedbackActionsOptions, UseFeedbackActionsReturn } from './actions/feedback-actions';
export { useFeedbackActions } from './actions/feedback-actions';
export type { UseFlowControllerOptions } from './actions/flow-controller';
export { useFlowController } from './actions/flow-controller';
export type { FlowAction, FlowContext, UseFlowOrchestratorOptions, UseFlowOrchestratorReturn } from './actions/flow-state-machine';
export { useFlowStateMachine } from './actions/flow-state-machine';
export type { AttachmentInfo, UseChatFormActionsReturn } from './actions/form-actions';
export { useChatFormActions } from './actions/form-actions';
export type { UseOverviewActionsReturn } from './actions/overview-actions';
export { useOverviewActions } from './actions/overview-actions';
export type { UseRecommendedActionsOptions, UseRecommendedActionsReturn } from './actions/recommended-actions';
export { useRecommendedActions } from './actions/recommended-actions';
export type { UseScreenInitializationOptions } from './actions/screen-initialization';
export { useScreenInitialization } from './actions/screen-initialization';
export type { UseThreadActionsOptions } from './actions/thread-actions';
export { useThreadActions } from './actions/thread-actions';
// Cache validation utilities (used by queries/mutations)
export type {
  AnalysesCacheData,
  AnalysisDeduplicationOptions,
  InfiniteQueryCache,
  ThreadCacheData,
  ThreadDetailCacheData,
  ThreadDetailPayloadCache,
  ThreadDetailResponseCache,
  ThreadsListCachePage,
  UsageStatsData,
} from './actions/types';
export {
  AnalysesCacheDataSchema,
  ThreadCacheDataSchema,
  validateAnalysesCache,
  validateInfiniteQueryCache,
  validateThreadDetailCache,
  validateThreadDetailPayloadCache,
  validateThreadDetailResponseCache,
  validateThreadsListPages,
  validateUsageStatsCache,
} from './actions/types';

// UseThreadActionsReturn is UseConfigChangeHandlersReturn - import from hooks/
// Store
export type { ChatStore, ChatStoreApi } from './store';
export { createChatStore } from './store';

// Store Constants
export type { AnimationIndex } from './store-constants';
export {
  AnimationIndices,
  getStatusPriority,
  isAnalysisAnimation,
  isParticipantAnimation,
  isPreSearchAnimation,
} from './store-constants';

// Pre-search utilities
export type { ExecutePreSearchOptions } from './utils/pre-search-execution';
export {
  executePreSearch,
  readPreSearchStreamData,
  shouldWaitForPreSearch,
} from './utils/pre-search-execution';

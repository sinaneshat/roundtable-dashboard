/**
 * Chat Store Public API
 */

export type { UseAutoModeAnalysisReturn } from './actions/auto-mode-actions';
export { useAutoModeAnalysis } from './actions/auto-mode-actions';
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
export type { UseOverviewActionsOptions, UseOverviewActionsReturn } from './actions/overview-actions';
export { useOverviewActions } from './actions/overview-actions';
export type { UseScreenInitializationOptions } from './actions/screen-initialization';
export { useScreenInitialization } from './actions/screen-initialization';
export type { SyncHydrateOptions } from './actions/sync-hydrate-store';
export { useSyncHydrateStore } from './actions/sync-hydrate-store';
export type { UseThreadActionsOptions } from './actions/thread-actions';
export { useThreadActions } from './actions/thread-actions';
export type {
  ChangelogItemCache,
  ChangelogListCache,
  InfiniteQueryCache,
  ThreadDetailCacheData,
  ThreadDetailPayloadCache,
  ThreadDetailResponseCache,
  ThreadsListCachePage,
  UsageStatsData,
} from './actions/types';
export {
  ChatThreadCacheSchema,
  validateChangelogListCache,
  validateInfiniteQueryCache,
  validateThreadDetailCache,
  validateThreadDetailPayloadCache,
  validateThreadDetailResponseCache,
  validateThreadsListPages,
  validateUsageStatsCache,
} from './actions/types';
// Reusable selector hooks
export { useIsInCreationFlow } from './hooks';
// FSM Machine exports
export {
  type AiSdkSnapshot,
  buildContext,
  createEmptyContext,
  type EventPayload,
  actions as fsmActions,
  guards,
  isModeratorPhase,
  isParticipantPhase,
  isPreSearchPhase,
  isStreamingState,
  isTerminalState,
  noTransition,
  type ParticipantCompletePayload,
  type ParticipantStartPayload,
  type RoundContext,
  type RoundFlowAction,
  type StartRoundPayload,
  type StoreSnapshot,
  transition,
  type TransitionResult,
} from './machine';
// FSM Selectors
export { selectors } from './selectors';
export type { ChatStoreApi } from './store';
export { createChatStore } from './store';
export {
  AnimationIndices,
  getStatusPriority,
  ModeratorTimeouts,
} from './store-constants';
export type {
  ChatStore,
  DispatchFlowEvent,
  ModeratorInfo,
  NextParticipantToTrigger,
  ParticipantInfo,
  PreSearchInfo,
  ResetFlowState,
  ResumptionInfo,
  RoundFlowActions,
  RoundFlowSlice,
  RoundFlowState,
  SetFlowState,
  StoredModeratorData,
  StoredModeratorSummary,
} from './store-schemas';
// FSM Context Schemas
export {
  AiSdkSnapshotSchema,
  ModeratorInfoSchema,
  ParticipantInfoSchema,
  PreSearchInfoSchema,
  ResumptionInfoSchema,
  RoundContextSchema,
  StoreSnapshotSchema,
} from './store-schemas';
export type { ParticipantCompletionStatus, ParticipantDebugInfo, RoundActualCompletionStatus } from './utils/participant-completion-gate';
export {
  areAllParticipantsCompleteForRound,
  getModeratorMessageForRound,
  getParticipantCompletionStatus,
  getRoundActualCompletionStatus,
  isMessageComplete,
  isRoundComplete,
  ParticipantCompletionStatusSchema,
  ParticipantDebugInfoSchema,
} from './utils/participant-completion-gate';
export type { ExecutePreSearchOptions } from './utils/pre-search-execution';
export {
  executePreSearch,
  getEffectiveWebSearchEnabled,
  readPreSearchStreamData,
  shouldWaitForPreSearch,
} from './utils/pre-search-execution';

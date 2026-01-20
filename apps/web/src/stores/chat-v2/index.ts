/**
 * Chat Store V2 - Public API
 *
 * Simplified chat state management with flow state machine.
 * Consolidates 15 slices into 4 domains.
 */

// Flow machine
export type {
  FlowContext,
  FlowEvent,
  FlowState,
} from './flow-machine';
export {
  canStop,
  canSubmitMessage,
  getCurrentRound,
  getThreadId,
  INITIAL_FLOW_STATE,
  isFlowActive,
  transition,
} from './flow-machine';

// Selector hooks
export {
  useCurrentRound,
  useCurrentStreamingParticipant,
  useDispatch,
  useEffectiveThreadId,
  useEnabledParticipants,
  useFeedbackActions,
  // Feedback selectors
  useFeedbackForRound,
  useFlowDerivedState,
  // Flow selectors
  useFlowState,
  useFormActions,
  // Form selectors
  useFormState,
  useHasInitiallyLoaded,
  useInputValue,
  useIsPreSearchComplete,
  useMessageListState,
  useMessages,
  // Navigation hooks
  useNavigationReset,
  useParticipants,
  usePreSearchActions,
  // Pre-search selectors
  usePreSearchForRound,
  useRoundStatus,
  useScreenMode,
  useSelectedParticipants,
  // Backward compat
  useShowInitialUI,
  // Combined selectors
  useSubmitState,
  useThread,
  // Action selectors
  useThreadActions,
  // Thread selectors
  useThreadState,
  useUIActions,
  // UI selectors
  useUIState,
} from './hooks';

// Reset utilities
export type { ResetScope } from './reset';
export { needsReset, reset } from './reset';

// Store factory and types
export type { ChatStoreApi } from './store';
export { createChatStore } from './store';

// Schemas and types
export type {
  BackendThreadResponse,
  Changelog,
  ChatMode,
  ChatParticipant,
  ChatStore,
  ChatStoreActions,
  ChatStoreState,
  FeedbackActions,
  FeedbackState,
  FormActions,
  FormState,
  ParticipantConfig,
  PreSearchActions,
  PreSearchResult,
  PreSearchState,
  RoundActions,
  RoundState,
  Thread,
  ThreadActions,
  ThreadState,
  ThreadUser,
  UIActions,
  UIState,
} from './store-schemas';

// Utilities
export {
  createOptimisticUserMessage,
  createPlaceholderParticipant,
  createPlaceholderPreSearch,
} from './utils';

/**
 * Zod Schemas for Chat Store State - Type Safety & Validation
 *
 * Following Zustand v5 best practices: schemas define state shape, types inferred.
 * All store slices have corresponding Zod schemas for runtime validation and type safety.
 *
 * ✅ PATTERN: Schema-first → Infer types → Runtime validation
 * ✅ TYPE-SAFE: All state changes validated at runtime in development
 * ✅ SINGLE SOURCE: Types derived from schemas, not duplicated
 * ✅ ZUSTAND V5: Complete slice schemas for combine middleware
 *
 * Reference: /src/api/routes/chat/schema.ts
 */

import type { FeedbackType, RoundFlowEvent, RoundPhase } from '@roundtable/shared';
import {
  ChatModeSchema,
  FeedbackTypeSchema,
  MessageStatusSchema,
  RoundFlowEventSchema,
  RoundFlowStateSchema,
  RoundPhaseSchema,
  ScreenModeSchema,
  StreamStatusSchema,
} from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { z } from 'zod';

import { PendingAttachmentSchema } from '@/hooks/utils';
import { ExtendedFilePartSchema } from '@/lib/schemas/message-schemas';
import { ChatParticipantSchema, ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';
import type { ApiChangelog, ChatParticipant, ChatThread, StoredPreSearch } from '@/services/api';
import { ModeratorPayloadSchema } from '@/services/api';

import type {
  AddAttachments,
  AddParticipant,
  AddPreSearch,
  AnimationResolver,
  ChatSetMessages,
  CheckStuckPreSearches,
  CheckStuckStreams,
  ClearAllPreSearches,
  ClearAllPreSearchTracking,
  ClearAnimations,
  ClearAttachments,
  ClearModeratorStreamTracking,
  ClearModeratorTracking,
  ClearPreSearchActivity,
  ClearPreSearchTracking,
  ClearStreamResumption,
  CompleteAnimation,
  CompleteModeratorStream,
  CompleteRegeneration,
  CompleteStreaming,
  CompleteTitleAnimation,
  DeduplicateMessages,
  FinalizeMessageId,
  GetAttachments,
  GetPreSearchActivityTime,
  HandleResumedStreamComplete,
  HandleStreamResumptionFailure,
  HasAttachments,
  HasModeratorBeenCreated,
  HasModeratorStreamBeenTriggered,
  HasPreSearchBeenTriggered,
  InitializeThread,
  IsStreamResumptionStale,
  IsStreamResumptionValid,
  LoadFeedbackFromServer,
  MarkModeratorCreated,
  MarkModeratorStreamTriggered,
  MarkPreSearchTriggered,
  MarkResumptionAttempted,
  NeedsMessageSync,
  NeedsStreamResumption,
  OnComplete,
  PrefillStreamResumptionState,
  PrepareForNewMessage,
  ReconcileWithActiveStream,
  RegisterAnimation,
  RemoveAttachment,
  RemoveParticipant,
  RemovePreSearch,
  ReorderParticipants,
  ResetForm,
  ResetForThreadNavigation,
  ResetScreenMode,
  ResetThreadState,
  ResetToNewChat,
  ResetToOverview,
  ResetUI,
  SetAnimationPhase,
  SetAutoMode,
  SetChatSetMessages,
  SetConfigChangeRoundNumber,
  SetCreatedThreadId,
  SetCreatedThreadProjectId,
  SetCurrentParticipantIndex,
  SetCurrentRoundNumber,
  SetEnableWebSearch,
  SetError,
  SetExpectedParticipantIds,
  SetFeedback,
  SetHasEarlyOptimisticMessage,
  SetHasInitiallyLoaded,
  SetHasPendingConfigChanges,
  SetHasSentPendingMessage,
  SetInputValue,
  SetIsAnalyzingPrompt,
  SetIsCreatingThread,
  SetIsModeratorStreaming,
  SetIsPatchInProgress,
  SetIsRegenerating,
  SetIsStreaming,
  SetIsWaitingForChangelog,
  SetMessages,
  SetModelOrder,
  SetNextParticipantToTrigger,
  SetOnComplete,
  SetParticipantHandoffInProgress,
  SetParticipants,
  SetPendingAttachmentIds,
  SetPendingFeedback,
  SetPendingFileParts,
  SetPendingMessage,
  SetPreSearches,
  SetRegeneratingRoundNumber,
  SetResumptionScope,
  SetScreenMode,
  SetSelectedMode,
  SetSelectedParticipants,
  SetSendMessage,
  SetShowInitialUI,
  SetStartRound,
  SetStreamingRoundNumber,
  SetThread,
  SetWaitingToStartStreaming,
  StartRegeneration,
  StartTitleAnimation,
  TryMarkModeratorCreated,
  TryMarkPreSearchTriggered,
  UpdateAttachmentPreview,
  UpdateAttachmentUpload,
  UpdateDisplayedTitle,
  UpdatePartialPreSearchData,
  UpdateParticipant,
  UpdateParticipants,
  UpdatePreSearchActivity,
  UpdatePreSearchData,
  UpdatePreSearchStatus,
  UpsertStreamingMessage,
  WaitForAnimation,
} from './store-action-types';

// ParticipantConfigSchema imported from @/lib/schemas/participant-schemas (single source of truth)

// ============================================================================
// AI SDK FUNCTION SCHEMAS (for type safety)
// ============================================================================

// Schema for AI SDK callback functions - typed with z.custom<T>()
const ChatSetMessagesFnSchema = z.custom<ChatSetMessages>();
const OnCompleteFnSchema = z.custom<OnComplete>();

// ============================================================================
// FORM SLICE SCHEMAS
// ============================================================================

export const FormStateSchema = z.object({
  inputValue: z.string(),
  selectedMode: ChatModeSchema.nullable(),
  selectedParticipants: z.array(ParticipantConfigSchema),
  enableWebSearch: z.boolean(),
  modelOrder: z.array(z.string()),
  autoMode: z.boolean(),
  animationStartIndex: z.number(),
  shouldSkipAnimation: z.boolean(),
  animatedMessageIds: z.set(z.string()),
});

export const FormActionsSchema = z.object({
  setInputValue: z.custom<SetInputValue>(),
  setSelectedMode: z.custom<SetSelectedMode>(),
  setSelectedParticipants: z.custom<SetSelectedParticipants>(),
  setEnableWebSearch: z.custom<SetEnableWebSearch>(),
  setModelOrder: z.custom<SetModelOrder>(),
  setAutoMode: z.custom<SetAutoMode>(),
  addParticipant: z.custom<AddParticipant>(),
  removeParticipant: z.custom<RemoveParticipant>(),
  updateParticipant: z.custom<UpdateParticipant>(),
  reorderParticipants: z.custom<ReorderParticipants>(),
  resetForm: z.custom<ResetForm>(),
});

export const FormSliceSchema = z.intersection(FormStateSchema, FormActionsSchema);

// ============================================================================
// FEEDBACK SLICE SCHEMAS
// ============================================================================

export const FeedbackStateSchema = z.object({
  feedbackByRound: z.custom<Map<number, FeedbackType | null>>(),
  pendingFeedback: z.object({
    roundNumber: z.number(),
    type: FeedbackTypeSchema,
  }).nullable(),
  hasLoadedFeedback: z.boolean(),
});

export const FeedbackActionsSchema = z.object({
  setFeedback: z.custom<SetFeedback>(),
  setPendingFeedback: z.custom<SetPendingFeedback>(),
  loadFeedbackFromServer: z.custom<LoadFeedbackFromServer>(),
});

export const FeedbackSliceSchema = z.intersection(FeedbackStateSchema, FeedbackActionsSchema);

// ============================================================================
// UI SLICE SCHEMAS
// ============================================================================

export const UIStateSchema = z.object({
  showInitialUI: z.boolean(),
  waitingToStartStreaming: z.boolean(),
  isCreatingThread: z.boolean(),
  createdThreadId: z.string().nullable(),
  /** Project ID for the created thread - used for project-specific cache updates */
  createdThreadProjectId: z.string().nullable(),
  isAnalyzingPrompt: z.boolean(),
});

export const UIActionsSchema = z.object({
  setShowInitialUI: z.custom<SetShowInitialUI>(),
  setWaitingToStartStreaming: z.custom<SetWaitingToStartStreaming>(),
  setIsCreatingThread: z.custom<SetIsCreatingThread>(),
  setCreatedThreadId: z.custom<SetCreatedThreadId>(),
  setCreatedThreadProjectId: z.custom<SetCreatedThreadProjectId>(),
  setIsAnalyzingPrompt: z.custom<SetIsAnalyzingPrompt>(),
  resetUI: z.custom<ResetUI>(),
});

export const UISliceSchema = z.intersection(UIStateSchema, UIActionsSchema);

// ============================================================================
// PRE-SEARCH SLICE SCHEMAS
// ============================================================================

export const PreSearchStateSchema = z.object({
  preSearches: z.custom<Array<StoredPreSearch>>(),
  preSearchActivityTimes: z.custom<Map<number, number>>(),
});

export const PreSearchActionsSchema = z.object({
  setPreSearches: z.custom<SetPreSearches>(),
  addPreSearch: z.custom<AddPreSearch>(),
  updatePreSearchData: z.custom<UpdatePreSearchData>(),
  updatePartialPreSearchData: z.custom<UpdatePartialPreSearchData>(),
  updatePreSearchStatus: z.custom<UpdatePreSearchStatus>(),
  removePreSearch: z.custom<RemovePreSearch>(),
  clearAllPreSearches: z.custom<ClearAllPreSearches>(),
  checkStuckPreSearches: z.custom<CheckStuckPreSearches>(),
  updatePreSearchActivity: z.custom<UpdatePreSearchActivity>(),
  getPreSearchActivityTime: z.custom<GetPreSearchActivityTime>(),
  clearPreSearchActivity: z.custom<ClearPreSearchActivity>(),
});

export const PreSearchSliceSchema = z.intersection(PreSearchStateSchema, PreSearchActionsSchema);

// ============================================================================
// CHANGELOG SLICE SCHEMAS
// ============================================================================

export const ChangelogStateSchema = z.object({
  changelogItems: z.custom<ApiChangelog[]>(),
});

export const ChangelogActionsSchema = z.object({
  setChangelogItems: z.custom<(items: ApiChangelog[]) => void>(),
  addChangelogItems: z.custom<(items: ApiChangelog[]) => void>(),
});

export const ChangelogSliceSchema = z.intersection(ChangelogStateSchema, ChangelogActionsSchema);

// ============================================================================
// MODERATOR DATA SCHEMAS (UI-specific types for store)
// ============================================================================

/**
 * StoredModeratorDataSchema - UI representation of moderator state in store
 * Used for tracking moderator execution across rounds
 */
export const StoredModeratorDataSchema = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  roundNumber: z.number(),
  mode: z.string().optional(),
  userQuestion: z.string().optional(),
  status: MessageStatusSchema,
  moderatorData: ModeratorPayloadSchema.nullable(),
  participantMessageIds: z.array(z.string()).optional(),
  // Date fields use string (JSON serialization converts Date to string)
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export type StoredModeratorData = z.infer<typeof StoredModeratorDataSchema>;

/**
 * StoredModeratorSummarySchema - Summary data from moderator
 */
export const StoredModeratorSummarySchema = z.object({
  content: z.string(),
  generatedAt: z.string(),
});

export type StoredModeratorSummary = z.infer<typeof StoredModeratorSummarySchema>;

// ============================================================================
// THREAD SLICE SCHEMAS
// ============================================================================

export const ThreadStateSchema = z.object({
  thread: z.custom<ChatThread | null>(),
  participants: z.array(ChatParticipantSchema),
  messages: z.array(z.custom<UIMessage>()),
  isStreaming: z.boolean(),
  currentParticipantIndex: z.number(),
  error: z.custom<Error | null>(),
  sendMessage: z.custom<((content: string) => Promise<void>) | undefined>().optional(),
  startRound: z.custom<(() => Promise<void>) | undefined>().optional(),
  chatSetMessages: ChatSetMessagesFnSchema.optional(),
  // ✅ NAVIGATION CLEANUP: Stop function to abort in-flight streaming on route change
  chatStop: z.custom<(() => void) | undefined>().optional(),
  /**
   * ✅ RACE CONDITION FIX: Explicit completion signal
   * Set to true by AI SDK's onFinish callback AFTER message state is finalized.
   * Replaces the 50ms timeout workaround for stream settling.
   * Reset to false when new streaming starts.
   */
  streamFinishAcknowledged: z.boolean(),
});

export const ThreadActionsSchema = z.object({
  setThread: z.custom<SetThread>(),
  setParticipants: z.custom<SetParticipants>(),
  setMessages: z.custom<SetMessages>(),
  setIsStreaming: z.custom<SetIsStreaming>(),
  setCurrentParticipantIndex: z.custom<SetCurrentParticipantIndex>(),
  setError: z.custom<SetError>(),
  setSendMessage: z.custom<SetSendMessage>(),
  setStartRound: z.custom<SetStartRound>(),
  setChatSetMessages: z.custom<SetChatSetMessages>(),
  // ✅ NAVIGATION CLEANUP: Action to set the AI SDK stop function
  setChatStop: z.custom<(fn?: () => void) => void>(),
  checkStuckStreams: z.custom<CheckStuckStreams>(),
  // Streaming message actions (direct store updates for AI SDK callbacks)
  upsertStreamingMessage: z.custom<UpsertStreamingMessage>(),
  finalizeMessageId: z.custom<FinalizeMessageId>(),
  deduplicateMessages: z.custom<DeduplicateMessages>(),
  /**
   * ✅ RACE CONDITION FIX: Acknowledge stream finish from onFinish callback
   * Called by AI SDK onFinish to signal that message state is finalized.
   * Replaces timeout-based stream settling detection.
   */
  acknowledgeStreamFinish: z.custom<() => void>(),
  /**
   * ✅ RACE CONDITION FIX: Reset stream finish acknowledgment when starting new stream
   */
  resetStreamFinishAcknowledgment: z.custom<() => void>(),
});

export const ThreadSliceSchema = z.intersection(ThreadStateSchema, ThreadActionsSchema);

// ============================================================================
// FLAGS SLICE SCHEMAS
// ============================================================================

export const FlagsStateSchema = z.object({
  hasInitiallyLoaded: z.boolean(),
  isRegenerating: z.boolean(),
  isModeratorStreaming: z.boolean(),
  isWaitingForChangelog: z.boolean(),
  hasPendingConfigChanges: z.boolean(),
  /** ✅ PATCH BLOCKING: True while thread PATCH is in progress - prevents streaming race */
  isPatchInProgress: z.boolean(),
  /** ✅ HANDOFF FIX: True during P0→P1 participant transition to prevent 10s cleanup */
  participantHandoffInProgress: z.boolean(),
});

/**
 * ✅ RACE CONDITION FIX: Atomic config change state update
 * Groups all config-related flags that must be updated together
 */
export const ConfigChangeStateSchema = z.object({
  configChangeRoundNumber: z.number().nullable(),
  isWaitingForChangelog: z.boolean(),
  isPatchInProgress: z.boolean(),
  hasPendingConfigChanges: z.boolean(),
});

export type ConfigChangeState = z.infer<typeof ConfigChangeStateSchema>;

export const FlagsActionsSchema = z.object({
  setHasInitiallyLoaded: z.custom<SetHasInitiallyLoaded>(),
  setIsRegenerating: z.custom<SetIsRegenerating>(),
  setIsModeratorStreaming: z.custom<SetIsModeratorStreaming>(),
  completeModeratorStream: z.custom<CompleteModeratorStream>(),
  setIsWaitingForChangelog: z.custom<SetIsWaitingForChangelog>(),
  setHasPendingConfigChanges: z.custom<SetHasPendingConfigChanges>(),
  setIsPatchInProgress: z.custom<SetIsPatchInProgress>(),
  setParticipantHandoffInProgress: z.custom<SetParticipantHandoffInProgress>(),
  /**
   * ✅ RACE CONDITION FIX: Atomically update all config change flags
   * Prevents race condition where flags are updated individually and effects
   * see inconsistent state (e.g., isPatchInProgress=false but isWaitingForChangelog=true)
   */
  atomicUpdateConfigChangeState: z.custom<(update: Partial<ConfigChangeState>) => void>(),
  /**
   * ✅ RACE CONDITION FIX: Clear all config change flags atomically
   * Called when config change flow completes (after changelog fetched)
   */
  clearConfigChangeState: z.custom<() => void>(),
});

export const FlagsSliceSchema = z.intersection(FlagsStateSchema, FlagsActionsSchema);

// ============================================================================
// DATA SLICE SCHEMAS
// ============================================================================

export const DataStateSchema = z.object({
  regeneratingRoundNumber: z.number().nullable(),
  pendingMessage: z.string().nullable(),
  pendingAttachmentIds: z.array(z.string()).nullable(),
  pendingFileParts: z.array(ExtendedFilePartSchema).nullable(),
  expectedParticipantIds: z.array(z.string()).nullable(),
  streamingRoundNumber: z.number().nullable(),
  currentRoundNumber: z.number().nullable(),
  /** Round number when config changes were submitted (for incremental changelog fetch) */
  configChangeRoundNumber: z.number().nullable(),
  /**
   * ✅ RACE CONDITION FIX: Round epoch counter
   * Increments each time a new round starts (user submits message).
   * Effects can compare their captured epoch with current to detect stale operations.
   * This prevents race conditions like:
   * - r1 resume logic executing after user submitted r2
   * - Stale effects triggering wrong participants
   */
  roundEpoch: z.number(),
});

export const DataActionsSchema = z.object({
  setRegeneratingRoundNumber: z.custom<SetRegeneratingRoundNumber>(),
  setPendingMessage: z.custom<SetPendingMessage>(),
  setPendingAttachmentIds: z.custom<SetPendingAttachmentIds>(),
  setPendingFileParts: z.custom<SetPendingFileParts>(),
  setExpectedParticipantIds: z.custom<SetExpectedParticipantIds>(),
  batchUpdatePendingState: z.custom<(pendingMessage: string | null, expectedParticipantIds: string[] | null) => void>(),
  setStreamingRoundNumber: z.custom<SetStreamingRoundNumber>(),
  setCurrentRoundNumber: z.custom<SetCurrentRoundNumber>(),
  setConfigChangeRoundNumber: z.custom<SetConfigChangeRoundNumber>(),
  /**
   * ✅ RACE CONDITION FIX: Atomically start a new round
   * - Increments roundEpoch
   * - Sets streamingRoundNumber
   * - Returns the new epoch for callers to track
   * This ensures all related state updates happen in one set() call
   */
  startNewRound: z.custom<(roundNumber: number) => number>(),
  /** Get current round epoch for stale detection */
  getRoundEpoch: z.custom<() => number>(),
});

export const DataSliceSchema = z.intersection(DataStateSchema, DataActionsSchema);

// ============================================================================
// TRACKING SLICE SCHEMAS
// ============================================================================

export const TrackingStateSchema = z.object({
  hasSentPendingMessage: z.boolean(),
  createdModeratorRounds: z.custom<Set<number>>(),
  triggeredPreSearchRounds: z.custom<Set<number>>(),
  triggeredModeratorRounds: z.custom<Set<number>>(),
  triggeredModeratorIds: z.custom<Set<string>>(),
  hasEarlyOptimisticMessage: z.boolean(),
});

export const TrackingActionsSchema = z.object({
  setHasSentPendingMessage: z.custom<SetHasSentPendingMessage>(),
  markModeratorCreated: z.custom<MarkModeratorCreated>(),
  hasModeratorBeenCreated: z.custom<HasModeratorBeenCreated>(),
  tryMarkModeratorCreated: z.custom<TryMarkModeratorCreated>(),
  clearModeratorTracking: z.custom<ClearModeratorTracking>(),
  markPreSearchTriggered: z.custom<MarkPreSearchTriggered>(),
  hasPreSearchBeenTriggered: z.custom<HasPreSearchBeenTriggered>(),
  tryMarkPreSearchTriggered: z.custom<TryMarkPreSearchTriggered>(),
  clearPreSearchTracking: z.custom<ClearPreSearchTracking>(),
  clearAllPreSearchTracking: z.custom<ClearAllPreSearchTracking>(),
  markModeratorStreamTriggered: z.custom<MarkModeratorStreamTriggered>(),
  hasModeratorStreamBeenTriggered: z.custom<HasModeratorStreamBeenTriggered>(),
  clearModeratorStreamTracking: z.custom<ClearModeratorStreamTracking>(),
  setHasEarlyOptimisticMessage: z.custom<SetHasEarlyOptimisticMessage>(),
});

export const TrackingSliceSchema = z.intersection(TrackingStateSchema, TrackingActionsSchema);

// ============================================================================
// CALLBACKS SLICE SCHEMAS
// ============================================================================

export const CallbacksStateSchema = z.object({
  onComplete: OnCompleteFnSchema.optional(),
});

export const CallbacksActionsSchema = z.object({
  setOnComplete: z.custom<SetOnComplete>(),
});

export const CallbacksSliceSchema = z.intersection(CallbacksStateSchema, CallbacksActionsSchema);

// ============================================================================
// SCREEN SLICE SCHEMAS
// ============================================================================

export const ScreenStateSchema = z.object({
  screenMode: ScreenModeSchema.nullable(),
  isReadOnly: z.boolean(),
});

export const ScreenActionsSchema = z.object({
  setScreenMode: z.custom<SetScreenMode>(),
  resetScreenMode: z.custom<ResetScreenMode>(),
});

export const ScreenSliceSchema = z.intersection(ScreenStateSchema, ScreenActionsSchema);

// ============================================================================
// STREAM RESUMPTION SLICE SCHEMAS
// ============================================================================

/**
 * Stream resumption state entity - Zod-first pattern
 * Uses StreamStatusSchema from enums for type safety
 */
export const StreamResumptionStateEntitySchema = z.object({
  streamId: z.string().min(1),
  threadId: z.string().min(1),
  roundNumber: z.number().int().nonnegative(),
  participantIndex: z.number().int().nonnegative(),
  state: StreamStatusSchema,
  // Date fields use string (JSON serialization converts Date to string)
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

/**
 * Stream resumption state type - inferred from Zod schema
 */
export type StreamResumptionState = z.infer<typeof StreamResumptionStateEntitySchema>;

/**
 * Pre-search resumption state for phase-based tracking
 * Uses MessageStatusSchema for consistency with message lifecycle
 */
export const PreSearchResumptionStateSchema = z.object({
  enabled: z.boolean(),
  status: MessageStatusSchema.nullable(),
  streamId: z.string().nullable(),
  preSearchId: z.string().nullable(),
});

export type PreSearchResumptionState = z.infer<typeof PreSearchResumptionStateSchema>;

/**
 * Moderator resumption state for phase-based tracking
 * Uses MessageStatusSchema for consistency with message lifecycle
 */
export const ModeratorResumptionStateSchema = z.object({
  status: MessageStatusSchema.nullable(),
  streamId: z.string().nullable(),
  moderatorMessageId: z.string().nullable(),
});

export type ModeratorResumptionState = z.infer<typeof ModeratorResumptionStateSchema>;

/**
 * ✅ TYPE-SAFE: Next participant to trigger - object with ID for validation,
 * or just index when participants aren't loaded yet (during prefill before initializeThread)
 * Prevents stale index from triggering wrong participant after config changes
 */
export const NextParticipantToTriggerObjectSchema = z.object({
  index: z.number().int().nonnegative(),
  participantId: z.string().min(1),
});

export const NextParticipantToTriggerSchema = z.union([
  NextParticipantToTriggerObjectSchema,
  z.number().int().nonnegative(),
]);

export type NextParticipantToTrigger = z.infer<typeof NextParticipantToTriggerSchema>;

export const StreamResumptionSliceStateSchema = z.object({
  streamResumptionState: StreamResumptionStateEntitySchema.nullable(),
  resumptionAttempts: z.custom<Set<string>>(),
  nextParticipantToTrigger: NextParticipantToTriggerSchema.nullable(),
  streamResumptionPrefilled: z.boolean(),
  prefilledForThreadId: z.string().nullable(),
  currentResumptionPhase: RoundPhaseSchema.nullable(),
  preSearchResumption: PreSearchResumptionStateSchema.nullable(),
  moderatorResumption: ModeratorResumptionStateSchema.nullable(),
  resumptionRoundNumber: z.number().nullable(),
  /** ✅ SCOPE VERSIONING: Thread ID for current resumption scope */
  resumptionScopeThreadId: z.string().nullable(),
  /** ✅ SCOPE VERSIONING: Version counter - increments on each navigation to invalidate stale effects */
  resumptionScopeVersion: z.number(),
});

/**
 * Schema for stream resumption prefill update - Zod-first pattern
 */
export const StreamResumptionPrefillUpdateSchema = z.object({
  streamResumptionPrefilled: z.boolean(),
  prefilledForThreadId: z.string(),
  currentResumptionPhase: RoundPhaseSchema,
  resumptionRoundNumber: z.number().nullable(),
  preSearchResumption: PreSearchResumptionStateSchema.nullable().optional(),
  moderatorResumption: ModeratorResumptionStateSchema.nullable().optional(),
  nextParticipantToTrigger: NextParticipantToTriggerSchema.nullable().optional(),
  waitingToStartStreaming: z.boolean().optional(),
  isModeratorStreaming: z.boolean().optional(),
});

export type StreamResumptionPrefillUpdate = z.infer<typeof StreamResumptionPrefillUpdateSchema>;

export const StreamResumptionActionsSchema = z.object({
  setStreamResumptionState: z.custom<(state: StreamResumptionState | null) => void>(),
  needsStreamResumption: z.custom<NeedsStreamResumption>(),
  isStreamResumptionStale: z.custom<IsStreamResumptionStale>(),
  isStreamResumptionValid: z.custom<IsStreamResumptionValid>(),
  handleResumedStreamComplete: z.custom<HandleResumedStreamComplete>(),
  handleStreamResumptionFailure: z.custom<HandleStreamResumptionFailure>(),
  setNextParticipantToTrigger: z.custom<SetNextParticipantToTrigger>(),
  markResumptionAttempted: z.custom<MarkResumptionAttempted>(),
  needsMessageSync: z.custom<NeedsMessageSync>(),
  clearStreamResumption: z.custom<ClearStreamResumption>(),
  prefillStreamResumptionState: z.custom<PrefillStreamResumptionState>(),
  transitionToParticipantsPhase: z.custom<() => void>(),
  transitionToModeratorPhase: z.custom<(roundNumber?: number) => void>(),
  setCurrentResumptionPhase: z.custom<(phase: RoundPhase) => void>(),
  /** ✅ SCOPE VERSIONING: Set thread scope for resumption validation */
  setResumptionScope: z.custom<SetResumptionScope>(),
  /** ✅ SMART STALE DETECTION: Reconcile prefilled state with actual active stream */
  reconcileWithActiveStream: z.custom<ReconcileWithActiveStream>(),
});

export const StreamResumptionSliceSchema = z.intersection(StreamResumptionSliceStateSchema, StreamResumptionActionsSchema);

// ============================================================================
// ROUND FLOW SLICE SCHEMAS (FSM-based orchestration)
// ============================================================================

/**
 * Round Flow State - FSM state for round orchestration
 * Replaces multiple boolean flags with explicit state machine states
 */
export const RoundFlowStateSliceSchema = z.object({
  /** Current FSM state - THE source of truth for round lifecycle */
  flowState: RoundFlowStateSchema,
  /** Round number being orchestrated */
  flowRoundNumber: z.number().nullable(),
  /** Participant index within current round */
  flowParticipantIndex: z.number(),
  /** Total enabled participants for current round */
  flowParticipantCount: z.number(),
  /** Last error that occurred during round flow */
  flowLastError: z.custom<Error | null>(),
  /** Event history for debugging (dev mode only) */
  flowEventHistory: z.array(z.object({
    event: RoundFlowEventSchema,
    fromState: RoundFlowStateSchema,
    toState: RoundFlowStateSchema,
    timestamp: z.number(),
  })),
});

/** Type for FSM dispatch function */
export type DispatchFlowEvent = (event: RoundFlowEvent, payload?: Record<string, unknown>) => void;

/** Type for FSM state setter - uses the FSM state enum type from shared */
export type SetFlowState = (state: z.infer<typeof RoundFlowStateSchema>) => void;

/** Type for resetting flow state */
export type ResetFlowState = () => void;

export const RoundFlowActionsSchema = z.object({
  /** Dispatch an FSM event - triggers state transition */
  dispatchFlowEvent: z.custom<DispatchFlowEvent>(),
  /** Directly set FSM state (for internal use) */
  setFlowState: z.custom<SetFlowState>(),
  /** Reset flow state to IDLE */
  resetFlowState: z.custom<ResetFlowState>(),
  /** Set participant index for current round */
  setFlowParticipantIndex: z.custom<(index: number) => void>(),
  /** Set participant count for current round */
  setFlowParticipantCount: z.custom<(count: number) => void>(),
  /** Set round number for flow tracking */
  setFlowRoundNumber: z.custom<(roundNumber: number | null) => void>(),
  /** Record flow error */
  setFlowError: z.custom<(error: Error | null) => void>(),
});

export const RoundFlowSliceSchema = z.intersection(RoundFlowStateSliceSchema, RoundFlowActionsSchema);

// ============================================================================
// ANIMATION SLICE SCHEMAS
// ============================================================================

export const AnimationStateSchema = z.object({
  pendingAnimations: z.custom<Set<number>>(),
  animationResolvers: z.custom<Map<number, AnimationResolver>>(),
});

export const AnimationActionsSchema = z.object({
  registerAnimation: z.custom<RegisterAnimation>(),
  completeAnimation: z.custom<CompleteAnimation>(),
  waitForAnimation: z.custom<WaitForAnimation>(),
  waitForAllAnimations: z.custom<() => Promise<void>>(),
  clearAnimations: z.custom<ClearAnimations>(),
});

export const AnimationSliceSchema = z.intersection(AnimationStateSchema, AnimationActionsSchema);

// ============================================================================
// ATTACHMENTS SLICE SCHEMAS
// ============================================================================
// PendingAttachmentSchema imported from @/hooks/utils/use-chat-attachments (single source of truth)

export const AttachmentsStateSchema = z.object({
  pendingAttachments: z.array(PendingAttachmentSchema),
});

export const AttachmentsActionsSchema = z.object({
  addAttachments: z.custom<AddAttachments>(),
  removeAttachment: z.custom<RemoveAttachment>(),
  clearAttachments: z.custom<ClearAttachments>(),
  updateAttachmentUpload: z.custom<UpdateAttachmentUpload>(),
  updateAttachmentPreview: z.custom<UpdateAttachmentPreview>(),
  getAttachments: z.custom<GetAttachments>(),
  hasAttachments: z.custom<HasAttachments>(),
});

export const AttachmentsSliceSchema = z.intersection(AttachmentsStateSchema, AttachmentsActionsSchema);

// ============================================================================
// SIDEBAR ANIMATION SLICE SCHEMAS (AI title typewriter effect)
// ============================================================================

export const TitleAnimationPhaseSchema = z.enum(['idle', 'deleting', 'typing', 'complete']);
export type TitleAnimationPhase = z.infer<typeof TitleAnimationPhaseSchema>;

export const SidebarAnimationStateSchema = z.object({
  animatingThreadId: z.string().nullable(),
  animationPhase: TitleAnimationPhaseSchema,
  oldTitle: z.string().nullable(),
  newTitle: z.string().nullable(),
  displayedTitle: z.string().nullable(),
});

export const SidebarAnimationActionsSchema = z.object({
  startTitleAnimation: z.custom<StartTitleAnimation>(),
  updateDisplayedTitle: z.custom<UpdateDisplayedTitle>(),
  setAnimationPhase: z.custom<SetAnimationPhase>(),
  completeTitleAnimation: z.custom<CompleteTitleAnimation>(),
});

export const SidebarAnimationSliceSchema = z.intersection(SidebarAnimationStateSchema, SidebarAnimationActionsSchema);

// ============================================================================
// NAVIGATION SLICE SCHEMAS
// ============================================================================

export const NavigationStateSchema = z.object({
  /** Target slug for pending navigation - set when navigating between threads */
  pendingNavigationTargetSlug: z.string().nullable(),
});

export const NavigationActionsSchema = z.object({
  /** Set pending navigation target when navigating between threads */
  setPendingNavigationTarget: z.custom<(slug: string | null) => void>(),
  /** Clear pending navigation target */
  clearPendingNavigationTarget: z.custom<() => void>(),
  /** ✅ ATOMIC SWITCH: Atomically reset + initialize when navigation completes */
  atomicThreadSwitch: z.custom<(
    newThread: ChatThread,
    newParticipants: ChatParticipant[],
    newMessages: UIMessage[],
  ) => void>(),
});

export const NavigationSliceSchema = z.intersection(NavigationStateSchema, NavigationActionsSchema);

// ============================================================================
// OPERATIONS SLICE SCHEMAS
// ============================================================================

export const OperationsActionsSchema = z.object({
  resetThreadState: z.custom<ResetThreadState>(),
  resetForThreadNavigation: z.custom<ResetForThreadNavigation>(),
  resetToOverview: z.custom<ResetToOverview>(),
  resetToNewChat: z.custom<ResetToNewChat>(),
  initializeThread: z.custom<InitializeThread>(),
  updateParticipants: z.custom<UpdateParticipants>(),
  prepareForNewMessage: z.custom<PrepareForNewMessage>(),
  completeStreaming: z.custom<CompleteStreaming>(),
  startRegeneration: z.custom<StartRegeneration>(),
  completeRegeneration: z.custom<CompleteRegeneration>(),
});

// ============================================================================
// COMPLETE STORE SCHEMA
// ============================================================================

export const ChatStoreSchema = z.intersection(
  z.intersection(
    z.intersection(
      z.intersection(
        z.intersection(
          z.intersection(
            z.intersection(
              z.intersection(
                z.intersection(
                  z.intersection(
                    z.intersection(
                      z.intersection(
                        z.intersection(
                          z.intersection(
                            z.intersection(
                              z.intersection(
                                z.intersection(
                                  FormSliceSchema,
                                  FeedbackSliceSchema,
                                ),
                                UISliceSchema,
                              ),
                              PreSearchSliceSchema,
                            ),
                            ChangelogSliceSchema,
                          ),
                          ThreadSliceSchema,
                        ),
                        FlagsSliceSchema,
                      ),
                      DataSliceSchema,
                    ),
                    TrackingSliceSchema,
                  ),
                  CallbacksSliceSchema,
                ),
                ScreenSliceSchema,
              ),
              StreamResumptionSliceSchema,
            ),
            RoundFlowSliceSchema,
          ),
          AnimationSliceSchema,
        ),
        AttachmentsSliceSchema,
      ),
      SidebarAnimationSliceSchema,
    ),
    NavigationSliceSchema,
  ),
  OperationsActionsSchema,
);

// ============================================================================
// STORE TYPE INFERENCE
// ============================================================================

export type ChatStore = z.infer<typeof ChatStoreSchema>;

// Slice types inferred from schemas above
export type FormState = z.infer<typeof FormStateSchema>;
export type FormActions = z.infer<typeof FormActionsSchema>;
export type FormSlice = z.infer<typeof FormSliceSchema>;

export type FeedbackState = z.infer<typeof FeedbackStateSchema>;
export type FeedbackActions = z.infer<typeof FeedbackActionsSchema>;
export type FeedbackSlice = z.infer<typeof FeedbackSliceSchema>;

export type UIState = z.infer<typeof UIStateSchema>;
export type UIActions = z.infer<typeof UIActionsSchema>;
export type UISlice = z.infer<typeof UISliceSchema>;

export type PreSearchState = z.infer<typeof PreSearchStateSchema>;
export type PreSearchActions = z.infer<typeof PreSearchActionsSchema>;
export type PreSearchSlice = z.infer<typeof PreSearchSliceSchema>;

export type ChangelogState = z.infer<typeof ChangelogStateSchema>;
export type ChangelogActions = z.infer<typeof ChangelogActionsSchema>;
export type ChangelogSlice = z.infer<typeof ChangelogSliceSchema>;

export type ThreadState = z.infer<typeof ThreadStateSchema>;
export type ThreadActions = z.infer<typeof ThreadActionsSchema>;
export type ThreadSlice = z.infer<typeof ThreadSliceSchema>;

export type FlagsState = z.infer<typeof FlagsStateSchema>;
export type FlagsActions = z.infer<typeof FlagsActionsSchema>;
export type FlagsSlice = z.infer<typeof FlagsSliceSchema>;

export type DataState = z.infer<typeof DataStateSchema>;
export type DataActions = z.infer<typeof DataActionsSchema>;
export type DataSlice = z.infer<typeof DataSliceSchema>;

export type TrackingState = z.infer<typeof TrackingStateSchema>;
export type TrackingActions = z.infer<typeof TrackingActionsSchema>;
export type TrackingSlice = z.infer<typeof TrackingSliceSchema>;

export type CallbacksState = z.infer<typeof CallbacksStateSchema>;
export type CallbacksActions = z.infer<typeof CallbacksActionsSchema>;
export type CallbacksSlice = z.infer<typeof CallbacksSliceSchema>;

export type ScreenState = z.infer<typeof ScreenStateSchema>;
export type ScreenActions = z.infer<typeof ScreenActionsSchema>;
export type ScreenSlice = z.infer<typeof ScreenSliceSchema>;

export type OperationsActions = z.infer<typeof OperationsActionsSchema>;

export type StreamResumptionSliceState = z.infer<typeof StreamResumptionSliceStateSchema>;
export type StreamResumptionActions = z.infer<typeof StreamResumptionActionsSchema>;
export type StreamResumptionSlice = z.infer<typeof StreamResumptionSliceSchema>;

export type RoundFlowState = z.infer<typeof RoundFlowStateSliceSchema>;
export type RoundFlowActions = z.infer<typeof RoundFlowActionsSchema>;
export type RoundFlowSlice = z.infer<typeof RoundFlowSliceSchema>;

export type AnimationState = z.infer<typeof AnimationStateSchema>;
export type AnimationActions = z.infer<typeof AnimationActionsSchema>;
export type AnimationSlice = z.infer<typeof AnimationSliceSchema>;

export type AttachmentsState = z.infer<typeof AttachmentsStateSchema>;
export type AttachmentsActions = z.infer<typeof AttachmentsActionsSchema>;
export type AttachmentsSlice = z.infer<typeof AttachmentsSliceSchema>;

export type SidebarAnimationState = z.infer<typeof SidebarAnimationStateSchema>;
export type SidebarAnimationActions = z.infer<typeof SidebarAnimationActionsSchema>;
export type SidebarAnimationSlice = z.infer<typeof SidebarAnimationSliceSchema>;

export type NavigationState = z.infer<typeof NavigationStateSchema>;
export type NavigationActions = z.infer<typeof NavigationActionsSchema>;
export type NavigationSlice = z.infer<typeof NavigationSliceSchema>;

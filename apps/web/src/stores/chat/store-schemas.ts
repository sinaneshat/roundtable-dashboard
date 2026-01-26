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

// Import from dedicated schema file to avoid circular dependency
// attachment-schemas.ts has no store imports, breaking the cycle
import { PendingAttachmentSchema } from '@/hooks/utils/attachment-schemas';
import { ExtendedFilePartSchema } from '@/lib/schemas/message-schemas';
import { ChatParticipantSchema, ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';
import type { ApiChangelog, ChatParticipant, ChatThread, StoredPreSearch } from '@/services/api';
import { ModeratorPayloadSchema } from '@/services/api';
import type { EventPayload } from '@/stores/chat/machine/transitions';

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
  animatedMessageIds: z.set(z.string()),
  animationStartIndex: z.number(),
  autoMode: z.boolean(),
  enableWebSearch: z.boolean(),
  inputValue: z.string(),
  modelOrder: z.array(z.string()),
  selectedMode: ChatModeSchema.nullable(),
  selectedParticipants: z.array(ParticipantConfigSchema),
  shouldSkipAnimation: z.boolean(),
});

export const FormActionsSchema = z.object({
  addParticipant: z.custom<AddParticipant>(),
  removeParticipant: z.custom<RemoveParticipant>(),
  reorderParticipants: z.custom<ReorderParticipants>(),
  resetForm: z.custom<ResetForm>(),
  setAutoMode: z.custom<SetAutoMode>(),
  setEnableWebSearch: z.custom<SetEnableWebSearch>(),
  setInputValue: z.custom<SetInputValue>(),
  setModelOrder: z.custom<SetModelOrder>(),
  setSelectedMode: z.custom<SetSelectedMode>(),
  setSelectedParticipants: z.custom<SetSelectedParticipants>(),
  updateParticipant: z.custom<UpdateParticipant>(),
});

export const FormSliceSchema = z.intersection(FormStateSchema, FormActionsSchema);

// ============================================================================
// FEEDBACK SLICE SCHEMAS
// ============================================================================

export const FeedbackStateSchema = z.object({
  feedbackByRound: z.custom<Map<number, FeedbackType | null>>(),
  hasLoadedFeedback: z.boolean(),
  pendingFeedback: z.object({
    roundNumber: z.number(),
    type: FeedbackTypeSchema,
  }).nullable(),
});

export const FeedbackActionsSchema = z.object({
  loadFeedbackFromServer: z.custom<LoadFeedbackFromServer>(),
  setFeedback: z.custom<SetFeedback>(),
  setPendingFeedback: z.custom<SetPendingFeedback>(),
});

export const FeedbackSliceSchema = z.intersection(FeedbackStateSchema, FeedbackActionsSchema);

// ============================================================================
// UI SLICE SCHEMAS
// ============================================================================

export const UIStateSchema = z.object({
  createdThreadId: z.string().nullable(),
  /** Project ID for the created thread - used for project-specific cache updates */
  createdThreadProjectId: z.string().nullable(),
  isAnalyzingPrompt: z.boolean(),
  isCreatingThread: z.boolean(),
  showInitialUI: z.boolean(),
  waitingToStartStreaming: z.boolean(),
});

export const UIActionsSchema = z.object({
  resetUI: z.custom<ResetUI>(),
  setCreatedThreadId: z.custom<SetCreatedThreadId>(),
  setCreatedThreadProjectId: z.custom<SetCreatedThreadProjectId>(),
  setIsAnalyzingPrompt: z.custom<SetIsAnalyzingPrompt>(),
  setIsCreatingThread: z.custom<SetIsCreatingThread>(),
  setShowInitialUI: z.custom<SetShowInitialUI>(),
  setWaitingToStartStreaming: z.custom<SetWaitingToStartStreaming>(),
});

export const UISliceSchema = z.intersection(UIStateSchema, UIActionsSchema);

// ============================================================================
// PRE-SEARCH SLICE SCHEMAS
// ============================================================================

export const PreSearchStateSchema = z.object({
  preSearchActivityTimes: z.custom<Map<number, number>>(),
  preSearches: z.custom<StoredPreSearch[]>(),
});

export const PreSearchActionsSchema = z.object({
  addPreSearch: z.custom<AddPreSearch>(),
  checkStuckPreSearches: z.custom<CheckStuckPreSearches>(),
  clearAllPreSearches: z.custom<ClearAllPreSearches>(),
  clearPreSearchActivity: z.custom<ClearPreSearchActivity>(),
  getPreSearchActivityTime: z.custom<GetPreSearchActivityTime>(),
  removePreSearch: z.custom<RemovePreSearch>(),
  setPreSearches: z.custom<SetPreSearches>(),
  updatePartialPreSearchData: z.custom<UpdatePartialPreSearchData>(),
  updatePreSearchActivity: z.custom<UpdatePreSearchActivity>(),
  updatePreSearchData: z.custom<UpdatePreSearchData>(),
  updatePreSearchStatus: z.custom<UpdatePreSearchStatus>(),
});

export const PreSearchSliceSchema = z.intersection(PreSearchStateSchema, PreSearchActionsSchema);

// ============================================================================
// CHANGELOG SLICE SCHEMAS
// ============================================================================

export const ChangelogStateSchema = z.object({
  changelogItems: z.custom<ApiChangelog[]>(),
});

export const ChangelogActionsSchema = z.object({
  addChangelogItems: z.custom<(items: ApiChangelog[]) => void>(),
  setChangelogItems: z.custom<(items: ApiChangelog[]) => void>(),
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
  completedAt: z.string().nullable(),
  // Date fields use string (JSON serialization converts Date to string)
  createdAt: z.string(),
  errorMessage: z.string().nullable(),
  id: z.string(),
  mode: z.string().optional(),
  moderatorData: ModeratorPayloadSchema.nullable(),
  participantMessageIds: z.array(z.string()).optional(),
  roundNumber: z.number(),
  status: MessageStatusSchema,
  threadId: z.string().optional(),
  userQuestion: z.string().optional(),
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
  chatSetMessages: ChatSetMessagesFnSchema.optional(),
  // ✅ NAVIGATION CLEANUP: Stop function to abort in-flight streaming on route change
  chatStop: z.custom<(() => void) | undefined>().optional(),
  currentParticipantIndex: z.number(),
  error: z.custom<Error | null>(),
  isStreaming: z.boolean(),
  messages: z.array(z.custom<UIMessage>()),
  participants: z.array(ChatParticipantSchema),
  sendMessage: z.custom<((content: string) => Promise<void>) | undefined>().optional(),
  startRound: z.custom<(() => Promise<void>) | undefined>().optional(),
  /**
   * ✅ RACE CONDITION FIX: Explicit completion signal
   * Set to true by AI SDK's onFinish callback AFTER message state is finalized.
   * Replaces the 50ms timeout workaround for stream settling.
   * Reset to false when new streaming starts.
   */
  streamFinishAcknowledged: z.boolean(),
  thread: z.custom<ChatThread | null>(),
});

export const ThreadActionsSchema = z.object({
  /**
   * ✅ RACE CONDITION FIX: Acknowledge stream finish from onFinish callback
   * Called by AI SDK onFinish to signal that message state is finalized.
   * Replaces timeout-based stream settling detection.
   */
  acknowledgeStreamFinish: z.custom<() => void>(),
  checkStuckStreams: z.custom<CheckStuckStreams>(),
  deduplicateMessages: z.custom<DeduplicateMessages>(),
  finalizeMessageId: z.custom<FinalizeMessageId>(),
  /**
   * ✅ RACE CONDITION FIX: Reset stream finish acknowledgment when starting new stream
   */
  resetStreamFinishAcknowledgment: z.custom<() => void>(),
  setChatSetMessages: z.custom<SetChatSetMessages>(),
  // ✅ NAVIGATION CLEANUP: Action to set the AI SDK stop function
  setChatStop: z.custom<(fn?: () => void) => void>(),
  setCurrentParticipantIndex: z.custom<SetCurrentParticipantIndex>(),
  setError: z.custom<SetError>(),
  setIsStreaming: z.custom<SetIsStreaming>(),
  setMessages: z.custom<SetMessages>(),
  setParticipants: z.custom<SetParticipants>(),
  setSendMessage: z.custom<SetSendMessage>(),
  setStartRound: z.custom<SetStartRound>(),
  setThread: z.custom<SetThread>(),
  // Streaming message actions (direct store updates for AI SDK callbacks)
  upsertStreamingMessage: z.custom<UpsertStreamingMessage>(),
});

export const ThreadSliceSchema = z.intersection(ThreadStateSchema, ThreadActionsSchema);

// ============================================================================
// FLAGS SLICE SCHEMAS
// ============================================================================

export const FlagsStateSchema = z.object({
  hasInitiallyLoaded: z.boolean(),
  hasPendingConfigChanges: z.boolean(),
  isModeratorStreaming: z.boolean(),
  /** ✅ PATCH BLOCKING: True while thread PATCH is in progress - prevents streaming race */
  isPatchInProgress: z.boolean(),
  isRegenerating: z.boolean(),
  isWaitingForChangelog: z.boolean(),
  /** ✅ HANDOFF FIX: True during P0→P1 participant transition to prevent 10s cleanup */
  participantHandoffInProgress: z.boolean(),
});

/**
 * ✅ RACE CONDITION FIX: Atomic config change state update
 * Groups all config-related flags that must be updated together
 */
export const ConfigChangeStateSchema = z.object({
  configChangeRoundNumber: z.number().nullable(),
  hasPendingConfigChanges: z.boolean(),
  isPatchInProgress: z.boolean(),
  isWaitingForChangelog: z.boolean(),
});

export type ConfigChangeState = z.infer<typeof ConfigChangeStateSchema>;

export const FlagsActionsSchema = z.object({
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
  completeModeratorStream: z.custom<CompleteModeratorStream>(),
  setHasInitiallyLoaded: z.custom<SetHasInitiallyLoaded>(),
  setHasPendingConfigChanges: z.custom<SetHasPendingConfigChanges>(),
  setIsModeratorStreaming: z.custom<SetIsModeratorStreaming>(),
  setIsPatchInProgress: z.custom<SetIsPatchInProgress>(),
  setIsRegenerating: z.custom<SetIsRegenerating>(),
  setIsWaitingForChangelog: z.custom<SetIsWaitingForChangelog>(),
  setParticipantHandoffInProgress: z.custom<SetParticipantHandoffInProgress>(),
});

export const FlagsSliceSchema = z.intersection(FlagsStateSchema, FlagsActionsSchema);

// ============================================================================
// DATA SLICE SCHEMAS
// ============================================================================

export const DataStateSchema = z.object({
  /** Round number when config changes were submitted (for incremental changelog fetch) */
  configChangeRoundNumber: z.number().nullable(),
  currentRoundNumber: z.number().nullable(),
  expectedParticipantIds: z.array(z.string()).nullable(),
  pendingAttachmentIds: z.array(z.string()).nullable(),
  pendingFileParts: z.array(ExtendedFilePartSchema).nullable(),
  pendingMessage: z.string().nullable(),
  regeneratingRoundNumber: z.number().nullable(),
  /**
   * ✅ RACE CONDITION FIX: Round epoch counter
   * Increments each time a new round starts (user submits message).
   * Effects can compare their captured epoch with current to detect stale operations.
   * This prevents race conditions like:
   * - r1 resume logic executing after user submitted r2
   * - Stale effects triggering wrong participants
   */
  roundEpoch: z.number(),
  streamingRoundNumber: z.number().nullable(),
});

export const DataActionsSchema = z.object({
  batchUpdatePendingState: z.custom<(pendingMessage: string | null, expectedParticipantIds: string[] | null) => void>(),
  /** Get current round epoch for stale detection */
  getRoundEpoch: z.custom<() => number>(),
  setConfigChangeRoundNumber: z.custom<SetConfigChangeRoundNumber>(),
  setCurrentRoundNumber: z.custom<SetCurrentRoundNumber>(),
  setExpectedParticipantIds: z.custom<SetExpectedParticipantIds>(),
  setPendingAttachmentIds: z.custom<SetPendingAttachmentIds>(),
  setPendingFileParts: z.custom<SetPendingFileParts>(),
  setPendingMessage: z.custom<SetPendingMessage>(),
  setRegeneratingRoundNumber: z.custom<SetRegeneratingRoundNumber>(),
  setStreamingRoundNumber: z.custom<SetStreamingRoundNumber>(),
  /**
   * ✅ RACE CONDITION FIX: Atomically start a new round
   * - Increments roundEpoch
   * - Sets streamingRoundNumber
   * - Returns the new epoch for callers to track
   * This ensures all related state updates happen in one set() call
   */
  startNewRound: z.custom<(roundNumber: number) => number>(),
});

export const DataSliceSchema = z.intersection(DataStateSchema, DataActionsSchema);

// ============================================================================
// TRACKING SLICE SCHEMAS
// ============================================================================

export const TrackingStateSchema = z.object({
  createdModeratorRounds: z.custom<Set<number>>(),
  hasEarlyOptimisticMessage: z.boolean(),
  hasSentPendingMessage: z.boolean(),
  triggeredModeratorIds: z.custom<Set<string>>(),
  triggeredModeratorRounds: z.custom<Set<number>>(),
  triggeredPreSearchRounds: z.custom<Set<number>>(),
});

export const TrackingActionsSchema = z.object({
  clearAllPreSearchTracking: z.custom<ClearAllPreSearchTracking>(),
  clearModeratorStreamTracking: z.custom<ClearModeratorStreamTracking>(),
  clearModeratorTracking: z.custom<ClearModeratorTracking>(),
  clearPreSearchTracking: z.custom<ClearPreSearchTracking>(),
  hasModeratorBeenCreated: z.custom<HasModeratorBeenCreated>(),
  hasModeratorStreamBeenTriggered: z.custom<HasModeratorStreamBeenTriggered>(),
  hasPreSearchBeenTriggered: z.custom<HasPreSearchBeenTriggered>(),
  markModeratorCreated: z.custom<MarkModeratorCreated>(),
  markModeratorStreamTriggered: z.custom<MarkModeratorStreamTriggered>(),
  markPreSearchTriggered: z.custom<MarkPreSearchTriggered>(),
  setHasEarlyOptimisticMessage: z.custom<SetHasEarlyOptimisticMessage>(),
  setHasSentPendingMessage: z.custom<SetHasSentPendingMessage>(),
  tryMarkModeratorCreated: z.custom<TryMarkModeratorCreated>(),
  tryMarkPreSearchTriggered: z.custom<TryMarkPreSearchTriggered>(),
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
  isReadOnly: z.boolean(),
  screenMode: ScreenModeSchema.nullable(),
});

export const ScreenActionsSchema = z.object({
  resetScreenMode: z.custom<ResetScreenMode>(),
  setScreenMode: z.custom<SetScreenMode>(),
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
  // Date fields use string (JSON serialization converts Date to string)
  createdAt: z.string(),
  participantIndex: z.number().int().nonnegative(),
  roundNumber: z.number().int().nonnegative(),
  state: StreamStatusSchema,
  streamId: z.string().min(1),
  threadId: z.string().min(1),
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
  preSearchId: z.string().nullable(),
  status: MessageStatusSchema.nullable(),
  streamId: z.string().nullable(),
});

export type PreSearchResumptionState = z.infer<typeof PreSearchResumptionStateSchema>;

/**
 * Moderator resumption state for phase-based tracking
 * Uses MessageStatusSchema for consistency with message lifecycle
 */
export const ModeratorResumptionStateSchema = z.object({
  moderatorMessageId: z.string().nullable(),
  status: MessageStatusSchema.nullable(),
  streamId: z.string().nullable(),
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
  currentResumptionPhase: RoundPhaseSchema.nullable(),
  moderatorResumption: ModeratorResumptionStateSchema.nullable(),
  nextParticipantToTrigger: NextParticipantToTriggerSchema.nullable(),
  prefilledForThreadId: z.string().nullable(),
  preSearchResumption: PreSearchResumptionStateSchema.nullable(),
  resumptionAttempts: z.custom<Set<string>>(),
  resumptionRoundNumber: z.number().nullable(),
  /** ✅ SCOPE VERSIONING: Thread ID for current resumption scope */
  resumptionScopeThreadId: z.string().nullable(),
  /** ✅ SCOPE VERSIONING: Version counter - increments on each navigation to invalidate stale effects */
  resumptionScopeVersion: z.number(),
  streamResumptionPrefilled: z.boolean(),
  streamResumptionState: StreamResumptionStateEntitySchema.nullable(),
});

/**
 * Schema for stream resumption prefill update - Zod-first pattern
 */
export const StreamResumptionPrefillUpdateSchema = z.object({
  currentResumptionPhase: RoundPhaseSchema,
  isModeratorStreaming: z.boolean().optional(),
  moderatorResumption: ModeratorResumptionStateSchema.nullable().optional(),
  nextParticipantToTrigger: NextParticipantToTriggerSchema.nullable().optional(),
  prefilledForThreadId: z.string(),
  preSearchResumption: PreSearchResumptionStateSchema.nullable().optional(),
  resumptionRoundNumber: z.number().nullable(),
  streamResumptionPrefilled: z.boolean(),
  waitingToStartStreaming: z.boolean().optional(),
});

export type StreamResumptionPrefillUpdate = z.infer<typeof StreamResumptionPrefillUpdateSchema>;

export const StreamResumptionActionsSchema = z.object({
  clearStreamResumption: z.custom<ClearStreamResumption>(),
  handleResumedStreamComplete: z.custom<HandleResumedStreamComplete>(),
  handleStreamResumptionFailure: z.custom<HandleStreamResumptionFailure>(),
  isStreamResumptionStale: z.custom<IsStreamResumptionStale>(),
  isStreamResumptionValid: z.custom<IsStreamResumptionValid>(),
  markResumptionAttempted: z.custom<MarkResumptionAttempted>(),
  needsMessageSync: z.custom<NeedsMessageSync>(),
  needsStreamResumption: z.custom<NeedsStreamResumption>(),
  prefillStreamResumptionState: z.custom<PrefillStreamResumptionState>(),
  /** ✅ SMART STALE DETECTION: Reconcile prefilled state with actual active stream */
  reconcileWithActiveStream: z.custom<ReconcileWithActiveStream>(),
  setCurrentResumptionPhase: z.custom<(phase: RoundPhase) => void>(),
  setNextParticipantToTrigger: z.custom<SetNextParticipantToTrigger>(),
  /** ✅ SCOPE VERSIONING: Set thread scope for resumption validation */
  setResumptionScope: z.custom<SetResumptionScope>(),
  setStreamResumptionState: z.custom<(state: StreamResumptionState | null) => void>(),
  transitionToModeratorPhase: z.custom<(roundNumber?: number) => void>(),
  transitionToParticipantsPhase: z.custom<() => void>(),
});

export const StreamResumptionSliceSchema = z.intersection(StreamResumptionSliceStateSchema, StreamResumptionActionsSchema);

// ============================================================================
// FSM CONTEXT SCHEMAS (for transition decisions)
// ============================================================================

/**
 * Participant info for FSM decisions - Zod schema
 * ✅ PATTERN: Schema-first → Infer types
 */
export const ParticipantInfoSchema = z.object({
  enabled: z.boolean(),
  hasMessage: z.boolean(),
  id: z.string(),
  index: z.number().int().nonnegative(),
});

export type ParticipantInfo = z.infer<typeof ParticipantInfoSchema>;

/**
 * Pre-search state for FSM decisions - Zod schema
 */
export const PreSearchInfoSchema = z.object({
  exists: z.boolean(),
  status: z.enum(['pending', 'streaming', 'complete', 'failed']).nullable(),
  streamId: z.string().nullable(),
});

export type PreSearchInfo = z.infer<typeof PreSearchInfoSchema>;

/**
 * Moderator state for FSM decisions - Zod schema
 */
export const ModeratorInfoSchema = z.object({
  hasMessage: z.boolean(),
  streamId: z.string().nullable(),
});

export type ModeratorInfo = z.infer<typeof ModeratorInfoSchema>;

/**
 * Resumption state from server prefill - Zod schema
 */
export const ResumptionInfoSchema = z.object({
  isPrefilled: z.boolean(),
  moderatorStreamId: z.string().nullable(),
  participantIndex: z.number().int().nonnegative().nullable(),
  phase: RoundPhaseSchema.nullable(),
  preSearchStreamId: z.string().nullable(),
  roundNumber: z.number().int().nonnegative().nullable(),
});

export type ResumptionInfo = z.infer<typeof ResumptionInfoSchema>;

/**
 * Immutable context for FSM transition decisions - Zod schema
 * Context is built from store state at dispatch time.
 */
export const RoundContextSchema = z.object({
  // Completion tracking
  allParticipantsComplete: z.boolean(),
  completedParticipantCount: z.number().int().nonnegative(),

  createdThreadId: z.string().nullable(),
  currentParticipantIndex: z.number().int().nonnegative(),

  enabledParticipantCount: z.number().int().nonnegative(),
  isAiSdkReady: z.boolean(),

  // AI SDK state
  isAiSdkStreaming: z.boolean(),
  // Error state
  lastError: z.custom<Error | null>(),
  // Moderator
  moderator: ModeratorInfoSchema,
  participantCount: z.number().int().nonnegative(),

  // Participants
  participants: z.array(ParticipantInfoSchema),
  preSearch: PreSearchInfoSchema,

  // Resumption (from server prefill)
  resumption: ResumptionInfoSchema,

  // Round tracking
  roundNumber: z.number().int().nonnegative().nullable(),

  streamingRoundNumber: z.number().int().nonnegative().nullable(),

  // Thread identity
  threadId: z.string().nullable(),
  // Web search
  webSearchEnabled: z.boolean(),
});

export type RoundContext = z.infer<typeof RoundContextSchema>;

/**
 * Store slice interfaces for context building - Zod schema
 * These match the Zustand store structure
 */
export const StoreSnapshotSchema = z.object({
  createdThreadId: z.string().nullable(),
  currentParticipantIndex: z.number(),

  currentResumptionPhase: RoundPhaseSchema.nullable(),
  // Round state
  currentRoundNumber: z.number().nullable(),

  // Form state
  enableWebSearch: z.boolean(),

  // Error
  error: z.custom<Error | null>(),
  // Messages (for completion detection)
  messages: z.array(z.object({
    id: z.string(),
    metadata: z.object({
      isModerator: z.boolean().optional(),
      participantIndex: z.number().optional(),
      roundNumber: z.number().optional(),
    }).optional(),
    role: z.string(),
  })),

  moderatorResumption: z.object({ streamId: z.string() }).nullable(),

  nextParticipantToTrigger: z.tuple([z.number(), z.number()]).nullable(),

  // Participants
  participants: z.array(z.object({
    enabled: z.boolean().optional(),
    id: z.string(),
    participantIndex: z.number(),
  })),
  // Pre-search state
  preSearches: z.array(z.object({
    id: z.string().optional(),
    roundNumber: z.number(),
    status: z.string(),
  })),
  preSearchResumption: z.object({ streamId: z.string() }).nullable(),
  resumptionRoundNumber: z.number().nullable(),
  streamingRoundNumber: z.number().nullable(),
  // Stream resumption state
  streamResumptionPrefilled: z.boolean(),

  // Thread state
  thread: z.object({ id: z.string() }).nullable(),
});

export type StoreSnapshot = z.infer<typeof StoreSnapshotSchema>;

/**
 * AI SDK state snapshot - Zod schema
 */
export const AiSdkSnapshotSchema = z.object({
  isReady: z.boolean(),
  isStreaming: z.boolean(),
});

export type AiSdkSnapshot = z.infer<typeof AiSdkSnapshotSchema>;

// ============================================================================
// ROUND FLOW SLICE SCHEMAS (FSM-based orchestration)
// ============================================================================

/**
 * Round Flow State - FSM state for round orchestration
 * Replaces multiple boolean flags with explicit state machine states
 */
export const RoundFlowStateSliceSchema = z.object({
  /** Event history for debugging (dev mode only) */
  flowEventHistory: z.array(z.object({
    event: RoundFlowEventSchema,
    fromState: RoundFlowStateSchema,
    timestamp: z.number(),
    toState: RoundFlowStateSchema,
  })),
  /** Last error that occurred during round flow */
  flowLastError: z.custom<Error | null>(),
  /** Total enabled participants for current round */
  flowParticipantCount: z.number(),
  /** Participant index within current round */
  flowParticipantIndex: z.number(),
  /** Round number being orchestrated */
  flowRoundNumber: z.number().nullable(),
  /** Current FSM state - THE source of truth for round lifecycle */
  flowState: RoundFlowStateSchema,
});

/** Type for FSM dispatch function - uses EventPayload discriminated union */
export type DispatchFlowEvent = (event: RoundFlowEvent, payload?: EventPayload) => void;

/** Type for FSM state setter - uses the FSM state enum type from shared */
export type SetFlowState = (state: z.infer<typeof RoundFlowStateSchema>) => void;

/** Type for resetting flow state */
export type ResetFlowState = () => void;

export const RoundFlowActionsSchema = z.object({
  /** Dispatch an FSM event - triggers state transition */
  dispatchFlowEvent: z.custom<DispatchFlowEvent>(),
  /** Reset flow state to IDLE */
  resetFlowState: z.custom<ResetFlowState>(),
  /** Record flow error */
  setFlowError: z.custom<(error: Error | null) => void>(),
  /** Set participant count for current round */
  setFlowParticipantCount: z.custom<(count: number) => void>(),
  /** Set participant index for current round */
  setFlowParticipantIndex: z.custom<(index: number) => void>(),
  /** Set round number for flow tracking */
  setFlowRoundNumber: z.custom<(roundNumber: number | null) => void>(),
  /** Directly set FSM state (for internal use) */
  setFlowState: z.custom<SetFlowState>(),
});

export const RoundFlowSliceSchema = z.intersection(RoundFlowStateSliceSchema, RoundFlowActionsSchema);

// ============================================================================
// ANIMATION SLICE SCHEMAS
// ============================================================================

export const AnimationStateSchema = z.object({
  animationResolvers: z.custom<Map<number, AnimationResolver>>(),
  pendingAnimations: z.custom<Set<number>>(),
});

export const AnimationActionsSchema = z.object({
  clearAnimations: z.custom<ClearAnimations>(),
  completeAnimation: z.custom<CompleteAnimation>(),
  registerAnimation: z.custom<RegisterAnimation>(),
  waitForAllAnimations: z.custom<() => Promise<void>>(),
  waitForAnimation: z.custom<WaitForAnimation>(),
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
  clearAttachments: z.custom<ClearAttachments>(),
  getAttachments: z.custom<GetAttachments>(),
  hasAttachments: z.custom<HasAttachments>(),
  removeAttachment: z.custom<RemoveAttachment>(),
  updateAttachmentPreview: z.custom<UpdateAttachmentPreview>(),
  updateAttachmentUpload: z.custom<UpdateAttachmentUpload>(),
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
  displayedTitle: z.string().nullable(),
  newTitle: z.string().nullable(),
  oldTitle: z.string().nullable(),
});

export const SidebarAnimationActionsSchema = z.object({
  completeTitleAnimation: z.custom<CompleteTitleAnimation>(),
  setAnimationPhase: z.custom<SetAnimationPhase>(),
  startTitleAnimation: z.custom<StartTitleAnimation>(),
  updateDisplayedTitle: z.custom<UpdateDisplayedTitle>(),
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
  /** ✅ ATOMIC SWITCH: Atomically reset + initialize when navigation completes */
  atomicThreadSwitch: z.custom<(
    newThread: ChatThread,
    newParticipants: ChatParticipant[],
    newMessages: UIMessage[],
  ) => void>(),
  /** Clear pending navigation target */
  clearPendingNavigationTarget: z.custom<() => void>(),
  /** Set pending navigation target when navigating between threads */
  setPendingNavigationTarget: z.custom<(slug: string | null) => void>(),
});

export const NavigationSliceSchema = z.intersection(NavigationStateSchema, NavigationActionsSchema);

// ============================================================================
// OPERATIONS SLICE SCHEMAS
// ============================================================================

export const OperationsActionsSchema = z.object({
  completeRegeneration: z.custom<CompleteRegeneration>(),
  completeStreaming: z.custom<CompleteStreaming>(),
  initializeThread: z.custom<InitializeThread>(),
  prepareForNewMessage: z.custom<PrepareForNewMessage>(),
  resetForThreadNavigation: z.custom<ResetForThreadNavigation>(),
  resetThreadState: z.custom<ResetThreadState>(),
  resetToNewChat: z.custom<ResetToNewChat>(),
  resetToOverview: z.custom<ResetToOverview>(),
  startRegeneration: z.custom<StartRegeneration>(),
  updateParticipants: z.custom<UpdateParticipants>(),
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

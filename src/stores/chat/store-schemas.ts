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

import type { UIMessage } from 'ai';
import { z } from 'zod';

import type { FeedbackType } from '@/api/core/enums';
import {
  ChatModeSchema,
  FeedbackTypeSchema,
  MessageStatusSchema,
  RoundPhaseSchema,
  ScreenModeSchema,
  StreamStatusSchema,
} from '@/api/core/enums';
import {
  ChatThreadSchema,
  StoredPreSearchSchema,
} from '@/api/routes/chat/schema';
import { PendingAttachmentSchema } from '@/hooks/utils';
// ✅ Use ExtendedFilePartSchema to include uploadId for backend fallback loading
import { ExtendedFilePartSchema } from '@/lib/schemas/message-schemas';
import { ChatParticipantSchema, ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';

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
  SetChatSetMessages,
  SetConfigChangeRoundNumber,
  SetCreatedThreadId,
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
  SetIsCreatingThread,
  SetIsModeratorStreaming,
  SetIsRegenerating,
  SetIsStreaming,
  SetIsWaitingForChangelog,
  SetMessages,
  SetModelOrder,
  SetNextParticipantToTrigger,
  SetOnComplete,
  SetParticipants,
  SetPendingAttachmentIds,
  SetPendingFeedback,
  SetPendingMessage,
  SetPreSearches,
  SetRegeneratingRoundNumber,
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
  TryMarkModeratorCreated,
  TryMarkPreSearchTriggered,
  UpdateAttachmentPreview,
  UpdateAttachmentUpload,
  UpdatePartialPreSearchData,
  UpdateParticipant,
  UpdateParticipants,
  UpdatePreSearchActivity,
  UpdatePreSearchData,
  UpdatePreSearchStatus,
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
});

export const FormActionsSchema = z.object({
  setInputValue: z.custom<SetInputValue>(),
  setSelectedMode: z.custom<SetSelectedMode>(),
  setSelectedParticipants: z.custom<SetSelectedParticipants>(),
  setEnableWebSearch: z.custom<SetEnableWebSearch>(),
  setModelOrder: z.custom<SetModelOrder>(),
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
});

export const UIActionsSchema = z.object({
  setShowInitialUI: z.custom<SetShowInitialUI>(),
  setWaitingToStartStreaming: z.custom<SetWaitingToStartStreaming>(),
  setIsCreatingThread: z.custom<SetIsCreatingThread>(),
  setCreatedThreadId: z.custom<SetCreatedThreadId>(),
  resetUI: z.custom<ResetUI>(),
});

export const UISliceSchema = z.intersection(UIStateSchema, UIActionsSchema);

// ============================================================================
// PRE-SEARCH SLICE SCHEMAS
// ============================================================================

export const PreSearchStateSchema = z.object({
  preSearches: z.array(StoredPreSearchSchema),
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
// THREAD SLICE SCHEMAS
// ============================================================================

export const ThreadStateSchema = z.object({
  thread: ChatThreadSchema.nullable(),
  participants: z.array(ChatParticipantSchema),
  messages: z.array(z.custom<UIMessage>()),
  isStreaming: z.boolean(),
  currentParticipantIndex: z.number(),
  error: z.custom<Error | null>(),
  sendMessage: z.custom<((content: string) => Promise<void>) | undefined>().optional(),
  startRound: z.custom<(() => Promise<void>) | undefined>().optional(),
  chatSetMessages: ChatSetMessagesFnSchema.optional(),
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
  checkStuckStreams: z.custom<CheckStuckStreams>(),
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
});

export const FlagsActionsSchema = z.object({
  setHasInitiallyLoaded: z.custom<SetHasInitiallyLoaded>(),
  setIsRegenerating: z.custom<SetIsRegenerating>(),
  setIsModeratorStreaming: z.custom<SetIsModeratorStreaming>(),
  completeModeratorStream: z.custom<CompleteModeratorStream>(),
  setIsWaitingForChangelog: z.custom<SetIsWaitingForChangelog>(),
  setHasPendingConfigChanges: z.custom<SetHasPendingConfigChanges>(),
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
});

export const DataActionsSchema = z.object({
  setRegeneratingRoundNumber: z.custom<SetRegeneratingRoundNumber>(),
  setPendingMessage: z.custom<SetPendingMessage>(),
  setPendingAttachmentIds: z.custom<SetPendingAttachmentIds>(),
  setExpectedParticipantIds: z.custom<SetExpectedParticipantIds>(),
  setStreamingRoundNumber: z.custom<SetStreamingRoundNumber>(),
  setCurrentRoundNumber: z.custom<SetCurrentRoundNumber>(),
  setConfigChangeRoundNumber: z.custom<SetConfigChangeRoundNumber>(),
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
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]).optional(),
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

export const StreamResumptionSliceStateSchema = z.object({
  streamResumptionState: StreamResumptionStateEntitySchema.nullable(),
  resumptionAttempts: z.custom<Set<string>>(),
  nextParticipantToTrigger: z.number().nullable(),
  streamResumptionPrefilled: z.boolean(),
  prefilledForThreadId: z.string().nullable(),
  currentResumptionPhase: RoundPhaseSchema.nullable(),
  preSearchResumption: PreSearchResumptionStateSchema.nullable(),
  moderatorResumption: ModeratorResumptionStateSchema.nullable(),
  resumptionRoundNumber: z.number().nullable(),
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
  nextParticipantToTrigger: z.number().nullable().optional(),
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
});

export const StreamResumptionSliceSchema = z.intersection(StreamResumptionSliceStateSchema, StreamResumptionActionsSchema);

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
                          FormSliceSchema,
                          FeedbackSliceSchema,
                        ),
                        UISliceSchema,
                      ),
                      PreSearchSliceSchema,
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
      AnimationSliceSchema,
    ),
    AttachmentsSliceSchema,
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

export type AnimationState = z.infer<typeof AnimationStateSchema>;
export type AnimationActions = z.infer<typeof AnimationActionsSchema>;
export type AnimationSlice = z.infer<typeof AnimationSliceSchema>;

export type AttachmentsState = z.infer<typeof AttachmentsStateSchema>;
export type AttachmentsActions = z.infer<typeof AttachmentsActionsSchema>;
export type AttachmentsSlice = z.infer<typeof AttachmentsSliceSchema>;

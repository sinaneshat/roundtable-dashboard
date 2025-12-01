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
  ScreenModeSchema,
  StreamStatusSchema,
} from '@/api/core/enums';
import {
  ChatParticipantSchema,
  ChatThreadSchema,
  StoredModeratorAnalysisSchema,
  StoredPreSearchSchema,
} from '@/api/routes/chat/schema';
import { ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';

import type {
  AddAnalysis,
  AddParticipant,
  AddPreSearch,
  AnimationResolver,
  ApplyRecommendedAction,
  ChatSetMessages,
  CheckStuckPreSearches,
  CheckStuckStreams,
  ClearAllAnalyses,
  ClearAllPreSearches,
  ClearAnalysisTracking,
  ClearAnimations,
  ClearFeedback,
  ClearPreSearchActivity,
  ClearPreSearchTracking,
  ClearStreamResumption,
  CompleteAnimation,
  CompleteRegeneration,
  CompleteStreaming,
  CreatePendingAnalysis,
  GetNextParticipantToTrigger,
  GetPreSearchActivityTime,
  HandleResumedStreamComplete,
  HandleStreamResumptionFailure,
  HasAnalysisBeenCreated,
  HasPreSearchBeenTriggered,
  InitializeThread,
  IsStreamResumptionStale,
  IsStreamResumptionValid,
  LoadFeedbackFromServer,
  MarkAnalysisCreated,
  MarkPreSearchTriggered,
  MarkResumptionAttempted,
  NeedsMessageSync,
  NeedsStreamResumption,
  OnComplete,
  PrepareForNewMessage,
  RegisterAnimation,
  RemoveAnalysis,
  RemoveParticipant,
  RemovePreSearch,
  ReorderParticipants,
  ResetFeedback,
  ResetForm,
  ResetForThreadNavigation,
  ResetScreenMode,
  ResetThreadState,
  ResetToNewChat,
  ResetToOverview,
  ResetUI,
  SetAnalyses,
  SetChatSetMessages,
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
  SetIsCreatingAnalysis,
  SetIsCreatingThread,
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
  SetStop,
  SetStreamingRoundNumber,
  SetThread,
  SetWaitingToStartStreaming,
  StartRegeneration,
  UpdateAnalysisData,
  UpdateAnalysisError,
  UpdateAnalysisStatus,
  UpdateParticipant,
  UpdateParticipants,
  UpdatePreSearchActivity,
  UpdatePreSearchData,
  UpdatePreSearchStatus,
  WaitForAnimation,
} from './store-action-types';

// ============================================================================
// RE-EXPORT: Unified ParticipantConfig Schema
// ============================================================================
/**
 * ✅ MIGRATED: ParticipantConfig schema now defined in /src/lib/schemas/participant-schemas.ts
 *
 * This import replaces the duplicate schema that was defined here (lines 25-31).
 * The unified schema includes all fields (id, modelId, role, customRoleId, priority, settings).
 *
 * MIGRATION NOTES:
 * - OLD: ParticipantConfig had no `settings` field
 * - NEW: ParticipantConfig includes optional `settings` object for UI customization
 * - Store still works with both variants (settings field optional)
 *
 * @see /src/lib/schemas/participant-schemas.ts - Single source of truth
 */
export { ParticipantConfigSchema };
// Re-export type from participant-schemas (not duplicate)
export type ParticipantConfig = z.infer<typeof ParticipantConfigSchema>;

// ScreenModeSchema is imported from @/api/core/enums (single source of truth)

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
  applyRecommendedAction: z.custom<ApplyRecommendedAction>(),
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
  clearFeedback: z.custom<ClearFeedback>(),
  loadFeedbackFromServer: z.custom<LoadFeedbackFromServer>(),
  resetFeedback: z.custom<ResetFeedback>(),
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
// ANALYSIS SLICE SCHEMAS
// ============================================================================

export const AnalysisStateSchema = z.object({
  analyses: z.array(StoredModeratorAnalysisSchema),
});

export const AnalysisActionsSchema = z.object({
  setAnalyses: z.custom<SetAnalyses>(),
  addAnalysis: z.custom<AddAnalysis>(),
  updateAnalysisData: z.custom<UpdateAnalysisData>(),
  updateAnalysisStatus: z.custom<UpdateAnalysisStatus>(),
  updateAnalysisError: z.custom<UpdateAnalysisError>(),
  removeAnalysis: z.custom<RemoveAnalysis>(),
  clearAllAnalyses: z.custom<ClearAllAnalyses>(),
  createPendingAnalysis: z.custom<CreatePendingAnalysis>(),
});

export const AnalysisSliceSchema = z.intersection(AnalysisStateSchema, AnalysisActionsSchema);

// ============================================================================
// PRE-SEARCH SLICE SCHEMAS
// ============================================================================

export const PreSearchStateSchema = z.object({
  preSearches: z.array(StoredPreSearchSchema),
  /** Tracks last activity timestamp per round number for dynamic timeout calculation */
  preSearchActivityTimes: z.custom<Map<number, number>>(),
});

export const PreSearchActionsSchema = z.object({
  setPreSearches: z.custom<SetPreSearches>(),
  addPreSearch: z.custom<AddPreSearch>(),
  updatePreSearchData: z.custom<UpdatePreSearchData>(),
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
  stop: z.custom<(() => void) | undefined>().optional(),
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
  setStop: z.custom<SetStop>(),
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
  isCreatingAnalysis: z.boolean(),
  isWaitingForChangelog: z.boolean(),
  hasPendingConfigChanges: z.boolean(),
});

export const FlagsActionsSchema = z.object({
  setHasInitiallyLoaded: z.custom<SetHasInitiallyLoaded>(),
  setIsRegenerating: z.custom<SetIsRegenerating>(),
  setIsCreatingAnalysis: z.custom<SetIsCreatingAnalysis>(),
  setIsWaitingForChangelog: z.custom<SetIsWaitingForChangelog>(),
  setHasPendingConfigChanges: z.custom<SetHasPendingConfigChanges>(),
});

export const FlagsSliceSchema = z.intersection(FlagsStateSchema, FlagsActionsSchema);

// ============================================================================
// DATA SLICE SCHEMAS
// ============================================================================

/**
 * File part for AI SDK message creation
 * Used to pass file attachment info to hook for display in UI
 */
export const PendingFilePartSchema = z.object({
  type: z.literal('file'),
  url: z.string(),
  filename: z.string(),
  mediaType: z.string(),
});

export const DataStateSchema = z.object({
  regeneratingRoundNumber: z.number().nullable(),
  pendingMessage: z.string().nullable(),
  pendingAttachmentIds: z.array(z.string()).nullable(),
  /** File parts for AI SDK message creation - set before clearAttachments() */
  pendingFileParts: z.array(PendingFilePartSchema).nullable(),
  expectedParticipantIds: z.array(z.string()).nullable(),
  streamingRoundNumber: z.number().nullable(),
  currentRoundNumber: z.number().nullable(),
});

export const DataActionsSchema = z.object({
  setRegeneratingRoundNumber: z.custom<SetRegeneratingRoundNumber>(),
  setPendingMessage: z.custom<SetPendingMessage>(),
  setPendingAttachmentIds: z.custom<SetPendingAttachmentIds>(),
  setExpectedParticipantIds: z.custom<SetExpectedParticipantIds>(),
  setStreamingRoundNumber: z.custom<SetStreamingRoundNumber>(),
  setCurrentRoundNumber: z.custom<SetCurrentRoundNumber>(),
});

export const DataSliceSchema = z.intersection(DataStateSchema, DataActionsSchema);

// ============================================================================
// TRACKING SLICE SCHEMAS
// ============================================================================

export const TrackingStateSchema = z.object({
  hasSentPendingMessage: z.boolean(),
  createdAnalysisRounds: z.custom<Set<number>>(),
  triggeredPreSearchRounds: z.custom<Set<number>>(),
  /** ✅ IMMEDIATE UI FEEDBACK: Flag to track early optimistic message from handleUpdateThreadAndSend */
  hasEarlyOptimisticMessage: z.boolean(),
});

export const TrackingActionsSchema = z.object({
  setHasSentPendingMessage: z.custom<SetHasSentPendingMessage>(),
  markAnalysisCreated: z.custom<MarkAnalysisCreated>(),
  hasAnalysisBeenCreated: z.custom<HasAnalysisBeenCreated>(),
  clearAnalysisTracking: z.custom<ClearAnalysisTracking>(),
  markPreSearchTriggered: z.custom<MarkPreSearchTriggered>(),
  hasPreSearchBeenTriggered: z.custom<HasPreSearchBeenTriggered>(),
  clearPreSearchTracking: z.custom<ClearPreSearchTracking>(),
  /** ✅ IMMEDIATE UI FEEDBACK: Set when early optimistic message added by handleUpdateThreadAndSend */
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
  createdAt: z.date(),
  updatedAt: z.date().optional(),
});

/**
 * Stream resumption state type - inferred from Zod schema
 */
export type StreamResumptionState = z.infer<typeof StreamResumptionStateEntitySchema>;

export const StreamResumptionSliceStateSchema = z.object({
  streamResumptionState: StreamResumptionStateEntitySchema.nullable(),
  resumptionAttempts: z.custom<Set<string>>(),
  nextParticipantToTrigger: z.number().nullable(),
});

export const StreamResumptionActionsSchema = z.object({
  setStreamResumptionState: z.custom<(state: StreamResumptionState | null) => void>(),
  getStreamResumptionState: z.custom<() => StreamResumptionState | null>(),
  needsStreamResumption: z.custom<NeedsStreamResumption>(),
  isStreamResumptionStale: z.custom<IsStreamResumptionStale>(),
  isStreamResumptionValid: z.custom<IsStreamResumptionValid>(),
  handleResumedStreamComplete: z.custom<HandleResumedStreamComplete>(),
  handleStreamResumptionFailure: z.custom<HandleStreamResumptionFailure>(),
  getNextParticipantToTrigger: z.custom<GetNextParticipantToTrigger>(),
  setNextParticipantToTrigger: z.custom<SetNextParticipantToTrigger>(),
  markResumptionAttempted: z.custom<MarkResumptionAttempted>(),
  needsMessageSync: z.custom<NeedsMessageSync>(),
  clearStreamResumption: z.custom<ClearStreamResumption>(),
});

export const StreamResumptionSliceSchema = z.intersection(StreamResumptionSliceStateSchema, StreamResumptionActionsSchema);

// ============================================================================
// ANIMATION SLICE SCHEMAS
// ============================================================================

/**
 * Animation completion tracking state
 * Tracks pending animations per participant to ensure sequential animation completion
 */
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

/**
 * Pending attachment schema for chat input file attachments
 * Combines file with optional upload item and preview
 */
export const PendingAttachmentSchema = z.object({
  id: z.string(),
  file: z.custom<File>(val => val instanceof File, { message: 'Must be a File object' }),
  uploadItem: z.custom<import('@/hooks/utils/use-file-upload').UploadItem>().optional(),
  preview: z.custom<import('@/hooks/utils/use-file-preview').FilePreview>().optional(),
});

export const AttachmentsStateSchema = z.object({
  pendingAttachments: z.array(PendingAttachmentSchema),
});

export const AttachmentsActionsSchema = z.object({
  addAttachments: z.custom<import('./store-action-types').AddAttachments>(),
  removeAttachment: z.custom<import('./store-action-types').RemoveAttachment>(),
  clearAttachments: z.custom<import('./store-action-types').ClearAttachments>(),
  updateAttachmentUpload: z.custom<import('./store-action-types').UpdateAttachmentUpload>(),
  updateAttachmentPreview: z.custom<import('./store-action-types').UpdateAttachmentPreview>(),
  getAttachments: z.custom<import('./store-action-types').GetAttachments>(),
  hasAttachments: z.custom<import('./store-action-types').HasAttachments>(),
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

export const OperationsSliceSchema = OperationsActionsSchema;

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
                        z.intersection(FormSliceSchema, FeedbackSliceSchema),
                        UISliceSchema,
                      ),
                      AnalysisSliceSchema,
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
    z.intersection(AnimationSliceSchema, AttachmentsSliceSchema),
  ),
  OperationsSliceSchema,
);

// ============================================================================
// STORE TYPE INFERENCE
// ============================================================================

/**
 * Complete Chat Store type inferred from Zod schemas
 * All slices are combined into a single store type
 *
 * ✅ SINGLE SOURCE: Type derived from schemas
 * ✅ TYPE-SAFE: All store operations validated
 * ✅ ZUSTAND V5: Ready for combine middleware
 */
export type ChatStore = z.infer<typeof ChatStoreSchema>;

// Re-export individual slice types for convenience
export type FormState = z.infer<typeof FormStateSchema>;
export type FormActions = z.infer<typeof FormActionsSchema>;
export type FormSlice = z.infer<typeof FormSliceSchema>;

export type FeedbackState = z.infer<typeof FeedbackStateSchema>;
export type FeedbackActions = z.infer<typeof FeedbackActionsSchema>;
export type FeedbackSlice = z.infer<typeof FeedbackSliceSchema>;

export type UIState = z.infer<typeof UIStateSchema>;
export type UIActions = z.infer<typeof UIActionsSchema>;
export type UISlice = z.infer<typeof UISliceSchema>;

export type AnalysisState = z.infer<typeof AnalysisStateSchema>;
export type AnalysisActions = z.infer<typeof AnalysisActionsSchema>;
export type AnalysisSlice = z.infer<typeof AnalysisSliceSchema>;

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
export type OperationsSlice = z.infer<typeof OperationsSliceSchema>;

export type StreamResumptionSliceState = z.infer<typeof StreamResumptionSliceStateSchema>;
export type StreamResumptionActions = z.infer<typeof StreamResumptionActionsSchema>;
export type StreamResumptionSlice = z.infer<typeof StreamResumptionSliceSchema>;

export type AnimationState = z.infer<typeof AnimationStateSchema>;
export type AnimationActions = z.infer<typeof AnimationActionsSchema>;
export type AnimationSlice = z.infer<typeof AnimationSliceSchema>;

export type PendingAttachment = z.infer<typeof PendingAttachmentSchema>;
export type AttachmentsState = z.infer<typeof AttachmentsStateSchema>;
export type AttachmentsActions = z.infer<typeof AttachmentsActionsSchema>;
export type AttachmentsSlice = z.infer<typeof AttachmentsSliceSchema>;

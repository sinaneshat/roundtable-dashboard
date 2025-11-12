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
  ApplyRecommendedAction,
  ChatSetMessages,
  ClearAllAnalyses,
  ClearAllPreSearches,
  ClearAnalysisTracking,
  ClearFeedback,
  ClearPreSearchTracking,
  CompleteRegeneration,
  CompleteStreaming,
  CreatePendingAnalysis,
  HasAnalysisBeenCreated,
  HasPreSearchBeenTriggered,
  InitializeThread,
  LoadFeedbackFromServer,
  MarkAnalysisCreated,
  MarkPreSearchTriggered,
  OnComplete,
  OnRetry,
  PrepareForNewMessage,
  RemoveAnalysis,
  RemoveParticipant,
  RemovePreSearch,
  ReorderParticipants,
  ResetFeedback,
  ResetForm,
  ResetScreenMode,
  ResetThreadState,
  ResetToOverview,
  ResetUI,
  Retry,
  SendMessage,
  SetAnalyses,
  SetChatSetMessages,
  SetCreatedThreadId,
  SetCurrentParticipantIndex,
  SetCurrentRoundNumber,
  SetEnableWebSearch,
  SetError,
  SetExpectedParticipantIds,
  SetFeedback,
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
  SetOnComplete,
  SetOnRetry,
  SetParticipants,
  SetPendingFeedback,
  SetPendingMessage,
  SetPreSearches,
  SetRegeneratingRoundNumber,
  SetRetry,
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
  StartRound,
  Stop,
  UpdateAnalysisData,
  UpdateAnalysisStatus,
  UpdateParticipant,
  UpdateParticipants,
  UpdatePreSearchData,
  UpdatePreSearchStatus,
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

// ============================================================================
// SCREEN MODE SCHEMA
// ============================================================================

export const ScreenModeSchema = z.enum(['overview', 'thread', 'public']);

// ============================================================================
// AI SDK FUNCTION SCHEMAS (for type safety)
// ============================================================================

// Schema for AI SDK callback functions - typed with z.custom<T>()
const SendMessageFnSchema = z.custom<SendMessage>();
const StartRoundFnSchema = z.custom<StartRound>();
const RetryFnSchema = z.custom<Retry>();
const StopFnSchema = z.custom<Stop>();
const ChatSetMessagesFnSchema = z.custom<ChatSetMessages>();
const OnCompleteFnSchema = z.custom<OnComplete>();
const OnRetryFnSchema = z.custom<OnRetry>();

// ============================================================================
// FORM SLICE SCHEMAS
// ============================================================================

export const FormStateSchema = z.object({
  inputValue: z.string(),
  selectedMode: ChatModeSchema.nullable(),
  selectedParticipants: z.array(ParticipantConfigSchema),
  enableWebSearch: z.boolean(),
});

export const FormActionsSchema = z.object({
  setInputValue: z.custom<SetInputValue>(),
  setSelectedMode: z.custom<SetSelectedMode>(),
  setSelectedParticipants: z.custom<SetSelectedParticipants>(),
  setEnableWebSearch: z.custom<SetEnableWebSearch>(),
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
});

export const PreSearchActionsSchema = z.object({
  setPreSearches: z.custom<SetPreSearches>(),
  addPreSearch: z.custom<AddPreSearch>(),
  updatePreSearchData: z.custom<UpdatePreSearchData>(),
  updatePreSearchStatus: z.custom<UpdatePreSearchStatus>(),
  removePreSearch: z.custom<RemovePreSearch>(),
  clearAllPreSearches: z.custom<ClearAllPreSearches>(),
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
  sendMessage: SendMessageFnSchema.optional(),
  startRound: StartRoundFnSchema.optional(),
  retry: RetryFnSchema.optional(),
  stop: StopFnSchema.optional(),
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
  setRetry: z.custom<SetRetry>(),
  setStop: z.custom<SetStop>(),
  setChatSetMessages: z.custom<SetChatSetMessages>(),
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

export const DataStateSchema = z.object({
  regeneratingRoundNumber: z.number().nullable(),
  pendingMessage: z.string().nullable(),
  expectedParticipantIds: z.array(z.string()).nullable(),
  streamingRoundNumber: z.number().nullable(),
  currentRoundNumber: z.number().nullable(),
});

export const DataActionsSchema = z.object({
  setRegeneratingRoundNumber: z.custom<SetRegeneratingRoundNumber>(),
  setPendingMessage: z.custom<SetPendingMessage>(),
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
});

export const TrackingActionsSchema = z.object({
  setHasSentPendingMessage: z.custom<SetHasSentPendingMessage>(),
  markAnalysisCreated: z.custom<MarkAnalysisCreated>(),
  hasAnalysisBeenCreated: z.custom<HasAnalysisBeenCreated>(),
  clearAnalysisTracking: z.custom<ClearAnalysisTracking>(),
  markPreSearchTriggered: z.custom<MarkPreSearchTriggered>(),
  hasPreSearchBeenTriggered: z.custom<HasPreSearchBeenTriggered>(),
  clearPreSearchTracking: z.custom<ClearPreSearchTracking>(),
});

export const TrackingSliceSchema = z.intersection(TrackingStateSchema, TrackingActionsSchema);

// ============================================================================
// CALLBACKS SLICE SCHEMAS
// ============================================================================

export const CallbacksStateSchema = z.object({
  onComplete: OnCompleteFnSchema.optional(),
  onRetry: OnRetryFnSchema.optional(),
});

export const CallbacksActionsSchema = z.object({
  setOnComplete: z.custom<SetOnComplete>(),
  setOnRetry: z.custom<SetOnRetry>(),
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
// OPERATIONS SLICE SCHEMAS
// ============================================================================

export const OperationsActionsSchema = z.object({
  resetThreadState: z.custom<ResetThreadState>(),
  resetToOverview: z.custom<ResetToOverview>(),
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
  z.intersection(ScreenSliceSchema, OperationsSliceSchema),
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

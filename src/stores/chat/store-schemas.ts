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

import { AnalysisStatusSchema, ChatModeSchema,FeedbackTypeSchema as ApiFeedbackTypeSchema } from '@/api/core/enums';
import {
  ChatParticipantSchema,
  ChatThreadSchema,
  ModeratorAnalysisPayloadSchema,
  PreSearchDataPayloadSchema,
  RecommendedActionSchema,
  RoundFeedbackDataSchema,
  StoredModeratorAnalysisSchema,
  StoredPreSearchSchema,
} from '@/api/routes/chat/schema';
import { ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';

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
export type { ParticipantConfig } from '@/lib/schemas/participant-schemas';

// ============================================================================
// SCREEN MODE SCHEMA
// ============================================================================

export const ScreenModeSchema = z.enum(['overview', 'thread', 'public']);

// ============================================================================
// AI SDK FUNCTION SCHEMAS (for type safety)
// ============================================================================

// Schema for AI SDK callback functions - typed but not validated at runtime
const SendMessageFnSchema = z.function()
  .args(z.string())
  .returns(z.promise(z.void()));

const StartRoundFnSchema = z.function()
  .args()
  .returns(z.void());

const RetryFnSchema = z.function()
  .args()
  .returns(z.void());

const StopFnSchema = z.function()
  .args()
  .returns(z.void());

const ChatSetMessagesFnSchema = z.function()
  .args(z.union([
    z.array(z.custom<UIMessage>()),
    z.function().args(z.array(z.custom<UIMessage>())).returns(z.array(z.custom<UIMessage>())),
  ]))
  .returns(z.void());

const OnCompleteFnSchema = z.function()
  .args()
  .returns(z.void());

const OnRetryFnSchema = z.function()
  .args(z.number())
  .returns(z.void());

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
  setInputValue: z.function().args(z.string()).returns(z.void()),
  setSelectedMode: z.function().args(ChatModeSchema).returns(z.void()),
  setSelectedParticipants: z.function().args(z.array(ParticipantConfigSchema)).returns(z.void()),
  setEnableWebSearch: z.function().args(z.boolean()).returns(z.void()),
  addParticipant: z.function().args(ParticipantConfigSchema).returns(z.void()),
  removeParticipant: z.function().args(z.string()).returns(z.void()),
  updateParticipant: z.function().args(z.string(), z.record(z.any())).returns(z.void()),
  reorderParticipants: z.function().args(z.number(), z.number()).returns(z.void()),
  resetForm: z.function().args().returns(z.void()),
  applyRecommendedAction: z.function()
    .args(
      RecommendedActionSchema,
      z.object({
        maxModels: z.number().optional(),
        tierName: z.string().optional(),
        userTier: z.any().optional(),
        allModels: z.array(z.any()).optional(),
      }).optional(),
    )
    .returns(z.object({
      success: z.boolean(),
      error: z.string().optional(),
      modelsAdded: z.number().optional(),
      modelsSkipped: z.number().optional(),
    })),
});

export const FormSliceSchema = FormStateSchema.merge(FormActionsSchema);

// ============================================================================
// FEEDBACK SLICE SCHEMAS
// ============================================================================

export const FeedbackStateSchema = z.object({
  feedbackByRound: z.custom<Map<number, z.infer<typeof ApiFeedbackTypeSchema> | null>>(),
  pendingFeedback: z.object({
    roundNumber: z.number(),
    type: ApiFeedbackTypeSchema,
  }).nullable(),
  hasLoadedFeedback: z.boolean(),
});

export const FeedbackActionsSchema = z.object({
  setFeedback: z.function().args(z.number(), ApiFeedbackTypeSchema.nullable()).returns(z.void()),
  setPendingFeedback: z.function().args(z.object({
    roundNumber: z.number(),
    type: ApiFeedbackTypeSchema,
  }).nullable()).returns(z.void()),
  clearFeedback: z.function().args(z.number()).returns(z.void()),
  loadFeedbackFromServer: z.function().args(z.array(RoundFeedbackDataSchema)).returns(z.void()),
  resetFeedback: z.function().args().returns(z.void()),
});

export const FeedbackSliceSchema = FeedbackStateSchema.merge(FeedbackActionsSchema);

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
  setShowInitialUI: z.function().args(z.boolean()).returns(z.void()),
  setWaitingToStartStreaming: z.function().args(z.boolean()).returns(z.void()),
  setIsCreatingThread: z.function().args(z.boolean()).returns(z.void()),
  setCreatedThreadId: z.function().args(z.string().nullable()).returns(z.void()),
  resetUI: z.function().args().returns(z.void()),
});

export const UISliceSchema = UIStateSchema.merge(UIActionsSchema);

// ============================================================================
// ANALYSIS SLICE SCHEMAS
// ============================================================================

export const AnalysisStateSchema = z.object({
  analyses: z.array(StoredModeratorAnalysisSchema),
});

export const AnalysisActionsSchema = z.object({
  setAnalyses: z.function().args(z.array(StoredModeratorAnalysisSchema)).returns(z.void()),
  addAnalysis: z.function().args(StoredModeratorAnalysisSchema).returns(z.void()),
  updateAnalysisData: z.function().args(z.number(), ModeratorAnalysisPayloadSchema).returns(z.void()),
  updateAnalysisStatus: z.function().args(z.number(), AnalysisStatusSchema).returns(z.void()),
  removeAnalysis: z.function().args(z.number()).returns(z.void()),
  clearAllAnalyses: z.function().args().returns(z.void()),
  createPendingAnalysis: z.function().args(z.object({
    roundNumber: z.number(),
    messages: z.array(z.custom<UIMessage>()),
    participants: z.array(ChatParticipantSchema),
    userQuestion: z.string(),
    threadId: z.string(),
    mode: ChatModeSchema,
  })).returns(z.void()),
});

export const AnalysisSliceSchema = AnalysisStateSchema.merge(AnalysisActionsSchema);

// ============================================================================
// PRE-SEARCH SLICE SCHEMAS
// ============================================================================

export const PreSearchStateSchema = z.object({
  preSearches: z.array(StoredPreSearchSchema),
});

export const PreSearchActionsSchema = z.object({
  setPreSearches: z.function().args(z.array(StoredPreSearchSchema)).returns(z.void()),
  addPreSearch: z.function().args(StoredPreSearchSchema).returns(z.void()),
  updatePreSearchData: z.function().args(z.number(), PreSearchDataPayloadSchema).returns(z.void()),
  updatePreSearchStatus: z.function().args(z.number(), AnalysisStatusSchema).returns(z.void()),
  removePreSearch: z.function().args(z.number()).returns(z.void()),
  clearAllPreSearches: z.function().args().returns(z.void()),
});

export const PreSearchSliceSchema = PreSearchStateSchema.merge(PreSearchActionsSchema);

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
  // AI SDK methods
  sendMessage: SendMessageFnSchema.optional(),
  startRound: StartRoundFnSchema.optional(),
  retry: RetryFnSchema.optional(),
  stop: StopFnSchema.optional(),
  chatSetMessages: ChatSetMessagesFnSchema.optional(),
});

export const ThreadActionsSchema = z.object({
  setThread: z.function().args(ChatThreadSchema.nullable()).returns(z.void()),
  setParticipants: z.function().args(z.array(ChatParticipantSchema)).returns(z.void()),
  setMessages: z.function().args(z.union([
    z.array(z.custom<UIMessage>()),
    z.function().args(z.array(z.custom<UIMessage>())).returns(z.array(z.custom<UIMessage>())),
  ])).returns(z.void()),
  setIsStreaming: z.function().args(z.boolean()).returns(z.void()),
  setCurrentParticipantIndex: z.function().args(z.number()).returns(z.void()),
  setError: z.function().args(z.custom<Error | null>()).returns(z.void()),
  setSendMessage: z.function().args(SendMessageFnSchema.optional()).returns(z.void()),
  setStartRound: z.function().args(StartRoundFnSchema.optional()).returns(z.void()),
  setRetry: z.function().args(RetryFnSchema.optional()).returns(z.void()),
  setStop: z.function().args(StopFnSchema.optional()).returns(z.void()),
  setChatSetMessages: z.function().args(ChatSetMessagesFnSchema.optional()).returns(z.void()),
});

export const ThreadSliceSchema = ThreadStateSchema.merge(ThreadActionsSchema);

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
  setHasInitiallyLoaded: z.function().args(z.boolean()).returns(z.void()),
  setIsRegenerating: z.function().args(z.boolean()).returns(z.void()),
  setIsCreatingAnalysis: z.function().args(z.boolean()).returns(z.void()),
  setIsWaitingForChangelog: z.function().args(z.boolean()).returns(z.void()),
  setHasPendingConfigChanges: z.function().args(z.boolean()).returns(z.void()),
});

export const FlagsSliceSchema = FlagsStateSchema.merge(FlagsActionsSchema);

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
  setRegeneratingRoundNumber: z.function().args(z.number().nullable()).returns(z.void()),
  setPendingMessage: z.function().args(z.string().nullable()).returns(z.void()),
  setExpectedParticipantIds: z.function().args(z.array(z.string()).nullable()).returns(z.void()),
  setStreamingRoundNumber: z.function().args(z.number().nullable()).returns(z.void()),
  setCurrentRoundNumber: z.function().args(z.number().nullable()).returns(z.void()),
});

export const DataSliceSchema = DataStateSchema.merge(DataActionsSchema);

// ============================================================================
// TRACKING SLICE SCHEMAS
// ============================================================================

export const TrackingStateSchema = z.object({
  hasSentPendingMessage: z.boolean(),
  createdAnalysisRounds: z.custom<Set<number>>(),
  triggeredPreSearchRounds: z.custom<Set<number>>(),
});

export const TrackingActionsSchema = z.object({
  setHasSentPendingMessage: z.function().args(z.boolean()).returns(z.void()),
  markAnalysisCreated: z.function().args(z.number()).returns(z.void()),
  hasAnalysisBeenCreated: z.function().args(z.number()).returns(z.boolean()),
  clearAnalysisTracking: z.function().args(z.number()).returns(z.void()),
  markPreSearchTriggered: z.function().args(z.number()).returns(z.void()),
  hasPreSearchBeenTriggered: z.function().args(z.number()).returns(z.boolean()),
  clearPreSearchTracking: z.function().args(z.number()).returns(z.void()),
});

export const TrackingSliceSchema = TrackingStateSchema.merge(TrackingActionsSchema);

// ============================================================================
// CALLBACKS SLICE SCHEMAS
// ============================================================================

export const CallbacksStateSchema = z.object({
  onComplete: OnCompleteFnSchema.optional(),
  onRetry: OnRetryFnSchema.optional(),
});

export const CallbacksActionsSchema = z.object({
  setOnComplete: z.function().args(OnCompleteFnSchema.optional()).returns(z.void()),
  setOnRetry: z.function().args(OnRetryFnSchema.optional()).returns(z.void()),
});

export const CallbacksSliceSchema = CallbacksStateSchema.merge(CallbacksActionsSchema);

// ============================================================================
// SCREEN SLICE SCHEMAS
// ============================================================================

export const ScreenStateSchema = z.object({
  screenMode: ScreenModeSchema.nullable(),
  isReadOnly: z.boolean(),
});

export const ScreenActionsSchema = z.object({
  setScreenMode: z.function().args(ScreenModeSchema.nullable()).returns(z.void()),
  resetScreenMode: z.function().args().returns(z.void()),
});

export const ScreenSliceSchema = ScreenStateSchema.merge(ScreenActionsSchema);

// ============================================================================
// OPERATIONS SLICE SCHEMAS
// ============================================================================

export const OperationsActionsSchema = z.object({
  resetThreadState: z.function().args().returns(z.void()),
  resetToOverview: z.function().args().returns(z.void()),
  initializeThread: z.function()
    .args(
      ChatThreadSchema,
      z.array(ChatParticipantSchema),
      z.array(z.custom<UIMessage>()).optional(),
    )
    .returns(z.void()),
  updateParticipants: z.function().args(z.array(ChatParticipantSchema)).returns(z.void()),
  prepareForNewMessage: z.function().args(z.string(), z.array(z.string())).returns(z.void()),
  completeStreaming: z.function().args().returns(z.void()),
  startRegeneration: z.function().args(z.number()).returns(z.void()),
  completeRegeneration: z.function().args(z.number()).returns(z.void()),
});

export const OperationsSliceSchema = OperationsActionsSchema;

// ============================================================================
// COMPLETE STORE SCHEMA
// ============================================================================

export const ChatStoreSchema = FormSliceSchema
  .merge(FeedbackSliceSchema)
  .merge(UISliceSchema)
  .merge(AnalysisSliceSchema)
  .merge(PreSearchSliceSchema)
  .merge(ThreadSliceSchema)
  .merge(FlagsSliceSchema)
  .merge(DataSliceSchema)
  .merge(TrackingSliceSchema)
  .merge(CallbacksSliceSchema)
  .merge(ScreenSliceSchema)
  .merge(OperationsSliceSchema);

// ============================================================================
// TYPE EXPORTS (Inferred from Schemas)
// ============================================================================

export type ParticipantConfig = z.infer<typeof ParticipantConfigSchema>;
export type ScreenMode = z.infer<typeof ScreenModeSchema>;

// State types
export type FormState = z.infer<typeof FormStateSchema>;
export type FeedbackState = z.infer<typeof FeedbackStateSchema>;
export type UIState = z.infer<typeof UIStateSchema>;
export type AnalysisState = z.infer<typeof AnalysisStateSchema>;
export type PreSearchState = z.infer<typeof PreSearchStateSchema>;
export type ThreadState = z.infer<typeof ThreadStateSchema>;
export type FlagsState = z.infer<typeof FlagsStateSchema>;
export type DataState = z.infer<typeof DataStateSchema>;
export type TrackingState = z.infer<typeof TrackingStateSchema>;
export type CallbacksState = z.infer<typeof CallbacksStateSchema>;
export type ScreenState = z.infer<typeof ScreenStateSchema>;

// Slice types (state + actions)
export type FormSlice = z.infer<typeof FormSliceSchema>;
export type FeedbackSlice = z.infer<typeof FeedbackSliceSchema>;
export type UISlice = z.infer<typeof UISliceSchema>;
export type AnalysisSlice = z.infer<typeof AnalysisSliceSchema>;
export type PreSearchSlice = z.infer<typeof PreSearchSliceSchema>;
export type ThreadSlice = z.infer<typeof ThreadSliceSchema>;
export type FlagsSlice = z.infer<typeof FlagsSliceSchema>;
export type DataSlice = z.infer<typeof DataSliceSchema>;
export type TrackingSlice = z.infer<typeof TrackingSliceSchema>;
export type CallbacksSlice = z.infer<typeof CallbacksSliceSchema>;
export type ScreenSlice = z.infer<typeof ScreenSliceSchema>;
export type OperationsSlice = z.infer<typeof OperationsSliceSchema>;

// Complete store type
export type ChatStore = z.infer<typeof ChatStoreSchema>;

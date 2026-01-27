/**
 * Minimal Chat Store Schemas - Complete Rewrite
 *
 * Simplified state management with clear phase-based flow.
 * Types inferred from Zod schemas (single source of truth).
 */

import type { ChatMode } from '@roundtable/shared';
import { ChatModeSchema, ScreenModeSchema } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { z } from 'zod';

import type { PendingAttachment } from '@/hooks/utils/attachment-schemas';
import { PendingAttachmentSchema } from '@/hooks/utils/attachment-schemas';
// ============================================================================
// ACTION TYPES
// ============================================================================
import type { FilePreview } from '@/hooks/utils/use-file-preview';
import type { UploadItem } from '@/hooks/utils/use-file-upload';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { ExtendedFilePartSchema } from '@/lib/schemas/message-schemas';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { ChatParticipantSchema, ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';
import type { ApiChangelog, ChatParticipant, ChatThread, StoredPreSearch } from '@/services/api';

// ============================================================================
// CHAT PHASE - Simple state machine
// ============================================================================

export const ChatPhaseValues = ['idle', 'participants', 'moderator', 'complete'] as const;
export const ChatPhaseSchema = z.enum(ChatPhaseValues);
export type ChatPhase = z.infer<typeof ChatPhaseSchema>;

export const ChatPhases = {
  COMPLETE: 'complete',
  IDLE: 'idle',
  MODERATOR: 'moderator',
  PARTICIPANTS: 'participants',
} as const;

// ============================================================================
// TITLE ANIMATION
// ============================================================================

export const TitleAnimationPhaseSchema = z.enum(['idle', 'deleting', 'typing', 'complete']);
export type TitleAnimationPhase = z.infer<typeof TitleAnimationPhaseSchema>;

// ============================================================================
// CORE STATE SCHEMAS
// ============================================================================

/** Thread and message state */
export const ThreadStateSchema = z.object({
  /**
   * Captured participant count at round start.
   * Used to prevent count divergence during streaming.
   * Set by startRound(), consumed by subscriptions.
   */
  activeRoundParticipantCount: z.number(),
  currentParticipantIndex: z.number(),
  currentRoundNumber: z.number().nullable(),
  error: z.custom<Error | null>(),
  expectedModelIds: z.array(z.string()).nullable(),
  hasSentPendingMessage: z.boolean(),
  isRegenerating: z.boolean(),
  isStreaming: z.boolean(),
  messages: z.array(z.custom<UIMessage>()),
  participants: z.array(ChatParticipantSchema),
  phase: ChatPhaseSchema,
  regeneratingRoundNumber: z.number().nullable(),
  streamingRoundNumber: z.number().nullable(),
  thread: z.custom<ChatThread | null>(),
});

/** Form state */
export const FormStateSchema = z.object({
  autoMode: z.boolean(),
  enableWebSearch: z.boolean(),
  inputValue: z.string(),
  modelOrder: z.array(z.string()),
  pendingMessage: z.string().nullable(),
  selectedMode: ChatModeSchema.nullable(),
  selectedParticipants: z.array(ParticipantConfigSchema),
});

/** UI state */
export const UIStateSchema = z.object({
  createdThreadId: z.string().nullable(),
  createdThreadProjectId: z.string().nullable(),
  hasInitiallyLoaded: z.boolean(),
  isAnalyzingPrompt: z.boolean(),
  isCreatingThread: z.boolean(),
  isModeratorStreaming: z.boolean(),
  screenMode: ScreenModeSchema.nullable(),
  showInitialUI: z.boolean(),
  waitingToStartStreaming: z.boolean(),
});

/** Attachments state */
export const AttachmentsStateSchema = z.object({
  pendingAttachmentIds: z.array(z.string()).nullable(),
  pendingAttachments: z.array(PendingAttachmentSchema),
  pendingFileParts: z.array(ExtendedFilePartSchema).nullable(),
});

/** Pre-search state */
export const PreSearchStateSchema = z.object({
  preSearches: z.custom<StoredPreSearch[]>(),
});

/** Changelog state */
export const ChangelogStateSchema = z.object({
  changelogItems: z.custom<ApiChangelog[]>(),
});

/** Title animation state */
export const TitleAnimationStateSchema = z.object({
  animatingThreadId: z.string().nullable(),
  animationPhase: TitleAnimationPhaseSchema,
  displayedTitle: z.string().nullable(),
  newTitle: z.string().nullable(),
  oldTitle: z.string().nullable(),
});

/** Tracking state for deduplication */
export const TrackingStateSchema = z.object({
  preSearchActivityTimes: z.custom<Map<number, number>>(),
  triggeredModeratorIds: z.custom<Set<string>>(),
  triggeredModeratorRounds: z.custom<Set<number>>(),
  triggeredPreSearchRounds: z.custom<Set<number>>(),
});

// ============================================================================
// SUBSCRIPTION STATE - Backend-First Architecture
// ============================================================================

export const EntityStatusValues = ['idle', 'waiting', 'streaming', 'complete', 'error', 'disabled'] as const;
export const EntityStatusSchema = z.enum(EntityStatusValues);
export type EntityStatus = z.infer<typeof EntityStatusSchema>;

/** State for a single entity subscription */
export const EntitySubscriptionStateSchema = z.object({
  errorMessage: z.string().optional(),
  lastSeq: z.number(),
  status: EntityStatusSchema,
});

/** Subscription state for the current round */
export const SubscriptionStateSchema = z.object({
  /** Current round being subscribed to (-1 if none) */
  activeRoundNumber: z.number(),
  /** Moderator subscription status */
  moderator: EntitySubscriptionStateSchema,
  /** Participant subscription statuses (indexed by participant index) */
  participants: z.array(EntitySubscriptionStateSchema),
  /** Presearch subscription status */
  presearch: EntitySubscriptionStateSchema,
});

export type EntitySubscriptionStateType = z.infer<typeof EntitySubscriptionStateSchema>;
export type SubscriptionState = z.infer<typeof SubscriptionStateSchema>;

// ============================================================================
// COMBINED STATE
// ============================================================================

export const ChatStoreStateSchema = z.intersection(
  z.intersection(
    z.intersection(
      z.intersection(
        z.intersection(
          z.intersection(
            z.intersection(
              ThreadStateSchema,
              FormStateSchema,
            ),
            UIStateSchema,
          ),
          AttachmentsStateSchema,
        ),
        PreSearchStateSchema,
      ),
      ChangelogStateSchema,
    ),
    TitleAnimationStateSchema,
  ),
  TrackingStateSchema,
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ThreadState = z.infer<typeof ThreadStateSchema>;
export type FormState = z.infer<typeof FormStateSchema>;
export type UIState = z.infer<typeof UIStateSchema>;
export type AttachmentsState = z.infer<typeof AttachmentsStateSchema>;
export type PreSearchState = z.infer<typeof PreSearchStateSchema>;
export type ChangelogState = z.infer<typeof ChangelogStateSchema>;
export type TitleAnimationState = z.infer<typeof TitleAnimationStateSchema>;
export type TrackingState = z.infer<typeof TrackingStateSchema>;
export type ChatStoreState = z.infer<typeof ChatStoreStateSchema>;

export type ChatStoreActions = {
  // === PHASE TRANSITIONS ===
  startRound: (roundNumber: number, participantCount: number) => void;
  onParticipantComplete: (participantIndex: number) => void;
  onModeratorComplete: () => void;
  resetToIdle: () => void;

  // === MESSAGES ===
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;

  // === THREAD ===
  setThread: (thread: ChatThread | null) => void;
  setParticipants: (participants: ChatParticipant[]) => void;
  setCurrentParticipantIndex: (index: number) => void;
  setCurrentRoundNumber: (round: number | null) => void;
  setIsStreaming: (streaming: boolean) => void;
  setError: (error: Error | null) => void;
  setStreamingRoundNumber: (round: number | null) => void;
  setExpectedModelIds: (ids: string[] | null) => void;
  setHasSentPendingMessage: (sent: boolean) => void;
  setIsRegenerating: (regenerating: boolean) => void;
  setRegeneratingRoundNumber: (round: number | null) => void;
  batchUpdatePendingState: (pendingMessage: string | null, expectedModelIds: string[] | null) => void;

  // === FORM ===
  setInputValue: (value: string) => void;
  setPendingMessage: (message: string | null) => void;
  setSelectedParticipants: (participants: ParticipantConfig[]) => void;
  addParticipant: (participant: ParticipantConfig) => void;
  removeParticipant: (participantId: string) => void;
  reorderParticipants: (fromIndex: number, toIndex: number) => void;
  updateParticipant: (participantId: string, updates: Partial<ParticipantConfig>) => void;
  setSelectedMode: (mode: ChatMode | null) => void;
  setAutoMode: (enabled: boolean) => void;
  setEnableWebSearch: (enabled: boolean) => void;
  setModelOrder: (modelIds: string[]) => void;
  resetForm: () => void;

  // === UI ===
  setCreatedThreadId: (id: string | null) => void;
  setCreatedThreadProjectId: (projectId: string | null) => void;
  setIsCreatingThread: (creating: boolean) => void;
  setIsAnalyzingPrompt: (analyzing: boolean) => void;
  setIsModeratorStreaming: (streaming: boolean) => void;
  setShowInitialUI: (show: boolean) => void;
  setWaitingToStartStreaming: (waiting: boolean) => void;
  setHasInitiallyLoaded: (loaded: boolean) => void;
  setScreenMode: (mode: z.infer<typeof ScreenModeSchema> | null) => void;

  // === ATTACHMENTS ===
  addAttachments: (attachments: PendingAttachment[]) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  updateAttachmentUpload: (id: string, upload: UploadItem) => void;
  updateAttachmentPreview: (id: string, preview: FilePreview) => void;
  setPendingAttachmentIds: (ids: string[] | null) => void;
  setPendingFileParts: (parts: ExtendedFilePart[] | null) => void;
  getAttachments: () => PendingAttachment[];
  hasAttachments: () => boolean;

  // === PRE-SEARCH ===
  setPreSearches: (preSearches: StoredPreSearch[]) => void;
  addPreSearch: (preSearch: StoredPreSearch) => void;
  updatePreSearchStatus: (roundNumber: number, status: string) => void;
  updatePreSearchData: (roundNumber: number, searchData: unknown) => void;
  updatePartialPreSearchData: (roundNumber: number, partialData: unknown) => void;
  updatePreSearchActivity: (roundNumber: number) => void;
  clearPreSearchActivity: (roundNumber: number) => void;
  clearAllPreSearches: () => void;
  clearAllPreSearchTracking: () => void;
  hasPreSearchBeenTriggered: (roundNumber: number) => boolean;
  markPreSearchTriggered: (roundNumber: number) => void;
  tryMarkPreSearchTriggered: (roundNumber: number) => boolean;
  clearPreSearchTracking: (roundNumber: number) => void;

  // === CHANGELOG ===
  setChangelogItems: (items: ApiChangelog[]) => void;
  addChangelogItems: (items: ApiChangelog[]) => void;

  // === TITLE ANIMATION ===
  startTitleAnimation: (threadId: string, oldTitle: string | null, newTitle: string) => void;
  updateDisplayedTitle: (title: string) => void;
  setAnimationPhase: (phase: TitleAnimationPhase) => void;
  completeTitleAnimation: () => void;

  // === TRACKING (deduplication) ===
  hasModeratorStreamBeenTriggered: (moderatorId: string, roundNumber: number) => boolean;
  markModeratorStreamTriggered: (moderatorId: string, roundNumber: number) => void;
  clearModeratorTracking: () => void;

  // === SUBSCRIPTION STATE (Backend-First Architecture) ===
  subscriptionState: SubscriptionState;
  initializeSubscriptions: (roundNumber: number, participantCount: number) => void;
  updateEntitySubscriptionStatus: (
    entity: 'presearch' | 'moderator' | number, // number = participant index
    status: EntityStatus,
    lastSeq?: number,
    errorMessage?: string,
  ) => void;
  clearSubscriptionState: () => void;

  // === STREAMING TEXT (P1+ gradual UI updates) ===
  /**
   * Create streaming placeholders proactively for all participants (P1+) and moderator.
   * Called when round starts so UI shows placeholders immediately.
   */
  createStreamingPlaceholders: (roundNumber: number, participantCount: number) => void;

  /**
   * Append streaming text to a participant's placeholder message.
   * Creates placeholder if not exists, appends text if exists.
   * Used for P1+ participants to show gradual streaming in UI.
   */
  appendEntityStreamingText: (
    participantIndex: number,
    text: string,
    roundNumber: number,
  ) => void;

  /**
   * Append streaming text to the moderator's placeholder message.
   * Creates placeholder if not exists, appends text if exists.
   * Used for gradual moderator streaming in UI.
   */
  appendModeratorStreamingText: (
    text: string,
    roundNumber: number,
  ) => void;

  // === OPERATIONS ===
  initializeThread: (thread: ChatThread, participants: ChatParticipant[], messages: UIMessage[]) => void;
  resetForThreadNavigation: () => void;
  resetToOverview: () => void;
  resetToNewChat: () => void;
  completeStreaming: () => void;
  updateParticipants: (participants: ChatParticipant[]) => void;
  prepareForNewMessage: () => void;
  startRegeneration: (roundNumber: number) => void;
  completeRegeneration: () => void;

  // === EXTERNAL CALLBACKS (set by provider) ===
  chatStop: (() => void) | null;
  setChatStop: (stop: (() => void) | null) => void;
};

export type ChatStore = ChatStoreState & ChatStoreActions;

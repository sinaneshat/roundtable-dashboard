/**
 * Simplified Chat Store Schemas - V2
 *
 * Consolidates 15 slices into 4 domains:
 * 1. Thread - conversation data (thread, participants, messages)
 * 2. Round - round lifecycle (uses FlowState from flow-machine)
 * 3. Form - user input state
 * 4. PreSearch - web search results
 *
 * DESIGN PRINCIPLES:
 * - Single source of truth for types via Zod schemas
 * - No complex state combinations (FlowState handles phase)
 * - No resumption state (backend queue completes rounds)
 * - Minimal animation state (CSS handles transitions)
 */

import type {
  FeedbackTypeSchema,
} from '@roundtable/shared';
import {
  ChatModeSchema,
  MessageStatusSchema,
} from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { z } from 'zod';

import { ChatParticipantSchema, ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';
import type {
  ApiChangelog,
  ThreadDetailData,
} from '@/services/api';

import type { FlowState } from './flow-machine';

// ============================================================================
// BACKEND RESPONSE TYPE (For syncFromBackend action)
// ============================================================================

/**
 * Backend thread response type - used by syncFromBackend action
 * Derived from ThreadDetailData (Hono RPC type inference)
 *
 * Contains:
 * - thread: Chat thread entity
 * - participants: Array of enabled/disabled participants
 * - messages: Array of chat messages (ChatMessage format, NOT UIMessage)
 * - changelog: Array of configuration changes
 * - feedback: Optional array of round feedback
 * - preSearches: Optional array of pre-search results
 * - user: Thread owner info
 */
export type BackendThreadResponse = ThreadDetailData;

/**
 * Changelog entry type - derived from API response
 */
export type Changelog = ApiChangelog;

/**
 * Thread user info type - subset of user data returned with thread
 */
export type ThreadUser = BackendThreadResponse['user'];

// ============================================================================
// THREAD DOMAIN SCHEMAS
// ============================================================================

/**
 * Thread entity from API
 */
export const ThreadSchema = z.object({
  id: z.string(),
  slug: z.string(),
  userId: z.string(),
  title: z.string().nullable(),
  mode: ChatModeSchema,
  status: z.enum(['active', 'archived', 'deleted']),
  isPublic: z.boolean(),
  enableWebSearch: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Thread = z.infer<typeof ThreadSchema>;

/**
 * Participant configuration for form
 */
export type ParticipantConfig = z.infer<typeof ParticipantConfigSchema>;

/**
 * Chat participant with full metadata
 */
export type ChatParticipant = z.infer<typeof ChatParticipantSchema>;

/**
 * Thread user schema - subset of user data returned with thread
 */
export const ThreadUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
});

/**
 * Thread domain state
 */
export const ThreadStateSchema = z.object({
  thread: ThreadSchema.nullable(),
  participants: z.array(ChatParticipantSchema),
  messages: z.custom<UIMessage[]>(),
  /** Thread changelog - configuration changes history */
  changelog: z.custom<Changelog[]>(),
  /** Thread owner info */
  threadUser: ThreadUserSchema.nullable(),
  error: z.string().nullable(),
});

export type ThreadState = z.infer<typeof ThreadStateSchema>;

// ============================================================================
// ROUND DOMAIN SCHEMAS
// ============================================================================

/**
 * Round domain state - controlled by FlowState machine
 * Replaces: isStreaming, isCreatingThread, isModeratorStreaming,
 *           waitingToStartStreaming, nextParticipantToTrigger, etc.
 */
export const RoundStateSchema = z.object({
  /** Flow state machine state - single source of truth for phase */
  flow: z.custom<FlowState>(),
  /** Thread ID created during this session (for navigation) */
  createdThreadId: z.string().nullable(),
  /** Slug for navigation after thread creation */
  createdSlug: z.string().nullable(),
});

export type RoundState = z.infer<typeof RoundStateSchema>;

// ============================================================================
// FORM DOMAIN SCHEMAS
// ============================================================================

/**
 * Chat mode type
 */
export type ChatMode = z.infer<typeof ChatModeSchema>;

/**
 * Form domain state - user input and configuration
 */
export const FormStateSchema = z.object({
  inputValue: z.string(),
  selectedMode: ChatModeSchema.nullable(),
  selectedParticipants: z.array(ParticipantConfigSchema),
  enableWebSearch: z.boolean(),
  /** Pending message to send after thread creation */
  pendingMessage: z.string().nullable(),
  /** Screen mode: overview, thread, or public */
  screenMode: z.enum(['overview', 'thread', 'public']),
});

export type FormState = z.infer<typeof FormStateSchema>;

// ============================================================================
// PRE-SEARCH DOMAIN SCHEMAS
// ============================================================================

/**
 * Pre-search result for a round
 */
export const PreSearchResultSchema = z.object({
  roundNumber: z.number(),
  status: MessageStatusSchema,
  query: z.string().nullable(),
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string().optional(),
  })).nullable(),
  startedAt: z.number().nullable(),
  completedAt: z.number().nullable(),
});

export type PreSearchResult = z.infer<typeof PreSearchResultSchema>;

/**
 * Pre-search domain state
 */
export const PreSearchStateSchema = z.object({
  /** Pre-search results by round number */
  preSearches: z.custom<Map<number, PreSearchResult>>(),
});

export type PreSearchState = z.infer<typeof PreSearchStateSchema>;

// ============================================================================
// UI STATE SCHEMAS (Minimal)
// ============================================================================

/**
 * Minimal UI state - most animation handled by CSS
 */
export const UIStateSchema = z.object({
  /** Whether initial data has loaded */
  hasInitiallyLoaded: z.boolean(),
  /** Title animation state */
  displayedTitle: z.string().nullable(),
  targetTitle: z.string().nullable(),
  isTitleAnimating: z.boolean(),
});

export type UIState = z.infer<typeof UIStateSchema>;

// ============================================================================
// FEEDBACK STATE SCHEMAS
// ============================================================================

export const FeedbackStateSchema = z.object({
  feedbackByRound: z.custom<Map<number, z.infer<typeof FeedbackTypeSchema> | null>>(),
});

export type FeedbackState = z.infer<typeof FeedbackStateSchema>;

// ============================================================================
// COMBINED STORE SCHEMA
// ============================================================================

/**
 * Complete store state - 4 domains + minimal UI + feedback
 */
export const ChatStoreStateSchema = z.object({
  // Thread domain
  ...ThreadStateSchema.shape,
  // Round domain
  ...RoundStateSchema.shape,
  // Form domain
  ...FormStateSchema.shape,
  // Pre-search domain
  ...PreSearchStateSchema.shape,
  // UI state
  ...UIStateSchema.shape,
  // Feedback state
  ...FeedbackStateSchema.shape,
});

export type ChatStoreState = z.infer<typeof ChatStoreStateSchema>;

// ============================================================================
// ACTION TYPES
// ============================================================================

/**
 * Simplified action types - grouped by domain
 */
export type ThreadActions = {
  setThread: (thread: Thread | null) => void;
  setParticipants: (participants: ChatParticipant[]) => void;
  setMessages: (messages: UIMessage[]) => void;
  addMessage: (message: UIMessage) => void;
  updateMessage: (id: string, update: Partial<UIMessage>) => void;
  setError: (error: string | null) => void;
  initializeThread: (thread: Thread, participants: ChatParticipant[], messages: UIMessage[]) => void;
  resetThread: () => void;
  /** Sync store state from backend response - ensures store = DB truth */
  syncFromBackend: (response: BackendThreadResponse) => void;
  /** Set changelog entries */
  setChangelog: (changelog: Changelog[]) => void;
  /** Set thread user info */
  setThreadUser: (user: ThreadUser | null) => void;
};

export type RoundActions = {
  dispatch: (event: import('./flow-machine').FlowEvent) => void;
  setCreatedThreadId: (id: string | null) => void;
  setCreatedSlug: (slug: string | null) => void;
};

export type FormActions = {
  setInputValue: (value: string) => void;
  setSelectedMode: (mode: ChatMode | null) => void;
  setSelectedParticipants: (participants: ParticipantConfig[]) => void;
  addParticipant: (participant: ParticipantConfig) => void;
  removeParticipant: (modelId: string) => void;
  updateParticipant: (modelId: string, update: Partial<ParticipantConfig>) => void;
  setEnableWebSearch: (enabled: boolean) => void;
  setPendingMessage: (message: string | null) => void;
  setScreenMode: (mode: 'overview' | 'thread' | 'public') => void;
  resetForm: () => void;
};

export type PreSearchActions = {
  setPreSearch: (roundNumber: number, result: PreSearchResult) => void;
  updatePreSearchStatus: (roundNumber: number, status: z.infer<typeof MessageStatusSchema>) => void;
  clearPreSearches: () => void;
  getPreSearchForRound: (roundNumber: number) => PreSearchResult | undefined;
  isPreSearchComplete: (roundNumber: number) => boolean;
};

export type UIActions = {
  setHasInitiallyLoaded: (loaded: boolean) => void;
  startTitleAnimation: (targetTitle: string) => void;
  updateDisplayedTitle: (title: string) => void;
  completeTitleAnimation: () => void;
};

export type FeedbackActions = {
  setFeedback: (roundNumber: number, feedback: z.infer<typeof FeedbackTypeSchema> | null) => void;
  getFeedback: (roundNumber: number) => z.infer<typeof FeedbackTypeSchema> | null;
};

/**
 * Complete store actions
 */
export type ChatStoreActions
  = & ThreadActions
    & RoundActions
    & FormActions
    & PreSearchActions
    & UIActions
    & FeedbackActions;

/**
 * Complete store type
 */
export type ChatStore = ChatStoreState & ChatStoreActions;

/**
 * Minimal Chat Store Defaults - Complete Rewrite
 *
 * Single source of truth for all default values.
 */

import { ChatModes, ModelIds, ScreenModes } from '@roundtable/shared';

import type {
  AttachmentsState,
  ChangelogState,
  ChatPhase,
  FormState,
  PreSearchState,
  SubscriptionState,
  ThreadState,
  TitleAnimationState,
  TrackingState,
  UIState,
} from './store-schemas';
import { ChatPhases } from './store-schemas';

// ============================================================================
// DEFAULT PRESET CONFIG
// ============================================================================

export const DEFAULT_PRESET_MODE = ChatModes.ANALYZING;

export const DEFAULT_PRESET_PARTICIPANTS = [
  { id: ModelIds.OPENAI_GPT_4O_MINI, modelId: ModelIds.OPENAI_GPT_4O_MINI, priority: 0, role: 'Analyst' },
  { id: ModelIds.GOOGLE_GEMINI_2_5_FLASH, modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH, priority: 1, role: 'Challenger' },
  { id: ModelIds.DEEPSEEK_DEEPSEEK_CHAT_V3_0324, modelId: ModelIds.DEEPSEEK_DEEPSEEK_CHAT_V3_0324, priority: 2, role: 'Synthesizer' },
];

// ============================================================================
// SLICE DEFAULTS
// ============================================================================

export const THREAD_DEFAULTS: ThreadState = {
  activeRoundParticipantCount: 0,
  currentParticipantIndex: 0,
  currentRoundNumber: null,
  error: null,
  expectedModelIds: null,
  hasSentPendingMessage: false,
  isRegenerating: false,
  isStreaming: false,
  messages: [],
  participants: [],
  phase: ChatPhases.IDLE as ChatPhase,
  regeneratingRoundNumber: null,
  streamingRoundNumber: null,
  thread: null,
};

export const FORM_DEFAULTS: FormState = {
  autoMode: true,
  enableWebSearch: false,
  inputValue: '',
  modelOrder: [],
  pendingMessage: null,
  selectedMode: DEFAULT_PRESET_MODE,
  selectedParticipants: DEFAULT_PRESET_PARTICIPANTS,
};

export const UI_DEFAULTS: UIState = {
  createdThreadId: null,
  createdThreadProjectId: null,
  hasInitiallyLoaded: false,
  isAnalyzingPrompt: false,
  isCreatingThread: false,
  isModeratorStreaming: false,
  screenMode: ScreenModes.OVERVIEW,
  showInitialUI: true,
  waitingToStartStreaming: false,
};

export const ATTACHMENTS_DEFAULTS: AttachmentsState = {
  pendingAttachmentIds: null,
  pendingAttachments: [],
  pendingFileParts: null,
};

export const PRESEARCH_DEFAULTS: PreSearchState = {
  preSearches: [],
};

export const CHANGELOG_DEFAULTS: ChangelogState = {
  changelogItems: [],
};

export const TITLE_ANIMATION_DEFAULTS: TitleAnimationState = {
  animatingThreadId: null,
  animationPhase: 'idle',
  displayedTitle: null,
  newTitle: null,
  oldTitle: null,
};

export const TRACKING_DEFAULTS: TrackingState = {
  preSearchActivityTimes: new Map<number, number>(),
  triggeredModeratorIds: new Set<string>(),
  triggeredModeratorRounds: new Set<number>(),
  triggeredPreSearchRounds: new Set<number>(),
};

// ============================================================================
// SUBSCRIPTION DEFAULTS (Backend-First Architecture)
// ============================================================================

const DEFAULT_ENTITY_SUBSCRIPTION_STATE = {
  errorMessage: undefined,
  lastSeq: 0,
  status: 'idle' as const,
};

export const SUBSCRIPTION_DEFAULTS: SubscriptionState = {
  activeRoundNumber: -1,
  moderator: { ...DEFAULT_ENTITY_SUBSCRIPTION_STATE },
  participants: [],
  presearch: { ...DEFAULT_ENTITY_SUBSCRIPTION_STATE },
};

// ============================================================================
// COMPLETE STORE DEFAULT
// ============================================================================

export const STORE_DEFAULTS = {
  ...THREAD_DEFAULTS,
  ...FORM_DEFAULTS,
  ...UI_DEFAULTS,
  ...ATTACHMENTS_DEFAULTS,
  ...PRESEARCH_DEFAULTS,
  ...CHANGELOG_DEFAULTS,
  ...TITLE_ANIMATION_DEFAULTS,
  ...TRACKING_DEFAULTS,
  subscriptionState: SUBSCRIPTION_DEFAULTS,
};

// ============================================================================
// RESET STATES
// ============================================================================

/** Reset for thread navigation (between threads) */
export const THREAD_NAVIGATION_RESET = {
  ...THREAD_DEFAULTS,
  changelogItems: [],
  createdThreadId: null,
  createdThreadProjectId: null,
  hasInitiallyLoaded: false,
  isCreatingThread: false,
  preSearchActivityTimes: new Map<number, number>(),
  preSearches: [],
  triggeredModeratorIds: new Set<string>(),
  triggeredModeratorRounds: new Set<number>(),
  triggeredPreSearchRounds: new Set<number>(),
};

/** Reset for returning to overview */
export const OVERVIEW_RESET = {
  ...STORE_DEFAULTS,
  preSearchActivityTimes: new Map<number, number>(),
  triggeredModeratorIds: new Set<string>(),
  triggeredModeratorRounds: new Set<number>(),
  triggeredPreSearchRounds: new Set<number>(),
};

/** Streaming complete reset */
export const STREAMING_COMPLETE_RESET = {
  currentParticipantIndex: 0,
  isStreaming: false,
  streamingRoundNumber: null,
  waitingToStartStreaming: false,
};

// ============================================================================
// AUTO MODE FALLBACK CONFIG
// ============================================================================

/** Fallback config when auto mode analysis fails */
export const AUTO_MODE_FALLBACK_CONFIG = {
  enableWebSearch: false,
  mode: DEFAULT_PRESET_MODE,
  participants: DEFAULT_PRESET_PARTICIPANTS,
};

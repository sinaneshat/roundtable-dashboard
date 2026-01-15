/**
 * Config Barrel Export
 *
 * Single import point for all configuration utilities.
 */

// Chat modes UI configuration
export type { ChatModeConfig, ChatModeMetadata, ChatModeOption } from './chat-modes';
export {
  CHAT_MODE_CONFIGS,
  getChatModeById,
  getChatModeIcon,
  getChatModeLabel,
  getChatModeOptions,
  getDefaultChatMode,
  getEnabledChatModes,
} from './chat-modes';

// Credit configuration
export { CREDIT_CONFIG, PLAN_NAMES } from './credit-config';

// Model presets configuration
export type {
  ModelPreset,
  ModelPresetId,
  PresetFilterResult,
  PresetModelRole,
  PresetSelectionResult,
  PresetWithLockStatus,
  ToastNamespace,
} from './model-presets';
export {
  canAccessPreset,
  DEFAULT_MODEL_PRESET_ID,
  DEFAULT_TOAST_NAMESPACE,
  filterPresetParticipants,
  getModelIdsForPreset,
  getPresetById,
  getPresetsForTier,
  MODEL_PRESET_IDS,
  MODEL_PRESETS,
  ModelPresetIds,
  ModelPresetIdSchema,
  ModelPresetSchema,
  PresetFilterResultSchema,
  PresetModelRoleSchema,
  PresetSelectionResultSchema,
  PresetWithLockStatusSchema,
  TOAST_NAMESPACES,
  ToastNamespaces,
  ToastNamespaceSchema,
} from './model-presets';

// Participant limits configuration
export {
  MAX_PARTICIPANTS_LIMIT,
  MIN_PARTICIPANTS_REQUIRED,
} from './participant-limits';

// Participant settings configuration
export type { ParticipantSettings } from './participant-settings';
export {
  DEFAULT_PARTICIPANT_SETTINGS,
  normalizeParticipantSettings,
  ParticipantSettingsSchema,
} from './participant-settings';

// Role prompts configuration
export { createRoleSystemPrompt } from './role-prompts';

// Tier names configuration
export {
  getTierDisplayName,
  SUBSCRIPTION_TIER_NAMES,
} from './tier-names';

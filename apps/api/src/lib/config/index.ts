/**
 * Config Barrel Export
 *
 * Single import point for all configuration utilities.
 *
 * NOTE: Hono context-dependent utilities (getWebappEnvFromContext, getAllowedOriginsFromContext,
 * isDevelopmentFromContext) are NOT exported here. Import directly from '@/lib/config/base-urls'
 * for those utilities that require Context<ApiEnv>.
 *
 * NOTE: UI configuration (chat-modes, model-presets) are not included here.
 * They live in the web package as they reference components/icons.
 */

// Base URLs configuration (non-context-dependent utilities only)
export type { WebappEnv } from './base-urls';
export {
  BASE_URLS,
  DEFAULT_WEBAPP_ENV,
  getApiBaseUrl,
  getApiUrlAsync,
  getAppBaseUrl,
  getBaseUrls,
  getProductionApiUrl,
  getWebappEnv,
  getWebappEnvAsync,
  isWebappEnv,
  WEBAPP_ENVS,
  WebAppEnvs,
  WebappEnvSchema,
} from './base-urls';

// Participant limits configuration
export {
  EXAMPLE_PARTICIPANT_COUNTS,
  getExampleParticipantCount,
  MAX_PARTICIPANTS_LIMIT,
  MIN_PARTICIPANTS_REQUIRED,
  MIN_PARTICIPANTS_TO_SEND,
} from './participant-limits';

// Participant settings configuration
export type { ParticipantSettings } from './participant-settings';
export {
  DEFAULT_PARTICIPANT_SETTINGS,
  normalizeParticipantSettings,
  ParticipantSettingsSchema,
} from './participant-settings';

// Tier names configuration
export {
  getTierDisplayName,
  SUBSCRIPTION_TIER_NAMES,
} from './tier-names';

// Credit configuration (re-exported from shared package)
export { CREDIT_CONFIG, PLAN_NAMES } from '@roundtable/shared';

// Role prompts configuration (re-exported from shared package)
export { createRoleSystemPrompt } from '@roundtable/shared';

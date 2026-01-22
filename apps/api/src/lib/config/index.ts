/**
 * Config Barrel Export
 *
 * Single import point for all configuration utilities.
 *
 * NOTE: Hono context-dependent utilities (getWebappEnvFromContext, getAllowedOriginsFromContext,
 * isDevelopmentFromContext) are NOT exported here. Import directly from '@/lib/config/base-urls'
 * for those utilities that require Context<ApiEnv>.
 *
 * NOTE: For WebAppEnv types/schemas, import directly from @roundtable/shared/enums
 *       For BASE_URL_CONFIG, CREDIT_CONFIG, etc., import directly from @roundtable/shared
 *
 * NOTE: UI configuration (chat-modes, model-presets) are not included here.
 * They live in the web package as they reference components/icons.
 */

// Base URLs configuration (non-context-dependent utilities only)
export {
  getApiBaseUrl,
  getApiServerOrigin,
  getApiUrlAsync,
  getAppBaseUrl,
  getBaseUrls,
  getProductionApiUrl,
  getWebappEnv,
  getWebappEnvAsync,
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

// For CREDIT_CONFIG, SUBSCRIPTION_TIER_NAMES, PLAN_NAMES, etc., import directly from @roundtable/shared
// For createRoleSystemPrompt, getTierDisplayName, import directly from @roundtable/shared

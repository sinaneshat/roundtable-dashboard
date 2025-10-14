/**
 * API Services Barrel Export
 *
 * ✅ SINGLE SOURCE OF TRUTH: Export only what's needed
 * ✅ NO RE-EXPORTS: Direct exports from this file only
 * ✅ EXPLICIT EXPORTS: Each export is intentional and documented
 *
 * Following backend-patterns.md:
 * - Services are the business logic layer
 * - Export only public API, keep internals private
 * - No wildcard exports (*), only explicit exports
 */

/* eslint-disable simple-import-sort/exports, perfectionist/sort-exports */

export {
  type GenerateTextParams,
  initializeOpenRouter,
  openRouterService,
} from './openrouter.service';
export {
  calculateRetryDelay,
  classifyOpenRouterError,
} from './openrouter-error-handler';
export { openRouterModelsService } from './openrouter-models.service';
export {
  MAX_RETRY_ATTEMPTS,
  retryParticipantStream,
  type RetryResult,
  type StreamFunction,
} from './participant-retry.service';
export {
  AI_RETRY_CONFIG,
  AI_TIMEOUT_CONFIG,
  canAccessModelByPricing,
  costPerMillion,
  DEFAULT_AI_PARAMS,
  getAIParamsForMode,
  getDefaultModelForTier,
  getMaxModelPricingForTier,
  getMaxModelsForTier,
  getMaxOutputTokensForTier,
  getModelCostCategory,
  getModelPricingDisplay,
  getQuickStartModelsByTier,
  getRequiredTierForModel,
  getTierFromProductId,
  getTierName,
  getTiersInOrder,
  getTierUpgradeMessage,
  isModelFree,
  MAX_MODEL_PRICING_BY_TIER,
  MAX_MODELS_BY_TIER,
  MAX_OUTPUT_TOKENS_BY_TIER,
  MODE_SPECIFIC_AI_PARAMS,
  parsePrice,
  SUBSCRIPTION_TIER_NAMES,
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
  subscriptionTierSchema,
  TIER_QUOTAS,
  TITLE_GENERATION_CONFIG,
} from './product-logic.service';
export {
  generateUniqueSlug,
  updateThreadSlug,
} from './slug-generator.service';
export {
  syncStripeDataFromStripe,
} from './stripe-sync.service';
export {
  stripeService,
} from './stripe.service';
export {
  autoGenerateThreadTitle,
  generateTitleFromMessage,
  updateThreadTitleAndSlug,
} from './title-generator.service';
export {
  canAddMoreModels,
  checkCustomRoleQuota,
  checkMessageQuota,
  checkThreadQuota,
  enforceCustomRoleQuota,
  enforceMessageQuota,
  enforceThreadQuota,
  ensureUserUsageRecord,
  getMaxModels,
  getMaxModelsErrorMessage,
  getUserUsageStats,
  incrementCustomRoleUsage,
  incrementMessageUsage,
  incrementThreadUsage,
  syncUserQuotaFromSubscription,
} from './usage-tracking.service';

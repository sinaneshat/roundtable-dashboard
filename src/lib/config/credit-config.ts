import type { ModelPricingTier, PlanType } from '@/api/core/enums/billing';
import {
  MODEL_TIER_CREDIT_MULTIPLIERS,
  ModelPricingTiers,
  PlanTypes,
} from '@/api/core/enums/billing';

export const CREDIT_CONFIG = {
  // Base conversion: 1 credit = 1,000 tokens (before multiplier)
  TOKENS_PER_CREDIT: 1000,

  // Free tier signup bonus (one-time grant)
  SIGNUP_CREDITS: 5_000,

  // Plan configurations
  PLANS: {
    [PlanTypes.PAID]: {
      signupCredits: 0,
      // 100K base credits/month - with multipliers this ensures profitability:
      // - Budget models (1x): 100K credits = 100M tokens @ ~$25 cost
      // - Standard models (3x): 33K effective = 33M tokens @ ~$28 cost
      // - Pro models (25x): 4K effective = 4M tokens @ ~$27 cost
      // - Flagship models (75x): 1.3K effective = 1.3M tokens @ ~$25 cost
      // - Ultimate models (200x): 500 effective = 500K tokens @ ~$25 cost
      // All scenarios yield ~$25-30 cost on $59 revenue = ~50% margin
      monthlyCredits: 100_000,
      priceInCents: 5900,
      stripeProductId: 'prod_Tf8t3FTCKcpVDq',
      stripePriceId: 'price_1Smaap52vWNZ3v8w4wEjE10y',
    },
  } satisfies Record<Exclude<PlanType, 'free'>, {
    signupCredits: number;
    monthlyCredits: number;
    priceInCents: number;
    stripeProductId: string;
    stripePriceId: string;
  }>,

  // Fixed action costs (in tokens, will be converted to credits with multiplier)
  ACTION_COSTS: {
    threadCreation: 100, // ~0.1 credits at 1x
    webSearchQuery: 500, // ~0.5 credits at 1x (web search uses tokens)
    fileReading: 100, // ~0.1 credits at 1x (file analysis uses tokens)
    analysisGeneration: 2000, // ~2 credits at 1x
    customRoleCreation: 50, // ~0.05 credits at 1x
  },

  // Reservation system config
  RESERVATION_MULTIPLIER: 1.5, // Reserve 50% extra for safety
  MIN_CREDITS_FOR_STREAMING: 10, // Minimum credits required to start streaming

  // Estimation defaults (in tokens)
  DEFAULT_ESTIMATED_TOKENS_PER_RESPONSE: 2000,
  DEFAULT_ESTIMATED_INPUT_TOKENS: 500,

  // Model tier multipliers (re-exported from enums for convenience)
  TIER_MULTIPLIERS: MODEL_TIER_CREDIT_MULTIPLIERS,

  // Default tier for unknown models (safe default - not cheapest)
  DEFAULT_MODEL_TIER: ModelPricingTiers.STANDARD as ModelPricingTier,
} as const;

export const PLAN_NAMES: Record<PlanType, string> = {
  [PlanTypes.FREE]: 'Free',
  [PlanTypes.PAID]: 'Pro',
} as const;

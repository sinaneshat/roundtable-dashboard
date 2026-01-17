import type { PlanType } from '@roundtable/shared/enums';
import {
  MODEL_TIER_CREDIT_MULTIPLIERS,
  ModelPricingTiers,
  PlanTypes,
  SIGNUP_BONUS_CREDITS,
  SubscriptionTiers,
  TIER_MONTHLY_CREDITS,
  TIER_PRICE_CENTS,
} from '@roundtable/shared/enums';

export const CREDIT_CONFIG = {
  TOKENS_PER_CREDIT: 1000,
  SIGNUP_CREDITS: SIGNUP_BONUS_CREDITS,

  PLANS: {
    [PlanTypes.PAID]: {
      signupCredits: 0,
      monthlyCredits: TIER_MONTHLY_CREDITS[SubscriptionTiers.PRO],
      priceInCents: TIER_PRICE_CENTS[SubscriptionTiers.PRO],
    },
  } satisfies Record<Exclude<PlanType, 'free'>, {
    signupCredits: number;
    monthlyCredits: number;
    priceInCents: number;
  }>,

  ACTION_COSTS: {
    threadCreation: 100,
    webSearchQuery: 500,
    fileReading: 100,
    analysisGeneration: 2000,
    customRoleCreation: 50,
    autoModeAnalysis: 500, // ~500 tokens for prompt analysis (Gemini 2.5 Flash)
  },

  RESERVATION_MULTIPLIER: 1.5,
  MIN_CREDITS_FOR_STREAMING: 10,

  DEFAULT_ESTIMATED_TOKENS_PER_RESPONSE: 2000,
  DEFAULT_ESTIMATED_INPUT_TOKENS: 500,

  TIER_MULTIPLIERS: MODEL_TIER_CREDIT_MULTIPLIERS,

  DEFAULT_MODEL_TIER: ModelPricingTiers.STANDARD,
} as const;

export const PLAN_NAMES: Record<PlanType, string> = {
  [PlanTypes.FREE]: 'Free',
  [PlanTypes.PAID]: 'Pro',
} as const;

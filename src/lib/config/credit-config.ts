import type { PlanType } from '@/api/core/enums';
import {
  MODEL_TIER_CREDIT_MULTIPLIERS,
  ModelPricingTiers,
  PlanTypes,
} from '@/api/core/enums';

export const CREDIT_CONFIG = {
  TOKENS_PER_CREDIT: 1000,
  SIGNUP_CREDITS: 5_000,

  PLANS: {
    [PlanTypes.PAID]: {
      signupCredits: 0,
      monthlyCredits: 100_000,
      priceInCents: 5900,
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

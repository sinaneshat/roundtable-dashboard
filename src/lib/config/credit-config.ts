/**
 * Credit Configuration - Shared Between Frontend and Backend
 *
 * Defines all credit-related constants, plan configurations, and pricing.
 * All actions are priced in tokens, then converted to credits.
 */

export const CREDIT_CONFIG = {
  /**
   * Conversion ratio: 1 credit = X tokens
   * Using 1000 for human-readable credit amounts
   * e.g., 5000 tokens = 5 credits
   */
  TOKENS_PER_CREDIT: 1000,

  /**
   * Plan configurations
   * Stripe IDs reference products in test mode
   */
  PLANS: {
    free: {
      signupCredits: 0, // NO credits on signup - must connect card first
      cardConnectionCredits: 10_000, // Credits given when user connects card to free plan
      monthlyCredits: 0, // No monthly renewal
      priceInCents: 0,
      payAsYouGoEnabled: false, // NO auto-charge - users must purchase credit packs
      stripeProductId: 'prod_Tf8tvljsdhgeaH',
      stripePriceId: 'price_1Shoc852vWNZ3v8wtrMKFJxe',
    },
    paid: {
      signupCredits: 0, // No signup bonus (subscription provides credits)
      monthlyCredits: 1_000_000, // 1M credits/month
      priceInCents: 10000, // $100/month
      annualPriceInCents: 100000, // $1000/year (~17% savings)
      payAsYouGoEnabled: true, // Can buy extra credits
      stripeProductId: 'prod_Tf8t3FTCKcpVDq',
      stripePriceId: 'price_1Shoc952vWNZ3v8wCuBiKKIA', // Monthly
      stripeAnnualPriceId: 'price_1ShqYV52vWNZ3v8wB8G9Cy0X', // Annual
    },
  },

  /**
   * Custom credits product for one-time purchases
   * Users can buy preset amounts or custom quantities
   */
  CUSTOM_CREDITS: {
    stripeProductId: 'prod_Tf8ttpjBZtWGbe',
    // Preset credit packages (priceId -> credits)
    packages: {
      price_1Shoc952vWNZ3v8wGVhL81lr: 1_000, // $1 = 1K credits
      price_1ShocZ52vWNZ3v8wJ2XEoviR: 10_000, // $10 = 10K credits
      price_1ShocZ52vWNZ3v8waD6wRNGa: 50_000, // $50 = 50K credits
      price_1Shoca52vWNZ3v8wO9HKh4Kq: 100_000, // $100 = 100K credits
      price_1Shocb52vWNZ3v8w1vlOjP9y: 500_000, // $500 = 500K credits
    },
    // Conversion: $1 = 1,000 credits
    creditsPerDollar: 1000,
  },

  /**
   * Action costs in tokens (will be converted to credits)
   * These are flat costs for non-AI actions
   */
  ACTION_COSTS: {
    threadCreation: 100, // Creating a new thread
    webSearchQuery: 500, // Per web search query
    fileReading: 100, // Per file processed
    analysisGeneration: 2000, // Moderator analysis per round
    customRoleCreation: 50, // Creating a custom role template
  },

  /**
   * Reservation multiplier for pre-authorizing credits before streaming
   * Reserve 150% of estimated cost to prevent overdraft
   */
  RESERVATION_MULTIPLIER: 1.5,

  /**
   * Minimum credits required to start a streaming operation
   * Prevents starting operations that will immediately fail
   */
  MIN_CREDITS_FOR_STREAMING: 10,

  /**
   * Default estimated tokens per AI response (for pre-reservation)
   * Conservative estimate to prevent overdraft
   */
  DEFAULT_ESTIMATED_TOKENS_PER_RESPONSE: 2000,
} as const;

/**
 * Plan type for credit-based billing
 */
export type CreditPlanType = keyof typeof CREDIT_CONFIG.PLANS;

/**
 * Human-readable plan names
 */
export const PLAN_NAMES: Record<CreditPlanType, string> = {
  free: 'Free',
  paid: 'Pro',
} as const;

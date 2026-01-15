import { z } from '@hono/zod-openapi';

import { PurchaseTypeSchema, StripeSubscriptionStatusSchema, SubscriptionTierSchema } from '@/api/core/enums';
import { CoreSchemas, createApiResponseSchema } from '@/api/core/schemas';
import {
  stripePriceSelectSchema,
  stripeProductSelectSchema,
  stripeSubscriptionSelectSchema,
} from '@/db/validation/billing';

// ============================================================================
// Product & Price Schemas
// ============================================================================

const PriceSchema = stripePriceSelectSchema
  .pick({
    id: true,
    productId: true,
    unitAmount: true,
    currency: true,
    interval: true,
    trialPeriodDays: true,
    active: true,
  })
  .openapi('Price');

const ProductSchema = stripeProductSelectSchema
  .pick({
    id: true,
    name: true,
    description: true,
    active: true,
    features: true,
  })
  .extend({
    prices: z.array(PriceSchema).optional().openapi({
      description: 'Available prices for this product',
    }),
  })
  .openapi('Product');

const ProductListPayloadSchema = z.object({
  items: z.array(ProductSchema).openapi({
    description: 'List of available products with prices',
  }),
  count: z.number().int().nonnegative().openapi({
    description: 'Total number of products',
    example: 3,
  }),
}).openapi('ProductListPayload');

export const ProductListResponseSchema = createApiResponseSchema(ProductListPayloadSchema).openapi('ProductListResponse');

const ProductDetailPayloadSchema = z.object({
  product: ProductSchema.openapi({
    description: 'Product details with associated prices',
  }),
}).openapi('ProductDetailPayload');

export const ProductDetailResponseSchema = createApiResponseSchema(ProductDetailPayloadSchema).openapi('ProductDetailResponse');

// ============================================================================
// Checkout Schemas
// ============================================================================

export const CheckoutRequestSchema = z.object({
  priceId: CoreSchemas.id().openapi({
    description: 'Stripe price ID for the subscription',
    example: 'price_1ABC123',
  }),
  successUrl: CoreSchemas.url().optional().openapi({
    description: 'Redirect URL after successful checkout (defaults to /chat)',
    example: 'https://app.example.com/chat',
  }),
  cancelUrl: CoreSchemas.url().optional().openapi({
    description: 'Redirect URL if checkout is canceled (defaults to /chat/pricing)',
    example: 'https://app.example.com/chat/pricing',
  }),
}).openapi('CheckoutRequest');

const CheckoutPayloadSchema = z.object({
  sessionId: CoreSchemas.id().openapi({
    description: 'Stripe checkout session ID',
    example: 'cs_test_a1b2c3d4e5f6g7h8i9j0',
  }),
  url: CoreSchemas.url().openapi({
    description: 'Stripe checkout URL to redirect user to',
    example: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6g7h8i9j0',
  }),
}).openapi('CheckoutPayload');

export const CheckoutResponseSchema = createApiResponseSchema(CheckoutPayloadSchema).openapi('CheckoutResponse');

// ============================================================================
// Customer Portal Schemas
// ============================================================================

export const CustomerPortalRequestSchema = z.object({
  returnUrl: CoreSchemas.url().optional().openapi({
    description: 'URL to redirect to after customer portal session (defaults to /chat)',
    example: 'https://app.example.com/chat',
  }),
}).openapi('CustomerPortalRequest');

const CustomerPortalPayloadSchema = z.object({
  url: CoreSchemas.url().openapi({
    description: 'Stripe customer portal URL to redirect user to',
    example: 'https://billing.stripe.com/p/session/test_abc123',
  }),
}).openapi('CustomerPortalPayload');

export const CustomerPortalResponseSchema = createApiResponseSchema(CustomerPortalPayloadSchema).openapi('CustomerPortalResponse');

// ============================================================================
// Subscription Schemas
// ============================================================================

const SubscriptionSchema = stripeSubscriptionSelectSchema
  .pick({
    id: true,
    status: true,
    priceId: true,
    cancelAtPeriodEnd: true,
  })
  .extend({
    currentPeriodStart: z.string().openapi({ description: 'Current period start date (ISO string)' }),
    currentPeriodEnd: z.string().openapi({ description: 'Current period end date (ISO string)' }),
    canceledAt: z.string().nullable().openapi({ description: 'Cancellation date (ISO string or null)' }),
    trialStart: z.string().nullable().openapi({ description: 'Trial start date (ISO string or null)' }),
    trialEnd: z.string().nullable().openapi({ description: 'Trial end date (ISO string or null)' }),
    price: stripePriceSelectSchema
      .pick({ productId: true })
      .openapi({
        description: 'Price details with product ID',
      }),
  })
  .openapi('Subscription');

const SubscriptionListPayloadSchema = z.object({
  items: z.array(SubscriptionSchema).openapi({
    description: 'List of user subscriptions',
  }),
  count: z.number().int().nonnegative().openapi({
    description: 'Total number of subscriptions',
    example: 2,
  }),
}).openapi('SubscriptionListPayload');

export const SubscriptionListResponseSchema = createApiResponseSchema(SubscriptionListPayloadSchema).openapi('SubscriptionListResponse');

const SubscriptionDetailPayloadSchema = z.object({
  subscription: SubscriptionSchema.openapi({
    description: 'Subscription details with current status and billing information',
  }),
}).openapi('SubscriptionDetailPayload');

export const SubscriptionDetailResponseSchema = createApiResponseSchema(SubscriptionDetailPayloadSchema).openapi('SubscriptionDetailResponse');

// ============================================================================
// Webhook Schemas
// ============================================================================

const WebhookPayloadSchema = z.object({
  received: z.boolean().openapi({
    description: 'Whether webhook was received successfully',
    example: true,
  }),
  event: z.object({
    id: z.string().openapi({
      description: 'Stripe event ID',
      example: 'evt_1ABC123',
    }),
    type: z.string().openapi({
      description: 'Stripe event type',
      example: 'customer.subscription.updated',
    }),
    processed: z.boolean().openapi({
      description: 'Whether event was processed',
      example: true,
    }),
  }).optional().openapi({
    description: 'Webhook event details',
  }),
}).openapi('WebhookPayload');

export const WebhookResponseSchema = createApiResponseSchema(WebhookPayloadSchema).openapi('WebhookResponse');

// ============================================================================
// Subscription Management Schemas (Switch/Cancel)
// ============================================================================

export const SwitchSubscriptionRequestSchema = z.object({
  newPriceId: CoreSchemas.id().openapi({
    description: 'New Stripe price ID to switch to (handles both upgrades and downgrades automatically)',
    example: 'price_1ABC456',
  }),
}).openapi('SwitchSubscriptionRequest');

export const CancelSubscriptionRequestSchema = z.object({
  immediately: z.boolean().optional().default(false).openapi({
    description: 'Cancel immediately (true) or at period end (false, default)',
    example: false,
  }),
}).openapi('CancelSubscriptionRequest');

const SubscriptionChangePayloadSchema = z.object({
  subscription: SubscriptionSchema.openapi({
    description: 'Updated subscription details',
  }),
  message: z.string().openapi({
    description: 'Success message describing the change',
    example: 'Subscription upgraded successfully',
  }),
  changeDetails: z.object({
    oldPrice: PriceSchema.openapi({
      description: 'Previous price details before the change',
    }),
    newPrice: PriceSchema.openapi({
      description: 'New price details after the change',
    }),
    isUpgrade: z.boolean().openapi({
      description: 'Whether this change is an upgrade (true) or downgrade (false)',
      example: true,
    }),
    isDowngrade: z.boolean().openapi({
      description: 'Whether this change is a downgrade (true) or upgrade (false)',
      example: false,
    }),
  }).optional().openapi({
    description: 'Details about the subscription change for showing before/after comparison',
  }),
}).openapi('SubscriptionChangePayload');

export const SubscriptionChangeResponseSchema = createApiResponseSchema(SubscriptionChangePayloadSchema).openapi('SubscriptionChangeResponse');

export type Product = z.infer<typeof ProductSchema>;
export type Price = z.infer<typeof PriceSchema>;
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

// ============================================================================
// Sync Response Schemas
// ============================================================================

export const SyncedSubscriptionStateSchema = z.object({
  status: StripeSubscriptionStatusSchema.openapi({
    description: 'Subscription status',
    example: 'active',
  }),
  subscriptionId: z.string().openapi({
    description: 'Stripe subscription ID',
    example: 'sub_ABC123',
  }),
}).openapi('SyncedSubscriptionState');

const TierChangeSchema = z.object({
  previousTier: SubscriptionTierSchema.openapi({
    description: 'Previous subscription tier before sync',
    example: 'free',
  }),
  newTier: SubscriptionTierSchema.openapi({
    description: 'New subscription tier after sync',
    example: 'pro',
  }),
  previousPriceId: z.string().nullable().openapi({
    description: 'Previous Stripe price ID (null for free tier)',
    example: null,
  }),
  newPriceId: z.string().nullable().openapi({
    description: 'New Stripe price ID (null for free tier)',
    example: 'price_1ABC123',
  }),
}).openapi('TierChange');

export const CreditPurchaseInfoSchema = z.object({
  creditsGranted: z.number().openapi({
    description: 'Number of credits granted from purchase',
    example: 10000,
  }),
  amountPaid: z.number().openapi({
    description: 'Amount paid in cents',
    example: 1000,
  }),
  currency: z.string().openapi({
    description: 'Currency of payment',
    example: 'usd',
  }),
}).openapi('CreditPurchaseInfo');

export const SyncAfterCheckoutPayloadSchema = z.object({
  synced: z.boolean().openapi({
    description: 'Whether sync was successful',
    example: true,
  }),
  purchaseType: PurchaseTypeSchema.openapi({
    description: 'Type of purchase that was made',
    example: 'subscription',
  }),
  subscription: SyncedSubscriptionStateSchema.nullable().openapi({
    description: 'Synced subscription state (for subscription purchases)',
  }),
  creditPurchase: CreditPurchaseInfoSchema.nullable().openapi({
    description: 'Credit purchase info (null for subscription-only purchases)',
  }),
  tierChange: TierChangeSchema.openapi({
    description: 'Tier change information for comparison UI',
  }),
  creditsBalance: z.number().openapi({
    description: 'Current credits balance after purchase',
    example: 10000,
  }),
}).openapi('SyncAfterCheckoutPayload');

export const SyncAfterCheckoutResponseSchema = createApiResponseSchema(
  SyncAfterCheckoutPayloadSchema,
).openapi('SyncAfterCheckoutResponse');

// ============================================================================
// Webhook Schemas
// ============================================================================

export const WebhookHeadersSchema = z.object({
  'stripe-signature': z.string().min(1).openapi({
    param: {
      name: 'stripe-signature',
      in: 'header',
    },
    example: 't=1234567890,v1=abcdef...',
    description: 'Stripe webhook signature for verification',
  }),
});

export const SyncCreditsAfterCheckoutPayloadSchema = z.object({
  synced: z.boolean().openapi({
    description: 'Whether sync was successful',
    example: true,
  }),
  creditPurchase: CreditPurchaseInfoSchema.nullable().openapi({
    description: 'Credit purchase info (null if no recent purchase found)',
  }),
  creditsBalance: z.number().openapi({
    description: 'Current credits balance after purchase',
    example: 10000,
  }),
}).openapi('SyncCreditsAfterCheckoutPayload');

export const SyncCreditsAfterCheckoutResponseSchema = createApiResponseSchema(
  SyncCreditsAfterCheckoutPayloadSchema,
).openapi('SyncCreditsAfterCheckoutResponse');

export type Subscription = z.infer<typeof SubscriptionSchema>;

// ============================================================================
// Internal Type Schemas (for handler serialization)
// ============================================================================

export const SubscriptionDateFieldsSchema = stripeSubscriptionSelectSchema.pick({
  currentPeriodStart: true,
  currentPeriodEnd: true,
  canceledAt: true,
  trialStart: true,
  trialEnd: true,
});

export type SubscriptionDateFields = z.infer<typeof SubscriptionDateFieldsSchema>;

export type SwitchSubscriptionRequest = z.infer<typeof SwitchSubscriptionRequestSchema>;
export type CancelSubscriptionRequest = z.infer<typeof CancelSubscriptionRequestSchema>;
export type SyncAfterCheckoutPayload = z.infer<typeof SyncAfterCheckoutPayloadSchema>;
export type SyncCreditsAfterCheckoutPayload = z.infer<typeof SyncCreditsAfterCheckoutPayloadSchema>;
export type WebhookHeaders = z.infer<typeof WebhookHeadersSchema>;

import { z } from '@hono/zod-openapi';
import type Stripe from 'stripe';

import { CoreSchemas, createApiResponseSchema } from '@/api/core/schemas';

// ============================================================================
// Path Parameter Schemas
// ============================================================================

export const ProductIdParamSchema = z.object({
  id: CoreSchemas.id().openapi({
    description: 'Stripe product ID',
    example: 'prod_ABC123',
  }),
});

export const SubscriptionIdParamSchema = z.object({
  id: CoreSchemas.id().openapi({
    description: 'Stripe subscription ID',
    example: 'sub_ABC123',
  }),
});

// ============================================================================
// Product & Price Schemas
// ============================================================================

const PriceSchema = z.object({
  id: z.string().openapi({
    example: 'price_1ABC123',
    description: 'Stripe price ID',
  }),
  productId: z.string().openapi({
    example: 'prod_ABC123',
    description: 'Stripe product ID',
  }),
  unitAmount: z.number().int().nonnegative().openapi({
    example: 999,
    description: 'Price in cents',
  }),
  currency: z.string().openapi({
    example: 'usd',
    description: 'Currency code',
  }),
  interval: z.enum(['month', 'year']).openapi({
    example: 'month',
    description: 'Billing interval',
  }),
  trialPeriodDays: z.number().int().nonnegative().nullable().openapi({
    example: 14,
    description: 'Trial days',
  }),
  active: z.boolean().openapi({
    example: true,
    description: 'Active status',
  }),
}).openapi('Price');

const ProductSchema = z.object({
  id: z.string().openapi({
    example: 'prod_ABC123',
    description: 'Stripe product ID',
  }),
  name: z.string().openapi({
    example: 'Professional Plan',
    description: 'Product name',
  }),
  description: z.string().nullable().openapi({
    example: 'For growing teams',
    description: 'Product description',
  }),
  features: z.array(z.string()).nullable().openapi({
    example: ['Feature 1', 'Feature 2'],
    description: 'Product features',
  }),
  active: z.boolean().openapi({
    example: true,
    description: 'Active status',
  }),
  prices: z.array(PriceSchema).optional().openapi({
    description: 'Available prices',
  }),
}).openapi('Product');

const ProductListPayloadSchema = z.object({
  products: z.array(ProductSchema).openapi({
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
  priceId: z.string().min(1).openapi({
    description: 'Stripe price ID for the subscription',
    example: 'price_1ABC123',
  }),
  successUrl: CoreSchemas.url().optional().openapi({
    description: 'URL to redirect to after successful checkout (defaults to /chat/billing/success). Do NOT include session_id parameter - success page will eagerly sync fresh data from Stripe API.',
    example: 'https://app.example.com/chat/billing/success',
  }),
  cancelUrl: CoreSchemas.url().optional().openapi({
    description: 'URL to redirect to if checkout is canceled (defaults to /chat/pricing)',
    example: 'https://app.example.com/chat/pricing',
  }),
}).openapi('CheckoutRequest');

const CheckoutPayloadSchema = z.object({
  sessionId: z.string().openapi({
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

const SubscriptionSchema = z.object({
  id: z.string().openapi({
    description: 'Stripe subscription ID',
    example: 'sub_ABC123',
  }),
  status: z.enum([
    'active',
    'past_due',
    'unpaid',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'trialing',
    'paused',
  ] as const).openapi({
    description: 'Subscription status (matches Stripe.Subscription.Status)',
    example: 'active',
  }),
  priceId: z.string().openapi({
    description: 'Stripe price ID',
    example: 'price_1ABC123',
  }),
  productId: z.string().openapi({
    description: 'Stripe product ID',
    example: 'prod_ABC123',
  }),
  currentPeriodStart: CoreSchemas.timestamp().openapi({
    description: 'Current billing period start timestamp',
    example: '2025-01-01T00:00:00.000Z',
  }),
  currentPeriodEnd: CoreSchemas.timestamp().openapi({
    description: 'Current billing period end timestamp',
    example: '2025-02-01T00:00:00.000Z',
  }),
  cancelAtPeriodEnd: z.boolean().openapi({
    description: 'Whether subscription will cancel at period end',
    example: false,
  }),
  canceledAt: CoreSchemas.timestamp().nullable().openapi({
    description: 'Timestamp when subscription was canceled',
    example: null,
  }),
  trialStart: CoreSchemas.timestamp().nullable().openapi({
    description: 'Trial period start timestamp',
    example: null,
  }),
  trialEnd: CoreSchemas.timestamp().nullable().openapi({
    description: 'Trial period end timestamp',
    example: null,
  }),
}).openapi('Subscription');

const SubscriptionListPayloadSchema = z.object({
  subscriptions: z.array(SubscriptionSchema).openapi({
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
  newPriceId: z.string().min(1).openapi({
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
}).openapi('SubscriptionChangePayload');

export const SubscriptionChangeResponseSchema = createApiResponseSchema(SubscriptionChangePayloadSchema).openapi('SubscriptionChangeResponse');

// ============================================================================
// TYPE EXPORTS FOR FRONTEND & BACKEND
// ============================================================================

// ============================================================================
// TYPE EXPORTS - Using Official Stripe SDK Types
// ============================================================================

export type Product = z.infer<typeof ProductSchema>;
export type Price = z.infer<typeof PriceSchema>;
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
export type Subscription = z.infer<typeof SubscriptionSchema>;

// Use official Stripe SDK type for subscription status
export type SubscriptionStatus = Stripe.Subscription.Status;

export type SwitchSubscriptionRequest = z.infer<typeof SwitchSubscriptionRequestSchema>;
export type CancelSubscriptionRequest = z.infer<typeof CancelSubscriptionRequestSchema>;

/**
 * Type-safe subscription response payload
 * Uses official Stripe.Subscription.Status type
 */
export type SubscriptionResponsePayload = {
  id: string;
  status: SubscriptionStatus; // Stripe.Subscription.Status
  priceId: string;
  productId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialStart: string | null;
  trialEnd: string | null;
};

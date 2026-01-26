/**
 * Billing Routes
 *
 * Product catalog, checkout, subscription management, and Stripe webhook endpoints
 */

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import {
  createMutationRouteResponses,
  createProtectedRouteResponses,
  createPublicRouteResponses,
  IdParamSchema,
  StandardApiResponses,
} from '@/core';

import {
  CancelSubscriptionRequestSchema,
  CheckoutRequestSchema,
  CheckoutResponseSchema,
  CustomerPortalRequestSchema,
  CustomerPortalResponseSchema,
  ProductDetailResponseSchema,
  ProductListResponseSchema,
  SubscriptionChangeResponseSchema,
  SubscriptionDetailResponseSchema,
  SubscriptionListResponseSchema,
  SwitchSubscriptionRequestSchema,
  SyncAfterCheckoutResponseSchema,
  SyncCreditsAfterCheckoutResponseSchema,
  WebhookHeadersSchema,
  WebhookResponseSchema,
} from './schema';

// ============================================================================
// Product Routes
// ============================================================================

export const listProductsRoute = createRoute({
  description: 'Get all active products with their pricing plans',
  method: 'get',
  path: '/billing/products',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ProductListResponseSchema },
      },
      description: 'Products retrieved successfully',
    },
    ...createPublicRouteResponses(),
  },
  summary: 'List all products',
  tags: ['billing'],
});

export const getProductRoute = createRoute({
  description: 'Get a specific product with all its pricing plans',
  method: 'get',
  path: '/billing/products/:id',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ProductDetailResponseSchema },
      },
      description: 'Product retrieved successfully',
    },
    ...createPublicRouteResponses(),
  },
  summary: 'Get product details',
  tags: ['billing'],
});

// ============================================================================
// Checkout Routes
// ============================================================================

export const createCheckoutSessionRoute = createRoute({
  description: 'Create a Stripe checkout session for subscription purchase',
  method: 'post',
  path: '/billing/checkout',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CheckoutRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: CheckoutResponseSchema },
      },
      description: 'Checkout session created successfully',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Create checkout session',
  tags: ['billing'],
});

// ============================================================================
// Customer Portal Routes
// ============================================================================

export const createCustomerPortalSessionRoute = createRoute({
  description: 'Create a Stripe customer portal session for managing subscriptions and billing',
  method: 'post',
  path: '/billing/portal',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CustomerPortalRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: CustomerPortalResponseSchema },
      },
      description: 'Customer portal session created successfully',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Create customer portal session',
  tags: ['billing'],
});

// ============================================================================
// Subscription Routes
// ============================================================================

export const listSubscriptionsRoute = createRoute({
  description: 'Get all subscriptions for the authenticated user',
  method: 'get',
  path: '/billing/subscriptions',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: SubscriptionListResponseSchema },
      },
      description: 'Subscriptions retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'List user subscriptions',
  tags: ['billing'],
});

export const getSubscriptionRoute = createRoute({
  description: 'Get details of a specific subscription',
  method: 'get',
  path: '/billing/subscriptions/:id',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: SubscriptionDetailResponseSchema },
      },
      description: 'Subscription retrieved successfully',
    },
    ...StandardApiResponses.FORBIDDEN,
    ...createProtectedRouteResponses(),
  },
  summary: 'Get subscription details',
  tags: ['billing'],
});

// ============================================================================
// Subscription Management Routes (Switch/Cancel)
// ============================================================================

export const switchSubscriptionRoute = createRoute({
  description: 'Switch the current subscription to a different price. Automatically handles upgrades (immediate with proration) and downgrades (at period end).',
  method: 'post',
  path: '/billing/subscriptions/:id/switch',
  request: {
    body: {
      content: {
        'application/json': {
          schema: SwitchSubscriptionRequestSchema,
        },
      },
      required: true,
    },
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: SubscriptionChangeResponseSchema },
      },
      description: 'Subscription switched successfully',
    },
    ...StandardApiResponses.FORBIDDEN,
    ...createMutationRouteResponses(),
  },
  summary: 'Switch subscription plan',
  tags: ['billing'],
});

export const cancelSubscriptionRoute = createRoute({
  description: 'Cancel the subscription either immediately or at the end of the current billing period (default).',
  method: 'post',
  path: '/billing/subscriptions/:id/cancel',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CancelSubscriptionRequestSchema,
        },
      },
      required: true,
    },
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: SubscriptionChangeResponseSchema },
      },
      description: 'Subscription canceled successfully',
    },
    ...StandardApiResponses.FORBIDDEN,
    ...createMutationRouteResponses(),
  },
  summary: 'Cancel subscription',
  tags: ['billing'],
});

// ============================================================================
// Sync Routes
// ============================================================================

export const syncAfterCheckoutRoute = createRoute({
  description: 'Eagerly sync Stripe subscription data after successful checkout to prevent race conditions with webhooks. For subscriptions only.',
  method: 'post',
  path: '/billing/sync-after-checkout',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: SyncAfterCheckoutResponseSchema,
        },
      },
      description: 'Stripe data synced successfully',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Sync Stripe subscription data after checkout',
  tags: ['billing'],
});

/**
 * Sync Credits After Checkout Route
 *
 * Theo's "Stay Sane with Stripe" pattern:
 * Separate endpoint for one-time credit purchases.
 * Simpler flow than subscriptions - just grant credits and return.
 */
export const syncCreditsAfterCheckoutRoute = createRoute({
  description: 'Process and grant credits after a one-time credit pack purchase. Separate from subscription flow for simplicity.',
  method: 'post',
  path: '/billing/sync-credits-after-checkout',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: SyncCreditsAfterCheckoutResponseSchema,
        },
      },
      description: 'Credits synced successfully',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Sync credits after one-time purchase',
  tags: ['billing'],
});

// ============================================================================
// Webhook Routes
// ============================================================================

export const handleWebhookRoute = createRoute({
  description: `Process Stripe webhook events using Theo's "Stay Sane with Stripe" pattern.

    This endpoint receives webhook events from Stripe and processes them by:
    1. Verifying the webhook signature for security
    2. Checking for duplicate events (idempotency)
    3. Extracting customer ID from the event payload
    4. Syncing fresh data from Stripe API (never trusting webhook payload)
    5. Updating database with the latest subscription and invoice states

    Tracked events: checkout.session.completed, customer.subscription.*, invoice.*, payment_intent.*`,
  method: 'post',
  path: '/webhooks/stripe',
  request: {
    headers: WebhookHeadersSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: WebhookResponseSchema },
      },
      description: 'Webhook received and processed successfully',
    },
    ...createPublicRouteResponses(),
  },
  summary: 'Handle Stripe webhooks',
  tags: ['billing'],
});

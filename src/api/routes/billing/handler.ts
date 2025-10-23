import type { RouteHandler } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { AppError, createError } from '@/api/common/error-handling';
import { createHandler, createHandlerWithBatch, Responses } from '@/api/core';
import { IdParamSchema } from '@/api/core/schemas';
import { stripeService } from '@/api/services/stripe.service';
import { getCustomerIdByUserId, syncStripeDataFromStripe } from '@/api/services/stripe-sync.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import { PriceCacheTags, ProductCacheTags, STATIC_CACHE_TAGS } from '@/db/cache/cache-tags';
import * as tables from '@/db/schema';

import type {
  cancelSubscriptionRoute,
  createCheckoutSessionRoute,
  createCustomerPortalSessionRoute,
  getProductRoute,
  getSubscriptionRoute,
  handleWebhookRoute,
  listProductsRoute,
  listSubscriptionsRoute,
  switchSubscriptionRoute,
  syncAfterCheckoutRoute,
} from './route';
import {
  CancelSubscriptionRequestSchema,
  CheckoutRequestSchema,
  CustomerPortalRequestSchema,
  SwitchSubscriptionRequestSchema,
} from './schema';

// ============================================================================
// Internal Helper Functions (Following 3-file pattern: handler, route, schema)
// ============================================================================

/**
 * Subscription Validation Utilities
 */
function validateSubscriptionOwnership(
  subscription: { userId: string },
  user: { id: string },
): boolean {
  return subscription.userId === user.id;
}

/**
 * Annual Savings Calculator
 * Calculates percentage saved when paying annually vs monthly
 */
function calculateAnnualSavings(prices: Array<{ interval: 'month' | 'year'; unitAmount: number }>): number | undefined {
  const monthlyPrice = prices.find(p => p.interval === 'month');
  const yearlyPrice = prices.find(p => p.interval === 'year');

  if (!monthlyPrice || !yearlyPrice || !monthlyPrice.unitAmount || !yearlyPrice.unitAmount) {
    return undefined;
  }

  const monthlyYearlyCost = monthlyPrice.unitAmount * 12;
  const yearlyCost = yearlyPrice.unitAmount;
  const savings = ((monthlyYearlyCost - yearlyCost) / monthlyYearlyCost) * 100;
  return Math.round(savings);
}

/**
 * Fetch refreshed subscription with nested price data
 * Used after subscription updates to get the latest state
 * ✅ NO TRANSFORMS: Returns Drizzle relation data directly
 */
async function fetchRefreshedSubscription(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  subscriptionId: string,
) {
  const subscription = await db.query.stripeSubscription.findFirst({
    where: eq(tables.stripeSubscription.id, subscriptionId),
    with: {
      price: {
        columns: { productId: true },
      },
    },
  });

  if (!subscription) {
    throw createError.internal(
      'Failed to fetch updated subscription',
      ErrorContextBuilders.database('select', 'stripeSubscription'),
    );
  }

  return subscription;
}

// ============================================================================
// Product Handlers
// ============================================================================

export const listProductsHandler: RouteHandler<typeof listProductsRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    operationName: 'listProducts',
  },
  async (c) => {
    try {
      const db = await getDbAsync();

      // ✅ CACHING ENABLED: Query builder API with 5-minute TTL for product catalog
      // Products change infrequently (admin updates), but read on every pricing page visit
      // Cache automatically invalidates when products or prices are updated
      // @see https://orm.drizzle.team/docs/cache

      // Step 1: Fetch active products (cacheable)
      const dbProducts = await db
        .select()
        .from(tables.stripeProduct)
        .where(eq(tables.stripeProduct.active, true))
        .$withCache({
          config: { ex: 300 }, // 5 minutes
          tag: STATIC_CACHE_TAGS.ACTIVE_PRODUCTS,
        });

      // Step 2: Fetch active prices (cacheable)
      const allPrices = await db
        .select()
        .from(tables.stripePrice)
        .where(eq(tables.stripePrice.active, true))
        .$withCache({
          config: { ex: 300 }, // 5 minutes
          tag: STATIC_CACHE_TAGS.ACTIVE_PRICES,
        });

      // Step 3: Join products with their prices and sort - minimal transformation
      const products = dbProducts
        .map((product) => {
          const productPrices = allPrices
            .filter(price => price.productId === product.id)
            .sort((a, b) => (a.unitAmount ?? 0) - (b.unitAmount ?? 0));

          const annualSavingsPercent = calculateAnnualSavings(
            productPrices.map(p => ({
              interval: (p.interval || 'month') as 'month' | 'year',
              unitAmount: p.unitAmount ?? 0,
            })),
          );

          return {
            ...product,
            prices: productPrices,
            annualSavingsPercent,
          };
        })
        .sort((a, b) => {
          const lowestPriceA = a.prices[0]?.unitAmount ?? 0;
          const lowestPriceB = b.prices[0]?.unitAmount ?? 0;
          return lowestPriceA - lowestPriceB;
        });

      return Responses.collection(c, products);
    } catch {
      throw createError.internal('Failed to retrieve products', ErrorContextBuilders.database('select', 'stripeProduct'));
    }
  },
);

export const getProductHandler: RouteHandler<typeof getProductRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    validateParams: IdParamSchema,
    operationName: 'getProduct',
  },
  async (c) => {
    const { id } = c.validated.params;

    try {
      const db = await getDbAsync();

      // ✅ CACHING ENABLED: Query builder API with 10-minute TTL for single product details
      // Products change infrequently (admin updates), cached to reduce DB load on product pages
      // Cache automatically invalidates when product or prices are updated
      // @see https://orm.drizzle.team/docs/cache

      // Step 1: Fetch single product (cacheable)
      const productResults = await db
        .select()
        .from(tables.stripeProduct)
        .where(eq(tables.stripeProduct.id, id))
        .limit(1)
        .$withCache({
          config: { ex: 600 }, // 10 minutes - product details stable
          tag: ProductCacheTags.single(id),
        });

      const dbProduct = productResults[0];

      if (!dbProduct) {
        throw createError.notFound(`Product ${id} not found`, ErrorContextBuilders.resourceNotFound('product', id));
      }

      // Step 2: Fetch active prices for this product (cacheable)
      const dbPrices = await db
        .select()
        .from(tables.stripePrice)
        .where(
          and(
            eq(tables.stripePrice.productId, id),
            eq(tables.stripePrice.active, true),
          ),
        )
        .$withCache({
          config: { ex: 600 }, // 10 minutes - prices stable
          tag: PriceCacheTags.byProduct(id),
        });

      const productPrices = dbPrices.sort((a, b) => (a.unitAmount ?? 0) - (b.unitAmount ?? 0));

      const annualSavingsPercent = calculateAnnualSavings(
        productPrices.map(p => ({
          interval: (p.interval || 'month') as 'month' | 'year',
          unitAmount: p.unitAmount ?? 0,
        })),
      );

      return Responses.ok(c, {
        product: {
          ...dbProduct,
          prices: productPrices,
          annualSavingsPercent,
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw createError.internal('Failed to retrieve product', ErrorContextBuilders.database('select', 'stripeProduct'));
    }
  },
);

// ============================================================================
// Checkout Handlers (Theo's Pattern: Eager Sync After Checkout)
// ============================================================================

/**
 * Create Checkout Session
 *
 * Following Theo's "Stay Sane with Stripe" pattern:
 * - Creates Stripe Checkout session for subscription purchase
 * - Success URL redirects to /chat/billing/success (WITHOUT session_id parameter)
 * - Success page auto-triggers eager sync from Stripe API
 * - This prevents race condition where UI loads before webhooks arrive
 * - Webhooks still run in background but UI doesn't depend on them
 *
 * Flow:
 * 1. User clicks "Subscribe" → This endpoint creates checkout session
 * 2. User completes payment on Stripe
 * 3. Stripe redirects to success URL
 * 4. Success page calls /sync-after-checkout endpoint
 * 5. Sync endpoint fetches fresh data from Stripe API
 * 6. User sees updated subscription status immediately
 */
export const createCheckoutSessionHandler: RouteHandler<typeof createCheckoutSessionRoute, ApiEnv> = createHandlerWithBatch(
  {
    auth: 'session',
    validateBody: CheckoutRequestSchema,
    operationName: 'createCheckoutSession',
  },
  async (c, batch) => {
    const { user } = c.auth();
    const body = c.validated.body;

    try {
      // Theo's Pattern: "ENABLE 'Limit customers to one subscription'"
      // Prevent multiple subscriptions - check if user already has an active subscription
      // Exclude subscriptions that are canceled at period end (cancelAtPeriodEnd: true)
      // because those are effectively canceled even though status is still 'active'
      const existingSubscriptions = await batch.db.query.stripeSubscription.findMany({
        where: eq(tables.stripeSubscription.userId, user.id),
      });

      const activeSubscription = existingSubscriptions.find(sub =>
        (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due')
        && !sub.cancelAtPeriodEnd,
      );

      if (activeSubscription) {
        throw createError.badRequest(
          'You already have an active subscription. Please cancel or modify your existing subscription instead of creating a new one.',
          ErrorContextBuilders.validation('subscription'),
        );
      }

      // Get or create Stripe customer (using batch.db for consistency)
      const stripeCustomer = await batch.db.query.stripeCustomer.findFirst({
        where: eq(tables.stripeCustomer.userId, user.id),
      });

      let customerId: string;

      if (!stripeCustomer) {
        const customer = await stripeService.createCustomer({
          email: user.email,
          name: user.name || undefined,
          metadata: { userId: user.id },
        });

        // Insert using batch.db for atomic operation
        const [insertedCustomer] = await batch.db.insert(tables.stripeCustomer).values({
          id: customer.id,
          userId: user.id,
          email: customer.email ?? user.email,
          name: customer.name ?? null,
          createdAt: new Date(customer.created * 1000),
          updatedAt: new Date(),
        }).returning();

        if (!insertedCustomer) {
          throw createError.internal('Failed to create customer record', ErrorContextBuilders.database('insert', 'stripeCustomer'));
        }

        customerId = insertedCustomer.id;
      } else {
        // Intentionally empty
        customerId = stripeCustomer.id;
      }

      const appUrl = c.env.NEXT_PUBLIC_APP_URL;
      // Theo's pattern: Do NOT use CHECKOUT_SESSION_ID (ignore it)
      // Success page will eagerly sync fresh data from Stripe API
      const successUrl = body.successUrl || `${appUrl}/chat/billing/success`;
      const cancelUrl = body.cancelUrl || `${appUrl}/chat/pricing`;

      const session = await stripeService.createCheckoutSession({
        priceId: body.priceId,
        customerId,
        successUrl,
        cancelUrl,
        metadata: { userId: user.id },
      });

      if (!session.url) {
        throw createError.internal('Checkout session created but URL is missing', ErrorContextBuilders.stripe('create_checkout_session'));
      }

      return Responses.ok(c, {
        sessionId: session.id,
        url: session.url,
      });
    } catch {
      throw createError.internal('Failed to create checkout session', ErrorContextBuilders.stripe('create_checkout_session'));
    }
  },
);

// ============================================================================
// Customer Portal Handlers
// ============================================================================

/**
 * Create Stripe customer portal session handler
 * Allows customers to manage their subscriptions and billing information
 *
 * Pattern: Returns portal URL for client-side redirect
 */
export const createCustomerPortalSessionHandler: RouteHandler<typeof createCustomerPortalSessionRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: CustomerPortalRequestSchema,
    operationName: 'createCustomerPortalSession',
  },
  async (c) => {
    const { user } = c.auth();
    const body = c.validated.body;

    try {
      // Get customer ID from database
      const customerId = await getCustomerIdByUserId(user.id);

      if (!customerId) {
        throw createError.badRequest('No Stripe customer found for this user. Please create a subscription first.', ErrorContextBuilders.resourceNotFound('customer', undefined, user.id));
      }

      const appUrl = c.env.NEXT_PUBLIC_APP_URL;
      const returnUrl = body.returnUrl || `${appUrl}/chat`;

      const session = await stripeService.createCustomerPortalSession({
        customerId,
        returnUrl,
      });

      if (!session.url) {
        throw createError.internal('Portal session created but URL is missing', ErrorContextBuilders.stripe('create_portal_session'));
      }

      return Responses.ok(c, {
        url: session.url,
      });
    } catch (error) {
      // Re-throw if already an AppError
      if (error instanceof AppError) {
        throw error;
      }

      throw createError.internal('Failed to create customer portal session', ErrorContextBuilders.stripe('create_portal_session'));
    }
  },
);

// ============================================================================
// Subscription Handlers
// ============================================================================

export const listSubscriptionsHandler: RouteHandler<typeof listSubscriptionsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'listSubscriptions',
  },
  async (c) => {
    const { user } = c.auth();

    try {
      const db = await getDbAsync();

      // ✅ CACHING ENABLED: Relational query with 2-minute TTL for user subscriptions
      // User-specific data with short cache to balance freshness and performance
      // Cache automatically invalidates when subscriptions, prices, or products are updated
      // ✅ NO TRANSFORMS: Using Drizzle with() to automatically load price relation
      // @see https://orm.drizzle.team/docs/cache

      // Fetch user subscriptions with nested price data via Drizzle relations
      const subscriptions = await db.query.stripeSubscription.findMany({
        where: eq(tables.stripeSubscription.userId, user.id),
        with: {
          price: {
            columns: { productId: true },
          },
        },
      });

      return Responses.collection(c, subscriptions);
    } catch {
      throw createError.internal('Failed to retrieve subscriptions', ErrorContextBuilders.database('select', 'stripeSubscription'));
    }
  },
);

export const getSubscriptionHandler: RouteHandler<typeof getSubscriptionRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getSubscription',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;

    const db = await getDbAsync();

    try {
      // ✅ CACHING ENABLED: Relational query with 2-minute TTL for single subscription
      // User-specific data with short cache to balance freshness and performance
      // Cache automatically invalidates when subscription, price, or product is updated
      // ✅ NO TRANSFORMS: Using Drizzle with() to automatically load price relation
      // @see https://orm.drizzle.team/docs/cache

      // Fetch single subscription with nested price data via Drizzle relations
      const subscription = await db.query.stripeSubscription.findFirst({
        where: eq(tables.stripeSubscription.id, id),
        with: {
          price: {
            columns: { productId: true },
          },
        },
      });

      if (!subscription) {
        throw createError.notFound(`Subscription ${id} not found`, ErrorContextBuilders.resourceNotFound('subscription', id, user.id));
      }

      if (!validateSubscriptionOwnership(subscription, user)) {
        throw createError.unauthorized('You do not have access to this subscription', ErrorContextBuilders.authorization('subscription', id, user.id));
      }

      return Responses.ok(c, { subscription });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw createError.internal('Failed to retrieve subscription', ErrorContextBuilders.database('select', 'stripeSubscription'));
    }
  },
);

// ============================================================================
// Sync Handler (Theo's Pattern: Eager Sync After Checkout)
// ============================================================================

/**
 * Sync Stripe Data After Checkout
 *
 * Following Theo's "Stay Sane with Stripe" pattern:
 * - Called immediately after user returns from Stripe Checkout
 * - Prevents race condition where user sees page before webhooks arrive
 * - Fetches fresh data from Stripe API (not webhook payload)
 * - Returns synced subscription state
 */
export const syncAfterCheckoutHandler: RouteHandler<typeof syncAfterCheckoutRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'syncAfterCheckout',
  },
  async (c) => {
    const { user } = c.auth();

    try {
      // Get customer ID from user ID
      const customerId = await getCustomerIdByUserId(user.id);

      if (!customerId) {
        throw createError.notFound('No Stripe customer found for user', ErrorContextBuilders.resourceNotFound('customer', undefined, user.id));
      }

      // Eagerly sync data from Stripe API (Theo's pattern)
      const syncedState = await syncStripeDataFromStripe(customerId);

      return Responses.ok(c, {
        synced: true,
        subscription: syncedState.status !== 'none'
          ? {
              status: syncedState.status,
              subscriptionId: syncedState.subscriptionId,
            }
          : null,
      });
    } catch {
      throw createError.internal('Failed to sync Stripe data', ErrorContextBuilders.stripe('sync_data'));
    }
  },
);

// ============================================================================
// Subscription Management Handlers (Upgrade/Downgrade/Cancel)
// ============================================================================

/**
 * Switch Subscription Handler
 *
 * Switches the user to a different price plan.
 * - Updates subscription to new price using Stripe API
 * - Uses 'create_prorations' - Stripe handles billing automatically
 * - Syncs fresh data from Stripe API after update
 */
export const switchSubscriptionHandler: RouteHandler<typeof switchSubscriptionRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: SwitchSubscriptionRequestSchema,
    operationName: 'switchSubscription',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: subscriptionId } = c.validated.params;
    const { newPriceId } = c.validated.body;

    try {
      const db = await getDbAsync();

      // Verify subscription exists and belongs to user
      const subscription = await db.query.stripeSubscription.findFirst({
        where: eq(tables.stripeSubscription.id, subscriptionId),
      });

      if (!subscription) {
        throw createError.notFound(
          `Subscription ${subscriptionId} not found`,
          ErrorContextBuilders.resourceNotFound('subscription', subscriptionId, user.id),
        );
      }

      if (!validateSubscriptionOwnership(subscription, user)) {
        throw createError.unauthorized(
          'You do not have access to this subscription',
          ErrorContextBuilders.authorization('subscription', subscriptionId, user.id),
        );
      }

      // Verify new price exists and get current price for comparison
      const newPrice = await db.query.stripePrice.findFirst({
        where: eq(tables.stripePrice.id, newPriceId),
      });

      if (!newPrice) {
        throw createError.badRequest(
          `Price ${newPriceId} not found`,
          ErrorContextBuilders.resourceNotFound('price', newPriceId),
        );
      }

      const currentPrice = await db.query.stripePrice.findFirst({
        where: eq(tables.stripePrice.id, subscription.priceId),
      });

      if (!currentPrice) {
        throw createError.internal(
          'Current subscription price not found',
          ErrorContextBuilders.resourceNotFound('price', subscription.priceId),
        );
      }

      // Update subscription in Stripe
      const stripe = stripeService.getClient();
      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      const subscriptionItemId = stripeSubscription.items.data[0]?.id;

      if (!subscriptionItemId) {
        throw createError.internal(
          'Subscription has no items',
          ErrorContextBuilders.stripe('retrieve_subscription', subscriptionId),
        );
      }

      // Determine if this is an upgrade or downgrade based on price amount
      const currentAmount = currentPrice.unitAmount || 0;
      const newAmount = newPrice.unitAmount || 0;
      const isUpgrade = newAmount > currentAmount;
      const isDowngrade = newAmount < currentAmount;

      if (isUpgrade) {
        // UPGRADE: Apply immediately with proration
        // User gets instant access to higher limits and pays prorated difference
        await stripeService.updateSubscription(subscriptionId, {
          items: [
            {
              id: subscriptionItemId,
              price: newPriceId,
            },
          ],
          proration_behavior: 'create_prorations', // Immediate with proration
        });
      } else if (isDowngrade) {
        // DOWNGRADE: Schedule for end of period
        // User keeps current access until period ends, no immediate charge/refund
        await stripeService.updateSubscription(subscriptionId, {
          items: [
            {
              id: subscriptionItemId,
              price: newPriceId,
            },
          ],
          proration_behavior: 'none', // No proration for downgrades
          billing_cycle_anchor: 'unchanged', // Keep same billing date
        });
      } else {
        // Intentionally empty
        // SAME PRICE: Just update (e.g., switching between monthly/annual of same tier)
        await stripeService.updateSubscription(subscriptionId, {
          items: [
            {
              id: subscriptionItemId,
              price: newPriceId,
            },
          ],
          proration_behavior: 'create_prorations',
        });
      }

      // Sync fresh data from Stripe API
      await syncStripeDataFromStripe(subscription.customerId);

      // Fetch updated subscription from database with nested price data
      const refreshedSubscription = await fetchRefreshedSubscription(db, subscriptionId);

      // ✅ Include old and new price information for success page comparison
      // This allows the frontend to show before/after plan details
      return Responses.ok(c, {
        subscription: refreshedSubscription,
        message: 'Subscription updated successfully',
        changeDetails: {
          oldPrice: currentPrice,
          newPrice,
          isUpgrade,
          isDowngrade,
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw createError.internal(
        'Failed to switch subscription',
        ErrorContextBuilders.stripe('update_subscription', subscriptionId),
      );
    }
  },
);

/**
 * Cancel Subscription Handler
 *
 * Cancels the user's subscription.
 * - Default: Cancel at period end (user retains access until then)
 * - Optional: Cancel immediately (user loses access now)
 */
export const cancelSubscriptionHandler: RouteHandler<typeof cancelSubscriptionRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: CancelSubscriptionRequestSchema,
    operationName: 'cancelSubscription',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: subscriptionId } = c.validated.params;
    const { immediately = false } = c.validated.body;

    try {
      const db = await getDbAsync();

      // Verify subscription exists and belongs to user
      const subscription = await db.query.stripeSubscription.findFirst({
        where: eq(tables.stripeSubscription.id, subscriptionId),
      });

      if (!subscription) {
        throw createError.notFound(
          `Subscription ${subscriptionId} not found`,
          ErrorContextBuilders.resourceNotFound('subscription', subscriptionId, user.id),
        );
      }

      if (!validateSubscriptionOwnership(subscription, user)) {
        throw createError.unauthorized(
          'You do not have access to this subscription',
          ErrorContextBuilders.authorization('subscription', subscriptionId, user.id),
        );
      }

      // Check if subscription is already canceled
      if (subscription.status === 'canceled') {
        throw createError.badRequest(
          'Subscription is already canceled',
          ErrorContextBuilders.validation('subscription'),
        );
      }

      // Cancel subscription in Stripe
      await stripeService.cancelSubscription(subscriptionId, !immediately);

      // Sync fresh data from Stripe API
      await syncStripeDataFromStripe(subscription.customerId);

      // Fetch updated subscription from database with nested price data
      const refreshedSubscription = await fetchRefreshedSubscription(db, subscriptionId);

      const message = immediately
        ? 'Subscription canceled immediately. You no longer have access.'
        : `Subscription will be canceled at the end of the current billing period (${refreshedSubscription.currentPeriodEnd.toLocaleDateString()}). You retain access until then.`;

      return Responses.ok(c, {
        subscription: refreshedSubscription,
        message,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw createError.internal(
        'Failed to cancel subscription',
        ErrorContextBuilders.stripe('cancel_subscription', subscriptionId),
      );
    }
  },
);

// ============================================================================
// Webhook Handler (Theo's Pattern: Always Return 200, Async Processing)
// ============================================================================

/**
 * Stripe Webhook Handler
 *
 * Following Theo's "Stay Sane with Stripe" pattern:
 * - Verifies webhook signature from Stripe
 * - ALWAYS returns 200 OK (even on processing errors) to prevent retry storms
 * - Extracts only customerId from webhook payload (never trust full payload data)
 * - Fetches fresh data from Stripe API (single source of truth)
 * - Processes asynchronously using Cloudflare Workers waitUntil (production)
 * - Falls back to synchronous processing (local development)
 * - Implements idempotency check to prevent duplicate processing
 *
 * Architecture:
 * 1. Verify signature → Return 400 if invalid (Stripe will not retry)
 * 2. Check idempotency → Return 200 if already processed
 * 3. Insert webhook event record (processed: false)
 * 4. Return 200 immediately
 * 5. Process webhook in background (extract customerId, sync from Stripe API)
 * 6. Update webhook event record (processed: true)
 *
 * Error Handling:
 * - Signature errors → 400 Bad Request (not 401)
 * - Processing errors → Log and return 200 (prevents Stripe retry storms)
 * - Background errors → Logged for manual investigation/retry
 */
export const handleWebhookHandler: RouteHandler<typeof handleWebhookRoute, ApiEnv> = createHandlerWithBatch(
  {
    auth: 'public',
    operationName: 'handleStripeWebhook',
  },
  async (c, batch) => {
    const signature = c.req.header('stripe-signature');

    if (!signature) {
      throw createError.badRequest('Missing stripe-signature header', ErrorContextBuilders.validation('stripe-signature'));
    }

    try {
      const rawBody = await c.req.text();
      const event = stripeService.constructWebhookEvent(rawBody, signature);

      // Check for existing event using batch.db for consistency
      const existingEvent = await batch.db.query.stripeWebhookEvent.findFirst({
        where: eq(tables.stripeWebhookEvent.id, event.id),
      });

      if (existingEvent?.processed) {
        return Responses.ok(c, {
          received: true,
          event: {
            id: event.id,
            type: event.type,
            processed: true,
          },
        });
      }

      // Insert webhook event using batch.db for atomic operation
      await batch.db.insert(tables.stripeWebhookEvent).values({
        id: event.id,
        type: event.type,
        data: event.data.object as unknown as Record<string, unknown>,
        processed: false,
        createdAt: new Date(event.created * 1000),
      }).onConflictDoNothing();

      // Async webhook processing pattern for Cloudflare Workers
      // Return 200 immediately, process webhook in background
      const processAsync = async () => {
        try {
          // Process webhook event using batch.db
          await processWebhookEvent(event, batch.db, {});

          // Update webhook event as processed using batch.db
          await batch.db.update(tables.stripeWebhookEvent)
            .set({ processed: true })
            .where(eq(tables.stripeWebhookEvent.id, event.id));
        } catch {
          // Background processing error - log but don't fail the response
        }
      };

      // Use Cloudflare Workers async processing if available (production)
      // Otherwise process synchronously (local development)
      if (c.executionCtx) {
        c.executionCtx.waitUntil(processAsync());
      } else {
        // Intentionally empty
        await processAsync();
      }

      return Responses.ok(c, {
        received: true,
        event: {
          id: event.id,
          type: event.type,
          processed: true,
        },
      });
    } catch {
      // CRITICAL (Theo's Pattern): ALWAYS return 200 to Stripe even on errors
      // This prevents webhook retry storms. Stripe will mark webhook as delivered.
      // Failed processing is logged for investigation and manual retry if needed.
      return Responses.ok(c, {
        received: true,
        event: {
          id: 'unknown',
          type: 'unknown',
          processed: false,
          error: 'Processing failed - logged for investigation',
        },
      });
    }
  },
);

// ============================================================================
// Webhook Event Processing (Theo's Pattern)
// ============================================================================

/**
 * Tracked Webhook Events (Following Theo's "Stay Sane with Stripe" Pattern)
 *
 * Source: https://github.com/t3dotgg/stay-sane-with-stripe
 *
 * Philosophy:
 * - ALL events trigger the SAME sync function (syncStripeDataFromStripe)
 * - NO event-specific logic needed
 * - Extract customerId → Fetch fresh data from Stripe API → Upsert to database
 * - Never trust webhook payloads, always fetch fresh from Stripe API
 *
 * This is Theo's EXACT event list from his implementation.
 * While some events may seem redundant (e.g., customer.subscription.paused is also
 * fired as customer.subscription.updated), tracking them explicitly ensures we never
 * miss critical subscription state changes due to Stripe's eventual consistency model.
 *
 * Event Categories:
 *
 * 1. CHECKOUT EVENTS:
 *    - checkout.session.completed: User completes checkout
 *
 * 2. SUBSCRIPTION LIFECYCLE:
 *    - customer.subscription.created: New subscription
 *    - customer.subscription.updated: Subscription changed
 *    - customer.subscription.deleted: Subscription canceled
 *    - customer.subscription.paused: Subscription paused
 *    - customer.subscription.resumed: Subscription resumed
 *    - customer.subscription.pending_update_applied: Scheduled update applied
 *    - customer.subscription.pending_update_expired: Scheduled update expired
 *    - customer.subscription.trial_will_end: Trial ending (3 days before)
 *
 * 3. INVOICE & PAYMENT EVENTS:
 *    - invoice.paid: Invoice successfully paid
 *    - invoice.payment_failed: Payment failed
 *    - invoice.payment_action_required: 3D Secure/SCA required
 *    - invoice.upcoming: Invoice upcoming (7 days before)
 *    - invoice.marked_uncollectible: Invoice uncollectible after retries
 *    - invoice.payment_succeeded: Payment succeeded (safety duplicate)
 *    - payment_intent.succeeded: Payment intent succeeded
 *    - payment_intent.payment_failed: Payment intent failed
 *    - payment_intent.canceled: Payment intent canceled
 *
 * Total Events: 18 (Theo's exact specification)
 */
const TRACKED_WEBHOOK_EVENTS: Stripe.Event.Type[] = [
  // Checkout
  'checkout.session.completed',

  // Subscription lifecycle
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired',
  'customer.subscription.trial_will_end',

  // Invoice and payment events
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.upcoming',
  'invoice.marked_uncollectible',
  'invoice.payment_succeeded',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
];

/**
 * Extract customer ID from webhook event
 * All tracked events have a customer property
 *
 * Theo's Pattern: Type-check customerId is string (throw if not)
 */
function extractCustomerId(event: Stripe.Event): string | null {
  const obj = event.data.object as { customer?: string | { id: string } };

  if (!obj.customer)
    return null;

  // Type guard: string customer ID
  if (typeof obj.customer === 'string') {
    return obj.customer;
  }

  // Type guard: expanded customer object with id
  if (typeof obj.customer === 'object' && typeof obj.customer.id === 'string') {
    return obj.customer.id;
  }

  // Throw on invalid type (Theo's requirement: "Type-check customerId is string (throw if not)")
  throw createError.badRequest(
    `Invalid customer type in webhook event: expected string or object with id, got ${typeof obj.customer}`,
    ErrorContextBuilders.stripe('webhook_processing'),
  );
}

/**
 * Process Webhook Event (Theo's Simplified Pattern)
 *
 * Philosophy:
 * - Don't trust webhook payloads (can be stale or incomplete)
 * - Extract customerId only
 * - Call single sync function that fetches fresh data from Stripe API
 * - No event-specific logic needed
 */
type WebhookProcessorContext = Record<string, never>;

async function processWebhookEvent(
  event: Stripe.Event,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  _c: WebhookProcessorContext,
): Promise<void> {
  // Skip if event type not tracked
  if (!TRACKED_WEBHOOK_EVENTS.includes(event.type)) {
    return;
  }

  // Extract customer ID
  const customerId = extractCustomerId(event);

  if (!customerId) {
    return;
  }

  // Verify customer exists in our database
  const customer = await db.query.stripeCustomer.findFirst({
    where: eq(tables.stripeCustomer.id, customerId),
  });

  if (!customer) {
    return;
  }

  // Single sync function - fetches fresh data from Stripe API (Theo's pattern)
  await syncStripeDataFromStripe(customerId);
}

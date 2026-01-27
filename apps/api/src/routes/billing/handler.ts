import type { RouteHandler } from '@hono/zod-openapi';
import { BASE_URL_CONFIG } from '@roundtable/shared';
import { isActiveSubscriptionStatus, PlanTypes, PurchaseTypes, StripeBillingReasons, StripeProratioBehaviors, StripeSubscriptionStatuses, SubscriptionTiers } from '@roundtable/shared/enums';
import { and, eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import * as z from 'zod';

import { ErrorContextBuilders } from '@/common/error-contexts';
import { AppError, createError } from '@/common/error-handling';
import { createHandler, createHandlerWithBatch, IdParamSchema, Responses } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import { PriceCacheTags, ProductCacheTags, STATIC_CACHE_TAGS } from '@/db/cache/cache-tags';
import { revenueTracking } from '@/lib/analytics';
import { getWebappEnvFromContext } from '@/lib/config/base-urls';
import { STRIPE_WEBHOOK_EVENT_TYPES, StripeWebhookEventTypes } from '@/lib/enums';
import { extractProperty, isObject } from '@/lib/utils';
import { cacheCustomerId, getCustomerIdByUserId, getUserCreditBalance, hasSyncedSubscription, stripeService, syncStripeDataFromStripe } from '@/services/billing';
import type { ApiEnv } from '@/types';

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
  syncCreditsAfterCheckoutRoute,
} from './route';
import type { SubscriptionDateFields } from './schema';
import {
  CancelSubscriptionRequestSchema,
  CheckoutRequestSchema,
  CustomerPortalRequestSchema,
  SwitchSubscriptionRequestSchema,
} from './schema';

function validateSubscriptionOwnership(
  subscription: { userId: string },
  user: { id: string },
) {
  return subscription.userId === user.id;
}

function serializeSubscriptionDates<T extends SubscriptionDateFields>(subscription: T) {
  return {
    ...subscription,
    canceledAt: subscription.canceledAt?.toISOString() ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
    currentPeriodStart: subscription.currentPeriodStart.toISOString(),
    trialEnd: subscription.trialEnd?.toISOString() ?? null,
    trialStart: subscription.trialStart?.toISOString() ?? null,
  };
}

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

      // Filter to only show Pro plan product (by metadata.planType from seeded data)
      const filteredProducts = dbProducts.filter((p) => {
        try {
          const metadata = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata;
          return metadata?.planType === PlanTypes.PAID;
        } catch {
          return false;
        }
      });

      // Step 3: Join products with their prices and sort - minimal transformation
      const products = filteredProducts
        .map((product) => {
          const productPrices = allPrices
            .filter(price => price.productId === product.id)
            .sort((a, b) => (a.unitAmount ?? 0) - (b.unitAmount ?? 0));

          return {
            ...product,
            prices: productPrices,
          };
        })
        .sort((a, b) => {
          const lowestPriceA = a.prices[0]?.unitAmount ?? 0;
          const lowestPriceB = b.prices[0]?.unitAmount ?? 0;
          return lowestPriceA - lowestPriceB;
        });

      const response = Responses.collection(c, products);

      // Products rarely change - cache aggressively
      response.headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      response.headers.set('CDN-Cache-Control', 'max-age=86400');

      return response;
    } catch {
      throw createError.internal('Failed to retrieve products', ErrorContextBuilders.database('select', 'stripeProduct'));
    }
  },
);

export const getProductHandler: RouteHandler<typeof getProductRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    operationName: 'getProduct',
    validateParams: IdParamSchema,
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

      return Responses.ok(c, {
        product: {
          ...dbProduct,
          prices: productPrices,
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
 * Theo's pattern: eager sync after checkout prevents race condition
 */
export const createCheckoutSessionHandler: RouteHandler<typeof createCheckoutSessionRoute, ApiEnv> = createHandlerWithBatch(
  {
    auth: 'session',
    operationName: 'createCheckoutSession',
    validateBody: CheckoutRequestSchema,
  },
  async (c, batch) => {
    const { user } = c.auth();
    const body = c.validated.body;

    try {
      const existingSubscriptions = await batch.db.query.stripeSubscription.findMany({
        where: eq(tables.stripeSubscription.userId, user.id),
      });

      const activeSubscription = existingSubscriptions.find(
        sub => isActiveSubscriptionStatus(sub.status) && !sub.cancelAtPeriodEnd,
      );

      if (activeSubscription) {
        throw createError.badRequest(
          'You already have an active subscription. Please cancel or modify your existing subscription instead of creating a new one.',
          ErrorContextBuilders.validation('subscription'),
        );
      }

      // Theo pattern: Check KV cache first, then DB
      const cachedCustomerId = await getCustomerIdByUserId(user.id);

      let customerId: string;

      if (!cachedCustomerId) {
        // Only include name in options if truthy to satisfy exactOptionalPropertyTypes
        const customerOptions = user.name
          ? { email: user.email, metadata: { userId: user.id }, name: user.name }
          : { email: user.email, metadata: { userId: user.id } };
        const customer = await stripeService.createCustomer(customerOptions);

        const [insertedCustomer] = await batch.db.insert(tables.stripeCustomer).values({
          createdAt: new Date(customer.created * 1000),
          email: customer.email ?? user.email,
          id: customer.id,
          name: customer.name ?? null,
          updatedAt: new Date(),
          userId: user.id,
        }).returning();

        if (!insertedCustomer) {
          throw createError.internal('Failed to create customer record', ErrorContextBuilders.database('insert', 'stripeCustomer'));
        }

        customerId = insertedCustomer.id;

        // KV cache userId → customerId (Theo pattern)
        await cacheCustomerId(user.id, customerId);
      } else {
        customerId = cachedCustomerId;
      }

      const urls = BASE_URL_CONFIG[getWebappEnvFromContext(c)];
      if (!urls) {
        throw createError.internal('Environment configuration not found', ErrorContextBuilders.validation('WEBAPP_ENV'));
      }
      const appUrl = urls.app;
      const defaultSuccessUrl = `${appUrl}/chat/billing/subscription-success`;
      const successUrl = body.successUrl || defaultSuccessUrl;
      const cancelUrl = body.cancelUrl || `${appUrl}/chat/pricing`;

      const session = await stripeService.createCheckoutSession({
        cancelUrl,
        customerId,
        metadata: { userId: user.id },
        priceId: body.priceId,
        successUrl,
      });

      if (!session.url) {
        throw createError.internal('Checkout session created but URL is missing', ErrorContextBuilders.stripe('create_checkout_session'));
      }

      return Responses.ok(c, {
        sessionId: session.id,
        url: session.url,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error('[Billing] Checkout session error:', error);
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
    operationName: 'createCustomerPortalSession',
    validateBody: CustomerPortalRequestSchema,
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

      const urls = BASE_URL_CONFIG[getWebappEnvFromContext(c)];
      if (!urls) {
        throw createError.internal('Environment configuration not found', ErrorContextBuilders.validation('WEBAPP_ENV'));
      }
      const appUrl = urls.app;
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

      // ⚠️ NO CACHING: Subscription data must always be fresh after plan changes
      // Fetch user subscriptions with nested price data via Drizzle relations
      const subscriptions = await db.query.stripeSubscription.findMany({
        where: eq(tables.stripeSubscription.userId, user.id),
        with: {
          price: {
            columns: { productId: true },
          },
        },
      });

      // ✅ DATE SERIALIZATION: Use helper to convert Date objects to ISO strings
      const serializedSubscriptions = subscriptions.map(serializeSubscriptionDates);

      // ⚠️ NO CACHING: Subscription status must always reflect current state
      c.header('Cache-Control', 'no-store, no-cache, must-revalidate');

      return Responses.collection(c, serializedSubscriptions);
    } catch (error) {
      console.error('[Billing] listSubscriptions error:', error);
      throw createError.internal('Failed to retrieve subscriptions', ErrorContextBuilders.database('select', 'stripeSubscription'));
    }
  },
);

export const getSubscriptionHandler: RouteHandler<typeof getSubscriptionRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getSubscription',
    validateParams: IdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;

    const db = await getDbAsync();

    try {
      // ⚠️ NO CACHING: Subscription data must always be fresh after plan changes
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

      // ⚠️ NO CACHING: Subscription status must always reflect current state
      c.header('Cache-Control', 'no-store, no-cache, must-revalidate');

      // ✅ DATE SERIALIZATION: Use helper to convert Date objects to ISO strings
      return Responses.ok(c, { subscription: serializeSubscriptionDates(subscription) });
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
 * Sync Stripe Subscription Data After Checkout
 * Fetches fresh data from Stripe API to prevent race condition
 */
export const syncAfterCheckoutHandler: RouteHandler<typeof syncAfterCheckoutRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'syncAfterCheckout',
  },
  async (c) => {
    const { user } = c.auth();
    const db = await getDbAsync();

    // Helper: get current tier and balance for fallback responses
    const getCurrentState = async () => {
      const [usage, balance] = await Promise.all([
        db.query.userChatUsage.findFirst({
          columns: { subscriptionTier: true },
          where: eq(tables.userChatUsage.userId, user.id),
        }),
        getUserCreditBalance(user.id).catch(() => ({ available: 0 })),
      ]);
      return {
        balance: balance.available,
        tier: usage?.subscriptionTier || SubscriptionTiers.FREE,
      };
    };

    // Helper: check for existing active subscription
    const getExistingSubscription = async (customerId: string) => {
      return await db.query.stripeSubscription.findFirst({
        where: and(
          eq(tables.stripeSubscription.customerId, customerId),
          eq(tables.stripeSubscription.status, StripeSubscriptionStatuses.ACTIVE),
        ),
      });
    };

    try {
      // Theo pattern: KV cache first, then DB fallback
      const customerId = await getCustomerIdByUserId(user.id);

      if (!customerId) {
        const { balance, tier } = await getCurrentState();
        return Responses.ok(c, {
          creditPurchase: null,
          creditsBalance: balance,
          purchaseType: PurchaseTypes.NONE,
          subscription: null,
          synced: false,
          tierChange: {
            newPriceId: null,
            newTier: tier,
            previousPriceId: null,
            previousTier: tier,
          },
        });
      }

      // ✅ PERF: Only fetch subscriptionTier field instead of full record
      const previousUsage = await db.query.userChatUsage.findFirst({
        columns: { subscriptionTier: true },
        where: eq(tables.userChatUsage.userId, user.id),
      });
      const previousTier = previousUsage?.subscriptionTier || SubscriptionTiers.FREE;

      const syncedState = await syncStripeDataFromStripe(customerId);

      // ✅ PERF: Only fetch subscriptionTier field instead of full record
      const newUsage = await db.query.userChatUsage.findFirst({
        columns: { subscriptionTier: true },
        where: eq(tables.userChatUsage.userId, user.id),
      });
      const newTier = newUsage?.subscriptionTier || SubscriptionTiers.FREE;

      const balance = await getUserCreditBalance(user.id);

      return Responses.ok(c, {
        creditPurchase: null,
        creditsBalance: balance.available,
        purchaseType: hasSyncedSubscription(syncedState) ? PurchaseTypes.SUBSCRIPTION : PurchaseTypes.NONE,
        subscription: hasSyncedSubscription(syncedState)
          ? {
              status: syncedState.status,
              subscriptionId: syncedState.subscriptionId,
            }
          : null,
        synced: true,
        tierChange: {
          newPriceId: null,
          newTier,
          previousPriceId: null,
          previousTier,
        },
      });
    } catch {
      // On sync failure, check if user already has active subscription (revisit scenario)
      const customerId = await getCustomerIdByUserId(user.id).catch(() => null);

      if (customerId) {
        const existingSub = await getExistingSubscription(customerId).catch(() => null);
        if (existingSub) {
          // User already has active subscription - return success state
          const { balance, tier } = await getCurrentState();
          return Responses.ok(c, {
            creditPurchase: null,
            creditsBalance: balance,
            purchaseType: PurchaseTypes.SUBSCRIPTION,
            subscription: {
              status: existingSub.status,
              subscriptionId: existingSub.id,
            },
            synced: true,
            tierChange: {
              newPriceId: null,
              newTier: tier,
              previousPriceId: null,
              previousTier: tier,
            },
          });
        }
      }

      // No existing subscription found - return error state
      const { balance, tier } = await getCurrentState();
      return Responses.ok(c, {
        creditPurchase: null,
        creditsBalance: balance,
        purchaseType: PurchaseTypes.NONE,
        subscription: null,
        synced: false,
        tierChange: {
          newPriceId: null,
          newTier: tier,
          previousPriceId: null,
          previousTier: tier,
        },
      });
    }
  },
);

// ============================================================================
// Subscription Management Handlers (Upgrade/Downgrade/Cancel)
// ============================================================================

/**
 * Switch Subscription Handler
 * Updates subscription to new price with prorations
 */
export const switchSubscriptionHandler: RouteHandler<typeof switchSubscriptionRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'switchSubscription',
    validateBody: SwitchSubscriptionRequestSchema,
    validateParams: IdParamSchema,
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
      const stripe = await stripeService.ensureClient();
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
        await stripeService.updateSubscription(subscriptionId, {
          items: [
            {
              id: subscriptionItemId,
              price: newPriceId,
            },
          ],
          proration_behavior: StripeProratioBehaviors.CREATE_PRORATIONS,
        });
      } else if (isDowngrade) {
        await stripeService.updateSubscription(subscriptionId, {
          billing_cycle_anchor: 'unchanged',
          items: [
            {
              id: subscriptionItemId,
              price: newPriceId,
            },
          ],
          proration_behavior: StripeProratioBehaviors.NONE,
        });
      } else {
        await stripeService.updateSubscription(subscriptionId, {
          items: [
            {
              id: subscriptionItemId,
              price: newPriceId,
            },
          ],
          proration_behavior: StripeProratioBehaviors.CREATE_PRORATIONS,
        });
      }

      await syncStripeDataFromStripe(subscription.customerId);

      const refreshedSubscription = await fetchRefreshedSubscription(db, subscriptionId);

      return Responses.ok(c, {
        changeDetails: {
          isDowngrade,
          isUpgrade,
          newPrice,
          oldPrice: currentPrice,
        },
        message: 'Subscription updated successfully',
        subscription: serializeSubscriptionDates(refreshedSubscription),
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
 */
export const cancelSubscriptionHandler: RouteHandler<typeof cancelSubscriptionRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'cancelSubscription',
    validateBody: CancelSubscriptionRequestSchema,
    validateParams: IdParamSchema,
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
      if (subscription.status === StripeSubscriptionStatuses.CANCELED) {
        throw createError.badRequest(
          'Subscription is already canceled',
          ErrorContextBuilders.validation('subscription'),
        );
      }

      await stripeService.cancelSubscription(subscriptionId, !immediately);

      await syncStripeDataFromStripe(subscription.customerId);

      const refreshedSubscription = await fetchRefreshedSubscription(db, subscriptionId);

      const message = immediately
        ? 'Subscription canceled immediately. You no longer have access.'
        : `Subscription will be canceled at the end of the current billing period (${refreshedSubscription.currentPeriodEnd.toLocaleDateString()}). You retain access until then.`;

      return Responses.ok(c, {
        message,
        subscription: serializeSubscriptionDates(refreshedSubscription),
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
 * Always returns 200 to prevent retry storms, processes async
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
      const event = await stripeService.constructWebhookEvent(rawBody, signature);

      // Check for existing event using batch.db for consistency
      const existingEvent = await batch.db.query.stripeWebhookEvent.findFirst({
        where: eq(tables.stripeWebhookEvent.id, event.id),
      });

      if (existingEvent?.processed) {
        return Responses.ok(c, {
          event: {
            id: event.id,
            processed: true,
            type: event.type,
          },
          received: true,
        });
      }

      const eventData = isObject(event.data.object) ? event.data.object : {};

      await batch.db.insert(tables.stripeWebhookEvent).values({
        createdAt: new Date(event.created * 1000),
        data: eventData,
        id: event.id,
        processed: false,
        type: event.type,
      }).onConflictDoNothing();

      const processAsync = async () => {
        try {
          await processWebhookEvent(event, batch.db);

          await batch.db.update(tables.stripeWebhookEvent)
            .set({ processed: true })
            .where(eq(tables.stripeWebhookEvent.id, event.id));
        } catch {}
      };

      if (c.executionCtx) {
        c.executionCtx.waitUntil(processAsync());
      } else {
        await processAsync();
      }

      return Responses.ok(c, {
        event: {
          id: event.id,
          processed: true,
          type: event.type,
        },
        received: true,
      });
    } catch {
      return Responses.ok(c, {
        event: {
          error: 'Processing failed - logged for investigation',
          id: 'unknown',
          processed: false,
          type: 'unknown',
        },
        received: true,
      });
    }
  },
);

// ============================================================================
// Webhook Event Processing (Theo's Pattern)
// ============================================================================

/**
 * Tracked Webhook Events
 * All events trigger sync from Stripe API
 */
const TRACKED_WEBHOOK_EVENTS: Stripe.Event.Type[] = [...STRIPE_WEBHOOK_EVENT_TYPES];

const StripeInvoiceSchema = z.object({
  amount_paid: z.number(),
  billing_reason: z.string().optional(),
  currency: z.string(),
  id: z.string(),
  last_finalization_error: z.object({
    message: z.string().optional(),
  }).optional(),
  lines: z.object({
    data: z.array(z.object({
      description: z.string().optional(),
    })),
  }).optional(),
  subscription: z.union([z.string(), z.object({ id: z.string() }), z.null()]).optional(),
});

const StripeSubscriptionSchema = z.object({
  currency: z.string().optional(),
  id: z.string(),
  items: z.object({
    data: z.array(z.object({
      price: z.object({
        nickname: z.string().optional(),
        unit_amount: z.number().optional(),
      }).optional(),
    })),
  }).optional(),
});

async function trackRevenueFromWebhook(
  event: Stripe.Event,
  userId: string,
  customerId: string,
) {
  const obj = event.data.object;
  if (!isObject(obj)) {
    return;
  }

  try {
    switch (event.type) {
      case StripeWebhookEventTypes.INVOICE_PAID: {
        const invoiceResult = StripeInvoiceSchema.safeParse(obj);
        if (!invoiceResult.success) {
          return;
        }
        const invoice = invoiceResult.data;
        if (!invoice.amount_paid || invoice.amount_paid <= 0) {
          return;
        }

        const subscriptionData = 'subscription' in invoice ? invoice.subscription : null;
        const subscriptionId = typeof subscriptionData === 'string'
          ? subscriptionData
          : (isObject(subscriptionData) && 'id' in subscriptionData ? String(subscriptionData.id) : undefined);

        if (!subscriptionId) {
          return;
        }

        const isFirstInvoice = invoice.billing_reason === StripeBillingReasons.SUBSCRIPTION_CREATE;

        if (isFirstInvoice) {
          await revenueTracking.subscriptionStarted({
            currency: invoice.currency.toUpperCase(),
            invoice_id: invoice.id,
            lifetime_value: invoice.amount_paid,
            product: invoice.lines?.data[0]?.description ?? undefined,
            revenue: invoice.amount_paid,
            subscription_id: subscriptionId,
            subscription_status: 'active',
            total_revenue: invoice.amount_paid,
          }, { customerId, userId });
        } else {
          await revenueTracking.subscriptionRenewed({
            currency: invoice.currency.toUpperCase(),
            invoice_id: invoice.id,
            product: invoice.lines?.data[0]?.description ?? undefined,
            revenue: invoice.amount_paid,
            subscription_id: subscriptionId,
            subscription_status: 'active',
          }, { customerId, userId });
        }
        break;
      }

      case StripeWebhookEventTypes.INVOICE_PAYMENT_FAILED: {
        const invoiceResult = StripeInvoiceSchema.safeParse(obj);
        if (!invoiceResult.success) {
          return;
        }
        const invoice = invoiceResult.data;
        const subscriptionData = 'subscription' in invoice ? invoice.subscription : null;
        const subscriptionId = typeof subscriptionData === 'string'
          ? subscriptionData
          : (isObject(subscriptionData) && 'id' in subscriptionData ? String(subscriptionData.id) : undefined);

        // Conditionally include properties to satisfy exactOptionalPropertyTypes
        await revenueTracking.paymentFailed({
          invoice_id: invoice.id,
          subscription_status: 'past_due',
          ...(invoice.last_finalization_error?.message !== undefined && { error_message: invoice.last_finalization_error.message }),
          ...(subscriptionId !== undefined && { subscription_id: subscriptionId }),
        }, { customerId, userId });
        break;
      }

      case StripeWebhookEventTypes.CUSTOMER_SUBSCRIPTION_DELETED: {
        const subscriptionResult = StripeSubscriptionSchema.safeParse(obj);
        if (!subscriptionResult.success) {
          return;
        }
        const subscription = subscriptionResult.data;
        await revenueTracking.subscriptionCanceled({
          product: subscription.items?.data[0]?.price?.nickname ?? undefined,
          subscription_id: subscription.id,
          subscription_status: 'canceled',
        }, { customerId, userId });
        break;
      }

      case StripeWebhookEventTypes.CUSTOMER_SUBSCRIPTION_UPDATED: {
        const subscriptionResult = StripeSubscriptionSchema.safeParse(obj);
        if (!subscriptionResult.success) {
          return;
        }
        const subscription = subscriptionResult.data;
        const previousAttributes = event.data.previous_attributes;

        if (isObject(previousAttributes) && 'items' in previousAttributes) {
          const currentAmount = subscription.items?.data[0]?.price?.unit_amount ?? 0;
          const previousItems = previousAttributes.items;

          let previousAmount = 0;
          if (
            isObject(previousItems)
            && 'data' in previousItems
            && Array.isArray(previousItems.data)
            && previousItems.data.length > 0
            && isObject(previousItems.data[0])
            && 'price' in previousItems.data[0]
            && isObject(previousItems.data[0].price)
            && 'unit_amount' in previousItems.data[0].price
            && typeof previousItems.data[0].price.unit_amount === 'number'
          ) {
            previousAmount = previousItems.data[0].price.unit_amount;
          }

          if (currentAmount > previousAmount) {
            await revenueTracking.subscriptionUpgraded({
              currency: (subscription.currency ?? 'usd').toUpperCase(),
              product: subscription.items?.data[0]?.price?.nickname ?? undefined,
              revenue: currentAmount,
              subscription_id: subscription.id,
              subscription_status: 'active',
            }, { customerId, userId });
          } else if (currentAmount < previousAmount) {
            await revenueTracking.subscriptionDowngraded({
              currency: (subscription.currency ?? 'usd').toUpperCase(),
              product: subscription.items?.data[0]?.price?.nickname ?? undefined,
              revenue: currentAmount,
              subscription_id: subscription.id,
              subscription_status: 'active',
            }, { customerId, userId });
          }
        }
        break;
      }
    }
  } catch {}
}

function extractCustomerId(event: Stripe.Event) {
  const obj = event.data.object;
  if (!isObject(obj) || !('customer' in obj)) {
    return null;
  }

  const customer = obj.customer;

  if (!customer) {
    return null;
  }

  if (typeof customer === 'string') {
    return customer;
  }

  // Use extractProperty to access index signature safely
  const customerId = extractProperty(customer, 'id', (v): v is string => typeof v === 'string');
  if (customerId !== undefined) {
    return customerId;
  }

  throw createError.badRequest(
    `Invalid customer type in webhook event: expected string or object with id, got ${typeof customer}`,
    ErrorContextBuilders.stripe('webhook_processing'),
  );
}

async function processWebhookEvent(
  event: Stripe.Event,
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  if (!TRACKED_WEBHOOK_EVENTS.includes(event.type)) {
    return;
  }

  const customerId = extractCustomerId(event);

  if (!customerId) {
    return;
  }

  const customer = await db.query.stripeCustomer.findFirst({
    where: eq(tables.stripeCustomer.id, customerId),
  });

  if (!customer) {
    return;
  }

  await trackRevenueFromWebhook(event, customer.userId, customerId);

  await syncStripeDataFromStripe(customerId);
}

// ============================================================================
// Credits Sync Handler
// ============================================================================
export const syncCreditsAfterCheckoutHandler: RouteHandler<typeof syncCreditsAfterCheckoutRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'syncCreditsAfterCheckout',
  },
  async (c) => {
    const { user } = c.auth();

    try {
      const balance = await getUserCreditBalance(user.id);
      return Responses.ok(c, {
        creditPurchase: null,
        creditsBalance: balance.available,
        synced: true,
      });
    } catch {
      const balance = await getUserCreditBalance(user.id).catch(() => ({ available: 0 }));
      return Responses.ok(c, {
        creditPurchase: null,
        creditsBalance: balance.available,
        synced: false,
      });
    }
  },
);

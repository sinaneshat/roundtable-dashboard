import type { RouteHandler } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { AppError, createError, normalizeError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import { createHandler, createHandlerWithBatch, Responses } from '@/api/core';
import { apiLogger } from '@/api/middleware/hono-logger';
import { stripeService } from '@/api/services/stripe.service';
import { getCustomerIdByUserId, syncStripeDataFromStripe } from '@/api/services/stripe-sync.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
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
import type { SubscriptionResponsePayload } from './schema';
import {
  CancelSubscriptionRequestSchema,
  CheckoutRequestSchema,
  CustomerPortalRequestSchema,
  ProductIdParamSchema,
  SubscriptionIdParamSchema,
  SwitchSubscriptionRequestSchema,
} from './schema';

// ============================================================================
// Internal Helper Functions (Following 3-file pattern: handler, route, schema)
// ============================================================================

/**
 * Error Context Builders - Following src/api/core/responses.ts patterns
 */
function createAuthErrorContext(operation?: string): ErrorContext {
  return {
    errorType: 'authentication',
    operation: operation || 'session_required',
  };
}

function createResourceNotFoundContext(
  resource: string,
  resourceId?: string,
  _userId?: string,
): ErrorContext {
  return {
    errorType: 'resource',
    resource,
    resourceId,
  };
}

function createAuthorizationErrorContext(
  resource: string,
  resourceId?: string,
  _userId?: string,
): ErrorContext {
  return {
    errorType: 'authorization',
    resource,
    resourceId,
  };
}

function createValidationErrorContext(field?: string): ErrorContext {
  return {
    errorType: 'validation',
    field,
  };
}

function createStripeErrorContext(
  operation?: string,
  resourceId?: string,
): ErrorContext {
  return {
    errorType: 'external_service',
    service: 'stripe',
    operation,
    resourceId,
  };
}

function createDatabaseErrorContext(
  operation: 'select' | 'insert' | 'update' | 'delete' | 'batch',
  table?: string,
): ErrorContext {
  return {
    errorType: 'database',
    operation,
    table,
  };
}

/**
 * Subscription Response Builder - Type-Safe Transformation
 * Uses official Stripe.Subscription.Status type from SDK
 */
type DatabaseSubscription = {
  id: string;
  status: string; // Will be validated as Stripe.Subscription.Status
  priceId: string;
  price: {
    productId: string;
  };
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
};

/**
 * Build subscription response using official Stripe SDK types
 * Status is typed as Stripe.Subscription.Status - no hardcoded validation needed
 */
function buildSubscriptionResponse(
  subscription: DatabaseSubscription,
): SubscriptionResponsePayload {
  return {
    id: subscription.id,
    status: subscription.status as Stripe.Subscription.Status,
    priceId: subscription.priceId,
    productId: subscription.price.productId,
    currentPeriodStart: subscription.currentPeriodStart.toISOString(),
    currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    canceledAt: subscription.canceledAt?.toISOString() || null,
    trialStart: subscription.trialStart?.toISOString() || null,
    trialEnd: subscription.trialEnd?.toISOString() || null,
  };
}

/**
 * Subscription Validation Utilities
 */
function validateSubscriptionOwnership(
  subscription: { userId: string },
  user: { id: string },
): boolean {
  return subscription.userId === user.id;
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
    // Operation start logging
    c.logger.info('Listing all products', {
      logType: 'operation',
      operationName: 'listProducts',
    });

    try {
      const db = await getDbAsync();

      // Use Drizzle relational query to get products with prices
      const dbProducts = await db.query.stripeProduct.findMany({
        where: eq(tables.stripeProduct.active, true),
        with: {
          prices: {
            where: eq(tables.stripePrice.active, true),
          },
        },
      });

      const products = dbProducts
        .map(product => ({
          id: product.id,
          name: product.name,
          description: product.description,
          features: product.features,
          active: product.active,
          prices: product.prices
            .map(price => ({
              id: price.id,
              productId: price.productId,
              unitAmount: price.unitAmount || 0,
              currency: price.currency,
              interval: (price.interval || 'month') as 'month' | 'year',
              trialPeriodDays: price.trialPeriodDays,
              active: price.active,
            }))
            .sort((a, b) => a.unitAmount - b.unitAmount), // Sort prices by amount (low to high)
        }))
        .sort((a, b) => {
          // Sort products by their lowest price (low to high)
          const lowestPriceA = a.prices[0]?.unitAmount ?? 0;
          const lowestPriceB = b.prices[0]?.unitAmount ?? 0;
          return lowestPriceA - lowestPriceB;
        });

      // Success logging with resource count
      c.logger.info('Products retrieved successfully', {
        logType: 'operation',
        operationName: 'listProducts',
        resource: `products[${products.length}]`,
      });

      return Responses.ok(c, {
        products,
        count: products.length,
      });
    } catch (error) {
      // Error logging with proper Error instance
      c.logger.error('Failed to list products', normalizeError(error));

      const context: ErrorContext = {
        errorType: 'database',
        operation: 'select',
        table: 'stripeProduct',
      };
      throw createError.internal('Failed to retrieve products', context);
    }
  },
);

export const getProductHandler: RouteHandler<typeof getProductRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    validateParams: ProductIdParamSchema,
    operationName: 'getProduct',
  },
  async (c) => {
    const { id } = c.validated.params;

    c.logger.info('Fetching product details', {
      logType: 'operation',
      operationName: 'getProduct',
      resource: id,
    });

    try {
      const db = await getDbAsync();

      // Use Drizzle relational query
      const dbProduct = await db.query.stripeProduct.findFirst({
        where: eq(tables.stripeProduct.id, id),
        with: {
          prices: {
            where: eq(tables.stripePrice.active, true),
          },
        },
      });

      if (!dbProduct) {
        c.logger.warn('Product not found', {
          logType: 'operation',
          operationName: 'getProduct',
          resource: id,
        });
        const context: ErrorContext = {
          errorType: 'resource',
          resource: 'product',
          resourceId: id,
        };
        throw createError.notFound(`Product ${id} not found`, context);
      }

      c.logger.info('Product retrieved successfully', {
        logType: 'operation',
        operationName: 'getProduct',
        resource: id,
      });

      return Responses.ok(c, {
        product: {
          id: dbProduct.id,
          name: dbProduct.name,
          description: dbProduct.description,
          features: dbProduct.features,
          active: dbProduct.active,
          prices: dbProduct.prices
            .map(price => ({
              id: price.id,
              productId: price.productId,
              unitAmount: price.unitAmount || 0,
              currency: price.currency,
              interval: (price.interval || 'month') as 'month' | 'year',
              trialPeriodDays: price.trialPeriodDays,
              active: price.active,
            }))
            .sort((a, b) => a.unitAmount - b.unitAmount), // Sort prices by amount (low to high)
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      c.logger.error('Failed to get product', normalizeError(error));
      const context: ErrorContext = {
        errorType: 'database',
        operation: 'select',
        table: 'stripeProduct',
        resourceId: id,
      };
      throw createError.internal('Failed to retrieve product', context);
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
    const user = c.get('user');
    const body = c.validated.body;

    if (!user) {
      const context: ErrorContext = {
        errorType: 'authentication',
        operation: 'session_required',
      };
      throw createError.unauthenticated('Valid session required for checkout', context);
    }

    // Operation start logging with user and resource
    c.logger.info('Creating checkout session', {
      logType: 'operation',
      operationName: 'createCheckoutSession',
      userId: user.id,
      resource: body.priceId,
    });

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
        c.logger.warn('User already has an active subscription', {
          logType: 'operation',
          operationName: 'createCheckoutSession',
          userId: user.id,
          resource: activeSubscription.id,
        });
        const context: ErrorContext = {
          errorType: 'validation',
          field: 'subscription',
        };
        throw createError.badRequest(
          'You already have an active subscription. Please cancel or modify your existing subscription instead of creating a new one.',
          context,
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
          throw createError.internal('Failed to create customer record', {
            errorType: 'database',
            operation: 'insert',
            table: 'stripeCustomer',
          });
        }

        customerId = insertedCustomer.id;

        // Log customer creation
        c.logger.info('Created new Stripe customer', {
          logType: 'operation',
          operationName: 'createCheckoutSession',
          userId: user.id,
          resource: customerId,
        });
      } else {
        customerId = stripeCustomer.id;

        // Log using existing customer
        c.logger.info('Using existing Stripe customer', {
          logType: 'operation',
          operationName: 'createCheckoutSession',
          userId: user.id,
          resource: customerId,
        });
      }

      const appUrl = c.env.NEXT_PUBLIC_APP_URL;
      // Theo's pattern: Do NOT use CHECKOUT_SESSION_ID (ignore it)
      // Success page will eagerly sync fresh data from Stripe API
      const successUrl = body.successUrl || `${appUrl}/chat/billing/success`;
      const cancelUrl = body.cancelUrl || `${appUrl}/chat/billing`;

      const session = await stripeService.createCheckoutSession({
        priceId: body.priceId,
        customerId,
        successUrl,
        cancelUrl,
        metadata: { userId: user.id },
      });

      if (!session.url) {
        const context: ErrorContext = {
          errorType: 'external_service',
          service: 'stripe',
          operation: 'create_checkout_session',
          userId: user.id,
        };
        throw createError.internal('Checkout session created but URL is missing', context);
      }

      // Success logging with session ID
      c.logger.info('Checkout session created successfully', {
        logType: 'operation',
        operationName: 'createCheckoutSession',
        userId: user.id,
        resource: session.id,
      });

      return Responses.ok(c, {
        sessionId: session.id,
        url: session.url,
      });
    } catch (error) {
      // Error logging with proper Error instance
      c.logger.error('Failed to create checkout session', normalizeError(error));
      const context: ErrorContext = {
        errorType: 'external_service',
        service: 'stripe',
        operation: 'create_checkout_session',
        userId: user.id,
      };
      throw createError.internal('Failed to create checkout session', context);
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
    const user = c.get('user');
    const body = c.validated.body;

    if (!user) {
      const context: ErrorContext = {
        errorType: 'authentication',
        operation: 'session_required',
      };
      throw createError.unauthenticated('Valid session required for customer portal', context);
    }

    // Operation start logging
    c.logger.info('Creating customer portal session', {
      logType: 'operation',
      operationName: 'createCustomerPortalSession',
      userId: user.id,
    });

    try {
      // Get customer ID from database
      const customerId = await getCustomerIdByUserId(user.id);

      if (!customerId) {
        const context: ErrorContext = {
          errorType: 'resource',
          resource: 'customer',
          userId: user.id,
        };
        throw createError.badRequest('No Stripe customer found for this user. Please create a subscription first.', context);
      }

      const appUrl = c.env.NEXT_PUBLIC_APP_URL;
      const returnUrl = body.returnUrl || `${appUrl}/chat`;

      const session = await stripeService.createCustomerPortalSession({
        customerId,
        returnUrl,
      });

      if (!session.url) {
        const context: ErrorContext = {
          errorType: 'external_service',
          service: 'stripe',
          operation: 'create_portal_session',
          userId: user.id,
        };
        throw createError.internal('Portal session created but URL is missing', context);
      }

      // Success logging
      c.logger.info('Customer portal session created successfully', {
        logType: 'operation',
        operationName: 'createCustomerPortalSession',
        userId: user.id,
        resource: customerId,
      });

      return Responses.ok(c, {
        url: session.url,
      });
    } catch (error) {
      // Re-throw if already an AppError
      if (error instanceof AppError) {
        throw error;
      }

      // Error logging with proper Error instance
      c.logger.error('Failed to create customer portal session', normalizeError(error));
      const context: ErrorContext = {
        errorType: 'external_service',
        service: 'stripe',
        operation: 'create_portal_session',
        userId: user.id,
      };
      throw createError.internal('Failed to create customer portal session', context);
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
    const user = c.get('user');

    if (!user) {
      const context: ErrorContext = {
        errorType: 'authentication',
        operation: 'session_required',
      };
      throw createError.unauthenticated('Valid session required to list subscriptions', context);
    }

    // Operation start logging
    c.logger.info('Listing user subscriptions', {
      logType: 'operation',
      operationName: 'listSubscriptions',
      userId: user.id,
    });

    try {
      const db = await getDbAsync();

      // Use Drizzle relational query with nested relations
      const dbSubscriptions = await db.query.stripeSubscription.findMany({
        where: eq(tables.stripeSubscription.userId, user.id),
        with: {
          price: {
            with: {
              product: true,
            },
          },
        },
      });

      const subscriptions = dbSubscriptions.map(subscription => ({
        id: subscription.id,
        status: subscription.status as 'active' | 'past_due' | 'unpaid' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'paused',
        priceId: subscription.priceId,
        productId: subscription.price.productId,
        currentPeriodStart: subscription.currentPeriodStart.toISOString(),
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt?.toISOString() || null,
        trialStart: subscription.trialStart?.toISOString() || null,
        trialEnd: subscription.trialEnd?.toISOString() || null,
      }));

      // Success logging with resource count
      c.logger.info('Subscriptions retrieved successfully', {
        logType: 'operation',
        operationName: 'listSubscriptions',
        userId: user.id,
        resource: `subscriptions[${subscriptions.length}]`,
      });

      return Responses.ok(c, {
        subscriptions,
        count: subscriptions.length,
      });
    } catch (error) {
      // Error logging with proper Error instance
      c.logger.error('Failed to list subscriptions', normalizeError(error));
      const context: ErrorContext = {
        errorType: 'database',
        operation: 'select',
        table: 'stripeSubscription',
        userId: user.id,
      };
      throw createError.internal('Failed to retrieve subscriptions', context);
    }
  },
);

export const getSubscriptionHandler: RouteHandler<typeof getSubscriptionRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: SubscriptionIdParamSchema,
    operationName: 'getSubscription',
  },
  async (c) => {
    const user = c.get('user');
    const { id } = c.validated.params;

    if (!user) {
      const context: ErrorContext = {
        errorType: 'authentication',
        operation: 'session_required',
      };
      throw createError.unauthenticated('Valid session required to view subscription', context);
    }

    c.logger.info('Fetching subscription details', {
      logType: 'operation',
      operationName: 'getSubscription',
      userId: user.id,
      resource: id,
    });

    const db = await getDbAsync();

    try {
      // Use Drizzle relational query with nested relations
      const subscription = await db.query.stripeSubscription.findFirst({
        where: eq(tables.stripeSubscription.id, id),
        with: {
          price: {
            with: {
              product: true,
            },
          },
        },
      });

      if (!subscription) {
        // Warning log before throwing not found error
        c.logger.warn('Subscription not found', {
          logType: 'operation',
          operationName: 'getSubscription',
          userId: user.id,
          resource: id,
        });
        const context: ErrorContext = {
          errorType: 'resource',
          resource: 'subscription',
          resourceId: id,
          userId: user.id,
        };
        throw createError.notFound(`Subscription ${id} not found`, context);
      }

      if (subscription.userId !== user.id) {
        // Warning log before throwing unauthorized error
        c.logger.warn('Unauthorized subscription access attempt', {
          logType: 'operation',
          operationName: 'getSubscription',
          userId: user.id,
          resource: id,
        });
        const context: ErrorContext = {
          errorType: 'authorization',
          resource: 'subscription',
          resourceId: id,
          userId: user.id,
        };
        throw createError.unauthorized('You do not have access to this subscription', context);
      }

      c.logger.info('Subscription retrieved successfully', {
        logType: 'operation',
        operationName: 'getSubscription',
        userId: user.id,
        resource: id,
      });

      return Responses.ok(c, {
        subscription: {
          id: subscription.id,
          status: subscription.status as 'active' | 'past_due' | 'unpaid' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'paused',
          priceId: subscription.priceId,
          productId: subscription.price.productId,
          currentPeriodStart: subscription.currentPeriodStart.toISOString(),
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          canceledAt: subscription.canceledAt?.toISOString() || null,
          trialStart: subscription.trialStart?.toISOString() || null,
          trialEnd: subscription.trialEnd?.toISOString() || null,
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      c.logger.error('Failed to get subscription', normalizeError(error));
      const context: ErrorContext = {
        errorType: 'database',
        operation: 'select',
        table: 'stripeSubscription',
        resourceId: id,
        userId: user.id,
      };
      throw createError.internal('Failed to retrieve subscription', context);
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
    const user = c.get('user');

    if (!user) {
      const context: ErrorContext = {
        errorType: 'authentication',
        operation: 'session_required',
      };
      throw createError.unauthenticated('Valid session required for sync', context);
    }

    c.logger.info('Syncing Stripe data after checkout', {
      logType: 'operation',
      operationName: 'syncAfterCheckout',
      userId: user.id,
    });

    try {
      // Get customer ID from user ID
      const customerId = await getCustomerIdByUserId(user.id);

      if (!customerId) {
        c.logger.warn('No Stripe customer found for user', {
          logType: 'operation',
          operationName: 'syncAfterCheckout',
          userId: user.id,
        });

        const context: ErrorContext = {
          errorType: 'resource',
          resource: 'customer',
          userId: user.id,
        };
        throw createError.notFound('No Stripe customer found for user', context);
      }

      // Eagerly sync data from Stripe API (Theo's pattern)
      const syncedState = await syncStripeDataFromStripe(customerId);

      c.logger.info('Stripe data synced successfully', {
        logType: 'operation',
        operationName: 'syncAfterCheckout',
        userId: user.id,
        resource: syncedState.status !== 'none' ? syncedState.subscriptionId : 'none',
      });

      return Responses.ok(c, {
        synced: true,
        subscription: syncedState.status !== 'none'
          ? {
              status: syncedState.status,
              subscriptionId: syncedState.subscriptionId,
            }
          : null,
      });
    } catch (error) {
      c.logger.error('Failed to sync Stripe data', normalizeError(error));
      const context: ErrorContext = {
        errorType: 'external_service',
        service: 'stripe',
        operation: 'sync_data',
        userId: user.id,
      };
      throw createError.internal('Failed to sync Stripe data', context);
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
    validateParams: SubscriptionIdParamSchema,
    validateBody: SwitchSubscriptionRequestSchema,
    operationName: 'switchSubscription',
  },
  async (c) => {
    const user = c.get('user');
    const { id: subscriptionId } = c.validated.params;
    const { newPriceId } = c.validated.body;

    if (!user) {
      throw createError.unauthenticated('Valid session required to switch subscription', createAuthErrorContext());
    }

    c.logger.info('Switching subscription', {
      logType: 'operation',
      operationName: 'switchSubscription',
      userId: user.id,
      resource: subscriptionId,
    });

    try {
      const db = await getDbAsync();

      // Verify subscription exists and belongs to user
      const subscription = await db.query.stripeSubscription.findFirst({
        where: eq(tables.stripeSubscription.id, subscriptionId),
      });

      if (!subscription) {
        throw createError.notFound(
          `Subscription ${subscriptionId} not found`,
          createResourceNotFoundContext('subscription', subscriptionId, user.id),
        );
      }

      if (!validateSubscriptionOwnership(subscription, user)) {
        throw createError.unauthorized(
          'You do not have access to this subscription',
          createAuthorizationErrorContext('subscription', subscriptionId, user.id),
        );
      }

      // Verify new price exists and get current price for comparison
      const newPrice = await db.query.stripePrice.findFirst({
        where: eq(tables.stripePrice.id, newPriceId),
      });

      if (!newPrice) {
        throw createError.badRequest(
          `Price ${newPriceId} not found`,
          createResourceNotFoundContext('price', newPriceId),
        );
      }

      const currentPrice = await db.query.stripePrice.findFirst({
        where: eq(tables.stripePrice.id, subscription.priceId),
      });

      if (!currentPrice) {
        throw createError.internal(
          'Current subscription price not found',
          createResourceNotFoundContext('price', subscription.priceId),
        );
      }

      // Update subscription in Stripe
      const stripe = stripeService.getClient();
      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      const subscriptionItemId = stripeSubscription.items.data[0]?.id;

      if (!subscriptionItemId) {
        throw createError.internal(
          'Subscription has no items',
          createStripeErrorContext('retrieve_subscription', subscriptionId),
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

        c.logger.info('Upgrade applied immediately', {
          logType: 'operation',
          operationName: 'switchSubscription',
          userId: user.id,
          resource: subscriptionId,
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

        c.logger.info('Downgrade scheduled for period end', {
          logType: 'operation',
          operationName: 'switchSubscription',
          userId: user.id,
          resource: subscriptionId,
        });
      } else {
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

        c.logger.info('Subscription updated (same price tier)', {
          logType: 'operation',
          operationName: 'switchSubscription',
          userId: user.id,
          resource: subscriptionId,
        });
      }

      // Sync fresh data from Stripe API
      await syncStripeDataFromStripe(subscription.customerId);

      // Fetch updated subscription from database
      const refreshedSubscription = await db.query.stripeSubscription.findFirst({
        where: eq(tables.stripeSubscription.id, subscriptionId),
        with: {
          price: {
            with: {
              product: true,
            },
          },
        },
      });

      if (!refreshedSubscription) {
        throw createError.internal(
          'Failed to fetch updated subscription',
          createDatabaseErrorContext('select', 'stripeSubscription'),
        );
      }

      c.logger.info('Subscription updated successfully', {
        logType: 'operation',
        operationName: 'switchSubscription',
        userId: user.id,
        resource: subscriptionId,
      });

      return Responses.ok(c, {
        subscription: buildSubscriptionResponse(refreshedSubscription),
        message: 'Subscription updated successfully',
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      c.logger.error('Failed to switch subscription', normalizeError(error));
      throw createError.internal(
        'Failed to switch subscription',
        createStripeErrorContext('update_subscription', subscriptionId),
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
    validateParams: SubscriptionIdParamSchema,
    validateBody: CancelSubscriptionRequestSchema,
    operationName: 'cancelSubscription',
  },
  async (c) => {
    const user = c.get('user');
    const { id: subscriptionId } = c.validated.params;
    const { immediately = false } = c.validated.body;

    if (!user) {
      throw createError.unauthenticated('Valid session required to cancel subscription', createAuthErrorContext());
    }

    c.logger.info(`Canceling subscription${immediately ? ' immediately' : ' at period end'}`, {
      logType: 'operation',
      operationName: 'cancelSubscription',
      userId: user.id,
      resource: subscriptionId,
    });

    try {
      const db = await getDbAsync();

      // Verify subscription exists and belongs to user
      const subscription = await db.query.stripeSubscription.findFirst({
        where: eq(tables.stripeSubscription.id, subscriptionId),
      });

      if (!subscription) {
        throw createError.notFound(
          `Subscription ${subscriptionId} not found`,
          createResourceNotFoundContext('subscription', subscriptionId, user.id),
        );
      }

      if (!validateSubscriptionOwnership(subscription, user)) {
        throw createError.unauthorized(
          'You do not have access to this subscription',
          createAuthorizationErrorContext('subscription', subscriptionId, user.id),
        );
      }

      // Check if subscription is already canceled
      if (subscription.status === 'canceled') {
        throw createError.badRequest(
          'Subscription is already canceled',
          createValidationErrorContext('subscription'),
        );
      }

      // Cancel subscription in Stripe
      await stripeService.cancelSubscription(subscriptionId, !immediately);

      // Sync fresh data from Stripe API
      await syncStripeDataFromStripe(subscription.customerId);

      // Fetch updated subscription from database
      const refreshedSubscription = await db.query.stripeSubscription.findFirst({
        where: eq(tables.stripeSubscription.id, subscriptionId),
        with: {
          price: {
            with: {
              product: true,
            },
          },
        },
      });

      if (!refreshedSubscription) {
        throw createError.internal(
          'Failed to fetch updated subscription',
          createDatabaseErrorContext('select', 'stripeSubscription'),
        );
      }

      const message = immediately
        ? 'Subscription canceled immediately. You no longer have access.'
        : `Subscription will be canceled at the end of the current billing period (${refreshedSubscription.currentPeriodEnd.toLocaleDateString()}). You retain access until then.`;

      c.logger.info(`Subscription canceled successfully${immediately ? ' immediately' : ' at period end'}`, {
        logType: 'operation',
        operationName: 'cancelSubscription',
        userId: user.id,
        resource: subscriptionId,
      });

      return Responses.ok(c, {
        subscription: buildSubscriptionResponse(refreshedSubscription),
        message,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      c.logger.error('Failed to cancel subscription', normalizeError(error));
      throw createError.internal(
        'Failed to cancel subscription',
        createStripeErrorContext('cancel_subscription', subscriptionId),
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
      // Log missing signature attempt
      c.logger.warn('Webhook request missing stripe-signature header', {
        logType: 'operation',
        operationName: 'handleStripeWebhook',
      });
      const context: ErrorContext = {
        errorType: 'validation',
        field: 'stripe-signature',
      };
      throw createError.badRequest('Missing stripe-signature header', context);
    }

    // Operation start logging
    c.logger.info('Processing Stripe webhook', {
      logType: 'operation',
      operationName: 'handleStripeWebhook',
    });

    try {
      const rawBody = await c.req.text();
      const event = stripeService.constructWebhookEvent(rawBody, signature);

      // Log successful signature verification
      c.logger.info('Webhook signature verified', {
        logType: 'operation',
        operationName: 'handleStripeWebhook',
        resource: `${event.type}-${event.id}`,
      });

      // Check for existing event using batch.db for consistency
      const existingEvent = await batch.db.query.stripeWebhookEvent.findFirst({
        where: eq(tables.stripeWebhookEvent.id, event.id),
      });

      if (existingEvent?.processed) {
        // Log idempotent webhook (already processed)
        c.logger.info('Webhook event already processed (idempotent)', {
          logType: 'operation',
          operationName: 'handleStripeWebhook',
          resource: event.id,
        });

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
          await processWebhookEvent(event, batch.db);

          // Update webhook event as processed using batch.db
          await batch.db.update(tables.stripeWebhookEvent)
            .set({ processed: true })
            .where(eq(tables.stripeWebhookEvent.id, event.id));

          // Success logging with event type and ID
          c.logger.info('Webhook processed successfully', {
            logType: 'operation',
            operationName: 'handleStripeWebhook',
            resource: `${event.type}-${event.id}`,
          });
        } catch (error) {
          // Background processing error - log but don't fail the response
          c.logger.error(
            `Background webhook processing failed for event ${event.type} (${event.id})`,
            normalizeError(error),
          );
        }
      };

      // Use Cloudflare Workers async processing if available (production)
      // Otherwise process synchronously (local development)
      if (c.executionCtx) {
        c.executionCtx.waitUntil(processAsync());
      } else {
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
    } catch (error) {
      // Error logging with proper Error instance
      c.logger.error('Webhook processing failed', normalizeError(error));

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
  const context: ErrorContext = {
    errorType: 'external_service',
    service: 'stripe',
    operation: 'webhook_processing',
  };
  throw createError.badRequest(
    `Invalid customer type in webhook event: expected string or object with id, got ${typeof obj.customer}`,
    context,
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
async function processWebhookEvent(
  event: Stripe.Event,
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<void> {
  // Skip if event type not tracked
  if (!TRACKED_WEBHOOK_EVENTS.includes(event.type)) {
    return;
  }

  // Extract customer ID
  const customerId = extractCustomerId(event);

  if (!customerId) {
    apiLogger.warn('Webhook event missing customer ID', {
      logType: 'operation',
      operationName: 'webhookMissingCustomer',
      resource: `${event.type}-${event.id}`,
    });
    return;
  }

  // Verify customer exists in our database
  const customer = await db.query.stripeCustomer.findFirst({
    where: eq(tables.stripeCustomer.id, customerId),
  });

  if (!customer) {
    apiLogger.warn('Webhook event for unknown customer', {
      logType: 'operation',
      operationName: 'webhookUnknownCustomer',
      resource: `${event.type}-${customerId}`,
    });
    return;
  }

  // Single sync function - fetches fresh data from Stripe API (Theo's pattern)
  await syncStripeDataFromStripe(customerId);
}

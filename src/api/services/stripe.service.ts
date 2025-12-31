/**
 * Stripe Service
 *
 * ✅ ZOD-FIRST: All types inferred from Zod schemas
 * Handles all Stripe API interactions for billing operations.
 * Provides type-safe methods for:
 * - Product and price management
 * - Customer creation and management
 * - Subscription lifecycle operations
 * - Checkout session creation
 * - Webhook event processing
 */

import { z } from '@hono/zod-openapi';
import Stripe from 'stripe';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import type { ApiEnv } from '@/api/types';

// ============================================================================
// ZOD SCHEMAS (Single Source of Truth)
// ============================================================================

/**
 * Stripe service configuration schema
 * Used for runtime validation when initializing the service
 */
const StripeServiceConfigSchema = z.object({
  secretKey: z.string().min(1),
  webhookSecret: z.string().min(1),
  portalConfigId: z.string().optional(),
  // apiVersion uses Stripe library type - optional, has default value
  apiVersion: z.custom<Stripe.LatestApiVersion>().optional(),
});

export type StripeServiceConfig = z.infer<typeof StripeServiceConfigSchema>;

/**
 * Stripe service class
 * Singleton pattern - initialized once with environment config
 */
class StripeService {
  private stripe: Stripe | null = null;
  private webhookSecret: string | null = null;
  private portalConfigId: string | null = null;

  /**
   * Initialize Stripe client with configuration
   * Must be called before using any Stripe methods
   *
   * ✅ ZOD VALIDATION: Config validated at runtime
   */
  initialize(config: StripeServiceConfig): void {
    if (this.stripe) {
      return; // Already initialized
    }

    // ✅ Runtime validation with Zod
    const validationResult = StripeServiceConfigSchema.safeParse(config);
    if (!validationResult.success) {
      const context: ErrorContext = {
        errorType: 'configuration',
        service: 'stripe',
      };
      throw createError.internal(
        `Invalid Stripe configuration: ${validationResult.error.message}`,
        context,
      );
    }

    this.stripe = new Stripe(config.secretKey, {
      apiVersion: config.apiVersion || '2025-12-15.clover',
      typescript: true,
      httpClient: Stripe.createFetchHttpClient(), // Use fetch for Cloudflare Workers
    });

    this.webhookSecret = config.webhookSecret;
    this.portalConfigId = config.portalConfigId || null;
  }

  /**
   * Get initialized Stripe client
   * Throws if not initialized
   */
  public getClient(): Stripe {
    if (!this.stripe) {
      const context: ErrorContext = {
        errorType: 'configuration',
        service: 'stripe',
      };
      throw createError.internal('Stripe service not initialized. Call initialize() first.', context);
    }
    return this.stripe;
  }

  /**
   * Get webhook secret
   * Throws if not initialized
   */
  private getWebhookSecret(): string {
    if (!this.webhookSecret) {
      const context: ErrorContext = {
        errorType: 'configuration',
        service: 'stripe',
        operation: 'webhook_secret',
      };
      throw createError.internal('Stripe webhook secret not configured. Call initialize() first.', context);
    }
    return this.webhookSecret;
  }

  // ============================================================================
  // Product Operations
  // ============================================================================

  /**
   * List all active products with their prices
   */
  async listProducts(): Promise<Stripe.Product[]> {
    const stripe = this.getClient();

    const products = await stripe.products.list({
      active: true,
      expand: ['data.default_price'],
    });

    return products.data;
  }

  /**
   * Get a single product with prices
   */
  async getProduct(productId: string): Promise<Stripe.Product> {
    const stripe = this.getClient();

    const product = await stripe.products.retrieve(productId, {
      expand: ['default_price'],
    });

    return product;
  }

  /**
   * List prices for a product
   */
  async listPrices(productId: string): Promise<Stripe.Price[]> {
    const stripe = this.getClient();

    const prices = await stripe.prices.list({
      product: productId,
      active: true,
    });

    return prices.data;
  }

  // ============================================================================
  // Customer Operations
  // ============================================================================

  /**
   * Create a Stripe customer for a user
   */
  async createCustomer(params: {
    email: string;
    name?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Customer> {
    const stripe = this.getClient();

    const customer = await stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: params.metadata || {},
    });

    return customer;
  }

  /**
   * Get a Stripe customer by ID
   */
  async getCustomer(customerId: string): Promise<Stripe.Customer> {
    const stripe = this.getClient();

    const customer = await stripe.customers.retrieve(customerId);

    if (customer.deleted) {
      const context: ErrorContext = {
        errorType: 'resource',
        resource: 'customer',
        resourceId: customerId,
        service: 'stripe',
      };
      throw createError.notFound(`Customer ${customerId} has been deleted`, context);
    }

    return customer;
  }

  /**
   * Update a Stripe customer
   */
  async updateCustomer(
    customerId: string,
    params: Stripe.CustomerUpdateParams,
  ): Promise<Stripe.Customer> {
    const stripe = this.getClient();

    const customer = await stripe.customers.update(customerId, params);

    return customer;
  }

  // ============================================================================
  // Subscription Operations
  // ============================================================================

  /**
   * Create a subscription for a customer
   */
  async createSubscription(params: {
    customerId: string;
    priceId: string;
    trialPeriodDays?: number;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Subscription> {
    const stripe = this.getClient();

    const subscription = await stripe.subscriptions.create({
      customer: params.customerId,
      items: [{ price: params.priceId }],
      trial_period_days: params.trialPeriodDays,
      metadata: params.metadata || {},
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
    });

    return subscription;
  }

  /**
   * Get a subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    const stripe = this.getClient();

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice', 'customer'],
    });

    return subscription;
  }

  /**
   * List subscriptions for a customer
   */
  async listSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    const stripe = this.getClient();

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      expand: ['data.latest_invoice'],
    });

    return subscriptions.data;
  }

  /**
   * Update a subscription
   */
  async updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams,
  ): Promise<Stripe.Subscription> {
    const stripe = this.getClient();

    const subscription = await stripe.subscriptions.update(subscriptionId, params);

    return subscription;
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd = true,
  ): Promise<Stripe.Subscription> {
    const stripe = this.getClient();

    if (cancelAtPeriodEnd) {
      // Cancel at period end (user retains access until end of billing period)
      return await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    } else {
      // Cancel immediately
      return await stripe.subscriptions.cancel(subscriptionId);
    }
  }

  // ============================================================================
  // Checkout Operations
  // ============================================================================

  /**
   * Create a checkout session for subscription or one-time payment
   * Automatically detects mode based on price type
   */
  async createCheckoutSession(params: {
    priceId: string;
    customerId?: string;
    customerEmail?: string;
    successUrl: string;
    cancelUrl: string;
    trialPeriodDays?: number;
    metadata?: Record<string, string>;
    mode?: 'subscription' | 'payment';
  }): Promise<Stripe.Checkout.Session> {
    const stripe = this.getClient();

    // Auto-detect mode if not provided by fetching price details
    let checkoutMode: 'subscription' | 'payment' = params.mode || 'subscription';
    if (!params.mode) {
      const price = await stripe.prices.retrieve(params.priceId);
      checkoutMode = price.type === 'recurring' ? 'subscription' : 'payment';
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: checkoutMode,
      line_items: [
        {
          price: params.priceId,
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata || {},
    };

    // Add customer or email
    if (params.customerId) {
      sessionParams.customer = params.customerId;
    } else if (params.customerEmail) {
      sessionParams.customer_email = params.customerEmail;
    }

    // Add trial period if specified (only for subscriptions)
    if (params.trialPeriodDays && checkoutMode === 'subscription') {
      sessionParams.subscription_data = {
        trial_period_days: params.trialPeriodDays,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return session;
  }

  /**
   * Get a checkout session by ID
   */
  async getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    const stripe = this.getClient();

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'subscription'],
    });

    return session;
  }

  // ============================================================================
  // Webhook Operations
  // ============================================================================

  /**
   * Construct and verify a webhook event
   * Returns the verified event or throws an error
   */
  constructWebhookEvent(payload: string, signature: string): Stripe.Event {
    const stripe = this.getClient();
    const webhookSecret = this.getWebhookSecret();

    try {
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );
      return event;
    } catch {
      const context: ErrorContext = {
        errorType: 'external_service',
        service: 'stripe',
        operation: 'webhook_verification',
      };
      // Signature verification failure is a 400 Bad Request (malformed/invalid signature)
      // not a 401 Unauthorized (authentication would suggest retrying with credentials)
      throw createError.badRequest('Invalid webhook signature', context);
    }
  }

  // ============================================================================
  // Billing Portal Operations
  // ============================================================================

  /**
   * Create a customer portal session for managing subscriptions and billing
   */
  async createCustomerPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<Stripe.BillingPortal.Session> {
    const stripe = this.getClient();

    const sessionParams: Stripe.BillingPortal.SessionCreateParams = {
      customer: params.customerId,
      return_url: params.returnUrl,
    };

    // Add portal configuration if available
    if (this.portalConfigId) {
      sessionParams.configuration = this.portalConfigId;
    }

    const session = await stripe.billingPortal.sessions.create(sessionParams);

    return session;
  }

  // ============================================================================
  // Invoice Operations
  // ============================================================================

  /**
   * Get an invoice by ID
   */
  async getInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    const stripe = this.getClient();

    const invoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ['subscription', 'customer'],
    });

    return invoice;
  }

  /**
   * List invoices for a customer
   */
  async listInvoices(customerId: string): Promise<Stripe.Invoice[]> {
    const stripe = this.getClient();

    const invoices = await stripe.invoices.list({
      customer: customerId,
    });

    return invoices.data;
  }
}

/**
 * Singleton instance
 */
export const stripeService = new StripeService();

/**
 * Initialize Stripe service from environment
 * Must be called before using stripeService
 */
export function initializeStripe(env: ApiEnv['Bindings']): void {
  stripeService.initialize({
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    portalConfigId: env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_CONFIG_ID,
  });
}

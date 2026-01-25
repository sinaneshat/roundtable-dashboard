/**
 * Stripe Service
 *
 * Handles all Stripe API interactions for billing operations.
 *
 * IMPORTANT: Stripe SDK is lazy-loaded to reduce worker startup CPU time.
 * This is critical for Cloudflare Workers which have a 400ms startup limit.
 */

import { z } from '@hono/zod-openapi';
import { PriceTypes } from '@roundtable/shared/enums';
import type Stripe from 'stripe';

import { createError } from '@/common/error-handling';
import type { ApiEnv } from '@/types';

// ============================================================================
// LAZY STRIPE LOADING
// ============================================================================

// Cache the Stripe module to avoid repeated dynamic imports
let StripeModule: typeof import('stripe').default | null = null;

async function getStripeModule(): Promise<typeof import('stripe').default> {
  if (!StripeModule) {
    StripeModule = (await import('stripe')).default;
  }
  return StripeModule;
}

// ============================================================================
// SCHEMAS
// ============================================================================

const StripeServiceConfigSchema = z.object({
  secretKey: z.string().min(1),
  webhookSecret: z.string().min(1),
  portalConfigId: z.string().optional(),
  apiVersion: z.custom<Stripe.LatestApiVersion>().optional(),
}).strict();

export type StripeServiceConfig = z.infer<typeof StripeServiceConfigSchema>;

class StripeService {
  private stripe: Stripe | null = null;
  private config: StripeServiceConfig | null = null;
  private webhookSecret: string | null = null;
  private portalConfigId: string | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Store config for lazy initialization.
   * Actual Stripe client is created on first use.
   */
  initialize(config: StripeServiceConfig): void {
    if (this.config) {
      return;
    }

    const validationResult = StripeServiceConfigSchema.safeParse(config);
    if (!validationResult.success) {
      throw createError.internal(
        `Invalid Stripe configuration: ${validationResult.error.message}`,
        { errorType: 'configuration', service: 'stripe' },
      );
    }

    this.config = config;
    this.webhookSecret = config.webhookSecret;
    this.portalConfigId = config.portalConfigId || null;
  }

  /**
   * Lazy-load Stripe client on first use
   */
  async ensureClient(): Promise<Stripe> {
    if (this.stripe) {
      return this.stripe;
    }

    if (!this.config) {
      throw createError.internal(
        'Stripe service not initialized',
        { errorType: 'configuration', service: 'stripe' },
      );
    }

    // Capture config in local variable for closure (TypeScript narrowing)
    const config = this.config;

    // Use a promise to ensure only one initialization happens
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const StripeClass = await getStripeModule();
        this.stripe = new StripeClass(config.secretKey, {
          apiVersion: config.apiVersion || '2025-12-15.clover',
          typescript: true,
          httpClient: StripeClass.createFetchHttpClient(),
        });
      })();
    }

    await this.initPromise;

    if (!this.stripe) {
      throw createError.internal(
        'Stripe client initialization failed',
        { errorType: 'configuration', service: 'stripe' },
      );
    }
    return this.stripe;
  }

  private getWebhookSecret(): string {
    if (!this.webhookSecret) {
      throw createError.internal(
        'Stripe webhook secret not configured',
        { errorType: 'configuration', service: 'stripe', operation: 'webhook_secret' },
      );
    }
    return this.webhookSecret;
  }

  async listProducts(): Promise<Stripe.Product[]> {
    const stripe = await this.ensureClient();
    const products = await stripe.products.list({
      active: true,
      expand: ['data.default_price'],
    });
    return products.data;
  }

  async getProduct(productId: string): Promise<Stripe.Product> {
    const stripe = await this.ensureClient();
    return await stripe.products.retrieve(productId, {
      expand: ['default_price'],
    });
  }

  async listPrices(productId: string): Promise<Stripe.Price[]> {
    const stripe = await this.ensureClient();
    const prices = await stripe.prices.list({ product: productId, active: true });
    return prices.data;
  }

  async createCustomer(params: {
    email: string;
    name?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Customer> {
    const stripe = await this.ensureClient();
    return await stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: params.metadata || {},
    });
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer> {
    const stripe = await this.ensureClient();
    const customer = await stripe.customers.retrieve(customerId);

    if (customer.deleted) {
      throw createError.notFound(
        `Customer ${customerId} has been deleted`,
        { errorType: 'resource', resource: 'customer', resourceId: customerId, service: 'stripe' },
      );
    }

    return customer;
  }

  async updateCustomer(
    customerId: string,
    params: Stripe.CustomerUpdateParams,
  ): Promise<Stripe.Customer> {
    const stripe = await this.ensureClient();
    return await stripe.customers.update(customerId, params);
  }

  async createSubscription(params: {
    customerId: string;
    priceId: string;
    trialPeriodDays?: number;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Subscription> {
    const stripe = await this.ensureClient();
    return await stripe.subscriptions.create({
      customer: params.customerId,
      items: [{ price: params.priceId }],
      trial_period_days: params.trialPeriodDays,
      metadata: params.metadata || {},
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    const stripe = await this.ensureClient();
    return await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice', 'customer'],
    });
  }

  async listSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    const stripe = await this.ensureClient();
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      expand: ['data.latest_invoice'],
    });
    return subscriptions.data;
  }

  async updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams,
  ): Promise<Stripe.Subscription> {
    const stripe = await this.ensureClient();
    return await stripe.subscriptions.update(subscriptionId, params);
  }

  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd = true,
  ): Promise<Stripe.Subscription> {
    const stripe = await this.ensureClient();
    return cancelAtPeriodEnd
      ? await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true })
      : await stripe.subscriptions.cancel(subscriptionId);
  }

  /**
   * Create Stripe Checkout Session
   *
   * THEO'S PATTERN: customerId is REQUIRED - customer must exist BEFORE checkout.
   * Never use customerEmail fallback (ephemeral customers cause split-brain state).
   * @see https://github.com/t3dotgg/stripe-recommendations
   */
  async createCheckoutSession(params: {
    priceId: string;
    customerId: string;
    successUrl: string;
    cancelUrl: string;
    trialPeriodDays?: number;
    metadata?: Record<string, string>;
    mode?: 'subscription' | 'payment';
  }): Promise<Stripe.Checkout.Session> {
    const stripe = await this.ensureClient();

    let checkoutMode: 'subscription' | 'payment' = params.mode || 'subscription';
    if (!params.mode) {
      const price = await stripe.prices.retrieve(params.priceId);
      checkoutMode = price.type === PriceTypes.RECURRING ? 'subscription' : 'payment';
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: checkoutMode,
      customer: params.customerId,
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata || {},
    };

    if (params.trialPeriodDays && checkoutMode === 'subscription') {
      sessionParams.subscription_data = { trial_period_days: params.trialPeriodDays };
    }

    return await stripe.checkout.sessions.create(sessionParams);
  }

  async constructWebhookEvent(payload: string, signature: string): Promise<Stripe.Event> {
    const stripe = await this.ensureClient();
    const webhookSecret = this.getWebhookSecret();

    try {
      return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch {
      throw createError.badRequest(
        'Invalid webhook signature',
        { errorType: 'external_service', service: 'stripe', operation: 'webhook_verification' },
      );
    }
  }

  async createCustomerPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<Stripe.BillingPortal.Session> {
    const stripe = await this.ensureClient();
    const sessionParams: Stripe.BillingPortal.SessionCreateParams = {
      customer: params.customerId,
      return_url: params.returnUrl,
    };

    if (this.portalConfigId) {
      sessionParams.configuration = this.portalConfigId;
    }

    return await stripe.billingPortal.sessions.create(sessionParams);
  }

  async getInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    const stripe = await this.ensureClient();
    return await stripe.invoices.retrieve(invoiceId, {
      expand: ['subscription', 'customer'],
    });
  }

  async listInvoices(customerId: string): Promise<Stripe.Invoice[]> {
    const stripe = await this.ensureClient();
    const invoices = await stripe.invoices.list({ customer: customerId });
    return invoices.data;
  }
}

export const stripeService = new StripeService();

export function initializeStripe(env: ApiEnv['Bindings']): void {
  stripeService.initialize({
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    portalConfigId: env.STRIPE_CUSTOMER_PORTAL_CONFIG_ID,
  });
}

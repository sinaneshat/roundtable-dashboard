/**
 * Billing Services - Domain Barrel Export
 *
 * Single source of truth for all billing-related API services
 * Matches backend route structure: /api/v1/billing/*
 */

// Checkout
export {
  type CreateCheckoutSessionRequest,
  type CreateCheckoutSessionResponse,
  createCheckoutSessionService,
  getCheckoutUrl,
  getSyncedTierChange,
  getSyncPurchaseType,
  isCheckoutSuccess,
  isSyncAfterCheckoutSuccess,
  type SyncAfterCheckoutRequest,
  type SyncAfterCheckoutResponse,
  syncAfterCheckoutService,
} from './checkout';

// Subscription Management
export {
  type CancelSubscriptionRequest,
  type CancelSubscriptionResponse,
  cancelSubscriptionService,
  isCancelSuccess,
  isSwitchSuccess,
  type SwitchSubscriptionRequest,
  type SwitchSubscriptionResponse,
  switchSubscriptionService,
} from './management';

// Customer Portal
export {
  type CreateCustomerPortalSessionRequest,
  type CreateCustomerPortalSessionResponse,
  createCustomerPortalSessionService,
  getPortalUrl,
  isPortalSuccess,
} from './portal';

// Products
export {
  type GetProductRequest,
  type GetProductResponse,
  getProductService,
  getProductsFromResponse,
  getProductsService,
  isProductsSuccess,
  type ListProductsResponse,
  type Price,
  type Product,
} from './products';

// Subscriptions
export {
  type GetSubscriptionRequest,
  type GetSubscriptionResponse,
  getSubscriptionService,
  getSubscriptionsFromResponse,
  getSubscriptionsService,
  isSubscriptionsSuccess,
  type ListSubscriptionsResponse,
  type Subscription,
} from './subscriptions';

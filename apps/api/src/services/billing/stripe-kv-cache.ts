/**
 * Stripe KV Cache - Theo Browne's "Stay Sane with Stripe" Pattern
 *
 * Key patterns:
 * 1. `stripe:user:${userId}` → stripeCustomerId (24h TTL)
 * 2. `stripe:customer:${customerId}` → subscription data (5min TTL)
 *
 * Single sync function writes to both database AND KV.
 * Success page and webhooks both call the same sync function.
 */

import { getKVBinding } from '@/db';

import type { SyncedSubscriptionState } from './stripe-sync-schemas';

// Cache TTLs following Theo's recommendations
const USER_CUSTOMER_ID_TTL = 60 * 60 * 24; // 24 hours - rarely changes
const SUBSCRIPTION_DATA_TTL = 60 * 5; // 5 minutes - can change on webhook

// KV key patterns
function getUserCustomerKey(userId: string): string {
  return `stripe:user:${userId}`;
}

function getCustomerDataKey(customerId: string): string {
  return `stripe:customer:${customerId}`;
}

/**
 * Get cached Stripe customer ID for a user
 * Returns null if not in cache (caller should query database)
 */
export async function getCachedCustomerId(userId: string): Promise<string | null> {
  const kv = getKVBinding();
  if (!kv)
    return null;

  try {
    // cacheTtl enables edge caching - 5 min for rarely-changing mapping
    return await kv.get(getUserCustomerKey(userId), { cacheTtl: 300 });
  } catch {
    return null;
  }
}

/**
 * Cache userId → customerId mapping
 * Called after creating customer or looking up from database
 */
export async function cacheCustomerId(userId: string, customerId: string): Promise<void> {
  const kv = getKVBinding();
  if (!kv)
    return;

  try {
    await kv.put(getUserCustomerKey(userId), customerId, {
      expirationTtl: USER_CUSTOMER_ID_TTL,
    });
  } catch {
    // Non-fatal: cache miss just means DB lookup next time
  }
}

/**
 * Get cached subscription data for a customer
 * Returns null if not in cache (caller should sync from Stripe)
 */
export async function getCachedSubscriptionData(
  customerId: string,
): Promise<SyncedSubscriptionState | null> {
  const kv = getKVBinding();
  if (!kv)
    return null;

  try {
    // cacheTtl enables edge caching - 60s (min) for subscription data
    const data = await kv.get(getCustomerDataKey(customerId), { type: 'json', cacheTtl: 60 });
    return data as SyncedSubscriptionState | null;
  } catch {
    return null;
  }
}

/**
 * Cache subscription data for a customer
 * Called after syncStripeDataFromStripe completes
 */
export async function cacheSubscriptionData(
  customerId: string,
  data: SyncedSubscriptionState,
): Promise<void> {
  const kv = getKVBinding();
  if (!kv)
    return;

  try {
    await kv.put(getCustomerDataKey(customerId), JSON.stringify(data), {
      expirationTtl: SUBSCRIPTION_DATA_TTL,
    });
  } catch {
    // Non-fatal: cache miss just means Stripe API call next time
  }
}

/**
 * Invalidate subscription cache for a customer
 * Called when webhook indicates data changed
 */
export async function invalidateSubscriptionCache(customerId: string): Promise<void> {
  const kv = getKVBinding();
  if (!kv)
    return;

  try {
    await kv.delete(getCustomerDataKey(customerId));
  } catch {
    // Non-fatal: cache will expire naturally
  }
}

/**
 * Invalidate all Stripe caches for a user
 * Called on user deletion or major account changes
 */
export async function invalidateUserStripeCache(
  userId: string,
  customerId?: string,
): Promise<void> {
  const kv = getKVBinding();
  if (!kv)
    return;

  try {
    await kv.delete(getUserCustomerKey(userId));
    if (customerId) {
      await kv.delete(getCustomerDataKey(customerId));
    }
  } catch {
    // Non-fatal
  }
}

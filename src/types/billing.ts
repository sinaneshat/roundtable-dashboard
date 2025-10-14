/**
 * Billing Types - RPC-Inferred Types
 *
 * ✅ INFERRED FROM RPC: All types extracted from Hono RPC client responses
 * ✅ RUNTIME-CORRECT: Dates are ISO strings (after JSON serialization)
 *
 * These types represent the actual runtime shape of data from API responses,
 * not the database schema. Use these in frontend components.
 */

import type { GetSubscriptionsResponse } from '@/services/api/subscriptions';

// ============================================================================
// SUBSCRIPTION TYPES
// ============================================================================

/**
 * Extract subscription data from GetSubscriptions response
 * Dates are ISO strings after JSON serialization
 */
type SubscriptionsResponseData = NonNullable<
  Extract<GetSubscriptionsResponse, { success: true }>['data']
>;

export type Subscription = SubscriptionsResponseData['items'][number];

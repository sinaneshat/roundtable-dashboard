/**
 * Billing types - Re-exported from API services
 *
 * All types are derived from backend Hono routes via type inference.
 * No manual type definitions - single source of truth from API.
 */

export type { Price, Product } from '@/services/api/billing/products';
export type { Subscription } from '@/services/api/billing/subscriptions';

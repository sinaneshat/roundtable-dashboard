/**
 * Usage Service - Chat Usage and Quota API
 *
 * 100% type-safe RPC service for usage tracking operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type GetUsageStatsRequest = InferRequestType<
  ApiClientType['usage']['stats']['$get']
>;

export type GetUsageStatsResponse = InferResponseType<
  ApiClientType['usage']['stats']['$get']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get comprehensive usage statistics
 * Protected endpoint - requires authentication
 *
 * Returns ALL quota information:
 * - threads: { used, limit, remaining, percentage, status }
 * - messages: { used, limit, remaining, percentage, status }
 * - analysis: { used, limit, remaining, percentage, status }
 * - customRoles: { used, limit, remaining, percentage, status }
 * - period: { start, end, daysRemaining }
 * - subscription: { tier, isAnnual }
 *
 * @param options - Service options
 * @param options.bypassCache - If true, bypasses HTTP cache to get fresh data
 * @param options.cookieHeader - Pre-captured cookie header for server-side fire-and-forget prefetches
 */
export async function getUserUsageStatsService(options?: {
  bypassCache?: boolean;
  cookieHeader?: string;
}) {
  const client = await createApiClient({
    bypassCache: options?.bypassCache,
    cookieHeader: options?.cookieHeader,
  });
  return parseResponse(client.usage.stats.$get());
}

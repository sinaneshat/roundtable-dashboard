/**
 * Usage Service - Chat Usage and Quota API
 *
 * 100% type-safe RPC service for usage tracking operations
 * All types automatically inferred from backend Hono routes via InferResponseType
 */

import type { InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

type GetUsageStatsEndpoint = ApiClientType['usage']['stats']['$get'];
export type GetUsageStatsResponse = InferResponseType<GetUsageStatsEndpoint, 200>;

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
 */
export async function getUserUsageStatsService(options?: {
  bypassCache?: boolean;
  cookieHeader?: string;
}) {
  const client = createApiClient({
    bypassCache: options?.bypassCache,
    cookieHeader: options?.cookieHeader,
  });
  return parseResponse(client.usage.stats.$get());
}

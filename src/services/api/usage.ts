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
 * ✅ SINGLE SOURCE OF TRUTH - Get comprehensive usage statistics
 *
 * This is the ONLY API call needed for quota checking and usage display.
 * Returns ALL quota information (can derive canCreate from used/limit):
 * - threads: { used, limit, remaining, percentage, status }
 * - messages: { used, limit, remaining, percentage, status }
 * - analysis: { used, limit, remaining, percentage, status }
 * - customRoles: { used, limit, remaining, percentage, status }
 * - period: { start, end, daysRemaining }
 * - subscription: { tier, isAnnual }
 *
 * Protected endpoint - requires authentication
 *
 * Following Hono RPC best practices: Always provide an object to $get()
 */
export async function getUserUsageStatsService(args?: GetUsageStatsRequest) {
  const client = await createApiClient();
  return parseResponse(client.usage.stats.$get(args ?? {}));
}

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

// ============================================================================
// Type Guards - Accept both service response and server function result types
// ============================================================================

type SuccessResponse = Extract<GetUsageStatsResponse, { success: true }>;

/**
 * Type guard to check if usage stats response is successful
 * Accepts GetUsageStatsResponse | ServerFnErrorResponse | undefined to handle both
 * direct service calls and TanStack Query results
 */
export function isUsageStatsSuccess(response: { success: boolean; data?: unknown } | null | undefined): response is SuccessResponse {
  return response !== undefined && response !== null && response.success === true && 'data' in response;
}

/**
 * Get plan type from usage stats response safely
 * Accepts GetUsageStatsResponse | ServerFnErrorResponse | undefined to handle both
 * direct service calls and TanStack Query results
 */
export function getPlanTypeFromUsageStats(response: { success: boolean; data?: unknown } | null | undefined): string | undefined {
  if (!isUsageStatsSuccess(response)) {
    return undefined;
  }
  return response.data.plan?.type;
}

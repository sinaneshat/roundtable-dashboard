/**
 * Models Cache - Server-side caching for AI model data
 *
 * NOTE: 'use cache' directive is disabled due to cacheComponents incompatibility
 * with opennextjs-cloudflare. Using direct service calls with ISR instead.
 *
 * Cache Strategy:
 * - ISR via `export const revalidate` in pages
 * - Public models: Cached at page level
 * - Authenticated models: Use TanStack Query prefetch (tier-based access)
 *
 * NOTE: This cache is for PUBLIC/unauthenticated model lists only.
 * Authenticated routes should use listModelsService() with TanStack Query
 * to ensure tier-based access control is applied per-user.
 */

import type { ListModelsResponse } from '@/services/api';
import { listModelsPublicService } from '@/services/api';

// ============================================================================
// Cache Tag Constants
// ============================================================================

export const MODEL_CACHE_TAGS = {
  /** All public models list */
  publicModels: 'models:public',
} as const;

// ============================================================================
// Model Data Functions (no 'use cache' - cacheComponents disabled)
// ============================================================================

/**
 * Get public models list
 * Direct service call - caching handled by ISR at page level
 *
 * This function is for PUBLIC/unauthenticated pages only:
 * - Landing pages showing model capabilities
 * - Public thread displays
 * - Marketing pages
 *
 * For authenticated routes, use listModelsService() with TanStack Query
 * to ensure proper tier-based access control.
 *
 * @returns Public models response (FREE tier access)
 */
export async function getCachedPublicModels(): Promise<ListModelsResponse> {
  return listModelsPublicService();
}

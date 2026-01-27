/**
 * OG Image Cache Service
 *
 * Caches dynamically generated Open Graph images in R2 storage.
 * Reduces CPU usage by serving cached images instead of regenerating.
 *
 * Cache Key Pattern: og-images/{type}/{identifier}-{version}.png
 * - type: OgImageType enum ('public-thread' | 'thread' | 'page')
 * - identifier: slug or page name
 * - version: hash of content that affects the image (title, participants, etc.)
 *
 * @see /docs/backend-patterns.md - Service layer conventions
 */

import type { OgImageType } from '@roundtable/shared/enums';

// Cache TTL: 7 days (images rarely change, invalidated on content update)
const OG_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

// ============================================================================
// CACHE KEY GENERATION
// ============================================================================

/**
 * Simple hash function for cache invalidation (edge-compatible)
 * Uses a fast string hash instead of crypto for performance
 */
function simpleHash(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to hex and ensure positive
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Generate a version hash for cache invalidation
 * Based on content that affects OG image appearance
 */
export function generateOgVersionHash(data: {
  title?: string;
  mode?: string;
  participantCount?: number;
  messageCount?: number;
  updatedAt?: Date | string;
}) {
  const content = [
    data.title ?? '',
    data.mode ?? '',
    String(data.participantCount ?? 0),
    String(data.messageCount ?? 0),
    // Include updatedAt to bust cache on any thread update
    data.updatedAt ? new Date(data.updatedAt).getTime().toString() : '',
  ].join('|');

  // Use simple hash for edge compatibility (no crypto dependency)
  return simpleHash(content);
}

/**
 * Generate R2 cache key for OG image
 */
export function generateOgCacheKey(
  type: OgImageType,
  identifier: string,
  versionHash: string,
) {
  return `og-images/${type}/${identifier}-${versionHash}.png`;
}

// ============================================================================
// R2 CACHE OPERATIONS
// ============================================================================

export type OgCacheResult = {
  found: boolean;
  data: ArrayBuffer | null;
  contentType: string;
  cacheKey: string;
};

/**
 * Get cached OG image from R2
 */
export async function getOgImageFromCache(
  r2Bucket: R2Bucket | undefined,
  cacheKey: string,
): Promise<OgCacheResult> {
  const notFound: OgCacheResult = {
    cacheKey,
    contentType: 'image/png',
    data: null,
    found: false,
  };

  if (!r2Bucket) {
    return notFound;
  }

  try {
    const object = await r2Bucket.get(cacheKey);
    if (!object) {
      return notFound;
    }

    return {
      cacheKey,
      contentType: object.httpMetadata?.contentType ?? 'image/png',
      data: await object.arrayBuffer(),
      found: true,
    };
  } catch {
    return notFound;
  }
}

/**
 * Store OG image in R2 cache
 */
export async function storeOgImageInCache(
  r2Bucket: R2Bucket | undefined,
  cacheKey: string,
  imageData: ArrayBuffer,
): Promise<boolean> {
  if (!r2Bucket) {
    return false;
  }

  try {
    await r2Bucket.put(cacheKey, imageData, {
      customMetadata: {
        cachedAt: new Date().toISOString(),
      },
      httpMetadata: {
        cacheControl: `public, max-age=${OG_CACHE_TTL_SECONDS}, immutable`,
        contentType: 'image/png',
      },
    });
    return true;
  } catch (error) {
    console.error('[OG-CACHE] Failed to store image:', error);
    return false;
  }
}

/**
 * Delete cached OG image from R2
 * Called when thread content changes
 */
export async function deleteOgImageFromCache(
  r2Bucket: R2Bucket | undefined,
  type: OgImageType,
  identifier: string,
): Promise<boolean> {
  if (!r2Bucket) {
    return false;
  }

  try {
    // List and delete all versions for this identifier
    const prefix = `og-images/${type}/${identifier}-`;
    const listed = await r2Bucket.list({ prefix });

    if (listed.objects.length === 0) {
      return true;
    }

    // Delete all matching objects
    await Promise.all(
      listed.objects.map(async obj => await r2Bucket.delete(obj.key)),
    );

    return true;
  } catch (error) {
    console.error('[OG-CACHE] Failed to delete cached images:', error);
    return false;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert ImageResponse to ArrayBuffer for caching
 */
export async function imageResponseToArrayBuffer(response: Response): Promise<ArrayBuffer> {
  return await response.arrayBuffer();
}

/**
 * Create a Response from cached ArrayBuffer
 */
export function createCachedImageResponse(
  data: ArrayBuffer,
  headers?: Record<string, string>,
): Response {
  return new Response(data, {
    headers: {
      'Cache-Control': `public, max-age=${OG_CACHE_TTL_SECONDS}, immutable`,
      'Content-Type': 'image/png',
      'X-OG-Cache': 'HIT',
      ...headers,
    },
    status: 200,
  });
}

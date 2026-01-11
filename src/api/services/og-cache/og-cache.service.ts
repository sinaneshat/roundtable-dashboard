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

import { createHash } from 'node:crypto';

import type { OgImageType } from '@/api/core/enums';

// Cache TTL: 7 days (images rarely change, invalidated on content update)
const OG_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

// ============================================================================
// CACHE KEY GENERATION
// ============================================================================

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
}): string {
  const content = [
    data.title ?? '',
    data.mode ?? '',
    String(data.participantCount ?? 0),
    String(data.messageCount ?? 0),
    // Include updatedAt to bust cache on any thread update
    data.updatedAt ? new Date(data.updatedAt).getTime().toString() : '',
  ].join('|');

  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

/**
 * Generate R2 cache key for OG image
 */
export function generateOgCacheKey(
  type: OgImageType,
  identifier: string,
  versionHash: string,
): string {
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
    found: false,
    data: null,
    contentType: 'image/png',
    cacheKey,
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
      found: true,
      data: await object.arrayBuffer(),
      contentType: object.httpMetadata?.contentType ?? 'image/png',
      cacheKey,
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
      httpMetadata: {
        contentType: 'image/png',
        cacheControl: `public, max-age=${OG_CACHE_TTL_SECONDS}, immutable`,
      },
      customMetadata: {
        cachedAt: new Date().toISOString(),
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
      listed.objects.map(obj => r2Bucket.delete(obj.key)),
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
  return response.arrayBuffer();
}

/**
 * Create a Response from cached ArrayBuffer
 */
export function createCachedImageResponse(
  data: ArrayBuffer,
  headers?: Record<string, string>,
): Response {
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': `public, max-age=${OG_CACHE_TTL_SECONDS}, immutable`,
      'X-OG-Cache': 'HIT',
      ...headers,
    },
  });
}

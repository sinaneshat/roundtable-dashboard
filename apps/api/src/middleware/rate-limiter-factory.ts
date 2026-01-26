/**
 * Unified rate limiter factory for consistent rate limiting across the API
 * Consolidates all rate limiting logic with preset configurations
 *
 * ⚠️ PERFORMANCE NOTE: In Cloudflare Workers, uses KV for distributed rate limiting.
 * In-memory Map is used as fallback for local development only.
 */

import { HttpMethods, WebAppEnvs } from '@roundtable/shared';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import * as HttpStatusCodes from 'stoker/http-status-codes';
import * as z from 'zod';

import type { ApiEnv } from '@/types';

// Skip rate limiting in local development for e2e tests
const isLocalDevelopment = process.env.WEBAPP_ENV === WebAppEnvs.LOCAL;

// Paths that skip rate limiting entirely (health checks)
// Note: c.req.path in Hono middleware doesn't include /api/v1 prefix
const RATE_LIMIT_SKIP_PATHS = [
  '/health',
  '/system',
] as const;

export type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (c: Context<ApiEnv>) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
  includeHeaders?: boolean;
};

/**
 * Preset rate limit configurations for common operations
 */
export const RATE_LIMIT_PRESETS = {
  // API general operations
  api: {
    maxRequests: 100,
    message: 'Too many requests. Please slow down.',
    windowMs: 60 * 1000, // 1 minute
  },

  // Auth operations
  auth: {
    maxRequests: 20,
    message: 'Too many authentication attempts. Please try again later.',
    windowMs: 15 * 60 * 1000, // 15 minutes
  },

  // Delete operations
  delete: {
    maxRequests: 50,
    message: 'Too many deletion requests. Please try again later.',
    windowMs: 60 * 60 * 1000, // 1 hour
  },

  // File download operations (generous for pages with many images/files)
  download: {
    maxRequests: 200, // 200 downloads per minute per user (supports page refreshes with many attachments)
    message: 'Too many download requests. Please slow down.',
    windowMs: 60 * 1000, // 1 minute
  },

  // IP-based limiting
  ip: {
    maxRequests: 1000,
    message: 'Too many requests from this IP address.',
    windowMs: 15 * 60 * 1000, // 15 minutes
  },

  // Organization operations
  organization: {
    maxRequests: 200,
    message: 'Organization rate limit exceeded.',
    windowMs: 60 * 60 * 1000, // 1 hour
  },

  // Public file download (stricter limits for unauthenticated/public access)
  publicDownload: {
    maxRequests: 10, // 10 downloads per minute per IP for public files
    message: 'Too many download requests. Please try again later.',
    windowMs: 60 * 1000, // 1 minute
  },

  // Read operations
  read: {
    maxRequests: 300,
    message: 'Too many read requests. Please slow down.',
    windowMs: 60 * 1000, // 1 minute
  },

  // File upload operations
  upload: {
    maxRequests: 100,
    message: 'Too many upload requests. Please try again later.',
    windowMs: 60 * 60 * 1000, // 1 hour
  },
} as const;

// In-memory store for local development fallback only
// In production, we use Cloudflare KV for distributed rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Cleanup interval (local dev only)
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start cleanup interval for rate limit store (local dev only)
 * Note: In test environment, cleanup is managed manually via stopCleanup()
 */
function startCleanup() {
  // Skip cleanup in test environment (vitest sets NODE_ENV='test')
  // Cast to string since cloudflare types only define 'development' | 'production'
  const nodeEnv = process.env.NODE_ENV as string | undefined;
  if (cleanupInterval || nodeEnv === 'test') {
    return;
  }

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }, 60 * 1000); // Clean up every minute
}

/**
 * Stop cleanup interval (for testing)
 */
export function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// NOTE: startCleanup() must be called lazily, not at module load time
// Cloudflare Workers don't allow setInterval in global scope
// The cleanup is started on first rate limiter access instead

/**
 * Rate limit entry schema (Zod - single source of truth)
 */
const KVRateLimitEntrySchema = z.object({
  count: z.number().int().nonnegative(),
  resetTime: z.number().int().positive(),
});

type KVRateLimitEntry = z.infer<typeof KVRateLimitEntrySchema>;

/**
 * Get rate limit entry from KV or in-memory store
 */
async function getRateLimitEntry(
  c: Context<ApiEnv>,
  key: string,
): Promise<KVRateLimitEntry | null> {
  // Try KV first (production/preview)
  const kv = c.env?.KV;
  if (kv) {
    try {
      const entry = await kv.get(`ratelimit:${key}`, 'json');
      if (!entry) {
        return null;
      }

      // Validate KV data with Zod (no type casting)
      const result = KVRateLimitEntrySchema.safeParse(entry);
      return result.success ? result.data : null;
    } catch {
      // Fall through to in-memory
    }
  }

  // Fall back to in-memory (local dev)
  // Start cleanup on first in-memory access (lazy init for Cloudflare Workers)
  startCleanup();
  return rateLimitStore.get(key) || null;
}

/**
 * Set rate limit entry in KV or in-memory store
 */
async function setRateLimitEntry(
  c: Context<ApiEnv>,
  key: string,
  entry: KVRateLimitEntry,
  ttlMs: number,
): Promise<void> {
  // Try KV first (production/preview)
  const kv = c.env?.KV;
  if (kv) {
    try {
      // KV expirationTtl is in seconds
      await kv.put(`ratelimit:${key}`, JSON.stringify(entry), {
        expirationTtl: Math.max(60, Math.ceil(ttlMs / 1000)), // Min 60s TTL
      });
      return;
    } catch {
      // Fall through to in-memory
    }
  }

  // Fall back to in-memory (local dev)
  // Start cleanup on first in-memory access (lazy init for Cloudflare Workers)
  startCleanup();
  rateLimitStore.set(key, entry);
}

/**
 * Default key generator based on user, session, or IP
 */
function defaultKeyGenerator(c: Context<ApiEnv>): string {
  const user = c.get('user');
  const session = c.get('session');
  const ip = c.req.header('cf-connecting-ip')
    || c.req.header('x-forwarded-for')
    || c.req.header('x-real-ip')
    || 'fallback';

  // Prefer user ID, fall back to session ID, then IP
  if (user?.id) {
    return `user:${user.id}`;
  }
  if (session?.userId) {
    return `session:${session.userId}`;
  }

  return `ip:${ip}`;
}

/**
 * IP-based key generator
 */
function ipKeyGenerator(c: Context<ApiEnv>): string {
  const ip = c.req.header('cf-connecting-ip')
    || c.req.header('x-forwarded-for')
    || c.req.header('x-real-ip')
    || 'fallback';

  return `ip:${ip}`;
}

/**
 * Organization-based key generator
 */
function organizationKeyGenerator(c: Context<ApiEnv>): string {
  const session = c.get('session');
  const user = c.get('user');

  if (session?.userId) {
    return `org:${session.userId}`;
  }

  return `user:${user?.id || 'anonymous'}`;
}

/**
 * Rate Limiter Factory
 */
export class RateLimiterFactory {
  /**
   * Create a rate limiter with a preset configuration
   */
  static create(preset: keyof typeof RATE_LIMIT_PRESETS) {
    const config = RATE_LIMIT_PRESETS[preset];
    return this.createCustom({
      ...config,
      includeHeaders: true,
      keyGenerator: preset === 'ip'
        ? ipKeyGenerator
        : preset === 'organization'
          ? organizationKeyGenerator
          : defaultKeyGenerator,
    });
  }

  /**
   * Create a custom rate limiter
   * Uses Cloudflare KV for distributed rate limiting in production
   */
  static createCustom(config: RateLimitConfig) {
    return createMiddleware<ApiEnv>(async (c, next) => {
      // Skip rate limiting in local development for e2e tests
      if (isLocalDevelopment) {
        await next();
        return;
      }

      // Skip rate limiting for health/system endpoints (perf optimization)
      const path = c.req.path;
      if (RATE_LIMIT_SKIP_PATHS.some(skipPath => path.startsWith(skipPath))) {
        await next();
        return;
      }

      const keyGenerator = config.keyGenerator || defaultKeyGenerator;
      const key = keyGenerator(c);
      const now = Date.now();

      // Get or create rate limit entry (from KV in production)
      let entry = await getRateLimitEntry(c, key);

      if (!entry || entry.resetTime < now) {
        // Create new entry
        entry = {
          count: 0,
          resetTime: now + config.windowMs,
        };
      }

      // Check if limit exceeded
      if (entry.count >= config.maxRequests) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

        const res = new Response(
          JSON.stringify({
            code: HttpStatusCodes.TOO_MANY_REQUESTS,
            message: config.message || 'Too many requests',
            retryAfter,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': retryAfter.toString(),
              'X-RateLimit-Limit': config.maxRequests.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': entry.resetTime.toString(),
            },
            status: HttpStatusCodes.TOO_MANY_REQUESTS,
          },
        );

        throw new HTTPException(HttpStatusCodes.TOO_MANY_REQUESTS, { res });
      }

      // Increment counter
      entry.count++;

      // Optimization: Only write to KV every 10th request or when near limit
      // This reduces KV write operations by ~90% for most requests
      // Note: count=1 means first request (always persist), otherwise persist every 10th
      const shouldPersist = entry.count === 1
        || entry.count % 10 === 0
        || entry.count >= config.maxRequests - 5;

      if (shouldPersist) {
        await setRateLimitEntry(c, key, entry, config.windowMs);
      }

      // Add rate limit headers if requested
      if (config.includeHeaders !== false) {
        c.header('X-RateLimit-Limit', config.maxRequests.toString());
        c.header('X-RateLimit-Remaining', (config.maxRequests - entry.count).toString());
        c.header('X-RateLimit-Reset', entry.resetTime.toString());
      }

      try {
        await next();

        // Optionally skip counting successful requests
        if (config.skipSuccessfulRequests) {
          entry.count--;
          await setRateLimitEntry(c, key, entry, config.windowMs);
        }
      } catch (error) {
        // Optionally skip counting failed requests
        if (config.skipFailedRequests) {
          entry.count--;
          await setRateLimitEntry(c, key, entry, config.windowMs);
        }
        throw error;
      }
    });
  }

  /**
   * Create a composite rate limiter that applies multiple limits
   */
  static createComposite(...configs: (keyof typeof RATE_LIMIT_PRESETS | RateLimitConfig)[]) {
    const middlewares = configs.map((config) => {
      if (typeof config === 'string') {
        return this.create(config);
      }
      return this.createCustom(config);
    });

    return createMiddleware<ApiEnv>(async (c, next) => {
      // Apply all rate limiters in sequence
      for (const middleware of middlewares) {
        await new Promise<void>((resolve, reject) => {
          middleware(c, async () => {
            resolve();
            return await Promise.resolve();
          }).catch(reject);
        });
      }

      await next();
    });
  }

  /**
   * Create a dynamic rate limiter based on request characteristics
   */
  static createDynamic(
    determiner: (c: Context<ApiEnv>) => keyof typeof RATE_LIMIT_PRESETS | null,
  ) {
    return createMiddleware<ApiEnv>(async (c, next) => {
      const preset = determiner(c);

      if (!preset) {
        // No rate limiting needed
        return await next();
      }

      const limiter = this.create(preset);
      return await limiter(c, next);
    });
  }

  /**
   * Create an organization quota limiter
   * Uses Cloudflare KV for distributed quota tracking in production
   */
  static createOrganizationQuota(quotaBytes: number = 1024 * 1024 * 1024) {
    return createMiddleware<ApiEnv>(async (c, next) => {
      const method = c.req.method;
      const session = c.get('session');
      const fileSize = c.get('fileSize');

      // Only check for upload operations
      if (method !== 'PUT' && method !== 'POST') {
        return await next();
      }

      // Using user-based quotas instead of organization quotas for now
      const quotaKey = `quota:${session?.userId || 'anonymous'}`;
      const entry = await getRateLimitEntry(c, quotaKey);
      const currentUsage = entry?.count || 0;

      if (currentUsage + (fileSize || 0) > quotaBytes) {
        throw new HTTPException(HttpStatusCodes.INSUFFICIENT_STORAGE, {
          message: 'Organization storage quota exceeded',
        });
      }

      // Update usage after successful upload
      await next();

      if (fileSize) {
        await setRateLimitEntry(c, quotaKey, {
          count: currentUsage + fileSize,
          resetTime: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
        }, 30 * 24 * 60 * 60 * 1000);
      }
    });
  }

  /**
   * Create a smart rate limiter for storage operations
   */
  static createForStorage() {
    return this.createDynamic((c) => {
      const method = c.req.method;

      switch (method) {
        case HttpMethods.PUT:
        case HttpMethods.POST:
          return 'upload';
        case HttpMethods.DELETE:
          return 'delete';
        case HttpMethods.GET:
          return 'read';
        default:
          return 'api';
      }
    });
  }

  /**
   * Reset rate limit for a specific key (useful for testing)
   */
  static reset(key: string) {
    rateLimitStore.delete(key);
  }

  /**
   * Clear all rate limits (useful for testing)
   */
  static clearAll() {
    rateLimitStore.clear();
  }
}

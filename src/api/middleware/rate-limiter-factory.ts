/**
 * Unified rate limiter factory for consistent rate limiting across the API
 * Consolidates all rate limiting logic with preset configurations
 */

import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { HttpMethods } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';

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
  // File upload operations
  upload: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many upload requests. Please try again later.',
  },

  // File download operations (generous for pages with many images/files)
  download: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200, // 200 downloads per minute per user (supports page refreshes with many attachments)
    message: 'Too many download requests. Please slow down.',
  },

  // Public file download (stricter limits for unauthenticated/public access)
  publicDownload: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 downloads per minute per IP for public files
    message: 'Too many download requests. Please try again later.',
  },

  // Read operations
  read: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 300,
    message: 'Too many read requests. Please slow down.',
  },

  // Delete operations
  delete: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50,
    message: 'Too many deletion requests. Please try again later.',
  },

  // API general operations
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Too many requests. Please slow down.',
  },

  // Auth operations
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 20,
    message: 'Too many authentication attempts. Please try again later.',
  },

  // Organization operations
  organization: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 200,
    message: 'Organization rate limit exceeded.',
  },

  // IP-based limiting
  ip: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1000,
    message: 'Too many requests from this IP address.',
  },
} as const;

// In-memory store (replace with Redis/D1 in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Cleanup interval
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start cleanup interval for rate limit store
 */
function startCleanup() {
  if (cleanupInterval || process.env.NODE_ENV === 'test') {
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

// Start cleanup on module load
startCleanup();

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
  if (user?.id)
    return `user:${user.id}`;
  if (session?.userId)
    return `session:${session.userId}`;

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
      keyGenerator: preset === 'ip'
        ? ipKeyGenerator
        : preset === 'organization'
          ? organizationKeyGenerator
          : defaultKeyGenerator,
      includeHeaders: true,
    });
  }

  /**
   * Create a custom rate limiter
   */
  static createCustom(config: RateLimitConfig) {
    return createMiddleware<ApiEnv>(async (c, next) => {
      const keyGenerator = config.keyGenerator || defaultKeyGenerator;
      const key = keyGenerator(c);
      const now = Date.now();

      // Get or create rate limit entry
      let entry = rateLimitStore.get(key);

      if (!entry || entry.resetTime < now) {
        // Create new entry
        entry = {
          count: 0,
          resetTime: now + config.windowMs,
        };
        rateLimitStore.set(key, entry);
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
            status: HttpStatusCodes.TOO_MANY_REQUESTS,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': retryAfter.toString(),
              'X-RateLimit-Limit': config.maxRequests.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': entry.resetTime.toString(),
            },
          },
        );

        throw new HTTPException(HttpStatusCodes.TOO_MANY_REQUESTS, { res });
      }

      // Increment counter
      entry.count++;

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
        }
      } catch (error) {
        // Optionally skip counting failed requests
        if (config.skipFailedRequests) {
          entry.count--;
        }
        throw error;
      }
    });
  }

  /**
   * Create a composite rate limiter that applies multiple limits
   */
  static createComposite(...configs: Array<keyof typeof RATE_LIMIT_PRESETS | RateLimitConfig>) {
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
          middleware(c, () => {
            resolve();
            return Promise.resolve();
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
        return next();
      }

      const limiter = this.create(preset);
      return limiter(c, next);
    });
  }

  /**
   * Create an organization quota limiter
   */
  static createOrganizationQuota(quotaBytes: number = 1024 * 1024 * 1024) {
    return createMiddleware<ApiEnv>(async (c, next) => {
      const method = c.req.method;
      const session = c.get('session');
      const fileSize = c.get('fileSize');

      // Only check for upload operations
      if (method !== 'PUT' && method !== 'POST') {
        return next();
      }

      // Using user-based quotas instead of organization quotas for now
      const quotaKey = `quota:${session?.userId || 'anonymous'}`;
      const currentUsage = rateLimitStore.get(quotaKey)?.count || 0;

      if (currentUsage + (fileSize || 0) > quotaBytes) {
        throw new HTTPException(HttpStatusCodes.INSUFFICIENT_STORAGE, {
          message: 'Organization storage quota exceeded',
        });
      }

      // Update usage after successful upload
      await next();

      if (fileSize) {
        rateLimitStore.set(quotaKey, {
          count: currentUsage + fileSize,
          resetTime: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
        });
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

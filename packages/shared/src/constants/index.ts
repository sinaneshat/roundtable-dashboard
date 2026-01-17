/**
 * Shared Constants
 *
 * Constants used by both API and web packages.
 * Note: Environment detection should be done at runtime via package-specific mechanisms:
 * - API: cloudflare:workers env bindings
 * - Web: import.meta.env.VITE_WEBAPP_ENV
 *
 * These constants provide defaults/fallbacks only.
 */

// Environment detection - uses WEBAPP_ENV (set by each package's runtime)
export const WEBAPP_ENV = process.env.WEBAPP_ENV || 'development';
export const IS_PRODUCTION = WEBAPP_ENV === 'prod' || WEBAPP_ENV === 'production';
export const IS_PREVIEW = WEBAPP_ENV === 'preview';
export const IS_LOCAL = WEBAPP_ENV === 'local' || WEBAPP_ENV === 'development';
export const IS_DEV_ENVIRONMENT = IS_LOCAL || IS_PREVIEW;

// API configuration
export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Rate limiting
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
export const RATE_LIMIT_MAX_REQUESTS = 100;

// Cache durations (in seconds)
export const CACHE_DURATION = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
} as const;

/**
 * Environment Detection Constants
 *
 * Detects runtime environment using WEBAPP_ENV.
 * WEBAPP_ENV values: 'local' | 'preview' | 'prod' (from wrangler.jsonc)
 */

// Environment detection - uses WEBAPP_ENV (set by each package's runtime)
export const WEBAPP_ENV = process.env['WEBAPP_ENV'] ?? 'local';
export const IS_PRODUCTION = WEBAPP_ENV === 'prod';
export const IS_PREVIEW = WEBAPP_ENV === 'preview';
export const IS_LOCAL = WEBAPP_ENV === 'local';
export const IS_DEV_ENVIRONMENT = IS_LOCAL || IS_PREVIEW;

// API configuration
export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;

// Cache durations (in seconds)
export const CACHE_DURATION = {
  DAY: 86400, // 24 hours
  LONG: 3600, // 1 hour
  MEDIUM: 300, // 5 minutes
  SHORT: 60, // 1 minute
} as const;

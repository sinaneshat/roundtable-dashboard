/**
 * Shared Constants Index
 *
 * Re-exports all shared constants for convenient importing.
 * Constants used by both API and web packages.
 */

export * from './ai-pricing';
export * from './application';
export * from './brand';
export * from './email';
export * from './limits';
export * from './provider-colors';
export * from './validation';
export * from './version';

// Environment detection - uses WEBAPP_ENV (set by each package's runtime)
// WEBAPP_ENV values: 'local' | 'preview' | 'prod' (from wrangler.jsonc)
export const WEBAPP_ENV = process.env['WEBAPP_ENV'] || 'local';
export const IS_PRODUCTION = WEBAPP_ENV === 'prod';
export const IS_PREVIEW = WEBAPP_ENV === 'preview';
export const IS_LOCAL = WEBAPP_ENV === 'local';
export const IS_DEV_ENVIRONMENT = IS_LOCAL || IS_PREVIEW;

// API configuration
export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;

// Cache durations (in seconds)
export const CACHE_DURATION = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
} as const;

/**
 * Base URL Configuration - Single Source of Truth
 *
 * Centralized URL configuration shared across frontend and backend.
 * All URL resolution should use this configuration.
 *
 * ARCHITECTURE (TanStack Start + Separate API):
 * - Local: Web on 5173 (Vite), API on 8787 (Wrangler)
 * - Preview: Web on web-preview.roundtable.now, API on api-preview.roundtable.now
 * - Production: Web on roundtable.now, API on api.roundtable.now
 *
 * IMPORTANT: Always fallback to production URLs for safety.
 */

import { z } from '@hono/zod-openapi';

import type { WebAppEnv } from '../enums/common';
import { WebAppEnvs } from '../enums/common';

// ============================================================================
// URL Configuration for Each Environment
// ============================================================================

export const BaseUrlConfigSchema = z.object({
  /** API server URL with /api/v1 path */
  api: z.string(),
  /** API server origin (without path, for Better Auth) */
  apiOrigin: z.string(),
  /** Web application URL (frontend) */
  app: z.string(),
  /** Cookie domain for cross-subdomain cookies */
  cookieDomain: z.string().optional(),
  /** Whether to use secure cookies (HTTPS) */
  useSecureCookies: z.boolean(),
}).strict();

export type BaseUrlConfig = z.infer<typeof BaseUrlConfigSchema>;

/**
 * Static URL configuration for each environment
 * SINGLE SOURCE OF TRUTH - all URL resolution uses this
 */
export const BASE_URL_CONFIG: Record<WebAppEnv, BaseUrlConfig> = {
  [WebAppEnvs.LOCAL]: {
    api: 'http://localhost:8787/api/v1',
    apiOrigin: 'http://localhost:8787',
    app: 'http://localhost:5173',
    cookieDomain: undefined, // localhost doesn't need domain
    useSecureCookies: false,
  },
  [WebAppEnvs.PREVIEW]: {
    api: 'https://api-preview.roundtable.now/api/v1',
    apiOrigin: 'https://api-preview.roundtable.now',
    app: 'https://web-preview.roundtable.now',
    cookieDomain: '.roundtable.now',
    useSecureCookies: true,
  },
  [WebAppEnvs.PROD]: {
    api: 'https://api.roundtable.now/api/v1',
    apiOrigin: 'https://api.roundtable.now',
    app: 'https://roundtable.now',
    cookieDomain: '.roundtable.now',
    useSecureCookies: true,
  },
};

// ============================================================================
// Production Fallback URLs (used when env detection fails)
// ============================================================================

export const FALLBACK_URLS = BASE_URL_CONFIG[WebAppEnvs.PROD];

// ============================================================================
// Hostname-Based URL Resolution (for robust production deployment)
// ============================================================================

/**
 * Resolve API origin from a request hostname
 * Used as fallback when environment detection fails
 *
 * @param hostname - The hostname from the request (e.g., 'roundtable.now')
 * @returns The API origin URL
 */
export function resolveApiOriginFromHostname(hostname: string): string {
  // Production: roundtable.now -> api.roundtable.now
  if (hostname === 'roundtable.now') {
    return BASE_URL_CONFIG[WebAppEnvs.PROD].apiOrigin;
  }

  // Preview: web-preview.roundtable.now -> api-preview.roundtable.now
  if (hostname.includes('preview') || hostname.includes('-preview')) {
    return BASE_URL_CONFIG[WebAppEnvs.PREVIEW].apiOrigin;
  }

  // Local: localhost:* -> localhost:8787
  if (hostname === 'localhost' || hostname.startsWith('localhost:') || hostname.startsWith('127.0.0.1')) {
    return BASE_URL_CONFIG[WebAppEnvs.LOCAL].apiOrigin;
  }

  // Default to production for safety
  return FALLBACK_URLS.apiOrigin;
}

/**
 * Resolve web app URL from a request hostname
 *
 * @param hostname - The hostname from the request
 * @returns The web app URL
 */
export function resolveAppUrlFromHostname(hostname: string): string {
  if (hostname === 'roundtable.now') {
    return BASE_URL_CONFIG[WebAppEnvs.PROD].app;
  }

  if (hostname.includes('preview') || hostname.includes('-preview')) {
    return BASE_URL_CONFIG[WebAppEnvs.PREVIEW].app;
  }

  if (hostname === 'localhost' || hostname.startsWith('localhost:') || hostname.startsWith('127.0.0.1')) {
    return BASE_URL_CONFIG[WebAppEnvs.LOCAL].app;
  }

  return FALLBACK_URLS.app;
}

// ============================================================================
// URL Getter Functions (environment-based)
// ============================================================================

/**
 * Check if a string is a valid WebAppEnv
 */
function isValidWebAppEnv(env: string): env is WebAppEnv {
  return env in BASE_URL_CONFIG;
}

/**
 * Get URL configuration for a specific environment
 * Falls back to production if env is invalid
 */
export function getUrlConfig(env: WebAppEnv | undefined): BaseUrlConfig {
  if (env !== undefined && isValidWebAppEnv(env)) {
    return BASE_URL_CONFIG[env];
  }
  return FALLBACK_URLS;
}

/**
 * Get API base URL for an environment (with /api/v1 path)
 */
export function getApiUrl(env: WebAppEnv | undefined): string {
  return getUrlConfig(env).api;
}

/**
 * Get API origin URL for an environment (without path, for Better Auth)
 */
export function getApiOrigin(env: WebAppEnv | undefined): string {
  return getUrlConfig(env).apiOrigin;
}

/**
 * Get web app URL for an environment
 */
export function getAppUrl(env: WebAppEnv | undefined): string {
  return getUrlConfig(env).app;
}

/**
 * Get cookie configuration for an environment
 */
export function getCookieConfig(env: WebAppEnv | undefined): { domain: string | undefined; secure: boolean } {
  const config = getUrlConfig(env);
  return {
    domain: config.cookieDomain,
    secure: config.useSecureCookies,
  };
}

// ============================================================================
// Development Origin Lists (for CORS)
// ============================================================================

/**
 * Localhost origins for development CORS
 * Covers common Vite port ranges
 */
export const LOCALHOST_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
  'http://127.0.0.1:5177',
] as const;

/**
 * Get allowed origins for CORS based on environment
 *
 * @param env - The webapp environment
 * @param isDevelopment - Whether in development mode (adds localhost origins)
 */
export function getAllowedOrigins(env: WebAppEnv | undefined, isDevelopment = false): string[] {
  const origins: string[] = [];

  // Add localhost in development
  if (isDevelopment) {
    origins.push(...LOCALHOST_ORIGINS);
  }

  // Add environment-specific app URL
  const config = getUrlConfig(env);
  const appUrl = config.app;

  // Don't duplicate localhost origins
  if (!appUrl.includes('localhost') && !appUrl.includes('127.0.0.1')) {
    origins.push(appUrl);
  }

  return origins;
}

/**
 * Check if an origin is allowed for a given environment
 */
export function isOriginAllowed(origin: string, env: WebAppEnv | undefined, isDevelopment = false): boolean {
  const allowedOrigins = getAllowedOrigins(env, isDevelopment);
  return allowedOrigins.includes(origin);
}

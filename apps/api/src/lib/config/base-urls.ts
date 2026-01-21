/**
 * Centralized Base URL Configuration (API Server)
 *
 * Uses shared config from @roundtable/shared as single source of truth.
 * Adds API-specific environment detection for Cloudflare Workers runtime.
 *
 * Priority for environment detection:
 * 1. cloudflare:workers env.WEBAPP_ENV (Cloudflare Workers runtime)
 * 2. process.env.WEBAPP_ENV (local dev/.env files)
 * 3. NODE_ENV fallback (development = local, production = prod)
 *
 * Usage:
 * - Hono middleware: Use getWebappEnvFromContext(c) for per-request env access
 * - Async contexts: Use getWebappEnvAsync()
 * - Sync contexts: Use getWebappEnv()
 */

import type { WebAppEnv as WebappEnv } from '@roundtable/shared';
/* eslint-disable perfectionist/sort-named-imports -- aliased imports cause circular fix conflicts */
import {
  BASE_URL_CONFIG,
  DEFAULT_WEBAPP_ENV,
  FALLBACK_URLS,
  getAllowedOrigins as sharedGetAllowedOrigins,
  getApiOrigin as sharedGetApiOrigin,
  getApiUrl as sharedGetApiUrl,
  getAppUrl as sharedGetAppUrl,
  getCookieConfig as sharedGetCookieConfig,
  getUrlConfig as sharedGetUrlConfig,
  isWebAppEnv as isWebappEnv,
  LOCALHOST_ORIGINS,
  NodeEnvs,
  WEBAPP_ENVS,
  WebAppEnvs,
  WebAppEnvSchema as WebappEnvSchema,
} from '@roundtable/shared';
/* eslint-enable perfectionist/sort-named-imports */
import { env as workersEnv } from 'cloudflare:workers';
import type { Context } from 'hono';

import type { ApiEnv } from '@/types';

// Re-export for backward compatibility
export {
  BASE_URL_CONFIG,
  DEFAULT_WEBAPP_ENV,
  FALLBACK_URLS,
  isWebappEnv,
  LOCALHOST_ORIGINS,
  WEBAPP_ENVS,
  type WebappEnv,
  WebAppEnvs,
  WebappEnvSchema,
};

/**
 * Legacy compatibility: BASE_URLS in old format
 */
export const BASE_URLS: Record<WebappEnv, { app: string; api: string }> = {
  [WebAppEnvs.LOCAL]: {
    app: BASE_URL_CONFIG[WebAppEnvs.LOCAL].app,
    api: BASE_URL_CONFIG[WebAppEnvs.LOCAL].api,
  },
  [WebAppEnvs.PREVIEW]: {
    app: BASE_URL_CONFIG[WebAppEnvs.PREVIEW].app,
    api: BASE_URL_CONFIG[WebAppEnvs.PREVIEW].api,
  },
  [WebAppEnvs.PROD]: {
    app: BASE_URL_CONFIG[WebAppEnvs.PROD].app,
    api: BASE_URL_CONFIG[WebAppEnvs.PROD].api,
  },
};

/**
 * Get WEBAPP_ENV from Hono context (sync, for Hono middleware)
 * Use this in Hono handlers where you have access to the context
 */
export function getWebappEnvFromContext(c: Context<ApiEnv>): WebappEnv {
  // 1. Try Cloudflare runtime context (c.env)
  const cfEnv = c.env?.WEBAPP_ENV;
  if (typeof cfEnv === 'string' && isWebappEnv(cfEnv)) {
    return cfEnv;
  }

  // 2. Fall back to process.env (for local dev without wrangler)
  const processEnv = process.env.WEBAPP_ENV;
  if (processEnv && isWebappEnv(processEnv)) {
    return processEnv;
  }

  // 3. Fall back to NODE_ENV detection
  const nodeEnv = c.env?.NODE_ENV || process.env.NODE_ENV;
  if (nodeEnv === 'development') {
    return WebAppEnvs.LOCAL;
  }

  // 4. Default to production for safety
  return WebAppEnvs.PROD;
}

/**
 * Check if running in development/local environment (sync, for Hono middleware)
 */
export function isDevelopmentFromContext(c: Context<ApiEnv>): boolean {
  const env = getWebappEnvFromContext(c);
  const nodeEnv = c.env?.NODE_ENV || process.env.NODE_ENV;
  return env === WebAppEnvs.LOCAL || nodeEnv === 'development';
}

/**
 * Get allowed origins for CORS/CSRF based on environment (for Hono middleware)
 * Uses shared config as single source of truth
 */
export function getAllowedOriginsFromContext(c: Context<ApiEnv>): string[] {
  const env = getWebappEnvFromContext(c);
  const isDev = isDevelopmentFromContext(c);
  return sharedGetAllowedOrigins(env, isDev);
}

/**
 * Get cookie configuration from context
 */
export function getCookieConfigFromContext(c: Context<ApiEnv>): { domain: string | undefined; secure: boolean } {
  const env = getWebappEnvFromContext(c);
  return sharedGetCookieConfig(env);
}

/**
 * Detect current environment (async version for API server)
 *
 * Priority:
 * 1. cloudflare:workers env.WEBAPP_ENV (Cloudflare Workers runtime)
 * 2. process.env.WEBAPP_ENV (local dev/.env files)
 * 3. NODE_ENV detection (development = local, production = prod)
 * 4. Default to production for safety
 */
export async function getWebappEnvAsync(): Promise<WebappEnv> {
  // 1. Try Cloudflare Workers runtime env
  try {
    const { env: workersEnvAsync } = await import('cloudflare:workers');
    if (workersEnvAsync.WEBAPP_ENV && isWebappEnv(workersEnvAsync.WEBAPP_ENV)) {
      return workersEnvAsync.WEBAPP_ENV;
    }
  } catch {
    // cloudflare:workers not available (local dev without wrangler)
  }

  // 2. Check process.env (works in local dev)
  const processEnv = process.env.WEBAPP_ENV;
  if (processEnv && isWebappEnv(processEnv)) {
    return processEnv;
  }

  // 3. Fall back to NODE_ENV detection
  if (process.env.NODE_ENV === NodeEnvs.DEVELOPMENT) {
    return WebAppEnvs.LOCAL;
  }

  // 4. Default to production for safety
  return WebAppEnvs.PROD;
}

/**
 * Detect current environment (synchronous - for non-async contexts)
 *
 * Note: For code that needs Cloudflare context, prefer getWebappEnvAsync()
 * or use getWebappEnvFromContext(c) in Hono middleware.
 *
 * Priority:
 * 1. cloudflare:workers env.WEBAPP_ENV (Cloudflare Workers runtime)
 * 2. process.env.WEBAPP_ENV (local dev/.env files)
 * 3. NODE_ENV detection (development = local, production = prod)
 * 4. Default to production for safety
 */
export function getWebappEnv(): WebappEnv {
  // 1. Try Cloudflare Workers env (production/preview)
  try {
    const cfEnv = workersEnv?.WEBAPP_ENV;
    if (cfEnv && isWebappEnv(cfEnv)) {
      return cfEnv;
    }
  } catch {
    // Workers env not available (local dev without wrangler)
  }

  // 2. Check process.env (local dev)
  const processEnv = process.env.WEBAPP_ENV;
  if (processEnv && isWebappEnv(processEnv)) {
    return processEnv;
  }

  // 3. Fall back to NODE_ENV detection
  if (process.env.NODE_ENV === NodeEnvs.DEVELOPMENT) {
    return WebAppEnvs.LOCAL;
  }

  // 4. Default to production for safety
  return WebAppEnvs.PROD;
}

/**
 * Get base URLs for current environment
 * Uses shared config with fallback to production
 */
export function getBaseUrls() {
  const env = getWebappEnv();
  return sharedGetUrlConfig(env);
}

/**
 * Get API base URL for current environment
 */
export function getApiBaseUrl(): string {
  const env = getWebappEnv();
  return sharedGetApiUrl(env);
}

/**
 * Get API server origin for current environment (without /api/v1 path)
 * Use this for services that need the API server URL without the path prefix
 * (e.g., Better Auth which mounts at /api/auth, not /api/v1/auth)
 */
export function getApiServerOrigin(): string {
  const env = getWebappEnv();
  return sharedGetApiOrigin(env);
}

/**
 * Get app base URL for current environment
 */
export function getAppBaseUrl(): string {
  const env = getWebappEnv();
  return sharedGetAppUrl(env);
}

/**
 * For SSG builds: Get the production API URL
 * Used when building static pages that need to fetch from a live API
 */
export function getProductionApiUrl(): string {
  // During SSG builds, if we detect localhost config, use preview API
  // This ensures static pages can be built with real data
  const currentEnv = getWebappEnv();

  if (currentEnv === WebAppEnvs.LOCAL && process.env.NODE_ENV === NodeEnvs.PRODUCTION) {
    // Building for production but env is local - use preview API
    return sharedGetApiUrl(WebAppEnvs.PREVIEW);
  }

  return sharedGetApiUrl(currentEnv);
}

/**
 * Async version: Get API URL with proper Cloudflare context detection
 * Use this for server-side code in Cloudflare Workers runtime
 */
export async function getApiUrlAsync(): Promise<string> {
  const currentEnv = await getWebappEnvAsync();
  return sharedGetApiUrl(currentEnv);
}

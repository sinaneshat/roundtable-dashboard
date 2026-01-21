/**
 * Centralized Base URL Configuration (API Server)
 *
 * Single source of truth for all URL configuration in the Hono API.
 * Uses WEBAPP_ENV from Cloudflare Workers runtime or process.env.
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
import {
  DEFAULT_WEBAPP_ENV,
  isWebAppEnv as isWebappEnv,
  NodeEnvs,
  WEBAPP_ENVS,
  WebAppEnvs,
  WebAppEnvSchema as WebappEnvSchema,
} from '@roundtable/shared';
import { env as workersEnv } from 'cloudflare:workers';
import type { Context } from 'hono';

import type { ApiEnv } from '@/types';

// Re-export for backward compatibility
export { DEFAULT_WEBAPP_ENV, isWebappEnv, WEBAPP_ENVS, type WebappEnv, WebAppEnvs, WebappEnvSchema };

/**
 * Static URL configuration for each environment
 *
 * ARCHITECTURE (TanStack Start + Separate API):
 * - Local: Web on 5173 (Vite), API on 8787 (Wrangler)
 * - Preview: Web on web-preview.roundtable.now, API on api-preview.roundtable.now
 * - Prod: Web on roundtable.now, API on api.roundtable.now
 */
export const BASE_URLS: Record<WebappEnv, { app: string; api: string }> = {
  [WebAppEnvs.LOCAL]: {
    app: 'http://localhost:5173',
    api: 'http://localhost:8787/api/v1',
  },
  [WebAppEnvs.PREVIEW]: {
    app: 'https://web-preview.roundtable.now',
    api: 'https://api-preview.roundtable.now/api/v1',
  },
  [WebAppEnvs.PROD]: {
    app: 'https://roundtable.now',
    api: 'https://api.roundtable.now/api/v1',
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
  return nodeEnv === 'development' ? WebAppEnvs.LOCAL : WebAppEnvs.PROD;
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
 *
 * TanStack Start architecture: Web on 5173, API on 8787
 */
export function getAllowedOriginsFromContext(c: Context<ApiEnv>): string[] {
  const env = getWebappEnvFromContext(c);
  const isDev = isDevelopmentFromContext(c);
  const origins: string[] = [];

  // Add localhost in development (Vite ports 5173-5179)
  if (isDev) {
    origins.push(
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
    );
  }

  // Add environment-specific URL
  const envUrls = BASE_URLS[env];
  if (envUrls) {
    const envUrl = envUrls.app;
    if (!envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      origins.push(envUrl);
    }
  }

  return origins;
}

/**
 * Detect current environment (async version for API server)
 *
 * Priority:
 * 1. cloudflare:workers env.WEBAPP_ENV (Cloudflare Workers runtime)
 * 2. process.env.WEBAPP_ENV (local dev/.env files)
 * 3. NODE_ENV detection (development = local, production = prod)
 */
export async function getWebappEnvAsync(): Promise<WebappEnv> {
  // 1. Try Cloudflare Workers runtime env
  try {
    const { env: workersEnv } = await import('cloudflare:workers');
    if (workersEnv.WEBAPP_ENV && isWebappEnv(workersEnv.WEBAPP_ENV)) {
      return workersEnv.WEBAPP_ENV;
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
  return process.env.NODE_ENV === NodeEnvs.DEVELOPMENT
    ? WebAppEnvs.LOCAL
    : WebAppEnvs.PROD;
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
  return process.env.NODE_ENV === NodeEnvs.DEVELOPMENT
    ? WebAppEnvs.LOCAL
    : WebAppEnvs.PROD;
}

/**
 * Get base URLs for current environment
 */
export function getBaseUrls() {
  const env = getWebappEnv();
  return BASE_URLS[env];
}

/**
 * Get API base URL for current environment
 */
export function getApiBaseUrl(): string {
  const urls = getBaseUrls();
  if (!urls) {
    throw new Error('BASE_URLS not configured for current environment');
  }
  return urls.api;
}

/**
 * Get API server origin for current environment (without /api/v1 path)
 * Use this for services that need the API server URL without the path prefix
 * (e.g., Better Auth which mounts at /api/auth, not /api/v1/auth)
 */
export function getApiServerOrigin(): string {
  const urls = getBaseUrls();
  if (!urls) {
    throw new Error('BASE_URLS not configured for current environment');
  }
  const apiUrl = urls.api;
  try {
    const url = new URL(apiUrl);
    return url.origin;
  } catch {
    // Fallback: strip /api/v1 suffix
    return apiUrl.replace(/\/api\/v1$/, '');
  }
}

/**
 * Get app base URL for current environment
 */
export function getAppBaseUrl(): string {
  const urls = getBaseUrls();
  if (!urls) {
    throw new Error('BASE_URLS not configured for current environment');
  }
  return urls.app;
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
    const previewUrls = BASE_URLS[WebAppEnvs.PREVIEW];
    if (!previewUrls) {
      throw new Error('Preview BASE_URLS not configured');
    }
    return previewUrls.api;
  }

  const urls = BASE_URLS[currentEnv];
  if (!urls) {
    throw new Error(`BASE_URLS not configured for environment: ${currentEnv}`);
  }
  return urls.api;
}

/**
 * Async version: Get API URL with proper Cloudflare context detection
 * Use this for server-side code in Cloudflare Workers runtime
 */
export async function getApiUrlAsync(): Promise<string> {
  const currentEnv = await getWebappEnvAsync();
  const urls = BASE_URLS[currentEnv];
  if (!urls) {
    throw new Error(`BASE_URLS not configured for environment: ${currentEnv}`);
  }
  return urls.api;
}

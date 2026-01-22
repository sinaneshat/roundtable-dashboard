/**
 * Centralized Base URL Configuration (Web App)
 *
 * Uses shared config from @roundtable/shared as single source of truth.
 * Adds web-specific environment detection for Vite build-time replacement.
 *
 * PROXY ARCHITECTURE (Unified Origin):
 * ====================================
 * All API requests go through the frontend to eliminate CORS and ensure cookies work.
 *
 * Client-side (browser):
 *   - ALWAYS uses relative URL: '/api/v1'
 *   - Requests appear same-origin to the browser
 *   - No CORS issues, cookies work seamlessly
 *
 * Proxy routing:
 *   - Development: Vite proxy (vite.config.ts) forwards /api/* to localhost:8787
 *   - Production: TanStack Start route (/api/$) proxies to backend server
 *
 * Server-side (SSR/server functions):
 *   - Uses full backend URL for direct API access
 *   - Bypasses proxy for efficiency
 */

import {
  BASE_URL_CONFIG,
  FALLBACK_URLS,
  getApiOrigin as sharedGetApiOrigin,
  getApiUrl as sharedGetApiUrl,
  getAppUrl as sharedGetAppUrl,
  getUrlConfig as sharedGetUrlConfig,
  resolveApiOriginFromHostname, // eslint-disable-line perfectionist/sort-named-imports -- keep with other getters
} from '@roundtable/shared';
import type { WebAppEnv as WebappEnv } from '@roundtable/shared/enums';
import {
  DEFAULT_WEBAPP_ENV,
  isWebAppEnv as isWebappEnv,
  WEBAPP_ENVS,
  WebAppEnvs,
  WebAppEnvSchema as WebappEnvSchema,
} from '@roundtable/shared/enums';

// Re-export for local usage - no renames, single source of truth
export { BASE_URL_CONFIG, DEFAULT_WEBAPP_ENV, FALLBACK_URLS, isWebappEnv, resolveApiOriginFromHostname, WEBAPP_ENVS, type WebappEnv, WebAppEnvs, WebappEnvSchema };

/**
 * Check if we're in a prerender/SSG build context.
 * During prerender, external API calls will fail because the build environment
 * can't resolve production DNS. We detect this and return localhost URLs instead.
 *
 * Detection: SSR context (no window) + NOT on Cloudflare Workers runtime
 *
 * ✅ TYPE-SAFE: Uses in-operator for globalThis property access
 */
export function isPrerender(): boolean {
  // Client-side: never prerender
  if (typeof window !== 'undefined')
    return false;

  // SSR during prerender: check if we're in a build context
  // Cloudflare Workers have globalThis.caches, Node.js build context doesn't
  let isCloudflareWorkers = false;
  if (typeof globalThis !== 'undefined' && 'caches' in globalThis) {
    // After in-operator check, use indexed access for type-safe property access
    const caches = (globalThis as { caches?: unknown }).caches;
    isCloudflareWorkers = typeof caches === 'object' && caches !== null;
  }

  // If we're in SSR but NOT on Cloudflare Workers, we're likely in prerender/build
  return !isCloudflareWorkers;
}

/**
 * Detect current environment (async version for server functions)
 * Uses same logic as getWebappEnv() - see that function for priority docs.
 */
export async function getWebappEnvAsync(): Promise<WebappEnv> {
  // Delegate to sync version - same logic applies
  return getWebappEnv();
}

/**
 * Detect environment from hostname (client-side)
 * Most reliable detection method as it can't be misconfigured
 */
function detectEnvFromHostname(): WebappEnv {
  if (typeof window === 'undefined')
    return WebAppEnvs.PROD;

  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return WebAppEnvs.LOCAL;
  }
  if (hostname.includes('preview') || hostname.includes('-preview')) {
    return WebAppEnvs.PREVIEW;
  }
  return WebAppEnvs.PROD;
}

/**
 * Detect current environment (synchronous - for client-side and non-async contexts)
 *
 * CLIENT-SIDE Priority (hostname is most reliable):
 * 1. Hostname detection (can't be misconfigured)
 *
 * SERVER-SIDE Priority:
 * 1. import.meta.env.VITE_WEBAPP_ENV (Vite build-time replacement)
 * 2. process.env.VITE_WEBAPP_ENV (SSR/CF Workers fallback)
 * 3. NODE_ENV detection (development = local, production = prod)
 *
 * NOTE: Build-time env vars can be incorrect if build env differs from deploy env.
 * Client-side hostname detection is always accurate.
 */
export function getWebappEnv(): WebappEnv {
  // CLIENT-SIDE: Use hostname detection (most reliable, can't be misconfigured)
  if (typeof window !== 'undefined') {
    return detectEnvFromHostname();
  }

  // SERVER-SIDE: Try env vars, fall back to NODE_ENV detection

  // 1. Check import.meta.env (Vite build-time replacement)
  const viteEnv = import.meta.env?.VITE_WEBAPP_ENV;
  if (viteEnv && isWebappEnv(viteEnv)) {
    return viteEnv;
  }

  // 2. Check process.env (SSR/CF Workers fallback)
  const processEnv = process.env.VITE_WEBAPP_ENV;
  if (processEnv && isWebappEnv(processEnv)) {
    return processEnv;
  }

  // 3. Fall back to NODE_ENV detection
  return import.meta.env.MODE === 'development'
    ? WebAppEnvs.LOCAL
    : WebAppEnvs.PROD;
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
 *
 * CLIENT-SIDE (all environments): Returns '/api/v1' (relative URL)
 * - Requests go through TanStack Start proxy route (/api/$)
 * - Proxy forwards to correct backend (local/preview/prod)
 * - Eliminates CORS issues and ensures cookies work seamlessly
 *
 * SERVER-SIDE (SSR/server functions): Returns full backend URL
 * - Direct backend access for server-side data fetching
 *
 * PRERENDER/SSG: Returns localhost URL
 * - During prerender, external DNS can't be resolved
 * - Static pages shouldn't make API calls anyway (guarded elsewhere)
 */
export function getApiBaseUrl(): string {
  // Client-side: ALWAYS use relative URL through TanStack Start proxy
  // The proxy route (/api/$) handles forwarding to correct backend
  if (typeof window !== 'undefined') {
    return '/api/v1';
  }

  // Prerender/SSG: use localhost to avoid DNS failures for external domains
  // Static pages shouldn't make API calls anyway (handled by isStaticRoute check)
  if (isPrerender()) {
    return sharedGetApiUrl(WebAppEnvs.LOCAL);
  }

  // Server-side: use full backend URL for direct access
  const env = getWebappEnv();
  return sharedGetApiUrl(env);
}

/**
 * Get app base URL for current environment
 */
export function getAppBaseUrl(): string {
  const env = getWebappEnv();
  return sharedGetAppUrl(env);
}

/**
 * Get full API origin URL (without /api/v1 path)
 * Used for direct API access like OG images that bypass the proxy
 */
export function getApiOriginUrl(): string {
  const env = getWebappEnv();
  return sharedGetApiOrigin(env);
}

/**
 * Get API origin with hostname-based fallback for robust production deployment
 * Used by proxy route when environment detection may fail
 */
export function getApiOriginWithFallback(requestHost?: string): string {
  try {
    const env = getWebappEnv();
    const config = sharedGetUrlConfig(env);
    if (config?.apiOrigin) {
      return config.apiOrigin;
    }
  } catch {
    // Environment detection failed
  }

  // Fallback to hostname-based resolution
  if (requestHost) {
    return resolveApiOriginFromHostname(requestHost);
  }

  // Ultimate fallback to production
  return FALLBACK_URLS.apiOrigin;
}

/**
 * For SSG builds: Get the production API URL
 * Used when building static pages that need to fetch from a live API
 */
export function getProductionApiUrl(): string {
  // During SSG builds, if we detect localhost config, use preview API
  // This ensures static pages can be built with real data
  const currentEnv = getWebappEnv();

  if (currentEnv === WebAppEnvs.LOCAL && import.meta.env.MODE === 'production') {
    // Building for production but env is local - use preview API
    return sharedGetApiUrl(WebAppEnvs.PREVIEW);
  }

  return sharedGetApiUrl(currentEnv);
}

/**
 * Async version: Get API URL with proper environment detection
 * Use this for server functions that need async environment resolution
 *
 * CLIENT-SIDE: Returns '/api/v1' (through proxy)
 * SERVER-SIDE: Returns full backend URL
 */
export async function getApiUrlAsync(): Promise<string> {
  // Client-side: ALWAYS use relative URL through proxy
  if (typeof window !== 'undefined') {
    return '/api/v1';
  }

  // Server-side: use full backend URL
  const currentEnv = await getWebappEnvAsync();
  return sharedGetApiUrl(currentEnv);
}

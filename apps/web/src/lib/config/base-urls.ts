/**
 * Centralized Base URL Configuration
 *
 * Single source of truth for all URL configuration across the application.
 * Uses VITE_WEBAPP_ENV from environment to determine which environment URLs to use.
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
 *
 * Environment detection priority:
 * 1. import.meta.env.VITE_WEBAPP_ENV (Vite build-time replacement)
 * 2. process.env.VITE_WEBAPP_ENV (SSR fallback)
 * 3. NODE_ENV fallback (development = local, production = prod)
 * 4. Client-side hostname detection
 *
 * Usage:
 * - Server functions: Use getBaseUrls() or getAppBaseUrl()/getApiBaseUrl()
 * - Client components: Use getApiBaseUrl() (returns '/api/v1' via proxy)
 */

import { z } from 'zod';

/**
 * Webapp environment values - 5-part enum pattern
 */

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const WEBAPP_ENV_VALUES = ['local', 'preview', 'prod'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_WEBAPP_ENV: WebappEnv = 'local';

// 3️⃣ ZOD SCHEMA - Runtime validation

export const WebappEnvSchema = z.enum(WEBAPP_ENV_VALUES);

// 4️⃣ TYPESCRIPT TYPE - Inferred from schema
export type WebappEnv = z.infer<typeof WebappEnvSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const WEBAPP_ENVS = {
  LOCAL: 'local' as const,
  PREVIEW: 'preview' as const,
  PROD: 'prod' as const,
} as const;

/**
 * Type guard to check if value is a valid WebappEnv
 */
export function isWebappEnv(value: unknown): value is WebappEnv {
  return WebappEnvSchema.safeParse(value).success;
}

/**
 * Static URL configuration for each environment
 *
 * ARCHITECTURE (TanStack Start + Separate API):
 * - Local: Web on 5173 (Vite), API on 8787 (Wrangler)
 * - Preview: Web on app-preview.roundtable.now, API on api-preview.roundtable.now
 * - Prod: Web on roundtable.now, API on api.roundtable.now
 */
export const BASE_URLS: Record<WebappEnv, { app: string; api: string }> = {
  [WEBAPP_ENVS.LOCAL]: {
    app: 'http://localhost:5173',
    api: 'http://localhost:8787/api/v1',
  },
  [WEBAPP_ENVS.PREVIEW]: {
    app: 'https://app-preview.roundtable.now',
    api: 'https://api-preview.roundtable.now/api/v1',
  },
  [WEBAPP_ENVS.PROD]: {
    app: 'https://roundtable.now',
    api: 'https://api.roundtable.now/api/v1',
  },
};

/**
 * Detect current environment (async version for server functions)
 *
 * For TanStack Start, we use import.meta.env which is replaced at build time by Vite.
 *
 * Priority:
 * 1. import.meta.env.VITE_WEBAPP_ENV (Vite build-time replacement)
 * 2. process.env.VITE_WEBAPP_ENV (fallback for SSR)
 * 3. NODE_ENV detection (development = local, production = prod)
 * 4. Runtime detection via hostname (client-side only)
 */
export async function getWebappEnvAsync(): Promise<WebappEnv> {
  // 1. Check import.meta.env (Vite build-time replacement)
  const viteEnv = import.meta.env?.VITE_WEBAPP_ENV;
  if (viteEnv && isWebappEnv(viteEnv)) {
    return viteEnv;
  }

  // 2. Check process.env (SSR fallback)
  const processEnv = process.env.VITE_WEBAPP_ENV;
  if (processEnv && isWebappEnv(processEnv)) {
    return processEnv;
  }

  // 3. Server-side: use NODE_ENV
  if (typeof window === 'undefined') {
    return import.meta.env.MODE === 'development'
      ? WEBAPP_ENVS.LOCAL
      : WEBAPP_ENVS.PROD;
  }

  // 4. Client-side: detect from hostname
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return WEBAPP_ENVS.LOCAL;
  }
  if (hostname.includes('preview') || hostname.includes('-preview')) {
    return WEBAPP_ENVS.PREVIEW;
  }
  return WEBAPP_ENVS.PROD;
}

/**
 * Detect current environment (synchronous - for client-side and non-async contexts)
 *
 * Priority:
 * 1. import.meta.env.VITE_WEBAPP_ENV (Vite build-time replacement - works on CF Workers)
 * 2. process.env.VITE_WEBAPP_ENV (SSR fallback)
 * 3. NODE_ENV detection (development = local, production = prod)
 * 4. Runtime detection via hostname (client-side only)
 */
export function getWebappEnv(): WebappEnv {
  // 1. Check import.meta.env (Vite build-time replacement - works on Cloudflare Workers)
  const viteEnv = import.meta.env?.VITE_WEBAPP_ENV;
  if (viteEnv && isWebappEnv(viteEnv)) {
    return viteEnv;
  }

  // 2. Check process.env (SSR fallback)
  const processEnv = process.env.VITE_WEBAPP_ENV;
  if (processEnv && isWebappEnv(processEnv)) {
    return processEnv;
  }

  // 3. Server-side: use NODE_ENV
  if (typeof window === 'undefined') {
    return import.meta.env.MODE === 'development'
      ? WEBAPP_ENVS.LOCAL
      : WEBAPP_ENVS.PROD;
  }

  // 4. Client-side: detect from hostname
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return WEBAPP_ENVS.LOCAL;
  }
  if (hostname.includes('preview') || hostname.includes('-preview')) {
    return WEBAPP_ENVS.PREVIEW;
  }
  return WEBAPP_ENVS.PROD;
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
 *
 * CLIENT-SIDE (all environments): Returns '/api/v1' (relative URL)
 * - Requests go through TanStack Start proxy route (/api/$)
 * - Proxy forwards to correct backend (local/preview/prod)
 * - Eliminates CORS issues and ensures cookies work seamlessly
 *
 * SERVER-SIDE (SSR/server functions): Returns full backend URL
 * - Direct backend access for server-side data fetching
 */
export function getApiBaseUrl(): string {
  // Client-side: ALWAYS use relative URL through TanStack Start proxy
  // The proxy route (/api/$) handles forwarding to correct backend
  if (typeof window !== 'undefined') {
    return '/api/v1';
  }

  // Server-side: use full backend URL for direct access
  return getBaseUrls().api;
}

/**
 * Get app base URL for current environment
 */
export function getAppBaseUrl(): string {
  return getBaseUrls().app;
}

/**
 * For SSG builds: Get the production API URL
 * Used when building static pages that need to fetch from a live API
 */
export function getProductionApiUrl(): string {
  // During SSG builds, if we detect localhost config, use preview API
  // This ensures static pages can be built with real data
  const currentEnv = getWebappEnv();

  if (currentEnv === WEBAPP_ENVS.LOCAL && import.meta.env.MODE === 'production') {
    // Building for production but env is local - use preview API
    return BASE_URLS[WEBAPP_ENVS.PREVIEW].api;
  }

  return BASE_URLS[currentEnv].api;
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
  return BASE_URLS[currentEnv].api;
}

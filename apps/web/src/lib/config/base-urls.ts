/**
 * Centralized Base URL Configuration
 *
 * Single source of truth for all URL configuration across the application.
 * Uses VITE_WEBAPP_ENV from environment to determine which environment URLs to use.
 *
 * Priority for environment detection:
 * 1. import.meta.env.VITE_WEBAPP_ENV (Vite build-time replacement)
 * 2. process.env.VITE_WEBAPP_ENV (SSR fallback)
 * 3. NODE_ENV fallback (development = local, production = prod)
 * 4. Client-side hostname detection
 *
 * Usage:
 * - Server functions: Use getBaseUrls() or getAppBaseUrl()/getApiBaseUrl()
 * - Client components: Use getAppBaseUrl()/getApiBaseUrl() (auto-detects from hostname)
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
    return process.env.NODE_ENV === 'development'
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
 * 1. process.env.VITE_WEBAPP_ENV (Vite loaded .env files in SSR)
 * 2. NODE_ENV detection (development = local, production = prod)
 * 3. Runtime detection via hostname (client-side only)
 */
export function getWebappEnv(): WebappEnv {
  // 1. Check process.env (Vite loads .env files)
  const processEnv = process.env.VITE_WEBAPP_ENV;
  if (processEnv && isWebappEnv(processEnv)) {
    return processEnv;
  }

  // 2. Server-side: use NODE_ENV
  if (typeof window === 'undefined') {
    return process.env.NODE_ENV === 'development'
      ? WEBAPP_ENVS.LOCAL
      : WEBAPP_ENVS.PROD;
  }

  // 3. Client-side: detect from hostname
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
 * In LOCAL development on client-side: returns '/api/v1' (relative URL through Vite proxy)
 * This ensures cookies work correctly by keeping requests same-origin.
 */
export function getApiBaseUrl(): string {
  // Check if running in local development (client-side)
  // Use relative URL through Vite proxy to avoid cross-origin cookie issues
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Relative URL goes through Vite proxy to API server
      return '/api/v1';
    }
  }

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

  if (currentEnv === WEBAPP_ENVS.LOCAL && process.env.NODE_ENV === 'production') {
    // Building for production but env is local - use preview API
    return BASE_URLS[WEBAPP_ENVS.PREVIEW].api;
  }

  return BASE_URLS[currentEnv].api;
}

/**
 * Async version: Get API URL with proper environment detection
 * Use this for server functions that need async environment resolution
 */
export async function getApiUrlAsync(): Promise<string> {
  const currentEnv = await getWebappEnvAsync();
  return BASE_URLS[currentEnv].api;
}

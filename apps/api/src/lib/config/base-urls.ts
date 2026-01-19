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

import { z } from '@hono/zod-openapi';
import { env as workersEnv } from 'cloudflare:workers';
import type { Context } from 'hono';

import type { ApiEnv } from '@/types';

/**
 * Webapp environment values - 5-part enum pattern
 */

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const WEBAPP_ENV_VALUES = ['local', 'preview', 'prod'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_WEBAPP_ENV: WebappEnv = 'local';

// 3️⃣ ZOD SCHEMA - Runtime validation

export const WebappEnvSchema = z.enum(WEBAPP_ENV_VALUES).openapi({
  description: 'Webapp deployment environment',
  example: 'prod',
});

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
  return nodeEnv === 'development' ? WEBAPP_ENVS.LOCAL : WEBAPP_ENVS.PROD;
}

/**
 * Check if running in development/local environment (sync, for Hono middleware)
 */
export function isDevelopmentFromContext(c: Context<ApiEnv>): boolean {
  const env = getWebappEnvFromContext(c);
  const nodeEnv = c.env?.NODE_ENV || process.env.NODE_ENV;
  return env === WEBAPP_ENVS.LOCAL || nodeEnv === 'development';
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
  const envUrl = BASE_URLS[env].app;
  if (!envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    origins.push(envUrl);
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
  return process.env.NODE_ENV === 'development'
    ? WEBAPP_ENVS.LOCAL
    : WEBAPP_ENVS.PROD;
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
  return process.env.NODE_ENV === 'development'
    ? WEBAPP_ENVS.LOCAL
    : WEBAPP_ENVS.PROD;
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
  return getBaseUrls().api;
}

/**
 * Get API server origin for current environment (without /api/v1 path)
 * Use this for services that need the API server URL without the path prefix
 * (e.g., Better Auth which mounts at /api/auth, not /api/v1/auth)
 */
export function getApiServerOrigin(): string {
  const apiUrl = getBaseUrls().api;
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
 * Async version: Get API URL with proper Cloudflare context detection
 * Use this for server-side code in Cloudflare Workers runtime
 */
export async function getApiUrlAsync(): Promise<string> {
  const currentEnv = await getWebappEnvAsync();
  return BASE_URLS[currentEnv].api;
}

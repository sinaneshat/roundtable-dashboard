/**
 * Centralized Base URL Configuration
 *
 * Single source of truth for all URL configuration across the application.
 * Uses NEXT_PUBLIC_WEBAPP_ENV from Cloudflare context or process.env to determine
 * which environment URLs to use.
 *
 * Priority for environment detection:
 * 1. getCloudflareContext().env.NEXT_PUBLIC_WEBAPP_ENV (Cloudflare Workers runtime)
 * 2. process.env.NEXT_PUBLIC_WEBAPP_ENV (Next.js dev/.env files)
 * 3. NODE_ENV fallback (development = local, production = prod)
 * 4. Client-side hostname detection
 *
 * Usage:
 * - Server components: Use getBaseUrls() or getAppBaseUrl()/getApiBaseUrl()
 * - Client components: Use getAppBaseUrl()/getApiBaseUrl() (auto-detects from hostname)
 * - Hono middleware: Use getWebappEnvFromContext(c) for per-request env access
 */

import { z } from '@hono/zod-openapi';
import type { Context } from 'hono';

import type { ApiEnv } from '@/api/types';

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
  return typeof value === 'string' && WEBAPP_ENV_VALUES.includes(value as WebappEnv);
}

/**
 * Static URL configuration for each environment
 */
export const BASE_URLS: Record<WebappEnv, { app: string; api: string }> = {
  [WEBAPP_ENVS.LOCAL]: {
    app: 'http://localhost:3000',
    api: 'http://localhost:3000/api/v1',
  },
  [WEBAPP_ENVS.PREVIEW]: {
    app: 'https://app-preview.roundtable.now',
    api: 'https://app-preview.roundtable.now/api/v1',
  },
  [WEBAPP_ENVS.PROD]: {
    app: 'https://roundtable.now',
    api: 'https://roundtable.now/api/v1',
  },
};

/**
 * Get NEXT_PUBLIC_WEBAPP_ENV from Cloudflare context (sync, for Hono middleware)
 * Use this in Hono handlers where you have access to the context
 */
export function getWebappEnvFromContext(c: Context<ApiEnv>): WebappEnv {
  // 1. Try Cloudflare runtime context (c.env)
  const cfEnv = c.env?.NEXT_PUBLIC_WEBAPP_ENV;
  if (typeof cfEnv === 'string' && isWebappEnv(cfEnv)) {
    return cfEnv;
  }

  // 2. Fall back to process.env (for local dev without wrangler)
  const processEnv = process.env.NEXT_PUBLIC_WEBAPP_ENV;
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
 */
export function getAllowedOriginsFromContext(c: Context<ApiEnv>): string[] {
  const env = getWebappEnvFromContext(c);
  const isDev = isDevelopmentFromContext(c);
  const origins: string[] = [];

  // Add localhost in development
  if (isDev) {
    origins.push('http://localhost:3000', 'http://127.0.0.1:3000');
  }

  // Add environment-specific URL
  const envUrl = BASE_URLS[env].app;
  if (!envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    origins.push(envUrl);
  }

  return origins;
}

/**
 * Detect current environment (async version for server components)
 *
 * Priority:
 * 1. getCloudflareContext().env.NEXT_PUBLIC_WEBAPP_ENV (Cloudflare Workers runtime)
 * 2. process.env.NEXT_PUBLIC_WEBAPP_ENV (Next.js dev/.env files)
 * 3. NODE_ENV detection (development = local, production = prod)
 * 4. Runtime detection via hostname (client-side only)
 */
export async function getWebappEnvAsync(): Promise<WebappEnv> {
  // 1. Try Cloudflare runtime context
  if (typeof window === 'undefined') {
    try {
      const openNext = await import('@opennextjs/cloudflare');
      const { env } = openNext.getCloudflareContext();
      // Type-safe extraction from Cloudflare context
      if (env && typeof env === 'object' && 'NEXT_PUBLIC_WEBAPP_ENV' in env) {
        const cfEnv = (env as { NEXT_PUBLIC_WEBAPP_ENV?: unknown }).NEXT_PUBLIC_WEBAPP_ENV;
        if (typeof cfEnv === 'string' && isWebappEnv(cfEnv)) {
          return cfEnv;
        }
      }
    } catch {
      // getCloudflareContext not available
    }
  }

  // 2. Check process.env (works in Next.js dev and build)
  const processEnv = process.env.NEXT_PUBLIC_WEBAPP_ENV;
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
 * Note: For server-side code that needs Cloudflare context, prefer getWebappEnvAsync()
 * or use getWebappEnvFromContext(c) in Hono middleware.
 *
 * Priority:
 * 1. process.env.NEXT_PUBLIC_WEBAPP_ENV (Next.js dev/.env files)
 * 2. NODE_ENV detection (development = local, production = prod)
 * 3. Runtime detection via hostname (client-side only)
 */
export function getWebappEnv(): WebappEnv {
  // 1. Check process.env (works in Next.js dev and build)
  // Note: In Cloudflare Workers, NEXT_PUBLIC_* vars are inlined at build time
  const processEnv = process.env.NEXT_PUBLIC_WEBAPP_ENV;
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
 */
export function getApiBaseUrl(): string {
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
 * Async version: Get API URL with proper Cloudflare context detection
 * Use this for server-side code in Cloudflare Workers runtime
 */
export async function getApiUrlAsync(): Promise<string> {
  const currentEnv = await getWebappEnvAsync();
  return BASE_URLS[currentEnv].api;
}

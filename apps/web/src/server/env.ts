/**
 * Server function to expose public environment variables to the client.
 *
 * TanStack Start Pattern: Runtime env vars from wrangler.jsonc are only available
 * on the server. To use them on the client, pass via loader/server function.
 *
 * Cloudflare Workers: Use `import { env } from 'cloudflare:workers'` for runtime
 * access to bindings and vars defined in wrangler.jsonc. Falls back to process.env
 * for local development.
 *
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/environment-variables#runtime-client-environment-variables-in-production
 * @see https://developers.cloudflare.com/workers/runtime-apis/bindings/env/
 */
import { createServerFn } from '@tanstack/react-start';

import { publicEnvSchema } from './schemas';

/**
 * Get public environment variables from server runtime.
 * Called in root loader to pass to client.
 *
 * Uses Cloudflare Workers env binding for production/preview,
 * falls back to process.env for local development.
 */
export const getPublicEnv = createServerFn({ method: 'GET' }).handler(
  async () => {
    let cfEnv: Cloudflare.Env | null = null;

    try {
      const { env } = await import('cloudflare:workers');
      cfEnv = env;
    } catch {
      // Local dev: cloudflare:workers not available
    }

    // Build raw env object from CF binding or process.env fallback
    const rawEnv = {
      VITE_MAINTENANCE: cfEnv?.VITE_MAINTENANCE ?? process.env.VITE_MAINTENANCE ?? 'false',
      VITE_POSTHOG_API_KEY: cfEnv?.VITE_POSTHOG_API_KEY ?? process.env.VITE_POSTHOG_API_KEY ?? '',
      VITE_STRIPE_PUBLISHABLE_KEY: cfEnv?.VITE_STRIPE_PUBLISHABLE_KEY ?? process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '',
      VITE_TURNSTILE_SITE_KEY: cfEnv?.VITE_TURNSTILE_SITE_KEY ?? process.env.VITE_TURNSTILE_SITE_KEY ?? '',
      VITE_WEBAPP_ENV: cfEnv?.VITE_WEBAPP_ENV ?? process.env.VITE_WEBAPP_ENV ?? 'local',
    };

    // Validate and return typed result
    return publicEnvSchema.parse(rawEnv);
  },
);

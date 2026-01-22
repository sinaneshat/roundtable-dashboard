/**
 * Server function to expose public environment variables to the client.
 *
 * TanStack Start Pattern: Runtime env vars from wrangler.jsonc are only available
 * on the server (process.env). To use them on the client, pass via loader/server function.
 *
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/environment-variables#runtime-client-environment-variables-in-production
 */
import { createServerFn } from '@tanstack/react-start';

import type { PublicEnv } from './schemas';

/**
 * Get public environment variables from server runtime.
 * Called in root loader to pass to client.
 */
export const getPublicEnv = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PublicEnv> => {
    return {
      VITE_WEBAPP_ENV: process.env.VITE_WEBAPP_ENV ?? 'local',
      VITE_POSTHOG_API_KEY: process.env.VITE_POSTHOG_API_KEY ?? '',
      VITE_MAINTENANCE: process.env.VITE_MAINTENANCE ?? 'false',
      VITE_TURNSTILE_SITE_KEY: process.env.VITE_TURNSTILE_SITE_KEY ?? '',
      VITE_STRIPE_PUBLISHABLE_KEY: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '',
    };
  },
);

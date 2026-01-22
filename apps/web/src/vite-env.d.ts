/// <reference types="vite/client" />

/**
 * Type declarations for Vite environment variables (build-time replacement)
 *
 * VITE_ prefixed variables are replaced at bundle time by Vite.
 * For runtime env vars on the server, use createServerFn() and pass via loader.
 *
 * @see https://vite.dev/guide/env-and-mode
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/environment-variables
 */

type ImportMetaEnv = {
  // Application
  readonly VITE_WEBAPP_ENV: 'local' | 'preview' | 'prod';
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_APP_URL: string;
  readonly VITE_MAINTENANCE: string;

  // Turnstile (public site key)
  readonly VITE_TURNSTILE_SITE_KEY: string;

  // Stripe (publishable key - designed for client exposure)
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;

  // PostHog (client API key - designed for client exposure)
  readonly VITE_POSTHOG_API_KEY: string;
};

type ImportMeta = {
  readonly env: ImportMetaEnv;
};

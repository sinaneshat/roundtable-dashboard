/// <reference types="vite/client" />

/**
 * Type declarations for Vite environment variables
 *
 * @see https://vite.dev/guide/env-and-mode
 */

type ImportMetaEnv = {
  // Application
  readonly VITE_WEBAPP_ENV: 'local' | 'preview' | 'prod';
  readonly VITE_API_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_APP_URL: string;
  readonly VITE_MAINTENANCE: string;

  // Turnstile
  readonly VITE_TURNSTILE_SITE_KEY: string;

  // Stripe
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;

  // PostHog
  readonly VITE_POSTHOG_API_KEY: string;
  readonly VITE_POSTHOG_HOST: string;
};

type ImportMeta = {
  readonly env: ImportMetaEnv;
};

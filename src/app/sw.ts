import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, NetworkFirst, Serwist, StaleWhileRevalidate } from 'serwist';

declare global {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Build metadata for cache invalidation - version changes on every build
// This ensures service worker updates are detected in production
const SW_VERSION = process.env.NEXT_PUBLIC_SW_VERSION || 'dev';
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString();

// Log version on activation for debugging
// eslint-disable-next-line no-console
console.log(`[SW] Version: ${SW_VERSION}, Build: ${BUILD_TIME}`);

// Development mode: Do absolutely nothing - no caching, no service worker
// This file should never be built or executed in development due to next.config.ts disable flag
// Note: This code is only here as a safety net - Serwist is disabled in next.config.ts for development
if (process.env.NODE_ENV === 'development') {
  // eslint-disable-next-line no-console
  console.warn('[DEV SW] Service worker should not be active in development - this indicates a configuration error');

  // Don't initialize Serwist in development
  throw new Error('Service worker should not be active in development - check next.config.ts');
}

// Production mode: Comprehensive caching strategies for offline-first PWA
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    concurrency: 10,
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: process.env.NODE_ENV === 'production',

  runtimeCaching: [
    // Start with defaultCache (Next.js optimized strategies)
    ...defaultCache,

    // Custom strategies for specific routes

    // Navigation/Document requests - Network First with timeout
    {
      matcher: ({ request, url }) =>
        request.destination === 'document' && !url.pathname.startsWith('/api/'),
      handler: new NetworkFirst({
        cacheName: 'pages-cache',
        networkTimeoutSeconds: 10,
        plugins: [
          {
            cacheWillUpdate: async ({ response }) => {
              return response?.ok ? response : null;
            },
          },
        ],
      }),
    },

    // API requests - Network First with short timeout
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/'),
      handler: new NetworkFirst({
        cacheName: 'api-cache',
        networkTimeoutSeconds: 5,
        plugins: [
          {
            cacheWillUpdate: async ({ response }) => {
              return response?.status === 200 ? response : null;
            },
          },
        ],
      }),
    },

    // Static images - Cache First
    {
      matcher: ({ request }) => request.destination === 'image',
      handler: new CacheFirst({
        cacheName: 'image-cache',
      }),
    },

    // Fonts - Cache First
    {
      matcher: ({ request }) => request.destination === 'font',
      handler: new CacheFirst({
        cacheName: 'font-cache',
      }),
    },

    // Google Fonts stylesheets - Stale While Revalidate
    {
      matcher: ({ url }) => url.origin === 'https://fonts.googleapis.com',
      handler: new StaleWhileRevalidate({
        cacheName: 'google-fonts-stylesheets',
      }),
    },

    // Google Fonts webfonts - Cache First
    {
      matcher: ({ url }) => url.origin === 'https://fonts.gstatic.com',
      handler: new CacheFirst({
        cacheName: 'google-fonts-webfonts',
      }),
    },

    // Google Favicons - Network First with fallback
    {
      matcher: ({ url }) => url.origin === 'https://www.google.com' && url.pathname.startsWith('/s2/favicons'),
      handler: new NetworkFirst({
        cacheName: 'google-favicons',
        networkTimeoutSeconds: 3,
        plugins: [
          {
            handlerDidError: async () => {
              // Silently fail for favicons - UI handles fallback
              return null;
            },
            fetchDidFail: async () => {
              // Suppress fetch errors for favicons
              return undefined;
            },
          },
        ],
      }),
    },

    // External resources - Stale While Revalidate with error handling
    {
      matcher: ({ url, sameOrigin }) => !sameOrigin && url.protocol === 'https:',
      handler: new StaleWhileRevalidate({
        cacheName: 'external-cache',
        plugins: [
          {
            handlerDidError: async () => {
              // Return null for failed external resources
              return null;
            },
            fetchDidFail: async () => {
              // Suppress console errors for failed external fetches
              return undefined;
            },
          },
        ],
      }),
    },
  ],

  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();

// Handle update requests from PWAUpdatePrompt component
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

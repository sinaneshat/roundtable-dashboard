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
// Development mode: Do absolutely nothing - no caching, no service worker
// This file should never be built or executed in development due to next.config.ts disable flag
// Note: This code is only here as a safety net - Serwist is disabled in next.config.ts for development
if (process.env.NODE_ENV === 'development') {
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
    // ✅ CRITICAL: CSS/JS assets - StaleWhileRevalidate to ensure fresh styles
    // This runs BEFORE defaultCache to take priority for script/style assets
    // Fixes issue where old cached CSS/JS causes broken styles after deployment
    {
      matcher: ({ request }) =>
        request.destination === 'script' || request.destination === 'style',
      handler: new StaleWhileRevalidate({
        cacheName: 'static-resources',
        plugins: [
          {
            cacheWillUpdate: async ({ response }) => {
              // Only cache successful responses
              return response?.ok ? response : null;
            },
          },
        ],
      }),
    },

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

    // Static images - Cache First (same-origin only, let external images pass through)
    {
      matcher: ({ request, sameOrigin }) => request.destination === 'image' && sameOrigin,
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

    // External images (cross-origin) - fetch directly, return transparent GIF on any failure
    // This prevents service worker from throwing no-response errors on external image fetches
    {
      matcher: ({ request, sameOrigin }) => request.destination === 'image' && !sameOrigin,
      handler: async ({ request }) => {
        try {
          const response = await fetch(request);
          if (response.ok || response.type === 'opaque') {
            return response;
          }
          throw new Error('Failed to fetch');
        } catch {
          // Return transparent 1x1 GIF as fallback
          // prettier-ignore
          const fallbackGif = new Uint8Array([
            0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, // eslint-disable-line antfu/consistent-list-newline
            0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0x21, // eslint-disable-line antfu/consistent-list-newline
            0xF9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2C, 0x00, 0x00, // eslint-disable-line antfu/consistent-list-newline
            0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x01, 0x44, // eslint-disable-line antfu/consistent-list-newline
            0x00, 0x3B, // eslint-disable-line antfu/consistent-list-newline
          ]);
          return new Response(fallbackGif, {
            status: 200,
            headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-cache' },
          });
        }
      },
    },

    // External resources - only cache from CSP-allowed domains
    {
      matcher: ({ url, sameOrigin }) => {
        if (sameOrigin || url.protocol !== 'https:')
          return false;
        // Only cache from domains allowed by CSP connect-src
        const allowedHosts = [
          'fonts.googleapis.com',
          'fonts.gstatic.com',
          'accounts.google.com',
          'oauth2.googleapis.com',
          'googleusercontent.com',
          'posthog.com',
        ];
        return allowedHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
      },
      handler: new StaleWhileRevalidate({
        cacheName: 'external-cache',
        plugins: [
          {
            handlerDidError: async () => {
              return null;
            },
            fetchDidFail: async () => {
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

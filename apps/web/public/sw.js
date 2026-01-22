/// <reference lib="webworker" />

/**
 * Service Worker for Roundtable PWA
 *
 * Caching Strategies:
 * - Static assets (/_next/static/*): Cache-first, immutable (1 year)
 * - Navigation requests: Stale-while-revalidate (instant navigation)
 * - API requests: Network-only (always fresh)
 * - Images/fonts: Cache-first with network fallback
 *
 * This enables SPA-like navigation speed while keeping data fresh.
 */

// Cache version - update this on each deploy
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `roundtable-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `roundtable-runtime-${CACHE_VERSION}`;
const DOCUMENT_CACHE = `roundtable-docs-${CACHE_VERSION}`;

// Assets to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Install event - cache core assets
// NOTE: Do NOT call skipWaiting() here - let user control when to update
// This prevents unexpected page refreshes during active sessions
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS)),
    // No skipWaiting() - wait for user to trigger update via message
  );
});

// Activate event - clean up ALL old caches from previous builds
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE, RUNTIME_CACHE, DOCUMENT_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('roundtable-') && !currentCaches.includes(name))
          .map(name => caches.delete(name)),
      );
    }).then(() => self.clients.claim()), // Take control of all pages immediately
  );
});

/**
 * Determine if a request should use cache-first strategy
 * These assets are immutable and can be served from cache indefinitely
 */
function isImmutableAsset(url) {
  const path = url.pathname;
  return (
    // Vite/TanStack static bundles - includes content hash, immutable
    path.startsWith('/assets/')
    // Font files
    || path.match(/\.(woff2?)$/)
    // Static directory
    || path.startsWith('/static/')
  );
}

/**
 * Determine if a request is for a cacheable image/media
 */
function isCacheableMedia(url) {
  const path = url.pathname;
  return (
    path.startsWith('/icons/')
    || path.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|avif)$/)
  );
}

/**
 * Fetch handler with different strategies per request type
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET')
    return;

  // Skip cross-origin requests
  if (url.origin !== self.location.origin)
    return;

  // Skip API requests - always fetch fresh
  if (url.pathname.startsWith('/api/'))
    return;

  // Skip auth routes - security sensitive
  if (url.pathname.startsWith('/auth/'))
    return;

  // Strategy 1: IMMUTABLE ASSETS - Cache-first, never revalidate
  // These have content hashes in filenames, so they're immutable
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached)
          return cached;

        return fetch(request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        }).catch(() => {
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      }),
    );
    return;
  }

  // Strategy 2: MEDIA ASSETS - Cache-first with network fallback
  if (isCacheableMedia(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached)
          return cached;

        return fetch(request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        }).catch(() => {
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      }),
    );
    return;
  }

  // Strategy 3: NAVIGATION - Stale-while-revalidate for instant navigation
  // Serves cached HTML immediately while fetching fresh version in background
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(DOCUMENT_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          const fetchPromise = fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(async () => {
            // Network failed, return cached or fallback to root
            if (cached) return cached;
            const fallback = await cache.match('/');
            if (fallback) return fallback;
            // Last resort: return a basic offline response
            return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
          });

          // Return cached immediately if available, otherwise wait for network
          return cached || fetchPromise;
        });
      }),
    );
    return;
  }

  // Strategy 4: OTHER REQUESTS - Network-first with cache fallback
  // For data fetching, RSC payloads, etc.
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && request.url.includes('/assets/')) {
        const responseClone = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => {
          cache.put(request, responseClone);
        });
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      // Return 503 if no cache available
      return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }),
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data)
    return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/',
        dateOfArrival: Date.now(),
      },
      actions: data.actions || [],
      tag: data.tag || 'default',
      renotify: data.renotify || false,
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Roundtable', options),
    );
  } catch {
    // Handle non-JSON push data
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('Roundtable', { body: text }),
    );
  }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // Open new window if none exists
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      }),
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

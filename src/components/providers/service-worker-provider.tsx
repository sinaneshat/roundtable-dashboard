'use client';

import { useEffect } from 'react';

/**
 * Service Worker Registration Provider
 *
 * Registers the service worker for PWA caching of static assets.
 * This enables client-side caching of:
 * - Next.js static bundles (/_next/static/*)
 * - Framework chunks (React, etc.)
 * - Icons and images
 * - Navigation responses (for offline support)
 *
 * Cache Invalidation Strategy:
 * - SW is regenerated with new cache version on each build
 * - On SW update, old caches are automatically deleted
 * - New SW activates immediately (skipWaiting + clients.claim)
 * - Page reloads automatically to ensure fresh assets
 *
 * The service worker is only registered in production to avoid
 * caching stale assets during development.
 */
export function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Only register in production (not local dev)
    if (
      typeof window === 'undefined'
      || !('serviceWorker' in navigator)
      || process.env.NEXT_PUBLIC_WEBAPP_ENV === 'local'
    ) {
      return;
    }

    let intervalId: NodeJS.Timeout | null = null;
    let refreshing = false;

    const handleVisibilityChange = (registration: ServiceWorkerRegistration) => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => {});
      }
    };

    const handleControllerChange = () => {
      if (refreshing) {
        return;
      }
      refreshing = true;
      window.location.reload();
    };

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });

        // Check for updates on page visibility change (user returns to tab)
        const visibilityHandler = () => handleVisibilityChange(registration);
        document.addEventListener('visibilitychange', visibilityHandler);

        // Also check periodically (every 2 minutes)
        intervalId = setInterval(() => {
          registration.update().catch(() => {});
        }, 2 * 60 * 1000);

        // Handle updates - auto-reload to get new version
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) {
            return;
          }

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        // When new SW takes control, reload to get fresh assets
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      } catch {
        // SW registration failed - not critical, app works without it
      }
    };

    // Register after page load to not block initial render
    if (document.readyState === 'complete') {
      registerServiceWorker();
    } else {
      window.addEventListener('load', registerServiceWorker);
    }

    return () => {
      window.removeEventListener('load', registerServiceWorker);
      if (intervalId) {
        clearInterval(intervalId);
      }
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  return <>{children}</>;
}

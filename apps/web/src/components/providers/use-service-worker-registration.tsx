import { WebAppEnvs } from '@roundtable/shared/enums';
import { useCallback, useEffect, useState } from 'react';

import { getWebappEnv } from '@/lib/config/base-urls';

export type ServiceWorkerRegistrationState = {
  updateAvailable: boolean;
  waitingWorker: ServiceWorker | null;
  applyUpdate: () => void;
};

/**
 * Service Worker Registration Hook
 *
 * Registers the service worker for PWA caching of static assets.
 * Uses "prompt for update" pattern - notifies user when update is available
 * and lets them control when to apply it (prevents unexpected refreshes).
 *
 * Cache Invalidation Strategy:
 * - SW is regenerated with new cache version on each build
 * - On SW update, user is notified via updateAvailable state
 * - User triggers applyUpdate() to reload with new SW
 * - Old caches are automatically deleted on SW activate
 *
 * The service worker is only registered in production to avoid
 * caching stale assets during development.
 */
export function useServiceWorkerRegistration(): ServiceWorkerRegistrationState {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  const applyUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [waitingWorker]);

  useEffect(() => {
    // Only register in production (not local dev)
    // Uses hostname-based detection to avoid build-time env var issues
    if (
      typeof window === 'undefined'
      || !('serviceWorker' in navigator)
      || getWebappEnv() === WebAppEnvs.LOCAL
    ) {
      return undefined;
    }

    let refreshing = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let visibilityHandler: (() => void) | null = null;
    let registrationRef: ServiceWorkerRegistration | null = null;
    let updateFoundHandler: (() => void) | null = null;

    const handleControllerChange = () => {
      if (refreshing)
        return;
      refreshing = true;
      window.location.reload();
    };

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });

        registrationRef = registration;

        // Check if there's already a waiting worker (page reload during update)
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setUpdateAvailable(true);
        }

        // Handle new update found
        // Note: statechange listener on newWorker cannot be cleaned up
        // because the ServiceWorker object is created by the browser
        // and we lose reference to it after this callback completes
        const handleUpdateFound = () => {
          const newWorker = registration.installing;
          if (!newWorker)
            return;

          const handleStateChange = () => {
            // Worker is installed and waiting - notify user
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setUpdateAvailable(true);
              // DO NOT send SKIP_WAITING automatically - let user control update
            }
          };

          // eslint-disable-next-line react-web-api/no-leaked-event-listener
          newWorker.addEventListener('statechange', handleStateChange);
        };
        updateFoundHandler = handleUpdateFound;
        // eslint-disable-next-line react-web-api/no-leaked-event-listener
        registration.addEventListener('updatefound', handleUpdateFound);

        // Check for updates on visibility change (user returns to tab)
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {});
          }
        };
        visibilityHandler = handleVisibilityChange;
        // Cleanup is handled in useEffect return function
        // eslint-disable-next-line react-web-api/no-leaked-event-listener
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Check for updates periodically (every 10 minutes instead of 2)
        // Less aggressive to reduce unnecessary network requests
        intervalId = setInterval(() => {
          registration.update().catch(() => {});
        }, 10 * 60 * 1000);

        // Warm up cache for common routes when browser is idle
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => {
            navigator.serviceWorker.controller?.postMessage({
              type: 'WARM_CACHE',
              routes: ['/auth/sign-in', '/chat/pricing', '/legal/terms', '/legal/privacy'],
            });
          }, { timeout: 5000 });
        }

        // When new SW takes control (after user triggers update), reload
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      } catch {
        // SW registration failed - not critical, app works without it
      }
    };

    // Register after page load to not block initial render
    const onLoad = () => {
      void registerServiceWorker();
    };

    if (document.readyState === 'complete') {
      void registerServiceWorker();
    } else {
      window.addEventListener('load', onLoad);
    }

    return () => {
      window.removeEventListener('load', onLoad);
      if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (registrationRef && updateFoundHandler) {
        registrationRef.removeEventListener('updatefound', updateFoundHandler);
      }
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [waitingWorker]);

  return { updateAvailable, applyUpdate, waitingWorker };
}

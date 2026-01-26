import { SwContext } from './use-service-worker';
import { useServiceWorkerRegistration } from './use-service-worker-registration';

/**
 * Service Worker Registration Provider
 *
 * Registers the service worker for PWA caching of static assets.
 * Uses "prompt for update" pattern - notifies user when update is available
 * and lets them control when to apply it (prevents unexpected refreshes).
 */
export function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  const { applyUpdate, updateAvailable } = useServiceWorkerRegistration();

  return (
    <SwContext value={{ applyUpdate, updateAvailable }}>
      {children}
    </SwContext>
  );
}

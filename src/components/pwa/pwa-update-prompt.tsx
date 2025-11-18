'use client';

import { RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * PWA Update Prompt - Detects and prompts users to update when new version available
 * Works in both development and production environments
 * Monitors service worker updates and cache changes
 */
export function PWAUpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Skip in development (no service worker in dev mode)
    if (process.env.NODE_ENV === 'development') {
      return;
    }

    // Track service workers for cleanup
    let currentReg: ServiceWorkerRegistration | null = null;
    let installingWorker: ServiceWorker | null = null;

    const checkForUpdates = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();

        for (const reg of registrations) {
          // Check if there's a waiting service worker
          if (reg.waiting) {
            setUpdateAvailable(true);
            setRegistration(reg);
            return;
          }

          // Check for updates
          await reg.update();
        }
      } catch (error) {
        console.error('[PWA] Error checking for updates:', error);
      }
    };

    // Listen for service worker updates
    const handleControllerChange = () => {
      setUpdateAvailable(true);
    };

    const handleStateChange = () => {
      if (installingWorker && installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
      }
    };

    const handleUpdateFound = () => {
      const reg = currentReg;
      if (reg?.installing) {
        setRegistration(reg);
        installingWorker = reg.installing;
        installingWorker.addEventListener('statechange', handleStateChange);
      }
    };

    // Check for updates on mount
    checkForUpdates();

    // Check for updates every 60 seconds
    const interval = setInterval(checkForUpdates, 60000);

    // Listen for controller changes
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Listen for update found events
    const setupUpdateListener = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        currentReg = reg;
        // eslint-disable-next-line react-web-api/no-leaked-event-listener -- cleaned up in useEffect return
        reg.addEventListener('updatefound', handleUpdateFound);
      } catch (error) {
        console.error('[PWA] Error setting up update listener:', error);
      }
    };

    setupUpdateListener();

    return () => {
      clearInterval(interval);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      if (currentReg) {
        currentReg.removeEventListener('updatefound', handleUpdateFound);
      }
      if (installingWorker) {
        installingWorker.removeEventListener('statechange', handleStateChange);
      }
    };
  }, []);

  const handleUpdate = async () => {
    if (!registration?.waiting) {
      // Force reload if no waiting worker
      window.location.reload();
      return;
    }

    // Handler for service worker state change
    const waitingWorker = registration.waiting;
    const handleActivation = () => {
      if (waitingWorker.state === 'activated') {
        window.location.reload();
      }
    };

    // Tell the waiting service worker to skip waiting
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });

    // When the waiting service worker becomes active, reload
    waitingWorker.addEventListener('statechange', handleActivation);
  };

  const handleDismiss = () => {
    setDismissed(true);
    setUpdateAvailable(false);
  };

  if (!updateAvailable || dismissed) {
    return null;
  }

  return (
    <>
      <style jsx>
        {`
          @keyframes slideInUpdate {
            from {
              transform: translateY(-100%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
        `}
      </style>
      <div
        style={{
          position: 'fixed',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(59, 130, 246, 0.95)',
          color: 'white',
          padding: '12px 16px',
          fontSize: '14px',
          borderRadius: '8px',
          zIndex: 999999,
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 8px 16px rgba(0, 0, 0, 0.15)',
          animation: 'slideInUpdate 0.4s ease-out',
          maxWidth: '90vw',
        }}
      >
        <RefreshCw size={20} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>New version available</span>
        <button
          type="button"
          onClick={handleUpdate}
          style={{
            background: 'white',
            color: '#3b82f6',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f0f9ff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white';
          }}
        >
          Update now
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            opacity: 0.8,
            flexShrink: 0,
          }}
          aria-label="Dismiss update notification"
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.8';
          }}
        >
          <X size={18} />
        </button>
      </div>
    </>
  );
}

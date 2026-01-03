'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
};

type UsePwaReturn = {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  isServiceWorkerReady: boolean;
  installApp: () => Promise<boolean>;
};

declare global {
  // eslint-disable-next-line ts/consistent-type-definitions -- interface required for global augmentation
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

function getInitialPlatformState() {
  if (typeof window === 'undefined') {
    return { isIOS: false, isStandalone: false };
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
  const isStandalone
    = window.matchMedia('(display-mode: standalone)').matches
      || ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true);

  return { isIOS, isStandalone };
}

export function usePwa(): UsePwaReturn {
  const initialState = useMemo(() => getInitialPlatformState(), []);

  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(initialState.isStandalone);
  const [isIOS] = useState(initialState.isIOS);
  const [isStandalone] = useState(initialState.isStandalone);
  const [isServiceWorkerReady, setIsServiceWorkerReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | undefined;

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((registration) => {
          setIsServiceWorkerReady(true);

          // Check for updates periodically
          registration.update();
          intervalId = setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000); // Check hourly
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      deferredPrompt = e;
      setIsInstallable(true);
    };

    // Listen for successful install
    const handleAppInstalled = () => {
      deferredPrompt = null;
      setIsInstallable(false);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        deferredPrompt = null;
        setIsInstallable(false);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  return {
    isInstallable,
    isInstalled,
    isIOS,
    isStandalone,
    isServiceWorkerReady,
    installApp,
  };
}

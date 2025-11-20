'use client';

import { RefreshCw, X } from 'lucide-react';
import type { AbstractIntlMessages } from 'next-intl';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';
import { glassCardStyles, glassVariants } from '@/lib/ui/glassmorphism';

/**
 * PWA Update Prompt - Detects and prompts users to update when new version available
 *
 * Features:
 * - Glass-morphism design matching established design system
 * - Pill-shaped buttons following shadcn/ui patterns
 * - Service worker update detection
 * - Slide-in animation with proper Tailwind classes
 */
type PWAUpdatePromptProps = {
  messages: AbstractIntlMessages;
  locale: string;
  timeZone: string;
  now?: Date;
};

function PWAUpdatePromptContent({
  updateAvailable,
  registration,
  onDismiss,
}: {
  updateAvailable: boolean;
  registration: ServiceWorkerRegistration | null;
  onDismiss: () => void;
}) {
  const t = useTranslations();

  const handleUpdate = async () => {
    if (!registration?.waiting) {
      window.location.reload();
      return;
    }

    const waitingWorker = registration.waiting;
    const handleActivation = () => {
      if (waitingWorker.state === 'activated') {
        window.location.reload();
      }
    };

    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    waitingWorker.addEventListener('statechange', handleActivation);
  };

  if (!updateAvailable) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        glassVariants.medium,
        'border',
        'fixed bottom-6 right-6 z-[100]',
        'flex items-center gap-3',
        'px-4 py-3',
        'max-w-[400px] min-w-[320px]',
        'rounded-2xl',
        'animate-in slide-in-from-right-full fade-in duration-300',
      )}
      style={glassCardStyles.medium}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
        <RefreshCw className="size-4 text-primary" />
      </div>

      <span className="flex-1 text-sm font-medium text-foreground">
        {t('newVersionAvailable')}
      </span>

      <Button
        size="sm"
        onClick={handleUpdate}
        className="shrink-0"
      >
        {t('updateNow')}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onDismiss}
        aria-label={t('dismiss')}
        className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

export function PWAUpdatePrompt({ messages, locale, timeZone, now }: PWAUpdatePromptProps) {
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

  const handleDismiss = () => {
    setDismissed(true);
    setUpdateAvailable(false);
  };

  if (dismissed) {
    return null;
  }

  return (
    <NextIntlClientProvider
      messages={messages}
      locale={locale}
      timeZone={timeZone}
      now={now}
    >
      <PWAUpdatePromptContent
        updateAvailable={updateAvailable}
        registration={registration}
        onDismiss={handleDismiss}
      />
    </NextIntlClientProvider>
  );
}

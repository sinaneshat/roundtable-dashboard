'use client';

import { Download, X } from 'lucide-react';
import type { AbstractIntlMessages } from 'next-intl';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { startTransition, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/ui/cn';

/**
 * PWA Update Prompt - Notifies users when a new version is available
 *
 * Uses shadcn Card component with glass variant for consistency
 * with the rest of the design system.
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
  const t = useTranslations('pwa');

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
    <Card
      variant="glass"
      className={cn(
        'fixed bottom-4 right-4 z-[100]',
        'w-[360px] max-w-[calc(100vw-2rem)]',
        'shadow-lg',
        'animate-in slide-in-from-bottom-4 fade-in duration-300',
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Download className="size-5 text-primary" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {t('newVersionAvailable')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('updateDescription')}
            </p>
          </div>

          {/* Dismiss button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            aria-label={t('dismiss')}
            className="size-8 shrink-0 -mt-1 -mr-1"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="flex-1"
          >
            {t('later')}
          </Button>
          <Button
            size="sm"
            onClick={handleUpdate}
            className="flex-1"
            startIcon={<Download className="size-3.5" />}
          >
            {t('updateNow')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PWAUpdatePrompt({ messages, locale, timeZone, now }: PWAUpdatePromptProps) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Debug mode: add ?pwa-debug=1 to URL to preview the update prompt in development
  const isDebugMode = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('pwa-debug') === '1';

  useEffect(() => {
    // In debug mode, show the prompt immediately for testing/preview
    // ✅ REACT 19: startTransition for non-urgent state update
    if (isDebugMode) {
      startTransition(() => setUpdateAvailable(true));
      return;
    }

    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      return;
    }

    let currentReg: ServiceWorkerRegistration | null = null;
    let installingWorker: ServiceWorker | null = null;

    const checkForUpdates = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();

        for (const reg of registrations) {
          if (reg.waiting) {
            setUpdateAvailable(true);
            setRegistration(reg);
            return;
          }

          await reg.update();
        }
      } catch (error) {
        console.error('[PWA] Error checking for updates:', error);
      }
    };

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

    checkForUpdates();

    const interval = setInterval(checkForUpdates, 60000);

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

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
  }, [isDebugMode]);

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

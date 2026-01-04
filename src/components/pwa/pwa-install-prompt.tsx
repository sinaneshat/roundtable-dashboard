'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { BRAND } from '@/constants/brand';
import { usePwa } from '@/hooks/use-pwa';

const DISMISSED_KEY = 'pwa-prompt-dismissed';
const DISMISS_DURATION_DAYS = 7;
const AUTO_DISMISS_SECONDS = 15;

export function PwaInstallPrompt() {
  const t = useTranslations('pwa');
  const { isInstallable, isInstalled, isIOS, isStandalone, installApp } = usePwa();
  const [isOpen, setIsOpen] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_DISMISS_SECONDS);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, new Date().toISOString());
    setShowBanner(false);
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (isStandalone || isInstalled)
      return;

    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed) {
      const dismissedAt = new Date(dismissed);
      const now = new Date();
      const daysSinceDismissed = (now.getTime() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < DISMISS_DURATION_DAYS)
        return;
    }

    const timer = setTimeout(() => {
      if (isIOS || isInstallable) {
        setShowBanner(true);
        setCountdown(AUTO_DISMISS_SECONDS);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [isIOS, isInstallable, isInstalled, isStandalone]);

  useEffect(() => {
    if (!showBanner || isOpen)
      return;

    if (countdown <= 0) {
      handleDismiss();
      return;
    }

    const timer = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [showBanner, countdown, isOpen, handleDismiss]);

  const handleInstall = async () => {
    if (isIOS) {
      setIsOpen(true);
    } else {
      const installed = await installApp();
      if (installed) {
        setShowBanner(false);
      }
    }
  };

  if (isStandalone || isInstalled || !showBanner)
    return null;

  return (
    <>
      {/* Install Banner - Bottom Right, Compact */}
      <div className="fixed bottom-4 right-4 z-40 animate-in slide-in-from-bottom-2 duration-300">
        <div className="w-64 rounded-xl border bg-card/95 backdrop-blur-md p-3 shadow-lg">
          <div className="flex items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icons.download className="size-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-xs">{t('installTitle', { app: BRAND.name })}</h3>
            </div>
            <button
              onClick={handleDismiss}
              className="shrink-0 p-0.5 rounded-full hover:bg-white/10 transition-colors"
              aria-label={t('dismiss')}
            >
              <Icons.x className="size-3.5 text-muted-foreground" />
            </button>
          </div>
          <div className="flex gap-1.5 mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="flex-1 h-7 text-xs"
            >
              {t('notNow')}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleInstall}
              className="flex-1 h-7 text-xs"
            >
              {t('install')}
            </Button>
          </div>
          {/* Countdown indicator */}
          <div className="mt-2 flex items-center justify-center gap-1">
            <div className="h-0.5 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary/50 transition-all duration-1000 ease-linear"
                style={{ width: `${(countdown / AUTO_DISMISS_SECONDS) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {countdown}
              s
            </span>
          </div>
        </div>
      </div>

      {/* iOS Instructions Drawer */}
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerContent glass>
          <DrawerHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Icons.download className="size-6 text-primary" />
            </div>
            <DrawerTitle>{t('iosInstallTitle', { app: BRAND.name })}</DrawerTitle>
            <DrawerDescription>{t('iosInstallDescription')}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 py-2 space-y-4">
            {/* Step 1 */}
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-medium">
                1
              </div>
              <div className="flex-1 pt-1">
                <p className="text-sm">
                  {t('iosStep1')}
                  <span className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded bg-white/10">
                    <Icons.share className="size-3.5" />
                  </span>
                  {t('iosStep1Suffix')}
                </p>
              </div>
            </div>
            {/* Step 2 */}
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-medium">
                2
              </div>
              <div className="flex-1 pt-1">
                <p className="text-sm">
                  {t('iosStep2')}
                  <span className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded bg-white/10">
                    <Icons.plus className="size-3.5" />
                  </span>
                  {t('iosStep2Suffix')}
                </p>
              </div>
            </div>
            {/* Step 3 */}
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-medium">
                3
              </div>
              <div className="flex-1 pt-1">
                <p className="text-sm">{t('iosStep3')}</p>
              </div>
            </div>
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline" onClick={handleDismiss}>
                {t('gotIt')}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

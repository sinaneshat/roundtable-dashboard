'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

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

export function PwaInstallPrompt() {
  const t = useTranslations('pwa');
  const { isInstallable, isInstalled, isIOS, isStandalone, installApp } = usePwa();
  const [isOpen, setIsOpen] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

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

    // Show prompt after 5 seconds for better UX
    const timer = setTimeout(() => {
      if (isIOS || isInstallable) {
        setShowBanner(true);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [isIOS, isInstallable, isInstalled, isStandalone]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, new Date().toISOString());
    setShowBanner(false);
    setIsOpen(false);
  };

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
      {/* Install Banner */}
      <div className="fixed bottom-0 inset-x-0 z-40 p-4 pb-safe animate-in slide-in-from-bottom duration-300">
        <div className="mx-auto max-w-lg rounded-2xl border bg-card/95 backdrop-blur-md p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Icons.download className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm">{t('installTitle', { app: BRAND.name })}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{t('installDescription')}</p>
            </div>
            <button
              onClick={handleDismiss}
              className="shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors"
              aria-label={t('dismiss')}
            >
              <Icons.x className="size-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="flex-1"
            >
              {t('notNow')}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleInstall}
              className="flex-1"
            >
              {t('install')}
            </Button>
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

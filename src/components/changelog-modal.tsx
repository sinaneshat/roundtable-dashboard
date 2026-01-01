'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { APP_VERSION } from '@/constants/version';

const VERSION_STORAGE_KEY = 'app-version';

function checkVersionUpdate(): { shouldShow: boolean; version: string } {
  if (typeof window === 'undefined')
    return { shouldShow: false, version: '' };

  const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY);
  const currentVersion = APP_VERSION;

  // First visit - store version silently
  if (!storedVersion) {
    localStorage.setItem(VERSION_STORAGE_KEY, currentVersion);
    return { shouldShow: false, version: currentVersion };
  }

  // Version changed - show modal
  if (storedVersion !== currentVersion) {
    return { shouldShow: true, version: currentVersion };
  }

  return { shouldShow: false, version: currentVersion };
}

export function VersionUpdateModal() {
  const t = useTranslations('version');
  const [state] = useState(() => checkVersionUpdate());
  const [open, setOpen] = useState(state.shouldShow);

  const handleUpdate = async () => {
    // Store current version
    localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION);

    // Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();

      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }

    // Reload page
    window.location.reload();
  };

  if (!open)
    return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent glass={true} className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-blue-400" />
            {t('newVersionAvailable')}
          </DialogTitle>
          <DialogDescription>
            {t('versionLabel')}
            {' '}
            {state.version}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 bg-black/50 backdrop-blur-lg p-6">
          <p className="text-sm text-muted-foreground">
            {t('updateDescription')}
          </p>
        </div>

        <DialogFooter>
          <Button onClick={handleUpdate} className="w-full">
            {t('updateNow')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

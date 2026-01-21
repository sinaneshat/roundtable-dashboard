import { useState } from 'react';

import { Icons } from '@/components/icons';
import { useServiceWorker } from '@/components/providers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { APP_VERSION } from '@/constants';
import { useTranslations } from '@/lib/i18n';
import { createStorageHelper } from '@/lib/utils/safe-storage';

const versionStorage = createStorageHelper<string>('app-version', 'local');

function checkVersionUpdate(): { shouldShow: boolean; version: string } {
  const storedVersion = versionStorage.get();
  const currentVersion = APP_VERSION;

  // First visit - store version silently
  if (!storedVersion) {
    versionStorage.set(currentVersion);
    return { shouldShow: false, version: currentVersion };
  }

  // Version changed - show modal
  if (storedVersion !== currentVersion) {
    return { shouldShow: true, version: currentVersion };
  }

  return { shouldShow: false, version: currentVersion };
}

export function VersionUpdateModal() {
  const t = useTranslations();
  const { updateAvailable, applyUpdate } = useServiceWorker();
  const [state] = useState(() => checkVersionUpdate());
  const [open, setOpen] = useState(state.shouldShow || updateAvailable);

  const handleUpdate = async () => {
    // Store current version
    versionStorage.set(APP_VERSION);

    // If SW update is available, apply it (will trigger reload via controllerchange)
    if (updateAvailable) {
      applyUpdate();
      return;
    }

    // Otherwise clear caches manually and reload
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }

    window.location.reload();
  };

  // Show if either app version changed OR SW update available
  if (!open && !updateAvailable)
    return null;

  return (
    <Dialog open={open || updateAvailable} onOpenChange={setOpen}>
      <DialogContent glass={true} className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.sparkles className="size-5 text-blue-400" />
            {t('version.newVersionAvailable')}
          </DialogTitle>
          <DialogDescription>
            {t('version.versionLabel')}
            {' '}
            {state.version}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 bg-black/50 backdrop-blur-lg p-6">
          <p className="text-sm text-muted-foreground">
            {t('version.updateDescription')}
          </p>
        </div>

        <DialogFooter>
          <Button onClick={handleUpdate} className="w-full">
            {t('version.updateNow')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

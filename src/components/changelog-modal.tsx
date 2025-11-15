'use client';

import { Sparkles } from 'lucide-react';
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
import { APP_VERSION } from '@/lib/version';

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
  // Lazy state initialization to avoid setState in effect
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
            New Version Available
          </DialogTitle>
          <DialogDescription>
            Version
            {' '}
            {state.version}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 bg-black/50 backdrop-blur-lg p-6">
          <p className="text-sm text-muted-foreground">
            A new version is available. Click update to refresh and get the latest improvements.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={handleUpdate} className="w-full">
            Update Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

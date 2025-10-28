'use client';

import { CheckCircle2, Sparkles, Wrench, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChangelogEntry } from '@/lib/version';
import { APP_VERSION, getLatestChangelog } from '@/lib/version';

const VERSION_STORAGE_KEY = 'app-version';

function getChangeIcon(type: 'feature' | 'fix' | 'improvement' | 'breaking') {
  switch (type) {
    case 'feature':
      return <Sparkles className="size-4 text-blue-400" />;
    case 'fix':
      return <Wrench className="size-4 text-green-400" />;
    case 'improvement':
      return <Zap className="size-4 text-yellow-400" />;
    case 'breaking':
      return <CheckCircle2 className="size-4 text-red-400" />;
  }
}

function getChangeTypeLabel(type: 'feature' | 'fix' | 'improvement' | 'breaking') {
  switch (type) {
    case 'feature':
      return 'New';
    case 'fix':
      return 'Fixed';
    case 'improvement':
      return 'Improved';
    case 'breaking':
      return 'Breaking';
  }
}

export function ChangelogModal() {
  const [open, setOpen] = useState(false);
  const [changelog, setChangelog] = useState<ChangelogEntry | null>(null);

  useEffect(() => {
    const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY);
    const currentVersion = APP_VERSION;

    // Show modal if version changed or first visit
    if (!storedVersion || storedVersion !== currentVersion) {
      const latestChangelog = getLatestChangelog();
      if (latestChangelog) {
        setChangelog(latestChangelog);
        setOpen(true);
      }
    }
  }, []);

  const handleClose = async () => {
    // Store current version
    localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION);

    // Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();

      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }

    // Reload page to apply changes
    window.location.reload();
  };

  if (!changelog) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-blue-400" />
            New Update Available
          </DialogTitle>
          <DialogDescription>
            Version
            {' '}
            {changelog.version}
            {' '}
            •
            {' '}
            {changelog.date}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We&apos;ve updated the app with new features and improvements. Your cache will be
              cleared to ensure everything works smoothly.
            </p>

            <div className="space-y-3">
              {changelog.changes.map((change, idx) => (
                <div key={idx} className="flex gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mt-0.5">{getChangeIcon(change.type)}</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400">
                        {getChangeTypeLabel(change.type)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300">{change.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button onClick={handleClose} className="w-full sm:w-auto">
            Update & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

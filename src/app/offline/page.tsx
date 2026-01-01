'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';

const OFFLINE_TIPS = ['wifi', 'airplane', 'router', 'cached'] as const;

export default function OfflinePage() {
  const t = useTranslations();

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-white">
      <div className="mx-auto flex max-w-md flex-col items-center space-y-8 text-center">
        <div className="rounded-full bg-slate-800/50 p-8">
          <Icons.wifiOff className="size-16 text-slate-400" />
        </div>

        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">
            {t('pages.offline.title')}
          </h1>
          <p className="text-lg text-slate-400">
            {t('pages.offline.description')}
          </p>
        </div>

        <div className="w-full rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-400">
            {t('pages.offline.statusMessage')}
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <Button
            onClick={handleReload}
            variant="default"
            className="flex-1"
            size="lg"
          >
            {t('pages.offline.tryAgain')}
          </Button>
          <Button asChild variant="outline" className="flex-1" size="lg">
            <Link href="/" prefetch={false}>
              {t('pages.offline.goHome')}
            </Link>
          </Button>
        </div>

        <div className="space-y-2 text-left text-sm text-slate-500">
          <p className="font-semibold text-slate-400">
            {t('pages.offline.troubleshootingTitle')}
          </p>
          <ul className="list-inside list-disc space-y-1">
            {OFFLINE_TIPS.map(tip => (
              <li key={tip}>{t(`pages.offline.tips.${tip}`)}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

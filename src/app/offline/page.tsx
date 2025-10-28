import { WifiOff } from 'lucide-react';
import type { Metadata } from 'next';

import { Button } from '@/components/ui/button';
import { BRAND } from '@/constants/brand';

export const metadata: Metadata = {
  title: `Offline - ${BRAND.fullName}`,
  description: 'You are currently offline. Please check your internet connection.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function OfflinePage() {
  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-white">
      <div className="mx-auto flex max-w-md flex-col items-center space-y-8 text-center">
        {/* Offline Icon */}
        <div className="rounded-full bg-slate-800/50 p-8">
          <WifiOff className="size-16 text-slate-400" />
        </div>

        {/* Heading */}
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">You&apos;re Offline</h1>
          <p className="text-lg text-slate-400">
            It looks like you&apos;ve lost your internet connection. Please check your
            network and try again.
          </p>
        </div>

        {/* Status Message */}
        <div className="w-full rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-400">
            Some features may not work properly while you&apos;re offline. Don&apos;t
            worry — your data is safe and will sync when you reconnect.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <Button
            onClick={handleReload}
            variant="default"
            className="flex-1"
            size="lg"
          >
            Try Again
          </Button>
          <Button
            onClick={handleGoHome}
            variant="outline"
            className="flex-1"
            size="lg"
          >
            Go Home
          </Button>
        </div>

        {/* Tips */}
        <div className="space-y-2 text-left text-sm text-slate-500">
          <p className="font-semibold text-slate-400">Troubleshooting tips:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Check if your Wi-Fi or mobile data is turned on</li>
            <li>Try turning airplane mode off</li>
            <li>Restart your router if on Wi-Fi</li>
            <li>Some cached content may still be available</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

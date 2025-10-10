'use client';

import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

type ErrorScreenProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorScreen({ error: _error, reset }: ErrorScreenProps) {
  const t = useTranslations();

  // Error logging is handled by Next.js error boundary automatically
  // No need for useEffect here

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="w-full max-w-lg px-4">
        <Card className="relative rounded-xl border bg-card/50 shadow-lg backdrop-blur-xl">
          <CardHeader>
            <h1 className="text-2xl font-semibold">{t('states.error.default')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('states.error.unexpectedError')}
            </p>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button
              onClick={() => reset()}
              variant="outline"
              className="flex items-center"
            >
              <RefreshCw className="me-2 size-4" />
              {t('states.error.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

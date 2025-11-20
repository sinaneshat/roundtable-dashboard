'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import messages from '@/i18n/locales/en/common.json';

type ErrorScreenProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

function ErrorScreenContent({ reset }: { reset: () => void }) {
  const t = useTranslations();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background px-4 py-12">
      <Empty className="max-w-lg border-none">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangle className="text-destructive" />
          </EmptyMedia>
          <EmptyTitle className="text-2xl font-semibold">
            {t('states.error.default')}
          </EmptyTitle>
          <EmptyDescription className="text-base">
            {t('states.error.unexpectedError')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => reset()} variant="outline" size="lg">
            <RefreshCw className="me-2 size-4" />
            {t('states.error.tryAgain')}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}

export default function ErrorScreen({ error: _error, reset }: ErrorScreenProps) {
  return (
    <NextIntlClientProvider messages={messages} locale="en" timeZone="UTC">
      <ErrorScreenContent reset={reset} />
    </NextIntlClientProvider>
  );
}

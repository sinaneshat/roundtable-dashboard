import { Icons } from '@/components/icons';
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
import { getWebappEnv, WEBAPP_ENVS } from '@/lib/config/base-urls';
import { I18nProvider, useTranslations } from '@/lib/i18n';

type ErrorDetails = {
  message?: string;
  stack?: string;
  digest?: string;
};

type ErrorScreenProps = {
  reset: () => void;
  error?: ErrorDetails;
};

function ErrorScreenContent({ reset, error }: ErrorScreenProps) {
  const t = useTranslations();
  const showDetails = error && getWebappEnv() !== WEBAPP_ENVS.PROD;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background px-4 py-12">
      <Empty className="max-w-lg border-none">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icons.alertTriangle className="text-destructive" />
          </EmptyMedia>
          <EmptyTitle className="text-2xl font-semibold">
            {t('states.error.default')}
          </EmptyTitle>
          <EmptyDescription className="text-base">
            {t('states.error.unexpectedError')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="w-full space-y-4">
          {showDetails && (
            <details className="w-full rounded-lg bg-destructive/10 p-3 text-left" open>
              <summary className="cursor-pointer text-sm font-medium text-destructive">
                {t('states.error.detailsTitle')}
              </summary>
              <div className="mt-2 space-y-2">
                {error.digest && (
                  <div className="text-xs">
                    <strong>{t('states.error.digest')}</strong>
                    <code className="ml-2 rounded bg-black/10 px-1.5 py-0.5">
                      {error.digest}
                    </code>
                  </div>
                )}
                {error.message && (
                  <div className="text-xs">
                    <strong>{t('states.error.errorLabel')}</strong>
                    <pre className="mt-1 overflow-auto rounded bg-black/10 p-2 text-xs max-h-32">
                      {error.message}
                    </pre>
                  </div>
                )}
                {error.stack && (
                  <div className="text-xs">
                    <strong>{t('states.error.stackTrace')}</strong>
                    <pre className="mt-1 overflow-auto rounded bg-black/10 p-2 text-xs max-h-48">
                      {error.stack}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          )}
          <Button
            onClick={reset}
            variant="outline"
            size="lg"
            startIcon={<Icons.refreshCw />}
          >
            {t('states.error.tryAgain')}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}

export default function ErrorScreen({ reset, error }: ErrorScreenProps) {
  return (
    <I18nProvider messages={messages} locale="en" timeZone="UTC">
      <ErrorScreenContent reset={reset} error={error} />
    </I18nProvider>
  );
}

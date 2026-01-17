import type { BillingErrorType } from '@roundtable/shared';
import { BillingErrorTypes } from '@roundtable/shared';

import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ScaleIn, StaggerContainer, StaggerItem } from '@/components/ui/motion';
import { Link, useTranslations } from '@/lib/compat';
import { cn } from '@/lib/ui/cn';

// Glass button styles for billing pages (consistent with chat toolbar)
const glassButtonPrimary = 'h-11 rounded-xl bg-white text-black font-medium hover:bg-white/90 transition-colors';
const glassButtonSecondary = 'h-11 rounded-xl border-white/20 bg-white/10 text-foreground hover:bg-white/15 hover:border-white/30 transition-colors';

type FailureData = {
  error?: string;
  errorCode?: string;
  errorType?: BillingErrorType;
  stripeError?: string;
  timestamp?: string;
};

type BillingFailureClientProps = {
  failureData?: FailureData;
};

export function BillingFailureClient({ failureData }: BillingFailureClientProps) {
  const t = useTranslations();

  const getErrorDetails = () => {
    switch (failureData?.errorType) {
      case BillingErrorTypes.PAYMENT_FAILED:
        return {
          title: t('billing.failure.paymentFailed'),
          description: t('billing.failure.paymentFailedDescription'),
        };
      case BillingErrorTypes.SYNC_FAILED:
        return {
          title: t('billing.failure.syncFailed'),
          description: t('billing.failure.syncFailedDescription'),
        };
      case BillingErrorTypes.AUTHENTICATION_FAILED:
        return {
          title: t('billing.failure.authFailed'),
          description: t('billing.failure.authFailedDescription'),
        };
      default:
        return {
          title: t('billing.failure.unknownError'),
          description: t('billing.failure.unknownErrorDescription'),
        };
    }
  };

  const errorDetails = getErrorDetails();

  return (
    <div className="flex flex-1 w-full flex-col items-center justify-center px-4 py-8">
      <StaggerContainer
        className="flex w-full max-w-2xl flex-col items-center gap-6 text-center mx-auto"
        staggerDelay={0.15}
        delayChildren={0.1}
      >
        <StaggerItem>
          <ScaleIn duration={0.3} delay={0}>
            <div className="flex size-20 items-center justify-center rounded-full bg-destructive/10 ring-4 ring-destructive/20 md:size-24">
              <Icons.xCircle className="size-10 text-destructive md:size-12" strokeWidth={2} />
            </div>
          </ScaleIn>
        </StaggerItem>

        <StaggerItem className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {t('billing.failure.title')}
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            {t('billing.failure.description')}
          </p>
        </StaggerItem>

        {failureData && (
          <StaggerItem className="w-full">
            <Alert variant="destructive">
              <Icons.alertCircle className="size-4" />
              <AlertTitle>{errorDetails.title}</AlertTitle>
              <AlertDescription>
                <div className="space-y-2">
                  <p>{errorDetails.description}</p>
                  {failureData.stripeError && (
                    <p className="text-xs">
                      {t('billing.failure.technicalDetails')}
                      {': '}
                      {failureData.stripeError}
                    </p>
                  )}
                  {failureData.errorCode && (
                    <p className="text-xs">
                      {t('billing.failure.errorCode')}
                      {': '}
                      {failureData.errorCode}
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          </StaggerItem>
        )}

        <StaggerItem className="w-full text-left">
          <div className="rounded-lg border bg-card p-4 text-sm">
            <h3 className="mb-2 font-semibold">{t('billing.failure.commonReasons.title')}</h3>
            <ul className="space-y-1 text-muted-foreground">
              <li>
                •
                {t('billing.failure.commonReasons.insufficientFunds')}
              </li>
              <li>
                •
                {t('billing.failure.commonReasons.cardDeclined')}
              </li>
              <li>
                •
                {t('billing.failure.commonReasons.incorrectDetails')}
              </li>
              <li>
                •
                {t('billing.failure.commonReasons.bankRejection')}
              </li>
            </ul>
          </div>
        </StaggerItem>

        <StaggerItem className="w-full">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <Icons.mail className="mt-0.5 size-5 text-muted-foreground" />
              <div className="text-left text-sm">
                <h3 className="mb-1 font-semibold">{t('billing.failure.support.title')}</h3>
                <p className="mb-2 text-muted-foreground">
                  {t('billing.failure.support.description')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('billing.failure.support.includeInfo')}
                </p>
              </div>
            </div>
          </div>
        </StaggerItem>

        <StaggerItem className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button
            asChild
            size="lg"
            className={cn('w-full sm:w-auto sm:min-w-[200px]', glassButtonPrimary)}
          >
            <Link href="/chat/pricing">
              {t('billing.failure.tryAgain')}
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            size="lg"
            className={cn('w-full sm:w-auto sm:min-w-[200px]', glassButtonSecondary)}
          >
            <Link href="/chat">
              {t('billing.failure.returnHome')}
            </Link>
          </Button>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}

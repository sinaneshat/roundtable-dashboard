'use client';

import { AlertCircle, Mail, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ScaleIn, StaggerContainer, StaggerItem } from '@/components/ui/motion';

/**
 * Billing Failure Client Component
 *
 * Displays payment failure information with error details and support guidance.
 * Follows the same design patterns as BillingSuccessClient for consistency.
 *
 * ✅ NO useEffect - all data is server-hydrated via HydrationBoundary
 * ✅ No client-side query invalidation - queries are prefetched on server
 *
 * Key Features:
 * - Shows failure animation with clear error messaging
 * - Displays specific error details when available
 * - Provides support contact information
 * - Offers retry action via pricing page with fresh hydrated data
 *
 * @param failureData - Payment failure details from server action
 */
type BillingFailureClientProps = {
  failureData?: {
    error?: string;
    errorCode?: string;
    errorType?: 'payment_failed' | 'sync_failed' | 'authentication_failed' | 'unknown';
    stripeError?: string;
    timestamp?: string;
  };
};

export function BillingFailureClient({ failureData }: BillingFailureClientProps) {
  const router = useRouter();
  const t = useTranslations();

  // Determine error details based on error type
  const getErrorDetails = () => {
    switch (failureData?.errorType) {
      case 'payment_failed':
        return {
          title: t('billing.failure.paymentFailed'),
          description: t('billing.failure.paymentFailedDescription'),
        };
      case 'sync_failed':
        return {
          title: t('billing.failure.syncFailed'),
          description: t('billing.failure.syncFailedDescription'),
        };
      case 'authentication_failed':
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
    <div className="flex min-h-screen w-full flex-col items-center justify-start px-4 pt-16 md:pt-20">
      <StaggerContainer
        className="flex w-full max-w-2xl flex-col items-center gap-6 text-center"
        staggerDelay={0.15}
        delayChildren={0.1}
      >
        {/* Error Icon with Animation */}
        <StaggerItem>
          <ScaleIn duration={0.3} delay={0}>
            <div className="flex size-20 items-center justify-center rounded-full bg-destructive/10 ring-4 ring-destructive/20 md:size-24">
              <XCircle className="size-10 text-destructive md:size-12" strokeWidth={2} />
            </div>
          </ScaleIn>
        </StaggerItem>

        {/* Main Error Message */}
        <StaggerItem className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {t('billing.failure.title')}
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            {t('billing.failure.description')}
          </p>
        </StaggerItem>

        {/* Error Details Alert */}
        {failureData && (
          <StaggerItem className="w-full">
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
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

        {/* Common Reasons */}
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

        {/* Support Information */}
        <StaggerItem className="w-full">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 size-5 text-muted-foreground" />
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

        {/* Action Buttons */}
        <StaggerItem className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button
            onClick={() => router.push('/chat/pricing')}
            size="lg"
            className="w-full sm:w-auto sm:min-w-[200px]"
          >
            {t('billing.failure.tryAgain')}
          </Button>

          <Button
            onClick={() => router.push('/chat')}
            variant="outline"
            size="lg"
            className="w-full sm:w-auto sm:min-w-[200px]"
          >
            {t('billing.failure.returnHome')}
          </Button>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}

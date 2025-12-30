'use client';

import { Coins } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { startTransition, useEffect, useRef, useState } from 'react';

import { StatusPage, StatusPageActions } from '@/components/billing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSyncCreditsAfterCheckoutMutation } from '@/hooks/mutations';
import { useCountdownRedirect } from '@/hooks/utils';

type CreditPurchaseCardProps = {
  creditsAdded: number;
  amountPaid: number;
  currency: string;
  currentBalance: number;
};

function CreditPurchaseCard({
  creditsAdded,
  amountPaid,
  currentBalance,
  currency,
}: CreditPurchaseCardProps) {
  const t = useTranslations();

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  };

  const formatCredits = (credits: number) => credits.toLocaleString();

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Coins className="size-5 text-green-600" />
          <CardTitle className="text-base">{t('billing.success.credits.purchased')}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {t('billing.success.credits.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-lg font-semibold tabular-nums text-green-600">
              +
              {formatCredits(creditsAdded)}
            </p>
            <p className="text-xs text-muted-foreground">Credits Added</p>
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold tabular-nums">{formatCurrency(amountPaid)}</p>
            <p className="text-xs text-muted-foreground">{t('billing.success.credits.amountPaid')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold tabular-nums">{formatCredits(currentBalance)}</p>
            <p className="text-xs text-muted-foreground">{t('billing.success.credits.currentBalance')}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Credits Success Client
 *
 * Simple, focused component for one-time credit purchases.
 * Follows Theo's "Stay Sane with Stripe" - separate from subscription flow.
 *
 * Flow:
 * 1. Sync credits purchase from Stripe
 * 2. Display credits added confirmation
 * 3. Auto-redirect to chat
 */
export function CreditsSuccessClient() {
  const router = useRouter();
  const t = useTranslations();
  const [isReady, setIsReady] = useState(false);

  const { countdown } = useCountdownRedirect({
    enabled: isReady,
    redirectPath: '/chat',
  });

  const syncMutation = useSyncCreditsAfterCheckoutMutation();

  const hasInitiatedSync = useRef(false);

  // Extract sync result
  const syncResult = syncMutation.data;
  const creditPurchase = syncResult?.data?.creditPurchase;
  const creditsBalance = syncResult?.data?.creditsBalance ?? 0;

  useEffect(() => {
    if (!hasInitiatedSync.current) {
      syncMutation.mutate(undefined);
      hasInitiatedSync.current = true;
      // Prefetch /chat early - user will navigate there after success
      router.prefetch('/chat');
    }
  }, [syncMutation, router]);

  useEffect(() => {
    if (isReady || !syncMutation.isSuccess) {
      return;
    }
    // Simple ready state - just wait for sync to complete
    startTransition(() => setIsReady(true));
  }, [syncMutation.isSuccess, isReady]);

  if (syncMutation.isPending) {
    return (
      <StatusPage
        variant="loading"
        title={t('billing.success.processingCredits')}
        description={t('billing.success.confirmingPayment')}
      />
    );
  }

  if (syncMutation.isError) {
    return (
      <StatusPage
        variant="error"
        title={t('billing.failure.syncFailed')}
        description={t('billing.failure.syncFailedDescription')}
        actions={(
          <StatusPageActions
            primaryLabel={t('actions.goHome')}
            primaryOnClick={() => router.replace('/chat')}
          />
        )}
      />
    );
  }

  // No credit purchase found - redirect to pricing
  if (!creditPurchase) {
    return (
      <StatusPage
        variant="error"
        title={t('billing.failure.noPurchaseFound')}
        description={t('billing.failure.noPurchaseFoundDescription')}
        actions={(
          <StatusPageActions
            primaryLabel={t('billing.success.viewPricing')}
            primaryOnClick={() => router.replace('/chat/pricing')}
          />
        )}
      />
    );
  }

  return (
    <StatusPage
      variant="success"
      title={t('billing.success.credits.title')}
      description={t('billing.success.credits.description')}
      actions={(
        <StatusPageActions
          primaryLabel={t('billing.success.startChat')}
          primaryOnClick={() => router.replace('/chat')}
          secondaryLabel={t('billing.success.viewPricing')}
          secondaryOnClick={() => router.replace('/chat/pricing')}
        />
      )}
    >
      <CreditPurchaseCard
        creditsAdded={creditPurchase.creditsGranted}
        amountPaid={creditPurchase.amountPaid}
        currency={creditPurchase.currency}
        currentBalance={creditsBalance}
      />

      <p className="text-xs text-muted-foreground">
        {t('billing.success.autoRedirect', { seconds: countdown })}
      </p>
    </StatusPage>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useEffect, useRef, useState } from 'react';

import { StatusPage, StatusPageActions } from '@/components/billing';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSyncCreditsAfterCheckoutMutation } from '@/hooks/mutations';
import { useCountdownRedirect } from '@/hooks/utils';

type CreditPurchaseCardProps = {
  creditsAdded: number;
  amountPaid: number;
  currency: string;
  currentBalance: number;
};

function CreditPurchaseCard(props: CreditPurchaseCardProps) {
  const { creditsAdded, amountPaid, currentBalance, currency } = props;
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
          <Icons.coins className="size-5 text-green-600" />
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
            <p className="text-xs text-muted-foreground">{t('billing.success.credits.creditsAdded')}</p>
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

export function CreditsSuccessClient() {
  const t = useTranslations();
  const [isReady, setIsReady] = useState(false);

  const { countdown } = useCountdownRedirect({
    enabled: isReady,
    redirectPath: '/chat',
  });

  const syncMutation = useSyncCreditsAfterCheckoutMutation();

  const hasInitiatedSync = useRef(false);

  const syncResult = syncMutation.data;
  const creditPurchase = syncResult?.data?.creditPurchase;
  const creditsBalance = syncResult?.data?.creditsBalance ?? 0;

  useEffect(() => {
    if (!hasInitiatedSync.current) {
      syncMutation.mutate(undefined);
      hasInitiatedSync.current = true;
    }
  }, [syncMutation]);

  useEffect(() => {
    if (isReady || !syncMutation.isSuccess) {
      return;
    }
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
            primaryHref="/chat"
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
            primaryHref="/chat/pricing"
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
          primaryHref="/chat"
          secondaryLabel={t('billing.success.viewPricing')}
          secondaryHref="/chat/pricing"
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

'use client';
import { useTranslations } from 'next-intl';

import { Icons } from '@/components/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format/date';

type CancelSubscriptionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  subscriptionTier: string;
  currentPeriodEnd?: string | null;
  isProcessing?: boolean;
};

export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  onConfirm,
  subscriptionTier,
  currentPeriodEnd,
  isProcessing = false,
}: CancelSubscriptionDialogProps) {
  const t = useTranslations();
  const endDate = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
  const formattedEndDate = endDate
    ? formatDate(endDate, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <Icons.xCircle className="size-5 text-destructive" />
            </div>
            <AlertDialogTitle className="text-xl">
              {t('billing.cancelSubscription.title')}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-4 pt-4">
            <div className="rounded-lg p-3 border border-border shadow-lg bg-card">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {subscriptionTier}
                  {' '}
                  {t('usage.plan')}
                </Badge>
                {endDate && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icons.calendar className="size-3.5" />
                    <span>
                      {t('billing.cancelSubscription.activeUntil')}
                      {' '}
                      {formattedEndDate}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {t('billing.cancelSubscription.warning')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('billing.cancelSubscription.description')}
              </p>
            </div>
            <div className="rounded-lg border border-destructive/20 p-4 shadow-lg bg-card">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Icons.alertCircle className="size-4 text-destructive" />
                  <span className="text-sm font-semibold text-foreground">
                    {t('billing.cancelSubscription.whatYouWillLose')}
                  </span>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Icons.x className="size-4 mt-0.5 shrink-0 text-destructive" />
                    <span>{t('billing.cancelSubscription.loss.premiumModels')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icons.x className="size-4 mt-0.5 shrink-0 text-destructive" />
                    <span>{t('billing.cancelSubscription.loss.unlimitedConversations')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icons.x className="size-4 mt-0.5 shrink-0 text-destructive" />
                    <span>{t('billing.cancelSubscription.loss.prioritySupport')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icons.x className="size-4 mt-0.5 shrink-0 text-destructive" />
                    <span>{t('billing.cancelSubscription.loss.advancedFeatures')}</span>
                  </li>
                </ul>
              </div>
            </div>
            {endDate && (
              <div className="rounded-lg border border-border p-4 shadow-lg bg-card">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    {t('billing.cancelSubscription.timeline.title')}
                  </p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="font-medium text-foreground">•</span>
                      <span>
                        {t('billing.cancelSubscription.timeline.immediate')}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium text-foreground">•</span>
                      <span>
                        {t('billing.cancelSubscription.timeline.accessUntil', {
                          date: formattedEndDate || 'the end of your billing period',
                        })}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium text-foreground">•</span>
                      <span>
                        {t('billing.cancelSubscription.timeline.downgrade')}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t('billing.cancelSubscription.termsNotice')}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isProcessing}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isProcessing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isProcessing
              ? (
                  <>
                    <Icons.loader className="size-4 animate-spin mr-2" />
                    {t('pricing.card.processing')}
                  </>
                )
              : (
                  t('billing.cancelSubscription.confirmButton')
                )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

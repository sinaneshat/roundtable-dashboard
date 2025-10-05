'use client';

import { AlertCircle, Calendar, Loader2, X, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
  const formattedEndDate = endDate?.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="size-5 text-destructive" />
            </div>
            <AlertDialogTitle className="text-xl">
              {t('billing.cancelSubscription.title')}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-4 pt-4">
            {/* Current Plan Info */}
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <Badge variant="secondary" className="capitalize">
                {subscriptionTier}
                {' '}
                {t('usage.plan')}
              </Badge>
              {endDate && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="size-3.5" />
                  <span>
                    {t('billing.cancelSubscription.activeUntil')}
                    {' '}
                    {formattedEndDate}
                  </span>
                </div>
              )}
            </div>

            {/* Warning Message */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {t('billing.cancelSubscription.warning')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('billing.cancelSubscription.description')}
              </p>
            </div>

            {/* What You'll Lose */}
            <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 text-destructive" />
                <span className="text-sm font-semibold text-foreground">
                  {t('billing.cancelSubscription.whatYouWillLose')}
                </span>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <X className="size-4 mt-0.5 shrink-0 text-destructive" />
                  <span>{t('billing.cancelSubscription.loss.premiumModels')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <X className="size-4 mt-0.5 shrink-0 text-destructive" />
                  <span>{t('billing.cancelSubscription.loss.unlimitedConversations')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <X className="size-4 mt-0.5 shrink-0 text-destructive" />
                  <span>{t('billing.cancelSubscription.loss.prioritySupport')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <X className="size-4 mt-0.5 shrink-0 text-destructive" />
                  <span>{t('billing.cancelSubscription.loss.advancedFeatures')}</span>
                </li>
              </ul>
            </div>

            {/* Data Access Timeline */}
            {endDate && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
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
            )}

            {/* Terms Notice */}
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
                    <Loader2 className="size-4 animate-spin mr-2" />
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

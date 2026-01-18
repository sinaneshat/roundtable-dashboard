import { StripeSubscriptionStatuses } from '@roundtable/shared';

import type { Subscription } from '@/services/api';

export function isSubscriptionActive(subscription: Subscription | unknown): boolean {
  const sub = subscription as Record<string, unknown>;
  const status = sub.status as string;
  const cancelAtPeriodEnd = sub.cancelAtPeriodEnd as boolean;

  const isActive = status === StripeSubscriptionStatuses.ACTIVE
    || status === StripeSubscriptionStatuses.TRIALING;
  const notCanceling = !cancelAtPeriodEnd;

  return isActive && notCanceling;
}

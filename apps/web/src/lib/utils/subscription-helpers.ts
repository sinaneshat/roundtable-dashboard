import { StripeSubscriptionStatuses } from '@roundtable/shared';

import { isObject } from '@/lib/utils/type-guards';
import type { Subscription } from '@/services/api';

export function isSubscriptionActive(subscription: Subscription | unknown): boolean {
  if (!isObject(subscription)) {
    return false;
  }

  const status = subscription.status;
  const cancelAtPeriodEnd = subscription.cancelAtPeriodEnd;

  const isActive = status === StripeSubscriptionStatuses.ACTIVE
    || status === StripeSubscriptionStatuses.TRIALING;
  const notCanceling = !cancelAtPeriodEnd;

  return isActive && notCanceling;
}

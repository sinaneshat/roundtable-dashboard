import { StripeSubscriptionStatuses } from '@roundtable/shared';

import type { Subscription } from '@/services/api';

export function isSubscriptionActive(subscription: Subscription): boolean {
  return (
    (subscription.status === StripeSubscriptionStatuses.ACTIVE
      || subscription.status === StripeSubscriptionStatuses.TRIALING)
    && !subscription.cancelAtPeriodEnd
  );
}

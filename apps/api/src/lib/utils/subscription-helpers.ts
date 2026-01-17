import { StripeSubscriptionStatuses } from '@roundtable/shared/enums';

import type { Subscription } from '@/routes/billing/schema';

export function isSubscriptionActive(subscription: Subscription): boolean {
  return (
    (subscription.status === StripeSubscriptionStatuses.ACTIVE
      || subscription.status === StripeSubscriptionStatuses.TRIALING)
    && !subscription.cancelAtPeriodEnd
  );
}

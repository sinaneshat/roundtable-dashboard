import { StripeSubscriptionStatuses } from '@/api/core/enums';
import type { Subscription } from '@/api/routes/billing/schema';

export function isSubscriptionActive(subscription: Subscription): boolean {
  return (
    (subscription.status === StripeSubscriptionStatuses.ACTIVE
      || subscription.status === StripeSubscriptionStatuses.TRIALING)
    && !subscription.cancelAtPeriodEnd
  );
}

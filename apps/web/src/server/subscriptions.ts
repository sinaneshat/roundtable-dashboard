import { createServerFn } from '@tanstack/react-start';

import { getSubscriptionsService } from '@/services/api';
import type { ListSubscriptionsResponse } from '@/services/api/billing/subscriptions';

import type { ServerFnErrorResponse } from './schemas';

type GetSubscriptionsResult = ListSubscriptionsResponse | ServerFnErrorResponse;

export const getSubscriptions = createServerFn({ method: 'GET' }).handler(
  async ({ context }): Promise<GetSubscriptionsResult> => {
    return await getSubscriptionsService({ cookieHeader: context.cookieHeader });
  },
);

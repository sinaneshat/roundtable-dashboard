import { createServerFn } from '@tanstack/react-start';

import { getSubscriptionsService } from '@/services/api';
import type { ListSubscriptionsResponse } from '@/services/api/billing/subscriptions';
import { cookieMiddleware } from '@/start';

type ServerFnErrorResponse = { success: false; data: null };
type GetSubscriptionsResult = ListSubscriptionsResponse | ServerFnErrorResponse;

export const getSubscriptions = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .handler(async ({ context }): Promise<GetSubscriptionsResult> => {
    try {
      return await getSubscriptionsService({ cookieHeader: context.cookieHeader });
    } catch {
      return { success: false as const, data: null };
    }
  });

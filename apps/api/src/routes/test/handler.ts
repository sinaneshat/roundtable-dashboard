/**
 * Test Route Handlers
 *
 * ONLY available in development/test environments.
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { createHandler, Responses } from '@/core';
import { getDbAsync, userCreditBalance } from '@/db';
import { getUserCreditBalance } from '@/services/billing';
import type { ApiEnv } from '@/types';

import type { setUserCreditsRoute } from './route';
import { SetCreditsRequestSchema } from './schema';

/**
 * Set user credits for testing
 */
export const setUserCreditsHandler: RouteHandler<typeof setUserCreditsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: SetCreditsRequestSchema,
    operationName: 'setUserCredits',
  },
  async (c) => {
    const { user } = c.auth();
    const { credits } = c.validated.body;

    const db = await getDbAsync();

    await db
      .update(userCreditBalance)
      .set({
        balance: credits,
        reservedCredits: 0,
        updatedAt: new Date(),
      })
      .where(eq(userCreditBalance.userId, user.id));

    const balance = await getUserCreditBalance(user.id);

    return Responses.ok(c, {
      balance: balance.balance,
      reserved: balance.reserved,
      available: balance.available,
      planType: balance.planType,
    });
  },
);

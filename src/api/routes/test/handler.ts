/**
 * Test Route Handlers
 *
 * ONLY available in development/test environments.
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import { ErrorContextTypes } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';
import { getUserCreditBalance } from '@/api/services/credit.service';
import { getDbAsync, userCreditBalance } from '@/db';

import type { setUserCreditsRoute } from './route';

/**
 * Set user credits for testing
 */
export const setUserCredits: RouteHandler<typeof setUserCreditsRoute, ApiEnv> = async (c) => {
  const user = c.get('sessionUser');

  if (!user) {
    const context: ErrorContext = {
      errorType: ErrorContextTypes.AUTHENTICATION,
      operation: 'SET_CREDITS',
    };
    throw createError.unauthorized('Authentication required', context);
  }

  const { credits } = c.req.valid('json');

  const db = await getDbAsync();

  // Update user credit balance directly
  await db
    .update(userCreditBalance)
    .set({
      balance: credits,
      reservedCredits: 0, // Clear reservations for clean slate
      updatedAt: new Date(),
    })
    .where(eq(userCreditBalance.userId, user.id));

  // Get updated balance
  const balance = await getUserCreditBalance(user.id);

  return c.json(
    {
      success: true,
      data: {
        balance: balance.balance,
        reserved: balance.reserved,
        available: balance.available,
        planType: balance.planType,
      },
    },
    HttpStatusCodes.OK,
  );
};

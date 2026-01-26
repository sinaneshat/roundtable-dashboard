/**
 * Test-Only Routes
 *
 * These routes are ONLY available in development/test environments
 * for E2E testing and development purposes.
 *
 * NEVER exposed in production.
 */

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createProtectedRouteResponses } from '@/core';

import { SetCreditsRequestSchema, SetCreditsResponseSchema } from './schema';

/**
 * Set user credits (test only)
 */
export const setUserCreditsRoute = createRoute({
  description: 'Directly set user credit balance for testing. Only available in development/test.',
  method: 'post',
  path: '/test/set-credits',
  request: {
    body: {
      content: {
        'application/json': { schema: SetCreditsRequestSchema },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: SetCreditsResponseSchema },
      },
      description: 'Credits set successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Set user credits (test only)',
  tags: ['test'],
});

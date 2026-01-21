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
  method: 'post',
  path: '/test/set-credits',
  tags: ['test'],
  summary: 'Set user credits (test only)',
  description: 'Directly set user credit balance for testing. Only available in development/test.',
  request: {
    body: {
      content: {
        'application/json': { schema: SetCreditsRequestSchema },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Credits set successfully',
      content: {
        'application/json': { schema: SetCreditsResponseSchema },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

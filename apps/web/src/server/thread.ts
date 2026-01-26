import { createServerFn } from '@tanstack/react-start';
import { zodValidator } from '@tanstack/zod-adapter';

import { LIMITS } from '@/constants';
import type {
  GetThreadBySlugResponse,
  GetThreadChangelogResponse,
  GetThreadFeedbackResponse,
  GetThreadPreSearchesResponse,
  ListThreadsResponse,
} from '@/services/api';
import {
  getThreadBySlugService,
  getThreadChangelogService,
  getThreadFeedbackService,
  getThreadPreSearchesService,
  listThreadsService,
} from '@/services/api';

import type { ServerFnErrorResponse } from './schemas';
import { idSchema, slugSchema } from './schemas';

type GetThreadBySlugResult = GetThreadBySlugResponse | ServerFnErrorResponse;
type GetThreadChangelogResult = GetThreadChangelogResponse | ServerFnErrorResponse;
type GetThreadFeedbackResult = GetThreadFeedbackResponse | ServerFnErrorResponse;
type GetThreadPreSearchesResult = GetThreadPreSearchesResponse | ServerFnErrorResponse;
type GetThreadsByProjectResult = ListThreadsResponse | ServerFnErrorResponse;

export const getThreadBySlug = createServerFn({ method: 'GET' })
  .inputValidator(zodValidator(slugSchema))
  .handler(async ({ context, data }): Promise<GetThreadBySlugResult> => {
    return await getThreadBySlugService(
      { param: { slug: data } },
      { cookieHeader: context.cookieHeader },
    );
  });

export const getThreadChangelog = createServerFn({ method: 'GET' })
  .inputValidator(zodValidator(idSchema))
  .handler(async ({ context, data }): Promise<GetThreadChangelogResult> => {
    return await getThreadChangelogService(
      { param: { id: data } },
      { cookieHeader: context.cookieHeader },
    );
  });

export const getThreadFeedback = createServerFn({ method: 'GET' })
  .inputValidator(zodValidator(idSchema))
  .handler(async ({ context, data }): Promise<GetThreadFeedbackResult> => {
    return await getThreadFeedbackService(
      { param: { id: data } },
      { cookieHeader: context.cookieHeader },
    );
  });

export const getThreadPreSearches = createServerFn({ method: 'GET' })
  .inputValidator(zodValidator(idSchema))
  .handler(async ({ context, data }): Promise<GetThreadPreSearchesResult> => {
    return await getThreadPreSearchesService(
      { param: { id: data } },
      { cookieHeader: context.cookieHeader },
    );
  });

/**
 * Get threads for a project using the unified /chat/threads endpoint
 * Uses projectId query param for filtering
 *
 * NOTE: Type assertion used because Hono client type inference may be stale.
 * The API schema (ThreadListQuerySchema) definitely supports projectId.
 */
export const getThreadsByProject = createServerFn({ method: 'GET' })
  .inputValidator(zodValidator(idSchema))
  .handler(async ({ context, data: projectId }): Promise<GetThreadsByProjectResult> => {
    return await listThreadsService(
      { query: { limit: LIMITS.INITIAL_PAGE, projectId } as { projectId: string; limit: number } },
      { cookieHeader: context.cookieHeader },
    );
  });

import { createServerFn } from '@tanstack/react-start';

import type {
  GetThreadBySlugResponse,
  GetThreadChangelogResponse,
  GetThreadFeedbackResponse,
  GetThreadPreSearchesResponse,
  GetThreadStreamResumptionStateResponse,
} from '@/services/api';
import {
  getThreadBySlugService,
  getThreadChangelogService,
  getThreadFeedbackService,
  getThreadPreSearchesService,
  getThreadStreamResumptionStateService,
} from '@/services/api';
import { cookieMiddleware } from '@/start';

import type { ServerFnErrorResponse } from './schemas';

type GetThreadBySlugResult = GetThreadBySlugResponse | ServerFnErrorResponse;
type GetStreamResumptionStateResult = GetThreadStreamResumptionStateResponse | ServerFnErrorResponse;
type GetThreadChangelogResult = GetThreadChangelogResponse | ServerFnErrorResponse;
type GetThreadFeedbackResult = GetThreadFeedbackResponse | ServerFnErrorResponse;
type GetThreadPreSearchesResult = GetThreadPreSearchesResponse | ServerFnErrorResponse;

export const getThreadBySlug = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator((data: string) => data)
  .handler(async ({ data, context }): Promise<GetThreadBySlugResult> => {
    return await getThreadBySlugService(
      { param: { slug: data } },
      { cookieHeader: context.cookieHeader },
    );
  });

export const getStreamResumptionState = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator((data: string) => data)
  .handler(async ({ data, context }): Promise<GetStreamResumptionStateResult> => {
    return await getThreadStreamResumptionStateService(
      { param: { threadId: data } },
      { cookieHeader: context.cookieHeader },
    );
  });

export const getThreadChangelog = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator((data: string) => data)
  .handler(async ({ data, context }): Promise<GetThreadChangelogResult> => {
    return await getThreadChangelogService(
      { param: { id: data } },
      { cookieHeader: context.cookieHeader },
    );
  });

export const getThreadFeedback = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator((data: string) => data)
  .handler(async ({ data, context }): Promise<GetThreadFeedbackResult> => {
    return await getThreadFeedbackService(
      { param: { id: data } },
      { cookieHeader: context.cookieHeader },
    );
  });

export const getThreadPreSearches = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator((data: string) => data)
  .handler(async ({ data, context }): Promise<GetThreadPreSearchesResult> => {
    return await getThreadPreSearchesService(
      { param: { id: data } },
      { cookieHeader: context.cookieHeader },
    );
  });

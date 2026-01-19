import { createServerFn } from '@tanstack/react-start';
import { zodValidator } from '@tanstack/zod-adapter';

import type {
  GetThreadBySlugResponse,
  GetThreadChangelogResponse,
  GetThreadFeedbackResponse,
  GetThreadStreamResumptionStateResponse,
} from '@/services/api';
import {
  getThreadBySlugService,
  getThreadChangelogService,
  getThreadFeedbackService,
  getThreadStreamResumptionStateService,
} from '@/services/api';
import { cookieMiddleware } from '@/start';

import { slugSchema, threadIdSchema } from './schemas';

type ServerFnErrorResponse = { success: false; data: null };

type GetThreadBySlugResult = GetThreadBySlugResponse | ServerFnErrorResponse;
type GetStreamResumptionStateResult = GetThreadStreamResumptionStateResponse | ServerFnErrorResponse;
type GetThreadChangelogResult = GetThreadChangelogResponse | ServerFnErrorResponse;
type GetThreadFeedbackResult = GetThreadFeedbackResponse | ServerFnErrorResponse;

export const getThreadBySlug = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator(zodValidator(slugSchema))
  .handler(async ({ data: slug, context }): Promise<GetThreadBySlugResult> => {
    return await getThreadBySlugService(
      { param: { slug } },
      { cookieHeader: context.cookieHeader },
    );
  });

export const getStreamResumptionState = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator(zodValidator(threadIdSchema))
  .handler(async ({ data: threadId, context }): Promise<GetStreamResumptionStateResult> => {
    return await getThreadStreamResumptionStateService(
      { param: { threadId } },
      { cookieHeader: context.cookieHeader },
    );
  });

export const getThreadChangelog = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator(zodValidator(threadIdSchema))
  .handler(async ({ data: threadId, context }): Promise<GetThreadChangelogResult> => {
    return await getThreadChangelogService(
      { param: { id: threadId } },
      { cookieHeader: context.cookieHeader },
    );
  });

export const getThreadFeedback = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator(zodValidator(threadIdSchema))
  .handler(async ({ data: threadId, context }): Promise<GetThreadFeedbackResult> => {
    return await getThreadFeedbackService(
      { param: { id: threadId } },
      { cookieHeader: context.cookieHeader },
    );
  });

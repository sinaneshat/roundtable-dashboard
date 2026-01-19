import { createServerFn } from '@tanstack/react-start';

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

type ServerFnErrorResponse = { success: false; data: null };

type GetThreadBySlugResult = GetThreadBySlugResponse | ServerFnErrorResponse;
type GetStreamResumptionStateResult = GetThreadStreamResumptionStateResponse | ServerFnErrorResponse;
type GetThreadChangelogResult = GetThreadChangelogResponse | ServerFnErrorResponse;
type GetThreadFeedbackResult = GetThreadFeedbackResponse | ServerFnErrorResponse;

export const getThreadBySlug = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug, context }): Promise<GetThreadBySlugResult> => {
    try {
      return await getThreadBySlugService(
        { param: { slug } },
        { cookieHeader: context.cookieHeader },
      );
    } catch {
      return { success: false as const, data: null };
    }
  });

export const getStreamResumptionState = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator((threadId: string) => threadId)
  .handler(async ({ data: threadId, context }): Promise<GetStreamResumptionStateResult> => {
    try {
      return await getThreadStreamResumptionStateService(
        { param: { threadId } },
        { cookieHeader: context.cookieHeader },
      );
    } catch {
      return { success: false as const, data: null };
    }
  });

export const getThreadChangelog = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator((threadId: string) => threadId)
  .handler(async ({ data: threadId, context }): Promise<GetThreadChangelogResult> => {
    try {
      return await getThreadChangelogService(
        { param: { id: threadId } },
        { cookieHeader: context.cookieHeader },
      );
    } catch {
      return { success: false as const, data: null };
    }
  });

export const getThreadFeedback = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator((threadId: string) => threadId)
  .handler(async ({ data: threadId, context }): Promise<GetThreadFeedbackResult> => {
    try {
      return await getThreadFeedbackService(
        { param: { id: threadId } },
        { cookieHeader: context.cookieHeader },
      );
    } catch {
      return { success: false as const, data: null };
    }
  });

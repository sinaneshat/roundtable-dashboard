import { createServerFn } from '@tanstack/react-start';

import {
  getThreadBySlugService,
  getThreadChangelogService,
  getThreadFeedbackService,
  getThreadStreamResumptionStateService,
} from '@/services/api';
import { cookieMiddleware } from '@/start';

export const getThreadBySlug = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug, context }) => {
    try {
      return await getThreadBySlugService(
        { param: { slug } },
        { cookieHeader: context.cookieHeader },
      );
    } catch {
      return { success: false, data: null };
    }
  });

export const getStreamResumptionState = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator((threadId: string) => threadId)
  .handler(async ({ data: threadId, context }) => {
    try {
      return await getThreadStreamResumptionStateService(
        { param: { threadId } },
        { cookieHeader: context.cookieHeader },
      );
    } catch {
      return { success: false, data: null };
    }
  });

export const getThreadChangelog = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator((threadId: string) => threadId)
  .handler(async ({ data: threadId, context }) => {
    try {
      return await getThreadChangelogService(
        { param: { id: threadId } },
        { cookieHeader: context.cookieHeader },
      );
    } catch {
      return { success: false, data: null };
    }
  });

export const getThreadFeedback = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .inputValidator((threadId: string) => threadId)
  .handler(async ({ data: threadId, context }) => {
    try {
      return await getThreadFeedbackService(
        { param: { id: threadId } },
        { cookieHeader: context.cookieHeader },
      );
    } catch {
      return { success: false, data: null };
    }
  });

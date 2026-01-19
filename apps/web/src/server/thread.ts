import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import {
  getThreadBySlugService,
  getThreadChangelogService,
  getThreadFeedbackService,
  getThreadStreamResumptionStateService,
} from '@/services/api';

/**
 * Fetch thread by slug for SSR.
 * Protected endpoint - forwards cookies for authentication.
 * Returns FULL API response to match client queryFn (prevents hydration refetch).
 */
export const getThreadBySlug = createServerFn({ method: 'GET' })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    try {
      const request = getRequest();
      const cookie = request.headers.get('cookie') || '';

      return await getThreadBySlugService(
        { param: { slug } },
        { cookieHeader: cookie },
      );
    } catch {
      return { success: false, data: null };
    }
  });

/**
 * Fetch stream resumption state for SSR.
 * Used to pre-fill Zustand store with active stream info before React renders.
 * This allows proper stream resumption without content flash.
 */
export const getStreamResumptionState = createServerFn({ method: 'GET' })
  .inputValidator((threadId: string) => threadId)
  .handler(async ({ data: threadId }) => {
    try {
      const request = getRequest();
      const cookie = request.headers.get('cookie') || '';

      return await getThreadStreamResumptionStateService(
        { param: { threadId } },
        { cookieHeader: cookie },
      );
    } catch {
      return { success: false, data: null };
    }
  });

/**
 * Fetch thread changelog for SSR.
 * Protected endpoint - forwards cookies for authentication.
 * Returns FULL API response for consistent hydration.
 */
export const getThreadChangelog = createServerFn({ method: 'GET' })
  .inputValidator((threadId: string) => threadId)
  .handler(async ({ data: threadId }) => {
    try {
      const request = getRequest();
      const cookie = request.headers.get('cookie') || '';

      return await getThreadChangelogService(
        { param: { id: threadId } },
        { cookieHeader: cookie },
      );
    } catch {
      return { success: false, data: null };
    }
  });

/**
 * Fetch thread feedback for SSR.
 * Protected endpoint - forwards cookies for authentication.
 * Returns FULL API response for consistent hydration.
 */
export const getThreadFeedback = createServerFn({ method: 'GET' })
  .inputValidator((threadId: string) => threadId)
  .handler(async ({ data: threadId }) => {
    try {
      const request = getRequest();
      const cookie = request.headers.get('cookie') || '';

      return await getThreadFeedbackService(
        { param: { id: threadId } },
        { cookieHeader: cookie },
      );
    } catch {
      return { success: false, data: null };
    }
  });

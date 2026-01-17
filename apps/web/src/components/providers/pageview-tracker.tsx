/**
 * PageView Tracker Component
 *
 * Enhances PostHog automatic pageview tracking with additional context.
 * While `capture_pageview: 'history_change'` handles basic tracking,
 * this component adds:
 * - User properties on each pageview
 * - Page-specific context (thread ID, project ID, etc.)
 * - Custom pageview properties based on route
 *
 * Location: /src/components/providers/pageview-tracker.tsx
 */

import { usePostHog } from 'posthog-js/react';
import { useEffect, useRef } from 'react';

import { useSession } from '@/lib/auth/client';
import { usePathname, useSearchParams } from '@/lib/compat';

/**
 * Extracts context from pathname for PostHog events
 */
function extractPageContext(pathname: string, searchParams: URLSearchParams | null) {
  const segments = pathname.split('/').filter(Boolean);
  const context: Record<string, string | boolean> = {
    pathname,
  };

  // Extract route context
  if (segments[0] === 'chat') {
    context.section = 'chat';

    if (segments[1]) {
      context.threadId = segments[1];
      context.hasThread = true;
    } else {
      context.hasThread = false;
    }
  } else if (segments[0] === 'projects') {
    context.section = 'projects';

    if (segments[1] && segments[1] !== 'new') {
      context.projectId = segments[1];
      context.hasProject = true;
    } else if (segments[1] === 'new') {
      context.isNewProject = true;
    }
  } else if (segments[0] === 'settings') {
    context.section = 'settings';
    if (segments[1]) {
      context.settingsTab = segments[1];
    }
  } else if (segments[0] === 'auth') {
    context.section = 'auth';
    if (segments[1]) {
      context.authPage = segments[1];
    }
  } else if (pathname === '/') {
    context.section = 'home';
  }

  // Add search params if present
  if (searchParams) {
    const params = Object.fromEntries(searchParams.entries());
    if (Object.keys(params).length > 0) {
      context.hasQueryParams = true;
      // Add specific query params that are safe to track
      if (params.model)
        context.selectedModel = params.model;
      if (params.view)
        context.viewMode = params.view;
    }
  }

  return context;
}

/**
 * PageView Tracker Component
 *
 * Place this inside PostHogProvider to track enhanced pageviews.
 */
export function PageViewTracker() {
  const posthog = usePostHog();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const lastTrackedPath = useRef<string>('');

  useEffect(() => {
    if (!posthog)
      return;

    const currentPath = `${pathname}${searchParams ? `?${searchParams.toString()}` : ''}`;

    // Avoid duplicate tracking of the same path
    if (lastTrackedPath.current === currentPath)
      return;

    lastTrackedPath.current = currentPath;

    // Extract page context
    const context = extractPageContext(pathname, searchParams as any);

    // Add user context if authenticated
    if (session?.user) {
      context.userId = session.user.id;
      context.userEmail = session.user.email;
      context.authenticated = true;
    } else {
      context.authenticated = false;
    }

    // Register super properties for ALL subsequent events (including automatic $pageview)
    // Note: PostHog already captures pageviews via capture_pageview: 'history_change'
    // We use register() to enrich those events instead of creating duplicate captures
    // @see https://posthog.com/docs/product-analytics/capture-events#super-properties
    posthog.register({
      current_section: context.section || 'unknown',
      current_page: pathname,
      page_type: context.section,
      ...(context.hasThread !== undefined && { has_thread: context.hasThread }),
      ...(context.hasProject !== undefined && { has_project: context.hasProject }),
      ...(context.authenticated !== undefined && { is_authenticated: context.authenticated }),
    });
  }, [posthog, pathname, searchParams, session]);

  return null;
}

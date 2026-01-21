/**
 * PageView Tracker Component
 *
 * Handles manual pageview tracking since PostHog's automatic pageview
 * capture is disabled for performance (capture_pageview: false).
 *
 * Tracks:
 * - Subsequent pageviews (initial captured in PostHogProvider loaded callback)
 * - Page-specific context (thread ID, project ID, etc.)
 * - User properties on each pageview
 *
 * Location: /src/components/providers/pageview-tracker.tsx
 */

import { useLocation, useSearch } from '@tanstack/react-router';
import { usePostHog } from 'posthog-js/react';
import { useEffect, useRef } from 'react';

import { useSession } from '@/lib/auth/client';

/**
 * Extracts context from pathname for PostHog events
 */
function extractPageContext(pathname: string, searchParams: Record<string, unknown> | null) {
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
  if (searchParams && typeof searchParams === 'object') {
    const params = searchParams as Record<string, string | undefined>;
    if (Object.keys(params).length > 0) {
      context.hasQueryParams = true;
      // Add specific query params that are safe to track
      if (params.model)
        context.selectedModel = String(params.model);
      if (params.view)
        context.viewMode = String(params.view);
    }
  }

  return context;
}

/**
 * PageView Tracker Component
 *
 * Place this inside PostHogProvider to track enhanced pageviews.
 * Initial pageview is captured in PostHogProvider's loaded callback.
 * This component handles subsequent navigation pageviews.
 */
export function PageViewTracker() {
  const posthog = usePostHog();
  const { pathname } = useLocation();
  const searchParams = useSearch({ strict: false }) as Record<string, unknown> | null;
  const { data: session } = useSession();
  const lastTrackedPath = useRef<string>('');
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!posthog)
      return;

    const currentPath = `${pathname}${searchParams ? `?${new URLSearchParams(searchParams as Record<string, string>).toString()}` : ''}`;

    // Avoid duplicate tracking of the same path
    if (lastTrackedPath.current === currentPath)
      return;

    // Skip first render - initial pageview captured in PostHogProvider loaded callback
    const shouldCapture = !isFirstRender.current;
    isFirstRender.current = false;
    lastTrackedPath.current = currentPath;

    // Extract page context
    const context = extractPageContext(pathname, searchParams);

    // Add user context if authenticated
    if (session?.user) {
      context.userId = session.user.id;
      context.userEmail = session.user.email;
      context.authenticated = true;
    } else {
      context.authenticated = false;
    }

    // Register super properties for ALL subsequent events
    posthog.register({
      current_section: context.section || 'unknown',
      current_page: pathname,
      page_type: context.section,
      ...(context.hasThread !== undefined && { has_thread: context.hasThread }),
      ...(context.hasProject !== undefined && { has_project: context.hasProject }),
      ...(context.authenticated !== undefined && { is_authenticated: context.authenticated }),
    });

    // Manually capture pageview for subsequent navigations
    if (shouldCapture) {
      posthog.capture('$pageview', {
        $current_url: window.location.href,
        ...context,
      });
    }
  }, [posthog, pathname, searchParams, session]);

  return null;
}
